/** Message d'erreur à afficher : `detail` (RFC 9457), sinon `error` historique, sinon `fallback`. */
export async function problemMessage(response: Response, fallback: string): Promise<string> {
  const body = (await response.json().catch(() => null)) as { detail?: unknown; error?: unknown } | null
  if (typeof body?.detail === 'string') return body.detail
  if (typeof body?.error === 'string') return body.error
  return fallback
}
