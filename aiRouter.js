import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenAI } from '@google/genai';
import { getActiveModelInfo, MODEL_CATALOG, loadAiConfig } from './aiConfigStore.js';

function requireKey(provider, apiKey) {
  if (!apiKey?.trim()) {
    throw new Error(
      `Missing API key for provider "${provider}". Add it in http://localhost:3000/admin`
    );
  }
}

async function callOpenAiCompatible({
  apiKey,
  baseUrl,
  model,
  systemInstruction,
  userQuery,
}) {
  requireKey(model.provider, apiKey);
  const client = new OpenAI({
    apiKey,
    baseURL: baseUrl || undefined,
  });

  const completion = await client.chat.completions.create({
    model: model.id,
    messages: [
      { role: 'system', content: systemInstruction },
      { role: 'user', content: userQuery },
    ],
    temperature: 0.4,
  });

  return (completion.choices?.[0]?.message?.content || '').trim();
}

async function callAnthropic({ apiKey, model, systemInstruction, userQuery }) {
  requireKey('anthropic', apiKey);
  const client = new Anthropic({ apiKey });
  const response = await client.messages.create({
    model: model.id,
    max_tokens: 1024,
    system: systemInstruction,
    messages: [{ role: 'user', content: userQuery }],
  });

  const text = (response.content || [])
    .filter((part) => part.type === 'text')
    .map((part) => part.text)
    .join('\n')
    .trim();

  return text;
}

async function callGemini({ apiKey, model, systemInstruction, userQuery }) {
  requireKey('gemini', apiKey);
  const ai = new GoogleGenAI({ apiKey });

  const candidates = [
    model.id,
    'gemini-2.5-flash-lite',
    'gemini-3-flash-preview',
    'gemini-3.8-flash',
  ].filter((id, i, arr) => arr.indexOf(id) === i);

  let lastError;
  for (const modelId of candidates) {
    try {
      const response = await ai.models.generateContent({
        model: modelId,
        contents: userQuery,
        config: {
          systemInstruction,
          thinkingConfig: { thinkingBudget: 0 },
        },
      });
      const text = (response.text || '').trim();
      if (text) return text;
    } catch (err) {
      lastError = err;
      const msg = String(err?.message || err);
      const hardFail =
        msg.includes('API key') ||
        msg.includes('PERMISSION') ||
        msg.includes('401') ||
        msg.includes('403');
      if (hardFail) break;
    }
  }

  throw lastError || new Error('Gemini returned an empty response');
}

/**
 * Route a sales/chat prompt to the currently selected AI provider/model.
 * Designed so future multi-user sessions can pass per-tenant config later.
 */
export async function generateAiReply(userQuery, systemInstruction, options = {}) {
  const active = options.activeInfo || getActiveModelInfo();
  const { model, apiKey, providerConfig } = active;

  if (!model) {
    throw new Error('No active AI model configured');
  }

  console.log(`🧠 AI route provider=${model.provider} model=${model.id}`);

  let text = '';

  switch (model.provider) {
    case 'openai':
      text = await callOpenAiCompatible({
        apiKey,
        baseUrl: providerConfig.baseUrl,
        model,
        systemInstruction,
        userQuery,
      });
      break;
    case 'groq':
      text = await callOpenAiCompatible({
        apiKey,
        baseUrl: providerConfig.baseUrl || 'https://api.groq.com/openai/v1',
        model,
        systemInstruction,
        userQuery,
      });
      break;
    case 'deepseek':
      text = await callOpenAiCompatible({
        apiKey,
        baseUrl: providerConfig.baseUrl || 'https://api.deepseek.com',
        model,
        systemInstruction,
        userQuery,
      });
      break;
    case 'anthropic':
      text = await callAnthropic({
        apiKey,
        model,
        systemInstruction,
        userQuery,
      });
      break;
    case 'gemini':
      text = await callGemini({
        apiKey,
        model,
        systemInstruction,
        userQuery,
      });
      break;
    default:
      throw new Error(`Unsupported provider: ${model.provider}`);
  }

  return (
    text ||
    'Sorry, I could not generate a response right now. Please try again in a moment.'
  );
}

export function listSupportedModels() {
  return MODEL_CATALOG;
}

export function peekActiveAi() {
  const cfg = loadAiConfig();
  const model = MODEL_CATALOG.find((m) => m.id === cfg.activeModel);
  return {
    activeModel: cfg.activeModel,
    activeProvider: model?.provider || null,
  };
}
