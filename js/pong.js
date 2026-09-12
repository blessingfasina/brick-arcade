/* Pong — you at the bottom, the CPU at the top, first to five wins the round */
'use strict';
(() => {
  const { Game } = window.BrickArcade;
  const PADDLE = 3;
  const TO_WIN = 5;

  class Pong extends Game {
    constructor() {
      super({ id: 'pong', cols: 10, rows: 20, interval: 130 });
      this.input.on('left', () => this.move(-1));
      this.input.on('right', () => this.move(1));
      this.input.on('action', () => this.serve());
      this.input.on('up', () => this.serve());
    }

    reset() {
      this.level = 1;
      this.you = 0;
      this.lives = 3;
      this.paddle = Math.floor((this.cols - PADDLE) / 2);
      this.cpuPad = this.paddle;
      this.interval = this.baseInterval;
      this.newBall();
      this.hud.set('you', 0, 1);
      this.hud.set('lives', this.lives, 1);
      this.hud.set('level', this.level, 2);
    }

    newBall() {
      this.ball = { x: this.paddle + 1, y: this.rows - 2 };
      this.vel = { x: this.random() < 0.5 ? -0.6 : 0.6, y: -1 };
      this.served = false;
      this.cpuMiss = this.random() < 0.35;
    }

    move(dx) {
      if (this.state !== 'playing') return;
      this.paddle = Math.max(0, Math.min(this.cols - PADDLE, this.paddle + dx));
      if (!this.served) this.ball.x = this.paddle + 1;
    }

    serve() {
      if (this.state === 'playing' && !this.served) { this.served = true; this.sound.tick(); }
    }

    /* The CPU reacts late, sometimes hesitates for a whole rally, and gets sharper each level. */
    moveCpu() {
      const skill = Math.min(0.9, 0.5 + (this.level - 1) * 0.07);
      const zone = Math.min(this.rows - 4, 5 + this.level * 2);
      let target = null;
      const bx = Math.round(this.ball.x);
      if (this.vel.y < 0) {
        if (this.cpuMiss) { if (this.ball.y < zone && this.random() < 0.5) target = bx < this.cols / 2 ? this.cols - PADDLE : 0; }
        else if (this.ball.y < zone && this.random() < skill) target = bx - 1;
      }
      else if (this.random() < 0.25) target = Math.floor((this.cols - PADDLE) / 2);
      if (target === null) return;
      this.cpuPad = Math.max(0, Math.min(this.cols - PADDLE, this.cpuPad + Math.sign(target - this.cpuPad)));
    }

    /* Angles: 0.5 = shallow, 1 = medium, 1.5 = steep cells per row. Different angles travel
       different distances, so the ball never falls into a fixed loop. */
    bounce(pad, cx, dirY, fromX = cx) {
      const rel = cx - pad;
      const cpu = dirY > 0;
      this.vel.y = dirY;
      if (!cpu) this.cpuMiss = this.random() < Math.max(0.08, 0.4 - (this.level - 1) * 0.05);
      const dir = Math.sign(this.vel.x) || (this.paddle + 1 >= this.cols / 2 ? -1 : 1);
      const clamp = (x) => Math.max(0, Math.min(this.cols - 1, x));
      if (cpu) {
        // The CPU simulates every shot it can make, from ten angles and a slight sideways
        // nudge, all the way to your paddle line. Most of the time it picks one that would
        // miss a paddle that stays put, so standing still is never a strategy.
        const pad = this.paddle;
        const onPad = (x) => x >= pad && x < pad + PADDLE;
        const path = (start, vx) => {
          let x = start, v = vx;
          const out = [];
          for (let i = 0; i < this.rows - 2; i++) {
            x += v;
            if (x < 0) { x = -x; v = -v; } else if (x > this.cols - 1) { x = 2 * (this.cols - 1) - x; v = -v; }
            out.push(x);
          }
          return out;
        };
        const caught = (start, vx) => { const p = path(start, vx); return onPad(Math.round(p[p.length - 2])) || onPad(Math.round(p[p.length - 1])); };
        const combos = [];
        for (const nudge of [0, -0.5, 0.5]) for (const a of [-1.6, -1.25, -0.9, -0.6, -0.35, 0.35, 0.6, 0.9, 1.25, 1.6]) combos.push({ nudge, a });
        const open = combos.filter((c) => !caught(clamp(fromX + c.nudge), c.a));
        const pick = open.length && this.random() < 0.7 ? open[this.rand(open.length)] : combos[this.rand(combos.length)];
        this.vel.x = pick.a;
        this.ball.x = clamp(fromX + pick.nudge);
      } else {
        if (rel <= 0) this.vel.x = this.vel.x < 0 ? -1.6 : -1.25;
        else if (rel >= PADDLE - 1) this.vel.x = this.vel.x > 0 ? 1.6 : 1.25;
        else this.vel.x = dir * 0.6;
        this.ball.x = clamp(fromX);
      }
      this.sound.hit();
    }

    step() {
      if (!this.served) return;
      this.moveCpu();
      const b = this.ball, v = this.vel;
      let nx = b.x + v.x;
      if (nx < 0) { nx = -nx; v.x = -v.x; this.sound.tick(); }
      else if (nx > this.cols - 1) { nx = 2 * (this.cols - 1) - nx; v.x = -v.x; this.sound.tick(); }
      const ny = b.y + v.y;
      const cx = Math.round(nx), px = Math.round(b.x);
      const covers = (pad, x) => x >= pad && x < pad + PADDLE;

      if (ny === 0) {
        if (covers(this.cpuPad, cx) || covers(this.cpuPad, px)) { this.bounce(this.cpuPad, cx, 1, nx); return; }
        this.point(true);
        return;
      }
      if (ny === this.rows - 1) {
        if (covers(this.paddle, cx) || covers(this.paddle, px)) { this.bounce(this.paddle, cx, -1, nx); this.buzz(10); return; }
        this.point(false);
        return;
      }
      b.x = nx;
      b.y = ny;
    }

    point(yours) {
      if (yours) {
        this.you++;
        this.addScore(10 * this.level);
        this.sound.score();
        this.hud.set('you', this.you, 1);
        if (this.you >= TO_WIN) {
          this.addScore(50 * this.level);
          this.level++;
          this.you = 0;
          this.lives = Math.min(3, this.lives + 1);
          this.interval = Math.max(70, this.baseInterval - (this.level - 1) * 10);
          this.hud.set('you', 0, 1);
          this.hud.set('lives', this.lives, 1);
          this.hud.set('level', this.level, 2);
          this.sound.level();
        }
      } else {
        this.lives--;
        this.hud.set('lives', Math.max(0, this.lives), 1);
        this.sound.lose();
        this.buzz(50);
        if (this.lives <= 0) { this.gameOver(); return; }
      }
      this.newBall();
    }

    draw() {
      for (let i = 0; i < PADDLE; i++) {
        this.lcd.set(this.cpuPad + i, 0, 1);
        this.lcd.set(this.paddle + i, this.rows - 1, 1);
      }
      if (this.served || this.state !== 'playing' || this.blink(300)) this.lcd.set(Math.round(this.ball.x), this.ball.y, 1);
    }
  }

  new Pong();
})();
