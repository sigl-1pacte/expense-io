# Specs

Une spec répond à « que construit-on, et pourquoi ? » pour une fonctionnalité ou un chantier. Elle est figée une fois implémentée.

- Nommage : `YYYY-MM-DD-<sujet>.md` (date de création, kebab-case).
- Toujours partir de [`spec-template.md`](spec-template.md).
- Statuts : `Brouillon` → `En revue` → `Acceptée` → `Implémentée` (ou `Abandonnée`, `Remplacée par …`).
- Une spec cite ses plans (champ *Plans*) et ses ADR (champ *ADR liées*).
- Une décision qui dépasse la fonctionnalité (transverse, coûteuse à défaire) est extraite en ADR dans `docs/adrs/`.
- Écrite par le skill `superpowers:brainstorming` : ici, jamais dans `docs/superpowers/`, sans suffixe `-design`.
