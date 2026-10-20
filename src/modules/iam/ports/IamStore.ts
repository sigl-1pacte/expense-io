import type { Actor, Role } from '@/shared/actor'
import type { OrgMember } from '../domain/ApprovalPolicy'

export interface Credentials {
  id: string
  email: string
  passwordHash: string
  role: Role
}

export interface DirectoryUser {
  id: string
  name: string
  email: string
  role: 'employee' | 'manager'
  managerId: string | null
}

export interface Contact {
  name: string
  email: string
}

export interface NewAccount {
  name: string
  email: string
  passwordHash: string
  domain: string
  companyName: string
}

/** Organigramme de l'entreprise de l'acteur, dans une transaction scopée. */
export interface OrgChart {
  /** Sérialise les modifications d'organigramme de l'entreprise jusqu'à la fin de la transaction. */
  lock(): Promise<void>
  members(): Promise<OrgMember[]>
  directory(): Promise<DirectoryUser[]>
  setManager(targetId: string, managerId: string | null): Promise<DirectoryUser>
  contact(userId: string): Promise<Contact | null>
}

export interface IamStore {
  findActor(userId: string): Promise<Actor | null>
  credentialsFor(email: string): Promise<Credentials | null>
  /** Lève `EmailAlreadyUsed` si l'email existe déjà. */
  createAccount(account: NewAccount): Promise<void>
  withOrgChart<T>(actor: Actor, fn: (org: OrgChart) => Promise<T>): Promise<T>
}
