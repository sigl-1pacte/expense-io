# Architecture cible · plan 3 : notification de décision et clôture — plan d'implémentation

> **Pour les agents :** SOUS-SKILL REQUIS : utiliser `superpowers:subagent-driven-development` (recommandé) ou `superpowers:executing-plans` pour exécuter ce plan tâche par tâche. Les étapes utilisent la syntaxe case à cocher (`- [ ]`).

| | |
|---|---|
| **Statut** | Brouillon |
| **Spec** | [2026-10-15-architecture-cible](../specs/2026-10-15-architecture-cible.md) |
| **Auteur(s)** | Louis Bertrand (avec Claude Code) |
| **Créé** | 2026-10-16 |
| **Prérequis** | [plan 2](2026-10-15-architecture-cible-2-modules.md) terminé |

**Objectif :** prévenir l'employé par e-mail de chaque décision (F15), sans jamais faire dépendre la décision du serveur mail ni perdre un e-mail ; puis mesurer l'« après » (SonarQube, benchmark) et répéter le live coding.

**Architecture :** `decideExpenseNote` compose l'e-mail (`decisionEmail`) et l'écrit par le port `Mailer` ; l'adapter `OutboxMailer` l'insère dans `mail_outbox` **dans la transaction de la décision**. Un worker de livraison (`src/worker/mail-worker.ts`), hors de l'hexagone et sans code métier, réserve des lots par bail, envoie en SMTP hors transaction, marque `sent`, réessaie, passe en `dead` après 3 échecs ([ADR 0003](../adrs/0003-notification-par-outbox-d-e-mails.md)).

**Stack :** PostgreSQL, nodemailer, Mailpit, tsx, Vitest, Playwright.

**Spec :** [`docs/specs/2026-10-15-architecture-cible.md`](../specs/2026-10-15-architecture-cible.md), section « Notification de décision ».

## Contraintes globales

- Contraintes des plans 1 et 2, toujours valables.
- La réponse de `POST …/approve` et `…/reject` ne change pas (même code, même corps) : seul l'ordre d'exécution change.
- `worker/` n'importe que `@/shared/config` et `@/shared/logger` ; il ne lit ni `expense_notes` ni `users`.
- Le rôle `expense_mailer` n'a de droits que sur `mail_outbox` ; `expense_app` n'y a que `INSERT`.
- Règle du bail : `MAIL_LEASE_SECONDS × 1000 > MAIL_BATCH_SIZE × (connexion + socket)` ; défauts 120 s, 5, 5 000 ms, 10 000 ms.
- Retry : 10 s après le premier échec, puis 1 min ; `dead` au troisième échec. Purge des lignes `sent` de plus de 30 jours.

## Points de vigilance (review focus)

1. **Le worker plante après la réservation** : la ligne doit repartir à l'expiration du bail, sans intervention. → Tâche 4 : test « crash simulé ».
2. **Deux workers en parallèle** : jamais deux fois la même ligne. → Tâche 4 : test de réservation concurrente.
3. **Échec d'écriture dans l'outbox** : la décision doit être annulée (pas de note décidée sans e-mail). → Tâche 3 : test `OutboxMailer` en échec.
4. **Destinataire introuvable** (compte supprimé entre-temps) : la décision réussit, aucun e-mail, un log d'avertissement. → Tâche 3 : test unitaire.
5. **Montant et date au format français** (`42,50 €`, `8 octobre 2026`), pas `42.5` ni une date décalée d'un jour. → Tâche 3 : test de `decisionEmail`.

## Structure des fichiers

| Fichier | Action | Responsabilité |
|---|---|---|
| `migrations/1760700000000_mail-outbox.sql` | Créer | table `mail_outbox`, rôle `expense_mailer`, droits |
| `src/shared/mail/Mailer.ts` | Créer | port `Mailer`, type `Email` |
| `src/shared/mail/OutboxMailer.ts` | Créer | adapter : `INSERT` dans `mail_outbox` sur la connexion de la transaction |
| `src/shared/mail/InMemoryMailer.ts` | Créer | doublure de test |
| `src/modules/expenses/application/decision-email.ts` | Créer | composer l'e-mail de décision |
| `src/modules/expenses/ports/{ExpensesUnitOfWork,Approvals}.ts` | Modifier | `mailer` dans le contexte, `contactOf` |
| `src/modules/expenses/application/decide-expense-note.ts` | Modifier | envoi de l'e-mail dans la transaction |
| `src/shared/config.ts` | Modifier | `loadMailerConfig` et règle du bail |
| `src/worker/mail-worker.ts` | Créer | worker de livraison |
| `scripts/mail-replay.mjs` | Créer | `dead` → `pending` |
| `docker-compose.yml`, `.github/workflows/tests.yml`, `Makefile`, `playwright.config.ts`, `tests/e2e/global-setup.ts` | Modifier | Mailpit et worker partout |
| `tests/support/mailpit.ts` | Créer | lecture de la boîte Mailpit |
| `.agents/skills/envoyer-un-email/SKILL.md`, `docs/runbooks/{mail-outbox-rejouer,demo-live-preparer}.md` | Créer | harnais et exploitation |

---

### Tâche 1 : `mail_outbox` et le rôle `expense_mailer`

**Fichiers :**
- Créer : `migrations/1760700000000_mail-outbox.sql`, `tests/integration/mail-outbox-schema.test.ts`
- Modifier : `tests/support/env.ts`, `tests/support/db.ts`, `.env.example`

**Interfaces :**
- Produit : table `mail_outbox` (schéma de la spec) ; rôle `expense_mailer` (mot de passe de dev `expense_mailer`) ; `TEST_ENV.MAILER_DATABASE_URL`, `E2E_ENV.MAILER_DATABASE_URL` ; `truncateAll()` vide aussi `mail_outbox`.

- [ ] **Étape 1 : URL du rôle mailer dans les tests**

Dans `tests/support/env.ts`, à côté de `appServerUrl`, ajouter :

```ts
function roleServerUrl(ownerUrl: string, role: string): string {
  const url = new URL(ownerUrl)
  url.username = role
  url.password = role
  return url.toString().replace(/\/$/, '')
}
const PG_MAILER_SERVER_URL = roleServerUrl(PG_SERVER_URL, 'expense_mailer')
```

et, dans `TEST_ENV` et `E2E_ENV` : `MAILER_DATABASE_URL: \`${PG_MAILER_SERVER_URL}/${TEST_DATABASE_NAME}\`` (resp. `E2E_DATABASE_NAME`).

Dans `tests/support/db.ts`, `truncateAll` devient :

```ts
export async function truncateAll(): Promise<void> {
  await testDb().query('TRUNCATE mail_outbox, expense_notes, users, companies RESTART IDENTITY CASCADE')
}
```

- [ ] **Étape 2 : écrire le test qui échoue**

`tests/integration/mail-outbox-schema.test.ts` :

