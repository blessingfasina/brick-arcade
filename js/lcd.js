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
  neon: { bg: '#07020f', on: '#3ee9ff', off: 'rgba(62,233,255,0.09)' },
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

/* ---------- Screen renderer: Classic LCD, 3D Bricks (default) and Neon Arcade ----------
   Games only switch cells on and off with set(x, y, code). Code 1 is the game's own colour,
   codes 2-9 pick a Neon colour. Classic and 3D draw every lit code the same way. */
const NEON_COLORS = [null, null, '#ff3fa4', '#ffd400', '#3ee9ff', '#7dff5a', '#ff8a2a', '#b57bff', '#ff5a5a', '#eafcff'];
const STYLES = ['3d', 'neon', 'classic'];
const REDUCE_MOTION = !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const hexRgb = (h) => { h = h.replace('#', ''); if (h.length === 3) h = [...h].map((c) => c + c).join(''); const n = parseInt(h, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const mix = (a, b, t) => { const A = hexRgb(a), B = hexRgb(b); return `rgb(${A.map((v, i) => Math.round(v + (B[i] - v) * t)).join(',')})`; };
const rgba = (hex, a) => `rgba(${hexRgb(hex).join(',')},${a})`;
const currentStyle = () => { const s = store.get('brick.style', '3d'); return STYLES.includes(s) ? s : '3d'; };

/* Blurred squares via shadowBlur (works in every browser, unlike ctx.filter). */
function softSquare(size, inner, color, blur, alpha = 1) {
  const c = document.createElement('canvas'); c.width = c.height = Math.ceil(size);
  const g = c.getContext('2d'); const off = size * 4;
  g.globalAlpha = alpha; g.shadowColor = color; g.shadowBlur = blur; g.shadowOffsetX = off; g.fillStyle = color;
  g.fillRect((size - inner) / 2 - off, (size - inner) / 2, inner, inner);
  return c;
}

class LCD {
  constructor(canvas, cols, rows, opts = {}) {
    if (opts && opts.on) opts = { palette: opts };
    this.canvas = canvas;
    this.cols = cols;
    this.rows = rows;
    this.n = cols * rows;
    this.palette = opts.palette || PALETTES.classic;
    this.style = opts.style || currentStyle();
    this.animate = opts.animate !== false;
    this.base = opts.neon || '#3ee9ff';
    this.ctx = canvas.getContext('2d');
    this.cells = new Uint8Array(this.n);
    this.v = new Float32Array(this.n);
    this.vel = new Float32Array(this.n);
    this.lastCode = new Uint8Array(this.n);
    this.particles = [];
    this.shakeAmt = 0;
    this.flashAmt = 0;
    this.flashCode = 3;
    this.sweep = -1;
    this.tilt = { x: 0, y: 0 };
    this.cell = 0;
    this.lastT = performance.now();
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
    this.build();
    this.draw();
  }

  setStyle(style) { if (style === this.style) return; this.style = style; this.particles = []; this.v.fill(0); this.build(); this.draw(); }
  setPalette(palette) { this.palette = palette; this.build(); this.draw(); }
  setBase(color) { this.base = color; this.build(); }

  clear() { this.cells.fill(0); }
  set(x, y, v = 1) { if (x >= 0 && x < this.cols && y >= 0 && y < this.rows) this.cells[y * this.cols + x] = v; }
  get(x, y) { return x >= 0 && x < this.cols && y >= 0 && y < this.rows ? this.cells[y * this.cols + x] : 0; }
  blit(pattern, ox = 0, oy = 0, code = 1) {
    pattern.forEach((row, y) => { for (let x = 0; x < row.length; x++) if (row[x] === 'X') this.set(ox + x, oy + y, code); });
  }

  /* ---- effects (Classic stays exactly as the handheld: no effects) ---- */
  burst(cells, power = 1) {
    if (this.style === 'classic' || !this.cell || this.particles.length > 500) return;
    const s = this.cell;
    for (const [x, y, code = 1] of cells) {
      if (this.style === '3d') {
        for (let q = 0; q < 4; q++) this.particles.push({ x: (x + 0.25 + (q % 2) * 0.5) * s, y: (y + 0.25 + (q >> 1) * 0.5) * s, vx: (Math.random() - 0.5) * s * 16 * power, vy: -(Math.random() * 12 + 6) * s * power, r: Math.random() * 6, spin: (Math.random() - 0.5) * 14, life: 0.9 + Math.random() * 0.5, size: s * 0.42, grav: 1 });
      } else {
        for (let q = 0; q < 6; q++) { const a = Math.random() * Math.PI * 2, sp = (Math.random() * 14 + 6) * s * power; this.particles.push({ x: (x + 0.5) * s, y: (y + 0.5) * s, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - s * 4, r: 0, spin: 0, life: 0.45 + Math.random() * 0.45, code, grav: 0.35 }); }
      }
    }
  }
  flash(code = 3) { if (this.style === 'classic') return; this.flashAmt = 1; this.flashCode = code; this.sweep = 0; }
  shake(amount = 1) { if (this.style === 'classic' || REDUCE_MOTION) return; this.shakeAmt = Math.max(this.shakeAmt, amount); }

  /* ---- sprites ---- */
  build() {
    const s = Math.max(2, Math.ceil(this.cell)); if (!this.cell) return;
    const pal = this.palette;
    if (this.style === 'classic') { this.sprites = { on: this.lcdSprite(pal.on), off: this.lcdSprite(pal.off) }; return; }
    if (this.style === 'neon') {
      const cols = NEON_COLORS.map((c, i) => (i === 1 ? this.base : c));
      this.sprites = {
        glow: cols.map((col) => col && softSquare(s * 2.6, s * 1.05, col, Math.max(2, s * 0.45), 0.8)),
        core: cols.map((col) => {
          if (!col) return null;
          const c = document.createElement('canvas'); c.width = c.height = s; const g = c.getContext('2d');
          const lw = Math.max(1, s * 0.12), p = s * 0.1; g.strokeStyle = col; g.lineWidth = lw; g.strokeRect(p + lw / 2, p + lw / 2, s - 2 * p - lw, s - 2 * p - lw);
          const i = s * 0.34; g.fillStyle = col; g.fillRect(i, i, s - 2 * i, s - 2 * i);
          g.fillStyle = 'rgba(255,255,255,0.75)'; const j = s * 0.42; g.fillRect(j, j, s - 2 * j, s - 2 * j);
          return c;
        }),
      };
      const bg = document.createElement('canvas'); bg.width = this.canvas.width; bg.height = this.canvas.height;
      const b = bg.getContext('2d'); b.fillStyle = '#07020f'; b.fillRect(0, 0, bg.width, bg.height);
      b.strokeStyle = 'rgba(123,76,255,0.16)'; b.lineWidth = Math.max(1, this.cell * 0.04);
      const p = this.cell * 0.14;
      for (let i = 0; i < this.n; i++) b.strokeRect((i % this.cols) * this.cell + p, ((i / this.cols) | 0) * this.cell + p, this.cell - 2 * p, this.cell - 2 * p);
      this.sprites.bg = bg;
      return;
    }
    // 3D Bricks: colours come from the LCD palette, so high contrast still works
    const on = pal.on, bgc = pal.bg;
    const top = document.createElement('canvas'); top.width = top.height = s;
    const g = top.getContext('2d');
    const gr = g.createLinearGradient(0, 0, s, s); gr.addColorStop(0, mix(on, bgc, 0.35)); gr.addColorStop(1, mix(on, bgc, 0.04));
    g.fillStyle = gr; g.fillRect(0, 0, s, s);
    const e = Math.max(1, s * 0.06);
    g.fillStyle = 'rgba(255,255,255,0.22)'; g.fillRect(0, 0, s, e); g.fillRect(0, 0, e, s);
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(0, s - e, s, e); g.fillRect(s - e, 0, e, s);
    const r = s * 0.24; g.strokeStyle = 'rgba(0,0,0,0.45)'; g.lineWidth = Math.max(1, s * 0.07); g.strokeRect(r, r, s - 2 * r, s - 2 * r);
    g.strokeStyle = 'rgba(255,255,255,0.10)'; g.lineWidth = Math.max(1, s * 0.03); g.strokeRect(r + s * 0.04, r + s * 0.04, s - 2 * r, s - 2 * r);
    const ir = s * 0.38; const ig = g.createLinearGradient(ir, ir, s - ir, s - ir); ig.addColorStop(0, mix(on, bgc, 0.45)); ig.addColorStop(1, mix(on, bgc, 0.12));
    g.fillStyle = ig; g.fillRect(ir, ir, s - 2 * ir, s - 2 * ir);
    g.fillStyle = 'rgba(255,255,255,0.28)'; g.fillRect(s * 0.1, s * 0.1, s * 0.16, s * 0.08);
    const shadow = softSquare(s * 1.8, s * 0.95, rgba(on, 0.55), Math.max(1, s * 0.16));
    const bg = document.createElement('canvas'); bg.width = this.canvas.width; bg.height = this.canvas.height;
    const b = bg.getContext('2d');
    const lg = b.createLinearGradient(0, 0, bg.width, bg.height); lg.addColorStop(0, mix(bgc, '#ffffff', 0.14)); lg.addColorStop(1, mix(bgc, '#000000', 0.1));
    b.fillStyle = lg; b.fillRect(0, 0, bg.width, bg.height);
    const pp = this.cell * 0.1;
    for (let i = 0; i < this.n; i++) {
      const x = (i % this.cols) * this.cell + pp, y = ((i / this.cols) | 0) * this.cell + pp, w = this.cell - 2 * pp, t = Math.max(1, w * 0.06);
      b.fillStyle = rgba(on, 0.07); b.fillRect(x, y, w, w);
      b.fillStyle = rgba(on, 0.16); b.fillRect(x, y, w, t); b.fillRect(x, y, t, w);
      b.fillStyle = 'rgba(255,255,255,0.22)'; b.fillRect(x, y + w - t, w, t); b.fillRect(x + w - t, y, t, w);
    }
    const vg = b.createRadialGradient(bg.width / 2, bg.height / 2, bg.width * 0.4, bg.width / 2, bg.height / 2, Math.max(bg.width, bg.height) * 0.75);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.2)'); b.fillStyle = vg; b.fillRect(0, 0, bg.width, bg.height);
    this.sprites = { top, shadow, bg, right: mix(on, '#000000', 0.45), bottom: mix(on, '#000000', 0.25), drop: rgba(on, 0.3) };
  }
  lcdSprite(color) {
    const s = this.cell; const c = document.createElement('canvas'); c.width = c.height = s; const g = c.getContext('2d');
    const p = Math.max(1, Math.round(s * 0.08)), t = Math.max(1, Math.round(s * 0.13)), i = Math.round(s * 0.33);
    g.fillStyle = color; g.fillRect(p, p, s - 2 * p, s - 2 * p); g.clearRect(p + t, p + t, s - 2 * p - 2 * t, s - 2 * p - 2 * t); g.fillRect(i, i, s - 2 * i, s - 2 * i);
    return c;
  }

  /* ---- animation ---- */
  advance(dt) {
    const n = this.n, cells = this.cells, v = this.v;
    for (let i = 0; i < n; i++) if (cells[i]) this.lastCode[i] = cells[i];
    if (this.style === '3d' && this.animate) {
      const steps = Math.max(1, Math.min(12, Math.ceil(dt * 120))), h = dt / steps, k = 900, damp = Math.exp(-34 * h);
      for (let st = 0; st < steps; st++) for (let i = 0; i < n; i++) {
        this.vel[i] = (this.vel[i] + ((cells[i] ? 1 : 0) - v[i]) * k * h) * damp;
        v[i] += this.vel[i] * h;
        if (v[i] < 0) { v[i] = 0; this.vel[i] = 0; }
      }
    } else if (this.style === 'neon' && this.animate) {
      for (let i = 0; i < n; i++) v[i] = cells[i] ? 1 : Math.max(0, v[i] - dt / 0.3);
    } else {
      for (let i = 0; i < n; i++) v[i] = cells[i] ? 1 : 0;
    }
    if (this.particles.length) {
      const gr = this.cell * 42, H = this.canvas.height + this.cell * 2;
      this.particles = this.particles.filter((p) => { p.life -= dt; p.vy += gr * dt * p.grav; p.x += p.vx * dt; p.y += p.vy * dt; p.r += p.spin * dt; return p.life > 0 && p.y < H; });
    }
    this.shakeAmt = Math.max(0, this.shakeAmt - dt * 2.6);
    this.flashAmt = Math.max(0, this.flashAmt - dt * 2.2);
    if (this.sweep >= 0) { this.sweep += dt * 1.7; if (this.sweep > 1.4) this.sweep = -1; }
  }

  draw() {
    if (!this.cell || !this.sprites) return;
    const now = performance.now();
    const dt = Math.min(0.1, Math.max(0, (now - this.lastT) / 1000));
    this.lastT = now;
    this.advance(dt);
    const g = this.ctx;
    g.setTransform(1, 0, 0, 1, 0, 0);
    if (this.style === 'classic') { this.drawClassic(g); return; }
    g.fillStyle = this.style === 'neon' ? '#07020f' : this.palette.bg;
    g.fillRect(0, 0, this.canvas.width, this.canvas.height);
    if (this.shakeAmt > 0) { const a = this.shakeAmt * this.shakeAmt * this.cell * 0.45; g.translate((Math.random() - 0.5) * 2 * a, (Math.random() - 0.5) * 2 * a); }
    if (this.style === '3d') this.draw3D(g); else this.drawNeon(g);
  }

  drawClassic(g) {
    const s = this.cell, sp = this.sprites;
    g.fillStyle = this.palette.bg; g.fillRect(0, 0, this.canvas.width, this.canvas.height);
    for (let y = 0; y < this.rows; y++) for (let x = 0; x < this.cols; x++) g.drawImage(this.cells[y * this.cols + x] ? sp.on : sp.off, x * s, y * s);
  }

  draw3D(g) {
    const s = this.cell, sp = this.sprites, pad = s * 0.08, w = s - 2 * pad, cols = this.cols;
    g.drawImage(sp.bg, 0, 0);
    const vx = Math.max(0.12, Math.min(1, 0.55 + this.tilt.x * 0.45)), vy = Math.max(0.2, Math.min(1.2, 0.8 + this.tilt.y * 0.4));
    const depth = s * 0.26;
    for (let i = 0; i < this.n; i++) {
      const v = this.v[i]; if (v < 0.02) continue;
      const d = depth * v, x = (i % cols) * s + pad, y = ((i / cols) | 0) * s + pad;
      g.globalAlpha = Math.min(1, v);
      g.drawImage(sp.shadow, x - w * 0.4 + vx * d * 0.9, y - w * 0.4 + vy * d * 0.9, w * 1.8, w * 1.8);
    }
    g.globalAlpha = 1;
    for (let i = 0; i < this.n; i++) {
      const v = this.v[i]; if (v < 0.02) continue;
      const d = depth * v, bx = (i % cols) * s + pad, by = ((i / cols) | 0) * s + pad;
      const tx = bx - vx * d, ty = by - vy * d;
      g.fillStyle = sp.right;
      g.beginPath(); g.moveTo(bx + w, by); g.lineTo(bx + w, by + w); g.lineTo(tx + w, ty + w); g.lineTo(tx + w, ty); g.closePath(); g.fill();
      g.fillStyle = sp.bottom;
      g.beginPath(); g.moveTo(bx, by + w); g.lineTo(bx + w, by + w); g.lineTo(tx + w, ty + w); g.lineTo(tx, ty + w); g.closePath(); g.fill();
      g.drawImage(sp.top, tx, ty, w, w);
    }
    for (const p of this.particles) {
      g.globalAlpha = Math.max(0, Math.min(1, p.life / 0.4));
      g.save(); g.translate(p.x + vx * s * 0.3, p.y + vy * s * 0.3); g.rotate(p.r); g.fillStyle = sp.drop; g.fillRect(-p.size / 2, -p.size / 2, p.size, p.size); g.restore();
      g.save(); g.translate(p.x, p.y); g.rotate(p.r); g.drawImage(sp.top, -p.size / 2, -p.size / 2, p.size, p.size); g.restore();
    }
    g.globalAlpha = 1;
    if (this.sweep >= 0) {
      const W = this.canvas.width, H = this.canvas.height, pos = (this.sweep - 0.2) * (W + H);
      const gr = g.createLinearGradient(pos - W * 0.5, pos - W * 0.5, pos, pos);
      gr.addColorStop(0, 'rgba(255,255,240,0)'); gr.addColorStop(0.7, 'rgba(255,255,240,0.45)'); gr.addColorStop(1, 'rgba(255,255,240,0)');
      g.fillStyle = gr; g.fillRect(0, 0, W, H);
    }
  }

  drawNeon(g) {
    const s = this.cell, sp = this.sprites, cols = this.cols;
    g.drawImage(sp.bg, 0, 0);
    g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < this.n; i++) {
      const v = this.v[i]; if (v < 0.02) continue;
      let code = this.cells[i] || this.lastCode[i] || 1; if (!sp.core[code]) code = 1;
      const x = (i % cols) * s, y = ((i / cols) | 0) * s;
      g.globalAlpha = v * 0.85; g.drawImage(sp.glow[code], x - s * 0.8, y - s * 0.8, s * 2.6, s * 2.6);
      g.globalAlpha = v; g.drawImage(sp.core[code], x, y, s, s);
    }
    for (const p of this.particles) {
      const code = sp.core[p.code] ? p.code : 1;
      g.globalAlpha = Math.max(0, Math.min(1, p.life / 0.5));
      g.strokeStyle = code === 1 ? this.base : NEON_COLORS[code]; g.lineWidth = Math.max(1, s * 0.1);
      g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(p.x - p.vx * 0.035, p.y - p.vy * 0.035); g.stroke();
      g.drawImage(sp.glow[code], p.x - s * 0.5, p.y - s * 0.5, s, s);
    }
    if (this.flashAmt > 0) { g.globalAlpha = this.flashAmt * 0.35; g.fillStyle = NEON_COLORS[this.flashCode] || this.base; g.fillRect(0, 0, this.canvas.width, this.canvas.height); }
    if (this.shakeAmt > 0.5) { g.globalAlpha = (this.shakeAmt - 0.5) * 0.5; g.fillStyle = '#ff2050'; g.fillRect(0, 0, this.canvas.width, this.canvas.height); }
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
  }
}

