const { Server } = require('socket.io');
const { verifyToken } = require('../utils/jwt');
const pool = require('../db/pool');
const { addPresence, removePresence, getPresence, removeFromAllProjects } = require('./presence');

let io = null;

function init(httpServer) {
  io = new Server(httpServer, {
    cors: {
      origin: process.env.CORS_ORIGIN,
      methods: ['GET', 'POST'],
    },
  });

  // Auth middleware
  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      if (!token) return next(new Error('UNAUTHORIZED'));
      const decoded = verifyToken(token);
      socket.user = { id: decoded.sub, email: decoded.email, display_name: decoded.display_name };
      next();
    } catch {
      next(new Error('UNAUTHORIZED'));
    }
  });

  io.on('connection', (socket) => {
    // Auto-join personal room for notifications
    socket.join(`user:${socket.user.id}`);

    socket.on('join_board', async ({ project_id }) => {
      try {
        const { rows } = await pool.query(
          'SELECT * FROM project_members WHERE project_id = $1 AND user_id = $2',
          [project_id, socket.user.id]
        );
        if (rows.length === 0) return;

        socket.join(`project:${project_id}`);
        addPresence(project_id, socket.user.id, socket.id, socket.user.display_name);
        io.to(`project:${project_id}`).emit('presence_updated', {
          project_id,
          users: getPresence(project_id),
        });
      } catch {}
    });

    socket.on('leave_board', ({ project_id }) => {
      socket.leave(`project:${project_id}`);
      removePresence(project_id, socket.user.id);
      io.to(`project:${project_id}`).emit('presence_updated', {
        project_id,
        users: getPresence(project_id),
      });
    });

    socket.on('join_issue', ({ issue_id }) => {
      socket.join(`issue:${issue_id}`);
    });

    socket.on('leave_issue', ({ issue_id }) => {
      socket.leave(`issue:${issue_id}`);
    });

    socket.on('replay_events', async ({ project_id, since }) => {
      try {
        const { rows } = await pool.query(
          `SELECT a.*, u.display_name AS actor_name
           FROM activity_log a
           JOIN users u ON u.id = a.actor_id
           WHERE a.project_id = $1 AND a.created_at > $2
           ORDER BY a.created_at ASC
           LIMIT 100`,
          [project_id, since]
        );
        socket.emit('replay_batch', { events: rows });
      } catch {}
    });

    socket.on('disconnect', () => {
      const affected = removeFromAllProjects(socket.id);
      for (const projectId of affected) {
        io.to(`project:${projectId}`).emit('presence_updated', {
          project_id: projectId,
          users: getPresence(projectId),
        });
      }
    });
  });

  return io;
}

function getIO() {
  if (!io) return null;
  return io;
}

module.exports = { init, getIO };
