# Tests de caractérisation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Doter Expense.io d'une suite Vitest (unitaires + intégration sur vrai Postgres/LocalStack) et Playwright (E2E), exécutée en CI GitHub Actions, qui fige le comportement actuel de l'application.

**Architecture:** Les route handlers et server actions sont appelés en mémoire par Vitest, contre une base `expense_io_test` migrée avec les vraies migrations et un bucket LocalStack `receipts-test` ; seuls `@/lib/auth` (session) et `tesseract.js` sont mockés. Playwright pilote un `next build && next start` sur le port 3100 branché sur `expense_io_e2e` / `receipts-e2e`. Aucun fichier de `src/` n'est modifié.

**Tech Stack:** Vitest 5.0.3, @vitest/coverage-v8 5.0.3, @playwright/test 1.64.0, pg, node-pg-migrate 9 (API `runner`), @aws-sdk/client-s3, GitHub Actions (checkout@v7, setup-node@v7, cache@v6, upload-artifact@v7).

**Spec:** `docs/specs/2026-10-08-tests-caracterisation.md`

## Global Constraints

- **Aucune modification de `src/`.** Un test qui échoue ne se corrige jamais en touchant le code applicatif.
- **Règle de caractérisation.** Chaque test doit PASSER contre le code actuel. Si un test échoue : (1) relire le code concerné, (2) reproduire le cas isolément, (3) si le code se comporte autrement que prévu par ce plan, **le code fait foi** — corriger l'attente du test, et préfixer le nom par `[as-is]` si ce comportement contredit une règle attendue. Signaler chaque écart de ce type dans le compte rendu de la tâche.
- Préfixe **`[as-is]`** + référence à `docs/audit/as-is.md` (« audit §N ») pour tout comportement contraire à une règle attendue. Noms de tests en français.
- Ressources dédiées, jamais celles de `make dev` : bases `expense_io_test` (Vitest) et `expense_io_e2e` (Playwright), buckets `receipts-test` et `receipts-e2e`, port E2E **3100**.
- Docker requis pour l'intégration et l'E2E : Postgres sur `localhost:5433`, LocalStack sur `localhost:4567` (`make up` ou `docker compose up -d`).
- `tsconfig.json` inclut `**/*.ts` et `**/*.mts` : tout le code de test doit passer `npm run typecheck` **et** `npm run lint` (pas de `any` explicite, pas de variable inutilisée, **pas de fixtures Playwright personnalisées** — la règle `react-hooks/rules-of-hooks` signale `use(...)`).
- Node 24 en CI (prérequis du README) ; Node 22.20 fonctionne en local.
- Seuils de couverture minimum : lignes ≥ 90 %, branches ≥ 85 %, fonctions ≥ 90 %.
- Commits : `test(ARLA-9): …` (ou `ci(ARLA-9)`, `docs(ARLA-9)`), message terminé par la ligne `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Ne jamais ajouter `docs/audit/` ni `.claude/` (hors périmètre de ce ticket).

## Review Focus

1. **`DATABASE_URL` pointant par erreur sur la base de dev** (`.env`, variable héritée) → les helpers doivent refuser de vider une base qui ne finit pas par `_test` ou `_e2e`, au lieu d'effacer les données de `make dev`. Test : `tests/unit/test-db-guard.test.ts` (Task 3).
2. **Fuseau horaire de la machine** (UTC en CI, Europe/Paris en local) → mêmes résultats partout. Tests : `TZ=UTC` dans les projets Vitest (Task 1) et DTO d'une note créée à 23 h 30 UTC (Task 4) ; `timezoneId: 'Europe/Paris'` côté Playwright (Task 12).
3. **Deuxième lancement sur une base et un bucket déjà initialisés** → les global setups doivent être idempotents. Test : Task 3 relance la suite d'intégration deux fois de suite.
4. **Chemin du projet contenant des espaces** (`…/Louis BERTRAND/…` sous Windows) → migrations et fixtures trouvées. Tests : chemins construits avec `path.join(process.cwd(), …)` / `fileURLToPath`, suite lancée localement depuis ce chemin (Tasks 3 et 14).
5. **Premier OCR Tesseract lent (chargement du modèle, CI)** → pas de faux échec par timeout. Test : `test.setTimeout(120_000)` et attente de 90 s sur le champ montant dans `ocr-suggestion.spec.ts` (Task 14).

---

## Structure des fichiers

| Fichier | Responsabilité |
|---|---|
| `vitest.config.mts` | projets `unit` et `integration`, alias `@`, couverture |
| `playwright.config.ts` | serveur Next de prod sur 3100, Chromium, rapports |
| `tests/support/env.ts` | URLs, noms de bases et de buckets de test (partagé Vitest/Playwright) |
| `tests/support/db.ts` | pool de test, garde-fou `assertTestDatabase`, `truncateAll` |
| `tests/support/infra.ts` | création de base, migrations, bucket, client S3 |
| `tests/support/factories.ts` | `createCompany` / `createUser` / `createNote` / `createOrg`, lecteurs |
| `tests/support/fixtures.ts` | `PNG_BYTES` |
| `tests/unit/*.test.ts` | tests sans I/O |
| `tests/integration/global-setup.ts`, `setup.ts` | préparation unique, mock de session, vidage entre tests |
| `tests/integration/helpers/{http,session,s3}.ts` | requêtes, sessions simulées, vérifications S3 |
| `tests/integration/{api,actions,lib}/*.test.ts`, `workflow.test.ts` | tests d'intégration |
| `tests/e2e/global-setup.ts`, `helpers.ts`, `*.spec.ts` | E2E |
| `tests/fixtures/receipt.{html,png}`, `scripts/generate-receipt-fixture.mjs` | ticket pour l'OCR réel |
| `scripts/coverage-summary.mjs` | tableau de couverture pour le résumé du job CI |
| `.github/workflows/tests.yml` | CI |

---

### Task 1: Outillage Vitest et premiers tests unitaires

**Files:**
- Modify: `package.json` (devDependencies, scripts)
- Modify: `.gitignore`
- Modify: `eslint.config.mjs`
- Create: `vitest.config.mts`
- Test: `tests/unit/errors.test.ts`, `tests/unit/storage.test.ts`

**Interfaces:**
- Consumes: `respondError(error: unknown): Response` (`src/lib/errors.ts`), `receiptKeyFor(receiptSeq: number, extension: string): string` (`src/lib/storage.ts`).
- Produces: projet Vitest `unit` (`include: tests/unit/**/*.test.ts`, `env.TZ = 'UTC'`), alias `@` → `src`, scripts `npm test` et `npm run test:unit`.

- [ ] **Step 1: Installer Vitest**

```bash
npm install -D vitest@^5.0.3
```

- [ ] **Step 2: Ajouter les scripts**

```bash
npm pkg set scripts.test="vitest run" scripts.test:unit="vitest run --project unit"
```

- [ ] **Step 3: Ignorer les artefacts de test** — ajouter à la fin de `.gitignore` :

```gitignore

# tests
/coverage
/playwright-report
/test-results
/blob-report
/playwright/.cache
```

- [ ] **Step 4: Exclure ces artefacts du lint** — dans `eslint.config.mjs`, compléter `globalIgnores` :

```js
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Artefacts de tests (rapports HTML/JS générés).
    "coverage/**",
    "playwright-report/**",
    "test-results/**",
    "blob-report/**",
  ]),
```

- [ ] **Step 5: Créer `vitest.config.mts`**

```ts
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: ['tests/unit/**/*.test.ts'],
          environment: 'node',
          // Même fuseau en local et en CI.
          env: { TZ: 'UTC' },
        },
      },
    ],
  },
})
```

- [ ] **Step 6: Écrire `tests/unit/errors.test.ts`**

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { respondError } from '@/lib/errors'

describe('respondError', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("[as-is] renvoie une 500 avec le message et la stack d'une Error (audit §4)", async () => {
    const error = new Error('boum')
    const response = respondError(error)
    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ error: 'boum', stack: error.stack })
  })

  it('convertit une chaîne en message, sans stack', async () => {
    expect(await respondError('texte brut').json()).toEqual({ error: 'texte brut' })
  })

  it('convertit un objet avec String(), sans stack', async () => {
    expect(await respondError({ toString: () => 'objet' }).json()).toEqual({ error: 'objet' })
  })

  it("logue l'erreur reçue", () => {
    const error = new Error('boum')
    respondError(error)
    expect(console.error).toHaveBeenCalledWith(error)
  })
})
```

- [ ] **Step 7: Écrire `tests/unit/storage.test.ts`**

```ts
import { describe, expect, it } from 'vitest'
import { receiptKeyFor } from '@/lib/storage'

describe('receiptKeyFor', () => {
  it.each<[number, string, string]>([
    [1, '.png', 'receipts/1.png'],
    [42, '.pdf', 'receipts/42.pdf'],
    [7, '', 'receipts/7'],
  ])('(%i, « %s ») → %s', (seq, extension, key) => {
    expect(receiptKeyFor(seq, extension)).toBe(key)
  })
})
```

- [ ] **Step 8: Lancer les tests unitaires**

Run: `npm run test:unit`
Expected: PASS — 2 fichiers, 7 tests.

- [ ] **Step 9: Lint et typecheck**

Run: `npm run lint && npm run typecheck`
Expected: aucune erreur.

- [ ] **Step 10: Commit**

```bash
git add package.json package-lock.json .gitignore eslint.config.mjs vitest.config.mts tests/unit
git commit -F - <<'EOF'
test(ARLA-9): outillage Vitest et premiers tests unitaires

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 2: Tests unitaires de l'OCR

**Files:**
- Test: `tests/unit/ocr.test.ts`

**Interfaces:**
- Consumes: `suggestFields(receipt: { data: Buffer; mimeType: string }): Promise<{ amount?: number; expenseDate?: string }>` (`src/lib/ocr.ts`), `createWorker` de `tesseract.js` (mocké).
- Produces: rien pour les autres tâches.

- [ ] **Step 1: Écrire `tests/unit/ocr.test.ts`**

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createWorker } from 'tesseract.js'
import { suggestFields } from '@/lib/ocr'

vi.mock('tesseract.js', () => ({ createWorker: vi.fn() }))

type TesseractWorker = Awaited<ReturnType<typeof createWorker>>

/** Simule un worker Tesseract dont la reconnaissance renvoie `text`. */
function fakeOcr(text: string) {
  const worker = {
    recognize: vi.fn().mockResolvedValue({ data: { text } }),
    terminate: vi.fn().mockResolvedValue(undefined),
  }
  vi.mocked(createWorker).mockResolvedValue(worker as unknown as TesseractWorker)
  return worker
}

function suggestFromText(text: string) {
  fakeOcr(text)
  return suggestFields({ data: Buffer.from('image'), mimeType: 'image/png' })
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('suggestFields — types de fichier', () => {
  it.each(['application/pdf', 'text/plain', ''])(
    "type « %s » non supporté : {} sans lancer l'OCR",
    async (mimeType) => {
      await expect(suggestFields({ data: Buffer.from('x'), mimeType })).resolves.toEqual({})
      expect(createWorker).not.toHaveBeenCalled()
    }
  )

  it.each(['image/png', 'image/jpeg', 'image/webp'])(
    'type %s : OCR français avec le modèle local tessdata',
    async (mimeType) => {
      const worker = fakeOcr('')
      const data = Buffer.from('image')
      await suggestFields({ data, mimeType })
      expect(createWorker).toHaveBeenCalledWith('fra', undefined, {
        langPath: expect.stringMatching(/tessdata$/),
        cacheMethod: 'none',
      })
      expect(worker.recognize).toHaveBeenCalledWith(data)
      expect(worker.terminate).toHaveBeenCalledOnce()
    }
  )
})

describe('suggestFields — montant', () => {
  it.each<[string, string, number | undefined]>([
    ['ligne à mot-clé prioritaire', 'Café 3,50\nTOTAL TTC 42,50 €', 42.5],
    ['mot-clé prioritaire même face à un montant plus élevé', 'Article 99,99\nTotal 10,00', 10],
    ['[as-is] seule la première ligne à mot-clé compte', 'Montant 5,00\nTotal 50,00', 5],
    ['maximum des décimaux de la ligne à mot-clé', 'Total HT 35,00 TVA 7,00 TTC 42,00', 42],
    ['sans mot-clé : maximum de tout le ticket', 'Pain 1,20\nVin 12,90', 12.9],
    ['séparateur de milliers espace', 'Total 1 234,56', 1234.56],
    ['séparateur de milliers point', 'Total 1.234,56', 1234.56],
    ['point décimal', 'Total 42.50', 42.5],
    ['mot-clé en majuscules accentuées', 'NET À PAYER 18,00', 18],
    ["repli sur les entiers d'une ligne à mot-clé", 'TOTAL 42 EUR', 42],
    ["repli sur les entiers d'une ligne avec €", 'Ticket n°12\nPayé 30 €', 30],
    ['repli : plus grand entier', 'Total 12 ou 300 €', 300],
    [
      '[as-is] mot-clé sans décimal : les décimaux des autres lignes sont ignorés',
      'Article 9,99\nTotal 15',
      15,
    ],
    ['entiers sans mot-clé ni devise ignorés', 'Table 12\nCouverts 4', undefined],
    ['montant nul ignoré', 'Total 0,00', undefined],
    ['entier de plus de 5 chiffres ignoré', 'Total 123456 €', undefined],
    ['aucun nombre', 'Merci de votre visite', undefined],
  ])('%s', async (_label, text, amount) => {
    expect((await suggestFromText(text)).amount).toBe(amount)
  })
})

describe('suggestFields — date', () => {
  it.each<[string, string, string | undefined]>([
    ['jj/mm/aaaa', 'Date : 08/10/2026', '2026-10-08'],
    ['jj.mm.aaaa', 'Le 08.10.2026', '2026-10-08'],
    ['jj-mm-aaaa', '08-10-2026', '2026-10-08'],
    ['aaaa-mm-jj', 'Émis le 2026-10-08', '2026-10-08'],
    ['jj/mm/aa → 20aa', 'Date 08/10/26', '2026-10-08'],
    ['[as-is] année sur 2 chiffres toujours au XXIe siècle', 'Date 01/01/99', '2099-01-01'],
    ['date textuelle accentuée', 'Paris, le 3 août 2026', '2026-08-03'],
    ['date textuelle avec majuscule', 'le 15 Décembre 2025', '2025-12-15'],
    ["priorité à jj/mm/aaaa sur l'ISO", '2026-01-02 puis 05/06/2026', '2026-06-05'],
    ['jj/mm/aaaa invalide → motif suivant', '31/02/2026 ou 2026-03-01', '2026-03-01'],
    ['[as-is] seule la première date jj/mm/aaaa est essayée', '31/02/2026 et 05/06/2026', undefined],
    ['[as-is] format américain mm/jj/aaaa non reconnu', '12/31/2026', undefined],
    ['date impossible', '31/02/2026', undefined],
    ['aucune date', 'Merci de votre visite', undefined],
  ])('%s', async (_label, text, expenseDate) => {
    expect((await suggestFromText(text)).expenseDate).toBe(expenseDate)
  })
})

describe('suggestFields — résultat et erreurs', () => {
  it('renvoie montant et date ensemble', async () => {
    await expect(suggestFromText('TOTAL TTC 42,50 €\nDate : 08/10/2026')).resolves.toEqual({
      amount: 42.5,
      expenseDate: '2026-10-08',
    })
  })

  it('ticket illisible : aucune suggestion', async () => {
    await expect(suggestFromText('@@@ ###')).resolves.toEqual({})
  })

  it('libère le worker même si la reconnaissance échoue, et renvoie {}', async () => {
    const worker = fakeOcr('')
    worker.recognize.mockRejectedValue(new Error('image corrompue'))
    await expect(
      suggestFields({ data: Buffer.from('x'), mimeType: 'image/png' })
    ).resolves.toEqual({})
    expect(worker.terminate).toHaveBeenCalledOnce()
    expect(console.error).toHaveBeenCalledWith(
      '[ocr] Extraction échouée, suggestion vide renvoyée',
      expect.any(Error)
    )
  })

  it('création du worker impossible : {}', async () => {
    vi.mocked(createWorker).mockRejectedValue(new Error('modèle introuvable'))
    await expect(
      suggestFields({ data: Buffer.from('x'), mimeType: 'image/png' })
    ).resolves.toEqual({})
  })
})
```

- [ ] **Step 2: Lancer les tests**

Run: `npx vitest run tests/unit/ocr.test.ts`
Expected: PASS — 41 tests. En cas d'échec, appliquer la règle de caractérisation (Global Constraints) : la valeur réelle renvoyée par `suggestFields` fait foi.

- [ ] **Step 3: Lint et typecheck**

Run: `npm run lint && npm run typecheck`
Expected: aucune erreur.

- [ ] **Step 4: Commit**

```bash
git add tests/unit/ocr.test.ts
git commit -F - <<'EOF'
test(ARLA-9): caractérise l'extraction montant/date de l'OCR

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 3: Infrastructure d'intégration (base, S3, session) et tests de `lib/db`

**Files:**
- Create: `tests/support/env.ts`, `tests/support/db.ts`, `tests/support/infra.ts`, `tests/support/factories.ts`, `tests/support/fixtures.ts`
- Create: `tests/integration/global-setup.ts`, `tests/integration/setup.ts`
- Create: `tests/integration/helpers/http.ts`, `tests/integration/helpers/session.ts`, `tests/integration/helpers/s3.ts`
- Modify: `vitest.config.mts` (projet `integration`)
- Modify: `Makefile` (cible `test`)
- Test: `tests/unit/test-db-guard.test.ts`, `tests/integration/lib/db.test.ts`

**Interfaces:**
- Consumes: `getPool(): Pool`, `withUserScope<T>(userId: string, fn: (client: PoolClient) => Promise<T>): Promise<T>` (`src/lib/db.ts`) ; `global.__pgPool` (déclaré dans `src/lib/db.ts`).
- Produces (utilisé par toutes les tâches suivantes) :
  - `tests/support/env.ts` : `PG_ADMIN_URL: string`, `TEST_DATABASE_NAME = 'expense_io_test'`, `E2E_DATABASE_NAME = 'expense_io_e2e'`, `TEST_ENV` et `E2E_ENV` (objets `{ DATABASE_URL, S3_ENDPOINT, S3_REGION, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_BUCKET, S3_FORCE_PATH_STYLE }`), `E2E_PORT = 3100`, `BASE_URL = 'http://localhost:3100'`.
  - `tests/support/db.ts` : `assertTestDatabase(url: string | undefined): string`, `testDb(): Pool`, `closeTestDb(): Promise<void>`, `truncateAll(): Promise<void>`.
  - `tests/support/infra.ts` : `type S3Env`, `s3ClientFor(env: S3Env): S3Client`, `ensureDatabase(name: string): Promise<void>`, `migrate(databaseUrl: string): Promise<void>`, `ensureBucket(env: S3Env): Promise<void>`, `putReceipt(env: S3Env, key: string, body: Uint8Array, contentType?: string): Promise<void>`.
  - `tests/support/factories.ts` : types `Role`, `NoteStatus`, `CompanyRow`, `UserRow`, `NoteRow`, `Org` ; `TEST_PASSWORD`, `uniqueId()`, `createCompany({ domain? })`, `createUser({ company, role?, manager?, name?, email? })`, `createNote({ user, amount?, expenseDate?, description?, status?, receiptKey?, createdAt? })`, `createOrg(): Promise<Org>` (RH « Rita RH », manager racine « Marc Manager », employé « Emma Employée » rattaché), `findNote(id)`, `findUser(id)`, `countRows(table)`.
  - `tests/support/fixtures.ts` : `PNG_BYTES: Uint8Array`.
  - `tests/integration/helpers/http.ts` : `NoteDto`, `UserDto`, `ErrorBody`, `UNKNOWN_ID`, `NON_UUID_IDS`, `request(path, init?)`, `multipart(path, fields)`, `jsonBody(path, method, payload)`, `routeParams(id)`, `readJson<T>(response)`, `receiptFile({ name?, type?, size?, content? })`.
  - `tests/integration/helpers/session.ts` : `authMock`, `signInMock`, `signOutMock`, `type Caller = 'anonymous' | Role`, `actAs(user, role?)`, `actAsAnonymous()`, `actAsGhost(role): string`, `actAsCaller(org, caller)`.
  - `tests/integration/helpers/s3.ts` : `headReceipt(key)`, `storeReceipt(key, body, contentType?)`, `expectPresignedReceipt(url, key, expected)`.

- [ ] **Step 1: Créer `tests/support/env.ts`**

```ts
// Ressources dédiées aux tests : jamais la base ni le bucket de `make dev`.
// Les valeurs par défaut correspondent au docker-compose (et aux services CI).
const PG_SERVER_URL = process.env.TEST_PG_SERVER_URL ?? 'postgres://expense:expense@localhost:5433'