```ts
import { Client } from 'pg'
import { describe, expect, it } from 'vitest'
import { TEST_ENV } from '../support/env'

async function as<T>(url: string, fn: (c: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: url })
  await client.connect()
  try {
    return await fn(client)
  } finally {
    await client.end()
  }
}

const INSERT = `INSERT INTO mail_outbox (recipient, subject, body_text, correlation_id)
                VALUES ('a@acme.fr', 'Objet', 'Texte', 'c1')`

describe('mail_outbox', () => {
  it('expense_app peut écrire mais pas lire', async () => {
    await as(TEST_ENV.APP_DATABASE_URL, (c) => c.query(INSERT))
    await expect(as(TEST_ENV.APP_DATABASE_URL, (c) => c.query('SELECT * FROM mail_outbox'))).rejects.toThrow(
      'permission denied'
    )
  })

  it('expense_mailer lit, met à jour et supprime, avec les valeurs par défaut attendues', async () => {
    await as(TEST_ENV.APP_DATABASE_URL, (c) => c.query(INSERT))
    const row = await as(TEST_ENV.MAILER_DATABASE_URL, async (c) => {
      const { rows } = await c.query('SELECT status, attempts, sent_at FROM mail_outbox')
      await c.query("UPDATE mail_outbox SET status = 'sent', sent_at = now()")
      await c.query("DELETE FROM mail_outbox WHERE status = 'sent'")
      return rows[0]
    })
    expect(row).toEqual({ status: 'pending', attempts: 0, sent_at: null })
  })

  it("expense_mailer n'a aucun droit ailleurs", async () => {
    await expect(as(TEST_ENV.MAILER_DATABASE_URL, (c) => c.query('SELECT 1 FROM users'))).rejects.toThrow('permission denied')
    await expect(as(TEST_ENV.MAILER_DATABASE_URL, (c) => c.query('SELECT 1 FROM expense_notes'))).rejects.toThrow(
      'permission denied'
    )
  })

  it('refuse un statut inconnu', async () => {
    await as(TEST_ENV.APP_DATABASE_URL, (c) => c.query(INSERT))
    await expect(
      as(TEST_ENV.MAILER_DATABASE_URL, (c) => c.query("UPDATE mail_outbox SET status = 'perdu'"))
    ).rejects.toThrow('mail_outbox_status_check')
  })
})
```

Run : `npx vitest run --project integration tests/integration/mail-outbox-schema.test.ts`
Attendu : FAIL (table et rôle absents).

- [ ] **Étape 3 : la migration `migrations/1760700000000_mail-outbox.sql`**

```sql
-- Up Migration
-- Outbox d'e-mails (ADR 0003) : écrite par l'application dans la transaction
-- de la décision, vidée par le worker de livraison.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'expense_mailer') THEN
    CREATE ROLE expense_mailer LOGIN PASSWORD 'expense_mailer'
      NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
  END IF;
END $$;

CREATE TABLE mail_outbox (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient       text NOT NULL,
  subject         text NOT NULL,
  body_text       text NOT NULL,
  correlation_id  text,
  status          text NOT NULL DEFAULT 'pending'
                  CONSTRAINT mail_outbox_status_check CHECK (status IN ('pending', 'sent', 'dead')),
  attempts        int NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_error      text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  sent_at         timestamptz
);
CREATE INDEX mail_outbox_pending_idx ON mail_outbox (next_attempt_at) WHERE status = 'pending';

GRANT INSERT ON mail_outbox TO expense_app;
GRANT USAGE ON SCHEMA public TO expense_mailer;
GRANT SELECT, UPDATE, DELETE ON mail_outbox TO expense_mailer;

-- Down Migration
DROP TABLE mail_outbox;
```

Run : `npx vitest run --project integration tests/integration/mail-outbox-schema.test.ts`
Attendu : PASS.

- [ ] **Étape 4 : `.env.example` et commit**

Ajouter à `.env.example` :

```bash
# Worker de livraison des e-mails (npm run worker) — rôle limité à mail_outbox.
MAILER_DATABASE_URL=postgres://expense_mailer:expense_mailer@localhost:5433/expense_io
SMTP_HOST=localhost
SMTP_PORT=1025
MAIL_FROM="Expense.io <no-reply@expense.io>"
```

```bash
git add migrations/1760700000000_mail-outbox.sql tests/integration/mail-outbox-schema.test.ts tests/support .env.example
git commit -m "feat(refacto): table mail_outbox et rôle expense_mailer"
```

---

### Tâche 2 : le port `Mailer` et l'adapter `OutboxMailer`

**Fichiers :**
- Créer : `src/shared/mail/Mailer.ts`, `src/shared/mail/OutboxMailer.ts`, `src/shared/mail/InMemoryMailer.ts`, `tests/integration/shared/outbox-mailer.test.ts`

**Interfaces :**
- Produit :
  - `interface Email { to: string; subject: string; text: string; correlationId?: string }`
  - `interface Mailer { send(email: Email): Promise<void> }`
  - `class OutboxMailer implements Mailer` (constructeur `(sql: Sql)`) ; `class InMemoryMailer implements Mailer { sent: Email[] }`

- [ ] **Étape 1 : écrire le test qui échoue**

`tests/integration/shared/outbox-mailer.test.ts` :

```ts
import { describe, expect, it } from 'vitest'
import { OutboxMailer } from '@/shared/mail/OutboxMailer'
import { runInScope } from '@/shared/unit-of-work'
import { testDb } from '../../support/db'
import { createOrg } from '../../support/factories'

const EMAIL = { to: 'emma@acme.fr', subject: 'Objet', text: 'Texte', correlationId: 'corr-1' }

describe('OutboxMailer', () => {
  it("écrit l'e-mail dans mail_outbox, dans la transaction en cours", async () => {
    const { employee } = await createOrg()
    await runInScope({ userId: employee.id, companyId: employee.company_id }, (sql) => new OutboxMailer(sql).send(EMAIL))
    const { rows } = await testDb().query('SELECT recipient, subject, body_text, correlation_id, status FROM mail_outbox')
    expect(rows).toEqual([
      { recipient: 'emma@acme.fr', subject: 'Objet', body_text: 'Texte', correlation_id: 'corr-1', status: 'pending' },
    ])
  })

  it('annulé avec la transaction : rien n’est écrit', async () => {
    const { employee } = await createOrg()
    await expect(
      runInScope({ userId: employee.id, companyId: employee.company_id }, async (sql) => {
        await new OutboxMailer(sql).send(EMAIL)
        throw new Error('décision annulée')
      })
    ).rejects.toThrow('décision annulée')
    expect((await testDb().query('SELECT count(*)::int AS n FROM mail_outbox')).rows[0].n).toBe(0)
  })
})
```

Run : `npx vitest run --project integration tests/integration/shared/outbox-mailer.test.ts`
Attendu : FAIL, modules introuvables.

- [ ] **Étape 2 : le port et ses adapters**

`src/shared/mail/Mailer.ts` :

```ts
/** Un e-mail entièrement décidé par le cœur : destinataire, objet, texte. */
export interface Email {
  to: string
  subject: string
  text: string
  correlationId?: string
}

/**
 * Port générique d'envoi. Le cœur ne sait pas si l'e-mail part tout de suite
 * ou plus tard : en production, OutboxMailer l'écrit dans mail_outbox.
 */
export interface Mailer {
  send(email: Email): Promise<void>
}
```

`src/shared/mail/OutboxMailer.ts` :

```ts
// Adapter du port Mailer : écrit l'e-mail dans mail_outbox, sur la connexion
// de l'unité de travail. La note et son e-mail sont donc écrits ensemble, ou
// pas du tout (ADR 0003). Le worker de livraison fera l'envoi SMTP.
import type { Sql } from '../unit-of-work'
import type { Email, Mailer } from './Mailer'

export class OutboxMailer implements Mailer {
  constructor(private readonly sql: Sql) {}

  async send(email: Email): Promise<void> {
    await this.sql.query(
      `INSERT INTO mail_outbox (recipient, subject, body_text, correlation_id)
       VALUES ($1, $2, $3, $4)`,
      [email.to, email.subject, email.text, email.correlationId ?? null]
    )
  }
}
```

`src/shared/mail/InMemoryMailer.ts` :

```ts
import type { Email, Mailer } from './Mailer'

/** Doublure de test : garde les e-mails « envoyés ». */
export class InMemoryMailer implements Mailer {
  readonly sent: Email[] = []

  async send(email: Email): Promise<void> {
    this.sent.push(email)
  }
}
```

Run : `npx vitest run --project integration tests/integration/shared/outbox-mailer.test.ts && npm run depcruise`
Attendu : PASS.

- [ ] **Étape 3 : commit**

```bash
git add src/shared/mail tests/integration/shared/outbox-mailer.test.ts
git commit -m "feat(refacto): port Mailer et adapter OutboxMailer"
```

---

### Tâche 3 : `decideExpenseNote` compose et écrit l'e-mail (F15)

