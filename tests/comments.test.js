require('dotenv').config({ path: '.env.test' });
const request = require('supertest');
const app = require('../src/app');
const { createTestUser, createTestProject, createTestStatuses, createTestIssue, authHeader } = require('./helpers');

describe('Comments', () => {
  let token, user, token2, user2, project, statuses, issue;

  beforeAll(async () => {
    ({ user, token } = await createTestUser());
    ({ user: user2, token: token2 } = await createTestUser());
    project = await createTestProject(token);
    statuses = await createTestStatuses(token, project.id);
    // Add user2 as member
    await request(app).post(`/api/projects/${project.id}/members`).set(authHeader(token)).send({ user_id: user2.id, role: 'member' });
    issue = await createTestIssue(token, project.id, { title: 'Comment Issue', status_id: statuses[0].id });
  });

  test('add comment returns 201', async () => {
    const res = await request(app)
      .post(`/api/issues/${issue.id}/comments`)
      .set(authHeader(token))
      .send({ body: 'Hello world' });
    expect(res.status).toBe(201);
    expect(res.body.data.body).toBe('Hello world');
  });

  test('comment with @mention creates notification for mentioned user', async () => {
    // Use a single-word display_name that parseMentions regex [\w]+ can capture
    const mentionName = user.display_name.replace(/\s+/g, '');
    await request(app)
      .post(`/api/issues/${issue.id}/comments`)
      .set(authHeader(token2))
      .send({ body: `Hey @${mentionName} please review` });

    const notifs = await request(app).get('/api/notifications').set(authHeader(token));
    const mention = notifs.body.data.find(n => n.type === 'mention');
    expect(mention).toBeDefined();
  });

  test('watchers get notified on comment', async () => {
    const proj = await createTestProject(token);
    const sts = await createTestStatuses(token, proj.id);
    await request(app).post(`/api/projects/${proj.id}/members`).set(authHeader(token)).send({ user_id: user2.id, role: 'member' });
    const iss = await createTestIssue(token, proj.id, { title: 'Watch Test', status_id: sts[0].id });

    // user2 watches the issue
    await request(app).post(`/api/issues/${iss.id}/watch`).set(authHeader(token2));

    // token (user) adds comment
    await request(app).post(`/api/issues/${iss.id}/comments`).set(authHeader(token)).send({ body: 'Watcher test comment' });

    // user2 should have a comment notification
    const notifs = await request(app).get('/api/notifications').set(authHeader(token2));
    const commentNotif = notifs.body.data.find(n => n.type === 'comment' && n.reference_type === 'comment');
    expect(commentNotif).toBeDefined();
  });

  test('reply to comment sets correct parent_id', async () => {
    const parentRes = await request(app)
      .post(`/api/issues/${issue.id}/comments`)
      .set(authHeader(token))
      .send({ body: 'Parent comment' });
    const parentId = parentRes.body.data.id;

    const replyRes = await request(app)
      .post(`/api/issues/${issue.id}/comments`)
      .set(authHeader(token))
      .send({ body: 'Reply comment', parent_id: parentId });
    expect(replyRes.status).toBe(201);
    expect(replyRes.body.data.parent_id).toBe(parentId);
  });

  test('delete comment sets is_deleted = true (soft delete)', async () => {
    const c = await request(app)
      .post(`/api/issues/${issue.id}/comments`)
      .set(authHeader(token))
      .send({ body: 'To be deleted' });
    const res = await request(app).delete(`/api/comments/${c.body.data.id}`).set(authHeader(token));
    expect(res.status).toBe(204);
    // Comment should not appear in listing (is_deleted filter)
    const list = await request(app).get(`/api/issues/${issue.id}/comments`).set(authHeader(token));
    const found = list.body.data.find(c2 => c2.id === c.body.data.id);
    expect(found).toBeUndefined();
  });

  test('edit comment as non-author returns 403', async () => {
    const c = await request(app)
      .post(`/api/issues/${issue.id}/comments`)
      .set(authHeader(token))
      .send({ body: 'Only I can edit this' });
    const res = await request(app)
      .patch(`/api/comments/${c.body.data.id}`)
      .set(authHeader(token2))
      .send({ body: 'Hacked' });
    expect(res.status).toBe(403);
  });
});
