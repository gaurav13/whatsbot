import 'dotenv/config';
import { startKnowledgeServer } from './knowledgeServer.js';
import { setLogoutHandler } from './sessionControl.js';
import { peekActiveAi } from './aiRouter.js';
import { loadAiConfig } from './aiConfigStore.js';
import { initDatabase, ensurePlatformTenant } from './db.js';
import { indexVilasaKnowledge } from './vilasaDemo.js';
import {
  startTenantSession,
  stopTenantSession,
  sendTenantDemo,
  getSock,
} from './sessionManager.js';
import { redactSecrets } from './whatsappSend.js';
import { startBillingScheduler } from './billingScheduler.js';
import { setDemoWhatsAppTrigger } from './demoProfiles.js';

const bootAiConfig = loadAiConfig();
const bootAi = peekActiveAi();
console.log(
  `⚙️  Active AI: ${bootAi.activeProvider || 'n/a'} / ${bootAi.activeModel || 'n/a'}`
);
if (!bootAiConfig.providers?.[bootAi.activeProvider || '']?.apiKey) {
  console.warn(
    '⚠️  Active AI provider has no API key yet. Add one at /admin or a tenant Gemini key.'
  );
}

let platformTenantId = null;

setLogoutHandler(async (tenantId) => {
  const id = tenantId || platformTenantId;
  if (!id) throw new Error('No tenant session to reset');
  return stopTenantSession(id, { logout: true, restart: true, syncGlobalQr: true });
});

setDemoWhatsAppTrigger(async ({ profileId, jid }) => {
  const id = platformTenantId;
  if (!id || !getSock(id)) {
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
  return /Connection Closed|Timed Out|Precondition Required|Stream Errored|conflict|Connection Terminated|not-authorized|bad-session|restart required/i.test(
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
  startTenantSession(platform.id, { syncGlobalQr: true }).catch((err) =>
    console.error('Platform WhatsApp session failed:', err?.message || err)
  );
} else {
  console.warn('⚠️ No platform tenant — start a client session from /dashboard');
}
