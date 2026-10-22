/* Troop event pages (when they run in 2003) and the battle-only event commands. */
var BEFORE_ACTION_FLAGS = ['turn', 'turn_enemy', 'turn_actor', 'command_actor'];
var AFTER_ACTION_FLAGS = ['switch_a', 'switch_b', 'variable', 'fatigue', 'enemy_hp', 'actor_hp'];
var PAGE_MOMENT = { START: 'start', BEFORE: 'before', AFTER: 'after' };

var TroopPages = {
  inRange: function (v, min, max) { return v >= min && v <= max; },
  percent: function (b) { return b ? Math.floor((b.hp * 100) / Math.max(1, b.maxHp())) : -1; },
  /* every flag a page sets must hold (EasyRPG game_interpreter_battle.cpp AreConditionsMet) */
  conditionsMet: function (c, battle, source) {
    var f = c.flags;
    if (f.switch_a && !GameState.sw(c.switch_a_id)) return false;
    if (f.switch_b && !GameState.sw(c.switch_b_id)) return false;
    if (f.variable && GameState.v(c.variable_id) < c.variable_value) return false;
    if (f.turn && !BattleRules.checkTurns(battle.turn, c.turn_b, c.turn_a)) return false;
    if (f.fatigue && !this.inRange(BattleRules.fatigue(Party.members), c.fatigue_min, c.fatigue_max)) return false;
    if (f.enemy_hp && !this.inRange(this.percent(battle.enemies[c.enemy_id]), c.enemy_hp_min, c.enemy_hp_max)) return false;
    if (f.actor_hp && !this.inRange(this.percent(Party.actor(c.actor_id)), c.actor_hp_min, c.actor_hp_max)) return false;
    return this.battlerConditionsMet(c, battle, source);
  },
  battlerConditionsMet: function (c, battle, source) {
    var f = c.flags;
    if (f.turn_enemy) {
      var e = battle.enemies[c.turn_enemy_id];
      if (!e || source !== e || !BattleRules.checkTurns(e.battleTurn, c.turn_enemy_b, c.turn_enemy_a)) return false;
    }
    if (f.turn_actor) {
      var a = Party.actor(c.turn_actor_id);
      if (!a || source !== a || !BattleRules.checkTurns(a.battleTurn || 0, c.turn_actor_b, c.turn_actor_a)) return false;
    }
    if (f.command_actor) {
      var ca = Party.actor(c.command_actor_id);
      if (!ca || source !== ca || ca.lastBattleCommand !== c.command_id) return false;
    }
    return true;
  },
  usesAny: function (flags, names) { return names.some(function (n) { return flags[n]; }); },
  /* which pages may fire at this moment of the turn */
  eligible: function (page, moment) {
    var f = page.condition.flags;
    if (!this.usesAny(f, BEFORE_ACTION_FLAGS.concat(AFTER_ACTION_FLAGS))) return false;
    if (moment === PAGE_MOMENT.BEFORE) return this.usesAny(f, BEFORE_ACTION_FLAGS);
    if (moment === PAGE_MOMENT.AFTER) return this.usesAny(f, AFTER_ACTION_FLAGS);
    return true;
  },
  /** @returns {object|null} the first page that may run now and has not run this turn */
  next: function (battle, moment, source) {
    var pages = battle.troop.pages;
    var keys = Object.keys(pages).sort(function (a, b) { return a - b; });
    for (var i = 0; i < keys.length; i++) {
      var pg = pages[keys[i]];
      if (battle.pagesRun[keys[i]] || !pg.event_commands.length || !this.eligible(pg, moment)) continue;
      if (!this.conditionsMet(pg.condition, battle, source)) continue;
      battle.pagesRun[keys[i]] = true;
      return pg;
    }
    return null;
  },
};

/* ---- battle-only commands; they act on the running battle scene ---- */
function currentBattle() { return Game.battleScene; }
function troopTargets(idx) {
  var b = currentBattle();
  return idx < 0 ? b.enemies.slice() : [b.enemies[idx]].filter(Boolean);
}

/* ChangeMonsterHP: [enemy, 0 add / 1 remove, 0 value / 1 variable / 2 percent of current HP, value, lethal] */
EventCommands[13110] = function (c) {
  var p = c.params, self = this;
  troopTargets(p[0]).forEach(function (e) {
    var n = p[2] === 2 ? Math.floor((e.hp * p[3]) / 100) : self.valueOr(p[2], p[3]);
    var amount = self.signed(p[1], n);
    e.changeHp(p[4] || amount > 0 ? amount : Math.max(amount, 1 - e.hp));
  });
  return true;
};
EventCommands[13130] = function (c) { /* ChangeMonsterCondition: [enemy, add/remove, state] */
  var p = c.params;
  troopTargets(p[0]).forEach(function (e) { if (p[1] === 0) e.addState(p[2]); else e.removeState(p[2]); });
  return true;
};
EventCommands[13150] = function (c) { /* ShowHiddenMonster */
  troopTargets(c.params[0]).forEach(function (e) { e.appear(); });
  return true;
};
EventCommands[13210] = function (c) { currentBattle().setBackdrop(c.string); return true; }; /* ChangeBattleBG */
EventCommands[13260] = function (c) { /* ShowBattleAnimation_B: [anim, target (-1 all), wait, allies] */
  var p = c.params, b = currentBattle();
  var targets = p[3] ? (p[1] < 0 ? Party.members.slice() : [Party.members[p[1] - 1]]) : troopTargets(p[1]);
  targets.filter(Boolean).forEach(function (t) { ActionVisuals.playOn(p[0], t); });
  if (p[2]) this.waiting = 'anim';
  b.eventAnimation = true;
  return true;
};
EventCommands[13410] = function () { currentBattle().terminate(); this.list = null; return false; }; /* TerminateBattle */
EventCommands[1006] = function (c) { /* ForceFlee: [0 party / 1 all enemies / 2 one enemy, enemy] */
  var p = c.params, b = currentBattle();
  if (p[0] === 0) b.escapeNow();
  else troopTargets(p[0] === 1 ? -1 : p[1]).forEach(function (e) { if (e.exists()) e.flee(); });
  return true;
};
