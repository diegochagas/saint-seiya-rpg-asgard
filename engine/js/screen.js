/* Screen effects (tint, flash, shake, weather), pictures and screen transitions. */

/* RPG Maker transition list: 19 = instantaneous, 20 = none (screen not erased); the others are
   drawn as a fade here. Indexes into GameState.transitions: */
var TRANSITION = { TELEPORT_OUT: 0, TELEPORT_IN: 1, BATTLE_START_OUT: 2, BATTLE_START_IN: 3, BATTLE_END_OUT: 4,
  BATTLE_END_IN: 5, INSTANT: 19, NONE: 20 };
var TRANSITION_FADE_FRAMES = 12;

var Screen = {
  tint: { r: 100, g: 100, b: 100, s: 100 },
  tintTarget: null,     /* {r,g,b,s,frames,t,from} */
  flash: null,          /* {r,g,b,power,frames,t} */
  shake: null,          /* {strength, speed, frames, t, offset} */
  weather: { type: 0, strength: 0, particles: [] },
  fade: 1,              /* 1 = visible, 0 = black */
  fadeTarget: null,     /* {to, frames, t, from} */
  erased: false,
  shakeOffset: 0,

  reset: function () {
    this.tint = { r: 100, g: 100, b: 100, s: 100 };
    this.tintTarget = null; this.flash = null; this.shake = null;
    this.weather = { type: 0, strength: 0, particles: [] };
    this.fade = 1; this.fadeTarget = null; this.erased = false;
  },
  setTint: function (r, g, b, s, tenths) {
    var frames = Math.round(tenths * 6);
    if (frames <= 0) { this.tint = { r: r, g: g, b: b, s: s }; this.tintTarget = null; return; }
    this.tintTarget = { r: r, g: g, b: b, s: s, frames: frames, t: 0, from: Object.assign({}, this.tint) };
  },
  tintBusy: function () { return !!this.tintTarget; },
  setFlash: function (r, g, b, power, tenths) {
    this.flash = { r: r, g: g, b: b, power: power, frames: Math.max(1, Math.round(tenths * 6)), t: 0 };
  },
  flashBusy: function () { return !!this.flash; },
  setShake: function (strength, speed, tenths) {
    this.shake = { strength: strength, speed: speed, frames: Math.round(tenths * 6), t: 0 };
  },
  shakeBusy: function () { return !!this.shake; },
  setWeather: function (type, strength) {
    this.weather = { type: type, strength: strength, particles: [] };
  },
  fadeOut: function (frames) { this.fadeTarget = { to: 0, frames: frames || 20, t: 0, from: this.fade }; },
  fadeIn: function (frames) { this.fadeTarget = { to: 1, frames: frames || 20, t: 0, from: this.fade }; },
  fadeBusy: function () { return !!this.fadeTarget; },
  /** @param {number} type RPG Maker transition id @returns {number} fade length in frames */
  transitionFrames: function (type) { return type >= TRANSITION.INSTANT ? 1 : TRANSITION_FADE_FRAMES; },

  update: function () {
    var tt = this.tintTarget;
    if (tt) {
      tt.t++;
      var r = Math.min(1, tt.t / tt.frames);
      this.tint = { r: tt.from.r + (tt.r - tt.from.r) * r, g: tt.from.g + (tt.g - tt.from.g) * r, b: tt.from.b + (tt.b - tt.from.b) * r, s: tt.from.s + (tt.s - tt.from.s) * r };
      if (r >= 1) this.tintTarget = null;
    }
    if (this.flash) { this.flash.t++; if (this.flash.t >= this.flash.frames) this.flash = null; }
    if (this.shake) {
      var sh = this.shake;
      sh.t++;
      var amp = sh.strength * 2;
      this.shakeOffset = Math.round(Math.sin(sh.t * sh.speed * 0.6) * amp);
      if (sh.t >= sh.frames) { this.shake = null; this.shakeOffset = 0; }
    }
    var ft = this.fadeTarget;
    if (ft) {
      ft.t++;
      var fr = Math.min(1, ft.t / ft.frames);
      this.fade = ft.from + (ft.to - ft.from) * fr;
      if (fr >= 1) this.fadeTarget = null;
    }
    this.updateWeather();
  },
  updateWeather: function () {
    var w = this.weather;
    if (!w.type) { w.particles = []; return; }
    var count = [0, 30, 60, 100][Math.min(3, w.strength + 1)];
    while (w.particles.length < count) {
      w.particles.push({ x: Math.random() * CONFIG.SCREEN_W, y: Math.random() * CONFIG.SCREEN_H, v: 1 + Math.random() * 2, d: Math.random() * 6.28 });
    }
    for (var i = 0; i < w.particles.length; i++) {
      var p = w.particles[i];
      if (w.type === 1) { p.y += 6 + p.v * 2; p.x -= 2; }
      else { p.y += 0.5 + p.v * 0.5; p.d += 0.05; p.x += Math.sin(p.d) * 0.5; }
      if (p.y > CONFIG.SCREEN_H) { p.y = -4; p.x = Math.random() * CONFIG.SCREEN_W; }
      if (p.x < -4) p.x = CONFIG.SCREEN_W;
    }
  },

  /* apply effects over the finished frame canvas onto main ctx */
  compose: function (ctx, frame) {
    var t = this.tint;
    var hasTint = Math.round(t.r) !== 100 || Math.round(t.g) !== 100 || Math.round(t.b) !== 100 || Math.round(t.s) !== 100;
    ctx.save();
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, CONFIG.SCREEN_W, CONFIG.SCREEN_H);
    if (hasTint && Math.round(t.s) !== 100) {
      try { ctx.filter = 'saturate(' + Math.max(0, t.s) + '%)'; } catch (e) {}
    }
    ctx.drawImage(frame, this.shakeOffset, 0);
    ctx.filter = 'none';
    if (hasTint) {
      /* multiply for darkening, screen for brightening per channel */
      var mr = Math.min(100, t.r) / 100, mg = Math.min(100, t.g) / 100, mb = Math.min(100, t.b) / 100;
      if (mr < 1 || mg < 1 || mb < 1) {
        ctx.globalCompositeOperation = 'multiply';
        ctx.fillStyle = 'rgb(' + Math.round(mr * 255) + ',' + Math.round(mg * 255) + ',' + Math.round(mb * 255) + ')';
        ctx.fillRect(0, 0, CONFIG.SCREEN_W, CONFIG.SCREEN_H);
      }
      var lr = Math.max(0, t.r - 100) / 100, lg = Math.max(0, t.g - 100) / 100, lb = Math.max(0, t.b - 100) / 100;
      if (lr > 0 || lg > 0 || lb > 0) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = 'rgb(' + Math.round(lr * 255) + ',' + Math.round(lg * 255) + ',' + Math.round(lb * 255) + ')';
        ctx.fillRect(0, 0, CONFIG.SCREEN_W, CONFIG.SCREEN_H);
      }
      ctx.globalCompositeOperation = 'source-over';
    }
    var w = this.weather;
    if (w.type) {
      ctx.fillStyle = w.type === 1 ? 'rgba(200,220,255,0.7)' : 'rgba(255,255,255,0.9)';
      for (var i = 0; i < w.particles.length; i++) {
        var p = w.particles[i];
        if (w.type === 1) ctx.fillRect(Math.round(p.x), Math.round(p.y), 1, 6);
        else ctx.fillRect(Math.round(p.x), Math.round(p.y), 2, 2);
      }
    }
    if (this.flash) {
      var f = this.flash, a = (1 - f.t / f.frames) * (f.power / 31);
      ctx.fillStyle = 'rgba(' + Math.min(255, f.r * 8) + ',' + Math.min(255, f.g * 8) + ',' + Math.min(255, f.b * 8) + ',' + a + ')';
      ctx.fillRect(0, 0, CONFIG.SCREEN_W, CONFIG.SCREEN_H);
    }
    if (this.fade < 1) {
      ctx.fillStyle = 'rgba(0,0,0,' + (1 - this.fade) + ')';
      ctx.fillRect(0, 0, CONFIG.SCREEN_W, CONFIG.SCREEN_H);
    }
    ctx.restore();
  },

  serialize: function () { return { tint: this.tint, weather: { type: this.weather.type, strength: this.weather.strength } }; },
  restore: function (s) {
    this.reset();
    if (s) { this.tint = s.tint || this.tint; this.setWeather(s.weather.type, s.weather.strength); }
  },
};

