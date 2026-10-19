import { expect, test } from '@playwright/test'
import { createNote, createOrg } from '../support/factories'
import { closeContexts, loginAs, submitNote } from './helpers'

test.afterEach(closeContexts)

test("l'employé soumet, le manager ouvre le reçu et approuve, l'employé voit « approuvée »", async ({ browser }) => {
  const org = await createOrg()
  const employeePage = await loginAs(browser, org.employee)
  await submitNote(employeePage, { amount: '18.90', date: '2026-10-07', description: 'Déjeuner client E2E' })
  await expect(employeePage.getByRole('row', { name: /Déjeuner client E2E/ })).toContainText('en attente')

  const managerPage = await loginAs(browser, org.manager)
  await managerPage.getByRole('link', { name: 'Manager', exact: true }).click()
  await expect(managerPage.getByRole('heading', { name: 'Validation des notes de frais' })).toBeVisible()
  const row = managerPage.getByRole('row', { name: /Déjeuner client E2E/ })
  await expect(row).toContainText(/18,90\s€/)
  const popupPromise = managerPage.context().waitForEvent('page')
  await row.getByRole('button', { name: 'Voir le reçu' }).click()
  const popup = await popupPromise
  await popup.waitForLoadState()
  expect(popup.url()).toContain('/receipts-e2e/receipts/')
  await row.getByRole('button', { name: 'Approuver' }).click()
  await expect(managerPage.getByText('Aucune note en attente.')).toBeVisible()

  await employeePage.reload()
  await expect(employeePage.getByRole('row', { name: /Déjeuner client E2E/ })).toContainText('approuvée')
})

test("le manager rejette, l'employé voit « rejetée »", async ({ browser }) => {
  const org = await createOrg()
  await createNote({ user: org.employee, description: 'Hôtel E2E', amount: 120 })
  const managerPage = await loginAs(browser, org.manager)
  await managerPage.goto('/manager')
  await managerPage.getByRole('row', { name: /Hôtel E2E/ }).getByRole('button', { name: 'Rejeter' }).click()
  await expect(managerPage.getByText('Aucune note en attente.')).toBeVisible()

  const employeePage = await loginAs(browser, org.employee)
  await expect(employeePage.getByRole('row', { name: /Hôtel E2E/ })).toContainText('rejetée')
})

test("la RH approuve la note d'un manager racine", async ({ browser }) => {
  const org = await createOrg()
  await createNote({ user: org.manager, description: 'Train E2E', amount: 75 })
  const hrPage = await loginAs(browser, org.hr)
  await hrPage.getByRole('link', { name: 'RH', exact: true }).click()
  await expect(hrPage.getByRole('heading', { name: 'Notes des managers racine en attente (1)' })).toBeVisible()
  const row = hrPage.getByRole('row', { name: /Train E2E/ })
  await expect(row).toContainText('Marc Manager')
  await row.getByRole('button', { name: 'Approuver' }).click()
  await expect(hrPage.getByRole('heading', { name: 'Notes des managers racine en attente (0)' })).toBeVisible()

  const managerPage = await loginAs(browser, org.manager)
  await expect(managerPage.getByRole('row', { name: /Train E2E/ })).toContainText('approuvée')
})
