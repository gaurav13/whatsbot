import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const AI_CONFIG_PATH = path.join(__dirname, 'ai-config.json');

/** Catalog of selectable models for the admin dashboard */
export const MODEL_CATALOG = [
  {
    id: 'gpt-4o',
    provider: 'openai',
    label: 'OpenAI GPT-4o',
    tier: 'premium',
  },
  {
    id: 'gpt-3.5-turbo',
    provider: 'openai',
    label: 'OpenAI GPT-3.5 Turbo',
    tier: 'premium',
  },
  {
    id: 'claude-3-5-sonnet-latest',
    provider: 'anthropic',
    label: 'Anthropic Claude 3.5 Sonnet',
    tier: 'premium',
  },
  {
    id: 'gemini-2.5-flash-lite',
    provider: 'gemini',
    label: 'Google Gemini 2.5 Flash Lite',
    tier: 'budget',
  },
  {
    id: 'gemini-3-flash-preview',
    provider: 'gemini',
    label: 'Google Gemini 3 Flash Preview',
    tier: 'budget',
  },
  {
    id: 'gemini-3.8-flash',
    provider: 'gemini',
    label: 'Google Gemini 3.8 Flash',
    tier: 'budget',
  },
  {
    id: 'llama-3.1-8b-instant',
    provider: 'groq',
    label: 'Groq Llama 3.1 8B Instant',
    tier: 'budget',
  },
  {
    id: 'llama-3.3-70b-versatile',
    provider: 'groq',
    label: 'Groq Llama 3.3 70B',
    tier: 'budget',
  },
  {
    id: 'deepseek-chat',
    provider: 'deepseek',
    label: 'DeepSeek Chat',
    tier: 'budget',
  },
  {
    id: 'deepseek-reasoner',
    provider: 'deepseek',
    label: 'DeepSeek Reasoner',
    tier: 'budget',
  },
];

export const TENANT_AI_PROVIDERS = [
  { id: 'master', label: 'Platform default (admin model)' },
  { id: 'deepseek', label: 'DeepSeek' },
  { id: 'groq', label: 'Groq (Llama 3)' },
  { id: 'gemini', label: 'Google Gemini' },
  { id: 'anthropic', label: 'Anthropic Claude' },
];

export const DEFAULT_MODEL_BY_PROVIDER = {
  deepseek: 'deepseek-chat',
  groq: 'llama-3.3-70b-versatile',
  gemini: 'gemini-2.5-flash-lite',
  anthropic: 'claude-3-5-sonnet-latest',
};

export function normalizeAiProvider(value) {
  const v = String(value || '').toLowerCase().trim();
  if (v === 'master' || v === 'platform' || v === 'default') return 'master';
  if (['deepseek', 'groq', 'gemini', 'anthropic'].includes(v)) return v;
  return 'deepseek';
}

export function modelsForProvider(provider) {
  const id = normalizeAiProvider(provider);
  if (id === 'master') return MODEL_CATALOG.slice();
  return MODEL_CATALOG.filter((m) => m.provider === id);
}

function defaultConfig() {
  return {
    activeModel: process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite',
    providers: {
      openai: {
        apiKey: process.env.OPENAI_API_KEY || '',
        baseUrl: 'https://api.openai.com/v1',
      },
      anthropic: {
        apiKey: process.env.ANTHROPIC_API_KEY || '',
      },
      gemini: {
        apiKey: process.env.GEMINI_API_KEY || '',
      },
      groq: {
        apiKey: process.env.GROQ_API_KEY || '',
        baseUrl: 'https://api.groq.com/openai/v1',
      },
      deepseek: {
        apiKey: process.env.DEEPSEEK_API_KEY || '',
        baseUrl: 'https://api.deepseek.com/v1',
      },
    },
    updatedAt: null,
  };
}

function ensureConfigFile() {
  if (!fs.existsSync(AI_CONFIG_PATH)) {
    const cfg = defaultConfig();
    cfg.updatedAt = new Date().toISOString();
    fs.writeFileSync(AI_CONFIG_PATH, JSON.stringify(cfg, null, 2), 'utf8');
  }
}

export function loadAiConfig() {
  ensureConfigFile();
  try {
    const raw = JSON.parse(fs.readFileSync(AI_CONFIG_PATH, 'utf8'));
    const base = defaultConfig();
    const providers = {
      ...base.providers,
      ...(raw.providers || {}),
    };

    // Fill blank stored keys from environment (useful after first boot / .env updates)
    for (const [name, value] of Object.entries(base.providers)) {
      if (!providers[name]) providers[name] = { ...value };
      if (!providers[name].apiKey && value.apiKey) {
        providers[name] = { ...providers[name], apiKey: value.apiKey };
      }
      if (!providers[name].baseUrl && value.baseUrl) {
        providers[name] = { ...providers[name], baseUrl: value.baseUrl };
      }
    }

    return {
      ...base,
      ...raw,
      providers,
    };
  } catch (err) {
    console.error('Failed to read ai-config.json, using defaults:', err.message);
    return defaultConfig();
  }
}

export function saveAiConfig(nextConfig) {
  const current = loadAiConfig();
  const merged = {
    ...current,
    ...nextConfig,
    providers: {
      ...current.providers,
      ...(nextConfig.providers || {}),
    },
    updatedAt: new Date().toISOString(),
  };

  // Keep unknown provider keys if already present
  for (const [name, value] of Object.entries(nextConfig.providers || {})) {
    merged.providers[name] = {
      ...(current.providers[name] || {}),
      ...value,
    };
  }

  fs.writeFileSync(AI_CONFIG_PATH, JSON.stringify(merged, null, 2), 'utf8');
  return merged;
}

export function updateProviderKey(provider, apiKey) {
  const cfg = loadAiConfig();
  if (!cfg.providers[provider]) {
    throw new Error(`Unknown provider: ${provider}`);
  }
  cfg.providers[provider].apiKey = String(apiKey || '').trim();
  return saveAiConfig(cfg);
}

export function setActiveModel(modelId) {
  const model = MODEL_CATALOG.find((m) => m.id === modelId);
  if (!model) {
    throw new Error(`Unknown model: ${modelId}`);
  }
  const cfg = loadAiConfig();
  cfg.activeModel = model.id;
  return saveAiConfig(cfg);
}

export function getActiveModelInfo() {
  const cfg = loadAiConfig();
  const model =
    MODEL_CATALOG.find((m) => m.id === cfg.activeModel) ||
    MODEL_CATALOG.find((m) => m.id === 'gemini-2.5-flash-lite');
  const providerCfg = cfg.providers[model.provider] || {};
  return {
    model,
    apiKey: providerCfg.apiKey || '',
    providerConfig: providerCfg,
    config: cfg,
  };
}

function maskKey(key) {
  const value = String(key || '');
  if (!value) return '';
  if (value.length <= 8) return '********';
  return `${value.slice(0, 4)}…${value.slice(-4)}`;
}

/** Safe payload for admin UI (keys masked) */
export function getPublicAiSettings() {
  const cfg = loadAiConfig();
  const providers = {};
  for (const [name, value] of Object.entries(cfg.providers || {})) {
    providers[name] = {
      hasKey: Boolean(value.apiKey),
      apiKeyMasked: maskKey(value.apiKey),
      baseUrl: value.baseUrl || null,
    };
  }

  const active =
    MODEL_CATALOG.find((m) => m.id === cfg.activeModel) || MODEL_CATALOG[0];

  return {
    activeModel: active?.id || null,
    activeProvider: active?.provider || null,
    catalog: MODEL_CATALOG,
    providers,
    updatedAt: cfg.updatedAt,
  };
}
