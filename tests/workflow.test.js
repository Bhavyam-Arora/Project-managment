require('dotenv').config({ path: '.env.test' });
const request = require('supertest');
const app = require('../src/app');
const {
  createTestUser, createTestProject, createTestStatuses,
  createTestTransitions, createTestIssue, authHeader,
} = require('./helpers');

describe('Workflow', () => {
  let token, user, project, statuses, transitions;

  beforeAll(async () => {
    ({ user, token } = await createTestUser());
    project = await createTestProject(token);
    statuses = await createTestStatuses(token, project.id);
    transitions = await createTestTransitions(token, project.id, statuses);
  });

  const byName = (name) => statuses.find(s => s.name === name);

  // ── Existing tests ──────────────────────────────────────────────────────────

  test('TC-W01 transition with no matching rule returns 422 TRANSITION_NOT_ALLOWED with allowed list', async () => {
    const issue = await createTestIssue(token, project.id, { title: 'WF Issue', status_id: byName('To Do').id });
    const res = await request(app)
      .post(`/api/issues/${issue.id}/transitions`)
      .set(authHeader(token))
      .send({ to_status_id: byName('Done').id });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('TRANSITION_NOT_ALLOWED');
    expect(Array.isArray(res.body.error.allowed_transitions)).toBe(true);
    expect(res.body.error.allowed_transitions.length).toBeGreaterThan(0);
  });

  test('TC-W02 transition failing required_field validation returns 422 VALIDATION_FAILED', async () => {
    const issue = await createTestIssue(token, project.id, { title: 'Unassigned', status_id: byName('To Do').id });
    await request(app)
      .post(`/api/issues/${issue.id}/transitions`)
      .set(authHeader(token))
      .send({ to_status_id: byName('In Progress').id });
    const res = await request(app)
      .post(`/api/issues/${issue.id}/transitions`)
      .set(authHeader(token))
      .send({ to_status_id: byName('In Review').id });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    expect(res.body.error.validation_errors.length).toBeGreaterThan(0);
  });

  test('TC-W03 valid transition succeeds and updates status', async () => {
    const issue = await createTestIssue(token, project.id, { title: 'Valid WF', status_id: byName('To Do').id });
    const res = await request(app)
      .post(`/api/issues/${issue.id}/transitions`)
      .set(authHeader(token))
      .send({ to_status_id: byName('In Progress').id });
    expect(res.status).toBe(200);
    expect(res.body.data.status_id).toBe(byName('In Progress').id);
  });

  test('TC-W04 auto_action assign_field fires after transition', async () => {
    const issue = await createTestIssue(token, project.id, {
      title: 'AutoAction',
      status_id: byName('To Do').id,
      assignee_id: user.id,
    });
    await request(app).post(`/api/issues/${issue.id}/transitions`).set(authHeader(token)).send({ to_status_id: byName('In Progress').id });
    await request(app).post(`/api/issues/${issue.id}/transitions`).set(authHeader(token)).send({ to_status_id: byName('In Review').id });
    const res = await request(app).post(`/api/issues/${issue.id}/transitions`).set(authHeader(token)).send({ to_status_id: byName('Done').id });
    expect(res.status).toBe(200);
    expect(res.body.data.assignee_id).toBe(res.body.data.reporter_id);
  });

  test('TC-W05 concurrent transitions — one gets VERSION_CONFLICT 409', async () => {
    const issue = await createTestIssue(token, project.id, { title: 'Concurrent', status_id: byName('To Do').id });
    const [r1, r2] = await Promise.all([
      request(app).post(`/api/issues/${issue.id}/transitions`).set(authHeader(token)).send({ to_status_id: byName('In Progress').id }),
      request(app).post(`/api/issues/${issue.id}/transitions`).set(authHeader(token)).send({ to_status_id: byName('In Progress').id }),
    ]);
    const codes = [r1.status, r2.status].sort();
    expect(codes).toEqual([200, 409]);
  });

  // ── New tests ────────────────────────────────────────────────────────────────

  test('TC-W06 transition to same status as current returns 422 TRANSITION_NOT_ALLOWED', async () => {
    const issue = await createTestIssue(token, project.id, { title: 'Same Status', status_id: byName('To Do').id });
    const res = await request(app)
      .post(`/api/issues/${issue.id}/transitions`)
      .set(authHeader(token))
      .send({ to_status_id: byName('To Do').id });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('TRANSITION_NOT_ALLOWED');
  });

  test('TC-W07 transition request without to_status_id returns 422 VALIDATION_ERROR', async () => {
    const issue = await createTestIssue(token, project.id, { title: 'No Status ID', status_id: byName('To Do').id });
    const res = await request(app)
      .post(`/api/issues/${issue.id}/transitions`)
      .set(authHeader(token))
      .send({});
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  test('TC-W08 validation failure response contains meaningful error message', async () => {
    const issue = await createTestIssue(token, project.id, { title: 'Message Check', status_id: byName('To Do').id });
    await request(app).post(`/api/issues/${issue.id}/transitions`).set(authHeader(token)).send({ to_status_id: byName('In Progress').id });
    const res = await request(app)
      .post(`/api/issues/${issue.id}/transitions`)
      .set(authHeader(token))
      .send({ to_status_id: byName('In Review').id });
    expect(res.status).toBe(422);
    expect(res.body.error.validation_errors[0]).toMatch(/assign/i);
  });

  test('TC-W09 TRANSITION_NOT_ALLOWED response includes correct allowed next statuses', async () => {
    const issue = await createTestIssue(token, project.id, { title: 'Allowed List', status_id: byName('To Do').id });
    const res = await request(app)
      .post(`/api/issues/${issue.id}/transitions`)
      .set(authHeader(token))
      .send({ to_status_id: byName('Done').id });
    expect(res.status).toBe(422);
    const allowedIds = res.body.error.allowed_transitions.map(t => t.to_status_id);
    expect(allowedIds).toContain(byName('In Progress').id);
    expect(allowedIds).not.toContain(byName('Done').id);
  });

  test('TC-W10 successful transition increments issue version by 1', async () => {
    const issue = await createTestIssue(token, project.id, { title: 'Version Check', status_id: byName('To Do').id });
    const res = await request(app)
      .post(`/api/issues/${issue.id}/transitions`)
      .set(authHeader(token))
      .send({ to_status_id: byName('In Progress').id });
    expect(res.status).toBe(200);
    expect(res.body.data.version).toBe(issue.version + 1);
  });
});
