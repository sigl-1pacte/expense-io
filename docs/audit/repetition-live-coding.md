# Répétition du live coding — 2026-10-20

| | |
|---|---|
| Demande | « un validateur peut indiquer un motif quand il rejette une note ; l'employé le voit dans sa liste et dans l'e-mail » |
| Outil et modèle | Claude Code, sous-agent, Claude Opus 5.5 |
| Durée jusqu'à `npm run verify` vert | environ 12 min (12:21 → 12:33 ; 725 s pour l'agent) |
| Interventions humaines | 0 |
| Constats de `revue-architecture` | 0 bloquant, 2 à corriger (1 corrigé, 1 refusé avec justification), 4 remarques |

Résultat : `npm run verify` vert (643 tests), E2E 38/38. Le critère de succès 7 de la spec est tenu. La fonctionnalité a été jetée : seuls ce compte rendu et les corrections du harnais sont commités.

Conditions : clone isolé avec ses propres bases et son propre bucket, dépendances déjà installées. La durée n'inclut donc pas `npm install`.

## Écarts à la recette

- **Branche** : la session était sur une branche qui ne suit pas le format `<prénom>/…` de `CONTRIBUTING.md` ; l'agent a commité dessus sans en créer.
- **GRANT** : le skill dit « penser au `GRANT` » ; la table `expense_notes` étant accordée en entier, aucun n'était nécessaire. L'agent a dû le vérifier dans la migration RLS.
- **Corps facultatif sur une route qui l'ignorait** : le skill ne dit rien. Le test existant « ignore le corps de la requête » fige le comportement ; `revue-architecture` a recommandé le contraire (400), l'agent a refusé et ajouté un test qui documente l'existant.
- **Base de dev** : aucun skill ne dit de lancer `npm run migrate:up` après une migration ; les tests migrent leur propre base, pas celle de la démo.
- **DTO** : les tests comparent les DTO avec un `toEqual` exact ; le champ ajouté devait être absent, pas `null`. Le skill ne le dit pas.
- **Fins de ligne** : des modifications faites sous Windows ont converti des fichiers LF en CRLF. Aucun garde-fou (pas de `.gitattributes`).
- **Helper Mailpit** : il n'exposait que l'objet des messages ; il a fallu ajouter `mailText(id)` pour vérifier le corps.
- **Lint** : un avertissement préexistant (`bench/k6/endpoints.js`) apparaissait à chaque `verify`.
- **TDD** : le test d'intégration du corps illisible était vert d'emblée (il fige un existant) ; l'E2E a été écrit après l'UI.

## Corrections apportées au harnais

- `.agents/skills/ajouter-une-fonctionnalite/SKILL.md` :
  - `npm run migrate:up` après une migration, pour la base de dev ;
  - champ optionnel de DTO de réponse : absent quand il est vide, jamais `null` ;
  - corps facultatif sur une route qui l'ignorait : le contrat et les tests d'intégration existants priment ; un corps illisible garde l'ancien comportement ;
  - GRANT : inutile pour une colonne de `expense_notes` (table accordée en entier), par colonne sur `users`.
- `.agents/skills/revue-architecture/SKILL.md` : chercher un test existant qui fige le comportement d'une route avant de recommander de le changer (question de contrat, pas « à corriger ») ; contrôle 6 aligné sur la nuance du GRANT.
- `.agents/skills/envoyer-un-email/SKILL.md` et `tests/support/mailpit.ts` : helper `mailText(id)` (corps texte via l'API Mailpit), cité à l'étape de test.
- `.gitattributes` (`* text=auto eol=lf`, motifs binaires pour images et PDF) ; `git add --renormalize .` n'a modifié aucun fichier existant.
- `bench/k6/endpoints.js` : fonction par défaut nommée, ce qui supprime l'avertissement `import/no-anonymous-default-export`.
- Copies `.claude/skills/` resynchronisées (`npm run agents:sync`).

Ces corrections sont dans le commit qui ajoute ce document.

## Artefacts du montage de la répétition

Ces deux constats ne sont pas des défauts du harnais et n'ont pas été corrigés.

- **« AGENTS.md périmé »** : l'agent a hérité d'une copie d'`AGENTS.md` chargée avant la tâche 6, qui présentait le mail et le worker comme « pas encore ». Le fichier à `HEAD` est à jour.
- **`revue-architecture` démarre dans la copie principale du dépôt**, pas dans le clone de répétition : conséquence du clone, pas de la définition du sous-agent.
