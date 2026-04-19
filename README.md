# Project Management Platform — Backend API

A Jira-like project management backend built with Node.js, PostgreSQL, Socket.io, and JWT authentication.

**Live Demo:** [https://pm-platform-api.onrender.com/api-docs](https://pm-platform-api.onrender.com/api-docs)

---

## Local Setup

### Prerequisites

- [Node.js 20+](https://nodejs.org)
- [Docker Desktop](https://www.docker.com/products/docker-desktop)

### Steps

```bash
# 1. Clone and install
git clone https://github.com/yourusername/project-management-backend.git
cd project-management-backend
npm install

# 2. Copy the env file and fill in your values
cp .env.example .env

# 3. Start Docker Desktop, then start the databases
docker-compose up postgres postgres_test -d

# 4. Run migrations and seed sample data
npm run migrate
npm run seed

# 5. Start the server
npm run dev
```

Server runs at `http://localhost:3000`

Swagger UI at `http://localhost:3000/api-docs`

**Every day after first setup:**

```bash
docker-compose up postgres postgres_test -d
npm run dev
```

---

## How It Works — High Level

```
  Browser / Mobile App
        |
        | HTTP REST  +  WebSocket
        |
  ┌─────────────────────────────────┐
  │  Express  +  Socket.io          │
  │  Auth Middleware (JWT verify)   │
  │  Project Access Check           │
  │  Request Validation             │
  └────────────────┬────────────────┘
                   │
  ┌────────────────▼────────────────┐
  │        Service Layer            │
  │  Workflow Engine  Sprint Logic  │
  │  Notifications   Locking        │
  └────────────────┬────────────────┘
                   │
  ┌────────────────▼────────────────┐
  │       Repository Layer          │
  │     Raw SQL via node-postgres   │
  └────────────────┬────────────────┘
                   │
  ┌────────────────▼────────────────┐
  │        PostgreSQL 16            │
  │         15 tables               │
  └─────────────────────────────────┘
```

Every request passes through Express, gets verified by the auth middleware, validated, then hits the service layer where business logic runs. The repository layer handles all raw SQL. Socket.io runs alongside Express on the same server and pushes real-time events to connected browsers the moment anything changes on the board.

Workflow transition rules are stored as database rows, not application code. Project admins configure their own board rules through the API without any deployment needed.

Concurrent edits are handled with optimistic locking — every issue has a version number that must match on every update. If two people edit the same issue at the same time, one succeeds and the other gets a clear conflict error and must retry.

---

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Start development server |
| `npm run migrate` | Run database migrations |
| `npm run seed` | Load sample data |
| `npm test` | Run the test suite |
| `docker-compose up postgres postgres_test -d` | Start databases |
| `docker-compose down -v` | Stop and wipe all data |

---

> **Want to know more about the project?**
> Full architecture document, database design, API reference, and design decisions are available here:
> [Project Documentation](https://docs.google.com/document/d/1EzQMiowhIOU0tlS1KGssvWL55hlIxQpXA-uQcU4l2wo/edit?tab=t.0)
>
> **Note:** You can use Gemini in Docs to answer any questions about the project directly inside the document.
