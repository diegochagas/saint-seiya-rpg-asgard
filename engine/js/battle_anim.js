/* Battle animation playback (Battle/*.png sheets: 5 columns of 96x96 cells). */
var BattleAnim = {
  active: [],     /* {anim, frame, tick, x, y, target, done, screenFlash} */

  cellSize: function (anim) { return anim.large ? 128 : 96; },

  play: function (animId, x, y, opts) {
    var anim = DB.animation(animId);
    if (!anim) return null;
    var a = { anim: anim, frame: 0, tick: 0, x: x, y: y, done: false, img: Loader.image('battle', anim.animation_name), opts: opts || {} };
    this.active.push(a);
    this.fireTimings(a, 0);
    return a;
  },
  playOnMap: function (animId, target, global) {
    var anim = DB.animation(animId);
    if (!target || !anim) return;
    var sx = target.screenX() - GameMap.ox + 8, sy = target.screenY() - GameMap.oy;
    var pos = anim.position; /* 0 up, 1 middle, 2 down */
    var y = pos === 0 ? sy - 16 : pos === 1 ? sy : sy + 16;
    this.play(animId, sx, y, { map: true });
  },
  busy: function () { return this.active.length > 0; },
  frames: function (anim) { return Object.keys(anim.frames).length; },

  fireTimings: function (a, frameIdx) {
    var t = a.anim.timings;
    for (var k in t) {
      var tm = t[k];
      if (tm.frame === frameIdx) {
        if (tm.se && tm.se.name && tm.se.name !== '(OFF)') Audio_.playSe(tm.se);
        if (tm.flash_scope === 2) Screen.setFlash(tm.flash_red, tm.flash_green, tm.flash_blue, tm.flash_power, 1);
        else if (tm.flash_scope === 1 && a.opts.onFlash) a.opts.onFlash(tm);
        if (tm.screen_shake === 2) Screen.setShake(3, 5, 2);
      }
    }
  },

  update: function () {
    for (var i = this.active.length - 1; i >= 0; i--) {
      var a = this.active[i];
      a.tick++;
      if (a.tick % 2 === 0) {
        a.frame++;
        if (a.frame >= this.frames(a.anim)) { this.active.splice(i, 1); continue; }
        this.fireTimings(a, a.frame);
      }
    }
  },

  drawOne: function (ctx, a) {
    var keys = Object.keys(a.anim.frames).sort(function (x, y) { return x - y; });
    var fr = a.anim.frames[keys[a.frame]];
    if (!fr || !a.img) return;
    var cs = this.cellSize(a.anim);
    var cols = Math.floor(a.img.width / cs) || 5;
    for (var k in fr.cells) {
      var c = fr.cells[k];
      if (!c.valid) continue;
      var sx = (c.cell_id % cols) * cs, sy = Math.floor(c.cell_id / cols) * cs;
      var z = c.zoom / 100, w = cs * z, h = cs * z;
      ctx.save();
      ctx.globalAlpha = 1 - c.transparency / 100;
      ctx.drawImage(a.img, sx, sy, cs, cs, Math.round(a.x + c.x - w / 2), Math.round(a.y + c.y - h / 2), w, h);
      ctx.restore();
    }
  },
  drawMap: function (ctx) {
    for (var i = 0; i < this.active.length; i++) if (this.active[i].opts.map) this.drawOne(ctx, this.active[i]);
  },
  drawBattle: function (ctx) {
    for (var i = 0; i < this.active.length; i++) if (!this.active[i].opts.map) this.drawOne(ctx, this.active[i]);
  },
  clear: function () { this.active = []; },
};
