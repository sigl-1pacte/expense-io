import { describe, expect, it } from 'vitest'
import { GET, POST } from '@/app/api/expense-notes/route'
import { countRows, createNote, createOrg, findNote, type Role } from '../../support/factories'
import { PNG_BYTES } from '../../support/fixtures'
import {
  type NoteDto,
  expectProblem,
  jsonBody,
  multipart,
  readJson,
  receiptFile,
  request,
} from '../helpers/http'
import { headReceipt } from '../helpers/s3'
import { actAs, actAsAnonymous, actAsGhost } from '../helpers/session'

const MAX_RECEIPT_BYTES = 10 * 1024 * 1024

type NoteField = 'amount' | 'expenseDate' | 'description' | 'receipt'
type NoteOverrides = Partial<Record<NoteField, string | Blob | null>>

/** Formulaire valide par défaut ; une valeur `null` retire le champ. */
function submit(overrides: NoteOverrides = {}) {
  const fields: Record<NoteField, string | Blob | null> = {
    amount: '42.50',
    expenseDate: '2026-10-08',
    description: 'Taxi aéroport',
    receipt: receiptFile(),
    ...overrides,
  }
  const present: Record<string, string | Blob> = {}
  for (const [name, value] of Object.entries(fields)) {
    if (value !== null) present[name] = value
  }
  return POST(multipart('/api/expense-notes', present))
}

async function listAs(path = '/api/expense-notes'): Promise<NoteDto[]> {
  return readJson<NoteDto[]>(await GET(request(path)))
}

describe('GET /api/expense-notes', () => {
  it('401 sans session', async () => {
    actAsAnonymous()
    const response = await GET(request('/api/expense-notes'))
    await expectProblem(response, 401, 'Unauthorized')
  })

  it("ne renvoie que les notes de l'appelant", async () => {
    const { employee, manager } = await createOrg()
    const mine = await createNote({ user: employee })
    await createNote({ user: manager })
    actAs(employee)
    expect((await listAs()).map((note) => note.id)).toEqual([mine.id])
  })

  it('renvoie le DTO : montant en nombre, date brute, createdAt ISO indépendant du fuseau', async () => {
    const { employee } = await createOrg()
    // 23 h 30 UTC : le lendemain à Paris. Ni la date ni l'ISO ne doivent bouger.
    const note = await createNote({
      user: employee,
      amount: 42.5,
      expenseDate: '2026-10-01',
      description: 'Taxi',
      status: 'approved',
      receiptKey: 'receipts/9.png',
      createdAt: new Date('2026-10-01T23:30:00.000Z'),
    })
    actAs(employee)
    expect(await listAs()).toEqual([
      {
        id: note.id,
        userId: employee.id,
        amount: 42.5,
        expenseDate: '2026-10-01',
        description: 'Taxi',
        receiptKey: 'receipts/9.png',
        status: 'approved',
        createdAt: '2026-10-01T23:30:00.000Z',
      },
    ])
  })

  it.each(['/api/expense-notes', '/api/expense-notes?sort='])(
    '%s : tri par created_at décroissant',
    async (path) => {
      const { employee } = await createOrg()
      const first = await createNote({ user: employee, createdAt: new Date('2026-10-01T08:00:00Z') })
      const third = await createNote({ user: employee, createdAt: new Date('2026-10-03T08:00:00Z') })
      const second = await createNote({ user: employee, createdAt: new Date('2026-10-02T08:00:00Z') })
      actAs(employee)
      expect((await listAs(path)).map((note) => note.id)).toEqual([third.id, second.id, first.id])
    }
  )

  it.each<Role>(['manager', 'hr_admin'])('%s : renvoie aussi ses propres notes', async (role) => {
    const org = await createOrg()
    const user = role === 'manager' ? org.manager : org.hr
    const note = await createNote({ user })
    actAs(user)
    expect((await listAs()).map((n) => n.id)).toEqual([note.id])
  })

  it("session d'un utilisateur supprimé → 401", async () => {
    await createNote({ user: (await createOrg()).employee })
    actAsGhost('employee')
    await expectProblem(await GET(new Request('http://localhost/api/expense-notes')), 401, 'Unauthorized')
  })

  it('respecte ?sort=amount ASC', async () => {
    const { employee } = await createOrg()
    for (const amount of [30, 10, 20]) await createNote({ user: employee, amount })
    actAs(employee)
    const sort = encodeURIComponent('amount ASC')
    expect((await listAs(`/api/expense-notes?sort=${sort}`)).map((n) => n.amount)).toEqual([10, 20, 30])
  })

  it('[as-is] exécute une expression SQL arbitraire passée dans ?sort= (audit §4)', async () => {
    const { employee, hr } = await createOrg()
    await createNote({ user: employee, amount: 10 })
    await createNote({ user: employee, amount: 20 })
    actAs(employee)
    // L'ordre du résultat révèle si une condition sur la table users est vraie :
    // fuite d'information par injection dans ORDER BY.
    const probe = async (condition: string) => {
      const sort = encodeURIComponent(`(CASE WHEN ${condition} THEN amount ELSE -amount END) ASC`)
      return (await listAs(`/api/expense-notes?sort=${sort}`)).map((n) => n.amount)
    }
    expect(await probe(`(SELECT count(*) FROM users WHERE email = '${hr.email}') = 1`)).toEqual([10, 20])
    expect(await probe(`(SELECT count(*) FROM users WHERE email = 'personne@nulle.part') = 1`)).toEqual([
      20, 10,
    ])
  })

  it('colonne inconnue dans ?sort= : 500 générique, sans détail SQL', async () => {
    const { employee } = await createOrg()
    actAs(employee)
    await expectProblem(await GET(request('/api/expense-notes?sort=nope')), 500, 'Erreur interne')
  })

  it('requêtes multiples dans ?sort= : refusées par pg, 500 générique, base intacte', async () => {
    const { employee } = await createOrg()
    actAs(employee)
    const sort = encodeURIComponent('created_at; DROP TABLE users')
    await expectProblem(await GET(request(`/api/expense-notes?sort=${sort}`)), 500, 'Erreur interne')
    expect(await countRows('users')).toBe(3)
  })
})

