import { describe, expect, it } from 'vitest'
import { companyNameFor, isPublicEmailDomain } from '@/modules/iam/domain/Company'

describe('isPublicEmailDomain (F4)', () => {
  it.each([
    'gmail.com', 'googlemail.com', 'outlook.com', 'outlook.fr', 'hotmail.com', 'hotmail.fr', 'live.com',
    'live.fr', 'yahoo.com', 'yahoo.fr', 'icloud.com', 'me.com', 'proton.me', 'protonmail.com', 'gmx.com',
    'gmx.fr', 'free.fr', 'orange.fr', 'laposte.net', 'wanadoo.fr', 'sfr.fr', 'GMAIL.COM',
  ])('%s est public', (domain) => {
    expect(isPublicEmailDomain(domain)).toBe(true)
  })

  it.each(['acme.fr', 'expense.io', 'epita.fr', 'mail.acme.com'])('%s ne l’est pas', (domain) => {
    expect(isPublicEmailDomain(domain)).toBe(false)
  })
})

describe('companyNameFor', () => {
  it('prend le premier segment du domaine', () => {
    expect(companyNameFor('acme.fr')).toBe('acme')
  })
})
