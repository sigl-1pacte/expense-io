# Plans d'implémentation

Un plan répond à « dans quel ordre, quels fichiers, quels tests ? » pour une spec. Il ne prend aucune décision de conception : si une question de conception surgit, on met à jour la spec.

- Nommage : même slug que la spec, `YYYY-MM-DD-<sujet>.md` ; suffixe `-n-<partie>` quand une spec a plusieurs plans.
- Toujours partir de [`plan-template.md`](plan-template.md).
- Statuts : `Brouillon` → `Approuvé` → `En cours` → `Terminé` (ou `Abandonné`).
- Écrit par le skill `superpowers:writing-plans` : ici, jamais dans `docs/superpowers/`. Exécuté avec `superpowers:subagent-driven-development` ou `superpowers:executing-plans`.
