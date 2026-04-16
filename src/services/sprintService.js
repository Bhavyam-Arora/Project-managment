const pool = require('../db/pool');
const activityRepo = require('../repositories/activityRepository');
const { getIO } = require('../sockets');

async function createSprint(projectId, userId, data) {
  const { rows: [project] } = await pool.query(
    'SELECT sprint_duration_days FROM projects WHERE id = $1',
    [projectId]
  );

  const { rows: [{ max }] } = await pool.query(
    'SELECT MAX(sprint_number) FROM sprints WHERE project_id = $1',
    [projectId]
  );
  const sprint_number = (max || 0) + 1;

  let { start_date, end_date, name, goal } = data;

  if (!start_date) {
    const { rows: [lastSprint] } = await pool.query(
      `SELECT end_date FROM sprints
       WHERE project_id = $1 AND status = 'completed'
       ORDER BY sprint_number DESC LIMIT 1`,
      [projectId]
    );
    if (lastSprint && lastSprint.end_date) {
      // end_date is a "YYYY-MM-DD" string (pool.js type parser ensures this)
      const [y, m, d] = String(lastSprint.end_date).slice(0, 10).split('-').map(Number);
      start_date = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
    } else {
      start_date = new Date().toISOString().slice(0, 10);
    }
  }

  if (!end_date) {
    const [y, m, d] = start_date.split('-').map(Number);
    end_date = new Date(Date.UTC(y, m - 1, d + project.sprint_duration_days - 1)).toISOString().slice(0, 10);
  }

  const sprintName = name || `Sprint ${sprint_number}`;

  const { rows: [sprint] } = await pool.query(
    `INSERT INTO sprints (project_id, sprint_number, name, goal, start_date, end_date, status)
     VALUES ($1, $2, $3, $4, $5, $6, 'planning')
     RETURNING *`,
    [projectId, sprint_number, sprintName, goal || null, start_date, end_date]
  );
  return sprint;
}

async function startSprint(sprintId, projectId) {
  const { rows: [active] } = await pool.query(
    `SELECT id FROM sprints WHERE project_id = $1 AND status = 'active'`,
    [projectId]
  );
  if (active) {
    throw Object.assign(new Error('A sprint is already active'), { status: 422, code: 'SPRINT_ALREADY_ACTIVE' });
  }

  const { rows: [sprint] } = await pool.query(
    'SELECT * FROM sprints WHERE id = $1',
    [sprintId]
  );
  if (!sprint.start_date || !sprint.end_date) {
    throw Object.assign(new Error('Sprint missing dates'), { status: 422, code: 'MISSING_DATES' });
  }

  const { rows: [updated] } = await pool.query(
    `UPDATE sprints SET status = 'active', updated_at = NOW() WHERE id = $1 RETURNING *`,
    [sprintId]
  );
  const io = getIO();
  if (io) io.to(`project:${updated.project_id}`).emit('sprint_updated', { sprint: updated });
  return updated;
}

async function completeSprint(sprintId, actorId, carryOverIssueIds = []) {
  const { rows: [sprint] } = await pool.query(
    'SELECT * FROM sprints WHERE id = $1',
    [sprintId]
  );
  if (!sprint) throw Object.assign(new Error('Sprint not found'), { status: 404, code: 'NOT_FOUND' });

  const { rows: issues } = await pool.query(
    `SELECT i.*, s.category AS status_category
     FROM issues i
     JOIN statuses s ON s.id = i.status_id
     WHERE i.sprint_id = $1`,
    [sprintId]
  );

  const doneIssues = issues.filter(i => i.status_category === 'done');
  const incompleteIssues = issues.filter(i => i.status_category !== 'done');
  const velocity = doneIssues.reduce((sum, i) => sum + (i.story_points || 0), 0);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Move incomplete issues to backlog (sprint_id = null)
    for (const issue of incompleteIssues) {
      await client.query(
        'UPDATE issues SET sprint_id = NULL WHERE id = $1',
        [issue.id]
      );
      await activityRepo.log(client, {
        project_id: sprint.project_id,
        issue_id: issue.id,
        actor_id: actorId,
        action: 'issue_moved_to_backlog',
        old_value: { sprint_id: sprintId },
        new_value: { sprint_id: null },
      });
    }

    await client.query(
      `UPDATE sprints SET status = 'completed', velocity = $1, completed_at = NOW(), updated_at = NOW()
       WHERE id = $2`,
      [velocity, sprintId]
    );

    await client.query('COMMIT');

    const { rows: [finalSprint] } = await pool.query('SELECT * FROM sprints WHERE id = $1', [sprintId]);
    const io = getIO();
    if (io) io.to(`project:${sprint.project_id}`).emit('sprint_updated', { sprint: finalSprint });
    return { sprint: finalSprint, velocity, incomplete_issues: incompleteIssues };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { createSprint, startSprint, completeSprint };
