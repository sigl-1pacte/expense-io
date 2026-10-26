import { parseDecisionComment } from '@/modules/expenses'

/**
 * Commentaire facultatif d'une décision. Un corps absent ou illisible garde
 * l'ancien comportement (il est ignoré) ; un `comment` qui n'est pas du texte,
 * ou trop long, donne 400.
 */
export async function readDecisionComment(request: Request): Promise<string | undefined> {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return undefined
  }
  return parseDecisionComment(body)
}
