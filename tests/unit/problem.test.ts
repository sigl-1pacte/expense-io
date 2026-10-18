import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  Conflict,
  Forbidden,
  InvalidInput,
  NotFound,
  Unauthenticated,
  Unavailable,
  UpstreamFailure,
} from '@/shared/errors'
import { problemResponse } from '@/shared/problem'

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('problemResponse', () => {
  it.each([
    [new Unauthenticated(), 401, 'Unauthorized', 'unauthenticated'],
    [new Forbidden(), 403, 'Unauthorized', 'forbidden'],
    [new NotFound(), 404, 'Not found', 'not-found'],
    [new InvalidInput('Champs invalides'), 400, 'Champs invalides', 'invalid-input'],
    [new Conflict('already-decided', 'Already decided'), 409, 'Already decided', 'already-decided'],
    [new UpstreamFailure('receipt-upload-failed', 'Stockage indisponible'), 502, 'Stockage indisponible', 'receipt-upload-failed'],
  ])('%s → %i, error gardé, problem+json', async (error, status, message, slug) => {
    const response = problemResponse(error, 'corr-1')
    expect(response.status).toBe(status)
    expect(response.headers.get('content-type')).toBe('application/problem+json')
    expect(response.headers.get('x-correlation-id')).toBe('corr-1')
    expect(await response.json()).toEqual({
      error: message,
      type: `https://expense.io/problems/${slug}`,
      title: expect.any(String),
      status,
      detail: message,
    })
  })

  it('503 porte Retry-After', () => {
    const response = problemResponse(new Unavailable('OCR saturé', 5), 'c')
    expect(response.status).toBe(503)
    expect(response.headers.get('retry-after')).toBe('5')
  })

  it('erreur inconnue : 500 sans stack ni message interne, journalisée avec la référence', async () => {
    const response = problemResponse(new Error('column "nope" does not exist'), 'corr-2')
    expect(response.status).toBe(500)
    const body = await response.json()
    expect(body).toEqual({
      error: 'Erreur interne',
      type: 'https://expense.io/problems/internal',
      title: 'Erreur interne',
      status: 500,
      detail: 'Une erreur interne est survenue. Référence : corr-2',
    })
    expect(JSON.stringify(body)).not.toContain('nope')
    const logged = JSON.parse(vi.mocked(console.error).mock.calls[0][0] as string)
    expect(logged).toMatchObject({ level: 'error', correlationId: 'corr-2' })
    expect(logged.error.message).toBe('column "nope" does not exist')
  })

  it('objet circulaire lancé (non Error) : 500 générique, le logger ne lève pas', async () => {
    const circular: Record<string, unknown> = { code: 'X' }
    circular.self = circular
    const response = problemResponse(circular, 'corr-3')
    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({
      error: 'Erreur interne',
      type: 'https://expense.io/problems/internal',
      title: 'Erreur interne',
      status: 500,
      detail: 'Une erreur interne est survenue. Référence : corr-3',
    })
  })
})
