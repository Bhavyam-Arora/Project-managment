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
    await request(app).post(`/api/projects/${project.id}/members`).set(authHeader(token)).send({ user_id: user2.id, role: 'member' });
    issue = await createTestIssue(token, project.id, { title: 'Comment Issue', status_id: statuses[0].id });
  });

  // ── Existing tests ──────────────────────────────────────────────────────────

  test('TC-C01 add comment returns 201', async () => {
    const res = await request(app)
      .post(`/api/issues/${issue.id}/comments`)
      .set(authHeader(token))
      .send({ body: 'Hello world' });
    expect(res.status).toBe(201);
    expect(res.body.data.body).toBe('Hello world');
  });

  test('TC-C02 comment with @mention creates notification for mentioned user', async () => {
    const mentionName = user.display_name.replace(/\s+/g, '');
    await request(app)
      .post(`/api/issues/${issue.id}/comments`)
      .set(authHeader(token2))
      .send({ body: `Hey @${mentionName} please review` });
    const notifs = await request(app).get('/api/notifications').set(authHeader(token));
    const mention = notifs.body.data.find(n => n.type === 'mention');
    expect(mention).toBeDefined();
  });

  test('TC-C03 watchers get notified on comment', async () => {
    const proj = await createTestProject(token);
    const sts = await createTestStatuses(token, proj.id);
    await request(app).post(`/api/projects/${proj.id}/members`).set(authHeader(token)).send({ user_id: user2.id, role: 'member' });
    const iss = await createTestIssue(token, proj.id, { title: 'Watch Test', status_id: sts[0].id });

    await request(app).post(`/api/issues/${iss.id}/watch`).set(authHeader(token2));
    await request(app).post(`/api/issues/${iss.id}/comments`).set(authHeader(token)).send({ body: 'Watcher test comment' });

    const notifs = await request(app).get('/api/notifications').set(authHeader(token2));
    const commentNotif = notifs.body.data.find(n => n.type === 'comment' && n.reference_type === 'comment');
    expect(commentNotif).toBeDefined();
  });

  test('TC-C04 reply to comment sets correct parent_id', async () => {
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

  test('TC-C05 delete comment sets is_deleted = true (soft delete)', async () => {
    const c = await request(app)
      .post(`/api/issues/${issue.id}/comments`)
      .set(authHeader(token))
      .send({ body: 'To be deleted' });
    const res = await request(app).delete(`/api/comments/${c.body.data.id}`).set(authHeader(token));
    expect(res.status).toBe(204);
    const list = await request(app).get(`/api/issues/${issue.id}/comments`).set(authHeader(token));
    const found = list.body.data.find(c2 => c2.id === c.body.data.id);
    expect(found).toBeUndefined();
  });

  test('TC-C06 edit comment as non-author returns 403', async () => {
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

  // ── New tests ────────────────────────────────────────────────────────────────

  test('TC-C07 edit comment as author returns 200 with updated body', async () => {
    const c = await request(app)
      .post(`/api/issues/${issue.id}/comments`)
      .set(authHeader(token))
      .send({ body: 'Original body' });
    const res = await request(app)
      .patch(`/api/comments/${c.body.data.id}`)
      .set(authHeader(token))
      .send({ body: 'Updated body' });
    expect(res.status).toBe(200);
    expect(res.body.data.body).toBe('Updated body');
  });

  test('TC-C08 add comment with empty body returns 422 VALIDATION_ERROR', async () => {
    const res = await request(app)
      .post(`/api/issues/${issue.id}/comments`)
      .set(authHeader(token))
      .send({ body: '' });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  test('TC-C09 get comments for issue returns list with author info', async () => {
    await request(app)
      .post(`/api/issues/${issue.id}/comments`)
      .set(authHeader(token))
      .send({ body: 'Listable comment' });
    const res = await request(app)
      .get(`/api/issues/${issue.id}/comments`)
      .set(authHeader(token));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);
    expect(res.body.data[0].author_id).toBeDefined();
  });

  test('TC-C10 @mention of non-existent display_name does not create extra notification', async () => {
    const notifsBefore = await request(app).get('/api/notifications').set(authHeader(token));
    const mentionsBefore = notifsBefore.body.data.filter(n => n.type === 'mention').length;

    await request(app)
      .post(`/api/issues/${issue.id}/comments`)
      .set(authHeader(token2))
      .send({ body: 'Hey @GhostUser99999 check this out' });

    const notifsAfter = await request(app).get('/api/notifications').set(authHeader(token));
    const mentionsAfter = notifsAfter.body.data.filter(n => n.type === 'mention').length;
    expect(mentionsAfter).toBe(mentionsBefore);
  });

  test('TC-C11 project admin can soft-delete any member comment returns 204', async () => {
    const c = await request(app)
      .post(`/api/issues/${issue.id}/comments`)
      .set(authHeader(token2))
      .send({ body: 'Member wrote this' });
    // token is the project admin — should be able to delete token2's comment
    const res = await request(app)
      .delete(`/api/comments/${c.body.data.id}`)
      .set(authHeader(token));
    expect(res.status).toBe(204);
  });
});
