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

### SonarQube — 2026-10-20 — quality gate : OK

| Métrique | Valeur |
|---|---|
| Bugs | 0 |
| Vulnérabilités | 0 |
| Security hotspots | 0 |
| Code smells | 0 |
| Duplication (%) | 0.0 |
| Complexité cognitive | 252 |
| Couverture (%) | 75.1 |
| Lignes de code | 2809 |

Commit analysé : 4d561a8 (`main` après la fusion du plan 3 et des corrections SonarQube).

Les trois conditions du quality gate, qui portent sur le code nouveau depuis l'analyse « Avant », passent : problèmes nouveaux 0 (seuil 0), couverture du code nouveau 89,7 % (seuil 80 %), duplication du code nouveau 0,0 % (seuil 3 %).

Analyse intermédiaire : sur 6b3c2f5 (fusion du plan 3), le quality gate était en ERROR. Il y avait 2 problèmes nouveaux : une regex de validation d'email à retour arrière super-linéaire (S8786) et `NaN` au lieu de `Number.NaN` (S7773). Les 4 bugs restants dataient d'avant la refacto : des promesses non gérées dans les `useEffect` de trois écrans (S9383). Les six sont corrigés par 0b815ca, avec 13 cas de test qui figent la validation d'email avant sa réécriture.

Capture : à ajouter (`docs/audit/sonarqube-apres.png`, tableau de bord http://localhost:9000/dashboard?id=expense-io).

## Lecture

- Bugs : 4 → 0. Vulnérabilités et security hotspots : 0 avant, 0 après.
- Code smells : 3 → 0. Duplication : 9,3 % → 0,0 %.
- Couverture Sonar (tout `src/`) : 66,4 % → 75,1 %.
- Lignes de code : 1 970 → 2 809 ; complexité cognitive : 192 → 252. Les deux mesures sont des totaux du projet.
- Quality gate : OK avant, OK après.
