// Outils des adapters d'entrée HTTP : enrobage commun des route handlers
// (corrélation, traduction des erreurs), gardes de session et de rôle,
// lecture bornée du corps.
import { randomUUID } from 'node:crypto'
import { auth } from '@/lib/auth'
import type { Role } from './actor'
import { Forbidden, InvalidInput, Unauthenticated } from './errors'
import { problemResponse } from './problem'

export const MAX_RECEIPT_BYTES = 10 * 1024 * 1024
/** Marge du multipart au-delà du fichier : délimiteurs, en-têtes, champs texte. */
export const MULTIPART_OVERHEAD_BYTES = 64 * 1024
export const MAX_JSON_BYTES = 64 * 1024

export type { Role }

export interface SessionUser {
  id: string
  email: string
  role: Role
}

export interface RouteContext<P> {
  params: Promise<P>
}

interface RouteMeta {
  correlationId: string
}

// L'identifiant reçu est renvoyé dans la réponse et dans les détails des 500 :
// on n'accepte qu'un jeton sûr, sinon on en génère un.
const CORRELATION_ID_PATTERN = /^[A-Za-z0-9._-]{1,128}$/

function resolveCorrelationId(request: Request): string {
  const received = request.headers.get('x-correlation-id')
  return received !== null && CORRELATION_ID_PATTERN.test(received) ? received : randomUUID()
}

/**
 * Enrobe un route handler : toute erreur, même rejetée de façon asynchrone
 * (F43), devient une réponse RFC 9457 ; l'identifiant de corrélation est lu
 * dans `x-correlation-id` (s'il est valide) ou généré, et renvoyé dans la réponse.
 */
export function route<C = unknown>(
  handler: (request: Request, context: C, meta: RouteMeta) => Promise<Response>
) {
  // Paramètres optionnels : les tests d'intégration appellent `GET()` sans
  // requête pour les listes ; Next.js, lui, passe toujours les deux.
  return async (
    request: Request = new Request('http://localhost/'),
    context: C = undefined as C
  ): Promise<Response> => {
    const correlationId = resolveCorrelationId(request)
    let response: Response
    try {
      response = await handler(request, context, { correlationId })
    } catch (error) {
      return problemResponse(error, correlationId)
    }
    try {
      response.headers.set('x-correlation-id', correlationId)
      return response
    } catch {
      // En-têtes immuables (ex. `Response.redirect`) : on recopie la réponse.
      const headers = new Headers(response.headers)
      headers.set('x-correlation-id', correlationId)
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      })
    }
  }
}

export async function requireSession(): Promise<SessionUser> {
  const session = await auth()
  if (!session?.user?.id) throw new Unauthenticated()
  const { id, email, role } = session.user
  return { id, email: email ?? '', role }
}

export function requireRole(subject: { role: Role }, role: Role): void {
  if (subject.role !== role) throw new Forbidden()
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function parseUuid(value: string): string {
  if (!UUID_PATTERN.test(value)) throw new InvalidInput('Identifiant invalide')
  return value
}

/**
 * Lit le corps sans jamais dépasser `maxBytes` (F34) : refus immédiat si
 * Content-Length annonce plus, sinon lecture du flux interrompue au dépassement.
 */
export async function readBodyWithLimit(
  request: Request,
  maxBytes: number,
  tooLargeMessage: string
): Promise<Uint8Array<ArrayBuffer>> {
  const declared = request.headers.get('content-length')
  if (declared !== null && Number(declared) > maxBytes) throw new InvalidInput(tooLargeMessage)
  if (!request.body) return new Uint8Array(new ArrayBuffer(0))

  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > maxBytes) {
      await reader.cancel()
      throw new InvalidInput(tooLargeMessage)
    }
    chunks.push(value)
  }
  const bytes = new Uint8Array(new ArrayBuffer(total))
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return bytes
}

export async function readFormData(
  request: Request,
  maxBytes: number,
  tooLargeMessage: string
): Promise<FormData> {
  const bytes = await readBodyWithLimit(request, maxBytes, tooLargeMessage)
  const contentType = request.headers.get('content-type') ?? ''
  try {
    return await new Response(bytes, { headers: { 'content-type': contentType } }).formData()
  } catch {
    throw new InvalidInput('Corps de requête invalide')
  }
}

export async function readJsonObject(
  request: Request,
  maxBytes = MAX_JSON_BYTES
): Promise<Record<string, unknown>> {
  const bytes = await readBodyWithLimit(request, maxBytes, 'Corps de requête invalide')
  let parsed: unknown
  try {
    parsed = JSON.parse(new TextDecoder().decode(bytes))
  } catch {
    throw new InvalidInput('Corps de requête invalide')
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new InvalidInput('Corps de requête invalide')
  }
  return parsed as Record<string, unknown>
}
