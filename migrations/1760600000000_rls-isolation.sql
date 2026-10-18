-- Up Migration

-- 1. Rôle applicatif, soumis à la RLS (F2). Rôle de cluster : créé une fois,
--    partagé par les bases de dev, de test et d'E2E. Mot de passe de dev ;
--    en production, le changer avec ALTER ROLE.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'expense_app') THEN
    CREATE ROLE expense_app LOGIN PASSWORD 'expense_app'
      NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
  END IF;
END $$;

-- 2. Portée de la transaction, posée par l'application (src/lib/db.ts).
CREATE SCHEMA app;

CREATE FUNCTION app.current_user_id() RETURNS uuid
  LANGUAGE sql STABLE AS
  $$ SELECT nullif(current_setting('app.current_user_id', true), '')::uuid $$;

CREATE FUNCTION app.current_company_id() RETURNS uuid
  LANGUAGE sql STABLE AS
  $$ SELECT nullif(current_setting('app.current_company_id', true), '')::uuid $$;

-- 3. Lectures nécessaires avant toute portée : surface minimale, hors RLS.
CREATE FUNCTION app.actor(p_user_id uuid)
  RETURNS TABLE (id uuid, company_id uuid, role text, manager_id uuid)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS
  $$ SELECT u.id, u.company_id, u.role, u.manager_id FROM users u WHERE u.id = p_user_id $$;

CREATE FUNCTION app.credentials_for(p_email text)
  RETURNS TABLE (id uuid, email text, password_hash text, role text)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS
  $$ SELECT u.id, u.email, u.password_hash, u.role FROM users u WHERE u.email = p_email $$;

-- Inscription en une transaction (F11) : l'entreprise et l'utilisateur, ou rien.
CREATE FUNCTION app.sign_up(
  p_name text, p_email text, p_password_hash text, p_domain text, p_company_name text
)
  RETURNS TABLE (user_id uuid, role text)
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS
$$
#variable_conflict use_column
DECLARE
  v_company uuid;
  v_role text;
BEGIN
  INSERT INTO companies (name, email_domain) VALUES (p_company_name, p_domain)
  ON CONFLICT (email_domain) DO NOTHING
  RETURNING id INTO v_company;
  IF v_company IS NOT NULL THEN
    v_role := 'hr_admin';
  ELSE
    SELECT c.id INTO v_company FROM companies c WHERE c.email_domain = p_domain;
    v_role := 'employee';
  END IF;
  INSERT INTO users (name, email, password_hash, company_id, role)
  VALUES (p_name, p_email, p_password_hash, v_company, v_role)
  RETURNING id INTO user_id;
  role := v_role;
  RETURN NEXT;
END
$$;

REVOKE ALL ON FUNCTION app.actor(uuid), app.credentials_for(text),
  app.sign_up(text, text, text, text, text) FROM PUBLIC;
GRANT USAGE ON SCHEMA app TO expense_app;
GRANT EXECUTE ON FUNCTION app.current_user_id(), app.current_company_id(), app.actor(uuid),
  app.credentials_for(text), app.sign_up(text, text, text, text, text) TO expense_app;

-- 4. La note porte son entreprise : les policies n'ont plus à joindre users.
--    Seule exception documentée : ce remplissage ponctuel.
ALTER TABLE expense_notes ADD COLUMN company_id uuid REFERENCES companies(id);
UPDATE expense_notes en SET company_id = u.company_id FROM users u WHERE u.id = en.user_id;
DO $$
DECLARE orphans int;
BEGIN
  SELECT count(*) INTO orphans FROM expense_notes WHERE company_id IS NULL;
  IF orphans > 0 THEN
    RAISE EXCEPTION '% note(s) sans auteur : impossible de déduire leur entreprise', orphans;
  END IF;
END $$;
ALTER TABLE expense_notes ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE expense_notes ALTER COLUMN company_id SET DEFAULT app.current_company_id();

-- 5. Policies : isolation entre entreprises seulement (ADR 0002). Les droits
--    fins (qui valide quoi) sont dans ApprovalPolicy, pas ici.
DROP POLICY expense_notes_owner_select ON expense_notes;
DROP POLICY expense_notes_owner_insert ON expense_notes;
DROP POLICY expense_notes_manager_select ON expense_notes;
DROP POLICY expense_notes_manager_update ON expense_notes;
DROP POLICY expense_notes_hr_root_manager_select ON expense_notes;
DROP POLICY expense_notes_hr_root_manager_update ON expense_notes;

CREATE POLICY expense_notes_company_select ON expense_notes
  FOR SELECT USING (company_id = app.current_company_id());
CREATE POLICY expense_notes_company_update ON expense_notes
  FOR UPDATE USING (company_id = app.current_company_id())
  WITH CHECK (company_id = app.current_company_id());
CREATE POLICY expense_notes_author_insert ON expense_notes
  FOR INSERT WITH CHECK (user_id = app.current_user_id() AND company_id = app.current_company_id());

-- Pas de FORCE sur users et companies : les fonctions SECURITY DEFINER, dont
-- le propriétaire est le rôle des migrations, doivent pouvoir les lire.
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
CREATE POLICY users_company_select ON users
  FOR SELECT USING (company_id = app.current_company_id());
CREATE POLICY users_company_update ON users
  FOR UPDATE USING (company_id = app.current_company_id())
  WITH CHECK (company_id = app.current_company_id());

ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
CREATE POLICY companies_own_select ON companies
  FOR SELECT USING (id = app.current_company_id());

-- 6. Droits du rôle applicatif.
GRANT USAGE ON SCHEMA public TO expense_app;
GRANT SELECT, INSERT, UPDATE ON expense_notes TO expense_app;
GRANT USAGE, SELECT ON SEQUENCE expense_notes_receipt_seq_seq TO expense_app;
GRANT SELECT ON users, companies TO expense_app;
GRANT UPDATE (manager_id) ON users TO expense_app;

-- Down Migration
REVOKE ALL ON expense_notes, users, companies FROM expense_app;
REVOKE ALL ON SEQUENCE expense_notes_receipt_seq_seq FROM expense_app;
DROP POLICY companies_own_select ON companies;
ALTER TABLE companies DISABLE ROW LEVEL SECURITY;
DROP POLICY users_company_update ON users;
DROP POLICY users_company_select ON users;
ALTER TABLE users DISABLE ROW LEVEL SECURITY;
DROP POLICY expense_notes_author_insert ON expense_notes;
DROP POLICY expense_notes_company_update ON expense_notes;
DROP POLICY expense_notes_company_select ON expense_notes;
ALTER TABLE expense_notes DROP COLUMN company_id;
DROP SCHEMA app CASCADE;
CREATE POLICY expense_notes_owner_select ON expense_notes FOR SELECT
  USING (user_id = nullif(current_setting('app.current_user_id', true), '')::uuid);
CREATE POLICY expense_notes_owner_insert ON expense_notes FOR INSERT
  WITH CHECK (user_id = nullif(current_setting('app.current_user_id', true), '')::uuid);
