/* Actor level, exp, skills and the RPG Maker 2003 ChangeClass command. */
var CLASS_SKILLS = { NO_CHANGE: 0, RESET: 1, ADD: 2 };
var CLASS_PARAMS = { NO_CHANGE: 0, HALF: 1, LEVEL1: 2, RESET: 3 };

/**
 * Exp needed to go from level 1 to level+1 (EasyRPG Game_Actor::CalculateExp).
 * 2000 uses the inflation curve, 2003 a linear one.
 * @param {{exp_base:number, exp_inflation:number, exp_correction:number}} src actor or class
 * @param {number} level
 * @param {string} engine "2k" or "2k3"
 * @returns {number} example: expCurve({exp_base:30, exp_inflation:30, exp_correction:0}, 1, '2k3') === 60
 */
function expCurve(src, level, engine) {
  var base = src.exp_base, inflation = src.exp_inflation, correction = src.exp_correction;
  var result = 0, i;
  if (engine === '2k3') {
    for (i = 1; i <= level; i++) result += Math.trunc(base) + i * Math.trunc(inflation) + Math.trunc(correction);
    return Math.min(result, ACTOR_LIMITS_2K3.exp);
  }
  inflation = 1.5 + inflation * 0.01;
  for (i = level; i >= 1; i--) {
    result += Math.trunc(correction + base);
    base = base * inflation;
    inflation = ((level + 1) * 0.002 + 0.8) * (inflation - 1) + 1;
  }
  return Math.min(result, ACTOR_LIMITS_2K.exp);
}

Object.assign(Actor.prototype, {
  maxLevel: function () { return Math.min(this.data().final_level, actorLimits().level); },
  makeExpList: function () {
    var src = this.growthClass() || this.data();
    this.expList = [0, 0];
    for (var l = 2; l <= this.maxLevel(); l++) this.expList[l] = expCurve(src, l - 1, Loader.engine());
  },
  expForLevel: function (level) { return this.expList[level] || 0; },
  nextExp: function () { return this.level >= this.maxLevel() ? -1 : this.expList[this.level + 1]; },
  nextExpString: function () { var n = this.nextExp(); return n < 0 ? '------' : String(n); },

  /* exp / levels; returns list of level-up messages */
  changeExp: function (delta) {
    var msgs = [];
    var maxExp = this.expForLevel(this.maxLevel());
    this.exp = Math.max(0, Math.min(maxExp > 0 ? maxExp : actorLimits().exp, this.exp + delta));
    while (this.level < this.maxLevel() && this.exp >= this.expList[this.level + 1]) this.levelUp(msgs);
    while (this.level > 1 && this.exp < this.expList[this.level]) this.level--;
    this.clampHpSp();
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
    if (target > this.level) return this.changeExp(this.expList[target] - this.exp);
    this.level = target;
    this.exp = this.expList[target];
    this.clampHpSp();
    return [];
  },
  /* skills of the (changed) class or the actor, learned up to the current level */
  learnSkillsForLevel: function () {
    var learned = [], self = this;
    var table = (this.growthClass() || this.data()).skills;
    Object.keys(table).forEach(function (k) {
      var l = table[k];
      if (l.level <= self.level && self.learnSkill(l.skill_id)) learned.push(l.skill_id);
    });
    return learned;
  },
  learnSkill: function (id) { if (this.skills.indexOf(id) >= 0) return false; this.skills.push(id); return true; },
  forgetSkill: function (id) { var i = this.skills.indexOf(id); if (i < 0) return false; this.skills.splice(i, 1); return true; },

  /* RPG_RT ChangeClass: unequips everything, keeps current stats as offsets unless asked otherwise */
  changeClass: function (classId, opts) {
    var cls = classId > 0 ? DB.klass(classId) : null;
    if (classId > 0 && !cls) throw new Error('ChangeClass: class ' + classId + ' does not exist');
    var keep = { hp: this.hp, sp: this.sp, level: opts.resetLevel ? 1 : this.level };
    var stats = [0, 1, 2, 3, 4, 5].map(this.baseParam, this);
    this.removeAllEquipment();
    this.paramBonus = [0, 0, 0, 0, 0, 0];
    this.classId = classId;
    this.applyBattleSettings(cls || this.data(), cls ? cls.battler_animation : this.data().battler_animation || 0);
    this.makeExpList();
    this.level = 1;
    stats = this.classStats(stats, opts.paramMode);
    this.level = keep.level;
    this.exp = this.expForLevel(this.level);
    if (opts.paramMode !== CLASS_PARAMS.RESET) this.paramBonus = stats.map(function (v, i) { return v - this.rawParam(i); }, this);
    this.hp = keep.hp; this.sp = keep.sp;
    this.clampHpSp();
    this.classSkills(opts.skillMode);
  },
  classStats: function (stats, mode) {
    if (mode === CLASS_PARAMS.HALF) return stats.map(function (v) { return Math.floor(v / 2); });
    if (mode === CLASS_PARAMS.LEVEL1) return [0, 1, 2, 3, 4, 5].map(this.rawParam, this);
    return stats;
  },
  classSkills: function (mode) {
    if (mode === CLASS_SKILLS.RESET) this.skills = [];
    if (mode !== CLASS_SKILLS.NO_CHANGE) this.learnSkillsForLevel();
  },
});
