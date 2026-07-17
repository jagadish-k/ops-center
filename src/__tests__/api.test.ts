import { describe, it, expect } from 'vitest';
import { decodeClaims } from '../services/api';

/**
 * Tests for client-side JWT decoding (src/services/api.ts).
 *
 * decodeClaims does NOT verify the signature — it's for UI rendering only.
 * The server verifies the JWT on every API call (ADR-0003 + ADR-0013).
 *
 * Post-ADR-0013 JWT shape: { sub, global_role, tenant_id, permissions[], pv,
 * auth_provider, phone?, full_name?, iat, exp }.
 */

describe('decodeClaims', () => {
	it('decodes a valid post-ADR-0013 JWT payload', () => {
		const header = btoa(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
		const payload = btoa(
			JSON.stringify({
				sub: 'user-uuid-1',
				global_role: 'member',
				tenant_id: 'tenant_metlife_ops',
				permissions: ['incident:create', 'incident:read'],
				pv: 1,
				auth_provider: 'phone_otp',
				phone: '+14155552026',
				iat: 1700000000,
				exp: 1700003600,
			}),
		);
		const token = `${header}.${payload}.fakesignature`;

		const claims = decodeClaims(token);
		expect(claims).not.toBeNull();
		expect(claims?.sub).toBe('user-uuid-1');
		expect(claims?.global_role).toBe('member');
		expect(claims?.tenant_id).toBe('tenant_metlife_ops');
		expect(claims?.permissions).toContain('incident:create');
		expect(claims?.pv).toBe(1);
		expect(claims?.phone).toBe('+14155552026');
	});

	it('handles base64url encoding (with - and _)', () => {
		const header = btoa(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
		const payloadObj = {
			sub: 'user-uuid-2',
			global_role: 'member' as const,
			tenant_id: 'tenant_test',
			permissions: ['incident:read'],
			pv: 1,
			auth_provider: 'phone_otp' as const,
			iat: 1700000000,
			exp: 1700003600,
		};
		const payloadB64 = btoa(JSON.stringify(payloadObj)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
		const token = `${header}.${payloadB64}.sig`;

		const claims = decodeClaims(token);
		expect(claims).not.toBeNull();
		expect(claims?.sub).toBe('user-uuid-2');
	});

	it('returns null for a malformed token', () => {
		expect(decodeClaims('not-a-jwt')).toBeNull();
		expect(decodeClaims('')).toBeNull();
		expect(decodeClaims('only.one')).toBeNull();
	});

	it('returns null for non-JSON payload', () => {
		const header = btoa(JSON.stringify({ alg: 'RS256' }));
		const token = `${header}.${btoa('not json')}.sig`;
		expect(decodeClaims(token)).toBeNull();
	});
});
