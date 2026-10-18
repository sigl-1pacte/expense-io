# Runbook — SonarQube : lancer une analyse

| | |
|---|---|
| **Composant** | SonarQube Community (profil `quality` du docker-compose) |
| **Responsable** | axe Architecture |
| **Dernière vérification** | 2026-10-16 |
| **Criticité** | Faible |

## Objectif

Analyser le dépôt avec SonarQube en local, avec la couverture Vitest, et obtenir le rapport (quality gate et métriques).

## Quand l'utiliser

- Avant d'ouvrir une PR qui touche beaucoup de code.
- Pour les mesures « avant / après » de l'audit (`docs/audit/sonarqube-avant-apres.md`).

## Prérequis

- Docker, au moins 4 Go de mémoire libre.
- `.env` contient `SONAR_HOST_URL=http://localhost:9000`.

## Procédure

1. Démarrer SonarQube :
   ```sh
   make sonar-up
   ```
   **Attendu :** http://localhost:9000 répond (1 à 2 min au premier démarrage).
2. Première fois seulement : préparer le serveur et récupérer un jeton :
   ```sh
   SONAR_ADMIN_PASSWORD='un-mot-de-passe-local' npm run --silent sonar:bootstrap
   ```
   **Attendu :** un jeton `sqa_…` s'affiche. Le copier dans `.env` (`SONAR_TOKEN=…`).
3. Lancer l'analyse :
   ```sh
   make sonar
   ```
   **Attendu :** le tableau Markdown du rapport s'affiche ; le détail est sur http://localhost:9000/dashboard?id=expense-io.

## Vérification finale

`sonar-report.json` existe et le tableau de bord affiche la date du jour.

## Retour arrière

`make sonar-down` arrête le serveur ; `docker compose --profile quality down -v` efface ses données.

## Références

- Spec, section SonarQube : `docs/specs/2026-10-15-architecture-cible.md`
