const pool = require('../db/pool');
const projectRepo = require('../repositories/projectRepository');
const issueRepo = require('../repositories/issueRepository');
const activityRepo = require('../repositories/activityRepository');
const notificationRepo = require('../repositories/notificationRepository');
const { getIO } = require('../sockets');

async function createIssue(projectId, userId, data) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { key, issue_counter } = await projectRepo.incrementIssueCounter(client, projectId);
    const issue_key = `${key}-${issue_counter}`;

    // Get default status if not provided
    let status_id = data.status_id;
    if (!status_id) {
      const { rows: [defaultStatus] } = await client.query(
        'SELECT id FROM statuses WHERE project_id = $1 ORDER BY position ASC LIMIT 1',
        [projectId]
      );
      if (!defaultStatus) throw Object.assign(new Error('No statuses found'), { status: 422, code: 'NO_STATUSES' });
      status_id = defaultStatus.id;
    }

    const issue = await issueRepo.createIssue(client, {
      ...data,
      issue_key,
      project_id: projectId,
      reporter_id: userId,
      status_id,
    });

    if (data.labels && data.labels.length > 0) {
      for (const label of data.labels) {
        await issueRepo.addLabel(client, issue.id, label);
      }
    }

    if (data.custom_fields && data.custom_fields.length > 0) {
      for (const cf of data.custom_fields) {
        await client.query(
          `INSERT INTO custom_field_values (issue_id, field_id, value_text, value_number, value_date, value_option)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (issue_id, field_id) DO UPDATE
           SET value_text=$3, value_number=$4, value_date=$5, value_option=$6`,
          [issue.id, cf.field_id, cf.value_text || null, cf.value_number || null, cf.value_date || null, cf.value_option || null]
        );
      }
    }

    await issueRepo.addWatcher(client, issue.id, userId);

    await activityRepo.log(client, {
      project_id: projectId,
      issue_id: issue.id,
      actor_id: userId,
      action: 'issue_created',
      new_value: { issue_key, title: issue.title },
    });

    await client.query('COMMIT');

    // Emit WebSocket event
    const io = getIO();
    if (io) io.to(`project:${projectId}`).emit('issue_created', { issue });

    // Notify assignee
    if (data.assignee_id && data.assignee_id !== userId) {
      await notificationRepo.create({
        user_id: data.assignee_id,
        type: 'assignment',
        reference_id: issue.id,
        reference_type: 'issue',
        message: `You were assigned to ${issue_key}: ${issue.title}`,
      });
    }

    return issue;
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch {}
    throw err;
  } finally {
    client.release();
  }
}

async function updateIssue(issueId, userId, data) {
  const { version, ...fields } = data;
  if (version === undefined) {
    throw Object.assign(new Error('version is required'), { status: 422, code: 'VERSION_REQUIRED' });
  }

  const current = await issueRepo.findById(issueId);
  if (!current) throw Object.assign(new Error('Issue not found'), { status: 404, code: 'NOT_FOUND' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const updated = await issueRepo.updateIssue(client, issueId, version, fields);
    if (!updated) {
      await client.query('ROLLBACK');
      throw Object.assign(new Error('Version conflict'), { status: 409, code: 'VERSION_CONFLICT' });
    }

    // Log changed fields
    for (const key of Object.keys(fields)) {
      if (current[key] !== updated[key]) {
        await activityRepo.log(client, {
          project_id: current.project_id,
          issue_id: issueId,
          actor_id: userId,
          action: `issue_${key}_changed`,
          old_value: { [key]: current[key] },
          new_value: { [key]: updated[key] },
        });
      }
    }

    await client.query('COMMIT');

    // Emit WebSocket events
    const io = getIO();
    if (io) {
      const changes = Object.fromEntries(Object.keys(fields).filter(k => current[k] !== updated[k]).map(k => [k, updated[k]]));
      io.to(`project:${current.project_id}`).emit('issue_updated', { issue_id: issueId, changes });
      io.to(`issue:${issueId}`).emit('issue_updated', { issue_id: issueId, changes });
    }

    // Notify new assignee
    if (fields.assignee_id && fields.assignee_id !== current.assignee_id && fields.assignee_id !== userId) {
      await notificationRepo.create({
        user_id: fields.assignee_id,
        type: 'assignment',
        reference_id: issueId,
        reference_type: 'issue',
        message: `You were assigned to ${current.issue_key}: ${current.title}`,
      });
    }

    // Notify watchers
    const watchers = await issueRepo.getWatchers(issueId);
    for (const watcherId of watchers) {
      if (watcherId !== userId) {
        await notificationRepo.create({
          user_id: watcherId,
          type: 'status_change',
          reference_id: issueId,
          reference_type: 'issue',
          message: `Issue ${current.issue_key} was updated`,
        });
      }
    }

    return updated;
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch {}
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { createIssue, updateIssue };
