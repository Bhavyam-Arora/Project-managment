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

  test('create sprint returns auto-calculated dates', async () => {
    const res = await request(app)
      .post(`/api/projects/${project.id}/sprints`)
      .set(authHeader(token))
      .send({});
    expect(res.status).toBe(201);
    expect(res.body.data.start_date).toBeTruthy();
    expect(res.body.data.end_date).toBeTruthy();
    expect(res.body.data.sprint_number).toBe(1);
  });

  test('create second sprint start_date follows first end_date', async () => {
    const proj = await createTestProject(token);
    await createTestStatuses(token, proj.id);
    const s1 = await request(app).post(`/api/projects/${proj.id}/sprints`).set(authHeader(token)).send({});
    // Complete first sprint
    await request(app).post(`/api/sprints/${s1.body.data.id}/start`).set(authHeader(token));
    await request(app).post(`/api/sprints/${s1.body.data.id}/complete`).set(authHeader(token)).send({ carry_over_issue_ids: [] });

    const s2 = await request(app).post(`/api/projects/${proj.id}/sprints`).set(authHeader(token)).send({});
    expect(s2.status).toBe(201);
    // Parse dates as UTC YYYY-MM-DD strings (postgres DATE columns come back as ISO strings)
    const s1EndDate = s1.body.data.end_date.slice(0, 10);
    const s2StartDate = s2.body.data.start_date.slice(0, 10);
    // s2 start should be exactly 1 day after s1 end
    const [y, m, d] = s1EndDate.split('-').map(Number);
    const dayAfter = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
    expect(s2StartDate).toBe(dayAfter);
  });

  test('start sprint sets status to active', async () => {
    const proj = await createTestProject(token);
    await createTestStatuses(token, proj.id);
    const sprint = await request(app).post(`/api/projects/${proj.id}/sprints`).set(authHeader(token)).send({});
    const res = await request(app).post(`/api/sprints/${sprint.body.data.id}/start`).set(authHeader(token));
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('active');
  });

  test('start second sprint when one is active returns 422 SPRINT_ALREADY_ACTIVE', async () => {
    const proj = await createTestProject(token);
    await createTestStatuses(token, proj.id);
    const s1 = await request(app).post(`/api/projects/${proj.id}/sprints`).set(authHeader(token)).send({});
    const s2 = await request(app).post(`/api/projects/${proj.id}/sprints`).set(authHeader(token)).send({});
    await request(app).post(`/api/sprints/${s1.body.data.id}/start`).set(authHeader(token));
    const res = await request(app).post(`/api/sprints/${s2.body.data.id}/start`).set(authHeader(token));
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('SPRINT_ALREADY_ACTIVE');
  });

  test('complete sprint calculates velocity from done story_points', async () => {
    const proj = await createTestProject(token);
    const sts = await createTestStatuses(token, proj.id);
    await createTestTransitions(token, proj.id, sts);
    const byName = (name) => sts.find(s => s.name === name);

    const sprint = await request(app).post(`/api/projects/${proj.id}/sprints`).set(authHeader(token)).send({});
    await request(app).post(`/api/sprints/${sprint.body.data.id}/start`).set(authHeader(token));

    // Create done issue with 3 points
    const issue = await createTestIssue(token, proj.id, { title: 'Done Issue', status_id: byName('To Do').id, story_points: 3 });
    await request(app).post(`/api/sprints/${sprint.body.data.id}/issues`).set(authHeader(token)).send({ issue_ids: [issue.id] });

    const memberId = (await request(app).get(`/api/projects/${proj.id}`).set(authHeader(token))).body.data.members[0].user_id;
    // Move to done via transitions
    await request(app).post(`/api/issues/${issue.id}/transitions`).set(authHeader(token)).send({ to_status_id: byName('In Progress').id });
    // Fetch current version after transition, then assign
    const current = await request(app).get(`/api/issues/${issue.id}`).set(authHeader(token));
    await request(app).patch(`/api/issues/${issue.id}`).set(authHeader(token)).send({ version: current.body.data.version, assignee_id: memberId });
    await request(app).post(`/api/issues/${issue.id}/transitions`).set(authHeader(token)).send({ to_status_id: byName('In Review').id });
    await request(app).post(`/api/issues/${issue.id}/transitions`).set(authHeader(token)).send({ to_status_id: byName('Done').id });

    const res = await request(app).post(`/api/sprints/${sprint.body.data.id}/complete`).set(authHeader(token)).send({ carry_over_issue_ids: [] });
    expect(res.status).toBe(200);
    expect(res.body.data.velocity).toBe(3);
  });

  test('complete sprint with carry_over_ids sets sprint_id to null', async () => {
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
    // Issue should now be in backlog (sprint_id = null)
    const issueRes = await request(app).get(`/api/issues/${issue.id}`).set(authHeader(token));
    expect(issueRes.body.data.sprint_id).toBeNull();
  });
});
