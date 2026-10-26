import { expect, test } from '@playwright/test'
import { createNote, createOrg } from '../support/factories'
import { mailText, waitForMail } from '../support/mailpit'
import { closeContexts, loginAs } from './helpers'

test.afterEach(closeContexts)

test("le manager approuve : l'employé reçoit l'e-mail dans Mailpit (F15)", async ({ browser }) => {
  const org = await createOrg()
  await createNote({ user: org.employee, description: 'Note e-mail E2E', amount: 42.5 })
  const page = await loginAs(browser, org.manager)
  await page.goto('/manager')
  const row = page.getByRole('row', { name: /Note e-mail E2E/ })
  await row.getByRole('button', { name: 'Approuver' }).click()
  await expect(row).toHaveCount(0)

  const mail = await waitForMail(org.employee.email)
  expect(mail.Subject).toBe('Votre note de frais a été approuvée')
})

test('le manager rejette avec un commentaire : visible dans la liste de l’employé et dans l’e-mail', async ({ browser }) => {
  const org = await createOrg()
  await createNote({ user: org.employee, description: 'Note commentaire E2E', amount: 12 })
  const managerPage = await loginAs(browser, org.manager)
  await managerPage.goto('/manager')
  const row = managerPage.getByRole('row', { name: /Note commentaire E2E/ })
  await row.getByRole('textbox').fill('Merci de joindre la facture.')
  await row.getByRole('button', { name: 'Rejeter' }).click()
  await expect(row).toHaveCount(0)

  const mail = await waitForMail(org.employee.email)
  expect(mail.Subject).toBe('Votre note de frais a été refusée')
  expect(await mailText(mail.ID)).toContain('Commentaire de votre validateur : Merci de joindre la facture.')

  const employeePage = await loginAs(browser, org.employee)
  await employeePage.goto('/expenses')
  await expect(employeePage.getByText('Validateur : Merci de joindre la facture.')).toBeVisible()
})
