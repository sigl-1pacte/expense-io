-- Up Migration
-- Commentaire facultatif du validateur, saisi avec la décision.
-- Pas de GRANT : expense_notes est accordée en entier à expense_app.
ALTER TABLE expense_notes
  ADD COLUMN decision_comment text
  CONSTRAINT expense_notes_decision_comment_length CHECK (char_length(decision_comment) <= 500);

-- Down Migration
ALTER TABLE expense_notes DROP COLUMN decision_comment;
