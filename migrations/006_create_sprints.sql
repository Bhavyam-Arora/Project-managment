CREATE TABLE IF NOT EXISTS sprints (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    UUID         NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  sprint_number INTEGER      NOT NULL DEFAULT 1,
  name          VARCHAR(255) NOT NULL,
  goal          TEXT,
  start_date    DATE,
  end_date      DATE,
  status        VARCHAR(20)  NOT NULL DEFAULT 'planning'
                CHECK (status IN ('planning', 'active', 'completed')),
  velocity      INTEGER,
  completed_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, sprint_number)
);

CREATE INDEX IF NOT EXISTS idx_sprints_project ON sprints(project_id);
CREATE INDEX IF NOT EXISTS idx_sprints_status  ON sprints(status);
