const pool = require('../db/pool');

function requireProjectMember(requiredRole = null) {
  return async (req, res, next) => {
    const projectId = req.params.id || req.params.project_id;
    try {
      const { rows } = await pool.query(
        'SELECT * FROM project_members WHERE project_id = $1 AND user_id = $2',
        [projectId, req.user.id]
      );
      if (rows.length === 0) {
        return res.status(403).json({ success: false, error: { code: 'NOT_A_MEMBER' } });
      }
      const membership = rows[0];
      if (requiredRole && membership.role !== requiredRole) {
        return res.status(403).json({ success: false, error: { code: 'INSUFFICIENT_ROLE' } });
      }
      req.membership = membership;
      next();
    } catch (err) {
      next(err);
    }
  };
}

module.exports = requireProjectMember;
