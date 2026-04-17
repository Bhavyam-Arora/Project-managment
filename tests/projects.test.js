require('dotenv').config({ path: '.env.test' });
const request = require('supertest');
const app = require('../src/app');
const { createTestUser, createTestProject, authHeader } = require('./helpers');

describe('Projects', () => {
  let token, user, token2, user2;

  beforeAll(async () => {
    ({ user, token } = await createTestUser());
    ({ user: user2, token: token2 } = await createTestUser());
  });

  // ── Existing tests ──────────────────────────────────────────────────────────

  test('TC-P01 create project returns 201 with correct key', async () => {
    const suffix = Date.now().toString().slice(-4);
    const res = await request(app)
      .post('/api/projects')
      .set(authHeader(token))
      .send({ name: 'My Project', key: `MP${suffix}`, description: 'desc' });
    expect(res.status).toBe(201);
    expect(res.body.data.key).toBe(`MP${suffix}`);
  });

  test('TC-P02 create project with duplicate key returns 422', async () => {
    await createTestProject(token, { key: 'DUPK' });
    const res = await request(app)
      .post('/api/projects')
      .set(authHeader(token))
      .send({ name: 'Dup', key: 'DUPK' });
    expect(res.status).toBe(422);
  });

  test('TC-P03 get projects returns only projects user is member of', async () => {
    const p1 = await createTestProject(token);
    const res = await request(app).get('/api/projects').set(authHeader(token2));
    const keys = res.body.data.map(p => p.id);
    expect(keys).not.toContain(p1.id);
  });

  test('TC-P04 add member to project returns 201', async () => {
    const project = await createTestProject(token);
    const res = await request(app)
      .post(`/api/projects/${project.id}/members`)
      .set(authHeader(token))
      .send({ user_id: user2.id, role: 'member' });
    expect(res.status).toBe(201);
  });

  test('TC-P05 add member who is already a member returns 409 ALREADY_MEMBER', async () => {
    const project = await createTestProject(token);
    await request(app)
      .post(`/api/projects/${project.id}/members`)
      .set(authHeader(token))
      .send({ user_id: user2.id, role: 'member' });
    const res = await request(app)
      .post(`/api/projects/${project.id}/members`)
      .set(authHeader(token))
      .send({ user_id: user2.id, role: 'member' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('ALREADY_MEMBER');
  });

  test('TC-P06 access project without membership returns 403 NOT_A_MEMBER', async () => {
    const project = await createTestProject(token);
    const res = await request(app)
      .get(`/api/projects/${project.id}`)
      .set(authHeader(token2));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('NOT_A_MEMBER');
  });

  test('TC-P07 create status returns 201 with correct position', async () => {
    const project = await createTestProject(token);
    const res = await request(app)
      .post(`/api/projects/${project.id}/statuses`)
      .set(authHeader(token))
      .send({ name: 'To Do', category: 'todo', position: 0 });
    expect(res.status).toBe(201);
    expect(res.body.data.position).toBe(0);
  });

  test('TC-P08 create workflow transition returns 201', async () => {
    const project = await createTestProject(token);
    const s1 = await request(app)
      .post(`/api/projects/${project.id}/statuses`)
      .set(authHeader(token))
      .send({ name: 'To Do', category: 'todo', position: 0 });
    const s2 = await request(app)
      .post(`/api/projects/${project.id}/statuses`)
      .set(authHeader(token))
      .send({ name: 'In Progress', category: 'in_progress', position: 1 });
    const res = await request(app)
      .post(`/api/projects/${project.id}/workflow-transitions`)
      .set(authHeader(token))
      .send({
        from_status_id: s1.body.data.id,
        to_status_id:   s2.body.data.id,
        validation_rules: [],
        auto_actions: [],
      });
    expect(res.status).toBe(201);
  });

  // ── New tests ────────────────────────────────────────────────────────────────

  test('TC-P09 create project with lowercase key returns 422 VALIDATION_ERROR', async () => {
    const res = await request(app)
      .post('/api/projects')
      .set(authHeader(token))
      .send({ name: 'Bad Key', key: 'lowercase' });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  test('TC-P10 create project with 1-character key returns 422 VALIDATION_ERROR', async () => {
    const res = await request(app)
      .post('/api/projects')
      .set(authHeader(token))
      .send({ name: 'Short Key', key: 'A' });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  test('TC-P11 get project by id returns members array with at least 1 member', async () => {
    const project = await createTestProject(token);
    const res = await request(app)
      .get(`/api/projects/${project.id}`)
      .set(authHeader(token));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data.members)).toBe(true);
    expect(res.body.data.members.length).toBeGreaterThanOrEqual(1);
  });

  test('TC-P12 update project name as admin returns 200 with updated name', async () => {
    const project = await createTestProject(token);
    const res = await request(app)
      .patch(`/api/projects/${project.id}`)
      .set(authHeader(token))
      .send({ name: 'Updated Project Name' });
    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('Updated Project Name');
  });

  test('TC-P13 update project as non-admin member returns 403 INSUFFICIENT_ROLE', async () => {
    const project = await createTestProject(token);
    await request(app)
      .post(`/api/projects/${project.id}/members`)
      .set(authHeader(token))
      .send({ user_id: user2.id, role: 'member' });
    const res = await request(app)
      .patch(`/api/projects/${project.id}`)
      .set(authHeader(token2))
      .send({ name: 'Unauthorized Update' });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('INSUFFICIENT_ROLE');
  });

  test('TC-P14 add non-existent user as member returns 404', async () => {
    const project = await createTestProject(token);
    const res = await request(app)
      .post(`/api/projects/${project.id}/members`)
      .set(authHeader(token))
      .send({ user_id: '00000000-0000-0000-0000-000000000000', role: 'member' });
    expect(res.status).toBe(404);
  });

  test('TC-P15 create status as non-admin member returns 403 INSUFFICIENT_ROLE', async () => {
    const project = await createTestProject(token);
    await request(app)
      .post(`/api/projects/${project.id}/members`)
      .set(authHeader(token))
      .send({ user_id: user2.id, role: 'member' });
    const res = await request(app)
      .post(`/api/projects/${project.id}/statuses`)
      .set(authHeader(token2))
      .send({ name: 'Unauthorized Status', category: 'todo', position: 10 });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('INSUFFICIENT_ROLE');
  });
});
