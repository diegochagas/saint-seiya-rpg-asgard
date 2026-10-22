/* Enemy action choice (RPG_RT-compatible mode of EasyRPG enemyai.cpp): every usable action gets
   priority rating - best + 10 (minimum 0), then one is drawn at random weighted by priority. */
var ENEMY_KIND = { BASIC: 0, SKILL: 1, TRANSFORM: 2 };
var ENEMY_BASIC = { ATTACK: 0, DUAL: 1, DEFENSE: 2, OBSERVE: 3, CHARGE: 4, SELF_DESTRUCT: 5, ESCAPE: 6, NOTHING: 7 };
var ENEMY_CONDITION = { ALWAYS: 0, SWITCH: 1, TURN: 2, ENEMY_COUNT: 3, HP: 4, SP: 5, PARTY_LEVEL: 6, FATIGUE: 7 };

var EnemyAI = {
  inRange: function (v, act) { return v >= act.condition_param1 && v <= act.condition_param2; },
  percent: function (cur, max) { return max > 0 ? Math.floor((cur * 100) / max) : 0; },
  /** @returns {boolean} the action's condition holds for this enemy right now */
  conditionHolds: function (e, act, battle) {
    switch (act.condition_type) {
      case ENEMY_CONDITION.SWITCH: return GameState.sw(act.switch_id);
      case ENEMY_CONDITION.TURN: return BattleRules.checkTurns(battle.turn, act.condition_param2, act.condition_param1);
      case ENEMY_CONDITION.ENEMY_COUNT: return this.inRange(battle.activeEnemies().length, act);
      case ENEMY_CONDITION.HP: return this.inRange(this.percent(e.hp, e.maxHp()), act);
      case ENEMY_CONDITION.SP: return this.inRange(this.percent(e.sp, e.maxSp()), act);
      case ENEMY_CONDITION.PARTY_LEVEL: return this.inRange(Party.averageLevel(), act);
      case ENEMY_CONDITION.FATIGUE: return this.inRange(BattleRules.fatigue(Party.members), act);
    }
    return true;
  },
  usable: function (e, act, battle) {
    if (act.kind === ENEMY_KIND.SKILL) {
      var sk = DB.skill(act.skill_id);
      if (!sk || BattleRules.skillCost(e, sk) > e.sp) return false;
    }
    return this.conditionHolds(e, act, battle);
  },
  /** @returns {object|null} the chosen EnemyAction, null when nothing is usable */
  choose: function (e, battle) {
    var self = this;
    var list = Object.keys(e.data.actions).map(function (k) { return e.data.actions[k]; })
      .filter(function (a) { return self.usable(e, a, battle); });
    if (!list.length) return null;
    var best = Math.max.apply(null, list.map(function (a) { return a.rating; }));
    var weights = list.map(function (a) { return Math.max(0, a.rating - best + 10); });
    var total = weights.reduce(function (s, w) { return s + w; }, 0);
    var roll = Rand.int(0, Math.max(0, total - 1));
    for (var i = 0; i < list.length; i++) {
      if (roll < weights[i]) return list[i];
      roll -= weights[i];
    }
    return list[list.length - 1];
  },
};
