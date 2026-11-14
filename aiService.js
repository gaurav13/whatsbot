/**
 * Multi-model AI dispatcher used by WhatsApp and dashboards.
 * Providers: DeepSeek, Groq (Llama 3), Gemini, Anthropic (+ OpenAI-compatible).
 */
export {
  generateAiReply,
  resolveTenantAi,
  listSupportedModels,
  peekActiveAi,
} from './aiRouter.js';

export {
  MODEL_CATALOG,
  TENANT_AI_PROVIDERS,
  DEFAULT_MODEL_BY_PROVIDER,
  normalizeAiProvider,
  modelsForProvider,
} from './aiConfigStore.js';
