// Configuration lue une fois depuis l'environnement, validée au premier usage.
// Aucun secret dans le code (F25).
export interface AppConfig {
  authSecret: string
}

type Env = Record<string, string | undefined>

const MIN_SECRET_LENGTH = 32

export function loadConfig(env: Env = process.env): AppConfig {
  const authSecret = env.AUTH_SECRET ?? ''
  if (authSecret.length < MIN_SECRET_LENGTH) {
    throw new Error(`AUTH_SECRET manquant ou trop court (${MIN_SECRET_LENGTH} caractères minimum)`)
  }
  return { authSecret }
}

let cached: AppConfig | undefined

export function config(): AppConfig {
  cached ??= loadConfig()
  return cached
}
