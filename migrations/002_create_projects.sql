CREATE TABLE IF NOT EXISTS projects (
  id                   UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  key                  VARCHAR(10)  UNIQUE NOT NULL,
  name                 VARCHAR(255) NOT NULL,
  description          TEXT,
  owner_id             UUID         NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  issue_counter        INTEGER      NOT NULL DEFAULT 0,
  sprint_duration_days INTEGER      NOT NULL DEFAULT 14,
  created_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_projects_owner ON projects(owner_id);
