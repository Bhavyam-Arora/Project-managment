require('dotenv').config({ path: '.env.test' });
const request = require('supertest');
const app = require('../src/app');
const {
  createTestUser, createTestProject, createTestStatuses,
  createTestTransitions, createTestIssue, authHeader,
} = require('./helpers');

describe('Sprints', () => {
  let token, project, statuses;

  beforeAll(async () => {
    ({ token } = await createTestUser());
    project = await createTestProject(token);
    statuses = await createTestStatuses(token, project.id);
  });

  // ── Existing tests ──────────────────────────────────────────────────────────

  test('TC-S01 create sprint returns auto-calculated dates', async () => {
    const res = await request(app)
      .post(`/api/projects/${project.id}/sprints`)
      .set(authHeader(token))
      .send({});
    expect(res.status).toBe(201);
    expect(res.body.data.start_date).toBeTruthy();
    expect(res.body.data.end_date).toBeTruthy();
    expect(res.body.data.sprint_number).toBe(1);
  });

  test('TC-S02 create second sprint start_date follows first end_date', async () => {
    const proj = await createTestProject(token);
    await createTestStatuses(token, proj.id);
    const s1 = await request(app).post(`/api/projects/${proj.id}/sprints`).set(authHeader(token)).send({});
    await request(app).post(`/api/sprints/${s1.body.data.id}/start`).set(authHeader(token));
    await request(app).post(`/api/sprints/${s1.body.data.id}/complete`).set(authHeader(token)).send({ carry_over_issue_ids: [] });
    const s2 = await request(app).post(`/api/projects/${proj.id}/sprints`).set(authHeader(token)).send({});
    expect(s2.status).toBe(201);
    const s1EndDate  = s1.body.data.end_date.slice(0, 10);
    const s2StartDate = s2.body.data.start_date.slice(0, 10);
    const [y, m, d] = s1EndDate.split('-').map(Number);
    const dayAfter = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
    expect(s2StartDate).toBe(dayAfter);
  });

  test('TC-S03 start sprint sets status to active', async () => {
    const proj = await createTestProject(token);
    await createTestStatuses(token, proj.id);
    const sprint = await request(app).post(`/api/projects/${proj.id}/sprints`).set(authHeader(token)).send({});
    const res = await request(app).post(`/api/sprints/${sprint.body.data.id}/start`).set(authHeader(token));
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('active');
  });

  test('TC-S04 start second sprint when one is active returns 422 SPRINT_ALREADY_ACTIVE', async () => {
    const proj = await createTestProject(token);
    await createTestStatuses(token, proj.id);
    const s1 = await request(app).post(`/api/projects/${proj.id}/sprints`).set(authHeader(token)).send({});
    const s2 = await request(app).post(`/api/projects/${proj.id}/sprints`).set(authHeader(token)).send({});
    await request(app).post(`/api/sprints/${s1.body.data.id}/start`).set(authHeader(token));
    const res = await request(app).post(`/api/sprints/${s2.body.data.id}/start`).set(authHeader(token));
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('SPRINT_ALREADY_ACTIVE');
  });

  test('TC-S05 complete sprint calculates velocity from done story_points', async () => {
    const proj = await createTestProject(token);
    const sts = await createTestStatuses(token, proj.id);
    await createTestTransitions(token, proj.id, sts);
    const byName = (name) => sts.find(s => s.name === name);

    const sprint = await request(app).post(`/api/projects/${proj.id}/sprints`).set(authHeader(token)).send({});
    await request(app).post(`/api/sprints/${sprint.body.data.id}/start`).set(authHeader(token));

    const issue = await createTestIssue(token, proj.id, { title: 'Done Issue', status_id: byName('To Do').id, story_points: 3 });
    await request(app).post(`/api/sprints/${sprint.body.data.id}/issues`).set(authHeader(token)).send({ issue_ids: [issue.id] });

    const memberId = (await request(app).get(`/api/projects/${proj.id}`).set(authHeader(token))).body.data.members[0].user_id;
    await request(app).post(`/api/issues/${issue.id}/transitions`).set(authHeader(token)).send({ to_status_id: byName('In Progress').id });
    const current = await request(app).get(`/api/issues/${issue.id}`).set(authHeader(token));
    await request(app).patch(`/api/issues/${issue.id}`).set(authHeader(token)).send({ version: current.body.data.version, assignee_id: memberId });
    await request(app).post(`/api/issues/${issue.id}/transitions`).set(authHeader(token)).send({ to_status_id: byName('In Review').id });
    await request(app).post(`/api/issues/${issue.id}/transitions`).set(authHeader(token)).send({ to_status_id: byName('Done').id });

    const res = await request(app).post(`/api/sprints/${sprint.body.data.id}/complete`).set(authHeader(token)).send({ carry_over_issue_ids: [] });
    expect(res.status).toBe(200);
    expect(res.body.data.velocity).toBe(3);
  });

  test('TC-S06 complete sprint with carry_over_ids sets sprint_id to null', async () => {
    const proj = await createTestProject(token);
    const sts = await createTestStatuses(token, proj.id);
    const byName = (name) => sts.find(s => s.name === name);

    const sprint = await request(app).post(`/api/projects/${proj.id}/sprints`).set(authHeader(token)).send({});
    await request(app).post(`/api/sprints/${sprint.body.data.id}/start`).set(authHeader(token));

    const issue = await createTestIssue(token, proj.id, { title: 'Carry Over', status_id: byName('To Do').id });
    await request(app).post(`/api/sprints/${sprint.body.data.id}/issues`).set(authHeader(token)).send({ issue_ids: [issue.id] });

    const res = await request(app)
      .post(`/api/sprints/${sprint.body.data.id}/complete`)
      .set(authHeader(token))
      .send({ carry_over_issue_ids: [issue.id] });

    expect(res.status).toBe(200);
    const issueRes = await request(app).get(`/api/issues/${issue.id}`).set(authHeader(token));
    expect(issueRes.body.data.sprint_id).toBeNull();
  });

  // ── New tests ────────────────────────────────────────────────────────────────

  test('TC-S07 complete sprint with no done issues returns velocity 0', async () => {
    const proj = await createTestProject(token);
    const sts = await createTestStatuses(token, proj.id);
    const byName = (name) => sts.find(s => s.name === name);

    const sprint = await request(app).post(`/api/projects/${proj.id}/sprints`).set(authHeader(token)).send({});
    await request(app).post(`/api/sprints/${sprint.body.data.id}/start`).set(authHeader(token));

    const issue = await createTestIssue(token, proj.id, { title: 'Not Done', status_id: byName('To Do').id, story_points: 5 });
    await request(app).post(`/api/sprints/${sprint.body.data.id}/issues`).set(authHeader(token)).send({ issue_ids: [issue.id] });

    const res = await request(app)
      .post(`/api/sprints/${sprint.body.data.id}/complete`)
      .set(authHeader(token))
      .send({ carry_over_issue_ids: [] });
    expect(res.status).toBe(200);
    expect(res.body.data.velocity).toBe(0);
  });

  test('TC-S08 list sprints for project returns all sprints', async () => {
    const proj = await createTestProject(token);
    await createTestStatuses(token, proj.id);
    await request(app).post(`/api/projects/${proj.id}/sprints`).set(authHeader(token)).send({});
    await request(app).post(`/api/projects/${proj.id}/sprints`).set(authHeader(token)).send({});
    const res = await request(app)
      .get(`/api/projects/${proj.id}/sprints`)
      .set(authHeader(token));
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(2);
  });

  test('TC-S09 update sprint name via PATCH returns 200 with new name', async () => {
    const proj = await createTestProject(token);
    await createTestStatuses(token, proj.id);
    const sprint = await request(app).post(`/api/projects/${proj.id}/sprints`).set(authHeader(token)).send({});
    const res = await request(app)
      .patch(`/api/sprints/${sprint.body.data.id}`)
      .set(authHeader(token))
      .send({ name: 'Renamed Sprint' });
    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('Renamed Sprint');
  });

  test('TC-S10 delete sprint sets sprint_id to null for all sprint issues (moves to backlog)', async () => {
    const proj = await createTestProject(token);
    const sts = await createTestStatuses(token, proj.id);
    const byName = (name) => sts.find(s => s.name === name);

    const sprint = await request(app).post(`/api/projects/${proj.id}/sprints`).set(authHeader(token)).send({});
    const issue = await createTestIssue(token, proj.id, { title: 'Sprint Issue', status_id: byName('To Do').id });
    await request(app).post(`/api/sprints/${sprint.body.data.id}/issues`).set(authHeader(token)).send({ issue_ids: [issue.id] });

    await request(app).delete(`/api/sprints/${sprint.body.data.id}`).set(authHeader(token));

    const issueRes = await request(app).get(`/api/issues/${issue.id}`).set(authHeader(token));
    expect(issueRes.body.data.sprint_id).toBeNull();
  });

  test('TC-S11 non-member cannot list sprints for project returns 403 NOT_A_MEMBER', async () => {
    const proj = await createTestProject(token);
    const { token: outsiderToken } = await createTestUser();
    const res = await request(app)
      .get(`/api/projects/${proj.id}/sprints`)
      .set(authHeader(outsiderToken));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('NOT_A_MEMBER');
  });
});
