/* RPG Maker 2000 battle: running the turn. Actions go in agility order; each one queues its
   messages and the effects that apply when they show. Skills are in skills.js.
   Part of SceneBattle2k (see scene.js). */
Object.assign(SceneBattle2k.prototype, {
  rand: function (a, b) { return Rand.int(a, b); },
  sysSe: function (key) { Audio_.playSe(GameState.system[key] || Loader.db.system[key]); },

  beginActions: function () {
    var self = this;
    this.command.visible = false; this.command.active = false;
    this.status.index = -1;
    this.enemies.forEach(function (e) { if (e.canAct()) self.actions.push(self.enemyAction(e)); });
    /* agility with +-10% spread decides the order */
    this.actions.forEach(function (a) { a.speed = (a.actor.agi ? a.actor.agi() : 1) * (0.9 + Rand.next() * 0.2); });
    this.actions.sort(function (a, b) { return b.speed - a.speed; });
    this.clearMessages();
    this.state = 'action';
    this.execNext();
  },
  /* the actor fell, fled or can no longer move since the action was chosen */
  actionLost: function (act) {
    var a = act.actor;
    if (act.enemy) return !a.exists();
    return a.isDead() || !a.canAct();
  },
  execNext: function () {
    var self = this;
    if (this.checkEnd()) return;
    if (!this.actions.length) { this.queue.push({ fn: function () { self.startTurn(); } }); this.processQueue(); return; }
    var act = this.actions.shift();
    if (this.actionLost(act)) { this.execNext(); return; }
    this.applyActionSwitches(act.action);
    this.clearMessages();
    var lines = [], after = [];
    this.runAction(act, lines, after);
    lines.forEach(function (l) { self.queue.push({ msg: l }); });
    after.forEach(function (f) { self.queue.push({ act: f }); });
    this.queue.push({ fn: function () { self.refreshStatus(); self.execNext(); } });
    this.processQueue();
  },
  applyActionSwitches: function (action) {
    if (!action) return;
    if (action.switch_on) GameState.setSw(action.switch_on_id, true);
    if (action.switch_off) GameState.setSw(action.switch_off_id, false);
  },
  runAction: function (act, lines, after) {
    var a = act.actor;
    switch (act.type) {
      case 'attack': this.doAttack(act, lines, after); break;
      case 'defend': a.defending = true; lines.push(a.name + Terms.get('defending')); break;
      case 'observe': lines.push(a.name + Terms.get('observing')); break;
      case 'charge': a.charged = true; lines.push(a.name + Terms.get('focus')); break;
      case 'escape': lines.push(a.name + Terms.get('enemy_escape')); a.escaped = true; a.fadeOut = BATTLE2K_FADE_FRAMES; break;
      case 'selfdestruct': this.doSelfDestruct(a, lines); break;
      case 'skill': this.doSkill(act, lines, after); break;
      case 'item': this.doItem(act, lines); break;
      case 'transform': { var oldName = a.name; if (a.transform(act.transform)) lines.push(oldName + Terms.get('enemy_transform')); break; }
    }
  },

  doAttack: function (act, lines, after) {
    var a = act.actor, t = act.target;
    if (!t || (t.exists ? !t.exists() : t.isDead())) t = act.enemy ? this.randomActor() : this.randomEnemy();
    if (!t) return;
    lines.push(a.name + Terms.get('attacking'));
    var hits = act.dual || (!act.enemy && a.weapon() && a.weapon().dual_attack) ? 2 : 1;
    for (var h = 0; h < hits; h++) this.attackHit(act, t, lines, after);
  },
  attackHit: function (act, target, lines, after) {
    var a = act.actor, self = this, weapon = act.enemy ? null : a.weapon();
    if (!Rand.chance(Battle2kRules.toHit(a, target, a.hitChance()))) {
      lines.push(target.name + Terms.get('dodge'));
      after.push(function () { self.sysSe('dodge_se'); });
      return;
    }
    var crit = Rand.chance(a.critChance());
    var dmg = Battle2kRules.attackDamage(a, target, { critical: crit, charged: a.charged, weapon: weapon, rand: this.rand });
    if (!crit && a.charged) a.charged = false;
    var side = act.enemy ? 'actor' : 'enemy';
    if (crit) lines.push(Terms.get(act.enemy ? 'enemy_critical' : 'actor_critical'));
    lines.push(dmg > 0 ? target.name + ' ' + dmg + Terms.get(side + '_damaged') : target.name + Terms.get(side + '_undamaged'));
    /* the damage lands when its message shows */
    after.push(function () { self.landHit(act, target, dmg, weapon); });
  },
  landHit: function (act, target, dmg, weapon) {
    var animId = act.enemy ? 0 : act.actor.attackAnimation();
    if (act.enemy) this.sysSe('enemy_attack_se');
    else if (animId) this.playAnimOnEnemy(animId, target);
    target.changeHp(-dmg, true);
    if (act.enemy) { this.sysSe('actor_damaged_se'); Screen.setShake(2, 6, 2); }
    else { target.flash = BATTLE2K_FLASH_FRAMES; this.sysSe('enemy_damaged_se'); }
    if (target.dead) this.sysSe('enemy_death_se');
    if (weapon && weapon.state_chance > 0) this.inflictWeaponStates(weapon, target);
    this.refreshStatus();
  },
  inflictWeaponStates: function (weapon, target) {
    for (var s = 0; s < weapon.state_set.length; s++) {
      if (weapon.state_set[s] && Rand.chance(weapon.state_chance * target.stateRate(s + 1) / 100)) target.addState(s + 1);
    }
  },
  doSelfDestruct: function (a, lines) {
    var self = this;
    lines.push(a.name + Terms.get('autodestruction'));
    Party.alive().forEach(function (t) {
      var dmg = Battle2kRules.selfDestructDamage(a, t, self.rand);
      lines.push(t.name + ' ' + dmg + Terms.get('actor_damaged'));
      t.changeHp(-dmg, true);
    });
    a.changeHp(-a.hp);
  },
  doItem: function (act, lines) {
    var it = DB.item(act.item), t = act.target || act.actor;
    if (!it) return;
    lines.push(it.name + Terms.get('use_item'));
    (it.entire_party ? Party.members : [t]).forEach(function (x) {
      if (!ItemEffect.usable(it, x)) return;
      var before = x.hp;
      ItemEffect.apply(it, x);
      if (x.hp > before) lines.push(x.name + ' ' + (x.hp - before) + Terms.get('hp_recovery'));
    });
    if (it.uses > 0) Party.addItem(act.item, -1);
    this.sysSe('item_se');
  },
  playAnimOnEnemy: function (animId, e) {
    var anim = DB.animation(animId);
    if (!anim) return;
    var img = Loader.image('monster', e.data.battler_name), h = img ? img.height : 32;
    var y = anim.position === 0 ? e.y - h / 2 : anim.position === 1 ? e.y : e.y + h / 2;
    BattleAnim.play(animId, e.x, y, { onFlash: function () { e.flash = 8; } });
  },
});
