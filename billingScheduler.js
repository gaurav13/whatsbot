import { expireOverduePlans, resetDueMonthlyQuotas } from './db.js';

const DAY_MS = 24 * 60 * 60 * 1000;
let timer = null;

export async function runBillingCycle() {
  const expired = await expireOverduePlans();
  if (expired.length) {
    console.log(
      `📅 Expired ${expired.length} tenant plan(s): ${expired.map((t) => t.email).join(', ')}`
    );
  }

  const reset = await resetDueMonthlyQuotas();
  if (reset.length) {
    console.log(
      `♻️ Reset monthly quota for ${reset.length} tenant(s): ${reset.map((t) => t.email).join(', ')}`
    );
  }

  if (!expired.length && !reset.length) {
    console.log('📅 Billing cycle check: no expiries or quota resets');
  }

  return { expired: expired.length, reset: reset.length };
}

export function startBillingScheduler() {
  if (timer) return timer;
  runBillingCycle().catch((err) =>
    console.warn('Billing cycle (boot) skipped:', err?.message || err)
  );
  timer = setInterval(() => {
    runBillingCycle().catch((err) =>
      console.warn('Billing cycle skipped:', err?.message || err)
    );
  }, DAY_MS);
  if (typeof timer.unref === 'function') timer.unref();
  console.log('📅 Billing scheduler started (every 24h + on boot)');
  return timer;
}
