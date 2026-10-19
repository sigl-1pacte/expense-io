// F4 : un domaine de messagerie publique ne fonde jamais d'entreprise ; sinon
// le premier inscrit en @gmail.com deviendrait RH de tous les comptes Gmail.
export const PUBLIC_EMAIL_DOMAINS: readonly string[] = [
  'gmail.com', 'googlemail.com', 'outlook.com', 'outlook.fr', 'hotmail.com', 'hotmail.fr',
  'live.com', 'live.fr', 'yahoo.com', 'yahoo.fr', 'icloud.com', 'me.com', 'proton.me',
  'protonmail.com', 'gmx.com', 'gmx.fr', 'free.fr', 'orange.fr', 'laposte.net', 'wanadoo.fr', 'sfr.fr',
]

export function isPublicEmailDomain(domain: string): boolean {
  return PUBLIC_EMAIL_DOMAINS.includes(domain.toLowerCase())
}

export function companyNameFor(domain: string): string {
  return domain.split('.')[0]
}
