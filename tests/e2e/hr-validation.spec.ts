import { expect, test } from '@playwright/test'
import { createNote, createOrg, createUser } from '../support/factories'
import { closeContexts, loginAs } from './helpers'

test.afterEach(closeContexts)

test("la RH voit l'employé non rattaché signalé et valide sa note (F33)", async ({ browser }) => {
  const org = await createOrg()
  const loose = await createUser({ company: org.company, name: 'Léa Libre' })
  await createNote({ user: loose, description: 'Note de Léa E2E' })

  const hrPage = await loginAs(browser, org.hr)
  await hrPage.goto('/hr')
  await expect(hrPage.getByRole('status')).toContainText('1 employé sans manager')
  await expect(hrPage.getByRole('row', { name: /Léa Libre/ }).getByText('Sans manager')).toBeVisible()

  const row = hrPage.getByRole('row', { name: /Note de Léa E2E/ })
  await expect(row).toBeVisible()
  await row.getByRole('button', { name: 'Approuver' }).click()
  await expect(hrPage.getByRole('heading', { name: 'Notes en attente de validation RH (0)' })).toBeVisible()

  const leaPage = await loginAs(browser, loose)
  await expect(leaPage.getByRole('row', { name: /Note de Léa E2E/ })).toContainText(/approuv/i)
})

test("la note d'une RH arrive chez une autre RH, pas chez elle (F14)", async ({ browser }) => {
  const org = await createOrg()
  const otherHr = await createUser({ company: org.company, role: 'hr_admin', name: 'Hugo RH' })
  await createNote({ user: org.hr, description: 'Note de Rita E2E' })

  const ritaPage = await loginAs(browser, org.hr)
  await ritaPage.goto('/hr')
  await expect(ritaPage.getByRole('heading', { name: 'Notes en attente de validation RH (0)' })).toBeVisible()

  const hugoPage = await loginAs(browser, otherHr)
  await hugoPage.goto('/hr')
  await expect(hugoPage.getByRole('row', { name: /Note de Rita E2E/ })).toContainText('RH')
})
