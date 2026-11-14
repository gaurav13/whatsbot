/** Shared logout/reset hook between Express UI and Baileys socket */

let logoutHandler = null;
let logoutInProgress = false;

export function setLogoutHandler(handler) {
  logoutHandler = handler;
}

export function isLogoutInProgress() {
  return logoutInProgress;
}

export function setLogoutInProgress(value) {
  logoutInProgress = Boolean(value);
}

export async function requestLogout(tenantId = null) {
  if (!logoutHandler) {
    throw new Error('WhatsApp socket is not ready yet');
  }
  if (logoutInProgress) {
    return { ok: true, message: 'Logout already in progress' };
  }
  return logoutHandler(tenantId);
}
