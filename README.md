# Operations Management Platform — Field Visit Planning & Approval Service
**Evidence Action India · India Safe Water Program**  
*Software Development Intern Technical Submission*

---

## 1. Overview

This platform replaces ad-hoc spreadsheets, emails, and messaging apps with a structured, reliable, and auditable system for field visit planning, budget tracking, and headquarters approvals.

The project is built with:
- **Backend:** Node.js with Express.js REST API
- **Database:** PostgreSQL (with pure SQL `schema.sql` and `seed.sql`)
- **Frontend:** Lightweight, single-page web interface (Vanilla HTML5 / Modern CSS / ES6 JavaScript) designed in a warm-slate & forest green theme
- **Testing:** Automated Jest test suite thoroughly covering visit lifecycle rules and server-side authorization

---

## 2. Setup Guide

This application requires **Node.js (v18+)** and a running **PostgreSQL** instance.

> **Note:** There is no embedded/in-memory database fallback. If PostgreSQL is unavailable or misconfigured, the server will fail to start with an explicit connection error. This is intentional — silent database fallbacks hide real infrastructure problems in a production operations system.

### Quick Start
```bash
# 1. Install dependencies
npm install

# 2. Configure environment (copy example and fill in your PostgreSQL credentials)
cp .env.example .env

# 3. Apply schema and seed data
npm run db:setup

# 4. Run the automated test suite
npm test

# 5. Start the application
npm start
```
Open **`http://localhost:3000`** in your browser to access the web UI.

---

### Production / External PostgreSQL Setup

If running against an external PostgreSQL server (e.g., standard PostgreSQL or Docker):

1. **Create Database:**
   ```bash
   createdb evidence_action
   ```

2. **Configure Environment:**
   ```bash
   cp .env.example .env
   ```
   Edit `.env` with your PostgreSQL credentials:
   ```env
   DATABASE_URL=postgresql://postgres:your_password@localhost:5432/evidence_action
   ```

3. **Apply Schema and Seed Data:**
   You can either run the migration script:
   ```bash
   npm run db:setup
   ```
   Or execute the `.sql` files directly using standard `psql`:
   ```bash
   psql -d evidence_action -f schema.sql
   psql -d evidence_action -f seed.sql
   ```

4. **Start the Server:**
   ```bash
   npm start
   # or development mode with auto-reload:
   npm run dev
   ```

---

## 3. Environment Variables