**Fichiers :**
- Créer : `src/modules/expenses/application/decision-email.ts`, `tests/unit/expenses/decision-email.test.ts`
- Modifier : `src/modules/expenses/ports/ExpensesUnitOfWork.ts`, `src/modules/expenses/ports/Approvals.ts`, `src/modules/expenses/infrastructure/PgExpensesUnitOfWork.ts`, `src/modules/expenses/application/decide-expense-note.ts`, `src/modules/expenses/index.ts`, les 4 routes de décision, `tests/unit/expenses/fakes.ts`, `tests/unit/expenses/use-cases.test.ts`, `tests/integration/api/manager-decisions.test.ts`

**Interfaces :**
- Consomme : `Mailer`, `OutboxMailer`, `InMemoryMailer` (tâche 2) ; `iam.getContact` (plan 2).
- Produit :
  - `ExpensesContext { notes: NoteRepository; mailer: Mailer }`
  - `Approvals.contactOf(actor: Actor, userId: string): Promise<{ name: string; email: string } | null>`
  - `decisionEmail(contact: { name: string; email: string }, note: { amount: number; expenseDate: string; status: Decision }, correlationId: string): Email`
  - `decideExpenseNote(actor, noteId, decision, correlationId: string): Promise<ExpenseNoteDto>` (nouveau paramètre)

- [ ] **Étape 1 : tests (ils échouent)**

`tests/unit/expenses/decision-email.test.ts` :

```ts
import { describe, expect, it } from 'vitest'
import { decisionEmail } from '@/modules/expenses/application/decision-email'

const emma = { name: 'Emma Employée', email: 'emma@acme.fr' }

describe('decisionEmail (point de vigilance 5)', () => {
  it('note approuvée : objet, montant et date au format français', () => {
    const email = decisionEmail(emma, { amount: 42.5, expenseDate: '2026-10-08', status: 'approved' }, 'corr-1')
    expect(email.to).toBe('emma@acme.fr')
    expect(email.subject).toBe('Votre note de frais a été approuvée')
    expect(email.text).toContain('Bonjour Emma Employée,')
    expect(email.text).toContain(new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(42.5))
    expect(email.text).toContain('8 octobre 2026')
    expect(email.correlationId).toBe('corr-1')
  })

  it('note refusée', () => {
    const email = decisionEmail(emma, { amount: 7, expenseDate: '2026-01-01', status: 'rejected' }, 'c')
    expect(email.subject).toBe('Votre note de frais a été refusée')
    expect(email.text).toContain('1 janvier 2026')
  })
})
```

Dans `tests/unit/expenses/fakes.ts` :
- `FakeUow` reçoit un `mailer` : `constructor(readonly notes = new InMemoryNotes(), readonly mailer = new InMemoryMailer()) {}` et `run` passe `{ notes: this.notes, mailer: this.mailer }` (importer `InMemoryMailer` depuis `@/shared/mail/InMemoryMailer`) ;
- `FakeApprovals` reçoit des contacts : constructeur `(approvees: Record<string, string[]> = {}, contacts: Record<string, { name: string; email: string }> = {})` et méthode `async contactOf(_actor: Actor, userId: string) { return this.contacts[userId] ?? null }`.

Dans `tests/unit/expenses/use-cases.test.ts`, `describe('decideExpenseNote (F9)')` :
- `setup()` crée `new FakeApprovals({ m1: ['e1'] }, { e1: { name: 'Emma', email: 'emma@acme.fr' } })` ;
- chaque appel `decide(…)` prend un quatrième argument `'corr-1'` ;
- ajouter :

```ts
  it('écrit l’e-mail de décision dans la même unité de travail (F15)', async () => {
    const { uow, decide } = await setup()
    await decide(actor('m1', 'manager'), 'n1', 'approved', 'corr-1')
    expect(uow.mailer.sent).toEqual([
      expect.objectContaining({ to: 'emma@acme.fr', subject: 'Votre note de frais a été approuvée', correlationId: 'corr-1' }),
    ])
  })

  it('note déjà décidée : aucun e-mail', async () => {
    const { uow, decide } = await setup()
    uow.notes.saveDecision = async () => false
    await expect(decide(actor('m1', 'manager'), 'n1', 'approved', 'c')).rejects.toBeInstanceOf(AlreadyDecided)
    expect(uow.mailer.sent).toEqual([])
  })

  it('destinataire introuvable : la décision passe, sans e-mail (point de vigilance 4)', async () => {
    const uow = new FakeUow()
    await submitExpenseNote(uow, new FakeStorage())(actor('e1'), submission)
    const decide = decideExpenseNote(uow, new FakeApprovals({ m1: ['e1'] }))
    expect((await decide(actor('m1', 'manager'), 'n1', 'approved', 'c')).status).toBe('approved')
    expect(uow.mailer.sent).toEqual([])
  })
```

Dans `tests/integration/api/manager-decisions.test.ts`, ajouter :

```ts
  it(`écrit l'e-mail de décision dans mail_outbox, avec la corrélation de la requête (F15)`, async () => {
    const org = await createOrg()
    const note = await createNote({ user: org.employee })
    actAs(org.manager)
    expect((await decide(note.id, { headers: { 'x-correlation-id': 'corr-e2e' } })).status).toBe(200)
    const { rows } = await testDb().query('SELECT recipient, subject, correlation_id FROM mail_outbox')
    expect(rows).toEqual([
      {
        recipient: org.employee.email,
        subject: `Votre note de frais a été ${decided === 'approved' ? 'approuvée' : 'refusée'}`,
        correlation_id: 'corr-e2e',
      },
    ])
  })

  it("si l'outbox refuse l'écriture, la décision est annulée (point de vigilance 3)", async () => {
    const org = await createOrg()
    const note = await createNote({ user: org.employee })
    actAs(org.manager)
    vi.spyOn(OutboxMailer.prototype, 'send').mockRejectedValueOnce(new Error('outbox indisponible'))
    await expectProblem(await decide(note.id), 500, 'Erreur interne')
    expect((await findNote(note.id))?.status).toBe('pending')
  })
```

(imports : `vi` depuis `vitest`, `OutboxMailer` depuis `@/shared/mail/OutboxMailer`, `testDb` depuis `../../support/db`, `expectProblem` depuis `../helpers/http`.)

Run : `npm test`
Attendu : FAIL.

- [ ] **Étape 2 : `decision-email.ts`**

`src/modules/expenses/application/decision-email.ts` :

```ts
// Qui prévenir, et quoi lui dire : décision métier, prise dans le cœur.
// Le worker de livraison ne fait qu'envoyer ce texte.
import type { Email } from '@/shared/mail/Mailer'
import type { Decision } from '../domain/ExpenseNote'

const amountFormat = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' })
// La date de dépense est une date civile (YYYY-MM-DD) : formatée en UTC pour ne jamais glisser d'un jour.
const dateFormat = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeZone: 'UTC' })

export function decisionEmail(
  contact: { name: string; email: string },
  note: { amount: number; expenseDate: string; status: Decision },
  correlationId: string
): Email {
  const verdict = note.status === 'approved' ? 'approuvée' : 'refusée'
  return {
    to: contact.email,
    subject: `Votre note de frais a été ${verdict}`,
    text: [
      `Bonjour ${contact.name},`,
      '',
      `Votre note de frais de ${amountFormat.format(note.amount)} du ${dateFormat.format(new Date(note.expenseDate))} a été ${verdict}.`,
      '',
      '— Expense.io',
    ].join('\n'),
    correlationId,
  }
}
```

- [ ] **Étape 3 : ports, unité de travail, use case**

`src/modules/expenses/ports/ExpensesUnitOfWork.ts` : ajouter `import type { Mailer } from '@/shared/mail/Mailer'` et le champ `mailer: Mailer` à `ExpensesContext`.

`src/modules/expenses/ports/Approvals.ts` : ajouter

```ts
  /** Nom et e-mail d'un membre de l'entreprise de l'acteur ; `null` s'il n'existe plus. */
  contactOf(actor: Actor, userId: string): Promise<{ name: string; email: string } | null>
