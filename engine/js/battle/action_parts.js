/* Pieces of an action: start text, costs and targets, poses/movement/animations, hit results. */
var ENEMY_ACTION_TERMS = { defend: 'defending', observe: 'observing', charge: 'focus', selfdestruct: 'autodestruction', escape: 'enemy_escape' };

var ActionText = {
  /** @returns {string} what the help line shows when the action starts ('' = nothing) */
  start: function (a) {
    if (a.kind === ACTION.SKILL) return DB.skill(a.skill).name;
    if (a.kind === ACTION.ITEM) return DB.item(a.item).name;
    if (a.source.isEnemy && ENEMY_ACTION_TERMS[a.kind]) return a.source.name + Terms.get(ENEMY_ACTION_TERMS[a.kind]);
    return '';
  },
};

var ActionTargets = {
  /* items used as skills cost the item, not SP; uses 0 means the item is never used up */
  payCosts: function (a) {
    var item = a.viaItem || (a.kind === ACTION.ITEM ? DB.item(a.item) : null);
    if (item && item.uses > 0) Party.addItem(a.item, -1);
    else if (a.kind === ACTION.SKILL && !a.viaItem) a.source.changeSp(-BattleRules.skillCost(a.source, DB.skill(a.skill)));
  },
  opponents: function (src, battle) { return src.isEnemy ? Party.alive() : battle.activeEnemies(); },
  allies: function (src, battle) { return src.isEnemy ? battle.activeEnemies() : Party.members.slice(); },
  /* a chosen target that died meanwhile is replaced by a random living one */
  single: function (pick, pool) {
    if (pick && pool.indexOf(pick) >= 0) return [pick];
    return pool.length ? [pool[Rand.int(0, pool.length - 1)]] : [];
  },
  resolve: function (a, battle) {
    var src = a.source, foes = this.opponents(src, battle);
    if (a.kind === ACTION.ATTACK) {
      var all = !src.isEnemy && src.weapons().some(function (w) { return w.attack_all; });
      if (all) return foes;
      var allies = this.allies(src, battle);   /* confused battlers attack their own side */
      return a.target && allies.indexOf(a.target) >= 0 && !a.target.isDead() ? [a.target] : this.single(a.target, foes);
    }
    if (a.kind === ACTION.SKILL) return this.skillTargets(DB.skill(a.skill), a, battle);
    if (a.kind === ACTION.ITEM) return DB.item(a.item).entire_party ? Party.members.slice() : [a.target || src];
    return [src];
  },
  skillTargets: function (sk, a, battle) {
    var foes = this.opponents(a.source, battle);
    switch (sk.scope) {
      case SCOPE.ENEMY: return this.single(a.target, foes);
      case SCOPE.ENEMIES: return foes;
      case SCOPE.SELF: return [a.source];
      case SCOPE.ALLY: return [a.target || a.source];
    }
    return this.allies(a.source, battle);
  },
};

var ActionVisuals = {
  /* per-actor battle animation data of the weapon or skill (BattlerAnimationItemSkill) */
  animData: function (a) {
    if (a.source.isEnemy) return null;
    var key = String(a.source.id);
    if (a.kind === ACTION.SKILL) return (DB.skill(a.skill).battler_animation_data || {})[key] || null;
    var w = a.kind === ACTION.ATTACK ? a.source.weapon() : null;
    return w && w.animation_data ? w.animation_data[key] || null : null;
  },
  movement: function (a) { var d = this.animData(a); return d ? d.movement : MOVEMENT.NONE; },
  /* dir 1 = toward the target, -1 = back home; actors face left unless flipped */
  move: function (r, t, dir) {
    var sp = r.sprite(), mv = ActionVisuals.movement(r.action);
    if (!sp || mv === MOVEMENT.NONE) return true;
    if (t === 0) sp.setPose(dir > 0 ? POSE.WALK_LEFT : POSE.WALK_RIGHT, POSE_LOOP);
    var f = Math.min(t + 1, MOVE_FRAMES), p = dir > 0 ? f / MOVE_FRAMES : 1 - f / MOVE_FRAMES;
    var reach = mv === MOVEMENT.MOVE ? this.reach(r) : MOVE_DISTANCE;
    sp.dx = (sp.flipped ? 1 : -1) * reach * p;
    sp.dy = mv === MOVEMENT.JUMP ? -Math.round((MOVE_DISTANCE * Math.sin(Math.PI * p)) / 2) : 0;
    sp.trackAfterImage((this.animData(r.action) || {}).after_image === 1 && dir > 0);
    return f >= MOVE_FRAMES;
  },
  /* "move" walks up to the side of the first target */
  reach: function (r) {
    var tgt = r.action.targets[0], src = r.src();
    if (!tgt) return MOVE_DISTANCE;
    var img = tgt.image ? tgt.image() : null, half = img ? img.width / 2 : 24;
    return Math.max(0, Math.abs(src.x - tgt.x) - half - ACTOR_HALF);
  },
  weaponOverlay: function (a) {
    var d = this.animData(a);
    if (!d || d.type !== 0 || d.weapon_animation_id < 0) return null;
    var ba = DB.battlerAnimation(a.source.battlerAnimation || 1);
    var w = ba && ba.weapons[d.weapon_animation_id + 1];
    return w && w.weapon_name ? { name: w.weapon_name, index: w.weapon_index } : null;
  },
  startPose: function (r) {
    var sp = r.sprite(), a = r.action;
    if (!sp) return;
    var d = this.animData(a);
    var pose = { attack: POSE.ATTACK_RIGHT, skill: POSE.SKILL, item: POSE.ITEM }[a.kind];
    if (a.kind === ACTION.SKILL && d && d.pose != null) pose = d.pose;
    if (a.kind === ACTION.ATTACK && a.dual) pose = POSE.ATTACK_LEFT;
    sp.setPose(sp.flipped && pose === POSE.ATTACK_RIGHT ? POSE.ATTACK_LEFT : pose, POSE_THEN_IDLE);
    if (a.kind === ACTION.ATTACK) sp.weapon = this.weaponOverlay(a);
  },
  animationId: function (a) {
    if (a.kind === ACTION.SKILL) return DB.skill(a.skill).animation_id;
    if (a.kind === ACTION.ITEM) return 0;
    if (a.source.isEnemy) return 0;
    return a.source.attackAnimation();
  },
  playAnimation: function (r) {
    var id = this.animationId(r.action);
    var anim = id ? DB.animation(id) : null;
    if (!anim) return;
    if (anim.scope === 1) { BattleAnim.play(id, 160, 80, { battle: true }); return; }
    r.action.targets.forEach(function (t) { ActionVisuals.playOn(id, t); });
  },
  playOn: function (id, t) {
    var anim = DB.animation(id);
    var img = t.image ? t.image() : null, h = img ? img.height : 48;
    var y = anim.position === 0 ? t.y - h / 2 : anim.position === 2 ? t.y + h / 2 : t.y;
    BattleAnim.play(id, t.x, y, { battle: true, onFlash: function (tm) { t.flash = BattleSprites.makeFlash(tm.flash_red, tm.flash_green, tm.flash_blue, tm.flash_power, 12); } });
  },
};

