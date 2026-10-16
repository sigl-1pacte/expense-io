# Architecture cible · plan 1 : socle et harnais agent — plan d'implémentation

> **Pour les agents :** SOUS-SKILL REQUIS : utiliser `superpowers:subagent-driven-development` (recommandé) ou `superpowers:executing-plans` pour exécuter ce plan tâche par tâche. Les étapes utilisent la syntaxe case à cocher (`- [ ]`).

| | |
|---|---|
| **Statut** | Brouillon |
| **Spec** | [2026-10-15-architecture-cible](../specs/2026-10-15-architecture-cible.md) |
| **Auteur(s)** | Louis Bertrand (avec Claude Code) |
| **Créé** | 2026-10-16 |

**Objectif :** poser tout ce qui ne dépend pas des modules : SonarQube (run « avant »), le contrat d'API vérifié, le harnais agent, les erreurs RFC 9457, le rôle Postgres non superutilisateur avec une RLS d'isolation par entreprise, et les correctifs F1, F3, F16, F25–F27, F34, F41–F44.

**Architecture :** les routes restent à leur place et gardent leur SQL. On ajoute `src/shared/` (config, erreurs, problem, logger, http) que toutes les routes utilisent via un enrobage `route(...)`. La base passe sur le rôle `expense_app` ; la RLS ne fait plus que l'isolation entre entreprises, grâce à `expense_notes.company_id`. Le harnais agent (`AGENTS.md`, skills, `docs/` par type) est posé dès maintenant pour que les plans 2 et 3 en profitent.

**Stack :** Next.js 16 (route handlers), TypeScript, PostgreSQL 16 + node-pg-migrate, Vitest 5, Playwright, GitHub Actions, SonarQube Community, dependency-cruiser, oasdiff.

**Spec :** [`docs/specs/2026-10-15-architecture-cible.md`](../specs/2026-10-15-architecture-cible.md). Lire aussi le schéma [`docs/architecture/architecture-cible.html`](../architecture/architecture-cible.html).

## Contraintes globales

Reprises de la spec ; elles s'appliquent à chaque tâche.

- Le contrat d'API est inchangé, **sauf les réponses d'erreur** listées dans la spec (section « Contrat d'API »). Toute réponse en succès garde exactement son corps et son code.
- La suite ARLA-9 reste verte à chaque commit. Seuls les tests `[as-is]` du périmètre changent ; un test qui bascule perd son étiquette `[as-is]`.
- Les réponses d'erreur gardent le champ `error` avec son texte actuel, et ajoutent `type`, `title`, `status`, `detail` (`application/problem+json`).
- Une réponse 500 ne contient jamais de stack ni de message interne.
- Documentation et messages de commit en français ; commits `type(refacto): description` (Conventional Commits).
- Aucun `BYPASSRLS`, aucun superutilisateur côté application.
- `docs/api/openapi.yaml` est mis à jour dans le même commit que tout changement de réponse d'erreur.
- Node 24, `npm` (pas de yarn/pnpm), pas de nouvelle dépendance de production hors celles nommées dans ce plan.

## Points de vigilance (review focus)

Cas que la spec implique, mais qu'aucune tâche ne teste naturellement ; chacun reçoit un test dans la tâche indiquée.

1. **La RLS rend des listes vides au lieu d'échouer.** Une requête faite sans portée (`getPool()` direct) sous `expense_app` ne voit aucune ligne : `GET /api/hr/users` renverrait `[]` sans erreur. → Tâche 11 : test « l'annuaire RH liste bien les employés de l'entreprise sous `expense_app` ».
2. **Corps sans `Content-Length` plus gros que la limite** (envoi en flux). → Tâche 8 : test de `readBodyWithLimit` avec un flux de 2 Mo pour une limite d'1 Mo, sans en-tête de longueur.
3. **Session d'un utilisateur supprimé** : doit donner `401`, jamais `500` ni `404`. → Tâche 11 : tests « fantôme » mis à jour route par route.
4. **`?sort=` avec casse ou espaces inhabituels** (`AMOUNT   asc`, ` expense_date `). → Tâche 13 : cas dans le test de `parseNoteSort`.
5. **Fuite de portée entre connexions du pool** : `app.current_company_id` ne doit pas survivre à la transaction. → Tâche 11 : test sur la connexion rendue au pool.

## Structure des fichiers

| Fichier | Action | Responsabilité |
|---|---|---|
| `docker-compose.yml` | Modifier | service `sonarqube` (profil `quality`) |
| `sonar-project.properties` | Créer | configuration de l'analyse |
| `scripts/sonar-bootstrap.mjs` | Créer | prépare un SonarQube neuf (mot de passe, projet, jeton) |
| `scripts/sonar-report.mjs` | Créer | attend la fin de l'analyse, publie gate et métriques |
| `docs/audit/sonarqube-avant-apres.md` | Créer | mesures avant / après |
| `.dependency-cruiser.cjs` | Créer | règles de dépendance (avertissement dans ce plan) |
| `tests/unit/openapi-coverage.test.ts` | Créer | chaque route du code est décrite dans l'OpenAPI, et inversement |
| `AGENTS.md`, `CLAUDE.md`, `AGENTS.local.example.md`, `CONTRIBUTING.md` | Créer | instructions agents et conventions |
| `docs/{specs,plans,adrs,runbooks}/README.md` et `*-template.md` | Créer | structure de la doc |
| `docs/adrs/0001…0004-*.md` | Créer | décisions transverses |
| `docs/runbooks/*.md` | Créer | procédures |
| `.agents/skills/{utiliser-la-doc,verifier-avant-de-livrer}/SKILL.md` | Créer | skills du projet |
| `scripts/agents-sync.mjs` | Créer | copie `.agents/skills` → `.claude/skills`, mode `--check` |
| `.claude/settings.json` | Créer | permissions pré-accordées pour la démo |
| `src/shared/config.ts` | Créer | variables d'environnement validées |
| `src/shared/errors.ts` | Créer | erreurs applicatives typées |
| `src/shared/problem.ts` | Créer | traduction en `application/problem+json` |
| `src/shared/logger.ts` | Créer | logs JSON |
| `src/shared/http.ts` | Créer | `route()`, garde de session et de rôle, lecture bornée du corps, `parseUuid` |
| `src/lib/errors.ts` | Supprimer | remplacé par `shared/problem` |
| `src/lib/note-sort.ts` | Créer | liste blanche de `?sort=` |
| `src/lib/db.ts` | Modifier | portée utilisateur + entreprise, acteur introuvable → 401 |
| `src/lib/auth.ts`, `src/app/actions/auth.ts` | Modifier | secret depuis la config, fonctions SQL `SECURITY DEFINER` |
| `src/app/api/**/route.ts` | Modifier | enrobage `route()`, gardes, portée |
| `migrations/1760600000000_rls-isolation.sql` | Créer | rôle `expense_app`, schéma `app`, `company_id`, policies |
| `migrations/1760600000001_index.sql` | Créer | index F16 |
| `tests/support/env.ts`, `tests/support/db.ts`, `tests/support/factories.ts`, `tests/support/infra.ts` | Modifier | URL propriétaire vs URL applicative, `company_id` |
| `.github/workflows/tests.yml` | Modifier | jobs `sonarqube`, `contrat`, `agents-sync`, `depcruise` |
| `package.json`, `Makefile`, `.env.example`, `.gitignore` | Modifier | scripts et variables |

---

### Tâche 0 : préparer la branche

La branche locale `louisbert91/refacto-architecture-cible` contient ARLA-9 (jamais poussée) et le déplacement des docs. `main` contient la base de connaissance et la spec.

**Fichiers :** aucun fichier de code.

- [ ] **Étape 1 : vérifier l'état local**

Run : `git status --short && git log --oneline -3`
Attendu : branche `louisbert91/refacto-architecture-cible`, éventuellement des fichiers non suivis dans `docs/architecture/` et `docs/audit/`.

- [ ] **Étape 2 : écarter les copies locales non suivies déjà présentes sur `main`**

Pour chaque fichier non suivi de `docs/architecture/` et `docs/audit/`, comparer avec `main` puis le supprimer s'il est identique :

```bash
git fetch origin
for f in docs/architecture/choix-archi.html docs/architecture/option-c.html docs/architecture/options-refacto.md docs/audit/as-is.md docs/audit/as-is.excalidraw; do
  if [ -f "$f" ] && ! git ls-files --error-unmatch "$f" >/dev/null 2>&1; then
    git show "origin/main:$f" | cmp -s - "$f" && rm "$f" && echo "supprimé (identique à main) : $f" || echo "DIFFÉRENT, à garder et signaler : $f"
  fi
done
```

Attendu : chaque fichier est « supprimé ». Si un fichier est « DIFFÉRENT », s'arrêter et demander à l'utilisateur.

- [ ] **Étape 3 : fusionner `main`**

Run : `git merge origin/main -m "chore(refacto): fusionne main (base de connaissance et spec)"`
Attendu : fusion sans conflit. En cas de conflit sur `docs/specs/2026-10-15-architecture-cible.md` ou `docs/architecture/architecture-cible.html`, garder la version de `origin/main` (`git checkout --theirs <fichier>`), puis `git add` et `git commit`.

- [ ] **Étape 4 : vérifier que la base est verte**

Run : `make up && npm run lint && npm run typecheck && npm test`
Attendu : tout passe (c'est la base ARLA-9).

- [ ] **Étape 5 : pousser**

```bash
git push -u origin louisbert91/arla-9-tests-de-caracterisation
git push -u origin louisbert91/refacto-architecture-cible
```

---

### Tâche 1 : SonarQube, en local et en CI, et run « avant »

Première tâche de code, avant toute modification de `src/`, pour mesurer la base intacte (spec, section SonarQube).

**Fichiers :**
- Modifier : `docker-compose.yml`, `Makefile`, `package.json`, `.env.example`, `.gitignore`, `.github/workflows/tests.yml`
- Créer : `sonar-project.properties`, `scripts/sonar-bootstrap.mjs`, `scripts/sonar-report.mjs`, `docs/audit/sonarqube-avant-apres.md`, `docs/runbooks/sonarqube-analyse.md`

**Interfaces :**
- Produit : `npm run sonar` (analyse avec `SONAR_HOST_URL` et `SONAR_TOKEN`), `node scripts/sonar-bootstrap.mjs` (écrit un jeton sur stdout), `node scripts/sonar-report.mjs` (Markdown sur stdout, JSON dans `sonar-report.json`), cibles `make sonar-up`, `make sonar`, `make sonar-down`.

- [ ] **Étape 1 : installer le scanner**

Run : `npm install -D @sonar/scan`
Attendu : `@sonar/scan` dans `devDependencies`.

- [ ] **Étape 2 : déclarer le service dans `docker-compose.yml`**

Ajouter sous `services:` (après `localstack`) :

```yaml
  sonarqube:
    # Analyse de qualité, à la demande : `make sonar-up`. Hors du `up` habituel.
    image: sonarqube:community
    profiles: [quality]
    environment:
      # Elasticsearch embarqué : sans ça, il exige vm.max_map_count=262144 sur l'hôte.
      SONAR_ES_BOOTSTRAP_CHECKS_DISABLE: 'true'
    ports:
      - '9000:9000'
    volumes:
      - sonarqube-data:/opt/sonarqube/data
```

et sous `volumes:` : `  sonarqube-data:`.

- [ ] **Étape 3 : créer `sonar-project.properties`**

```properties
sonar.projectKey=expense-io
sonar.projectName=Expense.io
sonar.sourceEncoding=UTF-8
# Seul src/ est du code applicatif : tessdata, migrations et scripts sont hors analyse.
sonar.sources=src
sonar.exclusions=**/*.d.ts
sonar.tests=tests
sonar.test.inclusions=tests/**/*.ts
# Produit par `npm run test:coverage`.
sonar.javascript.lcov.reportPaths=coverage/lcov.info
```

- [ ] **Étape 4 : créer `scripts/sonar-bootstrap.mjs`**

```js
// Prépare un SonarQube neuf pour une analyse : mot de passe administrateur,
// projet `expense-io`, jeton d'analyse. Écrit le jeton (et rien d'autre) sur
// stdout. Idempotent : relançable sur un serveur déjà préparé.
//
//   SONAR_HOST_URL      (défaut http://localhost:9000)
//   SONAR_ADMIN_PASSWORD  mot de passe à poser sur le compte admin (obligatoire)
const host = process.env.SONAR_HOST_URL ?? 'http://localhost:9000'
const newPassword = process.env.SONAR_ADMIN_PASSWORD
const projectKey = 'expense-io'

if (!newPassword) {
  console.error('SONAR_ADMIN_PASSWORD est requis.')
  process.exit(1)
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function waitUntilUp() {
  for (let attempt = 0; attempt < 120; attempt++) {
    try {
      const response = await fetch(`${host}/api/system/status`)
      if (response.ok && (await response.json()).status === 'UP') return
    } catch {
      // serveur pas encore à l'écoute
    }
    await sleep(2000)
  }
  throw new Error(`SonarQube n'est pas UP après 4 minutes (${host}).`)
}

async function api(path, password, params = {}, method = 'POST') {
  const url = new URL(path, host)
  const body = new URLSearchParams(params)
  const response = await fetch(method === 'GET' ? `${url}?${body}` : url, {
    method,
    headers: { authorization: `Basic ${Buffer.from(`admin:${password}`).toString('base64')}` },
    body: method === 'GET' ? undefined : body,
  })
  return response
}

await waitUntilUp()

// 1. Mot de passe : on tente l'ancien (admin) une seule fois.
let password = newPassword
const probe = await api('/api/authentication/validate', newPassword, {}, 'GET')
if (!(await probe.json()).valid) {
  const changed = await api('/api/users/change_password', 'admin', {
    login: 'admin',
    previousPassword: 'admin',
    password: newPassword,
  })
  if (!changed.ok) throw new Error(`Changement du mot de passe admin refusé (${changed.status}).`)
}

// 2. Projet.
const search = await api('/api/projects/search', password, { projects: projectKey }, 'GET')
if ((await search.json()).components.length === 0) {
  const created = await api('/api/projects/create', password, { project: projectKey, name: 'Expense.io' })
  if (!created.ok) throw new Error(`Création du projet refusée (${created.status}).`)
}

// 3. Jeton d'analyse, nom unique.
const token = await api('/api/user_tokens/generate', password, {
  name: `analyse-${Date.now()}`,
  type: 'GLOBAL_ANALYSIS_TOKEN',
})
if (!token.ok) throw new Error(`Génération du jeton refusée (${token.status}).`)
process.stdout.write((await token.json()).token)
```

- [ ] **Étape 5 : créer `scripts/sonar-report.mjs`**

```js
// Après `npm run sonar` : attend que SonarQube ait traité l'analyse, puis
// écrit le statut du quality gate et les métriques clés.
//   - Markdown sur stdout (résumé du job CI, ou docs/audit) ;
//   - JSON complet dans sonar-report.json (artefact).
// Ne fait jamais échouer le job sur le quality gate (spec : gate publié, non bloquant).
import { readFile, writeFile } from 'node:fs/promises'

const host = process.env.SONAR_HOST_URL ?? 'http://localhost:9000'
const token = process.env.SONAR_TOKEN
if (!token) {
  console.error('SONAR_TOKEN est requis.')
  process.exit(1)
}
const headers = { authorization: `Basic ${Buffer.from(`${token}:`).toString('base64')}` }
const get = async (path) => {
  const response = await fetch(new URL(path, host), { headers })
  if (!response.ok) throw new Error(`${path} → ${response.status}`)
  return response.json()
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const reportTask = await readFile('.scannerwork/report-task.txt', 'utf8')
const ceTaskId = /ceTaskId=(.+)/.exec(reportTask)?.[1]
if (!ceTaskId) throw new Error('ceTaskId introuvable dans .scannerwork/report-task.txt')

for (let attempt = 0; ; attempt++) {
  const { task } = await get(`/api/ce/task?id=${ceTaskId}`)
  if (task.status === 'SUCCESS') break
  if (task.status === 'FAILED' || task.status === 'CANCELED') throw new Error(`Analyse ${task.status}`)
  if (attempt > 90) throw new Error('Analyse non terminée après 3 minutes.')
  await sleep(2000)
}

const METRICS = [
  ['bugs', 'Bugs'],
  ['vulnerabilities', 'Vulnérabilités'],
  ['security_hotspots', 'Security hotspots'],
  ['code_smells', 'Code smells'],
  ['duplicated_lines_density', 'Duplication (%)'],
  ['cognitive_complexity', 'Complexité cognitive'],
  ['coverage', 'Couverture (%)'],
  ['ncloc', 'Lignes de code'],
]
const gate = await get('/api/qualitygates/project_status?projectKey=expense-io')
const measures = await get(
  `/api/measures/component?component=expense-io&metricKeys=${METRICS.map(([key]) => key).join(',')}`
)
const valueOf = (key) => measures.component.measures.find((m) => m.metric === key)?.value ?? '—'

await writeFile('sonar-report.json', JSON.stringify({ gate, measures }, null, 2))
console.log(
  [
    `### SonarQube — ${new Date().toISOString().slice(0, 10)} — quality gate : ${gate.projectStatus.status}`,
    '',
    '| Métrique | Valeur |',
    '|---|---|',
    ...METRICS.map(([key, label]) => `| ${label} | ${valueOf(key)} |`),
  ].join('\n')
)
```

- [ ] **Étape 6 : scripts npm, Makefile, variables**

Dans `package.json`, section `scripts`, ajouter :

```json
"sonar": "sonar",
"sonar:bootstrap": "node scripts/sonar-bootstrap.mjs",
"sonar:report": "node scripts/sonar-report.mjs"
```

(`sonar` est l'exécutable fourni par `@sonar/scan` ; il lit `sonar-project.properties`, `SONAR_HOST_URL` et `SONAR_TOKEN`.)

Dans `Makefile`, ajouter `sonar-up sonar sonar-down` à la ligne `.PHONY` puis :

```make
sonar-up: ## Démarre SonarQube (http://localhost:9000) — voir docs/runbooks/sonarqube-analyse.md
	$(COMPOSE) --profile quality up -d sonarqube

sonar: up ## Couverture Vitest puis analyse SonarQube et rapport (SONAR_TOKEN requis)
	npm run test:coverage
	npm run sonar
	npm run sonar:report

sonar-down: ## Arrête SonarQube (conserve ses données)
	$(COMPOSE) --profile quality stop sonarqube
```

Dans `.env.example`, ajouter à la fin :

```bash
# SonarQube local (make sonar-up). Jeton : docs/runbooks/sonarqube-analyse.md
SONAR_HOST_URL=http://localhost:9000
SONAR_TOKEN=
```

Dans `.gitignore`, ajouter :

```
# SonarQube
.scannerwork/
sonar-report.json
```

- [ ] **Étape 7 : job CI `sonarqube`**

Dans `.github/workflows/tests.yml`, ajouter à la fin du job `vitest` (après l'upload `coverage`) rien de plus ; ajouter un nouveau job :

```yaml
  sonarqube:
    name: SonarQube (analyse obligatoire, gate non bloquant)
    runs-on: ubuntu-latest
    needs: vitest
    services:
      sonarqube:
        image: sonarqube:community
        env:
          SONAR_ES_BOOTSTRAP_CHECKS_DISABLE: 'true'
        ports:
          - 9000:9000
    env:
      SONAR_HOST_URL: http://localhost:9000
    steps:
      - uses: actions/checkout@v7
        with:
          fetch-depth: 0
      - uses: actions/setup-node@v7
        with:
          node-version: 24
          cache: npm
      - run: npm ci
      - uses: actions/download-artifact@v7
        with:
          name: coverage
          path: coverage/
      - name: Préparer SonarQube (projet et jeton)
        env:
          SONAR_ADMIN_PASSWORD: ci-${{ github.run_id }}-Sonar!
        run: |
          token=$(node scripts/sonar-bootstrap.mjs)
          echo "::add-mask::$token"
          echo "SONAR_TOKEN=$token" >> "$GITHUB_ENV"
      - name: Analyse
        run: npm run sonar
      - name: Rapport (gate publié, non bloquant)
        run: npm run sonar:report >> "$GITHUB_STEP_SUMMARY"
      - uses: actions/upload-artifact@v7
        if: always()
        with:
          name: sonarqube
          path: sonar-report.json
```

Le job échoue si l'analyse échoue (étapes « Préparer » ou « Analyse ») ; le statut du quality gate est seulement publié.

- [ ] **Étape 8 : runbook `docs/runbooks/sonarqube-analyse.md`**

(Le dossier `docs/runbooks/` et son gabarit sont créés à la tâche 3 ; ce fichier les précède, son format suit le gabarit décrit là.)

```markdown
# Runbook — SonarQube : lancer une analyse

| | |
|---|---|
| **Composant** | SonarQube Community (profil `quality` du docker-compose) |
| **Responsable** | axe Architecture |
| **Dernière vérification** | 2026-10-16 |
| **Criticité** | Faible |

## Objectif

Analyser le dépôt avec SonarQube en local, avec la couverture Vitest, et obtenir le rapport (quality gate et métriques).

## Quand l'utiliser

- Avant d'ouvrir une PR qui touche beaucoup de code.
- Pour les mesures « avant / après » de l'audit (`docs/audit/sonarqube-avant-apres.md`).

## Prérequis

- Docker, au moins 4 Go de mémoire libre.
- `.env` contient `SONAR_HOST_URL=http://localhost:9000`.

## Procédure

1. Démarrer SonarQube :
   ```sh
   make sonar-up
   ```
   **Attendu :** http://localhost:9000 répond (1 à 2 min au premier démarrage).
2. Première fois seulement : préparer le serveur et récupérer un jeton :
   ```sh
   SONAR_ADMIN_PASSWORD='un-mot-de-passe-local' npm run --silent sonar:bootstrap
   ```
   **Attendu :** un jeton `sqa_…` s'affiche. Le copier dans `.env` (`SONAR_TOKEN=…`).
3. Lancer l'analyse :
   ```sh
   make sonar
   ```
   **Attendu :** le tableau Markdown du rapport s'affiche ; le détail est sur http://localhost:9000/dashboard?id=expense-io.

## Vérification finale

`sonar-report.json` existe et le tableau de bord affiche la date du jour.

## Retour arrière

`make sonar-down` arrête le serveur ; `docker compose --profile quality down -v` efface ses données.

## Références

- Spec, section SonarQube : `docs/specs/2026-10-15-architecture-cible.md`
```

- [ ] **Étape 9 : run « avant » et `docs/audit/sonarqube-avant-apres.md`**

Créer le fichier avec cet en-tête :

```markdown
# SonarQube — mesures avant / après la refacto

Mesures prises avec le même outillage (SonarQube Community, `sonar-project.properties`, couverture Vitest) sur la base de la refacto puis à la fin du plan 3. Procédure : [`docs/runbooks/sonarqube-analyse.md`](../runbooks/sonarqube-analyse.md).

## Avant
```

Puis, depuis un `.env` contenant `SONAR_TOKEN` :

Run : `make sonar-up && make sonar && npm run --silent sonar:report >> docs/audit/sonarqube-avant-apres.md`
Attendu : le tableau des métriques est ajouté sous « Avant », avec le statut du quality gate. Ajouter sous le tableau la ligne `Commit analysé : <sortie de git rev-parse --short HEAD>.` et une capture `docs/audit/sonarqube-avant.png` du tableau de bord.

- [ ] **Étape 10 : vérifier la CI**

Pousser la branche et vérifier sur GitHub Actions que le job `SonarQube` passe et que son résumé contient le tableau.

- [ ] **Étape 11 : commit**

```bash
git add docker-compose.yml sonar-project.properties scripts/sonar-bootstrap.mjs scripts/sonar-report.mjs package.json package-lock.json Makefile .env.example .gitignore .github/workflows/tests.yml docs/runbooks/sonarqube-analyse.md docs/audit/sonarqube-avant-apres.md docs/audit/sonarqube-avant.png
git commit -m "ci(refacto): SonarQube en local et en CI, mesures avant la refacto"
```

---

### Tâche 2 : le contrat d'API vérifié (OpenAPI ↔ code, `oasdiff` en CI)

**Fichiers :**
- Créer : `tests/unit/openapi-coverage.test.ts`
- Modifier : `.github/workflows/tests.yml`, `package.json`
- Lire : `docs/api/openapi.yaml`

**Interfaces :**
- Produit : job CI `contrat` qui échoue sur tout changement cassant de `docs/api/openapi.yaml` par rapport à `main`.

- [ ] **Étape 1 : installer le parseur YAML (dev)**

Run : `npm install -D yaml`

- [ ] **Étape 2 : écrire le test qui échoue s'il manque une route**

`tests/unit/openapi-coverage.test.ts` :

```ts
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'

const API_DIR = path.join(process.cwd(), 'src/app/api')
const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const

/** `src/app/api/hr/users/[id]/manager/route.ts` → `/api/hr/users/{id}/manager`. */
function routeFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name)
    if (statSync(full).isDirectory()) return routeFiles(full)
    return name === 'route.ts' ? [full] : []
  })
}

