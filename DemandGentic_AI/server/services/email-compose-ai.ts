/**
 * Unified Email AI Compose Service
 * Provider chain: DeepSeek (primary) → Kimi (fallback) → OpenAI (last resort)
 */

import OpenAI from 'openai';
import { kimiChat, isKimiConfigured } from './kimi-client';

// ==================== PROVIDER SETUP ====================

let deepseekClient: OpenAI | null = null;
let openaiClient: OpenAI | null = null;

function getDeepSeekClient(): OpenAI | null {
  if (deepseekClient) return deepseekClient;
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) return null;
  deepseekClient = new OpenAI({
    apiKey,
    baseURL: 'https://api.deepseek.com/v1',
    timeout: 60_000,
    maxRetries: 1,
  });
  return deepseekClient;
}

function getOpenAIClient(): OpenAI | null {
  if (openaiClient) return openaiClient;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  openaiClient = new OpenAI({
    apiKey,
    timeout: 60_000,
    maxRetries: 1,
  });
  return openaiClient;
}

// ==================== CORE PROVIDER CALL ====================

async function callProvider(
  systemPrompt: string,
  userPrompt: string,
): Promise {
  // Try DeepSeek first
  const ds = getDeepSeekClient();
  if (ds) {
    try {
      const res = await ds.chat.completions.create({
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.7,
        max_tokens: 2000,
      });
      const text = res.choices[0]?.message?.content;
      if (text) return text;
    } catch (err) {
      console.warn('[EMAIL-COMPOSE-AI] DeepSeek failed, trying fallback:', (err as Error).message);
    }
  }

  // Try Kimi fallback
  if (isKimiConfigured()) {
    try {
      const text = await kimiChat(systemPrompt, [{ role: 'user', content: userPrompt }], {
        model: 'fast',
        temperature: 0.7,
        maxTokens: 2000,
      });
      if (text) return text;
    } catch (err) {
      console.warn('[EMAIL-COMPOSE-AI] Kimi failed, trying OpenAI:', (err as Error).message);
    }
  }

  // OpenAI last resort
  const oai = getOpenAIClient();
  if (oai) {
    const res = await oai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.7,
      max_tokens: 2000,
    });
    const text = res.choices[0]?.message?.content;
    if (text) return text;
  }

  throw new Error('No AI provider available. Configure DEEPSEEK_API_KEY, KIMI_API_KEY, or OPENAI_API_KEY.');
}

// ==================== PUBLIC FUNCTIONS ====================

export interface ComposeResult {
  subject: string;
  body: string;
}

export async function composeEmail(
  prompt: string,
  context?: { replyTo?: string; tone?: string },
): Promise {
  const systemPrompt = `You are a professional email writing assistant. Generate a well-crafted email based on the user's instructions.
Return your response in this exact JSON format (no markdown, no code fences):
{"subject": "...", "body": "..."}

The body should be clean HTML suitable for an email client. Use  tags for paragraphs and  for line breaks.
${context?.tone ? `Tone: ${context.tone}` : 'Use a professional, friendly tone.'}`;

  const userPrompt = context?.replyTo
    ? `Write a reply to this email:\n---\n${context.replyTo}\n---\n\nInstructions: ${prompt}`
    : `Write an email: ${prompt}`;

  const raw = await callProvider(systemPrompt, userPrompt);

  try {
    const cleaned = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    const parsed = JSON.parse(cleaned);
    return { subject: parsed.subject || '', body: parsed.body || '' };
  } catch {
    // If JSON parse fails, treat whole response as body
    return { subject: '', body: raw.trim() };
  }
}

export interface RewriteResult {
  body: string;
}

export async function rewriteEmailBody(
  body: string,
  instructions: string,
): Promise {
  const systemPrompt = `You are a professional email editor. Rewrite the given email content following the user's instructions.
Return ONLY the improved email body as clean HTML (no JSON wrapper, no markdown fences).
Use  and  tags. Preserve the original structure and intent.`;

  const userPrompt = `Original email body:\n---\n${body}\n---\n\nInstructions: ${instructions}`;

  const result = await callProvider(systemPrompt, userPrompt);
  return { body: result.trim() };
}

export interface GrammarChange {
  original: string;
  suggestion: string;
  reason: string;
}

export interface GrammarResult {
  corrected: string;
  changes: GrammarChange[];
}

export async function checkGrammar(text: string): Promise {
  const systemPrompt = `You are a grammar and style checker for professional emails.
Analyze the text for grammar, spelling, punctuation, and clarity issues.
Return your response in this exact JSON format (no markdown, no code fences):
{
  "corrected": "the full corrected text as clean HTML",
  "changes": [
    {"original": "wrong phrase", "suggestion": "correct phrase", "reason": "brief explanation"}
  ]
}
If no changes are needed, return an empty changes array and the original text as corrected.`;

  const userPrompt = `Check this email text:\n---\n${text}`;

  const raw = await callProvider(systemPrompt, userPrompt);

  try {
    const cleaned = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    const parsed = JSON.parse(cleaned);
    return {
      corrected: parsed.corrected || text,
      changes: Array.isArray(parsed.changes) ? parsed.changes : [],
    };
  } catch {
    return { corrected: text, changes: [] };
  }
}