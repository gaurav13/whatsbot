import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadActiveKnowledgeBase } from './knowledgeManager.js';
import { buildWebsiteKnowledgeContext } from './db.js';
import {
  loadVilasaBrochureText,
  getVilasaIntroMessage,
  VILASA_MENU_ROWS,
  buildVilasaSystemInstruction,
  indexVilasaKnowledge,
  resolveVilasaSection,
  listVilasaLeads,
} from './vilasaDemo.js';
import { loadServicesCatalog, formatTextMenu, formatServiceDetails } from './servicesCatalog.js';
import { generateAiReply, peekActiveAi } from './aiRouter.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STATE_PATH = path.join(__dirname, 'demo-state.json');

export const DEMO_PROFILES = [
  {
    id: 'vilasa',
    label: 'Real Estate — Vilasa Project',
    description:
      '3 BHK from ₹1.37 Cr · interactive property menu · brochure + images knowledge',
    type: 'real_estate',
  },
  {
    id: 'gsai',
    label: 'IT & Agency Services — GS AI Solutions',
    description:
      'Web development, WhatsApp/Facebook marketing, pricing menu & services knowledge',
    type: 'agency',
  },
];

let activeProfileId = 'vilasa';
let lastWhatsAppJid = null;
let whatsappTriggerHandler = null;

function loadStateFile() {
  try {
    if (!fs.existsSync(STATE_PATH)) return;
    const raw = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
    if (raw?.activeProfileId && DEMO_PROFILES.some((p) => p.id === raw.activeProfileId)) {
      activeProfileId = raw.activeProfileId;
    }
    if (raw?.lastWhatsAppJid) {
      lastWhatsAppJid = String(raw.lastWhatsAppJid).trim();
    }
  } catch {
    // ignore
  }
}

function saveStateFile() {
  fs.writeFileSync(
    STATE_PATH,
    JSON.stringify(
      {
        activeProfileId,
        lastWhatsAppJid,
        updatedAt: new Date().toISOString(),
      },
      null,
      2
    ),
    'utf8'
  );
}

export function getLastDemoWhatsAppJid() {
  return lastWhatsAppJid;
}

export function setLastDemoWhatsAppJid(jid) {
  const clean = String(jid || '').trim();
  lastWhatsAppJid = clean || null;
  saveStateFile();
  return lastWhatsAppJid;
}

loadStateFile();

export function listDemoProfiles() {
  return DEMO_PROFILES.map((p) => ({
    ...p,
    active: p.id === activeProfileId,
  }));
}

export function getActiveDemoProfile() {
  return DEMO_PROFILES.find((p) => p.id === activeProfileId) || DEMO_PROFILES[0];
}

export function setActiveDemoProfile(profileId) {
  const profile = DEMO_PROFILES.find((p) => p.id === profileId);
  if (!profile) throw new Error(`Unknown demo profile: ${profileId}`);
  activeProfileId = profile.id;
  saveStateFile();
  return profile;
}

/** Optional: register WhatsApp push when a demo is triggered from /demo UI */
export function setDemoWhatsAppTrigger(handler) {
  whatsappTriggerHandler = handler;
}

export async function buildDemoSystemInstruction(profileId = activeProfileId) {
  const profile = DEMO_PROFILES.find((p) => p.id === profileId) || getActiveDemoProfile();

  if (profile.id === 'vilasa') {
    const brochure = await loadVilasaBrochureText();
    return {
      profile,
      systemInstruction: buildVilasaSystemInstruction(brochure),
      knowledgeSource: 'vilasa-brochure',
    };
  }

  // GS AI agency profile
  const kb = await loadActiveKnowledgeBase();
  let websiteContext = '';
  try {
    websiteContext = await buildWebsiteKnowledgeContext(8000);
  } catch {
    websiteContext = '';
  }

  const catalog = loadServicesCatalog();
  const servicesBlock = catalog
    .map(
      (s) =>
        `### ${s.name}\n${s.description}\nPricing:\n${s.pricing.map((p) => `- ${p}`).join('\n')}`
    )
    .join('\n\n');

  const systemInstruction = [
    'You are the expert WhatsApp sales consultant for GS AI Solutions (https://gsaisolutions.online/).',
    'Answer using the agency services knowledge and any scraped website knowledge below.',
    'Be concise, professional, and WhatsApp-friendly.',
    'If pricing detail is missing, invite a discovery call — do not invent exact final fees.',
    '',
    '===== GS AI SERVICES CATALOG =====',
    servicesBlock,
    '===== END SERVICES CATALOG =====',
    '',
    `===== ACTIVE KNOWLEDGE FILE: ${kb.filename || '(none)'} =====`,
    kb.text || kb.error || 'No local knowledge file loaded.',
    '===== END KNOWLEDGE FILE =====',
    '',
    '===== SCRAPED WEBSITE KNOWLEDGE =====',
    websiteContext || 'No scraped website knowledge stored.',
    '===== END SCRAPED WEBSITE KNOWLEDGE =====',
  ].join('\n');

  return {
    profile,
    systemInstruction,
    knowledgeSource: kb.filename || 'services.txt',
  };
}

