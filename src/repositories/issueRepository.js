const pool = require('../db/pool');
const { encode, decode } = require('../utils/cursor');

async function createIssue(client, data) {
  const {
    issue_key, project_id, sprint_id, parent_id, type, title,
    description, status_id, priority, assignee_id, reporter_id, story_points,
  } = data;
  const { rows: [issue] } = await client.query(
    `INSERT INTO issues
       (issue_key, project_id, sprint_id, parent_id, type, title, description,
        status_id, priority, assignee_id, reporter_id, story_points)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     RETURNING *`,
    [issue_key, project_id, sprint_id || null, parent_id || null, type, title,
     description || null, status_id, priority || 'medium', assignee_id || null,
     reporter_id, story_points || null]
  );
  return issue;
}

async function findById(id) {
  const { rows: [issue] } = await pool.query(
    `SELECT i.*,
            s.name AS status_name, s.category AS status_category,
            u1.display_name AS assignee_name,
            u2.display_name AS reporter_name
     FROM issues i
     JOIN statuses s ON s.id = i.status_id
     LEFT JOIN users u1 ON u1.id = i.assignee_id
     JOIN users u2 ON u2.id = i.reporter_id
     WHERE i.id = $1`,
    [id]
  );
  return issue;
}

async function findByProject(projectId, filters = {}, cursor = null, limit = 20) {
  const conditions = ['i.project_id = $1'];
  const values = [projectId];
  let idx = 2;

  for (const [key, val] of Object.entries(filters)) {
    if (val !== undefined && val !== null) {
      conditions.push(`i.${key} = $${idx++}`);
      values.push(val);
    }
  }

  if (cursor) {
    const { created_at, id } = decode(cursor);
    conditions.push(`(i.created_at, i.id) < ($${idx++}, $${idx++})`);
    values.push(created_at, id);
  }

  values.push(limit + 1);
  const { rows } = await pool.query(
    `SELECT i.*, s.name AS status_name, s.category AS status_category,
            u1.display_name AS assignee_name, u2.display_name AS reporter_name
     FROM issues i
     JOIN statuses s ON s.id = i.status_id
     LEFT JOIN users u1 ON u1.id = i.assignee_id
     JOIN users u2 ON u2.id = i.reporter_id
     WHERE ${conditions.join(' AND ')}
     ORDER BY i.created_at DESC, i.id DESC
     LIMIT $${idx}`,
    values
  );

  const hasMore = rows.length > limit;
  const results = hasMore ? rows.slice(0, limit) : rows;
  const last = results[results.length - 1];
  const next_cursor = hasMore && last ? encode({ created_at: last.created_at, id: last.id }) : null;
  return { results, next_cursor };
}

async function updateIssue(client, id, version, fields) {
  const keys = Object.keys(fields);
  if (keys.length === 0) return findById(id);
  const setClause = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');
  const values = [...keys.map(k => fields[k]), id, version];
  const { rows: [issue] } = await client.query(
    `UPDATE issues SET ${setClause}, version = version + 1, updated_at = NOW()
     WHERE id = $${keys.length + 1} AND version = $${keys.length + 2}
     RETURNING *`,
    values
  );
  return issue || null;
}

async function getBoardByProject(projectId) {
  const { rows: statuses } = await pool.query(
    'SELECT * FROM statuses WHERE project_id = $1 ORDER BY position ASC',
    [projectId]
  );
  const { rows: issues } = await pool.query(
    `SELECT i.*, u1.display_name AS assignee_name, u2.display_name AS reporter_name
     FROM issues i
     LEFT JOIN users u1 ON u1.id = i.assignee_id
     JOIN users u2 ON u2.id = i.reporter_id
     WHERE i.project_id = $1
     ORDER BY i.created_at ASC`,
    [projectId]
  );

  return statuses.map(s => ({
    ...s,
    issues: issues.filter(i => i.status_id === s.id),
  }));
}

async function addLabel(client, issue_id, label) {
  await client.query(
    'INSERT INTO issue_labels (issue_id, label) VALUES ($1, $2) ON CONFLICT DO NOTHING',
    [issue_id, label]
  );
}

async function removeLabel(issue_id, label) {
  await pool.query('DELETE FROM issue_labels WHERE issue_id = $1 AND label = $2', [issue_id, label]);
}

async function getLabels(issue_id) {
  const { rows } = await pool.query('SELECT label FROM issue_labels WHERE issue_id = $1', [issue_id]);
  return rows.map(r => r.label);
}

async function getWatchers(issue_id) {
  const { rows } = await pool.query('SELECT user_id FROM watchers WHERE issue_id = $1', [issue_id]);
  return rows.map(r => r.user_id);
}

async function addWatcher(client, issue_id, user_id) {
  const db = client || pool;
  await db.query(
    'INSERT INTO watchers (issue_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
    [issue_id, user_id]
  );
}

async function removeWatcher(issue_id, user_id) {
  await pool.query('DELETE FROM watchers WHERE issue_id = $1 AND user_id = $2', [issue_id, user_id]);
}

async function deleteIssue(id) {
  await pool.query('DELETE FROM issues WHERE id = $1', [id]);
}

module.exports = {
  createIssue, findById, findByProject, updateIssue,
  getBoardByProject, addLabel, removeLabel, getLabels,
  getWatchers, addWatcher, removeWatcher, deleteIssue,
};
