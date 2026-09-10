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
      this.cpu = 0;
      this.paddle = Math.floor((this.cols - PADDLE) / 2);
      this.cpuPad = this.paddle;
      this.interval = this.baseInterval;
      this.newBall();
      this.hud.set('you', 0, 1);
      this.hud.set('cpu', 0, 1);
      this.hud.set('level', this.level, 2);
    }

    newBall() {
      this.ball = { x: this.paddle + 1, y: this.rows - 2 };
      this.vel = { x: this.random() < 0.5 ? -1 : 1, y: -1 };
      this.served = false;
      this.cpuMiss = this.random() < 0.5;
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
      if (this.vel.y < 0) {
        if (this.cpuMiss) { if (this.ball.y < zone && this.random() < 0.5) target = this.ball.x < this.cols / 2 ? this.cols - PADDLE : 0; }
        else if (this.ball.y < zone && this.random() < skill) target = this.ball.x - 1;
      }
      else if (this.random() < 0.25) target = Math.floor((this.cols - PADDLE) / 2);
      if (target === null) return;
      this.cpuPad = Math.max(0, Math.min(this.cols - PADDLE, this.cpuPad + Math.sign(target - this.cpuPad)));
    }

    bounce(pad, nx, dirY) {
      const rel = nx - pad;
      this.vel.y = dirY;
      if (dirY < 0) this.cpuMiss = this.random() < Math.max(0.1, 0.6 - (this.level - 1) * 0.07);
      if (rel <= 0) this.vel.x = -1;
      else if (rel >= PADDLE - 1) this.vel.x = 1;
      this.ball.x = Math.max(0, Math.min(this.cols - 1, nx));
      this.sound.hit();
    }

    step() {
      if (!this.served) return;
      this.moveCpu();
      const b = this.ball, v = this.vel;
      if (b.x + v.x < 0 || b.x + v.x >= this.cols) { v.x = -v.x; this.sound.tick(); }
      const nx = b.x + v.x, ny = b.y + v.y;
      const covers = (pad, x) => x >= pad && x < pad + PADDLE;

      if (ny === 0) {
        if (covers(this.cpuPad, nx) || covers(this.cpuPad, b.x)) { this.bounce(this.cpuPad, nx, 1); return; }
        this.point(true);
        return;
      }
      if (ny === this.rows - 1) {
        if (covers(this.paddle, nx) || covers(this.paddle, b.x)) { this.bounce(this.paddle, nx, -1); this.buzz(10); return; }
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
          this.cpu = 0;
          this.interval = Math.max(70, this.baseInterval - (this.level - 1) * 10);
          this.hud.set('you', 0, 1);
          this.hud.set('cpu', 0, 1);
          this.hud.set('level', this.level, 2);
          this.sound.level();
        }
      } else {
        this.cpu++;
        this.hud.set('cpu', this.cpu, 1);
        this.sound.lose();
        this.buzz(50);
        if (this.cpu >= TO_WIN) { this.gameOver(); return; }
      }
      this.newBall();
    }

    draw() {
      for (let i = 0; i < PADDLE; i++) {
        this.lcd.set(this.cpuPad + i, 0, 1);
        this.lcd.set(this.paddle + i, this.rows - 1, 1);
      }
      if (this.served || this.state !== 'playing' || this.blink(300)) this.lcd.set(this.ball.x, this.ball.y, 1);
    }
  }

  new Pong();
})();
