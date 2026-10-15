# Expense.io — Audit QA & Sécurité (étendu)

_Date : 2026-10-09 (complété le 2026-10-12 : F30–F38, puis F39–F46 d'après la suite de tests ARLA-9) · Portée : séparation inter-entreprises, appartenance & rôle,
performance métier, perte/corruption de données, qualité de code, limites de
ressources, synchrone vs asynchrone, et catégories connexes._

**Méthode.** Application lancée en local (`make dev` : Next.js 16.3.5 + Postgres
16 + LocalStack), parcourue dans un vrai navigateur pour chaque rôle, avec
rejeu des cas de contrôle d'accès via l'API en utilisant le cookie de session
réel de chaque rôle. Les comptes `manager`/`hr_admin` (non attribuables depuis
l'UI) ont été créés directement en base. « Confirmé » = reproduit sur
l'application en marche ; « Code » = établi par lecture du code ; « Test » =
reproduit par un test automatisé de la suite de caractérisation ARLA-9 (Vitest
sur Postgres et LocalStack réels avec session simulée, ou Playwright sur
l'application lancée), dont le fichier est cité.

Ce document complète le premier rapport (les 16 constats fonctionnels/sécurité
de base) en élargissant à de nouvelles catégories. Les constats déjà couverts
sont rappelés en synthèse mais détaillés surtout quand il y a du neuf.

Les constats F30–F38 ont été ajoutés après une relecture complète du code
(routes API, authentification, migration, composants) ; ils sont tous au
statut « Code » et restent à reproduire sur l'application en marche.

Les constats F39–F46 ont été ajoutés le 2026-10-12 à partir de la suite de
tests de caractérisation ARLA-9 (branche
`louisbert91/arla-9-tests-de-caracterisation`) : ses tests étiquetés `[as-is]`
figent des défauts que les constats précédents ne relevaient pas. Ils sont au
statut « Test », sauf F44 (« Code »).

---

## Synthèse

| # | Catégorie | Constat | Gravité | Statut |
|---|---|---|---|---|
| F1 | Isolation | Un manager lit les reçus de **n'importe quelle** entreprise | Critique | Confirmé |
| F2 | Isolation | Row Level Security de fait désactivée (connexion superuser) | Critique | Confirmé |
| F3 | Isolation | Injection SQL via le paramètre `sort` | Critique | Confirmé |
| F4 | Appartenance/Rôle | 1er inscrit d'un domaine = RH, sans vérification d'email | Élevé | Confirmé |
| F5 | Appartenance/Rôle | La RH assigne un manager d'une autre entreprise | Élevé | Confirmé |
| F6 | Appartenance/Rôle | Identité d'entreprise fragile (1 domaine = 1 société) | Moyen | Code |
| F7 | Appartenance/Rôle | Email sensible à la casse (connexion + inscription + unicité) | Moyen | Confirmé |
| F8 | Appartenance/Rôle | Un employé ne peut jamais devenir manager via l'app | Faible | Code |
| F9 | Corruption de données | Décision concurrente : approve + reject tous deux en 200 | Élevé | Confirmé |
| F10 | Corruption de données | Création de note non atomique (note sans reçu possible) | Moyen | Code |
| F11 | Corruption de données | Inscription non transactionnelle → entreprise orpheline | Moyen | Code |
| F12 | Corruption de données | TOCTOU sur l'email à l'inscription → 500 non gérée | Faible | Code |
| F13 | Corruption de données | Montant > 10^8 → crash 500 (dépassement `numeric(10,2)`) | Moyen | Confirmé |
| F14 | Flux métier | Notes de frais d'un RH : aucun validateur possible | Moyen | Confirmé |
| F15 | Flux métier | Notifications de décision jamais envoyées (code mort) | Moyen | Confirmé |
| F16 | Performance | Aucun index sur les colonnes de filtre/jointure (seq scans) | Élevé | Confirmé |
| F17 | Performance | OCR synchrone dans la requête, worker recréé à chaque appel | Élevé | Confirmé |
| F18 | Ressources | Aucune pagination/limite sur les listes (réponses non bornées) | Moyen | Confirmé |
| F19 | Ressources | OCR sans limite de taille de fichier (déni de service) | Élevé | Code |
| F20 | Ressources | Aucune limitation de débit (login, signup, OCR) | Moyen | Code |
| F21 | Sync/Async | OCR et hachage en ligne de requête, pas de file de traitement | Moyen | Code |
| F22 | Qualité/Archi | Architecture hexagonale morte (domain/ports/adapters inutilisés) | Moyen | Confirmé |
| F23 | Qualité | `toExpenseNote` dupliqué dans 5 fichiers | Faible | Confirmé |
| F24 | Qualité | Utilitaires morts (`utils/validators.ts`, `utils/format.ts`) | Faible | Confirmé |
| F25 | Qualité/Sécurité | Secret d'authentification en dur dans le code | Critique | Code |
| F26 | Qualité/Sécurité | Fuite de stack trace (chemins serveur) dans les 500 | Élevé | Confirmé |
| F27 | Qualité/API | Codes HTTP d'autorisation incohérents (401 vs 403) | Faible | Confirmé |
| F28 | Métier | Décisions irréversibles, aucune piste d'audit | Faible | Code |
| F29 | Affichage | Dates décalées d'un jour, UUID au lieu du nom, total trompeur, rôles en anglais | Faible | Confirmé |
| F30 | Appartenance/Rôle | Cycle possible dans l'organigramme → validation croisée entre managers | Élevé | Code |
| F31 | Appartenance/Rôle | Rôle figé dans le JWT, aucune révocation de session | Moyen | Code |
| F32 | Corruption de données | `expenseDate` non validée (500 + stack, dates futures), description non bornée | Moyen | Code |
| F33 | Flux métier | Notes d'un employé sans manager : aucun validateur (cas par défaut au signup) | Moyen | Code |
| F34 | Ressources | Corps de requête lu en entier avant le contrôle de taille (limite de 10 Mo illusoire) | Moyen | Code |
| F35 | Qualité | Aucun test automatisé ni CI | Moyen | Code |
| F36 | Sécurité | Énumération des comptes (message de signup, timing du login) | Faible | Code |
| F37 | Sécurité | Type du reçu déclaré par le client, contenu jamais vérifié | Faible | Code |
| F38 | Métier | Fonctions manquantes : modifier/annuler une note, motif de rejet, mot de passe oublié | Faible | Code |
| F39 | Isolation | Note orpheline : l'URL du reçu liste les reçus de toutes les entreprises | Moyen | Test |
| F40 | Corruption de données | Saisie API corrompue sans erreur (`12,50` → 12, `0.001` → 0, `08/10/2026` → 10 août) | Moyen | Test |
| F41 | Corruption de données | Corps de requête illisible → employé détaché de son manager (200) | Moyen | Test |
| F42 | Qualité/API | Entrée malformée (id non UUID, mauvais corps) → 500 avec stack au lieu de 400 | Faible | Test |
| F43 | Qualité | `return withUserScope(...)` sans `await` : erreurs hors `try/catch` dans 7 routes | Faible | Test |
| F44 | Isolation | RLS incomplète : policies RH sans filtre d'entreprise, `users`/`companies` sans RLS | Moyen | Code |
| F45 | Métier | Reçu vide (0 octet) accepté | Faible | Test |
| F46 | Appartenance/Rôle | Pages `/manager` et `/hr` servies à tout connecté, avec un simple message de refus | Faible | Test |

Gravité : **Critique** = compromission ou corruption directe · **Élevé** = fuite
inter-entreprises, DoS réaliste ou perte de donnée · **Moyen** = impact métier
net · **Faible** = correction souhaitable.

---

## 1 · Séparation entre utilisateurs et entreprises

**F1 — Critique — un manager lit les reçus d'une autre entreprise. (Confirmé)**
`GET /api/manager/expense-notes/[id]/receipt-url` cherche la note par son seul
id, sans vérifier le rattachement (`route.ts:17`). Reproduit : connecté comme
Manager A (entreprise A), un appel sur l'id d'une note de l'entreprise B renvoie
**200 + URL S3 signée**, et le téléchargement rend l'image (68 octets, PNG).
Les routes `approve`/`reject` et la route RH équivalente, elles, joignent sur la
hiérarchie et refusent (404). Aggravants : l'URL signée est valable 5 min **sans
cookie** (lien partageable), et les reçus sont numérotés séquentiellement
(`receipts/1.png`, `2.png`…), donc seuls les identifiants protègent tous les
reçus. _Correctif : scoper la note aux employés de l'appelant, comme
`approve`/`reject`._

**F2 — Critique — RLS de fait désactivée. (Confirmé)** La migration définit des
policies Row Level Security sur `expense_notes`, mais l'application se connecte
comme le rôle `expense`, qui est **superuser** et contourne la RLS
(`rolbypassrls = true`, vérifié en base). Aucune policy ne s'applique : la seule
barrière est la clause `WHERE`/`JOIN` de chaque route — donc une route qui
oublie le filtre (cf. F1) fuit. La 2ᵉ étape de création de note
(`expense-notes/route.ts:103`) tourne hors contexte utilisateur et ne marche que
grâce à ce contournement ; elle cassera dès que la RLS sera réellement active.
_Correctif : se connecter avec un rôle non-superuser, `NOLOGIN`-bypass, pour que
les policies deviennent la vraie défense en profondeur._

**F3 — Critique — injection SQL via `sort`. (Confirmé)**
`GET /api/expense-notes?sort=…` concatène la valeur brute dans `ORDER BY`
(`route.ts:42-46`). `sort=not_a_real_column` renvoie une 500 et le journal montre
`column "not_a_real_column" does not exist` : l'entrée atteint le SQL.
_Correctif : liste blanche (colonne ∈ ensemble fixe + sens `ASC|DESC`)._

> La **décision** (approuver/rejeter) respecte bien, elle, la hiérarchie et
> l'entreprise : testé avec un sous-manager, seul le manager parent voit et
> tranche sa note ; la RH ne voit que les managers racines de sa société ; tout
> appel hors périmètre renvoie 404. Le problème d'isolation porte sur la
> **lecture des reçus** (F1) et sur l'intégrité du rattachement (F5), pas sur
> l'écriture des décisions.

**F39 — Moyen — note orpheline : l'URL du reçu liste tout le bucket. (Test)**
Une note dont l'upload a échoué garde `receipt_key = ''` (F10).
`getReceiptUrl('')` (`lib/storage.ts:35-37`) présigne alors un `GET` sur la
**racine du bucket** (`/receipts/`), que S3 traite comme un listage : la
réponse est un `ListBucketResult` avec les clés, tailles et dates des reçus de
**toutes les entreprises** (`expense-note-receipt-url.test.ts:80`, reproduit
sur LocalStack). Le propriétaire de la note y accède directement, et tout
manager y accède via F1 s'il connaît l'id de la note. La signature verrouille
le chemin : le contenu des reçus n'est pas exposé, seulement leurs
métadonnées (volume et rythme d'activité des autres sociétés, dans la limite
de 1 000 clés sur AWS). Sur AWS, le listage suppose aussi que les identifiants
applicatifs aient `s3:ListBucket`. _Correctif : refuser de présigner une clé
vide (reçu indisponible), et supprimer la cause, la note orpheline (F10)._

**F44 — Moyen — RLS incomplète, même une fois F2 corrigé. (Code)** Les
policies `expense_notes_hr_root_manager_select` et `…_update`
(`migrations/1700000000001_init-schema.sql:70-100`) vérifient que l'appelant
est `hr_admin` et que l'auteur est un manager racine, mais **pas** qu'ils
appartiennent à la même entreprise. Aujourd'hui c'est sans effet : la RLS est
contournée (F2) et la route RH filtre `company_id` en SQL. Mais corriger F2
seul ne suffit pas : au niveau de la base, toute RH lirait et modifierait les
notes des managers racines de **toutes** les entreprises. Par ailleurs, la RLS
ne couvre que `expense_notes` : `users` et `companies` n'ont aucune policy, et
il manque la policy `UPDATE` propriétaire dont dépend la création de note
(cf. F2). _Correctif : ajouter `hr.company_id = u.company_id` aux deux
policies RH, envisager une RLS par `company_id` sur `users` (en tenant compte
de la connexion et de l'inscription, qui lisent `users` hors contexte
utilisateur), et tester les policies avec un rôle non superuser._

---

## 2 · Appartenance à une entreprise & attribution du rôle

Le modèle actuel : à l'inscription, le domaine de l'email **est** l'entreprise,
et le rôle découle de « ai-je créé la ligne entreprise ? ».

**F4 — Élevé — le premier inscrit d'un domaine devient RH, sans preuve.
(Confirmé)** `app/actions/auth.ts:41-63` : un `INSERT … ON CONFLICT DO NOTHING`
sur `companies(email_domain)` ; si une ligne est créée, l'utilisateur est
`hr_admin`, sinon `employee`. Aucune vérification que l'email est réellement
contrôlé. Conséquences : (a) sur un domaine public (`gmail.com`), le premier
inscrit devient RH de **tous** les futurs comptes Gmail et peut voir/valider
leurs notes de managers racines, lire des reçus, remanier l'organigramme ; (b)
n'importe qui peut « fonder » l'entreprise d'un domaine d'autrui s'il s'inscrit
avant elle. _Correctif : rattachement par invitation ou domaine vérifié (MX /
email de confirmation), rôle fondateur accordé explicitement, pas par course._

**F5 — Élevé — la RH assigne un manager d'une autre entreprise. (Confirmé)**
`PUT /api/hr/users/[id]/manager` valide que le manager a le rôle `manager` mais
**pas** qu'il est dans la même société (`route.ts:39-41` ; le commentaire le
suppose à tort). Testé : la RH de A a rattaché son employé au manager de B
(**200**) — dès lors ce manager externe validerait « légalement » les notes de
cet employé, et F1 lui donne déjà les reçus. _Correctif : exiger
`company_id = company de l'appelant` sur le manager cible._

**F6 — Moyen — identité d'entreprise fragile. (Code)** Une entreprise = un
`email_domain` unique global. Donc : une société à plusieurs domaines
(`acme.com`, `acme.fr`) devient plusieurs entreprises cloisonnées ; deux
sociétés partageant un label (`acme.com` vs `acme.io`) reçoivent le même `name`
(`domain.split('.')[0]`). Pas de table d'appartenance explicite, pas de fusion
possible. _Correctif : entité entreprise indépendante du domaine, avec N domaines
et invitations._

**F7 — Moyen — email sensible à la casse. (Confirmé)** `Demo@Expense.io` échoue
à la connexion ; `FOUNDER@domaine` crée un doublon de `founder@domaine`. Causes :
`lib/auth.ts:33`, `actions/auth.ts:36`, et la contrainte `UNIQUE(email)`
(sensible à la casse). _Correctif : normaliser en minuscules + unicité
insensible à la casse (`citext` ou index `lower(email)`)._

**F8 — Faible — pas de promotion vers `manager`. (Code)** Le rôle `manager`
n'est posable ni au signup ni depuis la console RH (seul `manager_id` est
modifiable, et l'annuaire ne liste que `employee`/`manager`). Un employé ne peut
donc **jamais** devenir manager par l'application — uniquement via le seed ou la
base. Limitation métier à acter ou corriger.

**F30 — Élevé — cycle possible dans l'organigramme. (Code)**
`PUT /api/hr/users/[id]/manager` n'interdit que l'auto-rattachement
(`managerId === id`, `route.ts:32`) ; aucune détection de cycle. La RH peut
rattacher M1 à M2 puis M2 à M1 (ou former une boucle plus longue) : chacun
valide alors les notes de l'autre (approbation croisée, contournement de la
séparation des pouvoirs), et comme aucun des deux n'a plus `manager_id IS
NULL`, leurs notes **sortent de la vue RH**. Même effet en rattachant un
manager racine à l'un de ses propres subordonnés. _Correctif : refuser
l'assignation si le manager cible est un descendant de l'utilisateur (requête
récursive `WITH RECURSIVE` sur `manager_id`), idéalement dans la même
transaction que l'`UPDATE`._

**F31 — Moyen — rôle figé dans le JWT, aucune révocation. (Code)** Le rôle est
copié dans le jeton à la connexion (`lib/auth.ts:45-58`) et n'est jamais relu
en base ; toutes les routes autorisent sur `session.user.role`. Un utilisateur
promu, rétrogradé ou supprimé en base conserve son ancien rôle jusqu'à
expiration du jeton (30 jours par défaut avec Auth.js) — et comme la promotion
ne se fait qu'en base (F8), elle exige une reconnexion. Aucun moyen non plus
d'invalider une session (compte compromis, départ d'un salarié). _Correctif :
relire rôle/existence en base dans le callback `jwt` (ou à chaque requête
sensible), durée de session courte, et mécanisme de révocation (version de
session en base)._

---

## 3 · Perte & corruption de données

**F9 — Élevé — décision concurrente incohérente. (Confirmé)** L'`UPDATE` de
décision est `SET status = … WHERE id = $1`, **sans** garde `AND status =
'pending'` ni verrou de ligne ; le contrôle « déjà tranchée ? » est fait en
amont en JS, dans une transaction `READ COMMITTED` sans `FOR UPDATE`
(`approve/route.ts:28`, idem reject/HR). Testé : approve + reject tirés
simultanément sur une même note renvoient **tous deux 200** (`approved` et
`rejected`), l'état final est arbitraire et une décision est silencieusement
perdue, les deux clients recevant des réponses contradictoires. _Correctif :
`UPDATE … WHERE id = $1 AND status = 'pending'` + vérifier `rowCount` (ou
`SELECT … FOR UPDATE`)._

**F10 — Moyen — création de note non atomique. (Code)** `POST /api/expense-notes`
insère la note, puis uploade le reçu, puis met à jour la note
(`route.ts:88-106`). Si l'upload échoue, une note sans reçu (`receipt_key = ''`)
subsiste. _Correctif : uploader d'abord, ou compenser (supprimer la note) en cas
d'échec._

**F11 — Moyen — inscription non transactionnelle. (Code)** `signup` enchaîne
plusieurs `getPool().query` indépendants (existence, création d'entreprise,
création d'utilisateur) hors transaction. Si la création d'utilisateur échoue
après celle de l'entreprise, une **entreprise orpheline** reste en base.
_Correctif : une seule transaction couvrant entreprise + utilisateur._

**F12 — Faible — TOCTOU sur l'email. (Code)** L'existence de l'email est
vérifiée par une requête séparée de l'`INSERT` final. Deux inscriptions
concurrentes du même email passent la vérification puis l'une viole
`UNIQUE(email)` : l'exception n'est pas attrapée → 500 avec stack (cf. F26).
_Correctif : s'appuyer sur la contrainte (`ON CONFLICT`) et traiter le conflit._

**F13 — Moyen — gros montant → crash 500. (Confirmé)** `123456789` renvoie 500
au lieu d'une validation : la colonne est `numeric(10,2)` (plafond
99 999 999,99) et l'erreur Postgres brute remonte au client. _Correctif : borner
le montant côté serveur avant insertion._

**F32 — Moyen — date et description non validées. (Code)** La création de note
vérifie seulement que `expenseDate` est une chaîne (`expense-notes/route.ts:74`).
Une valeur non parsable (`"abc"`) part telle quelle vers Postgres → 500 avec
stack (même mécanisme que F13, cf. F26). Une date future ou absurde
(`9999-12-31`, `1900-01-01`) est acceptée et enregistrée — des notes de test
« QA future date » en témoignent. La description n'a pas de longueur maximale
(`text`, aucun contrôle) : quelques Mo de texte passent et sont renvoyés dans
chaque liste (cf. F18). _Correctif : valider le format `YYYY-MM-DD`, borner la
date (pas dans le futur, ancienneté maximale selon la politique de frais) et la
longueur de la description, avant l'insertion._

**F40 — Moyen — saisie corrompue sans erreur via l'API. (Test)** Le montant
est lu par `Number.parseFloat` (`expense-notes/route.ts:69`), qui s'arrête au
premier caractère invalide : `12,50` est enregistré **12,00**, et `12abc`
**12,00**. `0.001` passe le contrôle `amount > 0`, puis Postgres l'arrondit à
**0,00** : une note à montant nul est créée. La date, non validée (F32), est
interprétée selon le `DateStyle` de Postgres (`ISO, MDY`) : `08/10/2026`
(8 octobre) est enregistré **2026-08-10** (10 août). Dans tous ces cas, la
réponse est 201, sans erreur, et la donnée en base est fausse
(`expense-notes.test.ts:314-317` et `:342`). L'UI n'est pas touchée
(`type="number"` et `type="date"` envoient des formats normalisés) : seuls les
appels directs à l'API le sont, mais c'est justement le contrat public.
_Correctif : parser strictement (`^\d+(\.\d{1,2})?$`, virgule refusée ou
convertie explicitement), exiger un montant d'au moins 0,01 après arrondi, et
n'accepter que `YYYY-MM-DD` (cf. F32)._

**F41 — Moyen — une requête malformée détache l'employé de son manager.
(Test)** `PUT /api/hr/users/[id]/manager` remplace tout corps illisible par
`null` (`.catch(() => null)` puis `?? null`, `route.ts:12-13`). Un corps non
JSON, un corps vide, un objet sans `managerId` ou un formulaire multipart sont
donc lus comme « aucun manager » : réponse **200**, et le rattachement est
effacé (`hr-user-manager.test.ts:132-144`). Un client bogué ou une erreur
d'intégration supprime la hiérarchie en silence ; l'employé redevient racine
et ses notes ne sont plus visibles de personne (F33). _Correctif : exiger un
corps JSON valide contenant explicitement la clé `managerId` (`null` pour
détacher), sinon 400._

---

## 4 · Flux métier bloquants

**F14 — Moyen — les notes d'un RH n'ont aucun validateur. (Confirmé)** Un RH peut
soumettre une note (**201, `pending`**), mais elle n'apparaît dans aucune liste :
la liste RH ne cible que les managers racines (le RH a le rôle `hr_admin`), et
aucun manager ne la voit (le RH n'a pas de `manager_id` et n'est pas dans
l'organigramme). La note reste **bloquée indéfiniment**. _Correctif : définir qui
valide les notes d'un RH (autre RH, règle dédiée), ou interdire la soumission par
un RH._

**F15 — Moyen — notifications de décision jamais envoyées. (Confirmé)**
`NotificationPort`/`ConsoleNotificationAdapter.notifyDecision` existent mais ne
sont **importés nulle part** (grep : zéro usage hors de leur dossier). À
l'approbation/au rejet, l'employé n'est jamais averti. C'est à la fois du code
mort (cf. F22) et une fonctionnalité métier manquante. _Correctif : brancher la
notification dans les routes de décision, idéalement en asynchrone (cf. F21)._

**F33 — Moyen — notes d'un employé sans manager : aucun validateur. (Code)**
Généralisation de F14, et c'est le **cas par défaut** : tout employé inscrit
par le signup est créé avec `manager_id = NULL` (`actions/auth.ts:66`). Ses
notes ne sont visibles d'aucun manager (`WHERE u.manager_id = $1`), et la liste
RH ne retient que les auteurs de rôle `manager` racine
(`hr/expense-notes/route.ts:29`). Tant que la RH ne l'a pas rattaché, chaque
note soumise reste `pending` sans que personne ne la voie, et rien ne signale
la situation à l'employé ni à la RH. Même effet si la RH remet un employé à
« aucun (racine) ». _Correctif : faire remonter à la RH toute note dont
l'auteur n'a pas de validateur (employé racine compris), et signaler dans la
console RH les employés non rattachés._

---

## 5 · Performance gênante pour le métier

**F16 — Élevé — aucun index sur les colonnes de filtre/jointure. (Confirmé)** La
base ne contient que les PK et les contraintes uniques (`\di` : 6 index, tous
PK/unique). Les requêtes récurrentes balayent toute la table :
`expense_notes WHERE user_id = $1`, `JOIN users ON … WHERE u.manager_id = $1`,
`users WHERE company_id = …`. À quelques milliers de notes, les listes employé et
manager deviennent lentes. _Correctif : index sur `expense_notes(user_id)`,
`expense_notes(status)` (ou composite `(user_id, created_at)`),
`users(manager_id)`, `users(company_id)`._

**F17 — Élevé — OCR synchrone et worker jeté à chaque appel. (Confirmé)**
`suggestFields` crée un worker Tesseract **à chaque requête** avec
`cacheMethod: 'none'` (`lib/ocr.ts:118`), recharge les données de langue depuis
le disque, reconnaît, puis `terminate()`. Le bouton « Pré-remplir depuis le
reçu » fait donc attendre l'utilisateur plusieurs secondes et consomme beaucoup
de CPU/mémoire sans réutilisation ni plafond de concurrence. _Correctif : worker
réutilisé (pool, cache de langue activé), et traitement hors de la requête
(cf. F21)._

---

## 6 · Absence de limites sur les ressources

**F18 — Moyen — listes non paginées. (Confirmé)** Aucun `LIMIT`/`OFFSET` dans les
routes de liste (employé, manager, RH, annuaire). Un gros volume renvoie tout
d'un coup — mémoire serveur, bande passante et rendu client non bornés.
_Correctif : pagination (limite + curseur)._

**F19 — Élevé — OCR sans limite de taille. (Code)** Contrairement à la création
de note (10 Mo), `POST /api/expense-notes/receipt-suggestion` n'impose aucune
limite (`lib/ocr.ts:106`, assumé en commentaire). Un gros fichier monopolise le
traitement OCR longtemps : déni de service à bas coût. _Correctif : plafonner la
taille, comme à la création._

**F20 — Moyen — aucune limitation de débit. (Code)** Ni sur `login` (force brute
de mots de passe), ni sur `signup` (création massive de comptes/entreprises), ni
sur l'OCR (amplification du F19). _Correctif : rate-limiting par IP/compte._

**F34 — Moyen — corps lu en entier avant le contrôle de taille. (Code)** À la
création de note, `request.formData()` (`expense-notes/route.ts:63`) charge
**tout** le corps en mémoire, et le plafond de 10 Mo n'est vérifié qu'après
(`route.ts:84`) : il protège le stockage S3, pas le serveur. Le proxy exclut
`/api` de son matcher (`proxy.ts:17`) et aucune limite de corps n'est
configurée en amont, donc un envoi de plusieurs centaines de Mo est
intégralement bufferisé avant d'être refusé. Même schéma sur l'OCR
(`receipt-suggestion/route.ts:12,18`), où il s'ajoute à F19. _Correctif :
rejeter d'après `Content-Length` avant de lire le corps, et imposer une limite
de taille au niveau du reverse proxy / de la plateforme._

---

## 7 · Appels synchrones vs asynchrones

**F21 — Moyen — travail lourd en ligne de requête. (Code)** L'OCR (F17) et le
hachage de mot de passe tournent dans le cycle requête/réponse, sans file de
traitement : l'utilisateur attend et des connexions/CPU sont immobilisés. Le
hachage utilise `bcryptjs` (JS pur, ~3× plus lent qu'un binding natif) ; sous
charge de connexions/inscriptions, le coût s'accumule. Plus globalement, aucune
opération différable (OCR, notification F15, éventuels emails) n'est sortie en
tâche de fond. _Correctif : OCR et notifications en job asynchrone (file), envoi
d'une réponse immédiate puis mise à jour ; envisager un binding bcrypt natif ou
`argon2`._

---

## 8 · Qualité du code & architecture

**F22 — Moyen — architecture hexagonale morte. (Confirmé)** `src/domain`
(`ExpenseNote`, `User`), `src/ports` (`NotificationPort`, `ReceiptStoragePort`)
et `src/adapters` (`S3ReceiptAdapter`, `ConsoleNotificationAdapter`) ne sont
importés par **aucune** route (seuls les adapters importent leurs ports). Toute
la logique est réécrite en SQL inline dans les routes : les invariants du domaine
(`canBeDecided`, `canManage`, `isRootManager`) existent en double et peuvent
diverger, et des fonctionnalités censées passer par les ports ne sont jamais
appelées (F15). _Correctif : soit faire transiter les routes par le domaine et
les ports, soit supprimer cette couche décorative._

**F23 — Faible — `toExpenseNote` dupliqué. (Confirmé)** La même fonction de
mapping ligne→DTO est copiée dans 5 fichiers (routes employé, manager, HR, +
variantes inline dans approve/reject). _Correctif : une seule fonction
partagée._

**F24 — Faible — utilitaires morts. (Confirmé)** `utils/validators.ts`
(`isValidEmail`, `isPositiveAmount`, `isNonEmptyString`) et `utils/format.ts`
(`formatCurrency`, `formatDate`, `truncate`) ne sont utilisés nulle part ; les
composants redéfinissent leurs propres formateurs `Intl`. _Correctif : utiliser
ou supprimer ; centraliser le formatage._

**F25 — Critique — secret d'authentification en dur. (Code)** `lib/auth.ts:8`
fixe `AUTH_SECRET` dans le source versionné. Quiconque a le dépôt peut forger des
sessions. _Correctif : variable d'environnement hors dépôt._ (NB : `.env` est
bien ignoré par git ; c'est le secret **dans le code** qui pose problème.)

**F26 — Élevé — fuite de stack trace. (Confirmé)** `lib/errors.ts:5` renvoie au
client `{ error, stack }` en 500 : une soumission à montant trop grand renvoie
`{"error":"numeric field overflow","stack":"… /home/…/node_modules/pg/…"}`,
exposant chemins serveur et structure interne. _Correctif : message générique au
client, détail seulement dans les logs._

**F27 — Faible — codes HTTP d'autorisation incohérents. (Confirmé)** Mauvais rôle
→ **401** sur les routes manager, **403** sur les routes RH. _Correctif :
uniformiser (401 = non authentifié, 403 = authentifié mais interdit)._

**F35 — Moyen — aucun test automatisé ni CI. (Code)** `package.json` ne
définit aucun script `test` et le dépôt ne contient aucun fichier de test ni
pipeline d'intégration continue ; seuls `lint` et `typecheck` existent, à lancer
à la main. Aucun des constats de ce rapport (contrôle d'accès F1/F5, course
F9, injection F3…) n'est couvert par un test de non-régression : une refonte ne
peut pas prouver qu'elle ne les réintroduit pas. _Correctif : tests
d'intégration des routes API par rôle (au minimum un test par constat corrigé),
exécutés en CI avec lint et typecheck à chaque PR._

**F42 — Faible — entrée malformée → 500 au lieu de 400. (Test)** Les erreurs
de format ne sont pas validées en entrée : elles remontent de Postgres ou de
`formData()`. Concrètement :
- id non UUID sur les routes de reçu (employé, manager, RH) et sur la cible de
  `PUT /api/hr/users/[id]/manager` (`invalid input syntax for type uuid`) ;
- `managerId` de mauvais type (`42`, `""`) ;
- corps JSON, vide ou multipart malformé sur `POST /api/expense-notes` ;
- corps JSON sur la suggestion OCR.

Toutes ces requêtes renvoient **500 avec la stack** (F26), ce qui pollue les
journaux d'erreurs et noie les vraies pannes
(`expense-note-receipt-url.test.ts:70`, `manager-receipt-url.test.ts:63`,
`hr-receipt-url.test.ts:57`, `hr-user-manager.test.ts:149,167`,
`expense-notes.test.ts:364-394`, `receipt-suggestion.test.ts:88`).
_Correctif : valider en entrée les paramètres de route (UUID) et le corps
(schéma), et renvoyer 400._

**F43 — Faible — erreurs qui échappent au `try/catch`. (Test)** Sept routes
font `return withUserScope(...)` **sans `await`** :
`expense-notes/route.ts:44`, `manager/expense-notes/route.ts:25`,
`hr/expense-notes/route.ts:25`, et les quatre routes `approve`/`reject`
(ligne 13). Une erreur levée dans la transaction rejette la promesse après la
sortie du `try`, et `respondError` n'est jamais appelé : Next renvoie sa 500
générique. Le même type d'erreur donne donc une 500 JSON avec stack sur
certaines routes et une 500 brute sur d'autres (`api-auth.spec.ts:90-104`,
`manager-decisions.test.ts:117`, `hr-decisions.test.ts:122`). La gestion
d'erreurs n'est pas uniforme, et un correctif de F26 dans `respondError` ne
couvrira pas ces routes. _Correctif : `return await withUserScope(...)`,
idéalement via un wrapper de route unique qui centralise la gestion
d'erreurs._

---

## 9 · Autres

**F28 — Faible — décisions irréversibles, aucune piste d'audit. (Code)** Une note
approuvée/rejetée ne peut plus changer (ni correction d'un clic malheureux, ni
historique : qui a tranché, quand). _Correctif : journal de décision horodaté,
éventuelle annulation contrôlée._

**F29 — Faible — défauts d'affichage. (Confirmé)** Dates décalées d'un jour à
l'ouest d'UTC (`expenses/page.tsx:285`, `PendingApprovalsPanel.tsx:120`,
`AdminConsole.tsx:228`) ; le manager voit l'UUID au lieu du nom de l'employé
(`PendingApprovalsPanel.tsx:117`) ; le total employé additionne aussi les notes
rejetées/en attente (`expenses/page.tsx:155`) ; rôles affichés en anglais dans
l'organigramme (`AdminConsole.tsx:166`).

**F36 — Faible — énumération des comptes. (Code)** Le signup répond
explicitement « Un compte existe déjà avec cet email » (`actions/auth.ts:38`).
Au login, un email inconnu renvoie immédiatement, tandis qu'un email existant
déclenche un `bcrypt.compare` de coût 12 (`lib/auth.ts:35-37`) : l'écart de
temps de réponse révèle quels emails ont un compte. Combiné à F20 (pas de
limitation de débit), cela facilite le ciblage. _Correctif : comparer contre un
hash factice quand l'utilisateur n'existe pas, et rendre le message de signup
non discriminant (ou passer par un email de confirmation)._

**F37 — Faible — type du reçu déclaré par le client. (Code)** La liste blanche
porte sur `receipt.type` (`expense-notes/route.ts:81`), c'est-à-dire le type
MIME envoyé par le client, et ce même type est enregistré comme `ContentType`
dans S3. Le contenu n'est jamais vérifié : n'importe quel fichier peut être
stocké sous l'étiquette `image/png` ou `application/pdf` (les PDF pouvant
eux-mêmes embarquer du script), puis ouvert par un manager ou la RH via l'URL
signée. _Correctif : vérifier la signature du fichier (magic bytes) et dériver
le type de celle-ci ; servir les reçus avec `Content-Disposition: attachment`._

**F38 — Faible — fonctions métier manquantes. (Code)** L'employé ne peut ni
modifier ni annuler une note encore `pending` (erreur de saisie = note à
faire rejeter) ; le rejet ne porte aucun motif, l'employé ne sait pas quoi
corriger ; aucun parcours « mot de passe oublié » ni changement de mot de
passe. Pas des défauts au sens strict, mais des manques qui bloquent un usage
réel. _Correctif : à arbitrer avec le métier ; le motif de rejet rejoint la
piste d'audit de F28._

**F45 — Faible — reçu vide accepté. (Test)** Un fichier de 0 octet passe tous
les contrôles (`expense-notes/route.ts:81-86`) : la note est créée (201) avec
un objet S3 vide comme justificatif (`expense-notes.test.ts:295`). Même cause
que F37 : le contenu du reçu n'est jamais vérifié. _Correctif : taille
minimale, et vérification de la signature du fichier (F37)._

**F46 — Faible — pages réservées servies avec un simple message. (Test)**
`proxy.ts` vérifie seulement qu'une session existe. Le rôle n'est contrôlé
qu'au rendu, par `manager/page.tsx` et `hr/page.tsx`, qui affichent « Accès
réservé… » sans redirection ni statut 403 (`auth.spec.ts:88-100`). Il n'y a
pas de fuite, puisque les données passent par l'API qui contrôle le rôle, mais
le refus n'est pas un vrai refus HTTP. _Correctif : contrôler le rôle dans le
proxy (redirection) ou renvoyer un 403 depuis la page._

---

## Annexe — données de test laissées en base (à nettoyer)

Deux entreprises jetables, mot de passe commun `passw0rd!` :

| Entreprise | Rôle | Email |
|---|---|---|
| A (`xqa-a.test`) | RH | `hr@xqa-a.test` |
| A | Manager racine | `manager@xqa-a.test` |
| A | Sous-manager (sous Manager A) | `submanager@xqa-a.test` |
| A | Employés | `employee@xqa-a.test`, `employee2@xqa-a.test` |
| B (`xqa-b.test`) | RH | `hr@xqa-b.test` |
| B | Manager racine | `manager@xqa-b.test` |
| B | Employés | `employee@xqa-b.test`, `employee2@xqa-b.test` |

S'y ajoutent, sur `demo@expense.io`, des notes de test (« QA future date »,
« Test taxi QA »), quelques notes créées pendant les tests de concurrence et de
RH (« Race test », « Note de frais du HR A », « Note du sous-manager »), et une
entreprise jetable de signup (`qa1791548963490.example`). Aucune donnée
préexistante n'a été modifiée.
