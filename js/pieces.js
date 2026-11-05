/*
 * Тенепад — набор «осколков» (падающих фигур).
 *
 * Свой набор: пара, две трёхклеточные, три четырёхклеточные
 * и восемь пятиклеточных фигур. Чем глубже игрок спускается
 * в бесконечном режиме, тем чаще выпадают крупные осколки.
 */
var TP = TP || {};

(function (TP) {
  'use strict';

  // Цвета света. Тени хранят цвет -1 и рисуются отдельно.
  TP.COLORS = [
    '#f6b85c', // 0 янтарь
    '#ef8f7d', // 1 коралл
    '#7fd3c4', // 2 бирюза
    '#ab9cf2', // 3 сирень
    '#f3dc8a', // 4 бледное золото
    '#86b9f4', // 5 небесный
    '#e59bd4', // 6 роза
    '#a3d98f'  // 7 мята
  ];

  // cells — клетки в начальном положении, w — относительная частота.
  TP.SHAPES = {
    pair:    { name: 'Пара',     color: 4, w: 1,    cells: [[0, 0], [1, 0]] },
    rod3:    { name: 'Прут',     color: 5, w: 1,    cells: [[0, 0], [1, 0], [2, 0]] },
    angle3:  { name: 'Уголок',   color: 2, w: 1,    cells: [[0, 0], [0, 1], [1, 1]] },
    slab4:   { name: 'Плита',    color: 0, w: 1,    cells: [[0, 0], [1, 0], [0, 1], [1, 1]] },
    hook4:   { name: 'Крюк',     color: 1, w: 1,    cells: [[0, 0], [0, 1], [1, 1], [2, 1]] },
    step4:   { name: 'Ступень',  color: 7, w: 1,    cells: [[1, 0], [2, 0], [0, 1], [1, 1]] },
    cross5:  { name: 'Звезда',   color: 4, w: 0.55, cells: [[1, 0], [0, 1], [1, 1], [2, 1], [1, 2]] },
    arch5:   { name: 'Арка',     color: 3, w: 1,    cells: [[0, 0], [2, 0], [0, 1], [1, 1], [2, 1]] },
    fork5:   { name: 'Вилка',    color: 6, w: 0.9,  cells: [[0, 0], [1, 0], [2, 0], [1, 1], [1, 2]] },
    stair5:  { name: 'Лестница', color: 2, w: 0.8,  cells: [[0, 0], [0, 1], [1, 1], [1, 2], [2, 2]] },
    flag5:   { name: 'Флаг',     color: 0, w: 1.2,  cells: [[0, 0], [1, 0], [0, 1], [1, 1], [0, 2]] },
    corner5: { name: 'Угол',     color: 5, w: 1,    cells: [[0, 0], [0, 1], [0, 2], [1, 2], [2, 2]] },
    bolt5:   { name: 'Молния',   color: 1, w: 0.9,  cells: [[0, 0], [1, 0], [1, 1], [1, 2], [2, 2]] },
    spire5:  { name: 'Шпиль',    color: 3, w: 0.8,  cells: [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0]] }
  };

  TP.SHAPE_IDS = Object.keys(TP.SHAPES);

  TP.bounds = function (cells) {
    var w = 0, h = 0;
    for (var i = 0; i < cells.length; i++) {
      if (cells[i][0] + 1 > w) w = cells[i][0] + 1;
      if (cells[i][1] + 1 > h) h = cells[i][1] + 1;
    }
    return { w: w, h: h };
  };

  // Поворот на 90°: dir = 1 по часовой стрелке, dir = -1 против.
  // Порядок клеток сохраняется, поэтому кристалл остаётся «своей» клеткой.
  TP.rotateCells = function (cells, dir) {
    var b = TP.bounds(cells);
    return cells.map(function (c) {
      return dir > 0 ? [b.h - 1 - c[1], c[0]] : [c[1], b.w - 1 - c[0]];
    });
  };

  // Зеркальное отражение по горизонтали.
  TP.mirrorCells = function (cells) {
    var b = TP.bounds(cells);
    return cells.map(function (c) { return [b.w - 1 - c[0], c[1]]; });
  };

  // Веса фигур для заданной глубины: мелочь уступает место пятиклеточным.
  TP.depthPool = function (depth) {
    var d = Math.max(0, (depth || 1) - 1);
    var totals = {
      2: Math.max(0.4, 1.4 - 0.15 * d),
      3: Math.max(1.0, 2.6 - 0.2 * d),
      4: 3.0,
      5: Math.min(5.0, 1.2 + 0.5 * d)
    };
    var bySize = {};
    TP.SHAPE_IDS.forEach(function (id) {
      var n = TP.SHAPES[id].cells.length;
      (bySize[n] = bySize[n] || []).push(id);
    });
    var pool = [];
    Object.keys(bySize).forEach(function (n) {
      var ids = bySize[n];
      var sum = ids.reduce(function (s, id) { return s + TP.SHAPES[id].w; }, 0);
      ids.forEach(function (id) {
        pool.push({ id: id, w: totals[n] * TP.SHAPES[id].w / sum });
      });
    });
    return pool;
  };
})(TP);
