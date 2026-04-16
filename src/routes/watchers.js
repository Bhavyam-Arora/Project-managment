/**
 * @swagger
 * tags:
 *   name: Watchers
 *   description: Watch issues for change notifications
 *
 * /issues/{id}/watch:
 *   post:
 *     tags: [Watchers]
 *     summary: Watch an issue
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       201: { description: Now watching }
 *   delete:
 *     tags: [Watchers]
 *     summary: Unwatch an issue
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Unwatched }
 *
 * /issues/{id}/watchers:
 *   get:
 *     tags: [Watchers]
 *     summary: List all watchers for an issue
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: List of watching users }
 */

const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const authMiddleware = require('../middleware/auth');
const issueRepo = require('../repositories/issueRepository');

// POST /api/issues/:id/watch
router.post('/issues/:id/watch', authMiddleware, async (req, res, next) => {
  try {
    await issueRepo.addWatcher(null, req.params.id, req.user.id);
    res.status(201).json({ success: true, data: { watching: true } });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/issues/:id/watch
router.delete('/issues/:id/watch', authMiddleware, async (req, res, next) => {
  try {
    await issueRepo.removeWatcher(req.params.id, req.user.id);
    res.json({ success: true, data: { watching: false } });
  } catch (err) {
    next(err);
  }
});

// GET /api/issues/:id/watchers
router.get('/issues/:id/watchers', authMiddleware, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT u.id, u.display_name, u.email, u.avatar_url, w.created_at AS watching_since
       FROM watchers w
       JOIN users u ON u.id = w.user_id
       WHERE w.issue_id = $1`,
      [req.params.id]
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
