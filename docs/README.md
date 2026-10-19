# Base de connaissance — Expense.io

Ce dossier rassemble ce que l'équipe sait de l'application avant la refacto :
l'état des lieux, les défauts relevés, les mesures de performance, le contrat de
l'API et le choix d'architecture. Chaque document est un instantané daté, qui
indique le commit qu'il décrit. Ce fichier-ci dit où en sont les décisions.

## Où en est-on

_Mis à jour le 16/10/2026._

- **Architecture cible : option C**, retenue le 15/10/2026, spec en revue le
  16/10/2026. C'est un monolithe modulaire (modules `expenses` et `iam`),
  hexagonal dans chaque module. La notification de décision passe par une
  **outbox d'e-mails** (`mail_outbox`), vidée par un worker de livraison, sans
  broker : SQS a été écarté le 16/10. Les sous-choix D1 à D5 sont tranchés, et
  les 46 constats de l'audit sont chacun traités ou écartés avec leur raison.
  Voir la [spec](specs/2026-10-15-architecture-cible.md) et le
  [schéma](architecture/architecture-cible.html).
- **Calendrier** : refacto du 19 au 26/10, soutenance le 30/10.
- **Pas encore sur `main`** : la suite de tests de caractérisation (ARLA-9) et
  les plans de la refacto. Voir [À venir](#à-venir).
- **ADR 0001 à 0004 écrites** : voir [adrs/](adrs/README.md).
- **Plan 1 terminé** (socle et harnais agent) : SonarQube (mesures « avant » dans [audit/sonarqube-avant-apres.md](audit/sonarqube-avant-apres.md)), contrat OpenAPI vérifié en CI, erreurs RFC 9457, rôle expense_app et RLS d'isolation, F1, F3, F16, F25–F27, F34, F41–F44 corrigés.
- **Plan 2 terminé** (modules) : iam et expenses en hexagonal, ApprovalPolicy seule source de vérité, routes en adapters minces, règles de dépendance bloquantes, skill de live coding et sous-agent de revue.
- Les écarts du contrat d'API sont consignés dans le [`CHANGELOG.md`](../CHANGELOG.md) à la racine.

## Par où commencer

Pour découvrir le projet, lire dans cet ordre :

1. [`audit/as-is.md`](audit/as-is.md) : comment l'application est construite aujourd'hui.
2. [`audit/AUDIT.md`](audit/AUDIT.md) : les 46 constats, classés par gravité.
3. [`audit/baseline.md`](audit/baseline.md) : les performances avant la refonte.
4. [`api/openapi.yaml`](api/openapi.yaml) : le contrat que la refacto ne doit pas casser.
5. [`architecture/options-refacto.md`](architecture/options-refacto.md) : les quatre architectures étudiées.
6. [`architecture/option-c.html`](architecture/option-c.html) : l'option retenue, sur une page.
7. [`architecture/architecture-cible.html`](architecture/architecture-cible.html) : l'architecture cible validée, sur une page.
8. [`specs/2026-10-15-architecture-cible.md`](specs/2026-10-15-architecture-cible.md) : la spec complète de la refacto.

## Les documents

### Audit de l'existant — `audit/`

| Document | Question à laquelle il répond | Auteur | Date · commit décrit |
|---|---|---|---|
| [`as-is.md`](audit/as-is.md) et [`as-is.excalidraw`](audit/as-is.excalidraw) | Comment l'application est-elle construite : stack, domaines, flux, points d'attention ? | louisbertrand22 (ARLA-8) | 08/10/2026 · `265924b` |
| [`AUDIT.md`](audit/AUDIT.md) | Quels défauts de sécurité, de données, de performance et de qualité ? Constats F1 à F46, avec gravité et statut. | MaximeCorp ; F39–F46 ajoutés depuis les tests ARLA-9 | 09 au 12/10/2026 · `265924b` |
| [`rapport-audit.pdf`](audit/rapport-audit.pdf) | Version imprimable de l'audit QA. Ne contient pas F39–F46. | MaximeCorp | 12/10/2026 |
| [`baseline.md`](audit/baseline.md) et [`baseline-results.json`](audit/baseline-results.json) | Quelles performances avant la refonte ? Colonne « Après » à remplir après la refacto. | MaximeCorp | 08/10/2026 · `265924b` |

### Contrat d'API — `api/`

| Document | Question à laquelle il répond | Auteur | Date · commit décrit |
|---|---|---|---|
| [`openapi.yaml`](api/openapi.yaml) | Quelles routes, quels corps et quels codes l'API expose-t-elle aujourd'hui ? | MaximeCorp | 08/10/2026 · `265924b` |

### Architecture — `architecture/`

| Document | Question à laquelle il répond | Auteur | Date |
|---|---|---|---|
| [`options-refacto.md`](architecture/options-refacto.md) | Quelles architectures possibles (A à D), avec quels compromis ? | louisbertrand22 | 09/10/2026 |
| [`choix-archi.html`](architecture/choix-archi.html) | Présentation des quatre options à l'équipe, en 12 planches. | louisbertrand22 | 15/10/2026 |
| [`option-c.html`](architecture/option-c.html) | L'option C sur une page : schéma, flux d'une décision, ce que voit l'API. | louisbertrand22 | 15/10/2026 |
| [`architecture-cible.html`](architecture/architecture-cible.html) | L'architecture cible validée : schéma, flux d'une décision, règles de dépendance, garde-fous, alternatives et limites. Remplace le flux SQS d'`option-c.html`. | louisbertrand22, flux de notification de MaximeCorp | 16/10/2026 |

### Specs — `specs/`

| Document | Question à laquelle il répond | Auteur | Date |
|---|---|---|---|
| [`2026-10-15-architecture-cible.md`](specs/2026-10-15-architecture-cible.md) | Que construit la refacto, et pourquoi ? Modules, règles métier, notification, socle, contrat d'API, SonarQube, harnais agent, couverture des 46 constats, découpage en trois plans. | louisbertrand22 | 15 au 16/10/2026 |

Les pages HTML sont des présentations : GitHub en affiche le code source.
Pour les voir, cloner le dépôt et les ouvrir dans un navigateur.

### Outillage

- [`../bench/`](../bench/) : les scripts du benchmark (k6). La procédure pour le
  rejouer est dans [`baseline.md`](audit/baseline.md#rejouer-le-benchmark).

## À venir

Ces documents existent mais n'ont pas encore rejoint `main` :

- la spec et le plan de la suite de tests de caractérisation (ARLA-9), avec la PR ARLA-9 ;
- les trois plans de la refacto (socle et harnais agent, modules, notification), avec la PR de la refacto.

Restent à écrire :

- le schéma cible en Excalidraw, dans le style de `as-is.excalidraw` ;
- la colonne « Après » du benchmark et le bilan de l'audit après refacto.

## Types de documents

| Dossier | Type | Répond à | Gabarit |
|---|---|---|---|
| [`specs/`](specs/README.md) | Spec | Que construit-on, et pourquoi ? | [`spec-template.md`](specs/spec-template.md) |
| [`plans/`](plans/README.md) | Plan d'implémentation | Dans quel ordre, quels fichiers, quels tests ? | [`plan-template.md`](plans/plan-template.md) |
| [`adrs/`](adrs/README.md) | ADR | Pourquoi le système est-il construit ainsi ? | [`adr-template.md`](adrs/adr-template.md) |
| [`runbooks/`](runbooks/README.md) | Runbook | Comment l'opérer ou le réparer ? | [`runbook-template.md`](runbooks/runbook-template.md) |

Cycle : spec → (ADR si la décision est transverse) → plan → implémentation → runbook. `audit/`, `api/` et `architecture/` restent la base de connaissance décrite plus haut.

## Conventions

- **Constats.** Ils sont numérotés F1 à F46 dans `AUDIT.md`. Leur statut dit
  comment ils ont été établis : « Confirmé » (reproduit sur l'application en
  marche), « Code » (lecture du code) ou « Test » (reproduit par un test ARLA-9).
- **Tests `[as-is]`.** Dans la suite ARLA-9, ils figent un défaut connu. Quand
  ils citent « audit §n », il s'agit du point d'attention n de `as-is.md`.
- **Mises à jour.** Un document décrit l'état d'un commit donné. Quand l'état
  change, on ajoute un document ou une section datée, plutôt que de réécrire
  l'existant ; on met ensuite à jour [Où en est-on](#où-en-est-on).
