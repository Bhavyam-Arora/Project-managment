CREATE TABLE IF NOT EXISTS comments (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_id   UUID        NOT NULL REFERENCES issues(id)   ON DELETE CASCADE,
  author_id  UUID        NOT NULL REFERENCES users(id)    ON DELETE RESTRICT,
  parent_id  UUID                 REFERENCES comments(id) ON DELETE SET NULL,
  body       TEXT        NOT NULL,
  is_deleted BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_comments_issue  ON comments(issue_id);
CREATE INDEX IF NOT EXISTS idx_comments_parent ON comments(parent_id);
