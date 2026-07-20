import { describe, it, expect } from 'vitest';

/**
 * Tests for OTP code generation (netlify/lib/otp.ts).
 *
 * Only tests the pure `generateOtpCode` function — the DB-dependent functions
 * (storeOtp, verifyOtp, checkCooldown) require a live Postgres connection and
 * are validated via integration tests in Milestone 8.
 */
describe('generateOtpCode', () => {
  it('produces a 6-character string', async () => {
    const { generateOtpCode } = await import('../../netlify/lib/otp');
    const code = generateOtpCode();
    expect(code).toHaveLength(6);
    expect(typeof code).toBe('string');
  });

  it('contains only digits', async () => {
    const { generateOtpCode } = await import('../../netlify/lib/otp');
    for (let i = 0; i < 100; i++) {
      const code = generateOtpCode();
      expect(code).toMatch(/^\d{6}$/);
    }
  });

  it('produces codes in the valid range (000000–999999)', async () => {
    const { generateOtpCode } = await import('../../netlify/lib/otp');
    for (let i = 0; i < 100; i++) {
      const code = generateOtpCode();
      const numeric = parseInt(code, 10);
      expect(numeric).toBeGreaterThanOrEqual(0);
      expect(numeric).toBeLessThanOrEqual(999999);
    }
  });

  it('pads with leading zeros when needed', async () => {
    // We can't control the random output, but over many iterations a
    // value < 100000 (5 digits) should eventually appear and be padded.
    const { generateOtpCode } = await import('../../netlify/lib/otp');
    let sawLeadingZero = false;
    for (let i = 0; i < 500; i++) {
      const code = generateOtpCode();
      if (code.startsWith('0')) {
        sawLeadingZero = true;
        break;
      }
    }
    // Extremely likely with 500 draws (~39% of the range starts with 0).
    expect(sawLeadingZero).toBe(true);
  });
});

describe('formatOtpMessage', () => {
  it('includes the code in the SMS body', async () => {
    const { formatOtpMessage } = await import('../../netlify/lib/twilio');
    const msg = formatOtpMessage('482910');
    expect(msg).toContain('482910');
    expect(msg).toContain('Stadium Ops');
    expect(msg.toLowerCase()).toContain('expire');
  });
});
