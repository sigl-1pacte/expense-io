-- Up Migration
-- F16 : index sur les colonnes de filtre et de jointure des listes.
CREATE INDEX expense_notes_user_created_idx ON expense_notes (user_id, created_at);
CREATE INDEX expense_notes_company_status_idx ON expense_notes (company_id, status);
CREATE INDEX users_manager_idx ON users (manager_id);
CREATE INDEX users_company_idx ON users (company_id);

-- Down Migration
DROP INDEX users_company_idx;
DROP INDEX users_manager_idx;
DROP INDEX expense_notes_company_status_idx;
DROP INDEX expense_notes_user_created_idx;
