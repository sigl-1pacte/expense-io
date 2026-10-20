# Runbook — démo live coding : préparer le jour J

| | |
|---|---|
| **Composant** | Environnement de démo (Postgres, LocalStack, Mailpit, application, worker), harnais agent |
| **Responsable** | Louis Bertrand |
| **Dernière vérification** | 2026-10-20 |
| **Criticité** | Élevée |

## Objectif

Arriver devant le jury avec un dépôt propre, une entreprise de démonstration complète, un `npm run verify` vert et un agent qui suit la recette du projet.

## Quand l'utiliser

- Le matin de la démo, puis avant chaque essai (répétition ou démo réelle).
- Après un `git clone` frais, sur n'importe quelle machine, avec ou sans `make`.

## Prérequis

- Docker, Node 24, Git.
- `make` est facultatif : il est absent de Git Bash sous Windows. Chaque commande `make` a ci-dessous son équivalent npm/docker, strictement identique.
- Un agent de code (Claude Code) lancé à la racine du dépôt.
- Le fichier `.env` est créé depuis `.env.example` ; ne jamais le lire ni le coller dans l'agent.

## Procédure

1. Cloner le dépôt, créer `.env`, puis tout démarrer.

   Avec `make` :
   ```sh
   git clone <url-du-depot> expense-io && cd expense-io
   cp .env.example .env
   make dev
   ```

   Sans `make` (Windows, Git Bash). Les commandes sont celles des cibles `install`, `env`, `up`, `migrate`, `ensure-bucket`, `seed` et `dev` du `Makefile`, dans le même ordre :
   ```sh
   git clone <url-du-depot> expense-io && cd expense-io
   cp .env.example .env
   npm install
   docker compose up -d
   docker compose ps            # répéter jusqu'à « healthy » pour postgres et localstack
   npm run migrate:up
   npm run ensure-bucket
   npm run seed
   npm run dev                  # terminal 1 : application
   npm run worker               # terminal 2 : worker de livraison des e-mails
   ```
   `make dev` lance l'application et le worker dans le même terminal ; sans `make`, ouvrir un second terminal pour `npm run worker`. Sans le worker, les décisions réussissent mais aucun e-mail n'arrive dans Mailpit.

   **Attendu :** application sur http://localhost:3000, Mailpit sur http://localhost:8025. Le seed est idempotent : le relancer ne crée rien.

2. Se connecter avec les comptes de démonstration. L'entreprise est unique (domaine `expense.io`).

   | Compte | Mot de passe | Rôle | Rattachement |
   |---|---|---|---|
   | `hr@expense.io` | `hr1234` | RH | — |
   | `rh2@expense.io` | `rh21234` | RH (seconde RH, valide les notes de la première) | — |
   | `manager@expense.io` | `manager1234` | Manager racine | aucun manager |
   | `chef@expense.io` | `chef1234` | Manager rattaché | `manager@expense.io` |
   | `demo@expense.io` | `demo1234` | Employé | `manager@expense.io` |
   | `equipe@expense.io` | `equipe1234` | Employé | `chef@expense.io` |
   | `nouveau@expense.io` | `nouveau1234` | Employé sans manager | aucun (ses notes vont aux RH) |

   Notes de démonstration (reçu PNG uploadé pour chacune) :

   | Employé | Note | Montant | Statut |
   |---|---|---|---|
   | `demo@expense.io` | Taxi aéroport (seed) | 42,50 € | en attente |
   | `demo@expense.io` | Hôtel Paris (seed) | 142,00 € | approuvée |
   | `demo@expense.io` | Restaurant (seed) | 64,50 € | rejetée |
   | `manager@expense.io` | Café client (seed) | 5,90 € | en attente |
   | `equipe@expense.io` | Train Lyon (seed) | 87,30 € | en attente |
   | `nouveau@expense.io` | Matériel de bureau (seed) | 24,99 € | en attente |
   | `rh2@expense.io` | Salon RH (seed) | 120,00 € | en attente |

   **Attendu :** connecté en `hr@expense.io`, le bandeau « 1 employé sans manager » s'affiche et la file RH contient les notes du manager racine, du nouvel arrivant et de la seconde RH.

3. Vérifier la base de code :
   ```sh
   npm run verify
   ```
   **Attendu :** lint, typecheck, règles de dépendance, `check:sql` et Vitest verts. **Ne pas démarrer la démo si ce n'est pas vert.**

4. Ouvrir l'agent à la racine du dépôt et lui demander « quelle est la recette pour ajouter une fonctionnalité ? ».
   **Attendu :** il cite le skill `ajouter-une-fonctionnalite` (preuve qu'il a chargé `AGENTS.md`). Sinon, vérifier le dossier d'ouverture et que `.claude/skills/` est à jour (`npm run agents:sync`).

5. Vérifier qu'aucune demande de permission n'apparaît pour `npm run verify`. `.claude/settings.json` autorise `Bash(npm run:*)`, ce qui couvre `npm run verify` ; lancer la commande une fois via l'agent pour s'en assurer. Ne pas modifier ce fichier pendant la démo.
   **Attendu :** la commande s'exécute sans invite.

6. Créer une branche de démo avant la demande, pour que l'agent ne travaille jamais sur `main` :
   ```sh
   git switch -c <prénom>/demo-<sujet>
   ```
   **Attendu :** `git branch --show-current` affiche la branche de démo.

7. Formuler la demande du jury en une phrase, sans détail d'implémentation. Laisser l'agent suivre le skill `ajouter-une-fonctionnalite`. À la fin, exiger `npm run verify` puis le sous-agent `revue-architecture` sur le diff.
   **Attendu :** `npm run verify` vert et aucun constat bloquant de `revue-architecture`.

> **Mailpit :** `npm run verify` et les E2E vident la boîte Mailpit. Montrer l'e-mail au jury après `verify`, pas avant.

## Vérification finale

```sh
npm run verify
git status --short
```
**Attendu :** `verify` vert ; `git status` vide avant de commencer la démo.

## Retour arrière

Entre deux essais, revenir à l'état propre :
```sh
git stash -u        # met de côté la fonctionnalité d'essai
# ou, pour la jeter : git checkout .
```
`git checkout .` ne retire pas les fichiers nouveaux : utiliser `git stash -u` s'il y en a. Pour repartir de données de démonstration neuves, supprimer les volumes Docker est une opération destructive à décider à la main (jamais par l'agent) ; le seed seul est rejouable sans risque.

## Références

- Spec : `docs/specs/2026-10-15-architecture-cible.md`
- Plan : `docs/plans/2026-10-15-architecture-cible-3-notification.md`
- Environnement : [dev-environnement-demarrer](dev-environnement-demarrer.md) ; e-mails en échec : [mail-outbox-rejouer](mail-outbox-rejouer.md)
- Recette de l'agent : `.agents/skills/ajouter-une-fonctionnalite/SKILL.md`
