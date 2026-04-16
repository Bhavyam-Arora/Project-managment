require('dotenv').config();
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

async function seed() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Users
    const passwordHash = await bcrypt.hash('password123', 10);

    const { rows: [alice] } = await client.query(
      `INSERT INTO users (email, password_hash, display_name)
       VALUES ($1, $2, $3)
       ON CONFLICT (email) DO UPDATE SET display_name = EXCLUDED.display_name
       RETURNING *`,
      ['alice@example.com', passwordHash, 'Alice']
    );

    const { rows: [bob] } = await client.query(
      `INSERT INTO users (email, password_hash, display_name)
       VALUES ($1, $2, $3)
       ON CONFLICT (email) DO UPDATE SET display_name = EXCLUDED.display_name
       RETURNING *`,
      ['bob@example.com', passwordHash, 'Bob']
    );

    // 2. Project
    const { rows: [project] } = await client.query(
      `INSERT INTO projects (key, name, description, owner_id, sprint_duration_days)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (key) DO UPDATE SET name = EXCLUDED.name
       RETURNING *`,
      ['DEMO', 'Demo Project', 'A demo project for testing', alice.id, 14]
    );

    // 3. Project members
    await client.query(
      `INSERT INTO project_members (project_id, user_id, role)
       VALUES ($1, $2, $3)
       ON CONFLICT (project_id, user_id) DO NOTHING`,
      [project.id, alice.id, 'admin']
    );

    await client.query(
      `INSERT INTO project_members (project_id, user_id, role)
       VALUES ($1, $2, $3)
       ON CONFLICT (project_id, user_id) DO NOTHING`,
      [project.id, bob.id, 'member']
    );

    // 4. Statuses
    const statusDefs = [
      { name: 'To Do',       category: 'todo',        position: 0 },
      { name: 'In Progress', category: 'in_progress', position: 1 },
      { name: 'In Review',   category: 'in_progress', position: 2 },
      { name: 'Done',        category: 'done',         position: 3 },
    ];

    const statuses = {};
    for (const s of statusDefs) {
      const { rows: [status] } = await client.query(
        `INSERT INTO statuses (project_id, name, category, position)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (project_id, name) DO UPDATE SET category = EXCLUDED.category
         RETURNING *`,
        [project.id, s.name, s.category, s.position]
      );
      statuses[s.name] = status;
    }

    // 5. Workflow transitions
    const transitions = [
      {
        from: 'To Do', to: 'In Progress',
        validation_rules: [], auto_actions: []
      },
      {
        from: 'In Progress', to: 'In Review',
        validation_rules: [{ type: 'required_field', field: 'assignee_id', message: 'Issue must be assigned before moving to review' }],
        auto_actions: []
      },
      {
        from: 'In Review', to: 'Done',
        validation_rules: [],
        auto_actions: [{ type: 'assign_field', field: 'assignee_id', value: 'reporter_id' }]
      },
      {
        from: 'In Review', to: 'In Progress',
        validation_rules: [], auto_actions: []
      },
    ];

    for (const t of transitions) {
      await client.query(
        `INSERT INTO workflow_transitions (project_id, from_status_id, to_status_id, validation_rules, auto_actions)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (project_id, from_status_id, to_status_id) DO NOTHING`,
        [project.id, statuses[t.from].id, statuses[t.to].id, JSON.stringify(t.validation_rules), JSON.stringify(t.auto_actions)]
      );
    }

    // 6. Sprint
    const today = new Date();
    const startDate = today.toISOString().split('T')[0];
    const endDate = new Date(today.getTime() + 13 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const { rows: [sprint] } = await client.query(
      `INSERT INTO sprints (project_id, sprint_number, name, start_date, end_date, status)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (project_id, sprint_number) DO UPDATE SET name = EXCLUDED.name
       RETURNING *`,
      [project.id, 1, 'Sprint 1', startDate, endDate, 'active']
    );

    // 7. Issues — need to update issue_counter for project
    // Epic
    await client.query(
      `UPDATE projects SET issue_counter = issue_counter + 1 WHERE id = $1`,
      [project.id]
    );
    const { rows: [epic] } = await client.query(
      `INSERT INTO issues (issue_key, project_id, type, title, status_id, priority, reporter_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (issue_key) DO UPDATE SET title = EXCLUDED.title
       RETURNING *`,
      ['DEMO-1', project.id, 'epic', 'Build Authentication System', statuses['To Do'].id, 'high', alice.id]
    );

    // Story
    await client.query(
      `UPDATE projects SET issue_counter = issue_counter + 1 WHERE id = $1`,
      [project.id]
    );
    const { rows: [story] } = await client.query(
      `INSERT INTO issues (issue_key, project_id, sprint_id, parent_id, type, title, status_id, priority, assignee_id, reporter_id, story_points)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT (issue_key) DO UPDATE SET title = EXCLUDED.title
       RETURNING *`,
      ['DEMO-2', project.id, sprint.id, epic.id, 'story', 'OAuth Login Flow', statuses['In Progress'].id, 'medium', bob.id, alice.id, 5]
    );

    // Bug
    await client.query(
      `UPDATE projects SET issue_counter = issue_counter + 1 WHERE id = $1`,
      [project.id]
    );
    await client.query(
      `INSERT INTO issues (issue_key, project_id, type, title, status_id, priority, assignee_id, reporter_id, story_points)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (issue_key) DO UPDATE SET title = EXCLUDED.title
       RETURNING *`,
      ['DEMO-3', project.id, 'bug', 'Token refresh fails', statuses['To Do'].id, 'critical', alice.id, alice.id, 2]
    );

    // 8. Custom field definitions
    await client.query(
      `INSERT INTO custom_field_definitions (project_id, name, field_type)
       VALUES ($1, $2, $3)
       ON CONFLICT (project_id, name) DO NOTHING`,
      [project.id, 'Customer Name', 'text']
    );

    await client.query(
      `INSERT INTO custom_field_definitions (project_id, name, field_type, options)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (project_id, name) DO NOTHING`,
      [project.id, 'Region', 'dropdown', JSON.stringify(['North', 'South', 'East', 'West'])]
    );

    await client.query('COMMIT');
    console.log('Seed complete. Login: alice@example.com / password123');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Seed failed:', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
