import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import mammoth from 'mammoth';
import { generateAiReply } from './aiRouter.js';
import { upsertWebsiteKnowledge } from './db.js';
import {
  sendInteractiveMenu,
  extractInteractiveSelection,
} from './whatsappInteractive.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const VILASA_DOCX = path.join(__dirname, 'knowledge', 'VILASA_Brochure.docx');
export const VILASA_TXT = path.join(__dirname, 'knowledge', 'vilasa-brochure.txt');
export const VILASA_IMAGES_DIR = path.join(__dirname, 'knowledge', 'vilasa-image');
export const VILASA_BROCHURE_URL =
  'https://drive.google.com/file/d/1IZiAg40P7lIsLwE9npCo1Z_nx4iFn27I/view?usp=sharing';
const LEADS_PATH = path.join(__dirname, 'vilasa-leads.json');

/** Users currently in the Vilasa real-estate demo conversation */
export const vilasaSessions = new Set();

/**
 * Active site-visit booking steps per chat.
 * jid → { step: 'date'|'time'|'contact', preferredDate?, preferredTime?, name?, phone? }
 */
const leadIntakeByJid = new Map();

/** Confirmed leads (in-memory + mirrored to vilasa-leads.json) */
export const vilasaLeads = [];

let brochureCache = null;

loadLeadsFromDisk();

/**
 * Scalable property-demo section map.
 * Options 1–3 send image + caption. Option 4 starts lead intake.
 */
export const VILASA_SECTIONS = {
  vilasa_price: {
    id: 'vilasa_price',
    title: 'Price & Configuration',
    menuNumber: 1,
    aliases: ['1', '1️⃣', 'price', 'pricing', 'config', 'configuration', '3 bhk', 'bhk', 'cost'],
    image: '3-bedroom-model.png',
    text:
      '💰 *Vilasa — Price & Configuration*\n\n' +
      'Discover thoughtfully planned *3 BHK* residences designed for elegant everyday living.\n\n' +
      '🏠 *Configuration:* 3 Bedroom · Hall · Kitchen + 2 toilets\n' +
      '💵 *Starting at ₹1.37 Crore*\n\n' +
      '*Available layouts:*\n' +
      '• *Plan A* — 122 sq yd / 1,098 sq ft\n' +
      '• *Plan B* — 132 sq yd / 1,188 sq ft\n' +
      '• *Plan C* — 154 sq yd / 1,386 sq ft\n\n' +
      'Each home features a generous living-dining area, modular kitchen, balconies, and lift access.\n\n' +
      '_Pricing may vary by floor and unit preference — a site visit is the best way to finalise your choice._\n\n' +
      'Reply *2*, *3*, or *4* to continue — or *menu* to see all options.',
  },
  vilasa_amenities: {
    id: 'vilasa_amenities',
    title: 'Amenities',
    menuNumber: 2,
    aliases: ['2', '2️⃣', 'amenities', 'amenity', 'lifestyle', 'club', 'pool', 'clubhouse'],
    image: 'swimming-pool.png',
    text:
      '✨ *Vilasa Lifestyle Amenities*\n\n' +
      'A private world of leisure, wellness, and green calm — curated for modern families.\n\n' +
      '• *25,000 sq ft* Club House\n' +
      '• Resort-style Swimming Pool & Kids’ Pool\n' +
      '• Fully equipped Gym & Indoor Games\n' +
      '• Basketball, Badminton & Cricket practice net\n' +
      '• Jogging track, Yoga lawn & Kids’ play area\n' +
      '• Party lawn, Amphitheatre, Café & Reading lounge\n' +
      '• ~70% open greens with personal rooftop gazebo options\n\n' +
      'Every detail is designed so home feels like a quiet luxury retreat.\n\n' +
      'Reply *1*, *3*, or *4* next — or *menu* anytime.',
  },
  vilasa_floorplans: {
    id: 'vilasa_floorplans',
    title: 'Floor Plans & Layouts',
    menuNumber: 3,
    aliases: [
      '3',
      '3️⃣',
      'floor',
      'floors',
      'floor plan',
      'floor plans',
      'layout',
      'layouts',
      'plans',
    ],
    image: 'building-model.png',
    text:
      '📐 *Vilasa Floor Plans & Layouts*\n\n' +
      'All residences are *3 BHK + 2 toilets*, thoughtfully planned with mirrored dual-unit floor plates.\n\n' +
      '• *Plan A* — 122 sq yd (1,098 sq ft)\n' +
      '  Living/Dining ≈ 12\'8" × 16\'5" · Kitchen ≈ 7\'1" × 10\'4"\n' +
      '• *Plan B* — 132 sq yd (1,188 sq ft)\n' +
      '  Living/Dining ≈ 13\'7" × 16\'5" · Kitchen ≈ 7\'3" × 10\'4"\n' +
      '• *Plan C* — 154 sq yd (1,386 sq ft)\n' +
      '  Living/Dining ≈ 16\'1" × 17\'5" · Kitchen ≈ 7\' × 11\'\n\n' +
      'Stilt parking, lift, and staircase access are integrated into the planning.\n\n' +
      'Would you like pricing (*1*), amenities (*2*), or to *schedule a visit* (*4*)?',
  },
  vilasa_visit: {
    id: 'vilasa_visit',
    title: 'Schedule a Site Visit',
    menuNumber: 4,
    aliases: [
      '4',
      '4️⃣',
      'visit',
      'site visit',
      'schedule',
      'book visit',
      'booking',
      'location',
      'connectivity',
      'map',
    ],
    image: 'vilasa-connectivity.png',
    isLeadIntake: true,
    text:
      '📅 *Schedule Your Vilasa Site Visit*\n\n' +
      '📍 *Sector 6, South Gurugram* — beautifully connected via SPR, Sohna Road, and the Delhi–Mumbai Expressway.\n\n' +
      'I’d be delighted to arrange a private walkthrough of the project for you.\n\n' +
      '🗓️ *Step 1 of 3*\n' +
      'What is your *preferred date* for the visit?\n' +
      '_(Example: 18 Nov, Saturday, or 20/11)_',
  },
};