describe('POST /api/expense-notes', () => {
  it("401 sans session, rien n'est créé", async () => {
    actAsAnonymous()
    const response = await submit()
    await expectProblem(response, 401, 'Unauthorized')
    expect(await countRows('expense_notes')).toBe(0)
  })

  it('201 : crée la note en attente, envoie le reçu sur S3 et renvoie le DTO', async () => {
    const { employee } = await createOrg()
    actAs(employee)
    const response = await submit()
    expect(response.status).toBe(201)
    const dto = await readJson<NoteDto>(response)
    expect(dto).toEqual({
      id: expect.any(String),
      userId: employee.id,
      amount: 42.5,
      expenseDate: '2026-10-08',
      description: 'Taxi aéroport',
      receiptKey: 'receipts/1.png',
      status: 'pending',
      createdAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
    })
    expect(await findNote(dto.id)).toMatchObject({
      user_id: employee.id,
      amount: '42.50',
      receipt_key: 'receipts/1.png',
      receipt_seq: 1,
      status: 'pending',
    })
    const object = await headReceipt('receipts/1.png')
    expect(object.ContentType).toBe('image/png')
    expect(object.ContentLength).toBe(PNG_BYTES.length)
  })

  it.each<[string, string]>([
    ['image/png', '.png'],
    ['image/jpeg', '.jpg'],
    ['image/webp', '.webp'],
    ['application/pdf', '.pdf'],
  ])('reçu %s → clé receipts/1%s', async (type, extension) => {
    const { employee } = await createOrg()
    actAs(employee)
    const dto = await readJson<NoteDto>(await submit({ receipt: receiptFile({ type, name: 'recu.bin' }) }))
    expect(dto.receiptKey).toBe(`receipts/1${extension}`)
    expect((await headReceipt(dto.receiptKey)).ContentType).toBe(type)
  })

  it('numérote les reçus avec receipt_seq', async () => {
    const { employee } = await createOrg()
    actAs(employee)
    const first = await readJson<NoteDto>(await submit())
    const second = await readJson<NoteDto>(await submit())
    expect([first.receiptKey, second.receiptKey]).toEqual(['receipts/1.png', 'receipts/2.png'])
  })

  it.each<Role>(['manager', 'hr_admin'])('%s peut aussi soumettre une note', async (role) => {
    const org = await createOrg()
    const user = role === 'manager' ? org.manager : org.hr
    actAs(user)
    const response = await submit()
    expect(response.status).toBe(201)
    expect((await readJson<NoteDto>(response)).userId).toBe(user.id)
  })

  it('conserve la description telle quelle (ni trim, ni limite de longueur)', async () => {
    const { employee } = await createOrg()
    actAs(employee)
    const padded = await readJson<NoteDto>(await submit({ description: '  Taxi  ' }))
    const long = await readJson<NoteDto>(await submit({ description: 'x'.repeat(10_000) }))
    expect(padded.description).toBe('  Taxi  ')
    expect(long.description).toHaveLength(10_000)
  })

  it.each<[string, NoteOverrides]>([
    ['montant absent', { amount: null }],
    ['montant vide', { amount: '' }],
    ['montant non numérique', { amount: 'abc' }],
    ['montant hexadécimal (parseFloat lit 0)', { amount: '0x10' }],
    ['montant nul', { amount: '0' }],
    ['montant négatif', { amount: '-5' }],
    ['montant -0', { amount: '-0' }],
    ['montant infini', { amount: 'Infinity' }],
    ['montant NaN', { amount: 'NaN' }],
    ['montant envoyé comme fichier', { amount: new Blob(['12']) }],
    ['date absente', { expenseDate: null }],
    ['date envoyée comme fichier', { expenseDate: new Blob(['2026-10-08']) }],
    ['description absente', { description: null }],
    ['description vide', { description: '' }],
    ["description faite d'espaces", { description: '   ' }],
    ['description envoyée comme fichier', { description: new Blob(['Taxi']) }],
    ['reçu absent', { receipt: null }],
    ['reçu envoyé comme texte', { receipt: 'recu.png' }],
  ])('400 « Champs invalides » : %s', async (_label, overrides) => {
    const { employee } = await createOrg()
    actAs(employee)
    const response = await submit(overrides)
    await expectProblem(response, 400, 'Champs invalides')
    expect(await countRows('expense_notes')).toBe(0)
  })

  it.each(['text/plain', 'image/gif', 'image/svg+xml', 'application/octet-stream'])(
    'reçu %s refusé → 400',
    async (type) => {
      const { employee } = await createOrg()
      actAs(employee)
      const response = await submit({ receipt: receiptFile({ type, name: 'recu.bin' }) })
      await expectProblem(response, 400, 'Type de fichier non autorisé pour le reçu')
    }
  )

  it('vérifie le type avant la taille', async () => {
    const { employee } = await createOrg()
    actAs(employee)
    const response = await submit({
      receipt: receiptFile({ type: 'text/plain', size: MAX_RECEIPT_BYTES + 1 }),
    })
    await expectProblem(response, 400, 'Type de fichier non autorisé pour le reçu')
  })

  it('accepte un reçu de 10 Mo pile', async () => {
    const { employee } = await createOrg()
    actAs(employee)
    const response = await submit({ receipt: receiptFile({ size: MAX_RECEIPT_BYTES }) })
    expect(response.status).toBe(201)
    expect((await headReceipt('receipts/1.png')).ContentLength).toBe(MAX_RECEIPT_BYTES)
  })

  it('refuse un reçu de 10 Mo + 1 octet → 400', async () => {
    const { employee } = await createOrg()
    actAs(employee)
    const response = await submit({ receipt: receiptFile({ size: MAX_RECEIPT_BYTES + 1 }) })
    await expectProblem(response, 400, 'Fichier trop volumineux')
  })

  it('[as-is] accepte un reçu vide de 0 octet', async () => {
    const { employee } = await createOrg()
    actAs(employee)
    expect((await submit({ receipt: receiptFile({ size: 0 }) })).status).toBe(201)
    expect((await headReceipt('receipts/1.png')).ContentLength).toBe(0)
  })

  it('[as-is] accepte un contenu texte déclaré image/png (contenu non vérifié)', async () => {
    const { employee } = await createOrg()
    actAs(employee)
    const response = await submit({
      receipt: receiptFile({ content: "ceci n'est pas une image", type: 'image/png' }),
    })
    expect(response.status).toBe(201)
  })

  it.each<[string, string, number]>([
    ['notation scientifique', '1e3', 1000],
    ['espaces autour', '  12  ', 12],
    ['[as-is] virgule décimale : parseFloat tronque à la virgule', '12,50', 12],
    ['[as-is] suffixe non numérique ignoré par parseFloat', '12abc', 12],
    ['arrondi Postgres à 2 décimales', '12.345', 12.35],
    ['[as-is] 0.001 passe la validation puis est arrondi à 0', '0.001', 0],
    ['plus grand montant de numeric(10,2)', '99999999.99', 99999999.99],
  ])('montant %s (« %s ») → %s', async (_label, amount, expected) => {
    const { employee } = await createOrg()
    actAs(employee)
    const response = await submit({ amount })
    expect(response.status).toBe(201)
    expect((await readJson<NoteDto>(response)).amount).toBe(expected)
  })

  it.each(['1e12', '100000000'])(
    '[as-is] montant %s hors numeric(10,2) → 500 générique',
    async (amount) => {
      const { employee } = await createOrg()
      actAs(employee)
      const response = await submit({ amount })
      await expectProblem(response, 500, 'Erreur interne')
      expect(await countRows('expense_notes')).toBe(0)
    }
  )

  it.each<[string, string, string]>([
    ['ISO', '2026-10-08', '2026-10-08'],
    ['future (acceptée)', '2099-12-31', '2099-12-31'],
    ['[as-is] jj/mm/aaaa lu en mm/jj/aaaa (DateStyle ISO, MDY)', '08/10/2026', '2026-08-10'],
  ])('date %s : « %s » → %s', async (_label, expenseDate, stored) => {
    const { employee } = await createOrg()
    actAs(employee)
    const dto = await readJson<NoteDto>(await submit({ expenseDate }))
    expect(dto.expenseDate).toBe(stored)
  })

  it.each(['31/02/2026', '2026-13-45', 'hier', ''])(
    "[as-is] date « %s » non validée par l'app → 500 Postgres",
    async (expenseDate) => {
      const { employee } = await createOrg()
      actAs(employee)
      const response = await submit({ expenseDate })
      await expectProblem(response, 500, 'Erreur interne')
      expect(await countRows('expense_notes')).toBe(0)
    }
  )

  it('corps JSON au lieu de multipart → 400', async () => {
    const { employee } = await createOrg()
    actAs(employee)
    const response = await POST(jsonBody('/api/expense-notes', 'POST', { amount: 42.5 }))
    await expectProblem(response, 400, 'Corps de requête invalide')
  })

  it('corps vide sans Content-Type → 400', async () => {
    const { employee } = await createOrg()
    actAs(employee)
    const response = await POST(request('/api/expense-notes', { method: 'POST' }))
    await expectProblem(response, 400, 'Corps de requête invalide')
  })

  it('multipart malformé → 400', async () => {
    const { employee } = await createOrg()
    actAs(employee)
    const response = await POST(
      request('/api/expense-notes', {
        method: 'POST',
        body: 'pas du multipart',
        headers: { 'content-type': 'multipart/form-data; boundary=xyz' },
      })
    )
    await expectProblem(response, 400, 'Corps de requête invalide')
  })

  it('formulaire urlencoded (sans fichier possible) → 400', async () => {
    const { employee } = await createOrg()
    actAs(employee)
    const response = await POST(
      request('/api/expense-notes', {
        method: 'POST',
        body: new URLSearchParams({ amount: '42.5', expenseDate: '2026-10-08', description: 'Taxi' }),
      })
    )
    await expectProblem(response, 400, 'Champs invalides')
  })

  it("session d'un utilisateur supprimé → 401", async () => {
    actAsGhost('employee')
    const response = await submit()
    await expectProblem(response, 401, 'Unauthorized')
    expect(await countRows('expense_notes')).toBe(0)
  })
})
