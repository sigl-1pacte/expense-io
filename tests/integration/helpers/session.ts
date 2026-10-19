import { randomUUID } from 'node:crypto'
import type { Session } from 'next-auth'
import type { Mock } from 'vitest'
import { auth, signIn, signOut } from '@/lib/auth'
import type { Org, Role, UserRow } from '../../support/factories'

// `@/lib/auth` est mocké dans tests/integration/setup.ts.
export const authMock = auth as unknown as Mock<() => Promise<Session | null>>
export const signInMock = signIn as unknown as Mock<(...args: unknown[]) => Promise<unknown>>
export const signOutMock = signOut as unknown as Mock<(...args: unknown[]) => Promise<unknown>>

export type Caller = 'anonymous' | Role

const EXPIRES = '2999-01-01T00:00:00.000Z'

/** Session JWT simulée : le rôle vient du jeton, pas de la base (comme en production). */
export function actAs(user: Pick<UserRow, 'id' | 'email' | 'role'>, role: Role = user.role): void {
  authMock.mockResolvedValue({ user: { id: user.id, email: user.email, role }, expires: EXPIRES })
}

export function actAsAnonymous(): void {
  authMock.mockResolvedValue(null)
}

/** Session valide dont l'utilisateur n'existe pas (ou plus) en base. */
export function actAsGhost(role: Role): string {
  const id = randomUUID()
  authMock.mockResolvedValue({ user: { id, email: 'fantome@ghost.test', role }, expires: EXPIRES })
  return id
}

export function actAsCaller(org: Org, caller: Caller): void {
  if (caller === 'anonymous') {
    actAsAnonymous()
    return
  }
  actAs({ employee: org.employee, manager: org.manager, hr_admin: org.hr }[caller])
}
