# ADR — décisions d'architecture en vigueur

Une ADR consigne **une** décision qui dépasse une fonctionnalité : transverse, coûteuse à défaire, ou née hors d'une spec. Règle : *si l'auteur d'une future spec doit la connaître pour ne pas la contredire, c'est une ADR*.

- Nommage : `NNNN-<décision>.md`, numéro suivant.
- Toujours partir de [`adr-template.md`](adr-template.md).
- Une ADR acceptée n'est jamais réécrite : une nouvelle ADR la remplace, et l'ancienne passe en `Remplacée par NNNN`.

| ADR | Décision | Statut |
|---|---|---|
| [0001](0001-structure-de-la-doc-et-harnais-agent.md) | Structure de la doc et harnais agent | Acceptée |
| [0002](0002-monolithe-modulaire-hexagonal.md) | Monolithe modulaire hexagonal (option C) | Acceptée |
| [0003](0003-notification-par-outbox-d-e-mails.md) | Notification de décision par outbox d'e-mails | Acceptée |
| [0004](0004-contrat-d-api-et-erreurs-rfc-9457.md) | Contrat d'API figé et erreurs RFC 9457 | Acceptée |
