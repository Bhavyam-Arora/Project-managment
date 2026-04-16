CREATE TABLE IF NOT EXISTS issue_labels (
  issue_id UUID         NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  label    VARCHAR(100) NOT NULL,
  PRIMARY KEY (issue_id, label)
);
