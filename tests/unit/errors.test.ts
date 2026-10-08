import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { respondError } from '@/lib/errors'

describe('respondError', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("[as-is] renvoie une 500 avec le message et la stack d'une Error (audit §4)", async () => {
    const error = new Error('boum')
    const response = respondError(error)
    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ error: 'boum', stack: error.stack })
  })

  it('convertit une chaîne en message, sans stack', async () => {
    expect(await respondError('texte brut').json()).toEqual({ error: 'texte brut' })
  })

  it('convertit un objet avec String(), sans stack', async () => {
    expect(await respondError({ toString: () => 'objet' }).json()).toEqual({ error: 'objet' })
  })

  it("logue l'erreur reçue", () => {
    const error = new Error('boum')
    respondError(error)
    expect(console.error).toHaveBeenCalledWith(error)
  })
})
