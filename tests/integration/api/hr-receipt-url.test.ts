import { describe, expect, it } from 'vitest'
import { GET } from '@/app/api/hr/expense-notes/[id]/receipt-url/route'
import { createNote, createOrg, type Org } from '../../support/factories'
import { PNG_BYTES } from '../../support/fixtures'
import { expectProblem, NON_UUID_IDS, UNKNOWN_ID, readJson, request, routeParams } from '../helpers/http'
import { expectPresignedReceipt, storeReceipt } from '../helpers/s3'
import { actAs, actAsCaller, actAsGhost, type Caller } from '../helpers/session'

function receiptUrl(id: string) {
  return GET(request(`/api/hr/expense-notes/${id}/receipt-url`), routeParams(id))
}

describe('GET /api/hr/expense-notes/:id/receipt-url', () => {
  it.each<[string, Caller]>([
    ['anonyme → 401', 'anonymous'],
    ['mauvais rôle employee → 403', 'employee'],
    ['mauvais rôle manager → 403', 'manager'],
  ])('%s', async (_label, caller) => {
    const org = await createOrg()
    const note = await createNote({ user: org.manager })
    actAsCaller(org, caller)
    const response = await receiptUrl(note.id)
    await expectProblem(response, caller === 'anonymous' ? 401 : 403, 'Unauthorized')
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
    await expectProblem(response, 404, 'Not found')
  })

  it.each(NON_UUID_IDS)('id « %s » non-UUID → 400', async (id) => {
    actAs((await createOrg()).hr)
    const response = await receiptUrl(id)
    await expectProblem(response, 400, 'Identifiant invalide')
  })

  it("session d'une RH supprimée → 401", async () => {
    const note = await createNote({ user: (await createOrg()).manager })
    actAsGhost('hr_admin')
    await expectProblem(await receiptUrl(note.id), 401, 'Unauthorized')
  })
})
