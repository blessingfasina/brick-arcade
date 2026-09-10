/* Retro Classic Games — shared engine: LCD renderer, input, sound, HUD, game loop,
   daily seeds, sharing, settings, stats */
'use strict';

const SITE = 'https://retroclassic.games';
const GAMES = [
  { id: 'snake', name: 'Snake', color: '#7dff5a' },
  { id: 'breaker', name: 'Brick Breaker', color: '#ff8a2a' },
  { id: 'racer', name: 'Brick Racer', color: '#3ee9ff' },
  { id: 'stack', name: 'Brick Stack', color: '#ff5fb0' },
  { id: 'pong', name: 'Pong', color: '#ffd400' },
  { id: 'tanks', name: 'Tanks', color: '#b57bff' },
  { id: 'crossing', name: 'Road Crossing', color: '#58e6b3' },
  { id: 'invaders', name: 'Invaders', color: '#ff6b6b' },
  { id: 'flappy', name: 'Flappy', color: '#7ab8ff' },
];
const PALETTES = {
  classic: { bg: '#9ead86', on: '#1f231d', off: 'rgba(31,35,29,0.10)' },
  contrast: { bg: '#eaf3d8', on: '#000000', off: 'rgba(0,0,0,0.07)' },
};
const SKINS = ['grey', 'lime', 'orange', 'cyan', 'pink', 'yellow', 'purple', 'black'];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fmt = (n) => Number(n).toLocaleString();
const store = {
  get(k, d = null) { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch (_) { return d; } },
  set(k, v) { try { localStorage.setItem(k, String(v)); } catch (_) { /* private mode */ } },
  json(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch (_) { return d; } },
};

/* ---------- Daily challenge helpers (UTC day, same seed for everyone) ---------- */
const dayKey = (d = new Date()) => d.toISOString().slice(0, 10);
const dayNumber = () => Math.floor(Date.now() / 86400000);
const dailyGame = () => GAMES[dayNumber() % GAMES.length];
function hashSeed(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---------- LCD grid renderer (brick-handheld cell look) ---------- */
class LCD {
  constructor(canvas, cols, rows, palette = PALETTES.classic) {
    this.canvas = canvas;
    this.cols = cols;
    this.rows = rows;
    this.palette = palette;
    this.ctx = canvas.getContext('2d');
    this.cells = new Uint8Array(cols * rows);
    this.cell = 0;
    this.sprites = null;
    new ResizeObserver(() => this.fit()).observe(canvas);
    this.fit();
  }

  fit() {
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const rect = this.canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const cell = Math.max(2, Math.floor(Math.min(rect.width / this.cols, rect.height / this.rows) * dpr));
    if (cell === this.cell) return;
    this.cell = cell;
    this.canvas.width = cell * this.cols;
    this.canvas.height = cell * this.rows;
    this.makeSprites();
    this.draw();
  }

  setPalette(palette) { this.palette = palette; this.makeSprites(); this.draw(); }
  makeSprites() { if (this.cell) this.sprites = { on: this.sprite(this.palette.on), off: this.sprite(this.palette.off) }; }

  sprite(color) {
    const s = this.cell;
    const c = document.createElement('canvas');
    c.width = c.height = s;
    const g = c.getContext('2d');
    const p = Math.max(1, Math.round(s * 0.08));
    const t = Math.max(1, Math.round(s * 0.13));
    const i = Math.round(s * 0.33);
    g.fillStyle = color;
    g.fillRect(p, p, s - 2 * p, s - 2 * p);
    g.clearRect(p + t, p + t, s - 2 * p - 2 * t, s - 2 * p - 2 * t);
    g.fillRect(i, i, s - 2 * i, s - 2 * i);
    return c;
  }

  clear() { this.cells.fill(0); }
  set(x, y, v = 1) {
    if (x >= 0 && x < this.cols && y >= 0 && y < this.rows) this.cells[y * this.cols + x] = v;
  }
  get(x, y) {
    return x >= 0 && x < this.cols && y >= 0 && y < this.rows ? this.cells[y * this.cols + x] : 0;
  }
  blit(pattern, ox = 0, oy = 0) {
    pattern.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) if (row[x] === 'X') this.set(ox + x, oy + y, 1);
    });
  }

  draw() {
    const s = this.cell;
    if (!s || !this.sprites) return;
    const g = this.ctx;
    g.fillStyle = this.palette.bg;
    g.fillRect(0, 0, this.canvas.width, this.canvas.height);
    for (let y = 0; y < this.rows; y++) {
      for (let x = 0; x < this.cols; x++) {
        g.drawImage(this.cells[y * this.cols + x] ? this.sprites.on : this.sprites.off, x * s, y * s);
      }
    }
  }
}

