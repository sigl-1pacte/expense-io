import { describe, expect, it } from 'vitest'
import { POST as approve } from '@/app/api/manager/expense-notes/[id]/approve/route'
import { POST as reject } from '@/app/api/manager/expense-notes/[id]/reject/route'
import { createNote, createOrg, findNote } from '../../support/factories'
import { request, routeParams } from '../helpers/http'
import { actAs } from '../helpers/session'

describe('décisions concurrentes (F9)', () => {
  it('approve et reject en parallèle : un 200, un 409, et la note a une seule décision', async () => {
    const org = await createOrg()
    const note = await createNote({ user: org.employee })
    actAs(org.manager)
    const call = (handler: typeof approve, action: string) =>
      handler(request(`/api/manager/expense-notes/${note.id}/${action}`, { method: 'POST' }), routeParams(note.id))
    const responses = await Promise.all([call(approve, 'approve'), call(reject, 'reject')])
    expect(responses.map((r) => r.status).sort()).toEqual([200, 409])
    const winner = await responses.find((r) => r.status === 200)!.json()
    expect((await findNote(note.id))?.status).toBe(winner.status)
  })
})
