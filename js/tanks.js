/* Tanks — hold the bottom of the screen against waves of enemy tanks */
'use strict';
(() => {
  const { Game } = window.BrickArcade;

  const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
  const SPRITES = {
    up: ['.X.', 'XXX', 'X.X'],
    down: ['X.X', 'XXX', '.X.'],
    left: ['.XX', 'XX.', '.XX'],
    right: ['XX.', '.XX', 'XX.'],
  };
  const SPAWN_X = [0, 3, 7];
  const KILLS_PER_LEVEL = 10;

  const overlaps = (a, b) => !(a.x + 2 < b.x || b.x + 2 < a.x || a.y + 2 < b.y || b.y + 2 < a.y);
  const inside = (p, t) => p.x >= t.x && p.x <= t.x + 2 && p.y >= t.y && p.y <= t.y + 2;

  class Tanks extends Game {
    constructor() {
      super({ id: 'tanks', cols: 10, rows: 20, interval: 90 });
      for (const dir of Object.keys(DIRS)) this.input.on(dir, () => this.move(dir));
      this.input.on('action', () => this.fire());
    }

    reset() {
      this.level = 1;
      this.lives = 3;
      this.kills = 0;
      this.enemies = [];
      this.bullets = [];
      this.ticks = 0;
      this.lastSpawn = -99;
      this.shield = 0;
      this.player = { x: 3, y: this.rows - 3, dir: 'up' };
      this.hud.set('level', this.level, 2);
      this.hud.set('lives', this.lives, 1);
      this.hud.set('tanks', KILLS_PER_LEVEL, 2);
    }

    get maxEnemies() { return Math.min(4, 1 + Math.ceil(this.level / 2)); }
    get moveEvery() { return this.level >= 6 ? 2 : 3; }

    canMove(tank, nx, ny) {
      if (nx < 0 || ny < 0 || nx > this.cols - 3 || ny > this.rows - 3) return false;
      const probe = { x: nx, y: ny };
      const others = [this.player, ...this.enemies].filter((t) => t !== tank);
      return !others.some((t) => overlaps(probe, t));
    }

    move(dir) {
      if (this.state !== 'playing') return;
      const p = this.player;
      p.dir = dir;
      const [dx, dy] = DIRS[dir];
      if (this.canMove(p, p.x + dx, p.y + dy)) { p.x += dx; p.y += dy; }
    }

    bulletFrom(tank, owner) {
      const [dx, dy] = DIRS[tank.dir];
      return { x: tank.x + 1 + dx * 2, y: tank.y + 1 + dy * 2, dx, dy, owner };
    }

    fire() {
      if (this.state !== 'playing') return;
      if (this.bullets.filter((b) => b.owner === 'p').length >= 2) return;
      this.bullets.push(this.bulletFrom(this.player, 'p'));
      this.sound.tick();
    }

    step() {
      this.ticks++;
      if (this.shield > 0) this.shield--;

      // Bullets fly one cell per tick.
      for (const b of this.bullets) { b.x += b.dx; b.y += b.dy; }
      this.bullets = this.bullets.filter((b) => b.x >= 0 && b.x < this.cols && b.y >= 0 && b.y < this.rows);

      // Bullets cancel each other out.
      const dead = new Set();
      for (let i = 0; i < this.bullets.length; i++) {
        for (let j = i + 1; j < this.bullets.length; j++) {
          const a = this.bullets[i], c = this.bullets[j];
          if (a.owner !== c.owner && a.x === c.x && a.y === c.y) { dead.add(a); dead.add(c); }
        }
      }
      for (const b of this.bullets) {
        if (dead.has(b)) continue;
        if (b.owner === 'p') {
          const hit = this.enemies.find((e) => inside(b, e));
          if (hit) { dead.add(b); this.destroy(hit); }
        } else if (this.shield === 0 && inside(b, this.player)) {
          dead.add(b);
          this.hitPlayer();
          return;
        }
      }
      this.bullets = this.bullets.filter((b) => !dead.has(b));

      // Enemies think every few ticks.
      if (this.ticks % this.moveEvery === 0) {
        for (const e of this.enemies) this.driveEnemy(e);
      }
      if (this.shield === 0 && this.enemies.some((e) => overlaps(e, this.player))) { this.hitPlayer(); return; }

      // Reinforcements.
      if (this.enemies.length < this.maxEnemies && this.ticks - this.lastSpawn > 22) this.spawnEnemy();
    }

    driveEnemy(e) {
      const p = this.player;
      const aligned = Math.abs(e.x - p.x) <= 1 && e.y < p.y;
      if (aligned && this.random() < 0.5) e.dir = 'down';
      else if (this.random() < 0.12) e.dir = this.pickDir();
      let [dx, dy] = DIRS[e.dir];
      if (!this.canMove(e, e.x + dx, e.y + dy)) {
        e.dir = this.pickDir();
        [dx, dy] = DIRS[e.dir];
        if (!this.canMove(e, e.x + dx, e.y + dy)) return;
      }
      e.x += dx;
      e.y += dy;
      const enemyShots = this.bullets.filter((b) => b.owner === 'e').length;
      const trigger = (aligned && e.dir === 'down' ? 0.35 : 0.05) + this.level * 0.01;
      if (enemyShots < 3 && this.random() < trigger) this.bullets.push(this.bulletFrom(e, 'e'));
    }

    pickDir() {
      const r = this.random();
      if (r < 0.4) return 'down';
      if (r < 0.6) return 'left';
      if (r < 0.8) return 'right';
      return 'up';
    }

    spawnEnemy() {
      const spots = [...SPAWN_X].sort(() => this.random() - 0.5);
      for (const x of spots) {
        const probe = { x, y: 0 };
        if (![this.player, ...this.enemies].some((t) => overlaps(probe, t))) {
          this.enemies.push({ x, y: 0, dir: 'down' });
          this.lastSpawn = this.ticks;
          return;
        }
      }
    }

    destroy(enemy) {
      this.enemies = this.enemies.filter((e) => e !== enemy);
      this.kills++;
      this.addScore(100 * this.level);
      this.sound.hit();
      this.buzz(15);
      this.hud.set('tanks', KILLS_PER_LEVEL - (this.kills % KILLS_PER_LEVEL), 2);
      if (this.kills % KILLS_PER_LEVEL === 0) {
        this.level++;
        this.hud.set('level', this.level, 2);
        this.sound.level();
      }
    }

    hitPlayer() {
      this.lives--;
      this.hud.set('lives', Math.max(0, this.lives), 1);
      this.sound.lose();
      this.buzz(80);
      if (this.lives <= 0) { this.gameOver(); return; }
      this.player = { x: 3, y: this.rows - 3, dir: 'up' };
      this.bullets = [];
      this.enemies = this.enemies.filter((e) => !overlaps(e, this.player) && e.y < this.rows - 8);
      this.shield = 25;
    }

    drawTank(t) { this.lcd.blit(SPRITES[t.dir], t.x, t.y); }

    draw() {
      for (const e of this.enemies) this.drawTank(e);
      if (this.shield === 0 || this.blink(120)) this.drawTank(this.player);
      for (const b of this.bullets) this.lcd.set(b.x, b.y, 1);
    }
  }

  new Tanks();
})();
