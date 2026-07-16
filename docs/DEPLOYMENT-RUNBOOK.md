# DEPLOYMENT-RUNBOOK.md: Phase Verification & Infrastructure Commissioning

> **Netlify-only architecture.** This runbox reflects the resolved platform per
> [ADR-0002](adr/0002-netlify-postgres-blobs-data-layer.md) (no Firebase).
> Security is enforced imperatively in Netlify Functions, not via
> `firestore.rules`.

This document outlines the validation procedures required to deploy and verify the multi-tenant stadium architecture.

---

## Phase 1: Local Sandbox Hydration & Verification

Execute these terminal instructions at the project root:

```bash
# Install dependencies
npm install

# Run the Postgres schema migration (creates tables, indexes, seed data)
# Requires DATABASE_URL in .env or Netlify env
npm run db:migrate

# Boot the local Netlify runtime (functions + edge + static) on port 8888
netlify dev
```

### In-Circuit Sanity Validation Loop

To run a headless verification check on token generation, AI parsing logic, and cryptographic block hash linkage without loading the UI:

```bash
# Run the unit + integration test suite
npm test

# Run the matchday stress simulation
npx tsx scripts/matchday-simulator.ts
```

---

## Phase 2: Datastore Provisioning

1. Provision a **Netlify Postgres** database via the Netlify dashboard.
2. Run the schema migration against it (`npm run db:migrate`).
3. Seed at least one tenant, one admin, and test staff in `staff_roster`.
4. Provision **Netlify Blobs** for the audit chain store (no schema needed —
   keys are `audit/{tenantId}/{eventId}`).

> **Note:** There are no declarative `firestore.rules`. Authorization is
> enforced imperatively inside each Netlify Function — every query filters by
> `tenant_id` extracted from the verified JWT claims (ADR-0003).

---

## Phase 3: Production Pipeline Infrastructure Commissioning

When deploying via Git, ensure the following Netlify environment variables are set:

| Variable Identifier | Target Content Context | Validation Requirement |
| :--- | :--- | :--- |
| `DATABASE_URL` | Netlify Postgres connection string | Required for all data operations |
| `JWT_PRIVATE_KEY` | RSA private key (PEM) for RS256 signing | Required for auth token minting (ADR-0003) |
| `JWT_PUBLIC_KEY` | RSA public key (PEM) for verification | Required for JWT verification in functions |
| `GEMINI_API_KEY` | Google AI Studio key | Required for voice triage extraction (ADR-0006) |
| `OPENAI_API_KEY` | OpenAI key | Required for Whisper transcription (ADR-0006) |
| `TWILIO_ACCOUNT_SID` | Twilio account SID | Required for OTP delivery (ADR-0003) |
| `TWILIO_AUTH_TOKEN` | Twilio auth token | Required for OTP delivery |
| `TWILIO_VERIFY_SID` | Twilio Verify service SID | Required if using Twilio Verify for OTP |

---

## Phase 4: Operational HUD Handshake Protocols

Once deployment finishes, verify system readiness using this network handshake trace:

```text
[FIELD OPERATIVE COMMS HANDSHAKE DIAGNOSTIC TRACE]
1. Operative enters phone number → OTP sent via Twilio → JWT minted at edge.
2. Operative presses the Radio Ingestion button on the Field Client.
3. Captured audio POSTs to /api/ai-triage with a verified Bearer JWT.
4. Whisper transcribes → Gemini extracts structured 5-tier metadata.
5. Incident is written to Postgres (mutations.ts) + audit entry to Netlify Blobs.
6. The Control Room's next state-poll (~2s) picks up the new incident.
7. The map canvas renders the incident beacon at the correct grid coordinates.
8. The AuditTimelineInspector verifies the SHA-256 chain — green badge.
```

```

```
