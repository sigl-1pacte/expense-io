import bcrypt from 'bcryptjs'
import type { PasswordHasher } from '../ports/PasswordHasher'

export class BcryptPasswordHasher implements PasswordHasher {
  constructor(private readonly cost = 12) {}

  hash(password: string): Promise<string> {
    return bcrypt.hash(password, this.cost)
  }

  matches(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash)
  }
}
