/* Battler drawing: actor poses from BattleCharSet sheets (3 frames of 48x48 per row), weapon
   overlays (64x64 cells), enemies with blink / death fade / flying bob, and floating numbers. */
var POSE = { IDLE: 0, ATTACK_RIGHT: 1, ATTACK_LEFT: 2, SKILL: 3, DEAD: 4, DAMAGE: 5, BAD_STATE: 6, DEFEND: 7,
  WALK_LEFT: 8, WALK_RIGHT: 9, VICTORY: 10, ITEM: 11 };
var POSE_FRAME_STEP = 10;
var POSE_LOOP = 'loop', POSE_THEN_IDLE = 'idle', POSE_HOLD = 'hold';
var LONG_POSES = [POSE.IDLE, POSE.ATTACK_RIGHT, POSE.ATTACK_LEFT, POSE.WALK_LEFT, POSE.WALK_RIGHT, POSE.VICTORY];
var STATE_POSE_DEFAULT = 100;   /* State.battler_animation_id default: the "bad state" pose */
var WEAPON_CELL = 64;
var FLOAT_FRAMES = 30;

/** @param {Actor} actor */
function ActorBattleSprite(actor) {
  this.actor = actor;
  this.pose = POSE.IDLE;
  this.mode = POSE_LOOP;
  this.cycle = 0;
  this.dx = 0; this.dy = 0;
  this.flipped = false;
  this.weapon = null;       /* {name, index} while an attack pose shows the weapon */
  this.flash = null;
  this.afterImages = [];
}
ActorBattleSprite.prototype = {
  animation: function () { return DB.battlerAnimation(this.actor.battlerAnimation || 1); },
  /* defending, then the strongest state's pose, then plain idle */
  idlePose: function () {
    var a = this.actor;
    if (a.isDead()) return POSE.DEAD;
    if (a.defending) return POSE.DEFEND;
    var st = a.significantState();
    if (st && st.battler_animation_id != null) return st.battler_animation_id === STATE_POSE_DEFAULT ? POSE.BAD_STATE : st.battler_animation_id;
    return POSE.IDLE;
  },
  /* poses set by actions (attack, walk, victory) play as asked; idle poses follow the actor's state */
  setPose: function (pose, mode) { this.pose = pose; this.mode = mode || POSE_THEN_IDLE; this.cycle = 0; this.idling = false; },
  toIdle: function () {
    var p = this.idlePose();
    this.setPose(p, p === POSE.DEAD ? POSE_HOLD : POSE_LOOP);
    this.idling = true;
  },
  /** @returns {boolean} true while a one-shot pose is still playing */
  busy: function () { return this.mode === POSE_THEN_IDLE; },
  length: function () { return LONG_POSES.indexOf(this.pose) >= 0 ? 40 : 30; },
  update: function () {
    if (this.flash) { this.flash.t++; if (this.flash.t >= this.flash.frames) this.flash = null; }
    if ((this.idling || this.pose === POSE.DEAD) && this.pose !== this.idlePose()) this.toIdle();
    this.cycle++;
    if (this.cycle < this.length()) return;
    if (this.mode === POSE_LOOP) this.cycle = 0;
    else if (this.mode === POSE_HOLD) this.cycle = this.length() - 1;
    else this.toIdle();
  },
  frame: function () {
    var step = Math.floor(this.cycle / POSE_FRAME_STEP);
    if (this.pose === POSE.DEFEND) return 0;
    if (this.pose === POSE.ATTACK_RIGHT || this.pose === POSE.ATTACK_LEFT) return Math.min(2, step);
    return [0, 1, 2, 1, 0][Math.min(4, step)];
  },
  poseCell: function () {
    var ba = this.animation();
    var def = ba && ba.poses[this.pose + 1];
    if (!def || !def.battler_name) return null;
    var img = Loader.image('battlecharset', def.battler_name);
    return img ? { img: img, row: def.battler_index } : null;
  },
  draw: function (ctx) {
    var cell = this.poseCell();
    if (!cell || this.actor.hidden) return;
    var x = Math.round(this.actor.x + this.dx), y = Math.round(this.actor.y + this.dy);
    var f = this.flipped ? 2 - this.frame() : this.frame();
    this.drawAfterImages(ctx, cell, f);
    BattleSprites.blit(ctx, cell.img, f * 48, cell.row * 48, 48, x, y, this.flipped, this.flash);
    if (this.weapon) this.drawWeapon(ctx, x, y);
  },
  drawWeapon: function (ctx, x, y) {
    var img = Loader.image('battleweapon', this.weapon.name);
    if (!img) return;
    var f = Math.min(2, Math.floor(this.cycle / POSE_FRAME_STEP));
    BattleSprites.blit(ctx, img, (this.flipped ? 2 - f : f) * WEAPON_CELL, this.weapon.index * WEAPON_CELL, WEAPON_CELL, x, y, this.flipped, null);
  },
  /* "add" after-image weapons leave 3 fading copies while moving */
  drawAfterImages: function (ctx, cell, f) {
    var self = this;
    this.afterImages.forEach(function (p, i) {
      ctx.save();
      ctx.globalAlpha = (64 + i * 64) / 255;
      BattleSprites.blit(ctx, cell.img, f * 48, cell.row * 48, 48, Math.round(p.x), Math.round(p.y), self.flipped, null);
      ctx.restore();
    });
  },
  trackAfterImage: function (on) {
    if (on) this.afterImages.push({ x: this.actor.x + this.dx, y: this.actor.y + this.dy });
    if (this.afterImages.length > 3 || (!on && this.afterImages.length)) this.afterImages.shift();
  },
};

