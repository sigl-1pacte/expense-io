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
