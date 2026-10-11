/* Retro Classic Games — Lagos Life purchase claims (Vatar Games server API).
   POST /api/vatar  { mode, session, purchaseIds?: [id] }  ->  { owned: [productId] }
   Verifies the player's session and each purchase with Vatar, grants paid items, marks them
   delivered (safe to repeat) and answers with what the player owns.
   The whole arcade is one listing. Secrets: VATAR_SECRET as Lagos Life names it, plus VATAR_LIVE_SECRET once
   approved (or VATAR_TEST_SECRET / VATAR_LIVE_SECRET); each request uses the one whose prefix matches its mode.
   Keys: vt:own:<mode>:<vatar game id>:<player id> (set of product ids). */
'use strict';

const { redis, send, readBody, overLimit, redisConfigured } = require('./_lib');

const API = 'https://lagoslife.app/api/games/v1';
const PRODUCTS = new Set(['console_pack']);
const isPurchaseId = (id) => typeof id === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(id);

const secretFor = (mode) => [process.env.VATAR_SECRET, process.env.VATAR_TEST_SECRET, process.env.VATAR_LIVE_SECRET]
  .find((k) => k && k.startsWith(`vtr_${mode}_`)) || '';

async function vatar(secret, method, path, body, fetchImpl) {
  const r = await fetchImpl(API + path, {
    method,
    headers: { Authorization: `Bearer ${secret}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(data.error || `vatar ${r.status}`), { status: r.status });
  return data;
}

async function handler(req, res, fetchImpl = fetch) {
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return send(res, 405, { error: 'method not allowed' }); }
  if (!redisConfigured) return send(res, 503, { error: 'store not configured' });

  let b;
  try { b = await readBody(req); } catch (_) { return send(res, 400, { error: 'bad json' }); }
  const mode = b.mode === 'live' ? 'live' : 'test';
  const ids = Array.isArray(b.purchaseIds) ? b.purchaseIds.filter(isPurchaseId).slice(0, 20) : [];
  if (typeof b.session !== 'string' || !b.session || b.session.length > 4096) {
    return send(res, 400, { error: 'bad request' });
  }
  const secret = secretFor(mode);
  if (!secret) return send(res, 503, { error: 'lagos life not configured' });

  try {
    if (await overLimit(req, 'rlv', 30, fetchImpl)) return send(res, 429, { error: 'slow down' });

    let s;
    try { s = await vatar(secret, 'POST', '/session/verify', { session: b.session }, fetchImpl); } catch (_) { return send(res, 401, { error: 'bad session' }); }
    if (s.mode !== mode) return send(res, 401, { error: 'bad session' });
    const own = `vt:own:${mode}:${s.gameId}:${s.playerId}`;

    for (const id of ids) {
      let p;
      try { p = await vatar(secret, 'GET', `/purchases/${encodeURIComponent(id)}`, null, fetchImpl); } catch (_) { continue; }
      // Only this player's purchases, in this mode, of something we sell.
      if (p.playerId !== s.playerId || p.mode !== mode || !PRODUCTS.has(p.productId)) continue;
      if (p.status === 'refunded') { await redis([['SREM', own, p.productId]], fetchImpl); continue; }
      if (p.status !== 'paid' && p.status !== 'delivered') continue;
      // Ownership is a set, so granting the same purchaseId twice changes nothing.
      await redis([['SADD', own, p.productId]], fetchImpl);
      if (p.status === 'paid') await vatar(secret, 'POST', `/purchases/${encodeURIComponent(p.id || id)}/deliver`, null, fetchImpl);
    }

    const [owned] = await redis([['SMEMBERS', own]], fetchImpl);
    return send(res, 200, { owned: owned || [] });
  } catch (_) {
    return send(res, 502, { error: 'upstream error' });
  }
}

module.exports = handler;