/* ---------- Mascot: the little LCD character in the side panel ---------- */
const MASCOT = {
  stand: ['....XXXX....', '...XXXXXX...', '..XX....XX..', '..X.X..X.X..', '..X......X..', '...X.XX.X...',
          '....XXXX....', '...XXXXXX...', '..X.XXXX.X..', '....X..X....', '....X..X....', '...XX..XX...'],
  run1:  ['.....XXXX...', '....XXXXXX..', '...XX....XX.', '...X..X.X.X.', '...X......X.', '....X.XX.X..',
          '.....XXXX...', '..X.XXXXX...', '...XXXXXX.X.', '....XX..XX..', '...XX....X..', '..XX.....XX.'],
  run2:  ['.....XXXX...', '....XXXXXX..', '...XX....XX.', '...X..X.X.X.', '...X......X.', '....X.XX.X..',
          '.....XXXX...', '....XXXXXX..', '...X.XXXX.X.', '.....XXX....', '.....X.X....', '....XX.XX...'],
  cheer: ['....XXXX....', '...XXXXXX...', '..XX....XX..', 'X.X.X..X.X.X', 'X.X......X.X', '.X.X.XX.X.X.',
          '.X..XXXX..X.', '..XXXXXXXX..', '....XXXX....', '....X..X....', '...XX..XX...', '............'],
  rest:  ['............', '....XXXX....', '...XXXXXX...', '..XX....XX..', '..X......X..', '..X.XX.XX.X.',
          '...X....X...', '....XXXX....', '...XXXXXX...', '..X.XXXX.X..', '...XXXXXXXX.', '...XX...XX..'],
  down:  ['............', '............', '............', '............', '............', '............',
          '..XXXX......', '.X....X.....', '.X.X.XXXXXX.', '.X..X.XXXX.X', '..XXXX...X.X', 'XXXXXXXXXXXX'],
};
class Mascot {
  constructor(canvas, palette) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.palette = palette;
    this.px = 4;
    canvas.width = canvas.height = 12 * this.px;
    this.mode = 'idle';
    this.temp = null;
    this.until = 0;
    this.frame = null;
    this.ghost = new Set();
    for (const f of Object.values(MASCOT)) f.forEach((row, y) => [...row].forEach((c, x) => { if (c === 'X') this.ghost.add(`${x},${y}`); }));
  }
  set(mode, ms = 0) {
    if (ms) { this.temp = mode; this.until = performance.now() + ms; }
    else { this.mode = mode; this.until = 0; }
  }
  pick(t, speed) {
    const mode = this.until > t ? this.temp : this.mode;
    if (mode === 'run') return Math.floor(t / Math.max(90, 240 - speed * 14)) % 2 ? 'run1' : 'run2';
    if (mode === 'idle') return t % 2600 < 420 ? 'cheer' : 'stand';
    return mode;
  }
  update(t, speed) {
    const f = this.pick(t, speed);
    const pal = this.palette();
    if (f === this.frame && pal === this.pal) return;
    this.frame = f;
    this.pal = pal;
    const g = this.ctx, p = this.px;
    g.clearRect(0, 0, this.canvas.width, this.canvas.height);
    g.fillStyle = pal.off;
    for (const k of this.ghost) { const [x, y] = k.split(',').map(Number); g.fillRect(x * p, y * p, p - 1, p - 1); }
    g.fillStyle = pal.on;
    MASCOT[f].forEach((row, y) => [...row].forEach((c, x) => { if (c === 'X') g.fillRect(x * p, y * p, p - 1, p - 1); }));
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
      if (now - lastTap < 400 && !e.target.closest('a, input, label, .settings, .mini')) e.preventDefault();
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
  emit(name, repeat = false) { (this.handlers[name] || []).forEach((fn) => fn(repeat)); }
  held(name) { return this.down.has(name); }

  press(name) {
    if (this.down.has(name)) return;
    this.down.add(name);
    this.root.querySelectorAll(`[data-btn="${name}"]`).forEach((b) => b.classList.add('is-down'));
    this.emit(name);
    if (this.repeatable.has(name)) {
      const t = setTimeout(() => {
        this.timers.set(name, setInterval(() => this.emit(name, true), 75));
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

/* ---------- Sound: synthesised effects, flavoured by the screen style ----------
   Classic LCD sounds like the piezo speaker in the real handheld (square beeps only).
   3D Bricks is a fuller arcade set with noise for crunches and explosions.
   Neon Arcade runs the same sounds through a sweeping filter and an echo. */
class Sound {
  constructor() {
    this.ctx = null;
    this.muted = store.get('brick.muted') === '1';
    this.volume = Math.max(0, Math.min(100, Number(store.get('brick.volume', '70'))));
    if (!Number.isFinite(this.volume)) this.volume = 70;
    this.style = currentStyle();
    this.engine = null;
    const unlock = () => this.unlock();
    ['pointerdown', 'touchend', 'keydown', 'click'].forEach((ev) => window.addEventListener(ev, unlock, { passive: true }));
  }
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const c = this.ctx = new AC();
      this.master = c.createGain();
      const comp = c.createDynamicsCompressor();
      comp.threshold.value = -16; comp.knee.value = 12; comp.ratio.value = 4; comp.attack.value = 0.003; comp.release.value = 0.2;
      this.master.connect(comp).connect(c.destination);
      // Echo send used by the Neon style
      this.echo = c.createGain();
      const delay = c.createDelay(1); delay.delayTime.value = 0.17;
      const fb = c.createGain(); fb.gain.value = 0.33;
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2600;
      const wet = c.createGain(); wet.gain.value = 0.32;
      this.echo.connect(delay); delay.connect(lp); lp.connect(fb); fb.connect(delay); lp.connect(wet); wet.connect(this.master);
      // One second of white noise, reused for every crunch and boom
      const buf = c.createBuffer(1, c.sampleRate, c.sampleRate); const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      this.noiseBuf = buf;
      // iOS only starts audio after a sound is played inside a tap
      const s = c.createBufferSource(); s.buffer = c.createBuffer(1, 1, 22050); s.connect(c.destination); s.start(0);
      this.applyVolume();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }
  applyVolume() { if (this.master) this.master.gain.value = this.muted ? 0 : Math.pow(this.volume / 100, 1.6) * 0.95; }
  setMuted(m) { this.muted = m; store.set('brick.muted', m ? '1' : '0'); this.applyVolume(); if (m) this.engineStop(); }
  toggle() { this.setMuted(!this.muted); return this.muted; }
  setVolume(v) { this.volume = Math.max(0, Math.min(100, v)); store.set('brick.volume', this.volume); this.applyVolume(); }
  get live() { return !!this.ctx && !this.muted && this.volume > 0; }

  /* ---- building blocks ---- */
  tone({ type = 'square', f = 440, f1 = 0, dur = 0.08, vol = 0.15, at = 0, attack = 0.004 } = {}) {
    if (!this.live) return;
    const c = this.ctx, t = c.currentTime + at, st = this.style;
    if (st === 'classic') type = 'square';
    else if (st === 'neon' && type === 'triangle') type = 'sawtooth';
    const o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t);
    if (f1) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol * (st === 'classic' ? 0.8 : 1), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let node = o;
    if (st === 'neon') {
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 6;
      lp.frequency.setValueAtTime(Math.min(14000, f * 7), t); lp.frequency.exponentialRampToValueAtTime(Math.max(180, f * 1.3), t + dur);
      o.connect(lp); node = lp;
    }
    node.connect(g); g.connect(this.master);
    if (st === 'neon') g.connect(this.echo);
    o.start(t); o.stop(t + dur + 0.05);
  }
  noise({ dur = 0.2, vol = 0.2, at = 0, type = 'lowpass', f = 2000, f1 = 0, q = 0.8 } = {}) {
    if (!this.live) return;
    if (this.style === 'classic') { this.tone({ f: 70 + Math.min(f, 1600) / 8, f1: 45, dur: Math.min(dur, 0.25), vol: vol * 0.7, at }); return; }
    const c = this.ctx, t = c.currentTime + at;
    const src = c.createBufferSource(); src.buffer = this.noiseBuf; src.loop = true;
    const flt = c.createBiquadFilter(); flt.type = type; flt.Q.value = q; flt.frequency.setValueAtTime(f, t);
    if (f1) flt.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(flt).connect(g).connect(this.master);
    if (this.style === 'neon') g.connect(this.echo);
    src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.05);
  }
  play(freq, dur = 0.06, at = 0, type = 'square', vol = 0.06) { this.tone({ f: freq, dur, at, type, vol: vol * 2 }); }
  seq(notes, type = 'square', vol = 0.13) { let at = 0; for (const [f, d] of notes) { if (f) this.tone({ type, f, dur: d * 0.95, vol, at }); at += d; } }

  /* ---- the sound set ---- */
  tick() { this.tone({ f: 1500, dur: 0.022, vol: 0.05 }); }
  select() { this.tone({ f: 1100, f1: 1650, dur: 0.05, vol: 0.08 }); }
  rotate() { this.tone({ type: 'triangle', f: 700, f1: 1100, dur: 0.05, vol: 0.09 }); }
  wall() { this.tone({ f: 360, dur: 0.03, vol: 0.07 }); }
  hit(high = false) { this.tone({ f: (high ? 780 : 520) + Math.random() * 30, dur: 0.055, vol: 0.13 }); }
  land() { this.tone({ type: 'sine', f: 190, f1: 70, dur: 0.1, vol: 0.22 }); this.noise({ type: 'lowpass', f: 700, f1: 150, dur: 0.07, vol: 0.12 }); }
  brick() { this.noise({ type: 'bandpass', f: 3200, f1: 1100, q: 1.3, dur: 0.08, vol: 0.18 }); this.tone({ f: 900 + Math.random() * 120, f1: 480, dur: 0.06, vol: 0.07 }); }
  eat() { this.tone({ type: 'triangle', f: 330, f1: 660, dur: 0.05, vol: 0.14 }); this.tone({ type: 'triangle', f: 660, f1: 1000, dur: 0.07, vol: 0.12, at: 0.05 }); }
  score() { this.tone({ f: 988, dur: 0.06, vol: 0.09 }); this.tone({ f: 1319, dur: 0.12, vol: 0.09, at: 0.06 }); }
  laser() { this.tone({ f: 1600, f1: 170, dur: 0.14, vol: 0.09 }); }
  cannon(enemy = false) { this.noise({ type: 'lowpass', f: enemy ? 900 : 1500, f1: 160, dur: 0.16, vol: enemy ? 0.1 : 0.2 }); this.tone({ type: 'sine', f: enemy ? 120 : 160, f1: 50, dur: 0.16, vol: enemy ? 0.1 : 0.18 }); }
  pop() { this.noise({ type: 'bandpass', f: 1900, f1: 450, q: 1, dur: 0.14, vol: 0.18 }); this.tone({ f: 620, f1: 110, dur: 0.11, vol: 0.07 }); }
  explode() { this.noise({ type: 'lowpass', f: 3400, f1: 70, dur: 0.55, vol: 0.32 }); this.tone({ type: 'sine', f: 120, f1: 32, dur: 0.5, vol: 0.26 }); }
  crash() { this.explode(); this.tone({ f: 420, f1: 55, dur: 0.38, vol: 0.09, at: 0.02 }); }
  flap() { this.noise({ type: 'bandpass', f: 650, f1: 1700, q: 0.7, dur: 0.11, vol: 0.12 }); this.tone({ type: 'triangle', f: 360, f1: 640, dur: 0.07, vol: 0.07 }); }
  hop() { this.tone({ type: 'triangle', f: 500, f1: 900, dur: 0.06, vol: 0.1 }); }
  march(step) { this.tone({ f: [196, 175, 165, 147][step % 4], dur: 0.09, vol: 0.13, attack: 0.002 }); }
  lose() { this.seq([[440, 0.1], [330, 0.1], [220, 0.22]]); }
  level() { this.seq([[660, 0.06], [880, 0.06], [1100, 0.06], [1320, 0.16]], 'triangle', 0.12); this.noise({ type: 'highpass', f: 5000, dur: 0.3, vol: 0.04, at: 0.18 }); }
  clear(lines = 1) {
    const notes = [523, 659, 784, 1047, 1319, 1568];
    for (let i = 0; i <= Math.min(lines, 4); i++) this.tone({ type: 'triangle', f: notes[i], dur: 0.09, vol: 0.12, at: i * 0.05 });
    this.noise({ type: 'highpass', f: 4200, dur: 0.25 + lines * 0.05, vol: 0.05 + lines * 0.015 });
    if (lines >= 4) this.seq([[0, 0.25], [1047, 0.08], [1319, 0.08], [1568, 0.2]], 'square', 0.1);
  }
  over() { this.seq([[523, 0.14], [392, 0.14], [330, 0.14], [262, 0.38]]); }
  best() { this.seq([[784, 0.08], [988, 0.08], [1175, 0.08], [1568, 0.08], [1175, 0.06], [1568, 0.28]], 'square', 0.12); }
  boot() { this.seq([[523, 0.07], [659, 0.07], [784, 0.07], [1047, 0.16]], 'square', 0.11); }

  /* ---- a continuous engine note for Brick Racer (not on the piezo Classic style) ---- */
  engineStart() {
    if (!this.live || this.engine || this.style === 'classic') return;
    const c = this.ctx, t = c.currentTime;
    const o1 = c.createOscillator(); o1.type = 'sawtooth';
    const o2 = c.createOscillator(); o2.type = 'square'; o2.detune.value = -1200 + 8;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = this.style === 'neon' ? 8 : 2;
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.05, t + 0.25);
    o1.connect(lp); o2.connect(lp); lp.connect(g); g.connect(this.master);
    o1.start(t); o2.start(t);
    this.engine = { o1, o2, lp, g };
    this.engineSet(0);
  }
  engineSet(rate) {
    if (!this.engine) return;
    const t = this.ctx.currentTime, e = this.engine, r = Math.max(0, Math.min(1, rate));
    e.o1.frequency.setTargetAtTime(52 + r * 130, t, 0.08);
    e.o2.frequency.setTargetAtTime(52 + r * 130, t, 0.08);
    e.lp.frequency.setTargetAtTime(280 + r * 1600, t, 0.08);
  }
  engineStop() {
    if (!this.engine) return;
    const e = this.engine, t = this.ctx.currentTime;
    e.g.gain.cancelScheduledValues(t); e.g.gain.setTargetAtTime(0.0001, t, 0.06);
    e.o1.stop(t + 0.3); e.o2.stop(t + 0.3);
    this.engine = null;
  }
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

/* ---------- World leaderboard client (talks to /api/scores; silent when unavailable) ---------- */
const Leaderboard = {
  id() {
    let id = store.get('brick.pid');
    if (!id) {
      id = (crypto.randomUUID ? crypto.randomUUID() : Array.from({ length: 24 }, () => 'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 36)]).join(''));
      store.set('brick.pid', id);
    }
    return id;
  },
  name() { return store.get('brick.name', ''); },
  setName(n) { const c = String(n || '').replace(/[^A-Za-z0-9 _.-]/g, '').trim().slice(0, 12).toUpperCase(); if (c) store.set('brick.name', c); return c; },
  askName() {
    const n = window.prompt('Pick a name for the world leaderboard (letters and numbers, up to 12):', Leaderboard.name());
    return n === null ? '' : Leaderboard.setName(n);
  },
  async fetch(game, { day, limit = 25 } = {}) {
    const q = new URLSearchParams({ game, id: Leaderboard.id(), limit });
    if (day) q.set('day', day);
    const r = await fetch(`/api/scores?${q}`, { cache: 'no-store' });
    if (!r.ok) throw new Error(String(r.status));
    return r.json();
  },
  async submit({ game, score, daily, day }) {
    const name = Leaderboard.name();
    if (!name || !(score > 0)) return null;
    const r = await fetch('/api/scores', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ game, score, id: Leaderboard.id(), name, daily: !!daily, day }) });
    if (!r.ok) throw new Error(String(r.status));
    return r.json();
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
    // Like the real handheld: pick a starting LEVEL and a SPEED before you press start.
    // The daily challenge is locked to 1 / 1 so everyone plays the same game.
    const pick = (k) => Math.max(1, Math.min(10, Number(store.get(k)) || 1));
    this.startLevel = this.daily ? 1 : pick(`brick.lv.${id}`);
    this.speed = this.daily ? 1 : pick(`brick.sp.${id}`);
    this.overAt = 0;

    this.lcd = new LCD(document.getElementById('lcd'), cols, rows, { neon: this.meta.color });
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
    this.input.on('left', (rep) => this.menu('prev', rep));
    this.input.on('right', (rep) => this.menu('next', rep));
    this.input.on('up', (rep) => this.menu('level', rep));
    this.input.on('down', (rep) => this.menu('speed', rep));
    const mc = document.querySelector('.mascot');
    this.mascot = mc ? new Mascot(mc, () => (this.lcd.style === 'neon' ? PALETTES.neon : this.lcd.palette)) : null;
    this.initTilt();
    document.querySelector('[data-mute]')?.addEventListener('click', () => this.toggleMute());
    this.overlay.addEventListener('click', (e) => {
      if (e.target.closest('[data-share]')) this.share();
      else if (e.target.closest('[data-again]')) this.start();
      else if (e.target.closest('[data-join]')) { if (Leaderboard.askName()) this.postScore(); }
      else if (e.target.closest('[data-skip]')) { store.set('brick.nameAsked', '1'); this.showGameOver(); }
    });
    this.overlay.addEventListener('submit', (e) => {
      if (!e.target.matches('[data-nameform]')) return;
      e.preventDefault();
      const name = Leaderboard.setName(e.target.elements.n.value);
      if (!name) { e.target.elements.n.focus(); return; }
      store.set('brick.nameAsked', '1');
      this.showGameOver();
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
    this.prepare();
    this.showMenu();
    this.hud.set('hi', this.hi);
    this.hud.set('score', 0);
    requestAnimationFrame((t) => this.frame(t));
  }

  /* --- overridable --- */
  reset() {}
  step() {}
  draw() {}
  tickInterval() { return this.interval; }
  /* Jump straight to a starting level. Games override this to rebuild what depends on it. */
  startAt(lv) { this.level = lv; this.hud.set('level', lv, 2); }

  /* --- level / speed / game select, before a game starts --- */
  prepare() {
    this.reset();
    this.startAt(this.startLevel);
    this.seenLevel = this.level;
    this.hud.set('speed', this.speed, 2);
  }
  speedFactor() { return 1 - (this.speed - 1) * 0.06; }
  scoreMult() { return 1 + (this.speed - 1) * 0.1; }
  inMenu() {
    if (this.state === 'idle') return true;
    return this.state === 'over' && performance.now() - this.overAt > 700 && !this.overlay.querySelector('[data-nameform]');
  }
  menu(kind, repeat) {
    if (repeat || !this.inMenu() || this.daily) return;
    if (kind === 'prev' || kind === 'next') {
      const i = GAMES.findIndex((g) => g.id === this.id);
      const next = GAMES[(i + (kind === 'next' ? 1 : GAMES.length - 1)) % GAMES.length];
      location.href = '/' + next.id;
      return;
    }
    if (kind === 'level') { this.startLevel = this.startLevel % 10 + 1; store.set(`brick.lv.${this.id}`, this.startLevel); }
    else { this.speed = this.speed % 10 + 1; store.set(`brick.sp.${this.id}`, this.speed); }
    this.sound.select();
    this.state = 'idle';
    this.prepare();
    this.showMenu();
  }
  showMenu() {
    this.mascot?.set('idle');
    this.setIcon('pause', false);
    if (this.daily) {
      this.showOverlay(`<div class="menu"><b>DAILY<br>CHALLENGE</b><small>LEVEL 1 · SPEED 1<br>SAME GAME FOR EVERYONE</small><small class="press">PRESS START</small></div>`, 'overlay--menu');
      return;
    }
    this.showOverlay(`<div class="menu"><b>${this.meta.name.toUpperCase()}</b>`
      + `<div class="menu__row"><span>▲ LEVEL</span><em>${this.startLevel}</em></div>`
      + `<div class="menu__row"><span>▼ SPEED</span><em>${this.speed}</em></div>`
      + `<small>◀ ▶ CHANGE GAME</small><small class="press">PRESS START</small></div>`, 'overlay--menu');
  }
  setIcon(name, on) { document.querySelectorAll(`[data-icon="${name}"]`).forEach((el) => el.classList.toggle('is-on', on)); }

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
    this.prepare();
    this.acc = 0;
    this.state = 'playing';
    this.hideOverlay();
    this.setIcon('pause', false);
    this.mascot?.set('run');
    this.sound.boot();
  }
  pause() { this.state = 'paused'; this.showOverlay('PAUSED'); this.setIcon('pause', true); this.mascot?.set('rest'); this.sound.engineStop(); }
  resume() { this.state = 'playing'; this.acc = 0; this.hideOverlay(); this.setIcon('pause', false); this.mascot?.set('run'); }

  async gameOver() {
    this.state = 'anim';
    this.mascot?.set('down');
    this.sound.engineStop();
    this.lcd.shake(1.2);
    this.setIcon('pause', false);
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
    this.overAt = performance.now();
    if (this.score > 0 && !Leaderboard.name() && store.get('brick.nameAsked') !== '1') { this.showNamePrompt(); return; }
    this.showGameOver();
  }

  scoreLine() {
    return this.newBest
      ? `<small class="best">NEW BEST!<br><s>${fmt(this.prevHi)}</s> ${fmt(this.score)}</small>`
      : `<small>SCORE ${fmt(this.score)}</small>`;
  }

  showGameOver() {
    const join = this.score > 0 && !Leaderboard.name() ? '<button type="button" data-join>JOIN WORLD BOARD</button>' : '';
    this.showOverlay(`GAME OVER${this.scoreLine()}<small class="world" data-world></small><div class="overlay__btns"><button type="button" data-share>SHARE</button>${join}<button type="button" data-again>AGAIN</button></div>`);
    if (this.score > 0 && Leaderboard.name()) this.postScore();
  }

  /* First game over on a device: ask for a world-board name right on the screen. */
  showNamePrompt() {
    this.showOverlay(`GAME OVER${this.scoreLine()}<small>YOUR NAME FOR THE<br>WORLD BOARD</small><form class="namebox" data-nameform><input name="n" maxlength="12" placeholder="NAME" autocomplete="off" autocapitalize="characters" spellcheck="false" aria-label="Your name"><button type="submit">SAVE</button></form><button type="button" class="overlay__skip" data-skip>NOT NOW</button>`);
    const input = this.overlay.querySelector('input');
    setTimeout(() => input?.focus(), 50);
  }

  /* Send the finished score to the world board and show the rank it earned. */
  async postScore() {
    const slot = this.overlay.querySelector('[data-world]');
    this.overlay.querySelector('[data-join]')?.remove();
    if (slot) slot.textContent = 'SENDING…';
    try {
      const r = await Leaderboard.submit({ game: this.id, score: this.score, daily: this.daily, day: this.day });
      if (!slot || !r) return;
      const rank = this.daily ? r.rank.daily : r.rank.alltime;
      slot.textContent = rank ? `WORLD #${fmt(rank)}${this.daily ? ' TODAY' : ''}` : '';
      if (rank && rank <= 10) this.sound.best();
    } catch (_) { if (slot) slot.textContent = ''; }
  }

  addScore(n) {
    if (n > 0) n = Math.round(n * this.scoreMult());
    this.score += n;
    if (this.score > this.hi) {
      const first = !this.newBest && this.prevHi > 0;
      this.hi = this.score;
      store.set(this.hiKey, this.hi);
      this.hud.set('hi', this.hi);
      if (first) { this.newBest = true; this.sound.best(); this.hud.flash(); this.buzz([30, 30, 30]); this.mascot?.set('cheer', 1600); this.lcd.flash(2); }
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
      // Only the swatch and style buttons: the console element itself also carries data-skin.
      const s = e.target.closest('.swatch');
      if (s) { store.set('brick.skin', s.dataset.skin); this.applySettings(); this.syncSettings(); }
      const st = e.target.closest('.stylebtn');
      if (st) { store.set('brick.style', st.dataset.style); this.applySettings(); this.syncSettings(); this.lcd.flash(3); this.sound.select(); }
    });
    panel.addEventListener('input', (e) => {
      if (e.target.dataset.set !== 'volume') return;
      this.sound.setVolume(Number(e.target.value));
      clearTimeout(this.volTimer); this.volTimer = setTimeout(() => this.sound.score(), 120);
    });
    panel.addEventListener('change', (e) => {
      const k = e.target.dataset.set;
      if (k === 'volume') return;
      if (k === 'sound') this.sound.setMuted(!e.target.checked);
      else if (k === 'tilt') { store.set('brick.tilt', e.target.checked ? '1' : '0'); if (e.target.checked) this.askTilt(); }
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
    const style = currentStyle();
    c.dataset.style = style;
    this.lcd.setStyle(style);
    this.preview?.setStyle(style);
    this.sound.style = style;
    if (style === 'classic') this.sound.engineStop();
  }
  syncSettings() {
    const panel = document.getElementById('settings');
    if (!panel) return;
    const skin = store.get('brick.skin', 'grey');
    panel.querySelectorAll('[data-skin]').forEach((b) => b.classList.toggle('is-on', b.dataset.skin === skin));
    const set = (k, v) => { const el = panel.querySelector(`[data-set="${k}"]`); if (el) el.checked = v; };
    const style = currentStyle();
    panel.querySelectorAll('.stylebtn').forEach((b) => { const on = b.dataset.style === style; b.classList.toggle('is-on', on); b.setAttribute('aria-pressed', String(on)); });
    const vol = panel.querySelector('[data-set="volume"]'); if (vol) vol.value = this.sound.volume;
    set('tilt', this.tiltWanted());
    set('bigpad', store.get('brick.bigpad') === '1');
    set('contrast', store.get('brick.contrast') === '1');
    set('sound', !this.sound.muted);
  }

  /* --- tilt: the screen leans with the phone (3D and Neon only) --- */
  tiltWanted() {
    const needsPermission = typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function';
    return store.get('brick.tilt', needsPermission ? '0' : '1') === '1';
  }
  askTilt() {
    const D = typeof DeviceOrientationEvent !== 'undefined' ? DeviceOrientationEvent : null;
    if (D && typeof D.requestPermission === 'function') {
      D.requestPermission().then((r) => { if (r !== 'granted') { store.set('brick.tilt', '0'); this.syncSettings(); } }).catch(() => { store.set('brick.tilt', '0'); this.syncSettings(); });
    }
  }
  initTilt() {
    this.tiltEl = document.querySelector('.screen');
    this.tiltBase = null;
    this.tiltTarget = { x: 0, y: 0 };
    window.addEventListener('deviceorientation', (e) => {
      if (e.beta == null || e.gamma == null) return;
      if (this.tiltBase == null) this.tiltBase = e.beta;
      this.tiltBase += (e.beta - this.tiltBase) * 0.01;
      this.tiltTarget.x = Math.max(-1, Math.min(1, e.gamma / 22));
      this.tiltTarget.y = Math.max(-1, Math.min(1, (e.beta - this.tiltBase) / 22));
    });
  }
  updateTilt(dt) {
    const on = !REDUCE_MOTION && this.lcd.style !== 'classic' && this.tiltWanted();
    const tt = on ? this.tiltTarget : { x: 0, y: 0 }, cur = this.lcd.tilt;
    const k = Math.min(1, dt * 8);
    cur.x += (tt.x - cur.x) * k; cur.y += (tt.y - cur.y) * k;
    if (!this.tiltEl) return;
    const tf = Math.abs(cur.x) + Math.abs(cur.y) < 0.002 ? '' : `perspective(900px) rotateX(${(-cur.y * 5).toFixed(2)}deg) rotateY(${(cur.x * 6).toFixed(2)}deg)`;
    if (tf !== this.lastTilt) { this.tiltEl.style.transform = tf; this.lastTilt = tf; }
  }

  /* --- loop --- */
  frame(t) {
    const dt = Math.min(t - this.last, 100);
    this.last = t;
    if (this.state === 'playing') {
      this.acc += dt;
      let guard = 0;
      let iv = this.tickInterval() * this.speedFactor();
      while (this.acc >= iv && guard++ < 5) {
        this.acc -= iv;
        this.step();
        if (this.state !== 'playing') { this.acc = 0; break; }
        iv = this.tickInterval() * this.speedFactor();
      }
      if (this.level > this.seenLevel) { this.seenLevel = this.level; this.mascot?.set('cheer', 1400); this.lcd.flash(3); }
    }
    this.mascot?.update(t, this.speed);
    this.updateTilt(dt / 1000);
    if (this.state !== 'anim') {
      this.lcd.clear();
      this.draw();
    }
    this.lcd.draw();
    requestAnimationFrame((tt) => this.frame(tt));
  }

  /* --- helpers --- */
  showOverlay(html, cls = '') { this.overlay.className = cls ? `overlay ${cls}` : 'overlay'; this.overlay.innerHTML = html; this.overlay.hidden = false; }
  hideOverlay() { this.overlay.hidden = true; }
  buzz(pattern) { try { navigator.vibrate?.(pattern); } catch (_) { /* ignore */ } }
  blink(period = 250) { return Math.floor(performance.now() / period) % 2 === 0; }
  toggleMute() { this.sound.toggle(); this.syncMute(); }
  syncMute() {
    const b = document.querySelector('[data-mute]');
    if (b) b.setAttribute('aria-pressed', String(!this.sound.muted));
    this.setIcon('sound', !this.sound.muted);
    this.syncSettings();
  }
}

/* ---------- Offline / install ---------- */
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(() => {}); });
  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshing || !navigator.serviceWorker.controller) return;
    refreshing = true;
    if (!window.game || window.game.state !== 'playing') location.reload();
  });
}

window.BrickArcade = { LCD, HUD, Input, Sound, Game, Stats, Leaderboard, GAMES, PALETTES, SKINS, STYLES, currentStyle, SITE, store, segSVG, sleep, fmt, dayKey, dayNumber, dailyGame, hashSeed, mulberry32 };
