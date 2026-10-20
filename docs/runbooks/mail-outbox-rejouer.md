# Runbook — rejouer les e-mails en échec de l'outbox

| | |
|---|---|
| **Composant** | Worker de livraison, table `mail_outbox` |
| **Responsable** | axe Asynchrone & run |
| **Dernière vérification** | 2026-10-20 |
| **Criticité** | Moyenne |

## Objectif

Remettre en file les e-mails passés en `dead` (trois échecs de livraison) une fois la cause corrigée.

## Quand l'utiliser

- Le log `E-mail abandonné (dead)` apparaît.
- Le SMTP est rétabli après une panne.

## Prérequis

- Docker démarré (`make dev` ou `docker compose up -d`) et le worker en marche (`npm run worker` ou `make worker`).
- `MAILER_DATABASE_URL` défini (voir `.env.example`).

## Procédure

1. Compter les e-mails par statut :
   ```sh
   docker compose exec postgres psql -U expense -d expense_io -c "SELECT status, count(*) FROM mail_outbox GROUP BY status"
   ```
   **Attendu :** une ligne par statut (`pending`, `sent`, `dead`).
2. Lire la cause des échecs :
   ```sh
   docker compose exec postgres psql -U expense -d expense_io -c "SELECT id, recipient, attempts, last_error FROM mail_outbox WHERE status = 'dead'"
   ```
   **Attendu :** la cause dans `last_error` (SMTP injoignable, destinataire refusé…).
3. Corriger la cause (rétablir le SMTP, corriger la configuration).
4. Rejouer :
   ```sh
   npm run mail:replay
   ```
   **Attendu :** « N e-mail(s) remis en file. »

## Vérification finale

Ouvrir Mailpit (http://localhost:8025) ou chercher le log `E-mail envoyé`.
**Attendu :** les e-mails rejoués y figurent ; la requête de l'étape 1 ne montre plus de `dead`.

## Retour arrière

Aucun : rejouer ne fait qu'avancer `next_attempt_at` des lignes `dead`. Un doublon est possible si le worker a planté entre l'envoi et le marquage `sent` ; le `Message-ID` (`<id>@expense.io`) permet de le repérer.

## Références

- ADR : `docs/adrs/0003-notification-par-outbox-d-e-mails.md`
- Skill : `.agents/skills/envoyer-un-email/SKILL.md`