export const PG_ADMIN_URL = `${PG_SERVER_URL}/postgres`
export const TEST_DATABASE_NAME = 'expense_io_test'
export const E2E_DATABASE_NAME = 'expense_io_e2e'

const S3_BASE_ENV = {
  S3_ENDPOINT: process.env.TEST_S3_ENDPOINT ?? 'http://localhost:4567',
  S3_REGION: 'us-east-1',
  S3_ACCESS_KEY_ID: 'test',
  S3_SECRET_ACCESS_KEY: 'test',
  S3_FORCE_PATH_STYLE: 'true',
}

export const TEST_ENV = {
  ...S3_BASE_ENV,
  DATABASE_URL: `${PG_SERVER_URL}/${TEST_DATABASE_NAME}`,
  S3_BUCKET: 'receipts-test',
}

export const E2E_ENV = {
  ...S3_BASE_ENV,
  DATABASE_URL: `${PG_SERVER_URL}/${E2E_DATABASE_NAME}`,
  S3_BUCKET: 'receipts-e2e',
}

export const E2E_PORT = 3100
export const BASE_URL = `http://localhost:${E2E_PORT}`
```

- [ ] **Step 2: Écrire le test du garde-fou `tests/unit/test-db-guard.test.ts`** (Review Focus 1)

```ts
import { describe, expect, it } from 'vitest'
import { assertTestDatabase } from '../support/db'

describe('assertTestDatabase', () => {
  it.each([
    'postgres://u:p@localhost:5433/expense_io_test',
    'postgres://u:p@localhost:5433/expense_io_e2e',
  ])('accepte %s', (url) => {
    expect(assertTestDatabase(url)).toBe(url)
  })

  it.each([
    'postgres://u:p@localhost:5433/expense_io',
    'postgres://u:p@localhost:5433/postgres',
    'postgres://u:p@localhost:5433/test_expense',
  ])('refuse %s (base qui ne sert pas aux tests)', (url) => {
    expect(() => assertTestDatabase(url)).toThrow(/refusée/)
  })

  it('refuse une URL absente', () => {
    expect(() => assertTestDatabase(undefined)).toThrow('DATABASE_URL is not set')
  })
})
```

- [ ] **Step 3: Lancer ce test pour le voir échouer**

Run: `npx vitest run tests/unit/test-db-guard.test.ts`
Expected: FAIL — `Failed to resolve import "../support/db"`.

- [ ] **Step 4: Créer `tests/support/db.ts`**

```ts
import { Pool } from 'pg'

/**
 * Garde-fou : les helpers de test vident les tables. Ils refusent toute base
 * qui n'est pas dédiée aux tests (suffixe `_test` ou `_e2e`).
 */
export function assertTestDatabase(connectionString: string | undefined): string {
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set')
  }
  const name = new URL(connectionString).pathname.slice(1)
  if (!/_(test|e2e)$/.test(name)) {
    throw new Error(`Base "${name}" refusée : les tests n'utilisent que des bases *_test ou *_e2e.`)
  }
  return connectionString
}

let pool: Pool | undefined

/** Pool des helpers de test, distinct de celui de l'application (`global.__pgPool`). */
export function testDb(): Pool {
  if (!pool) {
    pool = new Pool({ connectionString: assertTestDatabase(process.env.DATABASE_URL), max: 4 })
  }
  return pool
}

export async function closeTestDb(): Promise<void> {
  await pool?.end()
  pool = undefined
}

/** `RESTART IDENTITY` remet `receipt_seq` à 1 : clés de reçu déterministes. */
export async function truncateAll(): Promise<void> {
  await testDb().query('TRUNCATE expense_notes, users, companies RESTART IDENTITY CASCADE')
}
```

- [ ] **Step 5: Relancer le test du garde-fou**

Run: `npx vitest run tests/unit/test-db-guard.test.ts`
Expected: PASS — 6 tests.

- [ ] **Step 6: Créer `tests/support/infra.ts`**

```ts
import path from 'node:path'
import {
  CreateBucketCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import { runner } from 'node-pg-migrate'
import { Client } from 'pg'
import { PG_ADMIN_URL } from './env'

export interface S3Env {
  S3_ENDPOINT: string
  S3_REGION: string
  S3_ACCESS_KEY_ID: string
  S3_SECRET_ACCESS_KEY: string
  S3_BUCKET: string
}

export function s3ClientFor(env: S3Env): S3Client {
  return new S3Client({
    endpoint: env.S3_ENDPOINT,
    region: env.S3_REGION,
    forcePathStyle: true,
    credentials: { accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY },
  })
}

/** Crée la base si elle n'existe pas (idempotent). */
export async function ensureDatabase(name: string): Promise<void> {
  const admin = new Client({ connectionString: PG_ADMIN_URL })
  await admin.connect()
  try {
    const existing = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [name])
    if (existing.rowCount === 0) {
      await admin.query(`CREATE DATABASE "${name}"`)
    }
  } finally {
    await admin.end()
  }
}

/** Applique les vraies migrations de `migrations/` (idempotent). */
export async function migrate(databaseUrl: string): Promise<void> {
  await runner({
    databaseUrl,
    dir: path.join(process.cwd(), 'migrations'),
    migrationsTable: 'pgmigrations',
    direction: 'up',
    count: Infinity,
    log: () => {},
  })
}

/** Crée le bucket s'il n'existe pas (idempotent). */
export async function ensureBucket(env: S3Env): Promise<void> {
  const client = s3ClientFor(env)
  try {
    await client.send(new HeadBucketCommand({ Bucket: env.S3_BUCKET }))
  } catch {
    await client.send(new CreateBucketCommand({ Bucket: env.S3_BUCKET }))
  }
}

export async function putReceipt(
  env: S3Env,
  key: string,
  body: Uint8Array,
  contentType = 'image/png'
): Promise<void> {
  await s3ClientFor(env).send(
    new PutObjectCommand({ Bucket: env.S3_BUCKET, Key: key, Body: body, ContentType: contentType })
  )
}
```

- [ ] **Step 7: Créer `tests/support/fixtures.ts`**

```ts
// PNG 1x1 valide (le même que scripts/seed.mjs).
export const PNG_BYTES = new Uint8Array(
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    'base64'
  )
)
```

- [ ] **Step 8: Créer `tests/support/factories.ts`**

```ts
import { randomUUID } from 'node:crypto'
import bcrypt from 'bcryptjs'
import { testDb } from './db'

export type Role = 'employee' | 'manager' | 'hr_admin'
export type NoteStatus = 'pending' | 'approved' | 'rejected'

export interface CompanyRow {
  id: string
  name: string
  email_domain: string
}

export interface UserRow {
  id: string
  company_id: string
  name: string
  email: string
  role: Role
  manager_id: string | null
}

export interface NoteRow {
  id: string
  receipt_seq: number
  user_id: string
  amount: string
  expense_date: string
  description: string
  receipt_key: string
  status: NoteStatus
  created_at: Date
}

/** Entreprise type : une RH, un manager racine, un employé rattaché à ce manager. */
export interface Org {
  company: CompanyRow
  hr: UserRow
  manager: UserRow
  employee: UserRow
}

/** Mot de passe de tous les comptes créés par les factories (login réel en E2E). */
export const TEST_PASSWORD = 'motdepasse-test'
// Coût 4 au lieu de 12 : bcrypt.compare accepte tout coût, et on évite
// ~250 ms par utilisateur créé.
const TEST_PASSWORD_HASH = bcrypt.hashSync(TEST_PASSWORD, 4)

const USER_COLUMNS = 'id, company_id, name, email, role, manager_id'
const NOTE_COLUMNS = `id, receipt_seq, user_id, amount, expense_date::text AS expense_date,
  description, receipt_key, status, created_at`

export function uniqueId(): string {
  return randomUUID().slice(0, 8)
}

export async function createCompany(options: { domain?: string } = {}): Promise<CompanyRow> {
  const domain = options.domain ?? `societe-${uniqueId()}.test`
  const { rows } = await testDb().query<CompanyRow>(
    'INSERT INTO companies (name, email_domain) VALUES ($1, $2) RETURNING id, name, email_domain',
    [domain.split('.')[0], domain]
  )
  return rows[0]
}

export async function createUser(options: {
  company: CompanyRow
  role?: Role
  manager?: Pick<UserRow, 'id'> | null
  name?: string
  email?: string
}): Promise<UserRow> {
  const role = options.role ?? 'employee'
  const { rows } = await testDb().query<UserRow>(
    `INSERT INTO users (company_id, name, email, password_hash, role, manager_id)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING ${USER_COLUMNS}`,
    [
      options.company.id,
      options.name ?? `${role}-${uniqueId()}`,
      options.email ?? `${role}-${uniqueId()}@${options.company.email_domain}`,
      TEST_PASSWORD_HASH,
      role,
      options.manager?.id ?? null,
    ]
  )
  return rows[0]
}

export async function createNote(options: {
  user: Pick<UserRow, 'id'>
  amount?: number
  expenseDate?: string
  description?: string
  status?: NoteStatus
  receiptKey?: string
  createdAt?: Date
}): Promise<NoteRow> {
  const { rows } = await testDb().query<NoteRow>(
    `INSERT INTO expense_notes (user_id, amount, expense_date, description, receipt_key, status, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, now()))
     RETURNING ${NOTE_COLUMNS}`,
    [
      options.user.id,
      options.amount ?? 42.5,
      options.expenseDate ?? '2026-10-08',
      options.description ?? `Note ${uniqueId()}`,
      options.receiptKey ?? 'receipts/fixture.png',
      options.status ?? 'pending',
      options.createdAt ?? null,
    ]
  )
  return rows[0]
}

export async function createOrg(): Promise<Org> {
  const company = await createCompany()
  const hr = await createUser({ company, role: 'hr_admin', name: 'Rita RH' })
  const manager = await createUser({ company, role: 'manager', name: 'Marc Manager' })
  const employee = await createUser({ company, role: 'employee', manager, name: 'Emma Employée' })
  return { company, hr, manager, employee }
}

export async function findNote(id: string): Promise<NoteRow | undefined> {
  const { rows } = await testDb().query<NoteRow>(
    `SELECT ${NOTE_COLUMNS} FROM expense_notes WHERE id = $1`,
    [id]
  )
  return rows[0]
}

export async function findUser(id: string): Promise<UserRow | undefined> {
  const { rows } = await testDb().query<UserRow>(`SELECT ${USER_COLUMNS} FROM users WHERE id = $1`, [
    id,
  ])
  return rows[0]
}

export async function countRows(table: 'companies' | 'users' | 'expense_notes'): Promise<number> {
  const { rows } = await testDb().query<{ count: string }>(`SELECT count(*) FROM ${table}`)
  return Number(rows[0].count)
}
```

- [ ] **Step 9: Créer `tests/integration/global-setup.ts`**

```ts
import { TEST_DATABASE_NAME, TEST_ENV } from '../support/env'
import { ensureBucket, ensureDatabase, migrate } from '../support/infra'

export default async function setupIntegration(): Promise<void> {
  await ensureDatabase(TEST_DATABASE_NAME)
  await migrate(TEST_ENV.DATABASE_URL)
  await ensureBucket(TEST_ENV)
}
```

- [ ] **Step 10: Créer `tests/integration/setup.ts`**

```ts
import { afterAll, afterEach, beforeEach, vi } from 'vitest'
import { closeTestDb, truncateAll } from '../support/db'

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
  // respondError et l'OCR loguent chaque erreur : sortie de test lisible.
  vi.spyOn(console, 'error').mockImplementation(() => {})
  await truncateAll()
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
```

- [ ] **Step 11: Créer `tests/integration/helpers/http.ts`**

```ts
import type { NextRequest } from 'next/server'
import { PNG_BYTES } from '../../support/fixtures'

const ORIGIN = 'http://localhost'

export interface NoteDto {
  id: string
  userId: string
  amount: number
  expenseDate: string
  description: string
  receiptKey: string
  status: string
  createdAt: string
}

export interface UserDto {
  id: string
  name: string
  email: string
  role: string
  managerId: string | null
}

export interface ErrorBody {
  error: string
  stack?: string
}

export const UNKNOWN_ID = '00000000-0000-4000-8000-000000000000'
export const NON_UUID_IDS = ['abc', '1', "' OR 1=1 --"]

/** Les handlers n'utilisent que l'API standard de Request. */
export function request(path: string, init?: RequestInit): NextRequest {
  return new Request(`${ORIGIN}${path}`, init) as NextRequest
}

export function multipart(path: string, fields: Record<string, string | Blob>): NextRequest {
  const form = new FormData()
  for (const [name, value] of Object.entries(fields)) {
    form.set(name, value)
  }
  return request(path, { method: 'POST', body: form })
}

export function jsonBody(path: string, method: string, payload: unknown): NextRequest {
  return request(path, {
    method,
    body: JSON.stringify(payload),
    headers: { 'content-type': 'application/json' },
  })
}

export function routeParams(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) }
}

export async function readJson<T>(response: Response): Promise<T> {
  return (await response.json()) as T
}

/** Reçu PNG valide par défaut ; `size` produit un fichier de cette taille rempli de zéros. */
export function receiptFile(
  options: { name?: string; type?: string; size?: number; content?: BlobPart } = {}
): File {
  const content =
    options.content ?? (options.size === undefined ? PNG_BYTES : new Uint8Array(options.size))
  return new File([content], options.name ?? 'recu.png', { type: options.type ?? 'image/png' })
}
```

- [ ] **Step 12: Créer `tests/integration/helpers/session.ts`**

```ts
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
```

- [ ] **Step 13: Créer `tests/integration/helpers/s3.ts`**

```ts
import { HeadObjectCommand } from '@aws-sdk/client-s3'
import { expect } from 'vitest'
import { TEST_ENV } from '../../support/env'
import { putReceipt, s3ClientFor } from '../../support/infra'

export function headReceipt(key: string) {
  return s3ClientFor(TEST_ENV).send(new HeadObjectCommand({ Bucket: TEST_ENV.S3_BUCKET, Key: key }))
}

export function storeReceipt(key: string, body: Uint8Array, contentType = 'image/png') {
  return putReceipt(TEST_ENV, key, body, contentType)
}

/** URL présignée de reçu : bonne clé, validité de 300 s, et elle sert bien le fichier. */
export async function expectPresignedReceipt(
  url: string,
  key: string,
  expected: Uint8Array
): Promise<void> {
  const parsed = new URL(url)
  expect(parsed.pathname).toBe(`/${TEST_ENV.S3_BUCKET}/${key}`)
  expect(parsed.searchParams.get('X-Amz-Expires')).toBe('300')
  const response = await fetch(url)
  expect(response.status).toBe(200)
  expect(new Uint8Array(await response.arrayBuffer())).toEqual(expected)
}
```

- [ ] **Step 14: Ajouter le projet `integration` à `vitest.config.mts`** (fichier complet)

```ts
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import { TEST_ENV } from './tests/support/env'

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: ['tests/unit/**/*.test.ts'],
          environment: 'node',
          // Même fuseau en local et en CI.
          env: { TZ: 'UTC' },
        },
      },
      {
        extends: true,
        test: {
          name: 'integration',
          include: ['tests/integration/**/*.test.ts'],
          environment: 'node',
          env: { ...TEST_ENV, TZ: 'UTC' },
          globalSetup: ['tests/integration/global-setup.ts'],
          setupFiles: ['tests/integration/setup.ts'],
          // Base partagée : un fichier à la fois.
          fileParallelism: false,
          hookTimeout: 30_000,
          // next-auth importe `next/server` sans extension, ce que Node refuse
          // en ESM : Vitest doit transformer le paquet lui-même.
          server: { deps: { inline: ['next-auth'] } },
        },
      },
    ],
  },
})
```

- [ ] **Step 15: Écrire `tests/integration/lib/db.test.ts`**

```ts
import { describe, expect, it } from 'vitest'
import { getPool, withUserScope } from '@/lib/db'
import { countRows, createNote, createOrg, createUser } from '../../support/factories'

const USER_ID = '11111111-1111-4111-8111-111111111111'
const CURRENT_USER = "SELECT current_setting('app.current_user_id', true) AS value"

describe('withUserScope', () => {
  it("expose l'utilisateur courant aux policies pendant la transaction", async () => {
    const value = await withUserScope(
      USER_ID,
      async (client) => (await client.query<{ value: string }>(CURRENT_USER)).rows[0].value
    )
    expect(value).toBe(USER_ID)
  })

  it('ne laisse pas app.current_user_id sur la connexion rendue au pool', async () => {
    await withUserScope(USER_ID, async () => undefined)
    const client = await getPool().connect()
    try {
      const { rows } = await client.query<{ value: string | null }>(CURRENT_USER)
      expect(rows[0].value ?? '').toBe('')
    } finally {
      client.release()
    }
  })

  it('valide la transaction et renvoie le résultat de la fonction', async () => {
    const result = await withUserScope(USER_ID, async (client) => {
      await client.query("INSERT INTO companies (name, email_domain) VALUES ('commit', 'commit.test')")
      return 'ok'
    })
    expect(result).toBe('ok')
    expect(await countRows('companies')).toBe(1)
  })

  it("annule la transaction et relance l'erreur", async () => {
    await expect(
      withUserScope(USER_ID, async (client) => {
        await client.query(
          "INSERT INTO companies (name, email_domain) VALUES ('rollback', 'rollback.test')"
        )
        throw new Error('échec métier')
      })
    ).rejects.toThrow('échec métier')
    expect(await countRows('companies')).toBe(0)
  })
})

describe('Row Level Security', () => {
  it("[as-is] l'application se connecte en superutilisateur (audit §1)", async () => {
    const { rows } = await getPool().query<{ rolsuper: boolean }>(
      'SELECT rolsuper FROM pg_roles WHERE rolname = current_user'
    )
    expect(rows[0].rolsuper).toBe(true)
  })

  it('[as-is] un utilisateur sans lien voit toutes les notes malgré la RLS (audit §1)', async () => {
    const a = await createOrg()
    const b = await createOrg()
    await createNote({ user: a.employee })
    await createNote({ user: b.manager })
    const stranger = await createUser({ company: b.company })
    const visible = await withUserScope(
      stranger.id,
      async (client) => (await client.query('SELECT id FROM expense_notes')).rowCount
    )
    expect(visible).toBe(2)
  })
})
```

- [ ] **Step 16: Lancer la suite (Docker démarré)**

Run: `docker compose up -d && npm test`
Expected: PASS — projets `unit` et `integration` verts ; la base `expense_io_test` et le bucket `receipts-test` sont créés.

- [ ] **Step 17: Relancer pour vérifier l'idempotence** (Review Focus 3)

Run: `npm test`
Expected: PASS à nouveau, sans erreur « database already exists » ni « BucketAlreadyOwnedByYou ».

- [ ] **Step 18: Ajouter la cible `test` au `Makefile`** — ajouter `test` à la ligne `.PHONY`, puis après la cible `typecheck` :

```make
test: up ## Lance les tests unitaires et d'intégration (Vitest)
	npm test
```

- [ ] **Step 19: Lint et typecheck**

Run: `npm run lint && npm run typecheck`
Expected: aucune erreur.

- [ ] **Step 20: Commit**

```bash
git add vitest.config.mts Makefile tests/support tests/integration tests/unit/test-db-guard.test.ts
git commit -F - <<'EOF'
test(ARLA-9): infrastructure d'intégration (Postgres, LocalStack, session)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 4: API employé — liste et soumission des notes

**Files:**
- Test: `tests/integration/api/expense-notes.test.ts`
- Test: `tests/integration/api/expense-notes-s3-failure.test.ts`

**Interfaces:**
- Consumes: `GET(request: NextRequest)`, `POST(request: NextRequest)` de `src/app/api/expense-notes/route.ts` ; `uploadReceipt` de `src/lib/storage.ts` ; tous les helpers produits par la Task 3.
- Produces: rien pour les autres tâches.

- [ ] **Step 1: Écrire `tests/integration/api/expense-notes.test.ts`**

