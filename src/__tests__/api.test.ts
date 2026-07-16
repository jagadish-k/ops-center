import { describe, it, expect } from 'vitest';
import { decodeClaims } from '../services/api';

/**
 * Tests for client-side JWT decoding (src/services/api.ts).
 *
 * decodeClaims does NOT verify the signature — it's for UI rendering only.
 * The server verifies the JWT on every API call (ADR-0003).
 */

describe('decodeClaims', () => {
	it('decodes a valid JWT payload', () => {
		// Manually construct a minimal JWT: header.payload.signature
		// (base64url, no padding).
		const header = btoa(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
		const payload = btoa(
			JSON.stringify({
				role: 'admin',
				tenantId: 'tenant_metlife_ops',
				phoneNumber: '+14155552026',
				iat: 1700000000,
				exp: 1700003600,
			}),
		);
		const token = `${header}.${payload}.fakesignature`;

		const claims = decodeClaims(token);
		expect(claims).not.toBeNull();
		expect(claims?.role).toBe('admin');
		expect(claims?.tenantId).toBe('tenant_metlife_ops');
		expect(claims?.phoneNumber).toBe('+14155552026');
	});

	it('handles base64url encoding (with - and _)', () => {
		// Construct a payload that produces base64url characters.
		const header = btoa(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
		// A payload with characters that encode to base64url (- or _).
		const payloadObj = {
			role: 'staff' as const,
			tenantId: 'tenant_test',
			phoneNumber: '+10000000000',
			iat: 1700000000,
			exp: 1700003600,
		};
		// Simulate base64url by replacing +/ with -_ and stripping padding.
		const payloadB64 = btoa(JSON.stringify(payloadObj)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
		const token = `${header}.${payloadB64}.sig`;

		const claims = decodeClaims(token);
		expect(claims).not.toBeNull();
		expect(claims?.role).toBe('staff');
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
