/* Window classes in the spirit of RPG_RT: a skinned box with cached contents,
   optional selectable cursor (rows/columns) and open/close animation. */

function Window_Base(x, y, w, h) {
  this.x = x; this.y = y; this.width = w; this.height = h;
  this.visible = true;
  this.active = false;
  this.opacity = 1;
  this.backOpacity = 1;
  this.contents = Gfx.makeCanvas(Math.max(1, w - 16), Math.max(1, h - 16));
  this.cctx = this.contents.getContext('2d');
  this.cctx.imageSmoothingEnabled = false;
  this.dirty = true;
  this.openness = 1;        /* 0..1 open animation */
  this.opening = 0;         /* -1 closing, 1 opening */
  this.noFrame = false;
  this.pause = false;
  this.frame = 0;
  this.oy = 0;              /* contents scroll */
}
Window_Base.prototype = {
  cw: function () { return this.contents.width; },
  ch: function () { return this.contents.height; },
  clear: function () { this.cctx.clearRect(0, 0, this.contents.width, this.contents.height); },
  text: function (s, x, y, color, opts) { Font.draw(this.cctx, s, x, y, color, opts); },
  refresh: function () { this.dirty = false; },
  update: function () {
    this.frame++;
    if (this.opening > 0) { this.openness = Math.min(1, this.openness + 0.25); if (this.openness >= 1) this.opening = 0; }
    else if (this.opening < 0) { this.openness = Math.max(0, this.openness - 0.25); if (this.openness <= 0) { this.opening = 0; this.visible = false; } }
  },
  open: function () { this.visible = true; if (this.openness < 1) this.opening = 1; },
  close: function () { if (this.visible && this.openness > 0) this.opening = -1; else this.visible = false; },
  isOpen: function () { return this.visible && this.openness >= 1; },
  draw: function (ctx) {
    if (!this.visible) return;
    if (this.dirty) this.refresh();
    var h = Math.round(this.height * this.openness);
    if (h < 2) return;
    var y = this.y + Math.floor((this.height - h) / 2);
    ctx.save();
    ctx.globalAlpha = this.opacity;
    Gfx.drawWindow(ctx, this.x, y, this.width, h, { backOpacity: this.backOpacity, noFrame: this.noFrame, noBackground: this.backOpacity <= 0 });
    if (this.openness >= 1) {
      this.drawUnderContents(ctx);
      ctx.beginPath();
      ctx.rect(this.x + 8, this.y + 8, this.width - 16, this.height - 16);
      ctx.clip();
      ctx.drawImage(this.contents, this.x + 8, this.y + 8 - this.oy);
      ctx.restore();
      ctx.save();
      this.drawExtras(ctx);
    }
    ctx.restore();
  },
  drawUnderContents: function (ctx) {},
  drawExtras: function (ctx) {
    if (this.pause && (this.frame % 32) < 24) Gfx.drawPauseArrow(ctx, this.x + this.width / 2 - 8, this.y + this.height - 8);
  },
  /* helpers shared by menus */
  drawActorFace: function (actor, x, y) {
    var img = Loader.image('faceset', actor.faceName);
    if (!img) return;
    var i = actor.faceIndex;
    this.cctx.drawImage(img, (i % 4) * 48, Math.floor(i / 4) * 48, 48, 48, x, y, 48, 48);
  },
  drawActorName: function (actor, x, y) { this.text(actor.name, x, y, 0); },
  drawActorTitle: function (actor, x, y) { this.text(actor.title, x, y, 0); },
  drawActorClass: function (actor, x, y) { this.text(actor.title, x, y, 0); },
  drawActorLevel: function (actor, x, y) {
    this.text(Terms.get('lvl_short'), x, y, 1);
    this.text(String(actor.level), x + 12 + 18, y, 0, { align: 'right' });
  },
  drawActorState: function (actor, x, y) {
    var st = actor.significantState();
    if (!st) this.text(Terms.get('normal_status'), x, y, 0);
    else this.text(st.name, x, y, st.color);
  },
  drawActorHp: function (actor, x, y) {
    this.text(Terms.get('hp_short'), x, y, 1);
    var color = actor.hp === 0 ? 5 : (actor.hp <= actor.maxHp() / 4 ? 4 : 0);
    this.text(String(actor.hp), x + 12 + 18, y, color, { align: 'right' });
    this.text('/', x + 30, y, 0);
    this.text(String(actor.maxHp()), x + 36 + 18, y, 0, { align: 'right' });
  },
  drawActorSp: function (actor, x, y) {
    this.text(Terms.get('sp_short'), x, y, 1);
    var color = actor.sp <= actor.maxSp() / 4 ? 4 : 0;
    this.text(String(actor.sp), x + 12 + 18, y, color, { align: 'right' });
    this.text('/', x + 30, y, 0);
    this.text(String(actor.maxSp()), x + 36 + 18, y, 0, { align: 'right' });
  },
  drawActorExp: function (actor, x, y) {
    this.text(Terms.get('exp_short'), x, y, 1);
    this.text(String(actor.exp), x + 12 + 42, y, 0, { align: 'right' });
    this.text('/', x + 54, y, 0);
    this.text(actor.nextExpString(), x + 60 + 42, y, 0, { align: 'right' });
  },
  drawGold: function (x, y) {
    var gold = Terms.get('gold');
    this.text(gold, this.cw() - 2, y, 1, { align: 'right' });
    this.text(String(Party.gold), this.cw() - 2 - Font.width(gold), y, 0, { align: 'right' });
  },
};

/* --------------------------------------------------------------------------- */

