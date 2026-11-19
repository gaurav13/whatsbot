import 'dotenv/config';
import { startKnowledgeServer } from './knowledgeServer.js';
import { setLogoutHandler } from './sessionControl.js';
import { peekActiveAi } from './aiRouter.js';
import { loadAiConfig } from './aiConfigStore.js';
import { initDatabase, ensurePlatformTenant, getTenantById } from './db.js';
import { indexVilasaKnowledge } from './vilasaDemo.js';
import {
  stopTenantSession,
  sendTenantDemo,
  getSock,
  restoreAuthenticatedSessions,
  WA_INSTANCE_ID,
} from './sessionManager.js';
import {
  isEvolutionEnabled,
  logoutEvolutionSession,
  getEvolutionSock,
  isEvolutionConnected,
} from './services/evolutionGateway.js';
import { pushTenantWelcome } from './whatsappHandler.js';
import { redactSecrets } from './whatsappSend.js';
import { startBillingScheduler } from './billingScheduler.js';
import { setDemoWhatsAppTrigger } from './demoProfiles.js';

const bootAiConfig = loadAiConfig();
const bootAi = peekActiveAi();
console.log(
  `⚙️  Active AI: ${bootAi.activeProvider || 'n/a'} / ${bootAi.activeModel || 'n/a'}`
);
console.log(`🪪 WhatsApp instance: ${WA_INSTANCE_ID}`);
if (!bootAiConfig.providers?.[bootAi.activeProvider || '']?.apiKey) {
  console.warn(
    '⚠️  Active AI provider has no API key yet. Add one at /admin or a tenant Gemini key.'
  );
}

let platformTenantId = null;

setLogoutHandler(async (tenantId) => {
  const id = tenantId || platformTenantId;
  if (!id) throw new Error('No tenant session to reset');
  if (isEvolutionEnabled()) {
    return logoutEvolutionSession(id, { restart: true, syncGlobalQr: true });
  }
  return stopTenantSession(id, { logout: true, restart: true, syncGlobalQr: true });
});

setDemoWhatsAppTrigger(async ({ profileId, jid }) => {
  const id = platformTenantId;
  if (!id) return { ok: false, error: 'WhatsApp is not connected yet' };
  if (isEvolutionEnabled()) {
    if (!isEvolutionConnected(id)) {
      return { ok: false, error: 'WhatsApp is not connected yet' };
    }
    const tenant = await getTenantById(id);
    const result = await pushTenantWelcome(getEvolutionSock(id), jid, tenant);
    return { ok: true, ...result, jid };
  }
  if (!getSock(id)) {
    return { ok: false, error: 'WhatsApp is not connected yet' };
  }
  return sendTenantDemo(id, jid);
});

startKnowledgeServer();

indexVilasaKnowledge()
  .then(() => console.log('🏡 Vilasa brochure indexed for demo'))
  .catch((err) => console.warn('Vilasa preload skipped:', err?.message || err));

function isSocketNoise(err) {
  const msg = redactSecrets(err);
  return /Connection Closed|Timed Out|Precondition Required|Stream Errored|conflict|Connection Terminated|not-authorized|bad-session|restart required|Bad MAC|Failed to decrypt/i.test(
    msg
  );
}

process.on('uncaughtException', (err) => {
  const msg = redactSecrets(err);
  if (isSocketNoise(err)) {
    console.warn('⚠️ Socket exception (auto-reconnect):', msg.split('\n')[0]);
    return;
  }
  console.error('uncaughtException:', msg);
});

process.on('unhandledRejection', (reason) => {
  const msg = redactSecrets(reason);
  if (isSocketNoise(reason)) {
    console.warn('⚠️ Socket rejection (auto-reconnect):', msg.split('\n')[0]);
    return;
  }
  console.error('unhandledRejection:', msg);
});

const platform = await initDatabase()
  .then(() => ensurePlatformTenant())
  .catch((err) => {
    console.warn('Platform tenant init skipped:', err?.message || err);
    return null;
  });

startBillingScheduler();

if (platform?.id) {
  platformTenantId = platform.id;
} else {
  console.warn('⚠️ No platform tenant — start a client session from /dashboard');
}

if (isEvolutionEnabled()) {
  console.log('📡 WHATSAPP_PROVIDER=evolution — native Baileys restore is skipped');
} else {
  restoreAuthenticatedSessions().catch((err) =>
    console.warn('Session restore skipped:', err?.message || err)
  );
}
