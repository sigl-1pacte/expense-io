import { afterAll, afterEach, beforeEach, vi } from 'vitest'
import { closeTestDb, truncateAll } from '../support/db'
import { TEST_ENV } from '../support/env'
import { emptyBucket } from '../support/infra'

// Posé avant l'import de chaque fichier de test : src/lib/storage.ts lit
// S3_BUCKET au chargement du module.
Object.assign(process.env, TEST_ENV)

// La session est la seule frontière mockée pour toute la suite d'intégration :
// chaque test choisit son identité avec helpers/session.ts.
vi.mock('@/lib/auth', () => ({
  auth: vi.fn(),
  signIn: vi.fn(),
  signOut: vi.fn(),
  handlers: {},
}))

beforeEach(async () => {
  vi.resetAllMocks()
  // problemResponse (via route()) et l'OCR loguent chaque erreur : sortie de test lisible.
  vi.spyOn(console, 'error').mockImplementation(() => {})
  await Promise.all([truncateAll(), emptyBucket(TEST_ENV)])
})

afterEach(() => {
  vi.restoreAllMocks()
})

afterAll(async () => {
  await closeTestDb()
  // Pool de l'application (src/lib/db.ts), créé à la demande par getPool().
  await global.__pgPool?.end()
  global.__pgPool = undefined
})