```ts
import { describe, expect, it } from 'vitest'
import { GET, POST } from '@/app/api/expense-notes/route'
import { countRows, createNote, createOrg, findNote, type Role } from '../../support/factories'
import { PNG_BYTES } from '../../support/fixtures'
import {
  type ErrorBody,
  type NoteDto,
  jsonBody,
  multipart,
  readJson,
  receiptFile,
  request,
} from '../helpers/http'
import { headReceipt } from '../helpers/s3'
import { actAs, actAsAnonymous, actAsGhost } from '../helpers/session'

const MAX_RECEIPT_BYTES = 10 * 1024 * 1024

type NoteField = 'amount' | 'expenseDate' | 'description' | 'receipt'
type NoteOverrides = Partial<Record<NoteField, string | Blob | null>>

/** Formulaire valide par défaut ; une valeur `null` retire le champ. */
function submit(overrides: NoteOverrides = {}) {
  const fields: Record<NoteField, string | Blob | null> = {
    amount: '42.50',
    expenseDate: '2026-10-08',
    description: 'Taxi aéroport',
    receipt: receiptFile(),
    ...overrides,
  }
  const present: Record<string, string | Blob> = {}
  for (const [name, value] of Object.entries(fields)) {
    if (value !== null) present[name] = value
  }
  return POST(multipart('/api/expense-notes', present))
}

async function listAs(path = '/api/expense-notes'): Promise<NoteDto[]> {
  return readJson<NoteDto[]>(await GET(request(path)))
}

describe('GET /api/expense-notes', () => {
  it('401 sans session', async () => {
    actAsAnonymous()
    const response = await GET(request('/api/expense-notes'))
    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: 'Unauthorized' })
  })

  it("ne renvoie que les notes de l'appelant", async () => {
    const { employee, manager } = await createOrg()
    const mine = await createNote({ user: employee })
    await createNote({ user: manager })
    actAs(employee)
    expect((await listAs()).map((note) => note.id)).toEqual([mine.id])
  })

  it('renvoie le DTO : montant en nombre, date brute, createdAt ISO indépendant du fuseau', async () => {
    const { employee } = await createOrg()
    // 23 h 30 UTC : le lendemain à Paris. Ni la date ni l'ISO ne doivent bouger.
    const note = await createNote({
      user: employee,
      amount: 42.5,
      expenseDate: '2026-10-01',
      description: 'Taxi',
      status: 'approved',
      receiptKey: 'receipts/9.png',
      createdAt: new Date('2026-10-01T23:30:00.000Z'),
    })
    actAs(employee)
    expect(await listAs()).toEqual([
      {
        id: note.id,
        userId: employee.id,
        amount: 42.5,
        expenseDate: '2026-10-01',
        description: 'Taxi',
        receiptKey: 'receipts/9.png',
        status: 'approved',
        createdAt: '2026-10-01T23:30:00.000Z',
      },
    ])
  })

  it.each(['/api/expense-notes', '/api/expense-notes?sort='])(
    '%s : tri par created_at décroissant',
    async (path) => {
      const { employee } = await createOrg()
      const first = await createNote({ user: employee, createdAt: new Date('2026-10-01T08:00:00Z') })
      const third = await createNote({ user: employee, createdAt: new Date('2026-10-03T08:00:00Z') })
      const second = await createNote({ user: employee, createdAt: new Date('2026-10-02T08:00:00Z') })
      actAs(employee)
      expect((await listAs(path)).map((note) => note.id)).toEqual([third.id, second.id, first.id])
    }
  )

  it.each<Role>(['manager', 'hr_admin'])('%s : renvoie aussi ses propres notes', async (role) => {
    const org = await createOrg()
    const user = role === 'manager' ? org.manager : org.hr
    const note = await createNote({ user })
    actAs(user)
    expect((await listAs()).map((n) => n.id)).toEqual([note.id])
  })

  it("session d'un utilisateur supprimé : liste vide", async () => {
    await createNote({ user: (await createOrg()).employee })
    actAsGhost('employee')
    expect(await listAs()).toEqual([])
  })

  it('respecte ?sort=amount ASC', async () => {
    const { employee } = await createOrg()
    for (const amount of [30, 10, 20]) await createNote({ user: employee, amount })
    actAs(employee)
    const sort = encodeURIComponent('amount ASC')
    expect((await listAs(`/api/expense-notes?sort=${sort}`)).map((n) => n.amount)).toEqual([10, 20, 30])
  })

  it('[as-is] exécute une expression SQL arbitraire passée dans ?sort= (audit §4)', async () => {
    const { employee, hr } = await createOrg()
    await createNote({ user: employee, amount: 10 })
    await createNote({ user: employee, amount: 20 })
    actAs(employee)
    // L'ordre du résultat révèle si une condition sur la table users est vraie :
    // fuite d'information par injection dans ORDER BY.
    const probe = async (condition: string) => {
      const sort = encodeURIComponent(`(CASE WHEN ${condition} THEN amount ELSE -amount END) ASC`)
      return (await listAs(`/api/expense-notes?sort=${sort}`)).map((n) => n.amount)
    }
    expect(await probe(`(SELECT count(*) FROM users WHERE email = '${hr.email}') = 1`)).toEqual([10, 20])
    expect(await probe(`(SELECT count(*) FROM users WHERE email = 'personne@nulle.part') = 1`)).toEqual([
      20, 10,
    ])
  })

  it('[as-is] colonne inconnue dans ?sort= : erreur SQL non interceptée (promesse rejetée)', async () => {
    const { employee } = await createOrg()
    actAs(employee)
    await expect(GET(request('/api/expense-notes?sort=nope'))).rejects.toThrow(
      'column "nope" does not exist'
    )
  })

  it('[as-is] requêtes multiples dans ?sort= : refusées par pg, erreur non interceptée, base intacte', async () => {
    const { employee } = await createOrg()
    actAs(employee)
    const sort = encodeURIComponent('created_at; DROP TABLE users')
    await expect(GET(request(`/api/expense-notes?sort=${sort}`))).rejects.toThrow(
      'cannot insert multiple commands into a prepared statement'
    )
    expect(await countRows('users')).toBe(3)
  })
})

describe('POST /api/expense-notes', () => {
  it("401 sans session, rien n'est créé", async () => {
    actAsAnonymous()
    const response = await submit()
    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: 'Unauthorized' })
    expect(await countRows('expense_notes')).toBe(0)
  })

  it('201 : crée la note en attente, envoie le reçu sur S3 et renvoie le DTO', async () => {
    const { employee } = await createOrg()
    actAs(employee)
    const response = await submit()
    expect(response.status).toBe(201)
    const dto = await readJson<NoteDto>(response)
    expect(dto).toEqual({
      id: expect.any(String),
      userId: employee.id,
      amount: 42.5,
      expenseDate: '2026-10-08',
      description: 'Taxi aéroport',
      receiptKey: 'receipts/1.png',
      status: 'pending',
      createdAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
    })
    expect(await findNote(dto.id)).toMatchObject({
      user_id: employee.id,
      amount: '42.50',
      receipt_key: 'receipts/1.png',
      receipt_seq: 1,
      status: 'pending',
    })
    const object = await headReceipt('receipts/1.png')
    expect(object.ContentType).toBe('image/png')
    expect(object.ContentLength).toBe(PNG_BYTES.length)
  })

  it.each<[string, string]>([
    ['image/png', '.png'],
    ['image/jpeg', '.jpg'],
    ['image/webp', '.webp'],
    ['application/pdf', '.pdf'],
  ])('reçu %s → clé receipts/1%s', async (type, extension) => {
    const { employee } = await createOrg()
    actAs(employee)
    const dto = await readJson<NoteDto>(await submit({ receipt: receiptFile({ type, name: 'recu.bin' }) }))
    expect(dto.receiptKey).toBe(`receipts/1${extension}`)
    expect((await headReceipt(dto.receiptKey)).ContentType).toBe(type)
  })

  it('numérote les reçus avec receipt_seq', async () => {
    const { employee } = await createOrg()
    actAs(employee)
    const first = await readJson<NoteDto>(await submit())
    const second = await readJson<NoteDto>(await submit())
    expect([first.receiptKey, second.receiptKey]).toEqual(['receipts/1.png', 'receipts/2.png'])
  })

  it.each<Role>(['manager', 'hr_admin'])('%s peut aussi soumettre une note', async (role) => {
    const org = await createOrg()
    const user = role === 'manager' ? org.manager : org.hr
    actAs(user)
    const response = await submit()
    expect(response.status).toBe(201)
    expect((await readJson<NoteDto>(response)).userId).toBe(user.id)
  })

  it('conserve la description telle quelle (ni trim, ni limite de longueur)', async () => {
    const { employee } = await createOrg()
    actAs(employee)
    const padded = await readJson<NoteDto>(await submit({ description: '  Taxi  ' }))
    const long = await readJson<NoteDto>(await submit({ description: 'x'.repeat(10_000) }))
    expect(padded.description).toBe('  Taxi  ')
    expect(long.description).toHaveLength(10_000)
  })

  it.each<[string, NoteOverrides]>([
    ['montant absent', { amount: null }],
    ['montant vide', { amount: '' }],
    ['montant non numérique', { amount: 'abc' }],
    ['montant hexadécimal (parseFloat lit 0)', { amount: '0x10' }],
    ['montant nul', { amount: '0' }],
    ['montant négatif', { amount: '-5' }],
    ['montant -0', { amount: '-0' }],
    ['montant infini', { amount: 'Infinity' }],
    ['montant NaN', { amount: 'NaN' }],
    ['montant envoyé comme fichier', { amount: new Blob(['12']) }],
    ['date absente', { expenseDate: null }],
    ['date envoyée comme fichier', { expenseDate: new Blob(['2026-10-08']) }],
    ['description absente', { description: null }],
    ['description vide', { description: '' }],
    ["description faite d'espaces", { description: '   ' }],
    ['description envoyée comme fichier', { description: new Blob(['Taxi']) }],
    ['reçu absent', { receipt: null }],
    ['reçu envoyé comme texte', { receipt: 'recu.png' }],
  ])('400 « Champs invalides » : %s', async (_label, overrides) => {
    const { employee } = await createOrg()
    actAs(employee)
    const response = await submit(overrides)
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'Champs invalides' })
    expect(await countRows('expense_notes')).toBe(0)
  })

  it.each(['text/plain', 'image/gif', 'image/svg+xml', 'application/octet-stream'])(
    'reçu %s refusé → 400',
    async (type) => {
      const { employee } = await createOrg()
      actAs(employee)
      const response = await submit({ receipt: receiptFile({ type, name: 'recu.bin' }) })
      expect(response.status).toBe(400)
      expect(await response.json()).toEqual({ error: 'Type de fichier non autorisé pour le reçu' })
    }
  )

  it('vérifie le type avant la taille', async () => {
    const { employee } = await createOrg()
    actAs(employee)
    const response = await submit({
      receipt: receiptFile({ type: 'text/plain', size: MAX_RECEIPT_BYTES + 1 }),
    })
    expect(await response.json()).toEqual({ error: 'Type de fichier non autorisé pour le reçu' })
  })

  it('accepte un reçu de 10 Mo pile', async () => {
    const { employee } = await createOrg()
    actAs(employee)
    const response = await submit({ receipt: receiptFile({ size: MAX_RECEIPT_BYTES }) })
    expect(response.status).toBe(201)
    expect((await headReceipt('receipts/1.png')).ContentLength).toBe(MAX_RECEIPT_BYTES)
  })

  it('refuse un reçu de 10 Mo + 1 octet → 400', async () => {
    const { employee } = await createOrg()
    actAs(employee)
    const response = await submit({ receipt: receiptFile({ size: MAX_RECEIPT_BYTES + 1 }) })
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'Fichier trop volumineux' })
  })

  it('[as-is] accepte un reçu vide de 0 octet', async () => {
    const { employee } = await createOrg()
    actAs(employee)
    expect((await submit({ receipt: receiptFile({ size: 0 }) })).status).toBe(201)
    expect((await headReceipt('receipts/1.png')).ContentLength).toBe(0)
  })

  it('[as-is] accepte un contenu texte déclaré image/png (contenu non vérifié)', async () => {
    const { employee } = await createOrg()
    actAs(employee)
    const response = await submit({
      receipt: receiptFile({ content: "ceci n'est pas une image", type: 'image/png' }),
    })
    expect(response.status).toBe(201)
  })

  it.each<[string, string, number]>([
    ['notation scientifique', '1e3', 1000],
    ['espaces autour', '  12  ', 12],
    ['[as-is] virgule décimale : parseFloat tronque à la virgule', '12,50', 12],
    ['[as-is] suffixe non numérique ignoré par parseFloat', '12abc', 12],
    ['arrondi Postgres à 2 décimales', '12.345', 12.35],
    ['[as-is] 0.001 passe la validation puis est arrondi à 0', '0.001', 0],
    ['plus grand montant de numeric(10,2)', '99999999.99', 99999999.99],
  ])('montant %s (« %s ») → %s', async (_label, amount, expected) => {
    const { employee } = await createOrg()
    actAs(employee)
    const response = await submit({ amount })
    expect(response.status).toBe(201)
    expect((await readJson<NoteDto>(response)).amount).toBe(expected)
  })

  it.each(['1e12', '100000000'])(
    '[as-is] montant %s hors numeric(10,2) → 500 « numeric field overflow »',
    async (amount) => {
      const { employee } = await createOrg()
      actAs(employee)
      const response = await submit({ amount })
      expect(response.status).toBe(500)
      expect(await response.json()).toEqual({ error: 'numeric field overflow', stack: expect.any(String) })
      expect(await countRows('expense_notes')).toBe(0)
    }
  )

  it.each<[string, string, string]>([
    ['ISO', '2026-10-08', '2026-10-08'],
    ['future (acceptée)', '2099-12-31', '2099-12-31'],
    ['[as-is] jj/mm/aaaa lu en mm/jj/aaaa (DateStyle ISO, MDY)', '08/10/2026', '2026-08-10'],
  ])('date %s : « %s » → %s', async (_label, expenseDate, stored) => {
    const { employee } = await createOrg()
    actAs(employee)
    const dto = await readJson<NoteDto>(await submit({ expenseDate }))
    expect(dto.expenseDate).toBe(stored)
  })

  it.each<[string, string]>([
    ['31/02/2026', 'date/time field value out of range: "31/02/2026"'],
    ['2026-13-45', 'date/time field value out of range: "2026-13-45"'],
    ['hier', 'invalid input syntax for type date: "hier"'],
    ['', 'invalid input syntax for type date: ""'],
  ])("[as-is] date « %s » non validée par l'app → 500 Postgres", async (expenseDate, message) => {
    const { employee } = await createOrg()
    actAs(employee)
    const response = await submit({ expenseDate })
    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ error: message, stack: expect.any(String) })
    expect(await countRows('expense_notes')).toBe(0)
  })

  it('[as-is] corps JSON au lieu de multipart → 500 (formData() échoue)', async () => {
    const { employee } = await createOrg()
    actAs(employee)
    const response = await POST(jsonBody('/api/expense-notes', 'POST', { amount: 42.5 }))
    expect(response.status).toBe(500)
    expect(await readJson<ErrorBody>(response)).toEqual({
      error: expect.stringContaining('Content-Type'),
      stack: expect.any(String),
    })
  })

  it('[as-is] corps vide sans Content-Type → 500', async () => {
    const { employee } = await createOrg()
    actAs(employee)
    const response = await POST(request('/api/expense-notes', { method: 'POST' }))
    expect(response.status).toBe(500)
    expect((await readJson<ErrorBody>(response)).error).toContain('Content-Type')
  })

  it('[as-is] multipart malformé → 500 avec stack', async () => {
    const { employee } = await createOrg()
    actAs(employee)
    const response = await POST(
      request('/api/expense-notes', {
        method: 'POST',
        body: 'pas du multipart',
        headers: { 'content-type': 'multipart/form-data; boundary=xyz' },
      })
    )
    expect(response.status).toBe(500)
    expect((await readJson<ErrorBody>(response)).stack).toEqual(expect.any(String))
  })

  it('formulaire urlencoded (sans fichier possible) → 400', async () => {
    const { employee } = await createOrg()
    actAs(employee)
    const response = await POST(
      request('/api/expense-notes', {
        method: 'POST',
        body: new URLSearchParams({ amount: '42.5', expenseDate: '2026-10-08', description: 'Taxi' }),
      })
    )
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'Champs invalides' })
  })

  it("[as-is] session d'un utilisateur supprimé → 500 (clé étrangère)", async () => {
    actAsGhost('employee')
    const response = await submit()
    expect(response.status).toBe(500)
    expect((await readJson<ErrorBody>(response)).error).toContain('expense_notes_user_id_fkey')
  })
})
```

- [ ] **Step 2: Écrire `tests/integration/api/expense-notes-s3-failure.test.ts`**

```ts
import { describe, expect, it, vi } from 'vitest'
import { POST } from '@/app/api/expense-notes/route'
import { uploadReceipt } from '@/lib/storage'
import { testDb } from '../../support/db'
import { createOrg } from '../../support/factories'
import { multipart, readJson, receiptFile, type ErrorBody } from '../helpers/http'
import { actAs } from '../helpers/session'

// Mock partiel, limité à ce fichier : le vrai uploadReceipt reste
// l'implémentation par défaut (restaurée par vi.resetAllMocks entre tests).
vi.mock('@/lib/storage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/storage')>()
  return { ...actual, uploadReceipt: vi.fn(actual.uploadReceipt) }
})

describe('POST /api/expense-notes — panne du stockage', () => {
  it('[as-is] la note reste en base avec receipt_key vide et la réponse est une 500 (audit §5)', async () => {
    const { employee } = await createOrg()
    actAs(employee)
    vi.mocked(uploadReceipt).mockRejectedValueOnce(new Error('S3 indisponible'))
    const response = await POST(
      multipart('/api/expense-notes', {
        amount: '42.5',
        expenseDate: '2026-10-08',
        description: 'Taxi',
        receipt: receiptFile(),
      })
    )
    expect(response.status).toBe(500)
    expect(await readJson<ErrorBody>(response)).toEqual({
      error: 'S3 indisponible',
      stack: expect.any(String),
    })
    const { rows } = await testDb().query('SELECT receipt_key, status FROM expense_notes')
    expect(rows).toEqual([{ receipt_key: '', status: 'pending' }])
  })
})
```

- [ ] **Step 3: Lancer les deux fichiers**

Run: `npx vitest run tests/integration/api/expense-notes.test.ts tests/integration/api/expense-notes-s3-failure.test.ts`
Expected: PASS (≈ 75 tests). En cas d'échec, appliquer la règle de caractérisation ; les messages Postgres et undici ont été relevés sur le prototype (Postgres 16, Node 22).

- [ ] **Step 4: Lint et typecheck**

Run: `npm run lint && npm run typecheck`
Expected: aucune erreur.

- [ ] **Step 5: Commit**

```bash
git add tests/integration/api/expense-notes.test.ts tests/integration/api/expense-notes-s3-failure.test.ts
git commit -F - <<'EOF'
test(ARLA-9): caractérise la liste et la soumission des notes de frais

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 5: API employé — URL du reçu et suggestion OCR

**Files:**
- Test: `tests/integration/api/expense-note-receipt-url.test.ts`
- Test: `tests/integration/api/receipt-suggestion.test.ts`

**Interfaces:**
- Consumes: `GET(_request: Request, { params })` de `src/app/api/expense-notes/[id]/receipt-url/route.ts` ; `POST(request: Request)` de `src/app/api/expense-notes/receipt-suggestion/route.ts` ; helpers de la Task 3.
- Produces: rien.

- [ ] **Step 1: Écrire `tests/integration/api/expense-note-receipt-url.test.ts`**

```ts
import { describe, expect, it } from 'vitest'
import { GET } from '@/app/api/expense-notes/[id]/receipt-url/route'
import { createNote, createOrg, createUser, type Org, type Role } from '../../support/factories'
import { PNG_BYTES } from '../../support/fixtures'
import { NON_UUID_IDS, UNKNOWN_ID, readJson, request, routeParams } from '../helpers/http'
import { expectPresignedReceipt, storeReceipt } from '../helpers/s3'
import { actAs, actAsAnonymous, actAsGhost } from '../helpers/session'

function receiptUrl(id: string) {
  return GET(request(`/api/expense-notes/${id}/receipt-url`), routeParams(id))
}