/* ---------- Seven-segment digits for the HUD ---------- */
const SEG_ON = {
  '0': 'abcdef', '1': 'bc', '2': 'abdeg', '3': 'abcdg', '4': 'bcfg',
  '5': 'acdfg', '6': 'acdefg', '7': 'abc', '8': 'abcdefg', '9': 'abcdfg', '-': 'g', ' ': '',
};
const SEG_SHAPE = {
  a: '1.2,0 8.8,0 7.4,1.6 2.6,1.6',
  b: '10,1.2 10,8.4 8.4,7.4 8.4,2.6',
  c: '10,9.6 10,16.8 8.4,15.4 8.4,10.6',
  d: '8.8,18 1.2,18 2.6,16.4 7.4,16.4',
  e: '0,16.8 0,9.6 1.6,10.6 1.6,15.4',
  f: '0,8.4 0,1.2 1.6,2.6 1.6,7.4',
  g: '1,9 2.6,8.2 7.4,8.2 9,9 7.4,9.8 2.6,9.8',
};
function segSVG(value, digits) {
  const text = String(value).slice(-digits).padStart(digits, ' ');
  const w = digits * 12.5;
  let out = `<svg viewBox="-1 -1 ${w + 1} 20" aria-hidden="true">`;
  for (let i = 0; i < digits; i++) {
    const lit = SEG_ON[text[i]] ?? '';
    for (const seg of 'abcdefg') {
      out += `<polygon class="${lit.includes(seg) ? 'on' : 'off'}" transform="translate(${i * 12.5} 0)" points="${SEG_SHAPE[seg]}"/>`;
    }
  }
  return out + '</svg>';
}

class HUD {
  constructor(root) { this.root = root; this.cache = {}; }
  set(key, value, digits = 4) {
    if (this.cache[key] === value) return;
    this.cache[key] = value;
    const el = this.root.querySelector(`[data-hud="${key}"]`);
    if (el) el.innerHTML = segSVG(value, digits);
  }
  flash() {
    this.root.classList.remove('is-flash');
    void this.root.offsetWidth;
    this.root.classList.add('is-flash');
  }
}

/* ---------- Input: keyboard + on-screen buttons, with auto-repeat ---------- */
const KEYMAP = {
  arrowleft: 'left', a: 'left', arrowright: 'right', d: 'right',
  arrowup: 'up', w: 'up', arrowdown: 'down', s: 'down',
  ' ': 'action', z: 'action', x: 'action', k: 'action',
  enter: 'start', p: 'pause', escape: 'pause', m: 'mute',
};
class Input {
  constructor(root) {
    this.root = root;
    this.handlers = {};
    this.down = new Set();
    this.timers = new Map();
    this.repeatable = new Set(['left', 'right', 'down']);

    window.addEventListener('keydown', (e) => {
      if (e.target.closest?.('input, select, textarea')) return;
      const name = KEYMAP[e.key.toLowerCase()];
      if (!name) return;
      e.preventDefault();
      if (e.repeat) return;
      this.press(name);
    });
    window.addEventListener('keyup', (e) => {
      const name = KEYMAP[e.key.toLowerCase()];
      if (name) this.release(name);
    });
    window.addEventListener('blur', () => this.releaseAll());

    // Mobile browsers zoom on a fast double tap. On a game page every second tap
    // is a game move, so cancel the browser's default for rapid repeat taps and
    // ignore pinch gestures entirely.
    let lastTap = 0;
    document.addEventListener('touchend', (e) => {
      const now = Date.now();
      if (now - lastTap < 400 && !e.target.closest('a, input, label, .settings')) e.preventDefault();
      lastTap = now;
    }, { passive: false });
    document.addEventListener('gesturestart', (e) => e.preventDefault(), { passive: false });
    document.addEventListener('dblclick', (e) => { if (!e.target.closest('a')) e.preventDefault(); });

    root.querySelectorAll('[data-btn]').forEach((btn) => {
      const name = btn.dataset.btn;
      btn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        btn.setPointerCapture?.(e.pointerId);
        this.press(name);
      });
      const up = () => this.release(name);
      btn.addEventListener('pointerup', up);
      btn.addEventListener('pointercancel', up);
      btn.addEventListener('lostpointercapture', up);
      btn.addEventListener('contextmenu', (e) => e.preventDefault());
    });
  }

  on(name, fn) { (this.handlers[name] ||= []).push(fn); }
  emit(name) { (this.handlers[name] || []).forEach((fn) => fn()); }
  held(name) { return this.down.has(name); }

  press(name) {
    if (this.down.has(name)) return;
    this.down.add(name);
    this.root.querySelectorAll(`[data-btn="${name}"]`).forEach((b) => b.classList.add('is-down'));
    this.emit(name);
    if (this.repeatable.has(name)) {
      const t = setTimeout(() => {
        this.timers.set(name, setInterval(() => this.emit(name), 75));
      }, 200);
      this.timers.set(name, t);
    }
  }
  release(name) {
    if (!this.down.has(name)) return;
    this.down.delete(name);
    this.root.querySelectorAll(`[data-btn="${name}"]`).forEach((b) => b.classList.remove('is-down'));
    const t = this.timers.get(name);
    if (t) { clearTimeout(t); clearInterval(t); this.timers.delete(name); }
  }
  releaseAll() { [...this.down].forEach((n) => this.release(n)); }
}

