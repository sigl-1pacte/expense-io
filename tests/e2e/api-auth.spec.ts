import { expect, test, type APIRequestContext } from '@playwright/test'
import { createOrg } from '../support/factories'
import { closeContexts, loginAs } from './helpers'

const NOTE_ID = '00000000-0000-4000-8000-000000000000'

type Area = 'employee' | 'manager' | 'hr'

interface Endpoint {
  method: 'GET' | 'POST' | 'PUT'
  path: string
  area: Area
}

const ENDPOINTS: Endpoint[] = [
  { method: 'GET', path: '/api/expense-notes', area: 'employee' },
  { method: 'POST', path: '/api/expense-notes', area: 'employee' },
  { method: 'GET', path: `/api/expense-notes/${NOTE_ID}/receipt-url`, area: 'employee' },
  { method: 'POST', path: '/api/expense-notes/receipt-suggestion', area: 'employee' },
  { method: 'GET', path: '/api/manager/expense-notes', area: 'manager' },
  { method: 'POST', path: `/api/manager/expense-notes/${NOTE_ID}/approve`, area: 'manager' },
  { method: 'POST', path: `/api/manager/expense-notes/${NOTE_ID}/reject`, area: 'manager' },
  { method: 'GET', path: `/api/manager/expense-notes/${NOTE_ID}/receipt-url`, area: 'manager' },
  { method: 'GET', path: '/api/hr/expense-notes', area: 'hr' },
  { method: 'POST', path: `/api/hr/expense-notes/${NOTE_ID}/approve`, area: 'hr' },
  { method: 'POST', path: `/api/hr/expense-notes/${NOTE_ID}/reject`, area: 'hr' },
  { method: 'GET', path: `/api/hr/expense-notes/${NOTE_ID}/receipt-url`, area: 'hr' },
  { method: 'GET', path: '/api/hr/users', area: 'hr' },
  { method: 'PUT', path: `/api/hr/users/${NOTE_ID}/manager`, area: 'hr' },
]

// F27 : 401 sans session (ou session invalide), 403 avec une session de mauvais rôle.
async function expectRefused(
  request: APIRequestContext,
  endpoints: Endpoint[],
  status: 401 | 403,
  headers?: Record<string, string>
): Promise<void> {
  for (const endpoint of endpoints) {
    const response = await request.fetch(endpoint.path, { method: endpoint.method, headers })
    const label = `${endpoint.method} ${endpoint.path}`
    expect.soft(response.status(), label).toBe(status)
    expect.soft(await response.json(), label).toMatchObject({ error: 'Unauthorized', status })
  }
}

test.afterEach(closeContexts)

test('sans cookie : 401 partout', async ({ request }) => {
  await expectRefused(request, ENDPOINTS, 401)
})

test('cookie de session falsifié : 401 partout', async ({ request }) => {
  await expectRefused(request, ENDPOINTS, 401, { cookie: 'authjs.session-token=jeton-falsifie' })
})

test('session employé : 403 sur les endpoints manager et RH', async ({ browser }) => {
  const page = await loginAs(browser, (await createOrg()).employee)
  await expectRefused(page.request, ENDPOINTS.filter((endpoint) => endpoint.area !== 'employee'), 403)
})

test('session manager : 403 sur les endpoints RH', async ({ browser }) => {
  const page = await loginAs(browser, (await createOrg()).manager)
  await expectRefused(page.request, ENDPOINTS.filter((endpoint) => endpoint.area === 'hr'), 403)
})

test('session RH : 403 sur les endpoints manager', async ({ browser }) => {
  const page = await loginAs(browser, (await createOrg()).hr)
  await expectRefused(page.request, ENDPOINTS.filter((endpoint) => endpoint.area === 'manager'), 403)
})

test('session valide : le JWT réel est accepté', async ({ browser }) => {
  const page = await loginAs(browser, (await createOrg()).employee)
  const response = await page.request.get('/api/expense-notes')
  expect(response.status()).toBe(200)
  expect(await response.json()).toEqual([])
})

test('méthode HTTP non exportée → 405', async ({ request }) => {
  for (const [method, path] of [
    ['DELETE', '/api/expense-notes'],
    ['PATCH', '/api/hr/users'],
    ['GET', `/api/manager/expense-notes/${NOTE_ID}/approve`],
  ]) {
    expect.soft((await request.fetch(path, { method })).status(), `${method} ${path}`).toBe(405)
  }
})

test('erreur interne : 500 générique, sans stack ni détail SQL', async ({ browser }) => {
  const page = await loginAs(browser, (await createOrg()).employee)
  const response = await page.request.get('/api/expense-notes?sort=nope')
  expect(response.status()).toBe(500)
  const body = await response.text()
  expect(body).not.toContain('stack')
  expect(body).not.toContain('nope')
})

test('corps JSON sur une route multipart : 400 problem+json, sans stack', async ({ browser }) => {
  const page = await loginAs(browser, (await createOrg()).employee)
  const response = await page.request.post('/api/expense-notes', { data: { amount: 1 } })
  expect(response.status()).toBe(400)
  expect(response.headers()['content-type']).toContain('application/problem+json')
  expect(await response.json()).toMatchObject({ error: 'Corps de requête invalide', status: 400 })
})
