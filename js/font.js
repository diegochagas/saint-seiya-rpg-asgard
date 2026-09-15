/* Bitmap text rendering with the original RM2000 fonts and System.png colour cells.
   Colour n uses the 16x16 cell at (n%10*16, 48 + n/10*16); shadow uses cell (16,32). */
var Font = {
  cache: {},
  shadowColor: '#000',
  cellH: 13,

  invalidate: function () {
    this.cache = {};
    var sys = Gfx.system;
    if (sys) {
      var c = Gfx.makeCanvas(1, 1);
      c.getContext('2d').drawImage(sys, 24, 40, 1, 1, 0, 0, 1, 1);
      var d = c.getContext('2d').getImageData(0, 0, 1, 1).data;
      this.shadowColor = 'rgb(' + d[0] + ',' + d[1] + ',' + d[2] + ')';
    }
  },

  fontKey: function () {
    return Loader.db.system.font_id === 1 ? 'rmg2000' : 'rm2000';
  },

  /* returns a 6x16 canvas with the glyph in colour `color` (with shadow) */
  glyph: function (code, color, noShadow) {
    var key = this.fontKey() + ':' + code + ':' + color + ':' + (noShadow ? 1 : 0);
    var g = this.cache[key];
    if (g) return g;
    var font = Loader.fonts[this.fontKey()];
    var cw = 16;
    var sx = (code % 16) * cw, sy = Math.floor(code / 16) * cw;
    var out = Gfx.makeCanvas(8, 16);
    var ctx = out.getContext('2d');
    var mask = Gfx.makeCanvas(8, 16);
    var mctx = mask.getContext('2d');
    mctx.drawImage(font.img, sx, sy, 8, this.cellH, 0, 1, 8, this.cellH);
    if (!noShadow) {
      mctx.globalCompositeOperation = 'source-in';
      mctx.fillStyle = this.shadowColor;
      mctx.fillRect(0, 0, 8, 16);
      ctx.drawImage(mask, 1, 1);
      mctx.globalCompositeOperation = 'source-over';
      mctx.clearRect(0, 0, 8, 16);
      mctx.drawImage(font.img, sx, sy, 8, this.cellH, 0, 1, 8, this.cellH);
    }
    mctx.globalCompositeOperation = 'source-in';
    if (Gfx.system) {
      var cx = (color % 10) * 16, cy = 48 + Math.floor(color / 10) * 16;
      /* the glyph occupies rows 1..13 of the 16px line; take the matching rows of the colour cell */
      mctx.drawImage(Gfx.system, cx, cy, 16, 16, 0, 0, 16, 16);
    } else {
      mctx.fillStyle = '#fff';
      mctx.fillRect(0, 0, 8, 16);
    }
    ctx.drawImage(mask, 0, 0);
    this.cache[key] = out;
    return out;
  },

  /* map a JS string char to the cp1252 code used by the atlas */
  codeOf: function (ch) {
    var c = ch.charCodeAt(0);
    if (c < 256) return c;
    var map = { 0x20AC: 128, 0x201A: 130, 0x0192: 131, 0x201E: 132, 0x2026: 133, 0x2020: 134, 0x2021: 135,
      0x02C6: 136, 0x2030: 137, 0x0160: 138, 0x2039: 139, 0x0152: 140, 0x017D: 142, 0x2018: 145, 0x2019: 146,
      0x201C: 147, 0x201D: 148, 0x2022: 149, 0x2013: 150, 0x2014: 151, 0x02DC: 152, 0x2122: 153, 0x0161: 154,
      0x203A: 155, 0x0153: 156, 0x017E: 158, 0x0178: 159 };
    return map[c] || 63;
  },

  draw: function (ctx, text, x, y, color, opts) {
    opts = opts || {};
    color = color || 0;
    var adv = CONFIG.FONT_ADVANCE;
    var s = String(text);
    if (opts.align === 'right') x -= s.length * adv;
    else if (opts.align === 'center') x -= Math.floor(s.length * adv / 2);
    for (var i = 0; i < s.length; i++) {
      var ch = s[i];
      if (ch === ' ') { x += adv; continue; }
      ctx.drawImage(this.glyph(this.codeOf(ch), color, opts.noShadow), x, y);
      x += adv;
    }
    return x;
  },

  width: function (text) { return String(text).length * CONFIG.FONT_ADVANCE; },
};
