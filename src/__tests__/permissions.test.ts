import { describe, it, expect } from 'vitest';
import {
  ALL_PERMISSIONS,
  ABAC_SCOPED_PERMISSIONS,
  permissionsForClaim,
  type Permission,
} from '@/lib/permissions';

/**
 * Tests for the post-ADR-0011 permission model.
 *
 * The role → permission mapping is now DB-driven and preseeded by
 * `database/seed.ts`. The closed `Permission` union + `ALL_PERMISSIONS` +
 * `ABAC_SCOPED_PERMISSIONS` are tested here. The DB-seeded role matrix is
 * tested end-to-end via `database/seed.ts` integration tests (future).
 */

describe('ALL_PERMISSIONS', () => {
  it('contains the 15 typed permissions', () => {
    expect(ALL_PERMISSIONS).toHaveLength(15);
  });

  it('includes the two M9 additions', () => {
    expect(ALL_PERMISSIONS).toContain('staff:reassign');
    expect(ALL_PERMISSIONS).toContain('role:assign-admin');
  });

  it('has no duplicates', () => {
    const set = new Set(ALL_PERMISSIONS);
    expect(set.size).toBe(ALL_PERMISSIONS.length);
  });
});

describe('ABAC_SCOPED_PERMISSIONS', () => {
  it('contains exactly the 5 attribute-aware actions (ADR-0012)', () => {
    expect(ABAC_SCOPED_PERMISSIONS.size).toBe(5);
  });

  it('includes incident:transition (tier-gated)', () => {
    expect(ABAC_SCOPED_PERMISSIONS.has('incident:transition')).toBe(true);
  });

  it('includes dispatch:create (zone-gated)', () => {
    expect(ABAC_SCOPED_PERMISSIONS.has('dispatch:create')).toBe(true);
  });

  it('includes staff:reassign (zone-gated)', () => {
    expect(ABAC_SCOPED_PERMISSIONS.has('staff:reassign')).toBe(true);
  });

  it('does NOT include flat permissions like audit:view', () => {
    expect(ABAC_SCOPED_PERMISSIONS.has('audit:view')).toBe(false);
    expect(ABAC_SCOPED_PERMISSIONS.has('tenant:switch')).toBe(false);
  });
});

// sanity: the manager role is granted incident:transition at flat level
// (so the ABAC tier-gate can run); the matrix update happened post-M9.4 wire-up.

describe('permissionsForClaim', () => {
  it('returns a set from the claim array', () => {
    const perms: Permission[] = ['incident:create', 'audit:view'];
    const set = permissionsForClaim(perms);
    expect(set.has('incident:create')).toBe(true);
    expect(set.has('audit:view')).toBe(true);
    expect(set.has('incident:transition')).toBe(false);
  });

  it('returns empty set for null/undefined', () => {
    expect(permissionsForClaim(null).size).toBe(0);
    expect(permissionsForClaim(undefined).size).toBe(0);
    expect(permissionsForClaim([]).size).toBe(0);
  });

  it('handles readonly arrays', () => {
    const perms = ['incident:create'] as const;
    const set = permissionsForClaim(perms);
    expect(set.has('incident:create')).toBe(true);
  });
});
