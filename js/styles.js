/* Retro Classic Games — Screen Styles page: three live screens running the same demo,
   drawn by the real game renderer, with a style picker and the matching sounds. */
(() => {
  'use strict';
  const { LCD, Sound, PALETTES, store, currentStyle } = window.BrickArcade;
  const COLS = 10, ROWS = 20, N = COLS * ROWS;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const rnd = (n) => Math.floor(Math.random() * n);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  /* ---------- Shared demo state: which cells are lit, and a colour index per cell ---------- */
  const state = { cells: new Uint8Array(N), color: new Uint8Array(N), score: 0 };
  const listeners = [];
  const emit = (ev) => listeners.forEach((l) => l(ev));
  const litCells = () => { const out = []; for (let i = 0; i < N; i++) if (state.cells[i]) out.push({ x: i % COLS, y: (i / COLS) | 0, c: state.color[i] }); return out; };

  /* ---------- Brick Stack demo: a small AI that places pieces, with a little noise ---------- */
  const SHAPES = {
    I: [['....', 'XXXX', '....', '....'], ['..X.', '..X.', '..X.', '..X.']],
    O: [['XX', 'XX']],
    T: [['.X.', 'XXX', '...'], ['.X.', '.XX', '.X.'], ['...', 'XXX', '.X.'], ['.X.', 'XX.', '.X.']],
    S: [['.XX', 'XX.', '...'], ['.X.', '.XX', '..X']],
    Z: [['XX.', '.XX', '...'], ['..X', '.XX', '.X.']],
    J: [['X..', 'XXX', '...'], ['.XX', '.X.', '.X.'], ['...', 'XXX', '..X'], ['.X.', '.X.', 'XX.']],
    L: [['..X', 'XXX', '...'], ['.X.', '.X.', '.XX'], ['...', 'XXX', 'X..'], ['XX.', '.X.', '.X.']],
  };
  const PIECES = {};
  Object.entries(SHAPES).forEach(([k, rots], idx) => {
    PIECES[k] = { color: idx + 1, rots: rots.map((rows) => { const c = []; rows.forEach((r, y) => [...r].forEach((ch, x) => { if (ch === 'X') c.push([x, y]); })); return c; }) };
  });
  const TYPES = Object.keys(PIECES);

  const stack = {
    interval: 65,
    reset() {
      this.board = new Uint8Array(N);
      for (let y = ROWS - 4; y < ROWS; y++) { for (let x = 0; x < COLS; x++) if (Math.random() < 0.55) this.board[y * COLS + x] = 1 + rnd(7); this.board[y * COLS + rnd(COLS)] = 0; }
      state.score = 0;
      this.spawn();
    },
    cellsOf(p) { return PIECES[p.type].rots[p.rot].map(([x, y]) => [p.x + x, p.y + y]); },
    fits(p, board = this.board) { return this.cellsOf(p).every(([x, y]) => x >= 0 && x < COLS && y < ROWS && (y < 0 || !board[y * COLS + x])); },
    evaluate(cells) {
      const b = this.board.slice();
      for (const [x, y] of cells) { if (y < 0) return -1e9; b[y * COLS + x] = 1; }
      const full = [];
      for (let y = 0; y < ROWS; y++) { let f = true; for (let x = 0; x < COLS; x++) if (!b[y * COLS + x]) { f = false; break; } if (f) full.push(y); }
      let nb = b;
      if (full.length) { nb = new Uint8Array(N); let wy = ROWS - 1; for (let y = ROWS - 1; y >= 0; y--) { if (full.includes(y)) continue; for (let x = 0; x < COLS; x++) nb[wy * COLS + x] = b[y * COLS + x]; wy--; } }
      const h = []; let holes = 0;
      for (let x = 0; x < COLS; x++) { let seen = false, hh = 0; for (let y = 0; y < ROWS; y++) { const f = nb[y * COLS + x]; if (f && !seen) { seen = true; hh = ROWS - y; } else if (!f && seen) holes++; } h.push(hh); }
      let bump = 0; for (let x = 0; x < COLS - 1; x++) bump += Math.abs(h[x] - h[x + 1]);
      return -0.51 * h.reduce((a, v) => a + v, 0) + 0.76 * full.length - 0.36 * holes - 0.18 * bump;
    },
    spawn() {
      const type = TYPES[rnd(TYPES.length)];
      this.cur = { type, rot: 0, x: 3, y: -2 };
      if (!this.fits(this.cur)) { this.topOut(); return; }
      const options = [];
      PIECES[type].rots.forEach((_, rot) => {
        for (let x = -2; x < COLS; x++) {
          const p = { type, rot, x, y: -2 };
          if (!this.fits(p)) continue;
          while (this.fits({ ...p, y: p.y + 1 })) p.y++;
          options.push({ rot, x, score: this.evaluate(this.cellsOf(p)) });
        }
      });
      options.sort((a, b) => b.score - a.score);
      this.target = (Math.random() < 0.18 ? options[rnd(Math.min(5, options.length))] : options[0]) || { rot: 0, x: 3 };
    },
    topOut() { emit({ type: 'sfx', name: 'crash' }); emit({ type: 'shake' }); emit({ type: 'burst', cells: litCells(), power: 1.3 }); this.reset(); },
    tick() {
      const c = this.cur, t = this.target;
      if (c.rot !== t.rot) { const p = { ...c, rot: t.rot }; if (this.fits(p)) c.rot = t.rot; else t.rot = c.rot; return; }
      if (c.x !== t.x) { const p = { ...c, x: c.x + Math.sign(t.x - c.x) }; if (this.fits(p)) c.x = p.x; else t.x = c.x; return; }
      const down = { ...c, y: c.y + 1 };
      if (this.fits(down)) { c.y++; return; }
      const color = PIECES[c.type].color;
      for (const [x, y] of this.cellsOf(c)) { if (y < 0) { this.topOut(); return; } this.board[y * COLS + x] = color; }
      const full = [];
      for (let y = 0; y < ROWS; y++) { let f = true; for (let x = 0; x < COLS; x++) if (!this.board[y * COLS + x]) { f = false; break; } if (f) full.push(y); }
      if (full.length) {
        const cells = [];
        for (const y of full) for (let x = 0; x < COLS; x++) cells.push({ x, y, c: this.board[y * COLS + x] });
        emit({ type: 'burst', cells, power: 1 });
        emit({ type: 'flash', color: full.length >= 3 ? 2 : 3 });
        emit({ type: 'sfx', name: 'clear', arg: full.length });
        const nb = new Uint8Array(N); let wy = ROWS - 1;
        for (let y = ROWS - 1; y >= 0; y--) { if (full.includes(y)) continue; for (let x = 0; x < COLS; x++) nb[wy * COLS + x] = this.board[y * COLS + x]; wy--; }
        this.board = nb;
        state.score += [0, 100, 300, 500, 800][full.length];
      } else emit({ type: 'sfx', name: 'land' });
      this.spawn();
    },
    render() {
      state.cells.fill(0); state.color.fill(0);
      for (let i = 0; i < N; i++) if (this.board[i]) { state.cells[i] = 1; state.color[i] = this.board[i]; }
      if (this.cur) for (const [x, y] of this.cellsOf(this.cur)) if (y >= 0) { state.cells[y * COLS + x] = 1; state.color[y * COLS + x] = PIECES[this.cur.type].color; }
    },
  };

  /* ---------- Snake demo: path-finds to the food ---------- */
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const snake = {
    interval: 105,
    reset() {
      this.body = [{ x: 5, y: 12 }, { x: 4, y: 12 }, { x: 3, y: 12 }, { x: 2, y: 12 }];
      state.score = 0;
      this.placeFood();
    },
    occupied() { const s = new Set(); this.body.forEach((b) => s.add(b.y * COLS + b.x)); return s; },
    placeFood() {
      const occ = this.occupied(); const free = [];
      for (let i = 0; i < N; i++) if (!occ.has(i)) free.push(i);
      const i = free[rnd(free.length)];
      this.food = { x: i % COLS, y: (i / COLS) | 0 };
    },
    firstStep(goal, blocked) {
      const h = this.body[0], start = h.y * COLS + h.x, target = goal.y * COLS + goal.x;
      const prev = new Map([[start, -1]]); const q = [start];
      while (q.length) {
        const cur = q.shift();
        if (cur === target) { let c = cur; while (prev.get(c) !== start) c = prev.get(c); return c; }
        const cx = cur % COLS, cy = (cur / COLS) | 0;
        for (const [dx, dy] of DIRS) {
          const nx = cx + dx, ny = cy + dy, ni = ny * COLS + nx;
          if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS || prev.has(ni) || blocked.has(ni)) continue;
          prev.set(ni, cur); q.push(ni);
        }
      }
      return null;
    },
    space(from, blocked) {
      const seen = new Set([from]); const q = [from];
      while (q.length) { const cur = q.shift(); const cx = cur % COLS, cy = (cur / COLS) | 0;
        for (const [dx, dy] of DIRS) { const nx = cx + dx, ny = cy + dy, ni = ny * COLS + nx;
          if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS || seen.has(ni) || blocked.has(ni)) continue; seen.add(ni); q.push(ni); } }
      return seen.size;
    },
    tick() {
      const blocked = this.occupied(); const tail = this.body[this.body.length - 1];
      blocked.delete(tail.y * COLS + tail.x);
      let next = this.firstStep(this.food, blocked);
      if (next !== null) { const tmp = new Set(blocked); tmp.add(next); if (this.space(next, tmp) < this.body.length) next = null; }
      if (next === null) {
        const h = this.body[0]; let best = null, bestSpace = -1;
        for (const [dx, dy] of DIRS) { const nx = h.x + dx, ny = h.y + dy, ni = ny * COLS + nx;
          if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS || blocked.has(ni)) continue;
          const sp = this.space(ni, blocked); if (sp > bestSpace) { bestSpace = sp; best = ni; } }
        next = best;
      }
      if (next === null) { emit({ type: 'sfx', name: 'crash' }); emit({ type: 'shake' }); emit({ type: 'burst', cells: litCells(), power: 1.2 }); this.reset(); return; }
      const head = { x: next % COLS, y: (next / COLS) | 0 };
      this.body.unshift(head);
      if (head.x === this.food.x && head.y === this.food.y) {
        state.score += 10;
        emit({ type: 'sfx', name: 'eat' });
        emit({ type: 'burst', cells: [{ x: head.x, y: head.y, c: 1 }], power: 0.7 });
        if (this.body.length >= 60) { emit({ type: 'sfx', name: 'level' }); emit({ type: 'flash', color: 4 }); this.reset(); return; }
        this.placeFood();
      } else this.body.pop();
    },
    render() {
      state.cells.fill(0); state.color.fill(0);
      this.body.forEach((b, i) => { const k = b.y * COLS + b.x; state.cells[k] = 1; state.color[k] = i === 0 ? 8 : (i % 6 < 3 ? 3 : 6); });
      const f = this.food.y * COLS + this.food.x; state.cells[f] = 1; state.color[f] = 1;
    },
  };

  /* ---------- Breaker demo ---------- */
  const ROW_COLORS = [1, 5, 2, 4, 3];
  const breaker = {
    interval: 85,
    reset() { state.score = 0; this.layout(); this.pad = 3; this.ball = { x: 4, y: 17 }; this.vel = { x: 1, y: -1 }; },
    layout() { this.bricks = new Map(); for (let r = 0; r < 5; r++) for (let x = 0; x < COLS; x++) this.bricks.set((r + 2) * COLS + x, ROW_COLORS[r]); },
    has(x, y) { return this.bricks.has(y * COLS + x); },
    hit(x, y) { const k = y * COLS + x; emit({ type: 'burst', cells: [{ x, y, c: this.bricks.get(k) }], power: 0.9 }); this.bricks.delete(k); state.score += 10; emit({ type: 'sfx', name: 'brick' }); },
    tick() {
      const b = this.ball, v = this.vel;
      this.pad = clamp(this.pad + Math.sign(b.x - 1 - this.pad), 0, COLS - 3);
      if (b.x + v.x < 0 || b.x + v.x >= COLS) v.x = -v.x;
      if (b.y + v.y < 0) v.y = 1;
      let hit = false;
      if (this.has(b.x, b.y + v.y)) { this.hit(b.x, b.y + v.y); v.y = -v.y; hit = true; }
      if (this.has(b.x + v.x, b.y)) { this.hit(b.x + v.x, b.y); v.x = -v.x; hit = true; }
      if (!hit && this.has(b.x + v.x, b.y + v.y)) { this.hit(b.x + v.x, b.y + v.y); v.x = -v.x; v.y = -v.y; hit = true; }
      if (hit) {
        if (!this.bricks.size) { emit({ type: 'sfx', name: 'level' }); emit({ type: 'flash', color: 2 }); this.layout(); }
        if (b.x + v.x < 0 || b.x + v.x >= COLS) v.x = -v.x;
        if (b.y + v.y < 0) v.y = 1;
      }
      const nx = b.x + v.x, ny = b.y + v.y;
      if (ny === ROWS - 1) {
        const on = (x) => x >= this.pad && x < this.pad + 3;
        if (on(nx) || on(b.x)) { emit({ type: 'sfx', name: 'hit' }); v.y = -1; const rel = nx - this.pad; if (rel <= 0) v.x = -1; else if (rel >= 2) v.x = 1; return; }
        emit({ type: 'sfx', name: 'lose' }); emit({ type: 'shake' });
        this.ball = { x: this.pad + 1, y: ROWS - 3 }; this.vel = { x: Math.random() < 0.5 ? -1 : 1, y: -1 };
        return;
      }
      b.x = nx; b.y = ny;
    },
    render() {
      state.cells.fill(0); state.color.fill(0);
      for (const [k, c] of this.bricks) { state.cells[k] = 1; state.color[k] = c; }
      for (let i = 0; i < 3; i++) { const k = (ROWS - 1) * COLS + this.pad + i; state.cells[k] = 1; state.color[k] = 6; }
      const k = this.ball.y * COLS + this.ball.x; state.cells[k] = 1; state.color[k] = 8;
    },
  };

  const DEMOS = { stack, snake, breaker };
  let demo = stack;
  demo.reset(); demo.render();

  /* ---------- Screens: the same renderer the games use ---------- */
  const screens = {
    '3d': new LCD(document.getElementById('c-3d'), COLS, ROWS, { style: '3d', palette: PALETTES.classic, neon: '#3ee9ff' }),
    neon: new LCD(document.getElementById('c-neon'), COLS, ROWS, { style: 'neon', palette: PALETTES.classic, neon: '#3ee9ff' }),
    classic: new LCD(document.getElementById('c-classic'), COLS, ROWS, { style: 'classic', palette: PALETTES.classic }),
  };
  const all = Object.values(screens);
  const code = (c) => (c ? c + 1 : 1);
  const sound = new Sound();
  let soundOn = false;
  const playSfx = (name, arg) => { if (soundOn && typeof sound[name] === 'function') sound[name](arg); };
  listeners.push((ev) => {
    if (ev.type === 'burst') all.forEach((l) => l.burst(ev.cells.map((c) => [c.x, c.y, code(c.c)]), ev.power || 1));
    else if (ev.type === 'flash') all.forEach((l) => l.flash(code(ev.color)));
    else if (ev.type === 'shake') all.forEach((l) => l.shake(1));
    else if (ev.type === 'sfx') playSfx(ev.name, ev.arg);
  });
  function paint() {
    for (const l of all) { for (let i = 0; i < N; i++) l.cells[i] = state.cells[i] ? code(state.color[i]) : 0; }
  }

  /* ---------- Your style ---------- */
  function syncChoice() {
    const mine = currentStyle();
    sound.style = mine;
    document.querySelectorAll('[data-use]').forEach((b) => {
      const on = b.dataset.use === mine;
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-pressed', String(on));
      b.textContent = on ? '✓ YOUR STYLE' : 'USE THIS STYLE';
    });
    document.querySelectorAll('[data-style-name]').forEach((el) => { el.textContent = { '3d': '3D Bricks', neon: 'Neon Arcade', classic: 'Classic LCD' }[mine]; });
  }
  document.querySelectorAll('[data-use]').forEach((b) => b.addEventListener('click', () => {
    store.set('brick.style', b.dataset.use);
    syncChoice();
    screens[b.dataset.use].flash(3);
    playSfx('select');
  }));
  syncChoice();

  const soundBtn = document.getElementById('fx-sound');
  soundBtn.addEventListener('click', () => {
    soundOn = !soundOn;
    sound.unlock();
    sound.muted = !soundOn;
    sound.applyVolume();
    soundBtn.setAttribute('aria-pressed', String(soundOn));
    soundBtn.textContent = soundOn ? 'SOUND ON' : 'SOUND OFF';
    if (soundOn) setTimeout(() => sound.boot(), 60);
  });

  /* ---------- Controls ---------- */
  const tilt = { x: 0, y: 0, tx: 0, ty: 0 };
  document.querySelectorAll('input[name="game"]').forEach((r) => r.addEventListener('change', () => {
    demo = DEMOS[r.value]; demo.reset(); demo.render(); acc = 0;
  }));
  let tiltMode = reduceMotion ? 'flat' : 'wobble';
  const tiltInput = document.getElementById('t-' + tiltMode); if (tiltInput) tiltInput.checked = true;
  document.querySelectorAll('input[name="tilt"]').forEach((r) => r.addEventListener('change', () => { tiltMode = r.value; tilt.tx = tilt.ty = 0; }));
  const stageEl = document.getElementById('stage');
  stageEl.addEventListener('pointermove', (e) => {
    if (tiltMode !== 'pointer') return;
    const r = stageEl.getBoundingClientRect();
    tilt.tx = clamp(((e.clientX - r.left) / r.width - 0.5) * 2, -1, 1);
    tilt.ty = clamp(((e.clientY - r.top) / r.height - 0.5) * 2, -1, 1);
  });
  stageEl.addEventListener('pointerleave', () => { tilt.tx = tilt.ty = 0; });
  document.getElementById('fx-burst').addEventListener('click', () => {
    const lit = litCells(); const pick = [];
    for (let i = 0; i < Math.min(14, lit.length); i++) pick.push(lit[rnd(lit.length)]);
    emit({ type: 'burst', cells: pick.length ? pick : [{ x: 4, y: 10, c: 3 }], power: 1.1 });
    playSfx('explode');
  });
  document.getElementById('fx-flash').addEventListener('click', () => { emit({ type: 'flash', color: 2 }); playSfx('level'); });
  document.getElementById('fx-shake').addEventListener('click', () => { emit({ type: 'shake' }); playSfx('crash'); });

  /* ---------- Loop ---------- */
  const tiltEls = [...document.querySelectorAll('[data-tilt]')];
  const scoreEls = [...document.querySelectorAll('[data-score]')];
  let last = performance.now(), acc = 0, shownScore = -1;
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    acc += dt * 1000;
    let guard = 0;
    while (acc >= demo.interval && guard++ < 4) { acc -= demo.interval; demo.tick(); demo.render(); }
    paint();
    if (tiltMode === 'wobble') { const t = now / 1000; tilt.tx = Math.sin(t * 0.7) * 0.75; tilt.ty = Math.sin(t * 0.53 + 1.3) * 0.5; }
    else if (tiltMode === 'flat') { tilt.tx = 0; tilt.ty = 0; }
    tilt.x += (tilt.tx - tilt.x) * Math.min(1, dt * 8); tilt.y += (tilt.ty - tilt.y) * Math.min(1, dt * 8);
    screens['3d'].tilt.x = screens.neon.tilt.x = tilt.x;
    screens['3d'].tilt.y = screens.neon.tilt.y = tilt.y;
    const tf = `rotateX(${(-tilt.y * 9).toFixed(2)}deg) rotateY(${(tilt.x * 12).toFixed(2)}deg)`;
    const gx = `${(50 - tilt.x * 45).toFixed(1)}%`;
    tiltEls.forEach((el) => { el.style.transform = tf; el.style.setProperty('--gx', gx); });
    for (const l of all) l.draw();
    if (state.score !== shownScore) { shownScore = state.score; const txt = 'SCORE ' + String(state.score).padStart(6, '0'); scoreEls.forEach((el) => { el.textContent = txt; }); }
    requestAnimationFrame(frame);
  }
  paint();
  requestAnimationFrame(frame);
})();
