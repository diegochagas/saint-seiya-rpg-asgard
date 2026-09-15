/* Map characters (player and events): tile movement, sprite animation and move routes. */

var STOP_STEP = function (freq) { return freq >= 8 ? 0 : 1 << (9 - freq); };
var STOP_TURN = function (freq) { return freq >= 8 ? 0 : 1 << (8 - freq); };
var STOP_WAIT = function (freq) { return 20 + STOP_TURN(freq); };
var ANIM_STATIONARY = [12, 10, 8, 6, 5, 4];
var ANIM_CONTINUOUS = [16, 12, 10, 8, 7, 6];

function Character() {
  this.x = 0; this.y = 0;
  this.facing = DIR.DOWN;
  this.remainingStep = 0;
  this.moveDir = DIR.DOWN;
  this.charName = '';
  this.charIndex = 0;
  this.transparent = false;
  this.pattern = 1;          /* 0 left, 1 middle, 2 right, 3 middle */
  this.animCount = 0;
  this.stopCount = 0;
  this.moveSpeed = 4;
  this.moveFrequency = 3;
  this.animType = 0;         /* EventPage.AnimType */
  this.animPaused = false;
  this.facingLocked = false;
  this.through = false;
  this.layer = 1;
  this.opacity = 1;
  this.visible = true;
  this.route = null;         /* {commands, index, repeat, skippable, waitFrames, owner} */
  this.originalRoute = null;
  this.flash = null;
  this.jumping = false;
  this.jumpFrom = null;
  this.moveFailed = false;
}
Character.prototype = {
  isMoving: function () { return this.remainingStep > 0; },
  isStopping: function () { return this.remainingStep <= 0; },
  isAnimated: function () { return this.animType !== 4 && this.animType !== 6 && !this.animPaused; },
  isContinuous: function () { return this.animType === 1 || this.animType === 3; },
  isFixedFacing: function () { return this.animType === 2 || this.animType === 3 || this.animType === 6 || this.facingLocked; },

  /* pixel position of sprite's tile origin (top-left of the tile) */
  screenX: function () {
    var px = this.x * 16;
    if (this.isMoving()) px -= DIR_DX[this.moveDir] * Math.round(this.remainingStep / 16);
    return px;
  },
  screenY: function () {
    var py = this.y * 16;
    if (this.isMoving()) py -= DIR_DY[this.moveDir] * Math.round(this.remainingStep / 16);
    if (this.jumping && this.jumpFrom) {
      var t = 1 - this.remainingStep / CONFIG.STEP;
      py -= Math.round(Math.sin(t * Math.PI) * 12);
    }
    return py;
  },

  setFacing: function (d) { if (!this.isFixedFacing()) this.facing = d; },
  forceFacing: function (d) { this.facing = d; },
  turnToward: function (tx, ty) {
    var dx = tx - this.x, dy = ty - this.y;
    if (Math.abs(dx) > Math.abs(dy)) this.setFacing(dx > 0 ? DIR.RIGHT : DIR.LEFT);
    else if (dy !== 0) this.setFacing(dy > 0 ? DIR.DOWN : DIR.UP);
    else if (dx !== 0) this.setFacing(dx > 0 ? DIR.RIGHT : DIR.LEFT);
  },
  turnAway: function (tx, ty) {
    var dx = tx - this.x, dy = ty - this.y;
    if (Math.abs(dx) > Math.abs(dy)) this.setFacing(dx > 0 ? DIR.LEFT : DIR.RIGHT);
    else if (dy !== 0) this.setFacing(dy > 0 ? DIR.UP : DIR.DOWN);
    else if (dx !== 0) this.setFacing(dx > 0 ? DIR.LEFT : DIR.RIGHT);
  },

  /* attempt a step in direction d */
  move: function (d) {
    this.setFacing(d);
    var nx = this.x + DIR_DX[d], ny = this.y + DIR_DY[d];
    if (!GameMap.canMove(this, this.x, this.y, d)) { this.moveFailed = true; return false; }
    this.x = nx; this.y = ny;
    this.moveDir = d;
    this.remainingStep = CONFIG.STEP;
    this.stopCount = 0;
    this.moveFailed = false;
    return true;
  },
  moveDiagonal: function (dv, dh) {
    if (this.move(dh)) return true;
    return this.move(dv);
  },
  jump: function (dx, dy) {
    var nx = this.x + dx, ny = this.y + dy;
    if (!this.through && !GameMap.isPassable(this, nx, ny, -1)) { this.moveFailed = true; return false; }
    this.jumpFrom = { x: this.x, y: this.y };
    this.x = nx; this.y = ny;
    this.jumping = true;
    this.remainingStep = CONFIG.STEP;
    this.moveDir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? DIR.RIGHT : DIR.LEFT) : (dy > 0 ? DIR.DOWN : DIR.UP);
    if (dx || dy) this.setFacing(this.moveDir);
    return true;
  },

  update: function () {
    if (this.isMoving()) {
      var amount = this.jumping ? [8, 12, 16, 24, 32, 64][this.moveSpeed - 1] * 2 : (1 << (1 + this.moveSpeed));
      this.remainingStep -= amount;
      if (this.remainingStep <= 0) { this.remainingStep = 0; this.jumping = false; this.jumpFrom = null; this.onStepDone(); }
    } else {
      this.stopCount++;
    }
    this.updateRoute();
    this.updateAnimation();
    if (this.flash) { this.flash.t++; if (this.flash.t >= this.flash.frames) this.flash = null; }
  },
  onStepDone: function () {},

  updateAnimation: function () {
    var speed = Math.max(1, Math.min(6, this.moveSpeed));
    if (this.animType === 5) { /* spin */
      this.animCount++;
      if (this.animCount >= [24, 16, 12, 8, 6, 4][speed - 1]) { this.facing = (this.facing + 1) % 4; this.animCount = 0; }
      return;
    }
    if (this.animPaused || this.jumping) { this.pattern = 1; this.animCount = 0; return; }
    if (!this.isAnimated()) return;
    var stationary = ANIM_STATIONARY[speed - 1], continuous = ANIM_CONTINUOUS[speed - 1];
    if (this.isContinuous() || this.stopCount === 0 || this.pattern === 0 || this.pattern === 2 || this.animCount < stationary - 1) {
      this.animCount++;
    }
    if (this.animCount >= continuous || (this.stopCount === 0 && this.animCount >= stationary)) {
      this.pattern = (this.pattern + 1) % 4;
      this.animCount = 0;
    }
  },

  /* ---- move routes ---- */
  setRoute: function (commands, repeat, skippable, isOverride) {
    this.route = { commands: commands, index: 0, repeat: repeat, skippable: skippable, wait: 0, override: !!isOverride, done: false };
  },
  clearRoute: function () { this.route = null; },
  routeActive: function () { return this.route && this.route.override && !this.route.done; },
  updateRoute: function () {
    var r = this.route;
    if (!r || r.done) return;
    if (this.isMoving()) return;
    if (r.wait > 0) { r.wait--; return; }
    if (!r.override && this.stopCount < STOP_STEP(this.moveFrequency)) return;
    var guard = 0;
    while (r && !r.done && guard++ < 50) {
      if (r.index >= r.commands.length) {
        if (r.repeat) { r.index = 0; if (!r.commands.length) return; }
        else { r.done = true; this.onRouteDone(); return; }
      }
      var c = r.commands[r.index];
      var ok = this.execRouteCommand(c, r);
      if (ok === false) {
        if (r.skippable) { r.index++; continue; }
        return; /* retry next frame */
      }
      r.index++;
      if (this.isMoving() || r.wait > 0) return;
      if (c.code <= 11 || c.code === 23 || c.code === 25) return;
    }
  },
  onRouteDone: function () {},
  execRouteCommand: function (c, r) {
    var code = c.code;
    if (code <= 3) return this.move(code === 0 ? DIR.UP : code === 1 ? DIR.RIGHT : code === 2 ? DIR.DOWN : DIR.LEFT);
    switch (code) {
      case 4: return this.moveDiagonal(DIR.UP, DIR.RIGHT);
      case 5: return this.moveDiagonal(DIR.DOWN, DIR.RIGHT);
      case 6: return this.moveDiagonal(DIR.DOWN, DIR.LEFT);
      case 7: return this.moveDiagonal(DIR.UP, DIR.LEFT);
      case 8: return this.move(Rand.int(0, 3));
      case 9: this.turnToward(Player.x, Player.y); return this.move(this.facing);
      case 10: this.turnAway(Player.x, Player.y); return this.move(this.facing);
      case 11: return this.move(this.facing);
      case 12: this.setFacing(DIR.UP); return true;
      case 13: this.setFacing(DIR.RIGHT); return true;
      case 14: this.setFacing(DIR.DOWN); return true;
      case 15: this.setFacing(DIR.LEFT); return true;
      case 16: this.setFacing((this.facing + 1) % 4); return true;
      case 17: this.setFacing((this.facing + 3) % 4); return true;
      case 18: this.setFacing((this.facing + 2) % 4); return true;
      case 19: this.setFacing((this.facing + (Rand.int(0, 1) ? 1 : 3)) % 4); return true;
      case 20: this.setFacing(Rand.int(0, 3)); return true;
      case 21: this.turnToward(Player.x, Player.y); return true;
      case 22: this.turnAway(Player.x, Player.y); return true;
      case 23: r.wait = STOP_WAIT(this.moveFrequency); return true;
      case 24: { /* begin jump: collect moves until end jump */
        var dx = 0, dy = 0, i = r.index + 1;
        while (i < r.commands.length && r.commands[i].code !== 25) {
          var cc = r.commands[i].code;
          if (cc <= 3) { dx += DIR_DX[[0, 1, 2, 3][cc]]; dy += DIR_DY[[0, 1, 2, 3][cc]]; }
          else if (cc === 4) { dy--; dx++; } else if (cc === 5) { dy++; dx++; }
          else if (cc === 6) { dy++; dx--; } else if (cc === 7) { dy--; dx--; }
          else if (cc === 11) { dx += DIR_DX[this.facing]; dy += DIR_DY[this.facing]; }
          else if (cc >= 12 && cc <= 15) this.setFacing(cc - 12);
          i++;
        }
        var res = this.jump(dx, dy);
        r.index = i; /* skip to end jump */
        return res;
      }
      case 25: return true;
      case 26: this.facingLocked = true; return true;
      case 27: this.facingLocked = false; return true;
      case 28: this.moveSpeed = Math.min(6, this.moveSpeed + 1); return true;
      case 29: this.moveSpeed = Math.max(1, this.moveSpeed - 1); return true;
      case 30: this.moveFrequency = Math.min(8, this.moveFrequency + 1); return true;
      case 31: this.moveFrequency = Math.max(1, this.moveFrequency - 1); return true;
      case 32: GameState.setSw(c.a, true); GameMap.refreshEvents(); return true;
      case 33: GameState.setSw(c.a, false); GameMap.refreshEvents(); return true;
      case 34: this.charName = c.string; this.charIndex = c.a; return true;
      case 35: Audio_.playSe({ name: c.string, volume: c.a, tempo: c.b, balance: c.c }); return true;
      case 36: this.through = true; return true;
      case 37: this.through = false; return true;
      case 38: this.animPaused = true; return true;
      case 39: this.animPaused = false; return true;
      case 40: this.opacity = Math.max(0, this.opacity - 1 / 8); return true;
      case 41: this.opacity = Math.min(1, this.opacity + 1 / 8); return true;
    }
    return true;
  },

  /* ---- drawing ---- */
  draw: function (ctx, ox, oy) {
    if (!this.visible || !this.charName || this.transparent && this.opacity <= 0) return;
    var img = Loader.image('charset', this.charName);
    if (!img) return;
    var frame = this.pattern === 3 ? 1 : this.pattern;
    var sx = (this.charIndex % 4) * 72 + frame * 24;
    var sy = Math.floor(this.charIndex / 4) * 128 + this.facing * 32;
    var dx = this.screenX() - ox - 4, dy = this.screenY() - oy - 16;
    ctx.save();
    var op = this.opacity * (this.transparent ? 0.5 : 1);
    if (op < 1) ctx.globalAlpha = op;
    ctx.drawImage(img, sx, sy, 24, 32, dx, dy, 24, 32);
    if (this.flash) {
      var f = this.flash, a = (1 - f.t / f.frames) * f.power / 31;
      var tmp = Gfx.makeCanvas(24, 32), tc = tmp.getContext('2d');
      tc.drawImage(img, sx, sy, 24, 32, 0, 0, 24, 32);
      tc.globalCompositeOperation = 'source-in';
      tc.fillStyle = 'rgba(' + f.r * 8 + ',' + f.g * 8 + ',' + f.b * 8 + ',' + a + ')';
      tc.fillRect(0, 0, 24, 32);
      ctx.drawImage(tmp, dx, dy);
    }
    ctx.restore();
  },
};
