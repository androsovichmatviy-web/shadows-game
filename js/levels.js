/*
 * Тенепад — уровни кампании.
 *
 * layout — ряды заготовки сверху вниз (11 символов), кладутся на дно поля:
 *   '.' пусто, 'o' осколок света, '*' кристалл, '#' тень, '%' тень с кристаллом.
 * goal.type: lines | beams | shadows | score | survive
 * limits: { pieces: N } или { time: секунды }
 * rise: { pieces: N } или { seconds: N } — прилив тьмы снизу.
 * stars: { metric: pieces | time | lines | score, two: X, three: Y }
 *   для pieces и time меньше — лучше, для lines и score — больше.
 */
var TP = TP || {};

(function (TP) {
  'use strict';

  TP.LEVELS = [
    {
      id: 1,
      name: 'Первый свет',
      brief: 'Свет падает осколками. Заполни ряд целиком, и он рассыплется. Собери 4 линии.',
      hint: '← → двигают осколок, ↑ поворачивает, ↓ ускоряет падение, Пробел роняет сразу.',
      goal: { type: 'lines', target: 4 },
      speed: 900,
      crystal: 0,
      pool: ['pair', 'rod3', 'angle3', 'slab4', 'hook4'],
      stars: { metric: 'pieces', two: 24, three: 18 }
    },
    {
      id: 2,
      name: 'Зеркало',
      brief: 'Собери 6 линий. На дне ждёт выемка, в которую «Ступень» встанет только отражённой.',
      hint: 'C отражает осколок зеркально: несимметричная фигура становится своим двойником.',
      goal: { type: 'lines', target: 6 },
      speed: 800,
      crystal: 0,
      pool: ['step4', 'hook4', 'rod3', 'pair', 'bolt5', 'flag5'],
      layout: [
        'oooo..ooooo',
        'oooo.oooooo'
      ],
      stars: { metric: 'pieces', two: 20, three: 15 }
    },
    {
      id: 3,
      name: 'Осколки света',
      brief: 'Некоторые осколки несут кристалл. Когда ряд с кристаллом исчезает, кристалл бьёт лучом и выжигает весь свой столбец. Зажги 3 луча.',
      hint: 'Брось «Прут» стоймя в колодец посередине.',
      goal: { type: 'beams', target: 3 },
      speed: 800,
      crystal: 0.35,
      pool: ['pair', 'rod3', 'angle3', 'slab4', 'hook4', 'step4'],
      layout: [
        'ooooo.ooooo',
        'oo*oo.ooooo',
        'ooooo.ooo*o',
        'ooooo.ooooo'
      ],
      stars: { metric: 'pieces', two: 12, three: 7 }
    },
    {
      id: 4,
      name: 'Цепная реакция',
      brief: 'Луч, задевший другой кристалл, поджигает его, и тот выжигает свой ряд целиком. Так рождаются цепочки. Зажги 6 лучей.',
      hint: 'Заполни пустую клетку в нижнем ряду и посмотри, что будет.',
      goal: { type: 'beams', target: 6 },
      speed: 800,
      crystal: 0.3,
      pool: ['pair', 'rod3', 'angle3', 'slab4', 'hook4', 'step4', 'flag5'],
      layout: [
        '##*.....###',
        '##*...*.###',
        '#.........#',
        'oooo.o*oooo'
      ],
      stars: { metric: 'pieces', two: 12, three: 6 }
    },
    {
      id: 5,
      name: 'Тени на дне',
      brief: 'Тени — тёмные глыбы. Они исчезают только вместе с собранной линией или под лучом кристалла. Рассей все тени.',
      hint: 'Линии копят Сияние. Когда шкала полна, нажми F: Вспышка сжигает два нижних ряда.',
      goal: { type: 'shadows' },
      speed: 750,
      crystal: 0.15,
      pool: { depth: 2 },
      layout: [
        '##..###.###',
        '###.###.###',
        '###.#######'
      ],
      stars: { metric: 'pieces', two: 12, three: 8 }
    },
    {
      id: 6,
      name: 'Прилив',
      brief: 'Каждые 8 секунд снизу поднимается ряд тьмы с одной щелью. Продержись 75 секунд.',
      hint: 'Заполни щель, и весь ряд тьмы рассыплется вместе с линией.',
      goal: { type: 'survive', target: 75 },
      speed: 700,
      crystal: 0.2,
      pool: { depth: 3 },
      rise: { seconds: 8 },
      stars: { metric: 'lines', two: 8, three: 14 }
    },
    {
      id: 7,
      name: 'Шахматная ночь',
      brief: 'Тени уложены ярусами. Сними верхний ярус, чтобы открыть нижний. Рассей все тени.',
      hint: 'Квадратная «Плита» ложится в любую выемку 2×2.',
      goal: { type: 'shadows' },
      speed: 750,
      crystal: 0.15,
      pool: ['slab4', 'slab4', 'pair', 'angle3', 'hook4', 'flag5', 'rod3'],
      layout: [
        '##..##..###',
        '##..##..###',
        '..##..##..#',
        '..##..##..#'
      ],
      stars: { metric: 'pieces', two: 12, three: 8 }
    },
    {
      id: 8,
      name: 'Столпы',
      brief: 'Со дна поднимаются три теневых столпа. Заполняй промежутки между ними, чтобы срезать столпы по рядам.',
      hint: 'Узкие фигуры, поставленные стоймя, здесь лучшие друзья.',
      goal: { type: 'shadows' },
      speed: 750,
      crystal: 0.25,
      pool: ['slab4', 'flag5', 'hook4', 'step4', 'pair', 'rod3', 'angle3'],
      layout: [
        '..#..#..#..',
        '..#..#..#..',
        '..#..#..#..',
        '..#..#..#..',
        '..#..#..#..',
        '..#..#..#..',
        '..#..#..#..'
      ],
      stars: { metric: 'pieces', two: 24, three: 19 }
    },
    {
      id: 9,
      name: 'Спешка',
      brief: 'Осколки падают быстро. Собери 12 линий за 100 секунд.',
      hint: 'Чаще роняй осколки Пробелом: каждая секунда на счету.',
      goal: { type: 'lines', target: 12 },
      limits: { time: 100 },
      speed: 330,
      crystal: 0.12,
      pool: { depth: 4 },
      stars: { metric: 'time', two: 85, three: 65 }
    },
    {
      id: 10,
      name: 'Пентамания',
      brief: 'Только пятиклеточные осколки. Собери 6 линий.',
      hint: 'Смотри на очередь справа и планируй на две фигуры вперёд.',
      goal: { type: 'lines', target: 6 },
      speed: 700,
      crystal: 0.15,
      pool: ['cross5', 'arch5', 'fork5', 'stair5', 'flag5', 'corner5', 'bolt5', 'spire5'],
      stars: { metric: 'pieces', two: 24, three: 18 }
    },
    {
      id: 11,
      name: 'Глубокая тень',
      brief: 'Шесть рядов тьмы, в каждом по одной щели. Рассей все тени, уложившись в 60 осколков.',
      hint: 'Откапывай сверху вниз. Кристаллы и Вспышка экономят ходы.',
      goal: { type: 'shadows' },
      limits: { pieces: 60 },
      speed: 600,
      crystal: 0.25,
      pool: { depth: 4 },
      layout: [
        '####.######',
        '#######.###',
        '##.########',
        '######.####',
        '#.#########',
        '########.##'
      ],
      stars: { metric: 'pieces', two: 40, three: 30 }
    },
    {
      id: 12,
      name: 'Затмение',
      brief: 'Тьма поднимается после каждых 6 осколков, а падение ускорено. Набери 5000 очков.',
      hint: 'Каждая рассеянная тень приносит очки, так что ряды тьмы выгодно собирать.',
      goal: { type: 'score', target: 5000 },
      speed: 480,
      crystal: 0.18,
      pool: { depth: 6 },
      rise: { pieces: 6 },
      stars: { metric: 'pieces', two: 65, three: 48 }
    }
  ];

  TP.levelById = function (id) {
    for (var i = 0; i < TP.LEVELS.length; i++) {
      if (TP.LEVELS[i].id === id) return TP.LEVELS[i];
    }
    return null;
  };
})(TP);
