# Project Management Platform — Backend API

A production-grade backend for a collaborative project management platform built with Node.js, PostgreSQL, Socket.io, and JWT authentication.

---

## What This Is

A Jira-like backend that allows engineering teams to:

- Plan and track work across configurable sprint cycles
- Manage issues (Epics, Stories, Tasks, Bugs, Subtasks) with parent-child hierarchy
- Enforce custom workflow rules — which status moves are allowed and under what conditions
- Collaborate via threaded comments with @mention notifications
- See real-time board updates across all connected team members
- Search issues with full-text and structured filters

---

## Tech Stack

| Layer | Technology | Why |
|---|---|---|
| Runtime | Node.js 20 LTS | Non-blocking I/O handles REST and WebSocket concurrently |
| Framework | Express.js | Minimal, full control over every layer |
| Database | PostgreSQL 16 | Relational integrity, JSONB, native full-text search |
| DB Driver | node-postgres (pg) | Raw SQL — full access to PostgreSQL features |
| Auth | JWT (jsonwebtoken) | Stateless, scalable, works for HTTP and WebSocket |
| WebSocket | Socket.io | Rooms, reconnection, named events built-in |
| Validation | Zod | Runtime schema validation on all request bodies |
| Testing | Jest + Supertest | In-process HTTP testing, fast, standard |
| Hosting | Render | Free tier with managed PostgreSQL |

---

## Local Setup

### Prerequisites

- Node.js 20+
- Docker + docker-compose

### Steps

```bash
# 1. Clone the repository
git clone https://github.com/yourname/pm-platform-backend.git
cd pm-platform-backend

# 2. Install dependencies
npm install

# 3. Copy environment files
cp .env.example .env
cp .env.test.example .env.test

# 4. Start PostgreSQL containers
docker-compose up postgres postgres_test -d

# 5. Run database migrations
npm run migrate

# 6. Seed sample data
npm run seed

# 7. Start development server
npm run dev
```

Server runs at `http://localhost:3000`

Health check: `GET http://localhost:3000/health`

### Seed Credentials

```
Email:    alice@example.com
Password: password123

Email:    bob@example.com
Password: password123
```

---

## Environment Variables

```env
NODE_ENV=development
PORT=3000

# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=pm_platform
DB_USER=postgres
DB_PASSWORD=postgres

# JWT
JWT_SECRET=your_secret_minimum_32_characters
JWT_EXPIRES_IN=24h

# CORS
CORS_ORIGIN=http://localhost:3001
```

For Render deployment, replace individual DB vars with:
```env
DATABASE_URL=postgresql://...  # provided by Render
```

---

## Running Tests

```bash
# Run full test suite
npm test

# Watch mode
npm run test:watch
```

Tests run against a separate `pm_platform_test` database. The test setup drops and remigrates the schema before every run.

---

## Project Structure

```
src/
├── app.js              Express application setup
├── server.js           HTTP server + Socket.io initialization
├── db/
│   └── pool.js         PostgreSQL connection pool (singleton)
├── middleware/
│   ├── auth.js         JWT verification
│   ├── projectAccess.js Project membership + role check
│   ├── validate.js     Zod request body validation
│   └── errorHandler.js Global error handler
├── repositories/       Raw SQL data access layer
├── services/           Business logic layer
│   └── workflowEngine.js Transition validation + auto-actions
├── routes/             Express route handlers
├── sockets/            Socket.io server + presence tracking
└── utils/              JWT, cursor pagination, password, mentions
```

---

## Database Schema

15 tables covering the full domain:

| Table | Purpose |
|---|---|
| users | Platform accounts |
| projects | Top-level workspaces |
| project_members | User ↔ Project membership (many-to-many) |
| statuses | Configurable board columns per project |
| workflow_transitions | Allowed status moves with rules and actions |
| sprints | Time-boxed work periods with auto-calculated dates |
| issues | Cards on the board (Epic/Story/Task/Bug/Subtask) |
| issue_labels | Tags on issues |
| custom_field_definitions | Project-defined extra fields |
| custom_field_values | EAV values for custom fields per issue |
| comments | Threaded discussion on issues |
| comment_mentions | Parsed @mentions from comment bodies |
| watchers | Users subscribed to issue updates |
| activity_log | Immutable audit trail of all mutations |
| notifications | In-app notification inbox |

---

## Key Features

### Sprint Duration Defaults

Projects have a `sprint_duration_days` field (default 14). When a sprint is created, `start_date` and `end_date` are automatically calculated — no manual date entry needed.

```
Project: sprint_duration_days = 14
Sprint 1: Jan 01 → Jan 14  (auto)
Sprint 2: Jan 15 → Jan 28  (auto)
Sprint 3: Jan 29 → Feb 11  (auto)
```

Dates can be manually overridden per sprint if needed.

---

### Configurable Workflow Engine

Workflow rules are stored as data in `workflow_transitions`. Each row defines one allowed status move with optional validation rules and auto-actions.

**Validation rules** (checked before the move):
```json
{ "type": "required_field", "field": "assignee_id", "message": "Must have an assignee" }
{ "type": "min_value", "field": "story_points", "value": 1, "message": "Must be estimated" }
{ "type": "no_open_subtasks", "message": "Close all subtasks first" }
```

