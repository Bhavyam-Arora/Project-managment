/**
 * @swagger
 * tags:
 *   name: Sprints
 *   description: Sprint planning and completion
 *
 * /projects/{id}/sprints:
 *   get:
 *     tags: [Sprints]
 *     summary: List sprints for a project
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: List of sprints }
 *   post:
 *     tags: [Sprints]
 *     summary: Create a sprint (dates auto-calculated if omitted)
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:       { type: string, example: Sprint 3 }
 *               goal:       { type: string }
 *               start_date: { type: string, format: date }
 *               end_date:   { type: string, format: date }
 *     responses:
 *       201: { description: Sprint created }
 *
 * /sprints/{id}/start:
 *   post:
 *     tags: [Sprints]
 *     summary: Start a sprint (only one active sprint allowed per project)
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Sprint started }
 *       422: { description: SPRINT_ALREADY_ACTIVE or MISSING_DATES }
 *
 * /sprints/{id}/complete:
 *   post:
 *     tags: [Sprints]
 *     summary: Complete a sprint — incomplete issues move to backlog
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               carry_over_issue_ids: { type: array, items: { type: string, format: uuid } }
 *     responses:
 *       200: { description: Sprint completed with velocity and incomplete issues }
 *
 * /sprints/{id}/issues:
 *   post:
 *     tags: [Sprints]
 *     summary: Move issues into a sprint
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
 *             required: [issue_ids]
 *             properties:
 *               issue_ids: { type: array, items: { type: string, format: uuid } }
 *     responses:
 *       200: { description: Issues moved to sprint }
 *
 * /sprints/{id}:
 *   patch:
 *     tags: [Sprints]
 *     summary: Update sprint details
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:       { type: string }
 *               goal:       { type: string }
 *               start_date: { type: string, format: date }
 *               end_date:   { type: string, format: date }
 *     responses:
 *       200: { description: Updated sprint }
 *   delete:
 *     tags: [Sprints]
 *     summary: Delete sprint (issues return to backlog)
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       204: { description: Deleted }
 */

const express = require('express');
const { z } = require('zod');
const router = express.Router();
const pool = require('../db/pool');
const authMiddleware = require('../middleware/auth');
const requireProjectMember = require('../middleware/projectAccess');
const validate = require('../middleware/validate');
const sprintService = require('../services/sprintService');

const createSprintSchema = z.object({
  name: z.string().optional(),
  goal: z.string().optional(),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
});

const updateSprintSchema = z.object({
  name: z.string().optional(),
  goal: z.string().optional(),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
});

const completeSprintSchema = z.object({
  carry_over_issue_ids: z.array(z.string().uuid()).optional().default([]),
});

// GET /api/projects/:id/sprints
router.get('/projects/:id/sprints', authMiddleware, requireProjectMember(), async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM sprints WHERE project_id = $1 ORDER BY sprint_number ASC',
      [req.params.id]
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
});

// POST /api/projects/:id/sprints
router.post('/projects/:id/sprints', authMiddleware, requireProjectMember(), validate(createSprintSchema), async (req, res, next) => {
  try {
    const sprint = await sprintService.createSprint(req.params.id, req.user.id, req.body);
    res.status(201).json({ success: true, data: sprint });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/sprints/:id
router.patch('/sprints/:id', authMiddleware, validate(updateSprintSchema), async (req, res, next) => {
  try {
    const keys = Object.keys(req.body);
    if (keys.length === 0) {
      const { rows: [sprint] } = await pool.query('SELECT * FROM sprints WHERE id = $1', [req.params.id]);
      return res.json({ success: true, data: sprint });
    }
    const setClause = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
    const values = [req.params.id, ...keys.map(k => req.body[k])];
    const { rows: [sprint] } = await pool.query(
      `UPDATE sprints SET ${setClause}, updated_at = NOW() WHERE id = $1 RETURNING *`,
      values
    );
    if (!sprint) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND' } });
    res.json({ success: true, data: sprint });
  } catch (err) {
    next(err);
  }
});

// POST /api/sprints/:id/start
router.post('/sprints/:id/start', authMiddleware, async (req, res, next) => {
  try {
    const { rows: [sprint] } = await pool.query('SELECT project_id FROM sprints WHERE id = $1', [req.params.id]);
    if (!sprint) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND' } });
    const updated = await sprintService.startSprint(req.params.id, sprint.project_id);
    res.json({ success: true, data: updated });
  } catch (err) {
    if (err.code === 'SPRINT_ALREADY_ACTIVE' || err.code === 'MISSING_DATES') {
      return res.status(422).json({ success: false, error: { code: err.code, message: err.message } });
    }
    next(err);
  }
});

// POST /api/sprints/:id/complete
router.post('/sprints/:id/complete', authMiddleware, validate(completeSprintSchema), async (req, res, next) => {
  try {
    const result = await sprintService.completeSprint(req.params.id, req.user.id, req.body.carry_over_issue_ids);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

// POST /api/sprints/:id/issues — move issues into sprint
router.post('/sprints/:id/issues', authMiddleware, async (req, res, next) => {
  try {
    const { issue_ids } = req.body;
    if (!Array.isArray(issue_ids) || issue_ids.length === 0) {
      return res.status(422).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'issue_ids required' } });
    }
    await pool.query(
      'UPDATE issues SET sprint_id = $1 WHERE id = ANY($2)',
      [req.params.id, issue_ids]
    );
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/sprints/:id
router.delete('/sprints/:id', authMiddleware, async (req, res, next) => {
  try {
    // Move sprint issues back to backlog
    await pool.query('UPDATE issues SET sprint_id = NULL WHERE sprint_id = $1', [req.params.id]);
    await pool.query('DELETE FROM sprints WHERE id = $1', [req.params.id]);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
