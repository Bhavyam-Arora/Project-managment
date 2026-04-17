# Test Cases — Project Management Platform API

**Total Tests:** 45
**Test Suites:** 7
**Status:** All Passing ✅
**Framework:** Jest + Supertest
**Test Database:** PostgreSQL (pm_platform_test)

---

## Summary Table

| # | Suite | Total Tests | Status |
|---|-------|-------------|--------|
| 1 | Authentication | 7 | ✅ Pass |
| 2 | Projects | 8 | ✅ Pass |
| 3 | Issues | 7 | ✅ Pass |
| 4 | Workflow Engine | 5 | ✅ Pass |
| 5 | Sprints | 6 | ✅ Pass |
| 6 | Comments | 6 | ✅ Pass |
| 7 | Search | 5 | ✅ Pass |

---

## 1. Authentication (`tests/auth.test.js`)

| TC# | Test Case | Input | Expected Output | Status |
|-----|-----------|-------|-----------------|--------|
| TC-A01 | Register with valid data | `POST /api/auth/register` with valid email, password (8+ chars), display_name | HTTP 201 — token returned in response | ✅ Pass |
| TC-A02 | Register with duplicate email | `POST /api/auth/register` with an already registered email | HTTP 422 — error code `EMAIL_TAKEN` | ✅ Pass |
| TC-A03 | Register with short password | `POST /api/auth/register` with password less than 8 characters | HTTP 422 — error code `VALIDATION_ERROR` | ✅ Pass |
| TC-A04 | Login with correct credentials | `POST /api/auth/login` with valid email and password | HTTP 200 — token returned in response | ✅ Pass |
| TC-A05 | Login with wrong password | `POST /api/auth/login` with correct email but wrong password | HTTP 401 — error code `INVALID_CREDENTIALS` | ✅ Pass |
| TC-A06 | Access protected route without token | `GET /api/projects` with no Authorization header | HTTP 401 — error code `UNAUTHORIZED` | ✅ Pass |
| TC-A07 | Access protected route with invalid token | `GET /api/projects` with a malformed/expired JWT | HTTP 401 — error code `TOKEN_INVALID` | ✅ Pass |

---

## 2. Projects (`tests/projects.test.js`)

| TC# | Test Case | Input | Expected Output | Status |
|-----|-----------|-------|-----------------|--------|
| TC-P01 | Create project with valid data | `POST /api/projects` with name and valid key (2-10 uppercase chars) | HTTP 201 — project returned with correct key | ✅ Pass |
| TC-P02 | Create project with duplicate key | `POST /api/projects` with a key that already exists | HTTP 422 — error code `DUPLICATE_KEY` | ✅ Pass |
| TC-P03 | List projects — isolation check | `GET /api/projects` as a user who is not a member of another project | Returns only projects the user is a member of | ✅ Pass |
| TC-P04 | Add member to project | `POST /api/projects/:id/members` with valid user_id and role | HTTP 201 — member added successfully | ✅ Pass |
| TC-P05 | Add member who is already a member | `POST /api/projects/:id/members` for an existing member | HTTP 409 — error code `ALREADY_MEMBER` | ✅ Pass |
| TC-P06 | Access project without membership | `GET /api/projects/:id` as a non-member | HTTP 403 — error code `NOT_A_MEMBER` | ✅ Pass |
| TC-P07 | Create board status column | `POST /api/projects/:id/statuses` with name, category, position | HTTP 201 — status returned with correct position value | ✅ Pass |
| TC-P08 | Create workflow transition | `POST /api/projects/:id/workflow-transitions` with from/to status IDs | HTTP 201 — transition rule created | ✅ Pass |

---

## 3. Issues (`tests/issues.test.js`)

