# Contribuer

Règles pour tout contributeur, humain ou agent. Agents : voir aussi [`AGENTS.md`](AGENTS.md).

## Branches

- `main` : branche de référence, protégée. On n'y commite jamais directement.
- Une branche par ticket : `<prénom>/arla-<n>-<sujet>` (ex. `louisbert91/arla-9-tests-de-caracterisation`), ou `<prénom>/<sujet>` hors ticket.
- On fusionne dans `main` par pull request, CI verte.

## Commits

[Conventional Commits](https://www.conventionalcommits.org/fr/) en français, à l'impératif présent ou au constat : `type(portée): description`.

| Type | Usage |
|---|---|
| `feat` | nouvelle fonctionnalité |
| `fix` | correction de bug |
| `refactor` | changement de code sans changement de comportement |
| `test` | tests |
| `docs` | documentation |
| `ci` | intégration continue |
| `chore` | maintenance, dépendances, outillage |

La portée est le ticket (`ARLA-9`) ou la zone (`refacto`, `iam`, `expenses`…).

## Pull requests

- La CI doit être verte : lint, typecheck, règles de dépendance, Vitest, Playwright, contrat d'API, SonarQube.
- Toute modification de l'API met à jour `docs/api/openapi.yaml` dans la même PR.
- Toute nouvelle décision transverse ajoute une ADR.
