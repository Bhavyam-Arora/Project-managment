# Test Cases — Project Management Platform API

**Total Tests:** 86
**Test Suites:** 7
**Status:** All Passing ✅
**Framework:** Jest + Supertest
**Test Database:** PostgreSQL (pm_platform_test)

---

## Summary Table

| # | Suite | Total Tests | Status |
|---|-------|-------------|--------|
| 1 | Authentication | 14 | ✅ Pass |
| 2 | Projects | 15 | ✅ Pass |
| 3 | Issues | 16 | ✅ Pass |
| 4 | Workflow Engine | 10 | ✅ Pass |
| 5 | Sprints | 11 | ✅ Pass |
| 6 | Comments | 11 | ✅ Pass |
| 7 | Search | 9 | ✅ Pass |

---

## 1. Authentication (`tests/auth.test.js`)

| TC# | Test Case | Input | Expected Output | Type | Status |
|-----|-----------|-------|-----------------|------|--------|
| TC-A01 | Register with valid data | `POST /api/auth/register` with valid email, password (8+ chars), display_name | HTTP 201 — token returned in response | Positive | ✅ Pass |
| TC-A02 | Register with duplicate email | `POST /api/auth/register` with an already registered email | HTTP 422 — error code `EMAIL_TAKEN` | Negative | ✅ Pass |
| TC-A03 | Register with short password | `POST /api/auth/register` with password less than 8 characters | HTTP 422 — error code `VALIDATION_ERROR` | Negative | ✅ Pass |
| TC-A04 | Login with correct credentials | `POST /api/auth/login` with valid email and password | HTTP 200 — token returned in response | Positive | ✅ Pass |
| TC-A05 | Login with wrong password | `POST /api/auth/login` with correct email but wrong password | HTTP 401 — error code `INVALID_CREDENTIALS` | Negative | ✅ Pass |
| TC-A06 | Access protected route without token | `GET /api/projects` with no Authorization header | HTTP 401 — error code `UNAUTHORIZED` | Negative | ✅ Pass |
| TC-A07 | Access protected route with invalid token | `GET /api/projects` with a malformed/expired JWT | HTTP 401 — error code `TOKEN_INVALID` | Negative | ✅ Pass |
| TC-A08 | Register with missing email field | `POST /api/auth/register` with no email field in body | HTTP 422 — error code `VALIDATION_ERROR` | Negative | ✅ Pass |
| TC-A09 | Register with invalid email format | `POST /api/auth/register` with `email: "not-an-email"` | HTTP 422 — error code `VALIDATION_ERROR` | Negative | ✅ Pass |
| TC-A10 | Register with missing display_name | `POST /api/auth/register` with no display_name field | HTTP 422 — error code `VALIDATION_ERROR` | Negative | ✅ Pass |
| TC-A11 | Login with non-existent email | `POST /api/auth/login` with email not in database | HTTP 401 — error code `INVALID_CREDENTIALS` | Negative | ✅ Pass |
| TC-A12 | Register with exactly 8-char password (boundary) | `POST /api/auth/register` with `password: "exactly8"` | HTTP 201 — token returned (boundary passes) | Boundary | ✅ Pass |
| TC-A13 | Login response contains correct user data | `POST /api/auth/login` with valid credentials | Response body has matching `email` and `display_name` | Positive | ✅ Pass |
| TC-A14 | Register with display_name over 100 characters | `POST /api/auth/register` with `display_name` of 101 chars | HTTP 422 — error code `VALIDATION_ERROR` | Negative | ✅ Pass |

---

## 2. Projects (`tests/projects.test.js`)

