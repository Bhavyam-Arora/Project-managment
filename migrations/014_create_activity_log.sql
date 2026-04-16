CREATE TABLE IF NOT EXISTS activity_log (
  id         UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID         NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  issue_id   UUID                  REFERENCES issues(id)   ON DELETE SET NULL,
  actor_id   UUID         NOT NULL REFERENCES users(id),
  action     VARCHAR(100) NOT NULL,
  old_value  JSONB,
  new_value  JSONB,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activity_project ON activity_log(project_id);
CREATE INDEX IF NOT EXISTS idx_activity_issue   ON activity_log(issue_id);
CREATE INDEX IF NOT EXISTS idx_activity_created ON activity_log(created_at DESC);