describe('GET /api/expense-notes/:id/receipt-url', () => {
  it('401 sans session', async () => {
    const note = await createNote({ user: (await createOrg()).employee })
    actAsAnonymous()
    const response = await receiptUrl(note.id)
    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: 'Unauthorized' })
  })

  it.each<Role>(['employee', 'manager', 'hr_admin'])(
    '%s : URL présignée valide pour sa propre note',
    async (role) => {
      const org = await createOrg()
      const user = { employee: org.employee, manager: org.manager, hr_admin: org.hr }[role]
      const note = await createNote({ user, receiptKey: 'receipts/42.png' })
      await storeReceipt('receipts/42.png', PNG_BYTES)
      actAs(user)
      const response = await receiptUrl(note.id)
      expect(response.status).toBe(200)
      const { url } = await readJson<{ url: string }>(response)
      await expectPresignedReceipt(url, 'receipts/42.png', PNG_BYTES)
    }
  )

  it.each<[string, (org: Org) => Promise<string>, (org: Org) => Org['employee']]>([
    [
      "note d'un collègue",
      async (org) => (await createNote({ user: await createUser({ company: org.company }) })).id,
      (org) => org.employee,
    ],
    [
      "note d'un rattaché, demandée par son manager",
      async (org) => (await createNote({ user: org.employee })).id,
      (org) => org.manager,
    ],
    [
      "note d'une autre entreprise",
      async () => (await createNote({ user: (await createOrg()).employee })).id,
      (org) => org.employee,
    ],
    ['note inconnue', async () => UNKNOWN_ID, (org) => org.employee],
  ])('404 : %s', async (_label, noteIdFor, callerFor) => {
    const org = await createOrg()
    const id = await noteIdFor(org)
    actAs(callerFor(org))
    const response = await receiptUrl(id)
    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ error: 'Not found' })
  })

  it("session d'un utilisateur supprimé → 404", async () => {
    const note = await createNote({ user: (await createOrg()).employee })
    actAsGhost('employee')
    expect((await receiptUrl(note.id)).status).toBe(404)
  })

  it.each(NON_UUID_IDS)('[as-is] id « %s » non-UUID → 500 avec stack', async (id) => {
    actAs((await createOrg()).employee)
    const response = await receiptUrl(id)
    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({
      error: `invalid input syntax for type uuid: "${id}"`,
      stack: expect.any(String),
    })
  })

  it('[as-is] note orpheline (receipt_key vide, audit §5) → 500 du SDK S3', async () => {
    const { employee } = await createOrg()
    const note = await createNote({ user: employee, receiptKey: '' })
    actAs(employee)
    const response = await receiptUrl(note.id)
    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({
      error: 'Empty value provided for input HTTP label: Key.',
      stack: expect.any(String),
    })
  })
})
```

- [ ] **Step 2: Écrire `tests/integration/api/receipt-suggestion.test.ts`**

```ts
import { describe, expect, it, vi } from 'vitest'
import { createWorker } from 'tesseract.js'
import { POST } from '@/app/api/expense-notes/receipt-suggestion/route'
import { createOrg, type Role } from '../../support/factories'
import { jsonBody, multipart, readJson, receiptFile, type ErrorBody } from '../helpers/http'
import { actAs, actAsAnonymous, actAsGhost } from '../helpers/session'

vi.mock('tesseract.js', () => ({ createWorker: vi.fn() }))

type TesseractWorker = Awaited<ReturnType<typeof createWorker>>

function ocrReturns(text: string) {
  const worker = {
    recognize: vi.fn().mockResolvedValue({ data: { text } }),
    terminate: vi.fn().mockResolvedValue(undefined),
  }
  vi.mocked(createWorker).mockResolvedValue(worker as unknown as TesseractWorker)
  return worker
}

function suggest(fields: Record<string, string | Blob>) {
  return POST(multipart('/api/expense-notes/receipt-suggestion', fields))
}

const RECEIPT_TEXT = 'TOTAL TTC 42,50 €\nDate : 08/10/2026'

describe('POST /api/expense-notes/receipt-suggestion', () => {
  it("401 sans session, sans lancer l'OCR", async () => {
    actAsAnonymous()
    const response = await suggest({ receipt: receiptFile() })
    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: 'Unauthorized' })
    expect(createWorker).not.toHaveBeenCalled()
  })

  it.each<Role>(['employee', 'manager', 'hr_admin'])(
    '%s : renvoie la suggestion telle quelle',
    async (role) => {
      const org = await createOrg()
      actAs({ employee: org.employee, manager: org.manager, hr_admin: org.hr }[role])
      ocrReturns(RECEIPT_TEXT)
      const response = await suggest({ receipt: receiptFile() })
      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({ amount: 42.5, expenseDate: '2026-10-08' })
    }
  )

  it("session d'un utilisateur supprimé : suggestion quand même (aucun accès base)", async () => {
    actAsGhost('employee')
    ocrReturns(RECEIPT_TEXT)
    expect((await suggest({ receipt: receiptFile() })).status).toBe(200)
  })

  it.each<[string, Record<string, string | Blob>]>([
    ['reçu absent', {}],
    ['reçu envoyé comme texte', { receipt: 'recu.png' }],
  ])('400 « Champs invalides » : %s', async (_label, fields) => {
    actAs((await createOrg()).employee)
    const response = await suggest(fields)
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'Champs invalides' })
  })

  it("PDF : 200 {} sans lancer l'OCR", async () => {
    actAs((await createOrg()).employee)
    const response = await suggest({ receipt: receiptFile({ type: 'application/pdf', name: 'r.pdf' }) })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({})
    expect(createWorker).not.toHaveBeenCalled()
  })

  it('OCR en échec : 200 {}', async () => {
    actAs((await createOrg()).employee)
    vi.mocked(createWorker).mockRejectedValue(new Error('modèle introuvable'))
    const response = await suggest({ receipt: receiptFile() })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({})
  })

  it("[as-is] aucune limite de taille : un reçu de 11 Mo est passé à l'OCR (audit §5)", async () => {
    actAs((await createOrg()).employee)
    const worker = ocrReturns('')
    const size = 11 * 1024 * 1024
    expect((await suggest({ receipt: receiptFile({ size }) })).status).toBe(200)
    expect(worker.recognize.mock.calls[0][0]).toHaveLength(size)
  })

  it('[as-is] corps JSON → 500 avec stack', async () => {
    actAs((await createOrg()).employee)
    const response = await POST(jsonBody('/api/expense-notes/receipt-suggestion', 'POST', {}))
    expect(response.status).toBe(500)
    expect(await readJson<ErrorBody>(response)).toEqual({
      error: expect.stringContaining('Content-Type'),
      stack: expect.any(String),
    })
  })
})
```

- [ ] **Step 3: Lancer les deux fichiers**

Run: `npx vitest run tests/integration/api/expense-note-receipt-url.test.ts tests/integration/api/receipt-suggestion.test.ts`
Expected: PASS (≈ 22 tests).

- [ ] **Step 4: Lint et typecheck**

Run: `npm run lint && npm run typecheck`
Expected: aucune erreur.

- [ ] **Step 5: Commit**

```bash
git add tests/integration/api/expense-note-receipt-url.test.ts tests/integration/api/receipt-suggestion.test.ts
git commit -F - <<'EOF'
test(ARLA-9): caractérise l'URL du reçu et la suggestion OCR côté employé

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 6: API manager — file, décisions, reçu

**Files:**
- Test: `tests/integration/api/manager-expense-notes.test.ts`
- Test: `tests/integration/api/manager-decisions.test.ts`
- Test: `tests/integration/api/manager-receipt-url.test.ts`

**Interfaces:**
- Consumes: `GET()` de `src/app/api/manager/expense-notes/route.ts` ; `POST(_request: Request, { params })` de `…/[id]/approve/route.ts` et `…/[id]/reject/route.ts` ; `GET(_request, { params })` de `…/[id]/receipt-url/route.ts` ; helpers de la Task 3.
- Produces: rien.

- [ ] **Step 1: Écrire `tests/integration/api/manager-expense-notes.test.ts`**

```ts
import { describe, expect, it } from 'vitest'
import { GET } from '@/app/api/manager/expense-notes/route'
import { createCompany, createNote, createOrg, createUser } from '../../support/factories'
import { type NoteDto, readJson } from '../helpers/http'
import { actAs, actAsCaller, actAsGhost, type Caller } from '../helpers/session'

async function queueIds(): Promise<string[]> {
  return (await readJson<NoteDto[]>(await GET())).map((note) => note.id)
}

describe('GET /api/manager/expense-notes', () => {
  it.each<Caller>(['anonymous', 'employee', 'hr_admin'])(
    '[as-is] %s → 401 et non 403 (audit §3)',
    async (caller) => {
      actAsCaller(await createOrg(), caller)
      const response = await GET()
      expect(response.status).toBe(401)
      expect(await response.json()).toEqual({ error: 'Unauthorized' })
    }
  )

  it('renvoie le DTO des notes en attente des rattachés directs, de la plus ancienne à la plus récente', async () => {
    const org = await createOrg()
    const colleague = await createUser({ company: org.company, manager: org.manager })
    const recent = await createNote({ user: org.employee, createdAt: new Date('2026-10-03T08:00:00Z') })
    const oldest = await createNote({
      user: colleague,
      amount: 12.3,
      expenseDate: '2026-09-30',
      description: 'Parking',
      receiptKey: 'receipts/5.png',
      createdAt: new Date('2026-10-01T08:00:00Z'),
    })
    const middle = await createNote({ user: org.employee, createdAt: new Date('2026-10-02T08:00:00Z') })
    actAs(org.manager)
    const notes = await readJson<NoteDto[]>(await GET())
    expect(notes.map((note) => note.id)).toEqual([oldest.id, middle.id, recent.id])
    expect(notes[0]).toEqual({
      id: oldest.id,
      userId: colleague.id,
      amount: 12.3,
      expenseDate: '2026-09-30',
      description: 'Parking',
      receiptKey: 'receipts/5.png',
      status: 'pending',
      createdAt: '2026-10-01T08:00:00.000Z',
    })
  })

  it('exclut ses propres notes, les notes décidées et celles des non-rattachés', async () => {
    const org = await createOrg()
    const expected = await createNote({ user: org.employee })
    await createNote({ user: org.employee, status: 'approved' })
    await createNote({ user: org.employee, status: 'rejected' })
    await createNote({ user: org.manager })
    await createNote({ user: org.hr })
    await createNote({ user: await createUser({ company: org.company }) })
    const otherManager = await createUser({ company: org.company, role: 'manager' })
    await createNote({ user: await createUser({ company: org.company, manager: otherManager }) })
    actAs(org.manager)
    expect(await queueIds()).toEqual([expected.id])
  })

  it('ne voit que les rattachés directs, pas leurs propres rattachés', async () => {
    const org = await createOrg()
    const subManager = await createUser({ company: org.company, role: 'manager', manager: org.manager })
    const subNote = await createNote({ user: subManager })
    await createNote({ user: await createUser({ company: org.company, manager: subManager }) })
    actAs(org.manager)
    expect(await queueIds()).toEqual([subNote.id])
  })

  it("[as-is] voit les notes d'un rattaché d'une autre entreprise (audit §3)", async () => {
    const org = await createOrg()
    const foreign = await createUser({ company: await createCompany(), manager: org.manager })
    const note = await createNote({ user: foreign })
    actAs(org.manager)
    expect(await queueIds()).toEqual([note.id])
  })

  it("session d'un manager supprimé : file vide", async () => {
    await createNote({ user: (await createOrg()).employee })
    actAsGhost('manager')
    expect(await queueIds()).toEqual([])
  })
})
```

- [ ] **Step 2: Écrire `tests/integration/api/manager-decisions.test.ts`**

```ts
import { describe, expect, it } from 'vitest'
import { POST as approve } from '@/app/api/manager/expense-notes/[id]/approve/route'
import { POST as reject } from '@/app/api/manager/expense-notes/[id]/reject/route'
import { createNote, createOrg, createUser, findNote, type Org } from '../../support/factories'
import { NON_UUID_IDS, type NoteDto, UNKNOWN_ID, readJson, request, routeParams } from '../helpers/http'
import { actAs, actAsCaller, actAsGhost, type Caller } from '../helpers/session'

describe.each([
  { action: 'approve', handler: approve, decided: 'approved' },
  { action: 'reject', handler: reject, decided: 'rejected' },
] as const)('POST /api/manager/expense-notes/:id/$action', ({ action, handler, decided }) => {
  function decide(id: string, init?: RequestInit) {
    return handler(
      request(`/api/manager/expense-notes/${id}/${action}`, { method: 'POST', ...init }),
      routeParams(id)
    )
  }

  it.each<Caller>(['anonymous', 'employee', 'hr_admin'])(
    '[as-is] %s → 401 (audit §3), note inchangée',
    async (caller) => {
      const org = await createOrg()
      const note = await createNote({ user: org.employee })
      actAsCaller(org, caller)
      const response = await decide(note.id)
      expect(response.status).toBe(401)
      expect(await response.json()).toEqual({ error: 'Unauthorized' })
      expect((await findNote(note.id))?.status).toBe('pending')
    }
  )

  it(`note d'un rattaché → ${decided}, DTO renvoyé`, async () => {
    const org = await createOrg()
    const note = await createNote({
      user: org.employee,
      amount: 18.9,
      expenseDate: '2026-10-07',
      description: 'Déjeuner',
      receiptKey: 'receipts/3.png',
      createdAt: new Date('2026-10-07T12:00:00Z'),
    })
    actAs(org.manager)
    const response = await decide(note.id)
    expect(response.status).toBe(200)
    expect(await readJson<NoteDto>(response)).toEqual({
      id: note.id,
      userId: org.employee.id,
      amount: 18.9,
      expenseDate: '2026-10-07',
      description: 'Déjeuner',
      receiptKey: 'receipts/3.png',
      status: decided,
      createdAt: '2026-10-07T12:00:00.000Z',
    })
    expect((await findNote(note.id))?.status).toBe(decided)
  })

  it('ignore le corps de la requête', async () => {
    const org = await createOrg()
    const note = await createNote({ user: org.employee })
    actAs(org.manager)
    const response = await decide(note.id, {
      body: 'pas du json',
      headers: { 'content-type': 'application/json' },
    })
    expect(response.status).toBe(200)
  })

  it.each<[string, (org: Org) => Promise<string>]>([
    [
      'employé non rattaché',
      async (org) => (await createNote({ user: await createUser({ company: org.company }) })).id,
    ],
    [
      "employé d'un autre manager",
      async (org) => {
        const other = await createUser({ company: org.company, role: 'manager' })
        return (await createNote({ user: await createUser({ company: org.company, manager: other }) })).id
      },
    ],
    ['sa propre note', async (org) => (await createNote({ user: org.manager })).id],
    ['note de la RH', async (org) => (await createNote({ user: org.hr })).id],
    ["note d'une autre entreprise", async () => (await createNote({ user: (await createOrg()).employee })).id],
    ['note inconnue', async () => UNKNOWN_ID],
  ])('404 : %s', async (_label, noteIdFor) => {
    const org = await createOrg()
    const id = await noteIdFor(org)
    actAs(org.manager)
    const response = await decide(id)
    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ error: 'Not found' })
  })

  it.each(['approved', 'rejected'] as const)(
    '409 si la note est déjà %s, sans la modifier',
    async (status) => {
      const org = await createOrg()
      const note = await createNote({ user: org.employee, status })
      actAs(org.manager)
      const response = await decide(note.id)
      expect(response.status).toBe(409)
      expect(await response.json()).toEqual({ error: 'Already decided' })
      expect((await findNote(note.id))?.status).toBe(status)
    }
  )

  it('une deuxième décision consécutive → 409', async () => {
    const org = await createOrg()
    const note = await createNote({ user: org.employee })
    actAs(org.manager)
    expect((await decide(note.id)).status).toBe(200)
    expect((await decide(note.id)).status).toBe(409)
  })

  it.each(NON_UUID_IDS)(
    '[as-is] id « %s » non-UUID : erreur SQL non interceptée (promesse rejetée)',
    async (id) => {
      actAs((await createOrg()).manager)
      await expect(decide(id)).rejects.toThrow(`invalid input syntax for type uuid: "${id}"`)
    }
  )

  it("session d'un manager supprimé → 404", async () => {
    const note = await createNote({ user: (await createOrg()).employee })
    actAsGhost('manager')
    expect((await decide(note.id)).status).toBe(404)
  })
})
```

- [ ] **Step 3: Écrire `tests/integration/api/manager-receipt-url.test.ts`**

```ts
import { describe, expect, it } from 'vitest'
import { GET } from '@/app/api/manager/expense-notes/[id]/receipt-url/route'
import { TEST_ENV } from '../../support/env'
import { createNote, createOrg, createUser, type NoteRow, type Org } from '../../support/factories'
import { PNG_BYTES } from '../../support/fixtures'
import { NON_UUID_IDS, UNKNOWN_ID, readJson, request, routeParams } from '../helpers/http'
import { expectPresignedReceipt, storeReceipt } from '../helpers/s3'
import { actAs, actAsCaller, actAsGhost, type Caller } from '../helpers/session'

function receiptUrl(id: string) {
  return GET(request(`/api/manager/expense-notes/${id}/receipt-url`), routeParams(id))
}

describe('GET /api/manager/expense-notes/:id/receipt-url', () => {
  it.each<Caller>(['anonymous', 'employee', 'hr_admin'])('[as-is] %s → 401 (audit §3)', async (caller) => {
    const org = await createOrg()
    const note = await createNote({ user: org.employee })
    actAsCaller(org, caller)
    const response = await receiptUrl(note.id)
    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: 'Unauthorized' })
  })

  it("URL présignée valide pour la note d'un rattaché", async () => {
    const org = await createOrg()
    const note = await createNote({ user: org.employee, receiptKey: 'receipts/11.png' })
    await storeReceipt('receipts/11.png', PNG_BYTES)
    actAs(org.manager)
    const response = await receiptUrl(note.id)
    expect(response.status).toBe(200)
    const { url } = await readJson<{ url: string }>(response)
    await expectPresignedReceipt(url, 'receipts/11.png', PNG_BYTES)
  })

  it.each<[string, (org: Org) => Promise<NoteRow>]>([
    [
      'employé non rattaché de la même entreprise',
      async (org) => createNote({ user: await createUser({ company: org.company }) }),
    ],
    ["employé d'une autre entreprise", async () => createNote({ user: (await createOrg()).employee })],
    ['note déjà approuvée', async (org) => createNote({ user: org.employee, status: 'approved' })],
  ])('[as-is] reçu servi sans contrôle de rattachement : %s (audit §3)', async (_label, noteFor) => {
    const org = await createOrg()
    const note = await noteFor(org)
    actAs(org.manager)
    const response = await receiptUrl(note.id)
    expect(response.status).toBe(200)
    const { url } = await readJson<{ url: string }>(response)
    expect(new URL(url).pathname).toBe(`/${TEST_ENV.S3_BUCKET}/${note.receipt_key}`)
  })

  it('404 pour une note inconnue', async () => {
    actAs((await createOrg()).manager)
    const response = await receiptUrl(UNKNOWN_ID)
    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ error: 'Not found' })
  })

  it.each(NON_UUID_IDS)('[as-is] id « %s » non-UUID → 500 avec stack', async (id) => {
    actAs((await createOrg()).manager)
    const response = await receiptUrl(id)
    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({
      error: `invalid input syntax for type uuid: "${id}"`,
      stack: expect.any(String),
    })
  })

  it("[as-is] session d'un manager supprimé : reçu servi quand même", async () => {
    const note = await createNote({ user: (await createOrg()).employee })
    actAsGhost('manager')
    expect((await receiptUrl(note.id)).status).toBe(200)
  })
})
```

- [ ] **Step 4: Lancer les trois fichiers**

Run: `npx vitest run tests/integration/api/manager-`
Expected: PASS (≈ 50 tests).

- [ ] **Step 5: Lint et typecheck**

Run: `npm run lint && npm run typecheck`
Expected: aucune erreur.

- [ ] **Step 6: Commit**

```bash
git add tests/integration/api/manager-expense-notes.test.ts tests/integration/api/manager-decisions.test.ts tests/integration/api/manager-receipt-url.test.ts
git commit -F - <<'EOF'
test(ARLA-9): caractérise la file, les décisions et les reçus côté manager

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 7: API RH — file des managers racine, décisions, reçu

**Files:**
- Test: `tests/integration/api/hr-expense-notes.test.ts`
- Test: `tests/integration/api/hr-decisions.test.ts`
- Test: `tests/integration/api/hr-receipt-url.test.ts`

**Interfaces:**
- Consumes: `GET()` de `src/app/api/hr/expense-notes/route.ts` ; `POST(_request, { params })` de `…/hr/expense-notes/[id]/approve/route.ts` et `…/[id]/reject/route.ts` ; `GET(_request, { params })` de `…/hr/expense-notes/[id]/receipt-url/route.ts` ; helpers de la Task 3.
- Produces: rien.

