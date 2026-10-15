# Architecture cible (option C) — design

> Refacto Expense.io · 15/10/2026 · base : branche ARLA-9 (`6e31ff7`) · études : [`docs/architecture/options-refacto.md`](../../architecture/options-refacto.md), [`docs/architecture/option-c.html`](../../architecture/option-c.html) · constats : audit QA F1–F46 · consignes de soutenance (notes de cours du 15/10).

### Consignes de soutenance

Ces consignes priment sur le reste de la spec :

- Tout le monde doit pouvoir créer une note de frais.
- Un manager ne valide que les notes des personnes dont il est le manager direct.
- Un RH valide les notes des managers racines, jamais les siennes.
- SonarQube doit tourner sur le dépôt.
- L'interface utilisateur peut être modifiée librement.
- L'ordre d'exécution peut changer tant que le contrat d'interface (l'API) ne change pas.
- De nouvelles fonctionnalités sont possibles si elles ont du sens et restent dans le même domaine.

## Objectif

Refondre Expense.io en **monolithe modulaire hexagonal, plus un flux asynchrone** (option C). Le comportement de l'API reste identique, sauf les corrections d'erreurs listées plus bas. Cette spec est la seule référence d'architecture. Elle est découpée en **trois plans d'implémentation**, exécutés dans l'ordre : socle, B, async.

Critères de succès :

