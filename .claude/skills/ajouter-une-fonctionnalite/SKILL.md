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
- Un champ optionnel ajouté à un DTO de réponse est **absent** quand il est vide, jamais `null` : les tests existants comparent les DTO avec un `toEqual` exact, et un champ présent change la forme du succès.
- Un corps facultatif ajouté à une route qui l'ignorait : le contrat prime. Les tests d'intégration existants qui figent l'ancien comportement (ex. « ignore le corps de la requête ») font foi ; un corps illisible garde l'ancien comportement sauf demande contraire.

## 2. Recette (TDD, dans cet ordre)

1. **Domaine** — la règle dans `src/modules/<module>/domain/`. Test unitaire d'abord (`tests/unit/<module>/`).
2. **Use case** — `src/modules/<module>/application/<verbe-objet>.ts`, fabrique `(ports) => (actor, …) => …`. Test unitaire avec les faux de `tests/unit/<module>/` (`fakes.ts`, `fake-iam-store.ts`).
3. **Port / adapter** si une techno nouvelle intervient (`ports/` + `infrastructure/`) ; nouvelle colonne ou table → migration `migrations/<timestamp>_<sujet>.sql`, puis `npm run migrate:up` pour que la base de dev (celle de la démo) l'ait : les tests migrent leur propre base. `GRANT` pour `expense_app` : inutile pour une colonne d'une table accordée en entier (`expense_notes`), nécessaire colonne par colonne sur `users` (exemples : `migrations/1760600000000_rls-isolation.sql`, `migrations/1760600000002_users-column-grants.sql`).
4. **Export** dans `src/modules/<module>/index.ts`.
5. **Route** — adapter mince :
   ```ts
   import { expenses } from '@/modules/expenses'
   import { parseUuid, requireRole, route, type RouteContext } from '@/shared/http'
   import { currentActor } from '../../../../_lib/current-actor' // chemin relatif vers src/app/api/_lib/current-actor.ts : la profondeur varie selon la route

   export const POST = route(async (request, { params }: RouteContext<{ id: string }>) => {
     const actor = await currentActor()
     requireRole(actor, 'manager')
     const id = parseUuid((await params).id)
     return Response.json(await expenses.monUseCase(actor, id))
   })
   ```
6. **Contrat** — décrire la route ou le champ dans `docs/api/openapi.yaml` (le test `openapi-coverage` échoue sinon) **et** ajouter une ligne dans `CHANGELOG.md` sous `## [Non publié]`, dans le même commit.
7. **Test d'intégration** de la route, rôle par rôle (`tests/integration/api/`, helpers `actAs`, `expectProblem`).
8. **UI** si la fonctionnalité est visible (`src/app/**/page.tsx`, `src/components/`), messages d'erreur via `problemMessage`.
9. **E2E** si un parcours utilisateur change (`tests/e2e/`).
10. **E-mail** à envoyer ? Suivre le skill `envoyer-un-email` : composer dans le module, lire `iam` hors de `uow.run`, puis `ctx.mailer.send` dans l'unité de travail après l'écriture métier ; jamais de SMTP ni de nodemailer directs.

## 3. Vérifier

`npm run verify` (puis `npm run test:e2e` si l'UI a changé). Lancer ensuite le sous-agent **`revue-architecture`** sur le diff et corriger ce qu'il signale.

## Pièges

| Piège | Correct |
|---|---|
| SQL de `users` dans `expenses` | demander à `iam` via le port `Approvals` (ou en ajouter un) |
| règle métier dans `route.ts` | dans `domain/` ou le use case |
| `Response.json({ error }, { status })` à la main | lever une erreur de `src/shared/errors.ts` |
| décider « qui valide » soi-même | `iam.canDecide` / `iam.approveesOf` |
| oublier l'OpenAPI ou le CHANGELOG | `docs/api/openapi.yaml` et une ligne sous `## [Non publié]` de `CHANGELOG.md`, dans le même commit |
| nouvelle colonne de `users` non accordée à `expense_app` | `GRANT` par colonne dans la migration (inutile pour `expense_notes`, accordée en entier) |
| migration ajoutée, base de dev non migrée | `npm run migrate:up` |
| requête hors unité de travail | `uow.run(actor, …)` (`uow` = unité de travail injectée dans la fabrique du use case ; sinon la RLS ne voit rien) |
| importer `src/lib/` depuis un module, ou autre chose que `src/lib/auth.ts` depuis `app/` | passer par un port ou `@/shared/*` |

## Résumé final (format attendu)

```
Fonctionnalité : <une phrase>
Choix faits : <hypothèses prises sans demander>
Fichiers : <liste>
Contrat : <routes / champs ajoutés dans openapi.yaml + ligne CHANGELOG.md>
Vérifié : npm run verify ✅ · test:e2e ✅|non lancé · revue-architecture ✅
```
