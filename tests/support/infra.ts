import path from 'node:path'
import {
  CreateBucketCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import { runner } from 'node-pg-migrate'
import { Client } from 'pg'
import { PG_ADMIN_URL } from './env'

export interface S3Env {
  S3_ENDPOINT: string
  S3_REGION: string
  S3_ACCESS_KEY_ID: string
  S3_SECRET_ACCESS_KEY: string
  S3_BUCKET: string
}

export function s3ClientFor(env: S3Env): S3Client {
  return new S3Client({
    endpoint: env.S3_ENDPOINT,
    region: env.S3_REGION,
    forcePathStyle: true,
    credentials: { accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY },
  })
}

/** Crée la base si elle n'existe pas (idempotent). */
export async function ensureDatabase(name: string): Promise<void> {
  const admin = new Client({ connectionString: PG_ADMIN_URL })
  await admin.connect()
  try {
    const existing = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [name])
    if (existing.rowCount === 0) {
      await admin.query(`CREATE DATABASE "${name}"`)
    }
  } finally {
    await admin.end()
  }
}

/** Applique les vraies migrations de `migrations/` (idempotent). */
export async function migrate(databaseUrl: string): Promise<void> {
  await runner({
    databaseUrl,
    dir: path.join(process.cwd(), 'migrations'),
    migrationsTable: 'pgmigrations',
    direction: 'up',
    count: Infinity,
    log: () => {},
  })
}

/** Crée le bucket s'il n'existe pas (idempotent). */
export async function ensureBucket(env: S3Env): Promise<void> {
  const client = s3ClientFor(env)
  try {
    await client.send(new HeadBucketCommand({ Bucket: env.S3_BUCKET }))
  } catch {
    await client.send(new CreateBucketCommand({ Bucket: env.S3_BUCKET }))
  }
}

export async function putReceipt(
  env: S3Env,
  key: string,
  body: Uint8Array,
  contentType = 'image/png'
): Promise<void> {
  await s3ClientFor(env).send(
    new PutObjectCommand({ Bucket: env.S3_BUCKET, Key: key, Body: body, ContentType: contentType })
  )
}
