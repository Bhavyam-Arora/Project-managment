# CLAUDE.md — AI Build Instructions
# Project Management Platform Backend

This file is the complete instruction set for building this project phase by phase.
Read the entire file before starting. Each phase builds on the previous one.
Do not skip ahead. Complete every step in a phase before moving to the next phase.

---

## Stack

- **Runtime:** Node.js 20 LTS
- **Framework:** Express.js
- **Database:** PostgreSQL 16
- **DB Driver:** node-postgres (pg) — raw SQL only, no ORM
- **Auth:** JWT (jsonwebtoken + bcryptjs)
- **WebSocket:** Socket.io
- **Validation:** Zod
- **Testing:** Jest + Supertest
- **Hosting:** Render
- **Containers:** Docker + docker-compose

---

## Project Folder Structure

Create this exact structure before writing any code:

```
project-management-backend/
│
├── .env
├── .env.test
├── .gitignore
├── docker-compose.yml
├── Dockerfile
├── package.json
│
├── migrations/
│   ├── runner.js
│   ├── 001_create_users.sql
│   ├── 002_create_projects.sql
│   ├── 003_create_project_members.sql
│   ├── 004_create_statuses.sql
│   ├── 005_create_workflow_transitions.sql
│   ├── 006_create_sprints.sql
│   ├── 007_create_issues.sql
│   ├── 008_create_issue_labels.sql
│   ├── 009_create_custom_field_definitions.sql
│   ├── 010_create_custom_field_values.sql
│   ├── 011_create_comments.sql
│   ├── 012_create_comment_mentions.sql
│   ├── 013_create_watchers.sql
│   ├── 014_create_activity_log.sql
│   └── 015_create_notifications.sql
│
├── seeds/
│   └── seed.js
│
├── src/
│   ├── app.js
│   ├── server.js
│   │
│   ├── db/
│   │   └── pool.js
│   │
│   ├── middleware/
│   │   ├── auth.js
│   │   ├── projectAccess.js
│   │   ├── validate.js
│   │   └── errorHandler.js
│   │
│   ├── repositories/
│   │   ├── userRepository.js
│   │   ├── projectRepository.js
│   │   ├── issueRepository.js
│   │   ├── sprintRepository.js
│   │   ├── commentRepository.js
│   │   ├── activityRepository.js
│   │   ├── notificationRepository.js
│   │   └── searchRepository.js
│   │
│   ├── services/
│   │   ├── authService.js
│   │   ├── issueService.js
│   │   ├── sprintService.js
│   │   ├── commentService.js
│   │   ├── notificationService.js
│   │   └── workflowEngine.js
│   │
│   ├── routes/
│   │   ├── index.js
│   │   ├── auth.js
│   │   ├── projects.js
│   │   ├── issues.js
│   │   ├── sprints.js
│   │   ├── comments.js
│   │   ├── activity.js
│   │   ├── notifications.js
│   │   ├── watchers.js
│   │   └── search.js
│   │
│   ├── sockets/
│   │   ├── index.js
│   │   ├── handlers.js
│   │   └── presence.js
│   │
│   └── utils/
│       ├── jwt.js
│       ├── cursor.js
│       ├── password.js
│       └── mentions.js
│
└── tests/
    ├── setup.js
    ├── helpers.js
    ├── auth.test.js
    ├── projects.test.js
    ├── issues.test.js
    ├── sprints.test.js
    ├── workflow.test.js
    ├── comments.test.js
    └── search.test.js
```

---

## Environment Variables

### `.env` (local development)
```
NODE_ENV=development
PORT=3000
DB_HOST=localhost
DB_PORT=5432
DB_NAME=pm_platform
DB_USER=postgres
DB_PASSWORD=postgres
JWT_SECRET=local_dev_secret_minimum_32_chars_long
JWT_EXPIRES_IN=24h
CORS_ORIGIN=http://localhost:3001
```

### `.env.test`
```
NODE_ENV=test
PORT=3001
DB_HOST=localhost
DB_PORT=5433
DB_NAME=pm_platform_test
DB_USER=postgres
DB_PASSWORD=postgres
JWT_SECRET=test_secret_minimum_32_chars_long
JWT_EXPIRES_IN=1h
```

### `.gitignore`
```
node_modules/
.env
.env.test
coverage/
dist/
```

---

## package.json scripts

```json
{
  "scripts": {
    "start":      "node src/server.js",
    "dev":        "nodemon src/server.js",
    "migrate":    "node migrations/runner.js",
    "seed":       "node seeds/seed.js",
    "test":       "NODE_ENV=test jest --runInBand --forceExit",
    "test:watch": "NODE_ENV=test jest --watchAll --runInBand"
  },
  "jest": {
    "testEnvironment": "node",
    "globalSetup": "./tests/setup.js"
  }
}
```

---

## Dependencies

### Production
```
express pg bcryptjs jsonwebtoken socket.io zod dotenv cors helmet morgan uuid
```

### Development
```
jest supertest nodemon
```

---

---

# PHASE 1 — Foundation
# Goal: Running server, database connected, all tables created, seed data inserted

---

## Step 1.1 — Docker Setup

Create `docker-compose.yml`:

```yaml
version: '3.8'
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: pm_platform
    ports:
      - "5432:5432"
    volumes:
      - pg_data:/var/lib/postgresql/data

  postgres_test:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: pm_platform_test
    ports:
      - "5433:5432"

  app:
    build: .
    ports:
      - "3000:3000"
    env_file: .env
    depends_on:
      - postgres

volumes:
  pg_data:
```

