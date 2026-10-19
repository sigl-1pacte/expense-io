import type { Actor } from '@/shared/actor'
import type { OrgMember } from '@/modules/iam/domain/ApprovalPolicy'
import { EmailAlreadyUsed } from '@/modules/iam/domain/errors'
import type { Credentials, DirectoryUser, IamStore, NewAccount, OrgChart } from '@/modules/iam/ports/IamStore'

export interface FakeUser extends OrgMember {
  companyId: string
  name: string
  email: string
  passwordHash: string
}

/** Magasin en mémoire : une liste d'utilisateurs, plusieurs entreprises. */
export class FakeIamStore implements IamStore {
  locks = 0
  constructor(public users: FakeUser[] = []) {}

  async findActor(userId: string): Promise<Actor | null> {
    const user = this.users.find((u) => u.id === userId)
    return user ? { id: user.id, companyId: user.companyId, role: user.role, managerId: user.managerId } : null
  }

  async credentialsFor(email: string): Promise<Credentials | null> {
    const user = this.users.find((u) => u.email === email)
    return user ? { id: user.id, email: user.email, passwordHash: user.passwordHash, role: user.role } : null
  }

  async createAccount(account: NewAccount): Promise<void> {
    if (this.users.some((u) => u.email === account.email)) throw new EmailAlreadyUsed()
    const existing = this.users.find((u) => u.email.endsWith(`@${account.domain}`))
    this.users.push({
      id: `u${this.users.length + 1}`,
      companyId: existing?.companyId ?? account.domain,
      name: account.name,
      email: account.email,
      passwordHash: account.passwordHash,
      role: existing ? 'employee' : 'hr_admin',
      managerId: null,
    })
  }

  async withOrgChart<T>(actor: Actor, fn: (org: OrgChart) => Promise<T>): Promise<T> {
    const company = () => this.users.filter((u) => u.companyId === actor.companyId)
    const toDirectory = (u: FakeUser): DirectoryUser => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role as 'employee' | 'manager',
      managerId: u.managerId,
    })
    return fn({
      lock: async () => {
        this.locks++
      },
      members: async () => company().map(({ id, role, managerId }) => ({ id, role, managerId })),
      directory: async () => company().filter((u) => u.role !== 'hr_admin').map(toDirectory),
      setManager: async (targetId, managerId) => {
        const target = company().find((u) => u.id === targetId)!
        target.managerId = managerId
        return toDirectory(target)
      },
      contact: async (userId) => {
        const user = company().find((u) => u.id === userId)
        return user ? { name: user.name, email: user.email } : null
      },
    })
  }
}

export const fakeHasher = {
  hash: async (password: string) => `hash:${password}`,
  matches: async (password: string, hash: string) => hash === `hash:${password}`,
}

export function user(partial: Partial<FakeUser> & Pick<FakeUser, 'id'>): FakeUser {
  return {
    companyId: 'acme',
    name: partial.id,
    email: `${partial.id}@acme.fr`,
    passwordHash: 'hash:secret',
    role: 'employee',
    managerId: null,
    ...partial,
  }
}
