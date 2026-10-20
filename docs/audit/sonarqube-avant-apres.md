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

Non mesuré. `make sonar-up` a échoué : la commande `make` est absente de l'environnement où la tâche a été exécutée (Git Bash sous Windows), donc ni SonarQube ni l'analyse n'ont été lancés. `SONAR_TOKEN` (dans `.env`) n'a pas été vérifié.

À faire à la main, depuis un shell où `make` existe ([runbook](../runbooks/sonarqube-analyse.md)) :

```sh
make sonar-up          # attendre que http://localhost:9000/api/system/status renvoie UP
make sonar             # couverture Vitest, analyse, puis tableau du rapport
npm run --silent sonar:report >> docs/audit/sonarqube-avant-apres.md
git rev-parse --short HEAD   # à noter : « Commit analysé : <hash> »
make sonar-down
```

Ensuite, ajouter la capture `docs/audit/sonarqube-apres.png` et une section `## Lecture` de trois à cinq lignes comparant les chiffres à la section « Avant ».
