import { describe, it, expect, beforeAll } from 'vitest';
import { generateKeyPairSync } from 'node:crypto';

/**
 * Tests for the RS256 JWT sign/verify pipeline (netlify/lib/jwt.ts).
 *
 * Post-ADR-0013: the JWT carries `{ sub, global_role, tenant_id, permissions[],
 * pv, auth_provider }` — see ADR-0003 §JWT Claim Shape (post-ADR-0013).
 */

// Generate a test keypair once for this test file.
let privatePem: string;
let publicPem: string;

beforeAll(() => {
	const { privateKey, publicKey } = generateKeyPairSync('rsa', {
		modulusLength: 2048,
	});
	privatePem = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;
	publicPem = publicKey.export({ type: 'spki', format: 'pem' }) as string;

	// Set env vars BEFORE the jwt module caches them on first call.
	process.env.JWT_PRIVATE_KEY = privatePem;
	process.env.JWT_PUBLIC_KEY = publicPem;
});

describe('JWT sign + verify roundtrip (RS256 via jose)', () => {
	it('signs claims and recovers them on verification', async () => {
		const { signAuthJwt, verifyAuthJwt } = await import('../../netlify/lib/jwt');

		const token = await signAuthJwt({
			sub: 'user-uuid-1',
			global_role: 'member',
			tenant_id: 'tenant_metlife_ops',
			permissions: ['incident:create', 'incident:read', 'surface:control-room'],
			pv: 1,
			auth_provider: 'phone_otp',
			phone: '+14155552026',
			full_name: 'Test Admin',
		});

		expect(token).toBeTruthy();
		expect(token.split('.')).toHaveLength(3); // header.payload.signature

		const claims = await verifyAuthJwt(token);
		expect(claims.sub).toBe('user-uuid-1');
		expect(claims.global_role).toBe('member');
		expect(claims.tenant_id).toBe('tenant_metlife_ops');
		expect(claims.permissions).toContain('incident:create');
		expect(claims.pv).toBe(1);
		expect(claims.auth_provider).toBe('phone_otp');
		expect(claims.phone).toBe('+14155552026');
		expect(claims.iss).toBe('stadium-ops');
		expect(claims.aud).toBe('stadium-ops-clients');
		expect(claims.exp).toBeGreaterThan(claims.iat);
	});

	it('produces tokens with exp in the future', async () => {
		const { signAuthJwt, verifyAuthJwt } = await import('../../netlify/lib/jwt');

		const token = await signAuthJwt({
			sub: 'user-uuid-2',
			global_role: 'member',
			tenant_id: 'tenant_sofi_ops',
			permissions: ['incident:create'],
			pv: 1,
			auth_provider: 'phone_otp',
		});

		const claims = await verifyAuthJwt(token);
		const nowSec = Math.floor(Date.now() / 1000);
		expect(claims.exp).toBeGreaterThan(nowSec);
	});

	it('rejects a tampered token (signature mismatch)', async () => {
		const { signAuthJwt, verifyAuthJwt } = await import('../../netlify/lib/jwt');

		const token = await signAuthJwt({
			sub: 'user-uuid-3',
			global_role: 'superadmin',
			tenant_id: 'tenant_metlife_ops',
			permissions: ['tenant:switch'],
			pv: 1,
			auth_provider: 'phone_otp',
		});

		// Tamper: flip a character in the MIDDLE of the signature segment.
		const parts = token.split('.');
		const sigChars = parts[2].split('');
		const midIdx = Math.floor(sigChars.length / 2);
		sigChars[midIdx] = sigChars[midIdx] === 'A' ? 'B' : 'A';
		const tamperedToken = `${parts[0]}.${parts[1]}.${sigChars.join('')}`;

		await expect(verifyAuthJwt(tamperedToken)).rejects.toThrow();
	});

	it('superadmin tokens carry all permissions', async () => {
		const { signAuthJwt, verifyAuthJwt } = await import('../../netlify/lib/jwt');

		const token = await signAuthJwt({
			sub: 'super-uuid',
			global_role: 'superadmin',
			tenant_id: 'tenant_metlife_ops',
			permissions: [
				'incident:create', 'incident:transition', 'incident:read',
				'dispatch:create', 'dispatch:update', 'dispatch:read',
				'tenant:switch', 'tenant:manage',
				'staff:manage', 'staff:reassign', 'role:assign-admin',
				'audit:view',
				'surface:control-room', 'surface:field-client',
				'config:manage',
			],
			pv: 1,
			auth_provider: 'phone_otp',
		});

		const claims = await verifyAuthJwt(token);
		expect(claims.global_role).toBe('superadmin');
		expect(claims.permissions).toHaveLength(15);
	});
});

describe('extractBearerToken', () => {
	it('extracts the token from a Bearer header', async () => {
		const { extractBearerToken } = await import('../../netlify/lib/jwt');
		expect(extractBearerToken('Bearer abc123')).toBe('abc123');
		expect(extractBearerToken('bearer xyz')).toBe('xyz');
	});

	it('returns null for missing or malformed headers', async () => {
		const { extractBearerToken } = await import('../../netlify/lib/jwt');
		expect(extractBearerToken(null)).toBeNull();
		expect(extractBearerToken('Basic abc123')).toBeNull();
		expect(extractBearerToken('')).toBeNull();
	});
});
