const BASE = process.env.MAILPIT_URL ?? 'http://localhost:8025'

export interface MailpitMessage {
  ID: string
  MessageID: string
  Subject: string
  To: Array<{ Address: string }>
}

export async function mailpitMessages(): Promise<MailpitMessage[]> {
  const response = await fetch(`${BASE}/api/v1/messages`)
  return ((await response.json()) as { messages: MailpitMessage[] }).messages
}

export async function clearMailpit(): Promise<void> {
  await fetch(`${BASE}/api/v1/messages`, { method: 'DELETE' })
}

/** Attend qu'un e-mail pour `to` arrive (polling de l'API Mailpit). */
export async function waitForMail(to: string, timeoutMs = 15_000): Promise<MailpitMessage> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const found = (await mailpitMessages()).find((m) => m.To.some((r) => r.Address === to))
    if (found) return found
    if (Date.now() > deadline) throw new Error(`Aucun e-mail pour ${to} après ${timeoutMs} ms`)
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
}