Create `Dockerfile`:

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3000
CMD ["node", "src/server.js"]
```

---

## Step 1.2 — Database Connection Pool

Create `src/db/pool.js`:

- Import `Pool` from `pg`
- If `process.env.DATABASE_URL` exists, create pool with `connectionString` and `ssl: { rejectUnauthorized: false }` — this is for Render deployment
- Otherwise create pool with individual `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` from environment variables
- Add `pool.on('error')` handler that logs unexpected errors
- Export the pool as a singleton

---

## Step 1.3 — Migration Files

Create every migration file inside `migrations/`. Each file must be idempotent — use `CREATE TABLE IF NOT EXISTS` and `CREATE INDEX IF NOT EXISTS` so running migrations twice does not error.

### `001_create_users.sql`
```sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  email         VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  display_name  VARCHAR(100) NOT NULL,
  avatar_url    VARCHAR(500),
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
```

### `002_create_projects.sql`
```sql
CREATE TABLE IF NOT EXISTS projects (
  id                   UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  key                  VARCHAR(10)  UNIQUE NOT NULL,
  name                 VARCHAR(255) NOT NULL,
  description          TEXT,
  owner_id             UUID         NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  issue_counter        INTEGER      NOT NULL DEFAULT 0,
  sprint_duration_days INTEGER      NOT NULL DEFAULT 14,
  created_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_projects_owner ON projects(owner_id);
```

### `003_create_project_members.sql`
```sql
CREATE TABLE IF NOT EXISTS project_members (
  project_id UUID        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id    UUID        NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
  role       VARCHAR(20) NOT NULL DEFAULT 'member'
             CHECK (role IN ('admin', 'member', 'viewer')),
  joined_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (project_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_project_members_user ON project_members(user_id);
```

### `004_create_statuses.sql`
```sql
CREATE TABLE IF NOT EXISTS statuses (
  id         UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID         NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name       VARCHAR(100) NOT NULL,
  category   VARCHAR(20)  NOT NULL
             CHECK (category IN ('todo', 'in_progress', 'done')),
  position   INTEGER      NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, name)
);

CREATE INDEX IF NOT EXISTS idx_statuses_project  ON statuses(project_id);
CREATE INDEX IF NOT EXISTS idx_statuses_position ON statuses(project_id, position);
```

### `005_create_workflow_transitions.sql`
```sql
CREATE TABLE IF NOT EXISTS workflow_transitions (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id       UUID        NOT NULL REFERENCES projects(id)  ON DELETE CASCADE,
  from_status_id   UUID        NOT NULL REFERENCES statuses(id)  ON DELETE CASCADE,
  to_status_id     UUID        NOT NULL REFERENCES statuses(id)  ON DELETE CASCADE,
  validation_rules JSONB       NOT NULL DEFAULT '[]',
  auto_actions     JSONB       NOT NULL DEFAULT '[]',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, from_status_id, to_status_id)
);

CREATE INDEX IF NOT EXISTS idx_transitions_project    ON workflow_transitions(project_id);
CREATE INDEX IF NOT EXISTS idx_transitions_from       ON workflow_transitions(from_status_id);
CREATE INDEX IF NOT EXISTS idx_transitions_project_from ON workflow_transitions(project_id, from_status_id);
```

### `006_create_sprints.sql`
```sql
CREATE TABLE IF NOT EXISTS sprints (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    UUID         NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  sprint_number INTEGER      NOT NULL DEFAULT 1,
  name          VARCHAR(255) NOT NULL,
  goal          TEXT,
  start_date    DATE,
  end_date      DATE,
  status        VARCHAR(20)  NOT NULL DEFAULT 'planning'
                CHECK (status IN ('planning', 'active', 'completed')),
  velocity      INTEGER,
  completed_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, sprint_number)
);

