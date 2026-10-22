/* Tile layers: chipset drawing with autotiles (RM2000/2003 chipset layout) and passability. */

/* EasyRPG tables: block A/B subtile layout and block D quarter coordinates */
var BLOCK_A_SUBTILES = [
  [[-1,-1],[-1,-1]],[[3,-1],[-1,-1]],[[-1,3],[-1,-1]],[[3,3],[-1,-1]],[[-1,-1],[-1,3]],[[3,-1],[-1,3]],[[-1,3],[-1,3]],[[3,3],[-1,3]],
  [[-1,-1],[3,-1]],[[3,-1],[3,-1]],[[-1,3],[3,-1]],[[3,3],[3,-1]],[[-1,-1],[3,3]],[[3,-1],[3,3]],[[-1,3],[3,3]],[[3,3],[3,3]],
  [[1,-1],[1,-1]],[[1,3],[1,-1]],[[1,-1],[1,3]],[[1,3],[1,3]],[[2,2],[-1,-1]],[[2,2],[-1,3]],[[2,2],[3,-1]],[[2,2],[3,3]],
  [[-1,1],[-1,1]],[[-1,1],[3,1]],[[3,1],[-1,1]],[[3,1],[3,1]],[[-1,-1],[2,2]],[[3,-1],[2,2]],[[-1,3],[2,2]],[[3,3],[2,2]],
  [[1,1],[1,1]],[[2,2],[2,2]],[[0,2],[1,-1]],[[0,2],[1,3]],[[2,0],[-1,1]],[[2,0],[3,1]],[[-1,1],[2,0]],[[3,1],[2,0]],
  [[1,-1],[0,2]],[[1,3],[0,2]],[[0,0],[1,1]],[[0,2],[0,2]],[[1,1],[0,0]],[[2,0],[2,0]],[[0,0],[0,0]]];

var BLOCK_D_SUBTILES = [
  [[[1,2],[1,2]],[[1,2],[1,2]]],[[[2,0],[1,2]],[[1,2],[1,2]]],[[[1,2],[2,0]],[[1,2],[1,2]]],[[[2,0],[2,0]],[[1,2],[1,2]]],
  [[[1,2],[1,2]],[[1,2],[2,0]]],[[[2,0],[1,2]],[[1,2],[2,0]]],[[[1,2],[2,0]],[[1,2],[2,0]]],[[[2,0],[2,0]],[[1,2],[2,0]]],
  [[[1,2],[1,2]],[[2,0],[1,2]]],[[[2,0],[1,2]],[[2,0],[1,2]]],[[[1,2],[2,0]],[[2,0],[1,2]]],[[[2,0],[2,0]],[[2,0],[1,2]]],
  [[[1,2],[1,2]],[[2,0],[2,0]]],[[[2,0],[1,2]],[[2,0],[2,0]]],[[[1,2],[2,0]],[[2,0],[2,0]]],[[[2,0],[2,0]],[[2,0],[2,0]]],
  [[[0,2],[0,2]],[[0,2],[0,2]]],[[[0,2],[2,0]],[[0,2],[0,2]]],[[[0,2],[0,2]],[[0,2],[2,0]]],[[[0,2],[2,0]],[[0,2],[2,0]]],
  [[[1,1],[1,1]],[[1,1],[1,1]]],[[[1,1],[1,1]],[[1,1],[2,0]]],[[[1,1],[1,1]],[[2,0],[1,1]]],[[[1,1],[1,1]],[[2,0],[2,0]]],
  [[[2,2],[2,2]],[[2,2],[2,2]]],[[[2,2],[2,2]],[[2,0],[2,2]]],[[[2,0],[2,2]],[[2,2],[2,2]]],[[[2,0],[2,2]],[[2,0],[2,2]]],
  [[[1,3],[1,3]],[[1,3],[1,3]]],[[[2,0],[1,3]],[[1,3],[1,3]]],[[[1,3],[2,0]],[[1,3],[1,3]]],[[[2,0],[2,0]],[[1,3],[1,3]]],
  [[[0,2],[2,2]],[[0,2],[2,2]]],[[[1,1],[1,1]],[[1,3],[1,3]]],[[[0,1],[0,1]],[[0,1],[0,1]]],[[[0,1],[0,1]],[[0,1],[2,0]]],
  [[[2,1],[2,1]],[[2,1],[2,1]]],[[[2,1],[2,1]],[[2,0],[2,1]]],[[[2,3],[2,3]],[[2,3],[2,3]]],[[[2,0],[2,3]],[[2,3],[2,3]]],
  [[[0,3],[0,3]],[[0,3],[0,3]]],[[[0,3],[2,0]],[[0,3],[0,3]]],[[[0,1],[2,1]],[[0,1],[2,1]]],[[[0,1],[0,1]],[[0,3],[0,3]]],
  [[[0,3],[2,3]],[[0,3],[2,3]]],[[[2,1],[2,1]],[[2,3],[2,3]]],[[[0,1],[2,1]],[[0,3],[2,3]]],[[[1,2],[1,2]],[[1,2],[1,2]]],
  [[[1,2],[1,2]],[[1,2],[1,2]]],[[[0,0],[0,0]],[[0,0],[0,0]]]];


