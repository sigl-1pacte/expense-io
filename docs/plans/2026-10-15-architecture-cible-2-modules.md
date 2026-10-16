# Architecture cible · plan 2 : modules `iam` et `expenses` — plan d'implémentation

> **Pour les agents :** SOUS-SKILL REQUIS : utiliser `superpowers:subagent-driven-development` (recommandé) ou `superpowers:executing-plans` pour exécuter ce plan tâche par tâche. Les étapes utilisent la syntaxe case à cocher (`- [ ]`).

| | |
|---|---|
| **Statut** | Brouillon |
| **Spec** | [2026-10-15-architecture-cible](../specs/2026-10-15-architecture-cible.md) |
| **Auteur(s)** | Louis Bertrand (avec Claude Code) |
| **Créé** | 2026-10-16 |
| **Prérequis** | [plan 1](2026-10-15-architecture-cible-1-socle.md) terminé |

**Objectif :** brancher l'architecture hexagonale : deux modules `iam` et `expenses`, une seule `ApprovalPolicy`, les routes réduites à des adapters minces, le code mort supprimé, les règles de dépendance bloquantes, et le skill de live coding.

**Architecture :** chaque module a `domain/` (pur), `application/` (un fichier par use case, fabriqué à partir de ses ports), `ports/`, `infrastructure/` (Postgres, S3, Tesseract, bcrypt) et `index.ts` qui câble le tout. `expenses` interroge `iam` par un port `Approvals` (deux requêtes, D4). Les routes appellent `currentActor()` (rôle relu en base, F31) puis un use case.

**Stack :** TypeScript, Next.js 16, pg, @aws-sdk/client-s3, tesseract.js, bcryptjs, Vitest, Playwright, dependency-cruiser.

**Spec :** [`docs/specs/2026-10-15-architecture-cible.md`](../specs/2026-10-15-architecture-cible.md), sections « Architecture », « Règles métier », « Interface utilisateur », « Prêt pour les agents ».

## Contraintes globales

