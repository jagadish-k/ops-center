# ADR-0006: Whisper + Gemini Two-Call Voice Triage Pipeline

## Status

Accepted — confirms the voice pipeline strategy from `docs/SETUP-GUIDE.md`,
`docs/AI-ORCHESTRATOR.md`, and `docs/CODE-DESIGN.md` §5.

## Context

The Voice Triage pipeline converts field-staff audio reports into structured
incidents. The documentation specifies two AI models in sequence:

1. **OpenAI Whisper API** — speech-to-text transcription of the WebM audio blob.
2. **Google Gemini 1.5 Flash** — structured JSON extraction from the
   transcribed text (tier, category, severity, locationSector,
   actionRequired).

Alternative strategies considered:

- **Single multimodal model** (Gemini audio-in or GPT-4o audio) doing both
  transcription and extraction in one call. Cheaper, one fewer hop, but less
  control over transcription quality in noisy stadium environments.
- **Groq Whisper API** ($0.04/hr) + Gemini. Cheapest, fast, but more moving
  parts and Groq is a newer provider.

The PRD's own cost analysis (§6.2) projects ~$2,250/month for AI at scale,
dominated by this pipeline. Every voice report is a real, recurring cost.

## Decision

Adopt the **two-call Whisper + Gemini pipeline** as documented:

1. **Stage 1 — Transcription:** The `ai-triage.ts` Netlify Function forwards
   the multipart WebM audio to OpenAI Whisper (`whisper-1` model,
   `language: en`). Returns raw text.
2. **Stage 2 — Extraction:** The transcribed text is sent to Gemini 1.5 Flash
   with a strict JSON schema (`responseSchema` enforcing tier 1–5, category,
   severity, locationSector, actionRequired). Returns the structured Triage
   Result.
3. **Keys:** `OPENAI_API_KEY` and `GEMINI_API_KEY` stored as Netlify
   environment variables. **Never exposed to the client.**
4. **Client calls** only the internal `/api/ai-triage` endpoint — never the
   upstream APIs directly.

### Known reference-code issues to fix

- `docs/SETUP-GUIDE.md` and `docs/AI-ORCHESTRATOR.md` contain **mangled URLs**
  in markdown link format (e.g., `[https://api.openai.com/...](https://api.openai.com/...)`)
  inside TypeScript string literals. These must be cleaned to plain URLs when
  implementing.
- `docs/AI-ORCHESTRATOR.md` returns a **mock** transcription/extraction. The
  real implementation is in `docs/SETUP-GUIDE.md`.

## Consequences

**Positive:**

- Matches the documented spec exactly; no deviation to justify.
- Whisper is the industry standard for noisy-audio transcription — best chance
  of accurate transcription in stadium environments.
- Separation of concerns: transcription quality and extraction logic are
  independently tunable.

**Negative:**

- **Two API calls per report = higher latency** (2–5 seconds total) and
  **higher cost** than a single-call approach. On congested stadium networks,
  this is painful but the UI already has good "UPLOADING" states.
- **Cost at scale.** At ~750 input + 250 output tokens per Gemini call + Whisper
  audio billing, the PRD's $2,250/month estimate holds. Monitor usage.
- **Two failure points.** If Whisper succeeds but Gemini fails, the audio is
  transcribed but not classified. The function must handle partial failure
  gracefully (fallback to manual triage drawer).

**Related:** ADR-0007 (5-tier extraction schema), build plan Milestone 4.
