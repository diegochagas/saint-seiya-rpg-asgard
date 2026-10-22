/* Applying one hit of an action to one target: normal attacks, skills, items, state ticks.
   Each function changes HP/SP/states and returns what the scene shows ({miss, value, heal}). */
var HEAL_COLOR = 9, DAMAGE_COLOR = 0;
var STATE_CHANGE = { LOSE: 0, GAIN: 1 };
var SCOPE = { ENEMY: 0, ENEMIES: 1, SELF: 2, ALLY: 3, PARTY: 4 };

var BattleEffects = {
  rand: function (a, b) { return Rand.int(a, b); },
  se: function (key) { Audio_.playSe((GameState.system && GameState.system[key]) || Loader.db.system[key]); },

  damageTarget: function (tgt, dmg) {
    var before = tgt.hp;
    tgt.changeHp(-dmg, true);
    if (tgt.isEnemy) tgt.startBlink();
    this.se(tgt.isEnemy ? 'enemy_damaged_se' : 'actor_damaged_se');
    if (tgt.isDead() && before > 0) this.onDeath(tgt);
  },
  onDeath: function (tgt) {
    tgt.atbGauge = 0;
    if (tgt.isEnemy) this.se('enemy_death_se');
  },
  /* states with release_by_damage may wear off when the target survives a hit */
  releaseByDamage: function (tgt, rateScale) {
    tgt.states.slice().forEach(function (id) {
      var st = DB.state(id);
      if (st && st.release_by_damage > 0 && Rand.chance((st.release_by_damage * rateScale) / 100)) tgt.removeState(id);
    });
  },
  weaponStates: function (src, tgt) {
    if (src.isEnemy || tgt.isDead()) return;
    src.weapons().forEach(function (w) {
      (w.state_set || []).forEach(function (on, i) {
        var id = i + 1;
        if (!on) return;
        if (w.reverse_state_effect) { if (Rand.chance(w.state_chance)) tgt.removeState(id); return; }
        if (tgt.states.indexOf(id) < 0 && Rand.chance((w.state_chance * tgt.stateRate(id)) / 100)) tgt.addState(id);
      });
    });
  },
  /** @returns {{miss:boolean, value:number, critical:boolean}} */
  normalAttack: function (src, tgt, battle) {
    if (!Rand.chance(BattleRules.normalHitChance(src, tgt, battle.condition))) {
      this.se('dodge_se');
      return { miss: true, value: 0, critical: false };
    }
    var critical = Rand.chance(BattleRules.criticalChance(src, tgt));
    var dmg = BattleRules.normalDamage(src, tgt, { condition: battle.condition, critical: critical, charged: src.charged, rand: this.rand });
    src.charged = false;
    if (critical) Screen.setFlash(28, 28, 28, 20, 8 / 6);
    this.damageTarget(tgt, dmg);
    if (!tgt.isDead()) this.releaseByDamage(tgt, 100);
    this.weaponStates(src, tgt);
    return { miss: false, value: dmg, critical: critical };
  },

  /** @returns {{miss:boolean, value:number, heal:boolean}} */
  skill: function (src, tgt, sk) {
    var offensive = BattleRules.isOffensive(sk);
    if (!Rand.chance(sk.hit)) {
      if (sk.failure_message === 3) this.se('dodge_se');
      return { miss: true, value: 0, heal: false };
    }
    var eff = BattleRules.skillEffect(src, tgt, sk, this.rand);
    var shown = this.skillHpSp(src, tgt, sk, eff, offensive);
    if (!(offensive && tgt.isDead())) this.skillStates(tgt, sk, offensive);
    return shown;
  },
  skillHpSp: function (src, tgt, sk, eff, offensive) {
    var value = 0;
    if (sk.affect_hp) value = offensive ? this.skillDamage(src, tgt, sk, eff) : this.heal(tgt, eff);
    if (sk.affect_sp) this.skillSp(src, tgt, sk, eff, offensive);
    if (!(offensive && tgt.isDead())) this.skillStats(tgt, sk, offensive ? -eff : eff);
    return { miss: false, value: Math.abs(value), heal: !offensive && sk.affect_hp };
  },
  /* Aumentar/Diminuir Força and friends: battle-only stat modifiers */
  skillStats: function (tgt, sk, delta) {
    ['affect_attack', 'affect_defense', 'affect_spirit', 'affect_agility'].forEach(function (key, i) {
      if (sk[key]) tgt.changeBattleStat(i + 2, delta);
    });
  },
  skillDamage: function (src, tgt, sk, eff) {
    var dmg = BattleRules.defendHalving(tgt, eff);
    if (sk.absorb_damage) { dmg = Math.min(dmg, tgt.hp); src.changeHp(dmg, false); }
    this.damageTarget(tgt, dmg);
    if (!tgt.isDead()) this.releaseByDamage(tgt, sk.physical_rate * 10);
    return dmg;
  },
  skillSp: function (src, tgt, sk, eff, offensive) {
    if (!offensive) { tgt.changeSp(eff); return; }
    var drain = sk.absorb_damage ? Math.min(eff, tgt.sp) : eff;
    tgt.changeSp(-drain);
    if (sk.absorb_damage) src.changeSp(drain);
  },
  heal: function (tgt, amount) {
    if (tgt.isDead()) return 0;
    tgt.changeHp(amount, false);
    return amount;
  },
  /* offensive skills inflict their states, support skills cure them (reverse_state_effect swaps) */
  skillStates: function (tgt, sk, offensive) {
    var cures = !offensive !== !!sk.reverse_state_effect;
    (sk.state_effects || []).forEach(function (on, i) {
      var id = i + 1;
      if (!on) return;
      if (cures) { BattleEffects.cure(tgt, id, sk.power); return; }
      if (tgt.states.indexOf(id) < 0 && Rand.chance(tgt.stateRate(id))) tgt.addState(id);
    });
  },
  cure: function (tgt, id, power) {
    var wasDead = tgt.isDead();
    tgt.removeState(id);
    if (id === DEAD_STATE && wasDead) {
      if (tgt.revive) tgt.revive(power); else tgt.hp = Math.max(1, Math.floor((tgt.maxHp() * power) / 100));
    }
  },

  /** medicine items: states cured, HP/SP restored by rate + fixed amount */
  item: function (tgt, it) {
    if (it.ko_only && !tgt.isDead()) return { miss: true, value: 0, heal: true };
    (it.state_set || []).forEach(function (on, i) { if (on) BattleEffects.cure(tgt, i + 1, 0); });
    var hp = Math.floor((it.recover_hp_rate * tgt.maxHp()) / 100) + it.recover_hp;
    var sp = Math.floor((it.recover_sp_rate * tgt.maxSp()) / 100) + it.recover_sp;
    if (hp && !tgt.isDead()) tgt.changeHp(hp, false);
    if (sp) tgt.changeSp(sp);
    return { miss: false, value: hp, heal: true };
  },

  /** per-action state upkeep: release rolls and HP/SP drain or regen; returns HP change */
  tickStates: function (b) {
    var hpChange = 0;
    b.stateTurns = b.stateTurns || {};
    b.states.slice().forEach(function (id) {
      var st = DB.state(id);
      if (!st || id === DEAD_STATE) return;
      var held = b.stateTurns[id] || 0;
      if (held > st.hold_turn && Rand.chance(st.auto_release_prob)) { b.removeState(id); delete b.stateTurns[id]; return; }
      b.stateTurns[id] = held + 1;
      hpChange += BattleEffects.stateDelta(st.hp_change_type, st.hp_change_val, st.hp_change_max, b.maxHp());
      var sp = BattleEffects.stateDelta(st.sp_change_type, st.sp_change_val, st.sp_change_max, b.maxSp());
      if (sp) b.changeSp(sp);
    });
    if (hpChange) b.changeHp(hpChange, false);
    return hpChange;
  },
  stateDelta: function (type, val, pct, max) {
    var amount = val + Math.floor((max * pct) / 100);
    if (type === STATE_CHANGE.LOSE) return -amount;
    return type === STATE_CHANGE.GAIN ? amount : 0;
  },
};
