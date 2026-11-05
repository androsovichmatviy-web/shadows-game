'use strict';
// Тесты игровой логики: node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadTP() {
  const ctx = { console, Math, Date, JSON, Set, Array, Object };
  vm.createContext(ctx);
  for (const f of ['pieces.js', 'levels.js', 'engine.js']) {
    const src = fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8');
    vm.runInContext(src, ctx, { filename: f });
  }
  return ctx.TP;
}

const TP = loadTP();
const { COLS, ROWS, HIDDEN, CLEAR_MS } = TP.ENGINE;
const H = ROWS + HIDDEN;

const key = (cells) => cells.map((c) => c.join(',')).sort().join(';');

function isConnected(cells) {
  const set = new Set(cells.map((c) => c.join(',')));
  const seen = new Set([cells[0].join(',')]);
  const stack = [cells[0]];
  while (stack.length) {
    const [x, y] = stack.pop();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const k = (x + dx) + ',' + (y + dy);
      if (set.has(k) && !seen.has(k)) { seen.add(k); stack.push([x + dx, y + dy]); }
    }
  }
  return seen.size === cells.length;
}

function emptyGame(opts) {
  const g = new TP.Game(Object.assign({ mode: 'endless', seed: 42 }, opts));
  for (let r = 0; r < H; r++) for (let c = 0; c < COLS; c++) g.grid[r][c] = null;
  return g;
}

function placeActive(g, id, x, y, crystal) {
  const p = g.makeActive({ id, crystal: crystal == null ? -1 : crystal });
  p.x = x;
  p.y = y;
  g.active = p;
  g.lockTimer = 0;
  return p;
}

function finishClearing(g) {
  let guard = 0;
  while (g.clearing && guard++ < 100) g.update(CLEAR_MS / 4);
}

test('фигуры: связные, нормализованные, от 2 до 5 клеток', () => {
  for (const id of TP.SHAPE_IDS) {
    const sh = TP.SHAPES[id];
    const xs = sh.cells.map((c) => c[0]);
    const ys = sh.cells.map((c) => c[1]);
    assert.equal(Math.min(...xs), 0, id);
    assert.equal(Math.min(...ys), 0, id);
    assert.ok(sh.cells.length >= 2 && sh.cells.length <= 5, id);
    assert.ok(isConnected(sh.cells), id + ' связна');
    assert.equal(new Set(sh.cells.map((c) => c.join(','))).size, sh.cells.length, id + ' без повторов');
    assert.ok(sh.color >= 0 && sh.color < TP.COLORS.length, id);
  }
});

test('фигуры: четыре поворота и два отражения возвращают исходное положение', () => {
  for (const id of TP.SHAPE_IDS) {
    let c = TP.SHAPES[id].cells;
    for (let i = 0; i < 4; i++) c = TP.rotateCells(c, 1);
    assert.equal(key(c), key(TP.SHAPES[id].cells), id);
    let m = TP.mirrorCells(TP.mirrorCells(TP.SHAPES[id].cells));
    assert.equal(key(m), key(TP.SHAPES[id].cells), id);
    const cw = TP.rotateCells(TP.SHAPES[id].cells, 1);
    assert.equal(key(TP.rotateCells(cw, -1)), key(TP.SHAPES[id].cells), id + ' по и против часовой');
  }
});

test('набор фигур не повторяет классические семь тетрамино', () => {
  const sizes = TP.SHAPE_IDS.map((id) => TP.SHAPES[id].cells.length);
  assert.ok(sizes.filter((n) => n === 4).length <= 3);
  assert.ok(sizes.filter((n) => n === 5).length >= 8);
});

