# Benchmark de référence — performances avant refonte

Mesure des performances de l'API d'Expense.io **avant** la refonte, pour
vérifier ensuite que la refonte ne les dégrade pas. La colonne « Avant » est
remplie ; la colonne « Après » est à remplir en rejouant exactement la même
procédure (voir [Rejouer le benchmark](#rejouer-le-benchmark)).

Les contrats des endpoints mesurés sont décrits dans
[`docs/api/openapi.yaml`](../api/openapi.yaml).

## En bref

- **La connexion est le goulot d'étranglement** : environ 3,4 connexions/s au
  maximum, quel que soit le nombre d'utilisateurs simultanés. À 20 utilisateurs
  simultanés, une connexion prend 4,5 s (médiane).
- **L'OCR d'un reçu prend environ 450 ms**, soit 7,6 reçus/s au mieux à 4
  utilisateurs simultanés.
- **Toutes les autres routes répondent en 4 à 15 ms** à 1 utilisateur, et
  plafonnent **entre 360 et 560 req/s** à 20 utilisateurs simultanés.
- Aucune erreur sur les 30 mesures (169 147 requêtes au total).

## Conditions de mesure

| | |
|---|---|
| Date | 2026-10-08, 16 h 24 – 16 h 42 |
| Commit mesuré | `265924b` (Initial commit: Expense.io) |
| Machine | AMD Ryzen 5 4600H (6 cœurs / 12 threads), 14 Gio de RAM, portable sur secteur, profil d'énergie « balanced » |
| Charge de fond | Chrome et VS Code ouverts, activité non contrôlée (voir [Fiabilité](#fiabilité-de-la-comparaison)) |
| Système | Linux 7.0.0-34-generic |
| Node.js | v22.23.2 |
| Application | build de production (`next build` puis `next start`), port 3001 |
| PostgreSQL / S3 | conteneurs `docker compose` du projet (Postgres 16, LocalStack 3.8.1) |
| Outil de charge | k6 1.3.0, image Docker `grafana/k6:1.3.0` |

k6, l'application, PostgreSQL et LocalStack tournent **sur la même machine** :
les chiffres absolus ne sont comparables qu'entre deux mesures faites sur la
même machine et dans les mêmes conditions.

## Méthode

### Charge appliquée

On utilise un **modèle fermé** : un nombre fixe d'utilisateurs virtuels (VUs)
enchaînent les requêtes sans pause. Le débit n'est pas imposé, il est
**mesuré** (c'est ce que le serveur parvient à absorber).

| Palier | VUs | Ce qu'il mesure |
|---|---|---|
| Charge unitaire | 1 | Latence d'une requête seule, sans concurrence |
| Charge concurrente | 20 | Débit maximal et latence sous saturation |

Exceptions :

- **OCR** (`receipt-suggestion`) : 1 et 4 VUs, mesure de 60 s. Chaque requête
  occupe le processeur près d'une demi-seconde ; à 20 VUs on ne mesurerait
  plus que des files d'attente.
- **Approbations et rejets** : chaque appel consomme une note en attente, donc
  la mesure porte sur **2 000 appels** (et non une durée fixe), sur une
  réserve de notes préparée à l'avance.

Chaque mesure suit le même déroulé :

1. Réinitialisation complète de la base de benchmark (`bench/seed.mjs`).
2. Connexion du compte utilisé, hors mesure.
3. **Échauffement de 5 s** (ou 100 appels pour les décisions), exclu des
   résultats. Les requêtes encore en vol à la fin de l'échauffement sont
   coupées, ce qui laisse des lignes `Error: aborted` / `ECONNRESET` dans
   `server.log` : c'est attendu.
4. **Mesure de 30 s** (60 s pour l'OCR, 2 000 appels pour les décisions).

### Métriques

- **Débit (req/s)** : nombre de requêtes terminées ÷ durée réelle de la fenêtre
  de mesure (du début de la première à la fin de la dernière).
- **Moyenne, médiane, P95, P99, max** : durée de la requête HTTP (champ
  `http_req_duration` de k6 : envoi, attente et réception de la réponse).
  P95 = 95 % des requêtes ont été plus rapides que cette valeur.
- **Erreurs** : part des réponses dont le code HTTP n'est pas celui attendu
  (200, 201 pour la création, 302 pour la connexion).

Pour la connexion, seule la requête `POST /api/auth/callback/credentials` est
comptée ; le `GET /api/auth/csrf` qui la précède est exclu.

### Jeu de données

Identique à chaque mesure : identifiants fixes, base vidée puis repeuplée par
`bench/seed.mjs`. Il est isolé de la base de développement : base
`expense_io_bench` et bucket `receipts-bench`. Mot de passe de tous les
comptes : `bench1234`.

| Entreprise | Comptes | Notes |
|---|---|---|
| `bench.expense.io` (lectures) | 1 RH, 5 managers racines, 100 employés (20 par manager) | 60 par employé (5 en attente), 40 par manager (20 en attente) |
| `bench-decide.expense.io` (décisions) | 1 RH, 1 manager racine, 1 employé | 4 réserves de 2 200 notes en attente |

Soit 109 utilisateurs et 15 000 notes. Les comptes mesurés sont
`employee1@`, `manager1@` et `hr@bench.expense.io` pour les lectures. Leurs
listes renvoient respectivement 60, 100 et 100 notes, et l'annuaire RH 105
utilisateurs. Les décisions sont faites par les comptes de
`bench-decide.expense.io`, pour que leurs réserves ne gonflent pas les listes
mesurées.

### Endpoints mesurés

Les 14 routes métier de l'API, plus la connexion. Ne sont **pas** mesurés :

- les pages rendues côté serveur (`/expenses`, `/manager`, `/hr`…) ;
- l'inscription (Server Action, pas de route HTTP stable) ;
- les routes Auth.js secondaires (`/api/auth/session`, `/api/auth/csrf`,
  `/api/auth/providers`, `/api/auth/signout`).

## Résultats

Durées en millisecondes. Les lignes « Après » sont à remplir (voir
[Remplir la colonne « Après »](#remplir-la-colonne-après)).

### Charge unitaire (1 VU)

| Endpoint | VUs | Version | Débit (req/s) | Moyenne (ms) | Médiane (ms) | P95 (ms) | P99 (ms) | Max (ms) | Erreurs | Requêtes |
|---|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|
| `POST /api/auth/callback/credentials` | 1 | Avant | 3.5 | 281.5 | 279.6 | 294.0 | 298.1 | 306.3 | 0.00 % | 105 |
| | | Après |  |  |  |  |  |  |  |  |
| `GET /api/expense-notes` | 1 | Avant | 115.4 | 8.3 | 7.8 | 11.8 | 13.5 | 20.4 | 0.00 % | 3464 |
| | | Après |  |  |  |  |  |  |  |  |
| `POST /api/expense-notes` | 1 | Avant | 68.4 | 14.2 | 13.5 | 18.6 | 20.7 | 26.3 | 0.00 % | 2053 |
| | | Après |  |  |  |  |  |  |  |  |
| `GET /api/expense-notes/{id}/receipt-url` | 1 | Avant | 205.6 | 4.6 | 4.4 | 5.6 | 7.1 | 21.1 | 0.00 % | 6168 |
| | | Après |  |  |  |  |  |  |  |  |
| `POST /api/expense-notes/receipt-suggestion` | 1 | Avant | 2.2 | 448.7 | 446.9 | 472.3 | 490.1 | 491.4 | 0.00 % | 134 |
| | | Après |  |  |  |  |  |  |  |  |
| `GET /api/manager/expense-notes` | 1 | Avant | 76.9 | 12.7 | 14.3 | 15.3 | 16.8 | 22.4 | 0.00 % | 2308 |
| | | Après |  |  |  |  |  |  |  |  |
| `GET /api/manager/expense-notes/{id}/receipt-url` | 1 | Avant | 233.7 | 4.0 | 3.9 | 5.1 | 5.8 | 17.4 | 0.00 % | 7010 |
| | | Après |  |  |  |  |  |  |  |  |
| `POST /api/manager/expense-notes/{id}/approve` | 1 | Avant | 119.9 | 8.0 | 7.2 | 10.9 | 13.2 | 19.4 | 0.00 % | 2000 |
| | | Après |  |  |  |  |  |  |  |  |
| `POST /api/manager/expense-notes/{id}/reject` | 1 | Avant | 115.5 | 8.3 | 9.5 | 11.2 | 13.7 | 17.8 | 0.00 % | 2000 |
| | | Après |  |  |  |  |  |  |  |  |
| `GET /api/hr/expense-notes` | 1 | Avant | 84.1 | 11.6 | 13.2 | 15.5 | 17.1 | 27.7 | 0.00 % | 2525 |
| | | Après |  |  |  |  |  |  |  |  |
| `GET /api/hr/expense-notes/{id}/receipt-url` | 1 | Avant | 202.4 | 4.6 | 4.5 | 5.8 | 6.8 | 19.0 | 0.00 % | 6071 |
| | | Après |  |  |  |  |  |  |  |  |
| `POST /api/hr/expense-notes/{id}/approve` | 1 | Avant | 120.9 | 7.9 | 6.9 | 11.0 | 13.6 | 18.1 | 0.00 % | 2000 |
| | | Après |  |  |  |  |  |  |  |  |
| `POST /api/hr/expense-notes/{id}/reject` | 1 | Avant | 118.3 | 8.1 | 7.8 | 10.9 | 13.7 | 24.0 | 0.00 % | 2000 |
| | | Après |  |  |  |  |  |  |  |  |
| `GET /api/hr/users` | 1 | Avant | 232.3 | 4.0 | 3.8 | 5.7 | 6.9 | 20.0 | 0.00 % | 6970 |
| | | Après |  |  |  |  |  |  |  |  |
| `PUT /api/hr/users/{id}/manager` | 1 | Avant | 134.6 | 7.1 | 6.6 | 10.1 | 12.6 | 26.5 | 0.00 % | 4040 |
| | | Après |  |  |  |  |  |  |  |  |

### Charge concurrente

| Endpoint | VUs | Version | Débit (req/s) | Moyenne (ms) | Médiane (ms) | P95 (ms) | P99 (ms) | Max (ms) | Erreurs | Requêtes |
|---|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|
| `POST /api/auth/callback/credentials` | 20 | Avant | 3.3 | 4309.7 | 4460.8 | 4926.3 | 4940.8 | 4942.3 | 0.00 % | 110 |
| | | Après |  |  |  |  |  |  |  |  |
| `GET /api/expense-notes` | 20 | Avant | 486.4 | 40.8 | 40.6 | 49.5 | 57.5 | 100.5 | 0.00 % | 14605 |
| | | Après |  |  |  |  |  |  |  |  |
| `POST /api/expense-notes` | 20 | Avant | 247.7 | 80.3 | 76.5 | 122.0 | 134.9 | 404.0 | 0.00 % | 7443 |
| | | Après |  |  |  |  |  |  |  |  |
| `GET /api/expense-notes/{id}/receipt-url` | 20 | Avant | 415.4 | 47.8 | 47.5 | 58.0 | 63.7 | 109.0 | 0.00 % | 12469 |
| | | Après |  |  |  |  |  |  |  |  |
| `POST /api/expense-notes/receipt-suggestion` | 4 | Avant | 7.6 | 529.4 | 536.2 | 575.0 | 591.4 | 662.3 | 0.00 % | 456 |
| | | Après |  |  |  |  |  |  |  |  |
| `GET /api/manager/expense-notes` | 20 | Avant | 414.7 | 48.0 | 47.6 | 58.7 | 66.4 | 105.6 | 0.00 % | 12452 |
| | | Après |  |  |  |  |  |  |  |  |
| `GET /api/manager/expense-notes/{id}/receipt-url` | 20 | Avant | 408.2 | 48.7 | 48.5 | 53.0 | 57.5 | 114.7 | 0.00 % | 12259 |
| | | Après |  |  |  |  |  |  |  |  |
| `POST /api/manager/expense-notes/{id}/approve` | 20 | Avant | 503.0 | 39.4 | 38.7 | 47.4 | 72.3 | 79.3 | 0.00 % | 2000 |
| | | Après |  |  |  |  |  |  |  |  |
| `POST /api/manager/expense-notes/{id}/reject` | 20 | Avant | 526.6 | 37.6 | 36.9 | 45.8 | 66.5 | 72.4 | 0.00 % | 2000 |
| | | Après |  |  |  |  |  |  |  |  |
| `GET /api/hr/expense-notes` | 20 | Avant | 417.0 | 47.7 | 47.4 | 58.7 | 66.8 | 109.0 | 0.00 % | 12520 |
| | | Après |  |  |  |  |  |  |  |  |
| `GET /api/hr/expense-notes/{id}/receipt-url` | 20 | Avant | 413.5 | 48.0 | 47.8 | 58.6 | 65.9 | 108.3 | 0.00 % | 12420 |
| | | Après |  |  |  |  |  |  |  |  |
| `POST /api/hr/expense-notes/{id}/approve` | 20 | Avant | 521.9 | 37.9 | 37.8 | 43.9 | 54.4 | 71.3 | 0.00 % | 2000 |
| | | Après |  |  |  |  |  |  |  |  |
| `POST /api/hr/expense-notes/{id}/reject` | 20 | Avant | 524.5 | 37.8 | 37.7 | 43.7 | 47.6 | 54.0 | 0.00 % | 2000 |
| | | Après |  |  |  |  |  |  |  |  |
| `GET /api/hr/users` | 20 | Avant | 559.3 | 35.5 | 34.7 | 43.1 | 54.9 | 94.0 | 0.00 % | 16789 |
| | | Après |  |  |  |  |  |  |  |  |
| `PUT /api/hr/users/{id}/manager` | 20 | Avant | 358.9 | 55.4 | 53.9 | 75.0 | 86.7 | 125.6 | 0.00 % | 10776 |
| | | Après |  |  |  |  |  |  |  |  |

Les valeurs brutes de la colonne « Avant » sont dans
[`baseline-results.json`](baseline-results.json).

## Observations

Constats sur l'état actuel, sans recommandation de correction.

1. **Connexion.** Le mot de passe est vérifié avec `bcryptjs` (JavaScript pur,
   coût 12), soit environ 280 ms de calcul par connexion. Ce calcul s'exécute
   dans le processus Node unique de l'application : le débit plafonne à environ
   3,4 connexions/s, qu'il y ait 1 ou 20 utilisateurs, et la latence croît
   linéairement avec la concurrence.
2. **OCR.** Chaque requête crée puis détruit un moteur Tesseract (chargement du
   modèle `fra` compris), d'où environ 450 ms par reçu, même pour une image de
   20 Ko.
3. **Plafond commun.** Les routes légères saturent toutes entre 360 et 560
   req/s à 20 VUs, ce qui correspond à la limite d'un processus Node unique sur
   cette machine.
4. **Listes.** La table `expense_notes` n'a aucun index en dehors de sa clé
   primaire (rien sur `user_id` ni `status`). Les listes manager et RH, qui font
   une jointure avec `users`, sont les lectures les plus lentes à 1 VU (13 à
   14 ms de médiane, contre 4 ms pour les liens de reçu). Leur coût dépend du
   volume total de la table, et pas seulement du nombre de notes renvoyées.
5. **Réassignation de manager.** La route enchaîne 4 requêtes SQL hors
   transaction. C'est la route légère la moins performante sous charge
   (359 req/s, P99 87 ms).
6. **Row Level Security.** L'application se connecte avec le rôle PostgreSQL
   `expense`, qui est superutilisateur : les politiques RLS de la migration ne
   sont donc **pas évaluées** pendant ces mesures. Si la refonte passe à un rôle
   non privilégié, le coût de ces politiques apparaîtra dans la colonne
   « Après » sans qu'il s'agisse d'une régression du code applicatif.

## Rejouer le benchmark

### Prérequis

- Docker, Node.js et les dépendances installées (`npm install`).
- Postgres et LocalStack démarrés : `make up`.
- Port 3001 libre. Le serveur de développement sur le port 3000 peut rester
  lancé, mais **inactif** pendant la mesure.
- Machine au repos (pas de compilation, de navigateur chargé, etc.), portable
  branché sur secteur.

### Lancer la mesure

```bash
bash bench/run.sh
```

Durée : environ 17 minutes. Le script :

1. crée la base `expense_io_bench` si besoin, y applique les migrations et
   crée le bucket `receipts-bench` (la base de développement n'est jamais
   touchée) ;
2. fait un build de production (`npm run build`) puis démarre l'application
   sur le port 3001 ;
3. pour chacun des 30 cas : réinitialise la base de benchmark puis lance k6
   (`grafana/k6:1.3.0` via Docker) ;
4. arrête l'application et écrit dans `bench/results/<horodatage>/` :
   - un fichier JSON par cas ;
   - `summary.json` ;
   - `report.md` (les tableaux de ce document) ;
   - `environment.txt` ;
   - les journaux du build et du serveur.

Options (variables d'environnement) :

| Variable | Effet |
|---|---|
| `SKIP_BUILD=1` | Réutilise le build existant |
| `ONLY="login hr-list"` | Ne mesure que les cas cités (clés de `bench/k6/endpoints.js`) |
| `PORT=3002` | Change le port de l'application |

Un cas isolé peut aussi être lancé à la main, l'application tournant sur le
port 3001 et la base venant d'être repeuplée :

```bash
DATABASE_URL=postgres://expense:expense@localhost:5433/expense_io_bench node bench/seed.mjs
docker run --rm --network host -v "$PWD/bench:/bench" \
  -e CASE=employee-list -e VUS=20 grafana/k6:1.3.0 run /bench/k6/endpoints.js
```

### Remplir la colonne « Après »

Après la refonte, lancer `bash bench/run.sh` sur **la même machine**, puis
générer les tableaux comparatifs :

```bash
node bench/report.mjs bench/results/<horodatage> --baseline docs/audit/baseline-results.json
```

La commande affiche les deux tableaux de la section [Résultats](#résultats),
avec la ligne « Avant » reprise de `baseline-results.json` et la ligne
« Après » issue de la nouvelle mesure. Il suffit de les recopier dans ce
document.

Si la refonte modifie une route (chemin, méthode, format de requête), le cas
correspondant de `bench/k6/endpoints.js` doit être adapté pour que la mesure
reste équivalente.

### Fiabilité de la comparaison

- **Les mesures sont sensibles à l'activité de la machine.** La mesure
  « Avant » a été faite avec un navigateur Chrome et VS Code ouverts, dont
  l'activité pendant le run n'a pas été contrôlée. Écarts observés en rejouant
  certains cas juste après, Chrome consommant alors environ 2 cœurs :

  | Cas | 1 VU | 20 VUs |
  |---|---|---|
  | `GET /api/expense-notes` | 122,5 → 115,4 req/s (−6 %) | 455,0 → 486,4 req/s (+7 %) |
  | `GET /api/hr/users` | 232,3 → 206,3 req/s (−11 %) | 559,3 → 423,7 req/s (−24 %) |
  | `GET /api/hr/expense-notes` | 84,1 → 91,9 req/s (+9 %) | 417,0 → 322,0 req/s (−23 %) |

- Le palier à **1 VU est le plus stable** (écart observé ≤ 13 %) : c'est la
  référence à privilégier pour juger d'une régression de latence. Sous charge
  (20 VUs), un écart inférieur à environ 25 % ne peut pas être distingué du
  bruit dans ces conditions.
- Pour réduire ce bruit, avant chaque mesure (« Avant » comme « Après ») :
  fermer navigateur et IDE, brancher le portable sur secteur, sélectionner le
  profil d'énergie « performance » (`powerprofilesctl set performance`), et
  vérifier que `uptime` affiche une charge moyenne proche de 0.
- Si la mesure « Après » ne peut pas être faite sur la machine décrite plus
  haut, il faut **remesurer « Avant » sur la nouvelle machine** à partir du
  commit `265924b`. Le dossier `bench/` n'existe pas dans ce commit, il faut
  donc le recopier :

  ```bash
  git worktree add ../expense-io-avant 265924b
  cp -r bench ../expense-io-avant/
  cd ../expense-io-avant
  cp ../expense-io/.env .
  npm ci
  bash bench/run.sh
  ```

  Puis utiliser le `summary.json` produit comme `--baseline`.
