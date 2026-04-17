/**
 * @swagger
 * tags:
 *   name: Issues
 *   description: Issue lifecycle and workflow
 *
 * /projects/{id}/issues:
 *   post:
 *     tags: [Issues]
 *     summary: Create an issue in a project
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *         description: Project ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [type, title]
 *             properties:
 *               type:         { type: string, enum: [epic, story, task, bug, subtask] }
 *               title:        { type: string, example: Fix login bug }
 *               description:  { type: string }
 *               priority:     { type: string, enum: [low, medium, high, critical] }
 *               assignee_id:  { type: string, format: uuid }
 *               sprint_id:    { type: string, format: uuid }
 *               parent_id:    { type: string, format: uuid }
 *               story_points: { type: integer, example: 3 }
 *               labels:       { type: array, items: { type: string } }
 *     responses:
 *       201: { description: Issue created with auto-generated key }
 *   get:
 *     tags: [Issues]
 *     summary: List issues for a project (paginated)
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: sprint_id
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: type
 *         schema: { type: string, enum: [epic, story, task, bug, subtask] }
 *       - in: query
 *         name: priority
 *         schema: { type: string, enum: [low, medium, high, critical] }
 *       - in: query
 *         name: status_id
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: cursor
 *         schema: { type: string }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200: { description: Paginated issues + next_cursor }
 *
 * /projects/{id}/board:
 *   get:
 *     tags: [Issues]
 *     summary: Get Kanban board grouped by status column
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Array of statuses each containing their issues }
 *
 * /issues/{id}:
 *   get:
 *     tags: [Issues]
 *     summary: Get full issue detail (labels, watchers, custom fields)
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Issue detail }
 *       404: { description: Not found }
 *   patch:
 *     tags: [Issues]
 *     summary: Update an issue (requires version for optimistic locking)
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
 *             required: [version]
 *             properties:
 *               version:      { type: integer, example: 1, description: Current issue version — must match DB }
 *               title:        { type: string }
 *               description:  { type: string }
 *               priority:     { type: string, enum: [low, medium, high, critical] }
 *               assignee_id:  { type: string, format: uuid, nullable: true }
 *               sprint_id:    { type: string, format: uuid, nullable: true }
 *               story_points: { type: integer, nullable: true }
 *     responses:
 *       200: { description: Updated issue }
 *       409: { description: VERSION_CONFLICT — reload and retry }
 *   delete:
 *     tags: [Issues]
 *     summary: Delete an issue (reporter or project admin only)
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       204: { description: Deleted }
 *       403: { description: Forbidden }
 *
 * /issues/{id}/transitions:
 *   post:
 *     tags: [Issues]
 *     summary: Move issue to a new status via workflow transition
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
 *             required: [to_status_id]
 *             properties:
 *               to_status_id: { type: string, format: uuid }
 *     responses:
 *       200: { description: Issue moved to new status }
 *       422: { description: TRANSITION_NOT_ALLOWED or VALIDATION_FAILED }
 *       409: { description: VERSION_CONFLICT }
 */

const express = require('express');
const { z } = require('zod');
const router = express.Router();
const pool = require('../db/pool');
const authMiddleware = require('../middleware/auth');
const requireProjectMember = require('../middleware/projectAccess');
const validate = require('../middleware/validate');
const issueRepo = require('../repositories/issueRepository');
const issueService = require('../services/issueService');
const workflowEngine = require('../services/workflowEngine');

const createIssueSchema = z.object({
  type: z.enum(['epic', 'story', 'task', 'bug', 'subtask']),
  title: z.string().min(1).max(500),
  description: z.string().optional(),
  // status_id intentionally excluded — new issues always start at position 0 (first status column)
  priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  assignee_id: z.string().uuid().optional(),
  sprint_id: z.string().uuid().optional(),
  parent_id: z.string().uuid().optional(),
  story_points: z.number().int().positive().optional(),
  labels: z.array(z.string()).optional(),
  custom_fields: z.array(z.object({
    field_id: z.string().uuid(),
    value_text: z.string().optional(),
    value_number: z.number().optional(),
    value_date: z.string().optional(),
    value_option: z.string().optional(),
  })).optional(),
});

