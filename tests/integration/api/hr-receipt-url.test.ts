import { describe, expect, it } from 'vitest'
import { GET } from '@/app/api/hr/expense-notes/[id]/receipt-url/route'
import { createNote, createOrg, type Org } from '../../support/factories'
import { PNG_BYTES } from '../../support/fixtures'
import { NON_UUID_IDS, UNKNOWN_ID, readJson, request, routeParams } from '../helpers/http'
import { expectPresignedReceipt, storeReceipt } from '../helpers/s3'
import { actAs, actAsCaller, actAsGhost, type Caller } from '../helpers/session'

function receiptUrl(id: string) {
  return GET(request(`/api/hr/expense-notes/${id}/receipt-url`), routeParams(id))
}

describe('GET /api/hr/expense-notes/:id/receipt-url', () => {
  it.each<[string, Caller]>([
    ['[as-is] anonyme → 403 et non 401 (audit §3)', 'anonymous'],
    ['mauvais rôle employee → 403', 'employee'],
    ['mauvais rôle manager → 403', 'manager'],
  ])('%s', async (_label, caller) => {
    const org = await createOrg()
    const note = await createNote({ user: org.manager })
    actAsCaller(org, caller)
    const response = await receiptUrl(note.id)
    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({ error: 'Unauthorized' })
  })

  it.each(['pending', 'approved'] as const)(
    "URL présignée valide pour la note %s d'un manager racine",
    async (status) => {
      const org = await createOrg()
      const note = await createNote({ user: org.manager, status, receiptKey: 'receipts/21.png' })
      await storeReceipt('receipts/21.png', PNG_BYTES)
      actAs(org.hr)
      const response = await receiptUrl(note.id)
      expect(response.status).toBe(200)
      const { url } = await readJson<{ url: string }>(response)
      await expectPresignedReceipt(url, 'receipts/21.png', PNG_BYTES)
    }
  )

  it.each<[string, (org: Org) => Promise<string>]>([
    ["note d'un employé", async (org) => (await createNote({ user: org.employee })).id],
    [
      "manager racine d'une autre entreprise",
      async () => (await createNote({ user: (await createOrg()).manager })).id,
    ],
    ['note inconnue', async () => UNKNOWN_ID],
  ])('404 : %s', async (_label, noteIdFor) => {
    const org = await createOrg()
    const id = await noteIdFor(org)
    actAs(org.hr)
    const response = await receiptUrl(id)
    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ error: 'Not found' })
  })

  it.each(NON_UUID_IDS)('[as-is] id « %s » non-UUID → 500 avec stack', async (id) => {
    actAs((await createOrg()).hr)
    const response = await receiptUrl(id)
    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({
      error: `invalid input syntax for type uuid: "${id}"`,
      stack: expect.any(String),
    })
  })

  it("session d'une RH supprimée → 404", async () => {
    const note = await createNote({ user: (await createOrg()).manager })
    actAsGhost('hr_admin')
    expect((await receiptUrl(note.id)).status).toBe(404)
  })
})
