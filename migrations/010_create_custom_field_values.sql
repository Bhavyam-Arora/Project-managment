CREATE TABLE IF NOT EXISTS custom_field_values (
  id           UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_id     UUID    NOT NULL REFERENCES issues(id)                   ON DELETE CASCADE,
  field_id     UUID    NOT NULL REFERENCES custom_field_definitions(id) ON DELETE CASCADE,
  value_text   TEXT,
  value_number NUMERIC,
  value_date   DATE,
  value_option VARCHAR(100),
  UNIQUE (issue_id, field_id)
);

CREATE INDEX IF NOT EXISTS idx_custom_values_issue ON custom_field_values(issue_id);
