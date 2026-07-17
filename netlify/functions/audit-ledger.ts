/**
 * GET /api/audit-ledger
 *
 * Returns recent audit entries + chain integrity verification for the
 * authenticated tenant (ADR-0005, M6).
 *
 * Security: JWT-verified + perms_version checked (ADR-0013). Requires the
 * `audit:view` permission (admin + superadmin per ADR-0011).
 *
 * Response: {
 *   entries: AuditLogEntry[],
 *   verification: { isChainValid, totalEntries, tamperedEventIds }
 * }
 */
import { type Config } from '@netlify/functions';
import { authorizeRequest, authResponse } from '../lib/auth.ts';
import { jsonResponse, handlePreflight, serverError } from '../lib/http.ts';
import { getRecentAuditEntries, verifyLedgerChain } from '../lib/auditLogger.ts';
import type { Permission } from '../../src/types';

export default async (request: Request): Promise<Response> => {
	const preflight = handlePreflight(request);
	if (preflight) return preflight;

	if (request.method !== 'GET') {
		return jsonResponse({ error: 'Method Not Allowed' }, 405);
	}

	const auth = await authorizeRequest(request, 'audit:view' as Permission);
	const notOk = authResponse(auth);
	if (notOk) return notOk;
	const claims = auth.claims;

	try {
		const [entries, verification] = await Promise.all([
			getRecentAuditEntries(claims.tenant_id, 50),
			verifyLedgerChain(claims.tenant_id),
		]);

		return jsonResponse({ entries, verification });
	} catch (err) {
		console.error('audit-ledger error:', err);
		return serverError('Failed to fetch audit ledger.');
	}
};

export const config: Config = {
	path: '/api/audit-ledger',
};
