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
