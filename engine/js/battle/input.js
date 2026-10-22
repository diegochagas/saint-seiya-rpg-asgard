/* Player input in battle (alternative layout): party options -> ready actor -> command ->
   skill/item list -> target. Produces BattleActions for the scene's queue. */
var INPUT = { OPTIONS: 'options', ACTOR: 'actor', COMMAND: 'command', SKILL: 'skill', ITEM: 'item',
  ENEMY: 'enemy', ALLY: 'ally', AUTO: 'auto', NONE: 'none' };
var COMMAND_TYPE = { ATTACK: 0, SKILL: 1, SUBSKILL: 2, DEFENSE: 3, ITEM: 4, ESCAPE: 5, SPECIAL: 6 };
var SKILL_TYPE_SUBSKILL_BASE = 4;

function BattleInput(battle) {
  this.battle = battle;
  this.phase = INPUT.NONE;   /* the opening lines play first; showOptions() hands control over */
  this.actor = null;
  this.pending = null;     /* {kind, skill?, item?} waiting for a target */
  this.counter = 0;
}
BattleInput.prototype = {
  w: function () { return this.battle.win; },
  /* gauges fill while the player browses only in active mode (EasyRPG S3:804-825) */
  gaugesRun: function () {
    if (this.phase === INPUT.ACTOR || this.phase === INPUT.AUTO) return true;
    return this.phase !== INPUT.OPTIONS && this.phase !== INPUT.NONE && !BattleATB.waitMode();
  },
  canInterrupt: function () {
    if (this.phase === INPUT.ACTOR || this.phase === INPUT.AUTO) return true;
    return this.phase === INPUT.COMMAND && !BattleATB.waitMode();
  },
  /* an enemy action interrupts the command window: the actor goes back to the ready list */
  interrupt: function () {
    if (this.phase !== INPUT.COMMAND) return;
    this.battle.readyActors.unshift(this.actor);
    this.toActorPhase();
  },

  showOptions: function (instant) {
    var w = this.w();
    this.phase = INPUT.OPTIONS;
    this.actor = null;
    w.options.active = true;
    w.options.disabled = { 2: !this.battle.partyEscapeAllowed() };
    w.options.dirty = true;
    slideWindow(w.options, 0, instant ? 1 : WINDOW_SLIDE_FRAMES);
    slideWindow(w.status, OPTIONS_W, instant ? 1 : WINDOW_SLIDE_FRAMES);
    slideWindow(w.command, OPTIONS_W + STATUS_W, instant ? 1 : WINDOW_SLIDE_FRAMES);
    w.status.index = -1;
  },
  leaveOptions: function () {
    var w = this.w();
    w.options.active = false;
    slideWindow(w.options, -OPTIONS_W, WINDOW_SLIDE_FRAMES);
    slideWindow(w.status, 0, WINDOW_SLIDE_FRAMES);
    slideWindow(w.command, STATUS_W, WINDOW_SLIDE_FRAMES);
  },
  onOption: function (i) {
    if (i === 2 && this.w().options.disabled[2]) { Audio_.sys('buzzer'); return; }
    Audio_.sys('decision');
    if (i === 2) { this.phase = INPUT.NONE; this.battle.escapeNow(); return; }
    this.leaveOptions();
    if (i === 1) { this.phase = INPUT.AUTO; return; }
    this.toActorPhase();
  },
  toActorPhase: function () {
    var w = this.w();
    this.phase = INPUT.ACTOR;
    this.actor = null;
    w.command.active = false;
    w.command.labels = [];
    w.command.itemMax = 0;
    w.command.dirty = true;
    w.status.index = -1;
  },

  update: function () {
    this.counter++;
    if (this.phase === INPUT.ACTOR) this.updateActorPhase();
    else if (this.phase === INPUT.AUTO) this.updateAuto();
    else if (this.phase === INPUT.ENEMY) this.updateEnemyTarget();
    else if (this.phase === INPUT.ALLY) this.updateAllyTarget();
  },
  /* the next ready actor that can still act (it may have died or been paralysed while waiting) */
  nextReady: function () {
    var list = this.battle.readyActors;
    while (list.length && !list[0].canAct()) list.shift();
    return list.shift() || null;
  },
  updateActorPhase: function () {
    if (Input.triggered('cancel')) { Input.consume('cancel'); Audio_.sys('cancel'); this.showOptions(false); return; }
    var next = this.nextReady();
    if (next) this.openCommands(next);
  },
  updateAuto: function () {
    if (Input.triggered('cancel')) { Input.consume('cancel'); Audio_.sys('cancel'); this.showOptions(false); return; }
    var next = this.nextReady();
    if (next) this.battle.queueAction(BattleAuto.actionFor(next, this.battle));
  },
};
