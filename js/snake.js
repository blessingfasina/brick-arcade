/* Snake — classic handheld snake on a 10x20 grid */
'use strict';
(() => {
  const { Game } = window.BrickArcade;

  class Snake extends Game {
    constructor() {
      super({ id: 'snake', cols: 10, rows: 20, interval: 210 });
      this.input.on('left', () => this.turn(-1, 0));
      this.input.on('right', () => this.turn(1, 0));
      this.input.on('up', () => this.turn(0, -1));
      this.input.on('down', () => this.turn(0, 1));
    }

    reset() {
      this.snake = [{ x: 5, y: 10 }, { x: 4, y: 10 }, { x: 3, y: 10 }];
      this.dir = { x: 1, y: 0 };
      this.queue = [];
      this.level = 1;
      this.eaten = 0;
      this.interval = this.baseInterval;
      this.spawnFood();
      this.hud.set('level', this.level, 2);
      this.hud.set('length', this.snake.length, 3);
    }

    /* Hold the action button for turbo. */
    tickInterval() { return this.input.held('action') ? this.interval * 0.45 : this.interval; }

    turn(x, y) {
      if (this.state !== 'playing') return;
      const last = this.queue.length ? this.queue[this.queue.length - 1] : this.dir;
      if ((x === -last.x && y === -last.y) || (x === last.x && y === last.y)) return;
      if (this.queue.length < 2) this.queue.push({ x, y });
    }

    spawnFood() {
      const free = [];
      for (let y = 0; y < this.rows; y++) {
        for (let x = 0; x < this.cols; x++) {
          if (!this.snake.some((s) => s.x === x && s.y === y)) free.push({ x, y });
        }
      }
      this.food = free[this.rand(free.length)] || null;
    }

    step() {
      if (this.queue.length) this.dir = this.queue.shift();
      const head = this.snake[0];
      const next = { x: head.x + this.dir.x, y: head.y + this.dir.y };
      const eats = this.food && next.x === this.food.x && next.y === this.food.y;
      const body = eats ? this.snake : this.snake.slice(0, -1);
      const outside = next.x < 0 || next.x >= this.cols || next.y < 0 || next.y >= this.rows;
      if (outside || body.some((s) => s.x === next.x && s.y === next.y)) {
        this.sound.lose();
        this.gameOver();
        return;
      }
      this.snake.unshift(next);
      if (eats) {
        this.eaten++;
        this.addScore(10 * this.level);
        this.sound.score();
        this.buzz(15);
        this.hud.set('length', this.snake.length, 3);
        if (this.eaten % 5 === 0) {
          this.level++;
          this.interval = Math.max(70, this.baseInterval - (this.level - 1) * 20);
          this.hud.set('level', this.level, 2);
          this.sound.level();
        }
        this.spawnFood();
      } else {
        this.snake.pop();
      }
    }

    draw() {
      for (const s of this.snake) this.lcd.set(s.x, s.y, 1);
      if (this.food && (this.state !== 'playing' || this.blink(220))) this.lcd.set(this.food.x, this.food.y, 1);
    }
  }

  new Snake();
})();
