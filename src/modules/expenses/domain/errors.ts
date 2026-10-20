import { Conflict, UpstreamFailure } from '@/shared/errors'

export class AlreadyDecided extends Conflict {
  constructor() {
    super('already-decided', 'Already decided')
  }
}

/** Le reçu n'a pas pu être envoyé : aucune note n'a été créée (F10). */
export class ReceiptUploadFailed extends UpstreamFailure {
  constructor() {
    super('receipt-upload-failed', 'Stockage des reçus indisponible')
  }
}
