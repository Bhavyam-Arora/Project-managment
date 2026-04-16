const pool = require('../db/pool');
const { encode, decode } = require('../utils/cursor');

async function searchIssues({ q, project_id, status_id, assignee_id, priority, type, cursor, limit = 20 }) {
  const conditions = ['1=1'];
  const values = [];
  let idx = 1;

  if (q) {
    conditions.push(`i.search_vector @@ websearch_to_tsquery('english', $${idx++})`);
    values.push(q);
  }
  if (project_id) { conditions.push(`i.project_id = $${idx++}`);  values.push(project_id); }
  if (status_id)  { conditions.push(`i.status_id = $${idx++}`);   values.push(status_id); }
  if (assignee_id){ conditions.push(`i.assignee_id = $${idx++}`); values.push(assignee_id); }
  if (priority)   { conditions.push(`i.priority = $${idx++}`);    values.push(priority); }
  if (type)       { conditions.push(`i.type = $${idx++}`);        values.push(type); }

  if (cursor) {
    const { created_at, id } = decode(cursor);
    conditions.push(`(i.created_at, i.id) < ($${idx++}, $${idx++})`);
    values.push(created_at, id);
  }

  values.push(limit + 1);

  const rankExpr = q ? `ts_rank(i.search_vector, websearch_to_tsquery('english', $1))` : 'NULL';

  const { rows } = await pool.query(
    `SELECT i.*,
            ${rankExpr} AS rank,
            s.name AS status_name, s.category AS status_category,
            u1.display_name AS assignee_name,
            u2.display_name AS reporter_name
     FROM issues i
     JOIN statuses s ON s.id = i.status_id
     LEFT JOIN users u1 ON u1.id = i.assignee_id
     JOIN users u2 ON u2.id = i.reporter_id
     WHERE ${conditions.join(' AND ')}
     ORDER BY ${q ? 'rank DESC,' : ''} i.created_at DESC, i.id DESC
     LIMIT $${idx}`,
    values
  );

  const hasMore = rows.length > limit;
  const results = hasMore ? rows.slice(0, limit) : rows;
  const last = results[results.length - 1];
  const next_cursor = hasMore && last ? encode({ created_at: last.created_at, id: last.id }) : null;
  return { results, next_cursor };
}

module.exports = { searchIssues };
