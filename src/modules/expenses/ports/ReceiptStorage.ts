export interface ReceiptStorage {
  upload(key: string, body: Uint8Array, contentType: string): Promise<void>
  /** URL présignée, valable 300 s. */
  signedUrl(key: string): Promise<string>
}
