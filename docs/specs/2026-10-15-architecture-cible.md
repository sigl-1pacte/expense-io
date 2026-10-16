# Architecture cible (option C)

| | |
|---|---|
| **Statut** | En revue |
| **Auteur(s)** | Louis Bertrand (avec Claude Code) ; flux de notification proposé par Maxime |
| **Créée** | 2026-10-15 |
| **Mise à jour** | 2026-10-16 |
| **Plans** | [1 · socle et harnais agent](../plans/2026-10-15-architecture-cible-1-socle.md) · [2 · modules](../plans/2026-10-15-architecture-cible-2-modules.md) · [3 · notification](../plans/2026-10-15-architecture-cible-3-notification.md) |
| **ADR liées** | à créer dans le plan 1 : 0001 structure de la doc et harnais agent · 0002 monolithe modulaire hexagonal · 0003 notification par outbox d'e-mails · 0004 contrat d'API et erreurs RFC 9457 |
| **Schéma** | [`docs/architecture/architecture-cible.html`](../architecture/architecture-cible.html) (validé le 16/10) |

## Contexte

Refacto technique d'Expense.io, entre le 19 et le 26/10/2026, avant la soutenance du 30/10. Elle est codée par des agents IA, à partir de la base ARLA-9 (`6e31ff7`) et de sa suite de caractérisation (plus de 140 tests).

Sources :
- [`options-refacto.md`](../architecture/options-refacto.md) et [`option-c.html`](../architecture/option-c.html) pour le choix de l'option ;
- `notification-asynchrone.html` (Maxime) pour le flux de notification ;
- l'audit QA F1–F46 ;
- les consignes de soutenance ci-dessous.

### Consignes de soutenance

Elles priment sur le reste de la spec :

- Tout le monde doit pouvoir créer une note de frais.
- Un manager ne valide que les notes des personnes dont il est le manager direct.
- Un RH valide les notes des managers racines, jamais les siennes.
- **SonarQube doit tourner sur le dépôt.**
- L'interface utilisateur peut être modifiée librement.
- L'ordre d'exécution peut changer tant que le contrat d'interface (l'API) ne change pas.
- De nouvelles fonctionnalités sont possibles si elles ont du sens et restent dans le même domaine.
- Une partie de la soutenance consiste à **ajouter une fonctionnalité en un seul prompt, en direct** devant le jury.

## Objectifs

