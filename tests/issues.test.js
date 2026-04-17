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

  // ── Existing tests ──────────────────────────────────────────────────────────

  test('TC-I01 create issue returns 201 with issue_key = PROJECT-1', async () => {
    const res = await request(app)
      .post(`/api/projects/${project.id}/issues`)
      .set(authHeader(token))
      .send({ type: 'task', title: 'First Issue', status_id: statuses[0].id });
    expect(res.status).toBe(201);
    expect(res.body.data.issue_key).toBe(`${project.key}-1`);
  });

  test('TC-I02 create second issue has incremented key', async () => {
    const res = await request(app)
      .post(`/api/projects/${project.id}/issues`)
      .set(authHeader(token))
      .send({ type: 'task', title: 'Second Issue', status_id: statuses[0].id });
    expect(res.status).toBe(201);
    expect(res.body.data.issue_key).toBe(`${project.key}-2`);
  });

  test('TC-I03 get board returns issues grouped by status', async () => {
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

  test('TC-I04 PATCH issue with correct version returns 200 and increments version', async () => {
    const issue = await createTestIssue(token, project.id, { title: 'Patchable', status_id: statuses[0].id });
    const res = await request(app)
      .patch(`/api/issues/${issue.id}`)
      .set(authHeader(token))
      .send({ version: issue.version, title: 'Updated Title' });
    expect(res.status).toBe(200);
    expect(res.body.data.version).toBe(issue.version + 1);
    expect(res.body.data.title).toBe('Updated Title');
  });

  test('TC-I05 PATCH issue with stale version returns 409 VERSION_CONFLICT', async () => {
    const issue = await createTestIssue(token, project.id, { title: 'Conflict Issue', status_id: statuses[0].id });
    await request(app)
      .patch(`/api/issues/${issue.id}`)
      .set(authHeader(token))
      .send({ version: issue.version, title: 'First Update' });
    const res = await request(app)
      .patch(`/api/issues/${issue.id}`)
      .set(authHeader(token))
      .send({ version: issue.version, title: 'Stale Update' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('VERSION_CONFLICT');
  });

  test('TC-I06 two simultaneous PATCH requests — one wins, one gets 409', async () => {
    const issue = await createTestIssue(token, project.id, { title: 'Race Issue', status_id: statuses[0].id });
    const [r1, r2] = await Promise.all([
      request(app).patch(`/api/issues/${issue.id}`).set(authHeader(token)).send({ version: issue.version, title: 'Winner' }),
      request(app).patch(`/api/issues/${issue.id}`).set(authHeader(token)).send({ version: issue.version, title: 'Loser' }),
    ]);
    const codes = [r1.status, r2.status].sort();
    expect(codes).toEqual([200, 409]);
  });

  test('TC-I07 delete issue as reporter returns 204', async () => {
    const issue = await createTestIssue(token, project.id, { title: 'To Delete', status_id: statuses[0].id });
    const res = await request(app)
      .delete(`/api/issues/${issue.id}`)
      .set(authHeader(token));
    expect(res.status).toBe(204);
  });

  test('TC-I08 delete issue as non-reporter non-admin returns 403', async () => {
    const { token: otherToken, user: otherUser } = await createTestUser();
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

  // ── New tests ────────────────────────────────────────────────────────────────

  test('TC-I09 PATCH issue without version field returns 422 VALIDATION_ERROR', async () => {
    const issue = await createTestIssue(token, project.id, { title: 'No Version', status_id: statuses[0].id });
    const res = await request(app)
      .patch(`/api/issues/${issue.id}`)
      .set(authHeader(token))
      .send({ title: 'Updated without version' });
    expect(res.status).toBe(422);
    // version is required in Zod schema — missing it fails schema validation before reaching service
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  test('TC-I10 get issue by id returns full detail with reporter_id and issue_key', async () => {
    const issue = await createTestIssue(token, project.id, { title: 'Detail Issue', status_id: statuses[0].id });
    const res = await request(app)
      .get(`/api/issues/${issue.id}`)
      .set(authHeader(token));
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(issue.id);
    expect(res.body.data.title).toBe('Detail Issue');
    expect(res.body.data.issue_key).toBeDefined();
    expect(res.body.data.reporter_id).toBeDefined();
  });

  test('TC-I11 create issue with invalid type returns 422 VALIDATION_ERROR', async () => {
    const res = await request(app)
      .post(`/api/projects/${project.id}/issues`)
      .set(authHeader(token))
      .send({ type: 'invalid_type', title: 'Bad Type Issue', status_id: statuses[0].id });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  test('TC-I12 list issues with type filter returns only matching type', async () => {
    await createTestIssue(token, project.id, { title: 'Epic Issue', type: 'epic', status_id: statuses[0].id });
    const res = await request(app)
      .get(`/api/projects/${project.id}/issues?type=epic`)
      .set(authHeader(token));
    expect(res.status).toBe(200);
    res.body.data.forEach(issue => {
      expect(issue.type).toBe('epic');
    });
  });

  test('TC-I13 non-member trying to create issue returns 403 NOT_A_MEMBER', async () => {
    const { token: outsiderToken } = await createTestUser();
    const res = await request(app)
      .post(`/api/projects/${project.id}/issues`)
      .set(authHeader(outsiderToken))
      .send({ type: 'task', title: 'Intruder Issue', status_id: statuses[0].id });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('NOT_A_MEMBER');
  });

  test('TC-I16 create issue with status_id of Done always lands in first status column', async () => {
    const doneStatus = statuses[3]; // Done
    const res = await request(app)
      .post(`/api/projects/${project.id}/issues`)
      .set(authHeader(token))
      .send({ type: 'task', title: 'Skip To Done Attempt', status_id: doneStatus.id });
    expect(res.status).toBe(201);
    // status_id field is stripped by schema — issue lands at position 0 (To Do)
    expect(res.body.data.status_id).toBe(statuses[0].id);
    expect(res.body.data.status_id).not.toBe(doneStatus.id);
  });

  test('TC-I15 PATCH with status_id does not bypass workflow — status unchanged', async () => {
    const issue = await createTestIssue(token, project.id, { title: 'Bypass Attempt', status_id: statuses[0].id });
    const originalStatusId = statuses[0].id;
    const targetStatusId   = statuses[3].id; // Done — no direct transition rule from To Do
    const res = await request(app)
      .patch(`/api/issues/${issue.id}`)
      .set(authHeader(token))
      .send({ version: issue.version, status_id: targetStatusId, title: 'Tried to jump' });
    // Either the field is stripped (200 but status unchanged) or rejected (422)
    if (res.status === 200) {
      expect(res.body.data.status_id).toBe(originalStatusId);
    } else {
      expect(res.status).toBe(422);
    }
  });

  test('TC-I14 create subtask with parent_id links to parent issue', async () => {
    const parent = await createTestIssue(token, project.id, { title: 'Parent Story', type: 'story', status_id: statuses[0].id });
    const res = await request(app)
      .post(`/api/projects/${project.id}/issues`)
      .set(authHeader(token))
      .send({ type: 'subtask', title: 'Child Subtask', status_id: statuses[0].id, parent_id: parent.id });
    expect(res.status).toBe(201);
    expect(res.body.data.parent_id).toBe(parent.id);
  });
});
