import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const SERVICES_FILE = path.join(__dirname, 'services.txt');

/**
 * Parse root services.txt into structured service objects.
 * Format:
 *   ## Service Name
 *   id: ...
 *   description: ...
 *   pricing:
 *   - item
 *   includes:
 *   - item
 *   notes: ...
 */
export function loadServicesCatalog(filePath = SERVICES_FILE) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`services.txt not found at ${filePath}`);
  }

  const raw = fs.readFileSync(filePath, 'utf8');
  const blocks = raw.split(/\n(?=##\s+)/);
  const services = [];

  for (const block of blocks) {
    const header = block.match(/^##\s+(.+)$/m);
    if (!header) continue;

    const name = header[1].trim();
    const idMatch = block.match(/^id:\s*(.+)$/m);
    const descMatch = block.match(/^description:\s*(.+)$/m);
    const notesMatch = block.match(/^notes:\s*(.+)$/m);

    const pricing = extractList(block, 'pricing');
    const includes = extractList(block, 'includes');
    const id =
      (idMatch?.[1] || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') || slugify(name);

    services.push({
      id,
      name,
      description: (descMatch?.[1] || '').trim(),
      pricing,
      includes,
      notes: (notesMatch?.[1] || '').trim(),
      rowId: `svc_${id}`,
    });
  }

  return services;
}

function extractList(block, key) {
  const regex = new RegExp(`^${key}:\\s*([\\s\\S]*?)(?=^\\w+:|##\\s+|$)`, 'm');
  const match = block.match(regex);
  if (!match) return [];

  return match[1]
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('-'))
    .map((line) => line.replace(/^-+\s*/, '').trim())
    .filter(Boolean);
}

function slugify(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function getServiceByRowId(rowId, catalog = loadServicesCatalog()) {
  return catalog.find((s) => s.rowId === rowId || `svc_${s.id}` === rowId) || null;
}

export function findServiceByText(text, catalog = loadServicesCatalog()) {
  const normalized = String(text || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
  if (!normalized) return null;

  // Numbered selection: "1", "2)" etc.
  const num = normalized.match(/^([1-5])(?:[\).:-]|$)/);
  if (num) {
    const idx = Number(num[1]) - 1;
    return catalog[idx] || null;
  }

  return (
    catalog.find((s) => normalized.includes(s.name.toLowerCase())) ||
    catalog.find((s) => normalized.includes(s.id.replace(/-/g, ' '))) ||
    null
  );
}

export function formatServiceDetails(service) {
  if (!service) return 'Sorry, that service was not found. Type *services* to see the menu.';

  const lines = [
    `*${service.name}*`,
    service.description,
    '',
    '*Pricing*',
    ...(service.pricing.length ? service.pricing.map((p) => `• ${p}`) : ['• Contact us for a custom quote']),
  ];

  if (service.includes?.length) {
    lines.push('', '*Includes*', ...service.includes.map((i) => `• ${i}`));
  }

  if (service.notes) {
    lines.push('', `_Note: ${service.notes}_`);
  }

  lines.push('', 'Reply *services* to view the full menu again.');
  return lines.join('\n');
}

export function formatTextMenu(catalog = loadServicesCatalog()) {
  const lines = [
    '*GS AI Solutions — Service Menu*',
    'Choose a service to view pricing:',
    '',
    ...catalog.map((s, i) => `${i + 1}) ${s.name}`),
    '',
    'Reply with a number (1-5) or the service name.',
  ];
  return lines.join('\n');
}

export function isServicesMenuIntent(text) {
  const t = String(text || '')
    .toLowerCase()
    .replace(/[!?.]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!t) return false;

  const exact = new Set([
    'services',
    'service',
    'price',
    'prices',
    'pricing',
    'menu',
    'help',
    'packages',
    'plans',
  ]);

  if (exact.has(t)) return true;

  return (
    /\b(services?|pricing|packages?|plans?)\b/.test(t) &&
    /\b(list|show|menu|price|pricing|help|what|view)\b/.test(t)
  );
}

export function buildListMessageContent(catalog = loadServicesCatalog()) {
  return {
    text: 'Please choose a service to view pricing and details.',
    footer: 'GS AI Solutions',
    title: 'Our Services',
    buttonText: 'View Services',
    sections: [
      {
        title: 'Service Categories',
        rows: catalog.map((s) => ({
          title: s.name.slice(0, 24),
          rowId: s.rowId,
          description: (s.description || '').slice(0, 72),
        })),
      },
    ],
  };
}

export function buildButtonsMessageContent(catalog = loadServicesCatalog()) {
  // WhatsApp allows a limited number of quick-reply buttons
  const top = catalog.slice(0, 3);
  return {
    text:
      'Tap a service below, or type *menu* for the full list.\n\n' +
      catalog.map((s, i) => `${i + 1}) ${s.name}`).join('\n'),
    footer: 'GS AI Solutions',
    buttons: top.map((s) => ({
      buttonId: s.rowId,
      buttonText: { displayText: s.name.slice(0, 20) },
      type: 1,
    })),
    headerType: 1,
  };
}