/* ---------- Sound: tiny WebAudio bleeps ---------- */
class Sound {
  constructor() {
    this.ctx = null;
    this.muted = store.get('brick.muted') === '1';
    const unlock = () => {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (AC) this.ctx = new AC();
      }
      if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
  }
  setMuted(m) { this.muted = m; store.set('brick.muted', m ? '1' : '0'); }
  toggle() { this.setMuted(!this.muted); return this.muted; }
  play(freq, dur = 0.06, at = 0, type = 'square', vol = 0.06) {
    if (this.muted || !this.ctx) return;
    const t = this.ctx.currentTime + at;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain).connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }
  seq(notes) { let at = 0; for (const [f, d] of notes) { this.play(f, d, at); at += d; } }
  tick() { this.play(1200, 0.025, 0, 'square', 0.03); }
  hit() { this.play(660, 0.06); }
  score() { this.seq([[880, 0.05], [1320, 0.09]]); }
  lose() { this.seq([[440, 0.1], [330, 0.1], [220, 0.2]]); }
  level() { this.seq([[660, 0.06], [880, 0.06], [1100, 0.06], [1320, 0.14]]); }
  over() { this.seq([[523, 0.12], [392, 0.12], [330, 0.12], [262, 0.3]]); }
  clear() { this.seq([[988, 0.05], [1319, 0.05], [1760, 0.12]]); }
  best() { this.seq([[784, 0.07], [988, 0.07], [1175, 0.07], [1568, 0.07], [1175, 0.05], [1568, 0.22]]); }
  boot() { this.seq([[523, 0.08], [659, 0.08], [784, 0.08], [1047, 0.16]]); }
}

/* ---------- Stats (local): plays per game, days played, totals ---------- */
const Stats = {
  read() { return store.json('brick.stats', { played: {}, total: {}, days: {}, last: {} }); },
  record(id, score) {
    const s = Stats.read();
    s.played[id] = (s.played[id] || 0) + 1;
    s.total[id] = (s.total[id] || 0) + score;
    const d = dayKey();
    s.days[d] = (s.days[d] || 0) + 1;
    s.last[id] = d;
    store.set('brick.stats', JSON.stringify(s));
  },
  streak() {
    const s = Stats.read();
    let n = 0;
    const d = new Date();
    if (!s.days[dayKey(d)]) d.setUTCDate(d.getUTCDate() - 1);
    while (s.days[dayKey(d)]) { n++; d.setUTCDate(d.getUTCDate() - 1); }
    return n;
  },
};

