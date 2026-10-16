# Base de connaissance — Expense.io

Ce dossier rassemble ce que l'équipe sait de l'application avant la refacto :
l'état des lieux, les défauts relevés, les mesures de performance, le contrat de
l'API et le choix d'architecture. Chaque document est un instantané daté, qui
indique le commit qu'il décrit. Ce fichier-ci dit où en sont les décisions.

## Où en est-on

_Mis à jour le 15/10/2026._

- **Architecture cible : option C**, retenue le 15/10/2026. C'est un monolithe
  modulaire (modules `expenses` et `iam`), hexagonal dans chaque module, plus
  un flux asynchrone (outbox, file SQS et worker) pour la notification de
  décision. Les sous-choix D2 à D5 sont en cours.
- **Calendrier** : refacto du 19 au 26/10, soutenance le 30/10.
- **Pas encore sur `main`** : la suite de tests de caractérisation (ARLA-9), la
  spec de l'architecture cible et ses plans. Voir [À venir](#à-venir).

## Par où commencer

Pour découvrir le projet, lire dans cet ordre :

1. [`audit/as-is.md`](audit/as-is.md) : comment l'application est construite aujourd'hui.
2. [`audit/AUDIT.md`](audit/AUDIT.md) : les 46 constats, classés par gravité.
3. [`audit/baseline.md`](audit/baseline.md) : les performances avant la refonte.
4. [`api/openapi.yaml`](api/openapi.yaml) : le contrat que la refacto ne doit pas casser.
5. [`architecture/options-refacto.md`](architecture/options-refacto.md) : les quatre architectures étudiées.
6. [`architecture/option-c.html`](architecture/option-c.html) : l'option retenue, sur une page.

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

Les deux pages HTML sont des présentations : GitHub en affiche le code source.
Pour les voir, cloner le dépôt et les ouvrir dans un navigateur.

### Outillage

- [`../bench/`](../bench/) : les scripts du benchmark (k6). La procédure pour le
  rejouer est dans [`baseline.md`](audit/baseline.md#rejouer-le-benchmark).

## À venir

Ces documents existent mais n'ont pas encore rejoint `main` :

- la spec et le plan de la suite de tests de caractérisation (ARLA-9), avec la PR ARLA-9 ;
- la spec de l'architecture cible (option C) et ses trois plans (socle, modules, asynchrone), avec la PR de la refacto.

Restent à écrire :

- l'ADR-001, qui acte le choix de l'option C ;
- le schéma cible en Excalidraw, dans le style de `as-is.excalidraw` ;
- la colonne « Après » du benchmark et le bilan de l'audit après refacto.

## Conventions

- **Constats.** Ils sont numérotés F1 à F46 dans `AUDIT.md`. Leur statut dit
  comment ils ont été établis : « Confirmé » (reproduit sur l'application en
  marche), « Code » (lecture du code) ou « Test » (reproduit par un test ARLA-9).
- **Tests `[as-is]`.** Dans la suite ARLA-9, ils figent un défaut connu. Quand
  ils citent « audit §n », il s'agit du point d'attention n de `as-is.md`.
- **Mises à jour.** Un document décrit l'état d'un commit donné. Quand l'état
  change, on ajoute un document ou une section datée, plutôt que de réécrire
  l'existant ; on met ensuite à jour [Où en est-on](#où-en-est-on).
