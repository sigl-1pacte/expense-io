import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import type { ReceiptStorage } from '../ports/ReceiptStorage'

export class S3ReceiptStorage implements ReceiptStorage {
  private client: S3Client | undefined

  constructor(private readonly bucket = process.env.S3_BUCKET ?? 'receipts') {}

  private s3(): S3Client {
    this.client ??= new S3Client({
      endpoint: process.env.S3_ENDPOINT,
      region: process.env.S3_REGION ?? 'us-east-1',
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== 'false',
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY_ID ?? '',
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? '',
      },
    })
    return this.client
  }

  async upload(key: string, body: Uint8Array, contentType: string): Promise<void> {
    await this.s3().send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType }))
  }

  signedUrl(key: string): Promise<string> {
    return getSignedUrl(this.s3(), new GetObjectCommand({ Bucket: this.bucket, Key: key }), { expiresIn: 300 })
  }
}
