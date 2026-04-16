/**
 * @swagger
 * tags:
 *   name: Search
 *   description: Full-text issue search
 *
 * /search:
 *   get:
 *     tags: [Search]
 *     summary: Search issues — requires at least q or project_id
 *     parameters:
 *       - in: query
 *         name: q
 *         schema: { type: string }
 *         description: Full-text search query
 *       - in: query
 *         name: project_id
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: status_id
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: assignee_id
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: priority
 *         schema: { type: string, enum: [low, medium, high, critical] }
 *       - in: query
 *         name: type
 *         schema: { type: string, enum: [epic, story, task, bug, subtask] }
 *       - in: query
 *         name: cursor
 *         schema: { type: string }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200: { description: Matching issues + next_cursor }
 *       400: { description: Must provide q or project_id }
 */

const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const searchRepo = require('../repositories/searchRepository');

// GET /api/search
router.get('/search', authMiddleware, async (req, res, next) => {
  try {
    const { q, project_id, status_id, assignee_id, priority, type, cursor } = req.query;
    const limit = parseInt(req.query.limit) || 20;

    if (!q && !project_id) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Provide at least q or project_id' },
      });
    }

    const { results, next_cursor } = await searchRepo.searchIssues({
      q, project_id, status_id, assignee_id, priority, type,
      cursor: cursor || null,
      limit,
    });

    res.json({ success: true, data: results, next_cursor });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
