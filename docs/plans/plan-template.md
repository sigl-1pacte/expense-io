# Titre — plan d'implémentation

> **Pour les agents :** SOUS-SKILL REQUIS : `superpowers:subagent-driven-development` (recommandé) ou `superpowers:executing-plans`. Étapes en cases à cocher (`- [ ]`).

| | |
|---|---|
| **Statut** | Brouillon \| Approuvé \| En cours \| Terminé \| Abandonné |
| **Spec** | [YYYY-MM-DD-...](../specs/YYYY-MM-DD-...md) |
| **Auteur(s)** | |
| **Créé** | YYYY-MM-DD |

**Objectif :** une phrase.

**Architecture :** deux ou trois phrases.

**Stack :** technologies clés.

## Contraintes globales

Copiées telles quelles de la spec.

## Points de vigilance (review focus)

Cas limites que la spec implique mais qu'aucune tâche ne teste naturellement ; chacun reçoit un test dans la tâche qui possède le code.

## Structure des fichiers

| Fichier | Action | Responsabilité |
|---|---|---|

---

### Tâche 1 : <composant>

**Fichiers :**
- Créer : `chemin/exact`
- Modifier : `chemin/exact:lignes`
- Tester : `tests/chemin/exact`

**Interfaces :**
- Consomme : ce que la tâche utilise des précédentes (signatures exactes).
- Produit : ce que les suivantes utiliseront.

- [ ] **Étape 1 : écrire le test qui échoue**

```ts
// code du test
```

- [ ] **Étape 2 : lancer le test, vérifier qu'il échoue**

Run : `npx vitest run chemin/du/test`
Attendu : FAIL avec « … »

- [ ] **Étape 3 : implémentation minimale**

```ts
// code
```

- [ ] **Étape 4 : lancer le test, vérifier qu'il passe**

- [ ] **Étape 5 : commit**

```bash
git add <fichiers>
git commit -m "feat(<portée>): …"
```
