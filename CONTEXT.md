# Context Glossary

Canonical domain vocabulary for the **Stadium Ops Grid Matrix** platform. All
issues, code, tests, and docs must use these terms exactly — no synonyms.

Architectural decisions live in [`docs/adr/`](docs/adr/). Read the ADRs that
touch an area before working in it.

---

## Platform

- **Stadium Ops Grid Matrix** — The full platform. Do not abbreviate to "SOGM"
  in user-facing text; "the platform" is acceptable in prose.
- **Control Room** — The desktop admin surface (Event Admin / Superadmin). Not
  "dashboard", "console", or "backoffice".
- **Field Client** — The mobile-first PWA surface for ground staff. Not "mobile
  app" or "staff app".

## People & Roles

- **Superadmin** — Global controller; provisions tenants, appoints admins.
  Claim `role: superadmin`.
- **Event Admin** — Control Room operator scoped to one tenant. Claim
  `role: admin`.
- **Field Staff** — Ground operative using the Field Client. Claim
  `role: staff`.
- **Tenant** — An isolated stadium authority or tournament cluster. Identified
  by `tenantId`. All operational data is partitioned by this key.

## Operational Data

- **Incident** — A reported event with tier, category, severity, coordinates,
  and status. Lives in the `incidents` Postgres table.
- **Dispatch** — A directive pushed from the Control Room to a specific Field
  Staff member. Lives in the `dispatches` Postgres table.
- **Info Tier** — One of five priority levels (1–5). Tier 1 = life safety,
  Tier 5 = advisory. See ADR-0007. Never "priority level" or "severity band".
- **Sector** — A named stadium zone (e.g., `ZONE-A`). Mapped to a fixed
  coordinate anchor on the 0–1000 grid.

## Spatial System

- **Grid** — The normalized 0–1000 coordinate plane onto which all physical
  stadium locations are projected. Not "map space" or "pixel grid".
- **Optimized Stadium Map Canvas** — The offscreen-double-buffered HTML5 Canvas
  component (`OptimizedStadiumMapCanvas`). Not "the map" or "canvas widget".

## Security & Audit

- **Edge JWT** — The RS256-signed JSON Web Token minted at the Netlify Edge,
  carrying role + tenant claims. See ADR-0003. Not "session token" or "auth
  token".
- **OTP** — One-time password delivered via Twilio for Field Staff login.
- **Audit Chain** — The tamper-evident SHA-256 chained log of every state
  mutation. Stored in Netlify Blobs. See ADR-0005. Not "audit log" (that implies
  a mutable append table); "chain" emphasises the cryptographic linkage.
- **WORM** — Write-Once-Read-Many. In this platform, enforced as
  _tamper-evident_ (detectable) not _tamper-proof_ (prevented). See ADR-0005.

## AI Pipeline

- **Voice Triage** — The two-call pipeline: Whisper transcription → Gemini
  structured extraction. See ADR-0006. Not "speech pipeline" or "audio
  ingestion".
- **Triage Result** — The structured JSON returned by the Voice Triage pipeline
  (tier, category, severity, locationSector, actionRequired).

## Real-time

- **State Poll** — The diff-based polling endpoint (`/api/state-poll`) the
  client calls every ~2 seconds. See ADR-0004. Not "sync" or "refresh".
- **Diff Response** — The server response containing only records changed since
  a client-supplied `sinceTimestamp`.

## Out of Scope

- **Social Listening** — The crowdsourced social-media clustering pipeline.
  Deferred. See ADR-0008. Do not implement until reopened.
