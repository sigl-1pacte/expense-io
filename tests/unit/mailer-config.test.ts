import { describe, expect, it } from 'vitest'
import { loadMailerConfig } from '@/shared/config'

const BASE = {
  MAILER_DATABASE_URL: 'postgres://expense_mailer:x@localhost/db',
  SMTP_HOST: 'localhost',
  SMTP_PORT: '1025',
  MAIL_FROM: 'Expense.io <no-reply@expense.io>',
}

describe('loadMailerConfig', () => {
  it('valeurs par défaut de la spec', () => {
    expect(loadMailerConfig(BASE)).toMatchObject({
      batchSize: 5,
      leaseSeconds: 120,
      connectionTimeoutMs: 5000,
      greetingTimeoutMs: 5000,
      socketTimeoutMs: 10000,
      purgeAfterDays: 30,
    })
  })

  it('refuse un bail plus court que le pire cas d’un lot', () => {
    expect(() => loadMailerConfig({ ...BASE, MAIL_BATCH_SIZE: '20', MAIL_LEASE_SECONDS: '60' })).toThrow(
      'MAIL_LEASE_SECONDS (60 s) doit dépasser le pire cas d’un lot (400 s)'
    )
  })

  it('le pire cas d’un lot compte connexion + accueil + socket (P3-R12)', () => {
    // 5 × (5 + 5 + 10) = 100 s : 100 s est refusé, 101 s passe.
    expect(() => loadMailerConfig({ ...BASE, MAIL_LEASE_SECONDS: '100' })).toThrow('(100 s)')
    expect(loadMailerConfig({ ...BASE, MAIL_LEASE_SECONDS: '101' }).leaseSeconds).toBe(101)
  })

  it('exige MAILER_DATABASE_URL, SMTP_HOST et MAIL_FROM', () => {
    expect(() => loadMailerConfig({ ...BASE, MAILER_DATABASE_URL: '' })).toThrow('MAILER_DATABASE_URL')
    expect(() => loadMailerConfig({ ...BASE, SMTP_HOST: '' })).toThrow('SMTP_HOST')
    expect(() => loadMailerConfig({ ...BASE, MAIL_FROM: '' })).toThrow('MAIL_FROM')
  })

  it.each([
    ['SMTP_PORT', 'abc'],
    ['MAIL_BATCH_SIZE', '0'],
    ['MAIL_LEASE_SECONDS', '-5'],
    ['SMTP_CONNECTION_TIMEOUT_MS', 'NaN'],
    ['SMTP_GREETING_TIMEOUT_MS', '0'],
    ['SMTP_SOCKET_TIMEOUT_MS', '1.5'],
    ['MAIL_POLL_INTERVAL_MS', '-1'],
    ['MAIL_PURGE_AFTER_DAYS', 'trente'],
  ])('refuse %s = %s (entier strictement positif attendu)', (name, value) => {
    expect(() => loadMailerConfig({ ...BASE, [name]: value })).toThrow(name)
  })
})
