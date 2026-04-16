const pool = require('../db/pool');
const commentRepo = require('../repositories/commentRepository');
const activityRepo = require('../repositories/activityRepository');
const notificationRepo = require('../repositories/notificationRepository');
const issueRepo = require('../repositories/issueRepository');
const { parseMentions } = require('../utils/mentions');
const { getIO } = require('../sockets');

async function createComment(issueId, authorId, { body, parent_id }) {
  const issue = await issueRepo.findById(issueId);
  if (!issue) throw Object.assign(new Error('Issue not found'), { status: 404, code: 'NOT_FOUND' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const comment = await commentRepo.createComment(client, {
      issue_id: issueId,
      author_id: authorId,
      parent_id: parent_id || null,
      body,
    });

    // Parse and store @mentions
    const mentionNames = parseMentions(body);
    const mentionedUserIds = [];
    for (const name of mentionNames) {
      const { rows: [user] } = await client.query(
        'SELECT id FROM users WHERE display_name ILIKE $1',
        [name]
      );
      if (user) {
        await commentRepo.addMention(client, comment.id, user.id);
        mentionedUserIds.push(user.id);
      }
    }

    await activityRepo.log(client, {
      project_id: issue.project_id,
      issue_id: issueId,
      actor_id: authorId,
      action: 'comment_added',
      new_value: { comment_id: comment.id },
    });

    // Auto-watch: ensure author is watching
    await issueRepo.addWatcher(client, issueId, authorId);

    await client.query('COMMIT');

    // Emit WebSocket events
    const io = getIO();
    if (io) {
      io.to(`issue:${issueId}`).emit('comment_added', { issue_id: issueId, comment });
      io.to(`project:${issue.project_id}`).emit('comment_added', { issue_id: issueId });
    }

    // Notify mentioned users
    for (const userId of mentionedUserIds) {
      if (userId !== authorId) {
        await notificationRepo.create({
          user_id: userId,
          type: 'mention',
          reference_id: comment.id,
          reference_type: 'comment',
          message: `You were mentioned in a comment on ${issue.issue_key}`,
        });
      }
    }

    // Notify all watchers (except author)
    const watchers = await issueRepo.getWatchers(issueId);
    for (const watcherId of watchers) {
      if (watcherId !== authorId) {
        await notificationRepo.create({
          user_id: watcherId,
          type: 'comment',
          reference_id: comment.id,
          reference_type: 'comment',
          message: `New comment on ${issue.issue_key}`,
        });
      }
    }

    return comment;
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch {}
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { createComment };
