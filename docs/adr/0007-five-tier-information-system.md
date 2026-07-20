# ADR-0007: Five-Tier Information Classification System

## Status

Accepted — resolves the tier-count contradiction between `PRD.md`,
`docs/PROJECT-BRIEF.md` (5 tiers), and `docs/STRUCTURAL-TYPES.md`,
`docs/AI-ORCHESTRATOR.md`, `docs/CODE-DESIGN.md` (3 tiers).

## Context

The documentation is inconsistent on how many information priority tiers the
platform uses:

| Source | Tier count | Values |
| --- | --- | --- |
| `docs/PROJECT-BRIEF.md` §4 | **5** | 1=Life Safety, 2=Tactical, 3=Crowd, 4=Facilities, 5=Advisory |
| `PRD.md` §2.2 | Implied 5 | References the tier matrix |
| `docs/STRUCTURAL-TYPES.md` | **3** | `tier: 1 \| 2 \| 3` |
| `docs/AI-ORCHESTRATOR.md` | **3** | Prompt schema: `tier: 1 \| 2 \| 3` |
| `docs/CODE-DESIGN.md` §5 | **3** | Same prompt schema |
| `docs/SETUP-GUIDE.md` | **5** | Gemini schema: `tier: INTEGER enum [1,2,3,4,5]` |

The 5-tier model is richer and matches the operational reality described in
`PROJECT-BRIEF.md` (where each tier maps to a distinct target audience and
GenAI mandate). The 3-tier model is a simplification that collapses Facilities
and Advisory into lower-priority buckets.

## Decision

Adopt the **5-tier system** from `docs/PROJECT-BRIEF.md`:

| Tier | Level | Target Audience | Example |
| --- | --- | --- | --- |
| 1 | Life Safety & Crisis | All officials, emergency services | Crowd crush, structural failure |
| 2 | Tactical Dispatch | QRT, paramedics, zone commanders | Cardiac arrest, altercation |
| 3 | Crowd & Logistics Flow | Transit coordinators, gate crews | Turnstile bottleneck |
| 4 | Facility & Maintenance | Maintenance, cleaning, section leads | Burst pipe, broken seating |
| 5 | Operational Advisory | Volunteers, vendors | Shift handover, weather forecast |

### Type system

```typescript
export type InfoTier = 1 | 2 | 3 | 4 | 5;
```

### AI extraction schema

The Gemini prompt's `responseSchema` must enumerate all five tiers:
```json
{ "tier": { "type": "INTEGER", "enum": [1, 2, 3, 4, 5] } }
```

The `docs/SETUP-GUIDE.md` implementation already has this correct. The
3-tier schemas in `docs/AI-ORCHESTRATOR.md` and `docs/CODE-DESIGN.md` §5 are
**outdated** and must not be used.

## Consequences

**Positive:**

- Richer operational model matching real stadium workflows.
- Each tier maps to a distinct visual treatment and routing rule.
- Extensible: adding a tier 6 later is a type change, not a schema rewrite.

**Negative:**

- Slightly more complex AI prompt (5 categories to distinguish vs. 3).
- More UI states to design (5 tier color/size variants on the canvas).
- The canvas reference code (`docs/CODE-DESIGN.md`, `docs/CANVAS-ENGINE.md`)
  only handles tiers 1–2 vs. 3+ as a binary critical/non-critical split. The
  real implementation should map all 5 tiers to distinct visual treatments.

**Related:** ADR-0006 (Gemini extraction schema), `CONTEXT.md` ("Info Tier").