- [ ] **Step 1: Écrire `tests/integration/api/hr-expense-notes.test.ts`**

```ts
import { describe, expect, it } from 'vitest'
import { GET } from '@/app/api/hr/expense-notes/route'
import { createNote, createOrg, createUser } from '../../support/factories'
import { type NoteDto, readJson } from '../helpers/http'
import { actAs, actAsCaller, actAsGhost, type Caller } from '../helpers/session'

async function queueIds(): Promise<string[]> {
  return (await readJson<NoteDto[]>(await GET())).map((note) => note.id)
}

describe('GET /api/hr/expense-notes', () => {
  it.each<Caller>(['anonymous', 'employee', 'manager'])('[as-is] %s → 403 (audit §3)', async (caller) => {
    actAsCaller(await createOrg(), caller)
    const response = await GET()
    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({ error: 'Unauthorized' })
  })

  it("renvoie le DTO des notes en attente des managers racine de l'entreprise, de la plus ancienne à la plus récente", async () => {
    const org = await createOrg()
    const otherRoot = await createUser({ company: org.company, role: 'manager' })
    const recent = await createNote({ user: org.manager, createdAt: new Date('2026-10-02T08:00:00Z') })
    const oldest = await createNote({
      user: otherRoot,
      amount: 75,
      expenseDate: '2026-09-29',
      description: 'Train',
      receiptKey: 'receipts/8.pdf',
      createdAt: new Date('2026-10-01T08:00:00Z'),
    })
    actAs(org.hr)
    const notes = await readJson<NoteDto[]>(await GET())
    expect(notes.map((note) => note.id)).toEqual([oldest.id, recent.id])
    expect(notes[0]).toEqual({
      id: oldest.id,
      userId: otherRoot.id,
      amount: 75,
      expenseDate: '2026-09-29',
      description: 'Train',
      receiptKey: 'receipts/8.pdf',
      status: 'pending',
      createdAt: '2026-10-01T08:00:00.000Z',
    })
  })

  it('exclut employés, managers rattachés, notes décidées, notes RH et autres entreprises', async () => {
    const org = await createOrg()
    const expected = await createNote({ user: org.manager })
    await createNote({ user: org.manager, status: 'approved' })
    await createNote({ user: org.manager, status: 'rejected' })
    await createNote({ user: org.employee })
    await createNote({ user: await createUser({ company: org.company }) })
    await createNote({
      user: await createUser({ company: org.company, role: 'manager', manager: org.manager }),
    })
    await createNote({ user: org.hr })
    await createNote({ user: (await createOrg()).manager })
    actAs(org.hr)
    expect(await queueIds()).toEqual([expected.id])
  })

  it("session d'une RH supprimée : file vide", async () => {
    await createNote({ user: (await createOrg()).manager })
    actAsGhost('hr_admin')
    expect(await queueIds()).toEqual([])
  })
})
```

- [ ] **Step 2: Écrire `tests/integration/api/hr-decisions.test.ts`**

```ts
import { describe, expect, it } from 'vitest'
import { POST as approve } from '@/app/api/hr/expense-notes/[id]/approve/route'
import { POST as reject } from '@/app/api/hr/expense-notes/[id]/reject/route'
import { createNote, createOrg, createUser, findNote, type Org } from '../../support/factories'
import { NON_UUID_IDS, type NoteDto, UNKNOWN_ID, readJson, request, routeParams } from '../helpers/http'
import { actAs, actAsCaller, actAsGhost, type Caller } from '../helpers/session'

describe.each([
  { action: 'approve', handler: approve, decided: 'approved' },
  { action: 'reject', handler: reject, decided: 'rejected' },
] as const)('POST /api/hr/expense-notes/:id/$action', ({ action, handler, decided }) => {
  function decide(id: string, init?: RequestInit) {
    return handler(
      request(`/api/hr/expense-notes/${id}/${action}`, { method: 'POST', ...init }),
      routeParams(id)
    )
  }

  it.each<Caller>(['anonymous', 'employee', 'manager'])(
    '[as-is] %s → 403 (audit §3), note inchangée',
    async (caller) => {
      const org = await createOrg()
      const note = await createNote({ user: org.manager })
      actAsCaller(org, caller)
      const response = await decide(note.id)
      expect(response.status).toBe(403)
      expect(await response.json()).toEqual({ error: 'Unauthorized' })
      expect((await findNote(note.id))?.status).toBe('pending')
    }
  )

  it(`note d'un manager racine → ${decided}, DTO renvoyé`, async () => {
    const org = await createOrg()
    const note = await createNote({
      user: org.manager,
      amount: 75,
      expenseDate: '2026-10-05',
      description: 'Train',
      receiptKey: 'receipts/4.pdf',
      createdAt: new Date('2026-10-05T09:00:00Z'),
    })
    actAs(org.hr)
    const response = await decide(note.id)
    expect(response.status).toBe(200)
    expect(await readJson<NoteDto>(response)).toEqual({
      id: note.id,
      userId: org.manager.id,
      amount: 75,
      expenseDate: '2026-10-05',
      description: 'Train',
      receiptKey: 'receipts/4.pdf',
      status: decided,
      createdAt: '2026-10-05T09:00:00.000Z',
    })
    expect((await findNote(note.id))?.status).toBe(decided)
  })

  it('ignore le corps de la requête', async () => {
    const org = await createOrg()
    const note = await createNote({ user: org.manager })
    actAs(org.hr)
    const response = await decide(note.id, {
      body: 'pas du json',
      headers: { 'content-type': 'application/json' },
    })
    expect(response.status).toBe(200)
  })

  it.each<[string, (org: Org) => Promise<string>]>([
    ["note d'un employé rattaché", async (org) => (await createNote({ user: org.employee })).id],
    [
      "note d'un employé sans manager",
      async (org) => (await createNote({ user: await createUser({ company: org.company }) })).id,
    ],
    [
      "note d'un manager rattaché",
      async (org) =>
        (
          await createNote({
            user: await createUser({ company: org.company, role: 'manager', manager: org.manager }),
          })
        ).id,
    ],
    ['sa propre note', async (org) => (await createNote({ user: org.hr })).id],
    [
      "manager racine d'une autre entreprise",
      async () => (await createNote({ user: (await createOrg()).manager })).id,
    ],
    ['note inconnue', async () => UNKNOWN_ID],
  ])('404 : %s', async (_label, noteIdFor) => {
    const org = await createOrg()
    const id = await noteIdFor(org)
    actAs(org.hr)
    const response = await decide(id)
    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ error: 'Not found' })
  })

  it.each(['approved', 'rejected'] as const)(
    '409 si la note est déjà %s, sans la modifier',
    async (status) => {
      const org = await createOrg()
      const note = await createNote({ user: org.manager, status })
      actAs(org.hr)
      const response = await decide(note.id)
      expect(response.status).toBe(409)
      expect(await response.json()).toEqual({ error: 'Already decided' })
      expect((await findNote(note.id))?.status).toBe(status)
    }
  )

  it('une deuxième décision consécutive → 409', async () => {
    const org = await createOrg()
    const note = await createNote({ user: org.manager })
    actAs(org.hr)
    expect((await decide(note.id)).status).toBe(200)
    expect((await decide(note.id)).status).toBe(409)
  })

  it.each(NON_UUID_IDS)(
    '[as-is] id « %s » non-UUID : erreur SQL non interceptée (promesse rejetée)',
    async (id) => {
      actAs((await createOrg()).hr)
      await expect(decide(id)).rejects.toThrow(`invalid input syntax for type uuid: "${id}"`)
    }
  )

  it("session d'une RH supprimée → 404", async () => {
    const note = await createNote({ user: (await createOrg()).manager })
    actAsGhost('hr_admin')
    expect((await decide(note.id)).status).toBe(404)
  })
})
```

- [ ] **Step 3: Écrire `tests/integration/api/hr-receipt-url.test.ts`**

```ts
import { describe, expect, it } from 'vitest'
import { GET } from '@/app/api/hr/expense-notes/[id]/receipt-url/route'
import { createNote, createOrg, type Org } from '../../support/factories'
import { PNG_BYTES } from '../../support/fixtures'
import { NON_UUID_IDS, UNKNOWN_ID, readJson, request, routeParams } from '../helpers/http'
import { expectPresignedReceipt, storeReceipt } from '../helpers/s3'
import { actAs, actAsCaller, actAsGhost, type Caller } from '../helpers/session'

function receiptUrl(id: string) {
  return GET(request(`/api/hr/expense-notes/${id}/receipt-url`), routeParams(id))
}

describe('GET /api/hr/expense-notes/:id/receipt-url', () => {
  it.each<Caller>(['anonymous', 'employee', 'manager'])('[as-is] %s → 403 (audit §3)', async (caller) => {
    const org = await createOrg()
    const note = await createNote({ user: org.manager })
    actAsCaller(org, caller)
    const response = await receiptUrl(note.id)
    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({ error: 'Unauthorized' })
  })

  it.each(['pending', 'approved'] as const)(
    "URL présignée valide pour la note %s d'un manager racine",
    async (status) => {
      const org = await createOrg()
      const note = await createNote({ user: org.manager, status, receiptKey: 'receipts/21.png' })
      await storeReceipt('receipts/21.png', PNG_BYTES)
      actAs(org.hr)
      const response = await receiptUrl(note.id)
      expect(response.status).toBe(200)
      const { url } = await readJson<{ url: string }>(response)
      await expectPresignedReceipt(url, 'receipts/21.png', PNG_BYTES)
    }
  )

  it.each<[string, (org: Org) => Promise<string>]>([
    ["note d'un employé", async (org) => (await createNote({ user: org.employee })).id],
    [
      "manager racine d'une autre entreprise",
      async () => (await createNote({ user: (await createOrg()).manager })).id,
    ],
    ['note inconnue', async () => UNKNOWN_ID],
  ])('404 : %s', async (_label, noteIdFor) => {
    const org = await createOrg()
    const id = await noteIdFor(org)
    actAs(org.hr)
    const response = await receiptUrl(id)
    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ error: 'Not found' })
  })

  it.each(NON_UUID_IDS)('[as-is] id « %s » non-UUID → 500 avec stack', async (id) => {
    actAs((await createOrg()).hr)
    const response = await receiptUrl(id)
    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({
      error: `invalid input syntax for type uuid: "${id}"`,
      stack: expect.any(String),
    })
  })

  it("session d'une RH supprimée → 404", async () => {
    const note = await createNote({ user: (await createOrg()).manager })
    actAsGhost('hr_admin')
    expect((await receiptUrl(note.id)).status).toBe(404)
  })
})
```

- [ ] **Step 4: Lancer les trois fichiers**

Run: `npx vitest run tests/integration/api/hr-expense-notes.test.ts tests/integration/api/hr-decisions.test.ts tests/integration/api/hr-receipt-url.test.ts`
Expected: PASS (≈ 50 tests).

- [ ] **Step 5: Lint et typecheck**

Run: `npm run lint && npm run typecheck`
Expected: aucune erreur.

- [ ] **Step 6: Commit**

```bash
git add tests/integration/api/hr-expense-notes.test.ts tests/integration/api/hr-decisions.test.ts tests/integration/api/hr-receipt-url.test.ts
git commit -F - <<'EOF'
test(ARLA-9): caractérise la file, les décisions et les reçus côté RH

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 8: API RH — annuaire et rattachement hiérarchique

**Files:**
- Test: `tests/integration/api/hr-users.test.ts`
- Test: `tests/integration/api/hr-user-manager.test.ts`

**Interfaces:**
- Consumes: `GET()` de `src/app/api/hr/users/route.ts` ; `PUT(request: Request, { params })` de `src/app/api/hr/users/[id]/manager/route.ts` ; helpers de la Task 3.
- Produces: rien.

- [ ] **Step 1: Écrire `tests/integration/api/hr-users.test.ts`**

```ts
import { describe, expect, it } from 'vitest'
import { GET } from '@/app/api/hr/users/route'
import { createCompany, createOrg, createUser } from '../../support/factories'
import { type UserDto, readJson } from '../helpers/http'
import { actAs, actAsCaller, actAsGhost, type Caller } from '../helpers/session'

describe('GET /api/hr/users', () => {
  it.each<Caller>(['anonymous', 'employee', 'manager'])('[as-is] %s → 403 (audit §3)', async (caller) => {
    actAsCaller(await createOrg(), caller)
    const response = await GET()
    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({ error: 'Unauthorized' })
  })

  it("liste employés et managers de l'entreprise triés par nom, sans RH ni autres entreprises", async () => {
    const company = await createCompany()
    const hr = await createUser({ company, role: 'hr_admin', name: 'Aaron RH' })
    await createUser({ company, role: 'hr_admin', name: 'Berthe RH' })
    const bruno = await createUser({ company, role: 'manager', name: 'Bruno' })
    const chloe = await createUser({ company, name: 'Chloé', manager: bruno })
    const alice = await createUser({ company, name: 'Alice' })
    await createUser({ company: await createCompany(), name: 'Alain Ailleurs' })
    actAs(hr)
    expect(await readJson<UserDto[]>(await GET())).toEqual([
      { id: alice.id, name: 'Alice', email: alice.email, role: 'employee', managerId: null },
      { id: bruno.id, name: 'Bruno', email: bruno.email, role: 'manager', managerId: null },
      { id: chloe.id, name: 'Chloé', email: chloe.email, role: 'employee', managerId: bruno.id },
    ])
  })

  it("session d'une RH supprimée : liste vide", async () => {
    await createOrg()
    actAsGhost('hr_admin')
    expect(await readJson<UserDto[]>(await GET())).toEqual([])
  })
})
```

- [ ] **Step 2: Écrire `tests/integration/api/hr-user-manager.test.ts`**

```ts
import { describe, expect, it } from 'vitest'
import { PUT } from '@/app/api/hr/users/[id]/manager/route'
import { createOrg, createUser, findUser, type Org } from '../../support/factories'
import {
  NON_UUID_IDS,
  UNKNOWN_ID,
  type UserDto,
  jsonBody,
  readJson,
  request,
  routeParams,
} from '../helpers/http'
import { actAs, actAsCaller, actAsGhost, type Caller } from '../helpers/session'

function assign(targetId: string, payload: unknown) {
  return PUT(jsonBody(`/api/hr/users/${targetId}/manager`, 'PUT', payload), routeParams(targetId))
}

function assignRaw(targetId: string, init: RequestInit) {
  return PUT(request(`/api/hr/users/${targetId}/manager`, { method: 'PUT', ...init }), routeParams(targetId))
}

async function managerIdOf(userId: string): Promise<string | null | undefined> {
  return (await findUser(userId))?.manager_id
}

const MULTIPART_BODY = new FormData()
MULTIPART_BODY.set('managerId', 'ignoré')
const JSON_HEADERS = { 'content-type': 'application/json' }

describe('PUT /api/hr/users/:id/manager', () => {
  it.each<Caller>(['anonymous', 'employee', 'manager'])(
    '[as-is] %s → 403 (audit §3), rattachement inchangé',
    async (caller) => {
      const org = await createOrg()
      const newcomer = await createUser({ company: org.company })
      actAsCaller(org, caller)
      const response = await assign(newcomer.id, { managerId: org.manager.id })
      expect(response.status).toBe(403)
      expect(await response.json()).toEqual({ error: 'Unauthorized' })
      expect(await managerIdOf(newcomer.id)).toBeNull()
    }
  )

  it('rattache un employé sans manager et renvoie son DTO', async () => {
    const org = await createOrg()
    const newcomer = await createUser({ company: org.company, name: 'Paul' })
    actAs(org.hr)
    const response = await assign(newcomer.id, { managerId: org.manager.id })
    expect(response.status).toBe(200)
    expect(await readJson<UserDto>(response)).toEqual({
      id: newcomer.id,
      name: 'Paul',
      email: newcomer.email,
      role: 'employee',
      managerId: org.manager.id,
    })
    expect(await managerIdOf(newcomer.id)).toBe(org.manager.id)
  })

  it('change de manager', async () => {
    const org = await createOrg()
    const other = await createUser({ company: org.company, role: 'manager' })
    actAs(org.hr)
    expect((await assign(org.employee.id, { managerId: other.id })).status).toBe(200)
    expect(await managerIdOf(org.employee.id)).toBe(other.id)
  })

  it('détache avec managerId null', async () => {
    const org = await createOrg()
    actAs(org.hr)
    const response = await assign(org.employee.id, { managerId: null })
    expect(response.status).toBe(200)
    expect((await readJson<UserDto>(response)).managerId).toBeNull()
    expect(await managerIdOf(org.employee.id)).toBeNull()
  })

  it('rattache un manager à un autre manager', async () => {
    const org = await createOrg()
    const boss = await createUser({ company: org.company, role: 'manager' })
    actAs(org.hr)
    const response = await assign(org.manager.id, { managerId: boss.id })
    expect(response.status).toBe(200)
    expect(await readJson<UserDto>(response)).toMatchObject({ role: 'manager', managerId: boss.id })
  })

  it.each<[string, (org: Org) => Promise<string>]>([
    ["cible d'une autre entreprise", async () => (await createOrg()).employee.id],
    ['cible RH (soi-même)', async (org) => org.hr.id],
    [
      'cible RH de la même entreprise',
      async (org) => (await createUser({ company: org.company, role: 'hr_admin' })).id,
    ],
    ['cible inconnue', async () => UNKNOWN_ID],
  ])('404 : %s', async (_label, targetFor) => {
    const org = await createOrg()
    const targetId = await targetFor(org)
    actAs(org.hr)
    const response = await assign(targetId, { managerId: org.manager.id })
    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ error: 'Not found' })
  })

  it.each<[string, (org: Org) => Promise<[string, string]>]>([
    ['auto-rattachement', async (org) => [org.manager.id, org.manager.id]],
    [
      'le manager choisi est un employé',
      async (org) => [org.employee.id, (await createUser({ company: org.company })).id],
    ],
    ['le manager choisi est RH', async (org) => [org.employee.id, org.hr.id]],
    ['le manager choisi est inconnu', async (org) => [org.employee.id, UNKNOWN_ID]],
  ])('409 « Invalid manager » : %s', async (_label, pairFor) => {
    const org = await createOrg()
    const [targetId, managerId] = await pairFor(org)
    const before = await managerIdOf(targetId)
    actAs(org.hr)
    const response = await assign(targetId, { managerId })
    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({ error: 'Invalid manager' })
    expect(await managerIdOf(targetId)).toBe(before)
  })

  it("[as-is] accepte un manager d'une autre entreprise (audit §3)", async () => {
    const org = await createOrg()
    const foreign = (await createOrg()).manager
    actAs(org.hr)
    expect((await assign(org.employee.id, { managerId: foreign.id })).status).toBe(200)
    expect(await managerIdOf(org.employee.id)).toBe(foreign.id)
  })

  it.each<[string, RequestInit]>([
    ['corps non JSON', { body: 'pas du json', headers: JSON_HEADERS }],
    ['corps vide', {}],
    ['objet sans managerId', { body: '{}', headers: JSON_HEADERS }],
    ['formulaire multipart', { body: MULTIPART_BODY }],
  ])('[as-is] %s : détachement silencieux', async (_label, init) => {
    const org = await createOrg()
    actAs(org.hr)
    const response = await assignRaw(org.employee.id, init)
    expect(response.status).toBe(200)
    expect((await readJson<UserDto>(response)).managerId).toBeNull()
    expect(await managerIdOf(org.employee.id)).toBeNull()
  })

  it.each<[unknown, string]>([
    [42, 'invalid input syntax for type uuid: "42"'],
    ['', 'invalid input syntax for type uuid: ""'],
  ])('[as-is] managerId %j de mauvais type → 500 avec stack', async (managerId, message) => {
    const org = await createOrg()
    actAs(org.hr)
    const response = await assign(org.employee.id, { managerId })
    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ error: message, stack: expect.any(String) })
  })

  it('[as-is] accepte un cycle entre deux managers', async () => {
    const org = await createOrg()
    const other = await createUser({ company: org.company, role: 'manager' })
    actAs(org.hr)
    expect((await assign(org.manager.id, { managerId: other.id })).status).toBe(200)
    expect((await assign(other.id, { managerId: org.manager.id })).status).toBe(200)
    expect(await managerIdOf(org.manager.id)).toBe(other.id)
    expect(await managerIdOf(other.id)).toBe(org.manager.id)
  })

  it.each(NON_UUID_IDS)('[as-is] cible « %s » non-UUID → 500 avec stack', async (id) => {
    const org = await createOrg()
    actAs(org.hr)
    const response = await assign(id, { managerId: org.manager.id })
    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({
      error: `invalid input syntax for type uuid: "${id}"`,
      stack: expect.any(String),
    })
  })

  it("session d'une RH supprimée → 404", async () => {
    const org = await createOrg()
    actAsGhost('hr_admin')
    expect((await assign(org.employee.id, { managerId: null })).status).toBe(404)
    expect(await managerIdOf(org.employee.id)).toBe(org.manager.id)
  })
})
```

