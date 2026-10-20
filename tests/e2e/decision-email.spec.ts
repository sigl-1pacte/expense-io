import { expect, test } from '@playwright/test'
import { createNote, createOrg } from '../support/factories'
import { waitForMail } from '../support/mailpit'
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
