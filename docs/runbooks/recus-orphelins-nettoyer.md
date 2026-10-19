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

- `.env` renseigné avec `MIGRATION_DATABASE_URL` (rôle superuser ou `BYPASSRLS`, sans repli sur `DATABASE_URL`) et `S3_*`. `expense_notes` est sous RLS forcée : le rôle applicatif `expense_app` ne verrait aucune note et tous les reçus paraîtraient orphelins.
- Le script refuse de s'exécuter (code de sortie 1) si le rôle n'est ni superuser ni `BYPASSRLS`, et si `MIGRATION_DATABASE_URL` est absente. Avec `--delete`, il s'arrête aussi si des reçus sont listés, qu'aucun n'est référencé et que des notes existent (mauvaise base ou mauvais bucket).
- Seuls les objets sous le préfixe `receipts/` sont examinés.
- Seuls les objets de plus de 24 h sont examinés (délai de grâce pour les envois en cours).

## Procédure

1. Lister les orphelins (simulation, rien n'est supprimé sans `--delete`) :
   ```sh
   npm run receipts:orphans
   ```
   **Attendu :** « N reçu(s) orphelin(s) : » suivi de la liste des clés.
2. Les supprimer :
   ```sh
   npm run receipts:orphans -- --delete
   ```
   **Attendu :** « Supprimés. » (suppression par tranches de 1000 clés).

## Vérification finale

```sh
npm run receipts:orphans
```
**Attendu :** « 0 reçu(s) orphelin(s). »

## Retour arrière

Aucun : les objets supprimés n'étaient référencés par aucune note.