export const VILASA_MENU_ROWS = [
  {
    id: 'vilasa_price',
    title: '1️⃣ Price & Config',
    description: '3 BHK from ₹1.37 Cr',
  },
  {
    id: 'vilasa_amenities',
    title: '2️⃣ Amenities',
    description: 'Clubhouse, pool, greens',
  },
  {
    id: 'vilasa_floorplans',
    title: '3️⃣ Floor Plans',
    description: 'Layouts & sizes',
  },
  {
    id: 'vilasa_visit',
    title: '4️⃣ Site Visit',
    description: 'Book a guided tour',
  },
];

function loadLeadsFromDisk() {
  try {
    if (!fs.existsSync(LEADS_PATH)) return;
    const raw = JSON.parse(fs.readFileSync(LEADS_PATH, 'utf8'));
    if (Array.isArray(raw?.leads)) {
      vilasaLeads.splice(0, vilasaLeads.length, ...raw.leads);
    }
  } catch {
    // ignore corrupt file
  }
}

function persistLeads() {
  try {
    fs.writeFileSync(
      LEADS_PATH,
      JSON.stringify({ updatedAt: new Date().toISOString(), leads: vilasaLeads }, null, 2),
      'utf8'
    );
  } catch (err) {
    console.warn('Could not persist Vilasa leads:', err?.message || err);
  }
}

export function listVilasaLeads() {
  return [...vilasaLeads].reverse();
}

export function getLeadIntakeState(jid) {
  return leadIntakeByJid.get(jid) || null;
}

export function clearLeadIntake(jid) {
  leadIntakeByJid.delete(jid);
}

function brochureLinkLine() {
  return `📄 *Brochure:* ${VILASA_BROCHURE_URL}`;
}

function formatNumberedMenu() {
  return [
    'Please reply with a *number*:',
    '',
    '1️⃣ *Price & Configuration*',
    '2️⃣ *Amenities*',
    '3️⃣ *Floor Plans & Layouts*',
    '4️⃣ *Schedule a Site Visit*',
    '',
    '_Just send 1, 2, 3, or 4_',
    'Type *brochure* to get the full project PDF.',
    brochureLinkLine(),
  ].join('\n');
}

