const express = require('express');
const { z } = require('zod');
const router = express.Router();
const pool = require('../db/pool');
const authMiddleware = require('../middleware/auth');
const requireProjectMember = require('../middleware/projectAccess');
const validate = require('../middleware/validate');
const projectRepo = require('../repositories/projectRepository');

/**
 * @swagger
 * tags:
 *   name: Projects
 *   description: Project management
 *
 * /projects:
 *   post:
 *     tags: [Projects]
 *     summary: Create a new project
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, key]
 *             properties:
 *               name: { type: string, example: My Project }
 *               key:  { type: string, example: MYPROJ, description: "2-10 uppercase letters/numbers" }
 *               description: { type: string }
 *     responses:
 *       201: { description: Project created }
 *       422: { description: Validation error }
 *   get:
 *     tags: [Projects]
 *     summary: List all projects for the current user
 *     responses:
 *       200: { description: List of projects }
 *
 * /projects/{id}:
 *   get:
 *     tags: [Projects]
 *     summary: Get project details + members
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Project with members }
 *       403: { description: Not a member }
 *   patch:
 *     tags: [Projects]
 *     summary: Update project (admin only)
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
 *               name: { type: string }
 *               description: { type: string }
 *     responses:
 *       200: { description: Updated project }
 *
 * /projects/{id}/members:
 *   post:
 *     tags: [Projects]
 *     summary: Add a member (admin only)
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
 *             required: [user_id, role]
 *             properties:
 *               user_id: { type: string, format: uuid }
 *               role: { type: string, enum: [admin, member, viewer] }
 *     responses:
 *       201: { description: Member added }
 *       409: { description: Already a member }
 *
 * /projects/{id}/statuses:
 *   post:
 *     tags: [Projects]
 *     summary: Create a board column (admin only)
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
 *             required: [name, category, position]
 *             properties:
 *               name: { type: string, example: In Progress }
 *               category: { type: string, enum: [todo, in_progress, done] }
 *               position: { type: integer, example: 1 }
 *     responses:
 *       201: { description: Status created }
 *   get:
 *     tags: [Projects]
 *     summary: List board columns ordered by position
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: List of statuses }
 *
 * /projects/{id}/workflow-transitions:
 *   post:
 *     tags: [Projects]
 *     summary: Create a workflow transition rule (admin only)
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
 *             required: [from_status_id, to_status_id]
 *             properties:
 *               from_status_id: { type: string, format: uuid }
 *               to_status_id:   { type: string, format: uuid }
 *               validation_rules: { type: array, items: { type: object }, example: [] }
 *               auto_actions:     { type: array, items: { type: object }, example: [] }
 *     responses:
 *       201: { description: Transition created }
 *   get:
 *     tags: [Projects]
 *     summary: List all workflow transitions for a project
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: List of transitions }
 */

const createProjectSchema = z.object({
  name: z.string().min(1),
  key: z.string().regex(/^[A-Z0-9]{2,10}$/),
  description: z.string().optional(),
});

const updateProjectSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
});

const addMemberSchema = z.object({
  user_id: z.string().uuid(),
  role: z.enum(['admin', 'member', 'viewer']),
});

const createStatusSchema = z.object({
  name: z.string().min(1),
  category: z.enum(['todo', 'in_progress', 'done']),
  position: z.number().int(),
});

const createTransitionSchema = z.object({
  from_status_id: z.string().uuid(),
  to_status_id: z.string().uuid(),
  validation_rules: z.array(z.any()).default([]),
  auto_actions: z.array(z.any()).default([]),
});

// POST /api/projects
router.post('/', authMiddleware, validate(createProjectSchema), async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const project = await projectRepo.createProject(client, {
      ...req.body,
      owner_id: req.user.id,
    });
    await projectRepo.addMember(client, {
      project_id: project.id,
      user_id: req.user.id,
      role: 'admin',
    });
    await client.query('COMMIT');
    res.status(201).json({ success: true, data: project });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
});

// GET /api/projects
router.get('/', authMiddleware, async (req, res, next) => {
  try {
    const projects = await projectRepo.findAllForUser(req.user.id);
    res.json({ success: true, data: projects });
  } catch (err) {
    next(err);
  }
});

// GET /api/projects/:id
router.get('/:id', authMiddleware, requireProjectMember(), async (req, res, next) => {
  try {
    const [project, members] = await Promise.all([
      projectRepo.findById(req.params.id),
      projectRepo.getMembers(req.params.id),
    ]);
    res.json({ success: true, data: { ...project, members } });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/projects/:id
router.patch('/:id', authMiddleware, requireProjectMember('admin'), validate(updateProjectSchema), async (req, res, next) => {
  try {
    const project = await projectRepo.updateProject(req.params.id, req.body);
    res.json({ success: true, data: project });
  } catch (err) {
    next(err);
  }
});

// POST /api/projects/:id/members
router.post('/:id/members', authMiddleware, requireProjectMember('admin'), validate(addMemberSchema), async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { user_id, role } = req.body;

    const userCheck = await pool.query('SELECT id FROM users WHERE id = $1', [user_id]);
    if (userCheck.rows.length === 0) {
      return res.status(404).json({ success: false, error: { code: 'USER_NOT_FOUND' } });
    }

    const existing = await projectRepo.findMember(req.params.id, user_id);
    if (existing) {
      return res.status(409).json({ success: false, error: { code: 'ALREADY_MEMBER' } });
    }

    await client.query('BEGIN');
    const member = await projectRepo.addMember(client, {
      project_id: req.params.id,
      user_id,
      role,
    });
    await client.query('COMMIT');
    res.status(201).json({ success: true, data: member });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
});

// POST /api/projects/:id/statuses
router.post('/:id/statuses', authMiddleware, requireProjectMember('admin'), validate(createStatusSchema), async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const status = await projectRepo.createStatus(client, {
      project_id: req.params.id,
      ...req.body,
    });
    await client.query('COMMIT');
    res.status(201).json({ success: true, data: status });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
});

// GET /api/projects/:id/statuses
router.get('/:id/statuses', authMiddleware, requireProjectMember(), async (req, res, next) => {
  try {
    const statuses = await projectRepo.getStatuses(req.params.id);
    res.json({ success: true, data: statuses });
  } catch (err) {
    next(err);
  }
});

// POST /api/projects/:id/workflow-transitions
router.post('/:id/workflow-transitions', authMiddleware, requireProjectMember('admin'), validate(createTransitionSchema), async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { from_status_id, to_status_id, validation_rules, auto_actions } = req.body;

    // Verify both statuses belong to this project
    const { rows: statuses } = await pool.query(
      'SELECT id FROM statuses WHERE project_id = $1 AND id = ANY($2)',
      [req.params.id, [from_status_id, to_status_id]]
    );
    if (statuses.length < 2) {
      return res.status(422).json({ success: false, error: { code: 'INVALID_STATUS', message: 'One or both status IDs do not belong to this project' } });
    }

    await client.query('BEGIN');
    const transition = await projectRepo.createTransition(client, {
      project_id: req.params.id,
      from_status_id,
      to_status_id,
      validation_rules,
      auto_actions,
    });
    await client.query('COMMIT');
    res.status(201).json({ success: true, data: transition });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
});

// GET /api/projects/:id/workflow-transitions
router.get('/:id/workflow-transitions', authMiddleware, requireProjectMember(), async (req, res, next) => {
  try {
    const transitions = await projectRepo.getTransitions(req.params.id);
    res.json({ success: true, data: transitions });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
