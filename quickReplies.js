import { normalizeBusinessCategory } from './tenantCatalog.js';

const MAX_BUTTONS = 4;

function button(number, label, keywords, reply, link = '') {
  return {
    id: `opt_${number}`,
    number,
    label,
    keywords,
    reply,
    link,
  };
}

export const QUICK_REPLY_PRESETS = {
  real_estate: {
    id: 'real_estate',
    label: 'Real Estate & Property',
    welcome_extra: 'Reply with a number (1–4) or type a topic — for example *price* or *visit*.',
    buttons: [
      button(
        1,
        'Price & Config',
        ['price', 'pricing', 'cost', 'config', 'configuration', 'bhk', 'rate'],
        'Here are our current configurations and starting prices.\n\nEdit this text in your dashboard to add your actual rates, unit sizes, and payment plans.',
        ''
      ),
      button(
        2,
        'Amenities',
        ['amenities', 'amenity', 'club', 'pool', 'lifestyle', 'gym', 'park'],
        'Here is a snapshot of lifestyle amenities.\n\nEdit this reply with your clubhouse, pool, parking, and other highlights.',
        ''
      ),
      button(
        3,
        'Floor Plans',
        ['floor', 'floors', 'plan', 'plans', 'layout', 'brochure'],
        'We can share floor plans and a brochure.\n\nAdd a Google Drive / website link below so customers can open it in one tap.',
        ''
      ),
      button(
        4,
        'Site Visit',
        ['visit', 'site visit', 'tour', 'booking', 'schedule', 'appointment'],
        'We would love to host you for a site visit.\n\nReply with your name, phone, and a preferred date/time, and our team will confirm.',
        ''
      ),
    ],
  },
  it_software: {
    id: 'it_software',
    label: 'IT & Software Agency',
    welcome_extra: 'Reply 1–4, or type *services*, *pricing*, or *demo*.',
    buttons: [
      button(1, 'Services', ['services', 'service', 'what do you do', 'offer'], 'We build websites, WhatsApp automation, and digital growth systems.\n\nEdit this list to match what you actually sell.'),
      button(2, 'Pricing', ['price', 'pricing', 'cost', 'packages', 'quote'], 'Packages start from a monthly retainer. Share your requirement and we will send a quote.\n\nReplace this with your real packages.'),
      button(3, 'Portfolio', ['portfolio', 'work', 'case study', 'examples'], 'Here are recent projects we can share.\n\nPaste a portfolio URL in the link field.'),
      button(4, 'Book a Call', ['call', 'meeting', 'demo', 'book', 'contact'], 'Tell us your name, company, and a time that works. We will schedule a call.'),
    ],
  },
  ecommerce: {
    id: 'ecommerce',
    label: 'E-Commerce & Retail',
    welcome_extra: 'Reply 1–4 or ask about a product, order, or offer.',
    buttons: [
      button(1, 'Shop / Catalog', ['shop', 'catalog', 'products', 'store'], 'Browse our latest products here.\n\nAdd your store URL in the link field.'),
      button(2, 'Offers', ['offer', 'offers', 'discount', 'sale', 'deal'], 'Current offers:\n\nEdit this with today’s discounts or coupon codes.'),
      button(3, 'Order Status', ['order', 'status', 'track', 'delivery', 'shipping'], 'Please send your order ID or phone number used at checkout. We will check the status.'),
      button(4, 'Support', ['support', 'help', 'return', 'refund', 'complaint'], 'How can we help? Share a short description of the issue and we will assist.'),
    ],
  },
  healthcare: {
    id: 'healthcare',
    label: 'Healthcare & Clinic',
    welcome_extra: 'Reply 1–4 or type *appointment*.',
    buttons: [
      button(1, 'Services', ['service', 'services', 'treatment', 'doctor'], 'We offer consultations and listed treatments.\n\nEdit this with your specialties.'),
      button(2, 'Timings', ['time', 'timing', 'hours', 'open', 'closed'], 'Clinic hours:\nMon–Sat, 9:00 AM – 7:00 PM\n\nUpdate this to your real schedule.'),
      button(3, 'Book Appointment', ['appointment', 'book', 'booking', 'slot'], 'Share your name, phone, and a preferred date/time. We will confirm the slot.'),
      button(4, 'Location', ['location', 'address', 'map', 'where'], 'Here is how to reach us.\n\nAdd Google Maps in the link field.'),
    ],
  },
  gym: {
    id: 'gym',
    label: 'Gym & Fitness',
    welcome_extra: 'Reply 1–4 or ask about membership.',
    buttons: [
      button(1, 'Memberships', ['membership', 'join', 'plans', 'fees', 'price'], 'Membership plans:\n\nEdit this with monthly / quarterly / annual fees.'),
      button(2, 'Timings', ['time', 'timing', 'hours', 'open'], 'Open daily 6:00 AM – 10:00 PM.\n\nUpdate to your hours.'),
      button(3, 'Classes', ['class', 'classes', 'pt', 'trainer', 'yoga', 'zumba'], 'Group classes and PT slots are available.\n\nList your weekly class timetable here.'),
      button(4, 'Free Trial', ['trial', 'demo', 'visit', 'tour'], 'We offer a complimentary trial session. Share your name and a preferred time.'),
    ],
  },
  restaurant: {
    id: 'restaurant',
    label: 'Restaurant & Food',
    welcome_extra: 'Reply 1–4 or type *menu* / *book*.',
    buttons: [
      button(1, 'Menu', ['menu', 'food', 'dishes'], 'Here is our menu.\n\nAdd a menu PDF or website link.'),
      button(2, 'Today’s Specials', ['special', 'specials', 'today', 'offer'], 'Today’s specials:\n\nUpdate this daily if you like.'),
      button(3, 'Reservations', ['book', 'booking', 'table', 'reserve', 'reservation'], 'Share date, time, and party size. We will confirm your table.'),
      button(4, 'Location / Hours', ['location', 'address', 'hours', 'open', 'where'], 'Find us and our opening hours here.\n\nAdd Maps in the link field.'),
    ],
  },
  education: {
    id: 'education',
    label: 'Education & Coaching',
    welcome_extra: 'Reply 1–4 or ask about a course.',
    buttons: [
      button(1, 'Courses', ['course', 'courses', 'class', 'program'], 'Courses we offer:\n\nList batches and subjects here.'),
      button(2, 'Fees', ['fee', 'fees', 'price', 'pricing', 'admission'], 'Fee details:\n\nAdd your actual fee structure.'),
      button(3, 'Timings', ['time', 'timing', 'batch', 'schedule'], 'Batch timings:\n\nUpdate with morning / evening slots.'),
      button(4, 'Enquire / Admit', ['enquire', 'inquiry', 'admission', 'join', 'enroll'], 'Share student name, class/course, and a phone number. We will call you back.'),
    ],
  },
  travel: {
    id: 'travel',
    label: 'Tour & Travels',
    welcome_extra: 'Reply 1–4 or tell us your destination.',
    buttons: [
      button(1, 'Packages', ['package', 'packages', 'tour', 'tours', 'trip'], 'Popular packages:\n\nEdit with destinations and durations.'),
      button(2, 'Pricing', ['price', 'pricing', 'cost', 'quote'], 'Prices depend on dates and group size. Share destination + travel dates for a quote.'),
      button(3, 'Itinerary', ['itinerary', 'plan', 'schedule', 'days'], 'Sample itinerary:\n\nAdd a day-wise plan or a brochure link.'),
      button(4, 'Book / Enquiry', ['book', 'booking', 'enquiry', 'inquiry'], 'Share names, destination, dates, and a phone number. We will confirm availability.'),
    ],
  },
  general: {
    id: 'general',
    label: 'General Business',
    welcome_extra: 'Reply with a number (1–4) or type what you need.',
    buttons: [
      button(1, 'About Us', ['about', 'who', 'company'], 'A short introduction to our business.\n\nReplace this with who you are and who you serve.'),
      button(2, 'Services', ['service', 'services', 'offer', 'what do you do'], 'What we offer:\n\nList 3–5 services in plain language.'),
      button(3, 'Pricing', ['price', 'pricing', 'cost', 'quote'], 'Pricing overview:\n\nAdd starting prices or “ask for a quote”.'),
      button(4, 'Contact', ['contact', 'call', 'phone', 'whatsapp', 'address'], 'How to reach us:\n\nAdd phone, hours, and an optional map link.'),
    ],
  },
};

