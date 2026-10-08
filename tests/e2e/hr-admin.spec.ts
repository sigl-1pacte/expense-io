import { expect, test } from '@playwright/test'
import { createNote, createOrg, createUser, findUser } from '../support/factories'
import { closeContexts, loginAs } from './helpers'

test.afterEach(closeContexts)

test('la RH rattache un nouvel employé : son manager voit désormais ses notes', async ({ browser }) => {
  const org = await createOrg()
  const newcomer = await createUser({ company: org.company, name: 'Paul Nouveau' })
  await createNote({ user: newcomer, description: 'Note de Paul E2E' })

  const managerPage = await loginAs(browser, org.manager)
  await managerPage.goto('/manager')
  await expect(managerPage.getByText('Aucune note en attente.')).toBeVisible()

  const hrPage = await loginAs(browser, org.hr)
  await hrPage.goto('/hr')
  await expect(hrPage.getByRole('heading', { name: 'Organigramme (3)' })).toBeVisible()
  const select = hrPage.getByRole('row', { name: /Paul Nouveau/ }).getByRole('combobox')
  await expect(select).toHaveValue('')
  const saved = hrPage.waitForResponse(
    (response) =>
      response.url().endsWith(`/api/hr/users/${newcomer.id}/manager`) && response.request().method() === 'PUT'
  )
  await select.selectOption({ label: 'Marc Manager' })
  expect((await saved).status()).toBe(200)
  await expect(select).toHaveValue(org.manager.id)

  await managerPage.reload()
  await expect(managerPage.getByRole('row', { name: /Note de Paul E2E/ })).toBeVisible()
})

test('la RH détache un employé de son manager', async ({ browser }) => {
  const org = await createOrg()
  const hrPage = await loginAs(browser, org.hr)
  await hrPage.goto('/hr')
  const select = hrPage.getByRole('row', { name: /Emma Employée/ }).getByRole('combobox')
  await expect(select).toHaveValue(org.manager.id)
  const saved = hrPage.waitForResponse(
    (response) => response.url().endsWith(`/api/hr/users/${org.employee.id}/manager`)
  )
  await select.selectOption({ label: '— aucun (racine) —' })
  expect((await saved).status()).toBe(200)
  await expect(select).toHaveValue('')
  expect((await findUser(org.employee.id))?.manager_id).toBeNull()
})

test("l'organigramme ne liste pas les RH", async ({ browser }) => {
  const org = await createOrg()
  const hrPage = await loginAs(browser, org.hr)
  await hrPage.goto('/hr')
  // Manager et employé seulement. (Pas de sélecteur `row /Marc Manager/` :
  // la ligne d'Emma le contient aussi, via la valeur de sa liste déroulante.)
  await expect(hrPage.getByRole('heading', { name: 'Organigramme (2)' })).toBeVisible()
  await expect(hrPage.getByText('Rita RH')).toHaveCount(0)
})
