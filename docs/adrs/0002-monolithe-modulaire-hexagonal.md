# 0002 — Monolithe modulaire hexagonal (option C)

| | |
|---|---|
| **Statut** | Acceptée |
| **Date** | 2026-10-16 |
| **Décideur(s)** | Louis Bertrand, équipe |
| **Origine** | [spec architecture cible](../specs/2026-10-15-architecture-cible.md) ; étude [`options-refacto.md`](../architecture/options-refacto.md) |

## Contexte

L'application est un monolithe Next.js où les routes portent le SQL et les règles d'accès, recopiées sept fois ; la couche hexagonale existe mais n'est pas branchée (F22). La refacto doit couvrir trois axes (Architecture, Contrat d'API, Asynchrone & run) sans casser l'API.

## Options envisagées

1. **A — monolithe en couches nettoyé** — ➕ léger ; ➖ ne montre aucune notion du cours, laisse l'axe asynchrone vide.
2. **B — monolithe modulaire, hexagonal par module** — ➕ frontières nettes, métier testable ; ➖ pas d'asynchrone.
3. **C — B plus un flux asynchrone** — ➕ couvre les trois axes ; ➖ un process de plus.
4. **D — microservices** — ➖ aucune contrainte de charge ne le justifie ; transactions distribuées.

## Décision

Nous choisissons **C**. Deux modules, `expenses` et `iam`, chacun en `domain` / `application` (un fichier par use case) / `ports` / `infrastructure`, plus `src/shared/`. Un module ne voit l'autre que par son `index.ts` ; ces règles sont vérifiées par `dependency-cruiser`. **`ApprovalPolicy` (module `iam`) fait seule foi** pour savoir qui valide quoi : manager direct, sinon les RH de l'entreprise, jamais sa propre note. La RLS n'assure que l'isolation entre entreprises.

## Conséquences

- **Positives :** une règle métier écrite une fois ; recette fixe pour ajouter une fonctionnalité.
- **Négatives :** plus de fichiers ; un RH seul dans son entreprise peut soumettre une note mais n'a aucun validateur tant qu'un second RH n'existe pas (limite assumée, consigne « tout le monde peut créer une note »).
- **Suivi :** un futur module (facturation) va dans `src/modules/billing`, avec un port `PaymentProvider`.
