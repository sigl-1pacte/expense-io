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