test('уровни: корректные заготовки, цели и пулы', () => {
  const types = new Set(['lines', 'beams', 'shadows', 'score', 'survive']);
  TP.LEVELS.forEach((lv, i) => {
    assert.equal(lv.id, i + 1);
    assert.ok(lv.name && lv.brief && lv.hint, 'тексты уровня ' + lv.id);
    assert.ok(types.has(lv.goal.type), 'цель уровня ' + lv.id);
    (lv.layout || []).forEach((row) => {
      assert.equal(row.length, COLS, 'ширина ряда уровня ' + lv.id);
      assert.match(row, /^[.o*#%]+$/);
      assert.ok(row.includes('.'), 'в заготовке нет полностью заполненных рядов');
    });
    if (Array.isArray(lv.pool)) lv.pool.forEach((id) => assert.ok(TP.SHAPES[id], id));
    if (lv.goal.type === 'shadows') {
      const g = new TP.Game({ mode: 'level', level: lv, seed: 1 });
      assert.ok(g.shadowsTotal > 0, 'на уровне ' + lv.id + ' есть тени');
    }
    assert.ok(lv.stars && lv.stars.two != null && lv.stars.three != null);
  });
});

test('сброс вниз кладёт фигуру на дно и даёт очки за высоту', () => {
  const g = emptyGame();
  placeActive(g, 'slab4', 0, HIDDEN);
  const before = g.score;
  g.hardDrop();
  assert.ok(g.grid[H - 1][0] && g.grid[H - 1][1] && g.grid[H - 2][0] && g.grid[H - 2][1]);
  assert.equal(g.score - before, 2 * (H - 2 - HIDDEN));
  assert.equal(g.pieces, 1);
  assert.ok(g.active, 'появилась следующая фигура');
});

test('заполненный ряд исчезает, верх опускается', () => {
  const g = emptyGame();
  for (let c = 2; c < COLS; c++) g.grid[H - 1][c] = { k: 'n', col: 0 };
  g.grid[H - 2][5] = { k: 'n', col: 3 };
  placeActive(g, 'pair', 0, HIDDEN);
  g.hardDrop();
  assert.equal(g.lines, 1);
  assert.ok(g.clearing, 'идёт анимация очистки');
  finishClearing(g);
  assert.equal(g.grid[H - 1][5].col, 3, 'клетка сверху опустилась');
  assert.equal(g.grid[H - 1].filter(Boolean).length, 1);
  assert.equal(g.score, TP.lineScore(1) + 2 * (H - 1 - HIDDEN));
});

test('кристалл в собранном ряду выжигает свой столбец', () => {
  const g = emptyGame();
  for (let c = 2; c < COLS; c++) g.grid[H - 1][c] = { k: c === 7 ? 'c' : 'n', col: 1 };
  for (let r = H - 6; r < H - 1; r++) g.grid[r][7] = { k: 's', col: -1 };
  g.grid[H - 2][3] = { k: 'n', col: 2 };
  placeActive(g, 'pair', 0, HIDDEN);
  g.hardDrop();
  assert.equal(g.beams, 1);
  assert.equal(g.shadowsCleared, 5);
  finishClearing(g);
  for (let r = 0; r < H; r++) assert.equal(g.grid[r][7], null, 'столбец 7 пуст, ряд ' + r);
  assert.equal(g.grid[H - 1][3].col, 2, 'соседний столбец просто опустился');
});

test('цепная реакция на уровне 4 даёт 4 луча и цепь из двух звеньев', () => {
  const lv = TP.levelById(4);
  const g = new TP.Game({ mode: 'level', level: lv, seed: 3 });
  placeActive(g, 'pair', 4, HIDDEN);
  g.rotate(1);
  g.active.x = 4;
  g.hardDrop();
  const ev = g.events.find((e) => e.type === 'clear');
  assert.ok(ev, 'был клир');
  assert.equal(ev.beams.length, 4);
  assert.equal(ev.chain, 2);
  assert.equal(ev.rows.length, 3);
  finishClearing(g);
  assert.equal(g.state, 'playing');
  assert.equal(g.beams, 4);
});

test('уровень 2: отражённая «Ступень» встаёт в выемку и собирает две линии', () => {
  const g = new TP.Game({ mode: 'level', level: TP.levelById(2), seed: 5 });
  placeActive(g, 'step4', 4, HIDDEN);
  assert.ok(g.mirror());
  assert.ok(g.rotate(1));
  g.active.x = 4;
  g.hardDrop();
  assert.equal(g.lines, 2);
});

test('прилив поднимает поле и добавляет ряд теней с одной щелью', () => {
  const g = emptyGame();
  g.grid[H - 1][0] = { k: 'n', col: 0 };
  g.active = null;
  g.rise();
  assert.equal(g.grid[H - 2][0].col, 0, 'старый ряд поднялся');
  const bottom = g.grid[H - 1];
  assert.equal(bottom.filter((c) => !c).length, 1, 'одна щель');
  assert.ok(bottom.filter(Boolean).every((c) => c.col === -1), 'весь ряд — тени');
});

test('прилив на заполненный верх заканчивает игру', () => {
  const g = emptyGame();
  g.grid[0][3] = { k: 'n', col: 0 };
  g.rise();
  assert.equal(g.state, 'over');
  assert.equal(g.result.reason, 'rise');
});

test('бесконечный режим: глубина растёт каждые 10 линий и включает прилив', () => {
  const g = emptyGame();
  assert.equal(g.risePieces(), 0);
  g.lines = 9;
  for (let c = 1; c < COLS; c++) g.grid[H - 1][c] = { k: 'n', col: 0 };
  placeActive(g, 'pair', 0, HIDDEN);
  g.rotate(1);
  g.active.x = 0;
  g.hardDrop();
  assert.equal(g.depth, 2);
  assert.ok(g.events.some((e) => e.type === 'depth' && e.depth === 2));
  assert.equal(g.riseLeft, g.risePieces());
  assert.ok(g.gravityMs() < 850);
});

test('Вспышка сжигает два нижних ряда, когда Сияние полное', () => {
  const g = emptyGame();
  g.fillQueue();
  g.spawn();
  for (let c = 0; c < 6; c++) g.grid[H - 1][c] = { k: 's', col: -1 };
  for (let c = 0; c < 4; c++) g.grid[H - 2][c] = { k: 'n', col: 2 };
  g.grid[H - 3][0] = { k: 'n', col: 5 };
  assert.equal(g.flash(), false, 'без заряда не работает');
  g.charge = 100;
  const y = g.active.y;
  assert.equal(g.flash(), true);
  assert.equal(g.charge, 0);
  finishClearing(g);
  assert.equal(g.grid[H - 1][0].col, 5);
  assert.equal(g.countShadows(), 0);
  assert.equal(g.active.y, y, 'падающая фигура осталась на месте');
});

test('уровень с целью по линиям завершается победой и звёздами', () => {
  const lv = TP.levelById(1);
  const g = new TP.Game({ mode: 'level', level: lv, seed: 9 });
  g.lines = lv.goal.target - 1;
  for (let c = 1; c < COLS; c++) g.grid[H - 1][c] = { k: 'n', col: 0 };
  placeActive(g, 'pair', 0, HIDDEN);
  g.rotate(1);
  g.active.x = 0;
  g.hardDrop();
  finishClearing(g);
  assert.equal(g.state, 'won');
  assert.equal(g.result.stars, 3);
});

test('лимит осколков приводит к поражению', () => {
  const lv = TP.levelById(11);
  const g = new TP.Game({ mode: 'level', level: lv, seed: 2 });
  g.pieces = lv.limits.pieces - 1;
  g.hardDrop();
  assert.equal(g.state, 'over');
  assert.equal(g.result.reason, 'pieces');
});

test('выживание: победа по таймеру', () => {
  const lv = TP.levelById(6);
  const g = new TP.Game({ mode: 'level', level: lv, seed: 4 });
  g.time = lv.goal.target * 1000 - 5;
  g.riseTimer = 99999;
  g.update(10);
  assert.equal(g.state, 'won');
});

test('сохранение и восстановление партии', () => {
  const g = new TP.Game({ mode: 'level', level: TP.levelById(5), seed: 77 });
  g.move(1);
  g.hardDrop();
  g.update(100);
  const data = JSON.parse(JSON.stringify(g.toJSON()));
  const r = TP.Game.fromJSON(data);
  assert.equal(r.level.id, 5);
  assert.equal(JSON.stringify(r.grid), JSON.stringify(g.grid));
  assert.equal(JSON.stringify(r.active), JSON.stringify(g.active));
  assert.equal(r.score, g.score);
  assert.equal(r.rng.next(), g.rng.next(), 'генератор продолжает ту же последовательность');
});

test('случайная игра не ломает инварианты', () => {
  const modes = [{ mode: 'endless' }].concat(TP.LEVELS.map((lv) => ({ mode: 'level', level: lv })));
  for (const m of modes) {
    for (let seed = 1; seed <= 6; seed++) {
      const g = new TP.Game(Object.assign({ seed }, m));
      const rnd = new TP.Rng(seed * 31);
      for (let step = 0; step < 4000 && g.state === 'playing'; step++) {
        const a = rnd.int(9);
        if (a === 0) g.move(-1);
        else if (a === 1) g.move(1);
        else if (a === 2) g.rotate(1);
        else if (a === 3) g.rotate(-1);
        else if (a === 4) g.mirror();
        else if (a === 5 && rnd.next() < 0.3) g.hardDrop();
        else if (a === 6) { g.charge = 100; g.flash(); }
        else g.setSoft(rnd.next() < 0.5);
        g.update(16 + rnd.int(30));
        g.events.length = 0;
        assert.equal(g.grid.length, H);
        g.grid.forEach((row) => assert.equal(row.length, COLS));
        if (g.active && g.state === 'playing') {
          assert.equal(g.collides(g.active.cells, g.active.x, g.active.y), false, 'фигура не пересекает поле');
        }
        assert.ok(g.score >= 0 && Number.isFinite(g.score));
      }
    }
  }
});
