import { describe, expect, it } from 'vitest'
import { GET } from '@/app/api/expense-notes/[id]/receipt-url/route'
import { TEST_ENV } from '../../support/env'
import { createNote, createOrg, createUser, type Org, type Role } from '../../support/factories'
import { PNG_BYTES } from '../../support/fixtures'
import { expectProblem, NON_UUID_IDS, UNKNOWN_ID, readJson, request, routeParams } from '../helpers/http'
import { expectPresignedReceipt, storeReceipt } from '../helpers/s3'
import { actAs, actAsAnonymous, actAsGhost } from '../helpers/session'

function receiptUrl(id: string) {
  return GET(request(`/api/expense-notes/${id}/receipt-url`), routeParams(id))
}

describe('GET /api/expense-notes/:id/receipt-url', () => {
  it('401 sans session', async () => {
    const note = await createNote({ user: (await createOrg()).employee })
    actAsAnonymous()
    const response = await receiptUrl(note.id)
    await expectProblem(response, 401, 'Unauthorized')
  })

  it.each<Role>(['employee', 'manager', 'hr_admin'])(
    '%s : URL présignée valide pour sa propre note',
    async (role) => {
      const org = await createOrg()
      const user = { employee: org.employee, manager: org.manager, hr_admin: org.hr }[role]
      const note = await createNote({ user, receiptKey: 'receipts/42.png' })
      await storeReceipt('receipts/42.png', PNG_BYTES)
      actAs(user)
      const response = await receiptUrl(note.id)
      expect(response.status).toBe(200)
      const { url } = await readJson<{ url: string }>(response)
      await expectPresignedReceipt(url, 'receipts/42.png', PNG_BYTES)
    }
  )

  it.each<[string, (org: Org) => Promise<string>, (org: Org) => Org['employee']]>([
    [
      "note d'un collègue",
      async (org) => (await createNote({ user: await createUser({ company: org.company }) })).id,
      (org) => org.employee,
    ],
    [
      "note d'un rattaché, demandée par son manager",
      async (org) => (await createNote({ user: org.employee })).id,
      (org) => org.manager,
    ],
    [
      "note d'une autre entreprise",
      async () => (await createNote({ user: (await createOrg()).employee })).id,
      (org) => org.employee,
    ],
    ['note inconnue', async () => UNKNOWN_ID, (org) => org.employee],
  ])('404 : %s', async (_label, noteIdFor, callerFor) => {
    const org = await createOrg()
    const id = await noteIdFor(org)
    actAs(callerFor(org))
    const response = await receiptUrl(id)
    await expectProblem(response, 404, 'Not found')
  })

  it("session d'un utilisateur supprimé → 401", async () => {
    const note = await createNote({ user: (await createOrg()).employee })
    actAsGhost('employee')
    await expectProblem(await receiptUrl(note.id), 401, 'Unauthorized')
  })

  it.each(NON_UUID_IDS)('id « %s » non-UUID → 400', async (id) => {
    actAs((await createOrg()).employee)
    const response = await receiptUrl(id)
    await expectProblem(response, 400, 'Identifiant invalide')
  })

  it('[as-is] note orpheline (receipt_key vide, audit §5) : URL signée de la racine du bucket, qui liste tous les reçus (constat hors audit)', async () => {
    await storeReceipt('receipts/recu-d-un-autre.png', PNG_BYTES)
    const { employee } = await createOrg()
    const note = await createNote({ user: employee, receiptKey: '' })
    actAs(employee)
    const response = await receiptUrl(note.id)
    expect(response.status).toBe(200)
    const { url } = await readJson<{ url: string }>(response)
    expect(new URL(url).pathname).toBe(`/${TEST_ENV.S3_BUCKET}/`)
    const listing = await (await fetch(url)).text()
    expect(listing).toContain('<ListBucketResult')
    expect(listing).toContain('<Key>receipts/recu-d-un-autre.png</Key>')
  })
})
