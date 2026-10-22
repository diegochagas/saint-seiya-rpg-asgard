/* RPG Maker 2000 battle formulas (hit, damage, variance, attributes, escape), kept pure so
   tests can check them. Values come from the Asgard remake's battle (EasyRPG algo.cpp as reference). */
var BATTLE2K_ATTACK_VARIANCE = 4;
var BATTLE2K_CRITICAL_MULTIPLIER = 3;
var BATTLE2K_CHARGE_MULTIPLIER = 2;

var Battle2kRules = {
  /** @returns {number} percent to hit: base chance shifted by the agility ratio */
  toHit: function (src, tgt, base) {
    var srcAgi = Math.max(1, src.agi()), tgtAgi = tgt.agi();
    return 100 - (100 - base) * (1 + (tgtAgi / srcAgi - 1) / 2);
  },
  /**
   * Spread of +-(v * 5)% around base.
   * @param {number} base @param {number} v 0..10 @param {function(number, number): number} rand inclusive int
   * @returns {number} example: variance(100, 4, (a) => a) === 80
   */
  variance: function (base, v, rand) {
    if (v <= 0 || base <= 0) return base;
    var adj = Math.max(1, Math.floor(v * base / 10));
    return base + rand(0, adj) - Math.floor(adj / 2);
  },
  /** best target rate among the weapon's attributes, 100 without weapon or attributes */
  attackAttrMult: function (tgt, weapon) {
    if (!weapon) return 100;
    return this.bestAttributeRate(weapon.attribute_set, tgt, 100);
  },
  bestAttributeRate: function (flags, tgt, fallback) {
    var mult = -1;
    for (var i = 0; i < flags.length; i++) if (flags[i]) mult = Math.max(mult, tgt.attributeRate(i + 1));
    return mult < 0 ? fallback : mult;
  },
  /**
   * Normal attack damage before the defend halving.
   * @param {{critical:boolean, charged:boolean, weapon:object, rand:function}} o
   */
  attackDamage: function (src, tgt, o) {
    var dmg = Math.max(0, Math.floor(src.atk() / 2 - tgt.def() / 4));
    dmg = Math.floor(dmg * this.attackAttrMult(tgt, o.weapon) / 100);
    if (o.critical) dmg *= BATTLE2K_CRITICAL_MULTIPLIER;
    else if (o.charged) dmg *= BATTLE2K_CHARGE_MULTIPLIER;
    dmg = this.variance(dmg, BATTLE2K_ATTACK_VARIANCE, o.rand);
    return tgt.defending ? Math.floor(dmg / 2) : dmg;
  },
  selfDestructDamage: function (src, tgt, rand) {
    var dmg = this.variance(Math.max(0, src.atk() - Math.floor(tgt.def() / 2)), BATTLE2K_ATTACK_VARIANCE, rand);
    return tgt.defending ? Math.floor(dmg / 2) : dmg;
  },
  /** skill effect on one target before variance (offensive skills subtract the target's defence) */
  skillBase: function (sk, src, tgt, offensive) {
    var effect = sk.power + Math.floor(sk.physical_rate * src.atk() / 20) + Math.floor(sk.magical_rate * src.spi() / 40);
    if (offensive && !sk.ignore_defense) effect -= Math.floor(sk.physical_rate * tgt.def() / 40) + Math.floor(sk.magical_rate * tgt.spi() / 80);
    effect = Math.max(0, effect);
    var mult = this.bestAttributeRate(sk.attribute_effects, tgt, -1);
    return mult >= 0 ? Math.floor(effect * mult / 100) : effect;
  },
  /** percent chance to escape: party vs troop average agility, +10 per failed try, always on first strike */
  escapeChance: function (partyAgi, enemyAgi, fails, firstStrike) {
    if (firstStrike) return 100;
    return Math.min(100, 150 * partyAgi / Math.max(1, enemyAgi)) + fails * 10;
  },
  averageAgi: function (list) {
    return list.reduce(function (s, b) { return s + b.agi(); }, 0) / Math.max(1, list.length);
  },
};
