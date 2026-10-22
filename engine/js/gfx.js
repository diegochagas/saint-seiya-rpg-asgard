/* Canvas setup and low level drawing helpers (window skin pieces, tiles, fades). */
var Gfx = {
  canvas: null,
  ctx: null,
  systemName: null,
  system: null,

  init: function () {
    this.canvas = document.getElementById('game');
    this.ctx = this.canvas.getContext('2d');
    this.ctx.imageSmoothingEnabled = false;
    this.fit();
    window.addEventListener('resize', this.fit.bind(this));
  },

  /* integer-scale the 320x240 canvas into the stage */
  fit: function () {
    var stage = document.getElementById('stage');
    var w = stage.clientWidth, h = stage.clientHeight;
    var exact = Math.min(w / CONFIG.SCREEN_W, h / CONFIG.SCREEN_H);
    /* integer scaling keeps pixels crisp; below 2x (phones) use the exact fit instead of wasting space */
    var scale = Math.floor(exact) >= 2 ? Math.floor(exact) : exact;
    if (scale <= 0) scale = 1;
    this.canvas.style.width = Math.floor(CONFIG.SCREEN_W * scale) + 'px';
    this.canvas.style.height = Math.floor(CONFIG.SCREEN_H * scale) + 'px';
  },

  makeCanvas: function (w, h) {
    var c = document.createElement('canvas');
    c.width = Math.max(1, w);
    c.height = Math.max(1, h);
    var ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    return c;
  },

  setSystem: function (name) {
    var img = Loader.image('system', name) || Loader.image('system', Loader.db.system.system_name);
    this.systemName = name;
    this.system = img;
    Font.invalidate();
  },

  /* tile a region of src over dst rect */
  tile: function (ctx, src, sx, sy, sw, sh, dx, dy, dw, dh) {
    for (var y = 0; y < dh; y += sh) {
      for (var x = 0; x < dw; x += sw) {
        var w = Math.min(sw, dw - x), h = Math.min(sh, dh - y);
        ctx.drawImage(src, sx, sy, w, h, dx + x, dy + y, w, h);
      }
    }
  },

  /* Draw a window background + frame using the System graphic. */
  drawWindow: function (ctx, x, y, w, h, opts) {
    opts = opts || {};
    var sys = this.system;
    if (!sys) return;
    if (!opts.noBackground) {
      ctx.save();
      ctx.globalAlpha = opts.backOpacity != null ? opts.backOpacity : 1;
      if (Loader.db.system.message_stretch === 1) {
        this.tile(ctx, sys, 0, 0, 32, 32, x, y, w, h);
      } else {
        ctx.drawImage(sys, 0, 0, 32, 32, x, y, w, h);
      }
      ctx.restore();
    }
    if (opts.noFrame) return;
    /* edges */
    this.tile(ctx, sys, 40, 0, 16, 8, x + 8, y, w - 16, 8);
    this.tile(ctx, sys, 40, 24, 16, 8, x + 8, y + h - 8, w - 16, 8);
    this.tile(ctx, sys, 32, 8, 8, 16, x, y + 8, 8, h - 16);
    this.tile(ctx, sys, 56, 8, 8, 16, x + w - 8, y + 8, 8, h - 16);
    /* corners */
    ctx.drawImage(sys, 32, 0, 8, 8, x, y, 8, 8);
    ctx.drawImage(sys, 56, 0, 8, 8, x + w - 8, y, 8, 8);
    ctx.drawImage(sys, 32, 24, 8, 8, x, y + h - 8, 8, 8);
    ctx.drawImage(sys, 56, 24, 8, 8, x + w - 8, y + h - 8, 8, 8);
  },

  /* Selection cursor (32x32 skin piece at 64,0 / 96,0) */
  /* 9-slice cursor from the system graphic (32x32 at 64,0 / 96,0); corners shrink for the
     14px rows of RM2003's small battle windows */
  drawCursor: function (ctx, x, y, w, h, alt) {
    var sys = this.system;
    if (!sys || w < 4 || h < 4) return;
    var bx = alt ? 96 : 64;
    var c = Math.min(8, Math.floor(h / 2), Math.floor(w / 2));
    this.tile(ctx, sys, bx + 8, 8, 16, 16, x + c, y + c, w - 2 * c, h - 2 * c);
    ctx.drawImage(sys, bx + 8, 0, 16, 8, x + c, y, w - 2 * c, c);
    ctx.drawImage(sys, bx + 8, 24, 16, 8, x + c, y + h - c, w - 2 * c, c);
    ctx.drawImage(sys, bx, 8, 8, 16, x, y + c, c, h - 2 * c);
    ctx.drawImage(sys, bx + 24, 8, 8, 16, x + w - c, y + c, c, h - 2 * c);
    ctx.drawImage(sys, bx, 0, 8, 8, x, y, c, c);
    ctx.drawImage(sys, bx + 24, 0, 8, 8, x + w - c, y, c, c);
    ctx.drawImage(sys, bx, 24, 8, 8, x, y + h - c, c, c);
    ctx.drawImage(sys, bx + 24, 24, 8, 8, x + w - c, y + h - c, c, c);
  },

  drawPauseArrow: function (ctx, x, y) {
    if (this.system) ctx.drawImage(this.system, 40, 16, 16, 8, x, y, 16, 8);
  },
  drawUpArrow: function (ctx, x, y) {
    if (this.system) ctx.drawImage(this.system, 40, 8, 16, 8, x, y, 16, 8);
  },

  fillRect: function (ctx, x, y, w, h, color) {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, h);
  },
};
