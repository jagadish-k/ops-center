# Stadium Ops ABAC Policy Bundle
#
# Implements the 5 attribute-aware policies from ADR-0012 §v1 scope:
#   - incident:transition (tier-gated for managers)
#   - incident:read (tenant scoping, primarily enforced via JWT)
#   - dispatch:create (zone-gated for managers)
#   - dispatch:update (self-or-permitted)
#   - staff:reassign (zone-gated for managers)
#
# Input shape (per ADR-0012):
#   {
#     "action": "<permission name>",
#     "subject": {
#       "user_id": "<uuid>",
#       "global_role": "superadmin" | "member",
#       "roles": ["admin", "manager", ...],     # tenant_memberships.roles for active tenant
#       "tenant_id": "tenant_x",
#       "assigned_zone": "ZONE-A",               # caller's roster zone, if applicable
#       "phone": "+14155550001"
#     },
#     "resource": {                              # null when action has no resource
#       "tenant_id": "tenant_metlife_ops",
#       "tier": 3,                               # for incidents
#       "assigned_zone": "ZONE-A",               # for staff
#       "target_staff_phone": "+14155550001",    # for dispatches
#       "actor_phone": "+14155550001"            # for self-or-permitted checks
#     }
#   }
#
# Output: data.stadium.authz.allow (boolean)
#
# Compilation: `opa build -t wasm -e stadium/authz/allow policies/stadium/*.rego`
# Entrypoint: stadium/authz/allow

package stadium.authz

import rego.v1

# ─── Top-level allow rule ─────────────────────────────────────────────────────
#
# Aggregates the per-action rules below. Default-deny: anything not explicitly
# allowed is rejected.

default allow := false

allow if {
    rule_incident_transition
}

allow if {
    rule_incident_read
}

allow if {
    rule_dispatch_create
}

allow if {
    rule_dispatch_update
}

allow if {
    rule_staff_reassign
}

# ─── Helpers ──────────────────────────────────────────────────────────────────

is_superadmin if {
    input.subject.global_role == "superadmin"
}

has_role(role) if {
    role in input.subject.roles
}

is_admin if {
    has_role("admin")
}

is_manager if {
    has_role("manager")
}

# ─── incident:transition ──────────────────────────────────────────────────────
# Admins + superadmins can transition any tier. Managers can transition Tier 4
# and 5 only (advisory + facilities). Staff cannot transition at all (flat
# permission check rejects them before this policy runs).

rule_incident_transition if {
    input.action == "incident:transition"
    is_superadmin
}

rule_incident_transition if {
    input.action == "incident:transition"
    is_admin
}

rule_incident_transition if {
    input.action == "incident:transition"
    is_manager
    input.resource.tier >= 4
}

# ─── incident:read ────────────────────────────────────────────────────────────
# Tenant scoping is enforced at the SQL layer (WHERE tenant_id = claims.tenant_id).
# This policy exists for symmetry + future attribute conditions. For now it
# defers to the flat permission check (claims.permissions.includes).

rule_incident_read if {
    input.action == "incident:read"
}

# ─── dispatch:create ──────────────────────────────────────────────────────────
# Admins + superadmins can dispatch any target in their tenant. Managers can
# dispatch only to staff in their own zone.

rule_dispatch_create if {
    input.action == "dispatch:create"
    is_superadmin
}

rule_dispatch_create if {
    input.action == "dispatch:create"
    is_admin
}

rule_dispatch_create if {
    input.action == "dispatch:create"
    is_manager
    same_zone_as_target
}

same_zone_as_target if {
    input.subject.assigned_zone == input.resource.target_zone
}

# ─── dispatch:update ──────────────────────────────────────────────────────────
# The caller can update their own dispatch (self) OR any dispatch if they have
# the flat `dispatch:update` permission (admin + manager + superadmin).
# Resource carries `target_staff_phone` for the self check.

rule_dispatch_update if {
    input.action == "dispatch:update"
    input.subject.phone == input.resource.target_staff_phone
}

rule_dispatch_update if {
    input.action == "dispatch:update"
    is_superadmin
}

rule_dispatch_update if {
    input.action == "dispatch:update"
    is_admin
}

rule_dispatch_update if {
    input.action == "dispatch:update"
    is_manager
}

# ─── staff:reassign ───────────────────────────────────────────────────────────
# Admins + superadmins can reassign any staff in their tenant. Managers can
# reassign only within their own zone (source AND target must match).

rule_staff_reassign if {
    input.action == "staff:reassign"
    is_superadmin
}

rule_staff_reassign if {
    input.action == "staff:reassign"
    is_admin
}

rule_staff_reassign if {
    input.action == "staff:reassign"
    is_manager
    same_zone_as_source
    same_zone_as_target
}

same_zone_as_source if {
    input.subject.assigned_zone == input.resource.source_zone
}