**Auto actions** (executed after the move):
```json
{ "type": "assign_field", "field": "assignee_id", "value": "reporter_id" }
{ "type": "notify", "target": "assignee", "message": "Your issue is ready for review" }
```

If no transition row exists for a from→to pair, the move is blocked with a `422` listing what moves ARE allowed.

---

### Optimistic Locking

Every issue has a `version` column. Any PATCH or transition must include the current version:

```json
PATCH /api/issues/:id
{ "version": 3, "priority": "high" }
```

If two users update simultaneously, the first succeeds and the second receives `409 VERSION_CONFLICT`. The losing user refreshes (their board already updated via WebSocket) and retries.

---

### Real-Time WebSocket Events

Socket.io rooms scope events to the right audience:

```
project:{id}  →  board-level events
issue:{id}    →  issue-detail events
user:{id}     →  personal notifications
```

Events emitted by the server: `issue_created`, `issue_updated`, `issue_moved`, `comment_added`, `sprint_updated`, `presence_updated`, `new_notification`, `replay_batch`

Clients that reconnect can request missed events by sending `replay_events` with their last-seen timestamp.

---

## API Reference

### Authentication
```
POST /api/auth/register    Register user, receive JWT
POST /api/auth/login       Login, receive JWT
```

All other endpoints require: `Authorization: Bearer <token>`

### Projects
```
POST   /api/projects                          Create project
GET    /api/projects                          List my projects
GET    /api/projects/:id                      Get project + members
PATCH  /api/projects/:id                      Update project (admin)
POST   /api/projects/:id/members              Add member (admin)
POST   /api/projects/:id/statuses             Create board column (admin)
GET    /api/projects/:id/statuses             Get board columns
POST   /api/projects/:id/workflow-transitions Define transition rule (admin)
GET    /api/projects/:id/board                Get full board state
GET    /api/projects/:id/activity             Activity feed (paginated)
```

### Issues
```
POST   /api/projects/:id/issues     Create issue
GET    /api/projects/:id/issues     List issues (filtered + paginated)
GET    /api/issues/:id              Get full issue detail
PATCH  /api/issues/:id              Update fields (requires version)
DELETE /api/issues/:id              Delete issue
POST   /api/issues/:id/transitions  Move issue through workflow
POST   /api/issues/:id/watch        Subscribe to issue
DELETE /api/issues/:id/watch        Unsubscribe from issue
```

### Sprints
```
POST   /api/projects/:id/sprints    Create sprint (auto-dates)
GET    /api/projects/:id/sprints    List sprints
PATCH  /api/sprints/:id             Update sprint
POST   /api/sprints/:id/start       Activate sprint
POST   /api/sprints/:id/complete    Complete sprint + carry-over
POST   /api/sprints/:id/issues      Move issues into sprint
DELETE /api/sprints/:id             Delete sprint
```

### Comments
```
GET    /api/issues/:id/comments     List threaded comments
POST   /api/issues/:id/comments     Add comment (@mentions parsed)
PATCH  /api/comments/:id            Edit comment
DELETE /api/comments/:id            Soft-delete comment
```

### Search
```
GET /api/search?q=...&project_id=...&priority=...&status_id=...
```

### Notifications
```
GET    /api/notifications               My notification inbox
PATCH  /api/notifications/:id/read      Mark single as read
PATCH  /api/notifications/read-all      Mark all as read
```

---

## Response Format

All responses follow a consistent envelope:

```json
{ "success": true, "data": { ... } }
```

```json
{ "success": false, "error": { "code": "ERROR_CODE", "message": "Detail" } }
```

---

## Error Codes

| Code | HTTP | Meaning |
|---|---|---|
| UNAUTHORIZED | 401 | Missing or invalid JWT |
| NOT_A_MEMBER | 403 | Not a member of this project |
| INSUFFICIENT_ROLE | 403 | Role too low for this action |
| EMAIL_TAKEN | 422 | Email already registered |
| VALIDATION_ERROR | 422 | Request body failed Zod validation |
| VALIDATION_FAILED | 422 | Workflow rule check failed |
| TRANSITION_NOT_ALLOWED | 422 | No rule permits this status move |
| SPRINT_ALREADY_ACTIVE | 422 | Cannot start — one already active |
| VERSION_CONFLICT | 409 | Concurrent update — stale version |
| ALREADY_MEMBER | 409 | User is already a project member |

---

## Deployment (Render)

1. Push to GitHub
2. Create a **PostgreSQL** database on Render (free tier)
3. Create a **Web Service** on Render connected to your repo
   - Build: `npm install`
   - Start: `node src/server.js`
4. Add environment variables (DATABASE_URL, JWT_SECRET, NODE_ENV=production)
5. After first deploy, open Render Shell and run:
   ```bash
   node migrations/runner.js
   node seeds/seed.js
   ```

---

## Build Phases

The project is built in 5 phases. See `CLAUDE.md` for the complete step-by-step build instructions.

| Phase | What Gets Built |
|---|---|
| Phase 1 | Docker, migrations, seed data, Express server |
| Phase 2 | Auth (register/login/JWT), projects, statuses, workflow transition setup |
| Phase 3 | Issues with optimistic locking, workflow engine, sprint management |
| Phase 4 | Comments with @mentions, activity feed, notifications, watchers, search |
| Phase 5 | WebSocket real-time events, full test suite, Render deployment |

---

## License

MIT
