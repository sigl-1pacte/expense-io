import { describe, expect, it } from 'vitest'
import { findOrphans } from '../../scripts/receipts-orphans.mjs'
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
})
