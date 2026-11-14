import {
  phoneFromJid,
  upsertUserSession,
  loadUserSession,
} from './db.js';

/** Isolated in-memory chat state keyed by WhatsApp JID */
const sessions = new Map();
const queues = new Map();

function blankSession(jid) {
  return {
    jid,
    phone: phoneFromJid(jid),
    tracked: false,
    automationEnabled: true,
    isPaused: false,
    pausedUntil: null,
    vilasaActive: false,
    leadIntake: null,
    lastSeen: new Date().toISOString(),
  };
}

export function getUserSession(jid) {
  const key = String(jid || '');
  if (!key) return blankSession('');
  if (!sessions.has(key)) {
    sessions.set(key, blankSession(key));
  }
  return sessions.get(key);
}

export function updateUserSession(jid, patch = {}) {
  const session = getUserSession(jid);
  Object.assign(session, patch, {
    phone: session.phone || phoneFromJid(jid),
    lastSeen: new Date().toISOString(),
  });
  upsertUserSession(session).catch((err) => {
    console.warn('user_sessions persist skipped:', err?.message || err);
  });
  return session;
}

export async function hydrateUserSession(jid) {
  const session = getUserSession(jid);
  if (session._hydrated) return session;
  try {
    const row = await loadUserSession(jid);
    if (row) {
      Object.assign(session, {
        tracked: Boolean(row.tracked),
        automationEnabled: row.automation_enabled !== false,
        isPaused: Boolean(row.is_paused),
        pausedUntil: row.paused_until || null,
        vilasaActive: Boolean(row.vilasa_active),
        leadIntake: row.lead_intake || null,
        phone: row.phone || session.phone,
      });
    }
  } catch (err) {
    console.warn('user_sessions hydrate skipped:', err?.message || err);
  }
  session._hydrated = true;
  return session;
}

export function markTracked(jid) {
  return updateUserSession(jid, { tracked: true, automationEnabled: true });
}

export function setAutomationEnabled(jid, enabled) {
  if (enabled) return resumeAutomation(jid);
  return pauseAutomation(jid, { until: null, reason: 'manual' });
}

export function pauseAutomation(jid, { until = null, reason = 'manual' } = {}) {
  console.log(`⏸️ Automation paused for ${jid} (${reason})`);
  return updateUserSession(jid, {
    isPaused: true,
    pausedUntil: until,
    automationEnabled: false,
  });
}

export function resumeAutomation(jid) {
  console.log(`▶️ Automation resumed for ${jid}`);
  return updateUserSession(jid, {
    isPaused: false,
    pausedUntil: null,
    automationEnabled: true,
  });
}

export function isPaused(jid) {
  const session = getUserSession(jid);
  if (!session.isPaused && session.automationEnabled !== false) return false;
  if (session.pausedUntil) {
    const until = new Date(session.pausedUntil).getTime();
    if (Number.isFinite(until) && Date.now() > until) {
      resumeAutomation(jid);
      return false;
    }
  }
  return session.isPaused || session.automationEnabled === false;
}

export function isAutomationActive(jid) {
  return !isPaused(jid);
}

export const HUMAN_HANDOVER_MS = 30 * 60 * 1000;

export function setVilasaActive(jid, active = true) {
  return updateUserSession(jid, { vilasaActive: Boolean(active) });
}

export function isVilasaActive(jid) {
  return Boolean(getUserSession(jid).vilasaActive);
}

export function setLeadIntake(jid, leadIntake) {
  return updateUserSession(jid, { leadIntake: leadIntake || null });
}

export function getLeadIntake(jid) {
  return getUserSession(jid).leadIntake || null;
}

export function clearLeadIntake(jid) {
  return updateUserSession(jid, { leadIntake: null });
}

/**
 * Serialize handlers for one JID so concurrent messages from the same
 * user cannot mix Vilasa lead-intake / menu state. Other users run in parallel.
 */
export async function withUserLock(jid, fn) {
  const key = String(jid || 'unknown');
  const run = (queues.get(key) || Promise.resolve()).then(fn, fn);
  queues.set(
    key,
    run.then(
      () => undefined,
      () => undefined
    )
  );
  return run;
}

export { phoneFromJid };
