CREATE TABLE IF NOT EXISTS issues (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_key     VARCHAR(20)  UNIQUE NOT NULL,
  project_id    UUID         NOT NULL REFERENCES projects(id)  ON DELETE CASCADE,
  sprint_id     UUID                  REFERENCES sprints(id)   ON DELETE SET NULL,
  parent_id     UUID                  REFERENCES issues(id)    ON DELETE SET NULL,
  type          VARCHAR(20)  NOT NULL
                CHECK (type IN ('epic', 'story', 'task', 'bug', 'subtask')),
  title         VARCHAR(500) NOT NULL,
  description   TEXT,
  status_id     UUID         NOT NULL REFERENCES statuses(id),
  priority      VARCHAR(20)  NOT NULL DEFAULT 'medium'
                CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  assignee_id   UUID                  REFERENCES users(id) ON DELETE SET NULL,
  reporter_id   UUID         NOT NULL REFERENCES users(id),
  story_points  INTEGER,
  version       INTEGER      NOT NULL DEFAULT 1,
  search_vector TSVECTOR GENERATED ALWAYS AS (
    to_tsvector('english',
      coalesce(title, '') || ' ' || coalesce(description, ''))
  ) STORED,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_issues_project   ON issues(project_id);
CREATE INDEX IF NOT EXISTS idx_issues_sprint    ON issues(sprint_id);
CREATE INDEX IF NOT EXISTS idx_issues_status    ON issues(status_id);
CREATE INDEX IF NOT EXISTS idx_issues_assignee  ON issues(assignee_id);
CREATE INDEX IF NOT EXISTS idx_issues_parent    ON issues(parent_id);
CREATE INDEX IF NOT EXISTS idx_issues_type      ON issues(type);
CREATE INDEX IF NOT EXISTS idx_issues_created   ON issues(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_issues_search    ON issues USING GIN(search_vector);
