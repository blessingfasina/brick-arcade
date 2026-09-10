/* Retro Classic Games — world leaderboard API (Vercel serverless, Upstash Redis over REST).
   GET  /api/scores?game=snake[&day=YYYY-MM-DD][&id=player][&limit=25]
   POST /api/scores  { game, score, id, name, daily?: true, day?: YYYY-MM-DD }
   Keys: lb:<game> (all-time, top 1000 kept), lb:<game>:<day> (daily, 45-day TTL), names (hash id -> name). */
'use strict';

const GAMES = new Set(['snake', 'breaker', 'racer', 'stack', 'pong', 'tanks', 'crossing', 'invaders', 'flappy']);
const MAX_SCORE = 5000000;
const KEEP = 1000;

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

const cleanName = (name) => String(name || '').replace(/[^A-Za-z0-9 _.-]/g, '').trim().slice(0, 12).toUpperCase();
const isDay = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d);
const isId = (id) => /^[a-z0-9-]{8,40}$/.test(id);
const today = () => new Date().toISOString().slice(0, 10);

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

function board(flat, names, me) {
  const out = [];
  for (let i = 0; i < flat.length; i += 2) {
    const id = flat[i];
    out.push({ rank: out.length + 1, name: names[id] || 'ANON', score: Number(flat[i + 1]), you: id === me || undefined });
  }
  return out;
}

async function handleGet(req, res, fetchImpl) {
  const q = new URL(req.url, 'http://x').searchParams;
  const game = q.get('game');
  const day = q.get('day') || today();
  const id = q.get('id') || '';
  const limit = Math.max(1, Math.min(100, Number(q.get('limit')) || 25));
  if (!GAMES.has(game) || !isDay(day)) return send(res, 400, { error: 'bad request' });

  const cmds = [
    ['ZREVRANGE', `lb:${game}`, 0, limit - 1, 'WITHSCORES'],
    ['ZREVRANGE', `lb:${game}:${day}`, 0, limit - 1, 'WITHSCORES'],
    ['ZCARD', `lb:${game}`],
    ['ZCARD', `lb:${game}:${day}`],
  ];
  if (isId(id)) cmds.push(['ZREVRANK', `lb:${game}`, id], ['ZREVRANK', `lb:${game}:${day}`, id]);
  const r = await redis(cmds, fetchImpl);

  const ids = [...new Set([...r[0], ...r[1]].filter((_, i, arr) => i % 2 === 0 && typeof arr[i] === 'string'))];
  const names = {};
  if (ids.length) {
    const [vals] = await redis([['HMGET', 'names', ...ids]], fetchImpl);
    ids.forEach((k, i) => { names[k] = vals[i]; });
  }
  const rank = isId(id) ? { alltime: r[4] == null ? null : r[4] + 1, daily: r[5] == null ? null : r[5] + 1 } : null;
  return send(res, 200, { game, day, alltime: board(r[0], names, id), daily: board(r[1], names, id), counts: { alltime: r[2], daily: r[3] }, rank });
}

async function handlePost(req, res, fetchImpl) {
  let b;
  try { b = await readBody(req); } catch (_) { return send(res, 400, { error: 'bad json' }); }
  const game = b.game;
  const score = Math.floor(Number(b.score));
  const id = String(b.id || '');
  const name = cleanName(b.name);
  const day = b.daily ? String(b.day || today()) : null;
  if (!GAMES.has(game) || !Number.isFinite(score) || score <= 0 || score > MAX_SCORE || !isId(id) || !name || (day && !isDay(day))) {
    return send(res, 400, { error: 'bad request' });
  }

  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  const [hits] = await redis([['INCR', `rl:${ip}`], ['EXPIRE', `rl:${ip}`, 60]], fetchImpl);
  if (hits > 30) return send(res, 429, { error: 'slow down' });

  const cmds = [
    ['HSET', 'names', id, name],
    ['ZADD', `lb:${game}`, 'GT', score, id],
    ['ZREVRANK', `lb:${game}`, id],
    ['ZREMRANGEBYRANK', `lb:${game}`, 0, -(KEEP + 1)],
  ];
  if (day) cmds.push(['ZADD', `lb:${game}:${day}`, 'GT', score, id], ['ZREVRANK', `lb:${game}:${day}`, id], ['EXPIRE', `lb:${game}:${day}`, 45 * 86400]);
  const r = await redis(cmds, fetchImpl);
  return send(res, 200, { ok: true, rank: { alltime: r[2] == null ? null : r[2] + 1, daily: day && r[5] != null ? r[5] + 1 : null } });
}

async function handler(req, res, fetchImpl = fetch) {
  if (!REST_URL || !REST_TOKEN) return send(res, 503, { error: 'leaderboard not configured' });
  try {
    if (req.method === 'GET') return await handleGet(req, res, fetchImpl);
    if (req.method === 'POST') return await handlePost(req, res, fetchImpl);
    res.setHeader('Allow', 'GET, POST');
    return send(res, 405, { error: 'method not allowed' });
  } catch (e) {
    return send(res, 500, { error: 'server error' });
  }
}

module.exports = handler;
module.exports.cleanName = cleanName;
