/**
 * POST /api/auth/verify-otp
 *
 * Verifies the submitted OTP code, looks up the user in staff_roster to
 * resolve role + tenantId, and mints an RS256 JWT (ADR-0003). Returns the
 * token + claims to the client.
 *
 * Request:  { "phoneNumber": "+14155552671", "code": "123456" }
 * Response: { "token": "<jwt>", "claims": { role, tenantId, phoneNumber, exp } }
 *
 * Security: The JWT is verified server-side on every subsequent request.
 * Client-decoded claims are for UI rendering only.
 */
import { type Config } from '@netlify/functions';
import { verifyOtp, clearOtp } from '../lib/otp';
import { signAuthJwt } from '../lib/jwt';
import { query } from '../lib/db';
import { jsonResponse, handlePreflight, badRequest, unauthorized, serverError } from '../lib/http';
import type { OperationalRole } from '../../src/types';

interface StaffRecord {
	role: OperationalRole;
	tenant_id: string;
}

export default async (request: Request): Promise<Response> => {
	// CORS preflight.
	const preflight = handlePreflight(request);
	if (preflight) return preflight;

	if (request.method !== 'POST') {
		return jsonResponse({ error: 'Method Not Allowed' }, 405);
	}

	try {
		const { phoneNumber, code } = (await request.json()) as {
			phoneNumber?: string;
			code?: string;
		};

		if (!phoneNumber || !code) {
			return badRequest('Phone number and code are required.');
		}

		// 1. Verify the OTP.
		const result = await verifyOtp(phoneNumber, code);
		if (!result.ok) {
			const messages: Record<string, string> = {
				not_found: 'No active OTP session. Request a new code.',
				expired: 'Code has expired. Request a new code.',
				max_attempts: 'Too many failed attempts. Request a new code.',
				wrong_code: `Invalid code. ${result.attemptsLeft ?? 0} attempts remaining.`,
			};
			return jsonResponse({ error: messages[result.reason] ?? 'Verification failed.' }, 401);
		}

		// 2. Look up the user in the staff roster.
		const staff = await query<StaffRecord>(
			`SELECT role, tenant_id FROM staff_roster WHERE id = $1 AND status != 'OFF_DUTY'`,
			[phoneNumber],
		);

		if (staff.length === 0) {
			// Do NOT reveal whether the phone exists vs. the code was wrong
			// (information leakage). Clear the OTP either way.
			await clearOtp(phoneNumber);
			return jsonResponse({ error: 'Phone number is not on the active staff roster.' }, 403);
		}

		const user = staff[0];

		// 3. Clear the used OTP session.
		await clearOtp(phoneNumber);

		// 4. Mint the RS256 JWT with role + tenant claims.
		const token = await signAuthJwt({
			role: user.role,
			tenantId: user.tenant_id,
			phoneNumber,
		});

		// Decode claims for the response (client uses for UI only).
		const [, payloadB64] = token.split('.');
		const claims = JSON.parse(
			Buffer.from(payloadB64, 'base64url').toString('utf8'),
		);

		return jsonResponse({ token, claims });
	} catch (err) {
		console.error('auth-verify-otp error:', err);
		return json({ error: 'Internal server error.' }, 500);
	}
};

export const config: Config = {
	path: '/api/auth/verify-otp',
};
