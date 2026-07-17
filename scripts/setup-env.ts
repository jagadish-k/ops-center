/**
 * Ensures `.env` exists and has all required values for local development.
 *
 * - Creates `.env` from `.env.example` if it doesn't exist.
 * - Fills in MISSING values only — never overwrites existing ones.
 * - Generates an RSA 2048 keypair for JWT signing if keys are absent.
 * - Sets DATABASE_URL to the Docker Compose default if missing.
 *
 * Called automatically by `scripts/dev.ts` on every run (idempotent).
 */
import { generateKeyPairSync } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const ENV_PATH = join(ROOT, '.env');
const EXAMPLE_PATH = join(ROOT, '.env.example');

const DOCKER_DATABASE_URL = 'postgres://postgres:postgres@localhost:5432/stadium_ops';

/** Default values for keys that should be set if missing. */
const DEFAULTS: Record<string, string> = {
	DATABASE_URL: DOCKER_DATABASE_URL,
	SUPERADMIN_PHONE: '+14155550000',
	JWT_EXPIRES_IN: '3600',
	OTP_EXPIRES_IN: '300',
	OTP_MAX_ATTEMPTS: '5',
	OTP_COOLDOWN_SECONDS: '60',
	CORS_ALLOWED_ORIGINS: 'http://localhost:5173,http://localhost:8888',
};

/**
 * Parses a .env file into a map of key → full line.
 * Preserves comments, blank lines, and existing formatting.
 */
function parseEnv(
	content: string,
): { lines: string[]; values: Record<string, string> } {
	const lines = content.split('\n');
	const values: Record<string, string> = {};

	for (const line of lines) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith('#')) continue;
		const eqIndex = trimmed.indexOf('=');
		if (eqIndex === -1) continue;
		const key = trimmed.slice(0, eqIndex).trim();
		const value = trimmed.slice(eqIndex + 1).trim();
		values[key] = value;
	}

	return { lines, values };
}

/** Generates an RSA 2048 keypair and returns PEM strings with \n escapes. */
function generateJwtKeypair(): { privateKey: string; publicKey: string } {
	const { privateKey, publicKey } = generateKeyPairSync('rsa', {
		modulusLength: 2048,
	});
	const privatePem = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;
	const publicPem = publicKey.export({ type: 'spki', format: 'pem' }) as string;

	return {
		privateKey: privatePem.replace(/\n/g, '\\n'),
		publicKey: publicPem.replace(/\n/g, '\\n'),
	};
}

/**
 * Updates the .env content: fills missing keys without clobbering existing ones.
 * Returns the new content and a list of what was set.
 */
function updateEnvContent(
	content: string,
	updates: Record<string, string>,
): { content: string; applied: string[] } {
	const { lines, values } = parseEnv(content);
	const applied: string[] = [];
	const result = [...lines];
	const existingKeys = new Set(Object.keys(values));

	// Update existing lines whose values are empty.
	for (let i = 0; i < result.length; i++) {
		const trimmed = result[i].trim();
		if (!trimmed || trimmed.startsWith('#')) continue;
		const eqIndex = trimmed.indexOf('=');
		if (eqIndex === -1) continue;
		const key = trimmed.slice(0, eqIndex).trim();
		const currentValue = trimmed.slice(eqIndex + 1).trim();

		if (key in updates && !currentValue) {
			result[i] = `${key}=${updates[key]}`;
			applied.push(key);
		}
	}

	// Append keys that don't exist at all.
	for (const [key, value] of Object.entries(updates)) {
		if (!existingKeys.has(key)) {
			result.push(`${key}=${value}`);
			applied.push(key);
		}
	}

	return { content: result.join('\n'), applied };
}

export function setupEnv(): { configured: string[]; generated: string[] } {
	// 1. Create .env from .env.example if it doesn't exist.
	if (!existsSync(ENV_PATH)) {
		if (existsSync(EXAMPLE_PATH)) {
			writeFileSync(ENV_PATH, readFileSync(EXAMPLE_PATH, 'utf8'), 'utf8');
		} else {
			writeFileSync(ENV_PATH, '', 'utf8');
		}
	}

	let content = readFileSync(ENV_PATH, 'utf8');
	const configured: string[] = [];
	const generated: string[] = [];

	// 2. Apply defaults for missing values.
	const defaultsResult = updateEnvContent(content, DEFAULTS);
	content = defaultsResult.content;
	configured.push(...defaultsResult.applied);

	// 3. Generate JWT keypair if missing.
	const { values } = parseEnv(content);
	const updates: Record<string, string> = {};

	if (!values.JWT_PRIVATE_KEY) {
		const keys = generateJwtKeypair();
		updates.JWT_PRIVATE_KEY = keys.privateKey;
		updates.JWT_PUBLIC_KEY = keys.publicKey;
		generated.push('JWT_PRIVATE_KEY', 'JWT_PUBLIC_KEY');
	}

	if (Object.keys(updates).length > 0) {
		const jwtResult = updateEnvContent(content, updates);
		content = jwtResult.content;
	}

	writeFileSync(ENV_PATH, content, 'utf8');

	return { configured, generated };
}

// Allow running directly: npx tsx scripts/setup-env.ts
if (import.meta.url === `file://${process.argv[1]}`) {
	const result = setupEnv();
	if (result.generated.length > 0) {
		console.log('  → Generated RSA keypair for JWT signing.');
	}
	if (result.configured.length > 0) {
		console.log(`  → Set missing values: ${result.configured.join(', ')}`);
	}
	if (result.generated.length === 0 && result.configured.length === 0) {
		console.log('  → .env already configured.');
	}
}
