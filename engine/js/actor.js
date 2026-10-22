/* Runtime actor: parameters with equipment, states, equipment and battle settings.
   Level, exp, skills and ChangeClass live in actor_growth.js. Formulas follow RPG_RT as
   documented by EasyRPG Player (game_actor.cpp); the 2003 limits come from Game_Constants. */
var ACTOR_LIMITS_2K = { hp: 999, exp: 999999, level: 50 };
var ACTOR_LIMITS_2K3 = { hp: 9999, exp: 9999999, level: 99 };
var STAT_MAX = 999;
var STAT_BATTLE_MAX = 9999;
var CLASS_UNCHANGED = -1;   /* ChangeClass never ran: params/exp from the actor, equip rules from its db class */
var DEAD_STATE = 1;
var ITEM_WEAPON = 1, ITEM_SHIELD = 2, ITEM_ACCESSORY = 5;

/* State checks shared by actors and enemies. */
var BattlerStates = {
  hasRestriction: function (b, r) {
    return b.states.some(function (id) { var st = DB.state(id); return st && st.restriction === r; });
  },
  /* attack ally (3) / attack enemy (2) / none (0): the confusion-type restriction in effect */
  confusion: function (b) {
    if (this.hasRestriction(b, 3)) return 3;
    return this.hasRestriction(b, 2) ? 2 : 0;
  },
  /* worst of hit-rate reductions (blindness, berserk) in percent */
  hitRatio: function (b) {
    return b.states.reduce(function (m, id) { var st = DB.state(id); return st ? Math.min(m, st.reduce_hit_ratio) : m; }, 100);
  },
};

function actorLimits() { return Loader.is2k3() ? ACTOR_LIMITS_2K3 : ACTOR_LIMITS_2K; }

/** @param {number} id actor id in the database */
function Actor(id) {
  var d = DB.actor(id);
  this.id = id;
  this.applyLooks(d);
  this.level = d.initial_level;
  this.classId = CLASS_UNCHANGED;
  this.applyBattleSettings(d, d.battler_animation || 0);
  this.states = [];
  var eq = d.initial_equipment;
  this.equip = [eq.weapon_id, eq.shield_id, eq.armor_id, eq.helmet_id, eq.accessory_id];
  this.skills = [];
  this.paramBonus = [0, 0, 0, 0, 0, 0];
  this.makeExpList();
  this.exp = this.expForLevel(this.level);
  this.learnSkillsForLevel();
  this.hp = this.maxHp();
  this.sp = this.maxSp();
  this.resetBattleFields();
}

