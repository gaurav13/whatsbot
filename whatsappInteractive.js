import {
  generateWAMessageFromContent,
  proto,
} from '@whiskeysockets/baileys';
import {
  loadServicesCatalog,
  formatTextMenu,
} from './servicesCatalog.js';

/**
 * Baileys 6.x ignores top-level `sections` / `buttons` when `text` is present
 * (it collapses to extendedTextMessage). We must relay explicit proto payloads.
 */

/**
 * Generic interactive menu sender — reusable for services, property demos, etc.
 * @param {object} sock Baileys socket
 * @param {string} jid chat jid
 * @param {object} options
 * @param {string} options.title
 * @param {string} options.body
 * @param {string} [options.footer]
 * @param {string} [options.buttonText]
 * @param {Array<{id:string,title:string,description?:string}>} options.rows
 * @param {string} [options.textFallback]
 */
export async function sendInteractiveMenu(sock, jid, options) {
  const {
    title = 'Menu',
    body = 'Please choose an option:',
    footer = 'GS AI Solutions',
    buttonText = 'View Options',
    sectionTitle = 'Options',
    rows = [],
    textFallback = null,
  } = options;

  const normalizedRows = rows.map((r) => ({
    id: r.id || r.rowId,
    title: String(r.title || '').slice(0, 24),
    description: String(r.description || '').slice(0, 72),
  }));

  const fallback =
    textFallback ||
    [
      `*${title}*`,
      body,
      '',
      ...normalizedRows.map((r, i) => `${i + 1}) ${r.title}`),
      '',
      'Reply with a number or option name.',
    ].join('\n');

  if (sock?.__evolution) {
    await sock.sendMessage(jid, { text: fallback });
    console.log(`📝 Sent Evolution text menu "${title}" to ${jid}`);
    return { type: 'text' };
  }

  // 1) Modern interactive list (nativeFlow single_select)
  try {
    await relayNativeSingleSelect(sock, jid, {
      title,
      body,
      footer,
      buttonText,
      sectionTitle,
      rows: normalizedRows,
    });
    console.log(`📋 Sent interactive menu "${title}" to ${jid}`);
    return { type: 'interactive_list' };
  } catch (err) {
    console.warn('Interactive list failed:', err?.message || err);
  }

  // 2) Legacy listMessage proto
  try {
    await relayLegacyListMessage(sock, jid, {
      title,
      body,
      footer,
      buttonText,
      sectionTitle,
      rows: normalizedRows,
    });
    console.log(`📋 Sent legacy listMessage "${title}" to ${jid}`);
    return { type: 'listMessage' };
  } catch (err) {
    console.warn('Legacy listMessage failed:', err?.message || err);
  }

  // 3) Legacy buttonsMessage proto (max 3)
  try {
    await relayLegacyButtonsMessage(sock, jid, {
      body,
      footer,
      rows: normalizedRows,
    });
    console.log(`🔘 Sent legacy buttonsMessage "${title}" to ${jid}`);
    return { type: 'buttonsMessage' };
  } catch (err) {
    console.warn('Legacy buttonsMessage failed:', err?.message || err);
  }

  // 4) Numbered text fallback
  await sock.sendMessage(jid, { text: fallback });
  console.log(`📝 Sent text menu fallback "${title}" to ${jid}`);
  return { type: 'text' };
}

export async function sendInteractiveServicesMenu(sock, jid) {
  const catalog = loadServicesCatalog();
  return sendInteractiveMenu(sock, jid, {
    title: 'Our Services',
    body: 'Please choose a service to view pricing and details.',
    footer: 'GS AI Solutions',
    buttonText: 'View Services',
    sectionTitle: 'Service Categories',
    rows: catalog.map((s) => ({
      id: s.rowId,
      title: s.name,
      description: s.description,
    })),
    textFallback: formatTextMenu(catalog),
  });
}

async function relayNativeSingleSelect(sock, jid, cfg) {
  const sections = [
    {
      title: cfg.sectionTitle,
      rows: cfg.rows.map((r) => ({
        header: r.title,
        title: r.title,
        description: r.description,
        id: r.id,
      })),
    },
  ];

  const interactiveMsg = {
    viewOnceMessage: {
      message: {
        messageContextInfo: {
          deviceListMetadata: {},
          deviceListMetadataVersion: 2,
        },
        interactiveMessage: proto.Message.InteractiveMessage.create({
          body: proto.Message.InteractiveMessage.Body.create({
            text: cfg.body,
          }),
          footer: proto.Message.InteractiveMessage.Footer.create({
            text: cfg.footer,
          }),
          header: proto.Message.InteractiveMessage.Header.create({
            title: cfg.title,
            subtitle: 'Tap below to open the menu',
            hasMediaAttachment: false,
          }),
          nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.create({
            buttons: [
              {
                name: 'single_select',
                buttonParamsJson: JSON.stringify({
                  title: cfg.buttonText,
                  sections,
                }),
              },
            ],
          }),
        }),
      },
    },
  };

  const msg = generateWAMessageFromContent(jid, interactiveMsg, {
    userJid: sock.user?.id,
  });

  await sock.relayMessage(jid, msg.message, { messageId: msg.key.id });
}

async function relayLegacyListMessage(sock, jid, cfg) {
  const listMessage = {
    title: cfg.title,
    description: cfg.body,
    buttonText: cfg.buttonText,
    footerText: cfg.footer,
    listType: 1, // SINGLE_SELECT
    sections: [
      {
        title: cfg.sectionTitle,
        rows: cfg.rows.map((r) => ({
          title: r.title,
          description: r.description,
          rowId: r.id,
        })),
      },
    ],
  };

  const msg = generateWAMessageFromContent(
    jid,
    { listMessage },
    { userJid: sock.user?.id }
  );
  await sock.relayMessage(jid, msg.message, { messageId: msg.key.id });
}

async function relayLegacyButtonsMessage(sock, jid, cfg) {
  const top = cfg.rows.slice(0, 3);
  const buttonsMessage = {
    contentText:
      `${cfg.body}\n\n` +
      cfg.rows.map((r, i) => `${i + 1}) ${r.title}`).join('\n'),
    footerText: cfg.footer,
    headerType: 1,
    buttons: top.map((r) => ({
      buttonId: r.id,
      buttonText: { displayText: r.title.slice(0, 20) },
      type: 1,
    })),
  };

  const msg = generateWAMessageFromContent(
    jid,
    { buttonsMessage },
    { userJid: sock.user?.id }
  );
  await sock.relayMessage(jid, msg.message, { messageId: msg.key.id });
}

/**
 * Normalize interactive reply payloads from list/button/native-flow messages.
 */
export function extractInteractiveSelection(msg) {
  const listId = msg.message?.listResponseMessage?.singleSelectReply?.selectedRowId;
  if (listId) return listId;

  const buttonId = msg.message?.buttonsResponseMessage?.selectedButtonId;
  if (buttonId) return buttonId;

  const templateId = msg.message?.templateButtonReplyMessage?.selectedId;
  if (templateId) return templateId;

  const native =
    msg.message?.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson;
  if (native) {
    try {
      const parsed = JSON.parse(native);
      return (
        parsed?.id ||
        parsed?.selectedId ||
        parsed?.rowId ||
        parsed?.selectedRowId ||
        parsed?.params?.id ||
        null
      );
    } catch {
      return null;
    }
  }

  return null;
}
