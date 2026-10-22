/* RPG Maker 2003 battle formulas, as pure functions over battler objects.
   Numbers follow RPG_RT as documented by EasyRPG Player's algo.cpp / game_battlealgorithm.cpp
   (behaviour reference only). A battler offers: atk() def() spi() agi() maxHp() hp states
   isEnemy attributeRate(id) stateRate(id) weapons() hitChance(); `rand(min, max)` is injected. */
var ATB_MAX = 300000;
var DAMAGE_LIMIT = 9999;
var CRITICAL_MULTIPLIER = 3;
var ATTACK_VARIANCE = 4;
var ROW_ATTACK_BONUS = 125, ROW_DEFENSE_PENALTY = 75, ROW_HIT_PENALTY = 25;
var CONDITION = { NONE: 0, INITIATIVE: 1, BACK: 2, SURROUND: 3, PINCERS: 4 };
var ATTRIBUTE_PHYSICAL = 0;

var BattleRules = {
  /** @returns {number} gauge gained per frame (integer maths like RPG_RT) */
  atbIncrement: function (agi, sumAgi) {
    var divisor = Math.floor((100 * sumAgi) / (agi + 1));
    return divisor > 0 ? Math.floor(ATB_MAX / divisor) : ATB_MAX;
  },
  /** @returns {boolean} troop page / enemy action turn condition (every 0 = exactly base) */
  checkTurns: function (turns, base, every) {
    return every === 0 ? turns === base : turns >= base && (turns - base) % every === 0;
  },
  /** @returns {number} base +- var*10% (variance 4 = +-20%) */
  variance: function (base, v, rand) {
    if (v <= 0 || base <= 0) return base;
    var adj = Math.max(1, Math.floor((v * base) / 10));
    return base + rand(0, adj) - Math.floor(adj / 2);
  },
  clampDamage: function (n) { return Math.max(-DAMAGE_LIMIT, Math.min(DAMAGE_LIMIT, n)); },

  /* front-row actors hit harder in normal battles; back-row actors are harder to hit */
  attackerRowBonus: function (src, condition) {
    if (src.isEnemy) return false;
    if (condition === CONDITION.SURROUND) return true;
    var front = (src.row || 0) === 0;
    return front ? condition <= CONDITION.INITIATIVE : condition === CONDITION.BACK;
  },
  defenderRowPenalty: function (tgt, condition) {
    if (condition === CONDITION.SURROUND) return true;
    var back = !tgt.isEnemy && tgt.row === 1;
    return back ? condition <= CONDITION.INITIATIVE : condition === CONDITION.BACK;
  },

  stateFlag: function (b, key) { return b.states.some(function (id) { var st = DB.state(id); return st && st[key]; }); },
  agiHitAdjust: function (hit, src, tgt) {
    var ratio = tgt.agi() / Math.max(1, src.agi());
    return Math.trunc(100 - (100 - hit) * (1 + (ratio - 1) / 2));
  },
  /** @returns {number} percent chance a normal attack connects */
  normalHitChance: function (src, tgt, condition) {
    if (this.stateFlag(tgt, 'avoid_attacks')) return 0;
    if (!tgt.canAct()) return 100;
    var hit = Math.floor((src.hitChance() * BattlerStates.hitRatio(src)) / 100);
    var weapons = src.isEnemy ? [] : src.weapons();
    if (weapons.some(function (w) { return w.ignore_evasion; })) return hit;
    hit = this.agiHitAdjust(hit, src, tgt);
    if (this.defenderRowPenalty(tgt, condition)) hit -= ROW_HIT_PENALTY;
    return hit;
  },
  /** @returns {number} percent chance of a critical hit (never between allies) */
  criticalChance: function (src, tgt) {
    if (src.isEnemy === tgt.isEnemy) return 0;
    return Math.trunc(src.critChance());
  },

  /** Strongest physical / magical rate among the attack's attributes, combined like RPG_RT. */
  attributeMultiplier: function (attrIds, tgt, effect) {
    var phys = null, mag = null;
    attrIds.forEach(function (id) {
      var at = DB.attribute(id);
      if (!at) return;
      var rate = tgt.attributeRate(id);
      if (at.type === ATTRIBUTE_PHYSICAL) phys = phys === null ? rate : Math.max(phys, rate);
      else mag = mag === null ? rate : Math.max(mag, rate);
    });
    if (phys === null && mag === null) return effect;
    if (phys === null || mag === null) return Math.trunc(((phys === null ? mag : phys) * effect) / 100);
    if (phys >= 0 && mag >= 0) return Math.trunc((mag * Math.trunc((phys * effect) / 100)) / 100);
    return Math.trunc((effect * Math.max(phys, mag)) / 100);
  },
  weaponAttributes: function (src) {
    if (src.isEnemy) return [];
    var ids = [];
    src.weapons().forEach(function (w) {
      (w.attribute_set || []).forEach(function (on, i) { if (on && ids.indexOf(i + 1) < 0) ids.push(i + 1); });
    });
    return ids;
  },
  /**
   * @param {{condition:number, critical:boolean, charged:boolean, rand:Function}} o
   * @returns {number} HP lost by the target (before limits of its HP)
   */
  normalDamage: function (src, tgt, o) {
    var dmg = Math.max(0, Math.floor(src.atk() / 2) - Math.floor(tgt.def() / 4));
    if (this.attackerRowBonus(src, o.condition)) dmg = Math.floor((dmg * ROW_ATTACK_BONUS) / 100);
    dmg = this.attributeMultiplier(this.weaponAttributes(src), tgt, dmg);
    if (!tgt.isEnemy && this.defenderRowPenalty(tgt, o.condition)) dmg = Math.floor((dmg * ROW_DEFENSE_PENALTY) / 100);
    if (o.critical) dmg *= CRITICAL_MULTIPLIER;
    else if (o.charged) dmg *= 2;
    dmg = this.variance(dmg, ATTACK_VARIANCE, o.rand);
    return this.clampDamage(this.defendHalving(tgt, dmg));
  },
  defendHalving: function (tgt, dmg) {
    if (!tgt.defending) return dmg;
    dmg = Math.floor(dmg / 2);
    return tgt.superGuard ? Math.floor(dmg / 2) : dmg;
  },
  /** @returns {boolean} skills target the other side when their scope is enemy/enemies */
  isOffensive: function (skill) { return skill.scope <= 1; },
  skillAttributes: function (skill) {
    var ids = [];
    (skill.attribute_effects || []).forEach(function (on, i) { if (on) ids.push(i + 1); });
    return ids;
  },
  /** @returns {number} skill power on this target, before Defend (applies to HP damage only) */
  skillEffect: function (src, tgt, skill, rand) {
    var eff = skill.power + Math.floor((skill.physical_rate * src.atk()) / 20) + Math.floor((skill.magical_rate * src.spi()) / 40);
    if (this.isOffensive(skill) && !skill.ignore_defense) {
      eff -= Math.floor((skill.physical_rate * tgt.def()) / 40) + Math.floor((skill.magical_rate * tgt.spi()) / 80);
    }
    eff = this.attributeMultiplier(this.skillAttributes(skill), tgt, Math.max(0, eff));
    return this.clampDamage(this.variance(eff, skill.variance, rand));
  },
  /** @returns {number} SP a skill costs this battler (2003 percent costs use max SP) */
  skillCost: function (src, skill) {
    var cost = skill.sp_type === 1 ? Math.floor((src.maxSp() * skill.sp_percent) / 100) : skill.sp_cost;
    return src.halfSpCost && src.halfSpCost() ? Math.floor((cost + 1) / 2) : cost;
  },
  selfDestructDamage: function (src, tgt, rand) {
    var dmg = this.variance(Math.max(0, src.atk() - Math.floor(tgt.def() / 2)), ATTACK_VARIANCE, rand);
    return this.clampDamage(this.defendHalving(tgt, dmg));
  },
  /** @returns {number} percent chance the party escapes (+10 per failed try) */
  escapeChance: function (avgEnemyAgi, avgActorAgi, fails) {
    var base = 150 - Math.round((100 * avgEnemyAgi) / Math.max(1, avgActorAgi));
    return Math.max(0, Math.min(100, base)) + 10 * fails;
  },
  /* a state that stops the battler and never wears off (no release chance, not by damage) */
  permanentlyStopped: function (b) {
    return b.states.some(function (id) {
      var st = DB.state(id);
      return st && st.restriction === 1 && !(st.auto_release_prob > 0) && !(st.release_by_damage > 0);
    });
  },
  /** @returns {boolean} no actor can act now or recover later: the battle is lost (EasyRPG GB:135-145) */
  unableToFight: function (actors) {
    var self = this;
    return actors.every(function (a) { return a.isDead() || self.permanentlyStopped(a); });
  },
  /** @returns {number} 0 (fresh) .. 100 (exhausted) over the given actors */
  fatigue: function (actors) {
    var hp = 0, maxHp = 0, sp = 0, maxSp = 0;
    actors.forEach(function (a) { hp += a.hp; maxHp += a.maxHp(); sp += a.sp; maxSp += a.maxSp(); });
    return 100 - Math.round((100 * ((2 * hp) / Math.max(1, maxHp) + sp / Math.max(1, maxSp))) / 3);
  },
};
