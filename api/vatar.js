/* Retro Classic Games — Lagos Life purchase claims (Vatar Games server API).
   POST /api/vatar  { mode, session, purchaseIds?: [id] }  ->  { owned: [productId] }
   Verifies the player's session and each purchase with Vatar, grants paid items, marks them
   delivered (safe to repeat) and answers with what the player owns.
   Secrets and product ids are in api/_vatar.js. Keys: vt:own:<mode>:<player id> (set of product ids). */
'use strict';

const { redis, send, readBody, overLimit, redisConfigured } = require('./_lib');
const { isPurchaseId, secretFor, ownKey, vatar, settlePurchase } = require('./_vatar');

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
    const own = ownKey(mode, s.playerId);
    // Extras bought before ownership dropped the game id from its key.
    const legacy = `vt:own:${mode}:${s.gameId}:${s.playerId}`;
    await redis([['SUNIONSTORE', own, own, legacy], ['DEL', legacy]], fetchImpl);

    // Only this player's purchases, in this mode, of something we sell (see settlePurchase).
    for (const id of ids) await settlePurchase(secret, mode, id, s.playerId, fetchImpl).catch(() => false);

    const [owned] = await redis([['SMEMBERS', own]], fetchImpl);
    return send(res, 200, { owned: owned || [] });
  } catch (_) {
    return send(res, 502, { error: 'upstream error' });
  }
}

module.exports = handler;
