# Technical Architecture & System Topography

> **Architectural decisions:** This document reflects the resolved architecture
> per [ADR-0001](adr/0001-frontend-stack-hybriderui-react-router-tailwind.md)
> through [ADR-0008](adr/0008-defer-social-listening.md). Where earlier drafts
> assumed Firebase/Firestore, the platform now uses **Netlify-only
> infrastructure**. See [CONTEXT.md](../CONTEXT.md) for the glossary.

## 1. System Topology Overview

The system is a **Netlify-only** architecture: edge computation, validation,
static asset delivery, relational storage, and object storage all run on
Netlify. Real-time synchronization is handled by **diff-based polling** (no
WebSockets). To maintain 60 FPS performance during high-congested events, the
frontend map interface bypasses standard DOM rendering, offloading all spatial
and personnel vector tracking to a hardware-accelerated HTML5 Canvas engine
with offscreen double-buffering.

```
+-----------------------------------------------------------------------------------------+
|                                     NETLIFY EDGE                                        |
|  +------------------------+  +------------------------+  +---------------------------+  |
|  |   Static App Hosting   |  |  Edge/Serverless Fns   |  |   Netlify Postgres DB     |  |
|  | (React 19 / TS / Vite) |  |  (Auth, Poll, AI, CRUD) |  |  (Tenants, Incidents,     |  |
|  |  HeroUI v3 / RR8 / TW4 |  |  (Deno / Node runtime)  |  |   Staff, Dispatches, OTP,|  |
|  |   Audit Ledger — WORM)  |  |
|  +------------------------+  +------------------------+  +---------------------------+  |
|  +------------------------+  +------------------------+                               |
|                              |  Twilio Verify / SMS   |                               |
|                              |  (OTP Delivery)        |                               |
|                              +------------------------+                               |
+-------------------------------------------+---------------------------------------------+
                                            |
                        Diff-Based Polling (HTTP, ~2s interval)
                                            |
+-------------------------------------------v---------------------------------------------+
|                              EXTERNAL AI SERVICES                                       |
|  +------------------------+  +------------------------+                               |
|  |  OpenAI Whisper API    |  |  Gemini 1.5 Flash API  |                               |
|  |  (Audio Transcription) |  |  (Structured Extraction)|                               |
|  +------------------------+  +------------------------+                               |
+-----------------------------------------------------------------------------------------+
```

## 2. Component Stack Breakdown

- **Frontend Core:** React.js (v19), TypeScript, Vite (build optimization engine). See [ADR-0001](adr/0001-frontend-stack-hybriderui-react-router-tailwind.md).
- **Routing:** React Router v8 in framework mode (`@react-router/dev`) — file-based routing, loaders, SSR-capable.
- **Render Pipeline:** HTML5 Canvas (2D Context) API backed by `requestAnimationFrame` for high-density spatial rendering, with offscreen double-buffering for cached background layers.
- **Style Engine:** Tailwind CSS v4 (CSS-first config via `@tailwindcss/vite`, no `tailwind.config.js`).
- **UX Component Framework:** HeroUI v3 (`@heroui/react`) built over React Aria Components. Ensures strict accessibility compliance.
- **Edge Compute:** Netlify Functions / Edge Functions running over the Deno/Node runtime environment.
- **Relational Storage:** Netlify Postgres managed database. Houses tenants, staff rosters, incidents, dispatches, OTP sessions, and sector coordinate anchors. See [ADR-0002](adr/0002-netlify-postgres-blobs-data-layer.md).
- **Object Storage:** Append-only `audit_ledger` table in Postgres for the tamper-evident SHA-256 chained Audit Chain. WORM-enforced via Postgres triggers that reject UPDATE/DELETE. See [ADR-0005](adr/0005-tamper-evident-audit-chain.md).
- **Real-time Synchronization:** Diff-based polling (`POST /api/state-poll`) at ~2s intervals. No WebSockets. See [ADR-0004](adr/0004-polling-realtime-synchronization.md).
- **Identity Layer:** Edge-minted RS256 JWTs with role + tenant claims; OTP via Twilio. See [ADR-0003](adr/0003-edge-jwt-otp-authentication.md).
- **External Integration Layer:** Twilio (Verify / SMS) for OTP delivery.
- **Generative AI Pipeline Suite:** OpenAI Whisper API (audio transcription) and Google Gemini 1.5 Flash (structured JSON extraction). See [ADR-0006](adr/0006-whisper-gemini-voice-pipeline.md).
- **RBAC:** Declarative permission model (`src/lib/permissions.ts`) with 13 typed permissions mapped to 3 roles. Client-side checks via `usePermissions().can()`; re-enforced server-side in every function. See `src/hooks/usePermissions.ts`.
- **GPS Tracking:** `navigator.geolocation.watchPosition` with 3m haversine debounce + 500ms throttle. Projects to 0–1000 grid via per-tenant bounding box. Positions update the canvas in real time. See ADR for PRD §7.1 and `src/hooks/useGeolocationTracking.ts`.
- **Offline Resilience:** IndexedDB mutation queue (`src/lib/offline-db.ts`) with auto-drain on reconnect. Preserves original client timestamps — mutations flush FIFO when connectivity returns.
- **Audit Ledger:** SHA-256 chained entries in Postgres (`audit_ledger` table) with append-only triggers (WORM). Server-side chain verification via `netlify/lib/auditLogger.ts`. See [ADR-0005](adr/0005-tamper-evident-audit-chain.md).