export function getQuickReplyPreset(category) {
  const id = normalizeBusinessCategory(category);
  return QUICK_REPLY_PRESETS[id] || QUICK_REPLY_PRESETS.general;
}

export function emptyQuickReplies(category = 'general') {
  return {
    enabled: false,
    preset: normalizeBusinessCategory(category),
    welcome_extra: '',
    buttons: [1, 2, 3, 4].map((n) => ({
      id: `opt_${n}`,
      number: n,
      label: '',
      keywords: [],
      reply: '',
      link: '',
    })),
  };
}

function asKeywords(value) {
  if (Array.isArray(value)) {
    return value
      .map((k) => String(k || '').toLowerCase().trim())
      .filter(Boolean)
      .slice(0, 12);
  }
  return String(value || '')
    .split(/[,|]/)
    .map((k) => k.toLowerCase().trim())
    .filter(Boolean)
    .slice(0, 12);
}

export function normalizeQuickReplies(raw, category = 'general') {
  const fallback = emptyQuickReplies(category);
  const src = raw && typeof raw === 'object' ? raw : {};
  const buttonsIn = Array.isArray(src.buttons) ? src.buttons : [];
  const buttons = [1, 2, 3, 4].map((n) => {
    const row = buttonsIn.find((b) => Number(b?.number) === n) || buttonsIn[n - 1] || {};
    const label = String(row.label || row.title || '').trim().slice(0, 40);
    return {
      id: String(row.id || `opt_${n}`).slice(0, 40),
      number: n,
      label,
      keywords: asKeywords(row.keywords || row.aliases),
      reply: String(row.reply || row.text || '').trim().slice(0, 4000),
      link: String(row.link || row.url || '').trim().slice(0, 500),
    };
  });
  return {
    enabled: Boolean(src.enabled),
    preset: normalizeBusinessCategory(src.preset || category),
    welcome_extra: String(src.welcome_extra || src.welcomeExtra || '').trim().slice(0, 400),
    buttons,
  };
}

