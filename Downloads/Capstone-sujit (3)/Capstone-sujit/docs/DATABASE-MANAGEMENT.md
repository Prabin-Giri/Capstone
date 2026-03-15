# Database Management — How the Database Works (IntelliGrade / Capstone)

**Audience:** Database Management Lead  
**Stack:** Node.js (Express) + MySQL via `mysql2` (Promise API)  
**Database name:** `intelligrade` (configurable via `.env`)

---

## 1. High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  Express server (index.js)                                       │
│  - Starts only after initDb() succeeds                           │
│  - All API routes use getDb() → connection pool                  │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│  db.js                                                           │
│  - initDb(): creates pool, ensures DB/schema exist, optional seed │
│  - getDb(): returns pool (throws if not initialized)             │
│  - formatDbError(): maps MySQL errors to readable messages        │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│  mysql2/promise                                                  │
│  - createConnection() for one-time “bootstrap” connection        │
│  - createPool() for all runtime queries (connection pool)         │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│  MySQL server                                                    │
│  - Local (127.0.0.1) or Google Cloud SQL                         │
│  - Database: intelligrade                                        │
│  - Tables: users, courses, course_enrollments, assignments,      │
│    submissions, todos, course_settings, course_documents,         │
│    test_cases                                                     │
└─────────────────────────────────────────────────────────────────┘
```

- **Single point of configuration:** `server/.env` (DB_HOST, DB_USER, DB_PASSWORD, DB_NAME, DB_PORT, optional USE_SSL).
- **Single point of access:** All routes call `getDb()` to get the same pool; no direct `mysql.createConnection()` in route handlers.
- **Startup contract:** The HTTP server does **not** listen until `initDb()` has completed successfully; otherwise the process exits with code 1.

---

## 2. Configuration and Environment

| Variable       | Purpose                    | Default (if missing) |
|----------------|----------------------------|-----------------------|
| `DB_HOST`      | MySQL server host          | `127.0.0.1`          |
| `DB_USER`      | MySQL username             | `root`               |
| `DB_PASSWORD`  | MySQL password             | `''`                 |
| `DB_NAME`      | Database name              | `intelligrade`       |
| `DB_PORT`      | MySQL port                 | `3306`               |
| `USE_SSL`      | Use TLS to MySQL           | not set → no SSL     |
| `DB_SSL_VERIFY`| If USE_SSL: verify cert    | verify (set `false` to skip in dev) |

- Configuration is loaded in `db.js` via `require('dotenv').config()` (reads `server/.env`).
- For **production** (e.g. Google Cloud SQL), set real values for `DB_HOST`, `DB_USER`, `DB_PASSWORD`; optionally `USE_SSL=true` and `DB_SSL_VERIFY` as needed.

---

## 3. Initialization Flow (initDb)

`initDb()` in `server/db.js` runs once at server startup (from `index.js`). It is **idempotent**: if the pool already exists, it returns it immediately.

### Step 1: Build connection options

- Reads host, user, password, database, port from env.
- Adds `connectTimeout: 10000` (10 seconds).
- If `USE_SSL === 'true'`, adds `ssl` with optional `rejectUnauthorized` from `DB_SSL_VERIFY`.

### Step 2: Retry loop (up to 3 attempts, 2 seconds apart)

For each attempt:

1. **Bootstrap connection (no database selected)**  
   - `mysql.createConnection(baseOptions)` (no `database` in options).  
   - Runs: `CREATE DATABASE IF NOT EXISTS \`intelligrade\`` (database name from env).  
   - Closes this connection.  
   - Purpose: ensure the database exists even if the DB user can create it.

2. **Create the connection pool**  
   - `mysql.createPool({ ...baseOptions, database, waitForConnections: true, connectionLimit: 10, queueLimit: 0, enableKeepAlive: true, keepAliveInitialDelay: 0 })`.  
   - All application queries use this pool (no new connections per request).

3. **Schema creation**  
   - Calls `initializeSchema()` (see below).  
   - If any step throws, the error is logged, and the next attempt runs after 2 seconds.

