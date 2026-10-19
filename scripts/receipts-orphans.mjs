// Reçus S3 sans note (F10 : envoi réussi puis insertion échouée). Sans risque
// (bucket privé, rien ne les référence) : nettoyage périodique.
//   node scripts/receipts-orphans.mjs           liste les orphelins de plus de 24 h
//   node scripts/receipts-orphans.mjs --delete  les supprime
import { DeleteObjectsCommand, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3'
import { config as loadEnv } from 'dotenv'
import { Pool } from 'pg'
import { fileURLToPath } from 'node:url'

export async function findOrphans({ db, s3, bucket, olderThan }) {
  const objects = []
  let token
  do {
    const page = await s3.send(new ListObjectsV2Command({ Bucket: bucket, ContinuationToken: token }))
    for (const object of page.Contents ?? []) {
      if (object.Key && object.LastModified && object.LastModified < olderThan) objects.push(object.Key)
    }
    token = page.NextContinuationToken
  } while (token)
  if (objects.length === 0) return []
  const { rows } = await db.query('SELECT receipt_key FROM expense_notes WHERE receipt_key = ANY($1)', [objects])
  const referenced = new Set(rows.map((row) => row.receipt_key))
  return objects.filter((key) => !referenced.has(key)).sort()
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  loadEnv({ quiet: true })
  const bucket = process.env.S3_BUCKET ?? 'receipts'
  const db = new Pool({ connectionString: process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL })
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
    const orphans = await findOrphans({ db, s3, bucket, olderThan: new Date(Date.now() - 24 * 3600 * 1000) })
    console.log(`${orphans.length} reçu(s) orphelin(s)${orphans.length ? ' :' : '.'}`)
    for (const key of orphans) console.log(`  ${key}`)
    if (process.argv.includes('--delete') && orphans.length > 0) {
      await s3.send(new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: orphans.map((Key) => ({ Key })) } }))
      console.log('Supprimés.')
    }
  } finally {
    await db.end()
  }
}