function operationsInCode(): string[] {
  return routeFiles(API_DIR)
    .filter((file) => !file.includes('[...nextauth]'))
    .flatMap((file) => {
      const urlPath = `/api/${path
        .relative(API_DIR, path.dirname(file))
        .split(path.sep)
        .map((segment) => segment.replace(/^\[(.+)\]$/, '{$1}'))
        .join('/')}`
      const source = readFileSync(file, 'utf8')
      return METHODS.filter((method) =>
        new RegExp(`export (async function|const) ${method}\\b`).test(source)
      ).map((method) => `${method} ${urlPath}`)
    })
    .sort()
}

function operationsInContract(): string[] {
  const spec = parse(readFileSync(path.join(process.cwd(), 'docs/api/openapi.yaml'), 'utf8')) as {
    paths: Record<string, Record<string, unknown>>
  }
  return Object.entries(spec.paths)
    .filter(([urlPath]) => !urlPath.startsWith('/api/auth/'))
    .flatMap(([urlPath, item]) =>
      Object.keys(item)
        .filter((key) => METHODS.includes(key.toUpperCase() as (typeof METHODS)[number]))
        .map((method) => `${method.toUpperCase()} ${urlPath}`)
    )
    .sort()
}

describe('contrat OpenAPI', () => {
  it('décrit exactement les routes exposées par le code', () => {
    expect(operationsInContract()).toEqual(operationsInCode())
  })
})
```

- [ ] **Étape 3 : lancer le test**

Run : `npx vitest run --project unit tests/unit/openapi-coverage.test.ts`
Attendu : PASS (14 opérations des deux côtés). S'il échoue, corriger `docs/api/openapi.yaml` pour qu'il décrive le code de base — jamais l'inverse — et noter l'écart dans le message de commit.

Note : la regex `export (async function|const)` anticipe la tâche 9, où les routes deviennent `export const GET = route(...)`.

- [ ] **Étape 4 : job CI `contrat`**

Dans `.github/workflows/tests.yml`, ajouter :

```yaml
  contrat:
    name: Contrat d'API (oasdiff contre main)
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
        with:
          fetch-depth: 0
      - name: Contrat de référence (main)
        run: git show origin/main:docs/api/openapi.yaml > /tmp/openapi-main.yaml
      - name: Changements cassants
        run: |
          docker run --rm -v /tmp:/base -v "$PWD/docs/api:/head" tufin/oasdiff:latest \
            breaking /base/openapi-main.yaml /head/openapi.yaml --fail-on ERR --format githubactions
```

`oasdiff` classe en `ERR` un code de succès retiré, un champ requis ajouté à une requête, un champ retiré d'une réponse… ; les codes d'erreur ajoutés sont des `INFO`/`WARN`, donc acceptés (écarts volontaires de la spec).

- [ ] **Étape 5 : commit**

```bash
git add tests/unit/openapi-coverage.test.ts package.json package-lock.json .github/workflows/tests.yml
git commit -m "test(refacto): contrat OpenAPI aligné sur les routes, oasdiff en CI"
```

---

### Tâche 3 : `docs/` par type, gabarits et ADR

**Fichiers :**
- Créer : `docs/specs/README.md`, `docs/specs/spec-template.md`, `docs/plans/README.md`, `docs/plans/plan-template.md`, `docs/adrs/README.md`, `docs/adrs/adr-template.md`, `docs/adrs/0001-structure-de-la-doc-et-harnais-agent.md`, `docs/adrs/0002-monolithe-modulaire-hexagonal.md`, `docs/adrs/0003-notification-par-outbox-d-e-mails.md`, `docs/adrs/0004-contrat-d-api-et-erreurs-rfc-9457.md`, `docs/runbooks/README.md`, `docs/runbooks/runbook-template.md`, `docs/runbooks/dev-environnement-demarrer.md`
- Modifier : `docs/README.md`

- [ ] **Étape 1 : `docs/specs/README.md` et `docs/specs/spec-template.md`**

`docs/specs/README.md` :

```markdown
# Specs

Une spec répond à « que construit-on, et pourquoi ? » pour une fonctionnalité ou un chantier. Elle est figée une fois implémentée.

- Nommage : `YYYY-MM-DD-<sujet>.md` (date de création, kebab-case).
- Toujours partir de [`spec-template.md`](spec-template.md).
- Statuts : `Brouillon` → `En revue` → `Acceptée` → `Implémentée` (ou `Abandonnée`, `Remplacée par …`).
- Une spec cite ses plans (champ *Plans*) et ses ADR (champ *ADR liées*).
- Une décision qui dépasse la fonctionnalité (transverse, coûteuse à défaire) est extraite en ADR dans `docs/adrs/`.
- Écrite par le skill `superpowers:brainstorming` : ici, jamais dans `docs/superpowers/`, sans suffixe `-design`.
```

`docs/specs/spec-template.md` :

```markdown
# Titre de la spec

| | |
|---|---|
| **Statut** | Brouillon \| En revue \| Acceptée \| Implémentée \| Abandonnée \| Remplacée par [lien](YYYY-MM-DD-...md) |
| **Auteur(s)** | |
| **Créée** | YYYY-MM-DD |
| **Mise à jour** | YYYY-MM-DD |
| **Plans** | [YYYY-MM-DD-...](../plans/YYYY-MM-DD-...md) |
| **ADR liées** | [NNNN](../adrs/NNNN-...md) |

## Contexte

Quel problème, pour qui, pourquoi maintenant ?

## Objectifs

- Objectif mesurable

## Hors périmètre

Ce que la spec ne couvre volontairement pas.

## Proposition

Comportement attendu, parcours, interfaces. Modèle de données, API, architecture si besoin.

## Contraintes globales

Exigences transverses que tout le plan doit respecter, une par ligne, avec les valeurs exactes.

## Alternatives écartées

| Option | Pour | Contre | Pourquoi écartée |
|---|---|---|---|

## Sécurité, performance, conformité

## Erreurs et cas limites

Entrées invalides, pannes de dépendances, accès concurrents… et le comportement attendu.

## Critères d'acceptation

- [ ] Critère

## Questions ouvertes

Doit être vide avant `Acceptée`.
```

- [ ] **Étape 2 : `docs/plans/README.md` et `docs/plans/plan-template.md`**

`docs/plans/README.md` :

```markdown
# Plans d'implémentation

Un plan répond à « dans quel ordre, quels fichiers, quels tests ? » pour une spec. Il ne prend aucune décision de conception : si une question de conception surgit, on met à jour la spec.

- Nommage : même slug que la spec, `YYYY-MM-DD-<sujet>.md` ; suffixe `-n-<partie>` quand une spec a plusieurs plans.
- Toujours partir de [`plan-template.md`](plan-template.md).
- Statuts : `Brouillon` → `Approuvé` → `En cours` → `Terminé` (ou `Abandonné`).
- Écrit par le skill `superpowers:writing-plans` : ici, jamais dans `docs/superpowers/`. Exécuté avec `superpowers:subagent-driven-development` ou `superpowers:executing-plans`.
```

`docs/plans/plan-template.md` :

````markdown
# Titre — plan d'implémentation

> **Pour les agents :** SOUS-SKILL REQUIS : `superpowers:subagent-driven-development` (recommandé) ou `superpowers:executing-plans`. Étapes en cases à cocher (`- [ ]`).

| | |
|---|---|
| **Statut** | Brouillon \| Approuvé \| En cours \| Terminé \| Abandonné |
| **Spec** | [YYYY-MM-DD-...](../specs/YYYY-MM-DD-...md) |
| **Auteur(s)** | |
| **Créé** | YYYY-MM-DD |

**Objectif :** une phrase.

**Architecture :** deux ou trois phrases.

**Stack :** technologies clés.

## Contraintes globales

Copiées telles quelles de la spec.

## Points de vigilance (review focus)

Cas limites que la spec implique mais qu'aucune tâche ne teste naturellement ; chacun reçoit un test dans la tâche qui possède le code.

## Structure des fichiers

| Fichier | Action | Responsabilité |
|---|---|---|

---

### Tâche 1 : <composant>

**Fichiers :**
- Créer : `chemin/exact`
- Modifier : `chemin/exact:lignes`
- Tester : `tests/chemin/exact`

**Interfaces :**
- Consomme : ce que la tâche utilise des précédentes (signatures exactes).
- Produit : ce que les suivantes utiliseront.

- [ ] **Étape 1 : écrire le test qui échoue**

```ts
// code du test
```

- [ ] **Étape 2 : lancer le test, vérifier qu'il échoue**

Run : `npx vitest run chemin/du/test`
Attendu : FAIL avec « … »

- [ ] **Étape 3 : implémentation minimale**

```ts
// code
```

- [ ] **Étape 4 : lancer le test, vérifier qu'il passe**

- [ ] **Étape 5 : commit**

```bash
git add <fichiers>
git commit -m "feat(<portée>): …"
```
````

- [ ] **Étape 3 : `docs/adrs/README.md` et `docs/adrs/adr-template.md`**

`docs/adrs/README.md` :

```markdown
# ADR — décisions d'architecture en vigueur

Une ADR consigne **une** décision qui dépasse une fonctionnalité : transverse, coûteuse à défaire, ou née hors d'une spec. Règle : *si l'auteur d'une future spec doit la connaître pour ne pas la contredire, c'est une ADR*.

- Nommage : `NNNN-<décision>.md`, numéro suivant.
- Toujours partir de [`adr-template.md`](adr-template.md).
- Une ADR acceptée n'est jamais réécrite : une nouvelle ADR la remplace, et l'ancienne passe en `Remplacée par NNNN`.

| ADR | Décision | Statut |
|---|---|---|
| [0001](0001-structure-de-la-doc-et-harnais-agent.md) | Structure de la doc et harnais agent | Acceptée |
| [0002](0002-monolithe-modulaire-hexagonal.md) | Monolithe modulaire hexagonal (option C) | Acceptée |
| [0003](0003-notification-par-outbox-d-e-mails.md) | Notification de décision par outbox d'e-mails | Acceptée |
| [0004](0004-contrat-d-api-et-erreurs-rfc-9457.md) | Contrat d'API figé et erreurs RFC 9457 | Acceptée |
```

`docs/adrs/adr-template.md` :

```markdown
# NNNN — Titre de la décision

| | |
|---|---|
| **Statut** | Proposée \| Acceptée \| Rejetée \| Dépréciée \| Remplacée par [NNNN](NNNN-...md) |
| **Date** | YYYY-MM-DD |
| **Décideur(s)** | |
| **Origine** | [spec](../specs/YYYY-MM-DD-...md) \| autre |

## Contexte

## Options envisagées

1. **Option A** — description
   - ➕ pour
   - ➖ contre

## Décision

Nous choisissons **l'option X**, parce que…

## Conséquences

- **Positives :**
- **Négatives :**
- **Suivi :** conditions qui justifieraient de revenir sur la décision.
```

- [ ] **Étape 4 : les quatre ADR**

`docs/adrs/0001-structure-de-la-doc-et-harnais-agent.md` :

```markdown
# 0001 — Structure de la doc et harnais agent

| | |
|---|---|
| **Statut** | Acceptée |
| **Date** | 2026-10-16 |
| **Décideur(s)** | Louis Bertrand |
| **Origine** | [spec architecture cible](../specs/2026-10-15-architecture-cible.md), section « Prêt pour les agents » |

## Contexte

La refacto est codée par des agents, et la soutenance comprend l'ajout d'une fonctionnalité en un prompt devant le jury. Les agents doivent savoir où va le nouveau code, comment le vérifier et comment le documenter. Le workflow *superpowers* écrit par défaut dans `docs/superpowers/`, et chaque outil (Claude Code, Codex, Cursor, OpenCode) lit ses instructions à un endroit différent.

## Options envisagées

1. **Tout dans les emplacements de Claude Code** (`CLAUDE.md`, `.claude/skills/`) — ➕ simple ; ➖ invisible aux autres agents.
2. **Dupliquer à la main** dans chaque emplacement — ➕ marche partout ; ➖ les copies divergent.
3. **Standards ouverts comme source unique** : `AGENTS.md` (importé par `CLAUDE.md`), skills au format Agent Skills dans `.agents/skills/`, **copiés** vers `.claude/skills/` par `npm run agents:sync`, avec une vérification en CI ; `docs/` rangé par type (specs, plans, adrs, runbooks), chacun avec README et gabarit.

## Décision

Nous choisissons **l'option 3**. On copie au lieu de créer des liens symboliques (comme le fait cnp-dev) parce que le dépôt est cloné sous Windows avec `core.symlinks=false`, où un lien devient un simple fichier texte.

## Conséquences

- **Positives :** tous les agents lisent les mêmes instructions ; chaque document a une place et un gabarit.
- **Négatives :** penser à `npm run agents:sync` après toute modification d'un skill (la CI le rappelle).
- **Suivi :** quand Claude Code lira `.agents/skills/` nativement, supprimer les copies et remplacer cette ADR.
```

`docs/adrs/0002-monolithe-modulaire-hexagonal.md` :

```markdown
# 0002 — Monolithe modulaire hexagonal (option C)

| | |
|---|---|
| **Statut** | Acceptée |
| **Date** | 2026-10-16 |
| **Décideur(s)** | Louis Bertrand, équipe |
| **Origine** | [spec architecture cible](../specs/2026-10-15-architecture-cible.md) ; étude [`options-refacto.md`](../architecture/options-refacto.md) |

## Contexte

L'application est un monolithe Next.js où les routes portent le SQL et les règles d'accès, recopiées sept fois ; la couche hexagonale existe mais n'est pas branchée (F22). La refacto doit couvrir trois axes (Architecture, Contrat d'API, Asynchrone & run) sans casser l'API.

## Options envisagées

1. **A — monolithe en couches nettoyé** — ➕ léger ; ➖ ne montre aucune notion du cours, laisse l'axe asynchrone vide.
2. **B — monolithe modulaire, hexagonal par module** — ➕ frontières nettes, métier testable ; ➖ pas d'asynchrone.
3. **C — B plus un flux asynchrone** — ➕ couvre les trois axes ; ➖ un process de plus.
4. **D — microservices** — ➖ aucune contrainte de charge ne le justifie ; transactions distribuées.

## Décision

Nous choisissons **C**. Deux modules, `expenses` et `iam`, chacun en `domain` / `application` (un fichier par use case) / `ports` / `infrastructure`, plus `src/shared/`. Un module ne voit l'autre que par son `index.ts` ; ces règles sont vérifiées par `dependency-cruiser`. **`ApprovalPolicy` (module `iam`) fait seule foi** pour savoir qui valide quoi : manager direct, sinon les RH de l'entreprise, jamais sa propre note. La RLS n'assure que l'isolation entre entreprises.

## Conséquences

- **Positives :** une règle métier écrite une fois ; recette fixe pour ajouter une fonctionnalité.
- **Négatives :** plus de fichiers ; un RH seul dans son entreprise peut soumettre une note mais n'a aucun validateur tant qu'un second RH n'existe pas (limite assumée, consigne « tout le monde peut créer une note »).
- **Suivi :** un futur module (facturation) va dans `src/modules/billing`, avec un port `PaymentProvider`.
```

`docs/adrs/0003-notification-par-outbox-d-e-mails.md` :

```markdown
# 0003 — Notification de décision par outbox d'e-mails

| | |
|---|---|
| **Statut** | Acceptée |
| **Date** | 2026-10-16 |
| **Décideur(s)** | Louis Bertrand, Maxime |
| **Origine** | [spec architecture cible](../specs/2026-10-15-architecture-cible.md), section « Notification de décision » |

## Contexte

L'employé n'est jamais prévenu d'une décision (F15). Écrire la décision en base et envoyer un e-mail touchent deux systèmes qu'on ne peut pas rendre atomiques, et un serveur SMTP est une dépendance lente et peu fiable.

## Options envisagées

1. **Envoi dans la route** — ➖ la décision dépend du SMTP ; un crash perd l'e-mail.
2. **Envoi sans `await` / `after()`** — ➖ ni persistance ni retry.
3. **Outbox d'événements, worker qui compose l'e-mail** — ➖ le worker doit charger le cœur ou contenir du métier.
4. **Outbox, relay, SQS et consumer** — ➖ second saut, DLQ et table d'idempotence pour un seul consommateur.
5. **Outbox d'e-mails (`mail_outbox`) et worker de livraison sans code métier.**

## Décision

Nous choisissons **5**. `decideExpenseNote` compose l'e-mail et l'écrit par le port `Mailer` (adapter `OutboxMailer`) dans la même transaction que la décision. Un worker hors de l'hexagone réserve des lots de 5 (bail de 2 min, plus long que le pire cas d'un lot), envoie hors transaction, marque `sent`, réessaie, puis passe la ligne en `dead` après 3 échecs.

## Conséquences

- **Positives :** aucun e-mail perdu ; la décision ne dépend jamais du SMTP ; le worker est trivial.
- **Négatives :** livraison au moins une fois (doublon possible) ; données personnelles dans `mail_outbox` (purge à 30 jours) ; pas d'événement métier.
- **Suivi :** ajouter une outbox d'événements si un second consommateur doit savoir qu'une note a été tranchée ; SQS seulement si un autre service doit la recevoir.
```

`docs/adrs/0004-contrat-d-api-et-erreurs-rfc-9457.md` :

```markdown
# 0004 — Contrat d'API figé et erreurs RFC 9457

| | |
|---|---|
| **Statut** | Acceptée |
| **Date** | 2026-10-16 |
| **Décideur(s)** | Louis Bertrand |
| **Origine** | [spec architecture cible](../specs/2026-10-15-architecture-cible.md), section « Contrat d'API » |