| TC# | Test Case | Input | Expected Output | Type | Status |
|-----|-----------|-------|-----------------|------|--------|
| TC-P01 | Create project with valid data | `POST /api/projects` with name and valid key (2-10 uppercase chars) | HTTP 201 — project returned with correct key | Positive | ✅ Pass |
| TC-P02 | Create project with duplicate key | `POST /api/projects` with a key that already exists | HTTP 422 — error code `DUPLICATE_KEY` | Negative | ✅ Pass |
| TC-P03 | List projects — isolation check | `GET /api/projects` as a user who is not a member of another project | Returns only projects the user is a member of | Positive | ✅ Pass |
| TC-P04 | Add member to project | `POST /api/projects/:id/members` with valid user_id and role | HTTP 201 — member added successfully | Positive | ✅ Pass |
| TC-P05 | Add member who is already a member | `POST /api/projects/:id/members` for an existing member | HTTP 409 — error code `ALREADY_MEMBER` | Negative | ✅ Pass |
| TC-P06 | Access project without membership | `GET /api/projects/:id` as a non-member | HTTP 403 — error code `NOT_A_MEMBER` | Negative | ✅ Pass |
| TC-P07 | Create board status column | `POST /api/projects/:id/statuses` with name, category, position | HTTP 201 — status returned with correct position value | Positive | ✅ Pass |
| TC-P08 | Create workflow transition | `POST /api/projects/:id/workflow-transitions` with from/to status IDs | HTTP 201 — transition rule created | Positive | ✅ Pass |
| TC-P09 | Create project with lowercase key | `POST /api/projects` with `key: "lowercase"` | HTTP 422 — error code `VALIDATION_ERROR` | Negative | ✅ Pass |
| TC-P10 | Create project with 1-character key | `POST /api/projects` with `key: "A"` (too short, min is 2) | HTTP 422 — error code `VALIDATION_ERROR` | Negative | ✅ Pass |
| TC-P11 | Get project by ID returns members array | `GET /api/projects/:id` as a member | HTTP 200 — response includes `members` array with at least 1 entry | Positive | ✅ Pass |
| TC-P12 | Update project name as admin | `PATCH /api/projects/:id` with new name, by project admin | HTTP 200 — project returned with updated name | Positive | ✅ Pass |
| TC-P13 | Update project as non-admin member | `PATCH /api/projects/:id` by a user with role `member` | HTTP 403 — error code `INSUFFICIENT_ROLE` | Negative | ✅ Pass |
| TC-P14 | Add non-existent user as member | `POST /api/projects/:id/members` with a UUID that does not exist in users | HTTP 404 — error code `USER_NOT_FOUND` | Negative | ✅ Pass |
| TC-P15 | Create status as non-admin member | `POST /api/projects/:id/statuses` by a user with role `member` | HTTP 403 — error code `INSUFFICIENT_ROLE` | Negative | ✅ Pass |

---

## 3. Issues (`tests/issues.test.js`)

| TC# | Test Case | Input | Expected Output | Type | Status |
|-----|-----------|-------|-----------------|------|--------|
| TC-I01 | Create first issue in project | `POST /api/projects/:id/issues` with type and title | HTTP 201 — `issue_key` = `PROJECTKEY-1` (counter starts at 1) | Positive | ✅ Pass |
| TC-I02 | Create second issue — counter increments | `POST /api/projects/:id/issues` again | HTTP 201 — `issue_key` = `PROJECTKEY-2` | Positive | ✅ Pass |
| TC-I03 | Get Kanban board grouped by status | `GET /api/projects/:id/board` | HTTP 200 — array of status columns each containing their issues | Positive | ✅ Pass |
| TC-I04 | Update issue with correct version | `PATCH /api/issues/:id` with current `version` field | HTTP 200 — updated issue returned, `version` incremented by 1 | Positive | ✅ Pass |
| TC-I05 | Update issue with stale version | `PATCH /api/issues/:id` with an outdated `version` field | HTTP 409 — error code `VERSION_CONFLICT` | Negative | ✅ Pass |
| TC-I06 | Concurrent updates — optimistic locking | Two simultaneous `PATCH` requests with same version | One returns HTTP 200, the other returns HTTP 409 `VERSION_CONFLICT` | Concurrency | ✅ Pass |
| TC-I07 | Delete issue as reporter | `DELETE /api/issues/:id` by the issue's reporter | HTTP 204 — issue deleted | Positive | ✅ Pass |
| TC-I08 | Delete issue as non-reporter non-admin | `DELETE /api/issues/:id` by a regular member who is not the reporter | HTTP 403 — error code `FORBIDDEN` | Negative | ✅ Pass |
| TC-I09 | PATCH issue without version field | `PATCH /api/issues/:id` with no `version` in request body | HTTP 422 — error code `VALIDATION_ERROR` (Zod catches missing field before service layer) | Negative | ✅ Pass |
| TC-I10 | Get issue by ID returns full detail | `GET /api/issues/:id` with valid token | HTTP 200 — issue with `issue_key`, `reporter_id`, `title` returned | Positive | ✅ Pass |
| TC-I11 | Create issue with invalid type | `POST /api/projects/:id/issues` with `type: "invalid_type"` | HTTP 422 — error code `VALIDATION_ERROR` | Negative | ✅ Pass |
| TC-I12 | List issues with type filter | `GET /api/projects/:id/issues?type=epic` | HTTP 200 — all returned issues have `type = "epic"` | Positive | ✅ Pass |
| TC-I13 | Non-member cannot create issue | `POST /api/projects/:id/issues` by a user not in the project | HTTP 403 — error code `NOT_A_MEMBER` | Negative | ✅ Pass |
| TC-I14 | Create subtask with parent_id | `POST /api/projects/:id/issues` with `type: "subtask"` and `parent_id` set | HTTP 201 — `parent_id` matches the parent issue's ID | Positive | ✅ Pass |
| TC-I15 | PATCH with status_id cannot bypass workflow | `PATCH /api/issues/:id` with `status_id` of Done (no direct transition rule) | HTTP 200 but `status_id` unchanged — field stripped by schema | Security | ✅ Pass |
| TC-I16 | Create issue with status_id of Done lands in first column | `POST /api/projects/:id/issues` with `status_id` of Done | HTTP 201 — issue created in position 0 status (To Do), Done status_id ignored | Security | ✅ Pass |

