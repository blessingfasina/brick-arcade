/* Retro Classic Games — home page: animated mini handhelds, daily challenge, install, backdrop */
'use strict';
(() => {
  const { LCD, GAMES, store, dailyGame, dayKey, fmt, Leaderboard } = window.BrickArcade;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const rand = (n) => Math.floor(Math.random() * n);

  /* ---------- Mini demos, one per handheld (8x8 LCD) ---------- */
  const SNAKE_PATH = [];
  for (let x = 1; x <= 6; x++) SNAKE_PATH.push([x, 1]);
  for (let y = 2; y <= 3; y++) SNAKE_PATH.push([6, y]);
  for (let x = 5; x >= 3; x--) SNAKE_PATH.push([x, 3]);
  for (let y = 4; y <= 5; y++) SNAKE_PATH.push([3, y]);
  for (let x = 4; x <= 6; x++) SNAKE_PATH.push([x, 5]);
  SNAKE_PATH.push([6, 6]);
  for (let x = 5; x >= 1; x--) SNAKE_PATH.push([x, 6]);
  for (let y = 5; y >= 2; y--) SNAKE_PATH.push([1, y]);
  const CAR = [[1, 0], [0, 1], [1, 1], [2, 1], [1, 2], [0, 3], [2, 3]];

  const demos = {
    snake() {
      let t = 0;
      return (lcd, tick) => {
        for (let i = 0; i < 6; i++) { const [x, y] = SNAKE_PATH[(t + i) % SNAKE_PATH.length]; lcd.set(x, y, 1); }
        if (tick % 2 === 0) lcd.set(4, 4, 1);
        t++;
      };
    },
    breaker() {
      let bricks, ball, vel;
      const reset = () => {
        bricks = new Set();
        for (let y = 0; y < 2; y++) for (let x = 0; x < 8; x++) bricks.add(`${x},${y}`);
        ball = { x: 3, y: 5 }; vel = { x: 1, y: -1 };
      };
      reset();
      return (lcd) => {
        if (ball.x + vel.x < 0 || ball.x + vel.x > 7) vel.x = -vel.x;
        if (ball.y + vel.y < 0) vel.y = 1;
        const key = `${ball.x + vel.x},${ball.y + vel.y}`;
        if (bricks.has(key)) { bricks.delete(key); vel.y = -vel.y; }
        else if (bricks.has(`${ball.x},${ball.y + vel.y}`)) { bricks.delete(`${ball.x},${ball.y + vel.y}`); vel.y = -vel.y; }
        if (ball.y + vel.y >= 7) vel.y = -1;
        ball.x += vel.x; ball.y += vel.y;
        if (!bricks.size) reset();
        for (const k of bricks) { const [x, y] = k.split(',').map(Number); lcd.set(x, y, 1); }
        const paddle = Math.max(0, Math.min(5, ball.x - 1));
        for (let i = 0; i < 3; i++) lcd.set(paddle + i, 7, 1);
        lcd.set(ball.x, ball.y, 1);
      };
    },
    racer() {
      let wall = 0, enemies = [], lane = 0, since = 0;
      const LANES = [1, 4];
      return (lcd) => {
        wall = (wall + 1) % 4;
        for (const e of enemies) e.y++;
        enemies = enemies.filter((e) => e.y < 8);
        if (++since >= 5) { since = 0; enemies.push({ lane: lane = rand(2), y: -4 }); }
        const threat = enemies.find((e) => e.y + 4 > 2);
        const player = threat ? 1 - threat.lane : lane;
        for (let y = 0; y < 8; y++) if ((((y - wall) % 4) + 4) % 4 !== 3) { lcd.set(0, y, 1); lcd.set(7, y, 1); }
        for (const e of enemies) for (const [x, y] of CAR) lcd.set(LANES[e.lane] + x, e.y + y, 1);
        for (const [x, y] of CAR) lcd.set(LANES[player] + x, 4 + y, 1);
      };
    },
    stack() {
      const SHAPES = [[[0, 0], [1, 0], [0, 1], [1, 1]], [[0, 0], [1, 0], [2, 0]], [[0, 0], [0, 1], [1, 1]], [[1, 0], [0, 1], [1, 1]]];
      let board = Array.from({ length: 8 }, () => new Uint8Array(8));
      let piece = null;
      const spawn = () => {
        const shape = SHAPES[rand(SHAPES.length)];
        const w = Math.max(...shape.map(([x]) => x)) + 1;
        piece = { shape, x: rand(8 - w + 1), y: -2 };
      };
      const fits = (p) => p.shape.every(([x, y]) => p.y + y < 8 && (p.y + y < 0 || !board[p.y + y][p.x + x]));
      spawn();
      return (lcd) => {
        const next = { ...piece, y: piece.y + 1 };
        if (fits(next)) piece = next;
        else {
          for (const [x, y] of piece.shape) if (piece.y + y >= 0) board[piece.y + y][piece.x + x] = 1;
          board = board.filter((row) => !row.every(Boolean));
          while (board.length < 8) board.unshift(new Uint8Array(8));
          if (board[1].some(Boolean)) board = Array.from({ length: 8 }, () => new Uint8Array(8));
          spawn();
        }
        board.forEach((row, y) => { for (let x = 0; x < 8; x++) if (row[x]) lcd.set(x, y, 1); });
        for (const [x, y] of piece.shape) lcd.set(piece.x + x, piece.y + y, 1);
      };
    },
    pong() {
      let ball = { x: 3, y: 4 }, vel = { x: 1, y: 1 }, top = 3, bottom = 3;
      return (lcd) => {
        if (ball.x + vel.x < 0 || ball.x + vel.x > 7) vel.x = -vel.x;
        if (ball.y + vel.y <= 0 || ball.y + vel.y >= 7) vel.y = -vel.y;
        ball.x += vel.x; ball.y += vel.y;
        const chase = (pad) => Math.max(0, Math.min(5, pad + Math.sign(ball.x - 1 - pad)));
        if (vel.y < 0) top = chase(top); else bottom = chase(bottom);
        for (let i = 0; i < 3; i++) { lcd.set(top + i, 0, 1); lcd.set(bottom + i, 7, 1); }
        lcd.set(ball.x, ball.y, 1);
      };
    },
    tanks() {
      const UP = ['.X.', 'XXX', 'X.X'], DOWN = ['X.X', 'XXX', '.X.'];
      let enemy = { x: 0, dir: 1 }, px = 2, shot = null, boom = 0;
      return (lcd, tick) => {
        if (boom > 0) { boom--; if (boom === 0) enemy = { x: rand(6), dir: Math.random() < 0.5 ? 1 : -1 }; }
        else if (tick % 2 === 0) { enemy.x += enemy.dir; if (enemy.x <= 0 || enemy.x >= 5) enemy.dir = -enemy.dir; }
        px += Math.sign(enemy.x - px);
        if (shot) { shot.y--; if (shot.y < 0) shot = null; else if (boom === 0 && shot.y <= 2 && shot.x >= enemy.x && shot.x <= enemy.x + 2) { shot = null; boom = 4; } }
        else if (px === enemy.x && boom === 0) shot = { x: px + 1, y: 4 };
        if (boom > 0) { if (boom % 2) lcd.blit(['X.X', '.X.', 'X.X'], enemy.x, 0); }
        else lcd.blit(DOWN, enemy.x, 0);
        lcd.blit(UP, px, 5);
        if (shot) lcd.set(shot.x, shot.y, 1);
      };
    },
    crossing() {
      const lanes = [{ y: 1, dir: 1, p: 'XX....XXX...' }, { y: 3, dir: -1, p: '..XX.....XX.' }, { y: 5, dir: 1, p: 'XXX....XX...' }];
      let off = 0, frog = { x: 3, y: 7 }, wait = 0;
      return (lcd, tick) => {
        if (tick % 2 === 0) off++;
        const has = (l, x) => l.p[((x - l.dir * off) % 12 + 12) % 12] === 'X';
        if (wait > 0) wait--;
        else {
          const ny = frog.y - 1;
          const lane = lanes.find((l) => l.y === ny);
          if (!lane || !has(lane, frog.x)) frog.y = ny;
          if (frog.y < 0) { frog = { x: 2 + rand(4), y: 7 }; wait = 3; }
          if (frog.y >= 0 && lanes.find((l) => l.y === frog.y && has(l, frog.x))) { frog = { x: 2 + rand(4), y: 7 }; wait = 3; }
        }
        for (const l of lanes) for (let x = 0; x < 8; x++) if (has(l, x)) lcd.set(x, l.y, 1);
        if (frog.y >= 0) lcd.set(frog.x, frog.y, 1);
      };
    },
    invaders() {
      let aliens = [], dir = 1, ship = 3, shot = null;
      const spawn = () => { aliens = []; for (let r = 0; r < 2; r++) for (let c = 0; c < 4; c++) aliens.push({ x: c * 2, y: r * 2 }); };
      spawn();
      return (lcd, tick) => {
        if (tick % 3 === 0) {
          const xs = aliens.map((a) => a.x);
          if ((dir > 0 && Math.max(...xs) >= 7) || (dir < 0 && Math.min(...xs) <= 0)) { dir = -dir; for (const a of aliens) a.y++; }
          else for (const a of aliens) a.x += dir;
          if (aliens.some((a) => a.y >= 5)) spawn();
        }
        const target = aliens[aliens.length - 1];
        if (target) ship += Math.sign(target.x - ship);
        if (shot) { shot.y--; const i = aliens.findIndex((a) => a.x === shot.x && a.y === shot.y); if (i >= 0) { aliens.splice(i, 1); shot = null; } else if (shot.y < 0) shot = null; }
        else if (target && ship === target.x) shot = { x: ship, y: 5 };
        if (!aliens.length) spawn();
        for (const a of aliens) lcd.set(a.x, a.y, 1);
        if (shot) lcd.set(shot.x, shot.y, 1);
        lcd.set(ship, 6, 1); lcd.set(ship - 1, 7, 1); lcd.set(ship, 7, 1); lcd.set(ship + 1, 7, 1);
      };
    },
    flappy() {
      let y = 3, vy = 0, pipes = [{ x: 7, gap: 2 }], since = 0;
      return (lcd) => {
        vy = Math.min(vy + 0.5, 1.2); y += vy;
        const p = pipes[0];
        if (p && p.x <= 4 && y > p.gap + 1) vy = -1.3;
        if (y >= 7) { y = 7; vy = -1.3; }
        if (y < 0) { y = 0; vy = 0; }
        for (const q of pipes) q.x--;
        pipes = pipes.filter((q) => q.x > -1);
        if (++since >= 6) { since = 0; pipes.push({ x: 8, gap: 1 + rand(4) }); }
        for (const q of pipes) for (let r = 0; r < 8; r++) if (r < q.gap || r >= q.gap + 3) lcd.set(q.x, r, 1);
        const by = Math.round(y);
        lcd.set(2, by, 1); lcd.set(1, vy < 0 ? by - 1 : by, 1);
      };
    },
  };

  const screens = [];
  document.querySelectorAll('.hh').forEach((card) => {
    const id = card.dataset.game;
    if (!demos[id]) return;
    const lcd = new LCD(card.querySelector('canvas'), 8, 8);
    screens.push({ lcd, update: demos[id]() });
    const best = Number(store.get('brick.hi.' + id)) || 0;
    if (best) card.querySelector('[data-best]').textContent = 'BEST ' + fmt(best);
  });
  let tick = 0;
  const renderDemos = () => { for (const s of screens) { s.lcd.clear(); s.update(s.lcd, tick); s.lcd.draw(); } tick++; };
  renderDemos();
  if (!reduceMotion) setInterval(renderDemos, 200);

  /* ---------- Random game button ---------- */
  const random = document.querySelector('[data-random]');
  if (random) random.href = '/' + GAMES[rand(GAMES.length)].id;

  /* ---------- Daily challenge card ---------- */
  const daily = document.querySelector('[data-daily]');
  if (daily) {
    const g = dailyGame();
    daily.querySelector('[data-daily-name]').textContent = g.name.toUpperCase();
    daily.querySelector('[data-daily-link]').href = `/${g.id}?mode=daily`;
    daily.style.setProperty('--body', g.color);
    const best = Number(store.get(`brick.daily.${g.id}.${dayKey()}`)) || 0;
    daily.querySelector('[data-daily-best]').textContent = best ? `YOUR BEST TODAY: ${fmt(best)}` : 'NOT PLAYED YET TODAY';
    const clock = daily.querySelector('[data-daily-clock]');
    const tickClock = () => {
      const now = new Date();
      const end = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
      const s = Math.max(0, Math.floor((end - now) / 1000));
      const pad = (n) => String(n).padStart(2, '0');
      clock.textContent = `NEW GAME IN ${pad(Math.floor(s / 3600))}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}`;
    };
    tickClock();
    setInterval(tickClock, 1000);
    const world = daily.querySelector('[data-daily-world]');
    if (world) {
      Leaderboard.fetch(g.id, { day: dayKey(), limit: 1 }).then((r) => {
        const top = r.daily[0];
        world.textContent = top ? `WORLD BEST TODAY: ${fmt(top.score)} BY ${top.name}` : 'NO WORLD SCORE YET TODAY. BE FIRST.';
        world.hidden = false;
      }).catch(() => {});
    }
  }

  /* ---------- Install as an app ---------- */
  const install = document.querySelector('[data-install]');
  const iosHint = document.querySelector('[data-ios-hint]');
  let deferred = null;
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; if (install) install.hidden = false; });
  install?.addEventListener('click', async () => { if (!deferred) return; deferred.prompt(); await deferred.userChoice; deferred = null; install.hidden = true; });
  const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent);
  const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  if (iosHint && isIOS && !standalone) iosHint.hidden = false;

  /* ---------- Streak badge ---------- */
  const streak = document.querySelector('[data-streak]');
  if (streak) {
    const n = window.BrickArcade.Stats.streak();
    if (n > 0) { streak.textContent = `🔥 ${n} DAY STREAK`; streak.hidden = false; }
  }

  /* ---------- Falling bricks backdrop ---------- */
  const bg = document.getElementById('bg');
  if (bg) {
    const ctx = bg.getContext('2d');
    const COLORS = ['#7dff5a', '#ff8a2a', '#3ee9ff', '#ff5fb0', '#ffd400', '#a259ff'];
    let w = 0, h = 0, bricks = [];
    const spawn = (fromTop) => ({
      x: Math.random() * w, y: fromTop ? -20 : Math.random() * h, s: 8 + Math.random() * 12,
      v: 0.25 + Math.random() * 0.6, c: COLORS[rand(COLORS.length)], r: Math.random() * Math.PI, rv: (Math.random() - 0.5) * 0.02,
    });
    const resize = () => {
      w = bg.width = window.innerWidth; h = bg.height = window.innerHeight;
      bricks = Array.from({ length: Math.min(70, Math.floor((w * h) / 18000)) }, () => spawn(false));
    };
    const drawBrick = (b) => {
      ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.r); ctx.fillStyle = b.c;
      const s = b.s, t = s * 0.18, i = s * 0.3;
      ctx.fillRect(-s / 2, -s / 2, s, s); ctx.clearRect(-s / 2 + t, -s / 2 + t, s - 2 * t, s - 2 * t); ctx.fillRect(-s / 2 + i, -s / 2 + i, s - 2 * i, s - 2 * i);
      ctx.restore();
    };
    const frame = () => {
      ctx.clearRect(0, 0, w, h); ctx.globalAlpha = 0.5;
      for (let k = 0; k < bricks.length; k++) { const b = bricks[k]; b.y += b.v; b.r += b.rv; if (b.y > h + 20) bricks[k] = spawn(true); drawBrick(b); }
      if (!reduceMotion) requestAnimationFrame(frame);
    };
    window.addEventListener('resize', resize);
    resize();
    frame();
  }
})();