export function isVilasaIntent(text) {
  const t = String(text || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
  if (!t) return false;

  if (/\bvil+asa\b/.test(t) || /\bvillasa\b/.test(t)) return true;
  if (/\b(real\s*estate|property|properties)\b/.test(t)) return true;

  const realEstate =
    /\b(flat|flats|apartment|apartments|3\s*bhk|gurgaon|gurugram|sector\s*6)\b/.test(t);
  const demo = /\b(demo|project|brochure|site\s*visit|floor\s*plan|amenities|pricing)\b/.test(
    t
  );
  return realEstate && demo;
}

export async function loadVilasaBrochureText({ force = false } = {}) {
  if (brochureCache && !force) return brochureCache;

  try {
    if (
      !force &&
      fs.existsSync(VILASA_TXT) &&
      fs.existsSync(VILASA_DOCX) &&
      fs.statSync(VILASA_TXT).mtimeMs >= fs.statSync(VILASA_DOCX).mtimeMs
    ) {
      brochureCache = fs.readFileSync(VILASA_TXT, 'utf8').trim();
      return brochureCache;
    }
  } catch {
    // continue
  }

  if (!fs.existsSync(VILASA_DOCX)) {
    throw new Error(`Vilasa brochure not found: ${VILASA_DOCX}`);
  }

  const result = await mammoth.extractRawText({ path: VILASA_DOCX });
  const text = String(result.value || '').trim();
  if (!text) throw new Error('Vilasa brochure extracted empty text');

  fs.writeFileSync(VILASA_TXT, text, 'utf8');
  brochureCache = text;
  return brochureCache;
}

export async function indexVilasaKnowledge() {
  const content = await loadVilasaBrochureText();
  try {
    await upsertWebsiteKnowledge({
      url: 'local://vilasa-brochure',
      title: 'VILASA by BLF Developers — Brochure',
      content,
    });
  } catch (err) {
    console.warn('Vilasa DB index skipped:', err?.message || err);
  }
  return content;
}

export function buildVilasaSystemInstruction(brochureText) {
  return [
    'You are an elegant, polished WhatsApp real-estate consultant for VILASA by BLF Developers.',
    'Speak warmly and confidently — like a trusted luxury property advisor, never robotic.',
    'Answer ONLY using the brochure knowledge below.',
    'Known starting price: ₹1.37 crore for 3 BHK. Do not invent other exact prices.',
    'When helpful, gently guide the user to reply 1 (price), 2 (amenities), 3 (floor plans), or 4 (site visit).',
    `Share the official brochure link whenever asked: ${VILASA_BROCHURE_URL}`,
    'Keep replies concise and WhatsApp-friendly.',
    '',
    '===== VILASA BROCHURE KNOWLEDGE =====',
    brochureText.slice(0, 14000),
    '===== END VILASA BROCHURE =====',
  ].join('\n');
}

export function getVilasaIntroMessage() {
  return (
    '🏡 *Welcome to VILASA by BLF Developers*\n' +
    '_Where Luxury Finds Peace_\n\n' +
    '📍 *Sector 6, South Gurugram* — an exclusive new address\n' +
    '🏠 Spacious *3 BHK* homes crafted for refined living\n' +
    '💵 Starting at *₹1.37 Crore*\n' +
    '🏛 25,000 sq ft clubhouse · lush greens · premium connectivity\n' +
    brochureLinkLine() +
    '\n\n' +
    'I’d be delighted to personally guide you through the project.\n\n' +
    formatNumberedMenu()
  );
}

export function getVilasaMenuText() {
  return (
    '🏡 *Vilasa Property Menu*\n\n' +
    'How may I assist you next?\n\n' +
    formatNumberedMenu()
  );
}

export async function sendVilasaMenu(sock, jid, { sendWithTyping = null } = {}) {
  const textMenu = getVilasaMenuText();

  if (typeof sendWithTyping === 'function') {
    await sendWithTyping(sock, jid, textMenu);
  } else {
    await sock.sendMessage(jid, { text: textMenu });
  }

  // Best-effort interactive list (numbers still work if this fails)
  try {
    await sendInteractiveMenu(sock, jid, {
      title: 'Vilasa Property Menu',
      body: 'Or tap an option below — you can also simply reply 1, 2, 3, or 4.',
      footer: 'VILASA · BLF Developers',
      buttonText: 'View Options',
      sectionTitle: 'Explore Vilasa',
      rows: VILASA_MENU_ROWS,
      textFallback: null,
    });
  } catch (err) {
    console.warn('Vilasa interactive menu skipped:', err?.message || err);
  }

  return { type: 'numbered_menu' };
}

function resolveImagePath(fileName) {
  if (!fileName) return null;
  const full = path.join(VILASA_IMAGES_DIR, fileName);
  return fs.existsSync(full) ? full : null;
}

function mimeForImage(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.webp') return 'image/webp';
  return 'image/png';
}

/** Prefer buffer send — more reliable than file URL on some hosts */
export async function sendImageWithCaption(sock, jid, imageFileName, caption) {
  const imagePath = resolveImagePath(imageFileName);
  if (!imagePath) {
    await sock.sendMessage(jid, { text: caption });
    return { ok: false, reason: 'missing_image', captionOnly: true };
  }

  try {
    const buffer = fs.readFileSync(imagePath);
    await sock.sendMessage(jid, {
      image: buffer,
      mimetype: mimeForImage(imagePath),
      caption: String(caption || '').slice(0, 1024),
      fileName: path.basename(imagePath),
    });
    return { ok: true, image: imageFileName };
  } catch (err) {
    console.warn(`Vilasa image buffer send failed (${imageFileName}):`, err?.message || err);
    try {
      await sock.sendMessage(jid, {
        image: { url: imagePath },
        caption: String(caption || '').slice(0, 1024),
      });
      return { ok: true, image: imageFileName, via: 'url' };
    } catch (err2) {
      console.warn(`Vilasa image url send failed (${imageFileName}):`, err2?.message || err2);
      await sock.sendMessage(jid, { text: caption });
      return { ok: false, reason: err2?.message || err.message, captionOnly: true };
    }
  }
}

export function resolveVilasaSection(input) {
  if (!input) return null;
  const raw = String(input).trim();
  const key = raw.toLowerCase().replace(/\s+/g, ' ');

  if (VILASA_SECTIONS[raw]) return VILASA_SECTIONS[raw];
  if (VILASA_SECTIONS[key]) return VILASA_SECTIONS[key];

  // Exact number match first: "1", "1)", "2.", or emoji digits like 1️⃣
  let normalized = key;
  for (const [emoji, digit] of [
    ['1️⃣', '1'],
    ['2️⃣', '2'],
    ['3️⃣', '3'],
    ['4️⃣', '4'],
  ]) {
    if (normalized.startsWith(emoji)) {
      normalized = digit + normalized.slice(emoji.length);
      break;
    }
  }
  const num = normalized.match(/^([1-4])(?:[\).:\-\s]|$)/);
  if (num) {
    const row = VILASA_MENU_ROWS[Number(num[1]) - 1];
    return row ? VILASA_SECTIONS[row.id] : null;
  }

  // Exact alias match (avoid partial false positives)
  for (const section of Object.values(VILASA_SECTIONS)) {
    if (section.aliases.some((a) => key === a)) return section;
  }

  // Soft keyword match for longer phrases
  for (const section of Object.values(VILASA_SECTIONS)) {
    if (
      section.aliases.some(
        (a) => a.length > 2 && (key.includes(a) || a.includes(key))
      )
    ) {
      return section;
    }
  }

  return null;
}

