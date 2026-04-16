const pool = require('../db/pool');
const { encode, decode } = require('../utils/cursor');

async function createComment(client, { issue_id, author_id, parent_id, body }) {
  const { rows: [comment] } = await client.query(
    `INSERT INTO comments (issue_id, author_id, parent_id, body)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [issue_id, author_id, parent_id || null, body]
  );
  return comment;
}

async function findByIssue(issue_id, cursor = null, limit = 20) {
  const conditions = ['c.issue_id = $1', 'c.is_deleted = FALSE'];
  const values = [issue_id];
  let idx = 2;

  if (cursor) {
    const { created_at, id } = decode(cursor);
    conditions.push(`(c.created_at, c.id) > ($${idx++}, $${idx++})`);
    values.push(created_at, id);
  }

  values.push(limit + 1);
  const { rows } = await pool.query(
    `SELECT c.*, u.display_name AS author_name, u.email AS author_email
     FROM comments c
     JOIN users u ON u.id = c.author_id
     WHERE ${conditions.join(' AND ')}
     ORDER BY c.created_at ASC
     LIMIT $${idx}`,
    values
  );

  const hasMore = rows.length > limit;
  const results = hasMore ? rows.slice(0, limit) : rows;
  const last = results[results.length - 1];
  const next_cursor = hasMore && last ? encode({ created_at: last.created_at, id: last.id }) : null;
  return { results, next_cursor };
}

async function findById(id) {
  const { rows: [comment] } = await pool.query(
    'SELECT * FROM comments WHERE id = $1',
    [id]
  );
  return comment;
}

async function updateComment(id, author_id, body) {
  const { rows: [comment] } = await pool.query(
    `UPDATE comments SET body = $1, updated_at = NOW()
     WHERE id = $2 AND author_id = $3
     RETURNING *`,
    [body, id, author_id]
  );
  return comment;
}

async function softDelete(id, author_id) {
  const { rows: [comment] } = await pool.query(
    `UPDATE comments SET is_deleted = TRUE, updated_at = NOW()
     WHERE id = $1 AND author_id = $2
     RETURNING *`,
    [id, author_id]
  );
  return comment;
}

async function addMention(client, comment_id, user_id) {
  await client.query(
    `INSERT INTO comment_mentions (comment_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [comment_id, user_id]
  );
}

module.exports = { createComment, findByIssue, findById, updateComment, softDelete, addMention };
