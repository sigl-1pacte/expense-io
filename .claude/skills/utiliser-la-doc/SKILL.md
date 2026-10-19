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
