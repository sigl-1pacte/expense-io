// API publique du module iam : la seule porte d'entrée pour app/ et les autres modules.
import { approveesOf } from './application/approvees-of'
import { assignManager } from './application/assign-manager'
import { authenticate } from './application/authenticate'
import { canDecide } from './application/can-decide'
import { getActor } from './application/get-actor'
import { getContact } from './application/get-contact'
import { listDirectory } from './application/list-directory'
import { signUp } from './application/sign-up'
import { BcryptPasswordHasher } from './infrastructure/BcryptPasswordHasher'
import { PgIamStore } from './infrastructure/PgIamStore'

export type { SignUpResult } from './application/sign-up'
export type { Contact, DirectoryUser } from './ports/IamStore'

const store = new PgIamStore()
const hasher = new BcryptPasswordHasher()

export const iam = {
  getActor: getActor(store),
  authenticate: authenticate(store, hasher),
  signUp: signUp(store, hasher),
  listDirectory: listDirectory(store),
  assignManager: assignManager(store),
  approveesOf: approveesOf(store),
  canDecide: canDecide(store),
  getContact: getContact(store),
}
