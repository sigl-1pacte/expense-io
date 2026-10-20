-- Up Migration
-- Outbox d'e-mails (ADR 0003) : écrite par l'application dans la transaction
-- de la décision, vidée par le worker de livraison.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'expense_mailer') THEN
    CREATE ROLE expense_mailer LOGIN PASSWORD 'expense_mailer'
      NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
  END IF;
END $$;

CREATE TABLE mail_outbox (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient       text NOT NULL,
  subject         text NOT NULL,
  body_text       text NOT NULL,
  correlation_id  text,
  status          text NOT NULL DEFAULT 'pending'
                  CONSTRAINT mail_outbox_status_check CHECK (status IN ('pending', 'sent', 'dead')),
  attempts        int NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_error      text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  sent_at         timestamptz
);
CREATE INDEX mail_outbox_pending_idx ON mail_outbox (next_attempt_at) WHERE status = 'pending';

GRANT INSERT ON mail_outbox TO expense_app;
GRANT USAGE ON SCHEMA public TO expense_mailer;
GRANT SELECT, UPDATE, DELETE ON mail_outbox TO expense_mailer;

-- Down Migration
DROP TABLE mail_outbox;
