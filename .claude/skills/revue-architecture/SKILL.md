---
name: revue-architecture
description: À utiliser pour relire un diff d'Expense.io contre l'architecture cible — règles de dépendance, recette d'ajout de fonctionnalité, contrat d'API, erreurs, tests — avant de conclure un travail. Rend une liste de constats, sans rien modifier.
---

# Revue d'architecture

Entrée : le diff à relire (par défaut `git diff main...HEAD`). Sortie : une liste de constats, ou « RAS ». Ne modifier aucun fichier.

## Contrôles

1. `npm run depcruise` et `npm run check:sql` : toute violation est un constat bloquant.
2. Pour chaque `route.ts` modifiée : `currentActor()`, garde de rôle si l'espace en exige un, un seul use case appelé, aucune règle métier, aucune réponse d'erreur construite à la main.
3. Pour chaque use case : un fichier, une fabrique à partir de ports, aucun import de techno ; test unitaire présent.
4. « Qui valide quoi » passe par `iam` ; aucune requête d'`expenses` ne touche `users` ou `companies`.
5. Contrat : toute route ou réponse nouvelle est dans `docs/api/openapi.yaml` ; aucune réponse en succès existante n'a changé de forme ; tout changement de contrat a sa ligne sous `## [Non publié]` de `CHANGELOG.md`.
6. Migration : `GRANT` à `expense_app` pour toute table ou colonne nouvelle ; pas de `BYPASSRLS`.
7. Tests : unitaire pour la règle, intégration pour la route ; E2E si un parcours visible a changé.

## Format de sortie

Une ligne par constat : `[bloquant|à corriger|suggestion] fichier:ligne — constat — correction proposée`. Terminer par le nombre de constats bloquants.