const updateIssueSchema = z.object({
  version: z.number().int(),
  title: z.string().min(1).max(500).optional(),
  description: z.string().optional(),
  // status_id intentionally excluded — use POST /issues/:id/transitions to change status
  priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  assignee_id: z.string().uuid().nullable().optional(),
  sprint_id: z.string().uuid().nullable().optional(),
  story_points: z.number().int().positive().nullable().optional(),
});

const transitionSchema = z.object({
  to_status_id: z.string().uuid(),
});

// POST /api/projects/:id/issues
router.post('/projects/:id/issues', authMiddleware, requireProjectMember(), validate(createIssueSchema), async (req, res, next) => {
  try {
    const issue = await issueService.createIssue(req.params.id, req.user.id, req.body);
    res.status(201).json({ success: true, data: issue });
  } catch (err) {
    next(err);
  }
});

// GET /api/projects/:id/board
router.get('/projects/:id/board', authMiddleware, requireProjectMember(), async (req, res, next) => {
  try {
    const board = await issueRepo.getBoardByProject(req.params.id);
    res.json({ success: true, data: board });
  } catch (err) {
    next(err);
  }
});

// GET /api/projects/:id/issues
router.get('/projects/:id/issues', authMiddleware, requireProjectMember(), async (req, res, next) => {
  try {
    const { sprint_id, type, assignee_id, priority, status_id, cursor } = req.query;
    const limit = parseInt(req.query.limit) || 20;
    const filters = {};
    if (sprint_id)   filters.sprint_id   = sprint_id;
    if (type)        filters.type        = type;
    if (assignee_id) filters.assignee_id = assignee_id;
    if (priority)    filters.priority    = priority;
    if (status_id)   filters.status_id   = status_id;

    const result = await issueRepo.findByProject(req.params.id, filters, cursor || null, limit);
    res.json({ success: true, data: result.results, next_cursor: result.next_cursor });
  } catch (err) {
    next(err);
  }
});

// GET /api/issues/:id
router.get('/issues/:id', authMiddleware, async (req, res, next) => {
  try {
    const [issue, labels, watchers] = await Promise.all([
      issueRepo.findById(req.params.id),
      issueRepo.getLabels(req.params.id),
      issueRepo.getWatchers(req.params.id),
    ]);
    if (!issue) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND' } });

    const { rows: customFields } = await pool.query(
      `SELECT cfv.*, cfd.name, cfd.field_type
       FROM custom_field_values cfv
       JOIN custom_field_definitions cfd ON cfd.id = cfv.field_id
       WHERE cfv.issue_id = $1`,
      [req.params.id]
    );

    res.json({ success: true, data: { ...issue, labels, watchers, custom_fields: customFields } });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/issues/:id
router.patch('/issues/:id', authMiddleware, validate(updateIssueSchema), async (req, res, next) => {
  try {
    const issue = await issueService.updateIssue(req.params.id, req.user.id, req.body);
    res.json({ success: true, data: issue });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/issues/:id
router.delete('/issues/:id', authMiddleware, async (req, res, next) => {
  try {
    const issue = await issueRepo.findById(req.params.id);
    if (!issue) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND' } });

    const isReporter = issue.reporter_id === req.user.id;
    if (!isReporter) {
      const { rows: [membership] } = await pool.query(
        'SELECT role FROM project_members WHERE project_id = $1 AND user_id = $2',
        [issue.project_id, req.user.id]
      );
      if (!membership || membership.role !== 'admin') {
        return res.status(403).json({ success: false, error: { code: 'FORBIDDEN' } });
      }
    }

    await issueRepo.deleteIssue(req.params.id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// POST /api/issues/:id/transitions
router.post('/issues/:id/transitions', authMiddleware, validate(transitionSchema), async (req, res, next) => {
  try {
    const issue = await workflowEngine.executeTransition(req.params.id, req.body.to_status_id, req.user.id);
    res.json({ success: true, data: issue });
  } catch (err) {
    if (err.code === 'TRANSITION_NOT_ALLOWED') {
      return res.status(422).json({ success: false, error: { code: err.code, allowed_transitions: err.allowed_transitions } });
    }
    if (err.code === 'VALIDATION_FAILED') {
      return res.status(422).json({ success: false, error: { code: err.code, validation_errors: err.validation_errors } });
    }
    if (err.code === 'VERSION_CONFLICT') {
      return res.status(409).json({ success: false, error: { code: err.code } });
    }
    next(err);
  }
});

module.exports = router;