/* ---------- Base game: loop, states, overlay, hi-score, daily, share, settings ---------- */
class Game {
  constructor({ id, cols = 10, rows = 20, interval = 200 }) {
    this.id = id;
    this.meta = GAMES.find((g) => g.id === id) || { id, name: id };
    this.cols = cols;
    this.rows = rows;
    this.baseInterval = interval;
    this.interval = interval;
    this.console = document.querySelector('.console');
    this.daily = new URLSearchParams(location.search).get('mode') === 'daily';
    this.day = dayKey();
    this.rng = this.daily ? mulberry32(hashSeed(`${this.day}:${id}`)) : null;
    this.hiKey = this.daily ? `brick.daily.${id}.${this.day}` : `brick.hi.${id}`;

    this.lcd = new LCD(document.getElementById('lcd'), cols, rows);
    this.hud = new HUD(document.querySelector('.hud'));
    this.input = new Input(document);
    this.sound = new Sound();
    this.overlay = document.getElementById('overlay');
    this.state = 'idle';
    this.score = 0;
    this.hi = Number(store.get(this.hiKey)) || 0;
    this.prevHi = this.hi;
    this.newBest = false;
    this.animToken = 0;
    this.last = 0;
    this.acc = 0;

    this.input.on('start', () => this.toggleStart());
    this.input.on('pause', () => this.togglePause());
    this.input.on('action', () => { if (this.state === 'idle' || this.state === 'over') this.start(); });
    this.input.on('mute', () => this.toggleMute());
    document.querySelector('[data-mute]')?.addEventListener('click', () => this.toggleMute());
    this.overlay.addEventListener('click', (e) => {
      if (e.target.closest('[data-share]')) this.share();
      else if (e.target.closest('[data-again]')) this.start();
    });
    this.initSettings();
    this.syncMute();

    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.state === 'playing') this.pause();
    });

    if (this.daily) {
      document.querySelector('[data-mode]')?.removeAttribute('hidden');
      document.title = `Daily challenge: ${document.title}`;
    }
    window.game = this;
    this.reset();
    this.showOverlay(this.daily ? 'DAILY<br>CHALLENGE<small>PRESS START</small>' : 'PRESS<br>START');
    this.hud.set('hi', this.hi);
    this.hud.set('score', 0);
    requestAnimationFrame((t) => this.frame(t));
  }

  /* --- overridable --- */
  reset() {}
  step() {}
  draw() {}
  tickInterval() { return this.interval; }

  /* --- randomness: seeded on daily challenge days --- */
  random() { return this.rng ? this.rng() : Math.random(); }
  rand(n) { return Math.floor(this.random() * n); }

  /* --- state --- */
  toggleStart() {
    if (this.state === 'playing') this.pause();
    else if (this.state === 'paused') this.resume();
    else this.start();
  }
  togglePause() {
    if (this.state === 'playing') this.pause();
    else if (this.state === 'paused') this.resume();
  }
  start() {
    this.animToken++;
    this.score = 0;
    this.prevHi = this.hi;
    this.newBest = false;
    if (this.daily) this.rng = mulberry32(hashSeed(`${this.day}:${this.id}`));
    this.hud.set('score', 0);
    this.reset();
    this.acc = 0;
    this.state = 'playing';
    this.hideOverlay();
    this.sound.boot();
  }
  pause() { this.state = 'paused'; this.showOverlay('PAUSED'); }
  resume() { this.state = 'playing'; this.acc = 0; this.hideOverlay(); }

  async gameOver() {
    this.state = 'anim';
    this.sound.over();
    this.buzz([60, 40, 60]);
    Stats.record(this.id, this.score);
    const token = ++this.animToken;
    for (let y = this.rows - 1; y >= 0; y--) {
      for (let x = 0; x < this.cols; x++) this.lcd.set(x, y, 1);
      this.lcd.draw();
      await sleep(30);
      if (token !== this.animToken) return;
    }
    for (let y = 0; y < this.rows; y++) {
      for (let x = 0; x < this.cols; x++) this.lcd.set(x, y, 0);
      this.lcd.draw();
      await sleep(20);
      if (token !== this.animToken) return;
    }
    this.state = 'over';
    const line = this.newBest
      ? `<small class="best">NEW BEST!<br><s>${fmt(this.prevHi)}</s> ${fmt(this.score)}</small>`
      : `<small>SCORE ${fmt(this.score)}</small>`;
    this.showOverlay(`GAME OVER${line}<div class="overlay__btns"><button type="button" data-share>SHARE</button><button type="button" data-again>AGAIN</button></div>`);
  }

  addScore(n) {
    this.score += n;
    if (this.score > this.hi) {
      const first = !this.newBest && this.prevHi > 0;
      this.hi = this.score;
      store.set(this.hiKey, this.hi);
      this.hud.set('hi', this.hi);
      if (first) { this.newBest = true; this.sound.best(); this.hud.flash(); this.buzz([30, 30, 30]); }
      else if (!this.newBest) this.newBest = true;
    }
    this.hud.set('score', this.score);
  }

  /* --- sharing --- */
  async share() {
    const url = `${SITE}/${this.id}${this.daily ? '?mode=daily' : ''}`;
    const text = this.daily
      ? `Daily challenge ${this.day}: I scored ${fmt(this.score)} on ${this.meta.name}. Same game for everyone today, beat me:`
      : `I scored ${fmt(this.score)} on ${this.meta.name} at Retro Classic Games. Beat me:`;
    const btn = this.overlay.querySelector('[data-share]');
    try {
      if (navigator.share) { await navigator.share({ title: 'Retro Classic Games', text, url }); return; }
      await navigator.clipboard.writeText(`${text} ${url}`);
      if (btn) { btn.textContent = 'COPIED!'; setTimeout(() => { btn.textContent = 'SHARE'; }, 1500); }
    } catch (_) { /* user cancelled */ }
  }

  /* --- settings: console colour, big buttons, high contrast, sound --- */
  initSettings() {
    const panel = document.getElementById('settings');
    const open = document.querySelector('[data-settings]');
    if (!panel || !open) { this.applySettings(); return; }
    const sw = panel.querySelector('.swatches');
    if (sw) sw.innerHTML = SKINS.map((s) => `<button type="button" class="swatch swatch--${s}" data-skin="${s}" aria-label="${s}"></button>`).join('');
    open.addEventListener('click', () => { panel.hidden = !panel.hidden; if (!panel.hidden && this.state === 'playing') this.pause(); this.syncSettings(); });
    panel.querySelector('[data-close]')?.addEventListener('click', () => { panel.hidden = true; });
    panel.addEventListener('click', (e) => {
      const s = e.target.closest('[data-skin]');
      if (s) { store.set('brick.skin', s.dataset.skin); this.applySettings(); this.syncSettings(); }
    });
    panel.addEventListener('change', (e) => {
      const k = e.target.dataset.set;
      if (k === 'sound') this.sound.setMuted(!e.target.checked);
      else if (k) store.set('brick.' + k, e.target.checked ? '1' : '0');
      this.applySettings();
      this.syncMute();
    });
    this.applySettings();
  }
  applySettings() {
    const c = this.console;
    if (!c) return;
    c.dataset.skin = store.get('brick.skin', 'grey');
    c.classList.toggle('console--big', store.get('brick.bigpad') === '1');
    const hc = store.get('brick.contrast') === '1';
    c.classList.toggle('console--hc', hc);
    const pal = hc ? PALETTES.contrast : PALETTES.classic;
    if (this.lcd.palette !== pal) this.lcd.setPalette(pal);
    if (this.preview && this.preview.palette !== pal) this.preview.setPalette(pal);
  }
  syncSettings() {
    const panel = document.getElementById('settings');
    if (!panel) return;
    const skin = store.get('brick.skin', 'grey');
    panel.querySelectorAll('[data-skin]').forEach((b) => b.classList.toggle('is-on', b.dataset.skin === skin));
    const set = (k, v) => { const el = panel.querySelector(`[data-set="${k}"]`); if (el) el.checked = v; };
    set('bigpad', store.get('brick.bigpad') === '1');
    set('contrast', store.get('brick.contrast') === '1');
    set('sound', !this.sound.muted);
  }

  /* --- loop --- */
  frame(t) {
    const dt = Math.min(t - this.last, 100);
    this.last = t;
    if (this.state === 'playing') {
      this.acc += dt;
      let guard = 0;
      while (this.acc >= this.tickInterval() && guard++ < 5) {
        this.acc -= this.tickInterval();
        this.step();
        if (this.state !== 'playing') { this.acc = 0; break; }
      }
    }
    if (this.state !== 'anim') {
      this.lcd.clear();
      this.draw();
      this.lcd.draw();
    }
    requestAnimationFrame((tt) => this.frame(tt));
  }

  /* --- helpers --- */
  showOverlay(html) { this.overlay.innerHTML = html; this.overlay.hidden = false; }
  hideOverlay() { this.overlay.hidden = true; }
  buzz(pattern) { try { navigator.vibrate?.(pattern); } catch (_) { /* ignore */ } }
  blink(period = 250) { return Math.floor(performance.now() / period) % 2 === 0; }
  toggleMute() { this.sound.toggle(); this.syncMute(); }
  syncMute() {
    const b = document.querySelector('[data-mute]');
    if (b) {
      b.textContent = this.sound.muted ? 'SOUND OFF' : 'SOUND ON';
      b.setAttribute('aria-pressed', String(!this.sound.muted));
    }
    this.syncSettings();
  }
}

/* ---------- Offline / install ---------- */
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(() => {}); });
}

window.BrickArcade = { LCD, HUD, Input, Sound, Game, Stats, GAMES, PALETTES, SKINS, SITE, store, segSVG, sleep, fmt, dayKey, dayNumber, dailyGame, hashSeed, mulberry32 };
