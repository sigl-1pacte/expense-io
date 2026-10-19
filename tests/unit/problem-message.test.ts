import { describe, expect, it } from 'vitest'
import { problemMessage } from '@/components/problem-message'

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 409 })

describe('problemMessage', () => {
  it('préfère detail', async () => {
    expect(await problemMessage(json({ error: 'Already decided', detail: 'Déjà tranchée' }), 'x')).toBe('Déjà tranchée')
  })

  it('sinon error', async () => {
    expect(await problemMessage(json({ error: 'Invalid manager' }), 'x')).toBe('Invalid manager')
  })

  it('sinon le message par défaut (corps illisible)', async () => {
    expect(await problemMessage(new Response('<html>', { status: 500 }), 'Échec.')).toBe('Échec.')
  })
})
