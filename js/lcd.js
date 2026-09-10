/* Brick Arcade — shared engine: LCD renderer, input, sound, HUD, game loop */
'use strict';

const LCD_BG = '#9ead86';
const LCD_ON = '#1f231d';
const LCD_OFF = 'rgba(31,35,29,0.10)';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------- LCD grid renderer (brick-handheld cell look) ---------- */
class LCD {
  constructor(canvas, cols, rows) {
    this.canvas = canvas;
    this.cols = cols;
    this.rows = rows;
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
    this.sprites = { on: this.sprite(LCD_ON), off: this.sprite(LCD_OFF) };
    this.draw();
  }

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
  /** Paint a pattern of strings ('X' = on) at an offset. */
  blit(pattern, ox = 0, oy = 0) {
    pattern.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) if (row[x] === 'X') this.set(ox + x, oy + y, 1);
    });
  }

  draw() {
    const s = this.cell;
    if (!s || !this.sprites) return;
    const g = this.ctx;
    g.fillStyle = LCD_BG;
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
  constructor(root) {
    this.root = root;
    this.cache = {};
  }
  set(key, value, digits = 4) {
    if (this.cache[key] === value) return;
    this.cache[key] = value;
    const el = this.root.querySelector(`[data-hud="${key}"]`);
    if (el) el.innerHTML = segSVG(value, digits);
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
    this.muted = localStorage.getItem('brick.muted') === '1';
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
  toggle() {
    this.muted = !this.muted;
    localStorage.setItem('brick.muted', this.muted ? '1' : '0');
    return this.muted;
  }
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
  seq(notes) {
    let at = 0;
    for (const [f, d] of notes) { this.play(f, d, at); at += d; }
  }
  tick() { this.play(1200, 0.025, 0, 'square', 0.03); }
  hit() { this.play(660, 0.06); }
  score() { this.seq([[880, 0.05], [1320, 0.09]]); }
  lose() { this.seq([[440, 0.1], [330, 0.1], [220, 0.2]]); }
  level() { this.seq([[660, 0.06], [880, 0.06], [1100, 0.06], [1320, 0.14]]); }
  over() { this.seq([[523, 0.12], [392, 0.12], [330, 0.12], [262, 0.3]]); }
  clear() { this.seq([[988, 0.05], [1319, 0.05], [1760, 0.12]]); }
}

/* ---------- Base game: loop, states, overlay, hi-score ---------- */
class Game {
  constructor({ id, cols = 10, rows = 20, interval = 200 }) {
    this.id = id;
    this.cols = cols;
    this.rows = rows;
    this.baseInterval = interval;
    this.interval = interval;
    this.lcd = new LCD(document.getElementById('lcd'), cols, rows);
    this.hud = new HUD(document.querySelector('.hud'));
    this.input = new Input(document);
    this.sound = new Sound();
    this.overlay = document.getElementById('overlay');
    this.state = 'idle';
    this.score = 0;
    this.hi = Number(localStorage.getItem('brick.hi.' + id)) || 0;
    this.animToken = 0;
    this.last = 0;
    this.acc = 0;

    this.input.on('start', () => this.toggleStart());
    this.input.on('pause', () => this.togglePause());
    this.input.on('action', () => { if (this.state === 'idle' || this.state === 'over') this.start(); });
    this.input.on('mute', () => this.toggleMute());
    document.querySelector('[data-mute]')?.addEventListener('click', () => this.toggleMute());
    this.syncMute();

    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.state === 'playing') this.pause();
    });

    window.game = this;
    this.reset();
    this.showOverlay('PRESS<br>START');
    this.hud.set('hi', this.hi);
    this.hud.set('score', 0);
    requestAnimationFrame((t) => this.frame(t));
  }

  /* --- overridable --- */
  reset() {}
  step() {}
  draw() {}
  tickInterval() { return this.interval; }

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
    this.hud.set('score', 0);
    this.reset();
    this.acc = 0;
    this.state = 'playing';
    this.hideOverlay();
    this.sound.level();
  }
  pause() {
    this.state = 'paused';
    this.showOverlay('PAUSED');
  }
  resume() {
    this.state = 'playing';
    this.acc = 0;
    this.hideOverlay();
  }
  async gameOver() {
    this.state = 'anim';
    this.sound.over();
    this.buzz([60, 40, 60]);
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
    this.showOverlay(this.score >= this.hi && this.score > 0 ? 'GAME OVER<br><small>NEW HI-SCORE</small>' : 'GAME OVER');
  }

  addScore(n) {
    this.score += n;
    if (this.score > this.hi) {
      this.hi = this.score;
      localStorage.setItem('brick.hi.' + this.id, String(this.hi));
      this.hud.set('hi', this.hi);
    }
    this.hud.set('score', this.score);
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
  }
  rand(n) { return Math.floor(Math.random() * n); }
}

window.BrickArcade = { LCD, HUD, Input, Sound, Game, segSVG, sleep };