function Window_Selectable(x, y, w, h) {
  Window_Base.call(this, x, y, w, h);
  this.index = -1;
  this.columns = 1;
  this.itemMax = 0;
  this.rowHeight = 16;
  this.itemW = 0;          /* 0 = auto */
  this.topRow = 0;
  this.cursorAlt = false;
  this.wrap = true;
  this.onOk = null;
  this.onCancel = null;
  this.helpWindow = null;
}
Window_Selectable.prototype = Object.create(Window_Base.prototype);
Object.assign(Window_Selectable.prototype, {
  pageRows: function () { return Math.floor(this.ch() / this.rowHeight); },
  itemWidth: function () { return this.itemW || Math.floor(this.cw() / this.columns); },
  itemRect: function (i) {
    var iw = this.itemWidth();
    return { x: (i % this.columns) * iw, y: Math.floor(i / this.columns) * this.rowHeight, w: iw, h: this.rowHeight };
  },
  setIndex: function (i) {
    this.index = i;
    if (i >= 0) {
      var row = Math.floor(i / this.columns);
      if (row < this.topRow) this.topRow = row;
      if (row >= this.topRow + this.pageRows()) this.topRow = row - this.pageRows() + 1;
      this.oy = this.topRow * this.rowHeight;
    }
  },
  cursorMove: function () {
    if (this.itemMax <= 0 || this.index < 0) return;
    var rows = Math.ceil(this.itemMax / this.columns);
    var i = this.index, col = i % this.columns, row = Math.floor(i / this.columns);
    var moved = false;
    if (Input.repeated('down')) {
      if (row < rows - 1) { i = Math.min(this.itemMax - 1, i + this.columns); moved = true; }
      else if (this.wrap && rows > 1) { i = col; moved = true; }
    } else if (Input.repeated('up')) {
      if (row > 0) { i -= this.columns; moved = true; }
      else if (this.wrap && rows > 1) { i = Math.min(this.itemMax - 1, (rows - 1) * this.columns + col); moved = true; }
    } else if (Input.repeated('right')) {
      if (this.columns > 1) {
        if (col < this.columns - 1 && i + 1 < this.itemMax) { i++; moved = true; }
        else if (this.wrap) { i = row * this.columns; moved = true; }
      }
    } else if (Input.repeated('left')) {
      if (this.columns > 1) {
        if (col > 0) { i--; moved = true; }
        else if (this.wrap) { i = Math.min(this.itemMax - 1, row * this.columns + this.columns - 1); moved = true; }
      }
    }
    if (moved && i !== this.index) { this.setIndex(i); Audio_.sys('cursor'); }
  },
  update: function () {
    Window_Base.prototype.update.call(this);
    if (!this.active || !this.isOpen()) return;
    this.cursorMove();
    if (Input.triggered('ok') && this.onOk) { Input.consume('ok'); this.onOk(this.index); }
    else if (Input.triggered('cancel') && this.onCancel) { Input.consume('cancel'); this.onCancel(); }
  },
  drawUnderContents: function (ctx) {
    if (this.index >= 0 && this.itemMax > 0) {
      var r = this.itemRect(this.index);
      var y = this.y + 8 + r.y - this.oy;
      if (y >= this.y + 8 - 1 && y + r.h <= this.y + this.height - 8 + 1) {
        var blink = !this.active;
        Gfx.drawCursor(ctx, this.x + 8 + r.x - 4, y - 0, r.w + 8, r.h, blink);
      }
    }
  },
  drawExtras: function (ctx) {
    Window_Base.prototype.drawExtras.call(this, ctx);
    if (this.topRow > 0) Gfx.drawUpArrow(ctx, this.x + this.width / 2 - 8, this.y);
    if ((this.topRow + this.pageRows()) * this.columns < this.itemMax) Gfx.drawPauseArrow(ctx, this.x + this.width / 2 - 8, this.y + this.height - 8);
  },
});

/* --------------------------------------------------------------------------- */

function Window_Command(x, y, w, commands, columns) {
  var cols = columns || 1;
  var rows = Math.ceil(commands.length / cols);
  Window_Selectable.call(this, x, y, w, rows * 16 + 16);
  this.commands = commands;
  this.disabled = {};
  this.columns = cols;
  this.itemMax = commands.length;
  this.index = 0;
}
Window_Command.prototype = Object.create(Window_Selectable.prototype);
Object.assign(Window_Command.prototype, {
  setCommands: function (cmds) {
    this.commands = cmds;
    this.itemMax = cmds.length;
    var rows = Math.ceil(cmds.length / this.columns);
    var h = rows * 16 + 16;
    if (h !== this.height) {
      this.height = h;
      this.contents = Gfx.makeCanvas(Math.max(1, this.width - 16), Math.max(1, h - 16));
      this.cctx = this.contents.getContext('2d');
      this.cctx.imageSmoothingEnabled = false;
    }
    this.dirty = true;
  },
  refresh: function () {
    this.clear();
    for (var i = 0; i < this.commands.length; i++) {
      var r = this.itemRect(i);
      this.text(this.commands[i], r.x, r.y, this.disabled[i] ? 3 : 0);
    }
    this.dirty = false;
  },
});

/* Simple help / one-line text window */
function Window_Help(x, y, w, h) {
  Window_Base.call(this, x, y, w, h || 32);
  this.textValue = '';
}
Window_Help.prototype = Object.create(Window_Base.prototype);
Object.assign(Window_Help.prototype, {
  setText: function (s) { if (s !== this.textValue) { this.textValue = s; this.dirty = true; } },
  refresh: function () { this.clear(); this.text(this.textValue, 0, 0, 0); this.dirty = false; },
});