## Contexte

La consigne interdit de casser l'API. Les erreurs actuelles sont incohérentes (401/403), exposent la stack (F26) et transforment des entrées invalides en 500 (F42).

## Options envisagées

1. **Ne rien toucher aux erreurs** — ➖ laisse F26, F27, F42.
2. **Passer à RFC 9457 en remplaçant `{ error }`** — ➖ casse les clients qui lisent `error`.
3. **RFC 9457 additif** : on garde `error` et on ajoute `type`, `title`, `status`, `detail`, en `application/problem+json`.

## Décision

Nous choisissons **3**. `docs/api/openapi.yaml` est la référence ; `oasdiff breaking` le compare à `main` en CI ; chaque écart volontaire (codes d'erreur corrigés) y est documenté. Les réponses en succès ne changent jamais.

## Conséquences

- **Positives :** clients existants intacts ; erreurs typées et traduites à un seul endroit (`src/shared/http.ts`).
- **Négatives :** le champ `error` est redondant avec `detail`, tant qu'un client l'utilise.
- **Suivi :** retirer `error` dans une version majeure, une fois les clients migrés vers `detail`.
```

- [ ] **Étape 5 : `docs/runbooks/README.md`, gabarit et démarrage de l'environnement**

`docs/runbooks/README.md` :

```markdown
# Runbooks

Un runbook répond à « comment opérer ou réparer ça ? », avec des commandes copiables et le résultat attendu à chaque étape.

- Nommage : `<composant>-<action>.md`.
- Toujours partir de [`runbook-template.md`](runbook-template.md).
```

`docs/runbooks/runbook-template.md` : reprendre exactement la structure de `docs/runbooks/sonarqube-analyse.md` (tâche 1) avec des valeurs vides : tableau (Composant, Responsable, Dernière vérification, Criticité), puis sections « Objectif », « Quand l'utiliser », « Prérequis », « Procédure » (étapes numérotées, chacune avec un bloc ```sh``` et une ligne **Attendu :**), « Vérification finale », « Retour arrière », « Références ».

`docs/runbooks/dev-environnement-demarrer.md` :

```markdown
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
```

- [ ] **Étape 6 : `docs/README.md`**

Ajouter, juste avant la section `## Conventions`, la section :

```markdown
## Types de documents

| Dossier | Type | Répond à | Gabarit |
|---|---|---|---|
| [`specs/`](specs/README.md) | Spec | Que construit-on, et pourquoi ? | [`spec-template.md`](specs/spec-template.md) |
| [`plans/`](plans/README.md) | Plan d'implémentation | Dans quel ordre, quels fichiers, quels tests ? | [`plan-template.md`](plans/plan-template.md) |
| [`adrs/`](adrs/README.md) | ADR | Pourquoi le système est-il construit ainsi ? | [`adr-template.md`](adrs/adr-template.md) |
| [`runbooks/`](runbooks/README.md) | Runbook | Comment l'opérer ou le réparer ? | [`runbook-template.md`](runbooks/runbook-template.md) |

Cycle : spec → (ADR si la décision est transverse) → plan → implémentation → runbook. `audit/`, `api/` et `architecture/` restent la base de connaissance décrite plus haut.
```

et, dans « À venir », remplacer la ligne des ADR par : `- les ADR 0001 à 0004 sont écrites (voir [adrs/](adrs/README.md)).`

- [ ] **Étape 7 : vérifier les liens**

Run : `grep -rhoE '\]\(([^)#]+)' docs/README.md docs/specs/README.md docs/plans/README.md docs/adrs docs/runbooks | sed 's/](//' | sort -u`
Attendu : chaque chemin listé existe (relatif au fichier qui le cite).

- [ ] **Étape 8 : commit**

```bash
git add docs
git commit -m "docs(refacto): docs/ par type, gabarits, ADR 0001 à 0004 et runbooks"
```

---

### Tâche 4 : `AGENTS.md`, `CLAUDE.md`, `CONTRIBUTING.md`, permissions et `npm run verify`

**Fichiers :**
- Créer : `AGENTS.md`, `CLAUDE.md`, `AGENTS.local.example.md`, `CONTRIBUTING.md`, `.claude/settings.json`, `.dependency-cruiser.cjs`
- Modifier : `.gitignore`, `package.json`

**Interfaces :**
- Produit : `npm run depcruise` (avertit, n'échoue pas dans ce plan), `npm run verify`, `npm run verify:full`.

- [ ] **Étape 1 : installer dependency-cruiser**

Run : `npm install -D dependency-cruiser`

- [ ] **Étape 2 : `.dependency-cruiser.cjs`**

```js
// Règles de dépendance de l'architecture cible (spec, « Règles de dépendance »).
// Plan 1 : en avertissement (les modules n'existent pas encore).
// Plan 2 : SEVERITY passe à 'error' et la CI bloque.
const SEVERITY = 'warn'

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'domaine-pur',
      comment: "Le domaine n'importe que son propre domaine (et Node).",
      severity: SEVERITY,
      from: { path: '^src/modules/([^/]+)/domain/' },
      to: { pathNot: '^src/modules/$1/domain/', dependencyTypesNot: ['core'] },
    },
    {
      name: 'application-sans-infrastructure',
      comment: "Un use case passe par ses ports, jamais par l'infrastructure.",
      severity: SEVERITY,
      from: { path: '^src/modules/([^/]+)/application/' },
      to: { path: '^src/modules/$1/infrastructure/' },
    },
    {
      name: 'application-sans-techno',
      comment: 'Un use case ne connaît ni pg, ni S3, ni Tesseract, ni bcrypt, ni Next.',
      severity: SEVERITY,
      from: { path: '^src/modules/[^/]+/application/' },
      to: { path: 'node_modules/(pg|@aws-sdk|tesseract\\.js|bcryptjs|nodemailer|next|next-auth)/' },
    },
    {
      name: 'module-par-son-index',
      comment: "Un module ne voit un autre module que par son index.ts.",
      severity: SEVERITY,
      from: { path: '^src/modules/([^/]+)/' },
      to: { path: '^src/modules/', pathNot: ['^src/modules/$1/', '^src/modules/[^/]+/index\\.ts$'] },
    },
    {
      name: 'app-par-les-index',
      comment: "app/ n'entre dans un module que par son index.ts.",
      severity: SEVERITY,
      from: { path: '^src/app/' },
      to: { path: '^src/modules/[^/]+/(?!index\\.ts$)' },
    },
    {
      name: 'shared-sans-module',
      severity: SEVERITY,
      from: { path: '^src/shared/' },
      to: { path: '^src/(modules|app|worker)/' },
    },
    {
      name: 'worker-isole',
      comment: "Le worker de livraison n'importe que shared/config et shared/logger.",
      severity: SEVERITY,
      from: { path: '^src/worker/' },
      to: { path: '^src/', pathNot: ['^src/worker/', '^src/shared/(config|logger)\\.ts$'] },
    },
    {
      name: 'pas-de-cycle',
      severity: SEVERITY,
      from: {},
      to: { circular: true },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.json' },
    enhancedResolveOptions: { exportsFields: ['exports'], conditionNames: ['import', 'require', 'node', 'default'] },
  },
}
```

- [ ] **Étape 3 : scripts npm**

Dans `package.json`, `scripts` :

```json
"depcruise": "depcruise src --config .dependency-cruiser.cjs --output-type err-long",
"verify": "npm run lint && npm run typecheck && npm run depcruise && npm test",
"verify:full": "npm run verify && npm run test:e2e"
```

Run : `npm run depcruise`
Attendu : `✔ no dependency violations found` (ou des avertissements, sans code de sortie non nul).

- [ ] **Étape 4 : `AGENTS.md`**

```markdown
# AGENTS.md

Instructions pour les agents de code (Claude Code, Codex, Cursor, OpenCode…) qui travaillent sur ce dépôt. Fichier chargé à chaque session : il reste court.

## Le projet

Expense.io : notes de frais (soumission, validation par le manager ou les RH, reçus sur S3, pré-remplissage par OCR). Next.js 16, TypeScript, PostgreSQL (RLS), LocalStack S3.

## Architecture

Monolithe modulaire hexagonal ([ADR 0002](docs/adrs/0002-monolithe-modulaire-hexagonal.md), [schéma](docs/architecture/architecture-cible.html), [spec](docs/specs/2026-10-15-architecture-cible.md)) :

- `src/modules/<module>/{domain,application,ports,infrastructure}` + `index.ts` (API publique). Modules : `expenses`, `iam`.
- `src/shared/` : config, erreurs, problem (RFC 9457), logger, http, unité de travail, mail.
- `src/app/api/**/route.ts` : adapters d'entrée minces (parse → use case → HTTP).
- `src/worker/` : worker de livraison des e-mails, hors de l'hexagone.

Règles de dépendance (vérifiées par `npm run depcruise`) : `domain` n'importe rien ; `application` n'importe que `domain`, `ports`, `shared` et l'`index.ts` d'un autre module ; un module n'en voit un autre que par son `index.ts` ; `app/` n'importe que des `index.ts` et `shared` ; `worker/` n'importe que `shared/config` et `shared/logger`. Le SQL d'`expenses` ne touche jamais `users` ni `companies`.

## Commandes

- `make dev` : tout démarrer (Docker, migrations, seed, application).
- `npm run verify` : lint, typecheck, règles de dépendance, Vitest. **À lancer avant de conclure.**
- `npm run verify:full` : idem plus les E2E Playwright.
- `make sonar` : analyse SonarQube ([runbook](docs/runbooks/sonarqube-analyse.md)).

## Règles

- Le contrat d'API (`docs/api/openapi.yaml`) ne change pas, sauf ajout. Toute nouvelle route ou réponse y est décrite dans le même commit.
- Erreurs : lever une erreur typée de `src/shared/errors.ts` ; jamais de `Response.json({ error })` à la main.
- Pas de stack ni de message interne dans une réponse HTTP.
- Tests : un test qui échoue avant tout code (TDD). Un défaut figé par un test `[as-is]` se corrige en modifiant ce test.

## Git

Règles complètes : [`CONTRIBUTING.md`](CONTRIBUTING.md). Branches `<prénom>/arla-<n>-<sujet>` ou `<prénom>/<sujet>`, jamais de commit sur `main`. Commits `type(portée): description` en français.

## Documentation

Toute la doc vit dans `docs/`, en français, rangée par type ([`docs/README.md`](docs/README.md)). Avant d'écrire un document, lire le skill [`utiliser-la-doc`](.agents/skills/utiliser-la-doc/SKILL.md).

**Préférence superpowers (prime sur les défauts des skills) :**

- `superpowers:brainstorming` → spec dans `docs/specs/YYYY-MM-DD-<sujet>.md`, d'après `docs/specs/spec-template.md`. Jamais `docs/superpowers/specs/`, pas de suffixe `-design`.
- `superpowers:writing-plans` → plan dans `docs/plans/YYYY-MM-DD-<sujet>.md`, d'après `docs/plans/plan-template.md`. Jamais `docs/superpowers/plans/`.
- Les décisions transverses sont extraites en ADR dans `docs/adrs/`.

## Skills

Skills du projet au format Agent Skills dans `.agents/skills/<nom>/SKILL.md`, copiés vers `.claude/skills/` par `npm run agents:sync` (pas de lien symbolique : clones Windows, [ADR 0001](docs/adrs/0001-structure-de-la-doc-et-harnais-agent.md)). Après toute modification d'un skill, lancer `npm run agents:sync`.

| Skill | Quand |
|---|---|
| `utiliser-la-doc` | avant d'écrire ou de modifier un document de `docs/` |
| `verifier-avant-de-livrer` | avant de déclarer un travail terminé |

## Préférences personnelles

Si `AGENTS.local.md` existe, le lire après ce fichier. Les règles du projet priment toujours.

## Maintenir ce fichier

Le mettre à jour quand un agent répète une erreur, qu'une convention change ou qu'une règle devient obsolète. Supprimer les lignes périmées plutôt qu'empiler des exceptions.
```

- [ ] **Étape 5 : `CLAUDE.md`, `AGENTS.local.example.md`, `.gitignore`**

`CLAUDE.md` (une seule ligne) :

```markdown
@AGENTS.md
```

`AGENTS.local.example.md` :

```markdown
# AGENTS.local.md — préférences personnelles

<!--
À copier en AGENTS.local.md (ignoré par git). Les agents le lisent après AGENTS.md.
Préférences seulement : les règles du projet priment.
-->

- Me répondre en : français
- Niveau de détail : concis
- Avant de commiter : me montrer le diff et demander
```

Dans `.gitignore`, ajouter :

```
# Préférences personnelles des agents (voir AGENTS.local.example.md)
AGENTS.local.md
# Configuration locale de l'aperçu Claude Code
.claude/launch.json
```

- [ ] **Étape 6 : `CONTRIBUTING.md`**

```markdown
# Contribuer

Règles pour tout contributeur, humain ou agent. Agents : voir aussi [`AGENTS.md`](AGENTS.md).

## Branches

- `main` : branche de référence, protégée. On n'y commite jamais directement.
- Une branche par ticket : `<prénom>/arla-<n>-<sujet>` (ex. `louisbert91/arla-9-tests-de-caracterisation`), ou `<prénom>/<sujet>` hors ticket.
- On fusionne dans `main` par pull request, CI verte.

## Commits

[Conventional Commits](https://www.conventionalcommits.org/fr/) en français, à l'impératif présent ou au constat : `type(portée): description`.

| Type | Usage |
|---|---|
| `feat` | nouvelle fonctionnalité |
| `fix` | correction de bug |
| `refactor` | changement de code sans changement de comportement |
| `test` | tests |
| `docs` | documentation |
| `ci` | intégration continue |
| `chore` | maintenance, dépendances, outillage |

La portée est le ticket (`ARLA-9`) ou la zone (`refacto`, `iam`, `expenses`…).

## Pull requests

- La CI doit être verte : lint, typecheck, règles de dépendance, Vitest, Playwright, contrat d'API, SonarQube.
- Toute modification de l'API met à jour `docs/api/openapi.yaml` dans la même PR.
- Toute nouvelle décision transverse ajoute une ADR.
```

- [ ] **Étape 7 : `.claude/settings.json`**

```json
{
  "$schema": "https://json.schemastore.org/claude-code-settings.json",
  "permissions": {
    "allow": [
      "Bash(npm run:*)",
      "Bash(npm test:*)",
      "Bash(npm install:*)",
      "Bash(npx vitest:*)",
      "Bash(npx playwright:*)",
      "Bash(npx tsc:*)",
      "Bash(make:*)",
      "Bash(docker compose:*)",
      "Bash(git status:*)",
      "Bash(git diff:*)",
      "Bash(git log:*)",
      "Bash(git show:*)",
      "Bash(git add:*)",
      "Bash(git commit:*)",
      "Bash(git switch:*)",
      "Bash(git branch:*)"
    ],
    "deny": [
      "Bash(git push --force:*)",
      "Bash(git push -f:*)",
      "Bash(rm -rf:*)",
      "Read(./.env)",
      "Edit(./.env)",
      "Write(./.env)"
    ]
  }
}
```

- [ ] **Étape 8 : vérifier**

Run : `npm run verify`
Attendu : tout passe.

- [ ] **Étape 9 : commit**

```bash
git add AGENTS.md CLAUDE.md AGENTS.local.example.md CONTRIBUTING.md .claude/settings.json .dependency-cruiser.cjs .gitignore package.json package-lock.json
git commit -m "chore(refacto): AGENTS.md, conventions, permissions agents et npm run verify"
```

---

### Tâche 5 : skills du projet et `npm run agents:sync`

**Fichiers :**
- Créer : `scripts/agents-sync.mjs`, `tests/unit/agents-sync.test.ts`, `.agents/skills/utiliser-la-doc/SKILL.md`, `.agents/skills/verifier-avant-de-livrer/SKILL.md`, et leurs copies sous `.claude/skills/`
- Modifier : `package.json`, `.github/workflows/tests.yml`

**Interfaces :**
- Produit : `planSync(sourceDir: string, targetDir: string): Promise<SyncAction[]>` avec `SyncAction = { kind: 'copy' | 'delete', relativePath: string }` ; `applySync(sourceDir, targetDir, actions): Promise<void>` ; CLI `node scripts/agents-sync.mjs [--check]`.

- [ ] **Étape 1 : écrire le test qui échoue**

`tests/unit/agents-sync.test.ts` :

```ts
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { applySync, planSync } from '../../scripts/agents-sync.mjs'

let root: string
let source: string
let target: string

async function put(dir: string, relative: string, content: string) {
  await mkdir(path.dirname(path.join(dir, relative)), { recursive: true })
  await writeFile(path.join(dir, relative), content)
}

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'agents-sync-'))
  source = path.join(root, '.agents/skills')
  target = path.join(root, '.claude/skills')
  await mkdir(source, { recursive: true })
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe('planSync', () => {
  it('copie un skill absent de la cible', async () => {
    await put(source, 'a/SKILL.md', 'A')
    expect(await planSync(source, target)).toEqual([{ kind: 'copy', relativePath: 'a/SKILL.md' }])
  })

  it('ne fait rien quand les copies sont à jour', async () => {
    await put(source, 'a/SKILL.md', 'A')
    await put(target, 'a/SKILL.md', 'A')
    expect(await planSync(source, target)).toEqual([])
  })

  it('recopie un fichier modifié et supprime un fichier disparu de la source', async () => {
    await put(source, 'a/SKILL.md', 'A2')
    await put(target, 'a/SKILL.md', 'A1')
    await put(target, 'a/ancien.md', 'x')
    expect(await planSync(source, target)).toEqual([
      { kind: 'delete', relativePath: 'a/ancien.md' },
      { kind: 'copy', relativePath: 'a/SKILL.md' },
    ])
  })

  it("ignore les dossiers de la cible qui n'ont pas de skill source (fichiers propres à Claude Code)", async () => {
    await put(source, 'a/SKILL.md', 'A')
    await put(target, 'a/SKILL.md', 'A')
    await put(target, 'perso/SKILL.md', 'P')
    expect(await planSync(source, target)).toEqual([])
  })
})

describe('applySync', () => {
  it('rend la cible identique à la source', async () => {
    await put(source, 'a/SKILL.md', 'A')
    await put(target, 'a/vieux.md', 'x')
    await applySync(source, target, await planSync(source, target))
    expect(await readFile(path.join(target, 'a/SKILL.md'), 'utf8')).toBe('A')
    expect(await planSync(source, target)).toEqual([])
  })
})
```

- [ ] **Étape 2 : lancer, vérifier l'échec**

Run : `npx vitest run --project unit tests/unit/agents-sync.test.ts`
Attendu : FAIL, `Cannot find module '../../scripts/agents-sync.mjs'`.

- [ ] **Étape 3 : implémenter `scripts/agents-sync.mjs`**

```js
// Copie les skills du standard Agent Skills (.agents/skills/) vers l'emplacement
// lu par Claude Code (.claude/skills/). Pas de lien symbolique : clones Windows
// avec core.symlinks=false (ADR 0001).
//   node scripts/agents-sync.mjs          met à jour les copies
//   node scripts/agents-sync.mjs --check  échoue si une copie diverge (CI)
import { createHash } from 'node:crypto'
import { copyFile, mkdir, readdir, readFile, rm } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

async function listFiles(dir, base = dir) {
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return []
  }
  const files = await Promise.all(
    entries.map((entry) => {
      const full = path.join(dir, entry.name)
      return entry.isDirectory() ? listFiles(full, base) : [path.relative(base, full).split(path.sep).join('/')]
    })
  )
  return files.flat()
}

async function digest(file) {
  return createHash('sha256').update(await readFile(file)).digest('hex')
}

/** Actions pour que chaque skill de `sourceDir` soit copié à l'identique dans `targetDir`. */
export async function planSync(sourceDir, targetDir) {
  const sourceFiles = await listFiles(sourceDir)
  const skills = new Set(sourceFiles.map((file) => file.split('/')[0]))
  const targetFiles = (await listFiles(targetDir)).filter((file) => skills.has(file.split('/')[0]))
  const deletions = targetFiles
    .filter((file) => !sourceFiles.includes(file))
    .map((relativePath) => ({ kind: 'delete', relativePath }))
  const copies = []
  for (const relativePath of sourceFiles) {
    const targetFile = path.join(targetDir, relativePath)
    const same =
      targetFiles.includes(relativePath) &&
      (await digest(path.join(sourceDir, relativePath))) === (await digest(targetFile))
    if (!same) copies.push({ kind: 'copy', relativePath })
  }
  return [...deletions.sort(byPath), ...copies.sort(byPath)]
}

function byPath(a, b) {
  return a.relativePath.localeCompare(b.relativePath)
}

export async function applySync(sourceDir, targetDir, actions) {
  for (const action of actions) {
    const targetFile = path.join(targetDir, action.relativePath)
    if (action.kind === 'delete') {
      await rm(targetFile, { force: true })
    } else {
      await mkdir(path.dirname(targetFile), { recursive: true })
      await copyFile(path.join(sourceDir, action.relativePath), targetFile)
    }
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = process.cwd()
  const source = path.join(root, '.agents/skills')
  const target = path.join(root, '.claude/skills')
  const actions = await planSync(source, target)
  if (process.argv.includes('--check')) {
    if (actions.length > 0) {
      console.error('Copies de skills désynchronisées. Lancer `npm run agents:sync` :')
      for (const action of actions) console.error(`  ${action.kind} ${action.relativePath}`)
      process.exit(1)
    }
    console.log('Skills synchronisés.')
  } else {
    await applySync(source, target, actions)
    console.log(`${actions.length} fichier(s) mis à jour dans .claude/skills.`)
  }
}
```

- [ ] **Étape 4 : lancer, vérifier que ça passe**

Run : `npx vitest run --project unit tests/unit/agents-sync.test.ts`
Attendu : PASS (5 tests).

- [ ] **Étape 5 : les deux skills**

`.agents/skills/utiliser-la-doc/SKILL.md` :

```markdown
---
name: utiliser-la-doc
description: À utiliser avant d'écrire ou de modifier un document du dépôt (spec, plan, ADR, runbook, mesure d'audit), quand un skill superpowers (brainstorming, writing-plans) s'apprête à écrire sous docs/superpowers/, ou quand une décision, une procédure ou une mesure doit être consignée.
---

# Utiliser docs/

Toute la doc vit dans `docs/`, en français. Un dossier par type, chacun avec un `README.md` et un `<type>-template.md`. **Toujours partir du gabarit ; ne jamais créer de dossier de doc hors de cette structure.**

## Emplacements (préférence du projet, prime sur superpowers)

| Document | Chemin | Remplace |
|---|---|---|
| Spec | `docs/specs/YYYY-MM-DD-<sujet>.md` | `docs/superpowers/specs/…-design.md` |
| Plan | `docs/plans/YYYY-MM-DD-<sujet>.md` (même slug que la spec, `-n-<partie>` si plusieurs) | `docs/superpowers/plans/…` |
| ADR | `docs/adrs/NNNN-<décision>.md` (numéro suivant) | — |
| Runbook | `docs/runbooks/<composant>-<action>.md` | — |
| Contrat d'API | `docs/api/openapi.yaml` | — |
| Mesures d'audit | `docs/audit/` | — |

## Quel type ?

- **Spec** : le quoi et le pourquoi d'une fonctionnalité. Ses alternatives locales restent dans sa section « Alternatives écartées ».
- **Plan** : le comment, tâche par tâche, sans décision de conception.
- **ADR** : seulement si l'auteur d'une future spec doit connaître la décision pour ne pas la contredire. Une ADR acceptée ne se réécrit pas : une nouvelle la remplace.
- **Runbook** : procédure avec commandes copiables et résultat attendu à chaque étape.

## Liens à tenir à jour

- Spec ↔ plans (champs *Plans* et *Spec*), spec → ADR (*ADR liées*).
- `docs/adrs/README.md` liste les ADR en vigueur.
- `docs/README.md` (« Où en est-on ») quand l'état du projet change.

## Erreurs fréquentes

| Erreur | Correction |
|---|---|
| Écrire sous `docs/superpowers/` | `docs/specs/` et `docs/plans/` |
| ADR pour un choix local | section « Alternatives écartées » de la spec |
| Réécrire une ADR acceptée | nouvelle ADR + `Remplacée par NNNN` |
| Modifier un `*-template.md` | le copier, ne jamais le modifier pour un document |
| Supprimer un document obsolète | changer son statut |
```

`.agents/skills/verifier-avant-de-livrer/SKILL.md` :

```markdown
---
name: verifier-avant-de-livrer
description: À utiliser avant de déclarer un travail terminé, de commiter une fonctionnalité ou d'ouvrir une PR sur ce dépôt — donne les commandes de vérification dans l'ordre et quoi faire quand l'une échoue.
---

# Vérifier avant de livrer

Aucune affirmation « c'est fait » sans la sortie des commandes ci-dessous.

## Dans l'ordre

1. `npm run verify` — lint, typecheck, règles de dépendance (`depcruise`), Vitest (unitaires et intégration). Prérequis : `make up`.
2. Si un parcours visible a changé : `npm run test:e2e` (ou `npm run verify:full`).
3. Si une route ou une réponse a changé : `docs/api/openapi.yaml` est à jour, et `npx vitest run tests/unit/openapi-coverage.test.ts` passe.
4. Si un skill a changé : `npm run agents:sync`.
5. Avant une PR importante : `make sonar` (runbook `docs/runbooks/sonarqube-analyse.md`) ; aucun nouveau bug ni nouvelle vulnérabilité.

## Quand ça échoue

| Échec | Cause probable | Que faire |
|---|---|---|
| `depcruise` | import qui traverse une frontière | passer par l'`index.ts` du module ou par un port |
| test `[as-is]` rouge | un défaut figé a été corrigé | si c'est voulu : modifier le test et retirer `[as-is]` ; sinon, annuler le changement |
| test d'intégration vide (`[]`) | requête hors portée RLS | passer par `withUserScope` / l'unité de travail |
| `openapi-coverage` | route ajoutée sans contrat | décrire la route dans `docs/api/openapi.yaml` |
| E2E en timeout | Docker non démarré | `make up` puis relancer |

## Résumé final attendu

Lister : ce qui a changé (fichiers), les commandes lancées avec leur résultat, et ce qui n'a pas été vérifié.
```

- [ ] **Étape 6 : script npm, copie et job CI**

Dans `package.json`, `scripts` : `"agents:sync": "node scripts/agents-sync.mjs"`.

Run : `npm run agents:sync && node scripts/agents-sync.mjs --check`
Attendu : `2 fichier(s) mis à jour dans .claude/skills.` puis `Skills synchronisés.`

Dans `.github/workflows/tests.yml`, dans le job `checks`, après `npm run typecheck`, ajouter :

```yaml
      - run: node scripts/agents-sync.mjs --check
      - run: npm run depcruise
```

- [ ] **Étape 7 : commit**

```bash
git add scripts/agents-sync.mjs tests/unit/agents-sync.test.ts .agents .claude/skills package.json .github/workflows/tests.yml
git commit -m "chore(refacto): skills du projet copiés vers .claude/skills, vérifiés en CI"
```

---

### Tâche 6 : `shared/config` et secret d'authentification (F25)

**Fichiers :**
- Créer : `src/shared/config.ts`, `tests/unit/config.test.ts`
- Modifier : `src/lib/auth.ts`, `tests/support/env.ts`

**Interfaces :**
- Produit : `loadConfig(env?: Record<string, string | undefined>): AppConfig`, `config(): AppConfig`, `interface AppConfig { authSecret: string }`. Le plan 3 y ajoute la configuration mail.

- [ ] **Étape 1 : écrire le test qui échoue**

`tests/unit/config.test.ts` :

```ts
import { describe, expect, it } from 'vitest'
import { loadConfig } from '@/shared/config'

const SECRET = 'a'.repeat(32)

describe('loadConfig', () => {
  it('lit AUTH_SECRET', () => {
    expect(loadConfig({ AUTH_SECRET: SECRET }).authSecret).toBe(SECRET)
  })

  it.each<[string, Record<string, string | undefined>]>([
    ['absent', {}],
    ['vide', { AUTH_SECRET: '' }],
    ['trop court (31 caractères)', { AUTH_SECRET: 'a'.repeat(31) }],
  ])('refuse un AUTH_SECRET %s', (_label, env) => {
    expect(() => loadConfig(env)).toThrow('AUTH_SECRET manquant ou trop court (32 caractères minimum)')
  })
})
```

- [ ] **Étape 2 : lancer, vérifier l'échec**

Run : `npx vitest run --project unit tests/unit/config.test.ts`
Attendu : FAIL, module `@/shared/config` introuvable.

- [ ] **Étape 3 : implémenter `src/shared/config.ts`**

```ts
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

let cached: AppConfig | undefined

export function config(): AppConfig {
  cached ??= loadConfig()
  return cached
}
```

- [ ] **Étape 4 : lancer, vérifier que ça passe**

Run : `npx vitest run --project unit tests/unit/config.test.ts`
Attendu : PASS (4 tests).

- [ ] **Étape 5 : `src/lib/auth.ts` sans secret en dur**

Remplacer :

```ts
// Généré une fois pour ce projet — pas besoin de le régénérer à chaque
// déploiement.
const AUTH_SECRET = 'e29f9c3b6a1d4e7f8021c5b6d4a9f0e3c7b8a2d1f6e5c4b3a2918273645fabcd'

export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: AUTH_SECRET,
```

par :

```ts
import { config } from '@/shared/config'

// Initialisation paresseuse : le secret est lu (et validé) à la première
// requête, pas au build.
export const { handlers, auth, signIn, signOut } = NextAuth(() => ({
  secret: config().authSecret,
```

et fermer l'appel par `}))` au lieu de `})` (dernière ligne du fichier).

- [ ] **Étape 6 : secret de test E2E**

Dans `tests/support/env.ts`, dans `E2E_ENV`, ajouter la ligne :

```ts
  AUTH_SECRET: 'secret-de-test-e2e-uniquement-0123456789',
```

- [ ] **Étape 7 : vérifier**

Run : `npm run typecheck && npm run test:e2e -- tests/e2e/auth.spec.ts`
Attendu : typecheck OK ; les E2E de connexion passent avec le secret lu depuis l'environnement.

- [ ] **Étape 8 : commit**

```bash
git add src/shared/config.ts tests/unit/config.test.ts src/lib/auth.ts tests/support/env.ts
git commit -m "fix(refacto): secret d'authentification lu depuis l'environnement (F25)"
```

---

### Tâche 7 : erreurs typées, `application/problem+json` et logs JSON (F26)

**Fichiers :**
- Créer : `src/shared/errors.ts`, `src/shared/problem.ts`, `src/shared/logger.ts`, `tests/unit/problem.test.ts`, `tests/unit/logger.test.ts`

**Interfaces :**
- Produit :
  - `abstract class AppError extends Error { status: number; slug: string; title: string; headers: Record<string, string> }`
  - `class Unauthenticated` (401, `error: "Unauthorized"`), `class Forbidden` (403, `error: "Unauthorized"`), `class NotFound` (404, `error: "Not found"`), `class InvalidInput(message)` (400), `class Conflict(slug, message)` (409), `class UpstreamFailure(slug, message)` (502), `class Unavailable(message, retryAfterSeconds)` (503, en-tête `retry-after`).
  - `interface ProblemBody { error: string; type: string; title: string; status: number; detail: string }`
  - `problemResponse(error: unknown, correlationId: string): Response`
  - `logger.info|warn|error(message: string, fields?: Record<string, unknown>): void`

- [ ] **Étape 1 : écrire les tests qui échouent**

`tests/unit/problem.test.ts` :

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  Conflict,
  Forbidden,
  InvalidInput,
  NotFound,
  Unauthenticated,
  Unavailable,
  UpstreamFailure,
} from '@/shared/errors'
import { problemResponse } from '@/shared/problem'

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('problemResponse', () => {
  it.each([
    [new Unauthenticated(), 401, 'Unauthorized', 'unauthenticated'],
    [new Forbidden(), 403, 'Unauthorized', 'forbidden'],
    [new NotFound(), 404, 'Not found', 'not-found'],
    [new InvalidInput('Champs invalides'), 400, 'Champs invalides', 'invalid-input'],
    [new Conflict('already-decided', 'Already decided'), 409, 'Already decided', 'already-decided'],
    [new UpstreamFailure('receipt-upload-failed', 'Stockage indisponible'), 502, 'Stockage indisponible', 'receipt-upload-failed'],
  ])('%s → %i, error gardé, problem+json', async (error, status, message, slug) => {
    const response = problemResponse(error, 'corr-1')
    expect(response.status).toBe(status)
    expect(response.headers.get('content-type')).toBe('application/problem+json')
    expect(response.headers.get('x-correlation-id')).toBe('corr-1')
    expect(await response.json()).toEqual({
      error: message,
      type: `https://expense.io/problems/${slug}`,
      title: expect.any(String),
      status,
      detail: message,
    })
  })

  it('503 porte Retry-After', () => {
    const response = problemResponse(new Unavailable('OCR saturé', 5), 'c')
    expect(response.status).toBe(503)
    expect(response.headers.get('retry-after')).toBe('5')
  })

  it('erreur inconnue : 500 sans stack ni message interne, journalisée avec la référence', async () => {
    const response = problemResponse(new Error('column "nope" does not exist'), 'corr-2')
    expect(response.status).toBe(500)
    const body = await response.json()
    expect(body).toEqual({
      error: 'Erreur interne',
      type: 'https://expense.io/problems/internal',
      title: 'Erreur interne',
      status: 500,
      detail: 'Une erreur interne est survenue. Référence : corr-2',
    })
    expect(JSON.stringify(body)).not.toContain('nope')
    const logged = JSON.parse(vi.mocked(console.error).mock.calls[0][0] as string)
    expect(logged).toMatchObject({ level: 'error', correlationId: 'corr-2' })
    expect(logged.error.message).toBe('column "nope" does not exist')
  })
})
```

`tests/unit/logger.test.ts` :

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { logger } from '@/shared/logger'

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('logger', () => {
  it('écrit une ligne JSON sur stdout pour info', () => {
    logger.info('note décidée', { correlationId: 'c1', noteId: 'n1' })
    const line = JSON.parse(vi.mocked(console.log).mock.calls[0][0] as string)
    expect(line).toEqual({
      time: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
      level: 'info',
      message: 'note décidée',
      correlationId: 'c1',
      noteId: 'n1',
    })
  })

  it('écrit les erreurs sur stderr et sérialise une Error', () => {
    const error = new Error('boum')
    logger.error('échec', { error })
    const line = JSON.parse(vi.mocked(console.error).mock.calls[0][0] as string)
    expect(line.error).toEqual({ name: 'Error', message: 'boum', stack: error.stack })
  })
})
```

- [ ] **Étape 2 : lancer, vérifier l'échec**

Run : `npx vitest run --project unit tests/unit/problem.test.ts tests/unit/logger.test.ts`
Attendu : FAIL, modules introuvables.

- [ ] **Étape 3 : `src/shared/logger.ts`**

```ts
// Logs JSON, une ligne par événement : lisibles par un agrégateur, et le
// correlationId relie la requête HTTP, l'outbox et le worker.
type Level = 'info' | 'warn' | 'error'
type Fields = Record<string, unknown>

function serialize(value: unknown): unknown {
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack }
  }
  return value
}

function log(level: Level, message: string, fields: Fields = {}): void {
  const entry: Fields = { time: new Date().toISOString(), level, message }
  for (const [key, value] of Object.entries(fields)) entry[key] = serialize(value)
  const line = JSON.stringify(entry)
  if (level === 'error') console.error(line)
  else console.log(line)
}

export const logger = {
  info: (message: string, fields?: Fields) => log('info', message, fields),
  warn: (message: string, fields?: Fields) => log('warn', message, fields),
  error: (message: string, fields?: Fields) => log('error', message, fields),
}
```

- [ ] **Étape 4 : `src/shared/errors.ts`**

```ts
// Erreurs applicatives typées. Le message est le champ `error` historique de
// l'API : il ne change pas (ADR 0004). La traduction HTTP est dans problem.ts.
export abstract class AppError extends Error {
  abstract readonly status: number
  abstract readonly slug: string
  abstract readonly title: string
  readonly headers: Record<string, string> = {}

  constructor(message: string) {
    super(message)
    this.name = new.target.name
  }
}

/** Pas de session, ou session d'un compte qui n'existe plus. */
export class Unauthenticated extends AppError {
  readonly status = 401
  readonly slug = 'unauthenticated'
  readonly title = 'Authentification requise'
  constructor() {
    super('Unauthorized')
  }
}

/** Session valide, mais rôle insuffisant. */
export class Forbidden extends AppError {
  readonly status = 403
  readonly slug = 'forbidden'
  readonly title = 'Accès refusé'
  constructor() {
    super('Unauthorized')
  }
}

export class NotFound extends AppError {
  readonly status = 404
  readonly slug = 'not-found'
  readonly title = 'Ressource introuvable'
  constructor() {
    super('Not found')
  }
}

export class InvalidInput extends AppError {
  readonly status = 400
  readonly slug = 'invalid-input'
  readonly title = 'Requête invalide'
}

export class Conflict extends AppError {
  readonly status = 409
  readonly title = 'Conflit'
  constructor(
    readonly slug: string,
    message: string
  ) {
    super(message)
  }
}

/** Une dépendance (S3…) a échoué : la requête n'a rien écrit. */
export class UpstreamFailure extends AppError {
  readonly status = 502
  readonly title = 'Dépendance indisponible'
  constructor(
    readonly slug: string,
    message: string
  ) {
    super(message)
  }
}

export class Unavailable extends AppError {
  readonly status = 503
  readonly slug = 'unavailable'
  readonly title = 'Service momentanément indisponible'
  constructor(message: string, retryAfterSeconds: number) {
    super(message)
    this.headers['retry-after'] = String(retryAfterSeconds)
  }
}
```

- [ ] **Étape 5 : `src/shared/problem.ts`**

```ts
// Traduction d'une erreur en réponse RFC 9457 (application/problem+json).
// Additif : le champ historique `error` est conservé (ADR 0004).
import { AppError } from './errors'
import { logger } from './logger'

const PROBLEM_BASE = 'https://expense.io/problems/'

export interface ProblemBody {
  error: string
  type: string
  title: string
  status: number
  detail: string
}

function problem(status: number, body: ProblemBody, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/problem+json', ...headers },
  })
}

export function problemResponse(error: unknown, correlationId: string): Response {
  if (error instanceof AppError) {
    return problem(
      error.status,
      {
        error: error.message,
        type: `${PROBLEM_BASE}${error.slug}`,
        title: error.title,
        status: error.status,
        detail: error.message,
      },
      { ...error.headers, 'x-correlation-id': correlationId }
    )
  }
  // Jamais de stack ni de message interne vers le client (F26) : seulement dans les logs.
  logger.error('Erreur non gérée', { correlationId, error })
  return problem(
    500,
    {
      error: 'Erreur interne',
      type: `${PROBLEM_BASE}internal`,
      title: 'Erreur interne',
      status: 500,
      detail: `Une erreur interne est survenue. Référence : ${correlationId}`,
    },
    { 'x-correlation-id': correlationId }
  )
}
```

- [ ] **Étape 6 : lancer, vérifier que ça passe**

Run : `npx vitest run --project unit tests/unit/problem.test.ts tests/unit/logger.test.ts`
Attendu : PASS.

- [ ] **Étape 7 : commit**

```bash
git add src/shared/errors.ts src/shared/problem.ts src/shared/logger.ts tests/unit/problem.test.ts tests/unit/logger.test.ts
git commit -m "feat(refacto): erreurs typées, réponses RFC 9457 sans stack et logs JSON (F26)"
```

---

### Tâche 8 : `shared/http` — enrobage des routes, gardes, corps bornés (F27, F34, F42, F43)

**Fichiers :**
- Créer : `src/shared/http.ts`, `tests/unit/http.test.ts`

**Interfaces :**
- Consomme : `AppError` et ses sous-classes, `problemResponse` (tâche 7), `auth` de `@/lib/auth`.
- Produit :
  - `route<C = undefined>(handler: (request: Request, context: C, meta: { correlationId: string }) => Promise<Response>): (request?: Request, context?: C) => Promise<Response>`
  - `interface RouteContext<P> { params: Promise<P> }`
  - `type Role = 'employee' | 'manager' | 'hr_admin'` ; `interface SessionUser { id: string; email: string; role: Role }`
  - `requireSession(): Promise<SessionUser>` (lève `Unauthenticated`)
  - `requireRole(user: SessionUser, role: Role): void` (lève `Forbidden`)
  - `parseUuid(value: string): string` (lève `InvalidInput('Identifiant invalide')`)
  - `readBodyWithLimit(request: Request, maxBytes: number, tooLargeMessage: string): Promise<Uint8Array<ArrayBuffer>>`
  - `readFormData(request: Request, maxBytes: number, tooLargeMessage: string): Promise<FormData>`
  - `readJsonObject(request: Request, maxBytes?: number): Promise<Record<string, unknown>>`
  - constantes `MAX_RECEIPT_BYTES = 10 * 1024 * 1024`, `MULTIPART_OVERHEAD_BYTES = 64 * 1024`, `MAX_JSON_BYTES = 64 * 1024`

- [ ] **Étape 1 : écrire le test qui échoue**

`tests/unit/http.test.ts` :

```ts
import type { Session } from 'next-auth'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { auth } from '@/lib/auth'
import { InvalidInput, NotFound } from '@/shared/errors'
import {
  parseUuid,
  readBodyWithLimit,
  readFormData,
  readJsonObject,
  requireRole,
  requireSession,
  route,
} from '@/shared/http'

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }))
const authMock = auth as unknown as Mock<() => Promise<Session | null>>

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
  authMock.mockReset()
})

const url = 'http://localhost/api/x'

describe('route', () => {
  it('renvoie la réponse du handler et l’identifiant de corrélation reçu', async () => {
    const handler = route(async () => Response.json({ ok: true }))
    const response = await handler(new Request(url, { headers: { 'x-correlation-id': 'abc' } }))
    expect(await response.json()).toEqual({ ok: true })
    expect(response.headers.get('x-correlation-id')).toBe('abc')
  })

  it('accepte un appel sans requête (listes appelées par `GET()` dans les tests)', async () => {
    const response = await route(async () => Response.json([]))()
    expect(await response.json()).toEqual([])
  })

  it('génère un identifiant de corrélation absent', async () => {
    const response = await route(async () => Response.json({}))(new Request(url))
    expect(response.headers.get('x-correlation-id')).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('traduit une AppError rejetée de façon asynchrone (F43)', async () => {
    const handler = route(async () => Promise.reject(new NotFound()))
    const response = await handler(new Request(url))
    expect(response.status).toBe(404)
    expect((await response.json()).error).toBe('Not found')
  })

  it('transmet le contexte de route', async () => {
    const handler = route(async (_request, context: { params: Promise<{ id: string }> }) =>
      Response.json(await context.params)
    )
    const response = await handler(new Request(url), { params: Promise.resolve({ id: '1' }) })
    expect(await response.json()).toEqual({ id: '1' })
  })
})

describe('requireSession / requireRole', () => {
  it('sans session : Unauthenticated (401)', async () => {
    authMock.mockResolvedValue(null)
    await expect(requireSession()).rejects.toMatchObject({ status: 401 })
  })

  it('renvoie l’utilisateur de la session', async () => {
    authMock.mockResolvedValue({ user: { id: 'u', email: 'e@x.fr', role: 'manager' }, expires: '2999' })
    expect(await requireSession()).toEqual({ id: 'u', email: 'e@x.fr', role: 'manager' })
  })

  it('mauvais rôle : Forbidden (403)', () => {
    expect(() => requireRole({ id: 'u', email: 'e', role: 'employee' }, 'manager')).toThrow(
      expect.objectContaining({ status: 403 })
    )
  })
})

describe('parseUuid', () => {
  it('accepte un UUID', () => {
    expect(parseUuid('00000000-0000-4000-8000-000000000000')).toBe('00000000-0000-4000-8000-000000000000')
  })

  it.each(['abc', '1', "' OR 1=1 --", ''])('refuse « %s » (400)', (value) => {
    expect(() => parseUuid(value)).toThrow(new InvalidInput('Identifiant invalide'))
  })
})

function streamOf(totalBytes: number, chunkBytes: number) {
  let sent = 0
  let pulled = false
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      pulled = true
      if (sent >= totalBytes) return controller.close()
      const size = Math.min(chunkBytes, totalBytes - sent)
      sent += size
      controller.enqueue(new Uint8Array(size))
    },
  })
  return { stream, wasPulled: () => pulled }
}

describe('readBodyWithLimit (F34)', () => {
  it('refuse sans lire le corps si Content-Length dépasse la limite', async () => {
    const { stream, wasPulled } = streamOf(10, 10)
    const request = new Request(url, {
      method: 'POST',
      body: stream,
      headers: { 'content-length': '2000' },
      duplex: 'half',
    } as RequestInit)
    await expect(readBodyWithLimit(request, 1000, 'Fichier trop volumineux')).rejects.toThrow(
      new InvalidInput('Fichier trop volumineux')
    )
    expect(wasPulled()).toBe(false)
  })

  it('coupe un flux sans Content-Length qui dépasse la limite', async () => {
    const { stream } = streamOf(2 * 1024 * 1024, 64 * 1024)
    const request = new Request(url, { method: 'POST', body: stream, duplex: 'half' } as RequestInit)
    await expect(readBodyWithLimit(request, 1024 * 1024, 'Fichier trop volumineux')).rejects.toThrow(
      'Fichier trop volumineux'
    )
  })

  it('renvoie le corps entier sous la limite', async () => {
    const request = new Request(url, { method: 'POST', body: 'bonjour' })
    expect(new TextDecoder().decode(await readBodyWithLimit(request, 100, 'trop'))).toBe('bonjour')
  })
})

describe('readFormData / readJsonObject (F42)', () => {
  it('lit un multipart', async () => {
    const form = new FormData()
    form.set('a', '1')
    const data = await readFormData(new Request(url, { method: 'POST', body: form }), 1000, 'trop')
    expect(data.get('a')).toBe('1')
  })

  it.each<[string, RequestInit]>([
    ['corps JSON', { method: 'POST', body: '{}', headers: { 'content-type': 'application/json' } }],
    ['corps vide sans Content-Type', { method: 'POST' }],
    ['multipart malformé', { method: 'POST', body: 'x', headers: { 'content-type': 'multipart/form-data; boundary=z' } }],
  ])('formulaire illisible (%s) → 400 « Corps de requête invalide »', async (_label, init) => {
    await expect(readFormData(new Request(url, init), 1000, 'trop')).rejects.toThrow(
      new InvalidInput('Corps de requête invalide')
    )
  })

  it('lit un objet JSON', async () => {
    const request = new Request(url, { method: 'PUT', body: '{"managerId":null}' })
    expect(await readJsonObject(request)).toEqual({ managerId: null })
  })

  it.each(['pas du json', '', '[]', '42', 'null'])('JSON « %s » qui n’est pas un objet → 400', async (body) => {
    await expect(readJsonObject(new Request(url, { method: 'PUT', body }))).rejects.toThrow(
      new InvalidInput('Corps de requête invalide')
    )
  })
})
```

- [ ] **Étape 2 : lancer, vérifier l'échec**

Run : `npx vitest run --project unit tests/unit/http.test.ts`
Attendu : FAIL, module `@/shared/http` introuvable.

- [ ] **Étape 3 : implémenter `src/shared/http.ts`**

```ts
// Outils des adapters d'entrée HTTP : enrobage commun des route handlers
// (corrélation, traduction des erreurs), gardes de session et de rôle,
// lecture bornée du corps.
import { randomUUID } from 'node:crypto'
import { auth } from '@/lib/auth'
import { Forbidden, InvalidInput, Unauthenticated } from './errors'
import { problemResponse } from './problem'

export const MAX_RECEIPT_BYTES = 10 * 1024 * 1024
/** Marge du multipart au-delà du fichier : délimiteurs, en-têtes, champs texte. */
export const MULTIPART_OVERHEAD_BYTES = 64 * 1024
export const MAX_JSON_BYTES = 64 * 1024

export type Role = 'employee' | 'manager' | 'hr_admin'

export interface SessionUser {
  id: string
  email: string
  role: Role
}

export interface RouteContext<P> {
  params: Promise<P>
}

interface RouteMeta {
  correlationId: string
}

/**
 * Enrobe un route handler : toute erreur, même rejetée de façon asynchrone
 * (F43), devient une réponse RFC 9457 ; l'identifiant de corrélation est lu
 * dans `x-correlation-id` ou généré, et renvoyé dans la réponse.
 */
export function route<C = undefined>(
  handler: (request: Request, context: C, meta: RouteMeta) => Promise<Response>
) {
  // Paramètres optionnels : les tests d'intégration appellent `GET()` sans
  // requête pour les listes ; Next.js, lui, passe toujours les deux.
  return async (
    request: Request = new Request('http://localhost/'),
    context: C = undefined as C
  ): Promise<Response> => {
    const correlationId = request.headers.get('x-correlation-id') ?? randomUUID()
    try {
      const response = await handler(request, context, { correlationId })
      response.headers.set('x-correlation-id', correlationId)
      return response
    } catch (error) {
      return problemResponse(error, correlationId)
    }
  }
}

export async function requireSession(): Promise<SessionUser> {
  const session = await auth()
  if (!session?.user?.id) throw new Unauthenticated()
  const { id, email, role } = session.user
  return { id, email: email ?? '', role }
}

export function requireRole(user: SessionUser, role: Role): void {
  if (user.role !== role) throw new Forbidden()
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function parseUuid(value: string): string {
  if (!UUID_PATTERN.test(value)) throw new InvalidInput('Identifiant invalide')
  return value
}

/**
 * Lit le corps sans jamais dépasser `maxBytes` (F34) : refus immédiat si
 * Content-Length annonce plus, sinon lecture du flux interrompue au dépassement.
 */
export async function readBodyWithLimit(
  request: Request,
  maxBytes: number,
  tooLargeMessage: string
): Promise<Uint8Array<ArrayBuffer>> {
  const declared = request.headers.get('content-length')
  if (declared !== null && Number(declared) > maxBytes) throw new InvalidInput(tooLargeMessage)
  if (!request.body) return new Uint8Array(new ArrayBuffer(0))

  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > maxBytes) {
      await reader.cancel()
      throw new InvalidInput(tooLargeMessage)
    }
    chunks.push(value)
  }
  const bytes = new Uint8Array(new ArrayBuffer(total))
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return bytes
}

export async function readFormData(
  request: Request,
  maxBytes: number,
  tooLargeMessage: string
): Promise<FormData> {
  const bytes = await readBodyWithLimit(request, maxBytes, tooLargeMessage)
  const contentType = request.headers.get('content-type') ?? ''
  try {
    return await new Response(bytes, { headers: { 'content-type': contentType } }).formData()
  } catch {
    throw new InvalidInput('Corps de requête invalide')
  }
}

export async function readJsonObject(
  request: Request,
  maxBytes = MAX_JSON_BYTES
): Promise<Record<string, unknown>> {
  const bytes = await readBodyWithLimit(request, maxBytes, 'Corps de requête invalide')
  let parsed: unknown
  try {
    parsed = JSON.parse(new TextDecoder().decode(bytes))
  } catch {
    throw new InvalidInput('Corps de requête invalide')
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new InvalidInput('Corps de requête invalide')
  }
  return parsed as Record<string, unknown>
}
```

- [ ] **Étape 4 : lancer, vérifier que ça passe**

Run : `npx vitest run --project unit tests/unit/http.test.ts`
Attendu : PASS. Si le test « Content-Length » échoue parce que le runtime ignore l'en-tête `content-length` posé sur une `Request`, remplacer dans ce test l'en-tête par `'x-test': '1'` et construire la requête avec `new Request(url, { method: 'POST', body: stream, duplex: 'half', headers: new Headers({ 'content-length': '2000' }) })` ; si l'en-tête est toujours filtré, garder seulement le test du flux et le signaler dans le commit.

- [ ] **Étape 5 : commit**

```bash
git add src/shared/http.ts tests/unit/http.test.ts
git commit -m "feat(refacto): shared/http, enrobage des routes, gardes et corps bornés"
```

---

### Tâche 9 : toutes les routes passent par `shared/http` (F1, F26, F27, F34, F41, F42, F43)

Cette tâche réécrit les 14 routes avec `route()`, les gardes de rôle et la lecture bornée, et fait basculer les tests correspondants. Le SQL ne change pas, sauf pour F1 (`manager/…/receipt-url`) et F41 (`PUT …/manager`).

**Fichiers :**
- Modifier : les 14 `src/app/api/**/route.ts` (hors `auth/[...nextauth]`), `docs/api/openapi.yaml`, `tests/integration/helpers/http.ts`, tous les fichiers de `tests/integration/api/`, `tests/integration/workflow.test.ts`, `tests/e2e/api-auth.spec.ts`
- Supprimer : `src/lib/errors.ts`, `tests/unit/errors.test.ts`

**Interfaces :**
- Consomme : `route`, `requireSession`, `requireRole`, `parseUuid`, `readFormData`, `readJsonObject`, `MAX_RECEIPT_BYTES`, `MULTIPART_OVERHEAD_BYTES`, `RouteContext` (tâche 8) ; `InvalidInput`, `NotFound`, `Conflict`, `UpstreamFailure` (tâche 7).
- Produit : helper de test `expectProblem(response: Response, status: number, error: string): Promise<ProblemBody>`.

- [ ] **Étape 1 : helper de test `expectProblem`**

Dans `tests/integration/helpers/http.ts`, remplacer l'interface `ErrorBody` par :

```ts
export interface ProblemBody {
  error: string
  type: string
  title: string
  status: number
  detail: string
}

/** Réponse d'erreur RFC 9457 : code, champ `error` historique, jamais de stack. */
export async function expectProblem(response: Response, status: number, error: string): Promise<ProblemBody> {
  expect(response.status).toBe(status)
  expect(response.headers.get('content-type')).toBe('application/problem+json')
  const body = await readJson<ProblemBody>(response)
  expect(body).toMatchObject({ error, status })
  expect(body).not.toHaveProperty('stack')
  return body
}
```

et ajouter `import { expect } from 'vitest'` en tête du fichier.

- [ ] **Étape 2 : faire basculer les tests (ils échouent)**

Règle mécanique, dans tous les fichiers de `tests/integration/` : chaque paire

```ts
expect(response.status).toBe(CODE)
expect(await response.json()).toEqual({ error: 'MESSAGE' })
```

devient `await expectProblem(response, CODE, 'MESSAGE')`, et `ErrorBody` est remplacé par `ProblemBody` dans les imports. Puis appliquer les changements de comportement suivants (le libellé du test change aussi, l'étiquette `[as-is]` disparaît) :

| Fichier | Test actuel | Nouveau test |
|---|---|---|
| `expense-notes.test.ts` | `[as-is] colonne inconnue dans ?sort= : erreur SQL non interceptée` | « colonne inconnue dans ?sort= : 500 générique, sans détail SQL » : `await expectProblem(await GET(request('/api/expense-notes?sort=nope')), 500, 'Erreur interne')` (bascule à nouveau en tâche 13) |
| `expense-notes.test.ts` | `[as-is] requêtes multiples dans ?sort= …` | même transformation : `expectProblem(…, 500, 'Erreur interne')` puis `expect(await countRows('users')).toBe(3)` |
| `expense-notes.test.ts` | `[as-is] montant %s hors numeric(10,2) → 500 « numeric field overflow »` | garde `[as-is]` (F13 hors périmètre), libellé « … → 500 générique » : `await expectProblem(response, 500, 'Erreur interne')` |
| `expense-notes.test.ts` | `[as-is] date « %s » non validée par l'app → 500 Postgres` | garde `[as-is]` (F32), `await expectProblem(response, 500, 'Erreur interne')` ; le paramètre `message` est retiré du `it.each` |
| `expense-notes.test.ts` | `[as-is] corps JSON au lieu de multipart → 500` | « corps JSON au lieu de multipart → 400 » : `await expectProblem(response, 400, 'Corps de requête invalide')` |
| `expense-notes.test.ts` | `[as-is] corps vide sans Content-Type → 500` | « corps vide sans Content-Type → 400 », même assertion |
| `expense-notes.test.ts` | `[as-is] multipart malformé → 500 avec stack` | « multipart malformé → 400 », même assertion |
| `expense-notes-s3-failure.test.ts` | inchangé dans cette tâche (bascule au plan 2, F10) | remplacer seulement l'assertion de corps par `await expectProblem(response, 500, 'Erreur interne')` |
| `receipt-suggestion.test.ts` | `[as-is] corps JSON → 500 avec stack` | « corps JSON → 400 » : `expectProblem(response, 400, 'Corps de requête invalide')` |
| `receipt-suggestion.test.ts` | `[as-is] aucune limite de taille : un reçu de 11 Mo est passé à l'OCR` | inchangé ici (F19 au plan 2) — le corps de 11 Mo dépasse la limite multipart : remplacer la taille par `10 * 1024 * 1024` et le libellé par « [as-is] aucune limite propre à l'OCR : un reçu de 10 Mo est passé à l'OCR » |
| `manager-*.test.ts` (3 fichiers) | `[as-is] mauvais rôle employee/hr_admin → 401 et non 403` | « mauvais rôle … → 403 » : `expectProblem(response, 403, 'Unauthorized')` ; le cas anonyme reste 401 |
| `hr-*.test.ts` (5 fichiers) | `[as-is] anonyme → 403 et non 401` | « anonyme → 401 » : `expectProblem(response, 401, 'Unauthorized')` ; les mauvais rôles restent 403 |
| `*-receipt-url.test.ts`, `hr-user-manager.test.ts` | `[as-is] id/cible « %s » non-UUID → 500 avec stack` | « … non-UUID → 400 » : `expectProblem(response, 400, 'Identifiant invalide')` |
| `manager-decisions.test.ts`, `hr-decisions.test.ts` | `[as-is] id « %s » non-UUID : erreur SQL non interceptée` | « id « %s » non-UUID → 400 » : `await expectProblem(await decide(id), 400, 'Identifiant invalide')` |
| `manager-receipt-url.test.ts` | `[as-is] reçu servi sans contrôle de rattachement : %s` | F1, deux tests : « 404 : employé non rattaché de la même entreprise / employé d'une autre entreprise » → `expectProblem(response, 404, 'Not found')` ; « note déjà approuvée d'un rattaché : URL servie » → 200 |
| `hr-user-manager.test.ts` | `[as-is] %s : détachement silencieux` (4 cas) | F41, « %s → 400, rattachement inchangé » : `await expectProblem(response, 400, 'Corps de requête invalide')` puis `expect(await managerIdOf(org.employee.id)).toBe(org.manager.id)` |
| `hr-user-manager.test.ts` | `[as-is] managerId %j de mauvais type → 500 avec stack` | « managerId %j de mauvais type → 400 » : `expectProblem(response, 400, 'Corps de requête invalide')` |
| `workflow.test.ts` | `[as-is] un employé promu en base reste refusé tant que sa session dit « employee »` | garde `[as-is]` (F31 au plan 2) ; statut attendu `403` au lieu de `401` |

Run : `npm test`
Attendu : FAIL sur les tests modifiés (les routes renvoient encore l'ancien format).

- [ ] **Étape 3 : réécrire les routes**

`src/app/api/expense-notes/route.ts` :

```ts
import path from 'node:path'
import { getPool, withUserScope } from '@/lib/db'
import { receiptKeyFor, uploadReceipt } from '@/lib/storage'
import { InvalidInput } from '@/shared/errors'
import {
  MAX_RECEIPT_BYTES,
  MULTIPART_OVERHEAD_BYTES,
  readFormData,
  requireSession,
  route,
} from '@/shared/http'

const ALLOWED_RECEIPT_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'application/pdf']

const EXTENSION_BY_MIME: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'application/pdf': '.pdf',
}

function toExpenseNote(row: Record<string, unknown>) {
  return {
    id: row.id,
    userId: row.user_id,
    amount: Number.parseFloat(row.amount as string),
    expenseDate: row.expense_date,
    description: row.description,
    receiptKey: row.receipt_key,
    status: row.status,
    createdAt: new Date(row.created_at as string).toISOString(),
  }
}

export const GET = route(async (request) => {
  const user = await requireSession()
  const url = new URL(request.url)
  // F3 corrigé en tâche 13 (liste blanche).
  const sort = url.searchParams.get('sort') || 'created_at DESC'

  return withUserScope(user.id, async (client) => {
    const result = await client.query(
      `SELECT * FROM expense_notes WHERE user_id = $1 ORDER BY ${sort}`,
      [user.id]
    )
    return Response.json(result.rows.map(toExpenseNote))
  })
})

export const POST = route(async (request) => {
  const user = await requireSession()
  const formData = await readFormData(
    request,
    MAX_RECEIPT_BYTES + MULTIPART_OVERHEAD_BYTES,
    'Fichier trop volumineux'
  )
  const amountRaw = formData.get('amount')
  const expenseDate = formData.get('expenseDate')
  const description = formData.get('description')
  const receipt = formData.get('receipt')

  const amount = typeof amountRaw === 'string' ? Number.parseFloat(amountRaw) : NaN

  if (
    !Number.isFinite(amount) ||
    amount <= 0 ||
    typeof expenseDate !== 'string' ||
    typeof description !== 'string' ||
    description.trim().length === 0 ||
    !(receipt instanceof File)
  ) {
    throw new InvalidInput('Champs invalides')
  }
  if (!ALLOWED_RECEIPT_TYPES.includes(receipt.type)) {
    throw new InvalidInput('Type de fichier non autorisé pour le reçu')
  }
  if (receipt.size > MAX_RECEIPT_BYTES) {
    throw new InvalidInput('Fichier trop volumineux')
  }

  const note = await withUserScope(user.id, async (client) => {
    const inserted = await client.query(
      `INSERT INTO expense_notes (user_id, amount, expense_date, description, receipt_key)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [user.id, amount, expenseDate, description, '']
    )
    return inserted.rows[0]
  })

  const extension = EXTENSION_BY_MIME[receipt.type] ?? path.extname(receipt.name) ?? ''
  const receiptKey = receiptKeyFor(note.receipt_seq, extension)
  const buffer = Buffer.from(await receipt.arrayBuffer())
  await uploadReceipt(receiptKey, buffer, receipt.type)

  // Passe sous la portée RLS en tâche 11 ; ordre S3 puis note au plan 2 (F10).
  const updated = await getPool().query(
    `UPDATE expense_notes SET receipt_key = $1 WHERE id = $2 RETURNING *`,
    [receiptKey, note.id]
  )

  return Response.json(toExpenseNote(updated.rows[0]), { status: 201 })
})
```

`src/app/api/expense-notes/[id]/receipt-url/route.ts` :

```ts
import { withUserScope } from '@/lib/db'
import { getReceiptUrl } from '@/lib/storage'
import { NotFound } from '@/shared/errors'
import { parseUuid, requireSession, route, type RouteContext } from '@/shared/http'