| TC# | Test Case | Input | Expected Output | Status |
|-----|-----------|-------|-----------------|--------|
| TC-I01 | Create first issue in project | `POST /api/projects/:id/issues` with type and title | HTTP 201 — `issue_key` = `PROJECTKEY-1` (counter starts at 1) | ✅ Pass |
| TC-I02 | Create second issue — counter increments | `POST /api/projects/:id/issues` again | HTTP 201 — `issue_key` = `PROJECTKEY-2` | ✅ Pass |
| TC-I03 | Get Kanban board grouped by status | `GET /api/projects/:id/board` | HTTP 200 — array of status columns each containing their issues | ✅ Pass |
| TC-I04 | Update issue with correct version | `PATCH /api/issues/:id` with current `version` field | HTTP 200 — updated issue returned, `version` incremented by 1 | ✅ Pass |
| TC-I05 | Update issue with stale version | `PATCH /api/issues/:id` with an outdated `version` field | HTTP 409 — error code `VERSION_CONFLICT` | ✅ Pass |
| TC-I06 | Concurrent updates — optimistic locking | Two simultaneous `PATCH` requests with same version | One returns HTTP 200, the other returns HTTP 409 `VERSION_CONFLICT` | ✅ Pass |
| TC-I07 | Delete issue as reporter | `DELETE /api/issues/:id` by the issue's reporter | HTTP 204 — issue deleted | ✅ Pass |
| TC-I08 | Delete issue as non-reporter non-admin | `DELETE /api/issues/:id` by a regular member who is not the reporter | HTTP 403 — error code `FORBIDDEN` | ✅ Pass |

---

## 4. Workflow Engine (`tests/workflow.test.js`)

| TC# | Test Case | Input | Expected Output | Status |
|-----|-----------|-------|-----------------|--------|
| TC-W01 | Transition not defined in workflow | `POST /api/issues/:id/transitions` with a `to_status_id` that has no transition rule from the current status | HTTP 422 — error code `TRANSITION_NOT_ALLOWED` with list of allowed transitions | ✅ Pass |
| TC-W02 | Transition fails required_field validation | `POST /api/issues/:id/transitions` where transition rule requires `assignee_id` but issue has none | HTTP 422 — error code `VALIDATION_FAILED` with validation error messages | ✅ Pass |
| TC-W03 | Valid transition succeeds | `POST /api/issues/:id/transitions` with a defined and passing transition | HTTP 200 — issue returned with updated `status_id` | ✅ Pass |
| TC-W04 | Auto action fires after transition | `POST /api/issues/:id/transitions` where transition has `assign_field` auto action | HTTP 200 — specified field automatically updated (e.g. `assignee_id = reporter_id`) | ✅ Pass |
| TC-W05 | Concurrent transitions — version conflict | Two simultaneous `POST /api/issues/:id/transitions` requests | One returns HTTP 200, the other returns HTTP 409 `VERSION_CONFLICT` | ✅ Pass |

---

## 5. Sprints (`tests/sprints.test.js`)

| TC# | Test Case | Input | Expected Output | Status |
|-----|-----------|-------|-----------------|--------|
| TC-S01 | Create sprint with auto dates | `POST /api/projects/:id/sprints` with empty body | HTTP 201 — `start_date` and `end_date` auto-calculated using `sprint_duration_days` (default 14) | ✅ Pass |
| TC-S02 | Second sprint dates follow first | Complete sprint 1, then `POST /api/projects/:id/sprints` | Sprint 2 `start_date` = Sprint 1 `end_date` + 1 day | ✅ Pass |
| TC-S03 | Start sprint | `POST /api/sprints/:id/start` | HTTP 200 — sprint `status` changed to `active` | ✅ Pass |
| TC-S04 | Start second sprint when one is active | `POST /api/sprints/:id/start` when another sprint is already active | HTTP 422 — error code `SPRINT_ALREADY_ACTIVE` | ✅ Pass |
| TC-S05 | Complete sprint — velocity calculated | `POST /api/sprints/:id/complete` with issues in Done status having story_points | HTTP 200 — `velocity` = sum of `story_points` of all done issues | ✅ Pass |
| TC-S06 | Complete sprint — carry over issues | `POST /api/sprints/:id/complete` with `carry_over_issue_ids` | HTTP 200 — carried issues have `sprint_id` set to `null` (moved to backlog) | ✅ Pass |

