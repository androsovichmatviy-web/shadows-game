/*
 * Тенепад — игровая логика без DOM (работает и в браузере, и в Node).
 *
 * Клетка поля: null или { k, col }
 *   k   — 'n' обычный осколок, 'c' кристалл, 's' тень
 *   col — индекс цвета из TP.COLORS, -1 для тени (в том числе тени с кристаллом)
 */
var TP = TP || {};

(function (TP) {
  'use strict';

  var COLS = 11;
  var ROWS = 18;        // видимые ряды
  var HIDDEN = 2;       // запас над полем для поворотов и прилива
  var LOCK_MS = 500;
  var MAX_RESETS = 15;
  var CLEAR_MS = 380;
  var SOFT_MS = 30;
  var KICKS = [[0, 0], [-1, 0], [1, 0], [0, -1], [-2, 0], [2, 0], [-1, -1], [1, -1], [0, -2]];

  TP.ENGINE = { COLS: COLS, ROWS: ROWS, HIDDEN: HIDDEN, LOCK_MS: LOCK_MS, CLEAR_MS: CLEAR_MS };

  // Детерминированный генератор (mulberry32), состояние — одно число.
  function Rng(seed) { this.s = seed | 0; }
  Rng.prototype.next = function () {
    var a = (this.s = (this.s + 0x6D2B79F5) | 0);
    var t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  Rng.prototype.int = function (n) { return Math.floor(this.next() * n); };
  TP.Rng = Rng;

  function lineScore(n) {
    var table = [0, 100, 250, 450, 700, 1000];
    if (n <= 0) return 0;
    return n <= 5 ? table[n] : 1000 + (n - 5) * 350;
  }
  TP.lineScore = lineScore;

  function isShadow(cell) { return !!cell && cell.col < 0; }
  TP.isShadow = isShadow;

  var SAVED_FIELDS = [
    'mode', 'seed', 'grid', 'score', 'lines', 'beams', 'shadowsCleared', 'pieces', 'combo',
    'maxChain', 'time', 'depth', 'charge', 'queue', 'active', 'state', 'lockTimer',
    'lockResets', 'fallAcc', 'lowestY', 'clearing', 'lastShape', 'lastGap', 'riseLeft',
    'riseTimer', 'shadowsTotal', 'result'
  ];

  class Game {
    constructor(opts) {
      opts = opts || {};
      this.cols = COLS;
      this.rows = ROWS;
      this.hidden = HIDDEN;
      this.H = ROWS + HIDDEN;
      this.mode = opts.mode === 'level' ? 'level' : 'endless';
      this.level = this.mode === 'level' ? opts.level : null;
      this.seed = (opts.seed != null ? opts.seed : Math.floor(Math.random() * 2147483647)) | 0;
      this.rng = new Rng(this.seed);
      this.grid = [];
      for (var r = 0; r < this.H; r++) this.grid.push(this.emptyRow());

      this.score = 0;
      this.lines = 0;
      this.beams = 0;
      this.shadowsCleared = 0;
      this.pieces = 0;
      this.combo = -1;
      this.maxChain = 0;
      this.time = 0;
      this.depth = 1;
      this.charge = 0;

      this.queue = [];
      this.active = null;
      this.state = 'playing';
      this.events = [];
      this.lockTimer = 0;
      this.lockResets = 0;
      this.fallAcc = 0;
      this.lowestY = 0;
      this.soft = false;
      this.clearing = null;
      this.lastShape = null;
      this.lastGap = -1;
      this.result = null;

      if (this.level && this.level.layout) this.applyLayout(this.level.layout);
      this.shadowsTotal = this.countShadows();
      this.riseLeft = this.risePieces() || null;
      this.riseTimer = this.riseMs();
      if (opts.noSpawn) return;
      this.fillQueue();
      this.spawn();
    }

    // ---------- настройки режима ----------

    gravityMs() {
      if (this.level) return this.level.speed || 800;
      return Math.max(70, Math.round(850 * Math.pow(0.86, this.depth - 1)));
    }

    crystalChance() {
      if (this.level) return this.level.crystal != null ? this.level.crystal : 0.12;
      return 0.12;
    }

    risePieces() {
      if (this.level) return (this.level.rise && this.level.rise.pieces) || 0;
      return this.depth >= 2 ? Math.max(5, 15 - this.depth) : 0;
    }

    riseMs() {
      return this.level && this.level.rise && this.level.rise.seconds ? this.level.rise.seconds * 1000 : 0;
    }

    mult() { return this.level ? 1 : this.depth; }

    flashAllowed() { return !(this.level && this.level.flash === false); }

    // ---------- поле ----------

    emptyRow() {
      var row = new Array(this.cols);
      for (var c = 0; c < this.cols; c++) row[c] = null;
      return row;
    }

    applyLayout(layout) {
      var start = this.H - layout.length;
      for (var i = 0; i < layout.length; i++) {
        var str = layout[i];
        for (var c = 0; c < this.cols; c++) {
          var ch = str.charAt(c);
          var tint = (i * 3 + c * 5) % TP.COLORS.length;
          var cell = null;
          if (ch === '#') cell = { k: 's', col: -1 };
          else if (ch === 'o') cell = { k: 'n', col: tint };
          else if (ch === '*') cell = { k: 'c', col: tint };
          else if (ch === '%') cell = { k: 'c', col: -1 };
          this.grid[start + i][c] = cell;
        }
      }
    }

    countShadows() {
      var n = 0;
      for (var r = 0; r < this.H; r++) {
        for (var c = 0; c < this.cols; c++) if (isShadow(this.grid[r][c])) n++;
      }
      return n;
    }

    collides(cells, x, y) {
      for (var i = 0; i < cells.length; i++) {
        var gx = x + cells[i][0], gy = y + cells[i][1];
        if (gx < 0 || gx >= this.cols || gy < 0 || gy >= this.H) return true;
        if (this.grid[gy][gx]) return true;
      }
      return false;
    }

    // ---------- очередь и появление ----------

    pickShape() {
      var spec = this.level && this.level.pool;
      var pool;
      if (Array.isArray(spec)) pool = spec.map(function (id) { return { id: id, w: 1 }; });
      else pool = TP.depthPool(spec && spec.depth ? spec.depth : this.depth);
      var total = pool.reduce(function (s, p) { return s + p.w; }, 0);
      var pick = function (rng) {
        var x = rng.next() * total;
        for (var i = 0; i < pool.length; i++) {
          x -= pool[i].w;
          if (x < 0) return pool[i].id;
        }
        return pool[pool.length - 1].id;
      };
      var id = pick(this.rng);
      if (id === this.lastShape && pool.length > 1) id = pick(this.rng);
      this.lastShape = id;
      return id;
    }

    fillQueue() {
      while (this.queue.length < 3) {
        var id = this.pickShape();
        var n = TP.SHAPES[id].cells.length;
        var crystal = this.rng.next() < this.crystalChance() ? this.rng.int(n) : -1;
        this.queue.push({ id: id, crystal: crystal });
      }
    }

    makeActive(item) {
      var sh = TP.SHAPES[item.id];
      var cells = sh.cells.map(function (c) { return [c[0], c[1]]; });
      var b = TP.bounds(cells);
      return {
        id: item.id, cells: cells, color: sh.color, crystal: item.crystal,
        x: Math.floor((this.cols - b.w) / 2), y: this.hidden, w: b.w, h: b.h
      };
    }

    spawn() {
      var item = this.queue.shift();
      this.fillQueue();
      var p = this.makeActive(item);
      var placed = false;
      for (var dy = 0; dy <= this.hidden; dy++) {
        if (!this.collides(p.cells, p.x, this.hidden - dy)) {
          p.y = this.hidden - dy;
          placed = true;
          break;
        }
      }
      if (!placed) {
        this.active = null;
        this.gameOver('blocked');
        return;
      }
      this.active = p;
      this.lockTimer = 0;
      this.lockResets = 0;
      this.fallAcc = 0;
      this.lowestY = p.y;
      this.events.push({ type: 'spawn', id: p.id });
    }

    // ---------- управление ----------

    canAct() { return this.state === 'playing' && !!this.active && !this.clearing; }

    onManipulate() {
      if (this.lockTimer > 0 && this.lockResets < MAX_RESETS) {
        this.lockTimer = 0;
        this.lockResets++;
      }
    }

    tryMove(dx, dy) {
      if (!this.canAct()) return false;
      var p = this.active;
      if (this.collides(p.cells, p.x + dx, p.y + dy)) return false;
      p.x += dx;
      p.y += dy;
      if (dy > 0) {
        if (p.y > this.lowestY) {
          this.lowestY = p.y;
          this.lockResets = 0;
        }
        this.lockTimer = 0;
      } else {
        this.onManipulate();
      }
      return true;
    }

    move(dx) { return this.tryMove(dx, 0); }

    transform(newCells, type) {
      var p = this.active;
      var nb = TP.bounds(newCells);
      var bx = p.x + Math.trunc((p.w - nb.w) / 2);
      var by = p.y + Math.trunc((p.h - nb.h) / 2);
      for (var i = 0; i < KICKS.length; i++) {
        var x = bx + KICKS[i][0], y = by + KICKS[i][1];
        if (!this.collides(newCells, x, y)) {
          p.cells = newCells;
          p.x = x;
          p.y = y;
          p.w = nb.w;
          p.h = nb.h;
          this.onManipulate();
          this.events.push({ type: type });
          return true;
        }
      }
      return false;
    }

    rotate(dir) {
      if (!this.canAct()) return false;
      return this.transform(TP.rotateCells(this.active.cells, dir < 0 ? -1 : 1), 'rotate');
    }

    mirror() {
      if (!this.canAct()) return false;
      return this.transform(TP.mirrorCells(this.active.cells), 'mirror');
    }

    setSoft(on) { this.soft = !!on; }

    dropDistance() {
      var p = this.active;
      if (!p) return 0;
      var d = 0;
      while (!this.collides(p.cells, p.x, p.y + d + 1)) d++;
      return d;
    }

    ghostY() { return this.active ? this.active.y + this.dropDistance() : 0; }

    hardDrop() {
      if (!this.canAct()) return false;
      var d = this.dropDistance();
      this.active.y += d;
      this.score += 2 * d;
      this.events.push({ type: 'drop', dist: d });
      this.lock();
      return true;
    }

    grounded() {
      var p = this.active;
      return !!p && this.collides(p.cells, p.x, p.y + 1);
    }

    flash() {
      if (!this.canAct() || !this.flashAllowed() || this.charge < 100) return false;
      var rows = [];
      for (var r = this.H - 1; r >= this.H - 2; r--) {
        if (this.grid[r].some(Boolean)) rows.push(r);
      }
      if (!rows.length) return false;
      this.charge = 0;
      this.events.push({ type: 'flash', rows: rows.slice() });
      this.startClear(rows, true);
      return true;
    }

    // ---------- время ----------

    update(dt) {
      if (this.state !== 'playing') return;
      this.time += dt;
      var L = this.level;

      if (L && !this.clearing) {
        if (L.goal.type === 'survive' && this.time >= L.goal.target * 1000) {
          this.win();
          return;
        }
        if (L.limits && L.limits.time && this.time >= L.limits.time * 1000) {
          if (!this.checkGoal()) this.gameOver('time');
          return;
        }
      }

      var rm = this.riseMs();
      if (rm && !this.clearing) {
        this.riseTimer -= dt;
        if (this.riseTimer <= 0) {
          this.riseTimer += rm;
          this.rise();
          if (this.state !== 'playing') return;
        }
      }

      if (this.clearing) {
        this.clearing.t -= dt;
        if (this.clearing.t <= 0) this.finishClear();
        return;
      }

      if (!this.active) return;
      var g = this.soft ? Math.min(SOFT_MS, this.gravityMs()) : this.gravityMs();
      if (this.grounded()) {
        this.fallAcc = 0;
        this.lockTimer += dt;
        if (this.lockTimer >= LOCK_MS) this.lock();
      } else {
        this.lockTimer = 0;
        this.fallAcc += dt;
        while (this.fallAcc >= g) {
          this.fallAcc -= g;
          if (this.tryMove(0, 1)) {
            if (this.soft) this.score += 1;
          } else {
            this.fallAcc = 0;
            break;
          }
        }
      }
    }

    // ---------- фиксация и очистка ----------

    lock() {
      var p = this.active;
      if (!p) return;
      this.active = null;
      var placed = [];
      for (var i = 0; i < p.cells.length; i++) {
        var gx = p.x + p.cells[i][0], gy = p.y + p.cells[i][1];
        this.grid[gy][gx] = { k: i === p.crystal ? 'c' : 'n', col: p.color };
        placed.push([gx, gy]);
      }
      this.pieces++;
      this.events.push({ type: 'lock', id: p.id, cells: placed });

      var full = [];
      for (var r = 0; r < this.H; r++) {
        if (this.grid[r].every(Boolean)) full.push(r);
      }
      if (full.length) {
        this.startClear(full, false);
      } else {
        this.combo = -1;
        this.finishTurn();
      }
    }

    // Цепочка: ряд с кристаллом → вертикальный луч → задетый кристалл → его ряд → ...
    resolveChain(startRows) {
      var rows = new Set(startRows);
      var cols = new Set();
      var fired = new Set();
      var beams = [];
      var chain = 0;
      var frontier = startRows.slice();
      var self = this;
      var key = function (r, c) { return r * 64 + c; };

      while (frontier.length) {
        var newCols = [];
        frontier.forEach(function (r) {
          for (var c = 0; c < self.cols; c++) {
            var cell = self.grid[r][c];
            if (cell && cell.k === 'c' && !fired.has(key(r, c))) {
              fired.add(key(r, c));
              if (!cols.has(c)) {
                cols.add(c);
                newCols.push(c);
                beams.push({ dir: 'v', col: c, row: r });
              }
            }
          }
        });
        var newRows = [];
        newCols.forEach(function (c) {
          for (var r = 0; r < self.H; r++) {
            var cell = self.grid[r][c];
            if (cell && cell.k === 'c' && !fired.has(key(r, c)) && !rows.has(r)) {
              fired.add(key(r, c));
              rows.add(r);
              newRows.push(r);
              beams.push({ dir: 'h', col: c, row: r });
            }
          }
        });
        if (newRows.length) chain++;
        frontier = newRows;
      }

      return {
        rows: Array.from(rows).sort(function (a, b) { return a - b; }),
        cols: Array.from(cols).sort(function (a, b) { return a - b; }),
        beams: beams,
        chain: chain
      };
    }

    startClear(startRows, isFlash) {
      var res = this.resolveChain(startRows);
      var rowSet = new Set(res.rows);
      var colSet = new Set(res.cols);
      var removed = [];
      var shadows = 0;
      for (var r = 0; r < this.H; r++) {
        for (var c = 0; c < this.cols; c++) {
          var cell = this.grid[r][c];
          if (cell && (rowSet.has(r) || colSet.has(c))) {
            removed.push({ r: r, c: c, col: cell.col, k: cell.k });
            if (isShadow(cell)) shadows++;
          }
        }
      }

      var n = res.rows.length;
      var m = this.mult();
      var pts = lineScore(n) * m + res.beams.length * 150 * m + res.chain * 300 * m + shadows * 20 * m;
      if (!isFlash) {
        this.combo++;
        if (this.combo > 0) pts += 50 * this.combo * m;
      }
      this.score += pts;
      this.lines += n;
      this.beams += res.beams.length;
      this.shadowsCleared += shadows;
      if (res.chain > this.maxChain) this.maxChain = res.chain;
      if (!isFlash) this.charge = Math.min(100, this.charge + n * 10 + res.beams.length * 8);

      var prevDepth = this.depth;
      if (!this.level) this.depth = 1 + Math.floor(this.lines / 10);

      this.clearing = {
        rows: res.rows, cols: res.cols, beams: res.beams,
        t: CLEAR_MS, dur: CLEAR_MS, resume: !!isFlash
      };
      this.events.push({
        type: 'clear', rows: res.rows, cols: res.cols, beams: res.beams, chain: res.chain,
        n: n, shadows: shadows, points: pts, combo: isFlash ? 0 : this.combo,
        flash: !!isFlash, removed: removed
      });
      if (this.depth > prevDepth) {
        this.events.push({ type: 'depth', depth: this.depth });
        if (this.riseLeft == null && this.risePieces()) this.riseLeft = this.risePieces();
      }
    }

    finishClear() {
      var cl = this.clearing;
      var rowSet = new Set(cl.rows);
      var colSet = new Set(cl.cols);
      var grid = [];
      for (var r = 0; r < this.H; r++) {
        if (rowSet.has(r)) continue;
        var src = this.grid[r];
        var row = new Array(this.cols);
        for (var c = 0; c < this.cols; c++) row[c] = colSet.has(c) ? null : src[c];
        grid.push(row);
      }
      while (grid.length < this.H) grid.unshift(this.emptyRow());
      this.grid = grid;
      this.clearing = null;

      if (cl.resume) {
        // Вспышка во время падения: фигура продолжает лететь.
        var p = this.active;
        if (p) {
          var tries = 0;
          while (this.collides(p.cells, p.x, p.y) && tries < 4) { p.y--; tries++; }
          if (this.collides(p.cells, p.x, p.y)) {
            this.active = null;
            this.gameOver('blocked');
            return;
          }
          if (p.y < this.lowestY) this.lowestY = p.y;
        }
        this.checkGoal();
        return;
      }
      this.finishTurn();
    }

    finishTurn() {
      if (this.state !== 'playing') return;
      for (var r = 0; r < this.hidden; r++) {
        if (this.grid[r].some(Boolean)) {
          this.gameOver('top');
          return;
        }
      }
      if (this.checkGoal()) return;
      if (this.level && this.level.limits && this.level.limits.pieces &&
          this.pieces >= this.level.limits.pieces) {
        this.gameOver('pieces');
        return;
      }

      var every = this.risePieces();
      if (every) {
        if (this.riseLeft == null) this.riseLeft = every;
        this.riseLeft--;
        if (this.riseLeft <= 0) {
          this.riseLeft = every;
          this.rise();
          if (this.state !== 'playing') return;
        }
      } else {
        this.riseLeft = null;
      }
      this.spawn();
    }

    // Прилив тьмы: всё поле сдвигается вверх, снизу появляется ряд теней с щелью.
    rise() {
      if (this.grid[0].some(Boolean)) {
        this.gameOver('rise');
        return;
      }
      var gap = this.lastGap >= 0 && this.rng.next() < 0.45 ? this.lastGap : this.rng.int(this.cols);
      this.lastGap = gap;
      var row = this.emptyRow();
      for (var c = 0; c < this.cols; c++) if (c !== gap) row[c] = { k: 's', col: -1 };
      if (this.rng.next() < 0.25) {
        var cc = this.rng.int(this.cols - 1);
        if (cc >= gap) cc++;
        row[cc] = { k: 'c', col: -1 };
      }
      this.grid.shift();
      this.grid.push(row);
      var p = this.active;
      if (p && this.collides(p.cells, p.x, p.y)) {
        p.y--;
        if (this.collides(p.cells, p.x, p.y)) {
          this.active = null;
          this.gameOver('rise');
          return;
        }
      }
      if (p && this.lowestY > p.y) this.lowestY = p.y;
      this.events.push({ type: 'rise', gap: gap });
    }

    // ---------- цели и финал ----------

    goalInfo() {
      var L = this.level;
      if (!L) return null;
      var g = L.goal;
      var cur = 0, target = g.target || 0;
      switch (g.type) {
        case 'lines': cur = this.lines; break;
        case 'beams': cur = this.beams; break;
        case 'score': cur = this.score; break;
        case 'shadows':
          target = this.shadowsTotal;
          cur = this.shadowsTotal - this.countShadows();
          break;
        case 'survive': cur = Math.floor(this.time / 1000); break;
      }
      return { type: g.type, cur: Math.min(cur, target), target: target, done: cur >= target };
    }

    limitInfo() {
      var L = this.level;
      if (!L || !L.limits) return null;
      if (L.limits.pieces) return { type: 'pieces', left: Math.max(0, L.limits.pieces - this.pieces), total: L.limits.pieces };
      if (L.limits.time) return { type: 'time', left: Math.max(0, L.limits.time * 1000 - this.time), total: L.limits.time * 1000 };
      return null;
    }

    checkGoal() {
      if (!this.level || this.state !== 'playing') return false;
      var info = this.goalInfo();
      if (info.type === 'survive') return false;
      if (info.done) {
        this.win();
        return true;
      }
      return false;
    }

    computeStars() {
      var s = this.level && this.level.stars;
      if (!s) return 3;
      var v;
      switch (s.metric) {
        case 'time': v = this.time / 1000; break;
        case 'lines': v = this.lines; break;
        case 'score': v = this.score; break;
        default: v = this.pieces;
      }
      var lowerBetter = s.metric === 'pieces' || s.metric === 'time';
      var ok = function (t) { return lowerBetter ? v <= t : v >= t; };
      return ok(s.three) ? 3 : ok(s.two) ? 2 : 1;
    }

    win() {
      if (this.state !== 'playing') return;
      this.state = 'won';
      this.active = null;
      var stars = this.computeStars();
      this.result = { won: true, stars: stars, score: this.score, pieces: this.pieces, time: this.time, lines: this.lines, beams: this.beams };
      this.events.push({ type: 'win', stars: stars });
    }

    gameOver(reason) {
      if (this.state !== 'playing') return;
      this.state = 'over';
      this.result = {
        won: false, reason: reason, score: this.score, pieces: this.pieces, time: this.time,
        lines: this.lines, beams: this.beams, depth: this.depth, maxChain: this.maxChain
      };
      this.events.push({ type: 'gameover', reason: reason });
    }

    // ---------- сохранение ----------

    toJSON() {
      var out = { v: 1, levelId: this.level ? this.level.id : null, rngS: this.rng.s };
      var self = this;
      SAVED_FIELDS.forEach(function (f) { out[f] = self[f]; });
      return JSON.parse(JSON.stringify(out));
    }

    static fromJSON(data) {
      if (!data || data.v !== 1) return null;
      var level = data.levelId != null ? TP.levelById(data.levelId) : null;
      if (data.mode === 'level' && !level) return null;
      var g = new Game({ mode: data.mode, level: level, seed: data.seed, noSpawn: true });
      SAVED_FIELDS.forEach(function (f) { if (f in data) g[f] = data[f]; });
      g.rng.s = data.rngS | 0;
      g.events = [];
      g.soft = false;
      return g;
    }
  }

  TP.Game = Game;
})(TP);