```

`src/modules/expenses/infrastructure/PgExpensesUnitOfWork.ts` : le contexte devient `{ notes: new PgNoteRepository(sql), mailer: new OutboxMailer(sql) }` (importer `OutboxMailer` depuis `@/shared/mail/OutboxMailer`).

`src/modules/expenses/application/decide-expense-note.ts` :

```ts
import type { Actor } from '@/shared/actor'
import { NotFound } from '@/shared/errors'
import { logger } from '@/shared/logger'
import { AlreadyDecided } from '../domain/errors'
import type { Decision, ExpenseNoteDto } from '../domain/ExpenseNote'
import type { Approvals } from '../ports/Approvals'
import type { ExpensesUnitOfWork } from '../ports/ExpensesUnitOfWork'
import { decisionEmail } from './decision-email'

/**
 * F9 : l'UPDATE ne touche la note que si elle est encore `pending`.
 * F15 : l'e-mail est écrit dans la même transaction (outbox) ; si l'écriture
 * échoue, la décision est annulée. L'envoi réel est fait par le worker.
 */
export function decideExpenseNote(uow: ExpensesUnitOfWork, approvals: Approvals) {
  return (actor: Actor, noteId: string, decision: Decision, correlationId: string): Promise<ExpenseNoteDto> =>
    uow.run(actor, async (ctx) => {
      const note = await ctx.notes.findById(noteId)
      if (!note || !(await approvals.canDecide(actor, note.userId))) throw new NotFound()
      const decided = note.decide(decision)
      if (!(await ctx.notes.saveDecision(decided))) throw new AlreadyDecided()

      const contact = await approvals.contactOf(actor, decided.userId)
      if (contact) {
        await ctx.mailer.send(
          decisionEmail(contact, { amount: decided.amount, expenseDate: decided.expenseDate, status: decision }, correlationId)
        )
      } else {
        logger.warn('Décision sans destinataire : aucun e-mail', { correlationId, noteId })
      }
      return decided.toDto()
    })
}
```

`src/modules/expenses/index.ts` : `const approvals: Approvals = { approveesOf: iam.approveesOf, canDecide: iam.canDecide, contactOf: iam.getContact }`.

Les quatre routes de décision : la fonction passée à `route` reçoit le troisième argument `meta`, et l'appel devient `expenses.decideExpenseNote(actor, id, 'approved', meta.correlationId)` (resp. `'rejected'`). Exemple :

```ts
export const POST = route(async (_request, { params }: RouteContext<{ id: string }>, meta) => {
  const actor = await currentActor()
  requireRole(actor, 'manager')
  const id = parseUuid((await params).id)
  return Response.json(await expenses.decideExpenseNote(actor, id, 'approved', meta.correlationId))
})
```

Run : `npm test && npm run depcruise && npm run check:sql`
Attendu : PASS.

- [ ] **Étape 4 : commit**

```bash
git add src tests
git commit -m "feat(expenses): l'e-mail de décision est écrit dans l'outbox avec la décision (F15)"
```

---

### Tâche 4 : le worker de livraison

**Fichiers :**
- Créer : `src/worker/mail-worker.ts`, `tests/unit/mailer-config.test.ts`, `tests/support/mailpit.ts`, `tests/integration/worker/mail-worker.test.ts`, `scripts/mail-replay.mjs`
- Modifier : `src/shared/config.ts`, `package.json`, `docker-compose.yml`, `.github/workflows/tests.yml`, `tests/support/env.ts`

**Interfaces :**
- Produit :
  - `interface MailerConfig { databaseUrl; smtpHost; smtpPort: number; mailFrom; batchSize: number; leaseSeconds: number; connectionTimeoutMs: number; greetingTimeoutMs: number; socketTimeoutMs: number; pollIntervalMs: number; purgeAfterDays: number }`, `loadMailerConfig(env?): MailerConfig` (lève si la règle du bail n'est pas tenue)
  - dans `mail-worker.ts` : `claimBatch(pool, batchSize, leaseSeconds): Promise<OutboxRow[]>`, `markSent(pool, id)`, `markFailed(pool, id, error): Promise<'pending' | 'dead'>`, `purgeSent(pool, olderThanDays): Promise<number>`, `deliverBatch(deps): Promise<{ sent: number; failed: number }>`, `startWorker(config): { stop(): Promise<void> }`
  - `npm run worker`, `npm run mail:replay`

- [ ] **Étape 1 : Mailpit dans le compose et la CI**

`docker-compose.yml`, sous `services:` :

```yaml
  mailpit:
    # Serveur SMTP de dev : capture les e-mails (interface sur http://localhost:8025).
    image: axllent/mailpit:v1.21
    restart: unless-stopped
    ports:
      - '1025:1025'
      - '8025:8025'
```

Dans le `Makefile`, cible `up` : ajouter le contrôle de santé de `mailpit` comme pour Postgres et LocalStack, ou au minimum `$(COMPOSE) up -d` (déjà présent) suffit car Mailpit démarre en moins d'une seconde.

`.github/workflows/tests.yml`, jobs `vitest` et `e2e`, sous `services:` :

```yaml
      mailpit:
        image: axllent/mailpit:v1.21
        ports:
          - 1025:1025
          - 8025:8025
```

`tests/support/env.ts` : ajouter à `TEST_ENV` et `E2E_ENV`

```ts
  SMTP_HOST: 'localhost',
  SMTP_PORT: '1025',
  MAIL_FROM: 'Expense.io <no-reply@expense.io>',
  MAILPIT_URL: process.env.TEST_MAILPIT_URL ?? 'http://localhost:8025',
```

- [ ] **Étape 2 : configuration du worker (test d'abord)**

`tests/unit/mailer-config.test.ts` :

```ts
import { describe, expect, it } from 'vitest'
import { loadMailerConfig } from '@/shared/config'

const BASE = {
  MAILER_DATABASE_URL: 'postgres://expense_mailer:x@localhost/db',
  SMTP_HOST: 'localhost',
  SMTP_PORT: '1025',
  MAIL_FROM: 'Expense.io <no-reply@expense.io>',
}

describe('loadMailerConfig', () => {
  it('valeurs par défaut de la spec', () => {
    expect(loadMailerConfig(BASE)).toMatchObject({
      batchSize: 5,
      leaseSeconds: 120,
      connectionTimeoutMs: 5000,
      greetingTimeoutMs: 5000,
      socketTimeoutMs: 10000,
      purgeAfterDays: 30,
    })
  })

  it('refuse un bail plus court que le pire cas d’un lot', () => {
    expect(() => loadMailerConfig({ ...BASE, MAIL_BATCH_SIZE: '20', MAIL_LEASE_SECONDS: '60' })).toThrow(
      'MAIL_LEASE_SECONDS (60 s) doit dépasser le pire cas d’un lot (300 s)'
    )
  })

  it('exige MAILER_DATABASE_URL, SMTP_HOST et MAIL_FROM', () => {
    expect(() => loadMailerConfig({ ...BASE, MAILER_DATABASE_URL: '' })).toThrow('MAILER_DATABASE_URL')
  })
})
```

Ajouter à `src/shared/config.ts` :

```ts
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

function int(env: Env, name: string, fallback: number): number {
  return env[name] ? Number.parseInt(env[name] as string, 10) : fallback
}

