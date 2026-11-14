import {
  insertTenantLead,
  findRecentTenantLead,
  phoneFromJid,
} from './db.js';

export function parseContactDetails(text) {
  const raw = String(text || '').trim();
  const phoneMatch = raw.match(/(\+?\d[\d\s\-()]{8,}\d)/);
  const phone = phoneMatch ? phoneMatch[1].replace(/[^\d+]/g, '') : '';
  let name = raw
    .replace(phoneMatch?.[0] || '', '')
    .replace(/[,|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!name || name.length < 2) name = '';
  return { name, phone, raw };
}

export function looksLikeContactMessage(text) {
  const parsed = parseContactDetails(text);
  const digits = String(parsed.phone || '').replace(/\D/g, '');
  if (digits.length < 10 || digits.length > 15) return false;
  if (/^(menu|stop|pause|start|resume|hi|hello|demo)$/i.test(String(text || '').trim())) {
    return false;
  }
  return true;
}

export function toUserJid(value) {
  const raw = String(value || '').trim();
  if (!raw || raw.endsWith('@g.us') || raw === 'status@broadcast') return null;

  if (raw.includes('@')) {
    const [user] = raw.split('@');
    const num = String(user || '')
      .split(':')[0]
      .replace(/\D/g, '');
    if (num.length < 10) return null;
    return `${num}@s.whatsapp.net`;
  }

  let digits = raw.replace(/\D/g, '');
  if (digits.startsWith('0')) digits = digits.slice(1);
  if (digits.length === 10) digits = `91${digits}`;
  if (digits.length < 10 || digits.length > 15) return null;
  return `${digits}@s.whatsapp.net`;
}

function ownerAlertJid(tenant, sock, customerJid) {
  const customer = toUserJid(customerJid);
  const explicit = toUserJid(tenant?.alert_phone);
  if (explicit && explicit !== customer) return explicit;

  const linked = toUserJid(tenant?.linked_whatsapp || sock?.user?.id);
  if (linked && linked !== customer) return linked;

  return explicit || linked || null;
}

function formatLeadAlert(tenant, lead) {
  const details = lead.lead_details || {};
  const extra = [
    details.preferredDate ? `📅 Date: ${details.preferredDate}` : '',
    details.preferredTime ? `⏰ Time: ${details.preferredTime}` : '',
    details.source ? `🏷️ Source: ${details.source}` : '',
    details.project ? `📍 Project: ${details.project}` : '',
    details.message ? `💬 Message: ${details.message}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  return [
    `🔔 *New lead — ${tenant?.business_name || 'Your business'}*`,
    '',
    `👤 Name: ${lead.customer_name || '—'}`,
    `📞 Phone: ${lead.customer_phone || '—'}`,
    extra,
    '',
    '_Open your dashboard to view or export leads._',
  ]
    .filter(Boolean)
    .join('\n');
}

export async function notifyOwnerOfLead({ tenant, sock, lead, customerJid }) {
  if (!sock?.sendMessage || !tenant) return false;
  const dest = ownerAlertJid(tenant, sock, customerJid);
  if (!dest) {
    console.warn(
      `⚠️ Lead saved but no owner alert number for tenant ${tenant.id}. Set Alert phone on /dashboard.`
    );
    return false;
  }
  try {
    await sock.sendMessage(dest, { text: formatLeadAlert(tenant, lead) });
    console.log(`📣 Lead alert sent to ${dest}`);
    return true;
  } catch (err) {
    console.warn('Lead alert failed:', err?.message || err);
    return false;
  }
}

export async function captureLead({
  tenant,
  sock,
  customerJid,
  customerName = '',
  customerPhone = '',
  details = {},
  source = 'whatsapp',
  dedupeHours = 0,
} = {}) {
  if (!tenant?.id) return null;

  const phone =
    String(customerPhone || '').replace(/[^\d+]/g, '') || phoneFromJid(customerJid) || null;
  const name = String(customerName || '').trim() || null;

  if (dedupeHours && phone) {
    const existing = await findRecentTenantLead({
      tenantId: tenant.id,
      customerPhone: phone,
      withinHours: dedupeHours,
    });
    if (existing) return existing;
  }

  const row = await insertTenantLead({
    tenantId: tenant.id,
    customerPhone: phone,
    customerName: name,
    leadDetails: {
      ...details,
      source,
      customer_jid: customerJid || null,
    },
  });

  if (row) {
    console.log(
      `🧾 Lead #${row.id} tenant=${tenant.id} ${name || 'Guest'} ${phone || 'n/a'}`
    );
    notifyOwnerOfLead({ tenant, sock, lead: row, customerJid }).catch(() => {});
  }
  return row;
}

export async function maybeCaptureContactFromMessage({
  tenant,
  sock,
  jid,
  text,
  skip = false,
} = {}) {
  if (skip || !tenant?.id || !looksLikeContactMessage(text)) return null;
  const parsed = parseContactDetails(text);
  return captureLead({
    tenant,
    sock,
    customerJid: jid,
    customerName: parsed.name,
    customerPhone: parsed.phone,
    details: { message: String(text || '').slice(0, 1000), source: 'contact_message' },
    source: 'contact_message',
    dedupeHours: 6,
  });
}

export function leadsToCsv(leads = []) {
  const header = [
    'id',
    'created_at',
    'customer_name',
    'customer_phone',
    'source',
    'lead_details',
  ];
  const lines = [header.join(',')];
  for (const lead of leads) {
    const details =
      typeof lead.lead_details === 'string'
        ? lead.lead_details
        : JSON.stringify(lead.lead_details || {});
    const source =
      (lead.lead_details && lead.lead_details.source) ||
      (typeof lead.lead_details === 'object' ? lead.lead_details?.source : '') ||
      '';
    const created =
      lead.created_at instanceof Date
        ? lead.created_at.toISOString()
        : lead.created_at || '';
    lines.push(
      [
        csvCell(lead.id),
        csvCell(created),
        csvCell(lead.customer_name),
        csvCell(lead.customer_phone),
        csvCell(source),
        csvCell(details),
      ].join(',')
    );
  }
  return `${lines.join('\n')}\n`;
}

function csvCell(value) {
  const text = value == null ? '' : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}
