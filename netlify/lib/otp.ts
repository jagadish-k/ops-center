/**
 * OTP generation, storage, and verification logic (ADR-0003).
 *
 * Uses raw Twilio SMS with self-generated 6-digit codes stored in the
 * `otp_sessions` Postgres table. Enforces expiry, max attempts, and cooldown
 * to prevent brute-force and spam.
 *
 * Post-ADR-0014: queries go through the Drizzle `db` instance.
 */
import { randomInt } from 'node:crypto';
import { db } from './db.ts';
import { otpSessionsTable } from '../../database/schema.ts';
import { eq, sql } from 'drizzle-orm';

/** Generates a cryptographically secure 6-digit OTP code. */
export function generateOtpCode(): string {
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
	await db
		.insert(otpSessionsTable)
		.values({
			phone: phoneNumber,
			code,
			expiresAt: sql`now() + (${expiresInSeconds} || ' seconds')::interval`,
			attempts: 0,
		})
		.onConflictDoUpdate({
			target: otpSessionsTable.phone,
			set: {
				code,
				expiresAt: sql`now() + (${expiresInSeconds} || ' seconds')::interval`,
				attempts: 0,
				createdAt: sql`now()`,
			},
		})
		.execute();
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
	const rows = await db
		.select({ createdAt: otpSessionsTable.createdAt })
		.from(otpSessionsTable)
		.where(eq(otpSessionsTable.phone, phoneNumber))
		.execute();
	if (rows.length === 0) return { ok: true };

	const createdAt = rows[0]!.createdAt;
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
	const rows = await db
		.select({
			code: otpSessionsTable.code,
			expiresAt: otpSessionsTable.expiresAt,
			attempts: otpSessionsTable.attempts,
		})
		.from(otpSessionsTable)
		.where(eq(otpSessionsTable.phone, phoneNumber))
		.execute();

	if (rows.length === 0) return { ok: false, reason: 'not_found' };

	const session = rows[0]!;

	if (new Date() > session.expiresAt) {
		return { ok: false, reason: 'expired' };
	}

	if (session.attempts >= maxAttempts) {
		return { ok: false, reason: 'max_attempts' };
	}

	if (session.code !== submittedCode) {
		const newAttempts = session.attempts + 1;
		await db
			.update(otpSessionsTable)
			.set({ attempts: newAttempts })
			.where(eq(otpSessionsTable.phone, phoneNumber))
			.execute();
		return { ok: false, reason: 'wrong_code', attemptsLeft: maxAttempts - newAttempts };
	}

	return { ok: true };
}

/** Removes a used or expired OTP session. */
export async function clearOtp(phoneNumber: string): Promise<void> {
	await db
		.delete(otpSessionsTable)
		.where(eq(otpSessionsTable.phone, phoneNumber))
		.execute();
}
