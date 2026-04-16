const request = require('supertest');
const app = require('../src/app');

let userCounter = 0;

async function createTestUser(overrides = {}) {
  userCounter++;
  const email = overrides.email || `testuser${userCounter}_${Date.now()}@example.com`;
  const password = overrides.password || 'password123';
  const display_name = overrides.display_name || `TestUser${userCounter}_${Date.now()}`;

  const res = await request(app)
    .post('/api/auth/register')
    .send({ email, password, display_name });

  return { user: res.body.data.user, token: res.body.data.token, rawPassword: password };
}

async function getAuthToken(email, password) {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ email, password });
  return res.body.data.token;
}

async function createTestProject(token, overrides = {}) {
  const suffix = Date.now().toString().slice(-4);
  const res = await request(app)
    .post('/api/projects')
    .set('Authorization', `Bearer ${token}`)
    .send({
      name: overrides.name || `Test Project ${suffix}`,
      key: overrides.key || `T${suffix}`,
      description: overrides.description || 'A test project',
    });
  return res.body.data;
}

async function createTestStatuses(token, projectId) {
  const statusDefs = [
    { name: 'To Do',       category: 'todo',        position: 0 },
    { name: 'In Progress', category: 'in_progress', position: 1 },
    { name: 'In Review',   category: 'in_progress', position: 2 },
    { name: 'Done',        category: 'done',         position: 3 },
  ];
  const statuses = [];
  for (const s of statusDefs) {
    const res = await request(app)
      .post(`/api/projects/${projectId}/statuses`)
      .set('Authorization', `Bearer ${token}`)
      .send(s);
    statuses.push(res.body.data);
  }
  return statuses;
}

async function createTestTransitions(token, projectId, statuses) {
  const byName = Object.fromEntries(statuses.map(s => [s.name, s]));
  const transitions = [
    { from: 'To Do', to: 'In Progress', validation_rules: [], auto_actions: [] },
    {
      from: 'In Progress', to: 'In Review',
      validation_rules: [{ type: 'required_field', field: 'assignee_id', message: 'Must be assigned' }],
      auto_actions: [],
    },
    {
      from: 'In Review', to: 'Done',
      validation_rules: [],
      auto_actions: [{ type: 'assign_field', field: 'assignee_id', value: 'reporter_id' }],
    },
    { from: 'In Review', to: 'In Progress', validation_rules: [], auto_actions: [] },
  ];

  const results = [];
  for (const t of transitions) {
    const res = await request(app)
      .post(`/api/projects/${projectId}/workflow-transitions`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        from_status_id: byName[t.from].id,
        to_status_id: byName[t.to].id,
        validation_rules: t.validation_rules,
        auto_actions: t.auto_actions,
      });
    results.push(res.body.data);
  }
  return results;
}

async function createTestIssue(token, projectId, overrides = {}) {
  const res = await request(app)
    .post(`/api/projects/${projectId}/issues`)
    .set('Authorization', `Bearer ${token}`)
    .send({
      type: overrides.type || 'task',
      title: overrides.title || 'Test Issue',
      priority: overrides.priority || 'medium',
      ...overrides,
    });
  return res.body.data;
}

function authHeader(token) {
  return { Authorization: `Bearer ${token}` };
}

module.exports = {
  createTestUser,
  getAuthToken,
  createTestProject,
  createTestStatuses,
  createTestTransitions,
  createTestIssue,
  authHeader,
};
