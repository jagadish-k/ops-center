# ADR-0004: Aggressive Polling for Real-Time Synchronization

## Status

Accepted — supersedes the Firestore `onSnapshot` WebSocket real-time model in
`docs/STATE-MANAGEMENT.md` (§2), `docs/MULTI-TENANT-CONTEXT.md` (§1), and
`docs/CODE-DESIGN.md` (§6).

## Context

The documentation assumes **Firebase Firestore `onSnapshot` listeners** provide
real-time WebSocket push of incident, staff, and dispatch updates to the
client. With Firebase rejected (ADR-0002), that mechanism is gone.

The realistic options for a Netlify-only architecture were:

1. **Server-Sent Events (SSE)** via a Netlify Edge Function streaming
   responses. Possible, but Edge Functions holding long-lived connections is
   fragile and has platform limits.
2. **Aggressive polling** — the client calls a diff endpoint every 1–3 seconds.
   Dead simple, fully Netlify-native, survives any network. Not truly "live"
   but sufficient for the operational density (≤250 nodes per stadium).
3. **External realtime relay** (Ably, Pusher, Supabase Realtime) bridging
   Postgres changes to clients. True WebSocket push, but adds a paid vendor and
   integration glue.

For a solo production build on Netlify-only infrastructure, SSE fragility and
vendor dependency were deemed unacceptable. Polling with diff responses and
client-side debouncing provides adequate freshness with minimal complexity.

## Decision

Use **diff-based polling** as the real-time mechanism:

1. **Endpoint:** `POST /api/state-poll` accepts `{ tenantId, sinceTimestamp }`
   and returns only records in `incidents`, `staff_roster`, and `dispatches`
   whose `updated_at > sinceTimestamp`.
2. **Poll interval:** ~2 seconds, configurable. The client aborts in-flight
   requests on unmount and backs off exponentially on error.
3. **Client debounce:** Staff GPS position writes are debounced on-client —
   only transmitted when the operative moves **> 3 meters** and at most once
   every **500ms** (per the PRD §7.1). This filters GPS jitter and cuts write
   volume.
4. **Canvas data via refs, not state:** The polling hook merges diffs into
   `useRef` values, not React state, so the `requestAnimationFrame` canvas loop
   reads fresh data without triggering React re-renders on every poll tick.

### Postgres indexing for poll performance

```sql
CREATE INDEX idx_inc_tenant_updated ON incidents(tenant_id, updated_at);
CREATE INDEX idx_staff_tenant ON staff_roster(tenant_id, status);
CREATE INDEX idx_dispatch_staff ON dispatches(target_staff_phone, status);
```

The diff query filters by `tenant_id` and `updated_at > $since`, served by the
composite index.

## Consequences

**Positive:**

- Simplest possible real-time architecture. No long-lived connections, no
  vendor, no WebSocket scaling concerns.
- Survives any network condition — a dropped poll just means the next one
  catches up. Ideal for congested stadium cellular.
- Diff responses minimize bandwidth (only changed records, not full state).

**Negative:**

- **Not truly real-time.** Worst-case latency = poll interval (2s) + network
  RTT. For life-safety Tier 1 incidents, 2–3 seconds of delay is acceptable
  but not ideal.
- **Poll load on Postgres.** At 2s intervals with 10 active tenants, that's
  ~5 queries/second minimum. Each query is a filtered SELECT — cheap with the
  index, but must be load-tested (build plan Milestone 8).
- **Netlify Function cold starts** can spike poll latency intermittently.
  Mitigate by keeping functions warm.
- **No server push.** The Control Room cannot push an update to a Field Client
  faster than the next poll. The dispatch full-screen takeover (build plan
  Milestone 5) will appear within 2s — acceptable.

**Related:** ADR-0002 (Postgres as data layer), ADR-0003 (JWT verified on every
poll request).
