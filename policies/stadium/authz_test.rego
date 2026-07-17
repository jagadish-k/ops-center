# Unit tests for the ABAC policy bundle (policies/stadium/authz.rego).
#
# Run:  npm run test:policy
# Or:   bin/opa test policies/
#
# Each test case provides a synthetic input + resource and asserts the
# expected allow/deny decision. Tests are organized by the 5 ABAC-scoped
# permissions from ADR-0012 §v1 scope.

package stadium.authz

import rego.v1

# ─── incident:transition ──────────────────────────────────────────────────────

test_incident_transition_superadmin_any_tier if {
    allow with input as {
        "action": "incident:transition",
        "subject": {"global_role": "superadmin", "roles": [], "user_id": "s1", "tenant_id": "t1"},
        "resource": {"tier": 1},
    }
}

test_incident_transition_admin_any_tier if {
    allow with input as {
        "action": "incident:transition",
        "subject": {"global_role": "member", "roles": ["admin"], "user_id": "a1", "tenant_id": "t1"},
        "resource": {"tier": 1},
    }
}

test_incident_transition_manager_tier4_allowed if {
    allow with input as {
        "action": "incident:transition",
        "subject": {"global_role": "member", "roles": ["manager"], "user_id": "m1", "tenant_id": "t1"},
        "resource": {"tier": 4},
    }
}

test_incident_transition_manager_tier5_allowed if {
    allow with input as {
        "action": "incident:transition",
        "subject": {"global_role": "member", "roles": ["manager"], "user_id": "m1", "tenant_id": "t1"},
        "resource": {"tier": 5},
    }
}

test_incident_transition_manager_tier1_denied if {
    not allow with input as {
        "action": "incident:transition",
        "subject": {"global_role": "member", "roles": ["manager"], "user_id": "m1", "tenant_id": "t1"},
        "resource": {"tier": 1},
    }
}

test_incident_transition_manager_tier3_denied if {
    not allow with input as {
        "action": "incident:transition",
        "subject": {"global_role": "member", "roles": ["manager"], "user_id": "m1", "tenant_id": "t1"},
        "resource": {"tier": 3},
    }
}

# ─── dispatch:create ──────────────────────────────────────────────────────────

test_dispatch_create_admin_any_zone if {
    allow with input as {
        "action": "dispatch:create",
        "subject": {"global_role": "member", "roles": ["admin"], "user_id": "a1", "tenant_id": "t1", "assigned_zone": "ZONE-A"},
        "resource": {"target_zone": "ZONE-D"},
    }
}

test_dispatch_create_manager_same_zone if {
    allow with input as {
        "action": "dispatch:create",
        "subject": {"global_role": "member", "roles": ["manager"], "user_id": "m1", "tenant_id": "t1", "assigned_zone": "ZONE-A"},
        "resource": {"target_zone": "ZONE-A"},
    }
}

test_dispatch_create_manager_different_zone_denied if {
    not allow with input as {
        "action": "dispatch:create",
        "subject": {"global_role": "member", "roles": ["manager"], "user_id": "m1", "tenant_id": "t1", "assigned_zone": "ZONE-A"},
        "resource": {"target_zone": "ZONE-B"},
    }
}

# ─── dispatch:update ──────────────────────────────────────────────────────────

test_dispatch_update_self if {
    allow with input as {
        "action": "dispatch:update",
        "subject": {"global_role": "member", "roles": ["staff"], "user_id": "u1", "tenant_id": "t1", "phone": "+14155550001"},
        "resource": {"target_staff_phone": "+14155550001"},
    }
}

test_dispatch_update_other_staff_denied if {
    not allow with input as {
        "action": "dispatch:update",
        "subject": {"global_role": "member", "roles": ["staff"], "user_id": "u1", "tenant_id": "t1", "phone": "+14155550001"},
        "resource": {"target_staff_phone": "+14155550002"},
    }
}

test_dispatch_update_admin_any if {
    allow with input as {
        "action": "dispatch:update",
        "subject": {"global_role": "member", "roles": ["admin"], "user_id": "a1", "tenant_id": "t1", "phone": "+14155559999"},
        "resource": {"target_staff_phone": "+14155550001"},
    }
}

test_dispatch_update_manager_any if {
    allow with input as {
        "action": "dispatch:update",
        "subject": {"global_role": "member", "roles": ["manager"], "user_id": "m1", "tenant_id": "t1", "phone": "+14155559999"},
        "resource": {"target_staff_phone": "+14155550001"},
    }
}

# ─── staff:reassign ───────────────────────────────────────────────────────────

test_staff_reassign_admin_any if {
    allow with input as {
        "action": "staff:reassign",
        "subject": {"global_role": "member", "roles": ["admin"], "user_id": "a1", "tenant_id": "t1", "assigned_zone": "ZONE-A"},
        "resource": {"source_zone": "ZONE-B", "target_zone": "ZONE-C"},
    }
}

test_staff_reassign_manager_same_zones if {
    allow with input as {
        "action": "staff:reassign",
        "subject": {"global_role": "member", "roles": ["manager"], "user_id": "m1", "tenant_id": "t1", "assigned_zone": "ZONE-A"},
        "resource": {"source_zone": "ZONE-A", "target_zone": "ZONE-A"},
    }
}

test_staff_reassign_manager_source_mismatch_denied if {
    not allow with input as {
        "action": "staff:reassign",
        "subject": {"global_role": "member", "roles": ["manager"], "user_id": "m1", "tenant_id": "t1", "assigned_zone": "ZONE-A"},
        "resource": {"source_zone": "ZONE-B", "target_zone": "ZONE-A"},
    }
}

test_staff_reassign_manager_target_mismatch_denied if {
    not allow with input as {
        "action": "staff:reassign",
        "subject": {"global_role": "member", "roles": ["manager"], "user_id": "m1", "tenant_id": "t1", "assigned_zone": "ZONE-A"},
        "resource": {"source_zone": "ZONE-A", "target_zone": "ZONE-B"},
    }
}

# ─── incident:read (tenant-scoped, mostly a passthrough) ──────────────────────

test_incident_read_allowed if {
    allow with input as {
        "action": "incident:read",
        "subject": {"global_role": "member", "roles": ["staff"], "user_id": "u1", "tenant_id": "t1"},
        "resource": null,
    }
}

# ─── default-deny sanity ──────────────────────────────────────────────────────

test_unknown_action_denied if {
    not allow with input as {
        "action": "unknown:permission",
        "subject": {"global_role": "superadmin", "roles": [], "user_id": "s1", "tenant_id": "t1"},
        "resource": {},
    }
}
