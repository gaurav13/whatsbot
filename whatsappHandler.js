import {
  listKnowledgeFiles,
  getActiveFileName,
  setActiveFile,
  loadActiveKnowledgeBase,
} from './knowledgeManager.js';
import { generateAiReply, peekActiveAi } from './aiRouter.js';
import {
  getTokenUsageSummary,
  QuotaExceededError,
  MessageQuotaExceededError,
  isMessageQuotaExceeded,
  recordTenantMessage,
  isTenantPlanActive,
} from './db.js';
import {
  hydrateUserSession,
  markTracked,
  getLeadIntake,
  isAutomationActive,
  isPaused,
  pauseAutomation,
  resumeAutomation,
  HUMAN_HANDOVER_MS,
  withUserLock,
  phoneFromJid,
} from './userSessions.js';
import {
  loadServicesCatalog,
  getServiceByRowId,
  findServiceByText,
  formatServiceDetails,
  isServicesMenuIntent,
} from './servicesCatalog.js';
import {
  sendInteractiveServicesMenu,
  extractInteractiveSelection,
} from './whatsappInteractive.js';
import {
  handleVilasaInteraction,
  startVilasaDemo,
  isVilasaIntent,
} from './vilasaDemo.js';
import {
  buildTenantSystemInstruction,
  hasTenantKnowledge,
  tenantWelcomeMessage,
} from './tenantPrompt.js';
import {
  isQuickRepliesEnabled,
  formatWelcomeWithQuickReplies,
  formatQuickReplyMenu,
  formatQuickReplyAnswer,
  matchQuickReply,
} from './quickReplies.js';
import {
  sendWithTyping,
  allowInboundMessage,
  redactSecrets,
  wrapSocketSend,
  isBotOriginated,
} from './whatsappSend.js';
import { maybeCaptureContactFromMessage } from './leadCapture.js';
import { getActiveDemoProfile, getPlatformWhatsAppDemoId } from './demoProfiles.js';

const PORTFOLIO_TRIGGER =
  'hi gaurav, i visited your portfolio and want to discuss a project';
const PORTFOLIO_KEYWORDS = [
  'visited your portfolio',
  'visit your portfolio',
  'from your portfolio',
  'saw your portfolio',
  'checked your portfolio',
  'visited gs ai solutions',
  'from gsaisolutions',
  'gsaisolutions.online',
];

const WELCOME_MESSAGE =
  'Welcome to GS AI Solutions! How can I help you today? Tell me about your project — SEO, ads, AI automation, web development, Web3, or cloud infrastructure.';

function tenantProfileId(tenant) {
  if (tenant?.is_platform) return getActiveDemoProfile().id;
  return tenant?.business_type === 'real_estate' ? 'vilasa' : 'gsai';
}

function getMessageText(msg) {
  return (
    msg.message?.conversation ||
    msg.message?.extendedTextMessage?.text ||
    msg.message?.ephemeralMessage?.message?.conversation ||
    msg.message?.ephemeralMessage?.message?.extendedTextMessage?.text ||
    msg.message?.documentWithCaptionMessage?.message?.documentMessage?.caption ||
    msg.message?.documentMessage?.caption ||
    msg.message?.listResponseMessage?.title ||
    msg.message?.listResponseMessage?.singleSelectReply?.selectedRowId ||
    msg.message?.buttonsResponseMessage?.selectedDisplayText ||
    msg.message?.templateButtonReplyMessage?.selectedDisplayText ||
    ''
  );
}

export { sendWithTyping } from './whatsappSend.js';

const expiredNoticeAt = new Map();

async function notifySubscriptionExpired(sock, jid) {
  const now = Date.now();
  const prev = expiredNoticeAt.get(jid) || 0;
  if (now - prev < 12 * 60 * 60 * 1000) return;
  expiredNoticeAt.set(jid, now);
  try {
    await sendWithTyping(
      sock,
      jid,
      'This WhatsApp assistant is paused because the subscription has expired. Please contact support to renew.'
    );
  } catch {
    // ignore
  }
}

async function getAiReply(userQuery, jid, tenant) {
  const built = await buildTenantSystemInstruction(tenant);
  const active = peekActiveAi();
  console.log(
    `🤖 AI tenant=${tenant?.id || 'n/a'} type=${tenant?.business_type || 'n/a'} ` +
      `kb=${built.knowledgeSource} ${active.activeProvider}/${active.activeModel} user=${phoneFromJid(jid)}`
  );
  return generateAiReply(userQuery, built.systemInstruction, {
    jid,
    phone: phoneFromJid(jid),
    source: 'whatsapp',
    tenant,
    tenantId: tenant?.id || null,
  });
}

