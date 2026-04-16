CREATE TABLE IF NOT EXISTS custom_field_definitions (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID         NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name        VARCHAR(100) NOT NULL,
  field_type  VARCHAR(20)  NOT NULL
              CHECK (field_type IN ('text', 'number', 'dropdown', 'date')),
  options     JSONB,
  is_required BOOLEAN      NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, name)
);

CREATE INDEX IF NOT EXISTS idx_custom_field_defs_project ON custom_field_definitions(project_id);
