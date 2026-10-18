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
