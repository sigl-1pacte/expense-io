import { describe, expect, it } from 'vitest'
import { Pool } from 'pg'
import { assertCanSeeAllNotes, findOrphans, scanReceipts } from '../../scripts/receipts-orphans.mjs'
import { testDb } from '../support/db'
import { TEST_ENV } from '../support/env'
import { createNote, createOrg } from '../support/factories'
import { PNG_BYTES } from '../support/fixtures'
import { putReceipt, s3ClientFor } from '../support/infra'

describe('receipts:orphans', () => {
  it('liste les objets sans note plus vieux que le délai de grâce, pas les autres', async () => {
    const { employee } = await createOrg()
    await createNote({ user: employee, receiptKey: 'receipts/1.png' })
    await putReceipt(TEST_ENV, 'receipts/1.png', PNG_BYTES)
    await putReceipt(TEST_ENV, 'receipts/2.png', PNG_BYTES)
    const orphans = await findOrphans({
      db: testDb(),
      s3: s3ClientFor(TEST_ENV),
      bucket: TEST_ENV.S3_BUCKET,
      olderThan: new Date(Date.now() + 60_000),
    })
    expect(orphans).toEqual(['receipts/2.png'])
    expect(
      await findOrphans({ db: testDb(), s3: s3ClientFor(TEST_ENV), bucket: TEST_ENV.S3_BUCKET, olderThan: new Date(0) })
    ).toEqual([])
  })

  it('ne liste jamais un objet hors du préfixe receipts/', async () => {
    await putReceipt(TEST_ENV, 'autre/3.png', PNG_BYTES)
    await putReceipt(TEST_ENV, 'receipts/4.png', PNG_BYTES)
    const orphans = await findOrphans({
      db: testDb(),
      s3: s3ClientFor(TEST_ENV),
      bucket: TEST_ENV.S3_BUCKET,
      olderThan: new Date(Date.now() + 60_000),
    })
    expect(orphans).toContain('receipts/4.png')
    expect(orphans).not.toContain('autre/3.png')
  })

  it('le scan signale des reçus listés dont aucun n’est référencé alors que des notes existent', async () => {
    const { employee } = await createOrg()
    await createNote({ user: employee, receiptKey: 'receipts/inconnu.png' })
    await putReceipt(TEST_ENV, 'receipts/5.png', PNG_BYTES)
    const scan = await scanReceipts({
      db: testDb(),
      s3: s3ClientFor(TEST_ENV),
      bucket: TEST_ENV.S3_BUCKET,
      olderThan: new Date(Date.now() + 60_000),
    })
    expect(scan.suspicious).toBe(true)
  })
})

describe('receipts:orphans — garde-fou de rôle', () => {
  it('refuse une connexion expense_app (RLS) et accepte le propriétaire', async () => {
    const appPool = new Pool({ connectionString: TEST_ENV.APP_DATABASE_URL })
    try {
      await expect(assertCanSeeAllNotes(appPool)).rejects.toThrow(/RLS|BYPASSRLS/)
    } finally {
      await appPool.end()
    }
    await expect(assertCanSeeAllNotes(testDb())).resolves.toBeUndefined()
  })
})
