/*
 * Тенепад — экраны, управление, игровой цикл, сохранения.
 */
(function () {
  'use strict';

  var E = TP.ENGINE;
  var plural = TP.plural;
  var $ = function (id) { return document.getElementById(id); };

  // ---------- сохранения (только в этом браузере) ----------

  var STORE_KEY = 'tenepad.v1';
  var store = loadStore();

  function loadStore() {
    var s = {};
    try { s = JSON.parse(localStorage.getItem(STORE_KEY) || '{}') || {}; } catch (e) { s = {}; }
    return {
      best: s.best | 0,
      bestDepth: s.bestDepth | 0,
      stars: s.stars && typeof s.stars === 'object' ? s.stars : {},
      sound: s.sound !== false
    };
  }
  function saveStore() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(store)); } catch (e) { /* хранилище недоступно */ }
  }

  TP.Sound.setEnabled(store.sound);

  // ---------- форматирование ----------

  function fmt(n) { return Math.round(n).toLocaleString('ru-RU'); }
  function fmtTime(ms) {
    var s = Math.max(0, Math.ceil(ms / 1000));
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  }
  function countLayoutShadows(lv) {
    var n = 0;
    (lv.layout || []).forEach(function (row) {
      for (var i = 0; i < row.length; i++) if (row[i] === '#' || row[i] === '%') n++;
    });
    return n;
  }
  function piecesWord(n) { return plural(n, 'осколок', 'осколка', 'осколков'); }
  // «до 24 осколков», «не больше 21 осколка»
  function piecesGen(n) { return plural(n, 'осколка', 'осколков', 'осколков'); }
  function totalStars() {
    return TP.LEVELS.reduce(function (s, lv) { return s + (store.stars[lv.id] | 0); }, 0);
  }
  function starsHtml(n) {
    var out = '';
    for (var i = 0; i < 3; i++) out += '<span class="star' + (i < n ? ' on' : '') + '">★</span>';
    return out;
  }

  function goalText(lv) {
    var g = lv.goal;
    switch (g.type) {
      case 'lines': return 'Собрать ' + g.target + ' ' + plural(g.target, 'линию', 'линии', 'линий');
      case 'beams': return 'Зажечь ' + g.target + ' ' + plural(g.target, 'луч', 'луча', 'лучей');
      case 'shadows': return 'Рассеять все тени (' + countLayoutShadows(lv) + ')';
      case 'score': return 'Набрать ' + fmt(g.target) + ' очков';
      case 'survive': return 'Продержаться ' + fmtTime(g.target * 1000);
    }
    return '';
  }
  function limitText(lv) {
    var parts = [];
    if (lv.limits && lv.limits.pieces) parts.push('не больше ' + lv.limits.pieces + ' ' + piecesGen(lv.limits.pieces));
    if (lv.limits && lv.limits.time) parts.push('за ' + fmtTime(lv.limits.time * 1000));
    if (lv.rise && lv.rise.seconds) parts.push('прилив каждые ' + lv.rise.seconds + ' с');
    if (lv.rise && lv.rise.pieces) parts.push('прилив каждые ' + lv.rise.pieces + ' ' + piecesWord(lv.rise.pieces));
    return parts.join(', ');
  }
  function starsRule(lv) {
    var s = lv.stars;
    var unit = {
      pieces: function (n) { return n + ' ' + piecesGen(n); },
      time: function (n) { return fmtTime(n * 1000); },
      lines: function (n) { return n + ' ' + plural(n, 'линии', 'линий', 'линий'); },
      score: function (n) { return fmt(n) + ' очков'; }
    }[s.metric];
    var lower = s.metric === 'pieces' || s.metric === 'time';
    var w = lower ? 'до ' : 'от ';
    return '★★ ' + w + unit(s.two) + ' · ★★★ ' + w + unit(s.three);
  }

  // ---------- состояние ----------

  var renderer = new TP.Renderer($('board'), $('next'));
  var attract = new TP.Attract($('bg'));
  var game = null;
  var mode = null;
  var level = null;
  var screen = 'menu';
  var pendingTimer = 0;
  var hud = {};

  var SCREENS = {
    menu: 'screenMenu', levels: 'screenLevels', help: 'screenHelp', brief: 'screenBrief',
    pause: 'screenPause', over: 'screenOver', win: 'screenWin'
  };
  var IN_GAME = { play: true, pause: true, over: true, win: true };

  function show(name) {
    screen = name;
    Object.keys(SCREENS).forEach(function (k) { $(SCREENS[k]).hidden = k !== name; });
    var inGame = !!IN_GAME[name];
    $('game').hidden = !inGame;
    $('bg').hidden = inGame;
    $('bg').style.opacity = name === 'menu' ? '1' : '0.35';
    resetInput();
    if (inGame) fit();
    else attract.resize();
    var scr = SCREENS[name] && $(SCREENS[name]);
    if (scr) {
      scr.scrollTop = 0;
      var first = scr.querySelector('.btn-primary, button:not([disabled])');
      if (first) first.focus({ preventScroll: true });
    } else if (document.activeElement && document.activeElement.blur) {
      document.activeElement.blur();
    }
  }

  function go(where) {
    if (where === 'menu') { refreshMenu(); show('menu'); }
    else if (where === 'levels') { buildLevelGrid(); show('levels'); }
    else if (where === 'help') show('help');
  }

  // ---------- меню и уровни ----------

  function refreshMenu() {
    $('menuBest').textContent = store.best ? 'рекорд ' + fmt(store.best) : 'рекорда пока нет';
    var max = TP.LEVELS.length * 3;
    $('menuStars').textContent = totalStars() + ' / ' + max + ' ★';
    $('levelsStars').textContent = totalStars() + ' / ' + max + ' ★';
    updateSoundUi();
  }

  function isUnlocked(i) {
    return i === 0 || (store.stars[TP.LEVELS[i - 1].id] | 0) > 0;
  }

  function buildLevelGrid() {
    var ol = $('levelGrid');
    ol.textContent = '';
    var nextMarked = false;
    TP.LEVELS.forEach(function (lv, i) {
      var stars = store.stars[lv.id] | 0;
      var open = isUnlocked(i);
      var li = document.createElement('li');
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'level-card';
      if (stars) b.classList.add('is-done');
      if (open && !stars && !nextMarked) { b.classList.add('is-next'); nextMarked = true; }
      b.disabled = !open;
      b.innerHTML = '<span class="level-num"></span><span class="level-name"></span>' +
        '<span class="level-goal"></span><span class="level-stars">' + starsHtml(stars) + '</span>';
      b.querySelector('.level-num').textContent = String(lv.id).padStart(2, '0');
      b.querySelector('.level-name').textContent = lv.name;
      b.querySelector('.level-goal').textContent = open ? goalText(lv) : 'Пройди уровень ' + (i) + ', чтобы открыть';
      b.setAttribute('aria-label', 'Уровень ' + lv.id + ', ' + lv.name + (open ? ', звёзд: ' + stars : ', закрыт'));
      b.addEventListener('click', function () { TP.Sound.init(); TP.Sound.click(); openBrief(lv); });
      li.appendChild(b);
      ol.appendChild(li);
    });
    refreshMenu();
  }

  function openBrief(lv) {
    level = lv;
    $('briefNum').textContent = 'Уровень ' + lv.id + ' из ' + TP.LEVELS.length;
    $('briefName').textContent = lv.name;
    $('briefText').textContent = lv.brief;
    $('briefGoal').textContent = goalText(lv);
    var lim = limitText(lv);
    $('briefLimitRow').hidden = !lim;
    $('briefLimit').textContent = lim;
    $('briefStars').textContent = starsRule(lv);
    $('briefHint').textContent = lv.hint;
    var got = store.stars[lv.id] | 0;
    $('briefBest').textContent = got ? '★'.repeat(got) + '☆'.repeat(3 - got) : '';
    show('brief');
  }

  // ---------- запуск партий ----------

  function newGame(g) {
    clearTimeout(pendingTimer);
    game = g;
    renderer.reset();
    hud = {};
    setupHud();
    show('play');
  }

  function startEndless() {
    TP.Sound.init();
    mode = 'endless';
    level = null;
    newGame(new TP.Game({ mode: 'endless' }));
  }

  function startLevel(lv) {
    TP.Sound.init();
    mode = 'level';
    level = lv;
    newGame(new TP.Game({ mode: 'level', level: lv }));
  }

  function restart() {
    if (mode === 'level' && level) startLevel(level);
    else startEndless();
  }

  function quit() {
    clearTimeout(pendingTimer);
    var wasLevel = mode === 'level';
    game = null;
    if (wasLevel) go('levels');
    else go('menu');
  }

  function pause() {
    if (screen !== 'play' || !game || game.state !== 'playing') return;
    $('pauseEyebrow').textContent = mode === 'level' ? 'Уровень ' + level.id + ' · ' + level.name : 'Бесконечный режим';
    show('pause');
  }

  function resume() {
    if (screen !== 'pause' || !game) return;
    show('play');
  }

  // ---------- HUD ----------

  function setText(key, node, value) {
    if (hud[key] === value) return;
    hud[key] = value;
    node.textContent = value;
  }
  function setFlag(key, node, cls, on) {
    if (hud[key] === on) return;
    hud[key] = on;
    node.classList.toggle(cls, on);
  }
  function setWidth(key, node, pct) {
    var v = Math.round(pct * 1000) / 10;
    if (hud[key] === v) return;
    hud[key] = v;
    node.style.width = v + '%';
  }

  function setupHud() {
    var endless = mode !== 'level';
    $('hudMode').textContent = endless ? 'Бесконечный режим' : 'Уровень ' + level.id;
    $('hudSub').textContent = endless ? 'спуск во тьму' : level.name;
    $('statBest').hidden = !endless;
    $('statDepth').hidden = !endless;
    $('hudGoal').hidden = endless;
    var lim = game && game.limitInfo();
    $('statLimit').hidden = !lim;
    if (lim) $('hudLimitLabel').textContent = lim.type === 'pieces' ? 'В запасе' : 'Осталось';
    var tide = endless || (level && level.rise);
    $('hudTide').hidden = !tide;
    $('btnFlash').hidden = !game || !game.flashAllowed();
  }

  function updateHud() {
    if (!game) return;
    setText('score', $('hudScore'), fmt(game.score));
    setText('lines', $('hudLines'), String(game.lines));
    if (mode !== 'level') {
      setText('best', $('hudBest'), fmt(Math.max(store.best, game.score)));
      setText('depth', $('hudDepth'), String(game.depth));
    } else {
      var gi = game.goalInfo();
      var label = { lines: 'Линии', beams: 'Лучи', shadows: 'Тени рассеяны', score: 'Очки', survive: 'Продержись' }[gi.type];
      setText('goalLabel', $('hudGoalLabel'), label);
      var val = gi.type === 'survive'
        ? fmtTime(gi.target * 1000 - game.time)
        : (gi.type === 'score' ? fmt(gi.cur) + ' / ' + fmt(gi.target) : gi.cur + ' / ' + gi.target);
      setText('goalValue', $('hudGoalValue'), val);
      setWidth('goalFill', $('hudGoalFill'), gi.type === 'survive'
        ? Math.min(1, game.time / (gi.target * 1000))
        : (gi.target ? gi.cur / gi.target : 1));
      setFlag('goalDone', $('hudGoal'), 'is-done', gi.done);
      var lim = game.limitInfo();
      if (lim) setText('limit', $('hudLimit'), lim.type === 'pieces' ? String(lim.left) : fmtTime(lim.left));
    }

    setWidth('charge', $('chargeFill'), game.charge / 100);
    var ready = game.charge >= 100;
    setFlag('ready', $('btnFlash'), 'is-ready', ready);
    setText('chargeHint', $('chargeHint'), ready ? 'Готово: F или касание' : 'копится от линий');

    if (!$('hudTide').hidden) {
      var tv, soon = false;
      if (game.riseMs() > 0) {
        tv = 'через ' + Math.max(0, Math.ceil(game.riseTimer / 1000)) + ' с';
        soon = game.riseTimer < 2000;
      } else if (game.riseLeft != null) {
        tv = 'через ' + game.riseLeft + ' ' + piecesWord(game.riseLeft);
        soon = game.riseLeft <= 2;
      } else {
        tv = 'с глубины 2';
      }
      setText('tide', $('hudTideValue'), tv);
      setFlag('tideSoon', $('hudTide'), 'is-soon', soon);
    }
  }

  // ---------- события партии ----------

  function handleEvents() {
    var evs = game.events;
    for (var i = 0; i < evs.length; i++) {
      var ev = evs[i];
      renderer.onEvent(ev, game);
      switch (ev.type) {
        case 'lock': TP.Sound.lock(); break;
        case 'drop': TP.Sound.drop(); break;
        case 'clear':
          TP.Sound.clear(ev.n, ev.chain);
          if (ev.beams.length) TP.Sound.beam(ev.beams.length);
          break;
        case 'rise': TP.Sound.rise(); break;
        case 'flash': TP.Sound.flash(); break;
        case 'depth': TP.Sound.depth(); break;
        case 'win': onWin(); break;
        case 'gameover': onOver(); break;
      }
    }
    evs.length = 0;
  }

  function fillStats(dl, rows) {
    dl.textContent = '';
    rows.forEach(function (r) {
      var d = document.createElement('div');
      if (r[2]) d.className = r[2];
      var dt = document.createElement('dt');
      dt.textContent = r[0];
      var dd = document.createElement('dd');
      dd.textContent = r[1];
      d.appendChild(dt);
      d.appendChild(dd);
      dl.appendChild(d);
    });
  }

  function onWin() {
    TP.Sound.win();
    var r = game.result;
    var prev = store.stars[level.id] | 0;
    if (r.stars > prev) store.stars[level.id] = r.stars;
    saveStore();
    $('winNum').textContent = 'Уровень ' + level.id + ' · ' + level.name;
    $('winStars').innerHTML = starsHtml(r.stars);
    $('winStars').setAttribute('aria-label', 'Звёзд: ' + r.stars + ' из 3');
    var note;
    if (r.stars === 3) note = 'Безупречно. Все три звезды.';
    else note = 'Для следующей звезды: ' + starsRule(level) + '.';
    if (prev && r.stars <= prev) note += ' Лучший результат: ' + prev + ' ★.';
    $('winNote').textContent = note;
    fillStats($('winStats'), [
      ['Осколков', String(r.pieces)],
      ['Время', fmtTime(r.time)],
      ['Линии', String(r.lines)],
      ['Лучи', String(r.beams)],
      ['Счёт', fmt(r.score)]
    ]);
    var idx = TP.LEVELS.indexOf(level);
    $('btnWinNext').hidden = idx < 0 || idx >= TP.LEVELS.length - 1;
    pendingTimer = setTimeout(function () { show('win'); }, 750);
  }

  var REASONS = {
    top: 'Осколки упёрлись в потолок.',
    blocked: 'Новому осколку не нашлось места.',
    rise: 'Прилив тьмы вытолкнул стопку за край.',
    pieces: 'Осколки закончились раньше, чем цель.',
    time: 'Время вышло.'
  };

  function onOver() {
    TP.Sound.over();
    var r = game.result;
    if (mode === 'level') {
      $('overEyebrow').textContent = 'Уровень ' + level.id + ' · ' + level.name;
      $('overTitle').textContent = 'Тьма взяла верх';
      $('overNote').textContent = (REASONS[r.reason] || '') + ' Попробуй ещё раз.';
      var gi = game.goalInfo();
      fillStats($('overStats'), [
        ['Цель', gi.type === 'survive' ? fmtTime(r.time) + ' из ' + fmtTime(gi.target * 1000) : fmt(gi.cur) + ' из ' + fmt(gi.target)],
        ['Осколков', String(r.pieces)],
        ['Счёт', fmt(r.score)]
      ]);
      $('btnOverExit').querySelector('.btn-title').textContent = 'К уровням';
    } else {
      var record = r.score > store.best;
      if (record) store.best = r.score;
      if (r.depth > store.bestDepth) store.bestDepth = r.depth;
      saveStore();
      $('overEyebrow').textContent = 'Бесконечный режим';
      $('overTitle').textContent = record && r.score > 0 ? 'Новый рекорд' : 'Тьма поднялась';
      $('overNote').textContent = REASONS[r.reason] || '';
      fillStats($('overStats'), [
        ['Счёт', fmt(r.score), record && r.score > 0 ? 'is-record' : ''],
        ['Рекорд', fmt(store.best)],
        ['Глубина', String(r.depth)],
        ['Линии', String(r.lines)],
        ['Лучи', String(r.beams)],
        ['Длиннейшая цепь', r.maxChain ? '×' + (r.maxChain + 1) : '—']
      ]);
      $('btnOverExit').querySelector('.btn-title').textContent = 'В меню';
    }
    pendingTimer = setTimeout(function () { show('over'); }, 850);
  }

  // ---------- звук ----------

  function updateSoundUi() {
    var on = TP.Sound.isEnabled();
    $('menuSound').textContent = on ? 'Звук включён' : 'Звук выключен';
    $('btnSound').classList.toggle('is-muted', !on);
    $('btnSound').setAttribute('aria-label', on ? 'Выключить звук' : 'Включить звук');
  }
  function toggleSound() {
    store.sound = !TP.Sound.isEnabled();
    TP.Sound.setEnabled(store.sound);
    if (store.sound) { TP.Sound.init(); TP.Sound.click(); }
    saveStore();
    updateSoundUi();
  }

  // ---------- управление ----------

  var DAS = 150;
  var ARR = 45;
  var held = { left: false, right: false, soft: false };
  var dasDir = 0, dasT = 0, arrT = 0;

  function resetInput() {
    held.left = held.right = held.soft = false;
    dasDir = 0;
    dasT = arrT = 0;
    if (game) game.setSoft(false);
    var downs = document.querySelectorAll('.pad-btn.is-down');
    for (var i = 0; i < downs.length; i++) downs[i].classList.remove('is-down');
  }

  function startDir(d) {
    dasDir = d;
    dasT = 0;
    arrT = 0;
    if (game.move(d)) TP.Sound.move();
  }

  function press(act) {
    if (!game || screen !== 'play') return;
    TP.Sound.init();
    switch (act) {
      case 'left': held.left = true; startDir(-1); break;
      case 'right': held.right = true; startDir(1); break;
      case 'soft': held.soft = true; game.setSoft(true); break;
      case 'rotate': if (game.rotate(1)) TP.Sound.rotate(); break;
      case 'rotateCCW': if (game.rotate(-1)) TP.Sound.rotate(); break;
      case 'mirror': if (game.mirror()) TP.Sound.mirror(); break;
      case 'drop': game.hardDrop(); break;
      case 'flash': game.flash(); break;
      case 'pause': pause(); break;
      case 'sound': toggleSound(); break;
    }
  }

  function release(act) {
    if (act === 'left') {
      held.left = false;
      if (dasDir === -1) { dasDir = held.right ? 1 : 0; dasT = arrT = 0; }
    } else if (act === 'right') {
      held.right = false;
      if (dasDir === 1) { dasDir = held.left ? -1 : 0; dasT = arrT = 0; }
    } else if (act === 'soft') {
      held.soft = false;
      if (game) game.setSoft(false);
    }
  }

  function tickInput(dt) {
    if (!dasDir || !game) return;
    dasT += dt;
    if (dasT < DAS) return;
    arrT += dt;
    while (arrT >= ARR) {
      arrT -= ARR;
      if (!game.move(dasDir)) { arrT = 0; break; }
    }
  }

  var KEYMAP = {
    ArrowLeft: 'left', KeyA: 'left',
    ArrowRight: 'right', KeyD: 'right',
    ArrowDown: 'soft', KeyS: 'soft',
    ArrowUp: 'rotate', KeyX: 'rotate', KeyW: 'rotate',
    KeyZ: 'rotateCCW', KeyQ: 'rotateCCW',
    KeyC: 'mirror', ShiftLeft: 'mirror', ShiftRight: 'mirror',
    Space: 'drop',
    KeyF: 'flash', KeyE: 'flash',
    KeyP: 'pause', Escape: 'pause',
    KeyM: 'sound'
  };

  document.addEventListener('keydown', function (e) {
    var act = KEYMAP[e.code];
    if (screen === 'play') {
      if (!act || e.ctrlKey || e.metaKey || e.altKey) return;
      e.preventDefault();
      if (e.repeat) return;
      press(act);
      return;
    }
    if (screen === 'pause' && (e.code === 'KeyP' || e.code === 'Escape')) {
      e.preventDefault();
      resume();
      return;
    }
    if (e.code === 'Escape') {
      if (screen === 'levels' || screen === 'help') go('menu');
      else if (screen === 'brief') go('levels');
    } else if (e.code === 'KeyM' && !e.ctrlKey && !e.metaKey) {
      toggleSound();
    }
  });

  document.addEventListener('keyup', function (e) {
    var act = KEYMAP[e.code];
    if (act) release(act);
  });

  var pad = $('pad');
  pad.addEventListener('pointerdown', function (e) {
    var b = e.target.closest('[data-act]');
    if (!b) return;
    e.preventDefault();
    if (screen !== 'play') return;
    try { b.setPointerCapture(e.pointerId); } catch (err) { /* необязательно */ }
    b.classList.add('is-down');
    press(b.dataset.act);
  });
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(function (type) {
    pad.addEventListener(type, function (e) {
      var b = e.target.closest('[data-act]');
      if (!b || !b.classList.contains('is-down')) return;
      b.classList.remove('is-down');
      release(b.dataset.act);
    });
  });
  pad.addEventListener('contextmenu', function (e) { e.preventDefault(); });

  $('btnFlash').addEventListener('pointerdown', function (e) {
    e.preventDefault();
    press('flash');
  });

  // Жесты на поле: касание — поворот, свайп вбок — сдвиг, резкий свайп вниз — сброс.
  var board = $('board');
  var gest = null;
  board.addEventListener('pointerdown', function (e) {
    if (screen !== 'play' || e.pointerType === 'mouse') return;
    gest = { id: e.pointerId, x0: e.clientX, y0: e.clientY, x: e.clientX, t0: performance.now(), moved: false, dropped: false };
    try { board.setPointerCapture(e.pointerId); } catch (err) { /* необязательно */ }
  });
  board.addEventListener('pointermove', function (e) {
    if (!gest || e.pointerId !== gest.id || !game) return;
    var step = renderer.cell * 0.9;
    var dx = e.clientX - gest.x;
    while (Math.abs(dx) >= step) {
      var d = dx > 0 ? 1 : -1;
      if (game.move(d)) TP.Sound.move();
      gest.x += d * step;
      dx = e.clientX - gest.x;
      gest.moved = true;
    }
    var dy = e.clientY - gest.y0;
    if (!gest.dropped && dy > renderer.cell * 2.5 && dy > Math.abs(e.clientX - gest.x0) * 1.5 &&
        performance.now() - gest.t0 < 320) {
      game.hardDrop();
      gest.dropped = true;
      gest.moved = true;
    }
  });
  board.addEventListener('pointerup', function (e) {
    if (!gest || e.pointerId !== gest.id) return;
    var dist = Math.hypot(e.clientX - gest.x0, e.clientY - gest.y0);
    if (!gest.moved && dist < 14 && performance.now() - gest.t0 < 350 && screen === 'play') {
      TP.Sound.init();
      if (game.rotate(1)) TP.Sound.rotate();
    }
    gest = null;
  });
  board.addEventListener('pointercancel', function () { gest = null; });

  // ---------- кнопки ----------

  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-go]');
    if (!b) return;
    TP.Sound.init();
    TP.Sound.click();
    go(b.dataset.go);
  });

  $('btnEndless').addEventListener('click', startEndless);
  $('btnLevels').addEventListener('click', function () { TP.Sound.init(); TP.Sound.click(); go('levels'); });
  $('menuSound').addEventListener('click', toggleSound);
  $('btnSound').addEventListener('click', function () { toggleSound(); this.blur(); });
  $('btnPause').addEventListener('click', function () { pause(); });
  $('btnResume').addEventListener('click', resume);
  $('btnRestart').addEventListener('click', restart);
  $('btnQuit').addEventListener('click', quit);
  $('btnBriefStart').addEventListener('click', function () { if (level) startLevel(level); });
  $('btnOverRetry').addEventListener('click', restart);
  $('btnOverExit').addEventListener('click', quit);
  $('btnWinRetry').addEventListener('click', restart);
  $('btnWinNext').addEventListener('click', function () {
    var idx = TP.LEVELS.indexOf(level);
    if (idx >= 0 && idx < TP.LEVELS.length - 1) openBrief(TP.LEVELS[idx + 1]);
  });

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) pause();
  });
  window.addEventListener('blur', function () { if (screen === 'play') pause(); });

  // ---------- размеры ----------

  var MOBILE = window.matchMedia('(max-width: 760px)');

  function fit() {
    if ($('game').hidden) return;
    var g = $('game');
    var well = $('well');
    var availH = well.clientHeight;
    var availW;
    if (MOBILE.matches) {
      availW = well.clientWidth;
    } else {
      var cs = getComputedStyle(g);
      var inner = g.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      var gap = parseFloat(cs.columnGap) || 0;
      availW = inner - $('hudMain').offsetWidth - $('hudSide').offsetWidth - gap * 2;
    }
    var cell = Math.floor(Math.min(availW / E.COLS, availH / E.ROWS));
    cell = Math.max(12, Math.min(46, cell));
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    if (cell !== renderer.cell || !renderer.sprites || dpr !== renderer.dpr) {
      renderer.resize(cell);
      renderer.resizeNext($('nextWrap').clientWidth);
    } else if ($('nextWrap').clientWidth !== renderer.nextW) {
      renderer.resizeNext($('nextWrap').clientWidth);
    }
  }

  if (window.ResizeObserver) new ResizeObserver(fit).observe($('game'));
  window.addEventListener('resize', function () {
    fit();
    if (!$('bg').hidden) attract.resize();
  });

  // ---------- цикл ----------

  var last = performance.now();
  function frame(now) {
    var dt = Math.min(50, Math.max(0, now - last));
    last = now;
    if (game && screen === 'play') {
      tickInput(dt);
      game.update(dt);
      handleEvents();
    }
    if (game && IN_GAME[screen]) {
      renderer.draw(game, now, screen === 'play' ? dt : 0);
      renderer.drawNext(game);
      updateHud();
    } else if (!$('bg').hidden) {
      attract.frame(dt);
    }
    requestAnimationFrame(frame);
  }

  // ---------- старт ----------

  function boot(data) {
    data = data || {};
    refreshMenu();
    buildLevelGrid();
    var restored = data.game ? TP.Game.fromJSON(data.game) : null;
    if (restored && restored.state === 'playing') {
      game = restored;
      mode = game.mode;
      level = game.level;
      hud = {};
      setupHud();
      show('play');
      pause();
    } else {
      show('menu');
    }
    requestAnimationFrame(function (t) { last = t; frame(t); });
  }

  // Сохраняем партию при обновлении страницы в просмотрщике Claude.
  var hot = window.claude && window.claude.hot;
  if (hot && typeof hot.snapshot === 'function') {
    try {
      hot.snapshot(function () {
        return { game: game && game.state === 'playing' ? game.toJSON() : null };
      });
    } catch (e) { /* не поддерживается */ }
  }
  if (hot && typeof hot.ready === 'function') hot.ready(boot);
  else boot((hot && hot.data) || {});

  TP.debug = { get game() { return game; }, get screen() { return screen; }, startLevel: startLevel, startEndless: startEndless, store: store };
})();
