// Traduction d'une erreur en réponse RFC 9457 (application/problem+json).
// Additif : le champ historique `error` est conservé (ADR 0004).
import { AppError } from './errors'
import { logger } from './logger'

const PROBLEM_BASE = 'https://expense.io/problems/'

export interface ProblemBody {
  error: string
  type: string
  title: string
  status: number
  detail: string
}

function problem(status: number, body: ProblemBody, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/problem+json', ...headers },
  })
}

export function problemResponse(error: unknown, correlationId: string): Response {
  if (error instanceof AppError) {
    return problem(
      error.status,
      {
        error: error.message,
        type: `${PROBLEM_BASE}${error.slug}`,
        title: error.title,
        status: error.status,
        detail: error.message,
      },
      { ...error.headers, 'x-correlation-id': correlationId }
    )
  }
  // Jamais de stack ni de message interne vers le client (F26) : seulement dans les logs.
  logger.error('Erreur non gérée', { correlationId, error })
  return problem(
    500,
    {
      error: 'Erreur interne',
      type: `${PROBLEM_BASE}internal`,
      title: 'Erreur interne',
      status: 500,
      detail: `Une erreur interne est survenue. Référence : ${correlationId}`,
    },
    { 'x-correlation-id': correlationId }
  )
}
