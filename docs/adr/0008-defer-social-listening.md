# ADR-0008: Defer Social Listening Pipeline

## Status

Accepted — removes the social-media intelligence pipeline from the initial
build scope.

## Context

`docs/PROJECT-BRIEF.md` §5 and `docs/ARCHITECTURE.md` §3 (Pipeline B) describe a
**Crowdsourced Social Media Listening Engine**:

- A serverless worker ingests public social posts via streaming filters.
- Posts are batched in **Google Cloud Pub/Sub** (15-second windows).
- **Gemini 1.5 Flash** clusters posts, filtering noise and grouping
  thematic complaints.
- Clusters with ≥5 distinct handles are escalated as "Candidate Incidents" to
  the Control Room for operator review.
- `docs/SOCIAL-LISTENING.md` contains a reference implementation.

This is a large, complex subsystem with significant hidden dependencies:

1. **A paid social-media data source** (Twitter/X API, or another firehose).
   The docs never specify which API or account for its cost/ToS.
2. **Google Cloud Pub/Sub** — a second cloud provider beyond Netlify,
   contradicting ADR-0002.
3. **Firestore service-account credentials at the edge** — Firebase dependency,
   contradicted by ADR-0002. The reference code in `docs/SOCIAL-LISTENING.md`
   mints Firestore access tokens via service-account JWT.
4. **Ongoing ingestion scheduling** — a 15-second batch window requires a
   scheduler (Cloud Scheduler, cron, or a always-on worker), not a
   request/response function.

The PRD's 5-phase plan (§4) barely accounts for this complexity — it's folded
into "Phase 3: AI Telemetry Pipelines" alongside the voice pipeline, which
vastly underestimates the effort.

## Decision

**Defer the social listening pipeline entirely** from the initial build. It is
out of scope. The build plan (Milestones 0–8) does not include it.

Specifically:

- Do not implement `netlify/functions/social-listener.ts`.
- Do not provision Google Cloud Pub/Sub.
- Do not integrate any social-media API.
- Do not build the "Candidate Incidents" review panel in the Control Room.

### Reopening criteria

This decision can be reopened when ALL of the following are true:

1. A specific social-media data source is chosen and its API cost/ToS is
   validated.
2. A real-time ingestion mechanism compatible with Netlify-only infra is
   designed (replacing Pub/Sub — e.g., a scheduled Netlify Function pulling
   from the social API).
3. The core platform (Milestones 0–8) is shipped and stable.
4. A tenant explicitly requests social listening as a paid feature.

## Consequences

**Positive:**

- Removes the single largest source of hidden complexity and external
  dependency from the build.
- Keeps the architecture Netlify-only (consistent with ADR-0002).
- Lets the build focus on the core value: voice triage + live map + dispatch +
  audit.

**Negative:**

- The platform loses the "early warning from social media" capability that
  `PROJECT-BRIEF.md` identifies as a key differentiator. Incidents that
  manifest on social feeds first will not be caught until formal reporting.
- If a competitor ships social listening first, this is a market gap.

**Supersedes:** `docs/SOCIAL-LISTENING.md` and `docs/SOCIAL-LISTENER.md` are
deferred reference implementations — do not implement until this ADR is
reopened.