/** Configuration du worker de livraison, avec la règle du bail (ADR 0003). */
export function loadMailerConfig(env: Env = process.env): MailerConfig {
  const config: MailerConfig = {
    databaseUrl: required(env, 'MAILER_DATABASE_URL'),
    smtpHost: required(env, 'SMTP_HOST'),
    smtpPort: int(env, 'SMTP_PORT', 1025),
    mailFrom: required(env, 'MAIL_FROM'),
    batchSize: int(env, 'MAIL_BATCH_SIZE', 5),
    leaseSeconds: int(env, 'MAIL_LEASE_SECONDS', 120),
    connectionTimeoutMs: int(env, 'SMTP_CONNECTION_TIMEOUT_MS', 5000),
    greetingTimeoutMs: int(env, 'SMTP_GREETING_TIMEOUT_MS', 5000),
    socketTimeoutMs: int(env, 'SMTP_SOCKET_TIMEOUT_MS', 10000),
    pollIntervalMs: int(env, 'MAIL_POLL_INTERVAL_MS', 1000),
    purgeAfterDays: int(env, 'MAIL_PURGE_AFTER_DAYS', 30),
  }
  // Sinon un second worker réserverait des lignes encore en cours d'envoi.
  const worstBatchSeconds = (config.batchSize * (config.connectionTimeoutMs + config.socketTimeoutMs)) / 1000
  if (config.leaseSeconds <= worstBatchSeconds) {
    throw new Error(
      `MAIL_LEASE_SECONDS (${config.leaseSeconds} s) doit dépasser le pire cas d’un lot (${worstBatchSeconds} s)`
    )
  }
  return config
}
```

Run : `npx vitest run --project unit tests/unit/mailer-config.test.ts`
Attendu : PASS.

- [ ] **Étape 3 : helper Mailpit et test du worker (il échoue)**

`tests/support/mailpit.ts` :

```ts
const BASE = process.env.MAILPIT_URL ?? 'http://localhost:8025'

export interface MailpitMessage {
  ID: string
  MessageID: string
  Subject: string
  To: Array<{ Address: string }>
}

export async function mailpitMessages(): Promise<MailpitMessage[]> {
  const response = await fetch(`${BASE}/api/v1/messages`)
  return ((await response.json()) as { messages: MailpitMessage[] }).messages
}

export async function clearMailpit(): Promise<void> {
  await fetch(`${BASE}/api/v1/messages`, { method: 'DELETE' })
}

/** Attend qu'un e-mail pour `to` arrive (polling de l'API Mailpit). */
export async function waitForMail(to: string, timeoutMs = 15_000): Promise<MailpitMessage> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const found = (await mailpitMessages()).find((m) => m.To.some((r) => r.Address === to))
    if (found) return found
    if (Date.now() > deadline) throw new Error(`Aucun e-mail pour ${to} après ${timeoutMs} ms`)
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
}
```

`tests/integration/worker/mail-worker.test.ts` :

```ts
import { Pool } from 'pg'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { loadMailerConfig } from '@/shared/config'
import { claimBatch, deliverBatch, markFailed, purgeSent } from '@/worker/mail-worker'
import { createTransport } from 'nodemailer'
import { testDb } from '../../support/db'
import { TEST_ENV } from '../../support/env'
import { clearMailpit, mailpitMessages } from '../../support/mailpit'

const config = loadMailerConfig(TEST_ENV)
const pool = new Pool({ connectionString: TEST_ENV.MAILER_DATABASE_URL, max: 4 })
const transport = createTransport({ host: config.smtpHost, port: config.smtpPort })

async function queue(recipient: string, overrides: Record<string, unknown> = {}) {
  const { rows } = await testDb().query<{ id: string }>(
    `INSERT INTO mail_outbox (recipient, subject, body_text, correlation_id, status, attempts, sent_at, created_at)
     VALUES ($1, 'Objet', 'Texte', 'c', $2, $3, $4, COALESCE($5, now())) RETURNING id`,
    [recipient, overrides.status ?? 'pending', overrides.attempts ?? 0, overrides.sent_at ?? null, overrides.created_at ?? null]
  )
  return rows[0].id
}

const rowOf = async (id: string) =>
  (await testDb().query('SELECT status, attempts, last_error FROM mail_outbox WHERE id = $1', [id])).rows[0]

beforeEach(async () => {
  await clearMailpit()
})

afterAll(async () => {
  await pool.end()
})

describe('worker de livraison', () => {
  it('envoie une ligne pending à Mailpit puis la marque sent, Message-ID = id de la ligne', async () => {
    const id = await queue('emma@acme.fr')
    expect(await deliverBatch({ pool, transport, config })).toEqual({ sent: 1, failed: 0 })
    const [message] = await mailpitMessages()
    expect(message.To[0].Address).toBe('emma@acme.fr')
    expect(message.MessageID).toBe(`${id}@expense.io`)
    expect((await rowOf(id)).status).toBe('sent')
  })

  it('crash après la réservation : la ligne repart à l’expiration du bail (point de vigilance 1)', async () => {
    const id = await queue('a@acme.fr')
    expect((await claimBatch(pool, 5, 1)).map((r) => r.id)).toEqual([id])
    // « Crash » : rien n'est marqué. Pendant le bail, personne ne la reprend.
    expect(await claimBatch(pool, 5, 1)).toEqual([])
    await new Promise((resolve) => setTimeout(resolve, 1100))
    expect((await claimBatch(pool, 5, 1)).map((r) => r.id)).toEqual([id])
  })

  it('deux workers en parallèle ne réservent jamais la même ligne (point de vigilance 2)', async () => {
    for (let i = 0; i < 10; i++) await queue(`u${i}@acme.fr`)
    const [a, b] = await Promise.all([claimBatch(pool, 5, 60), claimBatch(pool, 5, 60)])
    const ids = [...a, ...b].map((r) => r.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).toHaveLength(10)
  })

  it('SMTP en panne : retry puis dead au troisième échec', async () => {
    const id = await queue('b@acme.fr')
    const broken = { sendMail: async () => Promise.reject(new Error('SMTP indisponible')) }
    expect(await markFailed(pool, id, new Error('x'))).toBe('pending')
    expect(await markFailed(pool, id, new Error('x'))).toBe('pending')
    await testDb().query('UPDATE mail_outbox SET next_attempt_at = now() WHERE id = $1', [id])
    expect(await deliverBatch({ pool, transport: broken, config })).toEqual({ sent: 0, failed: 1 })
    expect(await rowOf(id)).toEqual({ status: 'dead', attempts: 3, last_error: 'SMTP indisponible' })
  })

  it('premier échec : nouvel essai dans 10 s', async () => {
    const id = await queue('c@acme.fr')
    await markFailed(pool, id, new Error('x'))
    const { rows } = await testDb().query(
      "SELECT next_attempt_at > now() + interval '8 seconds' AND next_attempt_at < now() + interval '12 seconds' AS ok FROM mail_outbox WHERE id = $1",
      [id]
    )
    expect(rows[0].ok).toBe(true)
  })

  it('purge les lignes sent de plus de 30 jours, pas les autres', async () => {
    await queue('old@acme.fr', { status: 'sent', sent_at: new Date(Date.now() - 31 * 86400_000) })
    const recent = await queue('new@acme.fr', { status: 'sent', sent_at: new Date() })
    const dead = await queue('dead@acme.fr', { status: 'dead', created_at: new Date(Date.now() - 90 * 86400_000) })
    expect(await purgeSent(pool, 30)).toBe(1)
    const { rows } = await testDb().query('SELECT id FROM mail_outbox ORDER BY id')
    expect(rows.map((r) => r.id).sort()).toEqual([recent, dead].sort())
  })
})
```

Run : `npx vitest run --project integration tests/integration/worker`
Attendu : FAIL, `@/worker/mail-worker` introuvable.

- [ ] **Étape 4 : implémenter `src/worker/mail-worker.ts`**

Run : `npm install nodemailer && npm install -D @types/nodemailer tsx`

```ts
// Worker de livraison des e-mails (ADR 0003). Infrastructure hors de
// l'hexagone : aucun code métier, aucun import de modules/. Il réserve des
// lignes de mail_outbox par bail, envoie en SMTP hors transaction, marque
// sent, réessaie, puis passe en dead au troisième échec.
import { createTransport, type Transporter } from 'nodemailer'
import { Pool } from 'pg'
import { loadMailerConfig, type MailerConfig } from '@/shared/config'
import { logger } from '@/shared/logger'

