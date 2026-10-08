import { describe, expect, it } from 'vitest'
import { GET } from '@/app/api/manager/expense-notes/[id]/receipt-url/route'
import { TEST_ENV } from '../../support/env'
import { createNote, createOrg, createUser, type NoteRow, type Org } from '../../support/factories'
import { PNG_BYTES } from '../../support/fixtures'
import { NON_UUID_IDS, UNKNOWN_ID, readJson, request, routeParams } from '../helpers/http'
import { expectPresignedReceipt, storeReceipt } from '../helpers/s3'
import { actAs, actAsCaller, actAsGhost, type Caller } from '../helpers/session'

function receiptUrl(id: string) {
  return GET(request(`/api/manager/expense-notes/${id}/receipt-url`), routeParams(id))
}

describe('GET /api/manager/expense-notes/:id/receipt-url', () => {
  it.each<Caller>(['anonymous', 'employee', 'hr_admin'])('[as-is] %s → 401 (audit §3)', async (caller) => {
    const org = await createOrg()
    const note = await createNote({ user: org.employee })
    actAsCaller(org, caller)
    const response = await receiptUrl(note.id)
    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: 'Unauthorized' })
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
    ['note déjà approuvée', async (org) => createNote({ user: org.employee, status: 'approved' })],
  ])('[as-is] reçu servi sans contrôle de rattachement : %s (audit §3)', async (_label, noteFor) => {
    const org = await createOrg()
    const note = await noteFor(org)
    actAs(org.manager)
    const response = await receiptUrl(note.id)
    expect(response.status).toBe(200)
    const { url } = await readJson<{ url: string }>(response)
    expect(new URL(url).pathname).toBe(`/${TEST_ENV.S3_BUCKET}/${note.receipt_key}`)
  })

  it('404 pour une note inconnue', async () => {
    actAs((await createOrg()).manager)
    const response = await receiptUrl(UNKNOWN_ID)
    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ error: 'Not found' })
  })

  it.each(NON_UUID_IDS)('[as-is] id « %s » non-UUID → 500 avec stack', async (id) => {
    actAs((await createOrg()).manager)
    const response = await receiptUrl(id)
    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({
      error: `invalid input syntax for type uuid: "${id}"`,
      stack: expect.any(String),
    })
  })

  it("[as-is] session d'un manager supprimé : reçu servi quand même", async () => {
    const note = await createNote({ user: (await createOrg()).employee })
    actAsGhost('manager')
    expect((await receiptUrl(note.id)).status).toBe(200)
  })
})