Refondre Expense.io en **monolithe modulaire hexagonal, avec une outbox d'e-mails**, et rendre le dépôt **prêt pour les agents** (*agentic ready*). **Le contrat d'API est inchangé, sauf les réponses d'erreur** listées dans [Contrat d'API](#contrat-dapi). C'est vérifié par la suite ARLA-9 et par `oasdiff`.

Critères de succès :

1. La suite ARLA-9 reste verte à chaque commit. Seuls les tests `[as-is]` du périmètre changent : ils basculent vers le comportement corrigé (convention ARLA-9).
2. `oasdiff breaking` ne signale que les écarts volontaires listés dans [Contrat d'API](#contrat-dapi).
3. `dependency-cruiser` ne signale aucune violation des [règles de dépendance](#règles-de-dépendance).
4. Les constats marqués « traité » dans la [couverture de l'audit](#couverture-de-laudit) sont corrigés, et chacun est couvert par au moins un test de non-régression.
5. Une décision de note envoie un e-mail à l'employé, visible dans Mailpit. Un crash du worker ne perd aucun e-mail, et un SMTP en panne fait passer la ligne en `dead` après 3 essais.
6. **SonarQube analyse le dépôt** : en local, et en CI sur chaque PR et chaque push sur `main`. On garde un run « avant » sur la base de la refacto et un run « après » à la fin du plan 3 pour l'audit chiffré.
7. **Une fonctionnalité s'ajoute en un prompt.** Lors d'une répétition, un agent qui part d'un dépôt propre et d'une seule phrase du type « ajoute X » livre une fonctionnalité qui passe `npm run verify`, sans autre intervention qu'une validation finale.

## Hors périmètre

- Les constats marqués « hors périmètre » dans la [couverture de l'audit](#couverture-de-laudit), chacun avec sa raison.
- L'OCR asynchrone (`202` avec polling). C'est un **choix de périmètre**, appuyé sur la consigne « le contrat ne change pas » : un endpoint `202` ajouterait une ressource et changerait le parcours du front. La conséquence est assumée : l'OCR reste dans le process web. Elle est atténuée par F17 et F19 (voir [OCR](#suggestfromreceipt-f17-f19)).
- On ne resserre pas les validations au-delà de F42 : virgule décimale, dates `jj/mm/aaaa`, reçu vide, contenu non vérifié, montant hors `numeric(10,2)`. Ces tests restent `[as-is]`, mais leurs 500 perdent la stack.
- Les pages React et `components/` sont seulement ajustées (voir [Interface utilisateur](#interface-utilisateur)), pas réécrites.
- Aucune autre fonctionnalité métier n'est ajoutée. La fonctionnalité nouvelle sera celle du live coding.
- La facturation et OpenAI ne sont pas créés (YAGNI). Leur emplacement est documenté dans `conventions.md` : `modules/billing`, avec un port `PaymentProvider`.
- Pas de dossier `postmortems/` ni de miroir de la doc vers un outil externe, contrairement à cnp-dev.

## Décisions

| Sujet | Décision | Raison |
|---|---|---|
| D1 Option | **C** : modules et hexagonal, avec un flux asynchrone | seule option qui couvre les trois axes (Architecture, Contrat d'API, Asynchrone & run) |
| D2 Flux async | **notification de décision seule** | seul l'ordre d'exécution change, pas le contrat (consigne) ; l'OCR reste synchrone par choix de périmètre, atténué par F17 et F19 |
| D3 Mécanisme | **outbox d'e-mails (`mail_outbox`) et worker de livraison, sans broker** | voir [Notification de décision](#notification-de-décision) ; validé le 16/10 |
| D4 Jointures entre modules | **deux requêtes via l'API publique d'`iam`** | frontière de module stricte, règle métier dans le domaine |
| Source de vérité des droits | **`ApprovalPolicy` fait seule foi** pour « qui voit et décide quoi ». La **RLS n'assure que l'isolation** entre entreprises et l'accès de l'auteur à ses notes, avec une colonne `company_id` sur `expense_notes` pour éviter toute jointure sur `users` | une règle écrite une seule fois ne peut pas diverger (leçon de F22) ; la RLS garde la garantie critique (F1, F2, F44) sans recopier le métier |
| F4 | **les domaines de messagerie publique ne fondent jamais d'entreprise** : l'inscription est refusée avec un message clair | la règle « le RH valide les notes sans validateur » suppose un rôle RH fiable ; ferme le cas « premier inscrit en @gmail.com » |
| D5 Vocabulaire | **hexagonal**, un fichier par use case | déjà le vocabulaire du dépôt ; « où va le nouveau code ? » sans ambiguïté |
| Validateurs | manager → ses subordonnés directs ; RH → managers racines, **plus** employés non rattachés (F33) et autres RH (F14) ; jamais sa propre note | respecte les deux règles de la consigne et débloque les notes sans validateur ; suppose la correction de F4 (ligne ci-dessus) |
| Soumission | **toujours acceptée**, même sans validateur possible (RH seul de son entreprise) | consigne ; la note reste `pending`, c'est une limite documentée |
| Qualité | **SonarQube Community**, en local (profil `quality` du compose) et **obligatoire en CI** ; le quality gate est publié mais pas bloquant | consigne de soutenance ; sert aux mesures avant / après |
| Harnais agent | **`AGENTS.md` comme source unique**, importé par `CLAUDE.md` ; skills au standard Agent Skills dans `.agents/skills/` ; `docs/` organisé par type de document | inspiré de cnp-dev ; lisible par tous les agents, guide le live coding |
| Interface | ajustements : affichage des nouvelles erreurs, signalement RH des employés non rattachés | consigne : l'UI est libre, le contrat d'API reste fixe |
| Effort | **non pris en compte** | la refacto est codée par des agents |

## Architecture

### Arborescence

```
src/
  app/api/**/route.ts        adapters d'entrée : parse → use case → HTTP (même place, mêmes réponses)
  app/actions/auth.ts        adapter d'entrée (server actions signup/login) → iam
  app/**/page.tsx, components/  ajustés à la marge, consomment l'API HTTP
  modules/
    expenses/
      domain/          ExpenseNote.ts  errors.ts
      application/     submit-expense-note.ts  list-my-expense-notes.ts  list-pending-approvals.ts
                       decide-expense-note.ts  get-receipt-url.ts  suggest-from-receipt.ts
                       decision-email.ts
      ports/           NoteRepository.ts  ReceiptStorage.ts  ReceiptReader.ts
      infrastructure/  PgNoteRepository.ts  S3ReceiptStorage.ts  TesseractReceiptReader.ts
      index.ts         API publique + câblage manuel (sans framework d'injection)
    iam/
      domain/          User.ts  Company.ts  ApprovalPolicy.ts  errors.ts
      application/     sign-up.ts  authenticate.ts  get-actor.ts  list-directory.ts
                       assign-manager.ts  approvees-of.ts  can-decide.ts  get-contact.ts
      ports/           UserRepository.ts  PasswordHasher.ts
      infrastructure/  PgUserRepository.ts  BcryptPasswordHasher.ts
      index.ts
  shared/
    problem.ts         erreurs RFC 9457
    unit-of-work.ts    transaction scopée RLS (ex-withUserScope)
    logger.ts          logs JSON + correlationId
    config.ts          lecture et validation de l'environnement
    http.ts            helpers des adapters de route (acteur, parse, traduction d'erreurs)
    mail/              Mailer.ts (port générique)  OutboxMailer.ts  InMemoryMailer.ts
  worker/mail-worker.ts  process séparé : livre mail_outbox en SMTP, aucun import de modules/
  lib/auth.ts          point d'entrée Auth.js conservé (mocké par les tests), délègue à iam
```

`src/domain`, `src/ports`, `src/adapters`, `src/utils`, `src/lib/ocr.ts`, `src/lib/storage.ts` et `src/lib/errors.ts` sont absorbés dans les modules ou supprimés (F22, F23, F24). `NotificationPort` est remplacé par le port `Mailer`. Les tests unitaires qui visent ces fichiers les suivent : seuls leurs imports changent.

### Règles de dépendance

Elles sont vérifiées en CI par `dependency-cruiser`, et une violation fait échouer la PR.

- `domain` n'importe rien, hors bibliothèque standard.
- `application` n'importe que `domain`, `ports` et `shared`, et l'`index.ts` d'un autre module.
- `infrastructure` implémente `ports` et peut importer `shared`.
- Un module n'importe un autre module que par son `index.ts`.
- `app/` n'importe que des `modules/*/index.ts`, `shared` et `lib/auth.ts`.
- `worker/` n'importe que `shared/config` et `shared/logger`, **jamais `modules/`**.
- Aucun SQL de `expenses` ne référence les tables `users` ou `companies`. Une règle grep en CI le vérifie, car `dependency-cruiser` ne voit pas le SQL.

### Unité de travail

`shared/unit-of-work.ts` expose `runInScope(actorId, fn)`. La fonction ouvre une transaction, pose `app.current_user_id` et passe à `fn` un contexte qui fournit les repositories et le `Mailer`, **tous sur la même connexion**. La note et son e-mail sont donc écrits dans une seule transaction. S3 reste hors transaction, et l'ordre d'écriture est fixé dans [`submitExpenseNote`](#submitexpensenote-f10). Les use cases ne voient que l'interface `UnitOfWork`, sans type `pg`.

### Acteur

Le JWT ne porte plus que l'`id`. Chaque adapter de route appelle `iam.getActor(session.user.id)`, qui relit en base le rôle, l'entreprise et le manager (F31) :

- pas de session, ou un acteur introuvable : `401` ;
- un rôle non autorisé : `403` (F27).

### API publique des modules

- **`iam`** : `signUp`, `authenticate`, `getActor`, `listDirectory`, `assignManager`, `approveesOf(actor)`, `canDecide(actor, ownerId)`, `getContact(userId)`.
  - `approveesOf(actor)` renvoie les ids des auteurs dont l'acteur valide les notes.
  - `getContact(userId)` renvoie le nom et l'e-mail.
- **`expenses`** : `submitExpenseNote`, `listMyExpenseNotes`, `listPendingApprovals`, `decideExpenseNote`, `getReceiptUrl`, `suggestFromReceipt`.

## Règles métier

### `ApprovalPolicy` (domaine `iam`, pure)

C'est la seule source de « qui valide qui » :

```
approversOf(owner):
  owner.managerId ≠ null  → [ce manager]            (même entreprise, rôle manager — garanti par assignManager)
  sinon                   → RH de l'entreprise, sauf owner lui-même
                            (employé non rattaché F33, manager racine, RH F14)
canDecide(actor, owner) = actor.id ∈ approversOf(owner)
```

- La **file manager** (`GET /api/manager/expense-notes`) contient les notes `pending` de ses subordonnés directs, sans transitivité.
- La **file RH** (`GET /api/hr/expense-notes`) contient toutes les notes `pending` dont un RH de l'entreprise est validateur, sauf les siennes. Son format ne change pas.
- L'extension aux employés non rattachés et aux autres RH est un choix de l'équipe, justifié par F14 et F33. Elle respecte les deux règles de la consigne.
- Un **RH seul** dans son entreprise n'a aucun validateur. Sa soumission est quand même acceptée (`201`). La note reste `pending` et n'apparaît dans aucune file. C'est une limite documentée dans l'ADR 0002, qui disparaît dès qu'un second RH existe.

### `assignManager` (F5, F30)

Tout se fait dans une transaction, avec un verrou sur les lignes concernées :

1. La cible appartient à l'entreprise du RH et a le rôle `employee` ou `manager`. Sinon : `404`.
2. Si `managerId ≠ null` :
   - le manager est de la même entreprise et a le rôle `manager`, sinon `409 invalid-manager` ;
   - il est différent de la cible et ne fait pas partie de ses descendants (`WITH RECURSIVE` sur `manager_id`), sinon `409 invalid-manager`.
3. On fait l'`UPDATE` et on renvoie le même corps qu'aujourd'hui.

### `decideExpenseNote` (F9, F15)

Ce use case remplace les quatre handlers approve et reject (manager et RH). Les quatre routes deviennent des adapters d'une dizaine de lignes. Tout se passe dans une seule unité de travail :

1. On charge la note dans le scope RLS. Si elle est introuvable ou invisible : `404`.
2. Si `iam.canDecide(actor, note.userId)` est faux : `404`, sans révéler l'existence de la note.
3. L'agrégat applique `note.approve()` ou `note.reject()`. Si la note n'est pas `pending`, il lève `AlreadyDecided`.
4. `NoteRepository.saveDecision` fait `UPDATE … SET status = $2 WHERE id = $1 AND status = 'pending'`. Si aucune ligne n'est touchée, il lève `AlreadyDecided`, traduit en `409` (`error: "Already decided"`, type `already-decided`).
5. `iam.getContact(note.userId)` donne le destinataire.
6. `decisionEmail(contact, note, correlationId)` compose l'e-mail : objet, texte en français, montant au format `Intl.NumberFormat('fr-FR')` et date de la dépense.
7. `mailer.send(email)` : `OutboxMailer` l'écrit dans `mail_outbox`, sur la connexion de la transaction.
8. La réponse est `200`, avec le même DTO qu'aujourd'hui.

### `submitExpenseNote` (F10)

Postgres et S3 ne partagent pas de transaction. C'est la même double écriture que pour l'e-mail, et on la règle explicitement : **le reçu d'abord, la note ensuite**, sans transaction ouverte pendant l'appel réseau.

1. On valide les entrées, avec les mêmes règles et messages qu'aujourd'hui. La taille est contrôlée avant de lire le corps (F34, voir [Entrées](#entrées-et-secrets-f3-f25-f34)).
2. On réserve le numéro du reçu avec `NoteRepository.nextReceiptSeq()` (`SELECT nextval(…)`). Le format des clés ne change pas.
3. On envoie le reçu à S3, hors transaction. En cas d'échec : `502 receipt-upload-failed`, et rien n'est écrit en base.
4. Dans une unité de travail courte, on fait l'`INSERT` de la note, avec `receipt_seq` et `receipt_key` déjà connus, puis le `COMMIT`.

Il n'y a donc plus de note sans reçu (F10, F39). Si l'`INSERT` échoue après l'upload, l'objet S3 reste orphelin. C'est sans risque, car aucune note ne le référence et le bucket est privé. On l'accepte, et le script `npm run receipts:orphans` liste et supprime les objets sans note de plus de 24 h. Il est décrit dans un runbook.

### `signUp` (F4, F11, F12)

- **F4.** Un domaine de messagerie publique ne fonde jamais d'entreprise. La liste (gmail, googlemail, outlook, hotmail, live, yahoo, icloud, me, proton, protonmail, gmx, free, orange, laposte, wanadoo, sfr) vit dans le domaine `iam` (`Company.isPublicEmailDomain`). L'inscription est refusée avec « Utilise ton adresse professionnelle : les adresses de messagerie publique ne peuvent pas créer d'entreprise. ». C'est une server action et pas une route d'API, donc le contrat est inchangé. Le seed et les fabriques de test utilisent déjà des domaines d'entreprise.
- **Limite.** On ne vérifie pas qu'un domaine d'entreprise appartient bien à celui qui l'inscrit en premier : le modèle « un domaine = une entreprise » (F6) reste hors périmètre.
- **F11.** L'entreprise et l'utilisateur sont créés dans une seule transaction.
- **F12.** Une violation d'unicité sur l'email donne le message existant « Un compte existe déjà avec cet email. », et plus un 500.
- Les autres règles de validation et de rôle restent celles d'aujourd'hui.

### `suggestFromReceipt` (F17, F19)

L'OCR reste synchrone (D2). Ses risques sont traités **dans l'adapter `TesseractReceiptReader`**, sans toucher au use case ni au contrat :

- **F17.** Un seul moteur Tesseract est créé au premier appel et réutilisé ensuite, avec le cache de langue activé, au lieu d'un moteur créé et détruit à chaque requête. Le nombre d'OCR simultanés est plafonné (2 par défaut, `OCR_MAX_CONCURRENCY`). Au-delà, les demandes attendent dans une file en mémoire, avec un délai maximal de 30 s puis `503`, et un en-tête `Retry-After`.
- **F19.** La taille du reçu soumis à l'OCR est plafonnée à 10 Mo, comme à la création. Au-delà, on renvoie `400` avec le même message qu'à la création (« Fichier trop volumineux »).

### `getReceiptUrl` (F1)

- Pour l'auteur : la note doit lui appartenir.
- Côté manager ou RH : `iam.canDecide(actor, note.userId)`, sinon `404`.

## Notification de décision

### Pourquoi ce flux est asynchrone

La justification est la **fiabilité**, pas la vitesse : la route d'approbation répond déjà en 7 ms (médiane). Un vrai serveur SMTP ajoute de la latence, a des quotas et des pannes, et nodemailer attend par défaut jusqu'à 2 min à la connexion et 10 min sur une socket inactive. Enregistrer la décision et envoyer l'e-mail touchent deux systèmes qu'on ne peut pas rendre atomiques : un crash entre les deux perd l'e-mail ou annonce une décision qui n'a pas eu lieu.

Le flux respecte la consigne : la décision répond exactement comme aujourd'hui, et seul l'ordre d'exécution change.

### Principe

**Toute décision métier se prend dans le cœur.** À qui écrire et quoi écrire sont décidés par `decideExpenseNote`, pendant la requête. **Livrer n'est pas une décision métier** : le worker de livraison est de l'infrastructure, hors de l'hexagone. Il ne sait pas ce qu'est une note de frais. Les deux process ne s'appellent jamais : leur seul lien est la table `mail_outbox`, qui leur sert de contrat.

Le port `Mailer` (`send(email)`) vit dans `shared/mail/`, car il est générique : une future confirmation d'inscription l'utilisera tel quel. Il a trois implémentations :

- `OutboxMailer`, en production et en E2E : il écrit dans `mail_outbox`, sur la connexion de l'unité de travail ;
- `SmtpMailer`, réservé au worker et au débogage local ;
- `InMemoryMailer`, pour les tests unitaires.

### Données

```sql
CREATE TABLE mail_outbox (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient       text NOT NULL,
  subject         text NOT NULL,
  body_text       text NOT NULL,
  correlation_id  text,
  status          text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','sent','dead')),
  attempts        int NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_error      text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  sent_at         timestamptz
);
CREATE INDEX mail_outbox_pending_idx ON mail_outbox (next_attempt_at) WHERE status = 'pending';
```

- `expense_app` n'a que l'`INSERT` sur `mail_outbox`.
- Le worker se connecte avec le rôle `expense_mailer`, qui a `SELECT`, `UPDATE` et `DELETE` sur `mail_outbox` et **aucun droit ailleurs**.
- RLS n'est pas activée sur cette table interne.
- Le schéma de la table est le contrat entre les deux process. Il évolue uniquement par migration.

### Worker de livraison (`src/worker/mail-worker.ts`)

Toutes les 1 à 2 secondes, le worker :

1. **réserve un lot** dans une transaction courte, aussitôt validée :
   ```sql
   UPDATE mail_outbox SET next_attempt_at = now() + interval '2 minutes'
   WHERE id IN (SELECT id FROM mail_outbox
                WHERE status = 'pending' AND next_attempt_at <= now()
                ORDER BY created_at LIMIT 5 FOR UPDATE SKIP LOCKED)
   RETURNING *;
   ```
2. **envoie** chaque e-mail **hors transaction**, avec `Message-ID: <id@expense.io>` et des timeouts nodemailer courts (5 s à la connexion et au greeting, 10 s sur la socket) ;
3. **marque** chaque ligne par une requête autonome :
   - en cas de succès, `status = 'sent'` et `sent_at = now()` ;
   - en cas d'échec, `attempts + 1`, `last_error`, `next_attempt_at` repoussé de 10 s après le premier échec puis d'1 min, et `status = 'dead'` au troisième échec.

**Ce que le bail apporte.** Aucune transaction ni aucun verrou ne restent ouverts pendant un appel SMTP. Si le worker plante, seul l'e-mail en cours peut repartir, et seulement à l'expiration du bail. Plusieurs workers peuvent tourner en parallèle sans se gêner.

**Règle : le bail dure plus longtemps que le pire cas d'un lot.** Le pire cas vaut taille du lot × (timeout de connexion + timeout de socket), soit 5 × (5 s + 10 s) = 75 s, pour un bail de 2 min. Sinon, un second worker réserverait des lignes encore en cours d'envoi et les enverrait une seconde fois. Les trois valeurs sont configurables (`MAIL_BATCH_SIZE`, `MAIL_LEASE_SECONDS` et les timeouts SMTP), et le worker **refuse de démarrer** si la règle n'est pas respectée.

**Exploitation :**
- un log JSON d'erreur (avec `correlationId`) à chaque passage en `dead` ;
- `npm run mail:replay` remet les lignes `dead` en `pending` ;
- le worker purge lui-même les lignes `sent` de plus de 30 jours ;
- arrêt propre sur `SIGTERM` : il finit l'envoi en cours et arrête de réserver.

**Lancement :** `npm run worker` (`tsx src/worker/mail-worker.ts`). Mailpit est ajouté au compose (SMTP sur 1025, API et interface sur 8025).

**Traçabilité :** le `correlationId` est lu depuis l'en-tête `x-correlation-id`, ou généré s'il est absent. Il suit ce chemin : logs de la route, `mail_outbox.correlation_id`, logs du worker.

**Variables ajoutées à `.env.example` :** `AUTH_SECRET`, `MAILER_DATABASE_URL`, `SMTP_HOST`, `SMTP_PORT`, `MAIL_FROM`, `SONAR_HOST_URL`, `SONAR_TOKEN`.

### Limites assumées

- **Au moins une fois.** Un crash entre l'envoi et le marquage `sent` renvoie l'e-mail. Le `Message-ID` permet de repérer le doublon.
- **Délai.** L'e-mail part 1 à 2 s après la décision.
- **Contenu figé.** L'adresse et le texte sont ceux du moment de la décision, ce qui est attendu pour une notification.
- **Données personnelles en base.** Elles sont purgées 30 jours après l'envoi.
- **Pas d'événement métier.** Si un second consommateur doit un jour savoir qu'une note a été tranchée (statistiques, export comptable), on ajoutera une outbox d'événements à côté, sans toucher au worker de livraison. SQS ne se justifierait que si un autre service devait recevoir cet événement.

### Alternatives écartées

| Option | Pour | Contre | Pourquoi écartée |
|---|---|---|---|
| Envoi dans la route | minimal | la décision dépend du SMTP | un crash entre l'`UPDATE` et l'envoi perd l'e-mail |
| Envoi sans `await`, ou `after()` | réponse immédiate | ni persistance ni retry | un crash ou un redéploiement perd l'e-mail |
| Outbox d'événements, avec un worker qui compose l'e-mail | événement métier réutilisable | le worker doit charger le cœur ou contenir du métier | casse « toute décision métier dans le cœur » |
| Outbox, relay, SQS et consumer (option C initiale) | vocabulaire du cours visible | second saut, DLQ et table d'idempotence pour un seul consommateur | complexité sans garantie en plus |

## Socle commun

### Isolation (F2, F44) : la RLS n'assure que le cloisonnement

On sépare les rôles : **`ApprovalPolicy` fait seule foi** pour savoir qui voit et décide quelle note. La **RLS** est un filet qui garantit qu'**aucune donnée ne traverse la frontière d'une entreprise**, quel que soit le bug applicatif. La règle métier n'est écrite qu'une fois, en TypeScript, et la RLS ne la recopie pas, donc rien ne peut diverger (voir F22).

- **Le rôle applicatif.** Une migration crée `expense_app`, qui n'est ni superutilisateur, ni `BYPASSRLS`, ni propriétaire des tables. `DATABASE_URL` l'utilise. Les migrations et le seed gardent le rôle propriétaire (`MIGRATION_DATABASE_URL`).
- **`expense_notes.company_id`.** Une migration ajoute cette colonne, remplie depuis l'auteur pour les notes existantes, puis la rend `NOT NULL` avec une clé étrangère vers `companies`. À la création, elle est renseignée avec l'entreprise de l'acteur, et un trigger refuse une valeur différente de celle de l'auteur. Les policies n'ont donc plus besoin de joindre `users`.
- **Les policies, réécrites :**
  - `expense_notes` : lecture et mise à jour limitées à `company_id = app.current_company_id()`. L'insertion n'est permise que si `user_id` est l'acteur et `company_id` son entreprise.
  - `users` et `companies` : lecture limitée à sa propre entreprise. C'est ce qui permet `getContact` dans la portée du manager.
  - L'inscription et l'authentification, qui ont lieu avant toute portée, passent par deux fonctions `SECURITY DEFINER` à la surface minimale : `iam_sign_up(...)` et `iam_credentials_for(email)`.
  - Les anciennes policies `expense_notes_manager_*` et `expense_notes_hr_root_manager_*` sont supprimées.
- **Le contexte de portée.** `app.current_company_id()` est une fonction SQL qui lit `app.current_company_id`, posé par `runInScope` à côté de `app.current_user_id`.
- **Les index (F16).** On ajoute `expense_notes(user_id, created_at)`, `expense_notes(company_id, status)`, `users(manager_id)` et `users(company_id)`. Le gain est mesuré avec `EXPLAIN` sur les quatre requêtes de liste, et les résultats vont dans l'audit chiffré.

### Entrées et secrets (F3, F25, F34)

- `?sort=` passe par une liste blanche : `created_at`, `expense_date` ou `amount`, combiné avec `asc` ou `desc`, avec `created_at desc` par défaut. Une valeur hors liste est ignorée, et on applique le tri par défaut.
- `AUTH_SECRET` est lu par `shared/config.ts`, et le démarrage échoue s'il manque.
- **F34.** `shared/http.ts` refuse le corps **avant** de le lire si `Content-Length` est absent ou dépasse la limite de la route : 10 Mo et quelques kilo-octets pour les envois de reçus, 64 Ko pour le JSON. La réponse est un `400` avec le message existant « Fichier trop volumineux », ou « Corps de requête invalide » pour le JSON.
- **F41.** `PUT /api/hr/users/{id}/manager` exige un corps JSON valide qui contient explicitement la clé `managerId` (`null` pour détacher). Sinon, la route renvoie `400`, au lieu de détacher l'employé en silence.

### Erreurs (F26, F27, F42, F43)

- `shared/problem.ts` répond en `application/problem+json` avec `{ error, type, title, status, detail }`. Le champ `error` garde le texte actuel, donc le changement est additif.
- Chaque module définit ses erreurs typées dans `domain/errors.ts`. Elles sont traduites en HTTP à un seul endroit, `shared/http.ts` :

  | Erreur | Code HTTP |
  |---|---|
  | `NotFound` | 404 |
  | `Forbidden` | 403 |
  | `Unauthenticated` | 401 |
  | `Conflict` (`already-decided`, `invalid-manager`) | 409 |
  | `InvalidInput` | 400 |
  | `ReceiptUploadFailed` | 502 |
  | `Unavailable` (OCR saturé) | 503, avec `Retry-After` |
  | tout le reste | 500 |

- Une réponse 500 ne contient jamais de stack : la stack est seulement journalisée, avec le `correlationId`.
- Un id qui n'est pas un UUID, ou un corps illisible, donne `400`.
- Les routes font `return await` sur les use cases (F43).

## Contrat d'API

- `docs/contracts/openapi.yaml` décrit **d'abord** l'API actuelle (contract first). Il est écrit au début du plan 1, avant toute correction.
- En CI, `oasdiff breaking` compare le fichier de la branche avec celui de `main`.
- **Écarts volontaires**, chacun documenté dans l'OpenAPI et le CHANGELOG. Ils ajoutent des cas d'erreur et corrigent des failles, sans modifier aucune réponse en succès d'un client légitime : c'est une version **MINOR**.

| Endpoint | Avant | Après |
|---|---|---|
| tous | 500 avec `stack` | 500 sans stack, au format problem+json |
| endpoints manager | mauvais rôle → 401 | 403 |
| endpoints RH | sans session → 403 | 401 |
| id non UUID, corps illisible | 500 | 400 |
| `?sort=` | expression SQL libre | liste blanche, sinon tri par défaut |
| `POST …/approve` et `…/reject`, décisions concurrentes | les deux en 200 (course F9) | une en 200, l'autre en 409 `Already decided`, comme le cas séquentiel existant |
| `POST /api/expense-notes`, échec S3 | 500, note orpheline | 502, aucune note |
| `GET /api/hr/expense-notes` | managers racines seulement | plus complète (F14, F33), même format |
| `PUT /api/hr/users/{id}/manager` | manager d'une autre entreprise ou cycle → 200 | 409 `invalid-manager` |
| `…/receipt-url` côté manager | note de n'importe quelle entreprise | 404 hors équipe |
| `PUT /api/hr/users/{id}/manager`, corps illisible ou sans `managerId` | 200, employé détaché (F41) | 400 |
| `POST /api/expense-notes/receipt-suggestion`, fichier de plus de 10 Mo | accepté (F19) | 400 « Fichier trop volumineux » |
| `POST /api/expense-notes/receipt-suggestion`, OCR saturé plus de 30 s | attente illimitée (F17) | 503 avec `Retry-After` |
| `POST` avec `Content-Length` absent ou trop grand | corps lu en entier (F34) | 400 avant lecture |

## Interface utilisateur

- Les pages affichent le `detail` des nouvelles réponses d'erreur (`409 Already decided`, `409 invalid-manager`, `400`) au lieu d'un message générique.
- La console RH (`AdminConsole`) signale les employés non rattachés (rôle `employee`, `managerId` à `null`), à partir de `GET /api/hr/users`.
- La file RH affiche les notes des employés non rattachés et des autres RH, au même format.

## SonarQube

La consigne l'impose : SonarQube **doit** tourner sur le dépôt. C'est la première tâche du plan 1, avant toute modification de code, pour que le run « avant » porte sur la base intacte.

- **En local :**
  - le service `sonarqube` (image `sonarqube:community`) est déclaré dans le profil `quality` du compose et lancé par `make sonar-up` ;
  - `npm run sonar` lance `@sonar/scan` avec `SONAR_HOST_URL` et `SONAR_TOKEN` ;
  - le runbook `sonarqube-analyse.md` décrit le premier démarrage (mot de passe administrateur, création du projet et du jeton).
- **`sonar-project.properties`** déclare :
  - les sources `src` et les tests `tests` ;
  - la couverture `coverage/lcov.info`, produite par `npm run test:coverage` ;
  - les exclusions (`tessdata`, `migrations`, `scripts`, fichiers générés).
- **En CI (obligatoire) :**
  - le job `sonarqube` tourne sur chaque PR et chaque push sur `main` ;
  - il démarre `sonarqube:community` en conteneur de service, attend qu'il soit prêt, crée le projet et un jeton par l'API web, puis lance l'analyse avec la couverture du job Vitest ;
  - il **échoue si l'analyse échoue** ;
  - le statut du quality gate (« Sonar way », sur le nouveau code) et les métriques clés sont publiés dans le résumé du job et en artefact, sans bloquer la PR.
- **Mesures :** pour l'audit chiffré, on garde les métriques des runs avant / après (bugs, vulnérabilités, hotspots, code smells, duplication, complexité cognitive, couverture) dans `docs/audit/sonarqube-avant-apres.md`, avec les captures du tableau de bord.

## Prêt pour les agents (*agentic ready*)

**Objectif :** qu'un agent (Claude Code, Codex, Cursor, OpenCode…) sache sans hésiter **où va le nouveau code, comment le vérifier et comment le documenter**, afin d'ajouter une fonctionnalité en un seul prompt devant le jury. La structure s'inspire de cnp-dev, adaptée à ce dépôt.

### Instructions : `AGENTS.md` comme source unique

- **`AGENTS.md`** est chargé à chaque session, donc il reste court (une centaine de lignes au plus). Il contient :
  - l'architecture en cinq lignes, avec un lien vers le schéma et l'ADR 0002 ;
  - les règles de dépendance ;
  - la recette « ajouter une fonctionnalité » en version courte, qui renvoie au skill ;
  - les commandes : `make dev`, `npm run verify`, `npm run verify:full`, `npm run sonar` ;
  - les conventions git, résumées depuis `CONTRIBUTING.md` ;
  - la doc et la préférence superpowers ;
  - la liste des skills ;
  - « Maintenir ce fichier ».
- **`CLAUDE.md`** contient une seule ligne : `@AGENTS.md`.
- **`AGENTS.local.example.md`** sert de modèle pour les préférences personnelles. `AGENTS.local.md` est ajouté au `.gitignore`.
- **`CONTRIBUTING.md`** décrit les conventions git observées dans le dépôt :
  - branches `<prénom>/arla-<n>-<sujet>` ;
  - commits `type(ARLA-n): description` en français ;
  - PR vers `main` avec la CI verte.
- **Préférence superpowers**, écrite dans `AGENTS.md` : les specs vont dans `docs/specs/YYYY-MM-DD-<sujet>.md` et les plans dans `docs/plans/YYYY-MM-DD-<sujet>[-n-…].md`, jamais dans `docs/superpowers/` ni avec le suffixe `-design`. Les décisions transverses sont extraites en ADR.

### Documentation : `docs/` par type

| Dossier | Contenu | Nommage |
|---|---|---|
| `docs/specs/` | specs (le quoi, le pourquoi) | `YYYY-MM-DD-<sujet>.md` |
| `docs/plans/` | plans d'implémentation | même slug que la spec, suffixe `-n-<partie>` si plusieurs |
| `docs/adrs/` | décisions transverses en vigueur | `NNNN-<décision>.md` |
| `docs/runbooks/` | procédures d'exploitation | `<composant>-<action>.md` |
| `docs/architecture/` | études d'options, schéma cible, `conventions.md` | libre |
| `docs/audit/` | as-is, mesures avant / après | libre |
| `docs/contracts/` | `openapi.yaml` | — |

- Chaque dossier typé a un `README.md` (rôle, conventions) et un `<type>-template.md`. `docs/README.md` sert d'index et décrit le cycle spec → plan → implémentation → runbook.
- Les documents sont rédigés **en français**, comme le reste du dépôt.
- Les specs et le plan existants d'ARLA-9 ont déjà été déplacés depuis `docs/superpowers/`.
- ADR à créer dans le plan 1 :
  - **0001** structure de la doc et harnais agent ;
  - **0002** monolithe modulaire hexagonal (option C, alternatives A, B et D, limite du RH seul) ;
  - **0003** notification par outbox d'e-mails ;
  - **0004** contrat d'API figé et erreurs RFC 9457.
- Runbooks :
  - `dev-environnement-demarrer.md` ;
  - `sonarqube-analyse.md` ;
  - `mail-outbox-rejouer.md` ;
  - `demo-live-preparer.md` (check-list du jour J).

### Skills (standard Agent Skills)

Les skills vivent dans `.agents/skills/<nom>/SKILL.md`. Claude Code ne lit que `.claude/skills/`, et ce dépôt est cloné sous Windows avec `core.symlinks=false`, donc les liens symboliques de cnp-dev ne fonctionneraient pas. Ici, `npm run agents:sync` **copie** chaque skill vers `.claude/skills/<nom>/`, et un job CI échoue si les copies divergent.

| Skill | Rôle |
|---|---|
| `ajouter-une-fonctionnalite` | **Le skill du live coding.** Recette pas à pas : règle dans `domain` → use case (un fichier) → port et adapter si besoin → export dans `index.ts` → route (adapter mince) → `openapi.yaml` (ajout seulement) → UI → tests (unitaire du use case, intégration de la route, E2E si parcours visible) → `npm run verify`. Contient un exemple complet tiré du code (`getReceiptUrl`), la liste des pièges (SQL cross-module, logique dans la route, erreur non typée, oubli de l'OpenAPI) et le format du résumé final. |
| `envoyer-un-email` | Comment notifier quelqu'un : composer l'e-mail dans le use case, appeler `mailer.send` dans l'unité de travail, ne jamais toucher au worker. |
| `verifier-avant-de-livrer` | Les commandes de vérification, dans l'ordre, et quoi faire en cas d'échec (`verify`, `verify:full`, `sonar`). |
| `utiliser-la-doc` | Adapté de cnp-dev : quel type de document, où, à partir de quel gabarit, quels liens maintenir. |

### Sous-agent de revue

Le sous-agent `revue-architecture` relit un diff contre les règles de dépendance, la recette et le contrat d'API, et rend une liste de constats. Sa méthode vit dans le skill `.agents/skills/revue-architecture/`, avec une définition mince par outil : `.claude/agents/revue-architecture.md`, `.opencode/agents/revue-architecture.md` et `.codex/agents/revue-architecture.toml`, au même nom et à la même description. Pendant la démo, l'agent principal le lance avant de conclure.

### Commandes et environnement prévisibles

- **`make dev`** fait tout en une commande : compose (Postgres, LocalStack, Mailpit), migrations, seed, bucket, puis web et worker en parallèle.
- **`npm run verify`** lance `lint`, `typecheck`, `depcruise`, la règle « SQL cross-module » et `vitest run`. C'est le contrôle que l'agent lance avant de conclure.
- **`npm run verify:full`** ajoute les E2E Playwright.
- Le **seed** fournit une entreprise de démo complète (RH, managers, employés rattachés et non rattachés, notes dans tous les états), avec des identifiants documentés dans le runbook de démo.
- **`.claude/settings.json`**, versionné :
  - il autorise sans confirmation les scripts du projet (`npm run *`, `make *`, `npx vitest`, `npx playwright`, `docker compose *`) et les commandes git en lecture ;
  - il refuse `git push --force`, `rm -rf` et toute écriture dans `.env` ;
  - le but est qu'aucune demande de permission n'interrompe la démo.

### Répétition

Avant la soutenance, on fait au moins une répétition chronométrée, depuis un clone propre, avec une fonctionnalité du domaine qu'on ne livre pas (par exemple un motif de rejet). On note la durée, les écarts à la recette et les corrections à apporter à `AGENTS.md` ou aux skills. Les corrections sont commitées, la fonctionnalité est jetée.

## Couverture de l'audit

Chacun des 46 constats de l'audit QA est soit **traité** (avec le plan qui le corrige), soit **hors périmètre** (avec la raison). Les constats hors périmètre sont repris tels quels dans l'audit chiffré « après ».

| Constat | Gravité | Statut | Où / pourquoi |
|---|---|---|---|
| F1 Reçus lisibles d'une autre entreprise | Critique | traité · plan 1 | contrôle d'accès sur `receipt-url` et RLS d'isolation, puis `canDecide` au plan 2 |
| F2 RLS contournée (superuser) | Critique | traité · plan 1 | rôle `expense_app` |
| F3 Injection via `?sort=` | Critique | traité · plan 1 | liste blanche |
| F4 Premier inscrit d'un domaine = RH | Élevé | traité · plan 2 | domaines de messagerie publique refusés ; l'usurpation d'un domaine d'entreprise reste possible (F6) |
| F5 Manager d'une autre entreprise | Élevé | traité · plan 2 | `assignManager` |
| F6 Un domaine = une entreprise | Moyen | hors périmètre | modèle d'identité d'entreprise (invitations, vérification du domaine) : une fonctionnalité, pas une refacto |
| F7 Email sensible à la casse | Moyen | hors périmètre | correction de données et de comportement, sans effet sur l'architecture ; à planifier après |
| F8 Un employé ne devient jamais manager | Faible | hors périmètre | fonctionnalité manquante |
| F9 Décisions concurrentes | Élevé | traité · plan 2 | `UPDATE … WHERE status = 'pending'` |
| F10 Note sans reçu | Moyen | traité · plan 2 | reçu d'abord, note ensuite |
| F11 Entreprise orpheline à l'inscription | Moyen | traité · plan 2 | une transaction |
| F12 Course sur l'email à l'inscription | Faible | traité · plan 2 | violation d'unicité traduite en message |
| F13 Montant hors `numeric(10,2)` | Moyen | hors périmètre | resserrement des validations ; la 500 perd sa stack (F26) |
| F14 Notes d'un RH sans validateur | Moyen | traité · plan 2 | `ApprovalPolicy` ; le RH seul reste une limite documentée |
| F15 Notification jamais envoyée | Moyen | traité · plan 3 | outbox d'e-mails |
| F16 Aucun index | Élevé | traité · plan 1 | quatre index, gain mesuré avec `EXPLAIN` |
| F17 OCR : moteur recréé à chaque appel | Élevé | traité · plan 2 | moteur réutilisé, concurrence plafonnée ; l'OCR reste synchrone (D2) |
| F18 Pas de pagination | Moyen | hors périmètre | changerait la forme des réponses, donc le contrat (consigne) |
| F19 OCR sans limite de taille | Élevé | traité · plan 2 | plafond de 10 Mo |
| F20 Pas de limitation de débit | Moyen | hors périmètre | sujet transverse d'infrastructure (reverse proxy ou passerelle), pas du code applicatif |
| F21 OCR et hachage dans la requête | Moyen | partiel | OCR atténué par F17 et F19 ; l'OCR asynchrone est écarté par choix de périmètre (D2) ; bcrypt reste dans la requête (coût voulu) |
| F22 Couche hexagonale morte | Moyen | traité · plan 2 | modules branchés, code mort supprimé |
| F23 `toExpenseNote` dupliqué | Faible | traité · plan 2 | un seul mapper dans `expenses` |
| F24 Utilitaires morts | Faible | traité · plan 2 | supprimés |
| F25 Secret en dur | Critique | traité · plan 1 | `shared/config` |
| F26 Stack dans les 500 | Élevé | traité · plan 1 | `shared/problem` |
| F27 401 et 403 incohérents | Faible | traité · plan 1 | `shared/http` |
| F28 Décisions irréversibles, sans piste d'audit | Faible | hors périmètre | fonctionnalité |
| F29 Défauts d'affichage | Faible | hors périmètre | cosmétique ; l'UI reste libre pour le live coding |
| F30 Cycle dans l'organigramme | Élevé | traité · plan 2 | `assignManager` (`WITH RECURSIVE`) |
| F31 Rôle figé dans le JWT | Moyen | traité · plan 2 | `getActor` relu à chaque requête |
| F32 `expenseDate` non validée | Moyen | hors périmètre | resserrement des validations ; la 500 perd sa stack |
| F33 Employé sans manager, notes sans validateur | Moyen | traité · plan 2 | `ApprovalPolicy` ; suppose F4 |
| F34 Corps lu avant le contrôle de taille | Moyen | traité · plan 1 | `Content-Length` vérifié dans `shared/http` |
| F35 Aucun test ni CI | Moyen | déjà traité | ARLA-9, puis complété par cette refacto |
| F36 Énumération des comptes | Faible | hors périmètre | sécurité, faible ; à planifier après |
| F37 Type du reçu non vérifié | Faible | hors périmètre | resserrement des validations |
| F38 Fonctions métier manquantes | Faible | hors périmètre | candidates au live coding |
| F39 Note orpheline exposant le bucket | Moyen | traité · plan 2 | plus de note sans clé (F10) et `404` |
| F40 Saisie corrompue sans erreur | Moyen | hors périmètre | resserrement des validations |
| F41 Corps illisible = employé détaché | Moyen | traité · plan 1 | `400` si `managerId` est absent |
| F42 Entrée malformée → 500 | Faible | traité · plan 1 | `400` |
| F43 `withUserScope` sans `await` | Faible | traité · plan 1 | `return await` |
| F44 RLS incomplète | Moyen | traité · plan 1 | RLS d'isolation sur toutes les tables métier |
| F45 Reçu vide accepté | Faible | hors périmètre | resserrement des validations |
| F46 Pages `/manager` et `/hr` servies à tous | Faible | hors périmètre | UI, sans risque de données (les API refusent) |

**Bilan.** Les 4 constats critiques et les 8 constats élevés sont traités. Pour F17, la correction reste une atténuation, puisque l'OCR reste synchrone. Parmi les constats hors périmètre, aucun n'est critique ni élevé.

## Tests

**Stratégie.** L'hexagonal sert d'abord à ça :
- les use cases sont testés unitairement avec de faux adapters (en mémoire) ;
- les routes sont testées en intégration, rôle par rôle, contre un vrai Postgres et un vrai S3 ;
- chaque constat traité a **au moins un test** qui échouerait s'il revenait.

F35 (« aucun test ni CI ») est déjà réglé par ARLA-9 : plus de 140 tests, et une CI avec lint, Vitest et Playwright sur chaque PR. La refacto s'appuie dessus et la complète.

- **Unitaires (nouveaux) :**
  - `ExpenseNote` (transitions) ;
  - `ApprovalPolicy` : un cas par ligne du tableau des validateurs (employé rattaché, employé non rattaché, manager racine, RH, RH seul), plus la détection de cycle ;
  - `Company.isPublicEmailDomain` (F4) ;
  - `decisionEmail` (destinataire, objet, montant formaté) ;
  - chaque use case, avec des repositories, un `InMemoryMailer` et un `iam` en mémoire.
- **Intégration (existants) :** ils restent en place et importent les mêmes `route.ts`. Les `[as-is]` du périmètre basculent vers le comportement corrigé : 401/403, stack, `?sort=`, note orpheline, UUID → 400, corps illisible → 400, utilisateur supprimé → 401.
- **Intégration (nouveaux) :**
  - concurrence F9 : approve et reject en parallèle donnent un 200 et un 409 ;
  - F5 et F30 : manager d'une autre entreprise, cycle direct, cycle long ;
  - F14 et F33 : file RH élargie, un RH ne voit jamais sa propre note, un RH seul soumet bien (201) ;
  - consigne « manager direct » : rien de visible ni de décidable au-delà des subordonnés directs ;
  - F4 : une inscription en `@gmail.com` (et chaque domaine de la liste) est refusée, et aucune entreprise n'est créée ;
  - F11 et F12 : un échec en milieu d'inscription ne laisse aucune entreprise orpheline, et deux inscriptions simultanées avec le même email donnent un compte et un message, sans 500 ;
  - F31 : un rôle modifié en base prend effet immédiatement ;
  - F10 et F39 : un échec S3 n'écrit aucune note, et un échec de l'`INSERT` après l'upload laisse un objet que `receipts:orphans` détecte ;
  - F17 et F19 : un reçu de plus de 10 Mo est refusé avant l'OCR ; deux OCR successifs réutilisent le même moteur ; au-delà du plafond de concurrence, la demande attend puis reçoit `503` ;
  - F34 et F41 : un `Content-Length` trop grand est refusé sans lire le corps, et un corps sans `managerId` donne `400` sans modifier l'organigramme ;
  - isolation RLS : connecté en `expense_app`, aucune requête ne voit de note, d'utilisateur ou d'entreprise d'une autre entreprise, quel que soit le rôle, même en SQL direct sans filtre applicatif ;
  - `getContact` fonctionne dans la portée RLS du manager ;
  - outbox :
    - une décision refusée n'écrit aucune ligne dans `mail_outbox`, une décision acceptée en écrit exactement une ;
    - un `OutboxMailer` qui échoue annule la décision ;
  - worker :
    - une ligne `pending` est envoyée (API Mailpit) puis marquée `sent` ;
    - un crash simulé après la réservation : la ligne est renvoyée à l'expiration du bail ;
    - le worker refuse de démarrer si le bail est plus court que le pire cas d'un lot ;
    - un SMTP en panne fait passer la ligne en `dead` après 3 essais ;
    - deux workers en parallèle n'envoient jamais deux fois la même ligne ;
    - les lignes `sent` de plus de 30 jours sont purgées ;
    - `mail:replay` remet les lignes `dead` en `pending`.
- **E2E :**
  - la suite ARLA-9 reste à 100 % verte ;
  - nouveaux scénarios : un manager approuve et l'employé reçoit l'e-mail dans Mailpit (attente par polling de l'API Mailpit) ; le signalement RH des employés non rattachés ;
  - Playwright démarre le web et le worker.
- **CI :**
  - on ajoute le service Mailpit ;
  - on ajoute les jobs `dependency-cruiser`, « SQL cross-module », `oasdiff`, `agents:sync --check` et `sonarqube` (voir [SonarQube](#sonarqube)) ;
  - les seuils de couverture sont recalés au niveau mesuré après la refacto, sans baisse sur le périmètre existant.

## Découpage en plans

| Plan | Contenu | Prérequis | Livrable seul ? |
|---|---|---|---|
| **1. Socle et harnais agent** | **SonarQube en premier** (compose, `sonar-project.properties`, job CI, run « avant ») ; `dependency-cruiser` en mode rapport ; harnais agent (`AGENTS.md`, `CLAUDE.md`, `CONTRIBUTING.md`, `docs/` par type avec READMEs, gabarits, ADR 0001–0004 et runbooks, `utiliser-la-doc`, `verifier-avant-de-livrer`, `agents:sync`, `.claude/settings.json`, `make dev`, `npm run verify`) ; `openapi.yaml` de l'API actuelle et `oasdiff` ; `shared/config`, `shared/problem`, `shared/logger` ; rôle `expense_app`, `expense_notes.company_id` et RLS d'isolation ; index (F16) ; `?sort=` ; secret ; 401/403 ; 400 ; F1, F34, F41. Pendant ce plan, les routes existantes gardent leur filtrage SQL des droits : la RLS n'est qu'un filet d'isolation. | — | oui |
| **2. Modules** | `shared/unit-of-work` et `shared/http` ; module `iam` (dont `ApprovalPolicy`, `assignManager`, F4 dans `signUp`) puis module `expenses` (dont l'ordre S3 puis note, et F17 et F19 dans `TesseractReceiptReader`), en migrant les routes une par une avec la suite verte à chaque commit ; suppression du code mort ; `dependency-cruiser` bloquant ; ajustements d'UI ; `conventions.md`, skill `ajouter-une-fonctionnalite`, sous-agent `revue-architecture` | plan 1 | oui |
| **3. Notification** | migration `mail_outbox` et rôle `expense_mailer` ; `shared/mail` (`Mailer`, `OutboxMailer`, `InMemoryMailer`) ; `decisionEmail` et branchement dans `decideExpenseNote` ; worker de livraison (bail, retry, `dead`, purge, `replay`, `SIGTERM`) ; Mailpit dans le compose et la CI ; skill `envoyer-un-email` ; tests et E2E Mailpit ; run SonarQube « après » ; **répétition du live coding** | plan 2 | oui |

Le harnais agent est posé dès le plan 1 pour que les agents qui exécutent les plans 2 et 3 en profitent déjà. Le skill de live coding vient avec le plan 2, une fois que les modules existent et qu'il peut citer du vrai code.

## Risques

| Risque | Parade |
|---|---|
| La migration de `expense_notes.company_id` rencontre des notes dont l'auteur a disparu | la migration les compte et échoue avec un message explicite plutôt que d'inventer une entreprise ; aucune n'existe dans le seed ni dans les tests |
| Passer au rôle non superutilisateur révèle des requêtes qui dépendaient du contournement de la RLS | faire ce passage tôt dans le plan 1, la suite ARLA-9 servant de détecteur ; ajouter des policies ciblées, jamais `BYPASSRLS` |
| Les tests d'intégration mockent `@/lib/auth` | `lib/auth.ts` reste le point d'entrée ; seul son contenu délègue à `iam` |
| Next.js et `tsx` résolvent différemment l'alias `@/` | le worker n'importe que `shared/config` et `shared/logger`, et un test de démarrage du worker en CI le vérifie |
| SonarQube Community lent ou gourmand en CI (démarrage de 1 à 2 min, mémoire) | job séparé et parallèle aux tests ; attente active de `api/system/status` avec un timeout explicite ; cache du scanner |
| Les copies de skills divergent de `.agents/skills/` | `agents:sync --check` en CI |
| L'agent du live coding sort de la recette ou demande des permissions | skill dédié, sous-agent de revue, `.claude/settings.json`, et répétition chronométrée avant la soutenance |
| E2E instables à cause de l'asynchrone | attente de l'e-mail par polling de l'API Mailpit, avec un timeout explicite |