---

## 4. Workflow Engine (`tests/workflow.test.js`)

| TC# | Test Case | Input | Expected Output | Type | Status |
|-----|-----------|-------|-----------------|------|--------|
| TC-W01 | Transition not defined in workflow | `POST /api/issues/:id/transitions` with a `to_status_id` that has no transition rule from the current status | HTTP 422 — error code `TRANSITION_NOT_ALLOWED` with list of allowed transitions | Negative | ✅ Pass |
| TC-W02 | Transition fails required_field validation | `POST /api/issues/:id/transitions` where transition rule requires `assignee_id` but issue has none | HTTP 422 — error code `VALIDATION_FAILED` with validation error messages | Negative | ✅ Pass |
| TC-W03 | Valid transition succeeds | `POST /api/issues/:id/transitions` with a defined and passing transition | HTTP 200 — issue returned with updated `status_id` | Positive | ✅ Pass |
| TC-W04 | Auto action fires after transition | `POST /api/issues/:id/transitions` where transition has `assign_field` auto action | HTTP 200 — specified field automatically updated (e.g. `assignee_id = reporter_id`) | Positive | ✅ Pass |
| TC-W05 | Concurrent transitions — version conflict | Two simultaneous `POST /api/issues/:id/transitions` requests | One returns HTTP 200, the other returns HTTP 409 `VERSION_CONFLICT` | Concurrency | ✅ Pass |
| TC-W06 | Transition to same status as current | `POST /api/issues/:id/transitions` with `to_status_id` = current `status_id` | HTTP 422 — error code `TRANSITION_NOT_ALLOWED` (no self-loop rule) | Negative | ✅ Pass |
| TC-W07 | Transition request without to_status_id | `POST /api/issues/:id/transitions` with empty body | HTTP 422 — error code `VALIDATION_ERROR` | Negative | ✅ Pass |
| TC-W08 | Validation failure has meaningful error message | `POST /api/issues/:id/transitions` where `required_field` rule fails | HTTP 422 — `validation_errors[0]` contains descriptive message (e.g. "Must be assigned") | Negative | ✅ Pass |
| TC-W09 | TRANSITION_NOT_ALLOWED lists correct allowed targets | `POST /api/issues/:id/transitions` to disallowed status | `allowed_transitions` contains valid next status IDs, not the disallowed one | Negative | ✅ Pass |
| TC-W10 | Successful transition increments issue version | `POST /api/issues/:id/transitions` with valid transition | HTTP 200 — returned issue has `version = original_version + 1` | Positive | ✅ Pass |

---

## 5. Sprints (`tests/sprints.test.js`)

