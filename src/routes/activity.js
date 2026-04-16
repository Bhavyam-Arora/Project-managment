/**
 * @swagger
 * tags:
 *   name: Activity
 *   description: Project activity feed
 *
 * /projects/{id}/activity:
 *   get:
 *     tags: [Activity]
 *     summary: Get activity feed for a project
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: issue_id
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: action
 *         schema: { type: string, example: issue_created }
 *       - in: query
 *         name: cursor
 *         schema: { type: string }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200: { description: Paginated activity log entries }
 */

const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const requireProjectMember = require('../middleware/projectAccess');
const activityRepo = require('../repositories/activityRepository');

// GET /api/projects/:id/activity
router.get('/projects/:id/activity', authMiddleware, requireProjectMember(), async (req, res, next) => {
  try {
    const { issue_id, action, cursor } = req.query;
    const limit = parseInt(req.query.limit) || 20;
    const filters = {};
    if (issue_id) filters.issue_id = issue_id;
    if (action)   filters.action   = action;

    const { results, next_cursor } = await activityRepo.getByProject(
      req.params.id,
      filters,
      cursor || null,
      limit
    );
    res.json({ success: true, data: results, next_cursor });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
