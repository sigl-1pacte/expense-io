import { ListObjectsV2Command } from '@aws-sdk/client-s3'
import { describe, expect, it } from 'vitest'
import { TEST_ENV } from '../support/env'
import { countRows, createOrg } from '../support/factories'
import { PNG_BYTES } from '../support/fixtures'
import { putReceipt, s3ClientFor } from '../support/infra'

async function receiptKeys(): Promise<string[]> {
  const { Contents } = await s3ClientFor(TEST_ENV).send(
    new ListObjectsV2Command({ Bucket: TEST_ENV.S3_BUCKET })
  )
  return (Contents ?? []).map((object) => object.Key ?? '')
}

// Les clés receipts/N repartent de 1 à chaque test (RESTART IDENTITY) : sans
// bucket vide, une assertion sur S3 pourrait passer grâce à un objet laissé
// par un test ou un run précédent.
describe('isolation entre tests', () => {
  it('chaque test démarre avec une base et un bucket de reçus vides', async () => {
    expect(await countRows('expense_notes')).toBe(0)
    expect(await receiptKeys()).toEqual([])
    await createOrg()
    await putReceipt(TEST_ENV, 'receipts/1.png', PNG_BYTES)
  })

  it('ce que le test précédent a créé a disparu', async () => {
    expect(await countRows('users')).toBe(0)
    expect(await receiptKeys()).toEqual([])
  })
})
