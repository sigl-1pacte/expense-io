export interface PasswordHasher {
  hash(password: string): Promise<string>
  matches(password: string, hash: string): Promise<boolean>
}
