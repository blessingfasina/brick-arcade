/* Flappy — tap to flap, thread the gaps, one life */
'use strict';
(() => {
  const { Game } = window.BrickArcade;
  const BIRD_X = 2;
  const SPACING = 8;

  class Flappy extends Game {
    constructor() {
      super({ id: 'flappy', cols: 10, rows: 20, interval: 140 });
      this.input.on('action', () => this.flap());
      this.input.on('up', () => this.flap());
    }

    reset() {
      this.y = 8;
      this.vy = 0;
      this.pipes = [];
      this.started = false;
      this.passed = 0;
      this.level = 1;
      this.interval = this.baseInterval;
      this.sinceSpawn = SPACING - 3;
      this.hud.set('level', this.level, 2);
      this.hud.set('pipes', 0, 3);
    }

    flap() {
      if (this.state !== 'playing') return;
      this.started = true;
      this.vy = -1.25;
      this.sound.tick();
    }

    gapSize() { return Math.max(4, 6 - Math.floor((this.level - 1) / 3)); }

    step() {
      if (!this.started) return;
      this.vy = Math.min(this.vy + 0.42, 1.6);
      this.y += this.vy;
      for (const p of this.pipes) p.x--;
      this.pipes = this.pipes.filter((p) => p.x > -2);
      if (++this.sinceSpawn >= SPACING) {
        this.sinceSpawn = 0;
        const gap = this.gapSize();
        this.pipes.push({ x: this.cols, gapY: 2 + this.rand(this.rows - 4 - gap), gap, passed: false });
      }
      const by = Math.round(this.y);
      if (by < 0 || by >= this.rows) { this.die(); return; }
      for (const p of this.pipes) {
        if (!p.passed && p.x + 1 < BIRD_X - 1) {
          p.passed = true;
          this.passed++;
          this.addScore(10 * this.level);
          this.sound.score();
          this.hud.set('pipes', this.passed, 3);
          if (this.passed % 5 === 0) {
            this.level++;
            this.interval = Math.max(85, this.baseInterval - (this.level - 1) * 8);
            this.hud.set('level', this.level, 2);
            this.sound.level();
          }
        }
      }
      if (this.hits(by)) this.die();
    }

    hits(by) {
      for (const cx of [BIRD_X, BIRD_X - 1]) {
        for (const p of this.pipes) {
          if (cx >= p.x && cx <= p.x + 1 && (by < p.gapY || by >= p.gapY + p.gap)) return true;
        }
      }
      return false;
    }

    die() { this.sound.lose(); this.buzz(60); this.gameOver(); }

    draw() {
      for (const p of this.pipes) {
        for (let x = p.x; x <= p.x + 1; x++) {
          for (let y = 0; y < this.rows; y++) if (y < p.gapY || y >= p.gapY + p.gap) this.lcd.set(x, y, 1);
        }
      }
      const by = Math.round(this.y);
      this.lcd.set(BIRD_X, by, 1);
      this.lcd.set(BIRD_X - 1, this.vy < 0 && this.started ? by - 1 : by, 1);
    }
  }

  new Flappy();
})();
