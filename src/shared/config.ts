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

export interface MailerConfig {
  databaseUrl: string
  smtpHost: string
  smtpPort: number
  mailFrom: string
  batchSize: number
  leaseSeconds: number
  connectionTimeoutMs: number
  greetingTimeoutMs: number
  socketTimeoutMs: number
  pollIntervalMs: number
  purgeAfterDays: number
}

function required(env: Env, name: string): string {
  const value = env[name]
  if (!value) throw new Error(`${name} est requis pour le worker de livraison`)
  return value
}

/** Entier >= 1 ; une valeur absurde ferait échouer la règle du bail en silence (NaN <= x est faux). */
function positiveInt(env: Env, name: string, fallback: number): number {
  const raw = env[name]
  if (!raw) return fallback
  const value = Number(raw)
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${name} doit être un entier strictement positif (reçu « ${raw} »)`)
  }
  return value
}

/** Plafond d'un envoi : connexion + accueil + socket (le délai de socket nodemailer n'est qu'un délai d'inactivité). */
export function sendDeadlineMs(config: Pick<MailerConfig, 'connectionTimeoutMs' | 'greetingTimeoutMs' | 'socketTimeoutMs'>): number {
  return config.connectionTimeoutMs + config.greetingTimeoutMs + config.socketTimeoutMs
}

/** Configuration du worker de livraison, avec la règle du bail (ADR 0003). */
export function loadMailerConfig(env: Env = process.env): MailerConfig {
  const config: MailerConfig = {
    databaseUrl: required(env, 'MAILER_DATABASE_URL'),
    smtpHost: required(env, 'SMTP_HOST'),
    smtpPort: positiveInt(env, 'SMTP_PORT', 1025),
    mailFrom: required(env, 'MAIL_FROM'),
    batchSize: positiveInt(env, 'MAIL_BATCH_SIZE', 5),
    leaseSeconds: positiveInt(env, 'MAIL_LEASE_SECONDS', 120),
    connectionTimeoutMs: positiveInt(env, 'SMTP_CONNECTION_TIMEOUT_MS', 5000),
    greetingTimeoutMs: positiveInt(env, 'SMTP_GREETING_TIMEOUT_MS', 5000),
    socketTimeoutMs: positiveInt(env, 'SMTP_SOCKET_TIMEOUT_MS', 10000),
    pollIntervalMs: positiveInt(env, 'MAIL_POLL_INTERVAL_MS', 1000),
    purgeAfterDays: positiveInt(env, 'MAIL_PURGE_AFTER_DAYS', 30),
  }
  // Sinon un second worker réserverait des lignes encore en cours d'envoi. Le délai
  // dur du worker (sendDeadlineMs) borne chaque envoi à cette somme.
  const worstBatchSeconds = (config.batchSize * sendDeadlineMs(config)) / 1000
  if (config.leaseSeconds <= worstBatchSeconds) {
    throw new Error(
      `MAIL_LEASE_SECONDS (${config.leaseSeconds} s) doit dépasser le pire cas d’un lot (${worstBatchSeconds} s)`
    )
  }
  return config
}

let cached: AppConfig | undefined

export function config(): AppConfig {
  cached ??= loadConfig()
  return cached
}
