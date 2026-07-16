# Development Guide

How to run the **Stadium Ops Grid Matrix** locally, access the UI, and emulate
SMS-based authentication without a real Twilio account.

> **Architecture context:** Netlify-only (Postgres + Blobs + Functions). No
> Firebase. See [`docs/adr/`](docs/adr/) for decisions and
> [`CONTEXT.md`](CONTEXT.md) for the glossary.

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Initial Setup](#2-initial-setup)
3. [Database Setup](#3-database-setup)
4. [Running Locally](#4-running-locally)
5. [Accessing the UI](#5-accessing-the-ui)
6. [SMS Emulation (Dev Mode)](#6-sms-emulation-dev-mode)
7. [Seeded Test Users](#7-seeded-test-users)
8. [Testing the Auth Flow](#8-testing-the-auth-flow)
9. [API Endpoints Reference](#9-api-endpoints-reference)
10. [Running Tests](#10-running-tests)
11. [Troubleshooting](#11-troubleshooting)

---

## 1. Prerequisites

| Tool | Version | Purpose |
|---|---|---|
| **Node.js** | ≥ 20 LTS | Runtime + build |
| **npm** | ≥ 10 | Package manager |
| **Netlify CLI** | latest (`npm i -g netlify-cli`) | Local function emulator (`netlify dev`) |
| **Docker** | latest | Local Postgres (recommended) |
| **openssl** | any | Generate RSA keypair for JWT signing |

Install the Netlify CLI globally:

```bash
npm install -g netlify-cli
```

---

## 2. Initial Setup

```bash
# Clone the repo (if you haven't already)
git clone <repo-url> stad-ops && cd stad-ops

# Install dependencies
npm install
```

### Generate JWT signing keys

The auth system uses RS256 JWTs (ADR-0003). You need an RSA keypair stored as
PEM files. **Do not commit these** — they're local development secrets.

```bash
# Generate a 2048-bit RSA private key
openssl genrsa -out jwt-private.pem 2048

# Derive the public key from it
openssl rsa -in jwt-private.pem -pubout -out jwt-public.pem
```

### Configure environment variables

```bash
cp .env.example .env
```

Edit `.env` and fill in the following **required** values for local dev:

```bash
# ── Database ──
# Point to your local Postgres (see §3 below)
DATABASE_URL=postgres://postgres:postgres@localhost:5432/stadium_ops

# ── JWT keys ──
# Paste the FULL PEM contents (including -----BEGIN/END----- lines).
# Multi-line values work in .env files.
JWT_PRIVATE_KEY=<contents of jwt-private.pem>
JWT_PUBLIC_KEY=<contents of jwt-public.pem>
```

**Leave these BLANK for local dev** (they enable SMS emulation):

```bash
# Leave empty — the system detects "dev mode" and emulates SMS
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_FROM_NUMBER=
```

> **That's it.** You do NOT need real Twilio, OpenAI, or Gemini keys for local
> development of the auth flow. Those are only needed for voice triage
> (Milestone 4) and production deployment.

---

## 3. Database Setup

### Option A: Docker (recommended)

```bash
# Start a local Postgres 16 container
docker run --name stad-ops-db \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=stadium_ops \
  -p 5432:5432 \
  -d postgres:16

# Verify it's running
docker ps | grep stad-ops-db
```

Your `DATABASE_URL` should be:
```
DATABASE_URL=postgres://postgres:postgres@localhost:5432/stadium_ops
```

### Option B: Homebrew (macOS)

```bash
brew install postgresql@16
brew services start postgresql@16
createdb stadium_ops
```

Your `DATABASE_URL` should be:
```
DATABASE_URL=postgres:///stadium_ops
```

### Run the migration

```bash
npm run db:migrate
```

This creates all tables, indexes, triggers, and **seed data** (3 tenants + 3
staff users + the operational switch config). You should see:

```
▶ Found 1 migration file(s).
  → Applying 0001_init.sql...
  ✓ 0001_init.sql — applied
✔ All migrations complete.
```

To re-run the migration from scratch (drops everything and recreates):

```bash
# Docker
docker rm -f stad-ops-db && docker run --name stad-ops-db ...  # recreate container
npm run db:migrate

# Homebrew
dropdb stadium_ops && createdb stadium_ops
npm run db:migrate
```

---

## 4. Running Locally

```bash
netlify dev
```

This command:

1. **Auto-detects Vite** and starts the frontend dev server.
2. **Starts the Netlify Functions runtime** — serves `netlify/functions/*.ts`
   at their declared `config.path` routes.
3. **Proxies everything** through a single port (default: **`http://localhost:8888`**).

You should see output like:

```
◈ Netlify Dev ◈
◈ Loaded function auth-request-otp
◈ Loaded function auth-verify-otp
◈ Loaded function hello
───────────────────────────────────────────────────
   ◈ Server now ready on http://localhost:8888
───────────────────────────────────────────────────
```

**Keep this terminal running.** The frontend, API functions, and database all
work together through this single port.

---

## 5. Accessing the UI

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

## 6. SMS Emulation (Dev Mode)

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

## 7. Seeded Test Users

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

## 8. Testing the Auth Flow

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

## 9. API Endpoints Reference

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

## 10. Running Tests

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
# One-time setup
npm install
openssl genrsa -out jwt-private.pem 2048
openssl rsa -in jwt-private.pem -pubout -out jwt-public.pem
cp .env.example .env          # edit: DATABASE_URL + JWT keys

# Database (Docker)
docker run --name stad-ops-db -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=stadium_ops -p 5432:5432 -d postgres:16
npm run db:migrate

# Run the app
netlify dev                    # → http://localhost:8888

# Test
npm test                       # → 37 tests
```
