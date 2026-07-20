import { GoogleGenAI } from '@google/genai';
import OpenAI from 'openai';
import twilio from 'twilio';

let openAIClient: OpenAI | null = null;
let geminiClient: GoogleGenAI | null = null;
let twilioClient: twilio.Twilio | null | { isMock: true } = null;

export function getOpenAIClient(): OpenAI {
  if (!openAIClient) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is not set');
    }
    openAIClient = new OpenAI({ apiKey });
  }
  return openAIClient;
}

export function getGeminiClient(): GoogleGenAI {
  if (!geminiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY is not set');
    }
    geminiClient = new GoogleGenAI({ apiKey });
  }
  return geminiClient;
}

export function getTwilioClient(): twilio.Twilio | { isMock: true } {
  if (!twilioClient) {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const fromNumber = process.env.TWILIO_FROM_NUMBER;

    if (!accountSid || !authToken || !fromNumber) {
      console.warn('[DEV] Twilio not configured. Using mock fallback.');
      twilioClient = { isMock: true };
    } else {
      twilioClient = twilio(accountSid, authToken);
    }
  }
  return twilioClient;
}
