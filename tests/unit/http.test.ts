import type { Session } from 'next-auth'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { auth } from '@/lib/auth'
import { InvalidInput, NotFound } from '@/shared/errors'
import {
  parseUuid,
  readBodyWithLimit,
  readFormData,
  readJsonObject,
  requireRole,
  requireSession,
  route,
} from '@/shared/http'

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))
const authMock = auth as unknown as Mock<() => Promise<Session | null>>

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
  authMock.mockReset()
})

const url = 'http://localhost/api/x'

describe('route', () => {
  it('renvoie la réponse du handler et l’identifiant de corrélation reçu', async () => {
    const handler = route(async () => Response.json({ ok: true }))
    const response = await handler(new Request(url, { headers: { 'x-correlation-id': 'abc' } }))
    expect(await response.json()).toEqual({ ok: true })
    expect(response.headers.get('x-correlation-id')).toBe('abc')
  })

  it('accepte un appel sans requête (listes appelées par `GET()` dans les tests)', async () => {
    const response = await route(async () => Response.json([]))()
    expect(await response.json()).toEqual([])
  })

  it('génère un identifiant de corrélation absent', async () => {
    const response = await route(async () => Response.json({}))(new Request(url))
    expect(response.headers.get('x-correlation-id')).toMatch(/^[0-9a-f-]{36}$/)
  })

  it.each([
    ['avec des espaces', 'a b c'],
    ['avec un caractère de contrôle', 'abc\u0001def'],
    ['avec un balisage', '<script>x</script>'],
    ['plus long que 128 caractères', 'a'.repeat(129)],
  ])('remplace un identifiant de corrélation reçu invalide (%s) par un UUID', async (_label, value) => {
    const response = await route(async () => Response.json({}))(
      new Request(url, { headers: { 'x-correlation-id': value } })
    )
    const id = response.headers.get('x-correlation-id')
    expect(id).not.toBe(value)
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
  })

  it('ajoute la corrélation même à une réponse à en-têtes immuables (redirection)', async () => {
    const response = await route(async () => Response.redirect('http://localhost/x', 302))(
      new Request(url, { headers: { 'x-correlation-id': 'abc' } })
    )
    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toBe('http://localhost/x')
    expect(response.headers.get('x-correlation-id')).toBe('abc')
  })

  it('traduit une AppError rejetée de façon asynchrone (F43)', async () => {
    const handler = route(async () => Promise.reject(new NotFound()))
    const response = await handler(new Request(url))
    expect(response.status).toBe(404)
    expect((await response.json()).error).toBe('Not found')
  })

  it('transmet le contexte de route', async () => {
    const handler = route(async (_request, context: { params: Promise<{ id: string }> }) =>
      Response.json(await context.params)
    )
    const response = await handler(new Request(url), { params: Promise.resolve({ id: '1' }) })
    expect(await response.json()).toEqual({ id: '1' })
  })
})

describe('requireSession / requireRole', () => {
  it('sans session : Unauthenticated (401)', async () => {
    authMock.mockResolvedValue(null)
    await expect(requireSession()).rejects.toMatchObject({ status: 401 })
  })

  it('renvoie l’utilisateur de la session', async () => {
    authMock.mockResolvedValue({ user: { id: 'u', email: 'e@x.fr', role: 'manager' }, expires: '2999' })
    expect(await requireSession()).toEqual({ id: 'u', email: 'e@x.fr', role: 'manager' })
  })

  it('mauvais rôle : Forbidden (403)', () => {
    expect(() => requireRole({ id: 'u', email: 'e', role: 'employee' }, 'manager')).toThrow(
      expect.objectContaining({ status: 403 })
    )
  })
})

describe('parseUuid', () => {
  it('accepte un UUID', () => {
    expect(parseUuid('00000000-0000-4000-8000-000000000000')).toBe('00000000-0000-4000-8000-000000000000')
  })

  it.each(['abc', '1', "' OR 1=1 --", ''])('refuse « %s » (400)', (value) => {
    expect(() => parseUuid(value)).toThrow(new InvalidInput('Identifiant invalide'))
  })
})

