# ADR-0012: Attribute-Based Access Control via OPA/WASM

## Status

Accepted — adds attribute-aware policy evaluation on top of the role-based
permission model from [ADR-0011](0011-db-driven-rbac.md). Coexists with
RBAC; does not replace it.

## Context

ADR-0011 delivers role-based permissions: a user either has `incident:transition`
or they don't. Some authorization decisions need more granularity:

- **Tier-gated transitions.** A manager should be able to acknowledge
  Tier 4-5 (advisory) incidents but not Tier 1-2 (life safety). Today's
  boolean permission cannot express this.
- **Zone-scoped dispatch.** A manager coordinating ZONE-A should be able to
  dispatch ZONE-A staff but not reassign ZONE-B staff.
- **Self-or-admin rules.** A staff member can update their own dispatch
  status but cannot update other staff's dispatches. This is currently
  encoded inline in `mutations.ts:240` as a manual check — it should be
  declarative.

The platform owner explicitly requested "fine-grained access control" and a
"policy engine," not just additional boolean permissions.

## Decision

Adopt Open Policy Agent (OPA) with policies written in Rego, compiled to
WASM, and evaluated in-process inside Netlify Functions.

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Policies (source of truth)                                 │
│  ├─ policies/stadium/*.rego        system default files      │
│  └─ policies table (DB)            UI-authored rows          │
└────────────────┬────────────────────────────────────────────┘
                 │ opa build -t wasm
                 ▼
┌─────────────────────────────────────────────────────────────┐
│  policies/dist/authz.wasm           built artifact           │
└────────────────┬────────────────────────────────────────────┘
                 │ @open-policy-agent/opa-wasm
                 ▼
┌─────────────────────────────────────────────────────────────┐
│  netlify/lib/policy.ts                                       │
│  decide(action, subject, resource): boolean                  │
└─────────────────────────────────────────────────────────────┘
```

### Policy sources

Two storage locations feed one compiled bundle:

1. **Files** at `policies/stadium/*.rego` — system default policies,
   committed to the repo. These encode the v1 ABAC rules and cannot be
   edited via UI.
2. **DB rows** in a `policies(name PK, source TEXT, updated_at, updated_by)`
   table — UI-authored policies. Created/edited via the Policies tab (M10).
   Superadmin-only writes.

`scripts/build-policies.ts` reads both, concatenates by package path,
invokes `bin/opa build -t wasm -e stadium/authz`, and emits
`policies/dist/authz.wasm`.

### v1 ABAC scope (5 attribute-aware policies)

These permissions get full Rego policies; all others stay flat booleans:

| Permission | Attribute conditions |
|---|---|
| `incident:transition` | Manager: tier ∈ {4,5}. Admin/superadmin: any tier. |
| `incident:read` | Tenant scoping (already enforced via `claims.tenantId`). |
| `dispatch:create` | Manager: target staff's zone must match caller's zone. Admin: any target in tenant. |
| `dispatch:update` | Caller is the dispatch's `target_staff`, OR caller has admin/superadmin. |
| `staff:reassign` | Manager: source and target zone must match. Admin: any zone in tenant. |

The remaining 10 permissions are checked via `claims.permissions.includes(...)`
without invoking OPA.

### Evaluation location (E2 — server authoritative)

- **Server:** every protected request that triggers an ABAC-scoped action
  calls `policy.decide(action, subject, resource)`. The decision is
  authoritative.
- **Client:** the JWT's `permissions[]` array is the flat union from RBAC
  resolution (ADR-0011). The client uses this for UI hints (show/hide
  buttons). The client does not evaluate attribute conditions. A user may
  see a button for an action they cannot perform on a specific resource;
  the server returns 403 with the OPA decision.

### Build pipeline

| Step | Tool | Output |
|---|---|---|
| `postinstall` | `scripts/install-opa.sh` | Downloads pinned OPA binary to `bin/opa` |
| `prebuild` | `tsx scripts/build-policies.ts` | `policies/dist/authz.wasm` |
| `build` | `tsc -b && vite build` | Production bundle |
| `test:policy` | `bin/opa test policies/` | Rego unit test results |

Netlify build command becomes `npm run prebuild && npm run build`.
Accepted 5-second overhead.

### Runtime evaluation (`netlify/lib/policy.ts`)

```ts
import { loadPolicy } from '@open-policy-agent/opa-wasm';

let evaluator: Evaluator | null = null;

async function getEvaluator(): Promise<Evaluator> {
  if (evaluator) return evaluator;
  const wasm = await readFile('policies/dist/authz.wasm');
  evaluator = await loadPolicy(wasm);
  return evaluator;
}

export async function decide(
  action: Permission,
  subject: PolicySubject,
  resource: PolicyResource | null,
): Promise<boolean> {
  if (!ABAC_SCOPED_ACTIONS.has(action)) {
    throw new Error(`${action} is not ABAC-scoped; check claims.permissions instead`);
  }
  const e = await getEvaluator();
  const result = e.evaluate({ input: { action, subject, resource } });
  return result[0]?.result === true;
}
```

The evaluator is loaded lazily on first call per warm function instance and
cached. Cold-start cost is paid once.

### Policy bundle size and cold-start

- OPA WASM bundle: ~600KB compressed, ~2MB uncompressed.
- Netlify Functions cold start: +500ms-1s observed for WASM load.
- Evaluation after load: sub-millisecond.
- Mitigation if cold-start becomes a problem: precompile the WASM to a
  Netlify Layer (if supported) or switch to a smaller policy engine.

### Policy authoring UI (M10, not in v1)

The Policies tab (U3, see ADR plan §5.2) ships in M10, **after** M9
stabilizes. Until then, the 5 system-default policies are edited via PR.
The DB-backed `policies` table exists in v1 so the M10 UI has a target, but
no UI writes to it until M10.

When M10 lands:
- Superadmin can edit DB-stored policies via CodeMirror with Rego syntax
  highlighting.
- A "Test policy" endpoint accepts sample input JSON and returns the
  decision + evaluation trace.
- A "Rebuild" endpoint triggers `prebuild` + a function redeploy.
- Broken policies fail closed: the rebuild step gates redeploy; if compile
  fails, the old bundle stays live.

## Consequences

**Positive:**

- Tier/zone/self-or-admin rules become declarative and auditable instead of
  inline conditionals in mutation handlers.
- New attribute-aware rules (e.g., "supervisor can transition Tier 3 within
  their zone during operational window") become Rego additions, not code
  changes.
- Policy decisions are auditable: the `audit_ledger` records every
  `policy.decide` call with the resource attributes and the outcome.
- Industry-standard tooling: OPA is CNCF graduated, well-documented, has
  first-class test framework (`opa test`).

**Negative:**

- **Toolchain complexity.** OPA binary in CI; WASM bundle in build; pinned
  version must match local + CI + Netlify.
- **Cold-start latency.** ~500ms-1s added to the first request after a
  function cold-starts. Mitigated by Netlify's warm-container reuse.
- **Learning curve.** Rego has its own semantics (declarative, set-based).
  The team must own Rego fluency.
- **Debugging surface.** Policy failures produce 403s with no visible
  reason unless the server returns the decision trace. M10 adds the tester
  UI; until then, debugging is via `bin/opa eval` locally.

**Tradeoff accepted:** heavyweight toolchain for real attribute-based
decisions. The alternative (TypeScript-native guards) was rejected because
the platform owner explicitly wants a "policy engine," not inline code.

## Reference

- Depends on: ADR-0010 (identity), ADR-0011 (RBAC for the flat permission
  set)
- Required by: ADR-0013 (staleness re-evaluation triggers policy rerun)
- Schema: `database/schema.ts` (`policies` table)
- Build: `scripts/build-policies.ts`, `scripts/install-opa.sh`
- Runtime: `netlify/lib/policy.ts`
- UI: M10 (Policies tab) — see plan §5.2
