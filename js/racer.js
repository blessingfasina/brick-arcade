/* Brick Racer — dodge oncoming cars on a scrolling road */
'use strict';
(() => {
  const { Game, sleep } = window.BrickArcade;

  const CAR = [[1, 0], [0, 1], [1, 1], [2, 1], [1, 2], [0, 3], [2, 3]]; // 3 wide, 4 tall
  const ROAD_MIN = 1, ROAD_MAX = 6; // car x range (walls at 0 and 9)
  const GAP = 6;

  class Racer extends Game {
    constructor() {
      super({ id: 'racer', cols: 10, rows: 20, interval: 150 });
      this.input.on('left', () => this.move(-1));
      this.input.on('right', () => this.move(1));
    }

    reset() {
      this.player = { x: 4, y: this.rows - 4 };
      this.enemies = [];
      this.wall = 0;
      this.level = 1;
      this.passed = 0;
      this.lives = 3;
      this.hidden = false;
      this.interval = this.baseInterval;
      this.hud.set('level', this.level, 2);
      this.hud.set('lives', this.lives, 1);
      this.hud.set('speed', this.speedValue(), 2);
    }

    /* Hold the action button to floor it. */
    tickInterval() { return this.input.held('action') ? this.interval * 0.4 : this.interval; }
    speedValue() { return Math.round(1000 / this.tickInterval()); }

    move(dx) {
      if (this.state !== 'playing') return;
      this.player.x = Math.max(ROAD_MIN, Math.min(ROAD_MAX, this.player.x + dx));
      if (this.collides()) this.crash();
    }

    collides() {
      const p = this.player;
      return this.enemies.some((e) => CAR.some(([ex, ey]) => CAR.some(([px, py]) => e.x + ex === p.x + px && e.y + ey === p.y + py)));
    }

    step() {
      this.wall = (this.wall + 1) % 4;
      for (const e of this.enemies) e.y++;
      const last = this.enemies[this.enemies.length - 1];
      if (!last || last.y >= GAP - Math.min(2, Math.floor(this.level / 4))) {
        if (Math.random() < 0.6) {
          let x = ROAD_MIN + this.rand(ROAD_MAX - ROAD_MIN + 1);
          if (last && Math.abs(x - last.x) > 4) x = last.x + Math.sign(x - last.x) * 4; // keep it dodgeable
          this.enemies.push({ x, y: -4 });
        }
      }
      const before = this.enemies.length;
      this.enemies = this.enemies.filter((e) => e.y < this.rows);
      const gone = before - this.enemies.length;
      if (gone) {
        this.passed += gone;
        this.addScore(gone * (this.input.held('action') ? 20 : 10) * this.level);
        this.sound.tick();
        if (Math.floor(this.passed / 10) + 1 > this.level) {
          this.level = Math.floor(this.passed / 10) + 1;
          this.interval = Math.max(60, this.baseInterval - (this.level - 1) * 12);
          this.hud.set('level', this.level, 2);
          this.sound.level();
        }
      }
      this.hud.set('speed', this.speedValue(), 2);
      if (this.collides()) this.crash();
    }

    async crash() {
      this.lives--;
      this.hud.set('lives', Math.max(0, this.lives), 1);
      this.sound.lose();
      this.buzz(80);
      if (this.lives <= 0) { this.gameOver(); return; }
      this.state = 'anim';
      const token = this.animToken;
      for (let i = 0; i < 6; i++) {
        this.hidden = i % 2 === 0;
        this.lcd.clear();
        this.draw();
        this.lcd.draw();
        await sleep(120);
        if (token !== this.animToken) return;
      }
      this.hidden = false;
      this.enemies = [];
      this.acc = 0;
      this.state = 'playing';
    }

    draw() {
      for (let y = 0; y < this.rows; y++) {
        if ((((y - this.wall) % 4) + 4) % 4 !== 3) { this.lcd.set(0, y, 1); this.lcd.set(this.cols - 1, y, 1); }
      }
      for (const e of this.enemies) for (const [x, y] of CAR) this.lcd.set(e.x + x, e.y + y, 1);
      if (!this.hidden) for (const [x, y] of CAR) this.lcd.set(this.player.x + x, this.player.y + y, 1);
    }
  }

  new Racer();
})();
