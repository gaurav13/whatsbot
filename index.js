import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  downloadMediaMessage,
} from '@whiskeysockets/baileys';
import pino from 'pino';
import qrcodeTerminal from 'qrcode-terminal';
import QRCode from 'qrcode';
import {
  KNOWLEDGE_DIR,
  listKnowledgeFiles,
  getActiveFileName,
  setActiveFile,
  saveUploadedBuffer,
  loadActiveKnowledgeBase,
} from './knowledgeManager.js';
import { startKnowledgeServer } from './knowledgeServer.js';
import { setQr, clearQr, setConnectionStatus } from './qrState.js';
import {
  setLogoutHandler,
  setLogoutInProgress,
  isLogoutInProgress,
} from './sessionControl.js';
import { generateAiReply, peekActiveAi } from './aiRouter.js';
import { loadAiConfig } from './aiConfigStore.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AUTH_DIR = path.join(__dirname, 'baileys_auth_info');

const baileysLogger = pino({ level: 'silent' });

// Seed ai-config.json from .env on boot (non-fatal if empty)
const bootAiConfig = loadAiConfig();
const bootAi = peekActiveAi();
console.log(
  `⚙️  Active AI: ${bootAi.activeProvider || 'n/a'} / ${bootAi.activeModel || 'n/a'}`
);
if (!bootAiConfig.providers?.[bootAi.activeProvider || '']?.apiKey) {
  console.warn(
    '⚠️  Active AI provider has no API key yet. Add one at http://localhost:3000/admin'
  );
}

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

/** Users who entered via the portfolio trigger — eligible for Gemini replies */
const trackedUsers = new Set();

/**
 * Per-chat automation switch (admin !stop / !start).
 * Missing key = ACTIVE (true). Explicit false = STOPPED.
 */
const automationEnabled = new Map();

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function getMessageText(msg) {
  return (
    msg.message?.conversation ||
    msg.message?.extendedTextMessage?.text ||
    msg.message?.ephemeralMessage?.message?.conversation ||
    msg.message?.ephemeralMessage?.message?.extendedTextMessage?.text ||
    msg.message?.documentWithCaptionMessage?.message?.documentMessage?.caption ||
    msg.message?.documentMessage?.caption ||
    ''
  );
}

function isAutomationActive(jid) {
  return automationEnabled.get(jid) !== false;
}

function parseAdminCommand(text) {
  const cmd = text.toLowerCase().trim();
  if (cmd === '!stop' || cmd === 'stop') return { type: 'stop' };
  if (cmd === '!start' || cmd === 'start') return { type: 'start' };

  if (cmd === '!kb' || cmd === '!kb status') return { type: 'kb_status' };
  if (cmd === '!kb list') return { type: 'kb_list' };

  const useMatch = text.trim().match(/^!kb\s+use\s+(.+)$/i);
  if (useMatch) return { type: 'kb_use', filename: useMatch[1].trim() };

  return null;
}

async function deleteAdminMessage(sock, msg, chatJid) {
  try {
    await sock.sendMessage(chatJid, { delete: msg.key });
  } catch (err) {
    console.error(`Failed to delete admin command in ${chatJid}:`, err?.message || err);
  }
}

async function handleAdminCommand(sock, msg, chatJid, command) {
  await deleteAdminMessage(sock, msg, chatJid);

  if (command.type === 'stop') {
    automationEnabled.set(chatJid, false);
    console.log(`🛑 Automation STOPPED for ${chatJid}`);
    return;
  }

  if (command.type === 'start') {
    automationEnabled.set(chatJid, true);
    console.log(`▶️ Automation STARTED for ${chatJid}`);
    return;
  }

  if (command.type === 'kb_status') {
    const active = getActiveFileName();
    const kb = await loadActiveKnowledgeBase();
    const reply = [
      '📚 Knowledge status',
      `Active file: ${active || '(none)'}`,
      kb.error ? `Error: ${kb.error}` : `Loaded chars: ${kb.text.length}`,
      `Folder: ${KNOWLEDGE_DIR}`,
    ].join('\n');
    console.log(reply);
    await sock.sendMessage(chatJid, { text: reply });
    return;
  }

  if (command.type === 'kb_list') {
    const files = listKnowledgeFiles();
    const active = getActiveFileName();
    const reply = [
      '📚 Knowledge files',
      files.length
        ? files.map((f) => `${f === active ? '✅' : '•'} ${f}`).join('\n')
        : '(no files yet — upload via WhatsApp doc or http://localhost:3789)',
      '',
      `Active: ${active || '(none)'}`,
      'Select with: !kb use filename.txt',
    ].join('\n');
    console.log(reply);
    await sock.sendMessage(chatJid, { text: reply });
    return;
  }

  if (command.type === 'kb_use') {
    try {
      const active = setActiveFile(command.filename);
      const reply = `✅ Active knowledge file set to: ${active}`;
      console.log(reply);
      await sock.sendMessage(chatJid, { text: reply });
    } catch (err) {
      const reply = `❌ Could not select file: ${err.message}`;
      console.error(reply);
      await sock.sendMessage(chatJid, { text: reply });
    }
  }
}

