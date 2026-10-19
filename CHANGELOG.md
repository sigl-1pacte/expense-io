# Journal des modifications

Les écarts du contrat d'API (`docs/api/openapi.yaml`) sont consignés ici. Format inspiré de
[Keep a Changelog](https://keepachangelog.com/fr/1.1.0/), versionnement sémantique : les écarts
ci-dessous ajoutent des cas d'erreur et corrigent des failles sans modifier de réponse en succès
d'un client légitime, d'où une version MINOR.

## [Non publié]

Plan 2 de la refacto (modules `iam` et `expenses`).

### Modifié

- Inscription : une adresse de messagerie publique (gmail.com, outlook.fr, yahoo.fr…) ne peut plus créer d'entreprise (F4) ; l'action renvoie un message d'erreur.
- `PUT /api/hr/users/{id}/manager` : un rattachement qui fermerait un cycle d'organigramme (direct ou long) est refusé en 409 `Invalid manager` (accepté auparavant) (F30).
- Toutes les routes migrées : le rôle et l'entreprise sont relus en base à chaque requête et non plus figés dans la session. Un RH rétrogradé reçoit 403 immédiatement ; un compte supprimé reçoit 401 (F31).
- `POST /api/expense-notes` : si le stockage des reçus est indisponible, réponse 502 « Stockage des reçus indisponible » et aucune note n'est créée (500 avec une note sans reçu auparavant) (F10).
- `GET /api/expense-notes/{id}/receipt-url` : 404 pour une note sans clé de reçu (URL de la racine du bucket auparavant) (F39).

## [0.2.0] — 2026-10-19

Plan 1 de la refacto (socle et harnais agent).

### Modifié

- Toutes les routes : une erreur interne renvoie un 500 sans `stack`, au format `application/problem+json` (RFC 9457). Le champ `error` est conservé.
- Endpoints manager : un rôle insuffisant renvoie 403 (401 auparavant).
- Endpoints RH : une requête sans session renvoie 401 (403 auparavant).
- Identifiant qui n'est pas un UUID, ou corps de requête illisible : 400 (500 auparavant).
- `?sort=` des listes de notes : liste blanche de colonnes, tri par défaut sinon (expression SQL libre auparavant).
- `PUT /api/hr/users/{id}/manager` : `managerId` est obligatoire, 400 s'il manque ou si le corps est illisible (l'employé était détaché auparavant) ; un manager d'une autre entreprise est refusé en 409 `Invalid manager`.
- `GET /api/manager/expense-notes/{id}/receipt-url` : 404 pour une note hors de l'équipe du manager (note de n'importe quelle entreprise auparavant).
- `POST` dont le `Content-Length` dépasse la limite : 400 avant lecture du corps.
