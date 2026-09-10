/* Brick Stack — the falling-blocks classic */
'use strict';
(() => {
  const { Game, LCD, sleep } = window.BrickArcade;

  const SHAPES = {
    I: [['....', 'XXXX', '....', '....'], ['..X.', '..X.', '..X.', '..X.']],
    O: [['XX', 'XX']],
    T: [['.X.', 'XXX', '...'], ['.X.', '.XX', '.X.'], ['...', 'XXX', '.X.'], ['.X.', 'XX.', '.X.']],
    S: [['.XX', 'XX.', '...'], ['.X.', '.XX', '..X']],
    Z: [['XX.', '.XX', '...'], ['..X', '.XX', '.X.']],
    J: [['X..', 'XXX', '...'], ['.XX', '.X.', '.X.'], ['...', 'XXX', '..X'], ['.X.', '.X.', 'XX.']],
    L: [['..X', 'XXX', '...'], ['.X.', '.X.', '.XX'], ['...', 'XXX', 'X..'], ['XX.', '.X.', '.X.']],
  };
  const PIECES = {};
  for (const [name, rots] of Object.entries(SHAPES)) {
    PIECES[name] = rots.map((rows) => {
      const cells = [];
      rows.forEach((row, y) => { for (let x = 0; x < row.length; x++) if (row[x] === 'X') cells.push([x, y]); });
      return cells;
    });
  }
  const LINE_SCORE = [0, 100, 300, 500, 800];

  class Stack extends Game {
    constructor() {
      super({ id: 'stack', cols: 10, rows: 20, interval: 550 });
      this.input.on('left', () => this.shift(-1));
      this.input.on('right', () => this.shift(1));
      this.input.on('down', () => this.softDrop());
      this.input.on('up', () => this.rotate());
      this.input.on('action', () => this.rotate());
    }

    reset() {
      this.board = Array.from({ length: this.rows }, () => new Uint8Array(this.cols));
      this.bag = [];
      this.lines = 0;
      this.level = 1;
      this.interval = this.baseInterval;
      this.next = this.takeFromBag();
      this.spawn();
      this.hud.set('level', this.level, 2);
      this.hud.set('lines', this.lines, 3);
    }

    takeFromBag() {
      if (!this.bag.length) {
        this.bag = Object.keys(PIECES);
        for (let i = this.bag.length - 1; i > 0; i--) {
          const j = this.rand(i + 1);
          [this.bag[i], this.bag[j]] = [this.bag[j], this.bag[i]];
        }
      }
      return this.bag.pop();
    }

    spawn() {
      this.piece = { type: this.next, rot: 0, x: 3, y: -1 };
      this.next = this.takeFromBag();
      this.drawPreview();
      if (!this.fits(this.piece)) {
        if (this.state === 'playing') this.gameOver();
        return false;
      }
      return true;
    }

    cells(p = this.piece) { return PIECES[p.type][p.rot].map(([x, y]) => [p.x + x, p.y + y]); }

    fits(p) {
      return this.cells(p).every(([x, y]) => x >= 0 && x < this.cols && y < this.rows && (y < 0 || !this.board[y][x]));
    }

    shift(dx) {
      if (this.state !== 'playing') return;
      const p = { ...this.piece, x: this.piece.x + dx };
      if (this.fits(p)) { this.piece = p; this.sound.tick(); }
    }

    rotate() {
      if (this.state !== 'playing') return;
      const rots = PIECES[this.piece.type].length;
      for (const kick of [0, -1, 1, -2, 2]) {
        const p = { ...this.piece, rot: (this.piece.rot + 1) % rots, x: this.piece.x + kick };
        if (this.fits(p)) { this.piece = p; this.sound.tick(); return; }
      }
    }

    softDrop() {
      if (this.state !== 'playing') return;
      const p = { ...this.piece, y: this.piece.y + 1 };
      if (this.fits(p)) { this.piece = p; this.addScore(1); this.acc = 0; }
      else this.lock();
    }

    step() {
      const p = { ...this.piece, y: this.piece.y + 1 };
      if (this.fits(p)) this.piece = p;
      else this.lock();
    }

    async lock() {
      for (const [x, y] of this.cells()) {
        if (y < 0) { this.gameOver(); return; }
        this.board[y][x] = 1;
      }
      const full = [];
      this.board.forEach((row, y) => { if (row.every(Boolean)) full.push(y); });
      if (full.length) {
        this.state = 'anim';
        const token = this.animToken;
        this.sound.clear();
        for (let i = 0; i < 4; i++) {
          for (const y of full) this.board[y].fill(i % 2 === 0 ? 0 : 1);
          this.lcd.clear();
          this.drawBoard();
          this.lcd.draw();
          await sleep(90);
          if (token !== this.animToken) return;
        }
        for (const y of full) {
          this.board.splice(y, 1);
          this.board.unshift(new Uint8Array(this.cols));
        }
        this.lines += full.length;
        this.addScore(LINE_SCORE[full.length] * this.level);
        this.hud.set('lines', this.lines, 3);
        const level = Math.floor(this.lines / 10) + 1;
        if (level > this.level) {
          this.level = level;
          this.interval = Math.max(80, this.baseInterval - (this.level - 1) * 45);
          this.hud.set('level', this.level, 2);
          this.sound.level();
        }
        this.buzz(20);
        this.state = 'playing';
        this.acc = 0;
      } else {
        this.sound.hit();
      }
      this.spawn();
    }

    drawPreview() {
      // Created lazily: the base constructor calls reset() before subclass fields exist.
      this.preview ||= new LCD(document.getElementById('next'), 4, 4);
      this.preview.clear();
      const cells = PIECES[this.next][0];
      const w = Math.max(...cells.map(([x]) => x)) + 1;
      const h = Math.max(...cells.map(([, y]) => y)) + 1;
      const minY = Math.min(...cells.map(([, y]) => y));
      const ox = Math.floor((4 - w) / 2), oy = Math.floor((4 - (h - minY)) / 2) - minY;
      for (const [x, y] of cells) this.preview.set(ox + x, oy + y, 1);
      this.preview.draw();
    }

    drawBoard() {
      this.board.forEach((row, y) => { for (let x = 0; x < this.cols; x++) if (row[x]) this.lcd.set(x, y, 1); });
    }

    draw() {
      this.drawBoard();
      if (this.piece) for (const [x, y] of this.cells()) this.lcd.set(x, y, 1);
    }
  }

  new Stack();
})();
