/* Shared Lagos Life (Vatar Games server API) helpers for /api/vatar and /api/vatar-webhook. */
'use strict';

const { redis } = require('./_lib');

const API = 'https://lagoslife.app/api/games/v1';
// Same ids as PRODUCTS in js/lcd.js; everything_bundle unlocks the other four on the client.
const PRODUCTS = new Set(['console_pack', 'crt_screen', 'mascot_outfits', 'daily_archive', 'everything_bundle']);
const isPurchaseId = (id) => typeof id === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(id);

// VATAR_SECRET as Lagos Life names it, plus VATAR_LIVE_SECRET once approved; picked by prefix.
const secretFor = (mode) => [process.env.VATAR_SECRET, process.env.VATAR_TEST_SECRET, process.env.VATAR_LIVE_SECRET]
  .find((k) => k && k.startsWith(`vtr_${mode}_`)) || '';

// One listing, so a player's extras are keyed by mode and their per-game player id.
const ownKey = (mode, playerId) => `vt:own:${mode}:${playerId}`;

async function vatar(secret, method, path, body, fetchImpl = fetch) {
  const r = await fetchImpl(API + path, {
    method,
    headers: { Authorization: `Bearer ${secret}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(data.error || `vatar ${r.status}`), { status: r.status, code: data.error });
  return data;
}

/* Check a purchase with Vatar and act on it: grant and deliver when paid, take back when refunded.
   Ownership is a set and delivering is safe to repeat, so handling the same purchase twice changes nothing.
   Returns false when the purchase is not this player's, not this mode's, or not something we sell. */
async function settlePurchase(secret, mode, id, playerId, fetchImpl = fetch) {
  const p = await vatar(secret, 'GET', `/purchases/${encodeURIComponent(id)}`, null, fetchImpl);
  if ((playerId && p.playerId !== playerId) || p.mode !== mode || !PRODUCTS.has(p.productId)) return false;
  const own = ownKey(mode, p.playerId);
  if (p.status === 'refunded') { await redis([['SREM', own, p.productId]], fetchImpl); return true; }
  if (p.status !== 'paid' && p.status !== 'delivered') return false;
  await redis([['SADD', own, p.productId]], fetchImpl);
  if (p.status === 'paid') await vatar(secret, 'POST', `/purchases/${encodeURIComponent(p.id || id)}/deliver`, null, fetchImpl);
  return true;
}

module.exports = { PRODUCTS, isPurchaseId, secretFor, ownKey, vatar, settlePurchase };