If all 3 attempts fail, `initDb()` throws; `index.js` catches, logs “Failed to initialize database”, and exits with code 1. The HTTP server is never started.

---

## 4. Schema Initialization (initializeSchema)

- Runs only after the pool is created; uses `pool.query()` for DDL.
- All statements use **CREATE TABLE IF NOT EXISTS**, so existing tables are left as-is (no automatic migrations or alters).

### Table creation order (respects foreign keys)

1. **users** — no FKs (root of user-related references).
2. **courses** — FK `instructor_id` → `users(id)` ON DELETE SET NULL.
3. **course_enrollments** — composite PK (course_id, student_id); FKs to `courses`, `users` ON DELETE CASCADE.
4. **assignments** — FK `course_id` → `courses(id)` ON DELETE CASCADE.
5. **submissions** — FKs to `assignments`, `users` ON DELETE CASCADE.
6. **todos** — FKs to `users` ON DELETE CASCADE, `courses` ON DELETE SET NULL.
7. **course_settings** — composite PK (student_id, course_id); FKs to `users`, `courses` ON DELETE CASCADE.
8. **course_documents** — PK `course_id`; FK to `courses` ON DELETE CASCADE.
9. **test_cases** — FK `assignment_id` → `assignments(id)` ON DELETE CASCADE.

So: **users** and **courses** are the main parents; assignments, enrollments, submissions, etc. cascade or set null as designed.

### Seed data (one-time)

- After DDL, runs: `SELECT COUNT(*) FROM users`.
- If count is 0, inserts:
  - 3 users (admin, faculty, student),
  - 1 course (CSCI4060, Spring 2026),
  - 1 assignment (Language and Platform).
- No seed runs if any users already exist.

---

## 5. How the Application Uses the Database

### Access pattern

- Every route that needs the DB does: `const db = getDb();` (from `require('../db')` or `require('./db')`).
- `getDb()` returns the same pool instance; if the pool was never created it throws: “Database not initialized. Ensure the server started successfully and MySQL is running.”

### Query APIs used

- **`db.execute(sql, params)`** — used for almost all queries; parameters are passed as an array (e.g. `[userId]`). This uses prepared statements and avoids SQL injection for user-supplied values.
- **`db.query(sql)`** — used for static statements (e.g. seed inserts, or DDL in schema). No user input in those strings.

Return shape from `execute`/`query`: `[rows, fields]`. Routes typically destructure: `const [rows] = await db.execute(...)` and use `rows[0]` for single-row results.

### Route → table mapping (summary)

| Area            | Routes (conceptually)     | Main tables used                                      |
|-----------------|---------------------------|--------------------------------------------------------|
| Users           | signup, login, list students | users                                                 |
| Courses         | CRUD, enrollments, docs   | courses, course_enrollments, course_documents, users  |
| Assignments     | CRUD, grading, test runs | assignments, test_cases, submissions, users           |
| Submissions     | submit, grade, list      | submissions, assignments, users                       |
| Calendar/Todos  | get/update todos, settings | todos, course_settings                                |
| Uploads         | syllabus/schedule upload  | course_documents                                      |
| Test cases      | CRUD per assignment      | test_cases                                            |

All of these use `getDb()` and then `db.execute()` (or occasionally `db.query()`) with parameterized queries.

### Helper exports from db.js

- **queryToObjects(result)** — returns `result[0]` (array of rows).
- **queryOne(result)** — returns first row or null.  
Used by some routes to keep response building consistent.

---

## 6. Error Handling and Resilience

- **Connection errors:** `formatDbError()` in `db.js` maps MySQL driver codes to clear messages (e.g. ECONNREFUSED, ETIMEDOUT, ER_ACCESS_DENIED_ERROR, ER_BAD_DB_ERROR, PROTOCOL_CONNECTION_LOST). These are logged during init retries and re-thrown on final failure.
- **Connect timeout:** 10 seconds per connection attempt.
- **Retries:** 3 attempts with 2-second delay; only during startup.
- **Runtime errors:** If a route’s `db.execute()` throws (e.g. constraint violation, deadlock), the error is passed to Express’s error handler and returned as 500 with a generic message (see `index.js`). The pool itself remains valid; other requests continue using it.