1. La suite ARLA-9 reste verte à chaque commit. Les seuls tests modifiés sont les `[as-is]` du périmètre, qui basculent vers le comportement corrigé (convention ARLA-9).
2. `oasdiff breaking` ne signale que les écarts volontaires listés dans [Contrat d'API](#contrat-dapi).
3. `dependency-cruiser` ne signale aucune violation des règles de dépendance.
4. Les constats du périmètre sont corrigés et chacun est couvert par un test de non-régression : F1–F3, F5, F9–F11, F14, F15, F22–F27, F30, F31, F33, F42–F44.
5. Une décision de note envoie un e-mail à l'employé (visible dans Mailpit). Un message rejoué n'envoie pas de second e-mail, et un SMTP en panne envoie le message en DLQ après 3 essais.
6. Les mesures « avant / après » sont prises avec le même outillage : **SonarQube** (duplication, complexité, code smells, vulnérabilités et hotspots, couverture importée), `dependency-cruiser` et le nombre de tests `[as-is]` du périmètre.

## Décisions

| Sujet | Décision | Raison |
|---|---|---|
| D1 Option | **C** : B (modules + hexagonal) + flux asynchrone | seule option qui couvre les trois axes (Architecture, Contrat d'API, Asynchrone & run) |
| Découpage | une spec cible, **trois plans** (socle, B, async) | vision unique ; plans assez courts pour un agent ; B est livrable seul |
| D2 Flux async | **notification de décision seule** | effet de bord non critique ; seul l'ordre d'exécution change, pas le contrat (consigne de soutenance) ; l'OCR reste synchrone |
| D3 Broker | **SQS sur LocalStack + outbox + relay** | chaque notion du cours est visible (producer, outbox, broker, ack, DLQ) ; cible de prod réelle |
| D4 Jointures entre modules | **deux requêtes via l'API publique d'`iam`** ; RLS gardée en défense en profondeur, cohérence testée | frontière de module stricte, règle métier dans le domaine |
| D5 Vocabulaire | **hexagonal**, un fichier par use case | déjà le vocabulaire du dépôt ; « où va le nouveau code ? » sans ambiguïté |
| Validateurs | manager → ses subordonnés directs ; RH → managers racines, **plus** employés non rattachés (F33) et autres RH (F14) ; jamais sa propre note | respecte les deux règles de la consigne et débloque les notes sans validateur ; l'extension est un choix argumenté |
| Soumission | **toujours acceptée**, même sans validateur possible (RH seul de son entreprise) | consigne : tout le monde peut créer une note ; la note reste `pending`, et c'est une limite documentée |
| Qualité | **SonarQube Community** dans le docker-compose (profil `quality`) + job CI en rapport, sans quality gate bloquant | consigne de soutenance ; remplace `jscpd` et la règle `complexity` pour les mesures avant / après |
| Interface | les pages peuvent évoluer : affichage des nouvelles erreurs, signalement RH des employés non rattachés | consigne : l'UI est libre ; le contrat d'API, lui, reste fixe |
| Nouvelles fonctionnalités | **l'e-mail de décision et le signalement RH, rien de plus** | la fonctionnalité nouvelle sera celle du live coding ; chaque ajout serait un écart de contrat de plus à défendre |
| Effort | **non pris en compte** | la refacto est codée par des agents |

## Hors périmètre

- F4, F6, F8 et F38 sont documentés, pas corrigés.
- L'OCR asynchrone (`202` avec polling) n'est pas fait. Il est mentionné comme évolution possible devant le jury.
- Le resserrement des validations hors F42 n'est pas fait : virgule décimale, dates `jj/mm/aaaa`, reçu vide, contenu non vérifié, montant hors `numeric(10,2)`. Ces tests restent `[as-is]`, mais leurs 500 perdent la stack.
- Les pages React et `components/` ne sont pas réécrites. Elles sont seulement ajustées (voir [Interface utilisateur](#interface-utilisateur)).
- Aucune autre fonctionnalité métier n'est ajoutée (par exemple un motif de rejet).
- La facturation et OpenAI ne sont pas créés (YAGNI). Leur emplacement est documenté dans `conventions.md` : `modules/billing`, avec un port `PaymentProvider`.

## Architecture

### Arborescence

```
src/
  app/api/**/route.ts        adapters primaires : parse → use case → HTTP (même place, mêmes réponses)
  app/actions/auth.ts        adapter primaire (server actions signup/login) → iam
  app/**/page.tsx, components/  ajustés à la marge (erreurs, signalement RH), consomment l'API HTTP
  modules/
    expenses/
      domain/          ExpenseNote.ts  errors.ts
      application/     submit-expense-note.ts  list-my-expense-notes.ts  list-pending-approvals.ts
                       decide-expense-note.ts  get-receipt-url.ts  suggest-from-receipt.ts
                       send-decision-email.ts
      ports/           NoteRepository.ts  ReceiptStorage.ts  ReceiptReader.ts  Mailer.ts  EventOutbox.ts
      infrastructure/  PgNoteRepository.ts  S3ReceiptStorage.ts  TesseractReceiptReader.ts
                       SmtpMailer.ts  PgEventOutbox.ts
      index.ts         API publique + câblage manuel (sans framework d'injection)
    iam/
      domain/          User.ts  Company.ts  ApprovalPolicy.ts  errors.ts
      application/     sign-up.ts  authenticate.ts  get-actor.ts  list-directory.ts
                       assign-manager.ts  approvees-of.ts  can-decide.ts  contact-of.ts
      ports/           UserRepository.ts  PasswordHasher.ts
      infrastructure/  PgUserRepository.ts  BcryptPasswordHasher.ts
      index.ts
  shared/
    problem.ts         erreurs RFC 9457
    unit-of-work.ts    transaction scopée RLS (ex-withUserScope)
    logger.ts          logs JSON + correlationId
    config.ts          lecture et validation de l'environnement
    http.ts            helpers des adapters de route (acteur, parse, traduction d'erreurs)
  worker/main.ts       second process : relay outbox → SQS, consumer SQS → sendDecisionEmail
  lib/auth.ts          point d'entrée Auth.js conservé (mocké par les tests), délègue à iam
```

`src/domain`, `src/ports`, `src/adapters`, `src/utils`, `src/lib/ocr.ts`, `src/lib/storage.ts` et `src/lib/errors.ts` sont absorbés dans les modules ou supprimés (F22, F23, F24). Les tests unitaires qui les visent suivent leurs fichiers : seuls les imports changent.

### Règles de dépendance (vérifiées en CI par `dependency-cruiser`)

- `domain` n'importe rien, hors bibliothèque standard.
- `application` n'importe que `domain`, `ports` et `shared`, et l'`index.ts` d'un autre module.
- `infrastructure` implémente `ports` et peut importer `shared`.
- Un module n'importe un autre module que par son `index.ts`.
- `app/` et `worker/` n'importent que des `modules/*/index.ts`, `shared` et `lib/auth.ts`.
- Aucun SQL de `expenses` ne référence les tables `users` ou `companies`. Une règle grep en CI le vérifie, car `dependency-cruiser` ne voit pas le SQL.

### Unité de travail

`shared/unit-of-work.ts` expose `runInScope(actorId, fn)`. La fonction ouvre une transaction, pose `app.current_user_id` et passe un contexte de transaction à `fn`. Les repositories Pg et `PgEventOutbox` reçoivent ce contexte : une même transaction couvre donc la note, l'outbox et le reçu. Les use cases ne voient que l'interface `UnitOfWork`, sans type `pg`.

### Acteur

Le JWT ne porte plus que l'`id`. Chaque adapter de route appelle `iam.getActor(session.user.id)`, qui relit en base le rôle, l'entreprise et le manager (F31) :

- pas de session, ou un acteur introuvable : `401` ;
- un rôle non autorisé : `403` (F27).

### API publique des modules

- **`iam`** : `signUp`, `authenticate`, `getActor`, `listDirectory`, `assignManager`, `approveesOf(actor)` (ids des auteurs dont l'acteur valide les notes), `canDecide(actor, ownerId)`, `contactOf(userId)` (nom et e-mail, pour le worker).
- **`expenses`** : `submitExpenseNote`, `listMyExpenseNotes`, `listPendingApprovals`, `decideExpenseNote`, `getReceiptUrl`, `suggestFromReceipt`, `sendDecisionEmail`.

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

- La **file RH** (`GET /api/hr/expense-notes`) contient toutes les notes `pending` dont un RH de l'entreprise est validateur, sauf les siennes. Son format ne change pas.
- La **file manager** (`GET /api/manager/expense-notes`) contient les notes `pending` de ses subordonnés directs.
- Les **règles de la consigne** sont respectées : un manager ne valide que ses subordonnés directs (pas de transitivité), et un RH valide les managers racines, jamais ses propres notes. L'extension aux employés non rattachés et aux autres RH est un choix de l'équipe, justifié par F14 et F33.
- Un **RH seul** dans son entreprise n'a aucun validateur. Sa soumission est quand même acceptée (`201`), car la consigne veut que tout le monde puisse créer une note. La note reste `pending` et n'apparaît dans aucune file. C'est une limite connue, documentée dans l'ADR, qui disparaît dès qu'un second RH existe.

### `assignManager` (F5, F30)

Tout se fait dans une transaction, avec un verrou sur les lignes concernées :

1. La cible appartient à l'entreprise du RH et a le rôle `employee` ou `manager`. Sinon : `404`.
2. Si `managerId ≠ null` :
   - le manager est de la même entreprise et a le rôle `manager`, sinon `409 invalid-manager` ;
   - il est différent de la cible et ne fait pas partie de ses descendants (`WITH RECURSIVE` sur `manager_id`), sinon `409 invalid-manager`.
3. On fait l'`UPDATE` et on renvoie le même corps qu'aujourd'hui.

### `decideExpenseNote` (F9, F15)

Ce use case remplace les quatre handlers approve et reject (manager et RH). Les quatre routes deviennent des adapters d'une dizaine de lignes.

1. On charge la note dans le scope RLS. Si elle est introuvable ou invisible : `404`.
2. Si `iam.canDecide(actor, note.userId)` est faux : `404`, sans révéler l'existence de la note.
3. L'agrégat applique `note.approve()` ou `note.reject()`. Si la note n'est pas `pending`, il lève `AlreadyDecided`.
4. `NoteRepository.saveDecision` fait `UPDATE … SET status = $2 WHERE id = $1 AND status = 'pending'`. Si aucune ligne n'est touchée, il lève `AlreadyDecided`, traduit en `409` avec le type `already-decided`.
5. Dans la même transaction, `EventOutbox.add(expense.note-decided.v1)`.
6. La réponse est `200` avec le même DTO qu'aujourd'hui.

### `submitExpenseNote` (F10)

Tout se passe dans une seule unité de travail :

1. On valide les entrées, avec les mêmes règles et messages qu'aujourd'hui.
2. On fait l'`INSERT` de la note.
3. On calcule la clé à partir de `receipt_seq`.
4. On envoie le reçu à S3.
5. On met à jour `receipt_key`.
6. On fait le `COMMIT`.

Si l'upload échoue, tout est annulé et on renvoie `502 receipt-upload-failed` : plus aucune note sans reçu. Un objet S3 peut rester orphelin si le `COMMIT` échoue après l'upload. Ce cas est accepté et documenté.

### `signUp` (F11)

L'entreprise et l'utilisateur sont créés dans une seule transaction. Une violation d'unicité sur l'email donne le message existant « Un compte existe déjà avec cet email. », et plus un 500. Les règles de validation et de rôle restent celles d'aujourd'hui.

### `getReceiptUrl` (F1)

- Pour l'auteur : la note lui appartient.
- Côté manager ou RH : `iam.canDecide(actor, note.userId)`, sinon `404`.

Une note sans clé n'existe plus (F10). Le cas reste malgré tout traité en `404`.

## Flux asynchrone

**Pourquoi c'est conforme à la consigne :** la décision répond exactement comme aujourd'hui (même code, même corps). Seul l'ordre d'exécution change : l'e-mail part après la réponse, par le worker. Le contrat d'interface est donc intact. Le choix est aussi justifiable sur le fond : un SMTP lent ou en panne ne doit pas faire échouer une décision.

### Données

```sql
outbox(
  id uuid primary key,          -- = eventId
  type text not null,           -- 'expense.note-decided.v1'
  payload jsonb not null,
  correlation_id text not null,
  created_at timestamptz not null default now(),
  published_at timestamptz null
)
-- index partiel : (created_at) WHERE published_at IS NULL

processed_messages(
  message_id uuid not null,     -- = eventId
  consumer text not null,       -- 'send-decision-email'
  processed_at timestamptz not null default now(),
  primary key (message_id, consumer)
)
```

`expense_app` a le droit d'`INSERT` sur `outbox`. `expense_worker` a les droits `SELECT` et `UPDATE (published_at)` sur `outbox`, l'`INSERT` sur `processed_messages`, et le `SELECT (id, name, email)` sur `users`. RLS n'est pas activée sur ces deux tables internes.

### Contrat `expense.note-decided.v1`

```json
{
  "eventId": "uuid",
  "occurredAt": "ISO-8601",
  "noteId": "uuid",
  "ownerId": "uuid",
  "decision": "approved | rejected",
  "decidedBy": "uuid",
  "amount": 42.5,
  "expenseDate": "YYYY-MM-DD"
}
```

Le contrat ne porte pas d'e-mail : aucune donnée personnelle ne transite par la file. Il est décrit dans `docs/contracts/asyncapi.yaml` et `docs/contracts/schemas/expense.note-decided.v1.json`. Toute évolution incompatible passe en `v2`.

### Relay (worker)

Il tourne toutes les secondes :

1. `BEGIN`, puis `SELECT … WHERE published_at IS NULL ORDER BY created_at LIMIT 10 FOR UPDATE SKIP LOCKED` ;
2. `SendMessageBatch` vers `expense-events`, avec les attributs `type` et `correlationId` ;
3. `UPDATE published_at = now()`, puis `COMMIT`.

En cas d'erreur SQS, on fait un rollback et le tour suivant réessaie. La livraison est **at-least-once**.

### Broker

LocalStack passe à `SERVICES: s3,sqs` (compose et CI). `scripts/ensure-queues.mjs` crée deux files :

- `expense-events` : file standard, `VisibilityTimeout` de 30 s, configurable pour les tests ;
- `expense-events-dlq`, branchée par une redrive policy à `maxReceiveCount: 3`.

### Consumer (worker)

Il fait du long polling avec `WaitTimeSeconds: 10` et traite chaque message ainsi :

1. Il valide le message contre le JSON Schema. Un message invalide est journalisé et pas supprimé, il finit en DLQ.
2. Il appelle `expenses.sendDecisionEmail(event, correlationId)`, qui fait dans une transaction :
   - `INSERT INTO processed_messages … ON CONFLICT DO NOTHING` : si le message était déjà traité, on s'arrête, sans e-mail ;
   - `iam.contactOf(ownerId)` ;
   - `Mailer.send(...)` (texte en français) ;
   - le `COMMIT`.
3. Il fait `DeleteMessage`, qui vaut ack.

Si le Mailer échoue, la transaction est annulée, le message n'est pas supprimé, redevient visible, puis part en DLQ au troisième échec. Il reste une fenêtre de doublon si l'e-mail est parti mais que le `COMMIT` a échoué. Ce cas est accepté et documenté.

### Process et exploitation

- `npm run worker` lance `tsx src/worker/main.ts`. Le worker se connecte avec `WORKER_DATABASE_URL` (rôle `expense_worker`) et s'arrête proprement sur `SIGTERM` : il termine le message en cours et arrête le polling.
- `SmtpMailer` utilise nodemailer. On ajoute le service `mailpit` au compose : SMTP sur 1025, API et interface sur 8025.
- **Traçabilité :** le `correlationId` est lu depuis l'en-tête `x-correlation-id`, ou généré s'il est absent. Il suit ce chemin : logs de la route, `outbox.correlation_id`, attribut SQS, logs JSON du worker.
- Variables ajoutées à `.env.example` : `AUTH_SECRET`, `WORKER_DATABASE_URL`, `SQS_ENDPOINT`, `SQS_QUEUE_URL`, `SMTP_HOST`, `SMTP_PORT`, `MAIL_FROM`.

## Socle commun

### Isolation (F2, F44)

- Une migration crée le rôle `expense_app`, qui n'est ni superutilisateur, ni `BYPASSRLS`, ni propriétaire des tables. `DATABASE_URL` l'utilise. Les migrations et le seed gardent le rôle propriétaire (`MIGRATION_DATABASE_URL`).
- Les policies RH filtrent sur `hr.company_id = owner.company_id`.
- Les policies de lecture et de décision côté validateur reprennent la règle d'`ApprovalPolicy` : manager direct, sinon les RH de l'entreprise sauf l'auteur. La file RH élargie (F14, F33) est donc visible sous RLS.
- RLS est activée sur `users` et `companies`. Chacun lit les membres de son entreprise. L'inscription et l'authentification passent par des fonctions `SECURITY DEFINER` à la surface minimale.
- La mise à jour de `receipt_key` passe dans le scope RLS, puisqu'elle a lieu dans la même unité de travail.
- On ajoute des index sur `expense_notes.user_id`, `users.manager_id` et `users.company_id`.
- Un test d'intégration vérifie, sur un organigramme généré, que la visibilité RLS des notes `pending` côté validateur est égale à `approveesOf` (cohérence D4).

### Entrées et secrets (F3, F25)

- `?sort=` passe par une liste blanche : `created_at`, `expense_date` ou `amount`, combiné avec `asc` ou `desc`, et `created_at desc` par défaut. Une valeur hors liste est ignorée, et on applique le tri par défaut.
- `AUTH_SECRET` est lu par `shared/config.ts`. Le démarrage échoue s'il manque. Il est ajouté à `.env.example`, au compose et à la CI.

### Erreurs (F26, F27, F42, F43)

- `shared/problem.ts` répond en `application/problem+json` avec `{ error, type, title, status, detail }`. Le champ `error` garde le texte actuel, donc le changement est additif.
- Chaque module définit ses erreurs typées dans `domain/errors.ts`. La traduction en HTTP se fait à un seul endroit (`shared/http.ts`) :

  | Erreur | Code HTTP |
  |---|---|
  | `NotFound` | 404 |
  | `Forbidden` | 403 |
  | `Unauthenticated` | 401 |
  | `Conflict` (`already-decided`, `invalid-manager`) | 409 |
  | `InvalidInput` | 400 |
  | `ReceiptUploadFailed` | 502 |
  | tout le reste | 500 |

- Une réponse 500 ne contient jamais de stack : la stack est seulement journalisée, avec le `correlationId`.
- Un id qui n'est pas un UUID, ou un corps illisible (JSON ou multipart), donne `400`.
- Les routes font `return await` sur les use cases (F43).

## Contrat d'API

- `docs/contracts/openapi.yaml` décrit **d'abord** l'API actuelle (contract first) : on l'écrit au début du plan socle, avant toute correction.
- En CI, `oasdiff breaking` compare le fichier de la branche avec celui de `main`.
- **Écarts volontaires**, chacun documenté dans l'OpenAPI et le CHANGELOG :

| Endpoint | Avant | Après |
|---|---|---|
| tous | 500 avec `stack` | 500 sans stack, avec un problem+json |
| endpoints manager | mauvais rôle → 401 | 403 |
| endpoints RH | sans session → 403 | 401 |
| id non UUID, corps illisible | 500 | 400 |
| `?sort=` | expression SQL libre | liste blanche, sinon tri par défaut |
| `POST …/approve` et `…/reject`, décisions concurrentes | les deux en 200 (course F9) | une en 200, l'autre en 409 `Already decided`, comme le cas séquentiel existant |
| `POST /api/expense-notes`, échec S3 | 500, note orpheline | 502, aucune note |
| `GET /api/hr/expense-notes` | managers racines seulement | plus complète (F14, F33), même format |
| `PUT /api/hr/users/{id}/manager` | manager d'une autre entreprise ou cycle → 200 | 409 `invalid-manager` |
| `…/receipt-url` côté manager | note de n'importe quelle entreprise | 404 hors équipe |

Ces écarts ajoutent des cas d'erreur et corrigent des failles sans modifier aucune réponse en succès d'un client légitime. On les traite donc comme une version **MINOR**.

## Tests

- **Unitaires (nouveaux)** :
  - `ExpenseNote` (transitions) ;
  - `ApprovalPolicy` (manager, employé non rattaché, manager racine, RH, RH seul) ;
  - détection de cycle ;
  - chaque use case avec des repositories, une outbox, un Mailer et un `iam` en mémoire.
- **Intégration (existants)** : ils restent en place et importent les mêmes `route.ts`. Les `[as-is]` du périmètre basculent vers le comportement corrigé et perdent leur étiquette :
  - 401/403 ;
  - stack ;
  - `?sort=` ;
  - note orpheline ;
  - UUID → 400 ;
  - corps illisible → 400 ;
  - utilisateur supprimé → 401.
- **Intégration (nouveaux)** :
  - concurrence F9 : approve et reject en parallèle donnent un 200 et un 409 ;
  - F5 et F30 : manager d'une autre entreprise, cycle direct et cycle long ;
  - F14 et F33 : file RH élargie, un RH ne voit jamais sa propre note, et un RH seul soumet bien (201), sa note restant dans aucune file ;
  - consigne « manager direct » : un manager ne voit ni ne décide les notes des subordonnés de ses subordonnés ;
  - F11 : échec en milieu d'inscription, aucune entreprise orpheline ;
  - F31 : rôle modifié en base, effet immédiat ;
  - cohérence RLS / `approveesOf` ;
  - rôle `expense_app` non superutilisateur : la RLS est réellement appliquée ;
  - outbox : une décision refusée n'écrit aucune ligne, une décision acceptée en écrit exactement une ;
  - relay : lignes publiées, puis `published_at` renseigné ;
  - idempotence : le même message livré deux fois produit un seul e-mail (API Mailpit) ;
  - DLQ : un Mailer en panne envoie le message en DLQ au troisième essai (visibility timeout court).
- **E2E** : la suite ARLA-9 reste à 100 % verte. Un nouvel E2E vérifie qu'un manager approuve et que l'employé reçoit l'e-mail dans Mailpit. Playwright démarre le web et le worker.
- **CI** :
  - LocalStack passe à `s3,sqs` ;
  - on ajoute le service Mailpit ;
  - on ajoute les jobs `dependency-cruiser`, grep « SQL cross-module » et `oasdiff` ;
  - on ajoute un job SonarQube : un conteneur de service `sonarqube:community`, puis `npm run sonar` avec la couverture lcov de Vitest. Il produit un rapport en artefact et n'est pas bloquant ;
  - les seuils de couverture sont recalés au niveau mesuré après la refacto, sans baisse sur le périmètre existant.

## Interface utilisateur

Ce sont des ajustements ciblés. La consigne laisse l'UI libre, mais aucune refonte n'est prévue.

- Les pages affichent le `detail` des nouvelles réponses d'erreur (`409 Already decided` en cas de décision concurrente, `409 invalid-manager`, `400`), au lieu d'un message générique.
- La console RH (`AdminConsole`) signale les employés non rattachés, c'est-à-dire ceux dont `managerId` est `null`, avec le rôle `employee`, à partir de `GET /api/hr/users`. Ils sont mis en avant pour inviter à les rattacher.
- La file RH affiche les notes des employés non rattachés et des autres RH, au même format que celles des managers racines.
- Les E2E Playwright existants restent verts. Un E2E couvre le signalement RH.

## SonarQube

- Le service `sonarqube` (image `sonarqube:community`) est déclaré dans le profil `quality` du docker-compose et lancé par `docker compose --profile quality up -d sonarqube`.
- `sonar-project.properties` déclare les sources `src`, les tests `tests`, la couverture `coverage/lcov.info` et les exclusions (`tessdata`, `migrations`, fichiers générés).
- `npm run sonar` lance `@sonar/scan` avec le jeton lu dans `SONAR_TOKEN`.
- Le run **avant** se fait sur le commit de base de la refacto, et le run **après** à la fin du plan 3. On garde les captures du tableau de bord et les métriques (bugs, vulnérabilités, hotspots, code smells, duplication, complexité cognitive, couverture) pour l'audit chiffré.

## Documentation et garde-fous pour les agents

- `docs/architecture/conventions.md` donne la recette d'une fonctionnalité :
  1. la règle dans `domain` ;
  2. le use case dans `application` (un fichier) ;
  3. un port si besoin et son adapter ;
  4. l'export dans `index.ts` ;
  5. la route ;
  6. les tests unitaires et d'intégration.
  
  Il donne aussi les règles de dépendance, la traduction des erreurs et l'emplacement des futurs modules (`billing`).
- Un `CLAUDE.md` à la racine renvoie à `conventions.md` et aux commandes de vérification (`lint`, `typecheck`, `test`, `depcruise`, `e2e`).
- On écrit l'ADR-001 (option C, alternatives A, B et D, conséquences, limite du RH seul) et on met à jour le README (worker, Mailpit, SonarQube, variables d'environnement).

## Découpage en plans

| Plan | Contenu | Prérequis | Livrable seul ? |
|---|---|---|---|
| **1. Socle** | SonarQube (compose, `sonar-project.properties`, job CI) et mesures « avant » (SonarQube, `dependency-cruiser` en mode rapport) ; `openapi.yaml` de l'API actuelle et `oasdiff` en CI ; `shared/config`, `shared/problem`, `shared/logger` ; rôle `expense_app` et RLS complète ; `?sort=` ; secret ; 401/403 ; 400 ; F1 | — | oui |
| **2. B** | `shared/unit-of-work` et `shared/http` ; module `iam` (`ApprovalPolicy`, `getActor`, `signUp`, `assignManager`) puis module `expenses`, en migrant les routes une par une avec la suite verte à chaque commit ; suppression du code mort ; `dependency-cruiser` bloquant ; ajustements d'UI (erreurs, signalement RH) ; `conventions.md`, `CLAUDE.md`, ADR-001 | plan 1 | oui |
| **3. Async** | migrations `outbox` et `processed_messages`, rôle `expense_worker` ; SQS et Mailpit (compose, CI, `ensure-queues`) ; `EventOutbox` dans `decideExpenseNote` ; worker (relay, consumer) ; contrat AsyncAPI ; tests idempotence, DLQ et E2E Mailpit ; mesures « après » (SonarQube, `dependency-cruiser`) | plan 2 | oui |

## Risques

| Risque | Parade |
|---|---|
| Passer au rôle non superutilisateur révèle des requêtes qui dépendaient du contournement de la RLS | faire ce passage en premier dans le plan 1, la suite ARLA-9 faisant office de détecteur ; ajouter des policies ciblées, jamais `BYPASSRLS` |
| Les tests d'intégration mockent `@/lib/auth` | `lib/auth.ts` reste le point d'entrée ; seul son contenu délègue à `iam` |
| Next.js et `tsx` résolvent différemment l'alias `@/` | le worker utilise `tsx` avec `tsconfig` paths, ce qu'un test de démarrage du worker en CI vérifie |
| E2E instables à cause de l'asynchrone | l'E2E Mailpit attend l'e-mail par polling de l'API Mailpit, avec un timeout explicite |
| Doublon d'e-mail dans la fenêtre « envoyé mais pas commité » | accepté et documenté ; l'idempotence couvre le rejeu SQS, qui est le cas courant |
