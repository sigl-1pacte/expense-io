# Runbook — environnement de dev : démarrer

| | |
|---|---|
| **Composant** | Postgres, LocalStack, Mailpit, application Next.js, worker de livraison |
| **Responsable** | axe Asynchrone & run |
| **Dernière vérification** | 2026-10-16 |
| **Criticité** | Moyenne |

## Objectif

Démarrer l'application en local avec des données de démonstration, en une commande.

## Prérequis

- Docker, Node 24, `make` (Git Bash sous Windows).
- Un `.env` créé avant le 16/10/2026 doit reprendre `MIGRATION_DATABASE_URL` et le nouveau `DATABASE_URL` de `.env.example`.
- Un `.env` existant doit aussi reprendre `MAILER_DATABASE_URL`, `SMTP_HOST`, `SMTP_PORT` et `MAIL_FROM` de `.env.example` : sans eux le worker de livraison s'arrête au démarrage et aucun e-mail n'arrive.
- `MIGRATION_DATABASE_URL` doit désigner un superutilisateur (ou un rôle `BYPASSRLS`) : `expense_notes` est en `FORCE ROW LEVEL SECURITY`, donc le seed et les migrations ne passent pas avec un rôle soumis à la RLS. `DATABASE_URL`, lui, doit rester `expense_app` ; l'application avertit au premier accès si ce n'est pas le cas.

## Procédure

1. Tout lancer :
   ```sh
   make dev
   ```
   **Attendu :** l'application répond sur http://localhost:3000 ; Mailpit (http://localhost:8025) reçoit les e-mails de décision, livrés par le worker lancé en même temps (`make worker` pour le lancer seul).
2. Se connecter avec un compte du seed (`hr@expense.io` / `hr1234`, `manager@expense.io` / `manager1234`, `demo@expense.io` / `demo1234`).

Pour rejouer des e-mails en échec : [mail-outbox-rejouer](mail-outbox-rejouer.md).

## Vérification finale

```sh
npm run verify
```
**Attendu :** lint, typecheck, règles de dépendance et Vitest passent.

## Retour arrière

`make clean` arrête Docker et efface les données locales.
