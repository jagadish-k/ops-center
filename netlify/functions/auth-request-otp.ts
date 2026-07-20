/**
 * POST /api/auth/request-otp
 *
 * Generates a 6-digit OTP code, stores it in otp_sessions (with expiry +
 * cooldown), and sends it via Twilio SMS. ADR-0003.
 *
 * Request:  { "phoneNumber": "+14155552671" }
 * Response: { "status": "SENT" }  (includes "devCode" in dev mode for testing)
 */
import { type Config } from '@netlify/functions';
import { generateOtpCode, storeOtp, checkCooldown } from '../lib/otp';
import { sendSms, formatOtpMessage } from '../lib/twilio';
import { jsonResponse, handlePreflight, badRequest, serverError } from '../lib/http';

// Strict E.164 validation: + followed by 6–15 digits.
const E164_REGEX = /^\+\d{6,15}$/;

export default async (request: Request): Promise<Response> => {
	// CORS preflight.
	const preflight = handlePreflight(request);
	if (preflight) return preflight;

	if (request.method !== 'POST') {
		return jsonResponse({ error: 'Method Not Allowed' }, 405);
	}

	try {
		const { phoneNumber } = (await request.json()) as { phoneNumber?: string };

		if (!phoneNumber) {
			return badRequest('Phone number is required.');
		}

		if (!E164_REGEX.test(phoneNumber)) {
			return badRequest('Phone number must be in E.164 format (e.g., +14155552671).');
		}

		// Cooldown guard — prevent OTP spam.
		const cooldownCheck = await checkCooldown(phoneNumber);
		if (!cooldownCheck.ok) {
			return jsonResponse({ error: 'Too many requests. Please wait before requesting a new code.' }, 429);
		}

		// Generate + store the code.
		const code = generateOtpCode();
		await storeOtp(phoneNumber, code);

		// Send via Twilio (logs in dev if creds are absent).
		const smsResult = await sendSms(phoneNumber, formatOtpMessage(code));
		if (!smsResult.ok) {
			return jsonResponse({ error: 'Failed to send OTP SMS.' }, 502);
		}

		// In dev mode (no Twilio creds), return the code for local testing.
		const isDevMode =
			!process.env.TWILIO_ACCOUNT_SID ||
			!process.env.TWILIO_AUTH_TOKEN ||
			!process.env.TWILIO_FROM_NUMBER;

		return jsonResponse({
			status: 'SENT',
			...(isDevMode ? { devCode: code } : {}),
		});
	} catch (err) {
		console.error('auth-request-otp error:', err);
		return serverError('Internal server error.');
	}
};

export const config: Config = {
	path: '/api/auth/request-otp',
};