| TC# | Test Case | Input | Expected Output | Type | Status |
|-----|-----------|-------|-----------------|------|--------|
| TC-S01 | Create sprint with auto dates | `POST /api/projects/:id/sprints` with empty body | HTTP 201 — `start_date` and `end_date` auto-calculated using `sprint_duration_days` (default 14) | Positive | ✅ Pass |
| TC-S02 | Second sprint dates follow first | Complete sprint 1, then `POST /api/projects/:id/sprints` | Sprint 2 `start_date` = Sprint 1 `end_date` + 1 day | Positive | ✅ Pass |
| TC-S03 | Start sprint | `POST /api/sprints/:id/start` | HTTP 200 — sprint `status` changed to `active` | Positive | ✅ Pass |
| TC-S04 | Start second sprint when one is active | `POST /api/sprints/:id/start` when another sprint is already active | HTTP 422 — error code `SPRINT_ALREADY_ACTIVE` | Negative | ✅ Pass |
| TC-S05 | Complete sprint — velocity calculated | `POST /api/sprints/:id/complete` with issues in Done status having story_points | HTTP 200 — `velocity` = sum of `story_points` of all done issues | Positive | ✅ Pass |
| TC-S06 | Complete sprint — carry over issues | `POST /api/sprints/:id/complete` with `carry_over_issue_ids` | HTTP 200 — carried issues have `sprint_id` set to `null` (moved to backlog) | Positive | ✅ Pass |
| TC-S07 | Complete sprint with no done issues — velocity 0 | `POST /api/sprints/:id/complete` when all issues are still in To Do | HTTP 200 — `velocity` = 0 | Boundary | ✅ Pass |
| TC-S08 | List sprints for project | `GET /api/projects/:id/sprints` after creating 2 sprints | HTTP 200 — array containing at least 2 sprint objects | Positive | ✅ Pass |
| TC-S09 | Update sprint name via PATCH | `PATCH /api/sprints/:id` with `name: "Renamed Sprint"` | HTTP 200 — sprint returned with updated name | Positive | ✅ Pass |
| TC-S10 | Delete sprint moves issues to backlog | `DELETE /api/sprints/:id` when sprint has issues | HTTP 200/204 — all sprint issues have `sprint_id = null` | Positive | ✅ Pass |
| TC-S11 | Non-member cannot list sprints | `GET /api/projects/:id/sprints` by a user not in the project | HTTP 403 — error code `NOT_A_MEMBER` | Negative | ✅ Pass |

---

## 6. Comments (`tests/comments.test.js`)

| TC# | Test Case | Input | Expected Output | Type | Status |
|-----|-----------|-------|-----------------|------|--------|
| TC-C01 | Add comment to issue | `POST /api/issues/:id/comments` with body text | HTTP 201 — comment created and returned | Positive | ✅ Pass |
| TC-C02 | @mention creates notification | `POST /api/issues/:id/comments` with body containing `@DisplayName` | Notification of type `mention` created for the mentioned user | Positive | ✅ Pass |
| TC-C03 | Watchers notified on new comment | User watches issue, another user posts a comment | Watcher receives notification of type `comment` | Positive | ✅ Pass |
| TC-C04 | Reply to comment (thread) | `POST /api/issues/:id/comments` with `parent_id` set | HTTP 201 — reply stored with correct `parent_id` reference | Positive | ✅ Pass |
| TC-C05 | Soft delete comment | `DELETE /api/comments/:id` by the author | HTTP 204 — `is_deleted` set to `true`, comment hidden from listing | Positive | ✅ Pass |
| TC-C06 | Edit comment as non-author | `PATCH /api/comments/:id` by a user who is not the comment author | HTTP 403 — error code `FORBIDDEN` | Negative | ✅ Pass |
| TC-C07 | Edit comment as author | `PATCH /api/comments/:id` by the comment's own author with new body | HTTP 200 — comment returned with updated body text | Positive | ✅ Pass |
| TC-C08 | Add comment with empty body | `POST /api/issues/:id/comments` with `body: ""` | HTTP 422 — error code `VALIDATION_ERROR` | Negative | ✅ Pass |
| TC-C09 | Get comments for issue | `GET /api/issues/:id/comments` after adding comments | HTTP 200 — array of comments, each with `author_id` field | Positive | ✅ Pass |
| TC-C10 | @mention of non-existent user | `POST /api/issues/:id/comments` with `@NonExistentUser` in body | No new `mention` notification is created (unknown user ignored) | Negative | ✅ Pass |
| TC-C11 | Project admin can delete any comment | `DELETE /api/comments/:id` by project admin who is not the comment author | HTTP 204 — comment soft-deleted successfully | Positive | ✅ Pass |