/* --------------------------------------------------------------------------- */

var Pictures = {
  list: {},
  clear: function () { this.list = {}; },
  show: function (id, p) {
    this.list[id] = { name: p.name, x: p.x, y: p.y, fixed: p.fixed, mag: p.mag, trans: p.trans, r: p.r, g: p.g, b: p.b, s: p.s, effect: p.effect, power: p.power, move: null, t: 0 };
  },
  move: function (id, p, frames) {
    var pic = this.list[id];
    if (!pic) return;
    pic.move = { from: { x: pic.x, y: pic.y, mag: pic.mag, trans: pic.trans }, to: { x: p.x, y: p.y, mag: p.mag, trans: p.trans }, frames: Math.max(1, frames), t: 0 };
    pic.effect = p.effect; pic.power = p.power;
  },
  erase: function (id) { delete this.list[id]; },
  busy: function (id) { var p = this.list[id]; return !!(p && p.move); },
  update: function () {
    for (var id in this.list) {
      var pic = this.list[id];
      pic.t++;
      if (pic.move) {
        var m = pic.move; m.t++;
        var r = Math.min(1, m.t / m.frames);
        pic.x = m.from.x + (m.to.x - m.from.x) * r; pic.y = m.from.y + (m.to.y - m.from.y) * r;
        pic.mag = m.from.mag + (m.to.mag - m.from.mag) * r; pic.trans = m.from.trans + (m.to.trans - m.from.trans) * r;
        if (r >= 1) pic.move = null;
      }
    }
  },
  draw: function (ctx) {
    var ids = Object.keys(this.list).map(Number).sort(function (a, b) { return a - b; });
    for (var i = 0; i < ids.length; i++) {
      var pic = this.list[ids[i]];
      var img = Loader.image('picture', pic.name);
      if (!img) continue;
      var w = img.width * pic.mag / 100, h = img.height * pic.mag / 100;
      var x = pic.x, y = pic.y;
      if (pic.fixed) { x -= GameMap.ox; y -= GameMap.oy; }
      ctx.save();
      ctx.globalAlpha = 1 - pic.trans / 100;
      if (pic.effect === 1) { ctx.translate(x, y); ctx.rotate(pic.t * pic.power / 100); ctx.translate(-x, -y); }
      var dy = pic.effect === 2 ? Math.sin(pic.t / 10) * pic.power / 10 : 0;
      ctx.drawImage(img, Math.round(x - w / 2), Math.round(y - h / 2 + dy), w, h);
      ctx.restore();
    }
  },
  serialize: function () { return this.list; },
  restore: function (s) { this.list = s || {}; },
};
