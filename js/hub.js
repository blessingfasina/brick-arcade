/* Brick Arcade — home page: animated mini handhelds, falling bricks, random game */
'use strict';
(() => {
  const { LCD } = window.BrickArcade;
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
        for (let i = 0; i < 6; i++) {
          const [x, y] = SNAKE_PATH[(t + i) % SNAKE_PATH.length];
          lcd.set(x, y, 1);
        }
        if (tick % 2 === 0) lcd.set(4, 4, 1);
        t++;
      };
    },
    breaker() {
      let bricks, ball, vel;
      const reset = () => {
        bricks = new Set();
        for (let y = 0; y < 2; y++) for (let x = 0; x < 8; x++) bricks.add(`${x},${y}`);
        ball = { x: 3, y: 5 };
        vel = { x: 1, y: -1 };
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
  };

  const screens = [];
  document.querySelectorAll('.hh').forEach((card) => {
    const id = card.dataset.game;
    const lcd = new LCD(card.querySelector('canvas'), 8, 8);
    screens.push({ lcd, update: demos[id]() });
    const best = Number(localStorage.getItem('brick.hi.' + id)) || 0;
    if (best) card.querySelector('[data-best]').textContent = 'BEST ' + best.toLocaleString();
  });

  let tick = 0;
  const renderDemos = () => {
    for (const s of screens) { s.lcd.clear(); s.update(s.lcd, tick); s.lcd.draw(); }
    tick++;
  };
  renderDemos();
  if (!reduceMotion) setInterval(renderDemos, 200);

  /* ---------- Random game button ---------- */
  const games = ['snake', 'breaker', 'racer', 'stack'];
  const random = document.querySelector('[data-random]');
  if (random) random.href = '/' + games[rand(games.length)];

  /* ---------- Falling bricks backdrop ---------- */
  const bg = document.getElementById('bg');
  if (bg) {
    const ctx = bg.getContext('2d');
    const COLORS = ['#7dff5a', '#ff8a2a', '#3ee9ff', '#ff5fb0', '#ffd400', '#a259ff'];
    let w = 0, h = 0, bricks = [];
    const spawn = (fromTop) => ({
      x: Math.random() * w,
      y: fromTop ? -20 : Math.random() * h,
      s: 8 + Math.random() * 12,
      v: 0.25 + Math.random() * 0.6,
      c: COLORS[rand(COLORS.length)],
      r: Math.random() * Math.PI,
      rv: (Math.random() - 0.5) * 0.02,
    });
    const resize = () => {
      w = bg.width = window.innerWidth;
      h = bg.height = window.innerHeight;
      const n = Math.min(70, Math.floor((w * h) / 18000));
      bricks = Array.from({ length: n }, () => spawn(false));
    };
    const drawBrick = (b) => {
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(b.r);
      ctx.fillStyle = b.c;
      const s = b.s, t = s * 0.18, i = s * 0.3;
      ctx.fillRect(-s / 2, -s / 2, s, s);
      ctx.clearRect(-s / 2 + t, -s / 2 + t, s - 2 * t, s - 2 * t);
      ctx.fillRect(-s / 2 + i, -s / 2 + i, s - 2 * i, s - 2 * i);
      ctx.restore();
    };
    const frame = () => {
      ctx.clearRect(0, 0, w, h);
      ctx.globalAlpha = 0.5;
      for (let k = 0; k < bricks.length; k++) {
        const b = bricks[k];
        b.y += b.v; b.r += b.rv;
        if (b.y > h + 20) bricks[k] = spawn(true);
        drawBrick(b);
      }
      if (!reduceMotion) requestAnimationFrame(frame);
    };
    window.addEventListener('resize', resize);
    resize();
    frame();
  }
})();