### API Endpoints

All endpoints live under `/api/*` as Netlify Functions. Every protected route
verifies the RS256 JWT and enforces `tenantId` isolation.

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `POST` | `/api/auth/request-otp` | None | Request OTP via Twilio SMS (dev-mode returns code in response) |
| `POST` | `/api/auth/verify-otp` | None | Verify OTP → mint RS256 JWT with role + tenant claims |
| `POST` | `/api/state-poll` | Bearer JWT | Diff-based polling — returns records changed since `sinceTimestamp` |
| `POST` | `/api/mutations` | Bearer JWT | Unified mutation endpoint (`create_incident`, `transition_incident`, `create_dispatch`, `update_dispatch`) |
| `POST` | `/api/ai-triage` | Bearer JWT | Voice triage pipeline (Whisper transcription → Gemini extraction) |
| `POST` | `/api/staff-location` | Bearer JWT | Update staff GPS position → projected to grid |
| `GET` | `/api/audit-ledger` | Bearer JWT | View audit chain entries + run SHA-256 integrity verification |

## 3. Core Data Processing Pipelines

### Pipeline A: Ground-to-Control Room Incident Ingestion

1.  **Capture:** Field worker activates the recording node on the Mobile Client. Audio payload is written directly to memory as a compressed WebM stream.
2.  **Transport:** Client dispatches the payload to a Netlify API route, proxying to the Whisper API.
3.  **Transcription:** Whisper translates the raw acoustic payload into a normalized UTF-8 string, filtering out heavy stadium acoustics.
4.  **Enrichment:** The text string is handed directly to the Gemini 1.5 Flash engine. The prompt demands a structured JSON response extracting: `IncidentType`, `Severity`, `ExtractedZone`, and `StructuralKeywords`.
5.  **Sync & Render:** The resulting JSON structure is written to the Firebase Firestore `incidents` collection. It instantly populates the Event Admin's desktop interface queue via an active WebSocket listener, where it is picked up by the map's Canvas loop and plotted as a high-visibility pulsing geometric beacon.

### Pipeline B: Crowdsourced Social Media Listening — DEFERRED

> **Out of scope for the initial build.** See [ADR-0008](adr/0008-defer-social-listening.md).
> This pipeline required Google Cloud Pub/Sub, a paid social-media firehose, and
> Firestore service-account credentials — all incompatible with the Netlify-only
> architecture. Do not implement until the ADR is reopened.

### Pipeline C: Two-Way Dispatch Loop

1.  **Trigger:** An Event Admin selects an active incident over the Canvas coordinate map interface and clicks "Dispatch Personnel".
2.  **Allocation:** The system queries active field workers in the target zone whose current Firebase status is `AVAILABLE`.
3.  **State Write:** A document is created in the `/dispatches` sub-collection detailing the instructions, transforming the assigned Field Staff's state to `DISPATCHED`.
4.  **UI Takeover:** The Field Staff's Mobile Client intercepts this real-time update. The UI instantly shifts to a full-screen modal blocking standard inputs, revealing high-contrast navigation maps and instructions.
5.  **Resolution Lock:** The Field Staff must tap an interactive "Acknowledge" element, transmitting a timestamped receipt back to the Control Room, followed by an "On-Scene" and "Resolved" flag sequence to clear the interface block.

