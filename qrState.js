/** Shared WhatsApp QR / connection state for the local web UI */

let latestQr = null;
let latestQrDataUrl = null;
let connectionStatus = 'starting';
let lastUpdated = null;

export function setConnectionStatus(status) {
  connectionStatus = status;
  lastUpdated = new Date().toISOString();
}

export function setQr(qr, dataUrl) {
  latestQr = qr;
  latestQrDataUrl = dataUrl;
  connectionStatus = qr ? 'waiting_for_scan' : connectionStatus;
  lastUpdated = new Date().toISOString();
}

export function clearQr(status = 'connected') {
  latestQr = null;
  latestQrDataUrl = null;
  connectionStatus = status;
  lastUpdated = new Date().toISOString();
}

export function getQrState() {
  return {
    connectionStatus,
    hasQr: Boolean(latestQrDataUrl),
    qrDataUrl: latestQrDataUrl,
    lastUpdated,
  };
}
