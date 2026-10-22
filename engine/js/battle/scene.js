/* RPG Maker 2003 battle scene: ATB loop, action queue, troop events, drawing.
   Start/victory/defeat/escape sequences are in scene_flow.js, input in input*.js. */

/**
 * @param {{troopId:number, background:?string, terrainId:number, allowEscape:boolean, firstStrike:boolean,
 *          defeatMode:?number, random:?boolean, condition:?number}} args
 * @param {function(string)} onDone result: 'victory' | 'escape' | 'defeat' | 'abort'
 */
function SceneBattle(args, onDone) {
  this.args = args;
  this.onDone = onDone;
  this.troop = DB.troop(args.troopId);
  if (!this.troop) throw new Error('battle: troop ' + args.troopId + ' does not exist');
  this.enemies = [];
  this.queue = [];
  this.readyActors = [];
  this.runner = null;
  this.pendingAction = null;
  this.turn = 0;
  this.pagesRun = {};
  this.escapeFails = 0;
  this.frame = 0;
  this.flow = null;          /* scripted sequence (start, victory, defeat, escape) */
  this.interpreter = new Interpreter(0, false);
}
SceneBattle.prototype = {
  start: function () {
    var self = this;
    Game.battleScene = this;
    Object.keys(this.troop.members).forEach(function (k, i) { self.enemies.push(new BattleEnemy(self.troop.members[k], i)); });
    this.setBackdrop(this.args.background || (DB.terrain(this.args.terrainId || 1) || {}).background_name);
    this.condition = BattleLayout.normalizeCondition(this.args.condition || CONDITION.NONE, Party.size(), this.activeEnemies().length);
    BattleLayout.placeAll(Party.members, this.enemies, this.condition, this.troop, this.args.terrainId || 0);
    this.sprites = Party.members.map(function (a) { a.defending = false; a.battleTurn = 0; return new ActorBattleSprite(a); });
    BattleATB.initialGauges(Party.members, this.enemies, this.condition, this.args.firstStrike);
    Party.members.forEach(function (a) { a.clearBattleStats(); a.attackSlot = null; });
    this.buildWindows();
    this.input = new BattleInput(this);
    FloatingNumbers.clear();
    BattleAnim.clear();
    BattleFlow.begin(this);
    Input.clear();
  },
  buildWindows: function () {
    var self = this, st = BattleWindowStyle;
    var w = this.win = {};
    w.options = st.list(0, OPTIONS_W, [Terms.get('battle_fight'), Terms.get('battle_auto'), Terms.get('battle_escape')]);
    w.options.onOk = function (i) { self.input.onOption(i); };
    w.status = new BattleStatusWindow(OPTIONS_W);
    w.command = st.list(OPTIONS_W + STATUS_W, OPTIONS_W, []);
    w.command.onOk = function (i) { self.input.onCommand(i); };
    w.command.onCancel = function () { self.input.onCommandCancel(); };
    w.target = new BattleTargetWindow(this.enemies);
    w.list = new BattleListWindow();
    w.list.onOk = function () { self.input.onListPick(); };
    w.list.onCancel = function () { self.input.onListCancel(); };
    w.help = st.apply(new Window_Help(0, 0, 320, 32));
    w.help.visible = false;
    w.options.active = false;
  },
  setBackdrop: function (name) { this.backdrop = Loader.image('backdrop', name); },
  spriteOf: function (actor) { return this.sprites[Party.members.indexOf(actor)] || this.sprites[0]; },
  activeEnemies: function () { return this.enemies.filter(function (e) { return e.exists(); }); },
  activeBattlers: function () { return Party.alive().concat(this.activeEnemies()); },
  showHelp: function (text) { this.win.help.setText(text); this.win.help.visible = true; },
  hideHelp: function () { this.win.help.visible = false; },
  /* help line lists the target's states, like RPG_RT's targeting help */
  showTargetStates: function (e) {
    var names = e ? e.states.map(function (id) { return DB.state(id); }).filter(Boolean).map(function (s) { return s.name; }) : [];
    if (names.length) this.showHelp(names.slice(0, 5).join(' ')); else this.hideHelp();
  },
  /* a battler started acting: one 2003 "turn"; every troop page may fire again */
  turnStarted: function (source) {
    this.turn++;
    source.battleTurn = (source.battleTurn || 0) + 1;
    this.pagesRun = {};
  },

  queueAction: function (action) {
    var src = action.source;
    src.atbGauge = 0;
    src.defending = action.kind === ACTION.DEFEND;
    this.queue.push(action);
  },
  queued: function (b) {
    return this.queue.some(function (a) { return a.source === b; }) || this.readyActors.indexOf(b) >= 0 ||
      (this.runner && this.runner.action.source === b) || this.input.actor === b;
  },
  collectReady: function () {
    var self = this;
    this.enemies.forEach(function (e) {
      if (!BattleATB.isFull(e) || self.queued(e) || !e.exists()) return;
      self.queueAction(BattleAuto.confused(e, self) || BattleEnemyActions.build(e, self));
    });
    Party.members.forEach(function (a) {
      if (!BattleATB.isFull(a) || self.queued(a) || !a.canAct()) return;
      var forced = BattleAuto.confused(a, self);
      if (forced) self.queueAction(forced);
      else if (a.autoBattle || self.input.phase === INPUT.AUTO) self.queueAction(BattleAuto.actionFor(a, self));
      else self.readyActors.push(a);
    });
  },
  /* re-check before acting: a battler that died, cannot act or ran out of SP/items loses its turn */
  stillValid: function (action) {
    var src = action.source;
    if (!src.canAct() || (!src.isEnemy && Party.members.indexOf(src) < 0)) return false;
    if (action.kind === ACTION.ITEM || action.viaItem) return src.isEnemy || Party.itemCount(action.item) > 0;
    if (action.kind === ACTION.SKILL) return BattleRules.skillCost(src, DB.skill(action.skill)) <= src.sp;
    return true;
  },
  /* the battle is decided: no troop page may start any more */
  isOver: function () { return !this.activeEnemies().length || BattleRules.unableToFight(Party.members); },
  startNextAction: function () {
    var action = this.queue.shift();
    action = BattleAuto.confused(action.source, this) || action;
    if (!this.stillValid(action)) return;
    this.turnStarted(action.source);
    this.input.interrupt();
    this.pendingAction = action;
    this.runPages(PAGE_MOMENT.BEFORE, action.source);
  },
  actionFinished: function (action) {
    BattleEnemyActions.applySwitches(action);
    this.runPages(PAGE_MOMENT.AFTER, action.source);
  },
  runPages: function (moment, source) {
    if (this.isOver()) { this.pageMoment = null; return; }
    var page = TroopPages.next(this, moment, source);
    if (page) this.interpreter.setup(page.event_commands, 0);
    this.pageMoment = { moment: moment, source: source };
  },
  /* keep firing matching pages of the same moment until none is left */
  updateEvents: function () {
    if (this.interpreter.running() && !this.activeEnemies().length) this.interpreter.list = null;   /* 2003 stops pages once won */
    if (this.interpreter.running()) { this.interpreter.update(); return true; }
    if (MessageWindow.busy()) return true;
    if (!this.pageMoment) return false;
    var m = this.pageMoment;
    this.pageMoment = null;
    this.runPages(m.moment, m.source);
    if (this.interpreter.running()) return true;
    this.pageMoment = null;
    return false;
  },
  onActorHit: function (actor, res) {
    var sp = this.spriteOf(actor);
    if (actor.isDead()) { actor.atbGauge = 0; sp.setPose(POSE.DEAD, POSE_HOLD); }
    else if (!res.miss && !res.heal && res.value > 0) sp.setPose(POSE.DAMAGE, POSE_THEN_IDLE);
  },
};