function isTokenUsageIntent(text) {
  return /^(tokens?|usage|!tokens?|!usage)$/i.test(String(text || '').trim());
}

async function formatTokenUsageReply(jid, tenant) {
  const summary = await getTokenUsageSummary({
    jid,
    phone: phoneFromJid(jid),
    tenantId: tenant?.id || null,
  });
  if (!summary) {
    return '📊 Token usage is unavailable (database is not connected).';
  }
  const last = summary.last_used_at
    ? new Date(summary.last_used_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })
    : 'n/a';
  const quotaLine =
    tenant && !getTenantHasOwnKey(tenant)
      ? `\n📦 Platform quota: ${tenant.tokens_used || 0} / ${tenant.token_quota || 50000}`
      : '';
  return [
    '📊 *Gemini / AI token usage*',
    `📞 Phone: ${summary.phone || phoneFromJid(jid) || 'n/a'}`,
    `🔢 API calls: ${summary.calls || 0}`,
    `✏️ Prompt tokens: ${summary.prompt_tokens || 0}`,
    `💬 Reply tokens: ${summary.reply_tokens || 0}`,
    `Σ *Total tokens: ${summary.total_tokens || 0}*`,
    `🕒 Last used: ${last}${quotaLine}`,
  ].join('\n');
}

function getTenantHasOwnKey(tenant) {
  return Boolean(tenant?.custom_api_key || tenant?.gemini_api_key || tenant?.groq_api_key);
}

function parseAdminCommand(text) {
  const cmd = text.toLowerCase().trim();
  if (cmd === '!stop' || cmd === 'stop') return { type: 'stop' };
  if (cmd === '!start' || cmd === 'start') return { type: 'start' };
  if (isTokenUsageIntent(cmd)) return { type: 'tokens' };
  if (cmd === '!kb' || cmd === '!kb status') return { type: 'kb_status' };
  if (cmd === '!kb list') return { type: 'kb_list' };
  const useMatch = text.trim().match(/^!kb\s+use\s+(.+)$/i);
  if (useMatch) return { type: 'kb_use', filename: useMatch[1].trim() };
  return null;
}

async function handleServicesInteraction(sock, jid, msg, messageText) {
  const catalog = loadServicesCatalog();
  const selectedId = extractInteractiveSelection(msg);
  if (selectedId) {
    const service = getServiceByRowId(selectedId, catalog);
    await sendWithTyping(sock, jid, formatServiceDetails(service));
    return true;
  }
  if (isServicesMenuIntent(messageText)) {
    await sendInteractiveServicesMenu(sock, jid);
    return true;
  }
  const matched = findServiceByText(messageText, catalog);
  if (matched && /^(?:[1-5]\b|[a-z].{2,})$/i.test(messageText.trim())) {
    const shortQuery = messageText.trim().split(/\s+/).length <= 6;
    if (shortQuery) {
      await sendWithTyping(sock, jid, formatServiceDetails(matched));
      return true;
    }
  }
  return false;
}

function isPortfolioLeadMessage(text) {
  const normalized = text.toLowerCase().replace(/\s+/g, ' ').trim();
  if (normalized.includes(PORTFOLIO_TRIGGER)) return true;
  return PORTFOLIO_KEYWORDS.some((keyword) => normalized.includes(keyword));
}

function isStopKeyword(text) {
  return /\b(stop|pause)\b/i.test(String(text || ''));
}

function isStartKeyword(text) {
  return /^(start|resume|!start|!resume)$/i.test(String(text || '').trim());
}

