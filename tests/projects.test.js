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

  test('create project returns 201 with correct key', async () => {
    const suffix = Date.now().toString().slice(-4);
    const res = await request(app)
      .post('/api/projects')
      .set(authHeader(token))
      .send({ name: 'My Project', key: `MP${suffix}`, description: 'desc' });
    expect(res.status).toBe(201);
    expect(res.body.data.key).toBe(`MP${suffix}`);
  });

  test('create project with duplicate key returns 422', async () => {
    const project = await createTestProject(token, { key: 'DUPK' });
    const res = await request(app)
      .post('/api/projects')
      .set(authHeader(token))
      .send({ name: 'Dup', key: 'DUPK' });
    expect(res.status).toBe(422);
  });

  test('get projects returns only projects user is member of', async () => {
    const p1 = await createTestProject(token);
    const res = await request(app).get('/api/projects').set(authHeader(token2));
    const keys = res.body.data.map(p => p.id);
    expect(keys).not.toContain(p1.id);
  });

  test('add member to project returns 201', async () => {
    const project = await createTestProject(token);
    const res = await request(app)
      .post(`/api/projects/${project.id}/members`)
      .set(authHeader(token))
      .send({ user_id: user2.id, role: 'member' });
    expect(res.status).toBe(201);
  });

  test('add member who is already a member returns 409 ALREADY_MEMBER', async () => {
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

  test('access project without membership returns 403 NOT_A_MEMBER', async () => {
    const project = await createTestProject(token);
    const res = await request(app)
      .get(`/api/projects/${project.id}`)
      .set(authHeader(token2));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('NOT_A_MEMBER');
  });

  test('create status returns 201 with correct position', async () => {
    const project = await createTestProject(token);
    const res = await request(app)
      .post(`/api/projects/${project.id}/statuses`)
      .set(authHeader(token))
      .send({ name: 'To Do', category: 'todo', position: 0 });
    expect(res.status).toBe(201);
    expect(res.body.data.position).toBe(0);
  });

  test('create workflow transition returns 201', async () => {
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
        to_status_id: s2.body.data.id,
        validation_rules: [],
        auto_actions: [],
      });
    expect(res.status).toBe(201);
  });
});