export const GET = route(async (_request, { params }: RouteContext<{ id: string }>) => {
  const user = await requireSession()
  const id = parseUuid((await params).id)

  const note = await withUserScope(user.id, async (client) => {
    const result = await client.query(
      'SELECT receipt_key FROM expense_notes WHERE id = $1 AND user_id = $2',
      [id, user.id]
    )
    return result.rows[0]
  })
  if (!note) throw new NotFound()

  return Response.json({ url: await getReceiptUrl(note.receipt_key) })
})
```

`src/app/api/expense-notes/receipt-suggestion/route.ts` :

```ts
import { suggestFields } from '@/lib/ocr'
import { InvalidInput } from '@/shared/errors'
import {
  MAX_RECEIPT_BYTES,
  MULTIPART_OVERHEAD_BYTES,
  readFormData,
  requireSession,
  route,
} from '@/shared/http'

export const POST = route(async (request) => {
  await requireSession()
  const formData = await readFormData(
    request,
    MAX_RECEIPT_BYTES + MULTIPART_OVERHEAD_BYTES,
    'Fichier trop volumineux'
  )
  const receipt = formData.get('receipt')
  if (!(receipt instanceof File)) throw new InvalidInput('Champs invalides')

  const buffer = Buffer.from(await receipt.arrayBuffer())
  return Response.json(await suggestFields({ data: buffer, mimeType: receipt.type }))
})
```

`src/app/api/manager/expense-notes/route.ts` (seul le haut et l'enrobage changent) :

```ts
import { withUserScope } from '@/lib/db'
import { requireRole, requireSession, route } from '@/shared/http'

