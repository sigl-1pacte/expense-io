/** Reconnaissance de texte sur une image de reçu. Lève `Unavailable` si saturé. */
export interface ReceiptReader {
  recognize(image: Uint8Array): Promise<string>
}