export async function handleMessagesUpsert(sock, { messages, type } = {}, { tenant, getTenant } = {}) {
    wrapSocketSend(sock);
    if (type && type !== 'notify' && type !== 'append') return;
    const msg = messages?.[0];
    if (!msg?.message) return;
    const chatJid = msg.key.remoteJid;
    if (!chatJid || chatJid === 'status@broadcast' || chatJid.endsWith('@g.us')) return;

    const inboundText = getMessageText(msg);
    const startResume = isStartKeyword(inboundText);
    const stopPause = isStopKeyword(inboundText);

    if (
      !msg.key.fromMe &&
      !startResume &&
      !stopPause &&
      !allowInboundMessage(chatJid)
    ) {
      console.log(`⏳ Rate-limited ${phoneFromJid(chatJid)}`);
      return;
    }

    const liveTenant = (typeof getTenant === 'function' ? await getTenant() : tenant) || tenant;
    if (!isTenantPlanActive(liveTenant)) {
      if (!msg.key.fromMe) {
        await notifySubscriptionExpired(sock, chatJid);
      }
      return;
    }

    await withUserLock(chatJid, async () => {
      await hydrateUserSession(chatJid);

      if (msg.key.fromMe) {
        if (isBotOriginated(msg, chatJid)) return;

        const messageText = inboundText;
        if (isStartKeyword(messageText)) {
          resumeAutomation(chatJid);
          return;
        }
        const command = parseAdminCommand(messageText);
        if (command?.type === 'tokens') {
          await sock.sendMessage(chatJid, {
            text: await formatTokenUsageReply(chatJid, liveTenant),
          });
          return;
        }
        if (command?.type === 'kb_status') {
          const kb = await loadActiveKnowledgeBase();
          await sock.sendMessage(chatJid, {
            text: `📚 Active: ${getActiveFileName() || '(none)'} · ${kb.text?.length || 0} chars`,
          });
          return;
        }
        if (command?.type === 'kb_list') {
          const files = listKnowledgeFiles();
          await sock.sendMessage(chatJid, {
            text: files.map((f) => `• ${f}`).join('\n') || '(no files)',
          });
          return;
        }
        if (command?.type === 'kb_use') {
          try {
            await sock.sendMessage(chatJid, {
              text: `✅ Active knowledge file: ${setActiveFile(command.filename)}`,
            });
          } catch (err) {
            await sock.sendMessage(chatJid, { text: `❌ ${err.message}` });
          }
          return;
        }

        // Owner typed from the linked phone — auto-pause this chat for 30 minutes
        pauseAutomation(chatJid, {
          until: new Date(Date.now() + HUMAN_HANDOVER_MS).toISOString(),
          reason: 'owner-handover',
        });
        return;
      }

      const senderJid = chatJid;
      const selectedId = extractInteractiveSelection(msg);
      const messageText = inboundText;
      if (!messageText.trim() && !selectedId) return;

      if (isStartKeyword(messageText)) {
        resumeAutomation(senderJid);
        await sendWithTyping(sock, senderJid, 'Automation resumed. How can I help you today?');
        return;
      }

      if (isStopKeyword(messageText)) {
        pauseAutomation(senderJid, { until: null, reason: 'user-stop' });
        await sendWithTyping(
          sock,
          senderJid,
          'Automation paused. You are now connected to manual chat.'
        );
        return;
      }

      await maybeCaptureContactFromMessage({
        tenant: liveTenant,
        sock,
        jid: senderJid,
        text: messageText,
        skip: Boolean(getLeadIntake(senderJid)),
      });

      if (isTokenUsageIntent(messageText)) {
        await sendWithTyping(
          sock,
          senderJid,
          await formatTokenUsageReply(senderJid, liveTenant)
        );
        return;
      }

      if (!isAutomationActive(senderJid) || isPaused(senderJid)) {
        console.log(`⏸️ Skipped (paused / manual chat): ${senderJid}`);
        return;
      }

      if (isMessageQuotaExceeded(liveTenant)) {
        await sendWithTyping(
          sock,
          senderJid,
          'Your monthly message quota has been exhausted. Please contact support to upgrade your plan.'
        );
        return;
      }

      const user = await hydrateUserSession(senderJid);
      const isTracked = Boolean(user.tracked);
      const isLead = isPortfolioLeadMessage(messageText);
      const vilasaIntent = isVilasaIntent(messageText);
      const servicesIntent = isServicesMenuIntent(messageText);
      const demoStart = /^(demo|start|hi|hello|menu)$/i.test(messageText.trim());
      const platformDemoId = getPlatformWhatsAppDemoId(liveTenant);
      const vilasaMode =
        platformDemoId === 'vilasa' ||
        (!platformDemoId && liveTenant?.business_type === 'real_estate');
      const platformFilter = Boolean(liveTenant?.is_platform);
      const customKb = hasTenantKnowledge(liveTenant) && !platformDemoId;
      const qrEnabled = isQuickRepliesEnabled(liveTenant);

      if (
        platformFilter &&
        !isTracked &&
        !isLead &&
        !selectedId &&
        !vilasaIntent &&
        !servicesIntent &&
        !demoStart
      ) {
        console.log(`🔇 Ignored (no trigger): ${senderJid}`);
        return;
      }

      try {
        if (!isTracked) {
          markTracked(senderJid);
          if (qrEnabled) {
            await sendWithTyping(
              sock,
              senderJid,
              formatWelcomeWithQuickReplies(tenantWelcomeMessage(liveTenant), liveTenant)
            );
            await recordHandledTurn(liveTenant, senderJid);
            return;
          }
          if (customKb) {
            await sendWithTyping(sock, senderJid, tenantWelcomeMessage(liveTenant));
            await recordHandledTurn(liveTenant, senderJid);
            return;
          }
          if (vilasaMode || vilasaIntent) {
            await startVilasaDemo(sock, senderJid, { sendWithTyping });
            await recordHandledTurn(liveTenant, senderJid);
            return;
          }
          await sendWithTyping(
            sock,
            senderJid,
            `${WELCOME_MESSAGE}\n\nPlease choose a service, or type *services* for the pricing menu.`
          );
          await sendInteractiveServicesMenu(sock, senderJid);
          await recordHandledTurn(liveTenant, senderJid);
          return;
        }

        if (vilasaMode && (demoStart || vilasaIntent)) {
          await startVilasaDemo(sock, senderJid, { sendWithTyping });
          await recordHandledTurn(liveTenant, senderJid);
          return;
        }

        if (qrEnabled) {
          const hit = matchQuickReply(messageText, liveTenant.quick_replies, { selectedId });
          if (hit?.type === 'menu') {
            await sendWithTyping(sock, senderJid, formatQuickReplyMenu(liveTenant));
            await recordHandledTurn(liveTenant, senderJid);
            return;
          }
          if (hit?.type === 'button') {
            await sendWithTyping(sock, senderJid, formatQuickReplyAnswer(hit.button));
            await recordHandledTurn(liveTenant, senderJid);
            return;
          }
        }

        if (customKb) {
          const reply = await getAiReply(messageText, senderJid, liveTenant);
          await sendWithTyping(sock, senderJid, reply);
          await recordHandledTurn(liveTenant, senderJid);
          return;
        }

        if (
          (vilasaMode || getLeadIntake(senderJid)) &&
          (await handleVilasaInteraction(sock, senderJid, messageText, {
            sendWithTyping,
            msg,
            tenant: liveTenant,
          }))
        ) {
          await recordHandledTurn(liveTenant, senderJid);
          return;
        }

        if (await handleServicesInteraction(sock, senderJid, msg, messageText)) {
          await recordHandledTurn(liveTenant, senderJid);
          return;
        }

        const reply = await getAiReply(messageText, senderJid, liveTenant);
        await sendWithTyping(sock, senderJid, reply);
        await recordHandledTurn(liveTenant, senderJid);
      } catch (err) {
        console.error('Failed to handle message:', redactSecrets(err?.message || err));
        const friendly =
          err instanceof MessageQuotaExceededError || err instanceof QuotaExceededError
            ? err.message
            : String(err?.message || '').includes('API key')
              ? 'AI is not configured yet. Add a Gemini API key in your dashboard.'
              : 'Sorry, I am having trouble responding right now. Please try again in a moment.';
        try {
          await sendWithTyping(sock, senderJid, friendly);
        } catch {
          // ignore
        }
      }
    });
}

