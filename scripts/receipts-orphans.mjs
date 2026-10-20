// Reçus S3 sans note (F10 : envoi réussi puis insertion échouée). Sans risque
// (bucket privé, rien ne les référence) : nettoyage périodique.
//   node scripts/receipts-orphans.mjs           liste les orphelins de plus de 24 h
//   node scripts/receipts-orphans.mjs --delete  les supprime
import { DeleteObjectsCommand, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3'
import { config as loadEnv } from 'dotenv'
import { Pool } from 'pg'
import { fileURLToPath } from 'node:url'

const DELETE_SLICE = 1000

/**
 * `expense_notes` est sous FORCE RLS : avec un rôle soumis à la RLS (expense_app),
 * la requête ne verrait aucune note et tous les reçus paraîtraient orphelins.
 */
export async function assertCanSeeAllNotes(db) {
  const { rows } = await db.query('SELECT rolsuper OR rolbypassrls AS bypass FROM pg_roles WHERE rolname = current_user')
  if (rows[0]?.bypass !== true) {
    throw new Error(
      'Le rôle de connexion est soumis à la RLS (ni superuser ni BYPASSRLS) : il ne voit pas toutes les notes. Utiliser MIGRATION_DATABASE_URL.'
    )
  }
}

export async function scanReceipts({ db, s3, bucket, olderThan }) {
  const objects = []
  let token
  do {
    const page = await s3.send(
      new ListObjectsV2Command({ Bucket: bucket, Prefix: 'receipts/', ContinuationToken: token })
    )
    for (const object of page.Contents ?? []) {
      if (object.Key && object.LastModified && object.LastModified < olderThan) objects.push(object.Key)
    }
    token = page.NextContinuationToken
  } while (token)
  if (objects.length === 0) return { orphans: [], listed: 0, suspicious: false }
  const { rows } = await db.query('SELECT receipt_key FROM expense_notes WHERE receipt_key = ANY($1)', [objects])
  const referenced = new Set(rows.map((row) => row.receipt_key))
  const orphans = objects.filter((key) => !referenced.has(key)).sort()
  let suspicious = false
  if (referenced.size === 0) {
    const { rows: any } = await db.query('SELECT EXISTS (SELECT 1 FROM expense_notes) AS present')
    suspicious = any[0].present === true
  }
  return { orphans, listed: objects.length, suspicious }
}

export async function findOrphans(args) {
  return (await scanReceipts(args)).orphans
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  loadEnv({ quiet: true })
  const bucket = process.env.S3_BUCKET ?? 'receipts'
  const migrationUrl = process.env.MIGRATION_DATABASE_URL
  if (!migrationUrl) {
    console.error('MIGRATION_DATABASE_URL est requis (rôle superuser ou BYPASSRLS) : pas de repli sur DATABASE_URL.')
    process.exit(1)
  }
  const db = new Pool({ connectionString: migrationUrl })
  const s3 = new S3Client({
    endpoint: process.env.S3_ENDPOINT,
    region: process.env.S3_REGION ?? 'us-east-1',
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== 'false',
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID ?? '',
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? '',
    },
  })
  try {
    await assertCanSeeAllNotes(db)
    const { orphans, listed, suspicious } = await scanReceipts({
      db,
      s3,
      bucket,
      olderThan: new Date(Date.now() - 24 * 3600 * 1000),
    })
    console.log(`${orphans.length} reçu(s) orphelin(s)${orphans.length ? ' :' : '.'}`)
    for (const key of orphans) console.log(`  ${key}`)
    if (process.argv.includes('--delete') && orphans.length > 0) {
      if (suspicious) {
        throw new Error(
          `Suppression annulée : ${listed} reçu(s) listé(s), aucun n'est référencé alors que des notes existent. Mauvaise base ou mauvais bucket ?`
        )
      }
      for (let i = 0; i < orphans.length; i += DELETE_SLICE) {
        const slice = orphans.slice(i, i + DELETE_SLICE)
        await s3.send(new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: slice.map((Key) => ({ Key })) } }))
      }
      console.log('Supprimés.')
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  } finally {
    await db.end()
  }
}
