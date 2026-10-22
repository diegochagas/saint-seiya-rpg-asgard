/* A troop member in battle: stats from the database, states, ATB gauge and sprite timers. */
var ENEMY_DEATH_FRAMES = 36;   /* fade-out after death or escape */
var ENEMY_BLINK_FRAMES = 20;   /* hidden every other 5 frames after taking damage */

/**
 * @param {object} member TroopMember {enemy_id, x, y, invisible}
 * @param {number} index 0-based position in the troop
 */
function BattleEnemy(member, index) {
  this.member = member;
  this.index = index;
  this.enemyId = member.enemy_id;
  this.data = DB.enemy(member.enemy_id);
  this.name = this.data.name;
  this.hp = this.data.max_hp;
  this.sp = this.data.max_sp;
  this.states = [];
  this.isEnemy = true;
  this.hidden = !!member.invisible;
  this.dead = false;
  this.escaped = false;
  this.defending = false;
  this.charged = false;
  this.atbGauge = 0;
  this.battleTurn = 0;
  this.x = member.x; this.y = member.y;
  this.blink = 0; this.fade = 0; this.flash = null;
  this.bobPhase = Rand.int(0, 63);
}
BattleEnemy.prototype = {
  maxHp: function () { return this.data.max_hp; },
  maxSp: function () { return this.data.max_sp; },
  baseStat: function (i) { return [0, 0, this.data.attack, this.data.defense, this.data.spirit, this.data.agility][i]; },
  stat: function (i, key) {
    var v = this.baseStat(i) + ((this.battleMods && this.battleMods[i]) || 0);
    return Math.max(1, BattleRules.stateFlag(this, key) ? Math.floor(v / 2) : v);
  },
  /** stat-change skills: modifier within -base/2 .. +base */
  changeBattleStat: function (i, delta) {
    this.battleMods = this.battleMods || [0, 0, 0, 0, 0, 0];
    var base = this.baseStat(i);
    this.battleMods[i] = Math.max(-Math.floor(base / 2), Math.min(base, this.battleMods[i] + delta));
  },
  atk: function () { return this.stat(2, 'affect_attack'); },
  def: function () { return this.stat(3, 'affect_defense'); },
  spi: function () { return this.stat(4, 'affect_spirit'); },
  agi: function () { return this.stat(5, 'affect_agility'); },
  weapons: function () { return []; },
  hitChance: function () { return this.data.miss ? 70 : 90; },
  critChance: function () { return this.data.critical_hit ? 100 / Math.max(1, this.data.critical_hit_chance) : 0; },
  halfSpCost: function () { return false; },
  image: function () { return Loader.image('monster', this.data.battler_name); },

  isDead: function () { return this.dead; },
  /* on the field and still fighting */
  exists: function () { return !this.dead && !this.hidden && !this.escaped; },
  restriction: function () {
    return this.states.reduce(function (r, id) { var st = DB.state(id); return st && st.restriction > r ? st.restriction : r; }, 0);
  },
  canAct: function () { return this.exists() && !BattlerStates.hasRestriction(this, 1); },
  rank: function (ranks, id) { return ranks[id - 1] == null ? 2 : ranks[id - 1]; },
  attributeRate: function (id) {
    var at = DB.attribute(id);
    return at ? [at.a_rate, at.b_rate, at.c_rate, at.d_rate, at.e_rate][this.rank(this.data.attribute_ranks, id)] : 100;
  },
  stateRate: function (id) {
    var st = DB.state(id);
    return [st.a_rate, st.b_rate, st.c_rate, st.d_rate, st.e_rate][this.rank(this.data.state_ranks, id)];
  },
  significantState: function () {
    return this.states.reduce(function (best, id) { var st = DB.state(id); return st && (!best || st.priority > best.priority) ? st : best; }, null);
  },

  changeHp: function (delta) {
    this.hp = Math.max(0, Math.min(this.maxHp(), this.hp + delta));
    if (this.hp === 0) this.die();
  },
  changeSp: function (delta) { this.sp = Math.max(0, Math.min(this.maxSp(), this.sp + delta)); },
  die: function () {
    if (this.dead) return;
    this.dead = true;
    this.states = [DEAD_STATE];
    this.atbGauge = 0;
    this.fade = ENEMY_DEATH_FRAMES;
  },
  flee: function () { this.escaped = true; this.fade = ENEMY_DEATH_FRAMES; },
  addState: function (id) {
    if (id === DEAD_STATE) { this.changeHp(-this.hp); return true; }
    if (this.states.indexOf(id) >= 0) return false;
    this.states.push(id);
    return true;
  },
  removeState: function (id) {
    var i = this.states.indexOf(id);
    if (i < 0) return false;
    this.states.splice(i, 1);
    return true;
  },
  /* ShowHiddenMonster / revive by skill */
  appear: function () { this.hidden = false; },
  revive: function (hp) { this.dead = false; this.states = []; this.fade = 0; this.hp = Math.max(1, Math.min(this.maxHp(), hp)); },
  startBlink: function () { this.blink = ENEMY_BLINK_FRAMES; },
  updateTimers: function () {
    if (this.blink > 0) this.blink--;
    if (this.fade > 0) this.fade--;
    if (this.flash) { this.flash.t++; if (this.flash.t >= this.flash.frames) this.flash = null; }
    this.bobPhase++;
  },
};
