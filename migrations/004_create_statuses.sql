CREATE TABLE IF NOT EXISTS statuses (
  id         UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID         NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name       VARCHAR(100) NOT NULL,
  category   VARCHAR(20)  NOT NULL
             CHECK (category IN ('todo', 'in_progress', 'done')),
  position   INTEGER      NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, name)
);

CREATE INDEX IF NOT EXISTS idx_statuses_project  ON statuses(project_id);
CREATE INDEX IF NOT EXISTS idx_statuses_position ON statuses(project_id, position);