export interface OutboxRow {
  id: string
  recipient: string
  subject: string
  body_text: string
  correlation_id: string | null
  attempts: number
}

/** Réservation courte, aussitôt validée : aucun verrou pendant l'envoi SMTP. */
export async function claimBatch(pool: Pool, batchSize: number, leaseSeconds: number): Promise<OutboxRow[]> {
  const { rows } = await pool.query<OutboxRow>(
    `UPDATE mail_outbox SET next_attempt_at = now() + make_interval(secs => $2)
     WHERE id IN (SELECT id FROM mail_outbox
                  WHERE status = 'pending' AND next_attempt_at <= now()
                  ORDER BY created_at LIMIT $1
                  FOR UPDATE SKIP LOCKED)
     RETURNING id, recipient, subject, body_text, correlation_id, attempts`,
    [batchSize, leaseSeconds]
  )
  return rows
}

export async function markSent(pool: Pool, id: string): Promise<void> {
  await pool.query("UPDATE mail_outbox SET status = 'sent', sent_at = now(), last_error = NULL WHERE id = $1", [id])
}

/** 10 s après le premier échec, puis 1 min ; `dead` au troisième. */
export async function markFailed(pool: Pool, id: string, error: unknown): Promise<'pending' | 'dead'> {
  const { rows } = await pool.query<{ status: 'pending' | 'dead' }>(
    `UPDATE mail_outbox
     SET attempts = attempts + 1,
         last_error = $2,
         status = CASE WHEN attempts + 1 >= 3 THEN 'dead' ELSE 'pending' END,
         next_attempt_at = now() + CASE WHEN attempts = 0 THEN interval '10 seconds' ELSE interval '1 minute' END
     WHERE id = $1
     RETURNING status`,
    [id, error instanceof Error ? error.message : String(error)]
  )
  return rows[0].status
}

export async function purgeSent(pool: Pool, olderThanDays: number): Promise<number> {
  const { rowCount } = await pool.query(
    "DELETE FROM mail_outbox WHERE status = 'sent' AND sent_at < now() - make_interval(days => $1)",
    [olderThanDays]
  )
  return rowCount ?? 0
}

export async function deliverBatch(deps: {
  pool: Pool
  transport: Pick<Transporter, 'sendMail'>
  config: MailerConfig
}): Promise<{ sent: number; failed: number }> {
  const { pool, transport, config } = deps
  const rows = await claimBatch(pool, config.batchSize, config.leaseSeconds)
  let sent = 0
  let failed = 0
  for (const row of rows) {
    try {
      await transport.sendMail({
        from: config.mailFrom,
        to: row.recipient,
        subject: row.subject,
        text: row.body_text,
        // Repère les doublons possibles (livraison au moins une fois).
        messageId: `<${row.id}@expense.io>`,
      })
      await markSent(pool, row.id)
      sent++
      logger.info('E-mail envoyé', { correlationId: row.correlation_id, outboxId: row.id })
    } catch (error) {
      failed++
      const status = await markFailed(pool, row.id, error)
      const log = status === 'dead' ? logger.error : logger.warn
      log(status === 'dead' ? 'E-mail abandonné (dead) : npm run mail:replay pour le rejouer' : 'Envoi échoué, nouvel essai planifié', {
        correlationId: row.correlation_id,
        outboxId: row.id,
        error,
      })
    }
  }
  return { sent, failed }
}

export function startWorker(config: MailerConfig): { stop(): Promise<void> } {
  const pool = new Pool({ connectionString: config.databaseUrl, max: 2 })
  const transport = createTransport({
    host: config.smtpHost,
    port: config.smtpPort,
    connectionTimeout: config.connectionTimeoutMs,
    greetingTimeout: config.greetingTimeoutMs,
    socketTimeout: config.socketTimeoutMs,
  })
  let stopping = false
  let lastPurge = 0
  const loop = (async () => {
    logger.info('Worker de livraison démarré', { batchSize: config.batchSize, leaseSeconds: config.leaseSeconds })
    while (!stopping) {
      try {
        await deliverBatch({ pool, transport, config })
        if (Date.now() - lastPurge > 3600_000) {
          const purged = await purgeSent(pool, config.purgeAfterDays)
          if (purged > 0) logger.info('Lignes envoyées purgées', { purged })
          lastPurge = Date.now()
        }
      } catch (error) {
        logger.error('Tour du worker échoué', { error })
      }
      if (!stopping) await new Promise((resolve) => setTimeout(resolve, config.pollIntervalMs))
    }
  })()
  return {
    async stop() {
      // SIGTERM : on finit l'envoi en cours, on ne réserve plus rien.
      stopping = true
      await loop
      transport.close()
      await pool.end()
      logger.info('Worker de livraison arrêté')
    },
  }
}

if (process.argv[1]?.endsWith('mail-worker.ts')) {
  const worker = startWorker(loadMailerConfig())
  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.once(signal, () => {
      void worker.stop().then(() => process.exit(0))
    })
  }
}
```

Dans `package.json`, `scripts` : `"worker": "tsx --env-file-if-exists=.env src/worker/mail-worker.ts"` et `"mail:replay": "node scripts/mail-replay.mjs"`.

Run : `npx vitest run --project integration tests/integration/worker && npm run depcruise`
Attendu : PASS ; aucune violation (le worker n'importe que `shared/config` et `shared/logger`).

- [ ] **Étape 5 : `scripts/mail-replay.mjs`**

```js
// Remet les e-mails `dead` en file (après correction de la cause : SMTP, adresse…).
//   npm run mail:replay              tous les dead
//   npm run mail:replay -- <id> …    seulement ces lignes
import { config as loadEnv } from 'dotenv'
import pg from 'pg'

loadEnv({ quiet: true })
const ids = process.argv.slice(2)
const client = new pg.Client({ connectionString: process.env.MAILER_DATABASE_URL })
await client.connect()
try {
  const { rowCount } = await client.query(
    `UPDATE mail_outbox SET status = 'pending', attempts = 0, next_attempt_at = now(), last_error = NULL
     WHERE status = 'dead' AND ($1::uuid[] IS NULL OR id = ANY($1::uuid[]))`,
    [ids.length > 0 ? ids : null]
  )
  console.log(`${rowCount} e-mail(s) remis en file.`)
} finally {
  await client.end()
}
```

Ajouter au test `tests/integration/worker/mail-worker.test.ts` :

```ts
  it('mail:replay remet les dead en pending', async () => {
    const id = await queue('d@acme.fr', { status: 'dead', attempts: 3 })
    const { execFileSync } = await import('node:child_process')
    execFileSync('node', ['scripts/mail-replay.mjs'], {
      env: { ...process.env, MAILER_DATABASE_URL: TEST_ENV.MAILER_DATABASE_URL },
    })
    expect(await rowOf(id)).toMatchObject({ status: 'pending', attempts: 0 })
  })
```

Run : `npx vitest run --project integration tests/integration/worker`
Attendu : PASS.

- [ ] **Étape 6 : commit**

```bash
git add src/worker src/shared/config.ts scripts/mail-replay.mjs tests docker-compose.yml .github/workflows/tests.yml package.json package-lock.json
git commit -m "feat(refacto): worker de livraison — bail, retry, dead, purge et replay (F15)"
```

---

### Tâche 5 : le worker tourne partout — `make dev`, E2E, CI

**Fichiers :**
- Modifier : `Makefile`, `tests/e2e/global-setup.ts`, `playwright.config.ts`
- Créer : `tests/e2e/decision-email.spec.ts`

- [ ] **Étape 1 : `make dev` lance le web et le worker**

Dans `Makefile`, cible `dev` :

```make
dev: install up migrate ensure-bucket seed ## Tout lancer : Docker, migrations, bucket, seed, puis l'application et le worker de livraison
	trap 'kill 0' EXIT; npm run worker & npm run dev
