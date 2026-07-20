# AI Service Provisioning (Gemini + Whisper)

> **For full local setup** (database, env, SMS emulation, running the app), see
> [`DEVELOPMENT.md`](../DEVELOPMENT.md).
>
> This guide covers **only the AI API key provisioning** needed for the Voice
> Triage pipeline (Milestone 4, ADR-0006). You do NOT need these keys for
> local development of the auth flow or UI.

---

## When You Need These Keys

| Key | Required For | Milestone |
|---|---|---|
| `OPENAI_API_KEY` | Whisper audio transcription | M4 (Voice AI) |
| `GEMINI_API_KEY` | Gemini 1.5 Flash structured extraction | M4 (Voice AI) |

If you're working on Milestones 0–3 (foundation, auth, map, control room), you
can skip this entirely.

---

## 1. Google AI Studio (Gemini 1.5 Flash)

1. Navigate to [Google AI Studio](https://aistudio.google.com/).
2. Create or link a Google Cloud Platform project.
3. Click **Get API Key** → provision a key for this project.
4. Copy the key (`AIzaSy...`).
5. **Rate limit check:** Ensure your tier supports ≥ 15 RPM for development.
   Production needs up to 1000 RPM for matchday peaks.

Add to `.env`:
```bash
GEMINI_API_KEY=AIzaSyYourSecretKeyHere
```

---

## 2. OpenAI Platform (Whisper API)

1. Navigate to [OpenAI Dashboard](https://platform.openai.com/).
2. Set up billing (pre-funded tier recommended to avoid exhaustion during tests).
3. Go to **API Keys** → **Create new secret key**. Name it
   `STADIUM_FIELD_WHISPER_DEV`.
4. Copy the key immediately (`sk-proj-...`). OpenAI hides it after creation.

Add to `.env`:
```bash
OPENAI_API_KEY=sk-proj-YourSecretOpenAIKeyHere
```

---

## 3. Twilio (Real SMS — optional for local dev)

> **Skip this for local development.** When Twilio creds are absent, the system
> runs in **dev mode** and emulates SMS (the OTP code appears in the terminal
> and UI). See [`DEVELOPMENT.md` §6](../DEVELOPMENT.md#6-sms-emulation-dev-mode).

Only needed if you want to test real SMS delivery:

1. Create a [Twilio account](https://www.twilio.com/console).
2. Get your Account SID and Auth Token from the console dashboard.
3. Provision a phone number (trial accounts get one free).
4. Add to `.env`:
   ```bash
   TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   TWILIO_AUTH_TOKEN=your_auth_token_here
   TWILIO_FROM_NUMBER=+1XXXXXXXXXX
   ```

---

## 4. Production Environment Variables

For production deployment, set ALL of these as Netlify environment variables
(Site Configuration → Environment Variables). See
[`docs/DEPLOYMENT-RUNBOOK.md`](DEPLOYMENT-RUNBOOK.md) §Phase 3.

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Netlify Postgres connection string |
| `JWT_PRIVATE_KEY` | RSA private key (PEM) for RS256 JWT signing |
| `JWT_PUBLIC_KEY` | RSA public key (PEM) for JWT verification |
| `TWILIO_ACCOUNT_SID` | Twilio account ID |
| `TWILIO_AUTH_TOKEN` | Twilio auth token |
| `TWILIO_FROM_NUMBER` | Twilio sender phone number |
| `OPENAI_API_KEY` | Whisper API key |
| `GEMINI_API_KEY` | Gemini 1.5 Flash API key |
| `NETLIFY_BLOBS_TOKEN` | Audit chain blob store token (ADR-0005) |
| `CORS_ALLOWED_ORIGINS` | Comma-separated allowed origins (NOT `*` in prod) |

---

## Reference Implementations

The Voice Triage pipeline (`/api/ai-triage`) is implemented in Milestone 4.
Reference designs:

- **`docs/AI-ORCHESTRATOR.md`** — reference `ai-orchestrator.ts` (uses mock
  transcription; superseded by the real Whisper + Gemini pipeline below).
- **`docs/SETUP-GUIDE.md`** §(archived) — contains the full Whisper + Gemini
  orchestrator with `responseSchema`. Note: the URLs in that reference contain
  markdown-link artifacts (`[url](url)`) that must be cleaned when implementing.