- [ ] **Step 3: Lancer les deux fichiers**

Run: `npx vitest run tests/integration/api/hr-users.test.ts tests/integration/api/hr-user-manager.test.ts`
Expected: PASS (≈ 33 tests).

- [ ] **Step 4: Lint et typecheck**

Run: `npm run lint && npm run typecheck`
Expected: aucune erreur.

- [ ] **Step 5: Commit**

```bash
git add tests/integration/api/hr-users.test.ts tests/integration/api/hr-user-manager.test.ts
git commit -F - <<'EOF'
test(ARLA-9): caractérise l'annuaire RH et le rattachement hiérarchique

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 9: Server actions d'authentification

**Files:**
- Test: `tests/integration/actions/auth.test.ts`

**Interfaces:**
- Consumes: `signup(prev: AuthFormState, formData: FormData)`, `login(prev, formData)`, `logout()` de `src/app/actions/auth.ts` ; `CredentialsSignin` de `next-auth` (chargé grâce à `server.deps.inline`) ; `signInMock`, `signOutMock` (Task 3).
- Produces: rien.

- [ ] **Step 1: Écrire `tests/integration/actions/auth.test.ts`**

```ts
import bcrypt from 'bcryptjs'
import { CredentialsSignin } from 'next-auth'
import { describe, expect, it } from 'vitest'
import { login, logout, signup } from '@/app/actions/auth'
import { testDb } from '../../support/db'
import { countRows } from '../../support/factories'
import { signInMock, signOutMock } from '../helpers/session'

const VALIDATION_ERROR = {
  error: 'Nom requis, email invalide, ou mot de passe trop court (8 caractères minimum).',
}
const VALID = { name: 'Alice Martin', email: 'alice@acme.fr', password: 'motdepasse' }

function form(fields: Record<string, string>): FormData {
  const data = new FormData()
  for (const [name, value] of Object.entries(fields)) data.set(name, value)
  return data
}

interface SignedUpUser {
  name: string
  email: string
  role: string
  manager_id: string | null
  company_id: string
  password_hash: string
  company_name: string
  email_domain: string
}

async function userByEmail(email: string): Promise<SignedUpUser> {
  const { rows } = await testDb().query<SignedUpUser>(
    `SELECT u.name, u.email, u.role, u.manager_id, u.company_id, u.password_hash,
            c.name AS company_name, c.email_domain
     FROM users u JOIN companies c ON c.id = u.company_id
     WHERE u.email = $1`,
    [email]
  )
  return rows[0]
}

describe('signup', () => {
  it.each<[string, Record<string, string>]>([
    ['nom absent', { email: VALID.email, password: VALID.password }],
    ["nom fait d'espaces", { ...VALID, name: '   ' }],
    ['email absent', { name: VALID.name, password: VALID.password }],
    ['email sans @', { ...VALID, email: 'alice.acme.fr' }],
    ['domaine sans point', { ...VALID, email: 'alice@acme' }],
    ['email avec espace', { ...VALID, email: 'alice martin@acme.fr' }],
    ['mot de passe absent', { name: VALID.name, email: VALID.email }],
    ['mot de passe de 7 caractères', { ...VALID, password: '1234567' }],
  ])('refuse : %s', async (_label, fields) => {
    expect(await signup({}, form(fields))).toEqual(VALIDATION_ERROR)
    expect(await countRows('users')).toBe(0)
    expect(signInMock).not.toHaveBeenCalled()
  })

  it("premier inscrit d'un domaine : crée l'entreprise et devient hr_admin", async () => {
    expect(await signup({}, form({ ...VALID, name: '  Alice Martin  ' }))).toEqual({})
    const user = await userByEmail(VALID.email)
    expect(user).toMatchObject({
      name: 'Alice Martin',
      role: 'hr_admin',
      manager_id: null,
      company_name: 'acme',
      email_domain: 'acme.fr',
    })
    expect(await bcrypt.compare(VALID.password, user.password_hash)).toBe(true)
    expect(bcrypt.getRounds(user.password_hash)).toBe(12)
    expect(signInMock).toHaveBeenCalledWith('credentials', {
      email: VALID.email,
      password: VALID.password,
      redirectTo: '/expenses',
    })
  })

  it('accepte un mot de passe de 8 caractères pile', async () => {
    expect(await signup({}, form({ ...VALID, password: '12345678' }))).toEqual({})
  })

  it('inscrits suivants du même domaine : employés de la même entreprise, sans manager', async () => {
    await signup({}, form(VALID))
    await signup({}, form({ name: 'Bob', email: 'bob@acme.fr', password: 'motdepasse' }))
    const alice = await userByEmail(VALID.email)
    expect(await userByEmail('bob@acme.fr')).toMatchObject({
      role: 'employee',
      manager_id: null,
      company_id: alice.company_id,
    })
    expect(await countRows('companies')).toBe(1)
  })

  it("met le domaine en minuscules mais stocke l'email tel que saisi", async () => {
    await signup({}, form({ ...VALID, email: 'Alice@ACME.FR' }))
    expect(await userByEmail('Alice@ACME.FR')).toMatchObject({
      email: 'Alice@ACME.FR',
      company_name: 'acme',
      email_domain: 'acme.fr',
    })
  })

  it("[as-is] unicité de l'email sensible à la casse : deux comptes distincts", async () => {
    await signup({}, form(VALID))
    expect(await signup({}, form({ ...VALID, email: 'ALICE@acme.fr' }))).toEqual({})
    expect(await countRows('users')).toBe(2)
  })

  it('[as-is] un sous-domaine fonde une autre entreprise', async () => {
    await signup({}, form(VALID))
    await signup({}, form({ name: 'Bob', email: 'bob@paris.acme.fr', password: 'motdepasse' }))
    expect(await userByEmail('bob@paris.acme.fr')).toMatchObject({
      role: 'hr_admin',
      company_name: 'paris',
      email_domain: 'paris.acme.fr',
    })
    expect(await countRows('companies')).toBe(2)
  })

  it('refuse un email déjà inscrit', async () => {
    await signup({}, form(VALID))
    expect(await signup({}, form(VALID))).toEqual({ error: 'Un compte existe déjà avec cet email.' })
    expect(await countRows('users')).toBe(1)
    expect(signInMock).toHaveBeenCalledOnce()
  })

  it('connexion automatique en échec : compte créé quand même', async () => {
    signInMock.mockRejectedValueOnce(new CredentialsSignin())
    expect(await signup({}, form(VALID))).toEqual({
      error: 'Le compte a été créé mais la connexion automatique a échoué.',
    })
    expect(await countRows('users')).toBe(1)
  })

  it('relance les autres erreurs de signIn (dont la redirection de Next en production)', async () => {
    signInMock.mockRejectedValueOnce(new Error('NEXT_REDIRECT'))
    await expect(signup({}, form(VALID))).rejects.toThrow('NEXT_REDIRECT')
    expect(await countRows('users')).toBe(1)
  })
})

describe('login', () => {
  it.each<[string, Record<string, string>]>([
    ['email absent', { password: 'secret' }],
    ['mot de passe absent', { email: 'alice@acme.fr' }],
  ])('%s → « Champs invalides. »', async (_label, fields) => {
    expect(await login({}, form(fields))).toEqual({ error: 'Champs invalides.' })
    expect(signInMock).not.toHaveBeenCalled()
  })

  it('délègue à signIn avec redirection vers /expenses', async () => {
    expect(await login({}, form({ email: 'alice@acme.fr', password: 'secret' }))).toEqual({})
    expect(signInMock).toHaveBeenCalledWith('credentials', {
      email: 'alice@acme.fr',
      password: 'secret',
      redirectTo: '/expenses',
    })
  })

  it('[as-is] champs vides transmis tels quels à signIn', async () => {
    await login({}, form({ email: '', password: '' }))
    expect(signInMock).toHaveBeenCalledWith('credentials', {
      email: '',
      password: '',
      redirectTo: '/expenses',
    })
  })

  it('identifiants refusés → message générique', async () => {
    signInMock.mockRejectedValueOnce(new CredentialsSignin())
    expect(await login({}, form({ email: 'alice@acme.fr', password: 'faux' }))).toEqual({
      error: 'Email ou mot de passe incorrect.',
    })
  })

  it('relance les autres erreurs (dont la redirection de Next en production)', async () => {
    signInMock.mockRejectedValueOnce(new Error('NEXT_REDIRECT'))
    await expect(login({}, form({ email: 'alice@acme.fr', password: 'secret' }))).rejects.toThrow(
      'NEXT_REDIRECT'
    )
  })
})

describe('logout', () => {
  it('déconnecte et redirige vers /login', async () => {
    await logout()
    expect(signOutMock).toHaveBeenCalledWith({ redirectTo: '/login' })
  })
})
```

- [ ] **Step 2: Lancer le fichier**

Run: `npx vitest run tests/integration/actions/auth.test.ts`
Expected: PASS (≈ 24 tests). Si l'import de `next-auth` échoue (`ERR_MODULE_NOT_FOUND … next/server`), vérifier que `server.deps.inline: ['next-auth']` est bien dans le projet `integration` (Task 3, Step 14).

- [ ] **Step 3: Lint et typecheck**

Run: `npm run lint && npm run typecheck`
Expected: aucune erreur.

- [ ] **Step 4: Commit**

```bash
git add tests/integration/actions/auth.test.ts
git commit -F - <<'EOF'
test(ARLA-9): caractérise l'inscription, la connexion et la déconnexion

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 10: Scénarios transverses du circuit de validation

**Files:**
- Test: `tests/integration/workflow.test.ts`

**Interfaces:**
- Consumes: les handlers `GET /api/expense-notes`, `GET /api/manager/expense-notes`, `POST …/manager/…/approve`, `GET /api/hr/expense-notes`, `POST …/hr/…/approve`, `PUT /api/hr/users/:id/manager` ; helpers de la Task 3.
- Produces: rien.

- [ ] **Step 1: Écrire `tests/integration/workflow.test.ts`**

```ts
import { describe, expect, it } from 'vitest'
import { GET as myNotes } from '@/app/api/expense-notes/route'
import { GET as hrQueue } from '@/app/api/hr/expense-notes/route'
import { POST as hrApprove } from '@/app/api/hr/expense-notes/[id]/approve/route'
import { PUT as assignManager } from '@/app/api/hr/users/[id]/manager/route'
import { GET as managerQueue } from '@/app/api/manager/expense-notes/route'
import { POST as managerApprove } from '@/app/api/manager/expense-notes/[id]/approve/route'
import { testDb } from '../support/db'
import { createNote, createOrg, createUser, type Role, type UserRow } from '../support/factories'
import { type NoteDto, jsonBody, readJson, request, routeParams } from './helpers/http'
import { actAs } from './helpers/session'

async function managerQueueOf(manager: UserRow, role: Role = manager.role): Promise<string[]> {
  actAs(manager, role)
  return (await readJson<NoteDto[]>(await managerQueue())).map((note) => note.id)
}

async function hrQueueOf(hr: UserRow): Promise<string[]> {
  actAs(hr)
  return (await readJson<NoteDto[]>(await hrQueue())).map((note) => note.id)
}

function approveAsManager(id: string) {
  return managerApprove(request(`/api/manager/expense-notes/${id}/approve`, { method: 'POST' }), routeParams(id))
}

function approveAsHr(id: string) {
  return hrApprove(request(`/api/hr/expense-notes/${id}/approve`, { method: 'POST' }), routeParams(id))
}

function assign(targetId: string, managerId: string | null) {
  return assignManager(
    jsonBody(`/api/hr/users/${targetId}/manager`, 'PUT', { managerId }),
    routeParams(targetId)
  )
}

async function statusSeenBy(user: UserRow, noteId: string): Promise<string | undefined> {
  actAs(user)
  const notes = await readJson<NoteDto[]>(await myNotes(request('/api/expense-notes')))
  return notes.find((note) => note.id === noteId)?.status
}

describe('circuit de validation', () => {
  it("note d'employé : le manager approuve, l'employé voit « approved »", async () => {
    const org = await createOrg()
    const note = await createNote({ user: org.employee })
    expect(await managerQueueOf(org.manager)).toEqual([note.id])
    actAs(org.manager)
    expect((await approveAsManager(note.id)).status).toBe(200)
    expect(await managerQueueOf(org.manager)).toEqual([])
    expect(await statusSeenBy(org.employee, note.id)).toBe('approved')
  })

  it('note de manager racine : la RH approuve, le manager voit « approved »', async () => {
    const org = await createOrg()
    const note = await createNote({ user: org.manager })
    expect(await hrQueueOf(org.hr)).toEqual([note.id])
    actAs(org.hr)
    expect((await approveAsHr(note.id)).status).toBe(200)
    expect(await hrQueueOf(org.hr)).toEqual([])
    expect(await statusSeenBy(org.manager, note.id)).toBe('approved')
  })

  it("[as-is] note d'un employé sans manager : dans aucune file (audit, circuit de validation)", async () => {
    const org = await createOrg()
    await createNote({ user: await createUser({ company: org.company }) })
    expect(await managerQueueOf(org.manager)).toEqual([])
    expect(await hrQueueOf(org.hr)).toEqual([])
  })

  it("[as-is] note d'une RH : dans aucune file (audit, circuit de validation)", async () => {
    const org = await createOrg()
    await createNote({ user: org.hr })
    expect(await managerQueueOf(org.manager)).toEqual([])
    expect(await hrQueueOf(org.hr)).toEqual([])
  })

  it('rattacher un manager racine déplace sa note de la file RH vers celle de son nouveau manager', async () => {
    const org = await createOrg()
    const boss = await createUser({ company: org.company, role: 'manager' })
    const note = await createNote({ user: org.manager })
    expect(await hrQueueOf(org.hr)).toEqual([note.id])
    actAs(org.hr)
    expect((await assign(org.manager.id, boss.id)).status).toBe(200)
    expect(await hrQueueOf(org.hr)).toEqual([])
    expect(await managerQueueOf(boss)).toEqual([note.id])
  })

  it("[as-is] un manager d'une autre entreprise peut valider la note d'un employé que la RH lui a rattaché (audit §3)", async () => {
    const org = await createOrg()
    const foreignManager = (await createOrg()).manager
    const note = await createNote({ user: org.employee })
    actAs(org.hr)
    expect((await assign(org.employee.id, foreignManager.id)).status).toBe(200)
    expect(await managerQueueOf(foreignManager)).toEqual([note.id])
    actAs(foreignManager)
    expect((await approveAsManager(note.id)).status).toBe(200)
  })
})

describe('rôle figé dans la session (audit §5)', () => {
  it('[as-is] un manager rétrogradé en base garde ses droits tant que sa session dure', async () => {
    const org = await createOrg()
    const note = await createNote({ user: org.employee })
    await testDb().query("UPDATE users SET role = 'employee' WHERE id = $1", [org.manager.id])
    expect(await managerQueueOf(org.manager, 'manager')).toEqual([note.id])
    actAs(org.manager, 'manager')
    expect((await approveAsManager(note.id)).status).toBe(200)
  })

  it('[as-is] un employé promu en base reste refusé tant que sa session dit « employee »', async () => {
    const org = await createOrg()
    await testDb().query("UPDATE users SET role = 'manager' WHERE id = $1", [org.employee.id])
    actAs(org.employee, 'employee')
    expect((await managerQueue()).status).toBe(401)
  })
})
```

- [ ] **Step 2: Lancer le fichier puis toute la suite**

Run: `npx vitest run tests/integration/workflow.test.ts && npm test`
Expected: PASS ; la suite complète (unit + intégration) compte ≈ 330 tests en comptant chaque cas paramétré.

- [ ] **Step 3: Lint et typecheck**

Run: `npm run lint && npm run typecheck`
Expected: aucune erreur.

- [ ] **Step 4: Commit**

```bash
git add tests/integration/workflow.test.ts
git commit -F - <<'EOF'
test(ARLA-9): caractérise le circuit de validation de bout en bout

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 11: Couverture et seuils

**Files:**
- Modify: `vitest.config.mts` (bloc `coverage`)
- Modify: `package.json` (devDependency, script `test:coverage`)
- Modify: `Makefile` (cible `coverage`)
- Create: `scripts/coverage-summary.mjs`

**Interfaces:**
- Consumes: toute la suite Vitest (Tasks 1 à 10).
- Produces: `npm run test:coverage` → `coverage/` (HTML, `lcov.info`, `coverage-summary.json`) ; `node scripts/coverage-summary.mjs` → tableau Markdown sur stdout (utilisé par la CI, Task 16).

- [ ] **Step 1: Installer le provider v8 et ajouter le script**

```bash
npm install -D @vitest/coverage-v8@^5.0.3
npm pkg set scripts.test:coverage="vitest run --coverage"
```

- [ ] **Step 2: Ajouter la couverture à `vitest.config.mts`** — dans `test`, avant `projects` :

```ts
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov', 'json-summary'],
      reportsDirectory: 'coverage',
      // Périmètre : le code que Vitest exécute réellement. Hors périmètre :
      // - src/domain, src/ports, src/adapters, src/utils : code mort (audit §2) ;
      // - src/lib/auth.ts, src/proxy.ts, src/app/api/auth/** : mockés ici,
      //   couverts par Playwright ;
      // - pages, layout et composants React : couverts par Playwright ;
      // - src/types : déclarations seules.
      include: [
        'src/app/api/**/*.ts',
        'src/app/actions/**/*.ts',
        'src/lib/db.ts',
        'src/lib/errors.ts',
        'src/lib/ocr.ts',
        'src/lib/storage.ts',
      ],
      exclude: ['src/app/api/auth/**'],
      thresholds: { lines: 90, branches: 85, functions: 90 },
    },
```

- [ ] **Step 3: Mesurer**

Run: `npm run test:coverage`
Expected: PASS et seuils respectés. Noter les totaux (lignes / branches / fonctions / statements) affichés. Si un seuil n'est pas atteint : ouvrir `coverage/index.html`, identifier les lignes non couvertes et ajouter le test manquant dans le fichier de la tâche propriétaire (ne jamais baisser un seuil sous 90/85/90). Les seules branches qui peuvent rester non couvertes sont inatteignables depuis l'API (ex. `?? path.extname(...)` dans `api/expense-notes/route.ts`, `DATABASE_URL is not set` dans `db.ts`).

- [ ] **Step 4: Créer `scripts/coverage-summary.mjs`**

```js
// Écrit le tableau de couverture Vitest en Markdown (résumé du job CI) :
// `node scripts/coverage-summary.mjs >> "$GITHUB_STEP_SUMMARY"`.
import { readFile } from 'node:fs/promises'

const { total } = JSON.parse(await readFile('coverage/coverage-summary.json', 'utf8'))
const metrics = [
  ['Lignes', 'lines'],
  ['Branches', 'branches'],
  ['Fonctions', 'functions'],
  ['Instructions', 'statements'],
]

console.log(
  [
    '### Couverture Vitest',
    '',
    '| Métrique | % | Couvert |',
    '|---|---|---|',
    ...metrics.map(
      ([label, key]) => `| ${label} | ${total[key].pct} % | ${total[key].covered} / ${total[key].total} |`
    ),
  ].join('\n')
)
```

- [ ] **Step 5: Vérifier le script**

Run: `node scripts/coverage-summary.mjs`
Expected: un tableau Markdown de 4 lignes avec les pourcentages notés au Step 3.

- [ ] **Step 6: Ajouter la cible `coverage` au `Makefile`** — ajouter `coverage` à `.PHONY`, puis après la cible `test` :

```make
coverage: up ## Tests Vitest avec rapport de couverture (coverage/index.html)
	npm run test:coverage
```

- [ ] **Step 7: Lint et typecheck**

Run: `npm run lint && npm run typecheck`
Expected: aucune erreur (les fichiers générés dans `coverage/` sont ignorés depuis la Task 1).

- [ ] **Step 8: Commit**

```bash
git add vitest.config.mts package.json package-lock.json Makefile scripts/coverage-summary.mjs
git commit -F - <<'EOF'
test(ARLA-9): mesure de couverture v8 et seuils bloquants

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 12: Outillage Playwright et parcours d'authentification

