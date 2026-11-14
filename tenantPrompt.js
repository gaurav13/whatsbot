import { buildDemoSystemInstruction } from './demoProfiles.js';

const DESC_LIMIT = 8000;
const KNOWLEDGE_LIMIT = 24000;

export function hasTenantKnowledge(tenant) {
  return Boolean(
    String(tenant?.business_description || '').trim() ||
      String(tenant?.knowledge_text || '').trim()
  );
}

export function tenantWelcomeMessage(tenant) {
  const name = String(tenant?.business_name || 'us').trim() || 'us';
  const desc = String(tenant?.business_description || '').trim().slice(0, 500);
  if (desc) {
    return `Welcome to *${name}*!\n\n${desc}\n\nHow can I help you today?`;
  }
  return `Welcome to *${name}*! How can I help you today?`;
}

function tenantProfileId(tenant) {
  return tenant?.business_type === 'real_estate' ? 'vilasa' : 'gsai';
}

/**
 * Prefer the tenant's self-serve description + FAQ/file text.
 * Platform / empty profiles keep the existing Vilasa / GS AI templates.
 */
export async function buildTenantSystemInstruction(tenant) {
  if (!hasTenantKnowledge(tenant)) {
    return buildDemoSystemInstruction(tenantProfileId(tenant));
  }

  const name = String(tenant.business_name || 'this business').trim();
  const description =
    String(tenant.business_description || '').trim().slice(0, DESC_LIMIT) ||
    '(none provided)';
  const knowledge =
    String(tenant.knowledge_text || '').trim().slice(0, KNOWLEDGE_LIMIT) ||
    '(none provided)';

  const systemInstruction = [
    `You are the WhatsApp assistant for ${name}.`,
    'Answer ONLY using the business description and knowledge below.',
    'Stay on-brand for this client. Do not use any other company template, prices, or facts.',
    'If the answer is not in the knowledge, say you do not have that information and offer to connect them with the business.',
    'Be concise, professional, and WhatsApp-friendly. Do not invent prices, policies, or contact details.',
    '',
    `Business name: ${name}`,
    `Profile type: ${tenant.business_type || 'custom'}`,
    '',
    '===== BUSINESS DESCRIPTION =====',
    description,
    '===== END BUSINESS DESCRIPTION =====',
    '',
    '===== BUSINESS KNOWLEDGE / FAQ =====',
    knowledge,
    '===== END BUSINESS KNOWLEDGE =====',
  ].join('\n');

  return {
    profile: {
      id: 'tenant',
      label: name,
      type: tenant.business_type || 'custom',
    },
    systemInstruction,
    knowledgeSource: tenant.knowledge_file_path || 'tenant-profile',
  };
}
