/* RPG Maker 2000 front-view battle (ported from saint-seiya-rpg-asgard js/scene_battle.js, a977249):
   one enemy of the troop. The 2003 battle has its own BattleEnemy in js/battle/enemy.js. */
var BATTLE2K_FADE_FRAMES = 30;

/**
 * @param {{enemy_id:number, x:number, y:number, invisible:boolean}} member troop member
 * @param {number} idx position in the troop
 */
function Battle2kEnemy(member, idx) {
  var d = DB.enemy(member.enemy_id);
  this.id = member.enemy_id;
  this.idx = idx;
  this.data = d;
  this.name = d.name;
  this.x = member.x; this.y = member.y;
  this.hp = d.max_hp; this.sp = d.max_sp;
  this.hidden = !!member.invisible;
  this.states = [];
  this.defending = false;
  this.charged = false;
  this.flash = 0;
  this.fadeOut = 0;
  this.dead = false;
  this.escaped = false;
}
Battle2kEnemy.prototype = {
  maxHp: function () { return this.data.max_hp; },
  maxSp: function () { return this.data.max_sp; },
  atk: function () { return this.data.attack; },
  def: function () { return this.data.defense; },
  spi: function () { return this.data.spirit; },
  agi: function () { return this.data.agility; },
  isDead: function () { return this.dead; },
  exists: function () { return !this.dead && !this.hidden && !this.escaped; },
  canAct: function () { return this.exists() && !BattlerStates.hasRestriction(this, 1); },
  hitChance: function () { return 90; },
  /* percent: the database stores "1 in N" */
  critChance: function () { return this.data.critical_hit ? 100 / Math.max(1, this.data.critical_hit_chance) : 0; },
  rankRate: function (ranks, id, rates) {
    var rank = ranks[id - 1] == null ? 2 : ranks[id - 1];
    return rates[rank];
  },
  attributeRate: function (attrId) {
    var at = DB.attribute(attrId);
    return at ? this.rankRate(this.data.attribute_ranks, attrId, [at.a_rate, at.b_rate, at.c_rate, at.d_rate, at.e_rate]) : 100;
  },
  stateRate: function (stateId) {
    var st = DB.state(stateId);
    return this.rankRate(this.data.state_ranks, stateId, [st.a_rate, st.b_rate, st.c_rate, st.d_rate, st.e_rate]);
  },
  changeHp: function (delta) {
    this.hp = Math.max(0, Math.min(this.maxHp(), this.hp + delta));
    if (this.hp === 0) { this.dead = true; this.fadeOut = BATTLE2K_FADE_FRAMES; }
  },
  addState: function (id) {
    if (id === DEAD_STATE) { this.changeHp(-this.hp); return true; }
    if (this.states.indexOf(id) >= 0) return false;
    this.states.push(id);
    return true;
  },
  removeState: function (id) { var i = this.states.indexOf(id); if (i >= 0) this.states.splice(i, 1); },
  stateMult: function () { return 1; },
  transform: function (enemyId) {
    var nd = DB.enemy(enemyId);
    if (!nd) return false;
    this.id = enemyId; this.data = nd; this.name = nd.name;
    this.hp = Math.min(this.hp, nd.max_hp);
    return true;
  },
};
