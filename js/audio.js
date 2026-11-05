/*
 * Тенепад — звуки, синтезированные на лету через Web Audio (без файлов).
 */
var TP = TP || {};

(function (TP) {
  'use strict';

  var ctx = null;
  var master = null;
  var enabled = true;
  // Пентатоника — ноты для собранных линий и цепочек.
  var SCALE = [392.0, 440.0, 523.25, 587.33, 659.25, 783.99, 880.0, 1046.5, 1174.66, 1318.51];

  function init() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return;
    }
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.32;
      master.connect(ctx.destination);
    } catch (e) {
      ctx = null;
    }
  }

  function ready() { return enabled && ctx && ctx.state === 'running'; }

  function tone(freq, dur, type, vol, delay, slideTo) {
    if (!ready()) return;
    var t = ctx.currentTime + (delay || 0);
    var o = ctx.createOscillator();
    var g = ctx.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol || 0.1, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  var noiseBuf = null;
  function noise(dur, vol, freq, delay, q) {
    if (!ready()) return;
    if (!noiseBuf) {
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      var d = noiseBuf.getChannelData(0);
      for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    var t = ctx.currentTime + (delay || 0);
    var src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    var f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = freq || 800;
    f.Q.value = q || 0.8;
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol || 0.1, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(master);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  TP.Sound = {
    init: init,
    setEnabled: function (on) { enabled = !!on; },
    isEnabled: function () { return enabled; },
    move: function () { tone(330, 0.035, 'triangle', 0.035); },
    rotate: function () { tone(587, 0.06, 'triangle', 0.06); },
    mirror: function () { tone(440, 0.09, 'sine', 0.07, 0, 880); },
    lock: function () { tone(150, 0.09, 'sine', 0.14, 0, 90); },
    drop: function () { noise(0.12, 0.12, 300, 0, 1.2); tone(110, 0.12, 'sine', 0.16, 0, 60); },
    clear: function (n, chain) {
      var steps = Math.min(SCALE.length, 2 + n + chain * 2);
      for (var i = 0; i < steps; i++) tone(SCALE[i], 0.22, 'triangle', 0.07, i * 0.045);
    },
    beam: function (count) {
      for (var i = 0; i < Math.min(4, count); i++) tone(900 + i * 220, 0.35, 'sine', 0.05, 0.05 + i * 0.07, 2200 + i * 300);
    },
    rise: function () { tone(70, 0.5, 'sawtooth', 0.06, 0, 45); noise(0.45, 0.08, 160, 0, 0.7); },
    flash: function () { noise(0.5, 0.12, 2400, 0, 0.5); tone(523.25, 0.5, 'sine', 0.06); tone(783.99, 0.5, 'sine', 0.05, 0.03); },
    depth: function () { tone(523.25, 0.18, 'triangle', 0.07); tone(783.99, 0.3, 'triangle', 0.07, 0.12); },
    over: function () { [392, 330, 262, 196].forEach(function (f, i) { tone(f, 0.32, 'triangle', 0.08, i * 0.16); }); },
    win: function () { [523.25, 659.25, 783.99, 1046.5].forEach(function (f, i) { tone(f, 0.3, 'triangle', 0.08, i * 0.1); }); },
    click: function () { tone(660, 0.04, 'triangle', 0.04); }
  };
})(TP);
