# SonarQube — mesures avant / après la refacto

Mesures prises avec le même outillage (SonarQube Community, `sonar-project.properties`, couverture Vitest) sur la base de la refacto puis à la fin du plan 3. Procédure : [`docs/runbooks/sonarqube-analyse.md`](../runbooks/sonarqube-analyse.md).

## Avant

### SonarQube — 2026-10-18 — quality gate : OK

| Métrique | Valeur |
|---|---|
| Bugs | 4 |
| Vulnérabilités | 0 |
| Security hotspots | 0 |
| Code smells | 3 |
| Duplication (%) | 9.3 |
| Complexité cognitive | 192 |
| Couverture (%) | 66.4 |
| Lignes de code | 1970 |

La couverture Sonar porte sur tout `src/` (pages et code mort compris), contrairement au résumé Vitest (périmètre restreint) : seules les comparaisons Sonar contre Sonar sont significatives.

Commit analysé : 88cbfee.

Données brutes : [sonarqube-avant.json](sonarqube-avant.json)

## Après

Non mesuré. Sans `make` (Git Bash sous Windows), les commandes du Makefile ont été lancées directement :

1. `docker compose --profile quality up -d sonarqube` : SonarQube 26.10 répond `UP`.
2. `npm run test:coverage` : réussi (rapport de couverture produit).
3. `set -a; . ./.env; set +a; npm run sonar` : **bloqué** — le chargement de `.env` dans le shell de l'agent a été refusé par le contrôle d'autorisation, le scanner n'a donc pas été lancé.

À faire à la main, depuis un shell où `.env` peut être chargé (SonarQube est arrêté ; le relancer d'abord) :

```sh
docker compose --profile quality up -d sonarqube   # attendre « UP » sur http://localhost:9000/api/system/status
npm run test:coverage
set -a; . ./.env; set +a; npm run sonar
npm run --silent sonar:report >> docs/audit/sonarqube-avant-apres.md
docker compose --profile quality stop sonarqube
```

Puis noter « Commit analysé : <hash> », ajouter la capture `docs/audit/sonarqube-apres.png` et une section `## Lecture` de trois à cinq lignes comparant les chiffres à la section « Avant ».
