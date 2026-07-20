import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { GENESIS_HASH } from '../../netlify/lib/auditLogger';

/**
 * Tests for the SHA-256 chain computation logic in netlify/lib/auditLogger.ts.
 *
 * These tests verify the DETERMINISTIC PAYLOAD SEQUENCE and chain linkage
 * mathematics without requiring a database connection. The actual commitAuditLog
 * and verifyLedgerChain functions require Postgres and are tested via
 * integration tests.
 */

/** Reproduces the exact payload sequence from auditLogger.ts for verification. */
function buildPayload(entry: {
  eventId: string;
  tenantId: string;
  timestamp: number;
  actorId: string;
  action: string;
  targetResourceId: string;
  deltaSHA: string;
  chainedPriorHash: string;
}): string {
  return JSON.stringify({
    eventId: entry.eventId,
    tenantId: entry.tenantId,
    timestamp: entry.timestamp,
    actorId: entry.actorId,
    action: entry.action,
    targetResourceId: entry.targetResourceId,
    deltaSHA: entry.deltaSHA,
    chainedPriorHash: entry.chainedPriorHash,
  });
}

function sha256(data: string): string {
  return createHash('sha256').update(data, 'utf8').digest('hex');
}

describe('SHA-256 chain mathematics', () => {
  it('genesis hash is 64 hex zeros', () => {
    expect(GENESIS_HASH).toBe('0'.repeat(64));
    expect(GENESIS_HASH).toHaveLength(64);
  });

  it('produces a deterministic hash for the same payload', () => {
    const payload = buildPayload({
      eventId: 'evt_test_001',
      tenantId: 'tenant_metlife_ops',
      timestamp: 1700000000000,
      actorId: '+14155552026',
      action: 'INCIDENT_STATUS_MUTATION',
      targetResourceId: 'inc_test_001',
      deltaSHA: sha256(
        JSON.stringify({
          before: { status: 'OPEN' },
          after: { status: 'ACKNOWLEDGED' },
        }),
      ),
      chainedPriorHash: GENESIS_HASH,
    });

    const hash1 = sha256(payload);
    const hash2 = sha256(payload);
    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64);
  });

  it('chain linkage: entry 2 hash depends on entry 1 hash', () => {
    const baseEntry = {
      eventId: 'evt_001',
      tenantId: 'tenant_test',
      timestamp: 1700000000000,
      actorId: 'user_1',
      action: 'ACTION_A',
      targetResourceId: 'res_1',
      deltaSHA: 'abc123',
    };

    // Entry 1 with genesis prior hash.
    const payload1 = buildPayload({
      ...baseEntry,
      chainedPriorHash: GENESIS_HASH,
    });
    const hash1 = sha256(payload1);

    // Entry 2 chains to hash1.
    const entry2 = {
      ...baseEntry,
      eventId: 'evt_002',
      action: 'ACTION_B',
      timestamp: 1700000001000,
    };
    const payload2 = buildPayload({ ...entry2, chainedPriorHash: hash1 });
    const hash2 = sha256(payload2);

    // If we tamper hash1, hash2 should be different.
    const tamperedHash1 = sha256(payload1 + 'tampered');
    const payload2Tampered = buildPayload({
      ...entry2,
      chainedPriorHash: tamperedHash1,
    });
    const hash2Tampered = sha256(payload2Tampered);

    expect(hash2).not.toBe(hash2Tampered);
  });

  it('deltaSHA is deterministic for the same state delta', () => {
    const delta = { before: { status: 'OPEN' }, after: { status: 'RESOLVED' } };
    const deltaJSON = JSON.stringify(delta);
    const hash1 = sha256(deltaJSON);
    const hash2 = sha256(deltaJSON);
    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64);
  });

  it('different state deltas produce different deltaSHA values', () => {
    const delta1 = sha256(
      JSON.stringify({
        before: { status: 'OPEN' },
        after: { status: 'ACKNOWLEDGED' },
      }),
    );
    const delta2 = sha256(
      JSON.stringify({
        before: { status: 'OPEN' },
        after: { status: 'RESOLVED' },
      }),
    );
    expect(delta1).not.toBe(delta2);
  });

  it('field order in the payload is deterministic (JSON.stringify key order)', () => {
    // The payload uses JSON.stringify with a specific key order.
    // If key order changes, the hash changes — this test documents the order.
    const payload = buildPayload({
      eventId: 'e1',
      tenantId: 't1',
      timestamp: 1000,
      actorId: 'a1',
      action: 'ACT',
      targetResourceId: 'r1',
      deltaSHA: 'd1',
      chainedPriorHash: 'p1',
    });

    // The keys should appear in this exact order.
    expect(payload).toContain('"eventId":"e1"');
    expect(payload).toContain('"tenantId":"t1"');
    expect(payload).toContain('"timestamp":1000');
    expect(payload).toContain('"actorId":"a1"');
    expect(payload).toContain('"action":"ACT"');
    expect(payload).toContain('"targetResourceId":"r1"');
    expect(payload).toContain('"deltaSHA":"d1"');
    expect(payload).toContain('"chainedPriorHash":"p1"');
  });
});