CREATE INDEX IF NOT EXISTS idx_sprints_project ON sprints(project_id);
CREATE INDEX IF NOT EXISTS idx_sprints_status  ON sprints(status);
```

### `007_create_issues.sql`
```sql
CREATE TABLE IF NOT EXISTS issues (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_key     VARCHAR(20)  UNIQUE NOT NULL,
  project_id    UUID         NOT NULL REFERENCES projects(id)  ON DELETE CASCADE,
  sprint_id     UUID                  REFERENCES sprints(id)   ON DELETE SET NULL,
  parent_id     UUID                  REFERENCES issues(id)    ON DELETE SET NULL,
  type          VARCHAR(20)  NOT NULL
                CHECK (type IN ('epic', 'story', 'task', 'bug', 'subtask')),
  title         VARCHAR(500) NOT NULL,
  description   TEXT,
  status_id     UUID         NOT NULL REFERENCES statuses(id),
  priority      VARCHAR(20)  NOT NULL DEFAULT 'medium'
                CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  assignee_id   UUID                  REFERENCES users(id) ON DELETE SET NULL,
  reporter_id   UUID         NOT NULL REFERENCES users(id),
  story_points  INTEGER,
  version       INTEGER      NOT NULL DEFAULT 1,
  search_vector TSVECTOR GENERATED ALWAYS AS (
    to_tsvector('english',
      coalesce(title, '') || ' ' || coalesce(description, ''))
  ) STORED,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_issues_project   ON issues(project_id);
CREATE INDEX IF NOT EXISTS idx_issues_sprint    ON issues(sprint_id);
CREATE INDEX IF NOT EXISTS idx_issues_status    ON issues(status_id);
CREATE INDEX IF NOT EXISTS idx_issues_assignee  ON issues(assignee_id);
CREATE INDEX IF NOT EXISTS idx_issues_parent    ON issues(parent_id);
CREATE INDEX IF NOT EXISTS idx_issues_type      ON issues(type);
CREATE INDEX IF NOT EXISTS idx_issues_created   ON issues(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_issues_search    ON issues USING GIN(search_vector);
```

### `008_create_issue_labels.sql`
```sql
CREATE TABLE IF NOT EXISTS issue_labels (
  issue_id UUID         NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  label    VARCHAR(100) NOT NULL,
  PRIMARY KEY (issue_id, label)
);
```

### `009_create_custom_field_definitions.sql`
```sql
CREATE TABLE IF NOT EXISTS custom_field_definitions (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID         NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name        VARCHAR(100) NOT NULL,
  field_type  VARCHAR(20)  NOT NULL
              CHECK (field_type IN ('text', 'number', 'dropdown', 'date')),
  options     JSONB,
  is_required BOOLEAN      NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, name)
);

CREATE INDEX IF NOT EXISTS idx_custom_field_defs_project ON custom_field_definitions(project_id);
```

### `010_create_custom_field_values.sql`
```sql
CREATE TABLE IF NOT EXISTS custom_field_values (
  id           UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_id     UUID    NOT NULL REFERENCES issues(id)                   ON DELETE CASCADE,
  field_id     UUID    NOT NULL REFERENCES custom_field_definitions(id) ON DELETE CASCADE,
  value_text   TEXT,
  value_number NUMERIC,
  value_date   DATE,
  value_option VARCHAR(100),
  UNIQUE (issue_id, field_id)
);

CREATE INDEX IF NOT EXISTS idx_custom_values_issue ON custom_field_values(issue_id);
```

### `011_create_comments.sql`
```sql
CREATE TABLE IF NOT EXISTS comments (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_id   UUID        NOT NULL REFERENCES issues(id)   ON DELETE CASCADE,
  author_id  UUID        NOT NULL REFERENCES users(id)    ON DELETE RESTRICT,
  parent_id  UUID                 REFERENCES comments(id) ON DELETE SET NULL,
  body       TEXT        NOT NULL,
  is_deleted BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_comments_issue  ON comments(issue_id);
CREATE INDEX IF NOT EXISTS idx_comments_parent ON comments(parent_id);
```

### `012_create_comment_mentions.sql`
```sql
CREATE TABLE IF NOT EXISTS comment_mentions (
  comment_id UUID NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
  PRIMARY KEY (comment_id, user_id)
);
```

### `013_create_watchers.sql`
```sql
CREATE TABLE IF NOT EXISTS watchers (
  issue_id   UUID        NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  user_id    UUID        NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (issue_id, user_id)
);
```

### `014_create_activity_log.sql`
```sql
CREATE TABLE IF NOT EXISTS activity_log (
  id         UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID         NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  issue_id   UUID                  REFERENCES issues(id)   ON DELETE SET NULL,
  actor_id   UUID         NOT NULL REFERENCES users(id),
  action     VARCHAR(100) NOT NULL,
  old_value  JSONB,
  new_value  JSONB,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activity_project ON activity_log(project_id);
CREATE INDEX IF NOT EXISTS idx_activity_issue   ON activity_log(issue_id);
CREATE INDEX IF NOT EXISTS idx_activity_created ON activity_log(created_at DESC);
```

### `015_create_notifications.sql`
```sql
CREATE TABLE IF NOT EXISTS notifications (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type           VARCHAR(50) NOT NULL
                 CHECK (type IN ('assignment', 'mention', 'status_change', 'comment')),
  reference_id   UUID        NOT NULL,
  reference_type VARCHAR(20) NOT NULL CHECK (reference_type IN ('issue', 'comment')),
  message        TEXT        NOT NULL,
  is_read        BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user   ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(user_id) WHERE is_read = FALSE;
```

---

## Step 1.4 — Migration Runner

Create `migrations/runner.js`:

- Load `.env` with dotenv
- Create a `pg Pool` using env variables
- Connect a client
- Create `_migrations` tracking table if it does not exist — columns: `id SERIAL PRIMARY KEY`, `filename VARCHAR(255) UNIQUE NOT NULL`, `applied_at TIMESTAMPTZ DEFAULT NOW()`
- Query `_migrations` to get a Set of already-applied filenames
- Read all `.sql` files from the migrations directory, sorted alphabetically
- For each file not in the applied set:
  - Read file contents
  - `BEGIN`
  - Execute SQL
  - `INSERT INTO _migrations (filename) VALUES ($1)`
  - `COMMIT`
  - Log `APPLY filename`
- For files already applied: log `SKIP filename`
- If any migration throws: `ROLLBACK`, log the error, `process.exit(1)`
- Release client, end pool

---

## Step 1.5 — Seed Data

Create `seeds/seed.js`:

Insert in this exact order (respect foreign key dependencies):

1. Two users: `alice@example.com` and `bob@example.com`, both with password `password123` (bcrypt hashed with cost 10)

2. One project: key=`DEMO`, name=`Demo Project`, owner=alice, `sprint_duration_days=14`

3. Add alice as admin member, bob as member to the project

4. Four statuses for the project: `To Do (todo, pos 0)`, `In Progress (in_progress, pos 1)`, `In Review (in_progress, pos 2)`, `Done (done, pos 3)`

5. Workflow transitions:
   - `To Do → In Progress`: no rules, no actions
   - `In Progress → In Review`: validation rule `required_field` on `assignee_id`, no actions
   - `In Review → Done`: no rules, auto action `assign_field` setting `assignee_id = reporter_id`
   - `In Review → In Progress`: no rules, no actions

6. One active sprint: `Sprint 1`, sprint_number=1, dates auto-calculated from today using 14 days

7. Three issues:
   - Epic: `Build Authentication System`, To Do, no assignee, no points
   - Story: `OAuth Login Flow`, In Progress, assignee=bob, story_points=5, parent=epic
   - Bug: `Token refresh fails`, To Do, assignee=alice, story_points=2

8. Two custom field definitions for the project: `Customer Name (text)`, `Region (dropdown, options: North/South/East/West)`

---

## Step 1.6 — Minimal Express Server

Create `src/app.js`:
- Import express, cors, helmet, morgan
- Create app
- Apply `helmet()`, `cors({ origin: process.env.CORS_ORIGIN })`, `express.json()`, `morgan('dev')`
- Mount `GET /health` returning `{ status: 'ok', timestamp: new Date() }`
- Mount `/api` with routes (to be created in later phases)
- Apply 404 handler: `{ success: false, error: { code: 'NOT_FOUND' } }`
- Apply global error handler (import from middleware)
- Export app — do NOT call `app.listen()` here

Create `src/server.js`:
- Import http, app, and sockets (to be created in Phase 5)
- Create `http.createServer(app)`
- Call `server.listen(PORT)`
- Log `Server running on port PORT`

---

## Step 1.7 — Verify Phase 1

Run these commands and confirm each succeeds:

```bash
docker-compose up postgres postgres_test -d
npm run migrate
# Should print: APPLY 001_create_users.sql ... APPLY 015_create_notifications.sql
npm run seed
# Should print: Seed complete. Login: alice@example.com / password123
npm run dev
# Should print: Server running on port 3000
```

Confirm: `GET http://localhost:3000/health` returns `{ "status": "ok" }`

Phase 1 is complete when: all 15 tables exist in the database, seed data is present, server starts without errors.

---

---

# PHASE 2 — Authentication + Projects + Statuses + Workflow Setup
# Goal: Users can register, login, create projects, configure board columns, and define workflow rules

---

## Step 2.1 — Utility Functions

### `src/utils/jwt.js`
- `signToken(payload)` — calls `jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN })`
- `verifyToken(token)` — calls `jwt.verify(token, JWT_SECRET)` — throws if invalid or expired
- Export both functions

### `src/utils/password.js`
- `hashPassword(plain)` — calls `bcrypt.hash(plain, 12)` — returns promise
- `comparePassword(plain, hash)` — calls `bcrypt.compare(plain, hash)` — returns promise boolean
- Export both functions

### `src/utils/cursor.js`
- `encode(obj)` — `Buffer.from(JSON.stringify(obj)).toString('base64')`
- `decode(str)` — `JSON.parse(Buffer.from(str, 'base64').toString('utf8'))`
- Export both functions

### `src/utils/mentions.js`
- `parseMentions(text)` — uses regex `/@([\w]+)/g` to extract all mention strings from comment body
- Returns array of display_name strings without the `@` symbol
- Export the function

---

## Step 2.2 — Middleware

### `src/middleware/validate.js`
- Export a factory function `validate(schema)` that returns Express middleware
- Inside middleware: call `schema.safeParse(req.body)`
- If `!result.success`: return `422` with `{ success: false, error: { code: 'VALIDATION_ERROR', details: result.error.errors } }`
- If success: set `req.body = result.data` and call `next()`

### `src/middleware/auth.js`
- Export `authMiddleware` function
- Read `Authorization` header
- If missing or does not start with `Bearer `: return `401 { code: 'UNAUTHORIZED' }`
- Extract token after `Bearer `
- Call `verifyToken(token)`
- On success: set `req.user = { id: decoded.sub, email: decoded.email, display_name: decoded.display_name }` and call `next()`
- On error: return `401 { code: 'TOKEN_INVALID' }`

### `src/middleware/projectAccess.js`
- Export factory function `requireProjectMember(requiredRole = null)`
- Returns Express middleware
- Read `projectId` from `req.params.id` OR `req.params.project_id`
- Query `project_members WHERE project_id = $1 AND user_id = $2` using `req.user.id`
- If no row: return `403 { code: 'NOT_A_MEMBER' }`
- If `requiredRole` specified and `membership.role !== requiredRole`: return `403 { code: 'INSUFFICIENT_ROLE' }`
- Set `req.membership = membership` and call `next()`

### `src/middleware/errorHandler.js`
- Export Express error handler with signature `(err, req, res, next)`
- Read `err.status` (default 500), `err.code` (default 'INTERNAL_ERROR'), `err.message`
- If status 500: `console.error(err)`
- Return `res.status(status).json({ success: false, error: { code, message } })`

---

## Step 2.3 — Auth Service and Routes

### `src/services/authService.js`

`register({ email, password, display_name })`:
- Query users table — if email exists throw `{ message: 'Email already taken', code: 'EMAIL_TAKEN', status: 422 }`
- Hash password with `hashPassword`
- INSERT into users table
- Call `signToken({ sub: user.id, email, display_name })`
- Return `{ token, user: { id, email, display_name } }`

`login({ email, password })`:
- Query users table by email
- If not found: throw `{ message: 'Invalid credentials', code: 'INVALID_CREDENTIALS', status: 401 }`
- Compare password with `comparePassword`
- If fails: same error
- Call `signToken`
- Return `{ token, user: { id, email, display_name } }`

### `src/routes/auth.js`

Define Zod schemas:
- `registerSchema`: email string email format, password string min 8, display_name string min 1 max 100
- `loginSchema`: email string email, password string min 1

`POST /register` — no auth — validate with registerSchema — call authService.register — return 201
`POST /login` — no auth — validate with loginSchema — call authService.login — return 200

---

## Step 2.4 — Project Repository

Create `src/repositories/projectRepository.js` with these functions:

- `createProject(client, { key, name, description, owner_id, sprint_duration_days })` — INSERT into projects, return row
- `findById(id)` — SELECT project by id
- `findAllForUser(userId)` — SELECT projects JOIN project_members WHERE user_id = userId
- `updateProject(id, fields)` — UPDATE projects SET fields WHERE id, return row
- `addMember(client, { project_id, user_id, role })` — INSERT into project_members
- `findMember(project_id, user_id)` — SELECT from project_members
- `getMembers(project_id)` — SELECT project_members JOIN users WHERE project_id
- `createStatus(client, { project_id, name, category, position })` — INSERT into statuses
- `getStatuses(project_id)` — SELECT from statuses WHERE project_id ORDER BY position ASC
- `createTransition(client, { project_id, from_status_id, to_status_id, validation_rules, auto_actions })` — INSERT into workflow_transitions
- `getTransitions(project_id)` — SELECT all transitions for project
- `incrementIssueCounter(client, project_id)` — UPDATE projects SET issue_counter = issue_counter + 1 WHERE id = $1 RETURNING key, issue_counter — this uses FOR UPDATE lock

---

## Step 2.5 — Project Routes

Create `src/routes/projects.js`:

All routes require `authMiddleware`.

`POST /` — create project
- Zod schema: name string min 1, key string regex /^[A-Z0-9]{2,10}$/, description optional string
- INSERT project
- Auto-add creator as admin member in same transaction
- Return 201 with project

`GET /` — list projects for current user
- Call findAllForUser
- Return 200 with projects array

`GET /:id` — get project + members
- Require `requireProjectMember()`
- Return project + members array

`PATCH /:id` — update project
- Require `requireProjectMember('admin')`
- Zod schema: name optional, description optional
- Return 200 with updated project

`POST /:id/members` — add member
- Require `requireProjectMember('admin')`
- Zod schema: user_id string uuid, role enum admin/member/viewer
- Check user exists — if not `404 USER_NOT_FOUND`
- Check not already member — if yes `409 ALREADY_MEMBER`
- Insert member
- Return 201

`POST /:id/statuses` — create status
- Require `requireProjectMember('admin')`
- Zod schema: name string, category enum todo/in_progress/done, position integer
- Return 201 with status

`GET /:id/statuses` — get statuses ordered by position
- Require `requireProjectMember()`
- Return 200 with statuses array

`POST /:id/workflow-transitions` — create transition
- Require `requireProjectMember('admin')`
- Zod schema: from_status_id uuid, to_status_id uuid, validation_rules array default [], auto_actions array default []
- Verify both status IDs belong to this project
- Return 201 with transition

`GET /:id/workflow-transitions` — get all transitions
- Require `requireProjectMember()`
- Return 200 with transitions array

---

## Step 2.6 — Mount Routes and Wire Middleware

Update `src/routes/index.js`:
- Mount `auth.js` at `/auth`
- Mount `projects.js` at `/projects`

Update `src/app.js`:
- Import and mount routes at `/api`
- Import and apply errorHandler as last middleware

---

## Step 2.7 — Verify Phase 2

Test these manually or with a REST client:

```
POST /api/auth/register — should return token
POST /api/auth/login    — should return token
POST /api/projects      — with token, should create project
GET  /api/projects      — should list user's projects
POST /api/projects/:id/statuses          — create board columns
POST /api/projects/:id/workflow-transitions — create transition rules
```

Phase 2 complete when: registration, login, project creation, status setup, and transition creation all work correctly.

---

---

# PHASE 3 — Issues + Workflow Engine + Sprints
# Goal: Full issue lifecycle, workflow transitions enforced, sprint management complete

---

## Step 3.1 — Issue Repository

Create `src/repositories/issueRepository.js`:

- `createIssue(client, data)` — INSERT all issue fields, return row
- `findById(id)` — SELECT issue with JOINs for status name/category, assignee name, reporter name
- `findByProject(projectId, filters, cursor, limit)` — SELECT with optional filters (sprint_id, type, assignee_id, priority, status_id) + cursor WHERE clause + ORDER BY created_at DESC, id DESC + LIMIT
- `updateIssue(client, id, version, fields)` — dynamically build SET clause, add `version = version + 1, updated_at = NOW()`, WHERE id = $N AND version = $N+1 — return updated row or null if version mismatch
- `getBoardByProject(projectId)` — SELECT statuses with their issues via LEFT JOIN, ORDER BY statuses.position, issues.created_at
- `addLabel(client, issue_id, label)` — INSERT into issue_labels ON CONFLICT DO NOTHING
- `removeLabel(issue_id, label)` — DELETE from issue_labels
- `getLabels(issue_id)` — SELECT labels for issue
- `getWatchers(issue_id)` — SELECT user_ids from watchers for issue
- `addWatcher(issue_id, user_id)` — INSERT into watchers ON CONFLICT DO NOTHING
- `removeWatcher(issue_id, user_id)` — DELETE from watchers
- `deleteIssue(id)` — DELETE from issues WHERE id

---

## Step 3.2 — Activity Repository

Create `src/repositories/activityRepository.js`:

- `log(client, { project_id, issue_id, actor_id, action, old_value, new_value })` — INSERT into activity_log
- `getByProject(project_id, filters, cursor, limit)` — SELECT with optional issue_id and action filters, cursor pagination, ORDER BY created_at DESC
- `getByIssue(issue_id, cursor, limit)` — SELECT activity for specific issue

---

## Step 3.3 — Notification Repository

Create `src/repositories/notificationRepository.js`:

- `create({ user_id, type, reference_id, reference_type, message })` — INSERT into notifications
- `createMany(notifications)` — INSERT multiple notifications at once using unnest or loop
- `getForUser(user_id, filters, cursor, limit)` — SELECT notifications WHERE user_id with optional is_read filter
- `markRead(id, user_id)` — UPDATE notifications SET is_read = TRUE WHERE id AND user_id
- `markAllRead(user_id)` — UPDATE notifications SET is_read = TRUE WHERE user_id AND is_read = FALSE

---

## Step 3.4 — Workflow Engine

Create `src/services/workflowEngine.js`:

This is the most important service. Implement `executeTransition(issueId, toStatusId, actorId)`:

```
1. Load issue with JOIN to get current status_id and project_id

2. Query workflow_transitions:
   WHERE project_id     = issue.project_id
     AND from_status_id = issue.status_id
     AND to_status_id   = toStatusId

3. If no transition row found:
   - Query all allowed transitions from current status
   - Throw { code: 'TRANSITION_NOT_ALLOWED', status: 422, allowed_transitions: [...] }

4. Loop through transition.validation_rules array:
   Each rule is an object with a "type" field.

   type = 'required_field':
     if (!issue[rule.field]) push rule.message to errors

   type = 'min_value':
     if (issue[rule.field] === null || issue[rule.field] < rule.value) push rule.message

   type = 'field_equals':
     if (issue[rule.field] !== rule.value) push rule.message

   type = 'no_open_subtasks':
     query COUNT of child issues WHERE status.category != 'done'
     if count > 0 push rule.message

5. If errors.length > 0:
   Throw { code: 'VALIDATION_FAILED', status: 422, validation_errors: errors }

6. BEGIN transaction

7. UPDATE issues SET status_id = toStatusId, version = version + 1, updated_at = NOW()
   WHERE id = issueId AND version = issue.version
   If 0 rows affected: ROLLBACK, throw { code: 'VERSION_CONFLICT', status: 409 }

8. Loop through transition.auto_actions array:

   type = 'assign_field':
     resolve value: if issue[action.value] exists use that field's value, else use literal
     UPDATE issues SET [action.field] = resolvedValue WHERE id = issueId

   type = 'set_value':
     UPDATE issues SET [action.field] = action.value WHERE id = issueId

   type = 'notify':
     resolve targetUserId from action.target ('assignee' → issue.assignee_id, 'reporter' → issue.reporter_id, else literal uuid)
     if targetUserId: INSERT into notifications

9. INSERT into activity_log:
   action = 'issue_status_changed'
   old_value = { status_id: issue.status_id }
   new_value = { status_id: toStatusId }

10. COMMIT

11. Load watchers for issue
12. For each watcher (exclude actorId): INSERT notification

13. Return updated issue
```

---

## Step 3.5 — Issue Service

Create `src/services/issueService.js`:

`createIssue(projectId, userId, data)`:
1. Open transaction client
2. `BEGIN`
3. Call `projectRepository.incrementIssueCounter(client, projectId)` — returns `{ key, issue_counter }`
4. Build `issue_key = key + '-' + issue_counter`
5. Get default status (lowest position for project if status_id not provided)
6. Call `issueRepository.createIssue(client, { ...data, issue_key, project_id: projectId, reporter_id: userId })`
7. If data.labels: loop and call `addLabel(client, issue.id, label)` for each
8. Insert custom_field_values for each custom field if provided
9. Insert reporter into watchers: `addWatcher` (use client)
10. Call `activityRepository.log(client, { project_id, issue_id, actor_id: userId, action: 'issue_created', new_value: { issue_key, title } })`
11. `COMMIT`
12. If assignee_id and assignee_id !== userId: create assignment notification
13. Return issue

`updateIssue(issueId, userId, data)`:
1. Destructure `version` from data — if missing throw `{ code: 'VERSION_REQUIRED', status: 422 }`
2. Load current issue to diff old vs new values
3. Open transaction, `BEGIN`
4. Call `issueRepository.updateIssue(client, issueId, version, fields)`
5. If null returned (version mismatch): `ROLLBACK`, throw `{ code: 'VERSION_CONFLICT', status: 409 }`
6. Diff changed fields, log each to activity_log
7. `COMMIT`
8. If assignee changed: create assignment notification for new assignee
9. Notify watchers
10. Return updated issue

---

## Step 3.6 — Issue Routes

Create `src/routes/issues.js`:

`POST /projects/:id/issues` — authMiddleware, requireProjectMember() — create issue
- Zod schema: type enum, title string min 1 max 500, description optional, priority optional enum, assignee_id optional uuid, sprint_id optional uuid, parent_id optional uuid, story_points optional positive int, labels optional string array, custom_fields optional array
- Call issueService.createIssue
- Return 201

`GET /projects/:id/board` — authMiddleware, requireProjectMember() — get board
- Call issueRepository.getBoardByProject
- Group issues by status_id
- Return statuses array each with its issues array

`GET /projects/:id/issues` — authMiddleware, requireProjectMember()
- Query params: sprint_id, type, assignee_id, priority, status_id, cursor, limit (default 20)
- Call issueRepository.findByProject
- Return paginated results with next_cursor

`GET /issues/:id` — authMiddleware
- Load issue, labels, watchers, custom field values
- Return full detail

`PATCH /issues/:id` — authMiddleware
- Zod schema: version integer required, all other fields optional
- Call issueService.updateIssue
- Return 200

`DELETE /issues/:id` — authMiddleware
- Verify user is reporter or admin member
- Delete issue
- Return 204

`POST /issues/:id/transitions` — authMiddleware
- Zod schema: to_status_id uuid required
- Call workflowEngine.executeTransition
- Emit WebSocket events (Phase 5 will wire this)
- Return 200
- On TRANSITION_NOT_ALLOWED: return 422 with allowed_transitions
- On VALIDATION_FAILED: return 422 with validation_errors
- On VERSION_CONFLICT: return 409

---

## Step 3.7 — Sprint Service

Create `src/services/sprintService.js`:

`createSprint(projectId, userId, data)`:
1. Load project to get `sprint_duration_days`
2. Get next sprint_number: SELECT MAX(sprint_number) + 1 for this project
3. Calculate dates if not provided:
   - Find last completed sprint's end_date
   - If found: start_date = end_date + 1 day
   - If not found: start_date = today
   - end_date = start_date + sprint_duration_days - 1
4. INSERT sprint with calculated dates
5. Return sprint

`startSprint(sprintId, projectId)`:
1. Check no other sprint in project has status = 'active' — if yes throw `{ code: 'SPRINT_ALREADY_ACTIVE', status: 422 }`
2. Check start_date and end_date are set — if not throw `{ code: 'MISSING_DATES', status: 422 }`
3. UPDATE sprint SET status = 'active'
4. Return sprint

`completeSprint(sprintId, actorId, carryOverIssueIds)`:
1. Load sprint with all its issues
2. Find incomplete issues: status.category != 'done'
3. Calculate velocity: SUM(story_points) WHERE status.category = 'done'
4. BEGIN transaction
5. For carry-over issues: UPDATE issues SET sprint_id = NULL
6. For other incomplete issues: UPDATE issues SET sprint_id = NULL
7. UPDATE sprints SET status = 'completed', velocity = calculated, completed_at = NOW()
8. Log activity for each moved issue
9. COMMIT
10. Return { sprint, velocity, incomplete_issues }

---

## Step 3.8 — Sprint Routes

Create `src/routes/sprints.js`:

`GET /projects/:id/sprints` — authMiddleware, requireProjectMember() — list sprints
`POST /projects/:id/sprints` — authMiddleware, requireProjectMember() — create sprint (auto-dates)
`PATCH /sprints/:id` — authMiddleware — update sprint
`POST /sprints/:id/start` — authMiddleware — start sprint
`POST /sprints/:id/complete` — authMiddleware — complete sprint with carry-over
`POST /sprints/:id/issues` — authMiddleware — move issues into sprint
`DELETE /sprints/:id` — authMiddleware — delete sprint (issues → backlog)

---

## Step 3.9 — Mount New Routes

Update `src/routes/index.js`:
- Mount `issues.js` at both `/projects` (for project-scoped issue routes) and `/issues` (for individual issue routes)
- Mount `sprints.js` at both `/projects` and `/sprints`

---

## Step 3.10 — Verify Phase 3

Test this full flow:

```
1. Create project with statuses and transitions (Phase 2)
2. Create a sprint — check dates are auto-calculated
3. Create an issue — check issue_key is DEMO-1
4. Try: move issue To Do → Done — should get 422 TRANSITION_NOT_ALLOWED
5. Move issue To Do → In Progress — should succeed
6. Try: move issue In Progress → In Review without assignee — should get 422 VALIDATION_FAILED
7. Assign the issue, then move In Progress → In Review — should succeed
8. Complete sprint — check velocity and incomplete issues in response
```

Phase 3 complete when: all issue CRUD works, workflow engine enforces rules correctly, sprints manage dates automatically.

---

---

# PHASE 4 — Collaboration: Comments, Activity, Notifications, Watchers, Search
# Goal: Teams can communicate on issues, track history, receive notifications, and search

---

## Step 4.1 — Comment Repository

Create `src/repositories/commentRepository.js`:

- `createComment(client, { issue_id, author_id, parent_id, body })` — INSERT, return row
- `findByIssue(issue_id, cursor, limit)` — SELECT with JOIN to users, cursor pagination
- `findById(id)` — SELECT single comment
- `updateComment(id, author_id, body)` — UPDATE WHERE id AND author_id (only author can edit)
- `softDelete(id, author_id)` — UPDATE SET is_deleted = TRUE WHERE id AND author_id
- `addMention(client, comment_id, user_id)` — INSERT into comment_mentions ON CONFLICT DO NOTHING

---

## Step 4.2 — Comment Service

Create `src/services/commentService.js`:

`createComment(issueId, authorId, { body, parent_id })`:
1. Load issue to get project_id
2. BEGIN transaction
3. INSERT comment
4. Parse @mentions from body using `parseMentions(body)`
5. For each mention: look up user by display_name — if found INSERT into comment_mentions
6. Log to activity_log: action = 'comment_added'
7. Auto-watch: ensure author is in watchers
8. COMMIT
9. For each mentioned user: create 'mention' notification
10. Load all watchers for issue
11. For each watcher except author: create 'comment' notification
12. Return comment

---

## Step 4.3 — Comment Routes

Create `src/routes/comments.js`:

`GET /issues/:id/comments` — authMiddleware
- Cursor-paginated comments with replies nested
- Return 200 with comments + next_cursor

`POST /issues/:id/comments` — authMiddleware
- Zod schema: body string min 1, parent_id optional uuid
- Call commentService.createComment
- Return 201

`PATCH /comments/:id` — authMiddleware
- Zod schema: body string min 1
- Verify requester is author
- Update comment
- Return 200

`DELETE /comments/:id` — authMiddleware
- Verify requester is author or project admin
- Soft delete (is_deleted = true)
- Return 204

---

## Step 4.4 — Activity Routes

Create `src/routes/activity.js`:

`GET /projects/:id/activity` — authMiddleware, requireProjectMember()
- Query params: issue_id (optional), action (optional), cursor, limit (default 20)
- Call activityRepository.getByProject
- Return paginated activity feed with actor details

---

## Step 4.5 — Notification Routes

Create `src/routes/notifications.js`:

`GET /notifications` — authMiddleware
- Query params: is_read (optional boolean), cursor, limit (default 20)
- Return paginated notifications for current user

`PATCH /notifications/:id/read` — authMiddleware
- Mark single notification as read
- Verify notification belongs to current user
- Return 200

`PATCH /notifications/read-all` — authMiddleware
- Mark all as read for current user
- Return 200 with count updated

---

## Step 4.6 — Watcher Routes

Create `src/routes/watchers.js`:

`POST /issues/:id/watch` — authMiddleware
- INSERT into watchers (issue_id, user_id) ON CONFLICT DO NOTHING
- Return 201 `{ watching: true }`

`DELETE /issues/:id/watch` — authMiddleware
- DELETE from watchers WHERE issue_id AND user_id
- Return 200 `{ watching: false }`

`GET /issues/:id/watchers` — authMiddleware
- Return list of users watching this issue

---

## Step 4.7 — Search Repository

Create `src/repositories/searchRepository.js`:

`searchIssues({ q, project_id, status_id, assignee_id, priority, type, cursor, limit })`:

Build query dynamically:
1. Start conditions array with `['1=1']` and values array
2. If q: add `i.search_vector @@ websearch_to_tsquery('english', $N)`, push q, increment param index
3. For each optional filter (project_id, status_id, assignee_id, priority, type): if provided add `column = $N` condition
4. If cursor: decode it, add `(i.created_at, i.id) < ($N, $N+1)` condition
5. Push limit + 1 as last value (fetch one extra to detect if there is a next page)
6. Build SELECT with ts_rank if q provided, JOIN statuses and users
7. ORDER BY rank DESC (if q), created_at DESC, id DESC
8. Execute query
9. If rows.length > limit: hasMore = true, results = rows.slice(0, limit)
10. next_cursor = hasMore ? encode({ created_at: last.created_at, id: last.id }) : null
11. Return { results, next_cursor }

---

## Step 4.8 — Search Route

Create `src/routes/search.js`:

`GET /search` — authMiddleware
- Query params: q, project_id, status_id, assignee_id, priority, type, cursor, limit
- Validate project_id is provided OR q is provided
- Call searchRepository.searchIssues
- Return 200 with results + next_cursor

---

## Step 4.9 — Mount All Phase 4 Routes

Update `src/routes/index.js`:
- Mount `comments.js` at `/issues` and `/comments`
- Mount `activity.js` at `/projects`
- Mount `notifications.js` at `/notifications`
- Mount `watchers.js` at `/issues`
- Mount `search.js` at `/search`

---

## Step 4.10 — Verify Phase 4

Test this flow:

```
1. POST /api/issues/:id/comments with body "Great work @alice can you review?"
   → check notification created for alice with type 'mention'

2. GET /api/projects/:id/activity
   → check issue_created and comment_added events appear

3. GET /api/notifications (as alice)
   → should see the mention notification

4. PATCH /api/notifications/read-all
   → all notifications marked read

5. POST /api/issues/:id/watch (as bob)
   → bob now watches the issue

6. Update the issue status (any change)
   → bob should get a notification

7. GET /api/search?q=OAuth&project_id=xxx
   → should return matching issues ranked by relevance
```

Phase 4 complete when: threaded comments work, @mentions trigger notifications, activity feed is accurate, search returns ranked results.

---

---

# PHASE 5 — Real-Time WebSockets + Testing + Deployment
# Goal: Live board updates, complete test suite, deployed on Render

---

## Step 5.1 — Presence Map

Create `src/sockets/presence.js`:

Maintain an in-memory Map with structure: `Map<project_id, Map<user_id, { socket_id, display_name, joined_at }>>`

Export these functions:

- `addPresence(projectId, userId, socketId, displayName)` — add user to project's presence map
- `removePresence(projectId, userId)` — remove user from project's map, delete project entry if empty
- `getPresence(projectId)` — return array of `{ user_id, display_name, joined_at }` for project
- `removeFromAllProjects(socketId)` — scan all projects, remove any entry with matching socketId, return array of affected projectIds

---

## Step 5.2 — Socket.io Server

Create `src/sockets/index.js`:

Keep a module-level `let io = null`.

Export `init(httpServer)`:
1. Create `new Server(httpServer, { cors: { origin: CORS_ORIGIN, methods: ['GET','POST'] } })`
2. Apply auth middleware: `io.use((socket, next) => { verify JWT from socket.handshake.auth.token, set socket.user, call next or next(new Error('UNAUTHORIZED')) })`
3. On `connection`:
   - Auto-join `user:{socket.user.id}` room
   - Register event handlers (see below)
4. Return io

Export `getIO()` — returns io, throws if not initialized

### Event Handlers on Connection

`join_board` `{ project_id }`:
- Verify user is project member (query DB)
- `socket.join('project:' + project_id)`
- `addPresence(project_id, socket.user.id, socket.id, socket.user.display_name)`
- `io.to('project:' + project_id).emit('presence_updated', { project_id, users: getPresence(project_id) })`

`leave_board` `{ project_id }`:
- `socket.leave('project:' + project_id)`
- `removePresence(project_id, socket.user.id)`
- `io.to('project:' + project_id).emit('presence_updated', { project_id, users: getPresence(project_id) })`

`join_issue` `{ issue_id }`:
- `socket.join('issue:' + issue_id)`

`leave_issue` `{ issue_id }`:
- `socket.leave('issue:' + issue_id)`

`replay_events` `{ project_id, since }`:
- Query activity_log WHERE project_id = $1 AND created_at > $2 ORDER BY created_at ASC LIMIT 100
- `socket.emit('replay_batch', { events: rows })`

`disconnect`:
- `const affected = removeFromAllProjects(socket.id)`
- For each projectId in affected: `io.to('project:' + projectId).emit('presence_updated', { project_id: projectId, users: getPresence(projectId) })`

---

## Step 5.3 — Wire WebSocket Events Into Services

After each successful operation, emit the appropriate Socket.io event.
Import `getIO` from `src/sockets/index.js` in each service/route.

### In issueService.js — after createIssue COMMIT:
```javascript
getIO().to('project:' + projectId).emit('issue_created', { issue })
```

### In issueService.js — after updateIssue COMMIT:
```javascript
getIO().to('project:' + issue.project_id).emit('issue_updated', {
  issue_id: issueId,
  changes: diffedFields
})
getIO().to('issue:' + issueId).emit('issue_updated', { issue_id: issueId, changes: diffedFields })
```

### In workflowEngine.js — after COMMIT:
```javascript
getIO().to('project:' + issue.project_id).emit('issue_moved', {
  issue_id: issueId,
  from_status: { id: issue.status_id },
  to_status:   { id: toStatusId }
})
```

### In commentService.js — after COMMIT:
```javascript
getIO().to('issue:' + issueId).emit('comment_added', { issue_id: issueId, comment })
getIO().to('project:' + issue.project_id).emit('comment_added', { issue_id: issueId })
```

### In sprintService.js — after startSprint and completeSprint:
```javascript
getIO().to('project:' + sprint.project_id).emit('sprint_updated', { sprint })
```

### For notifications — after any notification INSERT:
```javascript
getIO().to('user:' + userId).emit('new_notification', { notification })
```

---

## Step 5.4 — Update server.js

Update `src/server.js` to initialize Socket.io:

```javascript
const { init } = require('./sockets')
const server = http.createServer(app)
init(server)
server.listen(PORT, () => console.log(`Server running on port ${PORT}`))
```

---

## Step 5.5 — Test Setup

Create `tests/setup.js`:
- Load `.env.test` with dotenv
- Create a pg Pool pointing to test DB
- Connect client
- Run `DROP SCHEMA public CASCADE; CREATE SCHEMA public;`
- Run all 15 migration SQL files in order
- Release client, end pool

Create `tests/helpers.js`:
- `createTestUser(overrides)` — POST to /api/auth/register with unique email, return `{ user, token, rawPassword }`
- `getAuthToken(email, password)` — POST to /api/auth/login, return token
- `createTestProject(token, overrides)` — POST to /api/projects, return project
- `createTestStatuses(token, projectId)` — POST four statuses (To Do, In Progress, In Review, Done)
- `createTestTransitions(token, projectId, statuses)` — POST standard transition set
- `createTestIssue(token, projectId, overrides)` — POST to create issue, return issue
- `authHeader(token)` — return `{ Authorization: 'Bearer ' + token }`

---

## Step 5.6 — Write Test Files

### `tests/auth.test.js`

Test cases:
- Register with valid data → 201, token returned
- Register with duplicate email → 422 EMAIL_TAKEN
- Register with short password → 422 VALIDATION_ERROR
- Login with correct credentials → 200, token returned
- Login with wrong password → 401 INVALID_CREDENTIALS
- Access protected route without token → 401 UNAUTHORIZED
- Access protected route with invalid token → 401 TOKEN_INVALID

### `tests/projects.test.js`

Test cases:
- Create project → 201, project returned with correct key
- Create project with duplicate key → 422
- Get projects → only returns projects user is member of
- Add member to project → 201
- Add member who is already a member → 409 ALREADY_MEMBER
- Access project without membership → 403 NOT_A_MEMBER
- Create status → 201, correct position
- Create workflow transition → 201

### `tests/issues.test.js`

Test cases:
- Create issue → 201, issue_key = PROJECT-1
- Create second issue → issue_key = PROJECT-2 (counter increments correctly)
- Get board → grouped by status with correct issues in each column
- PATCH issue with correct version → 200, version incremented
- PATCH issue with stale version → 409 VERSION_CONFLICT
- PATCH issue with two simultaneous requests — one must win, one must get 409
- Delete issue as reporter → 204
- Delete issue as non-reporter non-admin → 403

### `tests/workflow.test.js`

Test cases:
- Transition with no matching rule row → 422 TRANSITION_NOT_ALLOWED with allowed list
- Transition with validation rule failing (required_field) → 422 VALIDATION_FAILED with message
- Transition with all rules passing → 200, status updated
- Transition with auto_action → verify field was automatically changed after move
- Transition with VERSION_CONFLICT (concurrent transition) → 409

### `tests/sprints.test.js`

Test cases:
- Create sprint → dates auto-calculated from sprint_duration_days
- Create second sprint → start_date = previous end_date + 1 day
- Start sprint → status = active
- Start second sprint when one is active → 422 SPRINT_ALREADY_ACTIVE
- Complete sprint → velocity = sum of done story_points
- Complete sprint with carry_over_ids → those issues have sprint_id = null

### `tests/comments.test.js`

Test cases:
- Add comment → 201, comment created
- Add comment with @mention → notification created for mentioned user
- All watchers notified on comment added
- Reply to comment (parent_id set) → correct thread structure
- Delete comment → is_deleted = true, not hard deleted
- Edit comment as non-author → 403

### `tests/search.test.js`

Test cases:
- Search with q → returns matching issues, ordered by relevance
- Search with project_id filter → only returns issues in that project
- Search with status_id filter → only returns issues in that status
- Search with cursor → second page returns different results, no duplicates
- Search with no q and no project_id → 400 or empty results

---

## Step 5.7 — Run Full Test Suite

```bash
npm test
```

All tests must pass before deploying. Fix any failures before proceeding.

Expected output: all test files green, no failures.

---

## Step 5.8 — Prepare for Render Deployment

### Update `src/db/pool.js`
Ensure the pool handles both `DATABASE_URL` (Render) and individual env vars (local). The `DATABASE_URL` path must include `ssl: { rejectUnauthorized: false }`.

### Create `render.yaml` (optional but helpful)
```yaml
services:
  - type: web
    name: pm-platform-api
    env: node
    buildCommand: npm install
    startCommand: node src/server.js
    envVars:
      - key: NODE_ENV
        value: production
      - key: JWT_SECRET
        generateValue: true
      - key: JWT_EXPIRES_IN
        value: 24h
```

### Update `package.json`
Add a `postinstall` or ensure migrations can be run manually via Render shell after deploy.

---

## Step 5.9 — Deploy to Render

1. Push entire codebase to a GitHub repository

2. Go to render.com → New → PostgreSQL
   - Name: `pm-platform-db`
   - Plan: Free
   - Copy the **Internal Database URL**

3. Go to render.com → New → Web Service
   - Connect GitHub repository
   - Environment: Node
   - Build Command: `npm install`
   - Start Command: `node src/server.js`

4. Set Environment Variables on Render:
   ```
   NODE_ENV=production
   DATABASE_URL=<paste Internal Database URL>
   JWT_SECRET=<generate 64+ character random string>
   JWT_EXPIRES_IN=24h
   CORS_ORIGIN=*
   ```

5. Deploy. Once live, go to Render Shell and run:
   ```bash
   node migrations/runner.js
   node seeds/seed.js
   ```

6. Test the live URL:
   ```
   GET https://your-app.onrender.com/health
   → { "status": "ok" }
   ```

---

## Step 5.10 — Verify Complete System

Run through this full end-to-end test on the live deployment:

```
1.  POST /api/auth/register               → create account
2.  POST /api/auth/login                  → get token
3.  POST /api/projects                    → create project
4.  POST /api/projects/:id/statuses       → create 4 board columns
5.  POST /api/projects/:id/workflow-transitions → set up 4 transition rules
6.  POST /api/projects/:id/sprints        → create sprint, verify auto-dates
7.  POST /api/sprints/:id/start           → activate sprint
8.  POST /api/projects/:id/issues         → create issue DEMO-1
9.  POST /api/projects/:id/issues         → create issue DEMO-2
10. GET  /api/projects/:id/board          → verify both issues in To Do column
11. POST /api/issues/DEMO-1/transitions   → attempt To Do → Done → get 422
12. POST /api/issues/DEMO-1/transitions   → To Do → In Progress → success
13. POST /api/issues/:id/comments         → add comment with @mention
14. GET  /api/notifications               → verify mention notification exists
15. POST /api/sprints/:id/complete        → complete sprint, verify velocity
16. GET  /api/search?q=<term>             → verify search returns results
17. Connect WebSocket client              → join board room
18. Move an issue                         → verify issue_moved event received
```

Phase 5 complete when: all tests pass, server is deployed on Render, WebSocket events fire correctly, full end-to-end flow works on the live URL.

---

---

# API Reference Summary

## Auth
| Method | URL | Auth | Body |
|--------|-----|------|------|
| POST | /api/auth/register | - | email, password, display_name |
| POST | /api/auth/login | - | email, password |

## Projects
| Method | URL | Auth |
|--------|-----|------|
| POST | /api/projects | JWT |
| GET | /api/projects | JWT |
| GET | /api/projects/:id | JWT + member |
| PATCH | /api/projects/:id | JWT + admin |
| POST | /api/projects/:id/members | JWT + admin |
| POST | /api/projects/:id/statuses | JWT + admin |
| GET | /api/projects/:id/statuses | JWT + member |
| POST | /api/projects/:id/workflow-transitions | JWT + admin |
| GET | /api/projects/:id/board | JWT + member |
| GET | /api/projects/:id/activity | JWT + member |

## Issues
| Method | URL | Auth |
|--------|-----|------|
| POST | /api/projects/:id/issues | JWT + member |
| GET | /api/projects/:id/issues | JWT + member |
| GET | /api/issues/:id | JWT |
| PATCH | /api/issues/:id | JWT |
| DELETE | /api/issues/:id | JWT |
| POST | /api/issues/:id/transitions | JWT |
| POST | /api/issues/:id/watch | JWT |
| DELETE | /api/issues/:id/watch | JWT |

## Sprints
| Method | URL | Auth |
|--------|-----|------|
| POST | /api/projects/:id/sprints | JWT + member |
| GET | /api/projects/:id/sprints | JWT + member |
| PATCH | /api/sprints/:id | JWT |
| POST | /api/sprints/:id/start | JWT |
| POST | /api/sprints/:id/complete | JWT |
| POST | /api/sprints/:id/issues | JWT |
| DELETE | /api/sprints/:id | JWT |

## Comments
| Method | URL | Auth |
|--------|-----|------|
| GET | /api/issues/:id/comments | JWT |
| POST | /api/issues/:id/comments | JWT |
| PATCH | /api/comments/:id | JWT |
| DELETE | /api/comments/:id | JWT |

## Notifications
| Method | URL | Auth |
|--------|-----|------|
| GET | /api/notifications | JWT |
| PATCH | /api/notifications/:id/read | JWT |
| PATCH | /api/notifications/read-all | JWT |

## Search
| Method | URL | Auth |
|--------|-----|------|
| GET | /api/search | JWT |

---

# WebSocket Events

## Client → Server
| Event | Payload |
|-------|---------|
| join_board | { project_id } |
| leave_board | { project_id } |
| join_issue | { issue_id } |
| leave_issue | { issue_id } |
| replay_events | { project_id, since: ISO_timestamp } |

## Server → Client
| Event | Room | Payload |
|-------|------|---------|
| issue_created | project:{id} | { issue } |
| issue_updated | project:{id}, issue:{id} | { issue_id, changes } |
| issue_moved | project:{id} | { issue_id, from_status, to_status } |
| comment_added | issue:{id} | { issue_id, comment } |
| sprint_updated | project:{id} | { sprint } |
| presence_updated | project:{id} | { project_id, users } |
| new_notification | user:{id} | { notification } |
| replay_batch | socket only | { events } |

---

# Error Codes Reference

| Code | HTTP | When |
|------|------|------|
| UNAUTHORIZED | 401 | Missing or invalid JWT |
| TOKEN_INVALID | 401 | JWT verification failed |
| FORBIDDEN | 403 | Authenticated but no permission |
| NOT_A_MEMBER | 403 | Not a member of the project |
| INSUFFICIENT_ROLE | 403 | Role too low for this action |
| NOT_FOUND | 404 | Resource does not exist |
| EMAIL_TAKEN | 422 | Email already registered |
| VALIDATION_ERROR | 422 | Zod schema validation failed |
| VALIDATION_FAILED | 422 | Workflow rule validation failed |
| TRANSITION_NOT_ALLOWED | 422 | No transition row for this move |
| SPRINT_ALREADY_ACTIVE | 422 | Trying to start when one is active |
| MISSING_DATES | 422 | Sprint has no start/end date |
| VERSION_REQUIRED | 422 | PATCH missing version field |
| VERSION_CONFLICT | 409 | Stale version — concurrent update |
| ALREADY_MEMBER | 409 | User already in project |
| INTERNAL_ERROR | 500 | Unexpected server error |
