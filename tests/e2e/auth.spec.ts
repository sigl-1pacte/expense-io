import { expect, test } from '@playwright/test'
import { createOrg, uniqueId } from '../support/factories'
import { alertMessage, closeContexts, loginAs, newPage, signup } from './helpers'

test.afterEach(closeContexts)

test.describe('inscription', () => {
  test("le premier inscrit d'un domaine devient RH, le suivant employé", async ({ page, browser }) => {
    const domain = `e2e-${uniqueId()}.test`
    await signup(page, 'Rita', `rita@${domain}`)
    await page.waitForURL('**/expenses')
    await expect(page.getByRole('heading', { name: 'Mes notes de frais' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'RH', exact: true })).toBeVisible()

    const second = await newPage(browser)
    await signup(second, 'Paul', `paul@${domain}`)
    await second.waitForURL('**/expenses')
    await expect(second.getByRole('button', { name: 'Se déconnecter' })).toBeVisible()
    await expect(second.getByRole('link', { name: 'RH', exact: true })).toHaveCount(0)
    await expect(second.getByRole('link', { name: 'Manager', exact: true })).toHaveCount(0)
  })

  test('refuse un email déjà utilisé', async ({ page }) => {
    const { employee } = await createOrg()
    await signup(page, 'Doublon', employee.email)
    await expect(alertMessage(page, 'Un compte existe déjà avec cet email.')).toBeVisible()
    await expect(page).toHaveURL(/\/signup$/)
  })
})

test.describe('connexion', () => {
  test('mauvais mot de passe : message générique, reste sur /login', async ({ page }) => {
    const { employee } = await createOrg()
    await page.goto('/login')
    await page.getByLabel('Email', { exact: true }).fill(employee.email)
    await page.getByLabel('Mot de passe', { exact: true }).fill('mauvais-mot-de-passe')
    await page.getByRole('button', { name: 'Se connecter' }).click()
    await expect(alertMessage(page, 'Email ou mot de passe incorrect.')).toBeVisible()
    await expect(page).toHaveURL(/\/login$/)
  })

  test('email inconnu : même message générique', async ({ page }) => {
    await page.goto('/login')
    await page.getByLabel('Email', { exact: true }).fill(`inconnu@e2e-${uniqueId()}.test`)
    await page.getByLabel('Mot de passe', { exact: true }).fill('peu-importe')
    await page.getByRole('button', { name: 'Se connecter' }).click()
    await expect(alertMessage(page, 'Email ou mot de passe incorrect.')).toBeVisible()
  })

  test('navigation selon le rôle : Manager pour un manager, RH pour une RH', async ({ browser }) => {
    const org = await createOrg()
    const managerPage = await loginAs(browser, org.manager)
    await expect(managerPage.getByRole('link', { name: 'Manager', exact: true })).toBeVisible()
    await expect(managerPage.getByRole('link', { name: 'RH', exact: true })).toHaveCount(0)
    const hrPage = await loginAs(browser, org.hr)
    await expect(hrPage.getByRole('link', { name: 'RH', exact: true })).toBeVisible()
    await expect(hrPage.getByRole('link', { name: 'Manager', exact: true })).toHaveCount(0)
  })

  test('déconnexion : retour à /login, pages protégées refermées', async ({ browser }) => {
    const page = await loginAs(browser, (await createOrg()).employee)
    // Clic après stabilisation de la page, comme un utilisateur réel. Cliquer
    // pendant les préchargements Next (lien « / » de l'en-tête) recrée la
    // session : la requête part avec l'ancien cookie et le proxy Auth.js
    // réémet un jeton. Course non déterministe, donc non figée ici.
    await page.waitForLoadState('networkidle')
    await page.getByRole('button', { name: 'Se déconnecter' }).click()
    await page.waitForURL('**/login')
    await page.goto('/expenses')
    await expect(page).toHaveURL(/\/login$/)
  })

  test("utilisateur connecté sur l'accueil : redirigé vers /expenses", async ({ browser }) => {
    const page = await loginAs(browser, (await createOrg()).employee)
    await page.goto('/')
    await expect(page).toHaveURL(/\/expenses$/)
  })
})

test.describe('pages protégées', () => {
  for (const path of ['/expenses', '/manager', '/hr']) {
    test(`${path} en anonyme → /login`, async ({ page }) => {
      await page.goto(path)
      await expect(page).toHaveURL(/\/login$/)
    })
  }

  test('[as-is] un employé connecté voit /manager et /hr avec un simple message de refus', async ({ browser }) => {
    const page = await loginAs(browser, (await createOrg()).employee)
    await page.goto('/manager')
    await expect(page.getByRole('heading', { name: 'Accès réservé aux managers' })).toBeVisible()
    await page.goto('/hr')
    await expect(page.getByRole('heading', { name: 'Accès réservé aux RH' })).toBeVisible()
  })

  test('[as-is] un manager connecté voit /hr avec un simple message de refus', async ({ browser }) => {
    const page = await loginAs(browser, (await createOrg()).manager)
    await page.goto('/hr')
    await expect(page.getByRole('heading', { name: 'Accès réservé aux RH' })).toBeVisible()
  })
})
