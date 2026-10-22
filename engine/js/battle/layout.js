/* Where battlers stand (RPG Maker 2003 grid placement, EasyRPG Game_Battle grid tables) and the
   battle condition (normal / initiative / back attack / surround / pincers). Positions are sprite centres. */
var GRID_DEFAULT = { top: 112, elong: 392, incl: 16000 };
var GRID_X = [[0.5], [0, 1], [0, 0.5, 1], [0, 0.33, 0.66, 1], [0, 0.25, 0.5, 0.75, 1], [0, 0, 0.5, 0.5, 1, 1],
  [0, 0.25, 0.33, 0.5, 0.66, 0.75, 1], [0, 0, 0.33, 0.33, 0.66, 0.66, 1, 1]];
var GRID_ENEMY_Y = [[0.5], [0, 1], [0, 1, 0.5], [0, 0.75, 0.25, 1], [0, 0.5, 1, 0.25, 0.75], [0, 0.4, 0.8, 0.2, 0.6, 1],
  [0, 0.33, 0.66, 1, 0.25, 0.5, 1], [0, 0.28, 0.56, 0.84, 0.14, 0.42, 0.7, 0.98]];
var GRID_ENEMY_X_OFFSET = [[0], [24, 0], [48, 48, 0], [48, 48, 0, 0], [56, 56, 56, 8, 8], [56, 56, 56, 8, 8, 0],
  [64, 64, 64, 64, 16, 16, 16], [64, 64, 64, 64, 16, 16, 16, 16]];
var PLACEMENT_AUTOMATIC = 1;
var ACTOR_HALF = 24;   /* BattleCharSet cells are 48x48 */

var BattleLayout = {
  grid: function (terrainId) {
    var t = terrainId > 0 ? DB.terrain(terrainId) : null;
    if (!t || t.grid_inclination == null) return GRID_DEFAULT;
    return { top: t.grid_top_y, elong: t.grid_elongation, incl: t.grid_inclination };
  },
  /** @returns {{x:number, y:number}} grid point for slot idx of size (1-8) using the given y table */
  gridPoint: function (idx, size, yTable, grid) {
    var n = Math.max(1, Math.min(8, size)) - 1;
    var gx = Math.trunc((1 - GRID_X[n][idx]) * grid.incl / 1000);
    var gy = grid.top + Math.trunc(Math.sin(grid.elong / 1000) * 120 * yTable[n][idx]);
    return { x: gx, y: gy };
  },
  clampX: function (x, half) { return Math.max(half, Math.min(CONFIG.SCREEN_W - half, x)); },
  clampY: function (y, half) { return Math.max(half, Math.min(CONFIG.SCREEN_H - half, y)); },

  /** @returns {{x:number, y:number}} centre of party member idx */
  actorPosition: function (actor, idx, size, condition, terrainId) {
    var rowOff = actor.row === 1 ? 0 : ACTOR_HALF;
    if (Loader.db.battlecommands.placement !== PLACEMENT_AUTOMATIC) return this.manualActor(actor, rowOff, condition);
    var g = this.gridPoint(idx, size, GRID_X, this.grid(terrainId));
    var x = condition === CONDITION.BACK ? g.x + 2 * ACTOR_HALF - rowOff : CONFIG.SCREEN_W - (g.x + ACTOR_HALF + rowOff);
    return { x: this.clampX(x, ACTOR_HALF), y: g.y - ACTOR_HALF };
  },
  manualActor: function (actor, rowOff, condition) {
    var d = actor.data();
    var x = condition === CONDITION.BACK ? CONFIG.SCREEN_W - (d.battle_x + rowOff) : d.battle_x - rowOff;
    return { x: this.clampX(x, ACTOR_HALF), y: d.battle_y };
  },
  /** @returns {{x:number, y:number}} centre of a troop member; troop x/y unless auto alignment */
  enemyPosition: function (enemy, slot, count, condition, troop, terrainId) {
    var img = enemy.image(), halfW = img ? img.width / 2 : 16, halfH = img ? img.height / 2 : 16;
    if (!troop.auto_alignment) {
      var mx = condition === CONDITION.BACK ? CONFIG.SCREEN_W - enemy.member.x : enemy.member.x;
      return { x: mx, y: this.clampY(enemy.member.y, halfH) };
    }
    var n = Math.max(1, Math.min(8, count)) - 1;
    var g = this.gridPoint(slot, count, GRID_ENEMY_Y, this.grid(terrainId));
    var x = g.x + (GRID_ENEMY_X_OFFSET[n][slot] || 0) + halfW;
    if (condition === CONDITION.BACK) x = CONFIG.SCREEN_W - x;
    return { x: x, y: this.clampY(g.y - halfH, halfH) };
  },
  placeAll: function (actors, enemies, condition, troop, terrainId) {
    var self = this;
    actors.forEach(function (a, i) { var p = self.actorPosition(a, i, actors.length, condition, terrainId); a.x = p.x; a.y = p.y; a.homeX = p.x; a.homeY = p.y; });
    var visible = enemies.filter(function (e) { return !e.hidden; });
    enemies.forEach(function (e) {
      var slot = e.hidden ? e.index : visible.indexOf(e), count = e.hidden ? enemies.length : visible.length;
      var p = self.enemyPosition(e, slot, count, condition, troop, terrainId);
      e.x = p.x; e.y = p.y;
    });
  },

  /* Random encounters roll the terrain's special-battle chances (2003 has no 1/32 first strike). */
  randomCondition: function (terrainId) {
    var t = DB.terrain(terrainId);
    if (!t || !t.special_flags) return CONDITION.NONE;
    var f = t.special_flags;
    if (f.back_party && Rand.chance(t.special_back_party)) return CONDITION.INITIATIVE;
    if (f.back_enemies && Rand.chance(t.special_back_enemies)) return CONDITION.BACK;
    if (f.lateral_party && Rand.chance(t.special_lateral_party)) return CONDITION.SURROUND;
    if (f.lateral_enemies && Rand.chance(t.special_lateral_enemies)) return CONDITION.PINCERS;
    return CONDITION.NONE;
  },
  /* pincers/surround need automatic placement and more than one battler on the surrounded side */
  normalizeCondition: function (condition, visibleActors, visibleEnemies) {
    var manual = Loader.db.battlecommands.placement !== PLACEMENT_AUTOMATIC;
    if (condition === CONDITION.PINCERS && (manual || visibleEnemies <= 1)) return CONDITION.BACK;
    if (condition === CONDITION.SURROUND && (manual || visibleActors <= 1)) return CONDITION.INITIATIVE;
    return condition;
  },
};
