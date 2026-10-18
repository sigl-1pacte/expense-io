# 0004 — Contrat d'API figé et erreurs RFC 9457

| | |
|---|---|
| **Statut** | Acceptée |
| **Date** | 2026-10-16 |
| **Décideur(s)** | Louis Bertrand |
| **Origine** | [spec architecture cible](../specs/2026-10-15-architecture-cible.md), section « Contrat d'API » |

## Contexte

La consigne interdit de casser l'API. Les erreurs actuelles sont incohérentes (401/403), exposent la stack (F26) et transforment des entrées invalides en 500 (F42).

## Options envisagées

1. **Ne rien toucher aux erreurs** — ➖ laisse F26, F27, F42.
2. **Passer à RFC 9457 en remplaçant `{ error }`** — ➖ casse les clients qui lisent `error`.
3. **RFC 9457 additif** : on garde `error` et on ajoute `type`, `title`, `status`, `detail`, en `application/problem+json`.

## Décision

Nous choisissons **3**. `docs/api/openapi.yaml` est la référence ; `oasdiff breaking` le compare à `main` en CI ; chaque écart volontaire (codes d'erreur corrigés) y est documenté. Les réponses en succès ne changent jamais.

## Conséquences

- **Positives :** clients existants intacts ; erreurs typées et traduites à un seul endroit (`src/shared/http.ts`).
- **Négatives :** le champ `error` est redondant avec `detail`, tant qu'un client l'utilise.
- **Suivi :** retirer `error` dans une version majeure, une fois les clients migrés vers `detail`.