Object.assign(GameMap, {
  /* ---- tiles ---- */
  buildLayers: function () {
    var w = this.width, h = this.height;
    var lower = this.data.lower_layer, upper = this.data.upper_layer;
    var animated = lower.some(function (t) { return t < TILES.BLOCK_D; });
    var frames = animated ? 4 : 1;
    this.lowerCanvas = [];
    for (var f = 0; f < frames; f++) {
      var cv = Gfx.makeCanvas(w * 16, h * 16), ctx = cv.getContext('2d');
      for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) this.drawLowerTile(ctx, lower[x + y * w], x * 16, y * 16, f);
      this.lowerCanvas.push(cv);
    }
    var uc = Gfx.makeCanvas(w * 16, h * 16), uctx = uc.getContext('2d');
    for (var y2 = 0; y2 < h; y2++) for (var x2 = 0; x2 < w; x2++) this.drawUpperTile(uctx, upper[x2 + y2 * w], x2 * 16, y2 * 16);
    this.upperCanvas = uc;
  },
  drawChip: function (ctx, col, row, dx, dy) {
    ctx.drawImage(this.chipsetImg, col * 16, row * 16, 16, 16, dx, dy, 16, 16);
  },
  drawQuarter: function (ctx, qx, qy, i, j, dx, dy) {
    ctx.drawImage(this.chipsetImg, (qx * 2 + i) * 8, (qy * 2 + j) * 8, 8, 8, dx + i * 8, dy + j * 8, 8, 8);
  },
  drawLowerTile: function (ctx, id, dx, dy, frame) {
    if (!this.chipsetImg) return;
    var animAB = frame % 4; if (animAB === 3) animAB = 1;     /* reciprocating 0,1,2,1 */
    if (this.chipset.animation_type === 1) animAB = frame % 3; /* cyclic */
    var i, j;
    if (id >= TILES.BLOCK_E) {
      var e = id - TILES.BLOCK_E;
      var col, row;
      if (e < 96) { col = 12 + e % 6; row = Math.floor(e / 6); } else { col = 18 + (e - 96) % 6; row = Math.floor((e - 96) / 6); }
      this.drawChip(ctx, col, row, dx, dy);
    } else if (id >= TILES.BLOCK_D) {
      var block = Math.floor((id - 4000) / 50), sub = (id - 4000) % 50;
      if (block >= 12 || sub >= 50) return;
      var bx, by;
      if (block < 4) { bx = (block % 2) * 3; by = 8 + Math.floor(block / 2) * 4; }
      else { bx = 6 + (block % 2) * 3; by = Math.floor((block - 4) / 2) * 4; }
      for (j = 0; j < 2; j++) for (i = 0; i < 2; i++) {
        var q = BLOCK_D_SUBTILES[sub][j][i];
        this.drawQuarter(ctx, bx + q[0], by + q[1], i, j, dx, dy);
      }
    } else if (id >= TILES.BLOCK_C) {
      var cc = 3 + Math.floor((id - 3000) / 50), cr = 4 + (frame % 4);
      this.drawChip(ctx, cc, cr, dx, dy);
    } else {
      var blk = Math.floor(id / 1000), bsub = Math.floor((id - blk * 1000) / 50), asub = id - blk * 1000 - bsub * 50;
      if (bsub >= 16 || asub >= 47) return;
      var quarters = [[null, null], [null, null]];
      for (j = 0; j < 2; j++) for (i = 0; i < 2; i++) {
        if (BLOCK_A_SUBTILES[asub][j][i] !== -1) continue;
        var t = (bsub >> (j * 2 + i)) & 1;
        if (blk === 2) t ^= 3;
        quarters[j][i] = [animAB, 4 + t];
      }
      for (j = 0; j < 2; j++) for (i = 0; i < 2; i++) {
        if (BLOCK_A_SUBTILES[asub][j][i] === -1) continue;
        quarters[j][i] = [animAB + (blk === 1 ? 3 : 0), BLOCK_A_SUBTILES[asub][j][i]];
      }
      if (bsub !== 0 && asub !== 0) {
        for (j = 0; j < 2; j++) for (i = 0; i < 2; i++) {
          var t2 = (bsub >> (j * 2 + i)) & 1;
          if (blk === 2) t2 *= 2;
          if (t2 === 0) continue;
          quarters[j][i] = [animAB, 4 + t2];
        }
      }
      for (j = 0; j < 2; j++) for (i = 0; i < 2; i++) {
        var qq = quarters[j][i];
        if (qq) this.drawQuarter(ctx, qq[0], qq[1], i, j, dx, dy);
      }
    }
  },
  drawUpperTile: function (ctx, id, dx, dy) {
    if (!this.chipsetImg || id < TILES.BLOCK_F) return;
    var f = id - TILES.BLOCK_F;
    var col, row;
    if (f < 48) { col = 18 + f % 6; row = 8 + Math.floor(f / 6); } else { col = 24 + (f - 48) % 6; row = Math.floor((f - 48) / 6); }
    this.drawChip(ctx, col, row, dx, dy);
  },

  /* ---- passability / terrain ---- */
  lowerIndex: function (id) {
    if (id >= TILES.BLOCK_E) return TILES.INDEX_E + (id - TILES.BLOCK_E);
    if (id >= TILES.BLOCK_D) return TILES.INDEX_D + Math.floor((id - TILES.BLOCK_D) / 50);
    if (id >= TILES.BLOCK_C) return TILES.INDEX_C + Math.floor((id - TILES.BLOCK_C) / 50);
    return Math.floor(id / 1000);
  },
  lowerPass: function (x, y) {
    var id = this.data.lower_layer[x + y * this.width];
    var idx = this.lowerIndex(id);
    var p = this.chipset.passable_data_lower[idx];
    if (id >= TILES.BLOCK_D && id < TILES.BLOCK_E && (p & TILES.PASS_WALL)) {
      var a = (id - TILES.BLOCK_D) % 50;
      if ((a >= 20 && a <= 23) || (a >= 33 && a <= 37) || a === 42 || a === 43 || a === 45 || a === 46) return 0xF;
    }
    return p;
  },
  upperPass: function (x, y) {
    var id = this.data.upper_layer[x + y * this.width];
    if (id < TILES.BLOCK_F) return -1;
    return this.chipset.passable_data_upper[id - TILES.BLOCK_F];
  },
});
