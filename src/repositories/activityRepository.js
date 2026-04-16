const pool = require('../db/pool');
const { encode, decode } = require('../utils/cursor');

async function log(client, { project_id, issue_id, actor_id, action, old_value, new_value }) {
  const { rows: [row] } = await client.query(
    `INSERT INTO activity_log (project_id, issue_id, actor_id, action, old_value, new_value)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [project_id, issue_id || null, actor_id, action,
     old_value ? JSON.stringify(old_value) : null,
     new_value ? JSON.stringify(new_value) : null]
  );
  return row;
}

async function getByProject(project_id, filters = {}, cursor = null, limit = 20) {
  const conditions = ['a.project_id = $1'];
  const values = [project_id];
  let idx = 2;

  if (filters.issue_id) { conditions.push(`a.issue_id = $${idx++}`); values.push(filters.issue_id); }
  if (filters.action)   { conditions.push(`a.action = $${idx++}`);   values.push(filters.action); }

  if (cursor) {
    const { created_at, id } = decode(cursor);
    conditions.push(`(a.created_at, a.id) < ($${idx++}, $${idx++})`);
    values.push(created_at, id);
  }

  values.push(limit + 1);
  const { rows } = await pool.query(
    `SELECT a.*, u.display_name AS actor_name, u.email AS actor_email
     FROM activity_log a
     JOIN users u ON u.id = a.actor_id
     WHERE ${conditions.join(' AND ')}
     ORDER BY a.created_at DESC
     LIMIT $${idx}`,
    values
  );

  const hasMore = rows.length > limit;
  const results = hasMore ? rows.slice(0, limit) : rows;
  const last = results[results.length - 1];
  const next_cursor = hasMore && last ? encode({ created_at: last.created_at, id: last.id }) : null;
  return { results, next_cursor };
}

async function getByIssue(issue_id, cursor = null, limit = 20) {
  const conditions = ['a.issue_id = $1'];
  const values = [issue_id];
  let idx = 2;

  if (cursor) {
    const { created_at, id } = decode(cursor);
    conditions.push(`(a.created_at, a.id) < ($${idx++}, $${idx++})`);
    values.push(created_at, id);
  }

  values.push(limit + 1);
  const { rows } = await pool.query(
    `SELECT a.*, u.display_name AS actor_name
     FROM activity_log a
     JOIN users u ON u.id = a.actor_id
     WHERE ${conditions.join(' AND ')}
     ORDER BY a.created_at DESC
     LIMIT $${idx}`,
    values
  );

  const hasMore = rows.length > limit;
  const results = hasMore ? rows.slice(0, limit) : rows;
  const last = results[results.length - 1];
  const next_cursor = hasMore && last ? encode({ created_at: last.created_at, id: last.id }) : null;
  return { results, next_cursor };
}

module.exports = { log, getByProject, getByIssue };
