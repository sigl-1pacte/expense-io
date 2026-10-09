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

// [as-is] audit §3 : un mauvais rôle donne 401 côté employé/manager, 403 côté RH.
const REFUSED_STATUS: Record<Area, number> = { employee: 401, manager: 401, hr: 403 }

async function expectRefused(
  request: APIRequestContext,
  endpoints: Endpoint[],
  headers?: Record<string, string>
): Promise<void> {
  for (const endpoint of endpoints) {
    const response = await request.fetch(endpoint.path, { method: endpoint.method, headers })
    const label = `${endpoint.method} ${endpoint.path}`
    expect.soft(response.status(), label).toBe(REFUSED_STATUS[endpoint.area])
    expect.soft(await response.json(), label).toEqual({ error: 'Unauthorized' })
  }
}

test.afterEach(closeContexts)

test('[as-is] sans cookie : 401 côté employé et manager, mais 403 et non 401 côté RH (audit §3)', async ({ request }) => {
  await expectRefused(request, ENDPOINTS)
})

test('[as-is] cookie de session falsifié : traité comme anonyme, donc 403 et non 401 côté RH (audit §3)', async ({ request }) => {
  await expectRefused(request, ENDPOINTS, { cookie: 'authjs.session-token=jeton-falsifie' })
})

test('[as-is] session employé : 401 et non 403 côté manager (audit §3), 403 côté RH', async ({ browser }) => {
  const page = await loginAs(browser, (await createOrg()).employee)
  await expectRefused(page.request, ENDPOINTS.filter((endpoint) => endpoint.area !== 'employee'))
})

test('session manager : refusée sur les endpoints RH', async ({ browser }) => {
  const page = await loginAs(browser, (await createOrg()).manager)
  await expectRefused(page.request, ENDPOINTS.filter((endpoint) => endpoint.area === 'hr'))
})

test('[as-is] session RH : 401 et non 403 sur les endpoints manager (audit §3)', async ({ browser }) => {
  const page = await loginAs(browser, (await createOrg()).hr)
  await expectRefused(page.request, ENDPOINTS.filter((endpoint) => endpoint.area === 'manager'))
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

test('[as-is] erreur non interceptée : 500 générique de Next, sans stack', async ({ browser }) => {
  const page = await loginAs(browser, (await createOrg()).employee)
  const response = await page.request.get('/api/expense-notes?sort=nope')
  expect(response.status()).toBe(500)
  expect(await response.text()).not.toContain('stack')
})

test('[as-is] erreur interceptée : 500 JSON avec la stack (audit §4)', async ({ browser }) => {
  const page = await loginAs(browser, (await createOrg()).employee)
  const response = await page.request.post('/api/expense-notes', { data: { amount: 1 } })
  expect(response.status()).toBe(500)
  expect(await response.json()).toEqual({
    error: expect.stringContaining('Content-Type'),
    stack: expect.any(String),
  })
})
