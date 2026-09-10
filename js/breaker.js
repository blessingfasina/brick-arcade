/* Brick Breaker — grid-based ball, three-wide paddle, brick layouts */
'use strict';
(() => {
  const { Game } = window.BrickArcade;

  const LAYOUTS = [
    ['XXXXXXXXXX', 'XXXXXXXXXX', 'XXXXXXXXXX'],
    ['X.X.X.X.X.', '.X.X.X.X.X', 'X.X.X.X.X.', '.X.X.X.X.X'],
    ['..XXXXXX..', '.XXXXXXXX.', 'XXXXXXXXXX', '.XXXXXXXX.', '..XXXXXX..'],
    ['XX......XX', 'XXX....XXX', 'XXXX..XXXX', 'XXX....XXX', 'XX......XX'],
    ['XXXXXXXXXX', 'X........X', 'X.XXXXXX.X', 'X........X', 'XXXXXXXXXX'],
    ['X.XX..XX.X', 'XX.XXXX.XX', '.XXX..XXX.', 'XX.XXXX.XX', 'X.XX..XX.X'],
  ];
  const PADDLE = 3;

  class Breaker extends Game {
    constructor() {
      super({ id: 'breaker', cols: 10, rows: 20, interval: 115 });
      this.input.on('left', () => this.move(-1));
      this.input.on('right', () => this.move(1));
      this.input.on('action', () => this.launch());
      this.input.on('up', () => this.launch());
    }

    reset() {
      this.level = 1;
      this.lives = 3;
      this.loadLevel();
      this.hud.set('level', this.level, 2);
      this.hud.set('lives', this.lives, 1);
    }

    loadLevel() {
      this.bricks = new Set();
      const layout = LAYOUTS[(this.level - 1) % LAYOUTS.length];
      layout.forEach((row, y) => {
        for (let x = 0; x < row.length; x++) if (row[x] === 'X') this.bricks.add(`${x},${y + 1}`);
      });
      this.paddle = Math.floor((this.cols - PADDLE) / 2);
      this.interval = Math.max(60, this.baseInterval - (this.level - 1) * 8);
      this.resetBall();
    }

    resetBall() {
      this.ball = { x: this.paddle + 1, y: this.rows - 2 };
      this.vel = { x: Math.random() < 0.5 ? -1 : 1, y: -1 };
      this.launched = false;
    }

    move(dx) {
      if (this.state !== 'playing') return;
      this.paddle = Math.max(0, Math.min(this.cols - PADDLE, this.paddle + dx));
      if (!this.launched) this.ball.x = this.paddle + 1;
    }

    launch() {
      if (this.state === 'playing' && !this.launched) {
        this.launched = true;
        this.sound.tick();
      }
    }

    hasBrick(x, y) { return this.bricks.has(`${x},${y}`); }
    breakBrick(x, y) {
      this.bricks.delete(`${x},${y}`);
      this.addScore(10 * this.level);
      this.sound.hit();
    }

    step() {
      if (!this.launched) return;
      const b = this.ball, v = this.vel;

      // Walls and ceiling.
      if (b.x + v.x < 0 || b.x + v.x >= this.cols) { v.x = -v.x; this.sound.tick(); }
      if (b.y + v.y < 0) { v.y = 1; this.sound.tick(); }

      // Bricks: vertical face first, then horizontal, then the corner.
      let hit = false;
      if (this.hasBrick(b.x, b.y + v.y)) { this.breakBrick(b.x, b.y + v.y); v.y = -v.y; hit = true; }
      if (this.hasBrick(b.x + v.x, b.y)) { this.breakBrick(b.x + v.x, b.y); v.x = -v.x; hit = true; }
      if (!hit && this.hasBrick(b.x + v.x, b.y + v.y)) { this.breakBrick(b.x + v.x, b.y + v.y); v.x = -v.x; v.y = -v.y; hit = true; }
      if (hit) {
        this.buzz(10);
        if (this.bricks.size === 0) { this.nextLevel(); return; }
        if (b.x + v.x < 0 || b.x + v.x >= this.cols) v.x = -v.x;
        if (b.y + v.y < 0) v.y = 1;
      }

      const nx = b.x + v.x, ny = b.y + v.y;

      // Paddle row.
      if (ny === this.rows - 1) {
        const onPaddle = (x) => x >= this.paddle && x < this.paddle + PADDLE;
        if (onPaddle(nx) || onPaddle(b.x)) {
          const rel = nx - this.paddle;
          v.y = -1;
          if (rel <= 0) v.x = -1;
          else if (rel >= PADDLE - 1) v.x = 1;
          b.x = Math.max(0, Math.min(this.cols - 1, nx));
          this.sound.hit();
          return;
        }
        this.loseLife();
        return;
      }
      b.x = nx;
      b.y = ny;
    }

    nextLevel() {
      this.level++;
      this.hud.set('level', this.level, 2);
      this.sound.level();
      this.loadLevel();
    }

    loseLife() {
      this.lives--;
      this.hud.set('lives', Math.max(0, this.lives), 1);
      this.sound.lose();
      this.buzz(50);
      if (this.lives <= 0) { this.gameOver(); return; }
      this.resetBall();
    }

    draw() {
      for (const key of this.bricks) {
        const [x, y] = key.split(',').map(Number);
        this.lcd.set(x, y, 1);
      }
      for (let i = 0; i < PADDLE; i++) this.lcd.set(this.paddle + i, this.rows - 1, 1);
      if (this.launched || this.state !== 'playing' || this.blink(300)) this.lcd.set(this.ball.x, this.ball.y, 1);
    }
  }

  new Breaker();
})();
