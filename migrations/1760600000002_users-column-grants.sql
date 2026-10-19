-- Up Migration
-- expense_app ne lit jamais password_hash : la vérification des identifiants
-- passe par app.credentials_for (SECURITY DEFINER). SELECT par colonnes.
REVOKE SELECT ON users FROM expense_app;
GRANT SELECT (id, company_id, name, email, role, manager_id, created_at) ON users TO expense_app;

-- Down Migration
GRANT SELECT ON users TO expense_app;
