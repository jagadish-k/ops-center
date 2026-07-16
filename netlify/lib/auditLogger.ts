/**
 * Server-side SHA-256 chained audit logger (ADR-0005, PRD §8.1).
 *
 * Every state mutation in the platform generates an audit entry chained via
 * SHA-256: Hash_n = SHA-256(Data_n ∥ Hash_{n-1}).
 *
 * The chain is stored in the Postgres audit_ledger table, which is append-only
 * (WORM-enforced via triggers that reject UPDATE/DELETE). This makes the chain
 * tamper-evident: any modification to a historical entry breaks the hash
 * sequence, which the verify-ledger endpoint detects.
 *
 * Deterministic input payload (PRD §8.1):
 *   InputPayload_n = eventId ∥ tenantId ∥ timestamp ∥ actorId ∥ action ∥
 *                    targetResourceId ∥ deltaSHA ∥ chainedPriorHash
 */
import { createHash, randomUUID } from 'node:crypto';
import { query } from './db';
import type { AuditLogEntry, OperationalRole } from '../../src/types';

/** Genesis hash for the first entry in each tenant's chain. */
export const GENESIS_HASH = '0'.repeat(64);

export interface AuditActor {
	uid: string;
	role: OperationalRole;
	phoneOrEmail: string;
}

export interface CommitAuditParams {
	tenantId: string;
	actor: AuditActor;
	action: string;
	targetResourceId: string;
	stateDelta: { before: unknown | null; after: unknown | null };
}

/** Computes SHA-256 hex digest of a string. */
function sha256(data: string): string {
	return createHash('sha256').update(data, 'utf8').digest('hex');
}

/**
 * Retrieves the last chain hash for a tenant.
 * Returns the genesis hash if no entries exist yet.
 */
async function getLastHash(tenantId: string): Promise<string> {
	const rows = await query<{ cryptographic_hash: string }>(
		`SELECT cryptographic_hash FROM audit_ledger
		 WHERE tenant_id = $1
		 ORDER BY timestamp DESC, event_id DESC
		 LIMIT 1`,
		[tenantId],
	);
	return rows.length > 0 ? rows[0].cryptographic_hash : GENESIS_HASH;
}

/**
 * Commits a forensic audit log entry to the chain.
 *
 * Computes:
 *   deltaSHA = SHA-256(JSON.stringify({before, after}))
 *   Hash_n   = SHA-256(InputPayload_n ∥ chainedPriorHash)
 *
 * Then INSERTs into audit_ledger (append-only). Returns the full entry.
 */
