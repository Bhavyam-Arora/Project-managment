/**
 * @swagger
 * tags:
 *   name: Notifications
 *   description: In-app notifications
 *
 * /notifications:
 *   get:
 *     tags: [Notifications]
 *     summary: Get notifications for the current user
 *     parameters:
 *       - in: query
 *         name: is_read
 *         schema: { type: boolean }
 *       - in: query
 *         name: cursor
 *         schema: { type: string }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200: { description: List of notifications + next_cursor }
 *
 * /notifications/read-all:
 *   patch:
 *     tags: [Notifications]
 *     summary: Mark all notifications as read
 *     responses:
 *       200: { description: Count of notifications updated }
 *
 * /notifications/{id}/read:
 *   patch:
 *     tags: [Notifications]
 *     summary: Mark a single notification as read
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Notification marked read }
 *       404: { description: Not found }
 */

const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const notificationRepo = require('../repositories/notificationRepository');

// GET /api/notifications
router.get('/notifications', authMiddleware, async (req, res, next) => {
  try {
    const { cursor } = req.query;
    const limit = parseInt(req.query.limit) || 20;
    const filters = {};
    if (req.query.is_read !== undefined) {
      filters.is_read = req.query.is_read === 'true';
    }

    const { results, next_cursor } = await notificationRepo.getForUser(
      req.user.id,
      filters,
      cursor || null,
      limit
    );
    res.json({ success: true, data: results, next_cursor });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/notifications/read-all  (must be before /:id/read)
router.patch('/notifications/read-all', authMiddleware, async (req, res, next) => {
  try {
    const count = await notificationRepo.markAllRead(req.user.id);
    res.json({ success: true, data: { updated: count } });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/notifications/:id/read
router.patch('/notifications/:id/read', authMiddleware, async (req, res, next) => {
  try {
    const notification = await notificationRepo.markRead(req.params.id, req.user.id);
    if (!notification) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND' } });
    res.json({ success: true, data: notification });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
