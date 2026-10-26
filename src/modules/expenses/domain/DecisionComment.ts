import { InvalidInput } from '@/shared/errors'

export const MAX_DECISION_COMMENT_LENGTH = 500

/**
 * Commentaire facultatif du validateur, lu dans le corps JSON `{ comment }`.
 * Absent, vide ou blanc : aucun commentaire. Autre chose que du texte, ou trop
 * long : 400.
 */
export function parseDecisionComment(body: unknown): string | undefined {
  if (typeof body !== 'object' || body === null || !('comment' in body)) return undefined
  const { comment } = body
  if (typeof comment !== 'string') throw new InvalidInput('comment doit être du texte')
  const trimmed = comment.trim()
  if (trimmed.length > MAX_DECISION_COMMENT_LENGTH) {
    throw new InvalidInput(`comment ne doit pas dépasser ${MAX_DECISION_COMMENT_LENGTH} caractères`)
  }
  return trimmed === '' ? undefined : trimmed
}
