# Project Management Platform — Backend API

A Jira-like project management backend with sprint planning, configurable workflow rules, real-time board updates via WebSocket, and JWT authentication. Built with Node.js, PostgreSQL, and Socket.io.

---

## Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop)

> That is all you need. Everything else runs inside Docker.

---

## Setup

### 1. Clone the Repository

```bash
git clone https://github.com/yourusername/project-management-backend.git
cd project-management-backend
```

### 2. Create Environment File

Copy the example file and fill in your values:

```bash
cp .env.example .env
```

`.env.example` contains:

```env
NODE_ENV=
PORT=

DB_HOST=
DB_PORT=
DB_NAME=
DB_USER=
DB_PASSWORD=

JWT_SECRET=
JWT_EXPIRES_IN=
CORS_ORIGIN=
```

### 3. Start Everything

```bash
docker-compose up -d
```

This starts the Node.js app and PostgreSQL database together.

### 4. Run Migrations

```bash
docker-compose exec app npm run migrate
```

### 5. Seed Sample Data

```bash
docker-compose exec app npm run seed
```

---

## Done

API is running at:

```
http://localhost:3000
```

Swagger UI at:

```
http://localhost:3000/api-docs
```

---

## Commands

| Command | Description |
|---|---|
| `docker-compose up -d` | Start all services |
| `docker-compose down` | Stop all services |
| `docker-compose down -v` | Stop and delete all data |
| `docker-compose exec app npm run migrate` | Run migrations |
| `docker-compose exec app npm run seed` | Load sample data |
| `docker-compose exec app npm test` | Run tests |

---

## Reset

```bash
docker-compose down -v
docker-compose up -d
docker-compose exec app npm run migrate
docker-compose exec app npm run seed
```