**Files:**
- Modify: `package.json` (devDependency, script `test:e2e`)
- Modify: `Makefile` (cible `e2e`)
- Create: `playwright.config.ts`
- Create: `tests/e2e/global-setup.ts`, `tests/e2e/helpers.ts`
- Test: `tests/e2e/auth.spec.ts`

**Interfaces:**
- Consumes: `E2E_ENV`, `E2E_DATABASE_NAME`, `E2E_PORT`, `BASE_URL` (env.ts) ; `ensureDatabase`, `migrate`, `ensureBucket` (infra.ts) ; `truncateAll`, `closeTestDb` (db.ts) ; `createOrg`, `uniqueId`, `TEST_PASSWORD`, `UserRow` (factories.ts).
- Produces (`tests/e2e/helpers.ts`) : `CONTEXT_OPTIONS`, `newPage(browser): Promise<Page>`, `loginAs(browser, user: Pick<UserRow, 'email'>): Promise<Page>`, `signup(page, name, email, password?): Promise<void>`, `submitNote(page, note: { amount; date; description; file? }): Promise<void>`, `closeContexts(): Promise<void>`.

- [ ] **Step 1: Installer Playwright et Chromium**

```bash
npm install -D @playwright/test@^1.64.0
npx playwright install chromium
npm pkg set scripts.test:e2e="playwright test"
```

- [ ] **Step 2: Créer `playwright.config.ts`**

```ts
import { defineConfig, devices } from '@playwright/test'
import { BASE_URL, E2E_ENV, E2E_PORT } from './tests/support/env'

// Les helpers de test (factories) lisent DATABASE_URL : on les pointe sur la
// base E2E, dans le process principal comme dans les workers (qui rechargent
// ce fichier).
Object.assign(process.env, E2E_ENV)

export default defineConfig({
  testDir: 'tests/e2e',
  globalSetup: './tests/e2e/global-setup.ts',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never' }]]
    : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: BASE_URL,
    locale: 'fr-FR',
    // Les dates sont formatées dans le fuseau du navigateur.
    timezoneId: 'Europe/Paris',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // Build de production, au plus près de la prod ; port distinct de `make dev`.
    command: `npm run build && npm run start -- -p ${E2E_PORT}`,
    url: `${BASE_URL}/login`,
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
    stdout: 'pipe',
    // L'environnement du process prime sur .env : l'app vise la base et le
    // bucket E2E. AUTH_TRUST_HOST est requis par Auth.js en `next start`.
    env: { ...E2E_ENV, AUTH_TRUST_HOST: 'true' },
  },
})
```

- [ ] **Step 3: Créer `tests/e2e/global-setup.ts`**

```ts
import { closeTestDb, truncateAll } from '../support/db'
import { E2E_DATABASE_NAME, E2E_ENV } from '../support/env'
import { ensureBucket, ensureDatabase, migrate } from '../support/infra'

export default async function setupE2e(): Promise<void> {
  await ensureDatabase(E2E_DATABASE_NAME)
  await migrate(E2E_ENV.DATABASE_URL)
  await truncateAll()
  await closeTestDb()
  await ensureBucket(E2E_ENV)
}
```

- [ ] **Step 4: Créer `tests/e2e/helpers.ts`**

```ts
import type { Browser, BrowserContext, Page } from '@playwright/test'
import { BASE_URL } from '../support/env'
import { TEST_PASSWORD, type UserRow } from '../support/factories'
import { PNG_BYTES } from '../support/fixtures'

// Options passées explicitement : un contexte créé à la main ne doit pas
// dépendre de l'héritage de la config.
export const CONTEXT_OPTIONS = { baseURL: BASE_URL, locale: 'fr-FR', timezoneId: 'Europe/Paris' }

const openContexts: BrowserContext[] = []

/** Page dans un contexte isolé (cookies propres). Fermée par closeContexts(). */
export async function newPage(browser: Browser): Promise<Page> {
  const context = await browser.newContext(CONTEXT_OPTIONS)
  openContexts.push(context)
  return context.newPage()
}

export async function closeContexts(): Promise<void> {
  await Promise.all(openContexts.splice(0).map((context) => context.close()))
}

/** Connexion par le vrai formulaire de login, dans un contexte isolé. */
export async function loginAs(browser: Browser, user: Pick<UserRow, 'email'>): Promise<Page> {
  const page = await newPage(browser)
  await page.goto('/login')
  await page.getByLabel('Email', { exact: true }).fill(user.email)
  await page.getByLabel('Mot de passe', { exact: true }).fill(TEST_PASSWORD)
  await page.getByRole('button', { name: 'Se connecter' }).click()
  await page.waitForURL('**/expenses')
  return page
}

export async function signup(page: Page, name: string, email: string, password = 'motdepasse-e2e'): Promise<void> {
  await page.goto('/signup')
  await page.getByLabel('Nom', { exact: true }).fill(name)
  await page.getByLabel('Email', { exact: true }).fill(email)
  await page.getByLabel('Mot de passe', { exact: true }).fill(password)
  await page.getByRole('button', { name: "S'inscrire" }).click()
}

export async function submitNote(
  page: Page,
  note: {
    amount: string
    date: string
    description: string
    file?: { name: string; mimeType: string; buffer: Buffer }
  }
): Promise<void> {
  await page.getByLabel('Montant (€)', { exact: true }).fill(note.amount)
  await page.getByLabel('Date', { exact: true }).fill(note.date)
  await page.getByLabel('Description', { exact: true }).fill(note.description)
  await page
    .getByLabel('Reçu (image ou PDF)', { exact: true })
    .setInputFiles(note.file ?? { name: 'recu.png', mimeType: 'image/png', buffer: Buffer.from(PNG_BYTES) })
  await page.getByRole('button', { name: 'Soumettre' }).click()
}
```

- [ ] **Step 5: Écrire `tests/e2e/auth.spec.ts`**

```ts
import { expect, test } from '@playwright/test'
import { createOrg, uniqueId } from '../support/factories'
import { closeContexts, loginAs, newPage, signup } from './helpers'

test.afterEach(closeContexts)

test.describe('inscription', () => {
  test("le premier inscrit d'un domaine devient RH, le suivant employé", async ({ page, browser }) => {
    const domain = `e2e-${uniqueId()}.test`
    await signup(page, 'Rita', `rita@${domain}`)
    await page.waitForURL('**/expenses')
    await expect(page.getByRole('heading', { name: 'Mes notes de frais' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'RH', exact: true })).toBeVisible()

    const second = await newPage(browser)
    await signup(second, 'Paul', `paul@${domain}`)
    await second.waitForURL('**/expenses')
    await expect(second.getByRole('button', { name: 'Se déconnecter' })).toBeVisible()
    await expect(second.getByRole('link', { name: 'RH', exact: true })).toHaveCount(0)
    await expect(second.getByRole('link', { name: 'Manager', exact: true })).toHaveCount(0)
  })

  test('refuse un email déjà utilisé', async ({ page }) => {
    const { employee } = await createOrg()
    await signup(page, 'Doublon', employee.email)
    await expect(page.getByRole('alert')).toHaveText('Un compte existe déjà avec cet email.')
    await expect(page).toHaveURL(/\/signup$/)
  })
})

test.describe('connexion', () => {
  test('mauvais mot de passe : message générique, reste sur /login', async ({ page }) => {
    const { employee } = await createOrg()
    await page.goto('/login')
    await page.getByLabel('Email', { exact: true }).fill(employee.email)
    await page.getByLabel('Mot de passe', { exact: true }).fill('mauvais-mot-de-passe')
    await page.getByRole('button', { name: 'Se connecter' }).click()
    await expect(page.getByRole('alert')).toHaveText('Email ou mot de passe incorrect.')
    await expect(page).toHaveURL(/\/login$/)
  })

  test('email inconnu : même message générique', async ({ page }) => {
    await page.goto('/login')
    await page.getByLabel('Email', { exact: true }).fill(`inconnu@e2e-${uniqueId()}.test`)
    await page.getByLabel('Mot de passe', { exact: true }).fill('peu-importe')
    await page.getByRole('button', { name: 'Se connecter' }).click()
    await expect(page.getByRole('alert')).toHaveText('Email ou mot de passe incorrect.')
  })

  test('navigation selon le rôle : Manager pour un manager, RH pour une RH', async ({ browser }) => {
    const org = await createOrg()
    const managerPage = await loginAs(browser, org.manager)
    await expect(managerPage.getByRole('link', { name: 'Manager', exact: true })).toBeVisible()
    await expect(managerPage.getByRole('link', { name: 'RH', exact: true })).toHaveCount(0)
    const hrPage = await loginAs(browser, org.hr)
    await expect(hrPage.getByRole('link', { name: 'RH', exact: true })).toBeVisible()
    await expect(hrPage.getByRole('link', { name: 'Manager', exact: true })).toHaveCount(0)
  })

  test('déconnexion : retour à /login, pages protégées refermées', async ({ browser }) => {
    const page = await loginAs(browser, (await createOrg()).employee)
    await page.getByRole('button', { name: 'Se déconnecter' }).click()
    await page.waitForURL('**/login')
    await page.goto('/expenses')
    await expect(page).toHaveURL(/\/login$/)
  })

  test("utilisateur connecté sur l'accueil : redirigé vers /expenses", async ({ browser }) => {
    const page = await loginAs(browser, (await createOrg()).employee)
    await page.goto('/')
    await expect(page).toHaveURL(/\/expenses$/)
  })
})

test.describe('pages protégées', () => {
  for (const path of ['/expenses', '/manager', '/hr']) {
    test(`${path} en anonyme → /login`, async ({ page }) => {
      await page.goto(path)
      await expect(page).toHaveURL(/\/login$/)
    })
  }

  test('[as-is] un employé connecté voit /manager et /hr avec un simple message de refus', async ({ browser }) => {
    const page = await loginAs(browser, (await createOrg()).employee)
    await page.goto('/manager')
    await expect(page.getByRole('heading', { name: 'Accès réservé aux managers' })).toBeVisible()
    await page.goto('/hr')
    await expect(page.getByRole('heading', { name: 'Accès réservé aux RH' })).toBeVisible()
  })

  test('[as-is] un manager connecté voit /hr avec un simple message de refus', async ({ browser }) => {
    const page = await loginAs(browser, (await createOrg()).manager)
    await page.goto('/hr')
    await expect(page.getByRole('heading', { name: 'Accès réservé aux RH' })).toBeVisible()
  })
})
```

- [ ] **Step 6: Ajouter la cible `e2e` au `Makefile`** — ajouter `e2e` à `.PHONY`, puis après la cible `coverage` :

```make
e2e: up ## Lance les tests end-to-end (Playwright, build de prod sur le port 3100)
	npm run test:e2e
```

- [ ] **Step 7: Lancer la spec**

Run: `npx playwright test tests/e2e/auth.spec.ts`
Expected: le build Next passe, puis PASS — 12 tests. En cas d'échec, ouvrir `npx playwright show-report` (trace et capture) ; appliquer la règle de caractérisation pour les textes affichés.

- [ ] **Step 8: Lint et typecheck**

Run: `npm run lint && npm run typecheck`
Expected: aucune erreur.

- [ ] **Step 9: Commit**

```bash
git add package.json package-lock.json Makefile playwright.config.ts tests/e2e
git commit -F - <<'EOF'
test(ARLA-9): outillage Playwright et parcours d'authentification

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 13: Parcours E2E — soumission, validation, administration RH

**Files:**
- Test: `tests/e2e/expense-submission.spec.ts`
- Test: `tests/e2e/approval-workflow.spec.ts`
- Test: `tests/e2e/hr-admin.spec.ts`

**Interfaces:**
- Consumes: `closeContexts`, `loginAs`, `submitNote` (Task 12) ; `createOrg`, `createNote`, `createUser`, `findUser` (factories) ; `PNG_BYTES`.
- Produces: rien.

- [ ] **Step 1: Écrire `tests/e2e/expense-submission.spec.ts`**

```ts
import { expect, test } from '@playwright/test'
import { createOrg } from '../support/factories'
import { closeContexts, loginAs, submitNote } from './helpers'

test.afterEach(closeContexts)

test('soumet une note : elle apparaît en attente dans l’historique', async ({ browser }) => {
  const page = await loginAs(browser, (await createOrg()).employee)
  await expect(page.getByText('Aucune note de frais pour le moment.')).toBeVisible()
  await submitNote(page, { amount: '42.50', date: '2026-10-08', description: 'Taxi E2E' })
  const row = page.getByRole('row', { name: /Taxi E2E/ })
  await expect(row).toContainText('en attente')
  await expect(row).toContainText(/42,50\s€/)
  await expect(row).toContainText('8 oct. 2026')
  await expect(page.getByText(/1 note · 42,50\s€ au total/)).toBeVisible()
})

test('ouvre le reçu dans un nouvel onglet via une URL présignée', async ({ browser }) => {
  const page = await loginAs(browser, (await createOrg()).employee)
  await submitNote(page, { amount: '12', date: '2026-10-08', description: 'Parking E2E' })
  const row = page.getByRole('row', { name: /Parking E2E/ })
  const popupPromise = page.context().waitForEvent('page')
  await row.getByRole('button', { name: 'Voir le reçu' }).click()
  const popup = await popupPromise
  await popup.waitForLoadState()
  expect(popup.url()).toContain('/receipts-e2e/receipts/')
  expect(popup.url()).toContain('X-Amz-Expires=300')
  const response = await page.request.get(popup.url())
  expect(response.status()).toBe(200)
  expect(response.headers()['content-type']).toBe('image/png')
})

test('affiche l’erreur renvoyée par le serveur', async ({ browser }) => {
  const page = await loginAs(browser, (await createOrg()).employee)
  await submitNote(page, {
    amount: '10',
    date: '2026-10-08',
    description: 'Mauvais fichier E2E',
    file: { name: 'note.txt', mimeType: 'text/plain', buffer: Buffer.from('texte') },
  })
  await expect(page.getByRole('alert')).toHaveText('Type de fichier non autorisé pour le reçu')
  await expect(page.getByText('Aucune note de frais pour le moment.')).toBeVisible()
})

test('le navigateur bloque un formulaire incomplet', async ({ browser }) => {
  const page = await loginAs(browser, (await createOrg()).employee)
  await page.getByRole('button', { name: 'Soumettre' }).click()
  const amount = page.getByLabel('Montant (€)', { exact: true })
  expect(await amount.evaluate((input) => (input as HTMLInputElement).validity.valueMissing)).toBe(true)
  await expect(page.getByText('Aucune note de frais pour le moment.')).toBeVisible()
})
```

- [ ] **Step 2: Écrire `tests/e2e/approval-workflow.spec.ts`**

```ts
import { expect, test } from '@playwright/test'
import { createNote, createOrg } from '../support/factories'
import { closeContexts, loginAs, submitNote } from './helpers'

test.afterEach(closeContexts)

test("l'employé soumet, le manager ouvre le reçu et approuve, l'employé voit « approuvée »", async ({ browser }) => {
  const org = await createOrg()
  const employeePage = await loginAs(browser, org.employee)
  await submitNote(employeePage, { amount: '18.90', date: '2026-10-07', description: 'Déjeuner client E2E' })
  await expect(employeePage.getByRole('row', { name: /Déjeuner client E2E/ })).toContainText('en attente')

  const managerPage = await loginAs(browser, org.manager)
  await managerPage.getByRole('link', { name: 'Manager', exact: true }).click()
  await expect(managerPage.getByRole('heading', { name: 'Validation des notes de frais' })).toBeVisible()
  const row = managerPage.getByRole('row', { name: /Déjeuner client E2E/ })
  await expect(row).toContainText(/18,90\s€/)
  const popupPromise = managerPage.context().waitForEvent('page')
  await row.getByRole('button', { name: 'Voir le reçu' }).click()
  const popup = await popupPromise
  await popup.waitForLoadState()
  expect(popup.url()).toContain('/receipts-e2e/receipts/')
  await row.getByRole('button', { name: 'Approuver' }).click()
  await expect(managerPage.getByText('Aucune note en attente.')).toBeVisible()

  await employeePage.reload()
  await expect(employeePage.getByRole('row', { name: /Déjeuner client E2E/ })).toContainText('approuvée')
})

test("le manager rejette, l'employé voit « rejetée »", async ({ browser }) => {
  const org = await createOrg()
  await createNote({ user: org.employee, description: 'Hôtel E2E', amount: 120 })
  const managerPage = await loginAs(browser, org.manager)
  await managerPage.goto('/manager')
  await managerPage.getByRole('row', { name: /Hôtel E2E/ }).getByRole('button', { name: 'Rejeter' }).click()
  await expect(managerPage.getByText('Aucune note en attente.')).toBeVisible()

  const employeePage = await loginAs(browser, org.employee)
  await expect(employeePage.getByRole('row', { name: /Hôtel E2E/ })).toContainText('rejetée')
})

test("la RH approuve la note d'un manager racine", async ({ browser }) => {
  const org = await createOrg()
  await createNote({ user: org.manager, description: 'Train E2E', amount: 75 })
  const hrPage = await loginAs(browser, org.hr)
  await hrPage.getByRole('link', { name: 'RH', exact: true }).click()
  await expect(hrPage.getByRole('heading', { name: 'Notes des managers racine en attente (1)' })).toBeVisible()
  const row = hrPage.getByRole('row', { name: /Train E2E/ })
  await expect(row).toContainText('Marc Manager')
  await row.getByRole('button', { name: 'Approuver' }).click()
  await expect(hrPage.getByRole('heading', { name: 'Notes des managers racine en attente (0)' })).toBeVisible()

  const managerPage = await loginAs(browser, org.manager)
  await expect(managerPage.getByRole('row', { name: /Train E2E/ })).toContainText('approuvée')
})
```

- [ ] **Step 3: Écrire `tests/e2e/hr-admin.spec.ts`**

```ts
import { expect, test } from '@playwright/test'
import { createNote, createOrg, createUser, findUser } from '../support/factories'
import { closeContexts, loginAs } from './helpers'

test.afterEach(closeContexts)

test('la RH rattache un nouvel employé : son manager voit désormais ses notes', async ({ browser }) => {
  const org = await createOrg()
  const newcomer = await createUser({ company: org.company, name: 'Paul Nouveau' })
  await createNote({ user: newcomer, description: 'Note de Paul E2E' })

  const managerPage = await loginAs(browser, org.manager)
  await managerPage.goto('/manager')
  await expect(managerPage.getByText('Aucune note en attente.')).toBeVisible()

  const hrPage = await loginAs(browser, org.hr)
  await hrPage.goto('/hr')
  await expect(hrPage.getByRole('heading', { name: 'Organigramme (3)' })).toBeVisible()
  const select = hrPage.getByRole('row', { name: /Paul Nouveau/ }).getByRole('combobox')
  await expect(select).toHaveValue('')
  const saved = hrPage.waitForResponse(
    (response) =>
      response.url().endsWith(`/api/hr/users/${newcomer.id}/manager`) && response.request().method() === 'PUT'
  )
  await select.selectOption({ label: 'Marc Manager' })
  expect((await saved).status()).toBe(200)
  await expect(select).toHaveValue(org.manager.id)

  await managerPage.reload()
  await expect(managerPage.getByRole('row', { name: /Note de Paul E2E/ })).toBeVisible()
})

test('la RH détache un employé de son manager', async ({ browser }) => {
  const org = await createOrg()
  const hrPage = await loginAs(browser, org.hr)
  await hrPage.goto('/hr')
  const select = hrPage.getByRole('row', { name: /Emma Employée/ }).getByRole('combobox')
  await expect(select).toHaveValue(org.manager.id)
  const saved = hrPage.waitForResponse(
    (response) => response.url().endsWith(`/api/hr/users/${org.employee.id}/manager`)
  )
  await select.selectOption({ label: '— aucun (racine) —' })
  expect((await saved).status()).toBe(200)
  await expect(select).toHaveValue('')
  expect((await findUser(org.employee.id))?.manager_id).toBeNull()
})