- Contraintes du plan 1, toujours valables (contrat d'API, RFC 9457, `[as-is]`, français, pas de `BYPASSRLS`).
- `domain/` n'importe que son propre domaine, `src/shared/actor.ts`, `src/shared/errors.ts` et les modules Node.
- `application/` n'importe ni `pg`, ni `@aws-sdk`, ni `tesseract.js`, ni `bcryptjs`, ni `next`.
- Un module n'importe un autre module que par son `index.ts` ; le SQL d'`expenses` ne nomme jamais `users` ni `companies`.
- Une route : `currentActor()` → garde de rôle → parsing → **un** use case → `Response.json`. Aucune règle métier dans `route.ts`.
- La suite reste verte **à chaque commit** : on migre une route (ou un groupe de routes jumelles) par commit.

## Points de vigilance (review focus)

1. **Rôle relu en base, session périmée** : un manager rétrogradé en base perd ses droits immédiatement, même avec une session qui dit `manager`. → Tâche 4 : bascule des tests F31 de `workflow.test.ts`.
2. **Deux décisions simultanées** sur la même note (approve et reject en parallèle). → Tâche 9 : test de concurrence F9.
3. **Deux rattachements simultanés qui ferment un cycle.** → Tâche 4 : test de concurrence F30.
4. **Reçu S3 envoyé puis échec de l'insertion** : aucune note, un objet orphelin détectable. → Tâche 8 : test F10 et script `receipts:orphans`.
5. **OCR saturé** : la troisième analyse simultanée attend, puis reçoit `503` avec `Retry-After`. → Tâche 7 : test unitaire de l'adapter ; tâche 10 : test d'intégration.

## Structure des fichiers

| Fichier | Action | Responsabilité |
|---|---|---|
| `src/shared/actor.ts` | Créer | `Role`, `Actor` (noyau partagé) |
| `src/shared/db.ts` | Créer | pool Postgres (déplacé de `src/lib/db.ts`) |
| `src/shared/unit-of-work.ts` | Créer | `runInScope(scope, fn)` : transaction scopée RLS |
| `src/modules/iam/domain/{ApprovalPolicy,OrgChart,Company,errors}.ts` | Créer | règles « qui valide qui », organigramme, domaines publics |
| `src/modules/iam/ports/{IamStore,PasswordHasher}.ts` | Créer | ports |
| `src/modules/iam/application/*.ts` | Créer | 8 use cases |
| `src/modules/iam/infrastructure/{PgIamStore,BcryptPasswordHasher}.ts` | Créer | adapters |
| `src/modules/iam/index.ts` | Créer | API publique `iam` |
| `src/modules/expenses/domain/{ExpenseNote,Submission,NoteSort,ReceiptText,errors}.ts` | Créer | agrégat, validation, tri, lecture du texte d'un reçu |
| `src/modules/expenses/ports/{NoteRepository,ExpensesUnitOfWork,ReceiptStorage,ReceiptReader,Approvals}.ts` | Créer | ports |
| `src/modules/expenses/application/*.ts` | Créer | 6 use cases |
| `src/modules/expenses/infrastructure/{PgNoteRepository,PgExpensesUnitOfWork,S3ReceiptStorage,TesseractReceiptReader}.ts` | Créer | adapters |
| `src/modules/expenses/index.ts` | Créer | API publique `expenses` |
| `src/app/api/_lib/current-actor.ts` | Créer | session → acteur relu en base |
| `src/app/api/**/route.ts`, `src/app/actions/auth.ts`, `src/lib/auth.ts` | Modifier | adapters minces |
| `src/domain`, `src/ports`, `src/adapters`, `src/utils`, `src/lib/{db,ocr,storage,note-sort}.ts` | Supprimer | code mort ou déplacé (F22–F24) |
| `scripts/check-sql-boundaries.mjs`, `scripts/receipts-orphans.mjs` | Créer | règle SQL entre modules ; nettoyage des reçus orphelins |
| `src/components/*.tsx`, `src/app/expenses/page.tsx` | Modifier | `detail` des erreurs, signalement RH |
| `docs/architecture/conventions.md`, `.agents/skills/{ajouter-une-fonctionnalite,revue-architecture}/SKILL.md`, `.claude/agents/revue-architecture.md`, `.opencode/agents/revue-architecture.md`, `.codex/agents/revue-architecture.toml` | Créer | harnais du live coding |

---

### Tâche 1 : noyau partagé — acteur, pool, unité de travail

**Fichiers :**
- Créer : `src/shared/actor.ts`, `src/shared/db.ts`, `src/shared/unit-of-work.ts`, `tests/integration/shared/unit-of-work.test.ts`
- Modifier : `src/lib/db.ts`, `src/shared/http.ts`, `.dependency-cruiser.cjs`
- Supprimer : `tests/integration/lib/db.test.ts` (déplacé)

**Interfaces :**
- Produit :
  - `type Role = 'employee' | 'manager' | 'hr_admin'` ; `interface Actor { id: string; companyId: string; role: Role; managerId: string | null }`
  - `getPool(): Pool`
  - `interface Sql { query<R extends QueryResultRow = QueryResultRow>(text: string, params?: unknown[]): Promise<QueryResult<R>> }`
  - `interface Scope { userId: string; companyId: string }`
  - `runInScope<T>(scope: Scope, fn: (sql: Sql) => Promise<T>): Promise<T>`
  - `requireRole(subject: { role: Role }, role: Role): void` (signature élargie)

- [ ] **Étape 1 : déplacer les tests de portée (ils échouent)**

`git mv tests/integration/lib/db.test.ts tests/integration/shared/unit-of-work.test.ts`, puis dans ce fichier :
- remplacer l'import `import { getPool, withUserScope } from '@/lib/db'` par `import { getPool } from '@/shared/db'` et `import { runInScope } from '@/shared/unit-of-work'` ;
- remplacer chaque `withUserScope(<user>.id, fn)` par `runInScope({ userId: <user>.id, companyId: <user>.company_id }, fn)` (les fabriques renvoient `company_id`) ;
- supprimer le test « utilisateur introuvable : Unauthenticated » (le contrôle de l'acteur passe dans `iam.getActor`, tâche 4) ;
- renommer le `describe('withUserScope')` en `describe('runInScope')`.

Run : `npx vitest run --project integration tests/integration/shared/unit-of-work.test.ts`
Attendu : FAIL, modules `@/shared/db` et `@/shared/unit-of-work` introuvables.

- [ ] **Étape 2 : `src/shared/actor.ts`**

```ts
// Noyau partagé : l'acteur d'une requête, produit par le module iam et
// consommé par les autres modules. Aucune logique ici.
export type Role = 'employee' | 'manager' | 'hr_admin'

export interface Actor {
  id: string
  companyId: string
  role: Role
  managerId: string | null
}
```

- [ ] **Étape 3 : `src/shared/db.ts`**

```ts
import { Pool, types } from 'pg'

// OID 1082 = date. Garde la chaîne "YYYY-MM-DD" brute renvoyée par Postgres
// plutôt qu'un objet Date JS calé sur le fuseau local.
types.setTypeParser(1082, (value: string) => value)

declare global {
  var __pgPool: Pool | undefined
}

/** Pool du rôle applicatif `expense_app` (DATABASE_URL), soumis à la RLS. */
export function getPool(): Pool {
  if (!global.__pgPool) {
    const connectionString = process.env.DATABASE_URL
    if (!connectionString) {
      throw new Error('DATABASE_URL is not set')
    }
    global.__pgPool = new Pool({ connectionString, max: 20 })
  }
  return global.__pgPool
}
```

- [ ] **Étape 4 : `src/shared/unit-of-work.ts`**

```ts
// Unité de travail : une transaction dont la portée (utilisateur, entreprise)
// est exposée aux policies RLS. Tout ce qui passe par `sql` dans `fn` est
// écrit ensemble, ou pas du tout.
import type { QueryResult, QueryResultRow } from 'pg'
import { getPool } from './db'

export interface Sql {
  query<R extends QueryResultRow = QueryResultRow>(text: string, params?: unknown[]): Promise<QueryResult<R>>
}

export interface Scope {
  userId: string
  companyId: string
}

export async function runInScope<T>(scope: Scope, fn: (sql: Sql) => Promise<T>): Promise<T> {
  const client = await getPool().connect()
  try {
    await client.query('BEGIN')
    await client.query(
      "SELECT set_config('app.current_user_id', $1, true), set_config('app.current_company_id', $2, true)",
      [scope.userId, scope.companyId]
    )
    const result = await fn(client)
    await client.query('COMMIT')
    return result
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}
```

- [ ] **Étape 5 : `src/lib/db.ts` devient un pont temporaire**

Les routes non encore migrées l'utilisent ; il disparaît en tâche 11.

```ts
// Pont temporaire pendant la migration des routes (plan 2) : supprimé en tâche 11.
import type { PoolClient } from 'pg'
import { getPool } from '@/shared/db'
import { Unauthenticated } from '@/shared/errors'
import { runInScope } from '@/shared/unit-of-work'

export { getPool }

export async function withUserScope<T>(
  userId: string,
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const actor = await getPool().query<{ company_id: string }>(
    'SELECT company_id FROM app.actor($1)',
    [userId]
  )
  if (!actor.rows[0]) throw new Unauthenticated()
  return runInScope({ userId, companyId: actor.rows[0].company_id }, (sql) => fn(sql as PoolClient))
}
```

- [ ] **Étape 6 : `requireRole` accepte tout porteur de rôle**

Dans `src/shared/http.ts` : supprimer la déclaration locale `export type Role = …`, ajouter `import type { Role } from './actor'` et `export type { Role }`, et remplacer la signature de `requireRole` par :

```ts
export function requireRole(subject: { role: Role }, role: Role): void {
  if (subject.role !== role) throw new Forbidden()
}
```

- [ ] **Étape 7 : le domaine peut importer le noyau partagé**

Dans `.dependency-cruiser.cjs`, règle `domaine-pur`, remplacer `to` par :

```js
      to: {
        pathNot: ['^src/modules/$1/domain/', '^src/shared/(actor|errors)\\.ts$'],
        dependencyTypesNot: ['core'],
      },
```

et ajouter une règle :

```js
    {
      name: 'shared-autonome',
      comment: 'shared/ ne dépend que de lui-même (et de lib/auth pour la session).',
      severity: SEVERITY,
      from: { path: '^src/shared/' },
      to: { path: '^src/', pathNot: ['^src/shared/', '^src/lib/auth\\.ts$'] },
    },
```

- [ ] **Étape 8 : lancer et commiter**

Run : `npm test && npm run depcruise`
Attendu : PASS.

```bash
git add src/shared src/lib/db.ts tests/integration/shared .dependency-cruiser.cjs
git commit -m "refactor(refacto): noyau partagé — acteur, pool et unité de travail"
```

---

### Tâche 2 : domaine `iam` — `ApprovalPolicy`, organigramme, domaines publics

**Fichiers :**
- Créer : `src/modules/iam/domain/ApprovalPolicy.ts`, `src/modules/iam/domain/OrgChart.ts`, `src/modules/iam/domain/Company.ts`, `src/modules/iam/domain/errors.ts`, `tests/unit/iam/approval-policy.test.ts`, `tests/unit/iam/org-chart.test.ts`, `tests/unit/iam/company.test.ts`

**Interfaces :**
- Produit :
  - `interface OrgMember { id: string; role: Role; managerId: string | null }` (membres d'**une** entreprise)
  - `approversOf(owner: OrgMember, members: readonly OrgMember[]): string[]`
  - `canDecide(actorId: string, owner: OrgMember, members: readonly OrgMember[]): boolean`
  - `approveesOf(actorId: string, members: readonly OrgMember[]): string[]`
  - `assertCanAssign(targetId: string, managerId: string | null, members: readonly OrgMember[]): void` (lève `NotFound` ou `InvalidManager`)
  - `PUBLIC_EMAIL_DOMAINS: readonly string[]`, `isPublicEmailDomain(domain: string): boolean`, `companyNameFor(domain: string): string`
  - `class InvalidManager extends Conflict` (409, `error: "Invalid manager"`), `class EmailAlreadyUsed extends Error`

- [ ] **Étape 1 : écrire les tests qui échouent**

`tests/unit/iam/approval-policy.test.ts` :

```ts
import { describe, expect, it } from 'vitest'
import { approveesOf, approversOf, canDecide, type OrgMember } from '@/modules/iam/domain/ApprovalPolicy'

const hr1: OrgMember = { id: 'hr1', role: 'hr_admin', managerId: null }
const hr2: OrgMember = { id: 'hr2', role: 'hr_admin', managerId: null }
const root: OrgMember = { id: 'root', role: 'manager', managerId: null }
const sub: OrgMember = { id: 'sub', role: 'manager', managerId: 'root' }
const attached: OrgMember = { id: 'att', role: 'employee', managerId: 'sub' }
const loose: OrgMember = { id: 'loose', role: 'employee', managerId: null }
const company = [hr1, hr2, root, sub, attached, loose]

describe('approversOf (une ligne par cas du tableau des validateurs)', () => {
  it.each<[string, OrgMember, string[]]>([
    ['employé rattaché → son manager direct', attached, ['sub']],
    ['manager rattaché → son manager direct', sub, ['root']],
    ['manager racine → les RH', root, ['hr1', 'hr2']],
    ['employé non rattaché → les RH (F33)', loose, ['hr1', 'hr2']],
    ['RH → les autres RH, jamais lui-même (F14)', hr1, ['hr2']],
  ])('%s', (_label, owner, expected) => {
    expect(approversOf(owner, company)).toEqual(expected)
  })

  it("RH seul de son entreprise : aucun validateur (limite documentée)", () => {
    expect(approversOf(hr1, [hr1, root])).toEqual([])
  })
})

describe('canDecide', () => {
  it('le manager direct, pas son propre manager (consigne : pas de transitivité)', () => {
    expect(canDecide('sub', attached, company)).toBe(true)
    expect(canDecide('root', attached, company)).toBe(false)
  })

  it("un RH ne décide pas la note d'un employé rattaché", () => {
    expect(canDecide('hr1', attached, company)).toBe(false)
  })

  it('personne ne décide sa propre note', () => {
    for (const member of company) expect(canDecide(member.id, member, company)).toBe(false)
  })
})

describe('approveesOf', () => {
  it('un manager valide ses subordonnés directs', () => {
    expect(approveesOf('sub', company)).toEqual(['att'])
    expect(approveesOf('root', company)).toEqual(['sub'])
  })

  it('un RH valide managers racines, non rattachés et autres RH', () => {
    expect(approveesOf('hr1', company)).toEqual(['hr2', 'root', 'loose'])
  })
})
```

`tests/unit/iam/org-chart.test.ts` :

```ts
import { describe, expect, it } from 'vitest'
import { InvalidManager } from '@/modules/iam/domain/errors'
import type { OrgMember } from '@/modules/iam/domain/ApprovalPolicy'
import { assertCanAssign } from '@/modules/iam/domain/OrgChart'
import { NotFound } from '@/shared/errors'

const hr: OrgMember = { id: 'hr', role: 'hr_admin', managerId: null }
const m1: OrgMember = { id: 'm1', role: 'manager', managerId: null }
const m2: OrgMember = { id: 'm2', role: 'manager', managerId: 'm1' }
const m3: OrgMember = { id: 'm3', role: 'manager', managerId: 'm2' }
const e1: OrgMember = { id: 'e1', role: 'employee', managerId: 'm3' }
const company = [hr, m1, m2, m3, e1]

describe('assertCanAssign', () => {
  it('accepte un rattachement valide et le détachement', () => {
    expect(() => assertCanAssign('e1', 'm1', company)).not.toThrow()
    expect(() => assertCanAssign('e1', null, company)).not.toThrow()
  })

  it.each([
    ['cible absente de l’entreprise', 'inconnu'],
    ['cible RH', 'hr'],
  ])('404 : %s', (_label, targetId) => {
    expect(() => assertCanAssign(targetId, 'm1', company)).toThrow(NotFound)
  })

  it.each<[string, string, string]>([
    ['auto-rattachement', 'm1', 'm1'],
    ['manager inconnu ou d’une autre entreprise (F5)', 'e1', 'ailleurs'],
    ['le manager choisi est un employé', 'm1', 'e1'],
    ['le manager choisi est RH', 'e1', 'hr'],
    ['cycle direct (F30)', 'm2', 'm3'],
    ['cycle long (F30)', 'm1', 'm3'],
  ])('409 Invalid manager : %s', (_label, targetId, managerId) => {
    expect(() => assertCanAssign(targetId, managerId, company)).toThrow(InvalidManager)
  })
})
```

`tests/unit/iam/company.test.ts` :

```ts
import { describe, expect, it } from 'vitest'
import { companyNameFor, isPublicEmailDomain } from '@/modules/iam/domain/Company'

describe('isPublicEmailDomain (F4)', () => {
  it.each([
    'gmail.com', 'googlemail.com', 'outlook.com', 'outlook.fr', 'hotmail.com', 'hotmail.fr', 'live.com',
    'live.fr', 'yahoo.com', 'yahoo.fr', 'icloud.com', 'me.com', 'proton.me', 'protonmail.com', 'gmx.com',
    'gmx.fr', 'free.fr', 'orange.fr', 'laposte.net', 'wanadoo.fr', 'sfr.fr', 'GMAIL.COM',
  ])('%s est public', (domain) => {
    expect(isPublicEmailDomain(domain)).toBe(true)
  })

  it.each(['acme.fr', 'expense.io', 'epita.fr', 'mail.acme.com'])('%s ne l’est pas', (domain) => {
    expect(isPublicEmailDomain(domain)).toBe(false)
  })
})

describe('companyNameFor', () => {
  it('prend le premier segment du domaine', () => {
    expect(companyNameFor('acme.fr')).toBe('acme')
  })
})
```

Run : `npx vitest run --project unit tests/unit/iam`
Attendu : FAIL, modules introuvables.

- [ ] **Étape 2 : `src/modules/iam/domain/errors.ts`**

```ts
import { Conflict } from '@/shared/errors'

/** Rattachement refusé : manager inconnu, d'une autre entreprise, pas manager, ou cycle. */
export class InvalidManager extends Conflict {
  constructor() {
    super('invalid-manager', 'Invalid manager')
  }
}

/** Inscription avec un email déjà utilisé (y compris par une inscription concurrente, F12). */
export class EmailAlreadyUsed extends Error {
  constructor() {
    super('Email déjà utilisé')
    this.name = 'EmailAlreadyUsed'
  }
}
```

- [ ] **Étape 3 : `src/modules/iam/domain/ApprovalPolicy.ts`**

```ts
// Seule source de vérité de « qui valide qui » (ADR 0002). La RLS n'assure
// que l'isolation entre entreprises : `members` est la liste des membres
// d'UNE entreprise.
import type { Role } from '@/shared/actor'

export interface OrgMember {
  id: string
  role: Role
  managerId: string | null
}

/**
 * Consigne : un manager ne valide que ses subordonnés directs ; un RH valide
 * les managers racines, jamais sa propre note. Extension de l'équipe (F14,
 * F33) : un RH valide aussi les employés non rattachés et les autres RH.
 */
export function approversOf(owner: OrgMember, members: readonly OrgMember[]): string[] {
  if (owner.managerId !== null) return [owner.managerId]
  return members.filter((member) => member.role === 'hr_admin' && member.id !== owner.id).map((member) => member.id)
}

export function canDecide(actorId: string, owner: OrgMember, members: readonly OrgMember[]): boolean {
  return owner.id !== actorId && approversOf(owner, members).includes(actorId)
}

/** Ids des membres dont `actorId` valide les notes. */
export function approveesOf(actorId: string, members: readonly OrgMember[]): string[] {
  return members.filter((member) => canDecide(actorId, member, members)).map((member) => member.id)
}
```

- [ ] **Étape 4 : `src/modules/iam/domain/OrgChart.ts`**

```ts
// Règles de l'organigramme, vérifiées à chaque modification (F5, F30). Le
// parcours se fait sur les membres chargés sous le verrou d'organigramme de
// l'entreprise : deux rattachements simultanés ne peuvent pas fermer un cycle.
import { NotFound } from '@/shared/errors'
import type { OrgMember } from './ApprovalPolicy'
import { InvalidManager } from './errors'

export function assertCanAssign(
  targetId: string,
  managerId: string | null,
  members: readonly OrgMember[]
): void {
  const byId = new Map(members.map((member) => [member.id, member]))
  const target = byId.get(targetId)
  if (!target || (target.role !== 'employee' && target.role !== 'manager')) throw new NotFound()
  if (managerId === null) return

  const manager = byId.get(managerId)
  // Absent de `members` = inconnu ou d'une autre entreprise (F5).
  if (!manager || manager.role !== 'manager' || manager.id === targetId) throw new InvalidManager()

  // F30 : la cible ne doit pas être un ancêtre du manager choisi.
  const seen = new Set<string>()
  let cursor: OrgMember | undefined = manager
  while (cursor?.managerId && !seen.has(cursor.id)) {
    if (cursor.managerId === targetId) throw new InvalidManager()
    seen.add(cursor.id)
    cursor = byId.get(cursor.managerId)
  }
}
```

- [ ] **Étape 5 : `src/modules/iam/domain/Company.ts`**

```ts
// F4 : un domaine de messagerie publique ne fonde jamais d'entreprise ; sinon
// le premier inscrit en @gmail.com deviendrait RH de tous les comptes Gmail.
export const PUBLIC_EMAIL_DOMAINS: readonly string[] = [
  'gmail.com', 'googlemail.com', 'outlook.com', 'outlook.fr', 'hotmail.com', 'hotmail.fr',
  'live.com', 'live.fr', 'yahoo.com', 'yahoo.fr', 'icloud.com', 'me.com', 'proton.me',
  'protonmail.com', 'gmx.com', 'gmx.fr', 'free.fr', 'orange.fr', 'laposte.net', 'wanadoo.fr', 'sfr.fr',
]

export function isPublicEmailDomain(domain: string): boolean {
  return PUBLIC_EMAIL_DOMAINS.includes(domain.toLowerCase())
}

export function companyNameFor(domain: string): string {
  return domain.split('.')[0]
}
```

- [ ] **Étape 6 : lancer et commiter**

Run : `npx vitest run --project unit tests/unit/iam && npm run depcruise`
Attendu : PASS, aucune violation.

```bash
git add src/modules/iam/domain tests/unit/iam
git commit -m "feat(iam): ApprovalPolicy, règles d'organigramme et domaines publics (F4, F5, F14, F30, F33)"
```

---

### Tâche 3 : `iam` — ports, adapters, use cases, `index.ts`

**Fichiers :**
- Créer : `src/modules/iam/ports/IamStore.ts`, `src/modules/iam/ports/PasswordHasher.ts`, `src/modules/iam/infrastructure/PgIamStore.ts`, `src/modules/iam/infrastructure/BcryptPasswordHasher.ts`, `src/modules/iam/application/{get-actor,authenticate,sign-up,list-directory,assign-manager,approvees-of,can-decide,get-contact}.ts`, `src/modules/iam/index.ts`, `tests/unit/iam/fake-iam-store.ts`, `tests/unit/iam/use-cases.test.ts`, `tests/integration/iam/pg-iam-store.test.ts`

**Interfaces :**
- Consomme : `Actor`, `Sql`, `runInScope`, `getPool` (tâche 1) ; domaine `iam` (tâche 2).
- Produit (API publique `iam`, `src/modules/iam/index.ts`) :
  - `getActor(userId: string): Promise<Actor>` (lève `Unauthenticated`)
  - `authenticate(email: string, password: string): Promise<{ id: string; email: string; role: Role } | null>`
  - `signUp(input: { name: unknown; email: unknown; password: unknown }): Promise<SignUpResult>` avec `type SignUpResult = { ok: true } | { ok: false; error: string }`
  - `listDirectory(actor: Actor): Promise<DirectoryUser[]>`
  - `assignManager(actor: Actor, targetId: string, managerId: string | null): Promise<DirectoryUser>`
  - `approveesOf(actor: Actor): Promise<string[]>`
  - `canDecide(actor: Actor, ownerId: string): Promise<boolean>`
  - `getContact(actor: Actor, userId: string): Promise<Contact | null>`
  - types `DirectoryUser { id; name; email; role: 'employee' | 'manager'; managerId: string | null }`, `Contact { name: string; email: string }`

- [ ] **Étape 1 : les ports**

`src/modules/iam/ports/IamStore.ts` :

```ts
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
```

`src/modules/iam/ports/PasswordHasher.ts` :

```ts
export interface PasswordHasher {
  hash(password: string): Promise<string>
  matches(password: string, hash: string): Promise<boolean>
}
```

- [ ] **Étape 2 : écrire les tests des use cases (ils échouent)**

`tests/unit/iam/fake-iam-store.ts` :

```ts
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
```

`tests/unit/iam/use-cases.test.ts` :

```ts
import { describe, expect, it } from 'vitest'
import { approveesOf } from '@/modules/iam/application/approvees-of'
import { assignManager } from '@/modules/iam/application/assign-manager'
import { authenticate } from '@/modules/iam/application/authenticate'
import { canDecide } from '@/modules/iam/application/can-decide'
import { getActor } from '@/modules/iam/application/get-actor'
import { getContact } from '@/modules/iam/application/get-contact'
import { listDirectory } from '@/modules/iam/application/list-directory'
import { signUp } from '@/modules/iam/application/sign-up'
import { InvalidManager } from '@/modules/iam/domain/errors'
import { FakeIamStore, fakeHasher, user } from './fake-iam-store'

const VALIDATION_ERROR = 'Nom requis, email invalide, ou mot de passe trop court (8 caractères minimum).'

function org() {
  return new FakeIamStore([
    user({ id: 'hr', role: 'hr_admin' }),
    user({ id: 'm1', role: 'manager' }),
    user({ id: 'm2', role: 'manager', managerId: 'm1' }),
    user({ id: 'e1', managerId: 'm2' }),
    user({ id: 'loose' }),
    user({ id: 'other', role: 'manager', companyId: 'globex' }),
  ])
}

describe('getActor (F31)', () => {
  it('relit le rôle en base', async () => {
    const store = org()
    store.users.find((u) => u.id === 'm1')!.role = 'employee'
    expect((await getActor(store)('m1')).role).toBe('employee')
  })

  it('acteur disparu : 401', async () => {
    await expect(getActor(org())('fantome')).rejects.toMatchObject({ status: 401 })
  })
})

describe('authenticate', () => {
  it('identifiants valides', async () => {
    expect(await authenticate(org(), fakeHasher)('e1@acme.fr', 'secret')).toEqual({
      id: 'e1',
      email: 'e1@acme.fr',
      role: 'employee',
    })
  })

  it.each([['e1@acme.fr', 'faux'], ['personne@acme.fr', 'secret']])('refus : %s / %s', async (email, password) => {
    expect(await authenticate(org(), fakeHasher)(email, password)).toBeNull()
  })
})

describe('signUp', () => {
  it('crée le compte', async () => {
    const store = new FakeIamStore()
    expect(await signUp(store, fakeHasher)({ name: '  Alice ', email: 'alice@acme.fr', password: 'motdepasse' })).toEqual({ ok: true })
    expect(store.users[0]).toMatchObject({ name: 'Alice', role: 'hr_admin', passwordHash: 'hash:motdepasse' })
  })

  it.each<[string, Record<string, unknown>]>([
    ['nom vide', { name: '  ', email: 'a@acme.fr', password: 'motdepasse' }],
    ['email invalide', { name: 'A', email: 'a@acme', password: 'motdepasse' }],
    ['mot de passe court', { name: 'A', email: 'a@acme.fr', password: '1234567' }],
    ['champ absent', { name: 'A', email: 'a@acme.fr' }],
  ])('refus de validation : %s', async (_label, input) => {
    expect(await signUp(new FakeIamStore(), fakeHasher)(input as never)).toEqual({ ok: false, error: VALIDATION_ERROR })
  })

  it('refuse un domaine de messagerie publique (F4)', async () => {
    const store = new FakeIamStore()
    expect(await signUp(store, fakeHasher)({ name: 'G', email: 'g@gmail.com', password: 'motdepasse' })).toEqual({
      ok: false,
      error: 'Utilise ton adresse professionnelle : les adresses de messagerie publique ne peuvent pas créer d’entreprise.',
    })
    expect(store.users).toEqual([])
  })

  it('email déjà utilisé (F12)', async () => {
    expect(await signUp(org(), fakeHasher)({ name: 'X', email: 'e1@acme.fr', password: 'motdepasse' })).toEqual({
      ok: false,
      error: 'Un compte existe déjà avec cet email.',
    })
  })
})

describe('assignManager (F5, F30)', () => {
  const hr = { id: 'hr', companyId: 'acme', role: 'hr_admin' as const, managerId: null }

  it('verrouille l’organigramme puis rattache', async () => {
    const store = org()
    expect(await assignManager(store)(hr, 'loose', 'm1')).toMatchObject({ id: 'loose', managerId: 'm1' })
    expect(store.locks).toBe(1)
  })

  it('refuse un manager d’une autre entreprise (F5)', async () => {
    await expect(assignManager(org())(hr, 'loose', 'other')).rejects.toThrow(InvalidManager)
  })

  it('refuse un cycle (F30)', async () => {
    await expect(assignManager(org())(hr, 'm1', 'm2')).rejects.toThrow(InvalidManager)
  })
})

describe('approveesOf / canDecide / listDirectory / getContact', () => {
  const m2 = { id: 'm2', companyId: 'acme', role: 'manager' as const, managerId: 'm1' }
  const hr = { id: 'hr', companyId: 'acme', role: 'hr_admin' as const, managerId: null }

  it('approveesOf', async () => {
    expect(await approveesOf(org())(m2)).toEqual(['e1'])
    expect(await approveesOf(org())(hr)).toEqual(['m1', 'loose'])
  })

  it('canDecide, propriétaire inconnu ou d’une autre entreprise : false', async () => {
    expect(await canDecide(org())(m2, 'e1')).toBe(true)
    expect(await canDecide(org())(m2, 'other')).toBe(false)
    expect(await canDecide(org())(m2, 'inconnu')).toBe(false)
  })

  it('listDirectory exclut les RH', async () => {
    expect((await listDirectory(org())(hr)).map((u) => u.id)).toEqual(['m1', 'm2', 'e1', 'loose'])
  })

  it('getContact', async () => {
    expect(await getContact(org())(m2, 'e1')).toEqual({ name: 'e1', email: 'e1@acme.fr' })
  })
})
```

Run : `npx vitest run --project unit tests/unit/iam/use-cases.test.ts`
Attendu : FAIL, use cases introuvables.

- [ ] **Étape 3 : les use cases**

`src/modules/iam/application/get-actor.ts` :

```ts
import type { Actor } from '@/shared/actor'
import { Unauthenticated } from '@/shared/errors'
import type { IamStore } from '../ports/IamStore'

/** F31 : l'acteur (rôle, entreprise, manager) est relu en base à chaque requête. */
export function getActor(store: IamStore) {
  return async (userId: string): Promise<Actor> => {
    const actor = await store.findActor(userId)
    if (!actor) throw new Unauthenticated()
    return actor
  }
}
```

`src/modules/iam/application/authenticate.ts` :

```ts
import type { Role } from '@/shared/actor'
import type { IamStore } from '../ports/IamStore'
import type { PasswordHasher } from '../ports/PasswordHasher'

export function authenticate(store: IamStore, hasher: PasswordHasher) {
  return async (email: string, password: string): Promise<{ id: string; email: string; role: Role } | null> => {
    const credentials = await store.credentialsFor(email)
    if (!credentials) return null
    if (!(await hasher.matches(password, credentials.passwordHash))) return null
    return { id: credentials.id, email: credentials.email, role: credentials.role }
  }
}
```

`src/modules/iam/application/sign-up.ts` :

```ts
import { companyNameFor, isPublicEmailDomain } from '../domain/Company'
import { EmailAlreadyUsed } from '../domain/errors'
import type { IamStore } from '../ports/IamStore'
import type { PasswordHasher } from '../ports/PasswordHasher'

export type SignUpResult = { ok: true } | { ok: false; error: string }

const MIN_PASSWORD_LENGTH = 8
const EMAIL_PATTERN = /^[^\s@]+@([^\s@]+\.[^\s@]+)$/
const VALIDATION_ERROR = `Nom requis, email invalide, ou mot de passe trop court (${MIN_PASSWORD_LENGTH} caractères minimum).`

/** Premier inscrit d'un domaine : RH de la nouvelle entreprise ; suivants : employés sans manager. */
export function signUp(store: IamStore, hasher: PasswordHasher) {
  return async (input: { name?: unknown; email?: unknown; password?: unknown }): Promise<SignUpResult> => {
    const { name, email, password } = input
    const emailMatch = typeof email === 'string' ? EMAIL_PATTERN.exec(email) : null
    if (
      typeof name !== 'string' ||
      name.trim().length === 0 ||
      !emailMatch ||
      typeof email !== 'string' ||
      typeof password !== 'string' ||
      password.length < MIN_PASSWORD_LENGTH
    ) {
      return { ok: false, error: VALIDATION_ERROR }
    }

    const domain = emailMatch[1].toLowerCase()
    if (isPublicEmailDomain(domain)) {
      return {
        ok: false,
        error: 'Utilise ton adresse professionnelle : les adresses de messagerie publique ne peuvent pas créer d’entreprise.',
      }
    }

    try {
      await store.createAccount({
        name: name.trim(),
        email,
        passwordHash: await hasher.hash(password),
        domain,
        companyName: companyNameFor(domain),
      })
    } catch (error) {
      if (error instanceof EmailAlreadyUsed) return { ok: false, error: 'Un compte existe déjà avec cet email.' }
      throw error
    }
    return { ok: true }
  }
}
```

`src/modules/iam/application/list-directory.ts` :

```ts
import type { Actor } from '@/shared/actor'
import type { DirectoryUser, IamStore } from '../ports/IamStore'

export function listDirectory(store: IamStore) {
  return (actor: Actor): Promise<DirectoryUser[]> => store.withOrgChart(actor, (org) => org.directory())
}
```

`src/modules/iam/application/assign-manager.ts` :

```ts
import type { Actor } from '@/shared/actor'
import { assertCanAssign } from '../domain/OrgChart'
import type { DirectoryUser, IamStore } from '../ports/IamStore'

/** F5, F30 : vérification et écriture dans la même transaction, sous le verrou d'organigramme. */
export function assignManager(store: IamStore) {
  return (actor: Actor, targetId: string, managerId: string | null): Promise<DirectoryUser> =>
    store.withOrgChart(actor, async (org) => {
      await org.lock()
      assertCanAssign(targetId, managerId, await org.members())
      return org.setManager(targetId, managerId)
    })
}
```

`src/modules/iam/application/approvees-of.ts` :

```ts
import type { Actor } from '@/shared/actor'
import { approveesOf as approveesIn } from '../domain/ApprovalPolicy'
import type { IamStore } from '../ports/IamStore'

export function approveesOf(store: IamStore) {
  return (actor: Actor): Promise<string[]> =>
    store.withOrgChart(actor, async (org) => approveesIn(actor.id, await org.members()))
}
```

`src/modules/iam/application/can-decide.ts` :

```ts
import type { Actor } from '@/shared/actor'
import { canDecide as canDecideIn } from '../domain/ApprovalPolicy'
import type { IamStore } from '../ports/IamStore'

export function canDecide(store: IamStore) {
  return (actor: Actor, ownerId: string): Promise<boolean> =>
    store.withOrgChart(actor, async (org) => {
      const members = await org.members()
      const owner = members.find((member) => member.id === ownerId)
      return owner ? canDecideIn(actor.id, owner, members) : false
    })
}
```

`src/modules/iam/application/get-contact.ts` :

```ts
import type { Actor } from '@/shared/actor'
import type { Contact, IamStore } from '../ports/IamStore'

export function getContact(store: IamStore) {
  return (actor: Actor, userId: string): Promise<Contact | null> =>
    store.withOrgChart(actor, (org) => org.contact(userId))
}
```

Run : `npx vitest run --project unit tests/unit/iam/use-cases.test.ts`
Attendu : PASS.

- [ ] **Étape 4 : écrire le test de l'adapter Postgres (il échoue)**

`tests/integration/iam/pg-iam-store.test.ts` :

```ts
import { describe, expect, it } from 'vitest'
import { InvalidManager } from '@/modules/iam/domain/errors'
import { iam } from '@/modules/iam'
import { createOrg, createUser, findUser } from '../../support/factories'

describe('iam sur Postgres', () => {
  it('getActor lit rôle, entreprise et manager', async () => {
    const { employee, manager, company } = await createOrg()
    expect(await iam.getActor(employee.id)).toEqual({
      id: employee.id,
      companyId: company.id,
      role: 'employee',
      managerId: manager.id,
    })
  })

  it("approveesOf d'un RH : managers racines, non rattachés, autres RH", async () => {
    const org = await createOrg()
    const loose = await createUser({ company: org.company })
    const otherHr = await createUser({ company: org.company, role: 'hr_admin' })
    await createOrg()
    const hr = await iam.getActor(org.hr.id)
    expect(new Set(await iam.approveesOf(hr))).toEqual(new Set([org.manager.id, loose.id, otherHr.id]))
  })

  it('getContact dans la portée RLS du manager', async () => {
    const org = await createOrg()
    expect(await iam.getContact(await iam.getActor(org.manager.id), org.employee.id)).toEqual({
      name: org.employee.name,
      email: org.employee.email,
    })
  })

  it('F30 en concurrence : « M1 → M2 » et « M2 → M1 » simultanés donnent un succès et un refus', async () => {
    const org = await createOrg()
    const m2 = await createUser({ company: org.company, role: 'manager' })
    const hr = await iam.getActor(org.hr.id)
    const results = await Promise.allSettled([
      iam.assignManager(hr, org.manager.id, m2.id),
      iam.assignManager(hr, m2.id, org.manager.id),
    ])
    expect(results.map((r) => r.status).sort()).toEqual(['fulfilled', 'rejected'])
    expect(results.find((r) => r.status === 'rejected')).toMatchObject({ reason: expect.any(InvalidManager) })
    const managers = [(await findUser(org.manager.id))?.manager_id, (await findUser(m2.id))?.manager_id]
    expect(managers.filter((id) => id !== null)).toHaveLength(1)
  })

  it('F30 en concurrence : trois rattachements qui fermeraient une boucle donnent au moins un refus', async () => {
    const org = await createOrg()
    const [a, b, c] = await Promise.all([1, 2, 3].map(() => createUser({ company: org.company, role: 'manager' })))
    const hr = await iam.getActor(org.hr.id)
    const results = await Promise.allSettled([
      iam.assignManager(hr, a.id, b.id),
      iam.assignManager(hr, b.id, c.id),
      iam.assignManager(hr, c.id, a.id),
    ])
    expect(results.filter((r) => r.status === 'rejected').length).toBeGreaterThanOrEqual(1)
  })

  it("signUp refuse un email existant, même en concurrence (F12)", async () => {
    const results = await Promise.all([
      iam.signUp({ name: 'A', email: 'dup@neuve.fr', password: 'motdepasse' }),
      iam.signUp({ name: 'B', email: 'dup@neuve.fr', password: 'motdepasse' }),
    ])
    expect(results).toContainEqual({ ok: true })
    expect(results).toContainEqual({ ok: false, error: 'Un compte existe déjà avec cet email.' })
  })
})
```

Run : `npx vitest run --project integration tests/integration/iam`
Attendu : FAIL, `@/modules/iam` introuvable.

- [ ] **Étape 5 : les adapters**

`src/modules/iam/infrastructure/BcryptPasswordHasher.ts` :

```ts
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
```

`src/modules/iam/infrastructure/PgIamStore.ts` :

```ts
import type { Actor, Role } from '@/shared/actor'
import { getPool } from '@/shared/db'
import { runInScope, type Sql } from '@/shared/unit-of-work'
import type { OrgMember } from '../domain/ApprovalPolicy'
import { EmailAlreadyUsed } from '../domain/errors'
import type { Contact, Credentials, DirectoryUser, IamStore, NewAccount, OrgChart } from '../ports/IamStore'

interface UserRow {
  id: string
  name: string
  email: string
  role: Role
  manager_id: string | null
}

function toDirectoryUser(row: UserRow): DirectoryUser {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role as DirectoryUser['role'],
    managerId: row.manager_id,
  }
}

class PgOrgChart implements OrgChart {
  constructor(
    private readonly sql: Sql,
    private readonly companyId: string
  ) {}

  async lock(): Promise<void> {
    await this.sql.query("SELECT pg_advisory_xact_lock(hashtextextended('org:' || $1, 0))", [this.companyId])
  }

  async members(): Promise<OrgMember[]> {
    const { rows } = await this.sql.query<{ id: string; role: Role; manager_id: string | null }>(
      'SELECT id, role, manager_id FROM users WHERE company_id = $1 ORDER BY created_at, id',
      [this.companyId]
    )
    return rows.map((row) => ({ id: row.id, role: row.role, managerId: row.manager_id }))
  }

  async directory(): Promise<DirectoryUser[]> {
    const { rows } = await this.sql.query<UserRow>(
      `SELECT id, name, email, role, manager_id FROM users
       WHERE role IN ('employee', 'manager') AND company_id = $1
       ORDER BY name`,
      [this.companyId]
    )
    return rows.map(toDirectoryUser)
  }

  async setManager(targetId: string, managerId: string | null): Promise<DirectoryUser> {
    const { rows } = await this.sql.query<UserRow>(
      `UPDATE users SET manager_id = $1 WHERE id = $2
       RETURNING id, name, email, role, manager_id`,
      [managerId, targetId]
    )
    return toDirectoryUser(rows[0])
  }

  async contact(userId: string): Promise<Contact | null> {
    const { rows } = await this.sql.query<{ name: string; email: string }>(
      'SELECT name, email FROM users WHERE id = $1',
      [userId]
    )
    return rows[0] ?? null
  }
}

export class PgIamStore implements IamStore {
  async findActor(userId: string): Promise<Actor | null> {
    const { rows } = await getPool().query<{ id: string; company_id: string; role: Role; manager_id: string | null }>(
      'SELECT id, company_id, role, manager_id FROM app.actor($1)',
      [userId]
    )
    const row = rows[0]
    return row ? { id: row.id, companyId: row.company_id, role: row.role, managerId: row.manager_id } : null
  }

  async credentialsFor(email: string): Promise<Credentials | null> {
    const { rows } = await getPool().query<{ id: string; email: string; password_hash: string; role: Role }>(
      'SELECT id, email, password_hash, role FROM app.credentials_for($1)',
      [email]
    )
    const row = rows[0]
    return row ? { id: row.id, email: row.email, passwordHash: row.password_hash, role: row.role } : null
  }

  async createAccount(account: NewAccount): Promise<void> {
    try {
      await getPool().query('SELECT * FROM app.sign_up($1, $2, $3, $4, $5)', [
        account.name,
        account.email,
        account.passwordHash,
        account.domain,
        account.companyName,
      ])
    } catch (error) {
      if ((error as { code?: string }).code === '23505') throw new EmailAlreadyUsed()
      throw error
    }
  }

  withOrgChart<T>(actor: Actor, fn: (org: OrgChart) => Promise<T>): Promise<T> {
    return runInScope({ userId: actor.id, companyId: actor.companyId }, (sql) =>
      fn(new PgOrgChart(sql, actor.companyId))
    )
  }
}
```

`src/modules/iam/index.ts` :

```ts
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
```

- [ ] **Étape 6 : lancer et commiter**

Run : `npx vitest run tests/unit/iam tests/integration/iam && npm run depcruise`
Attendu : PASS, aucune violation.

```bash
git add src/modules/iam tests/unit/iam tests/integration/iam
git commit -m "feat(iam): use cases, adapters Postgres et bcrypt, verrou d'organigramme (F5, F12, F30)"
```

---

### Tâche 4 : les entrées passent par `iam` — acteur relu en base, inscription, annuaire, rattachement (F4, F5, F30, F31)

**Fichiers :**
- Créer : `src/app/api/_lib/current-actor.ts`
- Modifier : `src/lib/auth.ts`, `src/types/next-auth.d.ts`, `src/app/actions/auth.ts`, `src/app/api/hr/users/route.ts`, `src/app/api/hr/users/[id]/manager/route.ts`, `tests/integration/actions/auth.test.ts`, `tests/integration/api/hr-user-manager.test.ts`, `tests/integration/workflow.test.ts`, `tests/e2e/auth.spec.ts`

**Interfaces :**
- Produit : `currentActor(): Promise<Actor>` (lève `Unauthenticated` sans session ou si le compte a disparu). Toutes les routes migrées l'utilisent à la place de `requireSession()`.

- [ ] **Étape 1 : faire basculer les tests (ils échouent)**

`tests/integration/workflow.test.ts`, describe « rôle figé dans la session » renommé « rôle relu en base (F31) » :

```ts
describe('rôle relu en base (F31)', () => {
  it('un manager rétrogradé en base perd ses droits immédiatement, même si sa session dit « manager »', async () => {
    const org = await createOrg()
    const note = await createNote({ user: org.employee })
    await testDb().query("UPDATE users SET role = 'employee' WHERE id = $1", [org.manager.id])
    actAs(org.manager, 'manager')
    expect((await managerQueue()).status).toBe(403)
    expect((await approveAsManager(note.id)).status).toBe(403)
  })

  it('un employé promu en base obtient ses droits immédiatement, même si sa session dit « employee »', async () => {
    const org = await createOrg()
    await testDb().query("UPDATE users SET role = 'manager' WHERE id = $1", [org.employee.id])
    actAs(org.employee, 'employee')
    expect((await managerQueue()).status).toBe(200)
  })
})
```

(La file manager ne passe sur `iam` qu'en tâche 9 ; ces deux tests resteront rouges jusque-là pour la file et l'approbation — **les marquer `it.todo` dans cette tâche** puis les réactiver en tâche 9 à l'étape « faire basculer les tests ». Les tests d'annuaire et de rattachement ci-dessous, eux, passent dans cette tâche.)

`tests/integration/api/hr-user-manager.test.ts` : ajouter

```ts
  it('refuse un cycle direct (F30) : 409, organigramme inchangé', async () => {
    const org = await createOrg()
    const other = await createUser({ company: org.company, role: 'manager' })
    actAs(org.hr)
    expect((await assign(org.manager.id, { managerId: other.id })).status).toBe(200)
    await expectProblem(await assign(other.id, { managerId: org.manager.id }), 409, 'Invalid manager')
    expect(await managerIdOf(other.id)).toBeNull()
  })

  it('refuse un cycle long (F30)', async () => {
    const org = await createOrg()
    const b = await createUser({ company: org.company, role: 'manager', manager: org.manager })
    const c = await createUser({ company: org.company, role: 'manager', manager: b })
    actAs(org.hr)
    await expectProblem(await assign(org.manager.id, { managerId: c.id }), 409, 'Invalid manager')
  })

  it("le rôle est relu en base : un RH rétrogradé est refusé (F31)", async () => {
    const org = await createOrg()
    await testDb().query("UPDATE users SET role = 'employee' WHERE id = $1", [org.hr.id])
    actAs(org.hr, 'hr_admin')
    await expectProblem(await assign(org.employee.id, { managerId: null }), 403, 'Unauthorized')
  })
```

et remplacer `[as-is] accepte un cycle entre deux managers` par le premier test ci-dessus (supprimer l'ancien). Importer `testDb` depuis `../../support/db`.

`tests/integration/actions/auth.test.ts` : ajouter dans `describe('signup')` :

```ts
  it.each(['alice@gmail.com', 'bob@outlook.fr', 'carla@yahoo.fr'])(
    'refuse un domaine de messagerie publique (F4) : %s',
    async (email) => {
      expect(await signup({}, form({ ...VALID, email }))).toEqual({
        error: 'Utilise ton adresse professionnelle : les adresses de messagerie publique ne peuvent pas créer d’entreprise.',
      })
      expect(await countRows('companies')).toBe(0)
      expect(signInMock).not.toHaveBeenCalled()
    }
  )
```

Vérifier que `tests/e2e/auth.spec.ts` et `tests/e2e/helpers.ts` n'inscrivent aucun compte sur un domaine de la liste publique (`grep -n "@" tests/e2e/*.ts`) ; remplacer le cas échéant par `@e2e-<id>.test`.

Run : `npm test`
Attendu : FAIL sur F4, F30 et F31 (RH rétrogradé).

- [ ] **Étape 2 : `src/app/api/_lib/current-actor.ts`**

```ts
// Adapter d'entrée : la session prouve l'identité, iam fournit l'acteur à
// jour (rôle, entreprise). Un compte supprimé donne 401 (F31).
import { iam } from '@/modules/iam'
import type { Actor } from '@/shared/actor'
import { requireSession } from '@/shared/http'

export async function currentActor(): Promise<Actor> {
  const session = await requireSession()
  return iam.getActor(session.id)
}
```

(`_lib` : dossier privé de Next.js, jamais exposé comme route.)

- [ ] **Étape 3 : Auth.js délègue à `iam`, le JWT ne porte plus que l'id**

`src/lib/auth.ts`, remplacer le contenu par :

```ts
import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import { iam } from '@/modules/iam'
import { config } from '@/shared/config'

// Initialisation paresseuse : le secret est lu (et validé) à la première requête.
export const { handlers, auth, signIn, signOut } = NextAuth(() => ({
  secret: config().authSecret,
  session: { strategy: 'jwt' },
  pages: {
    signIn: '/login',
  },
  providers: [
    Credentials({
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Mot de passe', type: 'password' },
      },
      async authorize(credentials) {
        const email = typeof credentials?.email === 'string' ? credentials.email : null
        const password = typeof credentials?.password === 'string' ? credentials.password : null
        if (!email || !password) return null
        return iam.authenticate(email, password)
      },
    }),
  ],
  callbacks: {
    // F31 : le jeton ne porte que l'identité ; le rôle est relu en base.
    async jwt({ token, user }) {
      if (user?.id) token.id = user.id
      return token
    },
    async session({ session, token }) {
      if (session.user && typeof token.id === 'string') {
        session.user.id = token.id
        const actor = await iam.getActor(token.id).catch(() => null)
        // Compte supprimé : aucun privilège dans l'UI ; les API répondent 401.
        session.user.role = actor?.role ?? 'employee'
      }
      return session
    },
  },
}))
```

`src/types/next-auth.d.ts` : dans le module `next-auth/jwt`, retirer `role?: UserRole` de `JWT` (garder `id`). Dans `User`, rendre `role` optionnel (`role?: UserRole`).

- [ ] **Étape 4 : la server action d'inscription**

`src/app/actions/auth.ts`, remplacer `signup` par :

```ts
export async function signup(
  _prevState: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const name = formData.get('name')
  const email = formData.get('email')
  const password = formData.get('password')

  const result = await iam.signUp({ name, email, password })
  if (!result.ok) return { error: result.error }

  try {
    await signIn('credentials', { email, password, redirectTo: '/expenses' })
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: 'Le compte a été créé mais la connexion automatique a échoué.' }
    }
    throw error
  }
  return {}
}
```

Imports : retirer `bcryptjs` et `getPool`, ajouter `import { iam } from '@/modules/iam'`. Supprimer `MIN_PASSWORD_LENGTH` et `EMAIL_PATTERN` (déplacés dans `iam`).

- [ ] **Étape 5 : annuaire et rattachement**

`src/app/api/hr/users/route.ts` :

```ts
import { iam } from '@/modules/iam'
import { requireRole, route } from '@/shared/http'
import { currentActor } from '../../_lib/current-actor'

export const GET = route(async () => {
  const actor = await currentActor()
  requireRole(actor, 'hr_admin')
  return Response.json(await iam.listDirectory(actor))
})
```

`src/app/api/hr/users/[id]/manager/route.ts` :

```ts
import { iam } from '@/modules/iam'
import { InvalidInput } from '@/shared/errors'
import { parseUuid, readJsonObject, requireRole, route, type RouteContext } from '@/shared/http'
import { currentActor } from '../../../../_lib/current-actor'

/** F41 : la clé `managerId` est obligatoire ; `null` détache explicitement. */
function managerIdFrom(body: Record<string, unknown>): string | null {
  if (!('managerId' in body)) throw new InvalidInput('Corps de requête invalide')
  const value = body.managerId
  if (value === null) return null
  if (typeof value !== 'string') throw new InvalidInput('Corps de requête invalide')
  try {
    return parseUuid(value)
  } catch {
    throw new InvalidInput('Corps de requête invalide')
  }
}

export const PUT = route(async (request, { params }: RouteContext<{ id: string }>) => {
  const actor = await currentActor()
  requireRole(actor, 'hr_admin')
  const id = parseUuid((await params).id)
  const managerId = managerIdFrom(await readJsonObject(request))
  return Response.json(await iam.assignManager(actor, id, managerId))
})
```

- [ ] **Étape 6 : lancer et commiter**

Run : `npm test && npm run test:e2e -- tests/e2e/auth.spec.ts tests/e2e/hr-admin.spec.ts && npm run depcruise`
Attendu : PASS (les deux tests F31 de la file manager sont en `it.todo`).

```bash
git add src tests
git commit -m "feat(iam): rôle relu en base, inscription sans domaine public, annuaire et rattachement via iam (F4, F5, F30, F31)"
```

---

### Tâche 5 : domaine `expenses` — note, soumission, tri, texte d'un reçu

**Fichiers :**
- Créer : `src/modules/expenses/domain/ExpenseNote.ts`, `src/modules/expenses/domain/Submission.ts`, `src/modules/expenses/domain/ReceiptText.ts`, `src/modules/expenses/domain/errors.ts`, `tests/unit/expenses/expense-note.test.ts`, `tests/unit/expenses/submission.test.ts`
- Déplacer : `src/lib/note-sort.ts` → `src/modules/expenses/domain/NoteSort.ts`, `tests/unit/note-sort.test.ts` → `tests/unit/expenses/note-sort.test.ts`
- Créer à partir de `tests/unit/ocr.test.ts` : `tests/unit/expenses/receipt-text.test.ts`

**Interfaces :**
- Produit :
  - `type NoteStatus = 'pending' | 'approved' | 'rejected'`, `type Decision = 'approved' | 'rejected'`
  - `interface ExpenseNoteProps { id; userId; companyId; amount: number; expenseDate: string; description; receiptKey; status: NoteStatus; createdAt: Date }`
  - `interface ExpenseNoteDto { id; userId; amount: number; expenseDate; description; receiptKey; status: NoteStatus; createdAt: string }`
  - `class ExpenseNote { id; userId; status; receiptKey; decide(decision: Decision): ExpenseNote; toDto(): ExpenseNoteDto }`
  - `MAX_RECEIPT_BYTES`, `ALLOWED_RECEIPT_TYPES`, `interface ReceiptFile { name; type; size: number; read(): Promise<Uint8Array> }`, `interface Submission { amount; expenseDate; description; receipt: ReceiptFile }`, `parseSubmission(fields: { amount: unknown; expenseDate: unknown; description: unknown; receipt: ReceiptFile | null }): Submission`, `receiptKeyFor(seq: number, receipt: { name: string; type: string }): string`
  - `parseNoteSort(raw: string | null): string` (déplacé)
  - `interface ReceiptSuggestion { amount?: number; expenseDate?: string }`, `SUPPORTED_OCR_TYPES`, `suggestFromText(text: string): ReceiptSuggestion`
  - `class AlreadyDecided extends Conflict` (409, `Already decided`), `class ReceiptUploadFailed extends UpstreamFailure` (502, `Stockage des reçus indisponible`)

- [ ] **Étape 1 : déplacer le tri et ses tests**

```bash
mkdir -p src/modules/expenses/domain tests/unit/expenses
git mv src/lib/note-sort.ts src/modules/expenses/domain/NoteSort.ts
git mv tests/unit/note-sort.test.ts tests/unit/expenses/note-sort.test.ts
```

Dans `tests/unit/expenses/note-sort.test.ts`, l'import devient `import { parseNoteSort } from '@/modules/expenses/domain/NoteSort'`. Dans `src/app/api/expense-notes/route.ts`, l'import devient `import { parseNoteSort } from '@/modules/expenses/domain/NoteSort'` (temporaire : la route passe par `expenses` en tâche 8 ; la règle `app-par-les-index` est encore en avertissement).

- [ ] **Étape 2 : écrire les tests qui échouent**

`tests/unit/expenses/expense-note.test.ts` :

```ts
import { describe, expect, it } from 'vitest'
import { ExpenseNote, type ExpenseNoteProps } from '@/modules/expenses/domain/ExpenseNote'
import { AlreadyDecided } from '@/modules/expenses/domain/errors'

const props: ExpenseNoteProps = {
  id: 'n1',
  userId: 'u1',
  companyId: 'c1',
  amount: 42.5,
  expenseDate: '2026-10-08',
  description: 'Taxi',
  receiptKey: 'receipts/1.png',
  status: 'pending',
  createdAt: new Date('2026-10-08T10:00:00.000Z'),
}

describe('ExpenseNote', () => {
  it.each(['approved', 'rejected'] as const)('pending → %s', (decision) => {
    const decided = new ExpenseNote(props).decide(decision)
    expect(decided.status).toBe(decision)
  })

  it.each(['approved', 'rejected'] as const)('une note %s ne se décide plus (F9)', (status) => {
    expect(() => new ExpenseNote({ ...props, status }).decide('approved')).toThrow(AlreadyDecided)
  })

  it('toDto : contrat HTTP historique', () => {
    expect(new ExpenseNote(props).toDto()).toEqual({
      id: 'n1',
      userId: 'u1',
      amount: 42.5,
      expenseDate: '2026-10-08',
      description: 'Taxi',
      receiptKey: 'receipts/1.png',
      status: 'pending',
      createdAt: '2026-10-08T10:00:00.000Z',
    })
  })
})
```

`tests/unit/expenses/submission.test.ts` :

```ts
import { describe, expect, it } from 'vitest'
import { MAX_RECEIPT_BYTES, parseSubmission, receiptKeyFor, type ReceiptFile } from '@/modules/expenses/domain/Submission'
import { InvalidInput } from '@/shared/errors'

function receipt(partial: Partial<ReceiptFile> = {}): ReceiptFile {
  return { name: 'recu.png', type: 'image/png', size: 10, read: async () => new Uint8Array(10), ...partial }
}

const valid = { amount: '42.50', expenseDate: '2026-10-08', description: 'Taxi', receipt: receipt() }

describe('parseSubmission', () => {
  it('lit une soumission valide', () => {
    expect(parseSubmission(valid)).toMatchObject({ amount: 42.5, expenseDate: '2026-10-08', description: 'Taxi' })
  })

  it.each<[string, Partial<typeof valid> | { amount?: unknown; receipt?: null }]>([
    ['montant absent', { amount: undefined }],
    ['montant non numérique', { amount: 'abc' }],
    ['montant nul', { amount: '0' }],
    ['date absente', { expenseDate: undefined }],
    ['description vide', { description: '   ' }],
    ['reçu absent', { receipt: null }],
  ])('« Champs invalides » : %s', (_label, override) => {
    expect(() => parseSubmission({ ...valid, ...override } as never)).toThrow(new InvalidInput('Champs invalides'))
  })

  it('type refusé avant la taille', () => {
    expect(() =>
      parseSubmission({ ...valid, receipt: receipt({ type: 'text/plain', size: MAX_RECEIPT_BYTES + 1 }) })
    ).toThrow(new InvalidInput('Type de fichier non autorisé pour le reçu'))
  })

  it('refuse 10 Mo + 1 octet, accepte 10 Mo pile', () => {
    expect(() => parseSubmission({ ...valid, receipt: receipt({ size: MAX_RECEIPT_BYTES + 1 }) })).toThrow(
      new InvalidInput('Fichier trop volumineux')
    )
    expect(() => parseSubmission({ ...valid, receipt: receipt({ size: MAX_RECEIPT_BYTES }) })).not.toThrow()
  })
})

describe('receiptKeyFor', () => {
  it.each([
    ['image/png', 'receipts/7.png'],
    ['image/jpeg', 'receipts/7.jpg'],
    ['image/webp', 'receipts/7.webp'],
    ['application/pdf', 'receipts/7.pdf'],
  ])('%s → %s', (type, key) => {
    expect(receiptKeyFor(7, { name: 'recu.bin', type })).toBe(key)
  })
})
```

`tests/unit/expenses/receipt-text.test.ts` : copier depuis `tests/unit/ocr.test.ts` **tous les `describe` qui portent sur l'analyse du texte** (montant, date) — pas ceux sur les types de fichier ni sur le worker, qui partent en tâche 7. En tête du fichier :

```ts
import { describe, expect, it } from 'vitest'
import { suggestFromText } from '@/modules/expenses/domain/ReceiptText'
```

et supprimer la fonction locale `suggestFromText` (qui passait par un faux worker), le `vi.mock('tesseract.js', …)`, `fakeOcr` et les `beforeEach`/`afterEach`. La fonction du domaine est synchrone : remplacer `await suggestFromText(` par `suggestFromText(` et `.resolves.` par rien, sans changer aucune valeur attendue.

Run : `npx vitest run --project unit tests/unit/expenses`
Attendu : FAIL, modules du domaine introuvables.

- [ ] **Étape 3 : `src/modules/expenses/domain/errors.ts`**

```ts
import { Conflict, UpstreamFailure } from '@/shared/errors'

export class AlreadyDecided extends Conflict {
  constructor() {
    super('already-decided', 'Already decided')
  }
}

/** Le reçu n'a pas pu être envoyé : aucune note n'a été créée (F10). */
export class ReceiptUploadFailed extends UpstreamFailure {
  constructor() {
    super('receipt-upload-failed', 'Stockage des reçus indisponible')
  }
}
```

- [ ] **Étape 4 : `src/modules/expenses/domain/ExpenseNote.ts`**

```ts
import { AlreadyDecided } from './errors'

export type NoteStatus = 'pending' | 'approved' | 'rejected'
export type Decision = 'approved' | 'rejected'

export interface ExpenseNoteProps {
  id: string
  userId: string
  companyId: string
  amount: number
  expenseDate: string
  description: string
  receiptKey: string
  status: NoteStatus
  createdAt: Date
}

/** Représentation HTTP, inchangée depuis la version 0.1.0 du contrat. */
export interface ExpenseNoteDto {
  id: string
  userId: string
  amount: number
  expenseDate: string
  description: string
  receiptKey: string
  status: NoteStatus
  createdAt: string
}

/** Agrégat : une note ne quitte `pending` qu'une fois. */
export class ExpenseNote {
  constructor(private readonly props: ExpenseNoteProps) {}

  get id(): string {
    return this.props.id
  }

  get userId(): string {
    return this.props.userId
  }

  get status(): NoteStatus {
    return this.props.status
  }

  get receiptKey(): string {
    return this.props.receiptKey
  }

  get amount(): number {
    return this.props.amount
  }

  get expenseDate(): string {
    return this.props.expenseDate
  }

  decide(decision: Decision): ExpenseNote {
    if (this.props.status !== 'pending') throw new AlreadyDecided()
    return new ExpenseNote({ ...this.props, status: decision })
  }

  toDto(): ExpenseNoteDto {
    const { id, userId, amount, expenseDate, description, receiptKey, status, createdAt } = this.props
    return { id, userId, amount, expenseDate, description, receiptKey, status, createdAt: createdAt.toISOString() }
  }
}
```

- [ ] **Étape 5 : `src/modules/expenses/domain/Submission.ts`**

```ts
import path from 'node:path'
import { InvalidInput } from '@/shared/errors'

export const MAX_RECEIPT_BYTES = 10 * 1024 * 1024
export const ALLOWED_RECEIPT_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'application/pdf']

const EXTENSION_BY_MIME: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'application/pdf': '.pdf',
}

/** Fichier reçu : contenu lu à la demande, après validation. */
export interface ReceiptFile {
  name: string
  type: string
  size: number
  read(): Promise<Uint8Array>
}

export interface Submission {
  amount: number
  expenseDate: string
  description: string
  receipt: ReceiptFile
}

/** Mêmes règles et mêmes messages qu'avant la refacto (contrat inchangé). */
export function parseSubmission(fields: {
  amount: unknown
  expenseDate: unknown
  description: unknown
  receipt: ReceiptFile | null
}): Submission {
  const amount = typeof fields.amount === 'string' ? Number.parseFloat(fields.amount) : NaN
  const { expenseDate, description, receipt } = fields
  if (
    !Number.isFinite(amount) ||
    amount <= 0 ||
    typeof expenseDate !== 'string' ||
    typeof description !== 'string' ||
    description.trim().length === 0 ||
    receipt === null
  ) {
    throw new InvalidInput('Champs invalides')
  }
  if (!ALLOWED_RECEIPT_TYPES.includes(receipt.type)) {
    throw new InvalidInput('Type de fichier non autorisé pour le reçu')
  }
  if (receipt.size > MAX_RECEIPT_BYTES) {
    throw new InvalidInput('Fichier trop volumineux')
  }
  return { amount, expenseDate, description, receipt }
}

export function receiptKeyFor(seq: number, receipt: { name: string; type: string }): string {
  const extension = EXTENSION_BY_MIME[receipt.type] ?? path.extname(receipt.name)
  return `receipts/${seq}${extension}`
}
```

- [ ] **Étape 6 : `src/modules/expenses/domain/ReceiptText.ts`**

Créer le fichier avec, **copiés à l'identique depuis `src/lib/ocr.ts`** : les constantes `AMOUNT_KEYWORD_PATTERN`, `CURRENCY_HINT_PATTERN`, `DECIMAL_AMOUNT_PATTERN`, `INTEGER_AMOUNT_PATTERN`, `DATE_PATTERNS`, `FRENCH_MONTHS`, `FRENCH_TEXTUAL_DATE_PATTERN`, les fonctions `stripAccents`, `parseAmount`, `toIsoDate`, `parseExpenseDate`, et l'interface `ExpenseNoteSuggestion` renommée `ReceiptSuggestion`. Ajouter en tête et en fin :

```ts
// Lecture du texte d'un reçu : règle métier pure, sans OCR. La reconnaissance
// du texte est l'affaire de l'adapter TesseractReceiptReader.
export const SUPPORTED_OCR_TYPES = ['image/png', 'image/jpeg', 'image/webp']
```

```ts
export function suggestFromText(text: string): ReceiptSuggestion {
  return { amount: parseAmount(text), expenseDate: parseExpenseDate(text) }
}
```

`src/lib/ocr.ts` reste en place jusqu'à la tâche 11 (la route OCR l'utilise encore).

- [ ] **Étape 7 : lancer et commiter**

Run : `npx vitest run --project unit tests/unit/expenses && npm test`
Attendu : PASS.

```bash
git add src/modules/expenses/domain tests/unit/expenses src/app/api/expense-notes/route.ts
git commit -m "feat(expenses): domaine — note, soumission, tri et lecture du texte d'un reçu"
```

---

### Tâche 6 : `expenses` — ports, dépôt Postgres, unité de travail, stockage S3

**Fichiers :**
- Créer : `src/modules/expenses/ports/{NoteRepository,ExpensesUnitOfWork,ReceiptStorage,ReceiptReader,Approvals}.ts`, `src/modules/expenses/infrastructure/{PgNoteRepository,PgExpensesUnitOfWork,S3ReceiptStorage}.ts`, `tests/integration/expenses/pg-note-repository.test.ts`

**Interfaces :**
- Produit :
  - `interface NewNote { userId; companyId; amount: number; expenseDate: string; description: string; receiptSeq: number; receiptKey: string }`
  - `interface NoteRepository { listByOwner(ownerId: string, sort: string): Promise<ExpenseNote[]>; listPending(ownerIds: string[]): Promise<ExpenseNote[]>; findById(id: string): Promise<ExpenseNote | null>; nextReceiptSeq(): Promise<number>; insert(note: NewNote): Promise<ExpenseNote>; saveDecision(note: ExpenseNote): Promise<boolean> }`
  - `interface ExpensesContext { notes: NoteRepository }` ; `interface ExpensesUnitOfWork { run<T>(actor: Actor, fn: (ctx: ExpensesContext) => Promise<T>): Promise<T> }` (le plan 3 ajoute `mailer` au contexte)
  - `interface ReceiptStorage { upload(key: string, body: Uint8Array, contentType: string): Promise<void>; signedUrl(key: string): Promise<string> }`
  - `interface ReceiptReader { recognize(image: Uint8Array): Promise<string> }`
  - `interface Approvals { approveesOf(actor: Actor): Promise<string[]>; canDecide(actor: Actor, ownerId: string): Promise<boolean> }`
  - `class PgNoteRepository implements NoteRepository` (constructeur `(sql: Sql)`), `class PgExpensesUnitOfWork implements ExpensesUnitOfWork`, `class S3ReceiptStorage implements ReceiptStorage`

- [ ] **Étape 1 : les ports**

`src/modules/expenses/ports/NoteRepository.ts` :

```ts
import type { ExpenseNote } from '../domain/ExpenseNote'

export interface NewNote {
  userId: string
  companyId: string
  amount: number
  expenseDate: string
  description: string
  receiptSeq: number
  receiptKey: string
}

/** Notes visibles dans la portée de la transaction (entreprise de l'acteur). */
export interface NoteRepository {
  /** `sort` vient toujours de `parseNoteSort` (liste blanche, F3). */
  listByOwner(ownerId: string, sort: string): Promise<ExpenseNote[]>
  /** Notes `pending` de ces auteurs, de la plus ancienne à la plus récente. */
  listPending(ownerIds: string[]): Promise<ExpenseNote[]>
  findById(id: string): Promise<ExpenseNote | null>
  nextReceiptSeq(): Promise<number>
  insert(note: NewNote): Promise<ExpenseNote>
  /** Applique la décision seulement si la note est encore `pending` ; `false` sinon (F9). */
  saveDecision(note: ExpenseNote): Promise<boolean>
}
```

`src/modules/expenses/ports/ExpensesUnitOfWork.ts` :

```ts
import type { Actor } from '@/shared/actor'
import type { NoteRepository } from './NoteRepository'

export interface ExpensesContext {
  notes: NoteRepository
}

/** Une transaction scopée à l'acteur : tout ce que fait `fn` est écrit ensemble, ou pas du tout. */
export interface ExpensesUnitOfWork {
  run<T>(actor: Actor, fn: (ctx: ExpensesContext) => Promise<T>): Promise<T>
}
```

`src/modules/expenses/ports/ReceiptStorage.ts` :

```ts
export interface ReceiptStorage {
  upload(key: string, body: Uint8Array, contentType: string): Promise<void>
  /** URL présignée, valable 300 s. */
  signedUrl(key: string): Promise<string>
}
```

`src/modules/expenses/ports/ReceiptReader.ts` :

```ts
/** Reconnaissance de texte sur une image de reçu. Lève `Unavailable` si saturé. */
export interface ReceiptReader {
  recognize(image: Uint8Array): Promise<string>
}
```

`src/modules/expenses/ports/Approvals.ts` :

```ts
import type { Actor } from '@/shared/actor'

/** Ce qu'expenses demande à iam (D4 : deux requêtes, frontière stricte). */
export interface Approvals {
  approveesOf(actor: Actor): Promise<string[]>
  canDecide(actor: Actor, ownerId: string): Promise<boolean>
}
```

- [ ] **Étape 2 : écrire le test du dépôt (il échoue)**

`tests/integration/expenses/pg-note-repository.test.ts` :

```ts
import { describe, expect, it } from 'vitest'
import { PgExpensesUnitOfWork } from '@/modules/expenses/infrastructure/PgExpensesUnitOfWork'
import type { Actor } from '@/shared/actor'
import { testDb } from '../../support/db'
import { createNote, createOrg, findNote, type UserRow } from '../../support/factories'

const uow = new PgExpensesUnitOfWork()

function actorOf(user: UserRow): Actor {
  return { id: user.id, companyId: user.company_id, role: user.role, managerId: user.manager_id }
}

describe('PgNoteRepository', () => {
  it('insère avec le numéro réservé, relit, et ne voit que son entreprise', async () => {
    const a = await createOrg()
    const b = await createOrg()
    const noteB = await createNote({ user: b.employee })
    const actor = actorOf(a.employee)
    const seq = await uow.run(actor, (ctx) => ctx.notes.nextReceiptSeq())
    const note = await uow.run(actor, (ctx) =>
      ctx.notes.insert({
        userId: actor.id,
        companyId: actor.companyId,
        amount: 12.5,
        expenseDate: '2026-10-08',
        description: 'Taxi',
        receiptSeq: seq,
        receiptKey: `receipts/${seq}.png`,
      })
    )
    expect(note.toDto()).toMatchObject({ amount: 12.5, receiptKey: `receipts/${seq}.png`, status: 'pending' })
    expect((await findNote(note.id))?.receipt_seq).toBe(seq)
    expect((await uow.run(actor, (ctx) => ctx.notes.listByOwner(actor.id, 'created_at DESC'))).map((n) => n.id)).toEqual([note.id])
    expect(await uow.run(actor, (ctx) => ctx.notes.findById(noteB.id))).toBeNull()
  })

  it('listPending : notes en attente des auteurs donnés, plus anciennes d’abord', async () => {
    const org = await createOrg()
    const recent = await createNote({ user: org.employee, createdAt: new Date('2026-10-02T08:00:00Z') })
    const old = await createNote({ user: org.manager, createdAt: new Date('2026-10-01T08:00:00Z') })
    await createNote({ user: org.employee, status: 'approved' })
    await createNote({ user: org.hr })
    const notes = await uow.run(actorOf(org.hr), (ctx) => ctx.notes.listPending([org.employee.id, org.manager.id]))
    expect(notes.map((n) => n.id)).toEqual([old.id, recent.id])
  })

  it('saveDecision ne modifie qu’une note encore pending (F9)', async () => {
    const org = await createOrg()
    const note = await createNote({ user: org.employee })
    const actor = actorOf(org.manager)
    // Lue « pending », puis décidée par quelqu'un d'autre avant notre UPDATE.
    const stale = await uow.run(actor, (ctx) => ctx.notes.findById(note.id))
    await testDb().query("UPDATE expense_notes SET status = 'rejected' WHERE id = $1", [note.id])
    expect(await uow.run(actor, (ctx) => ctx.notes.saveDecision(stale!.decide('approved')))).toBe(false)
    expect((await findNote(note.id))?.status).toBe('rejected')

    const fresh = await createNote({ user: org.employee })
    const loaded = await uow.run(actor, (ctx) => ctx.notes.findById(fresh.id))
    expect(await uow.run(actor, (ctx) => ctx.notes.saveDecision(loaded!.decide('approved')))).toBe(true)
  })
})
```

Run : `npx vitest run --project integration tests/integration/expenses`
Attendu : FAIL, adapters introuvables.

- [ ] **Étape 3 : les adapters**

`src/modules/expenses/infrastructure/PgNoteRepository.ts` :

```ts
// SQL d'expenses : uniquement expense_notes (jamais users ni companies, D4).
import type { Sql } from '@/shared/unit-of-work'
import { ExpenseNote, type NoteStatus } from '../domain/ExpenseNote'
import type { NewNote, NoteRepository } from '../ports/NoteRepository'

const COLUMNS =
  'id, user_id, company_id, amount, expense_date, description, receipt_key, status, created_at'

interface NoteRow {
  id: string
  user_id: string
  company_id: string
  amount: string
  expense_date: string
  description: string
  receipt_key: string
  status: NoteStatus
  created_at: Date
}

function toNote(row: NoteRow): ExpenseNote {
  return new ExpenseNote({
    id: row.id,
    userId: row.user_id,
    companyId: row.company_id,
    amount: Number.parseFloat(row.amount),
    expenseDate: row.expense_date,
    description: row.description,
    receiptKey: row.receipt_key,
    status: row.status,
    createdAt: new Date(row.created_at),
  })
}

export class PgNoteRepository implements NoteRepository {
  constructor(private readonly sql: Sql) {}

  async listByOwner(ownerId: string, sort: string): Promise<ExpenseNote[]> {
    const { rows } = await this.sql.query<NoteRow>(
      `SELECT ${COLUMNS} FROM expense_notes WHERE user_id = $1 ORDER BY ${sort}`,
      [ownerId]
    )
    return rows.map(toNote)
  }

  async listPending(ownerIds: string[]): Promise<ExpenseNote[]> {
    if (ownerIds.length === 0) return []
    const { rows } = await this.sql.query<NoteRow>(
      `SELECT ${COLUMNS} FROM expense_notes
       WHERE user_id = ANY($1::uuid[]) AND status = 'pending'
       ORDER BY created_at ASC`,
      [ownerIds]
    )
    return rows.map(toNote)
  }

  async findById(id: string): Promise<ExpenseNote | null> {
    const { rows } = await this.sql.query<NoteRow>(`SELECT ${COLUMNS} FROM expense_notes WHERE id = $1`, [id])
    return rows[0] ? toNote(rows[0]) : null
  }

  async nextReceiptSeq(): Promise<number> {
    const { rows } = await this.sql.query<{ seq: number }>(
      "SELECT nextval('expense_notes_receipt_seq_seq')::int AS seq"
    )
    return rows[0].seq
  }

  async insert(note: NewNote): Promise<ExpenseNote> {
    const { rows } = await this.sql.query<NoteRow>(
      `INSERT INTO expense_notes
         (user_id, company_id, amount, expense_date, description, receipt_seq, receipt_key)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING ${COLUMNS}`,
      [note.userId, note.companyId, note.amount, note.expenseDate, note.description, note.receiptSeq, note.receiptKey]
    )
    return toNote(rows[0])
  }

  async saveDecision(note: ExpenseNote): Promise<boolean> {
    const { rowCount } = await this.sql.query(
      `UPDATE expense_notes SET status = $2 WHERE id = $1 AND status = 'pending'`,
      [note.id, note.status]
    )
    return rowCount === 1
  }
}
```

`src/modules/expenses/infrastructure/PgExpensesUnitOfWork.ts` :

```ts
import type { Actor } from '@/shared/actor'
import { runInScope } from '@/shared/unit-of-work'
import type { ExpensesContext, ExpensesUnitOfWork } from '../ports/ExpensesUnitOfWork'
import { PgNoteRepository } from './PgNoteRepository'

/** Tous les adapters du contexte partagent la connexion, donc la transaction. */
export class PgExpensesUnitOfWork implements ExpensesUnitOfWork {
  run<T>(actor: Actor, fn: (ctx: ExpensesContext) => Promise<T>): Promise<T> {
    return runInScope({ userId: actor.id, companyId: actor.companyId }, (sql) =>
      fn({ notes: new PgNoteRepository(sql) })
    )
  }
}
```

`src/modules/expenses/infrastructure/S3ReceiptStorage.ts` :

```ts
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import type { ReceiptStorage } from '../ports/ReceiptStorage'

export class S3ReceiptStorage implements ReceiptStorage {
  private client: S3Client | undefined

  constructor(private readonly bucket = process.env.S3_BUCKET ?? 'receipts') {}

  private s3(): S3Client {
    this.client ??= new S3Client({
      endpoint: process.env.S3_ENDPOINT,
      region: process.env.S3_REGION ?? 'us-east-1',
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== 'false',
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY_ID ?? '',
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? '',
      },
    })
    return this.client
  }

  async upload(key: string, body: Uint8Array, contentType: string): Promise<void> {
    await this.s3().send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType }))
  }

  signedUrl(key: string): Promise<string> {
    return getSignedUrl(this.s3(), new GetObjectCommand({ Bucket: this.bucket, Key: key }), { expiresIn: 300 })
  }
}
```

Run : `npx vitest run --project integration tests/integration/expenses`
Attendu : PASS.

- [ ] **Étape 4 : commit**

```bash
git add src/modules/expenses/ports src/modules/expenses/infrastructure tests/integration/expenses
git commit -m "feat(expenses): ports, dépôt Postgres, unité de travail et stockage S3"
```

---

### Tâche 7 : adapter OCR — un moteur réutilisé, concurrence plafonnée (F17)

**Fichiers :**
- Créer : `src/modules/expenses/infrastructure/TesseractReceiptReader.ts`, `tests/unit/expenses/tesseract-receipt-reader.test.ts`

**Interfaces :**
- Consomme : `ReceiptReader` (tâche 6), `Unavailable` (plan 1).
- Produit : `class TesseractReceiptReader implements ReceiptReader`, constructeur `(options?: { maxConcurrency?: number; queueTimeoutMs?: number })`, défauts `OCR_MAX_CONCURRENCY` (2) et 30 000 ms.

- [ ] **Étape 1 : écrire le test qui échoue**

`tests/unit/expenses/tesseract-receipt-reader.test.ts` :

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createWorker } from 'tesseract.js'
import { TesseractReceiptReader } from '@/modules/expenses/infrastructure/TesseractReceiptReader'
import { Unavailable } from '@/shared/errors'

vi.mock('tesseract.js', () => ({ createWorker: vi.fn() }))
type TesseractWorker = Awaited<ReturnType<typeof createWorker>>

function fakeWorker(recognize: () => Promise<{ data: { text: string } }>) {
  return { recognize: vi.fn(recognize), terminate: vi.fn().mockResolvedValue(undefined) }
}

beforeEach(() => {
  vi.resetAllMocks()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('TesseractReceiptReader (F17)', () => {
  it('crée un seul moteur français, avec le modèle local, et le réutilise', async () => {
    const worker = fakeWorker(async () => ({ data: { text: 'TOTAL 1,00' } }))
    vi.mocked(createWorker).mockResolvedValue(worker as unknown as TesseractWorker)
    const reader = new TesseractReceiptReader({ maxConcurrency: 1 })
    expect(await reader.recognize(new Uint8Array([1]))).toBe('TOTAL 1,00')
    expect(await reader.recognize(new Uint8Array([2]))).toBe('TOTAL 1,00')
    expect(createWorker).toHaveBeenCalledOnce()
    expect(createWorker).toHaveBeenCalledWith('fra', undefined, { langPath: expect.stringMatching(/tessdata$/) })
    expect(worker.terminate).not.toHaveBeenCalled()
  })

  it('jette un moteur qui a échoué et en recrée un au prochain appel', async () => {
    const broken = fakeWorker(async () => Promise.reject(new Error('crash')))
    const healthy = fakeWorker(async () => ({ data: { text: 'ok' } }))
    vi.mocked(createWorker)
      .mockResolvedValueOnce(broken as unknown as TesseractWorker)
      .mockResolvedValueOnce(healthy as unknown as TesseractWorker)
    const reader = new TesseractReceiptReader({ maxConcurrency: 1 })
    await expect(reader.recognize(new Uint8Array([1]))).rejects.toThrow('crash')
    expect(broken.terminate).toHaveBeenCalledOnce()
    expect(await reader.recognize(new Uint8Array([1]))).toBe('ok')
  })

  it('au-delà du plafond, la demande attend puis reçoit Unavailable (503, Retry-After)', async () => {
    let release!: () => void
    const slow = fakeWorker(
      () => new Promise((resolve) => (release = () => resolve({ data: { text: 'lent' } })))
    )
    vi.mocked(createWorker).mockResolvedValue(slow as unknown as TesseractWorker)
    const reader = new TesseractReceiptReader({ maxConcurrency: 1, queueTimeoutMs: 50 })
    const first = reader.recognize(new Uint8Array([1]))
    const second = reader.recognize(new Uint8Array([2]))
    await expect(second).rejects.toBeInstanceOf(Unavailable)
    await expect(second).rejects.toMatchObject({ status: 503, headers: { 'retry-after': '5' } })
    release()
    expect(await first).toBe('lent')
  })

  it('une demande en file passe dès qu’une place se libère, sur le même moteur', async () => {
    const worker = fakeWorker(
      () => new Promise((resolve) => setTimeout(() => resolve({ data: { text: 'a' } }), 20))
    )
    vi.mocked(createWorker).mockResolvedValue(worker as unknown as TesseractWorker)
    const reader = new TesseractReceiptReader({ maxConcurrency: 1, queueTimeoutMs: 5_000 })
    const results = await Promise.all([
      reader.recognize(new Uint8Array([1])),
      reader.recognize(new Uint8Array([2])),
    ])
    expect(results).toEqual(['a', 'a'])
    expect(createWorker).toHaveBeenCalledOnce()
    expect(worker.recognize).toHaveBeenCalledTimes(2)
  })
})
```

Run : `npx vitest run --project unit tests/unit/expenses/tesseract-receipt-reader.test.ts`
Attendu : FAIL, module introuvable.

- [ ] **Étape 2 : implémenter `src/modules/expenses/infrastructure/TesseractReceiptReader.ts`**

```ts
// F17 : les moteurs Tesseract sont créés une fois et réutilisés (au lieu d'un
// moteur par requête), et le nombre d'OCR simultanés est plafonné. Au-delà,
// les demandes attendent leur tour, au plus `queueTimeoutMs`, puis 503.
import path from 'node:path'
import { createWorker } from 'tesseract.js'
import { Unavailable } from '@/shared/errors'
import type { ReceiptReader } from '../ports/ReceiptReader'

type Worker = Awaited<ReturnType<typeof createWorker>>

const TESSDATA_PATH = path.join(process.cwd(), 'tessdata')
const RETRY_AFTER_SECONDS = 5

export class TesseractReceiptReader implements ReceiptReader {
  private readonly maxConcurrency: number
  private readonly queueTimeoutMs: number
  private readonly idle: Worker[] = []
  private readonly waiting: Array<() => void> = []
  private active = 0

  constructor(options: { maxConcurrency?: number; queueTimeoutMs?: number } = {}) {
    this.maxConcurrency = options.maxConcurrency ?? Number(process.env.OCR_MAX_CONCURRENCY ?? 2)
    this.queueTimeoutMs = options.queueTimeoutMs ?? 30_000
  }

  async recognize(image: Uint8Array): Promise<string> {
    await this.acquire()
    try {
      const worker = this.idle.pop() ?? (await createWorker('fra', undefined, { langPath: TESSDATA_PATH }))
      try {
        const {
          data: { text },
        } = await worker.recognize(Buffer.from(image))
        this.idle.push(worker)
        return text
      } catch (error) {
        await worker.terminate().catch(() => undefined)
        throw error
      }
    } finally {
      this.release()
    }
  }

  private acquire(): Promise<void> {
    if (this.active < this.maxConcurrency) {
      this.active++
      return Promise.resolve()
    }
    return new Promise((resolve, reject) => {
      const grant = () => {
        clearTimeout(timer)
        this.active++
        resolve()
      }
      const timer = setTimeout(() => {
        this.waiting.splice(this.waiting.indexOf(grant), 1)
        reject(new Unavailable('Analyse de reçu momentanément saturée, réessaie dans quelques secondes.', RETRY_AFTER_SECONDS))
      }, this.queueTimeoutMs)
      this.waiting.push(grant)
    })
  }

  private release(): void {
    this.active--
    this.waiting.shift()?.()
  }
}
```

Run : `npx vitest run --project unit tests/unit/expenses/tesseract-receipt-reader.test.ts`
Attendu : PASS.

- [ ] **Étape 3 : commit**

```bash
git add src/modules/expenses/infrastructure/TesseractReceiptReader.ts tests/unit/expenses/tesseract-receipt-reader.test.ts
git commit -m "perf(expenses): moteur OCR réutilisé et concurrence plafonnée (F17)"
```

---

### Tâche 8 : soumettre, lister ses notes, voir son reçu — `expenses` et ses premières routes (F10, F39)

**Fichiers :**
- Créer : `src/modules/expenses/application/{submit-expense-note,list-my-expense-notes,get-receipt-url}.ts`, `src/modules/expenses/index.ts`, `tests/unit/expenses/fakes.ts`, `tests/unit/expenses/use-cases.test.ts`, `scripts/receipts-orphans.mjs`, `tests/integration/receipts-orphans.test.ts`, `docs/runbooks/recus-orphelins-nettoyer.md`
- Modifier : `src/app/api/expense-notes/route.ts`, `src/app/api/expense-notes/[id]/receipt-url/route.ts`, `src/shared/http.ts`, `tests/integration/api/expense-notes-s3-failure.test.ts`, `tests/integration/api/expense-note-receipt-url.test.ts`, `docs/api/openapi.yaml`, `package.json`

**Interfaces :**
- Consomme : domaine, ports et adapters `expenses` (tâches 5–7) ; `iam.approveesOf`, `iam.canDecide` (tâche 3).
- Produit (API publique `expenses`, `src/modules/expenses/index.ts`) :
  - `submitExpenseNote(actor: Actor, submission: Submission): Promise<ExpenseNoteDto>`
  - `listMyExpenseNotes(actor: Actor, rawSort: string | null): Promise<ExpenseNoteDto[]>`
  - `getReceiptUrl(actor: Actor, noteId: string, as: 'author' | 'approver'): Promise<string>`
  - réexports : `parseSubmission`, `MAX_RECEIPT_BYTES`, types `ReceiptFile`, `ExpenseNoteDto`
  - (tâches 9 et 10 ajoutent `listPendingApprovals`, `decideExpenseNote`, `suggestFromReceipt`)

- [ ] **Étape 1 : les doublures de test**

`tests/unit/expenses/fakes.ts` :

```ts
import { ExpenseNote, type ExpenseNoteProps } from '@/modules/expenses/domain/ExpenseNote'
import type { Approvals } from '@/modules/expenses/ports/Approvals'
import type { ExpensesContext, ExpensesUnitOfWork } from '@/modules/expenses/ports/ExpensesUnitOfWork'
import type { NewNote, NoteRepository } from '@/modules/expenses/ports/NoteRepository'
import type { ReceiptStorage } from '@/modules/expenses/ports/ReceiptStorage'
import type { Actor } from '@/shared/actor'

export class InMemoryNotes implements NoteRepository {
  seq = 0
  notes: ExpenseNoteProps[] = []

  async listByOwner(ownerId: string): Promise<ExpenseNote[]> {
    return this.notes.filter((n) => n.userId === ownerId).map((n) => new ExpenseNote(n))
  }
  async listPending(ownerIds: string[]): Promise<ExpenseNote[]> {
    return this.notes
      .filter((n) => ownerIds.includes(n.userId) && n.status === 'pending')
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .map((n) => new ExpenseNote(n))
  }
  async findById(id: string): Promise<ExpenseNote | null> {
    const found = this.notes.find((n) => n.id === id)
    return found ? new ExpenseNote(found) : null
  }
  async nextReceiptSeq(): Promise<number> {
    return ++this.seq
  }
  async insert(note: NewNote): Promise<ExpenseNote> {
    const props: ExpenseNoteProps = {
      id: `n${this.notes.length + 1}`,
      userId: note.userId,
      companyId: note.companyId,
      amount: note.amount,
      expenseDate: note.expenseDate,
      description: note.description,
      receiptKey: note.receiptKey,
      status: 'pending',
      createdAt: new Date('2026-10-08T10:00:00Z'),
    }
    this.notes.push(props)
    return new ExpenseNote(props)
  }
  async saveDecision(note: ExpenseNote): Promise<boolean> {
    const stored = this.notes.find((n) => n.id === note.id)
    if (!stored || stored.status !== 'pending') return false
    stored.status = note.status
    return true
  }
}

export class FakeUow implements ExpensesUnitOfWork {
  runs = 0
  constructor(readonly notes = new InMemoryNotes()) {}
  async run<T>(_actor: Actor, fn: (ctx: ExpensesContext) => Promise<T>): Promise<T> {
    this.runs++
    return fn({ notes: this.notes })
  }
}

export class FakeStorage implements ReceiptStorage {
  uploaded: Array<{ key: string; contentType: string; size: number }> = []
  failNext = false
  async upload(key: string, body: Uint8Array, contentType: string): Promise<void> {
    if (this.failNext) throw new Error('S3 indisponible')
    this.uploaded.push({ key, contentType, size: body.byteLength })
  }
  async signedUrl(key: string): Promise<string> {
    return `https://s3.test/${key}`
  }
}

export class FakeApprovals implements Approvals {
  constructor(private readonly approvees: Record<string, string[]> = {}) {}
  async approveesOf(actor: Actor): Promise<string[]> {
    return this.approvees[actor.id] ?? []
  }
  async canDecide(actor: Actor, ownerId: string): Promise<boolean> {
    return (this.approvees[actor.id] ?? []).includes(ownerId)
  }
}

export function actor(id: string, role: Actor['role'] = 'employee'): Actor {
  return { id, companyId: 'acme', role, managerId: null }
}
```

- [ ] **Étape 2 : écrire les tests des use cases (ils échouent)**

`tests/unit/expenses/use-cases.test.ts` :

```ts
import { describe, expect, it } from 'vitest'
import { getReceiptUrl } from '@/modules/expenses/application/get-receipt-url'
import { listMyExpenseNotes } from '@/modules/expenses/application/list-my-expense-notes'
import { submitExpenseNote } from '@/modules/expenses/application/submit-expense-note'
import { ReceiptUploadFailed } from '@/modules/expenses/domain/errors'
import type { Submission } from '@/modules/expenses/domain/Submission'
import { NotFound } from '@/shared/errors'
import { FakeApprovals, FakeStorage, FakeUow, actor } from './fakes'

const submission: Submission = {
  amount: 42.5,
  expenseDate: '2026-10-08',
  description: 'Taxi',
  receipt: { name: 'recu.png', type: 'image/png', size: 3, read: async () => new Uint8Array(3) },
}

describe('submitExpenseNote (F10)', () => {
  it('réserve le numéro, envoie le reçu, puis crée la note avec sa clé', async () => {
    const uow = new FakeUow()
    const storage = new FakeStorage()
    const dto = await submitExpenseNote(uow, storage)(actor('e1'), submission)
    expect(storage.uploaded).toEqual([{ key: 'receipts/1.png', contentType: 'image/png', size: 3 }])
    expect(dto).toMatchObject({ userId: 'e1', receiptKey: 'receipts/1.png', status: 'pending', amount: 42.5 })
    expect(uow.notes.notes[0].companyId).toBe('acme')
  })

  it('échec du stockage : ReceiptUploadFailed (502) et aucune note', async () => {
    const uow = new FakeUow()
    const storage = new FakeStorage()
    storage.failNext = true
    await expect(submitExpenseNote(uow, storage)(actor('e1'), submission)).rejects.toBeInstanceOf(ReceiptUploadFailed)
    expect(uow.notes.notes).toEqual([])
  })
})

describe('listMyExpenseNotes', () => {
  it('ne renvoie que les notes de l’acteur', async () => {
    const uow = new FakeUow()
    await submitExpenseNote(uow, new FakeStorage())(actor('e1'), submission)
    await submitExpenseNote(uow, new FakeStorage())(actor('e2'), submission)
    expect((await listMyExpenseNotes(uow)(actor('e1'), null)).map((n) => n.userId)).toEqual(['e1'])
  })
})

describe('getReceiptUrl (F1, F39)', () => {
  async function withNote(receiptKey = 'receipts/1.png') {
    const uow = new FakeUow()
    await submitExpenseNote(uow, new FakeStorage())(actor('e1'), submission)
    uow.notes.notes[0].receiptKey = receiptKey
    return uow
  }

  it('auteur : URL de son reçu', async () => {
    const uow = await withNote()
    expect(await getReceiptUrl(uow, new FakeApprovals(), new FakeStorage())(actor('e1'), 'n1', 'author')).toBe(
      'https://s3.test/receipts/1.png'
    )
  })

  it('validateur : seulement s’il peut décider la note', async () => {
    const uow = await withNote()
    const approvals = new FakeApprovals({ m1: ['e1'] })
    expect(await getReceiptUrl(uow, approvals, new FakeStorage())(actor('m1', 'manager'), 'n1', 'approver')).toContain('receipts/1.png')
    await expect(getReceiptUrl(uow, approvals, new FakeStorage())(actor('m2', 'manager'), 'n1', 'approver')).rejects.toBeInstanceOf(NotFound)
  })

  it('note d’un autre, note inconnue, note sans clé : 404', async () => {
    const uow = await withNote('')
    const read = getReceiptUrl(uow, new FakeApprovals(), new FakeStorage())
    await expect(read(actor('e2'), 'n1', 'author')).rejects.toBeInstanceOf(NotFound)
    await expect(read(actor('e1'), 'inconnue', 'author')).rejects.toBeInstanceOf(NotFound)
    await expect(read(actor('e1'), 'n1', 'author')).rejects.toBeInstanceOf(NotFound)
  })
})
```

Run : `npx vitest run --project unit tests/unit/expenses/use-cases.test.ts`
Attendu : FAIL, use cases introuvables.

- [ ] **Étape 3 : les use cases**

`src/modules/expenses/application/submit-expense-note.ts` :

```ts
import type { Actor } from '@/shared/actor'
import { logger } from '@/shared/logger'
import { ReceiptUploadFailed } from '../domain/errors'
import type { ExpenseNoteDto } from '../domain/ExpenseNote'
import { receiptKeyFor, type Submission } from '../domain/Submission'
import type { ExpensesUnitOfWork } from '../ports/ExpensesUnitOfWork'
import type { ReceiptStorage } from '../ports/ReceiptStorage'

/**
 * F10 : le reçu d'abord, la note ensuite, sans transaction ouverte pendant
 * l'appel S3. Un échec de l'insertion après l'envoi laisse un objet orphelin,
 * sans risque (aucune note ne le référence) ; `npm run receipts:orphans` le nettoie.
 */
export function submitExpenseNote(uow: ExpensesUnitOfWork, storage: ReceiptStorage) {
  return async (actor: Actor, submission: Submission): Promise<ExpenseNoteDto> => {
    const receiptSeq = await uow.run(actor, (ctx) => ctx.notes.nextReceiptSeq())
    const receiptKey = receiptKeyFor(receiptSeq, submission.receipt)
    try {
      await storage.upload(receiptKey, await submission.receipt.read(), submission.receipt.type)
    } catch (error) {
      logger.error('Envoi du reçu échoué', { receiptKey, error })
      throw new ReceiptUploadFailed()
    }
    const note = await uow.run(actor, (ctx) =>
      ctx.notes.insert({
        userId: actor.id,
        companyId: actor.companyId,
        amount: submission.amount,
        expenseDate: submission.expenseDate,
        description: submission.description,
        receiptSeq,
        receiptKey,
      })
    )
    return note.toDto()
  }
}
```

`src/modules/expenses/application/list-my-expense-notes.ts` :

```ts
import type { Actor } from '@/shared/actor'
import type { ExpenseNoteDto } from '../domain/ExpenseNote'
import { parseNoteSort } from '../domain/NoteSort'
import type { ExpensesUnitOfWork } from '../ports/ExpensesUnitOfWork'

export function listMyExpenseNotes(uow: ExpensesUnitOfWork) {
  return async (actor: Actor, rawSort: string | null): Promise<ExpenseNoteDto[]> => {
    const notes = await uow.run(actor, (ctx) => ctx.notes.listByOwner(actor.id, parseNoteSort(rawSort)))
    return notes.map((note) => note.toDto())
  }
}
```

`src/modules/expenses/application/get-receipt-url.ts` :

```ts
import type { Actor } from '@/shared/actor'
import { NotFound } from '@/shared/errors'
import type { Approvals } from '../ports/Approvals'
import type { ExpensesUnitOfWork } from '../ports/ExpensesUnitOfWork'
import type { ReceiptStorage } from '../ports/ReceiptStorage'

/** F1 : l'auteur, ou un validateur au sens d'ApprovalPolicy ; sinon 404 sans révéler la note. */
export function getReceiptUrl(uow: ExpensesUnitOfWork, approvals: Approvals, storage: ReceiptStorage) {
  return async (actor: Actor, noteId: string, as: 'author' | 'approver'): Promise<string> => {
    const note = await uow.run(actor, (ctx) => ctx.notes.findById(noteId))
    if (!note) throw new NotFound()
    const allowed = as === 'author' ? note.userId === actor.id : await approvals.canDecide(actor, note.userId)
    // F39 : une clé vide signerait la racine du bucket.
    if (!allowed || note.receiptKey === '') throw new NotFound()
    return storage.signedUrl(note.receiptKey)
  }
}
```

Run : `npx vitest run --project unit tests/unit/expenses/use-cases.test.ts`
Attendu : PASS.

- [ ] **Étape 4 : `src/modules/expenses/index.ts`**

```ts
// API publique du module expenses.
import { iam } from '@/modules/iam'
import { getReceiptUrl } from './application/get-receipt-url'
import { listMyExpenseNotes } from './application/list-my-expense-notes'
import { submitExpenseNote } from './application/submit-expense-note'
import { PgExpensesUnitOfWork } from './infrastructure/PgExpensesUnitOfWork'
import { S3ReceiptStorage } from './infrastructure/S3ReceiptStorage'
import type { Approvals } from './ports/Approvals'

export { MAX_RECEIPT_BYTES, parseSubmission } from './domain/Submission'
export type { ReceiptFile, Submission } from './domain/Submission'
export type { ExpenseNoteDto } from './domain/ExpenseNote'

const uow = new PgExpensesUnitOfWork()
const storage = new S3ReceiptStorage()
// D4 : expenses ne lit jamais l'organigramme ; il le demande à iam.
const approvals: Approvals = { approveesOf: iam.approveesOf, canDecide: iam.canDecide }

export const expenses = {
  submitExpenseNote: submitExpenseNote(uow, storage),
  listMyExpenseNotes: listMyExpenseNotes(uow),
  getReceiptUrl: getReceiptUrl(uow, approvals, storage),
}
```

Dans `src/shared/http.ts`, supprimer `MAX_RECEIPT_BYTES` (désormais dans le domaine `expenses`) et garder `MULTIPART_OVERHEAD_BYTES` et `MAX_JSON_BYTES`. La route OCR non encore migrée importe temporairement `MAX_RECEIPT_BYTES` depuis `@/modules/expenses`.

- [ ] **Étape 5 : faire basculer les tests (ils échouent)**

`tests/integration/api/expense-notes-s3-failure.test.ts` :

```ts
import { describe, expect, it, vi } from 'vitest'
import { POST } from '@/app/api/expense-notes/route'
import { S3ReceiptStorage } from '@/modules/expenses/infrastructure/S3ReceiptStorage'
import { countRows, createOrg } from '../../support/factories'
import { expectProblem, multipart, receiptFile } from '../helpers/http'
import { actAs } from '../helpers/session'

describe('POST /api/expense-notes — panne du stockage (F10)', () => {
  it('502, aucune note créée', async () => {
    const { employee } = await createOrg()
    actAs(employee)
    vi.spyOn(S3ReceiptStorage.prototype, 'upload').mockRejectedValueOnce(new Error('S3 indisponible'))
    const response = await POST(
      multipart('/api/expense-notes', {
        amount: '42.5',
        expenseDate: '2026-10-08',
        description: 'Taxi',
        receipt: receiptFile(),
      })
    )
    await expectProblem(response, 502, 'Stockage des reçus indisponible')
    expect(await countRows('expense_notes')).toBe(0)
  })
})
```

`tests/integration/api/expense-note-receipt-url.test.ts`, remplacer le test `[as-is] note orpheline …` par :

```ts
  it('note sans clé de reçu : 404, jamais l’URL de la racine du bucket (F39)', async () => {
    const { employee } = await createOrg()
    const note = await createNote({ user: employee, receiptKey: '' })
    actAs(employee)
    await expectProblem(await receiptUrl(note.id), 404, 'Not found')
  })
```

et supprimer les imports devenus inutiles (`storeReceipt` s'il ne sert plus, `TEST_ENV`).

Run : `npm test`
Attendu : FAIL sur ces deux fichiers.

- [ ] **Étape 6 : les routes deviennent des adapters**

`src/app/api/expense-notes/route.ts` :

```ts
import { expenses, MAX_RECEIPT_BYTES, parseSubmission, type ReceiptFile } from '@/modules/expenses'
import { MULTIPART_OVERHEAD_BYTES, readFormData, route } from '@/shared/http'
import { currentActor } from '../_lib/current-actor'

function receiptFrom(value: FormDataEntryValue | null): ReceiptFile | null {
  if (!(value instanceof File)) return null
  return {
    name: value.name,
    type: value.type,
    size: value.size,
    read: async () => new Uint8Array(await value.arrayBuffer()),
  }
}

export const GET = route(async (request) => {
  const actor = await currentActor()
  const sort = new URL(request.url).searchParams.get('sort')
  return Response.json(await expenses.listMyExpenseNotes(actor, sort))
})

export const POST = route(async (request) => {
  const actor = await currentActor()
  const form = await readFormData(request, MAX_RECEIPT_BYTES + MULTIPART_OVERHEAD_BYTES, 'Fichier trop volumineux')
  const submission = parseSubmission({
    amount: form.get('amount'),
    expenseDate: form.get('expenseDate'),
    description: form.get('description'),
    receipt: receiptFrom(form.get('receipt')),
  })
  return Response.json(await expenses.submitExpenseNote(actor, submission), { status: 201 })
})
```

`src/app/api/expense-notes/[id]/receipt-url/route.ts` :

```ts
import { expenses } from '@/modules/expenses'
import { parseUuid, route, type RouteContext } from '@/shared/http'
import { currentActor } from '../../../_lib/current-actor'

export const GET = route(async (_request, { params }: RouteContext<{ id: string }>) => {
  const actor = await currentActor()
  const id = parseUuid((await params).id)
  return Response.json({ url: await expenses.getReceiptUrl(actor, id, 'author') })
})
```

Run : `npm test`
Attendu : PASS.

- [ ] **Étape 7 : nettoyage des reçus orphelins**

`tests/integration/receipts-orphans.test.ts` :

```ts
import { describe, expect, it } from 'vitest'
import { findOrphans } from '../../scripts/receipts-orphans.mjs'
import { testDb } from '../support/db'
import { TEST_ENV } from '../support/env'
import { createNote, createOrg } from '../support/factories'
import { PNG_BYTES } from '../support/fixtures'
import { putReceipt, s3ClientFor } from '../support/infra'

describe('receipts:orphans', () => {
  it('liste les objets sans note plus vieux que le délai de grâce, pas les autres', async () => {
    const { employee } = await createOrg()
    await createNote({ user: employee, receiptKey: 'receipts/1.png' })
    await putReceipt(TEST_ENV, 'receipts/1.png', PNG_BYTES)
    await putReceipt(TEST_ENV, 'receipts/2.png', PNG_BYTES)
    const orphans = await findOrphans({
      db: testDb(),
      s3: s3ClientFor(TEST_ENV),
      bucket: TEST_ENV.S3_BUCKET,
      olderThan: new Date(Date.now() + 60_000),
    })
    expect(orphans).toEqual(['receipts/2.png'])
    expect(
      await findOrphans({ db: testDb(), s3: s3ClientFor(TEST_ENV), bucket: TEST_ENV.S3_BUCKET, olderThan: new Date(0) })
    ).toEqual([])
  })
})
```

`scripts/receipts-orphans.mjs` :

```js
// Reçus S3 sans note (F10 : envoi réussi puis insertion échouée). Sans risque
// (bucket privé, rien ne les référence) : nettoyage périodique.
//   node scripts/receipts-orphans.mjs           liste les orphelins de plus de 24 h
//   node scripts/receipts-orphans.mjs --delete  les supprime
import { DeleteObjectsCommand, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3'
import { config as loadEnv } from 'dotenv'
import { Pool } from 'pg'
import { fileURLToPath } from 'node:url'

export async function findOrphans({ db, s3, bucket, olderThan }) {
  const objects = []
  let token
  do {
    const page = await s3.send(new ListObjectsV2Command({ Bucket: bucket, ContinuationToken: token }))
    for (const object of page.Contents ?? []) {
      if (object.Key && object.LastModified && object.LastModified < olderThan) objects.push(object.Key)
    }
    token = page.NextContinuationToken
  } while (token)
  if (objects.length === 0) return []
  const { rows } = await db.query('SELECT receipt_key FROM expense_notes WHERE receipt_key = ANY($1)', [objects])
  const referenced = new Set(rows.map((row) => row.receipt_key))
  return objects.filter((key) => !referenced.has(key)).sort()
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  loadEnv({ quiet: true })
  const bucket = process.env.S3_BUCKET ?? 'receipts'
  const db = new Pool({ connectionString: process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL })
  const s3 = new S3Client({
    endpoint: process.env.S3_ENDPOINT,
    region: process.env.S3_REGION ?? 'us-east-1',
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== 'false',
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID ?? '',
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? '',
    },
  })
  try {
    const orphans = await findOrphans({ db, s3, bucket, olderThan: new Date(Date.now() - 24 * 3600 * 1000) })
    console.log(`${orphans.length} reçu(s) orphelin(s)${orphans.length ? ' :' : '.'}`)
    for (const key of orphans) console.log(`  ${key}`)
    if (process.argv.includes('--delete') && orphans.length > 0) {
      await s3.send(new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: orphans.map((Key) => ({ Key })) } }))
      console.log('Supprimés.')
    }
  } finally {
    await db.end()
  }
}
```

(La fonction lit `expense_notes` avec le rôle propriétaire : c'est un script d'exploitation, pas du code applicatif.)

Dans `package.json` : `"receipts:orphans": "node scripts/receipts-orphans.mjs"`.

`docs/runbooks/recus-orphelins-nettoyer.md` : à partir de `docs/runbooks/runbook-template.md` — objectif « supprimer les reçus S3 sans note », quand l'utiliser « après un incident S3 ou base, ou une fois par semaine », procédure `npm run receipts:orphans` (**Attendu :** la liste) puis `npm run receipts:orphans -- --delete` (**Attendu :** « Supprimés. »), retour arrière « aucun : les objets supprimés n'étaient référencés par aucune note ».

Run : `npx vitest run --project integration tests/integration/receipts-orphans.test.ts`
Attendu : PASS.

- [ ] **Étape 8 : OpenAPI**

Dans `docs/api/openapi.yaml`, sur `POST /api/expense-notes`, ajouter la réponse `502` (`Problem`, `error: "Stockage des reçus indisponible"`, « aucune note n'est créée ») ; sur `GET /api/expense-notes/{id}/receipt-url`, préciser dans la description du `404` « note d'un autre utilisateur, inconnue, ou sans reçu ».

- [ ] **Étape 9 : commit**

```bash
git add src tests scripts/receipts-orphans.mjs docs/runbooks/recus-orphelins-nettoyer.md docs/api/openapi.yaml package.json
git commit -m "feat(expenses): soumission reçu d'abord, liste et reçu de l'auteur via le module (F10, F39)"
```

---

### Tâche 9 : files de validation, décisions et reçus des validateurs (F1, F9, F14, F33)

**Fichiers :**
- Créer : `src/modules/expenses/application/list-pending-approvals.ts`, `src/modules/expenses/application/decide-expense-note.ts`, `tests/integration/api/decision-concurrency.test.ts`
- Modifier : `src/modules/expenses/index.ts`, les 8 routes `src/app/api/{manager,hr}/expense-notes/**`, `tests/unit/expenses/use-cases.test.ts`, `tests/integration/workflow.test.ts`, `tests/integration/api/hr-decisions.test.ts`, `tests/integration/api/hr-expense-notes.test.ts`, `tests/integration/api/hr-receipt-url.test.ts`, `docs/api/openapi.yaml`

**Interfaces :**
- Produit (ajouts à `expenses`) :
  - `listPendingApprovals(actor: Actor): Promise<ExpenseNoteDto[]>`
  - `decideExpenseNote(actor: Actor, noteId: string, decision: Decision): Promise<ExpenseNoteDto>`
  - réexport du type `Decision`

- [ ] **Étape 1 : tests des use cases (ils échouent)**

Ajouter à `tests/unit/expenses/use-cases.test.ts` :

```ts
import { decideExpenseNote } from '@/modules/expenses/application/decide-expense-note'
import { listPendingApprovals } from '@/modules/expenses/application/list-pending-approvals'
import { AlreadyDecided } from '@/modules/expenses/domain/errors'

describe('listPendingApprovals', () => {
  it('notes en attente des personnes que l’acteur valide', async () => {
    const uow = new FakeUow()
    const submit = submitExpenseNote(uow, new FakeStorage())
    await submit(actor('e1'), submission)
    await submit(actor('e2'), submission)
    const pending = await listPendingApprovals(uow, new FakeApprovals({ m1: ['e1'] }))(actor('m1', 'manager'))
    expect(pending.map((n) => n.userId)).toEqual(['e1'])
  })

  it('personne à valider : aucune requête de notes', async () => {
    const uow = new FakeUow()
    expect(await listPendingApprovals(uow, new FakeApprovals())(actor('e1'))).toEqual([])
    expect(uow.runs).toBe(0)
  })
})

describe('decideExpenseNote (F9)', () => {
  async function setup() {
    const uow = new FakeUow()
    await submitExpenseNote(uow, new FakeStorage())(actor('e1'), submission)
    return { uow, decide: decideExpenseNote(uow, new FakeApprovals({ m1: ['e1'] })) }
  }

  it('le validateur décide', async () => {
    const { decide } = await setup()
    expect((await decide(actor('m1', 'manager'), 'n1', 'approved')).status).toBe('approved')
  })

  it('quelqu’un qui ne valide pas cette note : 404', async () => {
    const { decide } = await setup()
    await expect(decide(actor('m2', 'manager'), 'n1', 'approved')).rejects.toBeInstanceOf(NotFound)
  })

  it('note déjà décidée : 409', async () => {
    const { decide } = await setup()
    await decide(actor('m1', 'manager'), 'n1', 'approved')
    await expect(decide(actor('m1', 'manager'), 'n1', 'rejected')).rejects.toBeInstanceOf(AlreadyDecided)
  })

  it('décision concurrente perdue (UPDATE sans effet) : 409', async () => {
    const { uow, decide } = await setup()
    uow.notes.saveDecision = async () => false
    await expect(decide(actor('m1', 'manager'), 'n1', 'approved')).rejects.toBeInstanceOf(AlreadyDecided)
  })
})
```

Run : `npx vitest run --project unit tests/unit/expenses/use-cases.test.ts`
Attendu : FAIL.

- [ ] **Étape 2 : les use cases**

`src/modules/expenses/application/list-pending-approvals.ts` :

```ts
import type { Actor } from '@/shared/actor'
import type { ExpenseNoteDto } from '../domain/ExpenseNote'
import type { Approvals } from '../ports/Approvals'
import type { ExpensesUnitOfWork } from '../ports/ExpensesUnitOfWork'

/** File de validation : notes en attente des personnes que l'acteur valide (ApprovalPolicy, via iam). */
export function listPendingApprovals(uow: ExpensesUnitOfWork, approvals: Approvals) {
  return async (actor: Actor): Promise<ExpenseNoteDto[]> => {
    const ownerIds = await approvals.approveesOf(actor)
    if (ownerIds.length === 0) return []
    const notes = await uow.run(actor, (ctx) => ctx.notes.listPending(ownerIds))
    return notes.map((note) => note.toDto())
  }
}
```

`src/modules/expenses/application/decide-expense-note.ts` :

```ts
import type { Actor } from '@/shared/actor'
import { NotFound } from '@/shared/errors'
import { AlreadyDecided } from '../domain/errors'
import type { Decision, ExpenseNoteDto } from '../domain/ExpenseNote'
import type { Approvals } from '../ports/Approvals'
import type { ExpensesUnitOfWork } from '../ports/ExpensesUnitOfWork'

/**
 * Remplace les quatre handlers approve/reject. F9 : l'UPDATE ne touche la
 * note que si elle est encore `pending` ; une décision concurrente perdue
 * donne 409, comme le cas séquentiel.
 */
export function decideExpenseNote(uow: ExpensesUnitOfWork, approvals: Approvals) {
  return (actor: Actor, noteId: string, decision: Decision): Promise<ExpenseNoteDto> =>
    uow.run(actor, async (ctx) => {
      const note = await ctx.notes.findById(noteId)
      if (!note || !(await approvals.canDecide(actor, note.userId))) throw new NotFound()
      const decided = note.decide(decision)
      if (!(await ctx.notes.saveDecision(decided))) throw new AlreadyDecided()
      return decided.toDto()
    })
}
```

Dans `src/modules/expenses/index.ts`, ajouter les imports et les deux entrées :

```ts
import { decideExpenseNote } from './application/decide-expense-note'
import { listPendingApprovals } from './application/list-pending-approvals'
export type { Decision } from './domain/ExpenseNote'
```

```ts
  listPendingApprovals: listPendingApprovals(uow, approvals),
  decideExpenseNote: decideExpenseNote(uow, approvals),
```

Run : `npx vitest run --project unit tests/unit/expenses/use-cases.test.ts`
Attendu : PASS.

- [ ] **Étape 3 : faire basculer les tests d'intégration (ils échouent)**

`tests/integration/workflow.test.ts` :
- réactiver les deux tests F31 marqués `it.todo` en tâche 4 ;
- `[as-is] note d'un employé sans manager : dans aucune file` devient :

```ts
  it("note d'un employé sans manager : dans la file RH (F33)", async () => {
    const org = await createOrg()
    const note = await createNote({ user: await createUser({ company: org.company }) })
    expect(await managerQueueOf(org.manager)).toEqual([])
    expect(await hrQueueOf(org.hr)).toEqual([note.id])
  })
```

- `[as-is] note d'une RH : dans aucune file` devient :

```ts
  it("note d'une RH : dans la file des autres RH, jamais dans la sienne (F14)", async () => {
    const org = await createOrg()
    const otherHr = await createUser({ company: org.company, role: 'hr_admin' })
    const note = await createNote({ user: org.hr })
    expect(await hrQueueOf(org.hr)).toEqual([])
    expect(await hrQueueOf(otherHr)).toEqual([note.id])
  })

  it("RH seul de son entreprise : sa note est acceptée mais n'est dans aucune file (limite documentée)", async () => {
    const org = await createOrg()
    await createNote({ user: org.hr })
    expect(await hrQueueOf(org.hr)).toEqual([])
    expect(await managerQueueOf(org.manager)).toEqual([])
  })

  it('consigne « manager direct » : un manager ne voit pas les subordonnés de ses subordonnés', async () => {
    const org = await createOrg()
    const sub = await createUser({ company: org.company, role: 'manager', manager: org.manager })
    const note = await createNote({ user: await createUser({ company: org.company, manager: sub }) })
    expect(await managerQueueOf(org.manager)).toEqual([])
    expect(await managerQueueOf(sub)).toEqual([note.id])
    actAs(org.manager)
    expect((await approveAsManager(note.id)).status).toBe(404)
  })
```

`tests/integration/api/hr-decisions.test.ts`, dans le `it.each` des 404, retirer le cas « note d'un employé sans manager » et ajouter :

```ts
  it.each<[string, (org: Org) => Promise<string>]>([
    ["note d'un employé sans manager (F33)", async (org) => (await createNote({ user: await createUser({ company: org.company }) })).id],
    ["note d'une autre RH (F14)", async (org) => (await createNote({ user: await createUser({ company: org.company, role: 'hr_admin' }) })).id],
  ])('la RH décide : %s', async (_label, noteIdFor) => {
    const org = await createOrg()
    const id = await noteIdFor(org)
    actAs(org.hr)
    expect((await decide(id)).status).toBe(200)
  })
```

`tests/integration/api/hr-expense-notes.test.ts`, test « exclut employés, managers rattachés… » renommé « contient managers racines, non rattachés et autres RH ; exclut le reste » : garder le jeu de données, ajouter `const otherHr = await createUser({ company: org.company, role: 'hr_admin' })` et `const otherHrNote = await createNote({ user: otherHr })`, mémoriser la note de l'employé non rattaché dans `const looseNote = …`, et attendre `expect(new Set(await queueIds())).toEqual(new Set([expected.id, looseNote.id, otherHrNote.id]))`.

`tests/integration/api/hr-receipt-url.test.ts` : ajouter un cas 200 « note d'un employé sans manager (F33) » sur le modèle du test « URL présignée valide… », et garder « note d'un employé » (rattaché) en 404.

Nouveau `tests/integration/api/decision-concurrency.test.ts` :

```ts
import { describe, expect, it } from 'vitest'
import { POST as approve } from '@/app/api/manager/expense-notes/[id]/approve/route'
import { POST as reject } from '@/app/api/manager/expense-notes/[id]/reject/route'
import { createNote, createOrg, findNote } from '../../support/factories'
import { request, routeParams } from '../helpers/http'
import { actAs } from '../helpers/session'

describe('décisions concurrentes (F9)', () => {
  it('approve et reject en parallèle : un 200, un 409, et la note a une seule décision', async () => {
    const org = await createOrg()
    const note = await createNote({ user: org.employee })
    actAs(org.manager)
    const call = (handler: typeof approve, action: string) =>
      handler(request(`/api/manager/expense-notes/${note.id}/${action}`, { method: 'POST' }), routeParams(note.id))
    const responses = await Promise.all([call(approve, 'approve'), call(reject, 'reject')])
    expect(responses.map((r) => r.status).sort()).toEqual([200, 409])
    const winner = await responses.find((r) => r.status === 200)!.json()
    expect((await findNote(note.id))?.status).toBe(winner.status)
  })
})
```

Run : `npm test`
Attendu : FAIL sur les tests modifiés.

- [ ] **Étape 4 : les huit routes deviennent des adapters**

`src/app/api/manager/expense-notes/route.ts` :

```ts
import { expenses } from '@/modules/expenses'
import { requireRole, route } from '@/shared/http'
import { currentActor } from '../../_lib/current-actor'

export const GET = route(async () => {
  const actor = await currentActor()
  requireRole(actor, 'manager')
  return Response.json(await expenses.listPendingApprovals(actor))
})
```

`src/app/api/hr/expense-notes/route.ts` : identique, avec `requireRole(actor, 'hr_admin')`.

`src/app/api/manager/expense-notes/[id]/approve/route.ts` :

```ts
import { expenses } from '@/modules/expenses'
import { parseUuid, requireRole, route, type RouteContext } from '@/shared/http'
import { currentActor } from '../../../../_lib/current-actor'

export const POST = route(async (_request, { params }: RouteContext<{ id: string }>) => {
  const actor = await currentActor()
  requireRole(actor, 'manager')
  const id = parseUuid((await params).id)
  return Response.json(await expenses.decideExpenseNote(actor, id, 'approved'))
})
```

`…/manager/expense-notes/[id]/reject/route.ts` : identique avec `'rejected'`. `…/hr/expense-notes/[id]/approve/route.ts` et `…/reject/route.ts` : identiques avec `requireRole(actor, 'hr_admin')`.

`src/app/api/manager/expense-notes/[id]/receipt-url/route.ts` :

```ts
import { expenses } from '@/modules/expenses'
import { parseUuid, requireRole, route, type RouteContext } from '@/shared/http'
import { currentActor } from '../../../../_lib/current-actor'

export const GET = route(async (_request, { params }: RouteContext<{ id: string }>) => {
  const actor = await currentActor()
  requireRole(actor, 'manager')
  const id = parseUuid((await params).id)
  return Response.json({ url: await expenses.getReceiptUrl(actor, id, 'approver') })
})
```

`…/hr/expense-notes/[id]/receipt-url/route.ts` : identique avec `requireRole(actor, 'hr_admin')`.

Run : `npm test`
Attendu : PASS.

- [ ] **Étape 5 : OpenAPI**

Dans `docs/api/openapi.yaml` : remplacer la section « Circuit de validation » de `info.description` par la règle d'`ApprovalPolicy` (manager direct ; sinon les RH de l'entreprise, ce qui couvre managers racines, employés non rattachés et autres RH ; jamais sa propre note ; un RH seul n'a pas de validateur) ; sur `GET /api/hr/expense-notes`, mettre à jour la description (« notes en attente dont la RH est validatrice ») sans toucher au schéma ; sur les quatre routes de décision, préciser que deux décisions simultanées donnent un `200` et un `409 Already decided`.

- [ ] **Étape 6 : commit**

```bash
git add src tests docs/api/openapi.yaml
git commit -m "feat(expenses): files de validation et décisions via ApprovalPolicy (F1, F9, F14, F33)"
```

---

### Tâche 10 : suggestion depuis un reçu (F17, F19)

**Fichiers :**
- Créer : `src/modules/expenses/application/suggest-from-receipt.ts`
- Modifier : `src/modules/expenses/index.ts`, `src/app/api/expense-notes/receipt-suggestion/route.ts`, `tests/unit/expenses/use-cases.test.ts`, `tests/integration/api/receipt-suggestion.test.ts`, `docs/api/openapi.yaml`

**Interfaces :**
- Produit : `suggestFromReceipt(receipt: { type: string; size: number; read(): Promise<Uint8Array> }): Promise<ReceiptSuggestion>` dans `expenses`.

- [ ] **Étape 1 : tests (ils échouent)**

Ajouter à `tests/unit/expenses/use-cases.test.ts` :

```ts
import { suggestFromReceipt } from '@/modules/expenses/application/suggest-from-receipt'
import { InvalidInput, Unavailable } from '@/shared/errors'

describe('suggestFromReceipt (F19)', () => {
  const image = (size = 3, type = 'image/png') => ({ type, size, read: async () => new Uint8Array(size) })

  it('lit montant et date depuis le texte reconnu', async () => {
    const reader = { recognize: async () => 'TOTAL TTC 42,50 €\nDate : 08/10/2026' }
    expect(await suggestFromReceipt(reader)(image())).toEqual({ amount: 42.5, expenseDate: '2026-10-08' })
  })

  it('refuse plus de 10 Mo avant toute reconnaissance', async () => {
    let called = false
    const reader = { recognize: async () => ((called = true), '') }
    await expect(suggestFromReceipt(reader)(image(10 * 1024 * 1024 + 1))).rejects.toThrow(new InvalidInput('Fichier trop volumineux'))
    expect(called).toBe(false)
  })

  it('PDF : suggestion vide sans reconnaissance', async () => {
    expect(await suggestFromReceipt({ recognize: async () => 'x' })(image(3, 'application/pdf'))).toEqual({})
  })

  it('OCR en échec : suggestion vide ; OCR saturé : Unavailable relayée', async () => {
    expect(await suggestFromReceipt({ recognize: async () => Promise.reject(new Error('crash')) })(image())).toEqual({})
    await expect(
      suggestFromReceipt({ recognize: async () => Promise.reject(new Unavailable('saturé', 5)) })(image())
    ).rejects.toBeInstanceOf(Unavailable)
  })
})
```

Dans `tests/integration/api/receipt-suggestion.test.ts` :
- remplacer `vi.mock('tesseract.js', …)`, `TesseractWorker` et `ocrReturns` par un faux lecteur :

```ts
const recognizeMock = vi.hoisted(() => vi.fn<(image: Uint8Array) => Promise<string>>())
vi.mock('@/modules/expenses/infrastructure/TesseractReceiptReader', () => ({
  TesseractReceiptReader: class {
    recognize = recognizeMock
  },
}))

function ocrReturns(text: string) {
  recognizeMock.mockResolvedValue(text)
}
```

- remplacer `expect(createWorker).not.toHaveBeenCalled()` par `expect(recognizeMock).not.toHaveBeenCalled()` et `vi.mocked(createWorker).mockRejectedValue(new Error('modèle introuvable'))` par `recognizeMock.mockRejectedValue(new Error('modèle introuvable'))` ;
- le test « session d'un utilisateur supprimé : suggestion quand même » devient « session d'un utilisateur supprimé → 401 » (`expectProblem(…, 401, 'Unauthorized')`) ;
- le test `[as-is] aucune limite propre à l'OCR…` devient :

```ts
  it('reçu de plus de 10 Mo : 400, sans reconnaissance (F19)', async () => {
    actAs((await createOrg()).employee)
    await expectProblem(await suggest({ receipt: receiptFile({ size: 10 * 1024 * 1024 + 1 }) }), 400, 'Fichier trop volumineux')
    expect(recognizeMock).not.toHaveBeenCalled()
  })

  it('OCR saturé : 503 avec Retry-After (F17)', async () => {
    actAs((await createOrg()).employee)
    recognizeMock.mockRejectedValue(new Unavailable('Analyse de reçu momentanément saturée, réessaie dans quelques secondes.', 5))
    const response = await suggest({ receipt: receiptFile() })
    await expectProblem(response, 503, 'Analyse de reçu momentanément saturée, réessaie dans quelques secondes.')
    expect(response.headers.get('retry-after')).toBe('5')
  })
```

(importer `Unavailable` depuis `@/shared/errors`).

Run : `npm test`
Attendu : FAIL.

- [ ] **Étape 2 : use case, câblage et route**

`src/modules/expenses/application/suggest-from-receipt.ts` :

```ts
import { InvalidInput, Unavailable } from '@/shared/errors'
import { logger } from '@/shared/logger'
import { SUPPORTED_OCR_TYPES, suggestFromText, type ReceiptSuggestion } from '../domain/ReceiptText'
import { MAX_RECEIPT_BYTES } from '../domain/Submission'
import type { ReceiptReader } from '../ports/ReceiptReader'

/** F19 : même plafond qu'à la création. Une panne OCR donne une suggestion vide ; la saturation, un 503. */
export function suggestFromReceipt(reader: ReceiptReader) {
  return async (receipt: { type: string; size: number; read(): Promise<Uint8Array> }): Promise<ReceiptSuggestion> => {
    if (receipt.size > MAX_RECEIPT_BYTES) throw new InvalidInput('Fichier trop volumineux')
    if (!SUPPORTED_OCR_TYPES.includes(receipt.type)) return {}
    try {
      return suggestFromText(await reader.recognize(await receipt.read()))
    } catch (error) {
      if (error instanceof Unavailable) throw error
      logger.error('Extraction OCR échouée, suggestion vide renvoyée', { error })
      return {}
    }
  }
}
```

Dans `src/modules/expenses/index.ts` : importer `suggestFromReceipt` et `TesseractReceiptReader`, créer **une seule** instance au chargement du module (`const reader = new TesseractReceiptReader()`) et ajouter `suggestFromReceipt: suggestFromReceipt(reader),`.

`src/app/api/expense-notes/receipt-suggestion/route.ts` :

```ts
import { expenses, MAX_RECEIPT_BYTES } from '@/modules/expenses'
import { InvalidInput } from '@/shared/errors'
import { MULTIPART_OVERHEAD_BYTES, readFormData, route } from '@/shared/http'
import { currentActor } from '../../_lib/current-actor'

export const POST = route(async (request) => {
  await currentActor()
  const form = await readFormData(request, MAX_RECEIPT_BYTES + MULTIPART_OVERHEAD_BYTES, 'Fichier trop volumineux')
  const receipt = form.get('receipt')
  if (!(receipt instanceof File)) throw new InvalidInput('Champs invalides')
  return Response.json(
    await expenses.suggestFromReceipt({
      type: receipt.type,
      size: receipt.size,
      read: async () => new Uint8Array(await receipt.arrayBuffer()),
    })
  )
})
```

Run : `npm test && npm run test:e2e -- tests/e2e/ocr-suggestion.spec.ts`
Attendu : PASS (l'E2E utilise le vrai Tesseract via l'adapter).

- [ ] **Étape 3 : OpenAPI et commit**

Dans `docs/api/openapi.yaml`, sur `POST /api/expense-notes/receipt-suggestion` : ajouter `400` (« Fichier trop volumineux », au-delà de 10 Mo) et `503` (`Problem`, en-tête `Retry-After`).

```bash
git add src tests docs/api/openapi.yaml
git commit -m "feat(expenses): suggestion OCR via le module, plafond de taille et 503 si saturé (F17, F19)"
```

---

### Tâche 11 : suppression du code mort, règles de dépendance bloquantes, frontière SQL (F22, F23, F24)

**Fichiers :**
- Supprimer : `src/domain/`, `src/ports/`, `src/adapters/`, `src/utils/`, `src/lib/db.ts`, `src/lib/ocr.ts`, `src/lib/storage.ts`, `tests/unit/ocr.test.ts`, `tests/unit/storage.test.ts`
- Créer : `scripts/check-sql-boundaries.mjs`, `tests/unit/sql-boundaries.test.ts`
- Modifier : `.dependency-cruiser.cjs`, `package.json`, `.github/workflows/tests.yml`, `vitest.config.mts`

**Interfaces :**
- Produit : `findSqlViolations(files: Array<{ path: string; content: string }>): string[]` ; `npm run check:sql`.

- [ ] **Étape 1 : vérifier que plus rien n'utilise l'ancien code**

Run : `grep -rnE "@/(domain|ports|adapters|utils)/|@/lib/(db|ocr|storage|note-sort)" src tests`
Attendu : aucune ligne. S'il en reste, migrer l'appelant vers le module concerné avant de continuer.

- [ ] **Étape 2 : supprimer**

```bash
git rm -r src/domain src/ports src/adapters src/utils src/lib/db.ts src/lib/ocr.ts src/lib/storage.ts tests/unit/ocr.test.ts tests/unit/storage.test.ts
```

(`receiptKeyFor` est couvert par `tests/unit/expenses/submission.test.ts`, la lecture du texte par `receipt-text.test.ts`, le moteur par `tesseract-receipt-reader.test.ts`.)

Run : `npm run typecheck && npm test`
Attendu : PASS.

- [ ] **Étape 3 : test de la frontière SQL (il échoue)**

`tests/unit/sql-boundaries.test.ts` :

```ts
import { describe, expect, it } from 'vitest'
import { findSqlViolations } from '../../scripts/check-sql-boundaries.mjs'

describe('frontière SQL entre modules (D4)', () => {
  it('signale une table d’un autre module', () => {
    expect(
      findSqlViolations([
        { path: 'src/modules/expenses/infrastructure/X.ts', content: 'SELECT * FROM users u JOIN expense_notes en ON true' },
        { path: 'src/modules/iam/infrastructure/Y.ts', content: 'UPDATE expense_notes SET status = 1' },
      ])
    ).toEqual([
      'src/modules/expenses/infrastructure/X.ts : table « users » (module iam)',
      'src/modules/iam/infrastructure/Y.ts : table « expense_notes » (module expenses)',
    ])
  })

  it('accepte les tables du module et les mots qui ressemblent', () => {
    expect(
      findSqlViolations([
        { path: 'src/modules/expenses/infrastructure/X.ts', content: 'SELECT user_id FROM expense_notes -- users_count' },
        { path: 'src/modules/iam/infrastructure/Y.ts', content: 'SELECT * FROM users JOIN companies c ON true' },
      ])
    ).toEqual([])
  })
})
```

Run : `npx vitest run --project unit tests/unit/sql-boundaries.test.ts`
Attendu : FAIL, script introuvable.

- [ ] **Étape 4 : `scripts/check-sql-boundaries.mjs`**

```js
// D4 : le SQL d'un module ne nomme que ses propres tables. dependency-cruiser
// voit les imports, pas le SQL : ce script couvre ce trou (CI et npm run verify).
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const TABLES_BY_MODULE = {
  iam: ['users', 'companies'],
  expenses: ['expense_notes'],
}

const SQL_TABLE_REFERENCE = /\b(?:FROM|JOIN|UPDATE|INTO)\s+([a-z_]+)\b/gi

export function findSqlViolations(files) {
  const owner = new Map(
    Object.entries(TABLES_BY_MODULE).flatMap(([module, tables]) => tables.map((table) => [table, module]))
  )
  const violations = []
  for (const { path: file, content } of files) {
    const module = /^src\/modules\/([^/]+)\//.exec(file)?.[1]
    if (!module) continue
    const seen = new Set()
    for (const match of content.matchAll(SQL_TABLE_REFERENCE)) {
      const table = match[1].toLowerCase()
      const tableOwner = owner.get(table)
      if (tableOwner && tableOwner !== module && !seen.has(table)) {
        seen.add(table)
        violations.push(`${file} : table « ${table} » (module ${tableOwner})`)
      }
    }
  }
  return violations
}

async function listTs(dir) {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => [])
  const nested = await Promise.all(
    entries.map((entry) => {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) return listTs(full)
      return entry.name.endsWith('.ts') ? [full] : []
    })
  )
  return nested.flat()
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const files = await Promise.all(
    (await listTs('src/modules')).map(async (file) => ({
      path: file.split(path.sep).join('/'),
      content: await readFile(file, 'utf8'),
    }))
  )
  const violations = findSqlViolations(files)
  if (violations.length > 0) {
    console.error('SQL hors de la frontière du module :')
    for (const violation of violations) console.error(`  ${violation}`)
    process.exit(1)
  }
  console.log('Frontière SQL respectée.')
}
```

Run : `npx vitest run --project unit tests/unit/sql-boundaries.test.ts && node scripts/check-sql-boundaries.mjs`
Attendu : PASS, puis « Frontière SQL respectée. »

- [ ] **Étape 5 : règles bloquantes**

- `.dependency-cruiser.cjs` : `const SEVERITY = 'error'` et mettre à jour le commentaire d'en-tête (« Plan 2 : bloquant »).
- `package.json`, `scripts` : `"check:sql": "node scripts/check-sql-boundaries.mjs"` et `"verify": "npm run lint && npm run typecheck && npm run depcruise && npm run check:sql && npm test"`.
- `.github/workflows/tests.yml`, job `checks`, après `npm run depcruise` : `- run: npm run check:sql`.

Run : `npm run depcruise`
Attendu : `✔ no dependency violations found`. Toute violation se corrige dans le code, jamais dans la règle.

- [ ] **Étape 6 : périmètre de couverture**

Dans `vitest.config.mts`, remplacer `coverage.include` par :

```ts
      include: [
        'src/app/api/**/*.ts',
        'src/app/actions/**/*.ts',
        'src/modules/**/*.ts',
        'src/shared/**/*.ts',
      ],
```

et mettre à jour le commentaire (plus de code mort ; `src/lib/auth.ts` et `src/proxy.ts` restent couverts par Playwright).

Run : `npm run test:coverage`
Attendu : PASS avec les seuils actuels (97 / 94 / 100). Si un seuil tombe, ajouter le test manquant ; ne jamais baisser un seuil.

- [ ] **Étape 7 : commit**

```bash
git add -A src tests scripts/check-sql-boundaries.mjs .dependency-cruiser.cjs package.json .github/workflows/tests.yml vitest.config.mts
git commit -m "refactor(refacto): code mort supprimé, règles de dépendance et frontière SQL bloquantes (F22, F23, F24)"
```

---

### Tâche 12 : ajustements d'interface — erreurs lisibles et signalement RH

**Fichiers :**
- Créer : `src/components/problem-message.ts`, `tests/unit/problem-message.test.ts`, `tests/e2e/hr-validation.spec.ts`
- Modifier : `src/components/AdminConsole.tsx`, `src/components/PendingApprovalsPanel.tsx`, `src/app/expenses/page.tsx`, `tests/e2e/approval-workflow.spec.ts`

**Interfaces :**
- Produit : `problemMessage(response: Response, fallback: string): Promise<string>` — `detail`, sinon `error`, sinon `fallback`.

- [ ] **Étape 1 : test du helper (il échoue)**

`tests/unit/problem-message.test.ts` :

```ts
import { describe, expect, it } from 'vitest'
import { problemMessage } from '@/components/problem-message'

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 409 })

describe('problemMessage', () => {
  it('préfère detail', async () => {
    expect(await problemMessage(json({ error: 'Already decided', detail: 'Déjà tranchée' }), 'x')).toBe('Déjà tranchée')
  })

  it('sinon error', async () => {
    expect(await problemMessage(json({ error: 'Invalid manager' }), 'x')).toBe('Invalid manager')
  })

  it('sinon le message par défaut (corps illisible)', async () => {
    expect(await problemMessage(new Response('<html>', { status: 500 }), 'Échec.')).toBe('Échec.')
  })
})
```

Run : `npx vitest run --project unit tests/unit/problem-message.test.ts`
Attendu : FAIL.

- [ ] **Étape 2 : `src/components/problem-message.ts`**

```ts
/** Message d'erreur à afficher : `detail` (RFC 9457), sinon `error` historique, sinon `fallback`. */
export async function problemMessage(response: Response, fallback: string): Promise<string> {
  const body = (await response.json().catch(() => null)) as { detail?: unknown; error?: unknown } | null
  if (typeof body?.detail === 'string') return body.detail
  if (typeof body?.error === 'string') return body.error
  return fallback
}
```

Run : `npx vitest run --project unit tests/unit/problem-message.test.ts`
Attendu : PASS.

- [ ] **Étape 3 : les composants utilisent `problemMessage`**

Dans `src/components/AdminConsole.tsx` (deux endroits), `src/components/PendingApprovalsPanel.tsx` (un) et `src/app/expenses/page.tsx` (un), remplacer chaque bloc

```ts
      const body = await response.json().catch(() => null)
      setXxx(typeof body?.error === 'string' ? body.error : '<message par défaut>')
```

par `setXxx(await problemMessage(response, '<message par défaut>'))`, avec le même message par défaut, et importer `problemMessage` depuis `@/components/problem-message`.

- [ ] **Étape 4 : console RH — file élargie et employés non rattachés**

Dans `src/components/AdminConsole.tsx` :

1. Après `const managers = …`, ajouter :

```ts
  // F33 : un employé sans manager a ses notes dans la file RH ; on invite à le rattacher.
  const unattached = users.filter((user) => user.role === 'employee' && user.managerId === null)
```

2. Remplacer le paragraphe d'introduction par :

```tsx
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Organigramme de votre entreprise et validation des notes des managers racines,
          des employés sans manager et des autres RH.
        </p>
```

3. Juste après le `<h2>` de l'organigramme, ajouter :

```tsx
        {unattached.length > 0 && (
          <p role="status" className="mx-6 mt-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200">
            {unattached.length === 1
              ? '1 employé sans manager : ses notes arrivent dans la file RH. Rattachez-le à un manager.'
              : `${unattached.length} employés sans manager : leurs notes arrivent dans la file RH. Rattachez-les à un manager.`}
          </p>
        )}
```

4. Dans la cellule du nom (`<td className="px-6 py-3">` qui contient `user.name`), après l'email, ajouter :

```tsx
                      {user.role === 'employee' && user.managerId === null && (
                        <span className="mt-1 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900 dark:text-amber-200">
                          Sans manager
                        </span>
                      )}
```

5. Le titre de la file devient `Notes en attente de validation RH ({notes.length})`, l'en-tête de colonne `Manager` devient `Auteur`, et l'auteur affiché devient `{author?.name ?? 'RH'}` (l'annuaire ne liste pas les RH : un auteur absent de l'annuaire est une RH).

Dans `tests/e2e/approval-workflow.spec.ts`, remplacer `'Notes des managers racine en attente (1)'` et `'(0)'` par `'Notes en attente de validation RH (1)'` et `'(0)'`.

- [ ] **Étape 5 : E2E du signalement et de la file élargie**

`tests/e2e/hr-validation.spec.ts` :

```ts
import { expect, test } from '@playwright/test'
import { createNote, createOrg, createUser } from '../support/factories'
import { closeContexts, loginAs } from './helpers'

test.afterEach(closeContexts)

test("la RH voit l'employé non rattaché signalé et valide sa note (F33)", async ({ browser }) => {
  const org = await createOrg()
  const loose = await createUser({ company: org.company, name: 'Léa Libre' })
  await createNote({ user: loose, description: 'Note de Léa E2E' })

  const hrPage = await loginAs(browser, org.hr)
  await hrPage.goto('/hr')
  await expect(hrPage.getByRole('status')).toContainText('1 employé sans manager')
  await expect(hrPage.getByRole('row', { name: /Léa Libre/ }).getByText('Sans manager')).toBeVisible()

  const row = hrPage.getByRole('row', { name: /Note de Léa E2E/ })
  await expect(row).toBeVisible()
  await row.getByRole('button', { name: 'Approuver' }).click()
  await expect(hrPage.getByRole('heading', { name: 'Notes en attente de validation RH (0)' })).toBeVisible()

  const leaPage = await loginAs(browser, loose)
  await expect(leaPage.getByRole('row', { name: /Note de Léa E2E/ })).toContainText(/approuv/i)
})

test("la note d'une RH arrive chez une autre RH, pas chez elle (F14)", async ({ browser }) => {
  const org = await createOrg()
  const otherHr = await createUser({ company: org.company, role: 'hr_admin', name: 'Hugo RH' })
  await createNote({ user: org.hr, description: 'Note de Rita E2E' })

  const ritaPage = await loginAs(browser, org.hr)
  await ritaPage.goto('/hr')
  await expect(ritaPage.getByRole('heading', { name: 'Notes en attente de validation RH (0)' })).toBeVisible()

  const hugoPage = await loginAs(browser, otherHr)
  await hugoPage.goto('/hr')
  await expect(hugoPage.getByRole('row', { name: /Note de Rita E2E/ })).toContainText('RH')
})
```

(Si le libellé du statut « approuvée » diffère dans `src/app/expenses/page.tsx`, reprendre celui affiché par la page.)

Run : `npm run test:e2e`
Attendu : PASS.

- [ ] **Étape 6 : commit**

```bash
git add src/components src/app/expenses/page.tsx tests/unit/problem-message.test.ts tests/e2e
git commit -m "feat(ui): erreurs RFC 9457 lisibles, file RH élargie et employés sans manager signalés"
```

---

### Tâche 13 : harnais du live coding — conventions, skill `ajouter-une-fonctionnalite`, sous-agent `revue-architecture`

**Fichiers :**
- Créer : `docs/architecture/conventions.md`, `.agents/skills/ajouter-une-fonctionnalite/SKILL.md`, `.agents/skills/revue-architecture/SKILL.md`, `.claude/agents/revue-architecture.md`, `.opencode/agents/revue-architecture.md`, `.codex/agents/revue-architecture.toml`
- Modifier : `AGENTS.md`, `docs/specs/2026-10-15-architecture-cible.md`, `docs/README.md`, `docs/plans/2026-10-15-architecture-cible-2-modules.md` (statut)

- [ ] **Étape 1 : `docs/architecture/conventions.md`**

````markdown
# Conventions de code

Référence courte pour ajouter du code au bon endroit. Le pourquoi est dans l'[ADR 0002](../adrs/0002-monolithe-modulaire-hexagonal.md) et le [schéma](architecture-cible.html).

## Où va quoi

| Je veux… | Où |
|---|---|
| une règle métier (calcul, validation, transition d'état) | `src/modules/<module>/domain/` — pur, testé unitairement |
| un cas d'usage (ce que fait une route) | `src/modules/<module>/application/<verbe-objet>.ts` — **un fichier par use case**, une fabrique `(ports…) => (actor, …) => résultat` |
| parler à une techno (SQL, S3, OCR, SMTP…) | un port dans `ports/`, son adapter dans `infrastructure/` |
| exposer le use case | l'ajouter à l'objet exporté par `src/modules/<module>/index.ts` |
| une route HTTP | `src/app/api/**/route.ts` : `currentActor()` → `requireRole` → parsing → **un** use case → `Response.json` |
| une erreur métier | une classe dans `domain/errors.ts` qui étend une erreur de `src/shared/errors.ts` (`NotFound`, `Conflict`, `InvalidInput`…) |
| un e-mail | le port `Mailer` de `src/shared/mail` (plan 3), jamais SMTP direct |
| une table | une migration dans `migrations/` ; la table appartient à un seul module (`scripts/check-sql-boundaries.mjs`) |
| un futur module (ex. facturation) | `src/modules/billing/`, avec ses ports (ex. `PaymentProvider`) |

## Règles de dépendance (CI bloquante)

- `domain` n'importe que son domaine, `@/shared/actor` et `@/shared/errors`.
- `application` n'importe que `domain`, `ports`, `@/shared/*` et l'`index.ts` d'un autre module ; jamais `pg`, `@aws-sdk`, `tesseract.js`, `bcryptjs`, `next`.
- Un module n'en voit un autre que par son `index.ts` ; pour un besoin récurrent, un port dans le module appelant (ex. `expenses/ports/Approvals.ts`), câblé dans son `index.ts`.
- Le SQL d'un module ne nomme que ses tables (`iam` : `users`, `companies` ; `expenses` : `expense_notes`).

## Qui valide quoi

Toujours `iam` (`ApprovalPolicy`) : manager direct, sinon les RH de l'entreprise, jamais sa propre note. Jamais de `JOIN users` dans `expenses`. La RLS ne fait que l'isolation entre entreprises.

## Erreurs HTTP

Une route ne construit jamais une réponse d'erreur : elle lève, `route()` traduit (RFC 9457, champ `error` conservé).

| Erreur | HTTP |
|---|---|
| `Unauthenticated` | 401 |
| `Forbidden` | 403 |
| `NotFound` | 404 |
| `InvalidInput` | 400 |
| `Conflict` (`already-decided`, `invalid-manager`…) | 409 |
| `UpstreamFailure` (`receipt-upload-failed`) | 502 |
| `Unavailable` | 503 + `Retry-After` |
| toute autre exception | 500 générique, détail dans les logs |

## Exemple complet : `GET /api/manager/expense-notes/{id}/receipt-url`

1. Route : `src/app/api/manager/expense-notes/[id]/receipt-url/route.ts` — acteur, rôle `manager`, `parseUuid`, `expenses.getReceiptUrl(actor, id, 'approver')`.
2. Use case : `src/modules/expenses/application/get-receipt-url.ts` — lit la note dans l'unité de travail, demande `approvals.canDecide` (port `Approvals`, câblé sur `iam`), lève `NotFound` sinon, signe l'URL via `ReceiptStorage`.
3. Tests : `tests/unit/expenses/use-cases.test.ts` (faux adapters de `tests/unit/expenses/fakes.ts`) et `tests/integration/api/manager-receipt-url.test.ts` (vraie base, vrai S3).
4. Contrat : l'opération dans `docs/api/openapi.yaml`.
````

- [ ] **Étape 2 : skill `ajouter-une-fonctionnalite`**

`.agents/skills/ajouter-une-fonctionnalite/SKILL.md` :

````markdown
---
name: ajouter-une-fonctionnalite
description: À utiliser pour toute demande d'ajout ou de modification de fonctionnalité métier dans Expense.io (nouvelle route, nouvelle règle, nouveau champ, nouvelle notification, nouvel écran) — en particulier une demande en un seul prompt pendant une démonstration. Donne la recette pas à pas, les fichiers exacts, les pièges et le résumé attendu.
---

# Ajouter une fonctionnalité

Objectif : livrer une fonctionnalité **complète et vérifiée** à partir d'une seule phrase, sans sortir de l'architecture. Lire d'abord `docs/architecture/conventions.md` (deux minutes).

## 0. Cadrer en une ligne

Reformuler la demande en une phrase : *qui* fait *quoi*, sur *quelle ressource*, avec *quelle règle*. Si une décision métier manque et change le résultat, poser **une** question ; sinon, choisir l'option la plus simple, l'écrire dans le résumé final et avancer.

## 1. Situer

- Quel module ? Notes de frais, reçus, validation → `expenses`. Comptes, rôles, organigramme, « qui valide qui » → `iam`.
- Quelle route existante ressemble le plus ? La copier comme point de départ (`src/app/api/**/route.ts`).
- Le contrat change-t-il ? Ajouter est permis (nouvelle route, nouveau champ **optionnel**) ; retirer ou rendre obligatoire est interdit.

## 2. Recette (TDD, dans cet ordre)

1. **Domaine** — la règle dans `src/modules/<module>/domain/`. Test unitaire d'abord (`tests/unit/<module>/`).
2. **Use case** — `src/modules/<module>/application/<verbe-objet>.ts`, fabrique `(ports) => (actor, …) => …`. Test unitaire avec les faux de `tests/unit/<module>/` (`fakes.ts`, `fake-iam-store.ts`).
3. **Port / adapter** si une techno nouvelle intervient (`ports/` + `infrastructure/`) ; nouvelle colonne ou table → migration `migrations/<timestamp>_<sujet>.sql` (rôle `expense_app` : penser au `GRANT`).
4. **Export** dans `src/modules/<module>/index.ts`.
5. **Route** — adapter mince :
   ```ts
   export const POST = route(async (request, { params }: RouteContext<{ id: string }>) => {
     const actor = await currentActor()
     requireRole(actor, 'manager')
     const id = parseUuid((await params).id)
     return Response.json(await expenses.monUseCase(actor, id))
   })
   ```
6. **Contrat** — décrire la route ou le champ dans `docs/api/openapi.yaml` (le test `openapi-coverage` échoue sinon).
7. **Test d'intégration** de la route, rôle par rôle (`tests/integration/api/`, helpers `actAs`, `expectProblem`).
8. **UI** si la fonctionnalité est visible (`src/app/**/page.tsx`, `src/components/`), messages d'erreur via `problemMessage`.
9. **E2E** si un parcours utilisateur change (`tests/e2e/`).
10. **E-mail** à envoyer ? Skill `envoyer-un-email` (plan 3).

## 3. Vérifier

`npm run verify` (puis `npm run test:e2e` si l'UI a changé). Lancer ensuite le sous-agent **`revue-architecture`** sur le diff et corriger ce qu'il signale.

## Pièges

| Piège | Correct |
|---|---|
| SQL de `users` dans `expenses` | demander à `iam` via le port `Approvals` (ou en ajouter un) |
| règle métier dans `route.ts` | dans `domain/` ou le use case |
| `Response.json({ error }, { status })` à la main | lever une erreur de `src/shared/errors.ts` |
| décider « qui valide » soi-même | `iam.canDecide` / `iam.approveesOf` |
| oublier l'OpenAPI | `docs/api/openapi.yaml` dans le même commit |
| nouvelle colonne non accordée à `expense_app` | `GRANT` dans la migration |
| requête hors unité de travail | `uow.run(actor, …)` (sinon la RLS ne voit rien) |

## Résumé final (format attendu)

```
Fonctionnalité : <une phrase>
Choix faits : <hypothèses prises sans demander>
Fichiers : <liste>
Contrat : <routes / champs ajoutés dans openapi.yaml>
Vérifié : npm run verify ✅ · test:e2e ✅|non lancé · revue-architecture ✅
```
````

- [ ] **Étape 3 : sous-agent `revue-architecture`**

`.agents/skills/revue-architecture/SKILL.md` :

```markdown
---
name: revue-architecture
description: À utiliser pour relire un diff d'Expense.io contre l'architecture cible — règles de dépendance, recette d'ajout de fonctionnalité, contrat d'API, erreurs, tests — avant de conclure un travail. Rend une liste de constats, sans rien modifier.
---

# Revue d'architecture

Entrée : le diff à relire (par défaut `git diff main...HEAD`). Sortie : une liste de constats, ou « RAS ». Ne modifier aucun fichier.

## Contrôles

1. `npm run depcruise` et `npm run check:sql` : toute violation est un constat bloquant.
2. Pour chaque `route.ts` modifiée : `currentActor()`, garde de rôle si l'espace en exige un, un seul use case appelé, aucune règle métier, aucune réponse d'erreur construite à la main.
3. Pour chaque use case : un fichier, une fabrique à partir de ports, aucun import de techno ; test unitaire présent.
4. « Qui valide quoi » passe par `iam` ; aucune requête d'`expenses` ne touche `users` ou `companies`.
5. Contrat : toute route ou réponse nouvelle est dans `docs/api/openapi.yaml` ; aucune réponse en succès existante n'a changé de forme.
6. Migration : `GRANT` à `expense_app` pour toute table ou colonne nouvelle ; pas de `BYPASSRLS`.
7. Tests : unitaire pour la règle, intégration pour la route ; E2E si un parcours visible a changé.

## Format de sortie

Une ligne par constat : `[bloquant|à corriger|suggestion] fichier:ligne — constat — correction proposée`. Terminer par le nombre de constats bloquants.
```

`.claude/agents/revue-architecture.md` :

```markdown
---
name: revue-architecture
description: À utiliser pour relire un diff d'Expense.io contre l'architecture cible — règles de dépendance, recette d'ajout de fonctionnalité, contrat d'API, erreurs, tests — avant de conclure un travail. Rend une liste de constats, sans rien modifier.
tools: Read, Grep, Glob, Bash
---

Lis `.agents/skills/revue-architecture/SKILL.md` et applique-le exactement au diff reçu (par défaut `git diff main...HEAD`). Ne modifie aucun fichier. Réponds uniquement avec la liste de constats au format défini.
```

`.opencode/agents/revue-architecture.md` :

```markdown
---
description: À utiliser pour relire un diff d'Expense.io contre l'architecture cible — règles de dépendance, recette d'ajout de fonctionnalité, contrat d'API, erreurs, tests — avant de conclure un travail. Rend une liste de constats, sans rien modifier.
mode: subagent
permission:
  edit: deny
  webfetch: deny
---

Lis `.agents/skills/revue-architecture/SKILL.md` et applique-le exactement au diff reçu (par défaut `git diff main...HEAD`). Ne modifie aucun fichier. Réponds uniquement avec la liste de constats au format défini.
```

`.codex/agents/revue-architecture.toml` :

```toml
name = "revue-architecture"
description = "À utiliser pour relire un diff d'Expense.io contre l'architecture cible — règles de dépendance, recette d'ajout de fonctionnalité, contrat d'API, erreurs, tests — avant de conclure un travail. Rend une liste de constats, sans rien modifier."
sandbox_mode = "read-only"
developer_instructions = """
Lis `.agents/skills/revue-architecture/SKILL.md` et applique-le exactement au diff reçu (par défaut `git diff main...HEAD`). Ne modifie aucun fichier. Réponds uniquement avec la liste de constats au format défini.
"""
```

Run : `npm run agents:sync && node scripts/agents-sync.mjs --check`
Attendu : `Skills synchronisés.`

- [ ] **Étape 4 : `AGENTS.md`**

Remplacer la section « Skills » par :

```markdown
## Skills et sous-agents

Skills au format Agent Skills dans `.agents/skills/<nom>/SKILL.md`, copiés vers `.claude/skills/` par `npm run agents:sync` (pas de lien symbolique : clones Windows, [ADR 0001](docs/adrs/0001-structure-de-la-doc-et-harnais-agent.md)). Après toute modification d'un skill, lancer `npm run agents:sync`.

| Skill | Quand |
|---|---|
| `ajouter-une-fonctionnalite` | **toute demande de fonctionnalité** (y compris en un prompt, en démo) |
| `verifier-avant-de-livrer` | avant de déclarer un travail terminé |
| `utiliser-la-doc` | avant d'écrire ou de modifier un document de `docs/` |

Sous-agent `revue-architecture` (méthode dans `.agents/skills/revue-architecture/`, définitions minces dans `.claude/agents/`, `.opencode/agents/`, `.codex/agents/`, mêmes nom et description) : le lancer sur le diff avant de conclure une fonctionnalité.
```

et ajouter sous « Architecture » : `Recette et emplacements détaillés : [docs/architecture/conventions.md](docs/architecture/conventions.md).`

- [ ] **Étape 5 : spec et doc**

Dans `docs/specs/2026-10-15-architecture-cible.md`, section `assignManager`, remplacer « il est différent de la cible et ne fait pas partie de ses descendants (`WITH RECURSIVE` sur `manager_id`) » par « il est différent de la cible et ne fait pas partie de ses descendants (parcours de la chaîne des managers dans le domaine `iam`, sur les membres chargés sous le verrou d'organigramme) », et dans le tableau de couverture, ligne F30, « (`WITH RECURSIVE`, … » par « (parcours de l'organigramme sous un verrou par entreprise) ».

Dans `docs/README.md`, « Où en est-on » : ajouter `- **Plan 2 terminé** (modules) : iam et expenses en hexagonal, ApprovalPolicy seule source de vérité, routes en adapters minces, règles de dépendance bloquantes, skill de live coding et sous-agent de revue.` Passer le statut de ce plan à `Terminé`.

- [ ] **Étape 6 : vérification complète et commit**

Run : `npm run verify && npm run test:e2e && node scripts/agents-sync.mjs --check`
Attendu : tout passe.

```bash
git add docs AGENTS.md .agents .claude/skills .claude/agents .opencode .codex
git commit -m "docs(refacto): conventions, skill ajouter-une-fonctionnalite et sous-agent revue-architecture"
git push
```
