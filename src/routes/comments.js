/**
 * @swagger
 * tags:
 *   name: Comments
 *   description: Threaded comments and @mentions
 *
 * /issues/{id}/comments:
 *   get:
 *     tags: [Comments]
 *     summary: Get threaded comments for an issue
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: cursor
 *         schema: { type: string }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200: { description: Threaded comments with replies nested }
 *   post:
 *     tags: [Comments]
 *     summary: Add a comment — use @DisplayName to mention users
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [body]
 *             properties:
 *               body:      { type: string, example: "Great work @Alice can you review?" }
 *               parent_id: { type: string, format: uuid, description: Set to reply to a comment }
 *     responses:
 *       201: { description: Comment created }
 *
 * /comments/{id}:
 *   patch:
 *     tags: [Comments]
 *     summary: Edit a comment (author only)
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [body]
 *             properties:
 *               body: { type: string }
 *     responses:
 *       200: { description: Updated comment }
 *       403: { description: Not the author }
 *   delete:
 *     tags: [Comments]
 *     summary: Soft-delete a comment (author or project admin)
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       204: { description: Deleted }
 *       403: { description: Forbidden }
 */

const express = require('express');
const { z } = require('zod');
const router = express.Router();
const pool = require('../db/pool');
const authMiddleware = require('../middleware/auth');
const validate = require('../middleware/validate');
const commentRepo = require('../repositories/commentRepository');
const commentService = require('../services/commentService');

const createCommentSchema = z.object({
  body: z.string().min(1),
  parent_id: z.string().uuid().optional(),
});

const updateCommentSchema = z.object({
  body: z.string().min(1),
});

// GET /api/issues/:id/comments
router.get('/issues/:id/comments', authMiddleware, async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const { results, next_cursor } = await commentRepo.findByIssue(
      req.params.id,
      req.query.cursor || null,
      limit
    );

    // Nest replies under parents
    const topLevel = results.filter(c => !c.parent_id);
    const replies = results.filter(c => c.parent_id);
    const threaded = topLevel.map(c => ({
      ...c,
      replies: replies.filter(r => r.parent_id === c.id),
    }));

    res.json({ success: true, data: threaded, next_cursor });
  } catch (err) {
    next(err);
  }
});

// POST /api/issues/:id/comments
router.post('/issues/:id/comments', authMiddleware, validate(createCommentSchema), async (req, res, next) => {
  try {
    const comment = await commentService.createComment(req.params.id, req.user.id, req.body);
    res.status(201).json({ success: true, data: comment });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/comments/:id
router.patch('/comments/:id', authMiddleware, validate(updateCommentSchema), async (req, res, next) => {
  try {
    const comment = await commentRepo.updateComment(req.params.id, req.user.id, req.body.body);
    if (!comment) return res.status(403).json({ success: false, error: { code: 'FORBIDDEN' } });
    res.json({ success: true, data: comment });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/comments/:id
router.delete('/comments/:id', authMiddleware, async (req, res, next) => {
  try {
    const comment = await commentRepo.findById(req.params.id);
    if (!comment) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND' } });

    if (comment.author_id === req.user.id) {
      await commentRepo.softDelete(req.params.id, req.user.id);
      return res.status(204).send();
    }

    // Check if user is project admin
    const { rows: [issue] } = await pool.query('SELECT project_id FROM issues WHERE id = $1', [comment.issue_id]);
    const { rows: [membership] } = await pool.query(
      'SELECT role FROM project_members WHERE project_id = $1 AND user_id = $2',
      [issue.project_id, req.user.id]
    );
    if (!membership || membership.role !== 'admin') {
      return res.status(403).json({ success: false, error: { code: 'FORBIDDEN' } });
    }

    // Admin soft-delete: set is_deleted directly
    await pool.query('UPDATE comments SET is_deleted = TRUE WHERE id = $1', [req.params.id]);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
