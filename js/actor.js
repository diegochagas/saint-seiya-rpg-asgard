/* Runtime actor: level/exp curve, parameters with equipment, states, equipment. */

function Actor(id) {
  var d = DB.actor(id);
  this.id = id;
  this.name = d.name;
  this.title = d.title;
  this.charName = d.character_name;
  this.charIndex = d.character_index;
  this.transparent = d.transparent;
  this.faceName = d.face_name;
  this.faceIndex = d.face_index;
  this.level = d.initial_level;
  this.exp = 0;
  this.hp = 1; this.sp = 0;
  this.states = [];
  this.equip = [d.initial_equipment.weapon_id, d.initial_equipment.shield_id, d.initial_equipment.armor_id,
    d.initial_equipment.helmet_id, d.initial_equipment.accessory_id];
  this.skills = [];
  this.paramBonus = [0, 0, 0, 0, 0, 0];
  this.expList = [];
  this.makeExpList();
  this.exp = this.expForLevel(this.level);
  this.learnSkillsForLevel();
  this.hp = this.maxHp();
  this.sp = this.maxSp();
  this.defending = false;
  this.hidden = false;
  this.battleAnimTimer = 0;
}
Actor.prototype = {
  data: function () { return DB.actor(this.id); },
  maxLevel: function () { return this.data().final_level; },

  /* RPG Maker 2000 exp curve (EasyRPG Game_Actor::CalculateExp, curve 1) */
  calcExp: function (level) {
    var d = this.data();
    var base = d.exp_base, inflation = d.exp_inflation, correction = d.exp_correction;
    inflation = 1.5 + inflation * 0.01;
    var result = 0;
    for (var i = level; i >= 1; i--) {
      result += Math.floor(correction + base);
      base = base * inflation;
      inflation = ((level + 1) * 0.002 + 0.8) * (inflation - 1) + 1;
    }
    return Math.min(result, 999999);
  },
  makeExpList: function () {
    this.expList = [0, 0];
    for (var l = 2; l <= this.maxLevel(); l++) this.expList[l] = this.calcExp(l - 1);
  },
  expForLevel: function (level) { return this.expList[level] || 0; },
  nextExp: function () { return this.level >= this.maxLevel() ? -1 : this.expList[this.level + 1]; },
  nextExpString: function () { var n = this.nextExp(); return n < 0 ? '------' : String(n); },

  baseParam: function (i) {
    var p = this.data().parameters;
    var arr = [p.maxhp, p.maxsp, p.attack, p.defense, p.spirit, p.agility][i];
    var idx = Math.min(this.level, arr.length) - 1;
    return (arr[idx] || 0) + this.paramBonus[i];
  },
  equipBonus: function (i) {
    var total = 0;
    for (var s = 0; s < 5; s++) {
      var it = this.equip[s] ? DB.item(this.equip[s]) : null;
      if (!it) continue;
      total += [0, 0, it.atk_points1, it.def_points1, it.spi_points1, it.agi_points1][i] || 0;
    }
    return total;
  },
  maxHp: function () { return Math.max(1, Math.min(999, this.baseParam(0))); },
  maxSp: function () { return Math.max(0, Math.min(999, this.baseParam(1))); },
  stateMult: function (key) {
    var m = 1;
    for (var i = 0; i < this.states.length; i++) {
      var st = DB.state(this.states[i]);
      if (st && st[key]) m *= 0.5;
    }
    return m;
  },
  atk: function () { return Math.max(1, Math.floor((this.baseParam(2) + this.equipBonus(2)) * this.stateMult('affect_attack'))); },
  def: function () { return Math.max(1, Math.floor((this.baseParam(3) + this.equipBonus(3)) * this.stateMult('affect_defense'))); },
  spi: function () { return Math.max(1, Math.floor((this.baseParam(4) + this.equipBonus(4)) * this.stateMult('affect_spirit'))); },
  agi: function () { return Math.max(1, Math.floor((this.baseParam(5) + this.equipBonus(5)) * this.stateMult('affect_agility'))); },

  weapon: function () { return this.equip[0] ? DB.item(this.equip[0]) : null; },
  hitChance: function () { var w = this.weapon(); return w ? w.hit : 90; },
  critChance: function () { var d = this.data(); return d.critical_hit ? d.critical_hit_chance : 0; },
  attackAnimation: function () { var w = this.weapon(); return w ? w.animation_id : this.data().unarmed_animation; },

  isDead: function () { return this.states.indexOf(1) >= 0; },
  canAct: function () {
    if (this.isDead()) return false;
    for (var i = 0; i < this.states.length; i++) {
      var st = DB.state(this.states[i]);
      if (st && st.restriction === 1) return false;
    }
    return true;
  },
  restriction: function () {
    var r = 0;
    for (var i = 0; i < this.states.length; i++) {
      var st = DB.state(this.states[i]);
      if (st && st.restriction > r) r = st.restriction;
    }
    return r;
  },
  addState: function (id) {
    if (this.states.indexOf(id) >= 0) return false;
    if (id === 1) { this.hp = 0; this.states = [1]; return true; }
    this.states.push(id);
    return true;
  },
  removeState: function (id) {
    var i = this.states.indexOf(id);
    if (i < 0) return false;
    this.states.splice(i, 1);
    if (id === 1 && this.hp === 0) this.hp = 1;
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
  stateRate: function (stateId) {
    var ranks = this.data().state_ranks;
    var rank = ranks[stateId - 1] == null ? 2 : ranks[stateId - 1];
    var st = DB.state(stateId);
    return [st.a_rate, st.b_rate, st.c_rate, st.d_rate, st.e_rate][rank];
  },
  attributeRate: function (attrId) {
    var ranks = this.data().attribute_ranks;
    var rank = ranks[attrId - 1] == null ? 2 : ranks[attrId - 1];
    var at = DB.attribute(attrId);
    return at ? [at.a_rate, at.b_rate, at.c_rate, at.d_rate, at.e_rate][rank] : 100;
  },

  changeHp: function (delta, lethal) {
    var hp = this.hp + delta;
    if (hp <= 0) { hp = lethal ? 0 : 1; }
    this.hp = Math.min(this.maxHp(), hp);
    if (this.hp === 0) this.addState(1);
  },
  changeSp: function (delta) { this.sp = Math.max(0, Math.min(this.maxSp(), this.sp + delta)); },
  fullHeal: function () { this.removeAllStates(); this.hp = this.maxHp(); this.sp = this.maxSp(); },

  /* exp / levels; returns list of level-up messages */
  changeExp: function (delta) {
    var msgs = [];
    var maxExp = this.expForLevel(this.maxLevel());
    this.exp = Math.max(0, Math.min(maxExp > 0 ? maxExp : 999999, this.exp + delta));
    while (this.level < this.maxLevel() && this.exp >= this.expList[this.level + 1]) {
      this.levelUp(msgs);
    }
    while (this.level > 1 && this.exp < this.expList[this.level]) {
      this.level--;
    }
    this.hp = Math.min(this.hp, this.maxHp());
    this.sp = Math.min(this.sp, this.maxSp());
    return msgs;
  },
  levelUp: function (msgs) {
    this.level++;
    msgs.push(this.name + ' ' + Terms.get('lvl_short') + ' ' + this.level + Terms.get('level_up'));
    var learned = this.learnSkillsForLevel();
    for (var i = 0; i < learned.length; i++) msgs.push(DB.skill(learned[i]).name + Terms.get('skill_learned'));
  },
  changeLevel: function (delta) {
    var target = Math.max(1, Math.min(this.maxLevel(), this.level + delta));
    var msgs = [];
    if (target > this.level) return this.changeExp(this.expList[target] - this.exp);
    this.level = target;
    this.exp = this.expList[target];
    this.hp = Math.min(this.hp, this.maxHp());
    return msgs;
  },
  learnSkillsForLevel: function () {
    var learned = [];
    var sk = this.data().skills;
    for (var k in sk) {
      var l = sk[k];
      if (l.level <= this.level && this.skills.indexOf(l.skill_id) < 0) { this.skills.push(l.skill_id); learned.push(l.skill_id); }
    }
    return learned;
  },
  learnSkill: function (id) { if (this.skills.indexOf(id) < 0) { this.skills.push(id); return true; } return false; },
  forgetSkill: function (id) { var i = this.skills.indexOf(id); if (i >= 0) { this.skills.splice(i, 1); return true; } return false; },

  /* equipment slot 0..4 */
  canEquip: function (item) {
    if (!item) return false;
    if (item.type < 1 || item.type > 5) return false;
    var set = item.actor_set;
    if (set && set.length >= this.id && !set[this.id - 1]) return false;
    return true;
  },
  changeEquipment: function (slot, itemId) {
    var old = this.equip[slot];
    if (old) Party.addItem(old, 1);
    this.equip[slot] = itemId;
    if (itemId) Party.addItem(itemId, -1);
    this.hp = Math.min(this.hp, this.maxHp());
    this.sp = Math.min(this.sp, this.maxSp());
  },
  setEquipment: function (slot, itemId) { this.equip[slot] = itemId; },

  serialize: function () {
    return { id: this.id, name: this.name, title: this.title, charName: this.charName, charIndex: this.charIndex,
      transparent: this.transparent, faceName: this.faceName, faceIndex: this.faceIndex, level: this.level, exp: this.exp,
      hp: this.hp, sp: this.sp, states: this.states, equip: this.equip, skills: this.skills, paramBonus: this.paramBonus };
  },
};

Actor.restore = function (s) {
  var a = new Actor(s.id);
  Object.assign(a, s);
  a.makeExpList();
  return a;
};