var ActionHits = {
  hitCount: function (a) {
    if (a.source.isEnemy) return a.dual ? 2 : 1;
    var w = a.source.weapon(), d = ActionVisuals.animData(a);
    return (w && w.dual_attack ? 2 : 1) * (((d && d.attacks) || 0) + 1);
  },
  /* two-weapon actors swing each weapon separately, each hit using only that weapon (2003 MultiHit) */
  weaponSlots: function (src) {
    if (src.isEnemy || !src.twoWeapon || !src.equip[0] || !src.equip[1]) return [null];
    return [0, 1];
  },
  attack: function (r) {
    var a = r.action, battle = r.battle, src = a.source, self = this;
    this.weaponSlots(src).forEach(function (slot) {
      src.attackSlot = slot;
      for (var h = 0; h < self.hitCount(a); h++) self.each(r, function (t) { return BattleEffects.normalAttack(src, t, battle); });
    });
    src.attackSlot = null;
  },
  apply: function (r) {
    var a = r.action;
    if (a.kind === ACTION.ATTACK) {
      this.attack(r);
    } else if (a.kind === ACTION.SKILL) {
      var sk = DB.skill(a.skill);
      this.each(r, function (t) { return BattleEffects.skill(a.source, t, sk); });
      if (sk.switch_id && sk.type === 3) GameState.setSw(sk.switch_id, true);
    } else {
      var it = DB.item(a.item);
      if (it.type === ITEM_KIND.SWITCH) { GameState.setSw(it.switch_id, true); return; }
      this.each(r, function (t) { return BattleEffects.item(t, it); });
    }
  },
  each: function (r, fn) {
    r.action.targets.forEach(function (t) {
      if (t.isEnemy && !t.exists()) return;
      var res = fn(t);
      r.float(t, res);
      if (!t.isEnemy) r.battle.onActorHit(t, res);
    });
  },
  /* defend, observe, charge, self-destruct, escape, transform, nothing */
  simple: function (r) {
    var a = r.action, src = a.source;
    if (a.kind === ACTION.DEFEND) { src.defending = true; var sp = r.sprite(); if (sp) sp.toIdle(); }
    else if (a.kind === ACTION.CHARGE) src.charged = true;
    else if (a.kind === ACTION.SELF_DESTRUCT) this.selfDestruct(r);
    else if (a.kind === ACTION.ESCAPE) r.battle.attemptEscape(src);
    else if (a.kind === ACTION.TRANSFORM) r.battle.transformEnemy(src, a.enemyId);
  },
  selfDestruct: function (r) {
    var src = r.action.source;
    Party.alive().forEach(function (t) {
      var dmg = BattleRules.selfDestructDamage(src, t, BattleEffects.rand);
      BattleEffects.damageTarget(t, dmg);
      r.float(t, { value: dmg });
      r.battle.onActorHit(t, { value: dmg });
    });
    src.changeHp(-src.hp);
  },
};
