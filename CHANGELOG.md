# Journal des modifications

Les écarts du contrat d'API (`docs/api/openapi.yaml`) sont consignés ici. Format inspiré de
[Keep a Changelog](https://keepachangelog.com/fr/1.1.0/), versionnement sémantique : les écarts
ci-dessous ajoutent des cas d'erreur et corrigent des failles sans modifier de réponse en succès
d'un client légitime, d'où une version MINOR.

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
