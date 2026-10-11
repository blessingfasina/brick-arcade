/* Shared helpers for the serverless functions. Files starting with _ are not routes on Vercel. */
'use strict';

const GAMES = new Set(['snake', 'breaker', 'racer', 'stack', 'pong', 'tanks', 'crossing', 'invaders', 'flappy']);

const REST_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const REST_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

async function redis(commands, fetchImpl = fetch) {
  const r = await fetchImpl(`${REST_URL}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${REST_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(commands),
  });
  if (!r.ok) throw new Error(`redis ${r.status}`);
  const out = await r.json();
  return out.map((o) => { if (o.error) throw new Error(o.error); return o.result; });
}

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

function readBody(req) {
  if (req.body !== undefined) return Promise.resolve(typeof req.body === 'string' ? JSON.parse(req.body) : req.body);
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => { data += c; if (data.length > 10000) reject(new Error('too large')); });
    req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}

/* Per-IP request budget per minute. Returns true when over it. */
async function overLimit(req, bucket, max, fetchImpl = fetch) {
  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  const [hits] = await redis([['INCR', `${bucket}:${ip}`], ['EXPIRE', `${bucket}:${ip}`, 60]], fetchImpl);
  return hits > max;
}

module.exports = { GAMES, redis, send, readBody, overLimit, redisConfigured: !!(REST_URL && REST_TOKEN) };