All variables are documented in [`.env.example`](file:///c:/Users/hp/Desktop/Evidence%20Action/.env.example):

| Variable | Description | Default / Example |
| :--- | :--- | :--- |
| `PORT` | Port for the Express HTTP server | `3000` |
| `NODE_ENV` | Runtime environment (`development`, `production`, `test`) | `development` |
| `JWT_SECRET` | Secret key used to sign and verify JSON Web Tokens | Placeholder in `.env.example` |
| `JWT_EXPIRES_IN` | Token expiration duration | `8h` |
| `DATABASE_URL` | Full PostgreSQL connection string (takes precedence if set) | `postgresql://postgres:postgres@localhost:5432/evidence_action` |
| `PGHOST` | PostgreSQL host | `localhost` |
| `PGPORT` | PostgreSQL port | `5432` |
| `PGUSER` | PostgreSQL user | `postgres` |
| `PGPASSWORD` | PostgreSQL password | `postgres` |
| `PGDATABASE` | PostgreSQL database name | `evidence_action` |

> **Security Note:** In accordance with Section 6 of the brief, no real secrets or `.env` files are committed to version control.

---

## 4. Test Credentials

The database comes pre-seeded with four users representing every role. The password for **all seeded accounts** is:
```
Password123!
```

| Role | Name | Email | Permissions & Scope |
| :--- | :--- | :--- | :--- |
| `FIELD_OFFICER` | **Aarav Sharma** | `officer1@evidenceaction.org` | Creates/edits/submits own visits. Sees only own visits. Completes approved visits. |
| `FIELD_OFFICER` | **Priya Patel** | `officer2@evidenceaction.org` | Creates/edits/submits own visits. Cannot see or modify Officer 1's visits. |
| `HQ_APPROVER` | **Sunil Kumar** | `approver@evidenceaction.org` | Reviews pending visits. Approves or rejects with written remarks. Views HQ summary. |
| `ADMIN` | **Deepa Menon** | `admin@evidenceaction.org` | Complete administrative access. Views all visits across all officers (including drafts). |

*Note: The frontend UI features 1-click Quick Demo Login buttons on the sign-in screen to make switching between roles instant.*

---

## 5. Design Decisions

### 5.1 Data Modelling & Constraints
The database schema (`schema.sql`) uses a normalized relational model across four tables:
- **`users`**: User identity, role enum (`FIELD_OFFICER`, `HQ_APPROVER`, `ADMIN`), and bcrypt password hash.
- **`locations`**: Program locations (treatment plants, water testing facilities).
- **`visits`**: The core operational entity with state enum (`DRAFT`, `PENDING`, `APPROVED`, `REJECTED`, `COMPLETED`), foreign keys with `ON DELETE RESTRICT` (preventing accidental deletion of users or locations with active visit history), and non-negative budget constraint (`CHECK (estimated_cost >= 0)`).
- **`approval_decisions`**: Append-only audit log tracking every decision, decider ID, timestamp, and remark.

#### Schema Defense Against Invalid States
Invalid states are prevented at the database level:
```sql
CONSTRAINT chk_decision_remarks CHECK (
    action != 'REJECTED' OR (remarks IS NOT NULL AND length(trim(remarks)) > 0)
)
```
This PostgreSQL check constraint ensures that **a rejection can never be inserted into the database without a non-empty written remark**, upholding the core domain rule even if someone attempted to bypass the application layer.

### 5.2 Indexing Strategy (Added vs. Deliberately Omitted)

#### Indexes Added:
1. `CREATE UNIQUE INDEX idx_users_email ON users(email);`
   - *Rationale:* Essential for fast $O(1)$ email lookup during login and uniqueness enforcement.
2. `CREATE INDEX idx_visits_officer_id ON visits(officer_id);`
   - *Rationale:* Field Officers are restricted to viewing only their own visits (`WHERE officer_id = $1`). This index prevents table scans on every list request.
3. `CREATE INDEX idx_visits_status ON visits(status);`
   - *Rationale:* Approvers frequently filter visits awaiting review (`WHERE status = 'PENDING'`), and HQ summary queries aggregate visit counts by status (`GROUP BY status`).
4. `CREATE INDEX idx_visits_location_id ON visits(location_id);`
   - *Rationale:* Indexes the foreign key for fast JOINs and per-location summary aggregations.
5. `CREATE INDEX idx_visits_planned_date ON visits(planned_date DESC);`
   - *Rationale:* Enables fast chronological sorting and pagination of upcoming field visits.
6. `CREATE INDEX idx_approval_decisions_visit_id ON approval_decisions(visit_id, created_at ASC);`
   - *Rationale:* Provides immediate retrieval of complete chronological decision history when inspecting a visit.

#### Indexes Deliberately Omitted:
- **`users(role)`**: Omitted because role has extremely low cardinality (only 3 distinct values). B-Tree indexes on low-cardinality columns offer negligible selectivity and create unnecessary write overhead.
- **`visits(purpose)` / `visits(title)`**: Omitted because these are free-text fields and are not used as equality search filters in operational routing. Indexing large text columns leads to B-tree bloat without query benefits.
- **`visits(estimated_cost)`**: Omitted because cost is only aggregated (`SUM`), never filtered by range in primary user workflows.

### 5.3 Where State Transitions are Enforced
State transitions are centralized in a dedicated domain service: [`src/services/visitLifecycle.js`](file:///c:/Users/hp/Desktop/Evidence%20Action/src/services/visitLifecycle.js).
This implements the exact transition matrix from Section 2.3:

```
[DRAFT]      ──Submit (Creator)────> [PENDING]
[PENDING]    ──Approve (Approver)──> [APPROVED]
[PENDING]    ──Reject (Approver)───> [REJECTED]
[REJECTED]   ──Resubmit (Creator)──> [PENDING]
[APPROVED]   ──Complete (Creator)──> [COMPLETED] (Terminal)
```

- Any attempt to perform an unlisted transition (e.g., `DRAFT -> APPROVED`, or `COMPLETED -> PENDING`) is rejected with HTTP `400 Bad Request`.
- Status updates and audit log insertions in `decide` are executed inside an **ACID transaction (`BEGIN ... COMMIT / ROLLBACK`)** using a dedicated database client.

### 5.4 How Server-Side Authorisation is Enforced
Authorization is never delegated to the UI:
1. **JWT Verification Middleware (`src/middleware/auth.js`):** Validates the Bearer token on every non-login endpoint and hydrates `req.user`.
2. **Role Verification Middleware (`src/middleware/authorize.js`):** Restricts endpoints like `GET /api/summary` to `HQ_APPROVER` and `ADMIN`.
3. **Data Scoping in Queries:**
   - Field Officers querying `GET /api/visits` automatically have `WHERE officer_id = req.user.id` appended.
   - Approvers querying `GET /api/visits` automatically have `WHERE status != 'DRAFT' OR officer_id = req.user.id` appended.
4. **Ownership Checks on Resources:**
   - Attempting to view, edit, submit, or complete another officer's visit returns `403 Forbidden`.
   - **Separation of Duties:** In `POST /api/visits/:id/decide`, if `visit.officer_id === req.user.id`, the server refuses the request with `403 Forbidden` ("An approver cannot approve or reject a visit they created").

---

## 6. REST API Reference

| Method | Endpoint | Allowed Roles | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/auth/login` | Public | Authenticates credentials, returns signed JWT. |
| `GET` | `/api/auth/me` | Authenticated | Returns logged-in user profile. |
| `GET` | `/api/locations` | Authenticated | Lists all program locations. |
| `POST` | `/api/visits` | Officer, Admin | Creates visit in `DRAFT` status. |
| `GET` | `/api/visits` | Authenticated | Paginated visit list scoped by role, with `status` and `location_id` filters. |
| `GET` | `/api/visits/:id` | Authenticated | Single visit details + complete decision history. |
| `PATCH`| `/api/visits/:id` | Creator | Edits visit (only permitted in `DRAFT` or `REJECTED`). |
| `POST` | `/api/visits/:id/submit` | Creator | Moves `DRAFT` or `REJECTED` visit to `PENDING`. |
| `POST` | `/api/visits/:id/decide` | Approver, Admin | Approves or rejects `PENDING` visit (requires remark on reject; creator cannot decide). |
| `POST` | `/api/visits/:id/complete`| Creator | Moves `APPROVED` visit to `COMPLETED`. |
| `GET` | `/api/summary` | Approver, Admin | Aggregated visit counts by status and per-location budget breakdown. |

---

## 7. Trade-offs & Known Gaps

1. **Email / Push Notifications:** In a full-scale deployment, transitions (especially rejection or approval) should trigger notifications (e.g., SendGrid or WhatsApp API webhook) to notify officers of decision status in real time.
2. **File Attachments:** Receipts, water testing lab reports, or calibration photos are currently represented as notes/text in the `purpose` field. A production version would integrate an S3/GCS bucket for document uploads.
3. **Soft Deletes:** Currently, visits cannot be deleted by design to maintain operational traceability. Adding a soft-delete (`archived_at`) for draft visits could be added if officers abandon draft plans.
4. **Pagination Optimization:** Offset-based pagination (`LIMIT / OFFSET`) is implemented for simplicity and clarity. For datasets with hundreds of thousands of records, cursor-based pagination (e.g., `WHERE (planned_date, id) < ($last_date, $last_id)`) would offer better performance.
5. **Session Revocation / Refresh Tokens:** We use short-to-medium lived JWTs without a database blacklist. In high-security environments, a Redis-backed refresh token rotation scheme would allow instant revocation.

---

## 8. Note on AI Tool Usage

An AI assistant was used as a pair-programming tool throughout development. Below is an honest breakdown of what was AI-generated versus what came from my own direction and decisions:

### What the AI generated (accepted as-is or with minor edits):
- **Frontend (most of it):** The majority of the HTML, CSS, and client-side JavaScript was written by the AI. I reviewed it, made changes where the design or behaviour did not fit the use case, and adjusted interactions to match the backend's actual API responses.
- **Test file (`tests/lifecycle.test.js`):** The test file was written entirely by the AI. However, I directed exactly which test cases to write — I specified the lifecycle states to cover, the authorization scenarios to verify (e.g. officer cross-access, separation of duties, rejection without remarks), and the edge cases to include. The AI translated those requirements into Jest assertions.
- **SQL error code mapping (PostgreSQL SQLSTATE codes):** The mapping of PostgreSQL error codes (`23505`, `23503`, `23514`) to HTTP responses in `errorHandler.js` was generated by the AI. The human-readable JSON error messages themselves were written by me.
- **`seed.sql`:** The seed data file (demo users, locations, and sample visits) was generated by the AI based on the domain context I provided.
- **Systematic approach:** I asked the AI how to approach this problem domain systematically — it helped structure the separation of concerns between the schema layer, lifecycle service, middleware, and routes.

### What was rejected or changed:
- **Primary keys: Auto-increment integers → UUIDs.** The AI initially used standard auto-incrementing integer IDs (`SERIAL PRIMARY KEY`). I changed all primary keys to UUIDs (`UUID PRIMARY KEY DEFAULT gen_random_uuid()`) for the following reasons:
  - **Security — Prevents ID Enumeration:** Sequential integers let an attacker guess other users' or visits' IDs by incrementing (`/api/visits/1`, `/api/visits/2`, etc.). A random UUID (`a3f9...`) is not guessable.
  - **Audit Trail Integrity:** UUIDs are globally unique across time and systems, which is important for an operational audit log (`approval_decisions`) that may eventually be merged with external systems.
  - **No Ordering Leakage:** Auto-increment IDs reveal how many records exist in the system and in what order they were created — operational security information that should stay private.
  - **Distributed Readiness:** If the database is ever sharded or replicated across regions, UUIDs avoid primary key collisions that sequential integers would cause.
- **Rejection remarks enforcement moved to the database layer.** The AI initially suggested validating rejection remarks only at the controller (JavaScript) layer. I rejected this and added a PostgreSQL check constraint (`chk_decision_remarks`) directly on the `approval_decisions` table, ensuring the rule holds even if someone writes a script that bypasses the API.
- **Separation of duties made strict.** The AI initially suggested a soft advisory check on approver identity. I enforced it as a hard block (`visit.officer_id !== req.user.id`) in the lifecycle service and added explicit test coverage for it.
- **Wildcard routing adjusted for Express compatibility.** The AI generated `app.get('*', ...)` catch-all routes, which crash with newer versions of `path-to-regexp` used by modern Express. I replaced these with path-less fallback middleware (`app.use((req, res) => ...)`) which works correctly across all Express versions.
