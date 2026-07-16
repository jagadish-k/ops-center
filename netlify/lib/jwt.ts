/**
 * RS256 JWT signing & verification using the `jose` library.
 *
 * This replaces the broken Web Crypto code in the reference docs (ADR-0003):
 *   - docs/SECURITY-GATING.md used { name: 'RSASHA264' } (invalid algorithm)
 *   - docs/EDGE-GATEWAY.md used unsigned btoa(claims) tokens
 *   - docs/MASTER-SHELL.md trusted client-decoded localStorage claims
 *
 * `jose` handles base64url encoding, RS256 signing, expiry validation, and
 * signature verification correctly out of the box.
 *
 * Keys are loaded from environment variables (JWT_PRIVATE_KEY / JWT_PUBLIC_KEY,
 * PEM format). See .env.example for generation instructions.
 */
import { SignJWT, jwtVerify, importPKCS8, importSPKI, type JWTPayload } from 'jose';
import type { JwtClaims } from '../../src/types';

const ALG = 'RS256';

let cachedPrivateKey: CryptoKey | null = null;
let cachedPublicKey: CryptoKey | null = null;

async function getPrivateKey(): Promise<CryptoKey> {
	if (cachedPrivateKey) return cachedPrivateKey;
	const pem = process.env.JWT_PRIVATE_KEY;
	if (!pem) throw new Error('JWT_PRIVATE_KEY environment variable is not set.');
	cachedPrivateKey = await importPKCS8(pem, ALG);
	return cachedPrivateKey;
}

async function getPublicKey(): Promise<CryptoKey> {
	if (cachedPublicKey) return cachedPublicKey;
	const pem = process.env.JWT_PUBLIC_KEY;
	if (!pem) throw new Error('JWT_PUBLIC_KEY environment variable is not set.');
	cachedPublicKey = await importSPKI(pem, ALG);
	return cachedPublicKey;
}

/**
 * Mints an RS256-signed JWT carrying role + tenant claims (ADR-0003).
 * The token is verified server-side on every subsequent function call —
 * client-decoded claims are for UI rendering only, never for authorization.
 */
export async function signAuthJwt(claims: Omit<JwtClaims, 'iat' | 'exp'>): Promise<string> {
	const expiresIn = Number(process.env.JWT_EXPIRES_IN ?? 3600);
	const now = Math.floor(Date.now() / 1000);
	const key = await getPrivateKey();

	return new SignJWT({ ...claims })
		.setProtectedHeader({ alg: ALG, typ: 'JWT' })
		.setIssuedAt(now)
		.setExpirationTime(now + expiresIn)
		.setIssuer('stadium-ops')
		.setAudience('stadium-ops-clients')
		.sign(key);
}

/**
 * Verifies an RS256 JWT signature and returns the decoded claims.
 * Throws if the signature is invalid or the token has expired.
 *
 * Used by every protected Netlify Function to authenticate the caller.
 */
export async function verifyAuthJwt(token: string): Promise<JwtClaims> {
	const key = await getPublicKey();
	const { payload } = await jwtVerify(token, key, {
		issuer: 'stadium-ops',
		audience: 'stadium-ops-clients',
	});
	return payload as unknown as JwtClaims;
}

/** Extracts a Bearer token from an Authorization header, or null. */
export function extractBearerToken(authHeader: string | null): string | null {
	if (!authHeader) return null;
	const match = authHeader.match(/^Bearer\s+(.+)$/i);
	return match ? match[1] : null;
}

/**
 * Authenticates a Request by extracting + verifying its JWT.
 * Returns the verified claims, or null if unauthenticated.
 */
export async function authenticateRequest(request: Request): Promise<JwtClaims | null> {
	const token = extractBearerToken(request.headers.get('Authorization'));
	if (!token) return null;
	try {
		return await verifyAuthJwt(token);
	} catch {
		return null;
	}
}

export type { JWTPayload };