---

## 6. Comments (`tests/comments.test.js`)

| TC# | Test Case | Input | Expected Output | Status |
|-----|-----------|-------|-----------------|--------|
| TC-C01 | Add comment to issue | `POST /api/issues/:id/comments` with body text | HTTP 201 — comment created and returned | ✅ Pass |
| TC-C02 | @mention creates notification | `POST /api/issues/:id/comments` with body containing `@DisplayName` | Notification of type `mention` created for the mentioned user | ✅ Pass |
| TC-C03 | Watchers notified on new comment | User watches issue, another user posts a comment | Watcher receives notification of type `comment` | ✅ Pass |
| TC-C04 | Reply to comment (thread) | `POST /api/issues/:id/comments` with `parent_id` set | HTTP 201 — reply stored with correct `parent_id` reference | ✅ Pass |
| TC-C05 | Soft delete comment | `DELETE /api/comments/:id` by the author | HTTP 204 — `is_deleted` set to `true`, comment hidden from listing | ✅ Pass |
| TC-C06 | Edit comment as non-author | `PATCH /api/comments/:id` by a user who is not the comment author | HTTP 403 — error code `FORBIDDEN` | ✅ Pass |

---

## 7. Search (`tests/search.test.js`)

| TC# | Test Case | Input | Expected Output | Status |
|-----|-----------|-------|-----------------|--------|
| TC-SR01 | Full-text search with query | `GET /api/search?q=OAuth&project_id=:id` | HTTP 200 — matching issues returned, ranked by relevance (ts_rank) | ✅ Pass |
| TC-SR02 | Filter by project_id | `GET /api/search?project_id=:id` | HTTP 200 — only issues belonging to that project returned | ✅ Pass |
| TC-SR03 | Filter by status_id | `GET /api/search?project_id=:id&status_id=:id` | HTTP 200 — only issues in that status column returned | ✅ Pass |
| TC-SR04 | Cursor pagination — no duplicates | `GET /api/search?project_id=:id&limit=1`, then use `next_cursor` for page 2 | Page 2 returns different issue, no duplicates across pages | ✅ Pass |
| TC-SR05 | Search with no filters | `GET /api/search` with no `q` or `project_id` | HTTP 400 — error code `VALIDATION_ERROR` | ✅ Pass |

---

## Error Codes Reference

| Code | HTTP Status | Scenario |
|------|-------------|----------|
| `UNAUTHORIZED` | 401 | Missing Authorization header |
| `TOKEN_INVALID` | 401 | JWT expired or malformed |
| `INVALID_CREDENTIALS` | 401 | Wrong email or password |
| `FORBIDDEN` | 403 | Authenticated but no permission |
| `NOT_A_MEMBER` | 403 | User is not a project member |
| `INSUFFICIENT_ROLE` | 403 | Role too low for the action |
| `NOT_FOUND` | 404 | Resource does not exist |
| `EMAIL_TAKEN` | 422 | Email already registered |
| `VALIDATION_ERROR` | 422 | Request body failed schema validation |
| `VALIDATION_FAILED` | 422 | Workflow rule validation failed |
| `TRANSITION_NOT_ALLOWED` | 422 | No transition rule defined for this move |
| `SPRINT_ALREADY_ACTIVE` | 422 | Trying to start a sprint when one is active |
| `VERSION_REQUIRED` | 422 | PATCH request missing version field |
| `DUPLICATE_KEY` | 422 | Project key already exists |
| `VERSION_CONFLICT` | 409 | Stale version — concurrent update detected |
| `ALREADY_MEMBER` | 409 | User already a member of the project |
| `INTERNAL_ERROR` | 500 | Unexpected server error |

---

## How to Run Tests

```bash
# Start test database
docker compose up postgres_test -d

# Run all test suites
npm test

# Expected output
Test Suites: 7 passed, 7 total
Tests:       45 passed, 45 total
```
