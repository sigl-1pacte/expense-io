# Runbook — environnement de dev : démarrer

| | |
|---|---|
| **Composant** | Postgres, LocalStack, application Next.js |
| **Responsable** | axe Asynchrone & run |
| **Dernière vérification** | 2026-10-16 |
| **Criticité** | Moyenne |

## Objectif

Démarrer l'application en local avec des données de démonstration, en une commande.

## Prérequis

- Docker, Node 24, `make` (Git Bash sous Windows).

## Procédure

1. Tout lancer :
   ```sh
   make dev
   ```
   **Attendu :** l'application répond sur http://localhost:3000.
2. Se connecter avec un compte du seed (`hr@expense.io` / `hr1234`, `manager@expense.io` / `manager1234`, `demo@expense.io` / `demo1234`).

## Vérification finale

```sh
npm run verify
```
**Attendu :** lint, typecheck, règles de dépendance et Vitest passent.

## Retour arrière

`make clean` arrête Docker et efface les données locales.