var BattleSprites = {
  scratch: null,
  /* draw a size x size cell centred on (x, y), mirrored and/or white-flashed */
  blit: function (ctx, img, sx, sy, size, x, y, flipped, flash) {
    var src = flash ? this.flashed(img, sx, sy, size, flash) : null;
    ctx.save();
    ctx.translate(x, y);
    if (flipped) ctx.scale(-1, 1);
    if (src) ctx.drawImage(src, 0, 0, size, size, -size / 2, -size / 2, size, size);
    else ctx.drawImage(img, sx, sy, size, size, -size / 2, -size / 2, size, size);
    ctx.restore();
  },
  flashed: function (img, sx, sy, size, flash) {
    if (!this.scratch || this.scratch.width < size) this.scratch = Gfx.makeCanvas(Math.max(size, 128), Math.max(size, 128));
    var c = this.scratch.getContext('2d');
    c.clearRect(0, 0, size, size);
    c.globalCompositeOperation = 'source-over';
    c.drawImage(img, sx, sy, size, size, 0, 0, size, size);
    c.globalCompositeOperation = 'source-atop';
    c.fillStyle = 'rgba(' + flash.r + ',' + flash.g + ',' + flash.b + ',' + BattleSprites.flashAlpha(flash) + ')';
    c.fillRect(0, 0, size, size);
    c.globalCompositeOperation = 'source-over';
    return this.scratch;
  },
  flashAlpha: function (flash) { return (flash.power / 31) * (1 - flash.t / flash.frames); },
  /** @param {number} r 0-31 like RPG Maker's flash colours */
  makeFlash: function (r, g, b, power, frames) {
    return { r: Math.round(r * 255 / 31), g: Math.round(g * 255 / 31), b: Math.round(b * 255 / 31), power: power, frames: frames, t: 0 };
  },

  enemyAlpha: function (e) {
    var a = e.data.transparent ? 160 / 255 : 1;
    if ((e.dead || e.escaped) && e.fade > 0) a *= Math.min(255, 7 * e.fade) / 255;
    return a;
  },
  enemyVisible: function (e) {
    if ((e.dead || e.escaped) && e.fade <= 0) return false;
    if (e.hidden) return false;
    return !(e.blink > 0 && e.blink % 10 >= 5);
  },
  drawEnemy: function (ctx, e) {
    var img = e.image();
    if (!img || !this.enemyVisible(e)) return;
    var bob = e.data.levitate ? Math.round(Math.sin((2 * Math.PI * e.bobPhase) / 256) * 4) : 0;
    ctx.save();
    ctx.globalAlpha = this.enemyAlpha(e);
    if (e.data.battler_hue) ctx.filter = 'hue-rotate(' + e.data.battler_hue + 'deg)';
    var flash = e.flash;
    var src = flash ? this.flashedWhole(img, flash) : img;
    ctx.translate(Math.round(e.x), Math.round(e.y + bob));
    if (e.flipped) ctx.scale(-1, 1);
    ctx.drawImage(src, 0, 0, img.width, img.height, -Math.floor(img.width / 2), -Math.floor(img.height / 2), img.width, img.height);
    ctx.restore();
  },
  flashedWhole: function (img, flash) {
    var size = Math.max(img.width, img.height);
    if (!this.scratch || this.scratch.width < size || this.scratch.height < size) this.scratch = Gfx.makeCanvas(size, size);
    var c = this.scratch.getContext('2d');
    c.clearRect(0, 0, this.scratch.width, this.scratch.height);
    c.drawImage(img, 0, 0);
    c.globalCompositeOperation = 'source-atop';
    c.fillStyle = 'rgba(' + flash.r + ',' + flash.g + ',' + flash.b + ',' + this.flashAlpha(flash) + ')';
    c.fillRect(0, 0, img.width, img.height);
    c.globalCompositeOperation = 'source-over';
    return this.scratch;
  },
};

/* Damage / heal / "Miss" numbers that rise, hold and sink over 30 frames. */
var FloatingNumbers = {
  list: [],
  /** @param {string} text @param {number} color font colour (0 damage, 9 heal) */
  add: function (text, x, y, color) { this.list.push({ text: String(text), x: x, y: y + 5, t: 0, color: color }); },
  offset: function (t) {
    var left = FLOAT_FRAMES - t;
    if (left > 20) return -Math.floor(t / 2);
    if (left > 10) return -5;
    return -5 + Math.floor((10 - left) / 2);
  },
  update: function () {
    this.list.forEach(function (n) { n.t++; });
    this.list = this.list.filter(function (n) { return n.t < FLOAT_FRAMES; });
  },
  busy: function () { return this.list.length > 0; },
  draw: function (ctx) {
    var self = this;
    this.list.forEach(function (n) {
      Font.draw(ctx, n.text, Math.round(n.x), Math.round(n.y - 16 + self.offset(n.t)), n.color, { align: 'center' });
    });
  },
  clear: function () { this.list = []; },
};