export function attachWhatsAppHandler(sock, { tenant, getTenant }) {
  wrapSocketSend(sock);
  sock.ev.on('messages.upsert', (upsert) => {
    handleMessagesUpsert(sock, upsert, { tenant, getTenant }).catch((err) =>
      console.error('messages.upsert failed:', redactSecrets(err?.message || err))
    );
  });
}

async function recordHandledTurn(tenant, jid) {
  if (!tenant?.id) return;
  try {
    await recordTenantMessage({ tenantId: tenant.id, jid, source: 'whatsapp' });
  } catch (err) {
    console.warn('message meter skipped:', err?.message || err);
  }
}

export async function pushTenantWelcome(sock, jid, tenant) {
  markTracked(jid);
  if (tenant?.is_platform) {
    const demoId = getActiveDemoProfile().id;
    if (demoId === 'vilasa') {
      await startVilasaDemo(sock, jid, { sendWithTyping });
      return { mode: 'vilasa' };
    }
    await sendWithTyping(
      sock,
      jid,
      `${WELCOME_MESSAGE}\n\nPlease choose a service, or type *services* for the pricing menu.`
    );
    await sendInteractiveServicesMenu(sock, jid);
    return { mode: 'gsai' };
  }
  if (hasTenantKnowledge(tenant)) {
    await sendWithTyping(sock, jid, tenantWelcomeMessage(tenant));
    return { mode: 'tenant-knowledge' };
  }
  if (tenantProfileId(tenant) === 'vilasa') {
    await startVilasaDemo(sock, jid, { sendWithTyping });
    return { mode: 'vilasa' };
  }
  await sendWithTyping(
    sock,
    jid,
    `${WELCOME_MESSAGE}\n\nPlease choose a service, or type *services* for the pricing menu.`
  );
  await sendInteractiveServicesMenu(sock, jid);
  return { mode: 'gsai' };
}
