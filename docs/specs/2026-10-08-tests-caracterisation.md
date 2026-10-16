# Tests de caractérisation — design

> Ticket ARLA-9 · branche `louisbert91/arla-9-tests-de-caracterisation` · 08/10/2026 · base : commit `265924b`.

## Objectif

Doter Expense.io d'une suite de tests qui **fige le comportement fonctionnel actuel** de l'application (tests de caractérisation), pour servir de filet de sécurité avant toute correction ou refactoring (par exemple le branchement de la couche hexagonale aujourd'hui morte, cf. audit ARLA-8).

Critères de succès :

1. chaque endpoint de `src/app/api/**` et chaque server action de `src/app/actions/**` est testé sur ses cas nominaux **et** sur une grille d'échecs systématique (auth, identifiants, formats, valeurs limites) ;
2. les parcours utilisateurs critiques sont couverts de bout en bout dans un vrai navigateur ;
3. la suite tourne en local (`make test`, `make coverage`, `make e2e`) et en CI GitHub Actions sur chaque PR ;
4. la couverture du périmètre mesuré atteint au moins 90 % lignes / 85 % branches / 90 % fonctions, et la CI échoue si elle baisse.

## Décisions

| Sujet | Décision | Raison |
|---|---|---|
| Philosophie | **Caractérisation** : les tests figent le comportement actuel, bugs compris | filet de sécurité avant refactoring ; une correction future devient un changement de test assumé |
| Code testé | **Aucune modification de `src/`** | règle de base de la caractérisation ; tout est testable en mockant les frontières de modules |
| Tests fonctionnels | **Vitest**, handlers appelés en mémoire, vrai Postgres + vrai LocalStack | rapide, couverture v8 exacte, la logique métier vit dans le SQL et ne peut pas être testée avec un `pg` mocké |
| Tests E2E | **Playwright**, Chromium, `next build && next start` | couvre ce que Vitest ne peut pas : JWT réel, `proxy.ts`, UI, vrai Tesseract |
| CI | **Complète** : lint + typecheck, Vitest + couverture, Playwright | sans CI, une suite de caractérisation cesse d'être exécutée |
| Tests de composants React | **Non** | les pages ne font presque que des `fetch` ; Playwright les couvre |

Approches écartées : tests HTTP boîte noire contre un serveur lancé (lents, couverture serveur inexploitable) ; Testcontainers (démarrage lent, LocalStack lourd, aucun gain en CI où des services GitHub Actions sont utilisés).

## Conventions

- **`[as-is]`** : tout test qui fige un comportement contraire à une règle attendue (faille, incohérence, absence de validation) a un nom préfixé `[as-is]` et un commentaire qui renvoie au point correspondant de `docs/audit/as-is.md`. Un `grep "\[as-is\]"` liste la dette fonctionnelle connue.
- Les tests figent la réponse **réelle**, y compris une 500 avec `stack` : on vérifie le statut, et le corps quand il est déterministe (message d'erreur, présence de `stack`).
- **Erreurs non interceptées** (constat du prototype de planification) : les handlers qui font `return withUserScope(...)` sans `await` — `GET /api/expense-notes`, `GET /api/manager/expense-notes`, `POST /api/manager/expense-notes/:id/{approve,reject}`, `GET /api/hr/expense-notes`, `POST /api/hr/expense-notes/:id/{approve,reject}` — laissent échapper une erreur SQL : `respondError` n'est pas appelé, la promesse du handler est rejetée. Le test Vitest fige ce rejet (`rejects.toThrow`) ; en E2E, Next renvoie alors une 500 générique sans `{ error, stack }`. Les autres handlers (`await`) renvoient bien la 500 JSON avec `stack`.
- Langue : noms de tests en français, comme le reste du dépôt.

## Outillage et arborescence

Dépendances de dev ajoutées : `vitest`, `@vitest/coverage-v8`, `@playwright/test`. Rien d'autre (l'alias `@/*` est déclaré dans la config Vitest, sans plugin).

```
tests/
  support/                 # partagé par Vitest et Playwright
    env.ts                 # URLs, bases et buckets de test
    db.ts                  # pool de test, garde-fou *_test/*_e2e, TRUNCATE
    infra.ts               # création de base, migrations, bucket S3
    factories.ts           # createCompany / createUser / createNote / createOrg
    fixtures.ts            # PNG de test
  unit/                    # aucune I/O
    ocr.test.ts
    errors.test.ts
    storage.test.ts
    test-db-guard.test.ts
  integration/             # vrai Postgres + vrai LocalStack
    global-setup.ts        # crée expense_io_test, migre, crée le bucket receipts-test
    setup.ts               # mock de session, TRUNCATE entre chaque test, fermeture des pools
    helpers/
      session.ts           # actAs(user) / actAsAnonymous() / actAsGhost()
      http.ts              # construction de Request JSON / multipart / params
      s3.ts                # vérifications d'objets et d'URL présignées
    api/                   # un ou plusieurs fichiers par route
    actions/auth.test.ts
    lib/db.test.ts
    workflow.test.ts
  e2e/
    global-setup.ts        # crée expense_io_e2e, migre, crée le bucket receipts-e2e
    helpers.ts             # login UI, inscription, soumission de note
    *.spec.ts
  fixtures/
    receipt.png            # ticket lisible par Tesseract
    receipt.html           # source du ticket
scripts/
  generate-receipt-fixture.mjs   # capture receipt.html → receipt.png via Playwright
vitest.config.mts          # 2 projects : unit, integration
playwright.config.ts
.github/workflows/tests.yml
```

Scripts npm et cibles make :

| npm | make | Rôle |
|---|---|---|
| `test` | `make test` | unit + intégration |
| `test:unit` | — | unitaires seuls (sans Docker) |
| `test:coverage` | `make coverage` | unit + intégration avec couverture (HTML, lcov, json-summary) |
| `test:e2e` | `make e2e` | Playwright |

Les cibles `make test`, `make coverage` et `make e2e` dépendent de `make up`.

Isolation vis-à-vis du dev : base `expense_io_test` (Vitest), base `expense_io_e2e` (Playwright), buckets `receipts-test` et `receipts-e2e`. Les URL et noms sont fixés dans les configs (surchargeables par variable d'environnement), sans nouveau fichier `.env`. Lancer les tests ne touche jamais aux données de `make dev`.

## Tests d'intégration (Vitest)

### Configuration

- Deux `projects` Vitest : `unit` (environnement node, parallèle) et `integration` (environnement node, `fileParallelism: false` car la base est partagée).
- `integration` : `globalSetup` = `helpers/global-setup.ts`, `setupFiles` pose `DATABASE_URL` / `S3_*` vers les ressources de test **avant** tout import applicatif, et mocke `@/lib/auth`.

### Données

- **Global setup** (une fois) : connexion à la base `expense_io` du docker-compose, `CREATE DATABASE expense_io_test` si absente, migrations via l'API programmatique de `node-pg-migrate` sur `migrations/` (schéma identique à la prod), création du bucket `receipts-test` dans LocalStack si absent.
- **Entre chaque test** : `TRUNCATE expense_notes, users, companies RESTART IDENTITY CASCADE`. `RESTART IDENTITY` remet `receipt_seq` à 1, les clés de reçu sont donc déterministes.
- **Factories** : insertion SQL directe, renvoient les lignes créées.
  - `createCompany({ domain? })` — domaine unique généré par défaut.
  - `createUser({ company, role, manager?, email?, name? })` — hash bcrypt calculé une seule fois au chargement du module.
  - `createNote({ user, status?, amount?, expenseDate?, description?, createdAt?, receiptKey? })`.
- **Sessions** : `@/lib/auth` est mocké (`auth`, `signIn`, `signOut`). `actAs(user, { role? })` fait renvoyer à `auth()` une session `{ user: { id, email, role } }` ; le rôle peut différer de celui en base pour figer le rôle « gelé » dans le JWT. `actAsAnonymous()` fait renvoyer `null`.
- **S3** : LocalStack réel. Après une soumission, on vérifie l'objet (`HeadObject` : existence, `Content-Type`). Pour une URL présignée, on vérifie la clé et `X-Amz-Expires=300`, puis on la télécharge pour s'assurer qu'elle sert bien le fichier.
- **Pannes simulées** : mock partiel de `@/lib/storage` limité au fichier concerné pour faire échouer `uploadReceipt` une fois.
- **OCR** : `tesseract.js` est mocké (`createWorker` renvoie un worker dont `recognize` produit le texte voulu). Le vrai Tesseract n'est exécuté qu'en E2E.
- **Nettoyage** : fermeture de `global.__pgPool` en fin de fichier.

### Tests unitaires

| Fichier | Comportements figés |
|---|---|
| `ocr` | MIME non supporté (PDF…) → `{}` sans créer de worker · montant : ligne à mot-clé (`total`, `montant`, `ttc`, `à payer`, `net à`) prioritaire, maximum des décimaux, séparateurs de milliers (espace, point), virgule décimale, repli sur les entiers uniquement sur une ligne à mot-clé ou `€`/`eur`, aucun montant → `undefined` · date : priorité `jj/mm/aaaa` > `aaaa-mm-jj` > `jj/mm/aa` (→ 20aa) > date textuelle française (accents ignorés), séparateurs `/ . -`, date invalide (31/02) → motif suivant, aucune date → `undefined` · `terminate()` appelé même si `recognize` échoue · échec de `createWorker` → `{}` |
| `errors` | `Error` → 500 `{ error: message, stack }` · valeur non-`Error` → `{ error: String(valeur) }` sans `stack` |
| `storage` | `receiptKeyFor(12, '.png')` → `receipts/12.png` · extension vide |

### Tests d'intégration — comportements métier

**API employé**

| Route | Comportements figés |
|---|---|
| `GET /api/expense-notes` | uniquement les notes de l'appelant, quel que soit son rôle · forme du DTO (`amount` number, `expenseDate` `YYYY-MM-DD`, `createdAt` ISO) · tri par défaut `created_at DESC` · `?sort=amount ASC` respecté · `[as-is]` `?sort=` concaténé : une expression SQL arbitraire est exécutée (audit §4) · `[as-is]` colonne inconnue ou requêtes multiples → erreur non interceptée |
| `POST /api/expense-notes` | 201 : ligne en base (`pending`), objet S3, clé `receipts/<seq><ext>` pour PNG/JPEG/WebP/PDF · 400 par champ invalide (messages exacts) · `[as-is]` `expenseDate` non validée côté app → 500 si Postgres la refuse · `[as-is]` panne S3 → note orpheline en base avec `receipt_key = ''` et 500 (audit §5) |
| `GET /api/expense-notes/:id/receipt-url` | URL valide pour sa propre note · 404 pour la note d'un autre ou une note inexistante |
| `POST /api/expense-notes/receipt-suggestion` | 400 sans fichier · la suggestion OCR est renvoyée telle quelle · PDF → `{}` |

**API manager et RH**

| Route | Comportements figés |
|---|---|
| `GET /api/manager/expense-notes` | uniquement les notes `pending` des rattachés **directs**, tri `created_at ASC` · exclut ses propres notes, les notes décidées, celles des rattachés d'autres managers |
| `POST /api/manager/expense-notes/:id/{approve,reject}` | transition vers `approved` / `rejected` et DTO renvoyé · 404 si la note n'est pas celle d'un rattaché · 409 si déjà décidée |
| `GET /api/manager/expense-notes/:id/receipt-url` | `[as-is]` n'importe quel manager obtient le reçu de n'importe quelle note, même d'une autre entreprise (audit §3) |
| `GET /api/hr/expense-notes` | uniquement les notes `pending` des managers racine (`manager_id IS NULL`) de la même entreprise, tri ASC · exclut employés, managers rattachés, autres entreprises |
| `POST /api/hr/expense-notes/:id/{approve,reject}` | mêmes filtres que la liste · 404 / 409 comme côté manager |
| `GET /api/hr/expense-notes/:id/receipt-url` | mêmes filtres · 404 hors périmètre |
| `GET /api/hr/users` | employés et managers de l'entreprise triés par nom · exclut les `hr_admin` et les autres entreprises · DTO avec `managerId` |
| `PUT /api/hr/users/:id/manager` | rattachement et détachement (`managerId: null`) · 404 si la cible est hors entreprise ou `hr_admin` · 404 si l'utilisateur RH de la session n'existe plus · 409 pour auto-rattachement ou cible non-manager · `[as-is]` manager d'une autre entreprise accepté (audit §3) · `[as-is]` corps JSON invalide ou absent → détachement silencieux · `[as-is]` cycle A↔B entre managers accepté · un manager rattaché cesse d'être « racine » et disparaît de la file RH |

**Transverse**

| Fichier | Comportements figés |
|---|---|
| `actions/auth` | `signup` : validations (nom vide, email invalide, mot de passe < 8) · 1er inscrit d'un domaine → entreprise créée (nom = 1er label du domaine) et rôle `hr_admin` · inscrits suivants → `employee` dans la même entreprise, `manager_id` nul · domaine mis en minuscules, email stocké tel quel · email en doublon → message · `signIn` appelé avec `redirectTo: '/expenses'` · `signIn` lève `AuthError` → compte créé quand même avec un message · autre erreur → relancée · `login` : champs non-string, `AuthError` → message, succès → `{}` · `logout` → `signOut({ redirectTo: '/login' })` |
| `lib/db` | `withUserScope` : commit en cas de succès, rollback en cas d'erreur, `app.current_user_id` visible dans la transaction et absent ensuite sur le même client |
| `workflow` | `[as-is]` un employé sans manager et un `hr_admin` n'ont aucun valideur : leur note n'apparaît dans aucune file (audit, circuit de validation) · `[as-is]` le rôle de la session prévaut sur le rôle en base (audit §5) · `[as-is]` l'utilisateur de connexion `expense` est superutilisateur (`rolsuper = true`), comme pour l'application : une requête via `withUserScope` sous l'identité d'un utilisateur sans lien avec une note la voit quand même, la RLS est contournée (audit §1) |

### Grille d'échecs systématique

Appliquée à **chaque** endpoint pour les axes qui le concernent, sous forme de tests paramétrés (`it.each`). Chaque ligne fige la réponse réelle.

| Axe | Cas |
|---|---|
| Authentification | anonyme · chacun des autres rôles (`[as-is]` 401 côté manager, 403 côté RH, audit §3) · utilisateur de la session supprimé en base |
| Identifiant `:id` | non-UUID (`abc`, `1`, `' OR 1=1 --`) · UUID inconnu · ressource d'un autre utilisateur · ressource d'une autre entreprise |
| Format du corps | corps vide · JSON au lieu de multipart et inversement · JSON malformé · `Content-Type` absent ou incohérent |
| Champs | absent · vide · espaces seuls · mauvais type (fichier à la place d'un texte, texte à la place d'un fichier) · très long (10 000 caractères) |
| Montant | `abc` · `0` · `-5` · `-0` · `Infinity` · `1e3` · `"  12  "` · `0.001` (arrondi Postgres) · `[as-is]` `12,50` → `parseFloat` donne 12 · `1e12` (dépassement `numeric(10,2)` → 500) |
| Date | `2026-13-45` · `31/02/2026` · `08/10/2026` (interprétation selon `DateStyle`) · texte libre · date future (acceptée) |
| Fichier | absent · 0 octet · exactement 10 Mo (accepté) · 10 Mo + 1 octet · MIME interdit · `[as-is]` contenu texte déclaré `image/png` (accepté) |
| État | note déjà approuvée / rejetée (409) · deux décisions consécutives |

Estimation : environ 200 tests Vitest.

## Tests E2E (Playwright)

### Configuration

- `webServer` : `next build && next start -p 3100`, en local comme en CI, avec `DATABASE_URL` → `expense_io_e2e` et `S3_BUCKET=receipts-e2e`. Aucun conflit avec `make dev` (port 3000, base `expense_io`).
- `globalSetup` : création de `expense_io_e2e` si absente, migrations, `TRUNCATE`, bucket `receipts-e2e`.
- Projet unique Chromium. Trace au premier retry, capture d'écran en cas d'échec, rapport HTML. 1 retry en CI, 0 en local.
- Sélecteurs : `getByRole`, `getByLabel`, `getByText` uniquement (pas de `data-testid`, `src/` n'étant pas modifié).

### Données

Chaque test crée sa propre entreprise (domaine unique `e2e-<id>.test`) et ses comptes via une fixture d'accès direct à la base, avec un mot de passe connu. Les tests sont indépendants et parallélisables. Le rôle `manager` est posé en base, l'UI ne permettant pas de l'attribuer.

### Specs

| Spec | Parcours |
|---|---|
| `auth` | 1er inscrit d'un domaine → arrive sur `/expenses` avec la navigation RH · 2e inscrit → navigation employé · mauvais mot de passe → message d'erreur · logout → `/login` · `/expenses`, `/manager`, `/hr` en anonyme → redirection `/login` · `[as-is]` ce qu'affichent `/manager` et `/hr` pour un employé connecté |
| `expense-submission` | saisie + reçu → note `pending` dans la liste · ouverture du reçu (URL présignée) · erreurs de validation affichées |
| `ocr-suggestion` | vrai Tesseract sur `tests/fixtures/receipt.png` → montant et date pré-remplis |
| `approval-workflow` | l'employé soumet → le manager voit la note, ouvre le reçu, approuve → l'employé voit `approved` · même parcours avec rejet · la RH valide la note d'un manager racine |
| `hr-admin` | la RH rattache un employé à un manager → le manager voit désormais ses notes |
| `api-auth` | JWT réel sur chaque endpoint : sans cookie, cookie falsifié, cookie d'un rôle insuffisant · méthode HTTP non exportée → 405 · `[as-is]` erreur non interceptée → 500 générique sans `stack`, erreur interceptée → 500 JSON avec `stack` |

`tests/fixtures/receipt.png` est généré par `scripts/generate-receipt-fixture.mjs`, qui capture `receipt.html` (ticket avec `TOTAL TTC` et une date) via Playwright. L'image est commitée ; le script ne sert qu'à la régénérer.

Estimation : environ 25 tests E2E.

## CI — `.github/workflows/tests.yml`

- Déclencheurs : `pull_request` vers `main`, `push` sur `main`. `concurrency` par branche avec annulation du run en cours.
- Node 24, `npm ci` avec cache npm.
- Services des jobs `vitest` et `e2e` : `postgres:16-alpine` (utilisateur, mot de passe et base identiques au docker-compose, port 5433) et `localstack/localstack:3.8.1` (`SERVICES=s3`, port 4567), avec healthchecks.

| Job | Étapes | Artefacts |
|---|---|---|
| `checks` | `npm run lint` · `npm run typecheck` | — |
| `vitest` | `npm run test:coverage` · tableau de couverture écrit dans `$GITHUB_STEP_SUMMARY` par un script maison lisant `coverage-summary.json` | `coverage/` (HTML + lcov) |
| `e2e` | cache des navigateurs Playwright · `npx playwright install --with-deps chromium` · `npm run test:e2e` | `playwright-report/` toujours · `test-results/` (traces, captures) en cas d'échec |

Hors périmètre de ce ticket, à faire par un administrateur du dépôt : rendre les trois jobs obligatoires dans la protection de branche de `main`.

## Couverture

- Provider v8, rapports `text`, `html`, `lcov`, `json-summary`.
- **Périmètre mesuré** : `src/app/api/**`, `src/app/actions/**`, `src/lib/{db,errors,ocr,storage}.ts`.
- **Exclusions**, justifiées en commentaire dans `vitest.config.mts` :
  - `src/domain`, `src/ports`, `src/adapters`, `src/utils` — code mort (audit §2) ;
  - `src/lib/auth.ts`, `src/proxy.ts`, `src/app/api/auth/**` — mockés dans Vitest, couverts par Playwright ;
  - `src/app/**/page.tsx`, `src/app/layout.tsx`, `src/components/**` — couverts par Playwright ;
  - `src/types/**`.
- **Seuils** : lignes ≥ 90 %, branches ≥ 85 %, fonctions ≥ 90 %. Une fois la suite écrite, ils sont remontés à la valeur mesurée arrondie à l'entier inférieur (cliquet) : la CI échoue si la couverture baisse.

## Documentation

Section « Tests » ajoutée au README : prérequis (Docker), commandes, bases et buckets dédiés, convention `[as-is]`, régénération de la fixture de reçu.

## Risques

| Risque | Parade |
|---|---|
| `next-auth` (bêta) refuse de se charger hors de Next quand `actions/auth.ts` importe `AuthError` | **confirmé par le prototype** (`import 'next/server'` sans extension, `ERR_MODULE_NOT_FOUND`) et **résolu** par `server.deps.inline: ['next-auth']` dans le projet Vitest `integration` |
| `next/server` / `NextRequest` indisponibles dans Vitest | les handlers acceptent une `Request` standard ; `NextRequest` n'est utilisé que comme type |
| Sortie OCR de Tesseract instable selon la plateforme | ticket fixture à fort contraste, gros caractères ; assertions sur montant et date uniquement |
| `next build` lent en CI | cache `.next/cache` dans le job `e2e` |
| Interprétation des dates `jj/mm/aaaa` dépendante du `DateStyle` Postgres | figée telle qu'observée avec l'image `postgres:16-alpine` par défaut (identique en local et en CI) |

## Hors périmètre

- Toute correction des comportements `[as-is]` (tickets ultérieurs).
- Tests de composants React, tests multi-navigateurs, tests de charge.
- Modification de `src/`.
- Configuration de la protection de branche GitHub.