Actor.prototype = {
  data: function () { return DB.actor(this.id); },
  resetBattleFields: function () {
    this.defending = false;
    this.hidden = false;
    this.isEnemy = false;
    this.row = 0;            /* 0 front, 1 back (2003 rows; this game has no Row command) */
    this.atbGauge = 0;
  },
  /* name, title and graphics from the database (events change them later) */
  applyLooks: function (d) {
    this.name = d.name;
    this.title = d.title;
    this.charName = d.character_name;
    this.charIndex = d.character_index;
    this.transparent = d.transparent;
    this.faceName = d.face_name;
    this.faceIndex = d.face_index;
  },
  /* the class whose tables drive params/exp: only after ChangeClass, like RPG_RT */
  growthClass: function () { return this.classId > 0 ? DB.klass(this.classId) : null; },
  /* the class shown in menus and used for class-based equipment */
  currentClass: function () { return DB.klass(this.classId === CLASS_UNCHANGED ? this.data().class_id : this.classId); },
  /* settings ChangeClass copies from the class (2003): two weapons, battler graphic, commands */
  applyBattleSettings: function (src, battlerAnimation) {
    this.twoWeapon = !!src.two_weapon;
    this.lockEquipment = !!src.lock_equipment;
    this.autoBattle = !!src.auto_battle;
    this.superGuard = !!src.super_guard;
    this.battlerAnimation = battlerAnimation;
    this.battleCommands = (src.battle_commands || []).filter(function (c) { return c > 0; });
  },

  /* base parameter i (0 maxhp, 1 maxsp, 2 atk, 3 def, 4 spi, 5 agi) at the current level */
  rawParam: function (i) {
    var src = this.growthClass() || this.data();
    var p = src.parameters;
    var arr = [p.maxhp, p.maxsp, p.attack, p.defense, p.spirit, p.agility][i] || [];
    return arr[Math.min(this.level, arr.length) - 1] || 0;
  },
  baseParam: function (i) { return this.rawParam(i) + this.paramBonus[i]; },
  /* attackSlot (0 or 1) is set while a two-weapon actor swings one weapon: the other weapon's
     bonus does not count for that hit (RPG_RT 2003 multi-hit) */
  skipsSlot: function (s) { return this.attackSlot != null && s <= 1 && s !== this.attackSlot; },
  equipBonus: function (i) {
    var total = 0;
    for (var s = 0; s < 5; s++) {
      if (this.skipsSlot(s)) continue;
      var it = this.equip[s] ? DB.item(this.equip[s]) : null;
      if (it) total += [0, 0, it.atk_points1, it.def_points1, it.spi_points1, it.agi_points1][i] || 0;
    }
    return total;
  },
  maxHp: function () { return Math.max(1, Math.min(actorLimits().hp, this.baseParam(0))); },
  maxSp: function () { return Math.max(0, Math.min(STAT_MAX, this.baseParam(1))); },
  stateMult: function (key) {
    var m = 1;
    for (var i = 0; i < this.states.length; i++) {
      var st = DB.state(this.states[i]);
      if (st && st[key]) m *= 0.5;
    }
    return m;
  },
  battleParam: function (i, stateKey) {
    var base = Math.max(1, Math.min(STAT_MAX, this.baseParam(i) + this.equipBonus(i)));
    var v = Math.floor((base + this.battleMod(i)) * this.stateMult(stateKey));
    return Math.max(1, Math.min(STAT_BATTLE_MAX, v));
  },
  battleMod: function (i) { return (this.battleMods && this.battleMods[i]) || 0; },
  /** stat-change skills: the battle modifier stays within -base/2 .. +base (EasyRPG GBt:731-736) */
  changeBattleStat: function (i, delta) {
    this.battleMods = this.battleMods || [0, 0, 0, 0, 0, 0];
    var base = Math.max(1, Math.min(STAT_MAX, this.baseParam(i) + this.equipBonus(i)));
    this.battleMods[i] = Math.max(-Math.floor(base / 2), Math.min(base, this.battleMods[i] + delta));
  },
  clearBattleStats: function () { this.battleMods = null; },
  atk: function () { return this.battleParam(2, 'affect_attack'); },
  def: function () { return this.battleParam(3, 'affect_defense'); },
  spi: function () { return this.battleParam(4, 'affect_spirit'); },
  agi: function () { return this.battleParam(5, 'affect_agility'); },
  clampHpSp: function () {
    this.hp = Math.min(this.hp, this.maxHp());
    this.sp = Math.min(this.sp, this.maxSp());
  },

  weapon: function () {
    var slot = this.attackSlot === 1 ? 1 : 0;
    return this.equip[slot] ? DB.item(this.equip[slot]) : null;
  },
  /* the shield slot holds the second weapon of two-weapon actors */
  weapons: function () {
    var list = [this.weapon()];
    if (this.twoWeapon && this.equip[1]) list.push(DB.item(this.equip[1]));
    if (this.attackSlot != null) list = [list[this.attackSlot]];
    return list.filter(Boolean);
  },
  /* best hit rate among the weapons in use, 90 unarmed */
  hitChance: function () {
    var w = this.weapons();
    return w.length ? Math.max.apply(null, w.map(function (x) { return x.hit; })) : 90;
  },
  /* percent: "1 in N" from the actor plus the best weapon critical bonus */
  critChance: function () {
    var d = this.data();
    var bonus = this.weapons().reduce(function (m, w) { return Math.max(m, w.critical_hit || 0); }, 0);
    return (d.critical_hit ? 100 / Math.max(1, d.critical_hit_chance) : 0) + bonus;
  },
  halfSpCost: function () {
    return this.equip.some(function (id) { var it = id ? DB.item(id) : null; return it && it.half_sp_cost; });
  },
  attackAnimation: function () { var w = this.weapon(); return w ? w.animation_id : this.data().unarmed_animation; },

  isDead: function () { return this.states.indexOf(DEAD_STATE) >= 0; },
  restriction: function () {
    var r = 0;
    for (var i = 0; i < this.states.length; i++) {
      var st = DB.state(this.states[i]);
      if (st && st.restriction > r) r = st.restriction;
    }
    return r;
  },
  /* any "cannot move" state stops the battler, whatever else it has (EasyRPG CanAct) */
  canAct: function () { return !this.isDead() && !BattlerStates.hasRestriction(this, 1); },
  addState: function (id) {
    if (this.states.indexOf(id) >= 0) return false;
    if (id === DEAD_STATE) { this.hp = 0; this.states = [DEAD_STATE]; return true; }
    this.states.push(id);
    return true;
  },
  removeState: function (id) {
    var i = this.states.indexOf(id);
    if (i < 0) return false;
    this.states.splice(i, 1);
    if (id === DEAD_STATE && this.hp === 0) this.hp = 1;
    return true;
  },
  removeAllStates: function () { this.states = []; },
  significantState: function () {
    var best = null;
    for (var i = 0; i < this.states.length; i++) {
      var st = DB.state(this.states[i]);
      if (st && (!best || st.priority > best.priority)) best = st;
    }
    return best;
  },
  /* rank A..E from the actor's (or changed class's) table, C when missing */
  rankRate: function (ranks, id, rates) {
    var rank = ranks[id - 1] == null ? 2 : ranks[id - 1];
    return rates[rank];
  },
  stateRate: function (stateId) {
    var st = DB.state(stateId), src = this.growthClass() || this.data();
    return this.rankRate(src.state_ranks, stateId, [st.a_rate, st.b_rate, st.c_rate, st.d_rate, st.e_rate]);
  },
  attributeRate: function (attrId) {
    var at = DB.attribute(attrId), src = this.growthClass() || this.data();
    return at ? this.rankRate(src.attribute_ranks, attrId, [at.a_rate, at.b_rate, at.c_rate, at.d_rate, at.e_rate]) : 100;
  },

  changeHp: function (delta, lethal) {
    if (this.isDead()) return;   /* only reviving (removing the dead state) brings HP back */
    var hp = this.hp + delta;
    if (hp <= 0) hp = lethal ? 0 : 1;
    this.hp = Math.min(this.maxHp(), hp);
    if (this.hp === 0) this.addState(DEAD_STATE);
  },
  changeSp: function (delta) { this.sp = Math.max(0, Math.min(this.maxSp(), this.sp + delta)); },
  fullHeal: function () { this.removeAllStates(); this.hp = this.maxHp(); this.sp = this.maxSp(); },

  /* equipment slot 0..4; 2003 with equipment_setting 1 checks the class list instead of the actor list */
  canEquip: function (item) {
    if (!item || item.type < ITEM_WEAPON || item.type > ITEM_ACCESSORY) return false;
    if (this.twoWeapon && item.type === ITEM_SHIELD) return false;
    var byClass = Loader.is2k3() && Loader.db.system.equipment_setting === 1;
    var set = byClass ? item.class_set : item.actor_set;
    var idx = byClass ? this.currentClassId() : this.id - 1;   /* class_set[0] means "no class" */
    return !set || set.length <= idx || !!set[idx];
  },
  currentClassId: function () { return this.classId === CLASS_UNCHANGED ? this.data().class_id : this.classId; },
  slotFor: function (item) { return item.type - 1; },
  changeEquipment: function (slot, itemId) {
    var old = this.equip[slot];
    if (old) Party.addItem(old, 1);
    this.equip[slot] = itemId;
    if (itemId) Party.addItem(itemId, -1);
    this.clampHpSp();
  },
  removeAllEquipment: function () {
    for (var s = 0; s < 5; s++) if (this.equip[s]) this.changeEquipment(s, 0);
  },
  setEquipment: function (slot, itemId) { this.equip[slot] = itemId; },

  serialize: function () {
    return { id: this.id, name: this.name, title: this.title, charName: this.charName, charIndex: this.charIndex,
      transparent: this.transparent, faceName: this.faceName, faceIndex: this.faceIndex, level: this.level, exp: this.exp,
      hp: this.hp, sp: this.sp, states: this.states, equip: this.equip, skills: this.skills, paramBonus: this.paramBonus,
      classId: this.classId, twoWeapon: this.twoWeapon, lockEquipment: this.lockEquipment, autoBattle: this.autoBattle,
      superGuard: this.superGuard, battlerAnimation: this.battlerAnimation, battleCommands: this.battleCommands };
  },
};

Actor.restore = function (s) {
  var a = new Actor(s.id);
  Object.assign(a, s);
  a.makeExpList();
  return a;
};
