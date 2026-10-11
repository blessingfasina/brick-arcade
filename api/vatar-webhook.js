/* Retro Classic Games — Lagos Life (Vatar Games) webhook.
   POST /api/vatar-webhook, registered on the Vatar dashboard as https://retroclassic.games/api/vatar-webhook
   Checks X-Vatar-Signature (sha256= hex HMAC of the raw body) with VATAR_WEBHOOK_SECRET (vtr_whsec_test_…)
   or VATAR_LIVE_WEBHOOK_SECRET (vtr_whsec_live_…). On purchase.paid it checks the purchase with the Vatar API
   and grants and delivers it, so a purchase lands even if the player closed the game while paying.
   Other events (match.*) are acknowledged and ignored. Errors answer 500 so Vatar retries.
   Keys: vt:evt:<event id> (handled events, 7-day TTL). */
'use strict';

const crypto = require('crypto');
const { redis, send, redisConfigured } = require('./_lib');
const { isPurchaseId, secretFor, settlePurchase } = require('./_vatar');

const webhookSecrets = () => [process.env.VATAR_WEBHOOK_SECRET, process.env.VATAR_LIVE_WEBHOOK_SECRET].filter(Boolean);

/* The signature covers the exact bytes Vatar sent, so read the stream rather than a parsed body. */
function rawBody(req) {
  if (Buffer.isBuffer(req.rawBody)) return Promise.resolve(req.rawBody);
  if (req.readableEnded) {
    // The runtime already read the stream: fall back to what it kept (Vatar sends compact ASCII JSON).
    const b = req.body;
    return Promise.resolve(Buffer.isBuffer(b) ? b : Buffer.from(typeof b === 'string' ? b : JSON.stringify(b ?? '')));
  }
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => { size += c.length; if (size > 20000) reject(new Error('too large')); else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

/* The webhook secret whose signature matches, or '' when none does. */
function signedWith(raw, header) {
  const got = Buffer.from(String(header || ''));
  return webhookSecrets().find((secret) => {
    const want = Buffer.from(`sha256=${crypto.createHmac('sha256', secret).update(raw).digest('hex')}`);
    return got.length === want.length && crypto.timingSafeEqual(got, want);
  }) || '';
}

async function handler(req, res, fetchImpl = fetch) {
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return send(res, 405, { error: 'method not allowed' }); }
  if (!webhookSecrets().length || !redisConfigured) return send(res, 503, { error: 'not configured' });

  let raw;
  try { raw = await rawBody(req); } catch (_) { return send(res, 400, { error: 'bad body' }); }
  const used = signedWith(raw, req.headers['x-vatar-signature']);
  if (!used) return send(res, 401, { error: 'bad signature' });

  let evt;
  try { evt = JSON.parse(raw.toString('utf8')); } catch (_) { return send(res, 400, { error: 'bad json' }); }
  const mode = evt.mode === 'live' ? 'live' : 'test';
  // A test webhook secret only speaks for test events, a live one for live events.
  if (!used.startsWith(`vtr_whsec_${mode}_`)) return send(res, 401, { error: 'wrong mode' });
  if (evt.type !== 'purchase.paid') return send(res, 200, { ok: true, ignored: evt.type || null });

  const eventId = String(evt.id || req.headers['x-vatar-delivery'] || '');
  const purchaseId = evt.data && evt.data.purchaseId;
  const secret = secretFor(mode);
  if (!isPurchaseId(purchaseId)) return send(res, 400, { error: 'bad purchase' });
  if (!secret) return send(res, 503, { error: 'not configured' });

  try {
    const seen = eventId ? `vt:evt:${eventId.slice(0, 100)}` : '';
    if (seen && (await redis([['EXISTS', seen]], fetchImpl))[0]) return send(res, 200, { ok: true, duplicate: true });
    // The webhook is a nudge, not proof: settlePurchase checks the purchase with Vatar before granting.
    const handled = await settlePurchase(secret, mode, purchaseId, null, fetchImpl);
    if (seen) await redis([['SET', seen, '1', 'EX', 7 * 86400]], fetchImpl);
    return send(res, 200, { ok: true, handled });
  } catch (_) {
    return send(res, 500, { error: 'try again' });
  }
}

module.exports = handler;
