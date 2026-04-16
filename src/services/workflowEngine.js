const pool = require('../db/pool');
const activityRepo = require('../repositories/activityRepository');
const notificationRepo = require('../repositories/notificationRepository');
const { getIO } = require('../sockets');

async function executeTransition(issueId, toStatusId, actorId) {
  // 1. Load issue
  const { rows: [issue] } = await pool.query(
    `SELECT i.*, s.category AS status_category
     FROM issues i
     JOIN statuses s ON s.id = i.status_id
     WHERE i.id = $1`,
    [issueId]
  );
  if (!issue) {
    const err = new Error('Issue not found'); err.status = 404; err.code = 'NOT_FOUND'; throw err;
  }

  // 2. Find transition
  const { rows: [transition] } = await pool.query(
    `SELECT * FROM workflow_transitions
     WHERE project_id = $1 AND from_status_id = $2 AND to_status_id = $3`,
    [issue.project_id, issue.status_id, toStatusId]
  );

  if (!transition) {
    const { rows: allowed } = await pool.query(
      `SELECT wt.to_status_id, s.name AS to_status_name
       FROM workflow_transitions wt
       JOIN statuses s ON s.id = wt.to_status_id
       WHERE wt.project_id = $1 AND wt.from_status_id = $2`,
      [issue.project_id, issue.status_id]
    );
    const err = new Error('Transition not allowed');
    err.status = 422;
    err.code = 'TRANSITION_NOT_ALLOWED';
    err.allowed_transitions = allowed;
    throw err;
  }

  // 3 & 4. Validate rules
  const errors = [];
  for (const rule of transition.validation_rules) {
    if (rule.type === 'required_field') {
      if (!issue[rule.field]) errors.push(rule.message);
    } else if (rule.type === 'min_value') {
      if (issue[rule.field] === null || issue[rule.field] === undefined || issue[rule.field] < rule.value) {
        errors.push(rule.message);
      }
    } else if (rule.type === 'field_equals') {
      if (issue[rule.field] !== rule.value) errors.push(rule.message);
    } else if (rule.type === 'no_open_subtasks') {
      const { rows: [{ count }] } = await pool.query(
        `SELECT COUNT(*) FROM issues i
         JOIN statuses s ON s.id = i.status_id
         WHERE i.parent_id = $1 AND s.category != 'done'`,
        [issueId]
      );
      if (parseInt(count) > 0) errors.push(rule.message);
    }
  }

  if (errors.length > 0) {
    const err = new Error('Validation failed');
    err.status = 422;
    err.code = 'VALIDATION_FAILED';
    err.validation_errors = errors;
    throw err;
  }

  // 6. BEGIN transaction
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 7. Update status with version check
    const { rows: [updated] } = await client.query(
      `UPDATE issues SET status_id = $1, version = version + 1, updated_at = NOW()
       WHERE id = $2 AND version = $3
       RETURNING *`,
      [toStatusId, issueId, issue.version]
    );

    if (!updated) {
      await client.query('ROLLBACK');
      const err = new Error('Version conflict'); err.status = 409; err.code = 'VERSION_CONFLICT'; throw err;
    }

    // 8. Auto actions
    for (const action of transition.auto_actions) {
      if (action.type === 'assign_field') {
        const resolvedValue = issue[action.value] !== undefined ? issue[action.value] : action.value;
        await client.query(
          `UPDATE issues SET ${action.field} = $1 WHERE id = $2`,
          [resolvedValue, issueId]
        );
      } else if (action.type === 'set_value') {
        await client.query(
          `UPDATE issues SET ${action.field} = $1 WHERE id = $2`,
          [action.value, issueId]
        );
      } else if (action.type === 'notify') {
        let targetUserId;
        if (action.target === 'assignee') targetUserId = issue.assignee_id;
        else if (action.target === 'reporter') targetUserId = issue.reporter_id;
        else targetUserId = action.target;

        if (targetUserId) {
          await notificationRepo.create({
            user_id: targetUserId,
            type: 'status_change',
            reference_id: issueId,
            reference_type: 'issue',
            message: `Issue ${issue.issue_key} moved to new status`,
          });
        }
      }
    }

    // 9. Log activity
    await activityRepo.log(client, {
      project_id: issue.project_id,
      issue_id: issueId,
      actor_id: actorId,
      action: 'issue_status_changed',
      old_value: { status_id: issue.status_id },
      new_value: { status_id: toStatusId },
    });

    await client.query('COMMIT');

    // Emit WebSocket event
    const io = getIO();
    if (io) {
      io.to(`project:${issue.project_id}`).emit('issue_moved', {
        issue_id: issueId,
        from_status: { id: issue.status_id },
        to_status: { id: toStatusId },
      });
    }

    // 11 & 12. Notify watchers
    const { rows: watchers } = await pool.query(
      'SELECT user_id FROM watchers WHERE issue_id = $1',
      [issueId]
    );
    for (const { user_id } of watchers) {
      if (user_id !== actorId) {
        await notificationRepo.create({
          user_id,
          type: 'status_change',
          reference_id: issueId,
          reference_type: 'issue',
          message: `Issue ${issue.issue_key} status was changed`,
        });
      }
    }

    // 13. Return updated issue
    const { rows: [finalIssue] } = await pool.query(
      `SELECT i.*, s.name AS status_name, s.category AS status_category,
              u1.display_name AS assignee_name, u2.display_name AS reporter_name
       FROM issues i
       JOIN statuses s ON s.id = i.status_id
       LEFT JOIN users u1 ON u1.id = i.assignee_id
       JOIN users u2 ON u2.id = i.reporter_id
       WHERE i.id = $1`,
      [issueId]
    );
    return finalIssue;
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch {}
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { executeTransition };