---

## 7. Search (`tests/search.test.js`)

| TC# | Test Case | Input | Expected Output | Type | Status |
|-----|-----------|-------|-----------------|------|--------|
| TC-SR01 | Full-text search with query | `GET /api/search?q=OAuth&project_id=:id` | HTTP 200 — matching issues returned, ranked by relevance (ts_rank) | Positive | ✅ Pass |
| TC-SR02 | Filter by project_id | `GET /api/search?project_id=:id` | HTTP 200 — only issues belonging to that project returned | Positive | ✅ Pass |
| TC-SR03 | Filter by status_id | `GET /api/search?project_id=:id&status_id=:id` | HTTP 200 — only issues in that status column returned | Positive | ✅ Pass |
| TC-SR04 | Cursor pagination — no duplicates | `GET /api/search?project_id=:id&limit=1`, then use `next_cursor` for page 2 | Page 2 returns different issue, no duplicates across pages | Positive | ✅ Pass |
| TC-SR05 | Search with no filters | `GET /api/search` with no `q` or `project_id` | HTTP 400 — error code `VALIDATION_ERROR` | Negative | ✅ Pass |
| TC-SR06 | Filter by issue type | `GET /api/search?project_id=:id&type=bug` | HTTP 200 — all returned issues have `type = "bug"` | Positive | ✅ Pass |
| TC-SR07 | Search with q that matches nothing | `GET /api/search?q=xyznonexistentterm&project_id=:id` | HTTP 200 — empty `data` array returned (not an error) | Negative | ✅ Pass |
| TC-SR08 | Filter by priority | `GET /api/search?project_id=:id&priority=high` | HTTP 200 — all returned issues have `priority = "high"` | Positive | ✅ Pass |
| TC-SR09 | Search q matches description content | `GET /api/search?q=supercalifragilistic&project_id=:id` (term only in description) | HTTP 200 — issue matched via description full-text search | Positive | ✅ Pass |

---

## Edge Cases & Security Findings

| # | Title | Description | Behaviour |
|---|-------|-------------|-----------|
| EC-01 | Issue counter race condition | Two users create issues in the same project simultaneously | `FOR UPDATE` row-level lock on `projects.issue_counter` ensures sequential numbering — no duplicate `issue_key` values |
| EC-02 | Sprint duration change after sprints exist | Admin updates `sprint_duration_days` after sprints already exist | Existing sprint dates are unchanged (stored values). Only new sprints use the updated duration |
| EC-03 | Deleted parent issue — subtask orphan | A parent issue is deleted while it has subtasks | All child issues get `parent_id = NULL` automatically via `ON DELETE SET NULL` — no orphaned references |
| EC-04 | Cursor pagination with concurrent inserts | New issues inserted between page 1 and page 2 fetch | Pages have no duplicates but newly inserted items before the cursor are missed on prior pages (accepted keyset trade-off) |
| EC-05 | Self-mention notification | A user posts a comment @mentioning their own display_name | A `mention` notification is created for the author themselves (no self-suppression by design) |
| EC-06 | Soft-deleted comment mention records | Comment is soft-deleted after being posted with an @mention | `comment_mentions` row persists in DB; mention notification already sent is not retracted |
| EC-07 | Mass assignment — status_id bypass on PATCH (fixed) | `PATCH /api/issues/:id` previously accepted `status_id` in the request body, allowing direct status changes that bypassed all workflow transition rules, validation rules, and auto actions | **Fixed:** `status_id` removed from `updateIssueSchema`. Status can now only be changed via `POST /api/issues/:id/transitions` |
| EC-08 | Workflow skip on issue creation (fixed) | `POST /api/projects/:id/issues` previously accepted `status_id`, allowing a new issue to be created directly in Done or any status, skipping the entire workflow | **Fixed:** `status_id` removed from `createIssueSchema`. New issues always start at the first status column (position 0) |

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
Tests:       86 passed, 86 total
```