export async function getDemoWelcomePreview(profileId = activeProfileId) {
  const profile = DEMO_PROFILES.find((p) => p.id === profileId) || getActiveDemoProfile();

  if (profile.id === 'vilasa') {
    await indexVilasaKnowledge().catch(() => {});
    return {
      profile,
      welcomeText: getVilasaIntroMessage(),
      menuTitle: 'Vilasa Property Menu',
      menuOptions: VILASA_MENU_ROWS.map((r, i) => ({
        index: i + 1,
        id: r.id,
        title: r.title,
        description: r.description,
      })),
      hint: 'Reply 1–3 for image+details, or 4 to start the site-visit booking flow.',
    };
  }

  const catalog = loadServicesCatalog();
  return {
    profile,
    welcomeText:
      '👋 *Welcome to GS AI Solutions*\n\n' +
      'We help businesses grow with WhatsApp automation, digital marketing, and full-stack web development.\n\n' +
      'Please choose a service to view pricing:',
    menuTitle: 'GS AI Services Menu',
    menuOptions: catalog.map((s, i) => ({
      index: i + 1,
      id: s.rowId,
      title: s.name,
      description: (s.description || '').slice(0, 80),
    })),
    hint: 'In WhatsApp, type *services* or use the interactive menu for pricing.',
    textMenu: formatTextMenu(catalog),
  };
}

export async function triggerDemoProfile(
  profileId,
  { pushToWhatsAppJid = null, trigger = true } = {}
) {
  const profile = setActiveDemoProfile(profileId);
  const preview = await getDemoWelcomePreview(profile.id);

  const jid = String(pushToWhatsAppJid || lastWhatsAppJid || '').trim() || null;
  if (jid) setLastDemoWhatsAppJid(jid);

  let whatsapp = null;
  if (trigger && jid && typeof whatsappTriggerHandler === 'function') {
    try {
      whatsapp = await whatsappTriggerHandler({
        profileId: profile.id,
        jid,
      });
    } catch (err) {
      whatsapp = { ok: false, error: err.message || String(err) };
    }
  } else if (trigger && !jid) {
    whatsapp = {
      ok: false,
      skipped: true,
      error: 'No WhatsApp JID set — preview only. Enter a JID to push the demo welcome live.',
    };
  }

  return { profile, preview, whatsapp, lastWhatsAppJid: jid };
}

export async function answerDemoChat(question, profileId = activeProfileId) {
  const { profile, systemInstruction, knowledgeSource } =
    await buildDemoSystemInstruction(profileId);

  // Fast-path structured replies for Vilasa menu option IDs / numbers in tester
  if (profile.id === 'vilasa') {
    const section = resolveVilasaSection(question);
    if (section) {
      return {
        reply: section.text,
        profile,
        knowledgeSource,
        mode: section.isLeadIntake ? 'lead_intake' : 'section',
        image: section.image || null,
        leads: section.isLeadIntake ? listVilasaLeads().slice(0, 5) : undefined,
        activeAi: peekActiveAi(),
      };
    }
  }

  if (profile.id === 'gsai') {
    const catalog = loadServicesCatalog();
    const matched = catalog.find(
      (s) =>
        s.rowId === question ||
        s.name.toLowerCase() === String(question).toLowerCase().trim()
    );
    if (matched) {
      return {
        reply: formatServiceDetails(matched),
        profile,
        knowledgeSource,
        mode: 'section',
        activeAi: peekActiveAi(),
      };
    }
  }

  const reply = await generateAiReply(question, systemInstruction, {
    jid: 'demo-web',
    phone: 'demo-web',
    source: 'demo-chat',
  });
  return {
    reply,
    profile,
    knowledgeSource,
    mode: 'ai',
    activeAi: peekActiveAi(),
  };
}
