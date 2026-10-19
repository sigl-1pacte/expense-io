import path from 'node:path'
import { expect, test } from '@playwright/test'
import { createOrg } from '../support/factories'
import { alertMessage, closeContexts, loginAs } from './helpers'

const RECEIPT_FIXTURE = path.join(process.cwd(), 'tests', 'fixtures', 'receipt.png')

test.afterEach(closeContexts)

test('pré-remplit montant et date avec le vrai Tesseract', async ({ browser }) => {
  // Le premier OCR charge le modèle fra dans le serveur : marge large (CI).
  test.setTimeout(120_000)
  const page = await loginAs(browser, (await createOrg()).employee)
  await page.getByLabel('Reçu (image ou PDF)', { exact: true }).setInputFiles(RECEIPT_FIXTURE)
  await page.getByRole('button', { name: 'Pré-remplir depuis le reçu' }).click()
  await expect(page.getByLabel('Montant (€)', { exact: true })).toHaveValue('42.5', { timeout: 90_000 })
  await expect(page.getByLabel('Date', { exact: true })).toHaveValue('2026-10-08')
})

test("sans reçu sélectionné : message d'erreur", async ({ browser }) => {
  const page = await loginAs(browser, (await createOrg()).employee)
  await page.getByRole('button', { name: 'Pré-remplir depuis le reçu' }).click()
  await expect(alertMessage(page, 'Sélectionne d’abord un reçu.')).toBeVisible()
})

test('PDF : aucune suggestion, message explicite', async ({ browser }) => {
  const page = await loginAs(browser, (await createOrg()).employee)
  await page
    .getByLabel('Reçu (image ou PDF)', { exact: true })
    .setInputFiles({ name: 'recu.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4') })
  await page.getByRole('button', { name: 'Pré-remplir depuis le reçu' }).click()
  await expect(
    page.getByText('Aucune information reconnue sur ce reçu — saisis les champs manuellement.')
  ).toBeVisible()
})
