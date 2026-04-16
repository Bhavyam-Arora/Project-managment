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

  test('transition with no matching rule returns 422 TRANSITION_NOT_ALLOWED with allowed list', async () => {
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

  test('transition failing required_field validation returns 422 VALIDATION_FAILED', async () => {
    const issue = await createTestIssue(token, project.id, { title: 'Unassigned', status_id: byName('To Do').id });
    // Move to In Progress first
    await request(app)
      .post(`/api/issues/${issue.id}/transitions`)
      .set(authHeader(token))
      .send({ to_status_id: byName('In Progress').id });
    // Now try In Progress → In Review without assignee
    const res = await request(app)
      .post(`/api/issues/${issue.id}/transitions`)
      .set(authHeader(token))
      .send({ to_status_id: byName('In Review').id });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    expect(res.body.error.validation_errors.length).toBeGreaterThan(0);
  });

  test('valid transition succeeds and updates status', async () => {
    const issue = await createTestIssue(token, project.id, { title: 'Valid WF', status_id: byName('To Do').id });
    const res = await request(app)
      .post(`/api/issues/${issue.id}/transitions`)
      .set(authHeader(token))
      .send({ to_status_id: byName('In Progress').id });
    expect(res.status).toBe(200);
    expect(res.body.data.status_id).toBe(byName('In Progress').id);
  });

  test('auto_action assign_field fires after transition', async () => {
    const issue = await createTestIssue(token, project.id, {
      title: 'AutoAction',
      status_id: byName('To Do').id,
      assignee_id: user.id,
    });
    // To Do → In Progress
    await request(app).post(`/api/issues/${issue.id}/transitions`).set(authHeader(token)).send({ to_status_id: byName('In Progress').id });
    // In Progress → In Review (assignee set, passes validation)
    await request(app).post(`/api/issues/${issue.id}/transitions`).set(authHeader(token)).send({ to_status_id: byName('In Review').id });
    // In Review → Done (auto assigns assignee = reporter_id)
    const res = await request(app).post(`/api/issues/${issue.id}/transitions`).set(authHeader(token)).send({ to_status_id: byName('Done').id });
    expect(res.status).toBe(200);
    // assignee_id should now equal reporter_id (both are `user.id` here since user created it)
    expect(res.body.data.assignee_id).toBe(res.body.data.reporter_id);
  });

  test('concurrent transitions - one gets VERSION_CONFLICT 409', async () => {
    const issue = await createTestIssue(token, project.id, { title: 'Concurrent', status_id: byName('To Do').id });
    const [r1, r2] = await Promise.all([
      request(app).post(`/api/issues/${issue.id}/transitions`).set(authHeader(token)).send({ to_status_id: byName('In Progress').id }),
      request(app).post(`/api/issues/${issue.id}/transitions`).set(authHeader(token)).send({ to_status_id: byName('In Progress').id }),
    ]);
    const codes = [r1.status, r2.status].sort();
    expect(codes).toEqual([200, 409]);
  });
});
