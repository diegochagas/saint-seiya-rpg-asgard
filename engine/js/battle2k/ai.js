/* RPG Maker 2000 battle: enemy action choice. Actions whose condition holds compete; those
   rated within 10 of the best are picked weighted by rating. Part of SceneBattle2k (see scene.js). */
var BATTLE2K_ACTION_CONDITION = { SWITCH: 1, TURNS: 2, ENEMY_COUNT: 3, HP: 4, SP: 5, PARTY_LEVEL: 6 };
var BATTLE2K_ACTION_KIND = { BASIC: 0, SKILL: 1, TRANSFORM: 2 };
/* enemy basic actions 1..7 (0 is a normal attack) */
var BATTLE2K_BASIC_TYPES = [null, 'attack', 'defend', 'observe', 'charge', 'selfdestruct', 'escape', 'nothing'];
var BATTLE2K_RATING_WINDOW = 10;

function battle2kInRange(v, lo, hi) { return v >= lo && v <= hi; }

Object.assign(SceneBattle2k.prototype, {
  /** @returns {boolean} whether enemy e may use action a this turn */
  enemyActionAllowed: function (e, a) {
    var C = BATTLE2K_ACTION_CONDITION, p1 = a.condition_param1, p2 = a.condition_param2;
    switch (a.condition_type) {
      case C.SWITCH: return GameState.sw(a.switch_id);
      case C.TURNS: return p2 === 0 ? this.turn === p1 : (this.turn >= p1 && (this.turn - p1) % p2 === 0);
      case C.ENEMY_COUNT: return battle2kInRange(this.alive().length, p1, p2);
      case C.HP: return battle2kInRange(e.hp * 100 / e.maxHp(), p1, p2);
      case C.SP: return battle2kInRange(e.maxSp() ? e.sp * 100 / e.maxSp() : 0, p1, p2);
      case C.PARTY_LEVEL: return battle2kInRange(Party.averageLevel(), p1, p2);
      default: return true;
    }
  },
  /** rating-weighted pick among the actions rated close to the best one */
  pickEnemyAction: function (valid) {
    var max = Math.max.apply(null, valid.map(function (a) { return a.rating; }));
    var pool = valid.filter(function (a) { return a.rating >= max - BATTLE2K_RATING_WINDOW; });
    var total = pool.reduce(function (s, a) { return s + a.rating; }, 0), r = Rand.next() * total;
    for (var i = 0; i < pool.length; i++) { r -= pool[i].rating; if (r <= 0) return pool[i]; }
    return pool[0];
  },
  enemyAction: function (e) {
    var self = this, list = Object.keys(e.data.actions).map(function (k) { return e.data.actions[k]; });
    var valid = list.filter(function (a) { return self.enemyActionAllowed(e, a); });
    if (!valid.length) return { actor: e, type: 'attack', enemy: true, target: this.randomActor() };
    return this.enemyActionFor(e, this.pickEnemyAction(valid));
  },
  enemyActionFor: function (e, pick) {
    var act = { actor: e, enemy: true, action: pick };
    if (pick.kind === BATTLE2K_ACTION_KIND.SKILL) {
      var sk = DB.skill(pick.skill_id);
      return Object.assign(act, { type: 'skill', skill: pick.skill_id, target: sk && sk.scope <= BATTLE2K_SCOPE.ALL_ENEMIES ? this.randomActor() : null });
    }
    if (pick.kind === BATTLE2K_ACTION_KIND.TRANSFORM) return Object.assign(act, { type: 'transform', transform: pick.enemy_id });
    act.type = BATTLE2K_BASIC_TYPES[pick.basic] || 'attack';
    if (act.type === 'attack') { act.target = this.randomActor(); act.dual = pick.basic === 1; }
    return act;
  },
});