export async function commitAuditLog(params: CommitAuditParams): Promise<AuditLogEntry> {
	const eventId = `evt_${randomUUID().slice(0, 12)}`;
	const timestamp = Date.now();

	// Resolve the prior hash for chain linkage.
	const chainedPriorHash = await getLastHash(params.tenantId);

	// Compute delta SHA (hash of the before/after state diff).
	const deltaJSON = JSON.stringify(params.stateDelta);
	const deltaSHA = sha256(deltaJSON);

	// Compute the chain hash using the deterministic payload sequence (PRD §8.1).
	const payload = JSON.stringify({
		eventId,
		tenantId: params.tenantId,
		timestamp,
		actorId: params.actor.uid,
		action: params.action,
		targetResourceId: params.targetResourceId,
		deltaSHA,
		chainedPriorHash,
	});
	const cryptographicHash = sha256(payload);

	const entry: AuditLogEntry = {
		eventId,
		tenantId: params.tenantId,
		timestamp,
		actor: {
			uid: params.actor.uid,
			role: params.actor.role,
			phoneOrEmail: params.actor.phoneOrEmail,
			deviceFingerprint: 'server',
			ipAddress: '0.0.0.0',
		},
		action: params.action,
		targetResourceId: params.targetResourceId,
		stateDelta: params.stateDelta as { before: Record<string, unknown> | null; after: Record<string, unknown> | null },
		cryptographicHash,
	};

	// INSERT (append-only — triggers reject UPDATE/DELETE).
	await query(
		`INSERT INTO audit_ledger
		   (event_id, tenant_id, timestamp, actor_uid, actor_role, actor_phone_email,
		    action, target_resource_id, state_delta, delta_sha, chained_prior_hash,
		    cryptographic_hash)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
		[
			eventId,
			params.tenantId,
			timestamp,
			params.actor.uid,
			params.actor.role,
			params.actor.phoneOrEmail,
			params.action,
			params.targetResourceId,
			deltaJSON,
			deltaSHA,
			chainedPriorHash,
			cryptographicHash,
		],
	);

	return entry;
}

// ─── Chain verification ───────────────────────────────────────────────────────

export interface VerificationReport {
	isChainValid: boolean;
	totalEntries: number;
	tamperedEventIds: string[];
}

/**
 * Walks the entire audit chain for a tenant and verifies integrity.
 * Recomputes each hash using the prior hash and compares with the stored value.
 */
export async function verifyLedgerChain(tenantId: string): Promise<VerificationReport> {
	const rows = await query<{
		event_id: string;
		timestamp: number;
		actor_uid: string;
		action: string;
		target_resource_id: string;
		delta_sha: string;
		chained_prior_hash: string;
		cryptographic_hash: string;
	}>(
		`SELECT event_id, timestamp, actor_uid, action, target_resource_id,
		        delta_sha, chained_prior_hash, cryptographic_hash
		 FROM audit_ledger
		 WHERE tenant_id = $1
		 ORDER BY timestamp ASC, event_id ASC`,
		[tenantId],
	);

	const report: VerificationReport = {
		isChainValid: true,
		totalEntries: rows.length,
		tamperedEventIds: [],
	};

	let expectedPriorHash = GENESIS_HASH;

	for (const row of rows) {
		// Verify the prior hash linkage.
		if (row.chained_prior_hash !== expectedPriorHash) {
			report.isChainValid = false;
			report.tamperedEventIds.push(row.event_id);
		}

		// Recompute the expected hash.
		const payload = JSON.stringify({
			eventId: row.event_id,
			tenantId,
			timestamp: row.timestamp,
			actorId: row.actor_uid,
			action: row.action,
			targetResourceId: row.target_resource_id,
			deltaSHA: row.delta_sha,
			chainedPriorHash: row.chained_prior_hash,
		});
		const expectedHash = sha256(payload);

		if (expectedHash !== row.cryptographic_hash) {
			report.isChainValid = false;
			if (!report.tamperedEventIds.includes(row.event_id)) {
				report.tamperedEventIds.push(row.event_id);
			}
		}

		// Roll the pointer forward using the STORED hash (not the recomputed one).
		// If the stored hash is wrong, the next entry's prior-hash check will fail too.
		expectedPriorHash = row.cryptographic_hash;
	}

	return report;
}

/**
 * Fetches recent audit entries for display in the AuditTimelineInspector.
 */
export async function getRecentAuditEntries(
	tenantId: string,
	limit = 50,
): Promise<AuditLogEntry[]> {
	const rows = await query(
		`SELECT event_id, tenant_id, timestamp, actor_uid, actor_role, actor_phone_email,
		        action, target_resource_id, state_delta, cryptographic_hash
		 FROM audit_ledger
		 WHERE tenant_id = $1
		 ORDER BY timestamp DESC
		 LIMIT $2`,
		[tenantId, limit],
	);

	return rows.map((row) => ({
		eventId: row.event_id,
		tenantId: row.tenant_id,
		timestamp: row.timestamp,
		actor: {
			uid: row.actor_uid,
			role: row.actor_role,
			phoneOrEmail: row.actor_phone_email ?? '',
			deviceFingerprint: 'server',
			ipAddress: '0.0.0.0',
		},
		action: row.action,
		targetResourceId: row.target_resource_id,
		stateDelta: row.state_delta ?? { before: null, after: null },
		cryptographicHash: row.cryptographic_hash,
	})) as AuditLogEntry[];
}
