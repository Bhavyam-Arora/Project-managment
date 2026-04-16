require('dotenv').config({ path: '.env.test' });
const request = require('supertest');
const app = require('../src/app');
const {
  createTestUser, createTestProject, createTestStatuses,
  createTestIssue, authHeader,
} = require('./helpers');

describe('Issues', () => {
  let token, user, project, statuses;

  beforeAll(async () => {
    ({ user, token } = await createTestUser());
    project = await createTestProject(token);
    statuses = await createTestStatuses(token, project.id);
  });

  test('create issue returns 201 with issue_key = PROJECT-1', async () => {
    const res = await request(app)
      .post(`/api/projects/${project.id}/issues`)
      .set(authHeader(token))
      .send({ type: 'task', title: 'First Issue', status_id: statuses[0].id });
    expect(res.status).toBe(201);
    expect(res.body.data.issue_key).toBe(`${project.key}-1`);
  });

  test('create second issue has incremented key', async () => {
    const res = await request(app)
      .post(`/api/projects/${project.id}/issues`)
      .set(authHeader(token))
      .send({ type: 'task', title: 'Second Issue', status_id: statuses[0].id });
    expect(res.status).toBe(201);
    expect(res.body.data.issue_key).toBe(`${project.key}-2`);
  });

  test('get board returns issues grouped by status', async () => {
    const res = await request(app)
      .get(`/api/projects/${project.id}/board`)
      .set(authHeader(token));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    const todoCol = res.body.data.find(s => s.name === 'To Do');
    expect(todoCol).toBeDefined();
    expect(Array.isArray(todoCol.issues)).toBe(true);
    expect(todoCol.issues.length).toBeGreaterThanOrEqual(2);
  });

  test('PATCH issue with correct version returns 200 and increments version', async () => {
    const issue = await createTestIssue(token, project.id, { title: 'Patchable', status_id: statuses[0].id });
    const res = await request(app)
      .patch(`/api/issues/${issue.id}`)
      .set(authHeader(token))
      .send({ version: issue.version, title: 'Updated Title' });
    expect(res.status).toBe(200);
    expect(res.body.data.version).toBe(issue.version + 1);
    expect(res.body.data.title).toBe('Updated Title');
  });

  test('PATCH issue with stale version returns 409 VERSION_CONFLICT', async () => {
    const issue = await createTestIssue(token, project.id, { title: 'Conflict Issue', status_id: statuses[0].id });
    // First update succeeds
    await request(app)
      .patch(`/api/issues/${issue.id}`)
      .set(authHeader(token))
      .send({ version: issue.version, title: 'First Update' });
    // Second update with stale version fails
    const res = await request(app)
      .patch(`/api/issues/${issue.id}`)
      .set(authHeader(token))
      .send({ version: issue.version, title: 'Stale Update' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('VERSION_CONFLICT');
  });

  test('two simultaneous PATCH requests - one wins, one gets 409', async () => {
    const issue = await createTestIssue(token, project.id, { title: 'Race Issue', status_id: statuses[0].id });
    const [r1, r2] = await Promise.all([
      request(app).patch(`/api/issues/${issue.id}`).set(authHeader(token)).send({ version: issue.version, title: 'Winner' }),
      request(app).patch(`/api/issues/${issue.id}`).set(authHeader(token)).send({ version: issue.version, title: 'Loser' }),
    ]);
    const statuses_codes = [r1.status, r2.status].sort();
    expect(statuses_codes).toEqual([200, 409]);
  });

  test('delete issue as reporter returns 204', async () => {
    const issue = await createTestIssue(token, project.id, { title: 'To Delete', status_id: statuses[0].id });
    const res = await request(app)
      .delete(`/api/issues/${issue.id}`)
      .set(authHeader(token));
    expect(res.status).toBe(204);
  });

  test('delete issue as non-reporter non-admin returns 403', async () => {
    const { token: otherToken, user: otherUser } = await createTestUser();
    // Add them as member (not admin)
    await request(app)
      .post(`/api/projects/${project.id}/members`)
      .set(authHeader(token))
      .send({ user_id: otherUser.id, role: 'member' });

    const issue = await createTestIssue(token, project.id, { title: 'Protected', status_id: statuses[0].id });
    const res = await request(app)
      .delete(`/api/issues/${issue.id}`)
      .set(authHeader(otherToken));
    expect(res.status).toBe(403);
  });
});
