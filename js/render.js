/*
 * Тенепад — отрисовка поля, очереди, эффектов и фона меню на <canvas>.
 */
var TP = TP || {};

(function (TP) {
  'use strict';

  var E = TP.ENGINE;
  var DARK = [10, 6, 24];

  function hexToRgb(hex) {
    var n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function mix(hex, to, t) {
    var a = hexToRgb(hex);
    return 'rgb(' + Math.round(a[0] + (to[0] - a[0]) * t) + ',' +
      Math.round(a[1] + (to[1] - a[1]) * t) + ',' + Math.round(a[2] + (to[2] - a[2]) * t) + ')';
  }
  function lighten(hex, t) { return mix(hex, [255, 255, 255], t); }
  function darken(hex, t) { return mix(hex, DARK, t); }
  function rgba(hex, a) {
    var c = hexToRgb(hex);
    return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')';
  }
  function plural(n, one, few, many) {
    var m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return one;
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
    return many;
  }
  TP.plural = plural;

  function roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function makeCanvas(w, h) {
    var c = document.createElement('canvas');
    c.width = Math.max(1, w);
    c.height = Math.max(1, h);
    return c;
  }

  // ---------- спрайты клеток ----------

  function drawShard(ctx, s, color) {
    var p = Math.max(1, Math.round(s * 0.05));
    var r = s * 0.16;
    var g = ctx.createLinearGradient(0, 0, s, s);
    g.addColorStop(0, lighten(color, 0.3));
    g.addColorStop(0.55, color);
    g.addColorStop(1, darken(color, 0.35));
    ctx.fillStyle = g;
    roundRect(ctx, p, p, s - 2 * p, s - 2 * p, r);
    ctx.fill();
    ctx.save();
    roundRect(ctx, p, p, s - 2 * p, s - 2 * p, r);
    ctx.clip();
    ctx.fillStyle = 'rgba(255,255,255,0.26)';
    ctx.beginPath();
    ctx.moveTo(p, p);
    ctx.lineTo(s * 0.7, p);
    ctx.lineTo(p, s * 0.7);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(10,6,24,0.22)';
    ctx.beginPath();
    ctx.moveTo(s - p, s * 0.45);
    ctx.lineTo(s - p, s - p);
    ctx.lineTo(s * 0.45, s - p);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = rgba('#ffffff', 0.32);
    ctx.lineWidth = Math.max(1, s * 0.035);
    roundRect(ctx, p + 0.5, p + 0.5, s - 2 * p - 1, s - 2 * p - 1, r);
    ctx.stroke();
  }

  function drawShadowCell(ctx, s) {
    var p = Math.max(1, Math.round(s * 0.05));
    var r = s * 0.16;
    var g = ctx.createRadialGradient(s * 0.35, s * 0.3, s * 0.05, s * 0.5, s * 0.5, s * 0.8);
    g.addColorStop(0, '#2b2249');
    g.addColorStop(1, '#0b0816');
    ctx.fillStyle = g;
    roundRect(ctx, p, p, s - 2 * p, s - 2 * p, r);
    ctx.fill();
    ctx.lineWidth = Math.max(1, s * 0.05);
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(160,140,235,0.2)';
    ctx.beginPath();
    ctx.arc(s * 0.32, s * 0.7, s * 0.2, -Math.PI * 0.95, -Math.PI * 0.2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(s * 0.68, s * 0.36, s * 0.15, Math.PI * 0.15, Math.PI * 1.05);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(120,100,210,0.4)';
    ctx.lineWidth = Math.max(1, s * 0.035);
    roundRect(ctx, p + 0.5, p + 0.5, s - 2 * p - 1, s - 2 * p - 1, r);
    ctx.stroke();
  }

  function drawGem(ctx, s, light) {
    var cx = s / 2, cy = s / 2, rx = s * 0.19, ry = s * 0.27;
    ctx.save();
    ctx.shadowColor = light ? 'rgba(255,246,214,0.95)' : 'rgba(196,178,255,0.9)';
    ctx.shadowBlur = s * 0.35;
    ctx.fillStyle = light ? '#fffaf0' : '#d6ccff';
    ctx.beginPath();
    ctx.moveTo(cx, cy - ry);
    ctx.lineTo(cx + rx, cy);
    ctx.lineTo(cx, cy + ry);
    ctx.lineTo(cx - rx, cy);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = 'rgba(40,20,60,0.25)';
    ctx.lineWidth = Math.max(1, s * 0.03);
    ctx.beginPath();
    ctx.moveTo(cx - rx, cy);
    ctx.lineTo(cx + rx, cy);
    ctx.moveTo(cx, cy - ry);
    ctx.lineTo(cx, cy + ry);
    ctx.stroke();
  }

  function drawGhost(ctx, s, color) {
    var p = Math.max(1, Math.round(s * 0.08));
    var r = s * 0.16;
    ctx.fillStyle = rgba(color, 0.08);
    roundRect(ctx, p, p, s - 2 * p, s - 2 * p, r);
    ctx.fill();
    ctx.strokeStyle = rgba(color, 0.55);
    ctx.lineWidth = Math.max(1, s * 0.06);
    ctx.setLineDash([s * 0.18, s * 0.1]);
    ctx.stroke();
  }

  function buildSprites(S) {
    var sp = {};
    TP.COLORS.forEach(function (color, i) {
      var n = makeCanvas(S, S);
      drawShard(n.getContext('2d'), S, color);
      sp['n' + i] = n;
      var c = makeCanvas(S, S);
      var cctx = c.getContext('2d');
      drawShard(cctx, S, color);
      drawGem(cctx, S, true);
      sp['c' + i] = c;
      var g = makeCanvas(S, S);
      drawGhost(g.getContext('2d'), S, color);
      sp['g' + i] = g;
    });
    var s = makeCanvas(S, S);
    drawShadowCell(s.getContext('2d'), S);
    sp.s = s;
    var sc = makeCanvas(S, S);
    var scx = sc.getContext('2d');
    drawShadowCell(scx, S);
    drawGem(scx, S, false);
    sp.sc = sc;
    var glow = makeCanvas(S * 2, S * 2);
    var gx = glow.getContext('2d');
    var rg = gx.createRadialGradient(S, S, 0, S, S, S);
    rg.addColorStop(0, 'rgba(255,240,200,0.55)');
    rg.addColorStop(1, 'rgba(255,240,200,0)');
    gx.fillStyle = rg;
    gx.fillRect(0, 0, S * 2, S * 2);
    sp.glow = glow;
    return sp;
  }

  function spriteKey(cell) {
    if (cell.col < 0) return cell.k === 'c' ? 'sc' : 's';
    return (cell.k === 'c' ? 'c' : 'n') + cell.col;
  }

  function buildBackground(W, H, cs) {
    var c = makeCanvas(W, H);
    var ctx = c.getContext('2d');
    var g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#1d1739');
    g.addColorStop(0.55, '#130f27');
    g.addColorStop(1, '#0a0815');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    var lg = ctx.createRadialGradient(W / 2, -H * 0.05, 0, W / 2, -H * 0.05, H * 0.55);
    lg.addColorStop(0, 'rgba(246,184,92,0.16)');
    lg.addColorStop(1, 'rgba(246,184,92,0)');
    ctx.fillStyle = lg;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(220,210,255,0.07)';
    var d = Math.max(1, Math.round(cs * 0.06));
    for (var y = 1; y < E.ROWS; y++) {
      for (var x = 1; x < E.COLS; x++) {
        ctx.fillRect(x * cs - d / 2, y * cs - d / 2, d, d);
      }
    }
    return c;
  }

  // ---------- рендер поля ----------

  class Renderer {
    constructor(board, next) {
      this.board = board;
      this.ctx = board.getContext('2d');
      this.next = next;
      this.nctx = next ? next.getContext('2d') : null;
      this.cell = 24;
      this.dpr = 1;
      this.sprites = null;
      this.bg = null;
      this.particles = [];
      this.floaters = [];
      this.shake = 0;
      this.flashA = 0;
      this.wave = 0;
      this.nextKey = '';
      this.nextW = 0;
      this.nextH = 0;
      this.nextCell = 16;
      this.reduced = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    }

    resize(cell) {
      this.cell = cell;
      this.dpr = Math.min(2, window.devicePixelRatio || 1);
      var W = cell * E.COLS, H = cell * E.ROWS;
      this.board.width = Math.round(W * this.dpr);
      this.board.height = Math.round(H * this.dpr);
      this.board.style.width = W + 'px';
      this.board.style.height = H + 'px';
      this.sprites = buildSprites(Math.max(4, Math.round(cell * this.dpr)));
      this.bg = buildBackground(this.board.width, this.board.height, cell * this.dpr);
      this.nextKey = '';
    }

    resizeNext(w) {
      if (!this.next) return;
      var cs = Math.max(8, Math.min(22, Math.floor((w - 8) / 5)));
      var slot = Math.round(cs * 3.6);
      this.nextCell = cs;
      this.nextW = w;
      this.nextH = slot * 3;
      this.next.width = Math.round(w * this.dpr);
      this.next.height = Math.round(this.nextH * this.dpr);
      this.next.style.width = w + 'px';
      this.next.style.height = this.nextH + 'px';
      this.nextKey = '';
    }

    reset() {
      this.particles.length = 0;
      this.floaters.length = 0;
      this.shake = 0;
      this.flashA = 0;
      this.wave = 0;
      this.nextKey = '';
    }

    floater(text, row, opts) {
      opts = opts || {};
      this.floaters.push({
        text: text,
        x: this.cell * E.COLS / 2,
        y: (row + 0.5) * this.cell,
        life: opts.life || 1100,
        max: opts.life || 1100,
        size: opts.size || Math.max(12, this.cell * 0.62),
        color: opts.color || '#f6b85c'
      });
    }

    onEvent(ev, game) {
      var cs = this.cell, hid = game.hidden;
      if (ev.type === 'clear') {
        var budget = Math.max(0, 260 - this.particles.length);
        var per = Math.max(1, Math.min(3, Math.floor(budget / Math.max(1, ev.removed.length))));
        for (var i = 0; i < ev.removed.length && budget > 0; i++) {
          var rm = ev.removed[i];
          if (rm.r < hid) continue;
          var color = rm.col < 0 ? '#5d4d9a' : TP.COLORS[rm.col];
          for (var k = 0; k < per && budget > 0; k++, budget--) {
            var ang = Math.random() * Math.PI * 2;
            var sp = 60 + Math.random() * 220;
            this.particles.push({
              x: (rm.c + 0.5) * cs, y: (rm.r - hid + 0.5) * cs,
              vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp - 120,
              rot: Math.random() * 6, vr: (Math.random() - 0.5) * 10,
              size: cs * (0.18 + Math.random() * 0.22),
              life: 650 + Math.random() * 450, max: 1100, color: color
            });
          }
        }
        var vis = ev.rows.filter(function (r) { return r >= hid; });
        var midRow = vis.length ? vis.reduce(function (s, r) { return s + r; }, 0) / vis.length - hid : E.ROWS / 2;
        if (ev.points > 0) this.floater('+' + ev.points, midRow, { size: Math.max(14, cs * 0.75) });
        var label = '';
        if (ev.flash) label = 'Вспышка';
        else if (ev.chain > 0) label = 'Цепь ×' + (ev.chain + 1);
        else if (ev.beams.length > 1) label = ev.beams.length + ' ' + plural(ev.beams.length, 'луч', 'луча', 'лучей');
        else if (ev.beams.length === 1) label = 'Луч';
        else if (ev.n >= 3) label = ev.n + ' ' + plural(ev.n, 'линия', 'линии', 'линий');
        if (label) this.floater(label, midRow - 1.1, { color: '#fff3d6', size: Math.max(11, cs * 0.5) });
        if (ev.combo > 0) this.floater('Серия ×' + (ev.combo + 1), midRow + 1.1, { color: '#ab9cf2', size: Math.max(10, cs * 0.45) });
        if (ev.n >= 3 || ev.chain > 0) this.shake = Math.max(this.shake, 0.6);
      } else if (ev.type === 'rise') {
        this.shake = Math.max(this.shake, 0.8);
        this.wave = 1;
      } else if (ev.type === 'flash') {
        this.flashA = 1;
      } else if (ev.type === 'depth') {
        this.floater('Глубина ' + ev.depth, E.ROWS * 0.35, { size: Math.max(16, cs * 0.95), life: 1700, color: '#fff3d6' });
      } else if (ev.type === 'drop' && ev.dist > 3) {
        this.shake = Math.max(this.shake, 0.25);
      }
    }

    step(dt) {
      var s = dt / 1000;
      for (var i = this.particles.length - 1; i >= 0; i--) {
        var p = this.particles[i];
        p.life -= dt;
        if (p.life <= 0) { this.particles.splice(i, 1); continue; }
        p.vy += 700 * s;
        p.x += p.vx * s;
        p.y += p.vy * s;
        p.rot += p.vr * s;
      }
      for (var j = this.floaters.length - 1; j >= 0; j--) {
        this.floaters[j].life -= dt;
        if (this.floaters[j].life <= 0) this.floaters.splice(j, 1);
      }
      this.shake = Math.max(0, this.shake - dt / 260);
      this.flashA = Math.max(0, this.flashA - dt / 450);
      this.wave = Math.max(0, this.wave - dt / 700);
    }

    draw(game, now, dt) {
      if (!this.sprites) return;
      this.step(dt);
      var ctx = this.ctx, cs = this.cell, W = cs * E.COLS, H = cs * E.ROWS;
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      ctx.save();
      if (this.shake > 0.01 && !this.reduced) {
        ctx.translate((Math.random() - 0.5) * this.shake * cs * 0.25, (Math.random() - 0.5) * this.shake * cs * 0.25);
      }
      ctx.drawImage(this.bg, 0, 0, W, H);
      if (game) this.drawGame(game, now);
      this.drawFx(ctx, W, H);
      ctx.restore();
    }

    drawGame(game, now) {
      var ctx = this.ctx, cs = this.cell, sp = this.sprites;
      var hid = game.hidden, grid = game.grid, W = cs * E.COLS, H = cs * E.ROWS;
      var cl = game.clearing;
      var p = cl ? 1 - Math.max(0, cl.t) / cl.dur : 0;
      var rowSet = cl ? new Set(cl.rows) : null;
      var colSet = cl ? new Set(cl.cols) : null;

      // опасность: стопка у самого верха
      var top = E.ROWS;
      for (var r0 = hid; r0 < game.H; r0++) {
        if (grid[r0].some(Boolean)) { top = r0 - hid; break; }
      }
      if (top < 5 && game.state === 'playing') {
        var pulse = 0.55 + 0.45 * Math.sin(now / 220);
        var dg = ctx.createLinearGradient(0, 0, 0, cs * 5);
        dg.addColorStop(0, 'rgba(239,143,125,' + (0.22 * pulse) + ')');
        dg.addColorStop(1, 'rgba(239,143,125,0)');
        ctx.fillStyle = dg;
        ctx.fillRect(0, 0, W, cs * 5);
      }

      // предупреждение о приливе
      var riseSoon = game.state === 'playing' &&
        (game.riseLeft === 1 || (game.riseMs() > 0 && game.riseTimer < 1600));
      if (riseSoon) {
        var a = 0.25 + 0.2 * Math.sin(now / 120);
        var rg = ctx.createLinearGradient(0, H, 0, H - cs * 3);
        rg.addColorStop(0, 'rgba(120,90,220,' + a + ')');
        rg.addColorStop(1, 'rgba(120,90,220,0)');
        ctx.fillStyle = rg;
        ctx.fillRect(0, H - cs * 3, W, cs * 3);
      }

      for (var r = hid; r < game.H; r++) {
        var row = grid[r];
        var y = (r - hid) * cs;
        for (var c = 0; c < game.cols; c++) {
          var cell = row[c];
          if (!cell) continue;
          var x = c * cs;
          var img = sp[spriteKey(cell)];
          if (cl && (rowSet.has(r) || colSet.has(c))) {
            var k = p < 0.3 ? 1 : Math.max(0, 1 - (p - 0.3) / 0.7);
            var s = cs * k;
            ctx.globalAlpha = k;
            ctx.drawImage(img, x + (cs - s) / 2, y + (cs - s) / 2, s, s);
            ctx.globalAlpha = Math.min(1, p / 0.3) * k * 0.85;
            ctx.fillStyle = '#fff6e0';
            roundRect(ctx, x + (cs - s) / 2 + 1, y + (cs - s) / 2 + 1, Math.max(0, s - 2), Math.max(0, s - 2), cs * 0.16);
            ctx.fill();
            ctx.globalAlpha = 1;
          } else {
            ctx.drawImage(img, x, y, cs, cs);
            if (cell.k === 'c') {
              ctx.globalCompositeOperation = 'lighter';
              ctx.globalAlpha = 0.35 + 0.25 * Math.sin(now / 280 + r * 0.9 + c * 1.7);
              ctx.drawImage(sp.glow, x - cs * 0.5, y - cs * 0.5, cs * 2, cs * 2);
              ctx.globalAlpha = 1;
              ctx.globalCompositeOperation = 'source-over';
            }
          }
        }
      }

      var act = game.active;
      if (act && game.state === 'playing') {
        var gy = game.ghostY();
        if (gy !== act.y) {
          for (var i = 0; i < act.cells.length; i++) {
            var ry = gy + act.cells[i][1];
            if (ry < hid) continue;
            ctx.drawImage(sp['g' + act.color], (act.x + act.cells[i][0]) * cs, (ry - hid) * cs, cs, cs);
          }
        }
        var grounded = game.grounded();
        var fade = grounded ? 0.75 + 0.25 * Math.cos(game.lockTimer / 70) : 1;
        ctx.globalAlpha = fade;
        for (var j = 0; j < act.cells.length; j++) {
          var ay = act.y + act.cells[j][1];
          if (ay < hid) continue;
          var key = (j === act.crystal ? 'c' : 'n') + act.color;
          ctx.drawImage(sp[key], (act.x + act.cells[j][0]) * cs, (ay - hid) * cs, cs, cs);
        }
        ctx.globalAlpha = 1;
      }

      if (cl && cl.beams.length) {
        var ba = p < 0.15 ? p / 0.15 : Math.max(0, 1 - (p - 0.15) / 0.85);
        ctx.globalCompositeOperation = 'lighter';
        for (var b = 0; b < cl.beams.length; b++) {
          var bm = cl.beams[b];
          var wdt = cs * (0.8 + 0.7 * (1 - p));
          var g;
          if (bm.dir === 'v') {
            var cx = (bm.col + 0.5) * cs;
            g = ctx.createLinearGradient(cx - wdt, 0, cx + wdt, 0);
            g.addColorStop(0, 'rgba(255,236,190,0)');
            g.addColorStop(0.5, 'rgba(255,236,190,' + (0.85 * ba) + ')');
            g.addColorStop(1, 'rgba(255,236,190,0)');
            ctx.fillStyle = g;
            ctx.fillRect(cx - wdt, 0, wdt * 2, H);
            ctx.fillStyle = 'rgba(255,255,255,' + ba + ')';
            ctx.fillRect(cx - cs * 0.07, 0, cs * 0.14, H);
          } else {
            if (bm.row < hid) continue;
            var cy = (bm.row - hid + 0.5) * cs;
            g = ctx.createLinearGradient(0, cy - wdt, 0, cy + wdt);
            g.addColorStop(0, 'rgba(200,180,255,0)');
            g.addColorStop(0.5, 'rgba(220,205,255,' + (0.85 * ba) + ')');
            g.addColorStop(1, 'rgba(200,180,255,0)');
            ctx.fillStyle = g;
            ctx.fillRect(0, cy - wdt, W, wdt * 2);
            ctx.fillStyle = 'rgba(255,255,255,' + ba + ')';
            ctx.fillRect(0, cy - cs * 0.07, W, cs * 0.14);
          }
        }
        ctx.globalCompositeOperation = 'source-over';
      }
    }

    drawFx(ctx, W, H) {
      for (var i = 0; i < this.particles.length; i++) {
        var p = this.particles[i];
        ctx.save();
        ctx.globalAlpha = Math.max(0, Math.min(1, p.life / 500));
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.moveTo(0, -p.size);
        ctx.lineTo(p.size * 0.8, p.size * 0.6);
        ctx.lineTo(-p.size * 0.6, p.size * 0.5);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
      if (this.wave > 0) {
        var wg = ctx.createLinearGradient(0, H, 0, H - this.cell * 6);
        wg.addColorStop(0, 'rgba(5,3,12,' + (0.65 * this.wave) + ')');
        wg.addColorStop(1, 'rgba(5,3,12,0)');
        ctx.fillStyle = wg;
        ctx.fillRect(0, H - this.cell * 6, W, this.cell * 6);
      }
      if (this.flashA > 0) {
        ctx.fillStyle = 'rgba(255,242,214,' + (0.75 * this.flashA) + ')';
        ctx.fillRect(0, 0, W, H);
      }
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (var j = 0; j < this.floaters.length; j++) {
        var f = this.floaters[j];
        var t = 1 - f.life / f.max;
        ctx.globalAlpha = t < 0.6 ? 1 : Math.max(0, 1 - (t - 0.6) / 0.4);
        ctx.font = '700 ' + Math.round(f.size) + 'px Unbounded, "Arial Black", sans-serif';
        ctx.lineWidth = Math.max(2, f.size * 0.18);
        ctx.strokeStyle = 'rgba(10,6,24,0.85)';
        var fy = f.y - t * this.cell * 1.4;
        ctx.strokeText(f.text, f.x, fy);
        ctx.fillStyle = f.color;
        ctx.fillText(f.text, f.x, fy);
      }
      ctx.globalAlpha = 1;
    }

    drawNext(game) {
      if (!this.nctx || !this.sprites || !this.nextW) return;
      var key = game ? game.queue.map(function (q) { return q.id + ':' + q.crystal; }).join('|') : '-';
      if (key === this.nextKey) return;
      this.nextKey = key;
      var ctx = this.nctx;
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      ctx.clearRect(0, 0, this.nextW, this.nextH);
      if (!game) return;
      var slot = this.nextH / 3;
      var sp = this.sprites;
      var W = this.nextW;
      var base = this.nextCell;
      game.queue.slice(0, 3).forEach(function (item, i) {
        var sh = TP.SHAPES[item.id];
        var b = TP.bounds(sh.cells);
        var s = i === 0 ? base : base * 0.78;
        var ox = (W - b.w * s) / 2;
        var oy = i * slot + (slot - b.h * s) / 2;
        ctx.globalAlpha = i === 0 ? 1 : 0.55;
        sh.cells.forEach(function (c, j) {
          var k = (j === item.crystal ? 'c' : 'n') + sh.color;
          ctx.drawImage(sp[k], ox + c[0] * s, oy + c[1] * s, s, s);
        });
      });
      ctx.globalAlpha = 1;
    }
  }

  // ---------- фон меню: медленный дождь осколков ----------

  class Attract {
    constructor(canvas) {
      this.c = canvas;
      this.ctx = canvas.getContext('2d');
      this.items = [];
      this.sprites = null;
      this.size = 26;
      this.w = 0;
      this.h = 0;
      this.dpr = 1;
      this.reduced = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    }

    resize() {
      this.dpr = Math.min(2, window.devicePixelRatio || 1);
      this.w = window.innerWidth;
      this.h = window.innerHeight;
      this.c.width = Math.round(this.w * this.dpr);
      this.c.height = Math.round(this.h * this.dpr);
      this.size = Math.max(18, Math.min(30, Math.round(this.w / 28)));
      this.sprites = buildSprites(Math.round(this.size * this.dpr));
      var want = Math.round(Math.min(26, Math.max(10, this.w * this.h / 52000)));
      while (this.items.length < want) this.items.push(this.spawn(true));
      if (this.items.length > want) this.items.length = want;
      this.frame(0);
    }

    spawn(initial) {
      var id = TP.SHAPE_IDS[Math.floor(Math.random() * TP.SHAPE_IDS.length)];
      var n = TP.SHAPES[id].cells.length;
      return {
        id: id,
        crystal: Math.random() < 0.25 ? Math.floor(Math.random() * n) : -1,
        x: Math.random() * this.w,
        y: initial ? Math.random() * this.h : -this.size * 4,
        vy: 14 + Math.random() * 26,
        rot: Math.random() * Math.PI * 2,
        vr: (Math.random() - 0.5) * 0.25,
        scale: 0.6 + Math.random() * 0.8,
        alpha: 0.18 + Math.random() * 0.32
      };
    }

    frame(dt) {
      if (!this.sprites) return;
      var ctx = this.ctx, s = this.size;
      var move = this.reduced ? 0 : dt / 1000;
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      ctx.clearRect(0, 0, this.w, this.h);
      for (var i = 0; i < this.items.length; i++) {
        var it = this.items[i];
        it.y += it.vy * move;
        it.rot += it.vr * move;
        if (it.y > this.h + s * 4) this.items[i] = it = this.spawn(false);
        var sh = TP.SHAPES[it.id];
        var b = TP.bounds(sh.cells);
        var cs = s * it.scale;
        ctx.save();
        ctx.globalAlpha = it.alpha;
        ctx.translate(it.x, it.y);
        ctx.rotate(it.rot);
        for (var j = 0; j < sh.cells.length; j++) {
          var k = (j === it.crystal ? 'c' : 'n') + sh.color;
          ctx.drawImage(this.sprites[k], (sh.cells[j][0] - b.w / 2) * cs, (sh.cells[j][1] - b.h / 2) * cs, cs, cs);
        }
        ctx.restore();
      }
    }
  }

  TP.Renderer = Renderer;
  TP.Attract = Attract;
})(TP);