```

et ajouter une cible :

```make
worker: ## Lance seul le worker de livraison des e-mails (Mailpit : http://localhost:8025)
	npm run worker
```

(ajouter `worker` à `.PHONY`).

- [ ] **Étape 2 : l'E2E démarre le worker**

`tests/e2e/global-setup.ts` : après le vidage du bucket, démarrer le worker et renvoyer la fonction d'arrêt (Playwright l'appelle en fin de run) :

```ts
import { spawn } from 'node:child_process'
```

```ts
  await clearMailpit()
  const worker = spawn('npx', ['tsx', 'src/worker/mail-worker.ts'], {
    env: { ...process.env, ...E2E_ENV, MAIL_POLL_INTERVAL_MS: '200' },
    stdio: 'inherit',
    shell: process.platform === 'win32',
  })
  return async () => {
    worker.kill('SIGTERM')
  }
```

(importer `clearMailpit` depuis `../support/mailpit`, et typer la fonction : `export default async function setupE2e(): Promise<() => Promise<void>>`.)

- [ ] **Étape 3 : écrire l'E2E**

`tests/e2e/decision-email.spec.ts` :

```ts
import { expect, test } from '@playwright/test'
import { createNote, createOrg } from '../support/factories'
import { waitForMail } from '../support/mailpit'
import { closeContexts, loginAs } from './helpers'

test.afterEach(closeContexts)

test("le manager approuve : l'employé reçoit l'e-mail dans Mailpit (F15)", async ({ browser }) => {
  const org = await createOrg()
  await createNote({ user: org.employee, description: 'Note e-mail E2E', amount: 42.5 })
  const page = await loginAs(browser, org.manager)
  await page.goto('/manager')
  const row = page.getByRole('row', { name: /Note e-mail E2E/ })
  await row.getByRole('button', { name: 'Approuver' }).click()
  await expect(row).toHaveCount(0)

  const mail = await waitForMail(org.employee.email)
  expect(mail.Subject).toBe('Votre note de frais a été approuvée')
})
```

Run : `make up && npm run test:e2e`
Attendu : PASS, dont le nouveau scénario.

- [ ] **Étape 4 : commit**

```bash
git add Makefile tests/e2e playwright.config.ts
git commit -m "test(refacto): le worker tourne avec make dev et en E2E, e-mail vérifié dans Mailpit"
```

---

### Tâche 6 : contrat, exploitation et harnais pour l'e-mail

**Fichiers :**
- Créer : `.agents/skills/envoyer-un-email/SKILL.md`, `docs/runbooks/mail-outbox-rejouer.md`
- Modifier : `docs/api/openapi.yaml`, `docs/architecture/conventions.md`, `.agents/skills/ajouter-une-fonctionnalite/SKILL.md`, `AGENTS.md`, `docs/runbooks/dev-environnement-demarrer.md`, `README.md`

- [ ] **Étape 1 : skill `envoyer-un-email`**

````markdown
---
name: envoyer-un-email
description: À utiliser quand une fonctionnalité d'Expense.io doit prévenir quelqu'un par e-mail (décision, rappel, invitation…) — explique où composer l'e-mail, comment l'envoyer dans l'unité de travail, et pourquoi ne jamais toucher au worker.
---

# Envoyer un e-mail

Le cœur décide **à qui** et **quoi** écrire ; le worker de livraison ne fait que livrer ([ADR 0003](../../../docs/adrs/0003-notification-par-outbox-d-e-mails.md)).

## Recette

1. **Composer** l'e-mail dans le module, dans `application/<objet>-email.ts`, sur le modèle de `src/modules/expenses/application/decision-email.ts` : une fonction pure qui renvoie un `Email` (`to`, `subject`, `text`, `correlationId`). Montants avec `Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' })`, dates civiles avec `timeZone: 'UTC'`. Test unitaire du texte.
2. **Trouver le destinataire** par l'API publique d'`iam` (`getContact`), via un port du module appelant.
3. **Envoyer dans l'unité de travail** : `await ctx.mailer.send(email)` dans `uow.run(actor, async (ctx) => …)`, après l'écriture métier. L'e-mail est écrit dans `mail_outbox` dans la même transaction : si l'écriture échoue, l'opération est annulée.
4. **Tester** : unitaire avec `InMemoryMailer` (`uow.mailer.sent`) ; intégration en lisant `mail_outbox` ; E2E avec `waitForMail` (Mailpit).

## Interdits

- Appeler nodemailer ou SMTP depuis un module ou une route.
- Modifier `src/worker/` pour une fonctionnalité : il livre n'importe quel e-mail sans rien savoir du métier.
- Envoyer hors de l'unité de travail (l'e-mail pourrait partir pour une opération annulée, ou se perdre).
````

Run : `npm run agents:sync`

- [ ] **Étape 2 : runbook `docs/runbooks/mail-outbox-rejouer.md`**

À partir du gabarit : composant « worker de livraison, `mail_outbox` » ; quand l'utiliser « log `E-mail abandonné (dead)`, ou SMTP rétabli après une panne » ; diagnostic :

```sh
docker compose exec postgres psql -U expense -d expense_io -c "SELECT status, count(*) FROM mail_outbox GROUP BY status"
docker compose exec postgres psql -U expense -d expense_io -c "SELECT id, recipient, attempts, last_error FROM mail_outbox WHERE status = 'dead'"
```

