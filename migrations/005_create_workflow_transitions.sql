CREATE TABLE IF NOT EXISTS workflow_transitions (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id       UUID        NOT NULL REFERENCES projects(id)  ON DELETE CASCADE,
  from_status_id   UUID        NOT NULL REFERENCES statuses(id)  ON DELETE CASCADE,
  to_status_id     UUID        NOT NULL REFERENCES statuses(id)  ON DELETE CASCADE,
  validation_rules JSONB       NOT NULL DEFAULT '[]',
  auto_actions     JSONB       NOT NULL DEFAULT '[]',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, from_status_id, to_status_id)
);

CREATE INDEX IF NOT EXISTS idx_transitions_project     ON workflow_transitions(project_id);
CREATE INDEX IF NOT EXISTS idx_transitions_from        ON workflow_transitions(from_status_id);
CREATE INDEX IF NOT EXISTS idx_transitions_project_from ON workflow_transitions(project_id, from_status_id);