function streamOf(totalBytes: number, chunkBytes: number) {
  let sent = 0
  let pulls = 0
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      pulls++
      if (sent >= totalBytes) return controller.close()
      const size = Math.min(chunkBytes, totalBytes - sent)
      sent += size
      controller.enqueue(new Uint8Array(size))
    },
  })
  return { stream, pullCount: () => pulls }
}

describe('readBodyWithLimit (F34)', () => {
  it('refuse sans lire le corps si Content-Length dépasse la limite', async () => {
    const { stream, pullCount } = streamOf(10, 10)
    const request = new Request(url, {
      method: 'POST',
      body: stream,
      headers: { 'content-length': '2000' },
      duplex: 'half',
    } as RequestInit)
    // Le runtime amorce le flux dès la construction de la Request : on vérifie
    // qu'aucune lecture supplémentaire n'a lieu pendant le refus.
    await new Promise((resolve) => setTimeout(resolve, 10))
    const pullsBefore = pullCount()
    await expect(readBodyWithLimit(request, 1000, 'Fichier trop volumineux')).rejects.toThrow(
      new InvalidInput('Fichier trop volumineux')
    )
    expect(pullCount()).toBe(pullsBefore)
  })

  it('coupe un flux sans Content-Length qui dépasse la limite', async () => {
    const { stream } = streamOf(2 * 1024 * 1024, 64 * 1024)
    const request = new Request(url, { method: 'POST', body: stream, duplex: 'half' } as RequestInit)
    await expect(readBodyWithLimit(request, 1024 * 1024, 'Fichier trop volumineux')).rejects.toThrow(
      'Fichier trop volumineux'
    )
  })

  it('accepte exactement maxBytes et refuse maxBytes + 1', async () => {
    const post = (size: number) => new Request(url, { method: 'POST', body: new Uint8Array(size) })
    expect((await readBodyWithLimit(post(100), 100, 'trop')).byteLength).toBe(100)
    await expect(readBodyWithLimit(post(101), 100, 'trop')).rejects.toThrow('trop')
  })

  it('renvoie le corps entier sous la limite', async () => {
    const request = new Request(url, { method: 'POST', body: 'bonjour' })
    expect(new TextDecoder().decode(await readBodyWithLimit(request, 100, 'trop'))).toBe('bonjour')
  })
})

describe('readFormData / readJsonObject (F42)', () => {
  it('lit un multipart', async () => {
    const form = new FormData()
    form.set('a', '1')
    const data = await readFormData(new Request(url, { method: 'POST', body: form }), 1000, 'trop')
    expect(data.get('a')).toBe('1')
  })

  it.each<[string, RequestInit]>([
    ['corps JSON', { method: 'POST', body: '{}', headers: { 'content-type': 'application/json' } }],
    ['corps vide sans Content-Type', { method: 'POST' }],
    ['multipart malformé', { method: 'POST', body: 'x', headers: { 'content-type': 'multipart/form-data; boundary=z' } }],
  ])('formulaire illisible (%s) → 400 « Corps de requête invalide »', async (_label, init) => {
    await expect(readFormData(new Request(url, init), 1000, 'trop')).rejects.toThrow(
      new InvalidInput('Corps de requête invalide')
    )
  })

  it('lit un objet JSON', async () => {
    const request = new Request(url, { method: 'PUT', body: '{"managerId":null}' })
    expect(await readJsonObject(request)).toEqual({ managerId: null })
  })

  it.each(['pas du json', '', '[]', '42', 'null'])('JSON « %s » qui n’est pas un objet → 400', async (body) => {
    await expect(readJsonObject(new Request(url, { method: 'PUT', body }))).rejects.toThrow(
      new InvalidInput('Corps de requête invalide')
    )
  })
})
