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
    // Create some issues to search
    await createTestIssue(token, project.id, { title: 'OAuth login feature', type: 'story', status_id: statuses[0].id });
    await createTestIssue(token, project.id, { title: 'Fix authentication bug', type: 'bug', status_id: statuses[0].id });
    await createTestIssue(token, project.id, { title: 'Dashboard UI work', type: 'task', status_id: statuses[0].id });
  });

  test('search with q returns matching issues ordered by relevance', async () => {
    const res = await request(app)
      .get(`/api/search?q=OAuth&project_id=${project.id}`)
      .set(authHeader(token));
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
    expect(res.body.data[0].title.toLowerCase()).toContain('oauth');
  });

  test('search with project_id filter returns only that project issues', async () => {
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

  test('search with status_id filter returns only matching status', async () => {
    const res = await request(app)
      .get(`/api/search?project_id=${project.id}&status_id=${statuses[0].id}`)
      .set(authHeader(token));
    expect(res.status).toBe(200);
    res.body.data.forEach(issue => {
      expect(issue.status_id).toBe(statuses[0].id);
    });
  });

  test('search with cursor returns second page with no duplicates', async () => {
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

  test('search with no q and no project_id returns 400', async () => {
    const res = await request(app).get('/api/search').set(authHeader(token));
    expect(res.status).toBe(400);
  });
});
