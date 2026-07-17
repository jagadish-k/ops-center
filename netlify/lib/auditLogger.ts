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
 *
 * Post-ADR-0010: AuditActor.role is now a free-form string (was OperationalRole).
 * The actor's global_role and active tenant are recorded for forensic clarity.
 */
import { createHash, randomUUID } from 'node:crypto';
import { db } from './db.ts';
import { auditLedgerTable } from '../../database/schema.ts';
import { eq, desc, asc } from 'drizzle-orm';
import type { AuditLogEntry } from '../../src/types';

/** Genesis hash for the first entry in each tenant's chain. */
export const GENESIS_HASH = '0'.repeat(64);

export interface AuditActor {
	uid: string;            // users.id (UUID) post-ADR-0010
	role: string;           // global_role ('superadmin' | 'member') or scoped role
	phoneOrEmail: string;   // for human-readable audit
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
	const rows = await db
		.select({ cryptographicHash: auditLedgerTable.cryptographicHash })
		.from(auditLedgerTable)
		.where(eq(auditLedgerTable.tenantId, tenantId))
		.orderBy(desc(auditLedgerTable.timestamp), desc(auditLedgerTable.eventId))
		.limit(1)
		.execute();
	return rows.length > 0 ? rows[0]!.cryptographicHash : GENESIS_HASH;
}

/**
 * Commits a forensic audit log entry to the chain.
 */
export async function commitAuditLog(params: CommitAuditParams): Promise<AuditLogEntry> {
	const eventId = `evt_${randomUUID().slice(0, 12)}`;
	const timestamp = Date.now();

	const chainedPriorHash = await getLastHash(params.tenantId);

	const deltaJSON = JSON.stringify(params.stateDelta);
	const deltaSHA = sha256(deltaJSON);

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
			role: params.actor.role as never, // legacy OperationalRole cast — kept for type compat
			phoneOrEmail: params.actor.phoneOrEmail,
			deviceFingerprint: 'server',
			ipAddress: '0.0.0.0',
		},
		action: params.action,
		targetResourceId: params.targetResourceId,
		stateDelta: params.stateDelta as { before: Record<string, unknown> | null; after: Record<string, unknown> | null },
		cryptographicHash,
	};

	await db
		.insert(auditLedgerTable)
		.values({
			eventId,
			tenantId: params.tenantId,
			timestamp,
			actorUid: params.actor.uid,
			actorRole: params.actor.role,
			actorPhoneEmail: params.actor.phoneOrEmail,
			action: params.action,
			targetResourceId: params.targetResourceId,
			stateDelta: JSON.parse(deltaJSON),
			deltaSha: deltaSHA,
			chainedPriorHash,
			cryptographicHash,
		})
		.execute();

	return entry;
}

// ─── Chain verification ───────────────────────────────────────────────────────

export interface VerificationReport {
	isChainValid: boolean;
	totalEntries: number;
	tamperedEventIds: string[];
}

/** Walks the entire audit chain for a tenant and verifies integrity. */
export async function verifyLedgerChain(tenantId: string): Promise<VerificationReport> {
	const rows = await db
		.select({
			eventId: auditLedgerTable.eventId,
			timestamp: auditLedgerTable.timestamp,
			actorUid: auditLedgerTable.actorUid,
			action: auditLedgerTable.action,
			targetResourceId: auditLedgerTable.targetResourceId,
			deltaSha: auditLedgerTable.deltaSha,
			chainedPriorHash: auditLedgerTable.chainedPriorHash,
			cryptographicHash: auditLedgerTable.cryptographicHash,
		})
		.from(auditLedgerTable)
		.where(eq(auditLedgerTable.tenantId, tenantId))
		.orderBy(asc(auditLedgerTable.timestamp), asc(auditLedgerTable.eventId))
		.execute();

	const report: VerificationReport = {
		isChainValid: true,
		totalEntries: rows.length,
		tamperedEventIds: [],
	};

	let expectedPriorHash = GENESIS_HASH;

	for (const row of rows) {
		if (row.chainedPriorHash !== expectedPriorHash) {
			report.isChainValid = false;
			report.tamperedEventIds.push(row.eventId);
		}

		const payload = JSON.stringify({
			eventId: row.eventId,
			tenantId,
			timestamp: row.timestamp,
			actorId: row.actorUid,
			action: row.action,
			targetResourceId: row.targetResourceId,
			deltaSHA: row.deltaSha,
			chainedPriorHash: row.chainedPriorHash,
		});
		const expectedHash = sha256(payload);

		if (expectedHash !== row.cryptographicHash) {
			report.isChainValid = false;
			if (!report.tamperedEventIds.includes(row.eventId)) {
				report.tamperedEventIds.push(row.eventId);
			}
		}

		expectedPriorHash = row.cryptographicHash;
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
	const rows = await db
		.select({
			eventId: auditLedgerTable.eventId,
			tenantId: auditLedgerTable.tenantId,
			timestamp: auditLedgerTable.timestamp,
			actorUid: auditLedgerTable.actorUid,
			actorRole: auditLedgerTable.actorRole,
			actorPhoneEmail: auditLedgerTable.actorPhoneEmail,
			action: auditLedgerTable.action,
			targetResourceId: auditLedgerTable.targetResourceId,
			stateDelta: auditLedgerTable.stateDelta,
			cryptographicHash: auditLedgerTable.cryptographicHash,
		})
		.from(auditLedgerTable)
		.where(eq(auditLedgerTable.tenantId, tenantId))
		.orderBy(desc(auditLedgerTable.timestamp))
		.limit(limit)
		.execute();

	return rows.map((row) => ({
		eventId: row.eventId,
		tenantId: row.tenantId,
		timestamp: row.timestamp,
		actor: {
			uid: row.actorUid,
			role: row.actorRole as never,
			phoneOrEmail: row.actorPhoneEmail ?? '',
			deviceFingerprint: 'server',
			ipAddress: '0.0.0.0',
		},
		action: row.action,
		targetResourceId: row.targetResourceId,
		stateDelta: (row.stateDelta as { before: unknown; after: unknown } | null) ?? { before: null, after: null },
		cryptographicHash: row.cryptographicHash,
	})) as AuditLogEntry[];
}