function toExpenseNote(row: Record<string, unknown>) {
  return {
    id: row.id,
    userId: row.user_id,
    amount: Number.parseFloat(row.amount as string),
    expenseDate: row.expense_date,
    description: row.description,
    receiptKey: row.receipt_key,
    status: row.status,
    createdAt: new Date(row.created_at as string).toISOString(),
  }
}

export const GET = route(async () => {
  const user = await requireSession()
  requireRole(user, 'manager')

  return withUserScope(user.id, async (client) => {
    const result = await client.query(
      `SELECT en.* FROM expense_notes en
       JOIN users u ON u.id = en.user_id
       WHERE u.manager_id = $1 AND en.status = 'pending'
       ORDER BY en.created_at ASC`,
      [user.id]
    )
    return Response.json(result.rows.map(toExpenseNote))
  })
})
```

`src/app/api/hr/expense-notes/route.ts` : même structure que la route manager ci-dessus (même `toExpenseNote`, `route`, `requireSession`), avec `requireRole(user, 'hr_admin')` et la requête inchangée :

```ts
export const GET = route(async () => {
  const user = await requireSession()
  requireRole(user, 'hr_admin')

  return withUserScope(user.id, async (client) => {
    const result = await client.query(
      `SELECT en.* FROM expense_notes en
       JOIN users u ON u.id = en.user_id
       WHERE u.role = 'manager' AND u.manager_id IS NULL AND en.status = 'pending'
         AND u.company_id = (SELECT company_id FROM users WHERE id = $1)
       ORDER BY en.created_at ASC`,
      [user.id]
    )
    return Response.json(result.rows.map(toExpenseNote))
  })
})
```

`src/app/api/manager/expense-notes/[id]/approve/route.ts` :

```ts
import { withUserScope } from '@/lib/db'
import { Conflict, NotFound } from '@/shared/errors'
import { parseUuid, requireRole, requireSession, route, type RouteContext } from '@/shared/http'

