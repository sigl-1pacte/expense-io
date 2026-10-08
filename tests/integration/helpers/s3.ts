import { HeadObjectCommand } from '@aws-sdk/client-s3'
import { expect } from 'vitest'
import { TEST_ENV } from '../../support/env'
import { putReceipt, s3ClientFor } from '../../support/infra'

export function headReceipt(key: string) {
  return s3ClientFor(TEST_ENV).send(new HeadObjectCommand({ Bucket: TEST_ENV.S3_BUCKET, Key: key }))
}

export function storeReceipt(key: string, body: Uint8Array, contentType = 'image/png') {
  return putReceipt(TEST_ENV, key, body, contentType)
}

/** URL présignée de reçu : bonne clé, validité de 300 s, et elle sert bien le fichier. */
export async function expectPresignedReceipt(
  url: string,
  key: string,
  expected: Uint8Array
): Promise<void> {
  const parsed = new URL(url)
  expect(parsed.pathname).toBe(`/${TEST_ENV.S3_BUCKET}/${key}`)
  expect(parsed.searchParams.get('X-Amz-Expires')).toBe('300')
  const response = await fetch(url)
  expect(response.status).toBe(200)
  expect(new Uint8Array(await response.arrayBuffer())).toEqual(expected)
}
