# Development Guide

How to run the **Stadium Ops Grid Matrix** locally, access the UI, and emulate
SMS-based authentication without a real Twilio account.

> **Architecture context:** Netlify-only (Postgres + Blobs + Functions). No
> Firebase. See [`docs/adr/`](docs/adr/) for decisions and
> [`CONTEXT.md`](CONTEXT.md) for the glossary.

---

## Table of Contents

1. [Quick Start](#1-quick-start)
2. [What `npm run dev` Does](#2-what-npm-run-dev-does)
3. [Helper Scripts](#3-helper-scripts)
4. [Accessing the UI](#4-accessing-the-ui)
5. [SMS Emulation (Dev Mode)](#5-sms-emulation-dev-mode)
6. [Seeded Test Users](#6-seeded-test-users)
7. [Testing the Auth Flow](#7-testing-the-auth-flow)
8. [API Endpoints Reference](#8-api-endpoints-reference)
9. [Running Tests](#9-running-tests)
10. [Manual Setup (Advanced)](#10-manual-setup-advanced)
11. [Troubleshooting](#11-troubleshooting)

---

## 1. Quick Start

```bash
npm install
npm run dev
```

That's it. The `npm run dev` command automatically:

- Generates `.env` with a Docker Postgres URL and an RSA keypair for JWT signing
- Starts a local Postgres container via Docker Compose
- Waits for the database to accept connections
- Runs all pending migrations (schema + seed data)
- Starts `netlify dev` (frontend + API functions on **`http://localhost:8888`**)

**Prerequisites:** [Node.js](https://nodejs.org/) ≥ 20, [Docker](https://docker.com), and [Netlify CLI](https://docs.netlify.com/cli/get-started/) (`npm i -g netlify-cli`).

> No openssl, no manual `.env` editing, no `docker run` — the script handles everything.

---

## 2. What `npm run dev` Does

```
npm run dev
  → scripts/dev.ts
    → 1. Pre-flight: checks Docker installed + running, Netlify CLI present
    → 2. Setup: ensures .env exists (auto-generates JWT RSA keypair if missing)
    → 3. Docker: docker compose up -d (starts Postgres — no-op if already running)
    → 4. Poll: waits up to 30s for Postgres to accept connections
    → 5. Migrate: applies pending schema migrations (idempotent — skips applied)
    → 6. Serve: spawns netlify dev (Vite frontend + Netlify Functions API)
    → Ctrl+C: stops the dev server, leaves Docker running for fast restart
```

The `.env` file is created on first run and **never overwritten** — only missing
values are filled in. If you've already configured custom values, they're
preserved.

---

## 3. Helper Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Full orchestration: .env → Docker → migrate → netlify dev |
| `npm run dev:db` | Start the Postgres Docker container only |
| `npm run dev:db:stop` | Stop the Postgres container (data is preserved in volume) |
| `npm run dev:db:reset` | **Wipe all data** and recreate a fresh Postgres container |
| `npm run db:migrate` | Apply pending migrations manually |
| `npm test` | Run the test suite (37 tests) |

**Full reset (clean slate):**

```bash
npm run dev:db:reset   # wipes the Docker volume
npm run dev            # re-provisions .env + migrates + starts
```

---

## 4. Accessing the UI

Open your browser to:

```
http://localhost:8888
```

You'll see the **OTP Authentication Gateway** — a dark, high-contrast screen
with:
- An E.164 phone number input
- A "Send Code" button

> **Note:** The current UI is the auth gateway only (Milestone 1). The Control
> Room dashboard and Field Client surfaces are built in Milestones 2–5.

---

## 5. SMS Emulation (Dev Mode)

When Twilio credentials are **not set** in `.env`, the system automatically
enters **dev mode**. In this mode:

1. **No real SMS is sent.** The `sendSms()` function logs the message to the
   server terminal instead.

2. **The OTP code is returned in the API response** as `devCode`. The
   `OtpGateway` component displays it in an amber banner:

   ```
   ┌──────────────────────────────────────┐
   │ Dev mode — code: 482910              │
   └──────────────────────────────────────┘
   ```

3. **The code also appears in your terminal** where `netlify dev` is running:

   ```
   [DEV] Twilio not configured. SMS to +14155550001: "Your Stadium Ops access
   code is 482910. It expires in 5 minutes. Do not share this code."
   ```

### How to use it

1. Enter any seeded phone number (see §7 below) in the UI.
2. Click **Send Code**.
3. Read the 6-digit code from the amber banner or terminal.
4. Enter the code → click **Verify & Access**.
5. You receive a JWT and are authenticated.

### Using real Twilio (optional)

If you want to test real SMS delivery locally:

1. Create a [Twilio account](https://www.twilio.com/) (free trial gives a number).
2. Fill in the `.env` values:
   ```bash
   TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   TWILIO_AUTH_TOKEN=your_auth_token
   TWILIO_FROM_NUMBER=+1XXXXXXXXXX
   ```
3. Restart `netlify dev`.
4. The `devCode` banner disappears and real SMS messages are sent.

---

## 6. Seeded Test Users

The migration seeds three users into the `tenant_metlife_ops` tenant. Use these
phone numbers for local testing:

| Phone Number | Name | Role | Specialty | Zone |
|---|---|---|---|---|
| `+14155552026` | Command Coordinator | **admin** | supervisor | ZONE-A |
| `+14155550001` | Alpha Security Lead | **staff** | security | ZONE-A |
| `+14155550002` | Beta Medical Triage | **staff** | medical | ZONE-B |

Three tenants are also seeded:

| Tenant ID | Name |
|---|---|
| `tenant_metlife_ops` | MetLife Stadium Ops Core |
| `tenant_sofi_ops` | SoFi Stadium Command Center |
| `tenant_hardrock_ops` | Hard Rock Tournament Hub |

> **Tip:** All three users share the same phone-as-ID pattern. The admin user
> (`+14155552026`) will eventually route to the Control Room dashboard. Staff
> users route to the Field Client.

---

## 7. Testing the Auth Flow

### Via the UI

1. Open `http://localhost:8888`.
2. Enter `+14155550001` (staff) or `+14155552026` (admin).
3. Click **Send Code** → the dev code appears.
4. Enter the 6-digit code → click **Verify & Access**.
5. Check the browser console — the JWT is stored in `localStorage` under
   `stadiumops_jwt`.

### Via curl (API-level testing)

```bash
# Step 1: Request an OTP (dev mode returns the code)
curl -s http://localhost:8888/api/auth/request-otp \
  -H 'Content-Type: application/json' \
  -d '{"phoneNumber": "+14155550001"}' | jq

# Response:
# { "status": "SENT", "devCode": "482910" }

# Step 2: Verify the OTP and get a JWT
curl -s http://localhost:8888/api/auth/verify-otp \
  -H 'Content-Type: application/json' \
  -d '{"phoneNumber": "+14155550001", "code": "482910"}' | jq

# Response:
# {
#   "token": "eyJhbGciOi...",
#   "claims": { "role": "staff", "tenantId": "tenant_metlife_ops", ... }
# }

# Step 3: Use the JWT to call a protected endpoint (Milestone 2+)
TOKEN="eyJhbGciOi..."
curl -s http://localhost:8888/api/state-poll \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"tenantId": "tenant_metlife_ops", "sinceTimestamp": 0}' | jq
```

### Inspecting the JWT

```bash
# Decode the payload (middle segment) — no signature verification
echo "eyJhbGciOi..." | cut -d. -f2 | base64 -d 2>/dev/null | jq .
```

---

## 8. API Endpoints Reference

### Auth Endpoints (Milestone 1)

| Method | Path | Body | Response |
|---|---|---|---|
| `POST` | `/api/auth/request-otp` | `{ "phoneNumber": "+14155550001" }` | `{ "status": "SENT", "devCode": "482910" }` |
| `POST` | `/api/auth/verify-otp` | `{ "phoneNumber": "+14155550001", "code": "482910" }` | `{ "token": "<jwt>", "claims": { ... } }` |

### Protected Endpoints (future milestones)

| Method | Path | Auth | Status |
|---|---|---|---|
| `POST` | `/api/state-poll` | Bearer JWT | Milestone 2 |
| `POST` | `/api/ai-triage` | Bearer JWT | Milestone 4 |
| `PATCH` | `/api/mutations/*` | Bearer JWT | Milestone 3 |

### Error responses

All endpoints return errors as:

```json
{ "error": "Human-readable error message." }
```

Common status codes:

| Code | Meaning |
|---|---|
| `400` | Missing/invalid request body |
| `401` | OTP wrong/expired/max-attempts |
| `403` | Phone not on active staff roster |
| `405` | Wrong HTTP method |
| `429` | OTP cooldown — too many requests |
| `500` | Server error (check terminal) |

---

## 9. Running Tests

```bash
# Run all tests once
npm test

# Watch mode (re-runs on file change)
npm run test:watch

# Run with coverage report
npx vitest run --coverage
```

Current test coverage (37 tests, 5 files):

| File | Tests | What it covers |
|---|---|---|
| `canvasMath.test.ts` | 13 | Coordinate projection (clientToGrid, gridToClient, distance, clamp) |
| `types.test.ts` | 9 | Type unions — 5-tier, no stale values (CLOSED, ACTIVE, logistics) |
| `jwt.test.ts` | 6 | RS256 sign/verify roundtrip, tamper rejection, bearer extraction |
| `otp.test.ts` | 5 | Code generation format/range, SMS formatting |
| `api.test.ts` | 4 | Client-side claims decoding, malformed token handling |

---

## 10. Manual Setup (Advanced)

If you prefer to set things up manually (without `npm run dev` orchestration),
or need a non-Docker Postgres:

### Generate JWT keys manually

```bash
openssl genrsa -out jwt-private.pem 2048
openssl rsa -in jwt-private.pem -pubout -out jwt-public.pem
```

Then paste the PEM contents into `.env` as `JWT_PRIVATE_KEY` and `JWT_PUBLIC_KEY`
(use `\n` for line breaks in the .env value, or let `scripts/setup-env.ts`
generate them: `npx tsx scripts/setup-env.ts`).

### Use Homebrew Postgres instead of Docker

```bash
brew install postgresql@16
brew services start postgresql@16
createdb stadium_ops
```

Update `.env`:
```
DATABASE_URL=postgres:///stadium_ops
```

### Start manually (without the orchestrator)

```bash
docker compose up -d         # start Postgres
npm run db:migrate           # apply schema
netlify dev                  # start frontend + functions
```

---

## 11. Troubleshooting

### `netlify dev` won't start

```
✘ Cannot find module '@netlify/functions'
```

**Fix:** Run `npm install` first. If it persists, run `netlify dev --debug` for
detailed logs.

### Database connection failed

```
✘ Migration runner crashed: connect ECONNREFUSED 127.0.0.1:5432
```

**Fix:** Ensure Postgres is running:
- Docker: `docker ps | grep stad-ops-db` — if missing, recreate the container.
- Homebrew: `brew services list | grep postgresql`

Check `DATABASE_URL` in `.env` matches your Postgres credentials.

### OTP verification fails with "not found"

The OTP session was cleared or expired. Request a new code — the old one is
invalid after 5 minutes (`OTP_EXPIRES_IN=300`).

### "Phone number is not on the active staff roster"

The phone number doesn't exist in the `staff_roster` table. Either:
- Use one of the [seeded test users](#7-seeded-test-users).
- Insert a new row: `INSERT INTO staff_roster (id, tenant_id, full_name, role, specialty, assigned_zone, phone_number) VALUES ('+1...', 'tenant_metlife_ops', 'Test User', 'staff', 'security', 'ZONE-A', '+1...');`

### JWT errors ("JWT_PUBLIC_KEY is not set")

The `.env` file is missing the PEM key values. Ensure you've pasted the **full**
PEM contents including the `-----BEGIN/END-----` lines.

### Port already in use (8888)

```bash
# Find and kill the process on port 8888
lsof -ti:8888 | xargs kill -9
```

Or start on a different port: `netlify dev --port 8889`

---

## Quick Reference

```bash
# Start everything (first run or subsequent)
npm run dev                    # → http://localhost:8888

# Stop Postgres
npm run dev:db:stop

# Full reset (wipe all data)
npm run dev:db:reset && npm run dev

# Run tests
npm test                       # → 37 tests
```
