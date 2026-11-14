import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenAI } from '@google/genai';
import {
  getActiveModelInfo,
  MODEL_CATALOG,
  loadAiConfig,
  normalizeAiProvider,
  DEFAULT_MODEL_BY_PROVIDER,
} from './aiConfigStore.js';
import { redactSecrets } from './whatsappSend.js';
import {
  logTokenUsage,
  phoneFromJid,
  getTenantSecrets,
  incrementTenantTokens,
  QuotaExceededError,
} from './db.js';

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

  return {
    text: (completion.choices?.[0]?.message?.content || '').trim(),
    usage: extractOpenAiUsage(completion),
    modelId: model.id,
  };
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

  return {
    text,
    usage: {
      promptTokenCount: Number(response.usage?.input_tokens) || 0,
      candidatesTokenCount: Number(response.usage?.output_tokens) || 0,
      totalTokenCount:
        Number(response.usage?.input_tokens || 0) + Number(response.usage?.output_tokens || 0),
    },
    modelId: model.id,
  };
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
      if (text) {
        return {
          text,
          usage: extractGeminiUsage(response),
          modelId,
        };
      }
    } catch (err) {
      lastError = err;
      const msg = redactSecrets(err?.message || err);
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

function extractGeminiUsage(response) {
  const meta =
    response?.usageMetadata ||
    response?.usage_metadata ||
    response?.response?.usageMetadata ||
    {};
  const promptTokenCount = Number(meta.promptTokenCount || meta.prompt_token_count) || 0;
  const candidatesTokenCount =
    Number(meta.candidatesTokenCount || meta.candidates_token_count) || 0;
  const totalTokenCount =
    Number(meta.totalTokenCount || meta.total_token_count) ||
    promptTokenCount + candidatesTokenCount;
  return { promptTokenCount, candidatesTokenCount, totalTokenCount };
}

function extractOpenAiUsage(completion) {
  const usage = completion?.usage || {};
  const promptTokenCount = Number(usage.prompt_tokens) || 0;
  const candidatesTokenCount = Number(usage.completion_tokens) || 0;
  const totalTokenCount = Number(usage.total_tokens) || promptTokenCount + candidatesTokenCount;
  return { promptTokenCount, candidatesTokenCount, totalTokenCount };
}

async function persistUsage(result, model, options = {}) {
  const usage = result?.usage;
  if (!usage) return;
  try {
    await logTokenUsage({
      jid: options.jid || null,
      phone: options.phone || phoneFromJid(options.jid),
      provider: model.provider,
      model: result.modelId || model.id,
      promptTokenCount: usage.promptTokenCount,
      candidatesTokenCount: usage.candidatesTokenCount,
      totalTokenCount: usage.totalTokenCount,
      source: options.source || 'whatsapp',
      tenantId: options.tenantId || options.tenant?.id || null,
      billingSource: options.billingSource || null,
    });
    if (options.billingSource === 'platform' && (options.tenantId || options.tenant?.id)) {
      await incrementTenantTokens(
        options.tenantId || options.tenant.id,
        usage.totalTokenCount
      );
    }
    console.log(
      `📊 Tokens ${model.provider}/${result.modelId || model.id} ` +
        `prompt=${usage.promptTokenCount} reply=${usage.candidatesTokenCount} ` +
        `total=${usage.totalTokenCount} phone=${options.phone || phoneFromJid(options.jid) || 'n/a'}`
    );
  } catch (err) {
    console.warn('token_usage log skipped:', redactSecrets(err?.message || err));
  }
}

function byokKeyForProvider(secrets, provider) {
  if (secrets?.customApiKey) return secrets.customApiKey;
  if (provider === 'gemini') return secrets?.geminiApiKey || null;
  if (provider === 'groq') return secrets?.groqApiKey || null;
  return null;
}

function modelForTenant(tenantRow, master) {
  let provider = normalizeAiProvider(tenantRow?.ai_provider);
  let modelId = String(tenantRow?.ai_model || '').trim();

  if (provider === 'master') {
    provider = master.model?.provider || 'deepseek';
    if (!modelId) modelId = master.model?.id || DEFAULT_MODEL_BY_PROVIDER.deepseek;
  }

  return (
    MODEL_CATALOG.find((m) => m.id === modelId && m.provider === provider) ||
    MODEL_CATALOG.find((m) => m.id === modelId) ||
    MODEL_CATALOG.find((m) => m.id === DEFAULT_MODEL_BY_PROVIDER[provider]) ||
    MODEL_CATALOG.find((m) => m.provider === provider) ||
    master.model ||
    MODEL_CATALOG.find((m) => m.id === 'deepseek-chat')
  );
}

/**
 * Tenant ai_provider + custom_api_key (BYOK), else master env key for that provider.
 * Falls back to the admin-selected platform model when the chosen provider has no key.
 */
export function resolveTenantAi(tenantRow) {
  const master = getActiveModelInfo();
  const cfg = loadAiConfig();
  const secrets = getTenantSecrets(tenantRow);
  const model = modelForTenant(tenantRow, master);
  const providerCfg = cfg.providers[model?.provider] || {};
  const byok = byokKeyForProvider(secrets, model?.provider);

  if (byok) {
    return {
      model,
      apiKey: byok,
      providerConfig: { ...providerCfg, apiKey: byok },
      billingSource: 'byok',
    };
  }

  const used = Number(tenantRow?.tokens_used) || 0;
  const quota = Number(tenantRow?.token_quota) || 50000;
  if (tenantRow && used >= quota) {
    throw new QuotaExceededError(quota, used);
  }

  if (providerCfg.apiKey) {
    return {
      model,
      apiKey: providerCfg.apiKey,
      providerConfig,
      billingSource: 'platform',
    };
  }

  if (master.apiKey && master.model) {
    return { ...master, billingSource: 'platform' };
  }

  throw new Error(
    `No API key for "${model?.provider || 'ai'}". Add a tenant key on /dashboard or a master key in /admin/ai.`
  );
}

async function dispatchModel({ model, apiKey, providerConfig, systemInstruction, userQuery }) {
  switch (model.provider) {
    case 'openai':
      return callOpenAiCompatible({
        apiKey,
        baseUrl: providerConfig.baseUrl,
        model,
        systemInstruction,
        userQuery,
      });
    case 'groq':
      return callOpenAiCompatible({
        apiKey,
        baseUrl: providerConfig.baseUrl || 'https://api.groq.com/openai/v1',
        model,
        systemInstruction,
        userQuery,
      });
    case 'deepseek':
      return callOpenAiCompatible({
        apiKey,
        baseUrl: providerConfig.baseUrl || 'https://api.deepseek.com/v1',
        model,
        systemInstruction,
        userQuery,
      });
    case 'anthropic':
      return callAnthropic({ apiKey, model, systemInstruction, userQuery });
    case 'gemini':
      return callGemini({ apiKey, model, systemInstruction, userQuery });
    default:
      throw new Error(`Unsupported provider: ${model.provider}`);
  }
}

/**
 * Route a sales/chat prompt to the currently selected AI provider/model.
 * Designed so future multi-user sessions can pass per-tenant config later.
 */
export async function generateAiReply(userQuery, systemInstruction, options = {}) {
  const active = options.tenant
    ? resolveTenantAi(options.tenant)
    : options.activeInfo || getActiveModelInfo();
  const { model, apiKey, providerConfig } = active;
  options.billingSource = active.billingSource || options.billingSource || null;
  options.tenantId = options.tenantId || options.tenant?.id || null;

  if (!model) {
    throw new Error('No active AI model configured');
  }

  console.log(
    `🧠 AI route provider=${model.provider} model=${model.id} billing=${options.billingSource || 'n/a'} key=${apiKey ? 'set' : 'missing'}`
  );

  let result = { text: '', usage: null, modelId: model.id };

  try {
    result = await dispatchModel({
      model,
      apiKey,
      providerConfig,
      systemInstruction,
      userQuery,
    });
  } catch (err) {
    if (err instanceof QuotaExceededError) throw err;
    const master = getActiveModelInfo();
    const canFallback =
      active.billingSource !== 'byok' &&
      master.apiKey &&
      master.model &&
      master.model.id !== model.id;
    if (!canFallback) {
      throw new Error(redactSecrets(err?.message || err));
    }
    console.warn(
      `⚠️ ${model.provider}/${model.id} failed, falling back to master ${master.model.provider}/${master.model.id}`
    );
    result = await dispatchModel({
      model: master.model,
      apiKey: master.apiKey,
      providerConfig: master.providerConfig,
      systemInstruction,
      userQuery,
    });
    await persistUsage(result, master.model, options);
    return (
      result.text ||
      'Sorry, I could not generate a response right now. Please try again in a moment.'
    );
  }

  await persistUsage(result, model, options);

  return (
    result.text ||
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