export const POST = route(async (_request, { params }: RouteContext<{ id: string }>) => {
  const user = await requireSession()
  requireRole(user, 'manager')
  const id = parseUuid((await params).id)

  return withUserScope(user.id, async (client) => {
    const existing = await client.query(
      `SELECT en.* FROM expense_notes en
       JOIN users u ON u.id = en.user_id
       WHERE en.id = $1 AND u.manager_id = $2`,
      [id, user.id]
    )
    const row = existing.rows[0]
    if (!row) throw new NotFound()
    if (row.status !== 'pending') throw new Conflict('already-decided', 'Already decided')

    const updated = await client.query(
      `UPDATE expense_notes SET status = 'approved' WHERE id = $1 RETURNING *`,
      [id]
    )
    const note = updated.rows[0]
    return Response.json({
      id: note.id,
      userId: note.user_id,
      amount: Number.parseFloat(note.amount),
      expenseDate: note.expense_date,
      description: note.description,
      receiptKey: note.receipt_key,
      status: note.status,
      createdAt: new Date(note.created_at).toISOString(),
    })
  })
})
```

`src/app/api/manager/expense-notes/[id]/reject/route.ts` : exactement le fichier précédent, avec `status = 'rejected'` dans l'`UPDATE`.

`src/app/api/hr/expense-notes/[id]/approve/route.ts` :

```ts
import { withUserScope } from '@/lib/db'
import { Conflict, NotFound } from '@/shared/errors'
import { parseUuid, requireRole, requireSession, route, type RouteContext } from '@/shared/http'

export const POST = route(async (_request, { params }: RouteContext<{ id: string }>) => {
  const user = await requireSession()
  requireRole(user, 'hr_admin')
  const id = parseUuid((await params).id)

  return withUserScope(user.id, async (client) => {
    const existing = await client.query(
      `SELECT en.* FROM expense_notes en
       JOIN users u ON u.id = en.user_id
       WHERE en.id = $1 AND u.role = 'manager' AND u.manager_id IS NULL
         AND u.company_id = (SELECT company_id FROM users WHERE id = $2)`,
      [id, user.id]
    )
    const row = existing.rows[0]
    if (!row) throw new NotFound()
    if (row.status !== 'pending') throw new Conflict('already-decided', 'Already decided')

    const updated = await client.query(
      `UPDATE expense_notes SET status = 'approved' WHERE id = $1 RETURNING *`,
      [id]
    )
    const note = updated.rows[0]
    return Response.json({
      id: note.id,
      userId: note.user_id,
      amount: Number.parseFloat(note.amount),
      expenseDate: note.expense_date,
      description: note.description,
      receiptKey: note.receipt_key,
      status: note.status,
      createdAt: new Date(note.created_at).toISOString(),
    })
  })
})
```

`src/app/api/hr/expense-notes/[id]/reject/route.ts` : exactement le fichier précédent, avec `status = 'rejected'`.

`src/app/api/manager/expense-notes/[id]/receipt-url/route.ts` (F1 : contrôle du rattachement) :

```ts
import { withUserScope } from '@/lib/db'
import { getReceiptUrl } from '@/lib/storage'
import { NotFound } from '@/shared/errors'
import { parseUuid, requireRole, requireSession, route, type RouteContext } from '@/shared/http'

export const GET = route(async (_request, { params }: RouteContext<{ id: string }>) => {
  const user = await requireSession()
  requireRole(user, 'manager')
  const id = parseUuid((await params).id)

  // F1 : seulement les notes des subordonnés directs, quel que soit leur statut.
  const note = await withUserScope(user.id, async (client) => {
    const result = await client.query(
      `SELECT en.receipt_key FROM expense_notes en
       JOIN users u ON u.id = en.user_id
       WHERE en.id = $1 AND u.manager_id = $2`,
      [id, user.id]
    )
    return result.rows[0]
  })
  if (!note) throw new NotFound()

  return Response.json({ url: await getReceiptUrl(note.receipt_key) })
})
```

`src/app/api/hr/expense-notes/[id]/receipt-url/route.ts` :

```ts
import { withUserScope } from '@/lib/db'
import { getReceiptUrl } from '@/lib/storage'
import { NotFound } from '@/shared/errors'
import { parseUuid, requireRole, requireSession, route, type RouteContext } from '@/shared/http'

export const GET = route(async (_request, { params }: RouteContext<{ id: string }>) => {
  const user = await requireSession()
  requireRole(user, 'hr_admin')
  const id = parseUuid((await params).id)

  const note = await withUserScope(user.id, async (client) => {
    const result = await client.query(
      `SELECT en.receipt_key FROM expense_notes en
       JOIN users u ON u.id = en.user_id
       WHERE en.id = $1 AND u.role = 'manager' AND u.manager_id IS NULL
         AND u.company_id = (SELECT company_id FROM users WHERE id = $2)`,
      [id, user.id]
    )
    return result.rows[0]
  })
  if (!note) throw new NotFound()

  return Response.json({ url: await getReceiptUrl(note.receipt_key) })
})
```

`src/app/api/hr/users/route.ts` :

```ts
import { getPool } from '@/lib/db'
import { requireRole, requireSession, route } from '@/shared/http'

export const GET = route(async () => {
  const user = await requireSession()
  requireRole(user, 'hr_admin')

  // Passe sous la portée RLS en tâche 11.
  const result = await getPool().query(
    `SELECT id, name, email, role, manager_id FROM users
     WHERE role IN ('employee', 'manager')
       AND company_id = (SELECT company_id FROM users WHERE id = $1)
     ORDER BY name`,
    [user.id]
  )
  return Response.json(
    result.rows.map((row) => ({
      id: row.id,
      name: row.name,
      email: row.email,
      role: row.role,
      managerId: row.manager_id,
    }))
  )
})
```

`src/app/api/hr/users/[id]/manager/route.ts` (F41 : `managerId` explicite) :

```ts
import { getPool } from '@/lib/db'
import { Conflict, InvalidInput, NotFound } from '@/shared/errors'
import {
  parseUuid,
  readJsonObject,
  requireRole,
  requireSession,
  route,
  type RouteContext,
} from '@/shared/http'

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
  const user = await requireSession()
  requireRole(user, 'hr_admin')
  const id = parseUuid((await params).id)
  const managerId = managerIdFrom(await readJsonObject(request))

  // Passe sous la portée RLS en tâche 11 ; F5 et F30 au plan 2 (assignManager).
  const hrAdminResult = await getPool().query('SELECT company_id FROM users WHERE id = $1', [user.id])
  const companyId = hrAdminResult.rows[0]?.company_id
  if (!companyId) throw new NotFound()

  const targetResult = await getPool().query(
    `SELECT id FROM users WHERE id = $1 AND company_id = $2 AND role IN ('employee', 'manager')`,
    [id, companyId]
  )
  if (!targetResult.rows[0]) throw new NotFound()

  if (managerId !== null) {
    if (managerId === id) throw new Conflict('invalid-manager', 'Invalid manager')
    const managerResult = await getPool().query(
      `SELECT id FROM users WHERE id = $1 AND role = 'manager'`,
      [managerId]
    )
    if (!managerResult.rows[0]) throw new Conflict('invalid-manager', 'Invalid manager')
  }

  const updated = await getPool().query(
    `UPDATE users SET manager_id = $1 WHERE id = $2
     RETURNING id, name, email, role, manager_id`,
    [managerId, id]
  )
  const target = updated.rows[0]
  return Response.json({
    id: target.id,
    name: target.name,
    email: target.email,
    role: target.role,
    managerId: target.manager_id,
  })
})
```

Supprimer `src/lib/errors.ts` et `tests/unit/errors.test.ts` (remplacés par `shared/problem` et `tests/unit/problem.test.ts`).

- [ ] **Étape 4 : lancer les tests d'intégration**

Run : `npm test`
Attendu : PASS. Les seuls échecs acceptables sont dus à une transformation oubliée à l'étape 2 : corriger le test selon la règle, jamais la route.

- [ ] **Étape 5 : E2E `api-auth.spec.ts`**

Remplacer `REFUSED_STATUS` et `expectRefused` par :

```ts
// F27 : 401 sans session (ou session invalide), 403 avec une session de mauvais rôle.
async function expectRefused(
  request: APIRequestContext,
  endpoints: Endpoint[],
  status: 401 | 403,
  headers?: Record<string, string>
): Promise<void> {
  for (const endpoint of endpoints) {
    const response = await request.fetch(endpoint.path, { method: endpoint.method, headers })
    const label = `${endpoint.method} ${endpoint.path}`
    expect.soft(response.status(), label).toBe(status)
    expect.soft(await response.json(), label).toMatchObject({ error: 'Unauthorized', status })
  }
}
```

puis les tests :

```ts
test('sans cookie : 401 partout', async ({ request }) => {
  await expectRefused(request, ENDPOINTS, 401)
})

test('cookie de session falsifié : 401 partout', async ({ request }) => {
  await expectRefused(request, ENDPOINTS, 401, { cookie: 'authjs.session-token=jeton-falsifie' })
})

test('session employé : 403 sur les endpoints manager et RH', async ({ browser }) => {
  const page = await loginAs(browser, (await createOrg()).employee)
  await expectRefused(page.request, ENDPOINTS.filter((endpoint) => endpoint.area !== 'employee'), 403)
})

test('session manager : 403 sur les endpoints RH', async ({ browser }) => {
  const page = await loginAs(browser, (await createOrg()).manager)
  await expectRefused(page.request, ENDPOINTS.filter((endpoint) => endpoint.area === 'hr'), 403)
})

test('session RH : 403 sur les endpoints manager', async ({ browser }) => {
  const page = await loginAs(browser, (await createOrg()).hr)
  await expectRefused(page.request, ENDPOINTS.filter((endpoint) => endpoint.area === 'manager'), 403)
})
```

et les deux derniers :

```ts
test('erreur interne : 500 générique, sans stack ni détail SQL', async ({ browser }) => {
  const page = await loginAs(browser, (await createOrg()).employee)
  const response = await page.request.get('/api/expense-notes?sort=nope')
  expect(response.status()).toBe(500)
  const body = await response.text()
  expect(body).not.toContain('stack')
  expect(body).not.toContain('nope')
})

test('corps JSON sur une route multipart : 400 problem+json, sans stack', async ({ browser }) => {
  const page = await loginAs(browser, (await createOrg()).employee)
  const response = await page.request.post('/api/expense-notes', { data: { amount: 1 } })
  expect(response.status()).toBe(400)
  expect(response.headers()['content-type']).toContain('application/problem+json')
  expect(await response.json()).toMatchObject({ error: 'Corps de requête invalide', status: 400 })
})
```

Supprimer la constante `REFUSED_STATUS` devenue inutile.

Run : `npm run test:e2e -- tests/e2e/api-auth.spec.ts`
Attendu : PASS.

- [ ] **Étape 6 : `docs/api/openapi.yaml`**

1. Dans `info.description`, remplacer le tableau des statuts par :

```markdown
    | Espace | Rôle exigé | Sans session | Mauvais rôle |
    |---|---|---|---|
    | `/api/expense-notes/*` | tout utilisateur connecté | `401` | — |
    | `/api/manager/*` | `manager` | `401` | `403` |
    | `/api/hr/*` | `hr_admin` | `401` | `403` |
```

et le paragraphe « Erreurs » par :

```markdown
    ## Erreurs

    Toutes les erreurs sont au format RFC 9457 (`application/problem+json`) :
    `{ error, type, title, status, detail }`. Le champ `error` garde le texte
    historique. Une erreur non gérée renvoie `500` avec `error: "Erreur
    interne"`, sans pile d'appels ni message interne ; l'en-tête
    `x-correlation-id` permet de retrouver la trace dans les logs.
```

2. Dans `components.schemas`, remplacer `Error` et `InternalError` par :

```yaml
    Problem:
      type: object
      description: Erreur RFC 9457 ; `error` reprend le message historique.
      required: [error, type, title, status, detail]
      properties:
        error: { type: string }
        type: { type: string, format: uri }
        title: { type: string }
        status: { type: integer }
        detail: { type: string }
```

et faire pointer toutes les références `#/components/schemas/Error` et `#/components/schemas/InternalError` vers `#/components/schemas/Problem`, avec le type de contenu `application/problem+json`.

