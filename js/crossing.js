/* Road Crossing — hop across lanes of traffic to the top of the screen */
'use strict';
(() => {
  const { Game } = window.BrickArcade;
  const W = 14; // repeating lane pattern width
  const SAFE = new Set([0, 5, 10, 15, 18, 19]);

  class Crossing extends Game {
    constructor() {
      super({ id: 'crossing', cols: 10, rows: 20, interval: 100 });
      this.input.on('up', () => this.move(0, -1));
      this.input.on('down', () => this.move(0, 1));
      this.input.on('left', () => this.move(-1, 0));
      this.input.on('right', () => this.move(1, 0));
      this.input.on('action', () => this.move(0, -1));
    }

    reset() {
      this.level = 1;
      this.lives = 3;
      this.ticks = 0;
      this.shield = 0;
      this.buildLanes();
      this.spawnFrog();
      this.hud.set('level', this.level, 2);
      this.hud.set('lives', this.lives, 1);
    }

    spawnFrog() { this.frog = { x: 4, y: this.rows - 1 }; this.maxY = this.rows - 1; }

    buildLanes() {
      this.lanes = [];
      const base = Math.max(1, 4 - Math.floor((this.level - 1) / 2));
      let dir = this.random() < 0.5 ? 1 : -1;
      for (let y = 1; y < 18; y++) {
        if (SAFE.has(y)) continue;
        dir = -dir;
        const pattern = Array(W).fill('.');
        const count = 1 + this.rand(2);
        let x = this.rand(W);
        for (let i = 0; i < count; i++) {
          const len = 2 + this.rand(2);
          for (let k = 0; k < len; k++) pattern[(x + k) % W] = 'X';
          x = (x + len + 4 + this.rand(3)) % W;
        }
        this.lanes.push({ y, dir, period: base + this.rand(3), offset: 0, pattern: pattern.join('') });
      }
    }

    laneHas(lane, x) {
      const idx = (((x - lane.dir * lane.offset) % W) + W) % W;
      return lane.pattern[idx] === 'X';
    }
    hitByCar() {
      const lane = this.lanes.find((l) => l.y === this.frog.y);
      return lane ? this.laneHas(lane, this.frog.x) : false;
    }

    move(dx, dy) {
      if (this.state !== 'playing') return;
      const nx = this.frog.x + dx, ny = this.frog.y + dy;
      if (nx < 0 || nx >= this.cols || ny < 0 || ny >= this.rows) return;
      this.frog.x = nx;
      this.frog.y = ny;
      this.sound.tick();
      if (ny < this.maxY) { this.maxY = ny; this.addScore(10 * this.level); }
      if (ny === 0) { this.crossed(); return; }
      if (this.shield === 0 && this.hitByCar()) this.squash();
    }

    crossed() {
      this.addScore(100 * this.level);
      this.level++;
      this.hud.set('level', this.level, 2);
      this.sound.level();
      this.buzz(20);
      this.buildLanes();
      this.spawnFrog();
      this.shield = 8;
    }

    squash() {
      this.lives--;
      this.hud.set('lives', Math.max(0, this.lives), 1);
      this.sound.lose();
      this.buzz(80);
      if (this.lives <= 0) { this.gameOver(); return; }
      this.spawnFrog();
      this.shield = 12;
    }

    step() {
      this.ticks++;
      if (this.shield > 0) this.shield--;
      for (const lane of this.lanes) if (this.ticks % lane.period === 0) lane.offset++;
      if (this.shield === 0 && this.hitByCar()) this.squash();
    }

    draw() {
      for (const lane of this.lanes) for (let x = 0; x < this.cols; x++) if (this.laneHas(lane, x)) this.lcd.set(x, lane.y, 1);
      if (this.shield === 0 || this.blink(120)) this.lcd.set(this.frog.x, this.frog.y, 1);
    }
  }

  new Crossing();
})();