test("l'organigramme ne liste pas les RH", async ({ browser }) => {
  const org = await createOrg()
  const hrPage = await loginAs(browser, org.hr)
  await hrPage.goto('/hr')
  // Manager et employé seulement. (Pas de sélecteur `row /Marc Manager/` :
  // la ligne d'Emma le contient aussi, via la valeur de sa liste déroulante.)
  await expect(hrPage.getByRole('heading', { name: 'Organigramme (2)' })).toBeVisible()
  await expect(hrPage.getByText('Rita RH')).toHaveCount(0)
})
```

- [ ] **Step 4: Lancer les trois specs**

Run: `npx playwright test tests/e2e/expense-submission.spec.ts tests/e2e/approval-workflow.spec.ts tests/e2e/hr-admin.spec.ts`
Expected: PASS — 10 tests.

- [ ] **Step 5: Lint et typecheck**

Run: `npm run lint && npm run typecheck`
Expected: aucune erreur.

- [ ] **Step 6: Commit**

```bash
git add tests/e2e/expense-submission.spec.ts tests/e2e/approval-workflow.spec.ts tests/e2e/hr-admin.spec.ts
git commit -F - <<'EOF'
test(ARLA-9): parcours E2E de soumission, validation et administration RH

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 14: OCR réel en E2E

**Files:**
- Create: `tests/fixtures/receipt.html`, `scripts/generate-receipt-fixture.mjs`, `tests/fixtures/receipt.png` (généré)
- Test: `tests/e2e/ocr-suggestion.spec.ts`

**Interfaces:**
- Consumes: `closeContexts`, `loginAs` (Task 12) ; `createOrg`.
- Produces: `tests/fixtures/receipt.png` — ticket dont l'OCR donne `TOTAL TTC 42,50` et `08/10/2026`.

- [ ] **Step 1: Créer `tests/fixtures/receipt.html`**

```html
<!doctype html>
<html lang="fr">
  <head>
    <meta charset="utf-8" />
    <style>
      body {
        margin: 0;
        padding: 40px;
        width: 720px;
        background: #fff;
        color: #000;
        font-family: 'Courier New', monospace;
        font-size: 36px;
        line-height: 1.6;
      }
      h1 {
        margin: 0 0 24px;
        font-size: 44px;
      }
    </style>
  </head>
  <body>
    <h1>CAFE DU COMMERCE</h1>
    <div>Date : 08/10/2026</div>
    <div>Menu du jour 38,50</div>
    <div>Cafe 4,00</div>
    <div>TOTAL TTC 42,50 EUR</div>
  </body>
</html>
```

- [ ] **Step 2: Créer `scripts/generate-receipt-fixture.mjs`**

```js
// Régénère tests/fixtures/receipt.png à partir de receipt.html (ticket lisible
// par Tesseract, utilisé par tests/e2e/ocr-suggestion.spec.ts) :
// `node scripts/generate-receipt-fixture.mjs`.
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { chromium } from '@playwright/test'

const fixturesDir = path.join(process.cwd(), 'tests', 'fixtures')
const html = await readFile(path.join(fixturesDir, 'receipt.html'), 'utf8')

const browser = await chromium.launch()
try {
  const page = await browser.newPage({ viewport: { width: 800, height: 600 } })
  await page.setContent(html)
  await page.locator('body').screenshot({ path: path.join(fixturesDir, 'receipt.png') })
} finally {
  await browser.close()
}
console.log('tests/fixtures/receipt.png régénéré.')
```

- [ ] **Step 3: Générer l'image**

Run: `node scripts/generate-receipt-fixture.mjs`
Expected: `tests/fixtures/receipt.png régénéré.`

- [ ] **Step 4: Vérifier que Tesseract lit bien le ticket**

```bash
node --input-type=module -e "
import path from 'node:path'
import { readFileSync } from 'node:fs'
import { createWorker } from 'tesseract.js'
const worker = await createWorker('fra', undefined, { langPath: path.join(process.cwd(), 'tessdata'), cacheMethod: 'none' })
const { data } = await worker.recognize(readFileSync(path.join(process.cwd(), 'tests', 'fixtures', 'receipt.png')))
console.log(data.text)
await worker.terminate()
"
```

Expected: le texte affiché contient `TOTAL TTC 42,50` et `08/10/2026`. Sinon, augmenter `font-size` dans `receipt.html` (par pas de 4 px), régénérer (Step 3) et revérifier.

- [ ] **Step 5: Écrire `tests/e2e/ocr-suggestion.spec.ts`**

```ts
import path from 'node:path'
import { expect, test } from '@playwright/test'
import { createOrg } from '../support/factories'
import { closeContexts, loginAs } from './helpers'

const RECEIPT_FIXTURE = path.join(process.cwd(), 'tests', 'fixtures', 'receipt.png')

test.afterEach(closeContexts)

test('pré-remplit montant et date avec le vrai Tesseract', async ({ browser }) => {
  // Le premier OCR charge le modèle fra dans le serveur : marge large (CI).
  test.setTimeout(120_000)
  const page = await loginAs(browser, (await createOrg()).employee)
  await page.getByLabel('Reçu (image ou PDF)', { exact: true }).setInputFiles(RECEIPT_FIXTURE)
  await page.getByRole('button', { name: 'Pré-remplir depuis le reçu' }).click()
  await expect(page.getByLabel('Montant (€)', { exact: true })).toHaveValue('42.5', { timeout: 90_000 })
  await expect(page.getByLabel('Date', { exact: true })).toHaveValue('2026-10-08')
})

test("sans reçu sélectionné : message d'erreur", async ({ browser }) => {
  const page = await loginAs(browser, (await createOrg()).employee)
  await page.getByRole('button', { name: 'Pré-remplir depuis le reçu' }).click()
  await expect(page.getByRole('alert')).toHaveText('Sélectionne d’abord un reçu.')
})

test('PDF : aucune suggestion, message explicite', async ({ browser }) => {
  const page = await loginAs(browser, (await createOrg()).employee)
  await page
    .getByLabel('Reçu (image ou PDF)', { exact: true })
    .setInputFiles({ name: 'recu.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4') })
  await page.getByRole('button', { name: 'Pré-remplir depuis le reçu' }).click()
  await expect(
    page.getByText('Aucune information reconnue sur ce reçu — saisis les champs manuellement.')
  ).toBeVisible()
})
```

- [ ] **Step 6: Lancer la spec**

Run: `npx playwright test tests/e2e/ocr-suggestion.spec.ts`
Expected: PASS — 3 tests.

- [ ] **Step 7: Lint et typecheck**

Run: `npm run lint && npm run typecheck`
Expected: aucune erreur.

- [ ] **Step 8: Commit**

```bash
git add tests/fixtures/receipt.html tests/fixtures/receipt.png scripts/generate-receipt-fixture.mjs tests/e2e/ocr-suggestion.spec.ts
git commit -F - <<'EOF'
test(ARLA-9): suggestion OCR en E2E avec le vrai Tesseract

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 15: Contrôle d'accès de l'API avec une vraie session

**Files:**
- Test: `tests/e2e/api-auth.spec.ts`

**Interfaces:**
- Consumes: `closeContexts`, `loginAs` (Task 12) ; `createOrg`.
- Produces: rien.

- [ ] **Step 1: Écrire `tests/e2e/api-auth.spec.ts`**

```ts
import { expect, test, type APIRequestContext } from '@playwright/test'
import { createOrg } from '../support/factories'
import { closeContexts, loginAs } from './helpers'

const NOTE_ID = '00000000-0000-4000-8000-000000000000'

type Area = 'employee' | 'manager' | 'hr'

interface Endpoint {
  method: 'GET' | 'POST' | 'PUT'
  path: string
  area: Area
}

const ENDPOINTS: Endpoint[] = [
  { method: 'GET', path: '/api/expense-notes', area: 'employee' },
  { method: 'POST', path: '/api/expense-notes', area: 'employee' },
  { method: 'GET', path: `/api/expense-notes/${NOTE_ID}/receipt-url`, area: 'employee' },
  { method: 'POST', path: '/api/expense-notes/receipt-suggestion', area: 'employee' },
  { method: 'GET', path: '/api/manager/expense-notes', area: 'manager' },
  { method: 'POST', path: `/api/manager/expense-notes/${NOTE_ID}/approve`, area: 'manager' },
  { method: 'POST', path: `/api/manager/expense-notes/${NOTE_ID}/reject`, area: 'manager' },
  { method: 'GET', path: `/api/manager/expense-notes/${NOTE_ID}/receipt-url`, area: 'manager' },
  { method: 'GET', path: '/api/hr/expense-notes', area: 'hr' },
  { method: 'POST', path: `/api/hr/expense-notes/${NOTE_ID}/approve`, area: 'hr' },
  { method: 'POST', path: `/api/hr/expense-notes/${NOTE_ID}/reject`, area: 'hr' },
  { method: 'GET', path: `/api/hr/expense-notes/${NOTE_ID}/receipt-url`, area: 'hr' },
  { method: 'GET', path: '/api/hr/users', area: 'hr' },
  { method: 'PUT', path: `/api/hr/users/${NOTE_ID}/manager`, area: 'hr' },
]

// [as-is] audit §3 : un mauvais rôle donne 401 côté employé/manager, 403 côté RH.
const REFUSED_STATUS: Record<Area, number> = { employee: 401, manager: 401, hr: 403 }

async function expectRefused(
  request: APIRequestContext,
  endpoints: Endpoint[],
  headers?: Record<string, string>
): Promise<void> {
  for (const endpoint of endpoints) {
    const response = await request.fetch(endpoint.path, { method: endpoint.method, headers })
    const label = `${endpoint.method} ${endpoint.path}`
    expect.soft(response.status(), label).toBe(REFUSED_STATUS[endpoint.area])
    expect.soft(await response.json(), label).toEqual({ error: 'Unauthorized' })
  }
}

test.afterEach(closeContexts)

test('[as-is] sans cookie : 401 côté employé et manager, 403 côté RH (audit §3)', async ({ request }) => {
  await expectRefused(request, ENDPOINTS)
})

test('cookie de session falsifié : traité comme anonyme', async ({ request }) => {
  await expectRefused(request, ENDPOINTS, { cookie: 'authjs.session-token=jeton-falsifie' })
})

test('session employé : refusée sur les endpoints manager et RH', async ({ browser }) => {
  const page = await loginAs(browser, (await createOrg()).employee)
  await expectRefused(page.request, ENDPOINTS.filter((endpoint) => endpoint.area !== 'employee'))
})

test('session manager : refusée sur les endpoints RH', async ({ browser }) => {
  const page = await loginAs(browser, (await createOrg()).manager)
  await expectRefused(page.request, ENDPOINTS.filter((endpoint) => endpoint.area === 'hr'))
})

test('session RH : refusée sur les endpoints manager', async ({ browser }) => {
  const page = await loginAs(browser, (await createOrg()).hr)
  await expectRefused(page.request, ENDPOINTS.filter((endpoint) => endpoint.area === 'manager'))
})

test('session valide : le JWT réel est accepté', async ({ browser }) => {
  const page = await loginAs(browser, (await createOrg()).employee)
  const response = await page.request.get('/api/expense-notes')
  expect(response.status()).toBe(200)
  expect(await response.json()).toEqual([])
})

test('méthode HTTP non exportée → 405', async ({ request }) => {
  for (const [method, path] of [
    ['DELETE', '/api/expense-notes'],
    ['PATCH', '/api/hr/users'],
    ['GET', `/api/manager/expense-notes/${NOTE_ID}/approve`],
  ]) {
    expect.soft((await request.fetch(path, { method })).status(), `${method} ${path}`).toBe(405)
  }
})

test('[as-is] erreur non interceptée : 500 générique de Next, sans stack', async ({ browser }) => {
  const page = await loginAs(browser, (await createOrg()).employee)
  const response = await page.request.get('/api/expense-notes?sort=nope')
  expect(response.status()).toBe(500)
  expect(await response.text()).not.toContain('stack')
})

test('[as-is] erreur interceptée : 500 JSON avec la stack (audit §4)', async ({ browser }) => {
  const page = await loginAs(browser, (await createOrg()).employee)
  const response = await page.request.post('/api/expense-notes', { data: { amount: 1 } })
  expect(response.status()).toBe(500)
  expect(await response.json()).toEqual({
    error: expect.stringContaining('Content-Type'),
    stack: expect.any(String),
  })
})
```

- [ ] **Step 2: Lancer la spec, puis toute la suite E2E**

Run: `npx playwright test tests/e2e/api-auth.spec.ts && npm run test:e2e`
Expected: PASS — 9 tests pour cette spec ; ≈ 34 tests E2E au total.

- [ ] **Step 3: Lint et typecheck**

Run: `npm run lint && npm run typecheck`
Expected: aucune erreur.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/api-auth.spec.ts
git commit -F - <<'EOF'
test(ARLA-9): contrôle d'accès de l'API avec une vraie session Auth.js

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 16: CI GitHub Actions

**Files:**
- Create: `.github/workflows/tests.yml`

**Interfaces:**
- Consumes: scripts `lint`, `typecheck`, `test:coverage`, `test:e2e` ; `scripts/coverage-summary.mjs` (Task 11) ; valeurs par défaut de `tests/support/env.ts` (Postgres `localhost:5433`, LocalStack `localhost:4567`).
- Produces: 3 jobs `checks`, `vitest`, `e2e` sur chaque PR vers `main` et chaque push sur `main`.

- [ ] **Step 1: Créer `.github/workflows/tests.yml`**

```yaml
name: Tests

on:
  pull_request:
    branches: [main]
  push:
    branches: [main]

concurrency:
  group: tests-${{ github.ref }}
  cancel-in-progress: true

jobs:
  checks:
    name: Lint et typecheck
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with:
          node-version: 24
          cache: npm
      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck

  vitest:
    name: Vitest (unitaires, intégration, couverture)
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_USER: expense
          POSTGRES_PASSWORD: expense
          POSTGRES_DB: expense_io
        ports:
          - 5433:5432
        options: >-
          --health-cmd "pg_isready -U expense -d expense_io"
          --health-interval 5s
          --health-timeout 5s
          --health-retries 10
      localstack:
        image: localstack/localstack:3.8.1
        env:
          SERVICES: s3
        ports:
          - 4567:4566
        options: >-
          --health-cmd "curl -sf http://localhost:4566/_localstack/health"
          --health-interval 5s
          --health-timeout 5s
          --health-retries 20
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with:
          node-version: 24
          cache: npm
      - run: npm ci
      - run: npm run test:coverage
      - name: Résumé de couverture
        if: always()
        run: node scripts/coverage-summary.mjs >> "$GITHUB_STEP_SUMMARY"
      - uses: actions/upload-artifact@v7
        if: always()
        with:
          name: coverage
          path: coverage/

  e2e:
    name: Playwright (E2E)
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_USER: expense
          POSTGRES_PASSWORD: expense
          POSTGRES_DB: expense_io
        ports:
          - 5433:5432
        options: >-
          --health-cmd "pg_isready -U expense -d expense_io"
          --health-interval 5s
          --health-timeout 5s
          --health-retries 10
      localstack:
        image: localstack/localstack:3.8.1
        env:
          SERVICES: s3
        ports:
          - 4567:4566
        options: >-
          --health-cmd "curl -sf http://localhost:4566/_localstack/health"
          --health-interval 5s
          --health-timeout 5s
          --health-retries 20
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with:
          node-version: 24
          cache: npm
      - run: npm ci
      - name: Version de Playwright
        id: playwright
        run: echo "version=$(npx playwright --version | awk '{print $2}')" >> "$GITHUB_OUTPUT"
      - uses: actions/cache@v6
        id: playwright-cache
        with:
          path: ~/.cache/ms-playwright
          key: playwright-${{ runner.os }}-${{ steps.playwright.outputs.version }}
      - if: steps.playwright-cache.outputs.cache-hit != 'true'
        run: npx playwright install --with-deps chromium
      - if: steps.playwright-cache.outputs.cache-hit == 'true'
        run: npx playwright install-deps chromium
      - uses: actions/cache@v6
        with:
          path: .next/cache
          key: next-${{ runner.os }}-${{ hashFiles('package-lock.json') }}-${{ hashFiles('src/**') }}
          restore-keys: next-${{ runner.os }}-${{ hashFiles('package-lock.json') }}-
      - run: npm run test:e2e
      - uses: actions/upload-artifact@v7
        if: always()
        with:
          name: playwright-report
          path: playwright-report/
      - uses: actions/upload-artifact@v7
        if: failure()
        with:
          name: playwright-traces
          path: test-results/
```

- [ ] **Step 2: Vérifier localement ce que la CI exécute**

Run: `npm run lint && npm run typecheck && npm run test:coverage && CI=1 npm run test:e2e`
Expected: tout passe (`CI=1` active `forbidOnly`, 1 retry, 2 workers et un serveur neuf).

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/tests.yml
git commit -F - <<'EOF'
ci(ARLA-9): lint, Vitest avec couverture et Playwright sur chaque PR

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

- [ ] **Step 4: Validation en conditions réelles — demander l'accord avant toute action distante**

Demander à l'utilisateur l'autorisation de pousser la branche `louisbert91/arla-9-tests-de-caracterisation` et d'ouvrir une PR brouillon vers `main`. Après accord seulement : `git push -u origin louisbert91/arla-9-tests-de-caracterisation`, ouvrir la PR, puis suivre le run (sans polling planifié) jusqu'à ce que `checks`, `vitest` et `e2e` soient verts. Un échec propre à la CI (ex. temps de démarrage de LocalStack) se corrige dans le workflow, jamais dans `src/`.

---

### Task 17: Documentation, cliquet de couverture et vérification finale

**Files:**
- Modify: `README.md` (section « Tests »)
- Modify: `vitest.config.mts` (seuils remontés)

**Interfaces:**
- Consumes: toute la suite.
- Produces: README à jour ; seuils de couverture au niveau mesuré.

- [ ] **Step 1: Ajouter la section « Tests » au README** — avant « ## Variables d'environnement » :

````markdown
## Tests

Prérequis : Docker lancé (`make up` ou `docker compose up -d`). Première fois
pour Playwright : `npx playwright install chromium`.

| Commande | Rôle |
|---|---|
| `make test` / `npm test` | tests unitaires et d'intégration (Vitest) |
| `npm run test:unit` | tests unitaires seuls, sans Docker |
| `make coverage` / `npm run test:coverage` | idem avec couverture (`coverage/index.html`) |
| `make e2e` / `npm run test:e2e` | tests end-to-end (Playwright, build de prod sur le port 3100) |

Les tests n'utilisent jamais les données de `make dev` : bases
`expense_io_test` (Vitest) et `expense_io_e2e` (Playwright), buckets
`receipts-test` et `receipts-e2e`, créés automatiquement au premier lancement.

**Tests de caractérisation.** La suite fige le comportement actuel de
l'application, défauts connus compris. Un test dont le nom commence par
`[as-is]` décrit un comportement contraire à une règle attendue (voir
`docs/audit/as-is.md`) : le jour où on le corrige, on met à jour le test en
conséquence. Pour la liste : `grep -rn "\[as-is\]" tests`.

Le ticket utilisé par le test OCR (`tests/fixtures/receipt.png`) se régénère
avec `node scripts/generate-receipt-fixture.mjs`.

La CI (`.github/workflows/tests.yml`) lance lint, typecheck, Vitest avec
couverture et Playwright sur chaque PR vers `main`.
````

- [ ] **Step 2: Mesurer la couverture finale**

Run: `npm run test:coverage`
Expected: PASS. Relever les pourcentages « All files » de lignes, branches et fonctions.

- [ ] **Step 3: Remonter les seuils (cliquet)** — dans `vitest.config.mts`, remplacer `thresholds: { lines: 90, branches: 85, functions: 90 }` par les valeurs mesurées au Step 2 arrondies à l'entier inférieur, sans jamais descendre sous 90 / 85 / 90. Exemple si la mesure donne 96,4 / 91,7 / 100 :

```ts
      thresholds: { lines: 96, branches: 91, functions: 100 },
```

- [ ] **Step 4: Vérification finale complète**

Run: `npm run lint && npm run typecheck && npm run test:coverage && npm run test:e2e && git diff --stat main -- src`
Expected: tout passe ; la dernière commande n'affiche **rien** (aucune modification de `src/`).

- [ ] **Step 5: Inventaire des comportements figés `[as-is]`**

Run: `grep -rn "\[as-is\]" tests | wc -l`
Expected: un nombre non nul, à reporter dans le compte rendu final avec la liste par fichier (`grep -rln "\[as-is\]" tests`).

- [ ] **Step 6: Commit**

```bash
git add README.md vitest.config.mts
git commit -F - <<'EOF'
docs(ARLA-9): section Tests du README et seuils de couverture au niveau mesuré

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

- [ ] **Step 7: Rappel à l'utilisateur** — indiquer qu'un administrateur du dépôt doit rendre les jobs `Lint et typecheck`, `Vitest (unitaires, intégration, couverture)` et `Playwright (E2E)` obligatoires dans la protection de branche de `main` (*Settings → Branches*).
