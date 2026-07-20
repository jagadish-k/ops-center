/**
 * POST /api/auth/verify-otp
 *
 * Verifies the submitted OTP code, looks up the user (ADR-0010: now in the
 * `users` table, not `staff_roster`), resolves effective permissions
 * (ADR-0011), and mints an RS256 JWT in the post-ADR-0013 shape:
 * `{ sub, global_role, tenant_id, permissions[], pv, auth_provider }`.
 *
 * Request:  { "phoneNumber": "+14155552671", "code": "123456" }
 * Response: { "token": "<jwt>", "claims": { ... } }
 *
 * If the caller is `SUPERADMIN_PHONE` (env) and has no user row yet, an
 * identity row is lazily created with `global_role='superadmin'` as a
 * safety net (ADR-0010 §Superadmin Bootstrap).
 *
 * Security: The JWT is verified server-side on every subsequent request.
 * Client-decoded claims are for UI rendering only.
 */
import { type Config } from '@netlify/functions';
import { verifyOtp, clearOtp } from '../lib/otp.ts';
import { signAuthJwt } from '../lib/jwt.ts';
import { db } from '../lib/db.ts';
import { usersTable, tenantMembershipsTable } from '../../database/schema.ts';
import { eq } from 'drizzle-orm';
import { resolveUserPermissions } from '../lib/rbac.ts';
import { jsonResponse, handlePreflight, badRequest, unauthorized, serverError } from '../lib/http.ts';

const SUPERADMIN_DEFAULT_TENANT = 'tenant_metlife_ops';

export default async (request: Request): Promise<Response> => {
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

	// 2. Look up the user by phone. Lazy-create superadmin if env matches.
	let userRows = await db
		.select({
			id: usersTable.id,
			fullName: usersTable.fullName,
			globalRole: usersTable.globalRole,
			status: usersTable.status,
		})
		.from(usersTable)
		.where(eq(usersTable.phone, phoneNumber))
		.execute();

	if (userRows.length === 0 && phoneNumber === process.env.SUPERADMIN_PHONE) {
		// Lazy-create the superadmin on first login (safety net per ADR-0010 §Superadmin Bootstrap).
		const inserted = await db
			.insert(usersTable)
			.values({
				phone: phoneNumber,
				fullName: 'Default Superadmin',
				globalRole: 'superadmin',
				authProvider: 'phone_otp',
			})
			.onConflictDoUpdate({
				target: usersTable.phone,
				set: { globalRole: 'superadmin', updatedAt: new Date() },
			})
			.returning({
				id: usersTable.id,
				fullName: usersTable.fullName,
				globalRole: usersTable.globalRole,
				status: usersTable.status,
			})
			.execute();
		userRows = inserted;
	}

		if (userRows.length === 0) {
			// Do NOT reveal whether the phone exists vs. the code was wrong
			// (information leakage). Clear the OTP either way.
			await clearOtp(phoneNumber);
			return jsonResponse({ error: 'Phone number is not on the active staff roster.' }, 403);
		}

		const userRow = userRows[0]!;

		if (userRow.status === 'disabled') {
			await clearOtp(phoneNumber);
			return unauthorized('This account has been disabled.');
		}

		// 3. Resolve the active tenant for this user.
		let activeTenant: string;
		if (userRow.globalRole === 'superadmin') {
			// Superadmins don't have a home tenant; default to metlife for the
			// first session. They can switch via /api/auth/switch-tenant.
			activeTenant = SUPERADMIN_DEFAULT_TENANT;
		} else {
			// Pick the user's first tenant membership as the active context.
			const memberships = await db
				.select({ tenantId: tenantMembershipsTable.tenantId })
				.from(tenantMembershipsTable)
				.where(eq(tenantMembershipsTable.userId, userRow.id))
				.execute();

			if (memberships.length === 0) {
				await clearOtp(phoneNumber);
				return jsonResponse({ error: 'User has no tenant memberships.' }, 403);
			}
			activeTenant = memberships[0]!.tenantId;
		}

		// 4. Resolve effective permissions for this user + tenant.
		const resolved = await resolveUserPermissions(userRow.id, activeTenant);
		if (!resolved) {
			await clearOtp(phoneNumber);
			return unauthorized('Unable to resolve user permissions.');
		}

		// 5. Clear the used OTP session.
		await clearOtp(phoneNumber);

		// 6. Mint the JWT in the post-ADR-0013 shape.
		const token = await signAuthJwt({
			sub: resolved.user.userId,
			global_role: resolved.user.globalRole,
			tenant_id: activeTenant,
			permissions: resolved.permissions,
			pv: resolved.user.permsVersion,
			auth_provider: 'phone_otp',
			phone: phoneNumber,
			full_name: userRow.fullName,
		});

		// Decode claims for the response (client uses for UI only).
		const [, payloadB64] = token.split('.');
		const claims = JSON.parse(
			Buffer.from(payloadB64, 'base64url').toString('utf8'),
		);

		return jsonResponse({ token, claims });
	} catch (err) {
		console.error('auth-verify-otp error:', err);
		return serverError('Internal server error.');
	}
};

export const config: Config = {
	path: '/api/auth/verify-otp',
};
