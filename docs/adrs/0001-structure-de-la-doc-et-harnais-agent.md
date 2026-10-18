# 0001 — Structure de la doc et harnais agent

| | |
|---|---|
| **Statut** | Acceptée |
| **Date** | 2026-10-16 |
| **Décideur(s)** | Louis Bertrand |
| **Origine** | [spec architecture cible](../specs/2026-10-15-architecture-cible.md), section « Prêt pour les agents » |

## Contexte

La refacto est codée par des agents, et la soutenance comprend l'ajout d'une fonctionnalité en un prompt devant le jury. Les agents doivent savoir où va le nouveau code, comment le vérifier et comment le documenter. Le workflow *superpowers* écrit par défaut dans `docs/superpowers/`, et chaque outil (Claude Code, Codex, Cursor, OpenCode) lit ses instructions à un endroit différent.

## Options envisagées

1. **Tout dans les emplacements de Claude Code** (`CLAUDE.md`, `.claude/skills/`) — ➕ simple ; ➖ invisible aux autres agents.
2. **Dupliquer à la main** dans chaque emplacement — ➕ marche partout ; ➖ les copies divergent.
3. **Standards ouverts comme source unique** : `AGENTS.md` (importé par `CLAUDE.md`), skills au format Agent Skills dans `.agents/skills/`, **copiés** vers `.claude/skills/` par `npm run agents:sync`, avec une vérification en CI ; `docs/` rangé par type (specs, plans, adrs, runbooks), chacun avec README et gabarit.

## Décision

Nous choisissons **l'option 3**. On copie au lieu de créer des liens symboliques (comme le fait cnp-dev) parce que le dépôt est cloné sous Windows avec `core.symlinks=false`, où un lien devient un simple fichier texte.

## Conséquences

- **Positives :** tous les agents lisent les mêmes instructions ; chaque document a une place et un gabarit.
- **Négatives :** penser à `npm run agents:sync` après toute modification d'un skill (la CI le rappelle).
- **Suivi :** quand Claude Code lira `.agents/skills/` nativement, supprimer les copies et remplacer cette ADR.
