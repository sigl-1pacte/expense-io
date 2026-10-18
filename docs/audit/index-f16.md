# F16 — index des colonnes de filtre : mesure

Mesure faite sur une base jetable `scratch_f16` (créée, migrée jusqu'à `1760600000000_rls-isolation`, gonflée à 20 000 notes réparties sur 200 employés, puis supprimée), pour ne pas gonfler la base de dev `expense_io`. Plan d'exécution des requêtes de liste avant la migration `1760600000001_index.sql`, puis après (suivie d'un `ANALYZE`).

La mesure s'exécute avec le propriétaire `expense` ; `ALTER TABLE expense_notes NO FORCE ROW LEVEL SECURITY` a été appliqué sur la base jetable uniquement, pour que le jeu de données puisse être inséré hors session applicative. Les plans mesurés ne portent donc pas le coût des politiques RLS.

## Jeu de données

```sql
INSERT INTO users (company_id, name, email, password_hash, role, manager_id)
SELECT c.id, 'bench-' || g, 'bench-' || g || '@expense.io', 'x', 'employee',
       (SELECT id FROM users WHERE email = 'manager@expense.io')
FROM companies c, generate_series(1, 200) g WHERE c.email_domain = 'expense.io';

INSERT INTO expense_notes (user_id, company_id, amount, expense_date, description, receipt_key)
SELECT u.id, u.company_id, 10, CURRENT_DATE, 'bench', 'k'
FROM users u, generate_series(1, 100) WHERE u.email LIKE 'bench-%';
ANALYZE;
```

Préalable : une société `expense.io` et un manager `manager@expense.io`.

## Requêtes mesurées

```sql
EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM expense_notes WHERE user_id = (SELECT id FROM users WHERE email = 'bench-1@expense.io') ORDER BY created_at DESC;
EXPLAIN (ANALYZE, BUFFERS) SELECT en.* FROM expense_notes en JOIN users u ON u.id = en.user_id WHERE u.manager_id = (SELECT id FROM users WHERE email = 'manager@expense.io') AND en.status = 'pending';
EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM users WHERE company_id = (SELECT id FROM companies WHERE email_domain = 'expense.io');
```

## Résultats

| Requête | Avant (plan, temps) | Après (plan, temps) |
|---|---|---|
| 1. Notes d'un employé, tri par date | `Seq Scan` sur `expense_notes` (290 buffers), 1,447 ms | `Bitmap Index Scan` sur `expense_notes_user_created_idx`, 1,183 ms |
| 2. Notes `pending` des subordonnés d'un manager | `Hash Join` + `Seq Scan` sur `expense_notes`, 8,068 ms | inchangé (`Hash Join` + `Seq Scan`), 10,476 ms |
| 3. Utilisateurs d'une société | `Seq Scan` sur `users`, 0,032 ms | inchangé (`Seq Scan`), 0,045 ms |

## Lecture

- Requête 1 : l'index remplace le balayage complet de la table ; le gain absolu est faible à 20 000 lignes mais le coût du balayage croît avec la table, pas celui de l'index.
- Requêtes 2 et 3 : le jeu de données fait que le filtre ne sélectionne rien (toutes les notes sont `pending`, tous les employés ont le même manager, une seule société). Le planificateur a raison de garder un `Seq Scan` : un index n'aide que sur un filtre sélectif. Les écarts de temps relèvent du bruit de mesure. Ces index servent surtout aux déploiements multi-sociétés et aux listes filtrées sur une minorité de lignes ; la mesure ne le démontre pas sur ce jeu de données.
