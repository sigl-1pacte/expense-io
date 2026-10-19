import type { Browser, BrowserContext, Locator, Page } from '@playwright/test'
import { BASE_URL } from '../support/env'
import { TEST_PASSWORD, type UserRow } from '../support/factories'
import { PNG_BYTES } from '../support/fixtures'

// Options passées explicitement : un contexte créé à la main ne doit pas
// dépendre de l'héritage de la config.
export const CONTEXT_OPTIONS = { baseURL: BASE_URL, locale: 'fr-FR', timezoneId: 'Europe/Paris' }

const openContexts: BrowserContext[] = []

/** Page dans un contexte isolé (cookies propres). Fermée par closeContexts(). */
export async function newPage(browser: Browser): Promise<Page> {
  const context = await browser.newContext(CONTEXT_OPTIONS)
  openContexts.push(context)
  return context.newPage()
}

export async function closeContexts(): Promise<void> {
  await Promise.all(openContexts.splice(0).map((context) => context.close()))
}

/** Connexion par le vrai formulaire de login, dans un contexte isolé. */
export async function loginAs(browser: Browser, user: Pick<UserRow, 'email'>): Promise<Page> {
  const page = await newPage(browser)
  await page.goto('/login')
  await page.getByLabel('Email', { exact: true }).fill(user.email)
  await page.getByLabel('Mot de passe', { exact: true }).fill(TEST_PASSWORD)
  await page.getByRole('button', { name: 'Se connecter' }).click()
  await page.waitForURL('**/expenses')
  return page
}

/**
 * Message d'erreur de l'application (role="alert"). Next ajoute un annonceur
 * de route qui porte aussi ce rôle : on filtre sur le texte attendu.
 */
export function alertMessage(page: Page, text: string): Locator {
  return page.getByRole('alert').filter({ hasText: text })
}

export async function signup(page: Page, name: string, email: string, password = 'motdepasse-e2e'): Promise<void> {
  await page.goto('/signup')
  await page.getByLabel('Nom', { exact: true }).fill(name)
  await page.getByLabel('Email', { exact: true }).fill(email)
  await page.getByLabel('Mot de passe', { exact: true }).fill(password)
  await page.getByRole('button', { name: "S'inscrire" }).click()
}

export async function submitNote(
  page: Page,
  note: {
    amount: string
    date: string
    description: string
    file?: { name: string; mimeType: string; buffer: Buffer }
  }
): Promise<void> {
  await page.getByLabel('Montant (€)', { exact: true }).fill(note.amount)
  await page.getByLabel('Date', { exact: true }).fill(note.date)
  await page.getByLabel('Description', { exact: true }).fill(note.description)
  await page
    .getByLabel('Reçu (image ou PDF)', { exact: true })
    .setInputFiles(note.file ?? { name: 'recu.png', mimeType: 'image/png', buffer: Buffer.from(PNG_BYTES) })
  await page.getByRole('button', { name: 'Soumettre' }).click()
}
