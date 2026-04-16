CREATE TABLE IF NOT EXISTS watchers (
  issue_id   UUID        NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  user_id    UUID        NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (issue_id, user_id)
);