async function startLeadIntake(sock, jid, { sendWithTyping }) {
  const section = VILASA_SECTIONS.vilasa_visit;
  leadIntakeByJid.set(jid, { step: 'date', startedAt: new Date().toISOString() });

  // Location / connectivity visual, then booking prompt
  await sendImageWithCaption(sock, jid, section.image, section.text);
  console.log(`📅 Vilasa lead intake started for ${jid}`);
}

async function handleLeadIntakeStep(sock, jid, text, { sendWithTyping }) {
  const state = leadIntakeByJid.get(jid);
  if (!state) return false;

  const reply = String(text || '').trim();
  if (!reply) {
    await sendWithTyping(
      sock,
      jid,
      'Whenever you’re ready, please share a quick reply so I can continue your booking. 😊'
    );
    return true;
  }

  // Allow escaping the flow
  if (/^(menu|cancel|stop|back)$/i.test(reply)) {
    clearLeadIntake(jid);
    await sendWithTyping(
      sock,
      jid,
      'Of course — I’ve paused the booking for now.\n\n' + getVilasaMenuText()
    );
    return true;
  }

  // If they pick another menu number mid-flow, switch
  const asSection = resolveVilasaSection(reply);
  if (asSection && !asSection.isLeadIntake && state.step === 'date' && /^[1-3]/.test(reply)) {
    clearLeadIntake(jid);
    await sendVilasaSection(sock, jid, asSection, { sendWithTyping });
    return true;
  }

  if (state.step === 'date') {
    state.preferredDate = reply;
    state.step = 'time';
    leadIntakeByJid.set(jid, state);
    await sendWithTyping(
      sock,
      jid,
      `Perfect — I’ve noted *${reply}* for your visit. 🗓️\n\n` +
        `⏰ *Step 2 of 3*\n` +
        `What *time* would suit you best?\n` +
        `_(Example: 11:00 AM, afternoon, or 4 PM)_`
    );
    return true;
  }

  if (state.step === 'time') {
    state.preferredTime = reply;
    state.step = 'contact';
    leadIntakeByJid.set(jid, state);
    await sendWithTyping(
      sock,
      jid,
      `Wonderful — *${state.preferredDate}* at *${reply}* is locked in tentatively. ✨\n\n` +
        `👤 *Step 3 of 3*\n` +
        `Please share your *full name* and *contact number* so our relationship manager can confirm the appointment.\n` +
        `_(Example: Priya Sharma, 9876543210)_`
    );
    return true;
  }

  if (state.step === 'contact') {
    const parsed = parseNameAndPhone(reply);
    state.name = parsed.name;
    state.phone = parsed.phone;
    state.rawContact = reply;
    state.step = 'done';
    state.completedAt = new Date().toISOString();

    const lead = {
      id: `lead_${Date.now()}`,
      jid,
      preferredDate: state.preferredDate,
      preferredTime: state.preferredTime,
      name: state.name,
      phone: state.phone,
      rawContact: reply,
      project: 'Vilasa',
      createdAt: state.completedAt,
    };

    vilasaLeads.push(lead);
    persistLeads();
    clearLeadIntake(jid);

    console.log(
      `✅ Vilasa site-visit lead: ${lead.name || 'Guest'} | ${lead.phone || 'n/a'} | ${lead.preferredDate} ${lead.preferredTime}`
    );

    await sendWithTyping(
      sock,
      jid,
      `🎉 *Thank you${lead.name ? `, ${lead.name}` : ''}!*\n\n` +
        `Your Vilasa site visit request has been noted:\n\n` +
        `📅 *Date:* ${lead.preferredDate}\n` +
        `⏰ *Time:* ${lead.preferredTime}\n` +
        `📞 *Contact:* ${lead.phone || reply}\n` +
        `📍 *Project:* Vilasa, Sector 6, South Gurugram\n\n` +
        `Our team will confirm your appointment shortly. We look forward to hosting you at this beautiful address.\n\n` +
        `Meanwhile, feel free to explore more — reply *menu* anytime.`
    );
    return true;
  }

  return false;
}

