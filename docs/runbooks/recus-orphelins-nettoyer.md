# Runbook — Nettoyer les reçus S3 orphelins

| | |
|---|---|
| **Composant** | Stockage des reçus (S3) et module `expenses` |
| **Responsable** | axe Architecture |
| **Dernière vérification** | 2026-10-19 |
| **Criticité** | Faible |

## Objectif

Supprimer les reçus S3 qu'aucune note ne référence (envoi réussi, insertion de la note échouée, F10).

## Quand l'utiliser

- Après un incident S3 ou base de données.
- Une fois par semaine.

## Prérequis

- `.env` renseigné (`DATABASE_URL` ou `MIGRATION_DATABASE_URL`, `S3_*`). Le script lit `expense_notes` avec le rôle propriétaire : c'est un script d'exploitation.
- Seuls les objets de plus de 24 h sont examinés (délai de grâce pour les envois en cours).

## Procédure

1. Lister les orphelins :
   ```sh
   npm run receipts:orphans
   ```
   **Attendu :** « N reçu(s) orphelin(s) : » suivi de la liste des clés.
2. Les supprimer :
   ```sh
   npm run receipts:orphans -- --delete
   ```
   **Attendu :** « Supprimés. »

## Vérification finale

```sh
npm run receipts:orphans
```
**Attendu :** « 0 reçu(s) orphelin(s). »

## Retour arrière

Aucun : les objets supprimés n'étaient référencés par aucune note.
