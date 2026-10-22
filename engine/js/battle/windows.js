/* RPG Maker 2003 battle windows, "alternative" layout (the one Holy Avenger uses): party options
   on the left that slide away, the status window with ATB gauges, the actor command window on
   the right, enemy names while targeting, a help line on top, and skill/item lists. */
var BATTLE_WINDOW_Y = 160, BATTLE_WINDOW_H = 80;
var SMALL_WINDOW_Y = 172, SMALL_WINDOW_H = 68, SMALL_PAD_Y = 5, SMALL_ROW_H = 14;
var OPTIONS_W = 76, STATUS_W = 244, TARGET_W = 136;
var WINDOW_SLIDE_FRAMES = 8;
var TRANSPARENT_BACK_OPACITY = 160 / 255;

var BattleWindowStyle = {
  small: function () { return Loader.db.battlecommands.window_size === 1; },
  y: function () { return this.small() ? SMALL_WINDOW_Y : BATTLE_WINDOW_Y; },
  h: function () { return this.small() ? SMALL_WINDOW_H : BATTLE_WINDOW_H; },
  padY: function () { return this.small() ? SMALL_PAD_Y : 8; },
  rowH: function () { return this.small() ? SMALL_ROW_H : 16; },
  /** apply the database's window size / transparency to a window and return it */
  apply: function (w) {
    w.rowHeight = this.rowH();
    if (Loader.db.battlecommands.transparency === 1) w.backOpacity = TRANSPARENT_BACK_OPACITY;
    return w;
  },
  list: function (x, width, labels) {
    var w = this.apply(new Window_Selectable(x, this.y(), width, this.h(), this.padY()));
    w.labels = labels;
    w.itemMax = labels.length;
    w.disabled = {};
    w.refresh = BattleWindowStyle.refreshList;
    w.index = 0;
    return w;
  },
  refreshList: function () {
    this.clear();
    for (var i = 0; i < this.labels.length; i++) {
      var r = this.itemRect(i);
      this.text(this.labels[i], r.x, r.y - 1, this.disabled[i] ? 3 : 0);
    }
    this.dirty = false;
  },
};

/* Horizontal slide of a window over a few frames (RPG_RT MoveCommandWindows). */
function slideWindow(w, toX, frames) {
  w.slide = { from: w.x, to: toX, t: 0, frames: Math.max(1, frames) };
}
function updateSlide(w) {
  var s = w.slide;
  if (!s) return;
  s.t++;
  w.x = Math.round(s.from + (s.to - s.from) * s.t / s.frames);
  if (s.t >= s.frames) w.slide = null;
}

/* System2: gauge pieces at row 64, digits and cursors (EasyRPG window_battlestatus / S3 cursor code). */
var System2 = {
  img: function () { return Loader.image('system2', Loader.db.system.system2_name); },
  /** ATB-style gauge: caps + 25px centre, fill 25*cur/max (full cell when cur == max) */
  drawGauge: function (ctx, x, y, cur, max) {
    var img = this.img();
    if (!img) return;
    ctx.drawImage(img, 0, 64, 16, 16, x, y, 16, 16);
    ctx.drawImage(img, 16, 64, 16, 16, x + 16, y, 25, 16);
    ctx.drawImage(img, 32, 64, 16, 16, x + 41, y, 16, 16);
    var w = Math.floor((25 * Math.min(cur, max)) / Math.max(1, max));
    if (w > 0) ctx.drawImage(img, cur >= max ? 64 : 48, 64, 16, 16, x + 16, y, w, 16);
  },
  cursorFrame: function (counter) { return [0, 1, 2, 1][Math.floor(counter / 15) % 4]; },
  /** @param {boolean} ally ally cursor row (16) instead of the enemy one (0) */
  drawCursor: function (ctx, x, y, counter, ally) {
    var img = this.img();
    if (img) ctx.drawImage(img, this.cursorFrame(counter) * 16, ally ? 16 : 0, 16, 16, Math.round(x), Math.round(y), 16, 16);
  },
};

