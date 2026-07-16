/**
 * GET /api/audit-ledger
 *
 * Returns recent audit entries + chain integrity verification for the
 * authenticated tenant (ADR-0005, M6).
 *
 * Security: JWT-verified. Admin/superadmin only (audit:view permission).
 *
 * Response: {
 *   entries: AuditLogEntry[],
 *   verification: { isChainValid, totalEntries, tamperedEventIds }
 * }
 */
import { type Config } from '@netlify/functions';
import { authenticateRequest } from '../lib/jwt';
import { jsonResponse, handlePreflight, unauthorized, badRequest, serverError } from '../lib/http';
import { getRecentAuditEntries, verifyLedgerChain } from '../lib/auditLogger';

export default async (request: Request): Promise<Response> => {
	const preflight = handlePreflight(request);
	if (preflight) return preflight;

	if (request.method !== 'GET') {
		return jsonResponse({ error: 'Method Not Allowed' }, 405);
	}

	const claims = await authenticateRequest(request);
	if (!claims) {
		return unauthorized('Invalid or missing authentication token.');
	}

	// Only admins/superadmins can view the audit log.
	if (claims.role !== 'admin' && claims.role !== 'superadmin') {
		return unauthorized('Only admins can view the audit ledger.');
	}

	try {
		const [entries, verification] = await Promise.all([
			getRecentAuditEntries(claims.tenantId, 50),
			verifyLedgerChain(claims.tenantId),
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
