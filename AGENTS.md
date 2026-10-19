# AGENTS.md

Instructions pour les agents de code (Claude Code, Codex, Cursor, OpenCode…) qui travaillent sur ce dépôt. Fichier chargé à chaque session : il reste court.

## Le projet

Expense.io : notes de frais (soumission, validation par le manager ou les RH, reçus sur S3, pré-remplissage par OCR). Next.js 16, TypeScript, PostgreSQL (RLS), LocalStack S3.

## Architecture

Monolithe modulaire hexagonal ([ADR 0002](docs/adrs/0002-monolithe-modulaire-hexagonal.md), [schéma](docs/architecture/architecture-cible.html), [spec](docs/specs/2026-10-15-architecture-cible.md)) :

- `src/modules/<module>/{domain,application,ports,infrastructure}` + `index.ts` (API publique). Modules : `expenses`, `iam`. **(cible, plans 2 et 3 : n'existe pas encore)**
- `src/shared/` : config, erreurs, problem (RFC 9457), logger, http (existants) ; unité de travail, mail **(cible, plans 2 et 3 : pas encore)**.
- `src/app/api/**/route.ts` : adapters d'entrée minces (parse → use case → HTTP).
- `src/worker/` : worker de livraison des e-mails, hors de l'hexagone **(cible, plan 3 : pas encore)**.

Règles de dépendance (vérifiées par `npm run depcruise`) : `domain` n'importe rien ; `application` n'importe que `domain`, `ports`, `shared` et l'`index.ts` d'un autre module ; un module n'en voit un autre que par son `index.ts` ; `app/` n'importe que des `index.ts` et `shared` ; `worker/` n'importe que `shared/config` et `shared/logger`. Le SQL d'`expenses` ne touche jamais `users` ni `companies` (vérifié par `npm run check:sql`, ajouté au plan 2).

## Commandes

- `make dev` : tout démarrer (Docker, migrations, seed, application).
- `npm run verify` : lint, typecheck, règles de dépendance, Vitest. **À lancer avant de conclure.**
- `npm run verify:full` : idem plus les E2E Playwright.
- `make sonar` : analyse SonarQube ([runbook](docs/runbooks/sonarqube-analyse.md)).

## Règles

- Le contrat d'API (`docs/api/openapi.yaml`) ne change pas, sauf ajout. Toute nouvelle route ou réponse y est décrite dans le même commit. Tout changement de contrat est consigné dans `CHANGELOG.md`.
- Erreurs : lever une erreur typée de `src/shared/errors.ts` ; jamais de `Response.json({ error })` à la main.
- Pas de stack ni de message interne dans une réponse HTTP.
- Tests : un test qui échoue avant tout code (TDD). Un défaut figé par un test `[as-is]` se corrige en modifiant ce test.

## Git

Règles complètes : [`CONTRIBUTING.md`](CONTRIBUTING.md). Branches `<prénom>/arla-<n>-<sujet>` ou `<prénom>/<sujet>`, jamais de commit sur `main`. Commits `type(portée): description` en français.

Jamais de `git push --force` (sous aucune forme) ni de suppression récursive (`rm -rf`) : demander à l'utilisateur.

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
