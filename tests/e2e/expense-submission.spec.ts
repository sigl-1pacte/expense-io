import { expect, test } from '@playwright/test'
import { createOrg } from '../support/factories'
import { alertMessage, closeContexts, loginAs, submitNote } from './helpers'

test.afterEach(closeContexts)

test('soumet une note : elle apparaît en attente dans l’historique', async ({ browser }) => {
  const page = await loginAs(browser, (await createOrg()).employee)
  await expect(page.getByText('Aucune note de frais pour le moment.')).toBeVisible()
  await submitNote(page, { amount: '42.50', date: '2026-10-08', description: 'Taxi E2E' })
  const row = page.getByRole('row', { name: /Taxi E2E/ })
  await expect(row).toContainText('en attente')
  await expect(row).toContainText(/42,50\s€/)
  await expect(row).toContainText('8 oct. 2026')
  await expect(page.getByText(/1 note · 42,50\s€ au total/)).toBeVisible()
})

test('ouvre le reçu dans un nouvel onglet via une URL présignée', async ({ browser }) => {
  const page = await loginAs(browser, (await createOrg()).employee)
  await submitNote(page, { amount: '12', date: '2026-10-08', description: 'Parking E2E' })
  const row = page.getByRole('row', { name: /Parking E2E/ })
  const popupPromise = page.context().waitForEvent('page')
  await row.getByRole('button', { name: 'Voir le reçu' }).click()
  const popup = await popupPromise
  await popup.waitForLoadState()
  expect(popup.url()).toContain('/receipts-e2e/receipts/')
  expect(popup.url()).toContain('X-Amz-Expires=300')
  const response = await page.request.get(popup.url())
  expect(response.status()).toBe(200)
  expect(response.headers()['content-type']).toBe('image/png')
})

test('affiche l’erreur renvoyée par le serveur', async ({ browser }) => {
  const page = await loginAs(browser, (await createOrg()).employee)
  await submitNote(page, {
    amount: '10',
    date: '2026-10-08',
    description: 'Mauvais fichier E2E',
    file: { name: 'note.txt', mimeType: 'text/plain', buffer: Buffer.from('texte') },
  })
  await expect(alertMessage(page, 'Type de fichier non autorisé pour le reçu')).toBeVisible()
  await expect(page.getByText('Aucune note de frais pour le moment.')).toBeVisible()
})

test('le navigateur bloque un formulaire incomplet', async ({ browser }) => {
  const page = await loginAs(browser, (await createOrg()).employee)
  await page.getByRole('button', { name: 'Soumettre' }).click()
  const amount = page.getByLabel('Montant (€)', { exact: true })
  expect(await amount.evaluate((input) => (input as HTMLInputElement).validity.valueMissing)).toBe(true)
  await expect(page.getByText('Aucune note de frais pour le moment.')).toBeVisible()
})
