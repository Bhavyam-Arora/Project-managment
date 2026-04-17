require('dotenv').config({ path: '.env.test' });
const request = require('supertest');
const app = require('../src/app');
const { createTestUser, createTestProject, createTestStatuses, createTestIssue, authHeader } = require('./helpers');

describe('Search', () => {
  let token, project, statuses;

  beforeAll(async () => {
    ({ token } = await createTestUser());
    project = await createTestProject(token);
    statuses = await createTestStatuses(token, project.id);
    await createTestIssue(token, project.id, { title: 'OAuth login feature',      type: 'story', priority: 'high',   status_id: statuses[0].id });
    await createTestIssue(token, project.id, { title: 'Fix authentication bug',   type: 'bug',   priority: 'medium', status_id: statuses[0].id });
    await createTestIssue(token, project.id, { title: 'Dashboard UI work',        type: 'task',  priority: 'low',    status_id: statuses[0].id });
  });

  // ── Existing tests ──────────────────────────────────────────────────────────

  test('TC-SR01 search with q returns matching issues ordered by relevance', async () => {
    const res = await request(app)
      .get(`/api/search?q=OAuth&project_id=${project.id}`)
      .set(authHeader(token));
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
    expect(res.body.data[0].title.toLowerCase()).toContain('oauth');
  });

  test('TC-SR02 search with project_id filter returns only that project issues', async () => {
    const otherProject = await createTestProject(token);
    const otherStatuses = await createTestStatuses(token, otherProject.id);
    await createTestIssue(token, otherProject.id, { title: 'Other project issue', status_id: otherStatuses[0].id });

    const res = await request(app)
      .get(`/api/search?project_id=${project.id}`)
      .set(authHeader(token));
    expect(res.status).toBe(200);
    res.body.data.forEach(issue => {
      expect(issue.project_id).toBe(project.id);
    });
  });

  test('TC-SR03 search with status_id filter returns only matching status', async () => {
    const res = await request(app)
      .get(`/api/search?project_id=${project.id}&status_id=${statuses[0].id}`)
      .set(authHeader(token));
    expect(res.status).toBe(200);
    res.body.data.forEach(issue => {
      expect(issue.status_id).toBe(statuses[0].id);
    });
  });

  test('TC-SR04 search with cursor returns second page with no duplicates', async () => {
    const page1 = await request(app)
      .get(`/api/search?project_id=${project.id}&limit=1`)
      .set(authHeader(token));
    expect(page1.body.next_cursor).toBeTruthy();

    const page2 = await request(app)
      .get(`/api/search?project_id=${project.id}&limit=1&cursor=${page1.body.next_cursor}`)
      .set(authHeader(token));
    expect(page2.status).toBe(200);
    expect(page2.body.data[0].id).not.toBe(page1.body.data[0].id);
  });

  test('TC-SR05 search with no q and no project_id returns 400', async () => {
    const res = await request(app).get('/api/search').set(authHeader(token));
    expect(res.status).toBe(400);
  });

  // ── New tests ────────────────────────────────────────────────────────────────

  test('TC-SR06 search with type filter returns only that issue type', async () => {
    const res = await request(app)
      .get(`/api/search?project_id=${project.id}&type=bug`)
      .set(authHeader(token));
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
    res.body.data.forEach(issue => {
      expect(issue.type).toBe('bug');
    });
  });

  test('TC-SR07 search with q that matches nothing returns empty data array', async () => {
    const res = await request(app)
      .get(`/api/search?q=xyznonexistentterm99&project_id=${project.id}`)
      .set(authHeader(token));
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  test('TC-SR08 search with priority filter returns only matching priority', async () => {
    const res = await request(app)
      .get(`/api/search?project_id=${project.id}&priority=high`)
      .set(authHeader(token));
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
    res.body.data.forEach(issue => {
      expect(issue.priority).toBe('high');
    });
  });

  test('TC-SR09 search q matches description content (not just title)', async () => {
    await createTestIssue(token, project.id, {
      title: 'Unrelated Title',
      type: 'task',
      status_id: statuses[0].id,
      description: 'Contains unique term supercalifragilistic',
    });
    const res = await request(app)
      .get(`/api/search?q=supercalifragilistic&project_id=${project.id}`)
      .set(authHeader(token));
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
  });
});
