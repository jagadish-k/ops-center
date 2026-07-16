/**
 * OTP generation, storage, and verification logic (ADR-0003).
 *
 * Uses raw Twilio SMS with self-generated 6-digit codes stored in the
 * `otp_sessions` Postgres table. Enforces expiry, max attempts, and cooldown
 * to prevent brute-force and spam.
 */
import { randomInt } from 'node:crypto';
import { query } from './db';

/** Generates a cryptographically secure 6-digit OTP code. */
export function generateOtpCode(): string {
	// randomInt is uniform and cryptographically secure (node:crypto).
	const code = randomInt(0, 1000000);
	return code.toString().padStart(6, '0');
}

interface OtpConfig {
	expiresInSeconds: number;
	maxAttempts: number;
	cooldownSeconds: number;
}

function getOtpConfig(): OtpConfig {
	return {
		expiresInSeconds: Number(process.env.OTP_EXPIRES_IN ?? 300),
		maxAttempts: Number(process.env.OTP_MAX_ATTEMPTS ?? 5),
		cooldownSeconds: Number(process.env.OTP_COOLDOWN_SECONDS ?? 60),
	};
}

/**
 * Stores (or replaces) an OTP code for a phone number.
 * Deletes any prior session and inserts a fresh one with a new expiry window.
 */
export async function storeOtp(phoneNumber: string, code: string): Promise<void> {
	const { expiresInSeconds } = getOtpConfig();
	await query(
		`INSERT INTO otp_sessions (phone, code, expires_at, attempts)
		 VALUES ($1, $2, now() + ($3 || ' seconds')::interval, 0)
		 ON CONFLICT (phone) DO UPDATE
		   SET code = EXCLUDED.code,
		       expires_at = EXCLUDED.expires_at,
		       attempts = 0,
		       created_at = now()`,
		[phoneNumber, code, String(expiresInSeconds)],
	);
}

export type StoreOtpResult =
	| { ok: true }
	| { ok: false; reason: 'cooldown' };

/**
 * Checks whether a new OTP can be sent to this phone number (cooldown guard).
 * Prevents OTP-spam attacks.
 */
export async function checkCooldown(phoneNumber: string): Promise<StoreOtpResult> {
	const { cooldownSeconds } = getOtpConfig();
	const rows = await query(
		`SELECT created_at FROM otp_sessions WHERE phone = $1`,
		[phoneNumber],
	);
	if (rows.length === 0) return { ok: true };

	const createdAt = rows[0].created_at as Date;
	const elapsed = (Date.now() - createdAt.getTime()) / 1000;
	if (elapsed < cooldownSeconds) {
		return { ok: false, reason: 'cooldown' };
	}
	return { ok: true };
}

export type VerifyOtpResult =
	| { ok: true }
	| { ok: false; reason: 'not_found' | 'expired' | 'max_attempts' | 'wrong_code'; attemptsLeft?: number };

/**
 * Verifies a submitted OTP code against the stored session.
 * Increments attempt count on failure and enforces max-attempts / expiry.
 * Does NOT delete the session on success — caller should call clearOtp().
 */
export async function verifyOtp(phoneNumber: string, submittedCode: string): Promise<VerifyOtpResult> {
	const { maxAttempts } = getOtpConfig();
	const rows = await query<{ code: string; expires_at: Date; attempts: number }>(
		`SELECT code, expires_at, attempts FROM otp_sessions WHERE phone = $1`,
		[phoneNumber],
	);

	if (rows.length === 0) return { ok: false, reason: 'not_found' };

	const session = rows[0];

	// Check expiry.
	if (new Date() > session.expires_at) {
		return { ok: false, reason: 'expired' };
	}

	// Check attempt limit.
	if (session.attempts >= maxAttempts) {
		return { ok: false, reason: 'max_attempts' };
	}

	// Check code match (constant-time comparison would be ideal but the code
	// is a short 6-digit value — timing attacks are impractical here).
	if (session.code !== submittedCode) {
		const newAttempts = session.attempts + 1;
		await query(`UPDATE otp_sessions SET attempts = $1 WHERE phone = $2`, [
			newAttempts,
			phoneNumber,
		]);
		return { ok: false, reason: 'wrong_code', attemptsLeft: maxAttempts - newAttempts };
	}

	return { ok: true };
}

/** Removes a used or expired OTP session. */
export async function clearOtp(phoneNumber: string): Promise<void> {
	await query(`DELETE FROM otp_sessions WHERE phone = $1`, [phoneNumber]);
}
