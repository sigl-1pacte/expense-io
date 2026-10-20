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

### SonarQube — 2026-10-20 — quality gate : ERROR

| Métrique | Valeur |
|---|---|
| Bugs | 4 |
| Vulnérabilités | 0 |
| Security hotspots | 0 |
| Code smells | 2 |
| Duplication (%) | 0.0 |
| Complexité cognitive | 250 |
| Couverture (%) | 74.8 |
| Lignes de code | 2804 |

Commit analysé : 6b3c2f5 (fusion du plan 3 sur `main`).

Quality gate en échec sur une seule condition, qui porte sur le code nouveau depuis l'analyse précédente (2026-10-18) : `new_violations` = 2 (seuil 0). Les deux autres conditions passent : couverture du code nouveau 90,0 % (seuil 80 %), duplication du code nouveau 0,0 % (seuil 3 %).

Capture : à ajouter (`docs/audit/sonarqube-apres.png`, tableau de bord http://localhost:9000/dashboard?id=expense-io).

## Lecture

- Bugs : 4 avant, 4 après. Vulnérabilités et security hotspots : 0 avant, 0 après.
- Code smells : 3 → 2. Duplication : 9,3 % → 0,0 %.
- Couverture Sonar (tout `src/`) : 66,4 % → 74,8 %.
- Lignes de code : 1 970 → 2 804 ; complexité cognitive : 192 → 250. Les deux mesures sont des totaux du projet.
- Quality gate : OK → ERROR, à cause de 2 problèmes introduits dans le code nouveau (condition `new_violations`).