export function activeQuickReplyButtons(config) {
  return (config?.buttons || []).filter((b) => b.label && b.reply);
}

export function isQuickRepliesEnabled(tenant) {
  if (!tenant || tenant.is_platform) return false;
  const cfg = normalizeQuickReplies(tenant.quick_replies, tenant.business_category);
  return cfg.enabled && activeQuickReplyButtons(cfg).length > 0;
}

export function formatQuickReplyMenu(tenant, config = null) {
  const cfg = config || normalizeQuickReplies(tenant?.quick_replies, tenant?.business_category);
  const buttons = activeQuickReplyButtons(cfg);
  if (!buttons.length) return '';
  const name = String(tenant?.business_name || 'us').trim() || 'us';
  const extra = cfg.welcome_extra || 'Reply with a number or the option name.';
  return [
    `*${name} — Quick options*`,
    extra,
    '',
    ...buttons.map((b) => `${b.number}) ${b.label}`),
    '',
    'Reply *menu* anytime to see this list again.',
  ].join('\n');
}

export function formatQuickReplyAnswer(button) {
  if (!button) return '';
  const link = button.link ? `\n\n🔗 ${button.link}` : '';
  return `${button.reply}${link}\n\nReply *menu* for more options.`.trim();
}

export function formatWelcomeWithQuickReplies(welcome, tenant) {
  const menu = formatQuickReplyMenu(tenant);
  if (!menu) return welcome;
  return `${welcome}\n\n${menu}`;
}

function isMenuRequest(text) {
  const t = String(text || '')
    .toLowerCase()
    .replace(/[!?.]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return /^(menu|options|option|0|help)$/i.test(t);
}

export function matchQuickReply(input, config, { selectedId = null } = {}) {
  const cfg = normalizeQuickReplies(config);
  const buttons = activeQuickReplyButtons(cfg);
  if (!buttons.length) return null;

  const id = String(selectedId || '').trim();
  if (id) {
    const byId = buttons.find((b) => b.id === id || `opt_${b.number}` === id);
    if (byId) return { type: 'button', button: byId };
  }

  const raw = String(input || '').trim();
  if (!raw) return null;
  if (isMenuRequest(raw)) return { type: 'menu' };

  let normalized = raw.toLowerCase().replace(/\s+/g, ' ').trim();
  for (const [emoji, digit] of [
    ['1️⃣', '1'],
    ['2️⃣', '2'],
    ['3️⃣', '3'],
    ['4️⃣', '4'],
  ]) {
    if (normalized.startsWith(emoji)) {
      normalized = digit + normalized.slice(emoji.length).trim();
      break;
    }
  }

  const num = normalized.match(/^([1-4])(?:[\).:\-\s]|$)(.*)$/);
  if (num) {
    const n = Number(num[1]);
    const rest = String(num[2] || '').trim();
    const button = buttons.find((b) => b.number === n);
    if (button && (!rest || rest.length < 24)) return { type: 'button', button };
  }

  for (const button of buttons) {
    const label = button.label.toLowerCase();
    if (label && (normalized === label || normalized.includes(label))) {
      return { type: 'button', button };
    }
    for (const kw of button.keywords) {
      if (!kw) continue;
      if (kw.length <= 2) {
        if (normalized === kw) return { type: 'button', button };
        continue;
      }
      if (normalized === kw || normalized.includes(kw)) return { type: 'button', button };
      if (normalized.length >= 3 && kw.includes(normalized)) return { type: 'button', button };
    }
  }
  return null;
}

export function quickReplyMenuOptions(tenant) {
  const cfg = normalizeQuickReplies(tenant?.quick_replies, tenant?.business_category);
  return activeQuickReplyButtons(cfg).map((b) => ({
    index: b.number,
    id: String(b.number),
    title: `${b.number} ${b.label}`,
    description: b.label,
  }));
}

export function listQuickReplyPresetSummaries() {
  return Object.values(QUICK_REPLY_PRESETS).map((p) => ({
    id: p.id,
    label: p.label,
    buttons: p.buttons.map((b) => b.label),
  }));
}