function getDocumentMeta(msg) {
  const doc =
    msg.message?.documentMessage ||
    msg.message?.documentWithCaptionMessage?.message?.documentMessage;
  if (!doc) return null;
  return {
    fileName: doc.fileName || `document-${Date.now()}.bin`,
    mimetype: doc.mimetype || '',
  };
}

async function handleAdminDocumentUpload(sock, msg, chatJid) {
  const meta = getDocumentMeta(msg);
  if (!meta) return false;

  const ext = path.extname(meta.fileName).toLowerCase();
  if (!['.txt', '.pdf', '.docx'].includes(ext)) {
    console.log(`📎 Ignored admin document (unsupported type): ${meta.fileName}`);
    return true;
  }

  try {
    const buffer = await downloadMediaMessage(
      msg,
      'buffer',
      {},
      {
        logger: baileysLogger,
        reuploadRequest: sock.updateMediaMessage,
      }
    );

    const caption = (getMessageText(msg) || '').toLowerCase();
    const makeActive = caption.includes('!kb use') || caption.includes('activate');

    const saved = await saveUploadedBuffer(meta.fileName, buffer, { makeActive });
    await deleteAdminMessage(sock, msg, chatJid);

    const reply = [
      `✅ Saved knowledge file: ${saved.filename}`,
      makeActive || saved.active
        ? `Active file: ${getActiveFileName()}`
        : `Not active yet. Run: !kb use ${saved.filename}`,
    ].join('\n');

    console.log(reply);
    await sock.sendMessage(chatJid, { text: reply });
  } catch (err) {
    console.error('Admin document upload failed:', err?.message || err);
    await sock.sendMessage(chatJid, {
      text: `❌ Upload failed: ${err?.message || err}`,
    });
  }

  return true;
}

async function buildSystemInstruction() {
  const kb = await loadActiveKnowledgeBase();

  if (kb.error || !kb.text) {
    console.warn(`⚠️ Knowledge base issue: ${kb.error || 'empty content'}`);
  }

  return [
    'You are the expert WhatsApp sales and technical consultant for GS AI Solutions (https://gsaisolutions.online/).',
    'You speak only to qualified website/portfolio inbound leads.',
    'Answer ONLY using the active knowledge document below.',
    'If a detail is missing, say you will confirm with the GS AI Solutions team — never invent prices, metrics, guarantees, or unlisted services.',
    'Keep replies concise, professional, consultative, and WhatsApp-friendly. Use short bullets when helpful.',
    '',
    `===== ACTIVE KNOWLEDGE FILE: ${kb.filename || '(none)'} =====`,
    kb.text ||
      kb.error ||
      'No knowledge content loaded. Ask for project details and offer to connect with the GS AI Solutions team at https://gsaisolutions.online/.',
    '===== END KNOWLEDGE BASE =====',
  ].join('\n');
}

function isPortfolioLeadMessage(text) {
  const normalized = text.toLowerCase().replace(/\s+/g, ' ').trim();
  if (normalized.includes(PORTFOLIO_TRIGGER)) return true;
  return PORTFOLIO_KEYWORDS.some((keyword) => normalized.includes(keyword));
}

async function sendWithTyping(sock, jid, text) {
  await sock.presenceSubscribe(jid);
  await sock.sendPresenceUpdate('composing', jid);

  const delayMs = Math.min(3500, Math.max(1200, text.length * 25));
  await sleep(delayMs);

  await sock.sendMessage(jid, { text });
  await sock.sendPresenceUpdate('paused', jid);
}

async function getAiReply(userQuery) {
  const systemInstruction = await buildSystemInstruction();
  const active = peekActiveAi();
  console.log(
    `🤖 Asking AI for reply via ${active.activeProvider}/${active.activeModel} (kb=${getActiveFileName()})`
  );
  return generateAiReply(userQuery, systemInstruction);
}

let currentSock = null;
let sockBootPromise = null;

function clearAuthSession() {
  try {
    if (fs.existsSync(AUTH_DIR)) {
      fs.rmSync(AUTH_DIR, { recursive: true, force: true });
      console.log('🧹 Cleared baileys_auth_info session folder');
    }
  } catch (err) {
    console.error('Failed to clear auth folder:', err?.message || err);
    throw err;
  }
}

