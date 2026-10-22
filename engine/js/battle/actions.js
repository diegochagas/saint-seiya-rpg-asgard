/* One battler action, created when chosen and played as a list of steps (one per phase of
   RPG_RT's 2003 action sequence). Each step is fn(frame) -> true when finished. */
var ACTION = { ATTACK: 'attack', SKILL: 'skill', ITEM: 'item', DEFEND: 'defend', ESCAPE: 'escape',
  OBSERVE: 'observe', CHARGE: 'charge', SELF_DESTRUCT: 'selfdestruct', TRANSFORM: 'transform', NOTHING: 'nothing' };
var MOVE_FRAMES = 13, MOVE_DISTANCE = 25;
var MOVEMENT = { NONE: 0, STEP: 1, JUMP: 2, MOVE: 3 };
var HIT_PAUSE_FRAMES = 20;

/** @param {object} a {kind, source, target?, skill?, item?, enemyId?, commandId?, dual?} */
function BattleAction(a) {
  Object.assign(this, a);
  this.targets = [];
}

/** Plays a BattleAction inside the battle scene. */
function ActionRunner(action, battle) {
  this.action = action;
  this.battle = battle;
  this.steps = ActionSteps.build(this);
  this.index = 0;
  this.frame = 0;
}
ActionRunner.prototype = {
  /** @returns {boolean} true once every step has finished */
  update: function () {
    while (this.index < this.steps.length) {
      if (!this.steps[this.index].call(this, this.frame++)) return false;
      this.index++;
      this.frame = 0;
    }
    return true;
  },
  src: function () { return this.action.source; },
  sprite: function () { return this.src().isEnemy ? null : this.battle.spriteOf(this.src()); },
  float: function (b, result) {
    var text = result.miss ? Terms.get('miss') : String(result.value);
    FloatingNumbers.add(text, b.x, b.y - 8, result.heal ? HEAL_COLOR : DAMAGE_COLOR);
  },
};

var ActionSteps = {
  build: function (r) {
    var kind = r.action.kind;
    var list = [this.waitAnimation, this.enemyFlash, this.tickStates, this.notice, this.begin];
    if (kind === ACTION.ATTACK || kind === ACTION.SKILL || kind === ACTION.ITEM) {
      list.push(this.moveForward, this.pose, this.animation, this.hits, this.moveBack);
    } else {
      list.push(this.simple);
    }
    return list.concat([this.waitNumbers, this.finish]);
  },
  waitAnimation: function () { return !BattleAnim.busy(); },
  enemyFlash: function (t) {
    var src = this.src();
    if (!src.isEnemy) return true;
    if (t === 0) src.flash = BattleSprites.makeFlash(31, 31, 31, 32, 48);
    return t >= 20;
  },
  tickStates: function () {
    var self = this;
    this.battle.activeBattlers().forEach(function (b) {
      var change = BattleEffects.tickStates(b);
      if (change) self.float(b, { value: Math.abs(change), heal: change > 0 });
    });
    return true;
  },
  notice: function (t) {
    var text = ActionText.start(this.action);
    if (!text) return true;
    if (t === 0) this.battle.showHelp(text);
    var isSkill = this.action.kind === ACTION.SKILL;
    var min = isSkill ? 15 : 10, max = isSkill ? 50 : 40;
    return t >= max || (t >= min && Input.pressed('ok'));
  },
  begin: function () {
    this.battle.hideHelp();
    ActionTargets.payCosts(this.action);
    this.action.targets = ActionTargets.resolve(this.action, this.battle);
    var first = this.action.targets[0];
    var sp = this.sprite();
    if (sp && first) sp.flipped = first.x > this.src().x;
    return true;
  },
  movement: function () { return ActionVisuals.movement(this.action); },
  moveForward: function (t) { return ActionVisuals.move(this, t, 1); },
  moveBack: function (t) { return ActionVisuals.move(this, t, -1); },
  pose: function () { ActionVisuals.startPose(this); return true; },
  animation: function (t) {
    if (t === 0) ActionVisuals.playAnimation(this);
    var sp = this.sprite();
    return t > 2 && !BattleAnim.busy() && !(sp && sp.busy() && t < 60);
  },
  hits: function (t) {
    if (t === 0) ActionHits.apply(this);
    return t >= HIT_PAUSE_FRAMES;
  },
  simple: function (t) {
    if (t === 0) ActionHits.simple(this);
    return t >= HIT_PAUSE_FRAMES;
  },
  waitNumbers: function () { return !FloatingNumbers.busy(); },
  finish: function () {
    var sp = this.sprite();
    if (sp) { sp.weapon = null; sp.dx = 0; sp.dy = 0; sp.afterImages = []; sp.toIdle(); }
    this.battle.hideHelp();
    this.battle.actionFinished(this.action);
    return true;
  },
};