No automatic reconnection logic exists for runtime connection loss; the pool’s keep-alive and mysql2’s behavior help with stale connections, but long outages may require process restart.

---

## 7. Shutdown and Resource Cleanup

- On **SIGINT** / **SIGTERM**, `index.js` runs a shutdown handler that:
  - Requires `getDb`, gets the pool, and calls `await db.end()` to close the pool.
  - Then `process.exit(0)`.
- If the pool was never created or already closed, the shutdown handler catches the error and still exits. This avoids leaving MySQL connections open when the process stops.

---

## 8. Security and Good Practices (DB Lead View)

- **Parameterized queries:** Application code uses `db.execute(sql, [param1, param2])` for any user-dependent values, which is correct and prevents SQL injection for those values.
- **Dynamic SQL:** In `uploads.js`, the column name in `UPDATE course_documents SET ${column} = ?` is only ever one of `'syllabus_path'` or `'schedule_path'` (set by the route, not by the client). So this is safe; if more columns are added, they should remain server-controlled.
- **Credentials:** Stored only in `.env`; not committed (ensure `.env` is in `.gitignore`). Production should use a secret manager or environment injection; avoid default passwords.
- **Passwords in DB:** The `users` table stores plaintext passwords. For a production system, this should be replaced with hashing (e.g. bcrypt) and possibly salt; that is an application-layer change, not a schema change.
- **Network:** For Cloud SQL, access is controlled by DB credentials and (when applicable) authorized networks or Cloud SQL Auth Proxy; the app does not open a separate DB port to the internet.

---

## 9. Schema Summary (Quick Reference)

| Table               | Primary key              | Notable FKs / notes                                  |
|---------------------|--------------------------|------------------------------------------------------|
| users               | id (VARCHAR)             | Referenced by courses, enrollments, submissions, todos, course_settings |
| courses             | id (VARCHAR)             | instructor_id → users(id) SET NULL                   |
| course_enrollments   | (course_id, student_id)  | CASCADE from courses, users                          |
| assignments         | id (VARCHAR)             | course_id → courses CASCADE                          |
| submissions         | id (AUTO_INCREMENT)     | assignment_id, student_id CASCADE                    |
| todos               | id (VARCHAR)             | student_id CASCADE, course_id SET NULL               |
| course_settings     | (student_id, course_id) | both CASCADE                                         |
| course_documents     | course_id                | CASCADE to courses                                   |
| test_cases          | id (AUTO_INCREMENT)     | assignment_id CASCADE                                |

---

## 10. Operational Checklist (DB Lead)

- **Backups:** Not implemented in app code; rely on MySQL/Cloud SQL backup (e.g. automated snapshots, point-in-time recovery).
- **Migrations:** No migration framework; schema changes require manual ALTER or script; `CREATE TABLE IF NOT EXISTS` means new installs get the current schema, existing installs are unchanged.
- **Monitoring:** No built-in DB metrics; consider adding health checks that run a simple `SELECT 1` (e.g. in `/api/health`) and/or connection pool metrics.
- **Capacity:** Pool has `connectionLimit: 10`; tune based on MySQL `max_connections` and number of app instances.
- **Seeding:** Initial seed runs only when `users` is empty; for a fresh clone or new environment, that’s sufficient to have one admin, one faculty, one student, one course, and one assignment.

---

**Summary for DB lead:** The app uses a single MySQL database `intelligrade`, configured via `.env`, with a connection pool created at startup. Schema is created automatically in the correct order with foreign keys; seed data is inserted only when the users table is empty. All access goes through `getDb()` and parameterized `execute()` calls. Startup is gated on successful DB init; shutdown closes the pool cleanly. For production, focus on real credentials, backups, optional password hashing, and health checks/monitoring.
