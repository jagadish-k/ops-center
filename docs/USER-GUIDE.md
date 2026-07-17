# Stadium Ops Grid Matrix — User Guide

> **Audience:** Event Admins, Managers, Superadmins, and Field Staff.
> This guide explains every workflow in the platform.

---

## Table of Contents

1. [Getting Started](#1-getting-started)
2. [The Operations Tab](#2-the-operations-tab)
3. [Incident Lifecycle](#3-incident-lifecycle)
4. [The 5-Tier Information System](#4-the-5-tier-information-system)
5. [Dispatching Personnel](#5-dispatching-personnel)
6. [Dispatch Lifecycle](#6-dispatch-lifecycle)
7. [Staff Status States](#7-staff-status-states)
8. [Voice AI Pipeline](#8-voice-ai-pipeline)
9. [The Team Tab](#9-the-team-tab)
10. [The Roles Tab](#10-the-roles-tab)
11. [The Tenants Tab](#11-the-tenants-tab)
12. [The Policies Tab](#12-the-policies-tab)
13. [Compliance Log (Audit Chain)](#13-compliance-log-audit-chain)
14. [The Field Client (Mobile)](#14-the-field-client-mobile)
15. [Permission Reference](#15-permission-reference)

---

## 1. Getting Started

### Logging In

1. Open the platform URL in your browser.
2. Enter your **E.164 phone number** (e.g., `+14155550001`).
3. Click **Send Code** — a 6-digit OTP is sent via SMS.
4. In dev mode (no Twilio configured), the code appears on-screen in an amber banner.
5. Enter the 6-digit code → click **Verify & Access**.
6. You receive a JWT and are routed to your assigned surface:
   - **Admins / Superadmins** → Control Room (desktop)
   - **Staff** → Field Client (mobile)

### First-Time Tour

On your first visit, an interactive tour walks you through the Control Room
layout. Click **? Help** in the header anytime to replay it.

### Session Management

- Your JWT expires after 1 hour (`JWT_EXPIRES_IN=3600`).
- If your permissions change while logged in, you'll get a silent token refresh
  (no re-login needed). The server tracks a `perms_version` stamp — if it
  changes, your next API call triggers an automatic refresh.
- Refresh has a 5-minute grace period past expiry and is rate-limited to
  10/min.

---

## 2. The Operations Tab

The Operations tab is the live command surface. It has three panels:

### Left Panel: Live Stadium Map

The canvas shows the stadium projected onto a **0–1000 coordinate grid**:

| Visual | Meaning |
|---|---|
| **Colored dots** | Field staff with real-time GPS positions (updated every 2s via diff-polling) |
| **Tier-colored markers** | Active incidents (red=Tier 1, amber=Tier 2, etc.) |
| **Grid overlay** | Spatial sectors (ZONE-A through ZONE-F) |
| **Status colors** | Available (green), Dispatched (amber), Off-duty (gray) |

**Interactions:**
- **Click** any marker to select it (loads in the inspector)
- **Drag** to pan the viewport
- **Scroll / pinch** to zoom
- The map auto-refreshes every 2 seconds — you don't need to reload

### Top-Right Panel: Incident Queue

Lists all **non-resolved** incidents for the active tenant, sorted by tier
( Tier 1 = highest priority at top). Each row shows:
- Tier badge (1–5)
- Category (SECURITY, MEDICAL, CROWD, FACILITIES, ADVISORY)
- Sector (ZONE-A, etc.)
- Status (OPEN, ACKNOWLEDGED, ON_SCENE)

Click any incident to load its details into the inspector below.

### Bottom-Right Panel: Incident Inspector

Shows the full details of the selected incident:
- **Raw report text** — the original field report or AI transcription
- **AI-extracted metadata** — category, severity, location sector, action required
- **Coordinates** — grid position + sector anchor
- **Status timeline** — when it was created, acknowledged, etc.

**Admin actions** (visible only with `incident:transition` permission):
- **Acknowledge** — marks the incident as seen by a controller
- **On Scene** — marks that responders have arrived
- **Resolve** — closes the incident; staff return to AVAILABLE

---

## 3. Incident Lifecycle

Every incident follows a forward-only state machine:

```
OPEN → ACKNOWLEDGED → ON_SCENE → RESOLVED
```

| Status | Meaning | Who can transition |
|---|---|---|
| **OPEN** | Newly filed, not yet seen by a controller | _(initial state)_ |
| **ACKNOWLEDGED** | A controller has seen and triaged it | Admin, Superadmin |
| **ON_SCENE** | Responders have arrived at the location | Admin, Superadmin |
| **RESOLVED** | The incident is closed; no further action | Admin, Superadmin |

**Forward-only:** you can skip steps (e.g., OPEN → RESOLVED) but cannot go
backward. This prevents hiding evidence of response delays.

**Managers** can transition Tier 4–5 incidents (advisory, facilities) but NOT
Tier 1–3 (life safety, urgent). This is enforced by the ABAC policy engine
(ADR-0012). If a manager tries to transition a Tier 1 incident, they get a
403 with `X-Reason: policy-denied`.

**Auditing:** every transition writes an entry to the SHA-256 chained audit
ledger with before/after state delta.

---

## 4. The 5-Tier Information System

The platform uses a 5-tier priority classification (ADR-0007):

| Tier | Label | Color | Meaning | Example |
|---|---|---|---|---|
| **1** | Life Safety | 🔴 Red | Immediate threat to life or safety | Cardiac event, crowd crush, structural collapse |
| **2** | Urgent | 🟠 Orange | Serious but not immediately life-threatening | Physical altercation, serious injury |
| **3** | Priority | 🟡 Yellow | Requires prompt response | Unauthorized access, equipment failure |
| **4** | Advisory | 🔵 Blue | Low urgency, operational | Spilled beverage, long queue, minor damage |
| **5** | Information | ⚪ Gray | Informational only, no action required | Weather update, traffic advisory |

**AI auto-classification:** when a report comes in via the Voice AI pipeline,
Gemini assigns the tier based on the transcribed text. Manual triage forms
infer the tier from the selected severity:
- CRITICAL → Tier 1
- HIGH → Tier 2
- MEDIUM → Tier 3
- LOW → Tier 4

---

## 5. Dispatching Personnel

### When to Dispatch

Dispatch a staff member when an incident requires physical response — e.g.,
send medical staff to a cardiac event, security to an altercation, cleaning
to a spill.

### How to Create a Dispatch

1. Select an incident from the queue (or create one first).
2. The admin/superadmin calls the `/api/mutations` endpoint with
   `action: 'create_dispatch'`:
   - `incidentId` — the incident to respond to
   - `targetStaffPhone` — the E.164 phone of the staff to dispatch
   - `directiveText` — instructions (e.g., "Proceed to Gate B with AED")
3. The system:
   - Creates a dispatch record with status `SENT`
   - Marks the target staff as `DISPATCHED` (removes them from AVAILABLE pool)
   - Writes an audit entry (`DISPATCH_CREATE`)
4. The staff member receives the dispatch on their Field Client.

**Manager zone restriction:** managers can only dispatch to staff in their own
assigned zone. The ABAC policy engine checks `subject.assigned_zone ===
resource.target_zone`. Admins and superadmins can dispatch to any staff in
the tenant.

### What Happens When Personnel Are Dispatched

1. **Staff status changes:** `AVAILABLE → DISPATCHED`. The staff marker on
   the map turns amber. They are removed from the available pool for
   subsequent dispatches.

2. **Staff receives notification:** the Field Client (mobile PWA) shows the
   dispatch directive with the incident context and a full-screen takeover.

3. **Staff acknowledges:** the staff member taps **Acknowledge** on their
   device. Dispatch status changes `SENT → ACKNOWLEDGED`. The controller
   sees the ack timestamp in the incident inspector.

4. **Staff arrives on scene:** the staff member taps **On Scene**. Dispatch
   status changes `ACKNOWLEDGED → ON_SCENE`.

5. **Staff resolves:** the staff member taps **Resolve** (or the admin does
   it remotely). Dispatch status changes `ON_SCENE → RESOLVED`. The staff
   member's status returns to `AVAILABLE`.

---

## 6. Dispatch Lifecycle

```
SENT → ACKNOWLEDGED → ON_SCENE → RESOLVED
```

| Status | Who sets it | What happens |
|---|---|---|
| **SENT** | Admin/Manager (creates dispatch) | Staff marked DISPATCHED, directive sent |
| **ACKNOWLEDGED** | Target staff (self) OR Admin | Confirms receipt of directive |
| **ON_SCENE** | Target staff (self) OR Admin | Confirms arrival at the location |
| **RESOLVED** | Target staff (self) OR Admin | Staff returns to AVAILABLE; dispatch closed |

**Self-update:** the target staff member can update their own dispatch status
without admin intervention (they have `dispatch:update` permission for their
own dispatches — enforced by ABAC `self-or-permitted` rule).

**Audit trail:** every status change writes a `DISPATCH_STATUS_MUTATION`
entry to the audit ledger.

---

## 7. Staff Status States

Each staff member has one of three operational states at any time:

| Status | Color on Map | Meaning |
|---|---|---|
| **AVAILABLE** | 🟢 Green | Ready for dispatch; on duty |
| **DISPATCHED** | 🟠 Amber | Currently responding to an incident |
| **OFF_DUTY** | ⚫ Gray | Not working; cannot log in or receive dispatches |

**State transitions:**
- `AVAILABLE → DISPATCHED`: happens automatically when a dispatch targets them
- `DISPATCHED → AVAILABLE`: happens when the dispatch is resolved
- `* → OFF_DUTY`: set by an admin via the Team tab (deactivation)

**Login enforcement:** staff with `OFF_DUTY` status cannot complete OTP
verification. The verify endpoint rejects with 403.

---

## 8. Voice AI Pipeline

Field staff can report incidents hands-free via the Voice AI pipeline
(ADR-0006):

### How It Works

1. **Staff presses push-to-talk** on the Field Client.
2. Audio is captured as a webm/opus blob and sent to `/api/ai-triage`.
3. **Stage 1 — Whisper (OpenAI):** transcribes the audio to text.
4. **Stage 2 — Gemini 1.5 Flash:** extracts structured triage data:
   - Tier (1–5)
   - Category (SECURITY, MEDICAL, CROWD, FACILITIES, ADVISORY)
   - Severity (CRITICAL, HIGH, MEDIUM, LOW)
   - Location sector (ZONE-A through ZONE-F)
   - Action required (free-text recommendation)
5. **Stage 3 — Incident creation:** the structured data is used to create
   an incident in Postgres with the correct tier, coordinates, and metadata.
6. The incident appears in the Control Room queue within 2 seconds.

### Partial Failure

If Gemini extraction fails (network error, bad audio), the incident is still
created with **default values** (Tier 3, ADVISORY, MEDIUM) and the raw
transcription is flagged with `[REVIEW NEEDED]` for manual classification.

### Dev Mode

Without `OPENAI_API_KEY` and `GEMINI_API_KEY`, the pipeline uses mock
transcription + mock extraction for local development. The mock text is a
realistic crowd-crush scenario at Sector Alpha.

---

## 9. The Team Tab

**Permission required:** `staff:manage` (admin + superadmin)

The Team tab is where you manage your tenant's staff roster.

### Staff List

Shows all users with a membership in the active tenant. Each row displays:
- Phone number (E.164)
- Full name
- Roles (staff, manager, admin — a user can have multiple)
- Status (active / disabled)

### Creating Staff

1. Click **+ Add Staff**.
2. Fill in:
   - **Phone** (E.164, e.g., `+14155550010`)
   - **Full Name**
   - **Specialty** (security, medical, cleaning, supervisor)
   - **Assigned Zone** (ZONE-A through ZONE-F)
   - **Roles** (check one or more: staff, manager — admin requires superadmin)
3. Click **Create**. The user appears in the list immediately (optimistic update).

The user can now log in via OTP at their phone number. They'll get the
permissions of their assigned role(s) in this tenant.

### Editing Staff

Click **Edit** on any user to:
- Change their full name
- Activate/deactivate their account
- Toggle roles on/off (each role change bumps their `perms_version` — they'll
  get a silent refresh on their next request)

### Per-User Permission Grants

Click **Perms** on any user to open the grants drawer. This shows all 15
permissions as checkboxes. Checking a permission grants it **additively** —
the user gets it on top of whatever their roles already provide.

Example: give a staff member `audit:view` so they can check the compliance
log without being promoted to admin.

---

## 10. The Roles Tab

**Permission required:** `tenant:manage` (superadmin only)

The Roles tab is where you define what each role can do.

### System Roles (preseeded)

Four system roles ship with the platform:
- **superadmin** — all permissions (granted via `global_role`, not role_permissions)
- **admin** — operational management (10 permissions)
- **manager** — coordination (8 permissions, tier-gated for incident:transition)
- **staff** — field operations (5 permissions)

System roles cannot be deleted, only modified.

### Editing a Role's Permissions

1. Click **Edit Permissions** on a role card.
2. Toggle permissions in the matrix. Changes are color-coded:
   - 🟢 Green = newly added
   - 🔴 Red strikethrough = removed
3. Click **Save Changes**. The system:
   - Updates the `role_permissions` table
   - Bumps `perms_version` for all users holding this role
   - They'll get a silent refresh on their next request

### Creating Custom Roles

1. Click **+ New Role**.
2. Give it a name (lowercase, hyphens OK), description, and select permissions.
3. The role appears in the list and can be assigned to users in the Team tab.

### Cascade Revoke

When you remove a permission from a role, some users may have a per-user
grant of that permission. The cascade-revoke modal lets you bulk-revoke those
grants (max 100 users per batch). This is **manual** — the system never
auto-revokes per-user grants.

---

## 11. The Tenants Tab

**Permission required:** `tenant:switch` (superadmin only)

The Tenants tab lists all stadium contexts in the platform.

### Creating a Tenant

1. Click **+ New Tenant**.
2. Enter a **Tenant ID** (must start with `tenant_`, lowercase + underscores).
3. Enter an **Organization Name** (e.g., "MetLife Stadium Ops Core").
4. Optionally provide a **GPS bounding box** (for GPS-to-grid projection).
5. Click **Create**.

After creating a tenant, you need to:
1. Add staff memberships (via the Team tab, switching to the new tenant)
2. Optionally define a GPS bounding box for accurate positioning

### Tenant Switching

Superadmins can switch between tenants from the header's Tenant Switcher.
Switching re-mints the JWT with the new tenant context and recomputes
permissions for that tenant. All operational data (incidents, staff,
dispatches) is immediately scoped to the new tenant.

---

## 12. The Policies Tab

**Permission required:** `tenant:manage` (superadmin only)

The Policies tab is the Rego policy authoring surface (ADR-0012).

### System Policy

The `stadium/authz` policy is the system default (read-only). It encodes the
5 ABAC rules (tier-gating, zone-gating, self-or-permitted). Edit it via PR
in `policies/stadium/authz.rego`.

### Creating Custom Policies

1. Click **+ New Policy**.
2. Enter a namespaced name (e.g., `stadium/custom`).
3. Write Rego source in the CodeMirror editor (syntax-highlighted).
4. Click **Create**.

### Testing Policies

1. Select a policy (or write a new one in the editor).
2. Open the **Test runner** panel.
3. Paste input JSON (must match the `{action, subject, resource}` shape).
4. Click **Run test**.
5. The server invokes `opa eval` and returns:
   - **ALLOW** (green) — the policy permits the action
   - **DENY** (amber) — the policy rejects the action
   - **Error** (red) — compile or runtime error in the Rego source

### Activating Policies

DB-stored policies are not automatically included in the WASM bundle. To
activate them, the build script must be updated to compile them alongside
the system policies at deploy time (see `scripts/build-policies.ts`).

---

## 13. Compliance Log (Audit Chain)

**Permission required:** `audit:view` (admin + superadmin)

Every state mutation in the platform generates an immutable audit entry:

### What's Logged

| Action | Audit event |
|---|---|
| Incident created | `INCIDENT_CREATE` |
| Incident status changed | `INCIDENT_STATUS_MUTATION` |
| Dispatch created | `DISPATCH_CREATE` |
| Dispatch status changed | `DISPATCH_STATUS_MUTATION` |
| Staff member created | `USER_CREATE` |
| Staff member updated | `USER_UPDATE` |
| Role assigned | `USER_ROLE_ASSIGN` |
| Role revoked | `USER_ROLE_REVOKE` |
| Per-user grant added | `USER_PERMISSION_GRANT` |
| Per-user grant removed | `USER_PERMISSION_REVOKE` |
| Role created | `ROLE_CREATE` |
| Role updated | `ROLE_UPDATE` |
| Role deleted | `ROLE_DELETE` |
| Cascade revoke | `ROLE_CASCADE_REVOKE` |
| Tenant created | `TENANT_CREATE` |
| Policy created | `POLICY_CREATE` |
| Policy updated | `POLICY_UPDATE` |
| Policy deleted | `POLICY_DELETE` |

### SHA-256 Chain

Each entry is linked to the previous one via:
```
Hash_n = SHA-256(eventId ∥ tenantId ∥ timestamp ∥ actorId ∥ action ∥
                 targetResourceId ∥ deltaSHA ∥ chainedPriorHash)
```

This makes the chain **tamper-evident**: if any historical entry is modified,
the hash sequence breaks and the verifier detects it immediately.

### WORM Enforcement

The `audit_ledger` table has Postgres triggers that reject `UPDATE` and
`DELETE` operations. Only `INSERT` is allowed. This is enforced at the
database level — not just application convention.

### Viewing the Log

Click **Compliance Log** in the header to open the Audit Timeline Inspector.
It shows recent entries and a chain-integrity verification result.

---

## 14. The Field Client (Mobile)

**Surface:** the Field Client is the mobile PWA for ground staff.

### What Staff See

After logging in via OTP, a staff member sees:

1. **Active dispatches** — any dispatch targeting them, with full-screen
   takeover for the highest-priority one.
2. **Acknowledge / On Scene / Resolve** buttons for their dispatches.
3. **Manual triage** — a 3-tap form to file a new incident (category,
   severity, sector) if voice reporting isn't available.
4. **Voice ingest** — push-to-talk button to record a voice report.

### GPS Tracking

The Field Client sends the staff member's GPS coordinates to the server
every time they move >3 meters (debounced to 500ms). The server projects
the GPS lat/lng onto the stadium grid using the tenant's bounding box and
updates the staff marker on the Control Room map.

### Offline Support

If the network is unavailable, mutations (dispatch updates, incident
reports) are queued in IndexedDB. When connectivity returns, the queue
drains FIFO with original client-side timestamps preserved.

---

## 15. Permission Reference

The platform has 15 typed permissions:

| Permission | Description | superadmin | admin | manager | staff |
|---|---|:-:|:-:|:-:|:-:|
| `incident:create` | File new incidents | ✓ | ✓ | ✓ | ✓ |
| `incident:transition` | Change incident status | ✓ | ✓ | ✓ (T4-5) | — |
| `incident:read` | View incident queue | ✓ | ✓ | ✓ | ✓ |
| `dispatch:create` | Push dispatch to staff | ✓ | ✓ | ✓ (own zone) | — |
| `dispatch:update` | Update dispatch status | ✓ | ✓ | ✓ | ✓ (self) |
| `dispatch:read` | View dispatches | ✓ | ✓ | ✓ | ✓ |
| `tenant:switch` | Switch tenant context | ✓ | — | — | — |
| `tenant:manage` | Create tenants + manage roles | ✓ | — | — | — |
| `staff:manage` | Manage staff roster | ✓ | ✓ | — | — |
| `staff:reassign` | Change zone/dispatch assignments | ✓ | ✓ | ✓ (own zone) | — |
| `role:assign-admin` | Promote/demote admins | ✓ | — | — | — |
| `audit:view` | View compliance log | ✓ | ✓ | — | — |
| `surface:control-room` | Access Control Room | ✓ | ✓ | ✓ | — |
| `surface:field-client` | Access Field Client | ✓ | — | — | ✓ |
| `config:manage` | Change operational window | ✓ | — | — | — |

**ABAC-scoped permissions** (attribute-aware, per ADR-0012):
- `incident:transition` — managers restricted to Tier 4–5
- `incident:read` — tenant scoping enforced at SQL level
- `dispatch:create` — managers restricted to own zone
- `dispatch:update` — staff can only update their own dispatches
- `staff:reassign` — managers restricted to own zone

---

## Glossary

| Term | Definition |
|---|---|
| **Control Room** | The desktop admin/supervisor surface |
| **Field Client** | The mobile-first PWA for ground staff |
| **Tenant** | An isolated stadium authority (e.g., MetLife Stadium Ops) |
| **Incident** | A reported event with tier, category, severity, coordinates |
| **Dispatch** | A directive from Control Room to a specific staff member |
| **Tier** | Priority level 1–5 (1=life safety, 5=advisory) |
| **Sector** | A named stadium zone (ZONE-A through ZONE-F) |
| **Grid** | The normalized 0–1000 coordinate plane |
| **Edge JWT** | The RS256-signed token carrying permissions + tenant context |
| **OTP** | One-time password delivered via Twilio SMS |
| **Permission** | A typed capability (e.g., `incident:transition`) |
| **Role** | A named bundle of permissions (e.g., `admin`) |
| **Membership** | A user's binding to a tenant with scoped roles |
| **Audit Chain** | The SHA-256 chained log of every state mutation |
| **WORM** | Write-Once-Read-Many — tamper-evident storage |
| **Operational Window** | Time-based guard that rejects writes outside match hours |

---

## Further Reading

- [ADR Index](docs/adr/) — Architecture Decision Records (ADR-0001 through ADR-0014)
- [PRD](PRD.md) — Product Requirements Document
- [DEVELOPMENT.md](DEVELOPMENT.md) — Local setup, API reference, troubleshooting
- [CONTEXT.md](CONTEXT.md) — Domain glossary (canonical vocabulary)
