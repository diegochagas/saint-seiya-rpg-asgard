/* Map: setup, passability, events, scrolling, drawing and save state.
   Tile layers/autotiles are in map_tiles.js, GameEvent and Player in map_event.js. */

/* --------------------------------------------------------------------------- */

var GameMap = {
  id: 0,
  data: null,
  info: null,
  width: 0, height: 0,
  chipsetId: 0,
  chipset: null,
  chipsetImg: null,
  events: [],
  lowerCanvas: [],     /* animation frames */
  upperCanvas: null,
  frame: 0,
  animStep: 0,
  ox: 0, oy: 0,        /* camera (px) */
  pan: { x: 0, y: 0, locked: false, tx: 0, ty: 0, speed: 0, waiting: false },
  parallax: null,
  parallaxOx: 0, parallaxOy: 0,
  interpreter: null,   /* main map interpreter */
  commonParallel: [],
  freezeEvents: false,
  encounterStepsOverride: -1,
  substitutionsLower: null,
  substitutionsUpper: null,

  encounterSteps: function () {
    if (this.encounterStepsOverride >= 0) return this.encounterStepsOverride;
    return this.info ? this.info.encounter_steps : 0;
  },
  eventsFrozen: function () { return this.freezeEvents; },

  /* inherited map properties (music / background / encounters walk up the tree) */
  resolveInfo: function (id, field, typeField, parentValue) {
    var info = DB.mapInfo(id);
    if (!info) return null;
    var t = info[typeField];
    if (t === 0 && info.parent_map > 0) return this.resolveInfo(info.parent_map, field, typeField);
    if (t === 0) return null;
    return info[field];
  },

  setup: function (mapId) {
    var self = this;
    this.id = mapId;
    this.data = Loader.map(mapId);
    if (!this.data) throw new Error('map ' + mapId + ' not loaded: call Loader.ensureMap first');
    Loader.prefetchTeleportTargets(this.data);
    this.info = DB.mapInfo(mapId);
    this.width = this.data.width; this.height = this.data.height;
    this.setChipset(this.data.chipset_id);
    this.events = [];
    var keys = Object.keys(this.data.events).map(function (k) { return parseInt(k, 10); }).sort(function (a, b) { return a - b; });
    keys.forEach(function (k) { self.events.push(new GameEvent(mapId, k, self.data.events[k])); });
    this.pan = { x: 0, y: 0, locked: false, tx: 0, ty: 0, speed: 0, waiting: false };
    this.encounterStepsOverride = -1;
    this.interpreter = new Interpreter(0, false);
    this.commonParallel = [];
    for (var ceId in Loader.db.commonevents) {
      var ce = Loader.db.commonevents[ceId];
      if (ce.trigger === 4 && ce.event_commands.length) this.commonParallel.push({ ce: ce, id: parseInt(ceId, 10), interp: new Interpreter(0, true) });
    }
    this.setParallax(this.data.parallax_flag ? this.data.parallax_name : '', this.data.parallax_loop_x, this.data.parallax_loop_y,
      this.data.parallax_auto_loop_x, this.data.parallax_sx, this.data.parallax_auto_loop_y, this.data.parallax_sy);
    Player.encounterRate = 0;
    this.freezeEvents = false;
    this.playMusic();
  },

  playMusic: function () {
    var music = this.resolveInfo(this.id, 'music', 'music_type');
    if (music && music.name && music.name !== '(OFF)') Audio_.playBgm(music);
  },

  setChipset: function (id) {
    this.chipsetId = id;
    this.chipset = DB.chipset(id);
    this.chipsetImg = Loader.image('chipset', this.chipset.chipset_name);
    this.buildLayers();
  },
  setParallax: function (name, loopX, loopY, autoX, sx, autoY, sy) {
    this.parallax = name ? { img: Loader.image('panorama', name), loopX: loopX, loopY: loopY, autoX: autoX, sx: sx, autoY: autoY, sy: sy } : null;
    this.parallaxOx = 0; this.parallaxOy = 0;
  },

  isValid: function (x, y) { return x >= 0 && y >= 0 && x < this.width && y < this.height; },
  /* tile passable when entering from direction bit (or any if bit<0) */
  tilePassable: function (x, y, bit) {
    if (!this.isValid(x, y)) return false;
    var up = this.upperPass(x, y);
    if (up >= 0 && !(up & TILES.PASS_ABOVE)) {
      if (bit < 0 ? (up & 0xF) === 0 : !(up & bit)) return false;
      if (up & TILES.PASS_WALL) return false;
      return true;
    }
    var lp = this.lowerPass(x, y);
    if (bit < 0) return (lp & 0xF) !== 0;
    return (lp & bit) !== 0;
  },
  isCounter: function (x, y) {
    var up = this.upperPass(x, y);
    return up >= 0 && (up & TILES.PASS_COUNTER) !== 0;
  },
  terrainAt: function (x, y) {
    if (!this.isValid(x, y)) return 1;
    var id = this.data.lower_layer[x + y * this.width];
    return this.chipset.terrain_data[this.lowerIndex(id)] || 1;
  },
  eventsAt: function (x, y) {
    return this.events.filter(function (e) { return e.page && !e.erased && e.x === x && e.y === y; });
  },
  /* can character ch move from (x,y) towards d? */
  canMove: function (ch, x, y, d) {
    var nx = x + DIR_DX[d], ny = y + DIR_DY[d];
    if (!this.isValid(nx, ny)) return false;
    if (ch.through) return true;
    if (!this.tilePassable(x, y, DIR_PASS[d])) return false;
    if (!this.tilePassable(nx, ny, DIR_PASS[(d + 2) % 4])) return false;
    var evs = this.eventsAt(nx, ny);
    for (var i = 0; i < evs.length; i++) {
      var e = evs[i];
      if (e === ch) continue;
      if (e.layer === 1 && !e.through) return false;
    }
    if (ch !== Player && Player.visible && !Player.hidden && Player.x === nx && Player.y === ny && ch.layer === 1) return false;
    return true;
  },
  isPassable: function (ch, x, y, bit) {
    if (!this.isValid(x, y)) return false;
    if (!this.tilePassable(x, y, bit)) return false;
    var evs = this.eventsAt(x, y);
    for (var i = 0; i < evs.length; i++) if (evs[i] !== ch && evs[i].layer === 1 && !evs[i].through) return false;
    return true;
  },

  /* ---- triggers ---- */
  checkActionEvent: function () {
    var x = Player.x + DIR_DX[Player.facing], y = Player.y + DIR_DY[Player.facing];
    var here = this.eventsAt(Player.x, Player.y).filter(function (e) { return e.page.trigger === 0 && e.layer !== 1; });
    var front = this.eventsAt(x, y).filter(function (e) { return e.page.trigger === 0 && e.layer === 1; });
    var list = front.length ? front : here;
    if (!list.length && this.isCounter(x, y)) {
      var x2 = x + DIR_DX[Player.facing], y2 = y + DIR_DY[Player.facing];
      list = this.eventsAt(x2, y2).filter(function (e) { return e.page.trigger === 0 && e.layer === 1; });
    }
    if (!list.length) return false;
    var ev = list[list.length - 1];
    if (ev.layer === 1 && !ev.isFixedFacing()) ev.turnToward(Player.x, Player.y);
    this.startEvent(ev);
    return true;
  },
  checkTouchAhead: function (d) {
    var x = Player.x + DIR_DX[d], y = Player.y + DIR_DY[d];
    var evs = this.eventsAt(x, y).filter(function (e) { return e.layer === 1 && (e.page.trigger === 1 || e.page.trigger === 2); });
    if (evs.length) { this.startEvent(evs[evs.length - 1]); return true; }
    return false;
  },
  checkTouchHere: function () {
    var evs = this.eventsAt(Player.x, Player.y).filter(function (e) { return e.layer !== 1 && (e.page.trigger === 1 || e.page.trigger === 2); });
    if (evs.length) { this.startEvent(evs[evs.length - 1]); return true; }
    return false;
  },
  startEvent: function (ev) {
    if (this.interpreter.running() || ev.page.trigger === 4) return;
    this.interpreter.setup(ev.commands(), ev.id);
  },
  onPlayerStep: function () {
    if (this.interpreter.running()) return;
    if (this.checkTouchHere()) return;
    Player.updateEncounter();
  },

  /* ---- update ---- */
  refreshEvents: function () { this.events.forEach(function (e) { e.refresh(); }); },
  update: function () {
    this.frame++;
    this.updateCommonEvents();
    this.interpreter.update();
    if (!this.interpreter.running()) {
      /* auto-start events */
      for (var i = 0; i < this.events.length; i++) {
        var e = this.events[i];
        if (e.page && !e.erased && e.page.trigger === 3) { this.interpreter.setup(e.commands(), e.id); break; }
      }
    }
    for (var k = 0; k < this.events.length; k++) {
      var ev = this.events[k];
      ev.update();
      if (ev.interpreter && ev.page && ev.page.trigger === 4) {
        if (!ev.interpreter.running()) ev.interpreter.setup(ev.commands(), ev.id);
        ev.interpreter.update();
      }
    }
    if (!this.interpreter.running() && !MessageWindow.busy()) Player.updateInput();
    Player.update();
    this.updateScroll();
    if (this.parallax) {
      if (this.parallax.autoX) this.parallaxOx += this.parallax.sx / 8;
      if (this.parallax.autoY) this.parallaxOy += this.parallax.sy / 8;
    }
  },
  updateCommonEvents: function () {
    for (var i = 0; i < this.commonParallel.length; i++) {
      var p = this.commonParallel[i];
      if (p.ce.switch_flag && !GameState.sw(p.ce.switch_id)) continue;
      if (!p.interp.running()) p.interp.setup(p.ce.event_commands, 0);
      p.interp.update();
    }
    if (!this.interpreter.running()) {
      for (var ceId in Loader.db.commonevents) {
        var ce = Loader.db.commonevents[ceId];
        if (ce.trigger === 3 && (!ce.switch_flag || GameState.sw(ce.switch_id)) && ce.event_commands.length) {
          this.interpreter.setup(ce.event_commands, 0);
          break;
        }
      }
    }
  },
  updateScroll: function () {
    var p = this.pan;
    if (p.speed && (p.x !== p.tx || p.y !== p.ty)) {
      var step = 1 << p.speed;
      if (p.x < p.tx) p.x = Math.min(p.tx, p.x + step); else if (p.x > p.tx) p.x = Math.max(p.tx, p.x - step);
      if (p.y < p.ty) p.y = Math.min(p.ty, p.y + step); else if (p.y > p.ty) p.y = Math.max(p.ty, p.y - step);
      if (p.x === p.tx && p.y === p.ty) p.waiting = false;
    }
    var cx = Player.screenX() + 8 + p.x - CONFIG.SCREEN_W / 2;
    var cy = Player.screenY() + 8 + p.y - CONFIG.SCREEN_H / 2;
    var st = this.data.scroll_type;
    var loopH = st === 2 || st === 3, loopV = st === 1 || st === 3;
    if (!loopH) cx = Math.max(0, Math.min(this.width * 16 - CONFIG.SCREEN_W, cx));
    if (!loopV) cy = Math.max(0, Math.min(this.height * 16 - CONFIG.SCREEN_H, cy));
    if (this.width * 16 < CONFIG.SCREEN_W) cx = 0;
    if (this.height * 16 < CONFIG.SCREEN_H) cy = 0;
    this.ox = Math.round(cx); this.oy = Math.round(cy);
  },
  panScreen: function (mode, dir, dist, speed, wait) {
    var p = this.pan;
    if (mode === 0) { p.locked = true; return; }
    if (mode === 1) { p.locked = false; return; }
    if (mode === 2) {
      var dx = [0, 16, 0, -16][dir] * dist, dy = [-16, 0, 16, 0][dir] * dist;
      p.tx = p.tx + dx; p.ty = p.ty + dy;
    } else if (mode === 3) { p.tx = 0; p.ty = 0; }
    p.speed = Math.max(1, Math.min(6, speed));
    p.waiting = !!wait;
  },

  /* ---- drawing ---- */
  draw: function (ctx) {
    var ox = this.ox, oy = this.oy;
    var st = this.data.scroll_type;
    var loopH = st === 2 || st === 3, loopV = st === 1 || st === 3;
    if (this.parallax && this.parallax.img) {
      var pi = this.parallax.img;
      var px = this.parallax.loopX ? Math.round(-(ox / 2) - this.parallaxOx) : 0;
      var py = this.parallax.loopY ? Math.round(-(oy / 2) - this.parallaxOy) : 0;
      if (this.parallax.loopX || this.parallax.loopY) {
        px = ((px % pi.width) + pi.width) % pi.width - pi.width;
        py = ((py % pi.height) + pi.height) % pi.height - pi.height;
        for (var yy = py; yy < CONFIG.SCREEN_H; yy += pi.height) for (var xx = px; xx < CONFIG.SCREEN_W; xx += pi.width) ctx.drawImage(pi, xx, yy);
      } else {
        ctx.drawImage(pi, 0, 0);
      }
    } else {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, CONFIG.SCREEN_W, CONFIG.SCREEN_H);
    }
    var animSpeed = 24;
    var f = Math.floor(this.frame / animSpeed) % 4;
    var lower = this.lowerCanvas[Math.min(f, this.lowerCanvas.length - 1)];
    this.blitLayer(ctx, lower, ox, oy, loopH, loopV);
    /* characters sorted: layer below, then by y */
    var chars = this.events.filter(function (e) { return e.page && e.visible; }).slice();
    if (Player.visibleOnMap()) chars.push(Player);
    var below = chars.filter(function (c) { return c.layer === 0; });
    var same = chars.filter(function (c) { return c.layer === 1; }).sort(function (a, b) { return a.screenY() - b.screenY() || (a === Player ? 1 : 0) - (b === Player ? 1 : 0); });
    var above = chars.filter(function (c) { return c.layer === 2; });
    var self = this;
    below.forEach(function (c) { c.draw(ctx, ox, oy); });
    same.forEach(function (c) { c.draw(ctx, ox, oy); });
    this.blitLayer(ctx, this.upperCanvas, ox, oy, loopH, loopV);
    above.forEach(function (c) { c.draw(ctx, ox, oy); });
    BattleAnim.drawMap(ctx, ox, oy);
  },
  blitLayer: function (ctx, cv, ox, oy, loopH, loopV) {
    var W = cv.width, H = cv.height;
    var xs = loopH ? [(-((ox % W) + W) % W), 0] : [-ox];
    var ys = loopV ? [(-((oy % H) + H) % H), 0] : [-oy];
    if (loopH) { var x0 = -(((ox % W) + W) % W); xs = [x0, x0 + W]; }
    if (loopV) { var y0 = -(((oy % H) + H) % H); ys = [y0, y0 + H]; }
    for (var i = 0; i < ys.length; i++) for (var j = 0; j < xs.length; j++) ctx.drawImage(cv, xs[j], ys[i]);
  },

  serialize: function () {
    return {
      id: this.id, x: Player.x, y: Player.y, facing: Player.facing, hidden: Player.hidden,
      encounterOverride: this.encounterStepsOverride,
      chipsetId: this.chipsetId,
      erased: this.events.filter(function (e) { return e.erased; }).map(function (e) { return e.id; }),
      events: this.events.map(function (e) { return { id: e.id, x: e.x, y: e.y, facing: e.facing }; }),
    };
  },
};
