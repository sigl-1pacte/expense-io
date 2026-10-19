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
