/* ConditionalBranch (12010) checks and ControlVariables (10220) operands. */
var FACING_TO_NUMPAD = { 0: 8, 1: 6, 2: 2, 3: 4 };   /* our DIR -> RPG Maker's 8/6/2/4 */

var VariableOperands = {
  actorStat: function (a, which) {
    return [a.level, a.exp, a.hp, a.sp, a.maxHp(), a.maxSp(), a.atk(), a.def(), a.spi(), a.agi(),
      a.equip[0], a.equip[1], a.equip[2], a.equip[3], a.equip[4]][which] || 0;
  },
  characterStat: function (ch, which) {
    return [GameMap.id, ch.x, ch.y, FACING_TO_NUMPAD[ch.facing], ch.screenX() - GameMap.ox + 8, ch.screenY() - GameMap.oy + 8][which] || 0;
  },
  otherStat: function (which) {
    return [Party.gold, 0, Party.size(), GameState.saveCount, 0, 0, 0, Math.floor(GameState.playTime / 60), 0][which] || 0;
  },
  /** @returns {number} the operand of a ControlVariables command */
  value: function (it, p) {
    switch (p[4]) {
      case 0: return p[5];
      case 1: return GameState.v(p[5]);
      case 2: return GameState.v(GameState.v(p[5]));
      case 3: return Rand.int(Math.min(p[5], p[6]), Math.max(p[5], p[6]));
      case 4: return p[6] === 0 ? Party.itemCount(p[5]) : Party.equippedCount(p[5]);
      case 5: { var a = Party.actor(p[5]); return a ? this.actorStat(a, p[6]) : 0; }
      case 6: { var ch = it.character(p[5]); return ch ? this.characterStat(ch, p[6]) : 0; }
      case 7: return this.otherStat(p[5]);
    }
    return 0;
  },
  /** @returns {number} cur (op) value: set, add, sub, mul, div, mod */
  apply: function (op, cur, value) {
    switch (op) {
      case 0: return value;
      case 1: return cur + value;
      case 2: return cur - value;
      case 3: return cur * value;
      case 4: return value !== 0 ? Math.trunc(cur / value) : cur;
      case 5: return value !== 0 ? cur % value : 0;
    }
    return cur;
  },
};

var EventConditions = {
  compare: function (op, a, b) {
    return [a === b, a >= b, a <= b, a > b, a < b, a !== b][op] || false;
  },
  actor: function (p, s) {
    var a = Party.actor(p[1]);
    if (!a) return false;
    switch (p[2]) {
      case 0: return Party.has(p[1]);
      case 1: return a.name === s;
      case 2: return a.level >= p[3];
      case 3: return a.hp >= p[3];
      case 4: return a.skills.indexOf(p[3]) >= 0;
      case 5: return a.equip.indexOf(p[3]) >= 0;
      case 6: return a.states.indexOf(p[3]) >= 0;
    }
    return false;
  },
  hasItem: function (id) { return Party.hasItem(id) || Party.equippedCount(id) > 0; },
  /** @returns {boolean} whether the branch condition of command c holds */
  check: function (it, c) {
    var p = c.params;
    switch (p[0]) {
      case 0: return GameState.sw(p[1]) === (p[2] === 0);
      case 1: return this.compare(p[4], GameState.v(p[1]), it.valueOr(p[2], p[3]));
      case 3: return p[2] === 0 ? Party.gold >= p[1] : Party.gold <= p[1];
      case 4: return this.hasItem(p[1]) === (p[2] === 0);
      case 5: return this.actor(p, c.string);
      case 6: { var ch = it.character(p[1]); return !!ch && ch.facing === p[2]; }   /* both 0 up, 1 right, 2 down, 3 left */
      case 8: return Input.pressed('ok');
      case 9: return true;   /* "timer" / vehicle conditions: not used */
    }
    return false;
  },
};
