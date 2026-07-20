/**
 * Minimal Twilio SMS sender via the Twilio REST API.
 *
 * Uses raw fetch with HTTP Basic Auth — no SDK dependency (keeps the function
 * bundle light). See ADR-0003 for the OTP strategy.
 */

import { getTwilioClient } from './clients.ts';

interface SendSmsResult {
  ok: boolean;
  error?: string;
}

/**
 * Sends an SMS message via Twilio.
 * In development (no Twilio credentials), this is a no-op that logs the code.
 */
export async function sendSms(
  to: string,
  body: string,
): Promise<SendSmsResult> {
  const fromNumber = process.env.TWILIO_FROM_NUMBER;
  const client = getTwilioClient();

  if ('isMock' in client) {
    console.warn(`[DEV] Twilio not configured. SMS to ${to}: "${body}"`);
    return { ok: true };
  }

  try {
    await client.messages.create({
      body,
      from: fromNumber,
      to,
    });

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