/* Status window: name, state, HP cur/max, SP, ATB gauge under the numbers (alternative layout). */
function BattleStatusWindow(x) {
  var st = BattleWindowStyle;
  Window_Selectable.call(this, x, st.y(), STATUS_W, st.h(), st.padY());
  st.apply(this);
  this.setPadding(4, st.padY());
  this.itemMax = Party.size();
  this.index = -1;
}
BattleStatusWindow.prototype = Object.create(Window_Selectable.prototype);
Object.assign(BattleStatusWindow.prototype, {
  digits: function (max) { return max >= 1000 ? 4 : 3; },
  refresh: function () {
    this.clear();
    var top = Math.floor(this.rowHeight / 8);
    for (var i = 0; i < Party.size(); i++) this.drawRow(Party.members[i], top + i * this.rowHeight, i);
    this.dirty = false;
  },
  drawRow: function (a, y, i) {
    var transparent = this.backOpacity < 1;
    if (!(transparent && i === this.index)) this.drawAtb(a, y - 2);
    this.text(a.name, 4, y, 0);
    var st = a.significantState();
    this.text(st ? st.name : Terms.get('normal_status'), 80, y, st ? st.color : 0);
    var hd = this.digits(a.maxHp()), sd = this.digits(a.maxSp());
    var hpX = 178 - hd * 6 - sd * 6;
    var hpColor = a.hp === 0 ? 5 : (a.hp <= a.maxHp() / 4 ? 4 : 0);
    this.text(String(a.hp), hpX + hd * 6, y, hpColor, { align: 'right' });
    this.text('/' + a.maxHp(), hpX + hd * 6, y, 0);
    this.text(String(a.sp), 220, y, a.sp <= a.maxSp() / 4 ? 4 : 0, { align: 'right' });
  },
  drawAtb: function (a, y) {
    this.cctx.save();
    if (this.backOpacity >= 1) this.cctx.globalAlpha = 96 / 255;
    System2.drawGauge(this.cctx, 192, y, a.atbGauge, ATB_MAX);
    this.cctx.restore();
  },
  update: function () { Window_Selectable.prototype.update.call(this); updateSlide(this); this.dirty = true; },
});

/* Enemy names while targeting (left panel). */
function BattleTargetWindow(enemies) {
  var st = BattleWindowStyle;
  Window_Selectable.call(this, 0, st.y(), TARGET_W, st.h(), st.padY());
  st.apply(this);
  this.enemies = enemies;
  this.visible = false;
}
BattleTargetWindow.prototype = Object.create(Window_Selectable.prototype);
Object.assign(BattleTargetWindow.prototype, {
  targets: function () { return this.enemies.filter(function (e) { return e.exists(); }); },
  refresh: function () {
    this.clear();
    var list = this.targets();
    this.itemMax = list.length;
    for (var i = 0; i < list.length; i++) this.text(list[i].name, 0, i * this.rowHeight - 1, 0);
    this.dirty = false;
  },
  selected: function () { return this.targets()[this.index] || null; },
});

/* Skill or item list (2 columns), with the help line showing the description. */
function BattleListWindow() {
  var st = BattleWindowStyle;
  Window_Selectable.call(this, 0, st.y(), 320, st.h(), st.padY());
  st.apply(this);
  this.columns = 2;
  this.visible = false;
  this.entries = [];   /* {name, count, enabled, description} */
}
BattleListWindow.prototype = Object.create(Window_Selectable.prototype);
Object.assign(BattleListWindow.prototype, {
  setEntries: function (entries) {
    this.entries = entries;
    this.itemMax = entries.length;
    var rows = Math.max(1, Math.ceil(entries.length / 2));
    this.contents = Gfx.makeCanvas(this.width - 16, Math.max(this.height - 2 * this.padY, rows * this.rowHeight));
    this.cctx = this.contents.getContext('2d');
    this.topRow = 0; this.oy = 0;
    this.setIndex(entries.length ? 0 : -1);
    this.dirty = true;
  },
  refresh: function () {
    this.clear();
    for (var i = 0; i < this.entries.length; i++) {
      var e = this.entries[i], r = this.itemRect(i);
      this.text(e.name, r.x, r.y - 1, e.enabled ? 0 : 3);
      this.text(String(e.count), r.x + r.w - 6, r.y - 1, e.enabled ? 0 : 3, { align: 'right' });
    }
    this.dirty = false;
  },
  current: function () { return this.entries[this.index] || null; },
});