async function logoutAndReset() {
  if (isLogoutInProgress()) {
    return { ok: true, message: 'Logout already in progress' };
  }

  setLogoutInProgress(true);
  clearQr('logging_out');
  setConnectionStatus('logging_out');
  console.log('🚪 Logout requested from web UI…');

  try {
    const sock = currentSock;
    if (sock) {
      try {
        await sock.logout();
      } catch (err) {
        console.warn('sock.logout() failed, forcing local session clear:', err?.message || err);
      }

      try {
        sock.end?.(undefined);
      } catch {
        // ignore
      }
      currentSock = null;
    }

    // Small delay so Baileys can finish closing before we wipe creds
    await sleep(400);
    clearAuthSession();
    setConnectionStatus('restarting');
    // Allow the new socket to reconnect normally after auth wipe
    setLogoutInProgress(false);
    await startSock();
    return { ok: true, message: 'Logged out. Fresh QR will appear shortly.' };
  } catch (err) {
    setLogoutInProgress(false);
    setConnectionStatus('logout_failed');
    throw err;
  } finally {
    setLogoutInProgress(false);
  }
}

async function startSock() {
  if (sockBootPromise) return sockBootPromise;

  sockBootPromise = (async () => {
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);

  const sock = makeWASocket({
    auth: state,
    logger: baileysLogger,
    printQRInTerminal: true,
  });
  currentSock = sock;

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log('\nScan this QR code with WhatsApp (Linked Devices):');
      console.log('🌐 Or open http://localhost:3000 in your browser\n');
      qrcodeTerminal.generate(qr, { small: true });
      try {
        const dataUrl = await QRCode.toDataURL(qr, {
          errorCorrectionLevel: 'M',
          margin: 2,
          width: 320,
        });
        setQr(qr, dataUrl);
      } catch (err) {
        console.error('Failed to render QR for web UI:', err?.message || err);
      }
    }

    if (connection === 'connecting') {
      setConnectionStatus('connecting');
    }

    if (connection === 'close') {
      if (isLogoutInProgress()) {
        clearQr('logging_out');
        console.log('Connection closed during logout (expected).');
        return;
      }

      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      clearQr(shouldReconnect ? 'reconnecting' : 'logged_out');
      console.log('Connection closed. Reconnecting...', shouldReconnect);
      if (shouldReconnect) {
        currentSock = null;
        startSock();
      } else {
        console.log('Logged out remotely. Clearing session and waiting for fresh QR…');
        currentSock = null;
        try {
          clearAuthSession();
        } catch {
          // ignore
        }
        startSock();
      }
    } else if (connection === 'open') {
      clearQr('connected');
      console.log('✅ WhatsApp successfully connected on Localhost!');
      console.log(`📂 Knowledge folder: ${KNOWLEDGE_DIR}`);
      console.log(`📌 Active knowledge file: ${getActiveFileName() || '(none)'}`);
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;

    const msg = messages[0];
    if (!msg?.message) return;

    const chatJid = msg.key.remoteJid;
    if (!chatJid || chatJid === 'status@broadcast' || chatJid.endsWith('@g.us')) {
      return;
    }

    // --- Admin controls (fromMe) ---
    if (msg.key.fromMe) {
      if (await handleAdminDocumentUpload(sock, msg, chatJid)) return;

      const messageText = getMessageText(msg);
      if (!messageText.trim()) return;

      const command = parseAdminCommand(messageText);
      if (!command) return;
      await handleAdminCommand(sock, msg, chatJid, command);
      return;
    }

    const senderJid = chatJid;
    const messageText = getMessageText(msg);
    if (!messageText.trim()) return;

    // Per-chat automation gate
    if (!isAutomationActive(senderJid)) {
      console.log(`⏸️ Ignored (automation stopped): ${senderJid}`);
      return;
    }

    const isTracked = trackedUsers.has(senderJid);
    const isLead = isPortfolioLeadMessage(messageText);

    // Website-only filter: ignore non-portfolio strangers completely
    if (!isTracked && !isLead) {
      console.log(`🔇 Ignored (no portfolio trigger): ${senderJid}`);
      return;
    }

    console.log(`📩 Message from ${senderJid}: ${messageText}`);

    try {
      // First portfolio message → welcome + unlock session
      if (!isTracked) {
        trackedUsers.add(senderJid);
        automationEnabled.set(senderJid, true);
        console.log(`👋 Portfolio lead ${senderJid} — sending welcome`);
        await sendWithTyping(sock, senderJid, WELCOME_MESSAGE);
        return;
      }

      // Follow-ups → active AI provider + selected knowledge file
      const reply = await getAiReply(messageText);
      await sendWithTyping(sock, senderJid, reply);
      console.log(`✅ Replied to ${senderJid}`);
    } catch (err) {
      console.error('Failed to handle message:', err?.message || err);
      const friendly =
        String(err?.message || '').includes('Missing API key')
          ? 'AI is not configured yet. Please ask the admin to add an API key in settings.'
          : 'Sorry, I am having trouble responding right now. Please try again in a moment.';
      try {
        await sendWithTyping(sock, senderJid, friendly);
      } catch {
        // ignore secondary send failures
      }
    }
  });
  })();

  try {
    await sockBootPromise;
  } finally {
    sockBootPromise = null;
  }
}

setLogoutHandler(logoutAndReset);
startKnowledgeServer();
startSock();

