# Expense.io

Application de gestion de notes de frais.

## Prérequis

- Node.js 24+
- Docker (Postgres + LocalStack en local)

## Démarrage

```bash
make dev
```

Ceci installe les dépendances, démarre Postgres et LocalStack, applique les
migrations, crée le bucket de stockage, peuple des comptes de démonstration
(voir "Comptes" plus bas), puis lance le serveur de développement sur
http://localhost:3000.

Sans `make`, l'équivalent manuel :

```bash
npm install
cp .env.example .env
docker compose up -d
npm run migrate:up
npm run ensure-bucket
npm run seed
npm run dev
```

## Comptes

`make dev` (ou `npm run seed`) crée trois comptes de la même entreprise,
avec chacun une note de frais en attente pour les deux derniers —
relançable sans dupliquer quoi que ce soit :

| Rôle | Email | Mot de passe |
|---|---|---|
| RH | `hr@expense.io` | `hr1234` |
| Manager (racine, sans manager assigné) | `manager@expense.io` | `manager1234` |
| Employé (rattaché au manager ci-dessus) | `demo@expense.io` | `demo1234` |

Tu peux aussi créer d'autres comptes via `/signup` : le premier compte créé
sur un domaine email donné fonde une nouvelle entreprise et en devient RH ;
les comptes suivants sur le même domaine la rejoignent comme employés. Le
rôle `manager` n'est en revanche jamais assignable depuis l'interface —
seulement via le script de seed ou directement en base.

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

## Variables d'environnement

Voir `.env.example`.

## Autres commandes

```bash
make build   # build de production
make start   # build puis démarre en production
make lint
make typecheck
make down    # arrête Postgres/LocalStack
make clean   # arrête et supprime les données locales
```