**Attendu :** la cause dans `last_error`. Procédure : corriger la cause, puis `npm run mail:replay` (**Attendu :** « N e-mail(s) remis en file. »), vérifier dans Mailpit (http://localhost:8025) ou les logs `E-mail envoyé`. Retour arrière : aucun (rejouer ne fait qu'avancer `next_attempt_at`). Note : un doublon est possible si le worker a planté entre l'envoi et le marquage `sent` ; le `Message-ID` (`<id>@expense.io`) permet de le repérer.

- [ ] **Étape 3 : contrat, conventions, AGENTS, README**

- `docs/api/openapi.yaml`, description des quatre opérations de décision : ajouter « L'employé est prévenu par e-mail après coup (outbox, ADR 0003) ; la réponse ne change pas. » Dans `info.description`, section « Interfaces internes », remplacer le paragraphe « Ports » par une description du port `Mailer` et de la table `mail_outbox` (colonnes de la spec), qui est le contrat entre l'application et le worker.
- `docs/architecture/conventions.md`, ligne « un e-mail » : « composer dans le module, envoyer avec `ctx.mailer.send` dans l'unité de travail — skill `envoyer-un-email` ».
- `.agents/skills/ajouter-une-fonctionnalite/SKILL.md`, étape 10 : retirer « (plan 3) ».
- `AGENTS.md`, tableau des skills : ajouter `| envoyer-un-email | une fonctionnalité doit prévenir quelqu'un par e-mail |` ; section Commandes : `make dev` lance aussi le worker ; ajouter `- Mailpit : http://localhost:8025 (e-mails de dev).`
- `docs/runbooks/dev-environnement-demarrer.md` : Mailpit et le worker dans la procédure.
- `README.md` : section de démarrage, mentionner le worker, Mailpit et les nouvelles variables (`MAILER_DATABASE_URL`, `SMTP_*`, `MAIL_FROM`).

Run : `npm run agents:sync && npx vitest run tests/unit/openapi-coverage.test.ts`
Attendu : PASS.

- [ ] **Étape 4 : commit**

```bash
git add .agents .claude/skills docs AGENTS.md README.md
git commit -m "docs(refacto): skill envoyer-un-email, runbook de rejeu et contrat de mail_outbox"
```

---

### Tâche 7 : mesures « après » — SonarQube et benchmark

**Fichiers :**
- Modifier : `docs/audit/sonarqube-avant-apres.md`, `docs/audit/baseline.md`, `bench/k6/endpoints.js` (si besoin)

- [ ] **Étape 1 : SonarQube « après »**

Ajouter à `docs/audit/sonarqube-avant-apres.md` un titre `## Après`, puis :

Run : `make sonar-up && make sonar && npm run --silent sonar:report >> docs/audit/sonarqube-avant-apres.md`
Attendu : le tableau « Après » est ajouté. Ajouter `Commit analysé : <git rev-parse --short HEAD>.`, une capture `docs/audit/sonarqube-apres.png`, puis une section `## Lecture` de trois à cinq lignes qui compare avant et après métrique par métrique (bugs, vulnérabilités, hotspots, code smells, duplication, complexité cognitive, couverture), sans interpréter au-delà des chiffres.

- [ ] **Étape 2 : benchmark « après »**

Suivre « Remplir la colonne « Après » » de `docs/audit/baseline.md` (même machine que la mesure « Avant ») :

```bash
bash bench/run.sh
node bench/report.mjs bench/results/<horodatage> --baseline docs/audit/baseline-results.json
```

Attendu : les tableaux avec les lignes « Avant » et « Après ». Les recopier dans `docs/audit/baseline.md`. Si un cas de `bench/k6/endpoints.js` dépend d'un comportement corrigé (ex. un `?sort=` hors liste blanche), l'adapter pour que la mesure reste équivalente et le noter sous le tableau.

- [ ] **Étape 3 : commit**

```bash
git add docs/audit bench
git commit -m "docs(audit): mesures après la refacto — SonarQube et benchmark"
```

---

### Tâche 8 : répétition du live coding et clôture

**Fichiers :**
- Créer : `docs/runbooks/demo-live-preparer.md`, `docs/audit/repetition-live-coding.md`
- Modifier : `scripts/seed.mjs`, `AGENTS.md` et skills (selon les constats), `docs/README.md`, `docs/specs/2026-10-15-architecture-cible.md` (statut), statut de ce plan

- [ ] **Étape 0 : une entreprise de démo complète dans le seed**

La spec demande une entreprise de démonstration qui montre tous les cas (RH, managers, employés rattachés et non rattachés, notes dans tous les états). Dans `scripts/seed.mjs` :

1. `seedExpenseNote(userId, companyId, description, amount)` prend un cinquième paramètre `status = 'pending'`, ajouté à l'`INSERT` (colonne `status`, valeur `$5`).
2. Dans le bloc `try`, après les notes existantes, ajouter :

```js
  const subManagerId = await upsertUser('chef@expense.io', 'Chef d’équipe', 'chef1234', 'manager', companyId, managerId)
  const teamMemberId = await upsertUser('equipe@expense.io', 'Membre d’équipe', 'equipe1234', 'employee', companyId, subManagerId)
  const looseId = await upsertUser('nouveau@expense.io', 'Nouvel arrivant', 'nouveau1234', 'employee', companyId)
  const secondHrId = await upsertUser('rh2@expense.io', 'Seconde RH', 'rh21234', 'hr_admin', companyId)

  await seedExpenseNote(teamMemberId, companyId, 'Train Lyon (seed)', 87.3)
  await seedExpenseNote(looseId, companyId, 'Matériel de bureau (seed)', 24.99)
  await seedExpenseNote(secondHrId, companyId, 'Salon RH (seed)', 120)
  await seedExpenseNote(employeeId, companyId, 'Hôtel Paris (seed)', 142, 'approved')
  await seedExpenseNote(employeeId, companyId, 'Restaurant (seed)', 64.5, 'rejected')
```

3. Compléter l'affichage final des comptes avec les quatre nouveaux comptes et leur rôle (« Chef d'équipe : manager rattaché », « Nouvel arrivant : sans manager, ses notes vont aux RH », « Seconde RH : valide les notes de la première »).

Run : `make seed && make seed`
Attendu : la seconde exécution ne crée rien (idempotent). Se connecter en `hr@expense.io` : le bandeau « 1 employé sans manager » et, dans la file RH, les notes du manager racine, du nouvel arrivant et de la seconde RH.

- [ ] **Étape 1 : runbook du jour J `docs/runbooks/demo-live-preparer.md`**

À partir du gabarit, criticité **haute**. Procédure :

1. `git clone` frais du dépôt, `cp .env.example .env`, puis `make dev`. **Attendu :** application sur http://localhost:3000, Mailpit sur http://localhost:8025.
2. Comptes de démo (tableau complet dans ce runbook) : `hr@expense.io` / `hr1234` et `rh2@expense.io` / `rh21234` (RH), `manager@expense.io` / `manager1234` (manager racine), `chef@expense.io` / `chef1234` (manager rattaché), `demo@expense.io` / `demo1234` et `equipe@expense.io` / `equipe1234` (employés rattachés), `nouveau@expense.io` / `nouveau1234` (employé sans manager).
3. `npm run verify`. **Attendu :** vert. **Ne pas démarrer la démo si ce n'est pas vert.**
4. Ouvrir l'agent à la racine du dépôt ; vérifier qu'il charge `AGENTS.md` (lui demander « quelle est la recette pour ajouter une fonctionnalité ? » : il doit citer le skill `ajouter-une-fonctionnalite`).
5. Vérifier qu'aucune demande de permission n'apparaît pour `npm run verify` (`.claude/settings.json`).
6. Formuler la demande du jury en une phrase, sans détail d'implémentation ; laisser l'agent suivre le skill ; à la fin, exiger `npm run verify` et le sous-agent `revue-architecture`.

Retour arrière : `git stash -u` ou `git checkout .` pour revenir à l'état propre entre deux essais.

- [ ] **Étape 2 : répétition chronométrée**

Depuis un clone propre, suivre le runbook avec une fonctionnalité du domaine qu'on ne livrera pas : **« un validateur peut indiquer un motif quand il rejette une note ; l'employé le voit dans sa liste et dans l'e-mail »**. Chronométrer.

Consigner dans `docs/audit/repetition-live-coding.md` :

```markdown
# Répétition du live coding — <date>

| | |
|---|---|
| Demande | <la phrase exacte> |
| Outil et modèle | <ex. Claude Code, modèle> |
| Durée jusqu'à `npm run verify` vert | <mm:ss> |
| Interventions humaines | <nombre et nature> |
| Constats de `revue-architecture` | <nombre bloquants / à corriger> |

## Écarts à la recette

- <où l'agent a hésité ou dévié>

## Corrections apportées au harnais

- <modification d'AGENTS.md ou d'un skill, avec le commit>
```

Corriger `AGENTS.md`, `conventions.md` ou les skills pour chaque écart, puis `npm run agents:sync`. **Jeter la fonctionnalité** (`git checkout .` ou suppression de la branche de répétition) ; ne commiter que le compte rendu et les corrections du harnais.

Critère de succès 7 de la spec : la fonctionnalité passe `npm run verify` sans autre intervention qu'une validation finale. Sinon, corriger le harnais et refaire une répétition.

- [ ] **Étape 3 : clôture**

- `docs/specs/2026-10-15-architecture-cible.md` : statut `Implémentée`.
- Ce plan : statut `Terminé`.
- `docs/README.md`, « Où en est-on » : `- **Refacto terminée** : plan 3 (notification par outbox d'e-mails, worker de livraison), mesures après dans [audit/sonarqube-avant-apres.md](audit/sonarqube-avant-apres.md) et [audit/baseline.md](audit/baseline.md), répétition du live coding dans [audit/repetition-live-coding.md](audit/repetition-live-coding.md).` ; retirer de « À venir » ce qui est fait.

Run : `npm run verify && npm run test:e2e && node scripts/agents-sync.mjs --check`
Attendu : tout passe.

```bash
git add docs AGENTS.md .agents .claude scripts/seed.mjs
git commit -m "docs(refacto): seed de démo, répétition du live coding, runbook de démo et clôture"
git push
```

Ouvrir la PR vers `main` ; vérifier que tous les jobs sont verts (dont SonarQube, contrat d'API, E2E avec Mailpit).
