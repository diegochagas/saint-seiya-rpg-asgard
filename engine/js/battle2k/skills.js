/* RPG Maker 2000 battle: using a skill (cost, targets, HP/SP effect, states, animation).
   Part of SceneBattle2k (see scene.js). */
Object.assign(SceneBattle2k.prototype, {
  doSkill: function (act, lines, after) {
    var a = act.actor, sk = DB.skill(act.skill), self = this;
    if (!sk) return;
    if (act.enemy) a.sp = Math.max(0, a.sp - sk.sp_cost);
    else a.changeSp(-sk.sp_cost);
    lines.push(a.name + (sk.using_message1 || ''));
    if (sk.using_message2) lines.push(sk.using_message2);
    var targets = this.skillTargets(act, sk).filter(Boolean);
    var offensive = sk.scope <= BATTLE2K_SCOPE.ALL_ENEMIES;
    targets.forEach(function (t) { self.skillOnTarget(act, sk, t, offensive, lines); });
    if (sk.animation_id && !act.enemy && offensive) after.unshift(function () { targets.forEach(function (t) { self.playAnimOnEnemy(sk.animation_id, t); }); });
    if (sk.sound_effect && sk.sound_effect.name !== '(OFF)') after.unshift(function () { Audio_.playSe(sk.sound_effect); });
  },
  skillTargets: function (act, sk) {
    var a = act.actor, enemySide = !!act.enemy, S = BATTLE2K_SCOPE;
    if (sk.scope === S.ENEMY) return [act.target || (enemySide ? this.randomActor() : this.randomEnemy())];
    if (sk.scope === S.ALL_ENEMIES) return enemySide ? Party.alive() : this.alive();
    if (sk.scope === S.SELF) return [a];
    if (sk.scope === S.ALLY) return [act.target || a];
    if (enemySide) return this.enemies.filter(function (e) { return e.exists(); });
    /* party scope reaches fallen members only when the skill can revive (state 1 in its list) */
    return Party.members.filter(function (m) { return !m.isDead() || sk.state_effects[0]; });
  },
  skillOnTarget: function (act, sk, t, offensive, lines) {
    if (offensive && !Rand.chance(sk.hit)) { lines.push(t.name + Terms.get('dodge')); return; }
    var effect = Battle2kRules.variance(Battle2kRules.skillBase(sk, act.actor, t, offensive), sk.variance, this.rand);
    if (offensive && t.defending) effect = Math.floor(effect / 2);
    /* healing skills cure first, so a revive (removes state 1) also gets its HP: changeHp ignores the dead */
    if (!offensive) this.skillStates(act, sk, t, offensive, lines);
    if (sk.affect_hp) this.skillHp(act, t, effect, offensive, lines);
    if (sk.affect_sp) this.skillSp(t, effect, offensive);
    if (offensive) this.skillStates(act, sk, t, offensive, lines);
  },
  skillHp: function (act, t, effect, offensive, lines) {
    if (!offensive) { lines.push(t.name + ' ' + effect + Terms.get('hp_recovery')); t.changeHp(effect, false); return; }
    lines.push(t.name + ' ' + effect + Terms.get(act.enemy ? 'actor_damaged' : 'enemy_damaged'));
    t.changeHp(-effect, true);
    if (t.flash != null) t.flash = BATTLE2K_FLASH_FRAMES;
  },
  skillSp: function (t, effect, offensive) {
    if (offensive) t.sp = Math.max(0, t.sp - effect);
    else if (t.changeSp) t.changeSp(effect);
    else t.sp = Math.min(t.maxSp(), t.sp + effect);
  },
  skillStates: function (act, sk, t, offensive, lines) {
    for (var s = 0; s < sk.state_effects.length; s++) {
      if (!sk.state_effects[s]) continue;
      if (!offensive) { t.removeState(s + 1); continue; }
      if (!Rand.chance(t.stateRate(s + 1))) continue;
      t.addState(s + 1);
      var st = DB.state(s + 1);
      lines.push(t.name + (act.enemy ? st.message_actor : st.message_enemy));
    }
  },
});
