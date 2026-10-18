import { describe, expect, it } from 'vitest'
import { GET } from '@/app/api/manager/expense-notes/[id]/receipt-url/route'
import { TEST_ENV } from '../../support/env'
import { createNote, createOrg, createUser, type NoteRow, type Org } from '../../support/factories'
import { PNG_BYTES } from '../../support/fixtures'
import { expectProblem, NON_UUID_IDS, UNKNOWN_ID, readJson, request, routeParams } from '../helpers/http'
import { expectPresignedReceipt, storeReceipt } from '../helpers/s3'
import { actAs, actAsCaller, actAsGhost, type Caller } from '../helpers/session'

function receiptUrl(id: string) {
  return GET(request(`/api/manager/expense-notes/${id}/receipt-url`), routeParams(id))
}

describe('GET /api/manager/expense-notes/:id/receipt-url', () => {
  it.each<[string, Caller]>([
    ['anonyme → 401', 'anonymous'],
    ['mauvais rôle employee → 403', 'employee'],
    ['mauvais rôle hr_admin → 403', 'hr_admin'],
  ])('%s', async (_label, caller) => {
    const org = await createOrg()
    const note = await createNote({ user: org.employee })
    actAsCaller(org, caller)
    const response = await receiptUrl(note.id)
    await expectProblem(response, caller === 'anonymous' ? 401 : 403, 'Unauthorized')
  })

  it("URL présignée valide pour la note d'un rattaché", async () => {
    const org = await createOrg()
    const note = await createNote({ user: org.employee, receiptKey: 'receipts/11.png' })
    await storeReceipt('receipts/11.png', PNG_BYTES)
    actAs(org.manager)
    const response = await receiptUrl(note.id)
    expect(response.status).toBe(200)
    const { url } = await readJson<{ url: string }>(response)
    await expectPresignedReceipt(url, 'receipts/11.png', PNG_BYTES)
  })

  it.each<[string, (org: Org) => Promise<NoteRow>]>([
    [
      'employé non rattaché de la même entreprise',
      async (org) => createNote({ user: await createUser({ company: org.company }) }),
    ],
    ["employé d'une autre entreprise", async () => createNote({ user: (await createOrg()).employee })],
  ])('404 : %s', async (_label, noteFor) => {
    const org = await createOrg()
    const note = await noteFor(org)
    actAs(org.manager)
    const response = await receiptUrl(note.id)
    await expectProblem(response, 404, 'Not found')
  })

  it("note déjà approuvée d'un rattaché : URL servie", async () => {
    const org = await createOrg()
    const note = await createNote({ user: org.employee, status: 'approved' })
    actAs(org.manager)
    const response = await receiptUrl(note.id)
    expect(response.status).toBe(200)
    const { url } = await readJson<{ url: string }>(response)
    expect(new URL(url).pathname).toBe(`/${TEST_ENV.S3_BUCKET}/${note.receipt_key}`)
  })

  it('404 pour une note inconnue', async () => {
    actAs((await createOrg()).manager)
    const response = await receiptUrl(UNKNOWN_ID)
    await expectProblem(response, 404, 'Not found')
  })

  it.each(NON_UUID_IDS)('id « %s » non-UUID → 400', async (id) => {
    actAs((await createOrg()).manager)
    const response = await receiptUrl(id)
    await expectProblem(response, 400, 'Identifiant invalide')
  })

  it("session d'un manager supprimé → 404", async () => {
    const note = await createNote({ user: (await createOrg()).employee })
    actAsGhost('manager')
    await expectProblem(await receiptUrl(note.id), 404, 'Not found')
  })
})
