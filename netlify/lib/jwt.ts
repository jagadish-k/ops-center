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
import type { JwtClaims, GlobalRole, Permission } from '../../src/types';

const ALG = 'RS256';

let cachedPrivateKey: CryptoKey | null = null;
let cachedPublicKey: CryptoKey | null = null;

/**
 * Reads a PEM key from an environment variable.
 * Handles both real newlines and \n-escaped single-line values (which is how
 * setup-env.ts stores them in .env for dotenv compatibility).
 */
function readPemEnv(key: string): string {
	const raw = process.env[key];
	if (!raw) throw new Error(`${key} environment variable is not set.`);
	return raw.replace(/\\n/g, '\n');
}

async function getPrivateKey(): Promise<CryptoKey> {
	if (cachedPrivateKey) return cachedPrivateKey;
	const pem = readPemEnv('JWT_PRIVATE_KEY');
	cachedPrivateKey = await importPKCS8(pem, ALG);
	return cachedPrivateKey;
}

async function getPublicKey(): Promise<CryptoKey> {
	if (cachedPublicKey) return cachedPublicKey;
	const pem = readPemEnv('JWT_PUBLIC_KEY');
	cachedPublicKey = await importSPKI(pem, ALG);
	return cachedPublicKey;
}

/** Claims to embed when minting a JWT (post-ADR-0013 shape). */
export interface MintClaims {
	sub: string;
	global_role: GlobalRole;
	tenant_id: string;
	permissions: Permission[];
	pv: number;
	auth_provider: 'phone_otp' | 'google_oauth';
	/** Optional denormalized phone (UI display only). */
	phone?: string;
	/** Optional denormalized full name (UI display only). */
	full_name?: string;
}

/**
 * Mints an RS256-signed JWT carrying the post-ADR-0013 claim shape:
 * `{ sub, global_role, tenant_id, permissions[], pv, auth_provider }`.
 *
 * The token is verified server-side on every subsequent function call —
 * client-decoded claims are for UI rendering only, never for authorization.
 *
 * See ADR-0003 §JWT Claim Shape (post-ADR-0013) for the field-by-field
 * migration from the legacy `{ role, tenantId, phoneNumber }` shape.
 */
export async function signAuthJwt(claims: MintClaims): Promise<string> {
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
 * Verifies a JWT signature but tolerates expiry within a grace window.
 *
 * Used by `/api/auth/refresh` so that clients with recently-expired tokens
 * (within 5 minutes / 300s by default per ADR-0013) can mint a new one
 * without re-authenticating from scratch.
 *
 * Outside the grace window, throws (signature invalid or token too old).
 */
export async function verifyAuthJwtWithGrace(
	token: string,
	graceSeconds = 300,
): Promise<JwtClaims> {
	const key = await getPublicKey();
	const now = Math.floor(Date.now() / 1000);

	try {
		const { payload } = await jwtVerify(token, key, {
			issuer: 'stadium-ops',
			audience: 'stadium-ops-clients',
		});
		return payload as unknown as JwtClaims;
	} catch (err) {
		// If the error is exp-related and within grace, re-verify ignoring exp.
		const code = (err as { code?: string }).code;
		if (code === 'ERR_JWT_EXPIRED') {
			const { payload } = await jwtVerify(token, key, {
				issuer: 'stadium-ops',
				audience: 'stadium-ops-clients',
				maxTokenAge: `${Math.floor(Date.now() / 1000) - 0}s`, // bypass
			}).catch(() => ({ payload: null as JWTPayload | null }));

			// Manual exp check against grace window
			const decoded = payload;
			if (decoded && typeof decoded.exp === 'number' && now - decoded.exp <= graceSeconds) {
				return decoded as unknown as JwtClaims;
			}
		}
		throw err;
	}
}

/**
 * Authenticates a Request by extracting + verifying its JWT.
 * Returns the verified claims, or null if unauthenticated.
 *
 * NOTE: This does NOT check perms_version. Use `authorizeRequest()` from
 * `netlify/lib/auth.ts` for protected endpoints that need staleness gating.
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