function parseNameAndPhone(text) {
  const raw = String(text || '').trim();
  const phoneMatch = raw.match(/(\+?\d[\d\s\-()]{8,}\d)/);
  const phone = phoneMatch ? phoneMatch[1].replace(/[^\d+]/g, '') : '';
  let name = raw
    .replace(phoneMatch?.[0] || '', '')
    .replace(/[,|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!name || name.length < 2) name = raw;
  return { name, phone };
}

export async function sendVilasaSection(sock, jid, section, { sendWithTyping }) {
  if (!section) {
    await sendWithTyping(
      sock,
      jid,
      'I’d love to help — please reply with *1*, *2*, *3*, or *4* from the menu.'
    );
    return;
  }

  if (section.isLeadIntake) {
    await startLeadIntake(sock, jid, { sendWithTyping });
    return;
  }

  await sendImageWithCaption(sock, jid, section.image, section.text);

  // Soft re-offer after a short pause
  await new Promise((r) => setTimeout(r, 600));
  await sendWithTyping(sock, jid, getVilasaMenuText());
}

export async function startVilasaDemo(sock, jid, { sendWithTyping }) {
  vilasaSessions.add(jid);
  clearLeadIntake(jid);
  await indexVilasaKnowledge();

  await sendWithTyping(sock, jid, getVilasaIntroMessage());

  // Optional interactive buttons (numbers remain primary)
  try {
    await sendInteractiveMenu(sock, jid, {
      title: 'Vilasa Property Menu',
      body: 'You can also tap an option here — or simply reply 1, 2, 3, or 4.',
      footer: 'VILASA · BLF Developers',
      buttonText: 'View Options',
      sectionTitle: 'Explore Vilasa',
      rows: VILASA_MENU_ROWS,
      textFallback: null,
    });
  } catch {
    // text menu already sent in intro
  }

  return { staged: true };
}

export async function answerVilasaQuestion(question) {
  const brochureText = await loadVilasaBrochureText();
  const systemInstruction = buildVilasaSystemInstruction(brochureText);
  return generateAiReply(question, systemInstruction);
}

/** Used by /demo chat tester for numbered options without WhatsApp */
export function getVilasaSectionReplyText(input) {
  const section = resolveVilasaSection(input);
  if (!section) return null;
  return section.text;
}

export async function handleVilasaInteraction(
  sock,
  jid,
  messageText,
  { sendWithTyping, msg = null } = {}
) {
  const text = String(messageText || '').trim();
  const selectedId = msg ? extractInteractiveSelection(msg) : null;

  // Active site-visit intake takes priority
  if (leadIntakeByJid.has(jid) && text) {
    return handleLeadIntakeStep(sock, jid, text, { sendWithTyping });
  }

  // Button / list selection for Vilasa sections
  if (selectedId && String(selectedId).startsWith('vilasa_')) {
    vilasaSessions.add(jid);
    const section = resolveVilasaSection(selectedId);
    console.log(`🏘 Vilasa section selected: ${selectedId}`);
    await sendVilasaSection(sock, jid, section, { sendWithTyping });
    return true;
  }

  if (!text && !selectedId) return false;

  const inSession = vilasaSessions.has(jid);
  const trigger = isVilasaIntent(text);

  if (trigger) {
    console.log(`🏘 Starting staged Vilasa demo for ${jid}`);
    await startVilasaDemo(sock, jid, { sendWithTyping });
    return true;
  }

  if (!inSession) return false;

  // Escape to GS AI services menu
  if (/^(services|service|help)$/i.test(text)) {
    return false;
  }

  // Re-show numbered menu
  if (/^(menu|options|0|vilasa menu)$/i.test(text)) {
    await sendWithTyping(sock, jid, getVilasaMenuText());
    return true;
  }

  const lower = text.toLowerCase();

  // Brochure link + optional document
  if (/\bbrochure\b/.test(lower)) {
    await sendWithTyping(
      sock,
      jid,
      '📄 *VILASA Project Brochure*\n\n' +
        'Here is the official brochure for your review:\n' +
        `${VILASA_BROCHURE_URL}\n\n` +
        'When you’re ready, reply *4* to schedule a private site visit — or *menu* to explore more.'
    );
    if (fs.existsSync(VILASA_DOCX)) {
      try {
        await sock.sendMessage(jid, {
          document: { url: VILASA_DOCX },
          mimetype:
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          fileName: 'VILASA_Brochure.docx',
          caption: `📄 Also attached. Online copy: ${VILASA_BROCHURE_URL}`,
        });
      } catch (err) {
        console.warn('Vilasa brochure file send skipped:', err?.message || err);
      }
    }
    return true;
  }

  // Staged section via number / short keyword
  const section = resolveVilasaSection(text);
  if (section) {
    console.log(`🏘 Vilasa section via text: ${section.id}`);
    await sendVilasaSection(sock, jid, section, { sendWithTyping });
    return true;
  }

  // Free-form question → AI with brochure context
  console.log(`🏘 Vilasa follow-up for ${jid}: ${text}`);
  const reply = await answerVilasaQuestion(text);
  await sendWithTyping(sock, jid, reply);
  await sendWithTyping(
    sock,
    jid,
    'If you’d like, reply *1–4* to continue exploring, or *4* to book a site visit.'
  );
  return true;
}
