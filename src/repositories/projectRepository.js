const pool = require('../db/pool');

async function createProject(client, { key, name, description, owner_id, sprint_duration_days }) {
  const { rows: [project] } = await client.query(
    `INSERT INTO projects (key, name, description, owner_id, sprint_duration_days)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [key, name, description || null, owner_id, sprint_duration_days || 14]
  );
  return project;
}

async function findById(id) {
  const { rows: [project] } = await pool.query(
    'SELECT * FROM projects WHERE id = $1',
    [id]
  );
  return project;
}

async function findAllForUser(userId) {
  const { rows } = await pool.query(
    `SELECT p.* FROM projects p
     JOIN project_members pm ON pm.project_id = p.id
     WHERE pm.user_id = $1
     ORDER BY p.created_at DESC`,
    [userId]
  );
  return rows;
}

async function updateProject(id, fields) {
  const keys = Object.keys(fields);
  if (keys.length === 0) return findById(id);
  const setClause = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
  const values = [id, ...keys.map(k => fields[k])];
  const { rows: [project] } = await pool.query(
    `UPDATE projects SET ${setClause}, updated_at = NOW() WHERE id = $1 RETURNING *`,
    values
  );
  return project;
}

async function addMember(client, { project_id, user_id, role }) {
  const { rows: [member] } = await client.query(
    `INSERT INTO project_members (project_id, user_id, role)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [project_id, user_id, role]
  );
  return member;
}

async function findMember(project_id, user_id) {
  const { rows: [member] } = await pool.query(
    'SELECT * FROM project_members WHERE project_id = $1 AND user_id = $2',
    [project_id, user_id]
  );
  return member;
}

async function getMembers(project_id) {
  const { rows } = await pool.query(
    `SELECT pm.*, u.email, u.display_name, u.avatar_url
     FROM project_members pm
     JOIN users u ON u.id = pm.user_id
     WHERE pm.project_id = $1
     ORDER BY pm.joined_at ASC`,
    [project_id]
  );
  return rows;
}

async function createStatus(client, { project_id, name, category, position }) {
  const { rows: [status] } = await client.query(
    `INSERT INTO statuses (project_id, name, category, position)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [project_id, name, category, position]
  );
  return status;
}

async function getStatuses(project_id) {
  const { rows } = await pool.query(
    'SELECT * FROM statuses WHERE project_id = $1 ORDER BY position ASC',
    [project_id]
  );
  return rows;
}

async function createTransition(client, { project_id, from_status_id, to_status_id, validation_rules, auto_actions }) {
  const { rows: [transition] } = await client.query(
    `INSERT INTO workflow_transitions (project_id, from_status_id, to_status_id, validation_rules, auto_actions)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [project_id, from_status_id, to_status_id, JSON.stringify(validation_rules), JSON.stringify(auto_actions)]
  );
  return transition;
}

async function getTransitions(project_id) {
  const { rows } = await pool.query(
    'SELECT * FROM workflow_transitions WHERE project_id = $1',
    [project_id]
  );
  return rows;
}

async function incrementIssueCounter(client, project_id) {
  const { rows: [row] } = await client.query(
    `UPDATE projects SET issue_counter = issue_counter + 1
     WHERE id = $1
     RETURNING key, issue_counter`,
    [project_id]
  );
  return row;
}

module.exports = {
  createProject,
  findById,
  findAllForUser,
  updateProject,
  addMember,
  findMember,
  getMembers,
  createStatus,
  getStatuses,
  createTransition,
  getTransitions,
  incrementIssueCounter,
};