3. Ajouter les réponses suivantes aux opérations :
   - `401` sur les 5 opérations `/api/hr/*` ; `403` sur les 4 opérations `/api/manager/*` ;
   - `400` (« Identifiant invalide ») sur les 7 opérations qui ont un paramètre `{id}` ;
   - `400` (« Corps de requête invalide ») sur `POST /api/expense-notes`, `POST /api/expense-notes/receipt-suggestion` et `PUT /api/hr/users/{id}/manager` ;
   - `404` sur `GET /api/manager/expense-notes/{id}/receipt-url` (note hors de l'équipe, F1).
4. Passer `info.version` à `0.2.0`.

Run : `npx vitest run tests/unit/openapi-coverage.test.ts && docker run --rm -v "$PWD/docs/api:/w" tufin/oasdiff:latest breaking /w/openapi.yaml /w/openapi.yaml`
Attendu : test PASS ; `oasdiff` sans erreur (le job CI comparera avec `main`).

- [ ] **Étape 7 : vérifier et commiter**

Run : `npm run verify`
Attendu : PASS.

```bash
git add src tests docs/api/openapi.yaml
git commit -m "refactor(refacto): routes enrobées par shared/http, erreurs RFC 9457, 401/403 cohérents (F1, F26, F27, F34, F41, F42, F43)"
```

---

### Tâche 10 : migration d'isolation (rôle `expense_app`, schéma `app`, `company_id`, policies)

Dans cette tâche, l'application se connecte **encore** avec le rôle propriétaire : la suite existante reste verte, et un nouveau test vérifie la RLS en se connectant explicitement avec `expense_app`. La bascule de l'application se fait en tâche 11.

**Fichiers :**
- Créer : `migrations/1760600000000_rls-isolation.sql`, `tests/integration/rls.test.ts`
- Modifier : `tests/support/env.ts`, `tests/support/db.ts`, `tests/integration/global-setup.ts`, `tests/e2e/global-setup.ts`, `tests/support/factories.ts`, `src/lib/db.ts`, `scripts/seed.mjs`, `package.json`, `.env.example`

**Interfaces :**
- Produit (SQL) :
  - rôle `expense_app` (LOGIN, mot de passe de dev `expense_app`, ni superutilisateur ni `BYPASSRLS`) ;
  - `app.current_user_id() → uuid`, `app.current_company_id() → uuid` ;
  - `app.actor(p_user_id uuid) → TABLE(id uuid, company_id uuid, role text, manager_id uuid)` (`SECURITY DEFINER`) ;
  - `app.credentials_for(p_email text) → TABLE(id uuid, email text, password_hash text, role text)` (`SECURITY DEFINER`) ;
  - `app.sign_up(p_name text, p_email text, p_password_hash text, p_domain text, p_company_name text) → TABLE(user_id uuid, role text)` (`SECURITY DEFINER`, une transaction) ;
  - colonne `expense_notes.company_id uuid NOT NULL` (défaut `app.current_company_id()`).
- Produit (tests) : `TEST_ENV.DATABASE_OWNER_URL`, `TEST_ENV.APP_DATABASE_URL`, mêmes clés dans `E2E_ENV`.
- Modifie : `withUserScope(userId, fn)` pose aussi `app.current_company_id`, lu par `app.actor`.

- [ ] **Étape 1 : URL propriétaire et URL applicative dans les tests**

Remplacer le haut de `tests/support/env.ts` (jusqu'à `S3_BASE_ENV` exclu) par :

```ts
// Ressources dédiées aux tests : jamais la base ni le bucket de `make dev`.
// Les valeurs par défaut correspondent au docker-compose (et aux services CI).
const PG_SERVER_URL = process.env.TEST_PG_SERVER_URL ?? 'postgres://expense:expense@localhost:5433'

/** Même serveur, rôle applicatif `expense_app` (créé par les migrations, soumis à la RLS). */
function appServerUrl(ownerUrl: string): string {
  const url = new URL(ownerUrl)
  url.username = 'expense_app'
  url.password = 'expense_app'
  return url.toString().replace(/\/$/, '')
}
const PG_APP_SERVER_URL = appServerUrl(PG_SERVER_URL)

export const PG_ADMIN_URL = `${PG_SERVER_URL}/postgres`
export const TEST_DATABASE_NAME = 'expense_io_test'
export const E2E_DATABASE_NAME = 'expense_io_e2e'
```

puis remplacer `TEST_ENV` et `E2E_ENV` par :

```ts
export const TEST_ENV = {
  ...S3_BASE_ENV,
  // Application : rôle propriétaire jusqu'à la tâche 11, puis expense_app.
  DATABASE_URL: `${PG_SERVER_URL}/${TEST_DATABASE_NAME}`,
  // Helpers de test (factories, truncate) et migrations : toujours le propriétaire.
  DATABASE_OWNER_URL: `${PG_SERVER_URL}/${TEST_DATABASE_NAME}`,
  APP_DATABASE_URL: `${PG_APP_SERVER_URL}/${TEST_DATABASE_NAME}`,
  S3_BUCKET: 'receipts-test',
}

export const E2E_ENV = {
  ...S3_BASE_ENV,
  DATABASE_URL: `${PG_SERVER_URL}/${E2E_DATABASE_NAME}`,
  DATABASE_OWNER_URL: `${PG_SERVER_URL}/${E2E_DATABASE_NAME}`,
  APP_DATABASE_URL: `${PG_APP_SERVER_URL}/${E2E_DATABASE_NAME}`,
  S3_BUCKET: 'receipts-e2e',
  AUTH_SECRET: 'secret-de-test-e2e-uniquement-0123456789',
}
```

Dans `tests/support/db.ts`, le pool des helpers utilise l'URL propriétaire :

```ts
    pool = new Pool({
      connectionString: assertTestDatabase(process.env.DATABASE_OWNER_URL ?? process.env.DATABASE_URL),
      max: 4,
    })
```

Dans `tests/integration/global-setup.ts` et `tests/e2e/global-setup.ts`, remplacer `migrate(TEST_ENV.DATABASE_URL)` / `migrate(E2E_ENV.DATABASE_URL)` par `migrate(TEST_ENV.DATABASE_OWNER_URL)` / `migrate(E2E_ENV.DATABASE_OWNER_URL)`.

- [ ] **Étape 2 : écrire le test qui échoue**

`tests/integration/rls.test.ts` :

```ts
import { Client } from 'pg'
import { describe, expect, it } from 'vitest'
import { TEST_ENV } from '../support/env'
import { createNote, createOrg, createUser, type UserRow } from '../support/factories'

/** Connexion `expense_app` avec la portée de `user`, annulée à la fin. */
async function asApp<T>(user: Pick<UserRow, 'id' | 'company_id'> | null, fn: (client: Client) => Promise<T>) {
  const client = new Client({ connectionString: TEST_ENV.APP_DATABASE_URL })
  await client.connect()
  try {
    await client.query('BEGIN')
    if (user) {
      await client.query(
        "SELECT set_config('app.current_user_id', $1, true), set_config('app.current_company_id', $2, true)",
        [user.id, user.company_id]
      )
    }
    return await fn(client)
  } finally {
    await client.query('ROLLBACK')
    await client.end()
  }
}

describe('rôle expense_app', () => {
  it("n'est ni superutilisateur ni BYPASSRLS (F2)", async () => {
    const flags = await asApp(null, async (c) =>
      (await c.query('SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user')).rows[0]
    )
    expect(flags).toEqual({ rolsuper: false, rolbypassrls: false })
  })

  it("ne peut pas écrire directement dans users ni companies", async () => {
    await expect(
      asApp(null, (c) => c.query("INSERT INTO companies (name, email_domain) VALUES ('x', 'x.fr')"))
    ).rejects.toThrow('permission denied')
  })
})

describe('isolation entre entreprises (F44)', () => {
  it("un utilisateur ne voit que les notes, utilisateurs et entreprise de la sienne", async () => {
    const a = await createOrg()
    const b = await createOrg()
    const noteA = await createNote({ user: a.employee })
    await createNote({ user: b.employee })
    const seen = await asApp(a.manager, async (c) => ({
      notes: (await c.query('SELECT id FROM expense_notes')).rows.map((r) => r.id),
      users: (await c.query('SELECT company_id FROM users')).rows.map((r) => r.company_id),
      companies: (await c.query('SELECT id FROM companies')).rows.map((r) => r.id),
    }))
    expect(seen.notes).toEqual([noteA.id])
    expect(new Set(seen.users)).toEqual(new Set([a.company.id]))
    expect(seen.companies).toEqual([a.company.id])
  })

  it('sans portée, rien n’est visible (point de vigilance 1)', async () => {
    await createNote({ user: (await createOrg()).employee })
    const counts = await asApp(null, async (c) => ({
      notes: (await c.query('SELECT count(*)::int AS n FROM expense_notes')).rows[0].n,
      users: (await c.query('SELECT count(*)::int AS n FROM users')).rows[0].n,
    }))
    expect(counts).toEqual({ notes: 0, users: 0 })
  })

  it("refuse une note au nom d'un autre utilisateur ou d'une autre entreprise", async () => {
    const a = await createOrg()
    const b = await createOrg()
    const insert = (userId: string, companyId: string) =>
      asApp(a.employee, (c) =>
        c.query(
          `INSERT INTO expense_notes (user_id, company_id, amount, expense_date, description, receipt_key)
           VALUES ($1, $2, 1, '2026-10-08', 'x', 'k')`,
          [userId, companyId]
        )
      )
    await expect(insert(a.manager.id, a.company.id)).rejects.toThrow('row-level security')
    await expect(insert(a.employee.id, b.company.id)).rejects.toThrow('row-level security')
  })

  it("le company_id d'une nouvelle note vaut l'entreprise de la portée par défaut", async () => {
    const a = await createOrg()
    const companyId = await asApp(a.employee, async (c) =>
      (
        await c.query(
          `INSERT INTO expense_notes (user_id, amount, expense_date, description, receipt_key)
           VALUES ($1, 1, '2026-10-08', 'x', 'k') RETURNING company_id`,
          [a.employee.id]
        )
      ).rows[0].company_id
    )
    expect(companyId).toBe(a.company.id)
  })

  it("ne modifie aucune note d'une autre entreprise", async () => {
    const a = await createOrg()
    const noteB = await createNote({ user: (await createOrg()).employee })
    const updated = await asApp(a.hr, async (c) =>
      (await c.query("UPDATE expense_notes SET status = 'approved' WHERE id = $1", [noteB.id])).rowCount
    )
    expect(updated).toBe(0)
  })
})

describe('fonctions SECURITY DEFINER', () => {
  it('app.actor lit un acteur hors portée', async () => {
    const { manager, company } = await createOrg()
    const actor = await asApp(null, async (c) => (await c.query('SELECT * FROM app.actor($1)', [manager.id])).rows[0])
    expect(actor).toEqual({ id: manager.id, company_id: company.id, role: 'manager', manager_id: null })
  })

  it('app.credentials_for renvoie le hash pour la connexion', async () => {
    const { employee } = await createOrg()
    const row = await asApp(null, async (c) =>
      (await c.query('SELECT id, role, password_hash FROM app.credentials_for($1)', [employee.email])).rows[0]
    )
    expect(row).toMatchObject({ id: employee.id, role: 'employee', password_hash: expect.any(String) })
  })

  it("app.sign_up : premier inscrit RH d'une nouvelle entreprise, suivants employés", async () => {
    const roles = await asApp(null, async (c) => {
      const first = (await c.query("SELECT * FROM app.sign_up('A', 'a@neuve.fr', 'h', 'neuve.fr', 'neuve')")).rows[0]
      const second = (await c.query("SELECT * FROM app.sign_up('B', 'b@neuve.fr', 'h', 'neuve.fr', 'neuve')")).rows[0]
      return [first.role, second.role]
    })
    expect(roles).toEqual(['hr_admin', 'employee'])
  })

  it('app.sign_up avec un email existant échoue en violation d’unicité (23505)', async () => {
    const { employee } = await createOrg()
    await expect(
      asApp(null, (c) =>
        c.query("SELECT * FROM app.sign_up('X', $1, 'h', 'autre.fr', 'autre')", [employee.email])
      )
    ).rejects.toMatchObject({ code: '23505' })
  })
})

describe('factories', () => {
  it("createNote renseigne company_id depuis l'auteur", async () => {
    const org = await createOrg()
    const other = await createUser({ company: org.company })
    const note = await createNote({ user: other })
    expect(note.company_id).toBe(org.company.id)
  })
})
```

- [ ] **Étape 3 : lancer, vérifier l'échec**

Run : `npx vitest run --project integration tests/integration/rls.test.ts`
Attendu : FAIL (rôle `expense_app` inexistant, colonne `company_id` absente).

- [ ] **Étape 4 : la migration `migrations/1760600000000_rls-isolation.sql`**

```sql
-- Up Migration

-- 1. Rôle applicatif, soumis à la RLS (F2). Rôle de cluster : créé une fois,
--    partagé par les bases de dev, de test et d'E2E. Mot de passe de dev ;
--    en production, le changer avec ALTER ROLE.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'expense_app') THEN
    CREATE ROLE expense_app LOGIN PASSWORD 'expense_app'
      NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
  END IF;
END $$;

-- 2. Portée de la transaction, posée par l'application (src/lib/db.ts).
CREATE SCHEMA app;

CREATE FUNCTION app.current_user_id() RETURNS uuid
  LANGUAGE sql STABLE AS
  $$ SELECT nullif(current_setting('app.current_user_id', true), '')::uuid $$;

CREATE FUNCTION app.current_company_id() RETURNS uuid
  LANGUAGE sql STABLE AS
  $$ SELECT nullif(current_setting('app.current_company_id', true), '')::uuid $$;

-- 3. Lectures nécessaires avant toute portée : surface minimale, hors RLS.
CREATE FUNCTION app.actor(p_user_id uuid)
  RETURNS TABLE (id uuid, company_id uuid, role text, manager_id uuid)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS
  $$ SELECT u.id, u.company_id, u.role, u.manager_id FROM users u WHERE u.id = p_user_id $$;

CREATE FUNCTION app.credentials_for(p_email text)
  RETURNS TABLE (id uuid, email text, password_hash text, role text)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS
  $$ SELECT u.id, u.email, u.password_hash, u.role FROM users u WHERE u.email = p_email $$;

-- Inscription en une transaction (F11) : l'entreprise et l'utilisateur, ou rien.
CREATE FUNCTION app.sign_up(
  p_name text, p_email text, p_password_hash text, p_domain text, p_company_name text
)
  RETURNS TABLE (user_id uuid, role text)
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS
$$
#variable_conflict use_column
DECLARE
  v_company uuid;
  v_role text;
BEGIN
  INSERT INTO companies (name, email_domain) VALUES (p_company_name, p_domain)
  ON CONFLICT (email_domain) DO NOTHING
  RETURNING id INTO v_company;
  IF v_company IS NOT NULL THEN
    v_role := 'hr_admin';
  ELSE
    SELECT c.id INTO v_company FROM companies c WHERE c.email_domain = p_domain;
    v_role := 'employee';
  END IF;
  INSERT INTO users (name, email, password_hash, company_id, role)
  VALUES (p_name, p_email, p_password_hash, v_company, v_role)
  RETURNING id INTO user_id;
  role := v_role;
  RETURN NEXT;
END
$$;

REVOKE ALL ON FUNCTION app.actor(uuid), app.credentials_for(text),
  app.sign_up(text, text, text, text, text) FROM PUBLIC;
GRANT USAGE ON SCHEMA app TO expense_app;
GRANT EXECUTE ON FUNCTION app.current_user_id(), app.current_company_id(), app.actor(uuid),
  app.credentials_for(text), app.sign_up(text, text, text, text, text) TO expense_app;

-- 4. La note porte son entreprise : les policies n'ont plus à joindre users.
--    Seule exception documentée : ce remplissage ponctuel.
ALTER TABLE expense_notes ADD COLUMN company_id uuid REFERENCES companies(id);
UPDATE expense_notes en SET company_id = u.company_id FROM users u WHERE u.id = en.user_id;
DO $$
DECLARE orphans int;
BEGIN
  SELECT count(*) INTO orphans FROM expense_notes WHERE company_id IS NULL;
  IF orphans > 0 THEN
    RAISE EXCEPTION '% note(s) sans auteur : impossible de déduire leur entreprise', orphans;
  END IF;
END $$;
ALTER TABLE expense_notes ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE expense_notes ALTER COLUMN company_id SET DEFAULT app.current_company_id();

-- 5. Policies : isolation entre entreprises seulement (ADR 0002). Les droits
--    fins (qui valide quoi) sont dans ApprovalPolicy, pas ici.
DROP POLICY expense_notes_owner_select ON expense_notes;
DROP POLICY expense_notes_owner_insert ON expense_notes;
DROP POLICY expense_notes_manager_select ON expense_notes;
DROP POLICY expense_notes_manager_update ON expense_notes;
DROP POLICY expense_notes_hr_root_manager_select ON expense_notes;
DROP POLICY expense_notes_hr_root_manager_update ON expense_notes;

CREATE POLICY expense_notes_company_select ON expense_notes
  FOR SELECT USING (company_id = app.current_company_id());
CREATE POLICY expense_notes_company_update ON expense_notes
  FOR UPDATE USING (company_id = app.current_company_id())
  WITH CHECK (company_id = app.current_company_id());
CREATE POLICY expense_notes_author_insert ON expense_notes
  FOR INSERT WITH CHECK (user_id = app.current_user_id() AND company_id = app.current_company_id());

-- Pas de FORCE sur users et companies : les fonctions SECURITY DEFINER, dont
-- le propriétaire est le rôle des migrations, doivent pouvoir les lire.
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
CREATE POLICY users_company_select ON users
  FOR SELECT USING (company_id = app.current_company_id());
CREATE POLICY users_company_update ON users
  FOR UPDATE USING (company_id = app.current_company_id())
  WITH CHECK (company_id = app.current_company_id());

ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
CREATE POLICY companies_own_select ON companies
  FOR SELECT USING (id = app.current_company_id());

-- 6. Droits du rôle applicatif.
GRANT USAGE ON SCHEMA public TO expense_app;
GRANT SELECT, INSERT, UPDATE ON expense_notes TO expense_app;
GRANT USAGE, SELECT ON SEQUENCE expense_notes_receipt_seq_seq TO expense_app;
GRANT SELECT ON users, companies TO expense_app;
GRANT UPDATE (manager_id) ON users TO expense_app;

-- Down Migration
REVOKE ALL ON expense_notes, users, companies FROM expense_app;
REVOKE ALL ON SEQUENCE expense_notes_receipt_seq_seq FROM expense_app;
DROP POLICY companies_own_select ON companies;
ALTER TABLE companies DISABLE ROW LEVEL SECURITY;
DROP POLICY users_company_update ON users;
DROP POLICY users_company_select ON users;
ALTER TABLE users DISABLE ROW LEVEL SECURITY;
DROP POLICY expense_notes_author_insert ON expense_notes;
DROP POLICY expense_notes_company_update ON expense_notes;
DROP POLICY expense_notes_company_select ON expense_notes;
ALTER TABLE expense_notes DROP COLUMN company_id;
DROP SCHEMA app CASCADE;
CREATE POLICY expense_notes_owner_select ON expense_notes FOR SELECT
  USING (user_id = nullif(current_setting('app.current_user_id', true), '')::uuid);
CREATE POLICY expense_notes_owner_insert ON expense_notes FOR INSERT
  WITH CHECK (user_id = nullif(current_setting('app.current_user_id', true), '')::uuid);
```

(Le `Down` ne recrée que les policies de l'auteur : les anciennes policies manager et RH étaient contournées de toute façon. Le rôle `expense_app`, partagé par le cluster, n'est pas supprimé.)

- [ ] **Étape 5 : `createNote` renseigne `company_id`**

Dans `tests/support/factories.ts`, ajouter `company_id: string` à `NoteRow`, ajouter `company_id` à `NOTE_COLUMNS` (après `user_id`), et remplacer la requête de `createNote` par :

```ts
  const { rows } = await testDb().query<NoteRow>(
    `INSERT INTO expense_notes
       (user_id, company_id, amount, expense_date, description, receipt_key, status, created_at)
     SELECT $1, u.company_id, $2, $3, $4, $5, $6, COALESCE($7, now())
     FROM users u WHERE u.id = $1
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
```

- [ ] **Étape 6 : `withUserScope` pose aussi l'entreprise**

Dans `src/lib/db.ts`, remplacer la ligne `await client.query("SELECT set_config('app.current_user_id', $1, true)", [userId])` par :

```ts
    // L'entreprise de l'acteur sert à l'isolation RLS (company_id). Acteur
    // introuvable : portée vide (la tâche 11 en fait une 401).
    const actor = await client.query<{ company_id: string }>(
      'SELECT company_id FROM app.actor($1)',
      [userId]
    )
    await client.query(
      "SELECT set_config('app.current_user_id', $1, true), set_config('app.current_company_id', $2, true)",
      [userId, actor.rows[0]?.company_id ?? '']
    )
```

- [ ] **Étape 7 : migrations et seed avec le rôle propriétaire**

Dans `package.json` :

```json
"migrate:up": "node-pg-migrate up --envPath .env --database-url-var MIGRATION_DATABASE_URL",
"migrate:down": "node-pg-migrate down --envPath .env --database-url-var MIGRATION_DATABASE_URL",
```

Dans `scripts/seed.mjs` :
- `const pool = new Pool({ connectionString: process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL })` ;
- dans `seedExpenseNote(userId, description, amount)`, ajouter un paramètre `companyId` et remplacer l'`INSERT` par :

```js
  const inserted = await pool.query(
    `INSERT INTO expense_notes (user_id, company_id, amount, expense_date, description, receipt_key)
     VALUES ($1, $2, $3, CURRENT_DATE, $4, '')
     RETURNING id, receipt_seq`,
    [userId, companyId, amount, description]
  )
```

- et les deux appels deviennent `seedExpenseNote(employeeId, companyId, 'Taxi aéroport (seed)', 42.5)` et `seedExpenseNote(managerId, companyId, 'Café client (seed)', 5.9)` (signature `seedExpenseNote(userId, companyId, description, amount)`).

Dans `bench/seed.mjs` (benchmark de référence, sur `main`) :
- `new pg.Client({ connectionString: process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL })` ;
- dans les **deux** `INSERT INTO expense_notes (id, user_id, …)`, ajouter la colonne `company_id` juste après `user_id`, et dans chaque `SELECT` correspondant (trois au total, `UNION ALL` compris), ajouter juste après l'expression du `user_id` : `(SELECT u.company_id FROM users u WHERE u.id = <même expression que user_id>)`. Exemple pour la première branche : `${user('1000 + n')}, (SELECT u.company_id FROM users u WHERE u.id = ${user('1000 + n')}),`.

Vérification : lancer la procédure « Rejouer le benchmark » de `docs/audit/baseline.md` jusqu'à la fin du seed.
Attendu : le seed passe sans erreur `null value in column "company_id"` (la mesure complète est rejouée au plan 3).

Dans `.env.example`, remplacer le bloc PostgreSQL par :

```bash
# PostgreSQL (docker-compose)
# Rôle propriétaire : migrations et seed uniquement.
MIGRATION_DATABASE_URL=postgres://expense:expense@localhost:5433/expense_io
# Rôle applicatif, créé par les migrations, soumis à la RLS (jamais superutilisateur).
# Tâche 11 : passe à postgres://expense_app:expense_app@localhost:5433/expense_io
DATABASE_URL=postgres://expense:expense@localhost:5433/expense_io
```

- [ ] **Étape 8 : lancer**

Run : `npx vitest run --project integration tests/integration/rls.test.ts && npm test`
Attendu : PASS partout (l'application est encore propriétaire ; seule `rls.test.ts` passe par `expense_app`).

Run : `make migrate && make seed`
Attendu : migrations appliquées sur la base de dev, seed idempotent sans erreur.

- [ ] **Étape 9 : commit**

```bash
git add migrations/1760600000000_rls-isolation.sql tests/integration/rls.test.ts tests/support src/lib/db.ts scripts/seed.mjs bench/seed.mjs package.json .env.example tests/integration/global-setup.ts tests/e2e/global-setup.ts
git commit -m "feat(refacto): rôle expense_app, company_id sur les notes et RLS d'isolation (F2, F44)"
```

---

### Tâche 11 : l'application passe sur `expense_app`

**Fichiers :**
- Modifier : `tests/support/env.ts`, `src/lib/db.ts`, `src/lib/auth.ts`, `src/app/actions/auth.ts`, `src/app/api/expense-notes/route.ts`, `src/app/api/hr/users/route.ts`, `src/app/api/hr/users/[id]/manager/route.ts`, `.env.example`, `tests/integration/lib/db.test.ts`, les tests « fantômes » de `tests/integration/api/`, `tests/integration/api/manager-expense-notes.test.ts`, `tests/integration/workflow.test.ts`, `docs/runbooks/dev-environnement-demarrer.md`

**Interfaces :**
- Consomme : `app.actor`, `app.credentials_for`, `app.sign_up` (tâche 10) ; `Unauthenticated` (tâche 7).
- Modifie : `withUserScope(userId, fn)` lève `Unauthenticated` si l'acteur n'existe plus.

- [ ] **Étape 1 : faire basculer les tests (ils échouent)**

`tests/support/env.ts` : dans `TEST_ENV` et `E2E_ENV`, `DATABASE_URL` prend la valeur de `APP_DATABASE_URL` :

```ts
  DATABASE_URL: `${PG_APP_SERVER_URL}/${TEST_DATABASE_NAME}`,
```

(et `${PG_APP_SERVER_URL}/${E2E_DATABASE_NAME}` pour `E2E_ENV`), et retirer le commentaire « rôle propriétaire jusqu'à la tâche 11 ».

`tests/integration/lib/db.test.ts`, remplacer intégralement par :

```ts
import { describe, expect, it } from 'vitest'
import { getPool, withUserScope } from '@/lib/db'
import { countRows, createNote, createOrg } from '../../support/factories'

const SCOPE = `SELECT current_setting('app.current_user_id', true) AS user_id,
                      current_setting('app.current_company_id', true) AS company_id`

describe('withUserScope', () => {
  it("expose l'utilisateur et son entreprise aux policies pendant la transaction", async () => {
    const { employee, company } = await createOrg()
    const scope = await withUserScope(employee.id, async (client) => (await client.query(SCOPE)).rows[0])
    expect(scope).toEqual({ user_id: employee.id, company_id: company.id })
  })

  it('ne laisse ni utilisateur ni entreprise sur la connexion rendue au pool (point de vigilance 5)', async () => {
    const { employee } = await createOrg()
    await withUserScope(employee.id, async () => undefined)
    const client = await getPool().connect()
    try {
      const { rows } = await client.query(SCOPE)
      expect([rows[0].user_id ?? '', rows[0].company_id ?? '']).toEqual(['', ''])
    } finally {
      client.release()
    }
  })

  it('valide la transaction et renvoie le résultat de la fonction', async () => {
    const { employee } = await createOrg()
    const result = await withUserScope(employee.id, async (client) => {
      await client.query(
        `INSERT INTO expense_notes (user_id, amount, expense_date, description, receipt_key)
         VALUES ($1, 1, '2026-10-08', 'commit', 'k')`,
        [employee.id]
      )
      return 'ok'
    })
    expect(result).toBe('ok')
    expect(await countRows('expense_notes')).toBe(1)
  })

  it("annule la transaction et relance l'erreur", async () => {
    const { employee } = await createOrg()
    await expect(
      withUserScope(employee.id, async (client) => {
        await client.query(
          `INSERT INTO expense_notes (user_id, amount, expense_date, description, receipt_key)
           VALUES ($1, 1, '2026-10-08', 'rollback', 'k')`,
          [employee.id]
        )
        throw new Error('échec métier')
      })
    ).rejects.toThrow('échec métier')
    expect(await countRows('expense_notes')).toBe(0)
  })

  it("utilisateur introuvable : Unauthenticated (401), sans exécuter la fonction", async () => {
    let called = false
    await expect(
      withUserScope('11111111-1111-4111-8111-111111111111', async () => {
        called = true
      })
    ).rejects.toMatchObject({ status: 401 })
    expect(called).toBe(false)
  })
})

describe('Row Level Security', () => {
  it("l'application se connecte avec un rôle soumis à la RLS (F2)", async () => {
    const { rows } = await getPool().query<{ rolsuper: boolean; rolbypassrls: boolean }>(
      'SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user'
    )
    expect(rows[0]).toEqual({ rolsuper: false, rolbypassrls: false })
  })

  it("un utilisateur ne voit que les notes de son entreprise (F44)", async () => {
    const a = await createOrg()
    const b = await createOrg()
    const noteB = await createNote({ user: b.manager })
    await createNote({ user: a.employee })
    const visible = await withUserScope(
      b.employee.id,
      async (client) => (await client.query('SELECT id FROM expense_notes')).rows.map((r) => r.id)
    )
    expect(visible).toEqual([noteB.id])
  })
})
```

Tests « fantômes » (`actAsGhost`), dans tous les fichiers de `tests/integration/api/` **sauf** `receipt-suggestion.test.ts` (aucun accès base) : chaque test devient « session d'un utilisateur supprimé → 401 » avec `await expectProblem(<réponse>, 401, 'Unauthorized')`, et l'éventuelle vérification « note / rattachement inchangé » est conservée. Cela couvre `expense-notes.test.ts` (2 tests, dont `[as-is] … → 500 (clé étrangère)` qui perd son étiquette), `expense-note-receipt-url.test.ts`, `hr-decisions.test.ts`, `hr-expense-notes.test.ts`, `hr-receipt-url.test.ts`, `hr-user-manager.test.ts`, `hr-users.test.ts`, `manager-decisions.test.ts`, `manager-expense-notes.test.ts`, `manager-receipt-url.test.ts` (`[as-is] … reçu servi quand même` perd son étiquette).

Isolation entre entreprises (F44, la RLS fait maintenant effet) :
- `manager-expense-notes.test.ts`, `[as-is] voit les notes d'un rattaché d'une autre entreprise (audit §3)` devient « ne voit pas les notes d'un rattaché d'une autre entreprise (F44) » : la liste du manager est `[]`.
- `workflow.test.ts`, `[as-is] un manager d'une autre entreprise peut valider la note d'un employé que la RH lui a rattaché` devient « un manager d'une autre entreprise ne voit ni ne valide la note (F44) » : après le rattachement (encore accepté, F5 au plan 2), `managerQueueOf(foreignManager)` vaut `[]` et `approveAsManager(note.id)` donne `404`.

Run : `npm test`
Attendu : FAIL (l'application tourne maintenant en `expense_app` sans les adaptations).

- [ ] **Étape 2 : `withUserScope` refuse un acteur disparu**

Dans `src/lib/db.ts`, ajouter `import { Unauthenticated } from '@/shared/errors'` et remplacer le bloc ajouté en tâche 10 par :

```ts
    const actor = await client.query<{ company_id: string }>(
      'SELECT company_id FROM app.actor($1)',
      [userId]
    )
    if (!actor.rows[0]) throw new Unauthenticated()
    await client.query(
      "SELECT set_config('app.current_user_id', $1, true), set_config('app.current_company_id', $2, true)",
      [userId, actor.rows[0].company_id]
    )
```

(Le `catch` existant fait le `ROLLBACK` puis relance.)

- [ ] **Étape 3 : connexion par `app.credentials_for`**

Dans `src/lib/auth.ts`, remplacer la requête de `authorize` par :

```ts
        const result = await getPool().query<{
          id: string
          email: string
          password_hash: string
          role: 'employee' | 'manager' | 'hr_admin'
        }>('SELECT id, email, password_hash, role FROM app.credentials_for($1)', [email])
```

- [ ] **Étape 4 : inscription par `app.sign_up`**

Dans `src/app/actions/auth.ts`, remplacer tout le bloc qui va de `const existing = await getPool().query('SELECT id FROM users WHERE email = $1', [email])` jusqu'à l'`INSERT INTO users …` inclus par :

```ts
  const domain = emailMatch[1].toLowerCase()
  const companyName = domain.split('.')[0]
  const passwordHash = await bcrypt.hash(password, 12)

  // Une transaction côté base (F11) ; un email déjà pris, même par une
  // inscription concurrente (F12), lève une violation d'unicité.
  try {
    await getPool().query('SELECT * FROM app.sign_up($1, $2, $3, $4, $5)', [
      name.trim(),
      email,
      passwordHash,
      domain,
      companyName,
    ])
  } catch (error) {
    if ((error as { code?: string }).code === '23505') {
      return { error: 'Un compte existe déjà avec cet email.' }
    }
    throw error
  }
```

- [ ] **Étape 5 : les dernières requêtes hors portée**

`src/app/api/expense-notes/route.ts`, dans `POST` : remplacer `getPool().query(\`UPDATE expense_notes SET receipt_key …\`)` par un second `withUserScope` :

```ts
  const updated = await withUserScope(user.id, (client) =>
    client.query(`UPDATE expense_notes SET receipt_key = $1 WHERE id = $2 RETURNING *`, [
      receiptKey,
      note.id,
    ])
  )
```

et retirer `getPool` de l'import.

`src/app/api/hr/users/route.ts` : envelopper la requête dans `withUserScope(user.id, (client) => client.query(…))` (même SQL), et importer `withUserScope` au lieu de `getPool`.

`src/app/api/hr/users/[id]/manager/route.ts` : envelopper les quatre requêtes dans **une seule** portée, qui devient la transaction de l'opération :

```ts
  return withUserScope(user.id, async (client) => {
    const hrAdminResult = await client.query('SELECT company_id FROM users WHERE id = $1', [user.id])
    const companyId = hrAdminResult.rows[0]?.company_id
    if (!companyId) throw new NotFound()

    const targetResult = await client.query(
      `SELECT id FROM users WHERE id = $1 AND company_id = $2 AND role IN ('employee', 'manager')`,
      [id, companyId]
    )
    if (!targetResult.rows[0]) throw new NotFound()

    if (managerId !== null) {
      if (managerId === id) throw new Conflict('invalid-manager', 'Invalid manager')
      const managerResult = await client.query(
        `SELECT id FROM users WHERE id = $1 AND role = 'manager'`,
        [managerId]
      )
      if (!managerResult.rows[0]) throw new Conflict('invalid-manager', 'Invalid manager')
    }

    const updated = await client.query(
      `UPDATE users SET manager_id = $1 WHERE id = $2
       RETURNING id, name, email, role, manager_id`,
      [managerId, id]
    )
    const target = updated.rows[0]
    return Response.json({
      id: target.id,
      name: target.name,
      email: target.email,
      role: target.role,
      managerId: target.manager_id,
    })
  })
```

Effet de bord voulu : un manager d'une autre entreprise est désormais invisible (RLS), donc refusé en `409 Invalid manager`. Le test `[as-is] accepte un manager d'une autre entreprise (audit §3)` de `hr-user-manager.test.ts` devient « refuse un manager d'une autre entreprise (F5) » : `await expectProblem(response, 409, 'Invalid manager')` et le rattachement est inchangé ; de même, dans `workflow.test.ts`, le test réécrit à l'étape 1 voit son rattachement refusé (`409`) : remplacer son attente `200` sur `assign(...)` par `409`.

- [ ] **Étape 6 : `.env.example` et environnement local**

Dans `.env.example`, la ligne `DATABASE_URL` devient `DATABASE_URL=postgres://expense_app:expense_app@localhost:5433/expense_io` et le commentaire « Tâche 11 : … » disparaît. Dans `docs/runbooks/dev-environnement-demarrer.md`, ajouter sous « Prérequis » : « Un `.env` créé avant le 16/10/2026 doit reprendre `MIGRATION_DATABASE_URL` et le nouveau `DATABASE_URL` de `.env.example`. »

- [ ] **Étape 7 : lancer**

Run : `npm test`
Attendu : PASS.

Run : `npm run test:e2e`
Attendu : PASS (connexion via `app.credentials_for`, inscription via `app.sign_up`, routes sous `expense_app`).

- [ ] **Étape 8 : commit**

```bash
git add src tests .env.example docs/runbooks/dev-environnement-demarrer.md
git commit -m "feat(refacto): l'application tourne en expense_app, acteur disparu = 401 (F2, F44)"
```

---

### Tâche 12 : index des colonnes de filtre (F16)

**Fichiers :**
- Créer : `migrations/1760600000001_index.sql`, `tests/integration/indexes.test.ts`, `docs/audit/index-f16.md`

- [ ] **Étape 1 : écrire le test qui échoue**

`tests/integration/indexes.test.ts` :

```ts
import { describe, expect, it } from 'vitest'
import { testDb } from '../support/db'

describe('index des colonnes de filtre (F16)', () => {
  it.each([
    ['expense_notes_user_created_idx', 'expense_notes', '(user_id, created_at)'],
    ['expense_notes_company_status_idx', 'expense_notes', '(company_id, status)'],
    ['users_manager_idx', 'users', '(manager_id)'],
    ['users_company_idx', 'users', '(company_id)'],
  ])('%s existe sur %s %s', async (name, table, columns) => {
    const { rows } = await testDb().query<{ indexdef: string }>(
      'SELECT indexdef FROM pg_indexes WHERE indexname = $1 AND tablename = $2',
      [name, table]
    )
    expect(rows[0]?.indexdef).toContain(columns)
  })
})
```

Run : `npx vitest run --project integration tests/integration/indexes.test.ts`
Attendu : FAIL (index absents).

- [ ] **Étape 2 : la migration `migrations/1760600000001_index.sql`**

```sql
-- Up Migration
-- F16 : index sur les colonnes de filtre et de jointure des listes.
CREATE INDEX expense_notes_user_created_idx ON expense_notes (user_id, created_at);
CREATE INDEX expense_notes_company_status_idx ON expense_notes (company_id, status);
CREATE INDEX users_manager_idx ON users (manager_id);
CREATE INDEX users_company_idx ON users (company_id);

-- Down Migration
DROP INDEX users_company_idx;
DROP INDEX users_manager_idx;
DROP INDEX expense_notes_company_status_idx;
DROP INDEX expense_notes_user_created_idx;
```

Run : `npx vitest run --project integration tests/integration/indexes.test.ts`
Attendu : PASS.

- [ ] **Étape 3 : mesure `EXPLAIN` et `docs/audit/index-f16.md`**

Créer `docs/audit/index-f16.md` :

````markdown
# F16 — index des colonnes de filtre : mesure

Base de dev (`make dev`) gonflée à 20 000 notes réparties sur 200 employés, puis plan d'exécution des requêtes de liste, avant (`git stash` de la migration, `make migrate` sur une base neuve) et après.

## Jeu de données

```sql
INSERT INTO users (company_id, name, email, password_hash, role, manager_id)
SELECT c.id, 'bench-' || g, 'bench-' || g || '@expense.io', 'x', 'employee',
       (SELECT id FROM users WHERE email = 'manager@expense.io')
FROM companies c, generate_series(1, 200) g WHERE c.email_domain = 'expense.io';

INSERT INTO expense_notes (user_id, company_id, amount, expense_date, description, receipt_key)
SELECT u.id, u.company_id, 10, CURRENT_DATE, 'bench', 'k'
FROM users u, generate_series(1, 100) WHERE u.email LIKE 'bench-%';
ANALYZE;
```

## Requêtes mesurées

```sql
EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM expense_notes WHERE user_id = (SELECT id FROM users WHERE email = 'bench-1@expense.io') ORDER BY created_at DESC;
EXPLAIN (ANALYZE, BUFFERS) SELECT en.* FROM expense_notes en JOIN users u ON u.id = en.user_id WHERE u.manager_id = (SELECT id FROM users WHERE email = 'manager@expense.io') AND en.status = 'pending';
EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM users WHERE company_id = (SELECT id FROM companies WHERE email_domain = 'expense.io');
```

## Résultats

| Requête | Avant (plan, temps) | Après (plan, temps) |
|---|---|---|
````

Lancer les requêtes avec `docker compose exec postgres psql -U expense -d expense_io` avant et après la migration, et remplir le tableau avec le nœud principal du plan (`Seq Scan` / `Index Scan`) et l'`Execution Time`.

- [ ] **Étape 4 : commit**

```bash
git add migrations/1760600000001_index.sql tests/integration/indexes.test.ts docs/audit/index-f16.md
git commit -m "perf(refacto): index des colonnes de filtre et mesure EXPLAIN (F16)"
```

---

### Tâche 13 : `?sort=` par liste blanche (F3)

**Fichiers :**
- Créer : `src/lib/note-sort.ts`, `tests/unit/note-sort.test.ts`
- Modifier : `src/app/api/expense-notes/route.ts`, `tests/integration/api/expense-notes.test.ts`, `tests/e2e/api-auth.spec.ts`, `docs/api/openapi.yaml`

**Interfaces :**
- Produit : `parseNoteSort(raw: string | null): string` — renvoie toujours un fragment SQL de la liste blanche. Déplacé dans le module `expenses` au plan 2.

- [ ] **Étape 1 : écrire le test qui échoue**

`tests/unit/note-sort.test.ts` :

```ts
import { describe, expect, it } from 'vitest'
import { parseNoteSort } from '@/lib/note-sort'

describe('parseNoteSort (F3)', () => {
  it.each<[string | null, string]>([
    [null, 'created_at DESC'],
    ['', 'created_at DESC'],
    ['amount ASC', 'amount ASC'],
    ['amount', 'amount ASC'],
    ['expense_date desc', 'expense_date DESC'],
    ['AMOUNT   asc', 'amount ASC'],
    [' expense_date ', 'expense_date ASC'],
    ['created_at DESC', 'created_at DESC'],
  ])('« %s » → %s', (raw, expected) => {
    expect(parseNoteSort(raw)).toBe(expected)
  })

  it.each([
    'nope',
    'amount sideways',
    'created_at; DROP TABLE users',
    "(CASE WHEN (SELECT count(*) FROM users) = 1 THEN amount ELSE -amount END) ASC",
    'user_id ASC',
  ])('« %s » hors liste → tri par défaut', (raw) => {
    expect(parseNoteSort(raw)).toBe('created_at DESC')
  })
})
```

Run : `npx vitest run --project unit tests/unit/note-sort.test.ts`
Attendu : FAIL (module introuvable).

- [ ] **Étape 2 : implémenter `src/lib/note-sort.ts`**

```ts
// F3 : le tri n'est jamais du SQL fourni par le client. Seules les
// combinaisons de cette liste blanche sont possibles ; tout le reste donne le
// tri par défaut (pas d'erreur : aucun client existant ne casse).
const COLUMNS = ['created_at', 'expense_date', 'amount'] as const
const DIRECTIONS = ['ASC', 'DESC'] as const
const DEFAULT_SORT = 'created_at DESC'

export function parseNoteSort(raw: string | null): string {
  const parts = (raw ?? '').trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0 || parts.length > 2) return DEFAULT_SORT
  const column = parts[0].toLowerCase()
  const direction = (parts[1] ?? 'ASC').toUpperCase()
  if (!(COLUMNS as readonly string[]).includes(column)) return DEFAULT_SORT
  if (!(DIRECTIONS as readonly string[]).includes(direction)) return DEFAULT_SORT
  return `${column} ${direction}`
}
```

Run : `npx vitest run --project unit tests/unit/note-sort.test.ts`
Attendu : PASS.

- [ ] **Étape 3 : brancher dans la route et faire basculer les tests**

Dans `src/app/api/expense-notes/route.ts`, `GET` : remplacer les deux lignes du tri par

```ts
  const sort = parseNoteSort(new URL(request.url).searchParams.get('sort'))
```

et importer `parseNoteSort` depuis `@/lib/note-sort`.

Dans `tests/integration/api/expense-notes.test.ts`, remplacer les trois tests de `?sort=` réécrits en tâche 9 par :

```ts
  it("ignore une expression SQL passée dans ?sort= : tri par défaut, aucune fuite (F3)", async () => {
    const { employee, hr } = await createOrg()
    const older = await createNote({ user: employee, amount: 10, createdAt: new Date('2026-10-01T08:00:00Z') })
    const newer = await createNote({ user: employee, amount: 20, createdAt: new Date('2026-10-02T08:00:00Z') })
    actAs(employee)
    const sort = encodeURIComponent(
      `(CASE WHEN (SELECT count(*) FROM users WHERE email = '${hr.email}') = 1 THEN amount ELSE -amount END) ASC`
    )
    expect((await listAs(`/api/expense-notes?sort=${sort}`)).map((n) => n.id)).toEqual([newer.id, older.id])
  })

  it.each(['nope', encodeURIComponent('created_at; DROP TABLE users')])(
    '?sort=%s hors liste : 200, tri par défaut, base intacte',
    async (sort) => {
      const { employee } = await createOrg()
      await createNote({ user: employee })
      actAs(employee)
      const response = await GET(request(`/api/expense-notes?sort=${sort}`))
      expect(response.status).toBe(200)
      expect(await countRows('users')).toBe(3)
    }
  )
```

Dans `tests/e2e/api-auth.spec.ts`, remplacer le test « erreur interne : 500 générique… » par :

```ts
test('?sort= hors liste blanche : 200 et tri par défaut (F3)', async ({ browser }) => {
  const page = await loginAs(browser, (await createOrg()).employee)
  const response = await page.request.get('/api/expense-notes?sort=nope')
  expect(response.status()).toBe(200)
  expect(await response.json()).toEqual([])
})
```

Dans `docs/api/openapi.yaml`, sur `GET /api/expense-notes`, décrire le paramètre `sort` :

```yaml
        - name: sort
          in: query
          required: false
          description: |
            Tri : `<colonne> [asc|desc]`, colonne parmi `created_at`, `expense_date`, `amount`
            (insensible à la casse, `asc` par défaut). Toute autre valeur est ignorée :
            tri par défaut `created_at desc`.
          schema:
            type: string
            examples: ['amount asc', 'expense_date desc']
```

- [ ] **Étape 4 : lancer et commiter**

Run : `npm test && npm run test:e2e -- tests/e2e/api-auth.spec.ts`
Attendu : PASS.

```bash
git add src/lib/note-sort.ts tests/unit/note-sort.test.ts src/app/api/expense-notes/route.ts tests/integration/api/expense-notes.test.ts tests/e2e/api-auth.spec.ts docs/api/openapi.yaml
git commit -m "fix(refacto): ?sort= limité à une liste blanche (F3)"
```

---

### Tâche 14 : clôture du plan 1

**Fichiers :**
- Modifier : `vitest.config.mts`, `docs/README.md`, `docs/plans/2026-10-15-architecture-cible-1-socle.md` (statut)

- [ ] **Étape 1 : périmètre de couverture**

Dans `vitest.config.mts`, `coverage.include` : retirer `'src/lib/errors.ts'`, ajouter `'src/shared/**/*.ts'` et `'src/lib/note-sort.ts'`. Mettre à jour le commentaire au-dessus (le code mort reste hors périmètre jusqu'au plan 2).

Run : `npm run test:coverage`
Attendu : PASS, seuils tenus (97 / 94 / 100). Si un seuil tombe, ajouter le test manquant sur le code de `src/shared/` concerné ; ne jamais baisser un seuil.

- [ ] **Étape 2 : vérification complète**

Run : `npm run verify && npm run test:e2e && node scripts/agents-sync.mjs --check`
Attendu : tout passe.

- [ ] **Étape 3 : `docs/README.md`**

Dans « Où en est-on », ajouter : `- **Plan 1 terminé** (socle et harnais agent) : SonarQube (mesures « avant » dans [audit/sonarqube-avant-apres.md](audit/sonarqube-avant-apres.md)), contrat OpenAPI vérifié en CI, erreurs RFC 9457, rôle expense_app et RLS d'isolation, F1, F3, F16, F25–F27, F34, F41–F44 corrigés.` Passer le statut de ce plan à `Terminé`.

- [ ] **Étape 4 : commit et PR**

```bash
git add vitest.config.mts docs/README.md docs/plans/2026-10-15-architecture-cible-1-socle.md
git commit -m "docs(refacto): clôture du plan 1 (socle et harnais agent)"
git push
```

Ouvrir la PR vers `main` (après fusion de la PR ARLA-9) et vérifier que tous les jobs sont verts : lint et typecheck (avec `agents:sync --check` et `depcruise`), Vitest, Playwright, contrat, SonarQube.
