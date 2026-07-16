/**
 * Minimal Twilio SMS sender via the Twilio REST API.
 *
 * Uses raw fetch with HTTP Basic Auth — no SDK dependency (keeps the function
 * bundle light). See ADR-0003 for the OTP strategy.
 */

interface SendSmsResult {
	ok: boolean;
	error?: string;
}

/**
 * Sends an SMS message via Twilio.
 * In development (no Twilio credentials), this is a no-op that logs the code.
 */
export async function sendSms(to: string, body: string): Promise<SendSmsResult> {
	const accountSid = process.env.TWILIO_ACCOUNT_SID;
	const authToken = process.env.TWILIO_AUTH_TOKEN;
	const fromNumber = process.env.TWILIO_FROM_NUMBER;

	// Dev fallback: if Twilio is not configured, log instead of sending.
	// This lets local development work without a Twilio account.
	if (!accountSid || !authToken || !fromNumber) {
		console.warn(`[DEV] Twilio not configured. SMS to ${to}: "${body}"`);
		return { ok: true };
	}

	const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
	const auth = Buffer.from(`${accountSid}:${authToken}`).toString('base64');

	const params = new URLSearchParams();
	params.append('To', to);
	params.append('From', fromNumber);
	params.append('Body', body);

	try {
		const response = await fetch(url, {
			method: 'POST',
			headers: {
				Authorization: `Basic ${auth}`,
				'Content-Type': 'application/x-www-form-urlencoded',
			},
			body: params.toString(),
		});

		if (!response.ok) {
			const errorBody = await response.text();
			console.error('Twilio SMS failed:', response.status, errorBody);
			return { ok: false, error: `Twilio error: ${response.status}` };
		}

		return { ok: true };
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		console.error('Twilio SMS network error:', message);
		return { ok: false, error: message };
	}
}

/** Formats the OTP SMS body. */
export function formatOtpMessage(code: string): string {
	return `Your Stadium Ops access code is ${code}. It expires in 5 minutes. Do not share this code.`;
}