## 4. Authentication, Provisioning, & RBAC Specification

Security and identity are verified via **RS256-signed JWTs minted at the Netlify
Edge**. The edge function verifies the OTP (via Twilio), looks up the user in
the `staff_roster` Postgres table, and mints a JWT carrying role + tenant claims.
See [ADR-0003](adr/0003-edge-jwt-otp-authentication.md).

```
[ User Logs In via Phone + OTP ]
              │
              ▼
[ Netlify Edge: auth-bootstrap.ts ]
              │
              ├──► Phone in staff_roster with role superadmin? ──► Claim: { role: superadmin }
              │
              ├──► Phone in staff_roster with role admin?    ──► Claim: { role: admin }
              │
              └──► Phone in staff_roster with role staff?     ──► Claim: { role: staff }
```

Every subsequent Netlify Function call verifies the JWT signature server-side
(using the public key) and extracts the `tenantId` + `role` claims to enforce
authorization. **Client-decoded claims are never trusted for authorization.**

### Access Control Rules Matrix:

- `superadmin`: Granted read/write permissions to all schemas across all active tenants. Has exclusive permissions to alter configuration variables, add/remove Event Admins, and initialize new stadium spaces.
- `admin`: Restricted to their explicitly assigned tenant. Can read/write the local `staff_roster` table, issue dispatches, clear incidents, and access operational dashboards.
- `staff`: Locked down to the Field Client. Can only read incidents or dispatches explicitly assigned to their specific phone number, and can only write to incident creation and their own location coordinates.

## 5. Resiliency & High-Availability Configurations

### Offline-First Synchronization Architecture

> **Note:** With Firebase removed (ADR-0002), the Firebase `persistentLocalCache`
> SDK is no longer available. Offline-first is implemented manually with
> **IndexedDB** — a local queue stores incident reports and dispatch
> acknowledgements, and drains in order when connectivity is restored. See the
> build plan Milestone 7.

When connectivity degrades, incident reports and dispatch state mutations are
logged to an IndexedDB queue. The client local view updates seamlessly, and
mutations are synchronized back to Postgres the moment connectivity is restored.

### Temporal Operational Enforcement (The Switch)

To ensure system isolation outside active match blocks, a global timestamp
configuration row in Postgres (`config` table) is verified by the mutation
functions before accepting writes:

```typescript
// Inside the mutations Netlify Function — server-side temporal guard
const switchRow = await sql`SELECT window_start, window_end FROM config WHERE id = 'switch'`;
const now = Date.now();
if (now < switchRow.window_start || now > switchRow.window_end) {
  return new Response(JSON.stringify({ error: 'Operational window inactive.' }), { status: 403 });
}
```

This replaces the former Firestore Security Rules temporal check — the guard now
lives in imperative function logic rather than declarative database rules.

## More References

1. **Decision records** — [`docs/adr/`](adr/) (ADR-0001 through ADR-0008)
2. **Domain glossary** — [`CONTEXT.md`](../CONTEXT.md)
3. **Code guidelines** — `CODE-DESIGN.md`
4. **GenAI Serverless Proxies & Adapters** — `netlify/functions/ai-triage.ts` (reference: `SETUP-GUIDE.md`, `AI-ORCHESTRATOR.md`)
5. **Programmatic Security Perimeter** — `netlify/functions/auth-bootstrap.ts` (reference: `SECURITY-GATING.md`, `EDGE-GATEWAY.md` — see ADR-0003 for crypto bug fixes)
6. **GPU-Accelerated Map Loop & Dynamic Clustering** — `OptimizedStadiumMapCanvas.tsx` (reference: `MAP-OPTIMIZATION.md`, `CANVAS-ENGINE.md`)
7. **Ergonomic Field Input Components** — `VoiceIngest.tsx`, `ManualTriageDrawer.tsx` (reference: `MOBILE-INTERFACE.md`)
8. **Reactive Global Synchronization Layer & Surface Routing** — `AuthContext.tsx`, `ActiveOpsContext.tsx`, `root.tsx`

> **⚠️ Reference docs caveat:** The files in `docs/*.md` contain reference
> implementations written against Firebase + shadcn/ui. They are **reference
> pseudo-code only** — do not copy-paste. The authoritative architecture is
> defined by the ADRs and this document.
