const pool = require('../db/pool');
const { encode, decode } = require('../utils/cursor');
const { getIO } = require('../sockets');

async function create({ user_id, type, reference_id, reference_type, message }) {
  const { rows: [row] } = await pool.query(
    `INSERT INTO notifications (user_id, type, reference_id, reference_type, message)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [user_id, type, reference_id, reference_type, message]
  );
  const io = getIO();
  if (io) io.to(`user:${user_id}`).emit('new_notification', { notification: row });
  return row;
}

async function createMany(notifications) {
  for (const n of notifications) {
    await create(n);
  }
}

async function getForUser(user_id, filters = {}, cursor = null, limit = 20) {
  const conditions = ['user_id = $1'];
  const values = [user_id];
  let idx = 2;

  if (filters.is_read !== undefined) {
    conditions.push(`is_read = $${idx++}`);
    values.push(filters.is_read);
  }

  if (cursor) {
    const { created_at, id } = decode(cursor);
    conditions.push(`(created_at, id) < ($${idx++}, $${idx++})`);
    values.push(created_at, id);
  }

  values.push(limit + 1);
  const { rows } = await pool.query(
    `SELECT * FROM notifications
     WHERE ${conditions.join(' AND ')}
     ORDER BY created_at DESC
     LIMIT $${idx}`,
    values
  );

  const hasMore = rows.length > limit;
  const results = hasMore ? rows.slice(0, limit) : rows;
  const last = results[results.length - 1];
  const next_cursor = hasMore && last ? encode({ created_at: last.created_at, id: last.id }) : null;
  return { results, next_cursor };
}

async function markRead(id, user_id) {
  const { rows: [row] } = await pool.query(
    'UPDATE notifications SET is_read = TRUE WHERE id = $1 AND user_id = $2 RETURNING *',
    [id, user_id]
  );
  return row;
}

async function markAllRead(user_id) {
  const { rowCount } = await pool.query(
    'UPDATE notifications SET is_read = TRUE WHERE user_id = $1 AND is_read = FALSE',
    [user_id]
  );
  return rowCount;
}

module.exports = { create, createMany, getForUser, markRead, markAllRead };
