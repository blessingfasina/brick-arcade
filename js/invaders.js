/* Invaders — a marching formation, one ship, three lives */
'use strict';
(() => {
  const { Game } = window.BrickArcade;

  class Invaders extends Game {
    constructor() {
      super({ id: 'invaders', cols: 10, rows: 20, interval: 70 });
      this.input.on('left', () => this.move(-1));
      this.input.on('right', () => this.move(1));
      this.input.on('action', () => this.fire());
      this.input.on('up', () => this.fire());
    }

    reset() {
      this.level = 1;
      this.lives = 3;
      this.ship = 3;
      this.shield = 0;
      this.newWave();
      this.hud.set('level', this.level, 2);
      this.hud.set('lives', this.lives, 1);
    }

    newWave() {
      this.aliens = [];
      const top = 1 + Math.min(this.level - 1, 5);
      for (let r = 0; r < 3; r++) for (let c = 0; c < 5; c++) this.aliens.push({ x: c * 2, y: top + r * 2 });
      this.dir = 1;
      this.bullets = [];
      this.bombs = [];
      this.ticks = 0;
    }

    move(dx) {
      if (this.state !== 'playing') return;
      this.ship = Math.max(0, Math.min(this.cols - 3, this.ship + dx));
    }
    fire() {
      if (this.state !== 'playing' || this.bullets.length >= 1) return;
      this.bullets.push({ x: this.ship + 1, y: this.rows - 3 });
      this.sound.tick();
    }

    /* The fewer aliens left, the faster they march. */
    moveEvery() {
      const speed = 12 - Math.min(this.level - 1, 4) * 2;
      return Math.max(2, Math.round(speed * (this.aliens.length / 15)) + 1);
    }

    step() {
      this.ticks++;
      if (this.shield > 0) this.shield--;

      for (const b of this.bullets) b.y--;
      this.bullets = this.bullets.filter((b) => b.y >= 0);
      if (this.ticks % 2 === 0) {
        for (const b of this.bombs) b.y++;
        this.bombs = this.bombs.filter((b) => b.y < this.rows);
      }

      for (const b of [...this.bullets]) {
        const i = this.aliens.findIndex((a) => a.x === b.x && a.y === b.y);
        if (i >= 0) {
          this.aliens.splice(i, 1);
          this.bullets.splice(this.bullets.indexOf(b), 1);
          this.addScore(10 * this.level);
          this.sound.hit();
          this.buzz(10);
        }
      }
      this.bombs = this.bombs.filter((bomb) => {
        const hit = this.bullets.find((b) => b.x === bomb.x && Math.abs(b.y - bomb.y) <= 1);
        if (hit) { this.bullets.splice(this.bullets.indexOf(hit), 1); return false; }
        return true;
      });

      if (!this.aliens.length) {
        this.level++;
        this.hud.set('level', this.level, 2);
        this.sound.level();
        this.newWave();
        return;
      }

      if (this.ticks % this.moveEvery() === 0) {
        const xs = this.aliens.map((a) => a.x);
        const minX = Math.min(...xs), maxX = Math.max(...xs);
        if ((this.dir > 0 && maxX >= this.cols - 1) || (this.dir < 0 && minX <= 0)) {
          for (const a of this.aliens) a.y++;
          this.dir = -this.dir;
        } else {
          for (const a of this.aliens) a.x += this.dir;
        }
        this.sound.play(this.dir > 0 ? 180 : 150, 0.04, 0, 'square', 0.04);
        if (this.aliens.some((a) => a.y >= this.rows - 3)) { this.gameOver(); return; }
        if (this.bombs.length < 1 + Math.min(this.level, 3) && this.random() < 0.35) {
          const a = this.aliens[this.rand(this.aliens.length)];
          this.bombs.push({ x: a.x, y: a.y + 1 });
        }
      }

      const s = this.ship, bottom = this.rows - 1;
      const onShip = (x, y) => (y === bottom - 1 && x === s + 1) || (y === bottom && x >= s && x <= s + 2);
      if (this.shield === 0 && (this.bombs.some((b) => onShip(b.x, b.y)) || this.aliens.some((a) => onShip(a.x, a.y)))) {
        this.bombs = [];
        this.loseLife();
      }
    }

    loseLife() {
      this.lives--;
      this.hud.set('lives', Math.max(0, this.lives), 1);
      this.sound.lose();
      this.buzz(80);
      if (this.lives <= 0) { this.gameOver(); return; }
      this.shield = 20;
    }

    draw() {
      for (const a of this.aliens) this.lcd.set(a.x, a.y, 1);
      for (const b of this.bullets) this.lcd.set(b.x, b.y, 1);
      for (const b of this.bombs) this.lcd.set(b.x, b.y, 1);
      if (this.shield === 0 || this.blink(120)) {
        const s = this.ship, bottom = this.rows - 1;
        this.lcd.set(s + 1, bottom - 1, 1);
        this.lcd.set(s, bottom, 1); this.lcd.set(s + 1, bottom, 1); this.lcd.set(s + 2, bottom, 1);
      }
    }
  }

  new Invaders();
})();
