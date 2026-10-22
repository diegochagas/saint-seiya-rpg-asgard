/* SceneBattle, continued: per-frame update and drawing, enemy actions, escape and transform. */
Object.assign(SceneBattle.prototype, {
  update: function () {
    this.frame++;
    this.updateVisuals();
    if (this.flow) { if (this.flow.update()) this.flow = null; return; }
    if (this.updateEvents()) return;
    if (this.pendingAction) { this.runner = new ActionRunner(this.pendingAction, this); this.pendingAction = null; }
    if (this.runner) { if (this.runner.update()) this.runner = null; return; }
    if (BattleFlow.checkEnd(this)) return;
    if (this.queue.length && this.input.canInterrupt()) { this.startNextAction(); return; }
    if (this.input.gaugesRun() && !BattleAnim.busy()) {
      var self = this;
      BattleATB.fill(Party.members.concat(this.enemies), function (b) { return self.queued(b); });
      this.collectReady();
    }
    this.updateWindows();
    this.input.update();
  },
  updateVisuals: function () {
    BattleAnim.update();
    FloatingNumbers.update();
    this.sprites.forEach(function (s) { s.update(); });
    this.enemies.forEach(function (e) { e.updateTimers(); });
    MessageWindow.update();
    MessageWindow.pollClose();
    var w = this.win;
    [w.options, w.status, w.command].forEach(updateSlide);
    w.status.update();
  },
  updateWindows: function () {
    var w = this.win;
    w.options.update(); w.command.update(); w.list.update(); w.target.update(); w.help.update();
    var cur = w.list.visible ? w.list.current() : null;
    if (cur) this.showHelp(cur.description);
  },

  draw: function (ctx) {
    if (this.backdrop) ctx.drawImage(this.backdrop, 0, 0);
    else { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, CONFIG.SCREEN_W, CONFIG.SCREEN_H); }
    this.drawBattlers(ctx);
    BattleAnim.drawBattle(ctx);
    FloatingNumbers.draw(ctx);
    if (this.input) this.input.drawCursors(ctx);
    var w = this.win;
    [w.options, w.status, w.command, w.target, w.list, w.help].forEach(function (x) { x.draw(ctx); });
    MessageWindow.draw(ctx);
  },
  /* back to front by y, like RPG_RT's z = y ordering */
  drawBattlers: function (ctx) {
    var list = this.enemies.map(function (e) { return { y: e.y, draw: function () { BattleSprites.drawEnemy(ctx, e); } }; });
    this.sprites.forEach(function (s) { list.push({ y: s.actor.y + 24, draw: function () { s.draw(ctx); } }); });
    list.sort(function (a, b) { return a.y - b.y; }).forEach(function (o) { o.draw(); });
  },

  /* ---- escape ---- */
  /* party menu "Escape": only before anyone acted, with first strike / initiative / surround */
  partyEscapeAllowed: function () {
    if (!this.args.allowEscape || this.turn > 0) return false;
    return this.args.firstStrike || this.condition === CONDITION.INITIATIVE || this.condition === CONDITION.SURROUND;
  },
  escapeAllowed: function () { return this.args.allowEscape && this.condition !== CONDITION.PINCERS && GameState.escapeAllowed; },
  average: function (list) { return list.reduce(function (s, b) { return s + b.agi(); }, 0) / Math.max(1, list.length); },
  attemptEscape: function (src) {
    if (src.isEnemy) { src.flee(); return; }
    var chance = BattleRules.escapeChance(this.average(this.activeEnemies()), this.average(Party.alive()), this.escapeFails);
    if (this.args.firstStrike || Rand.chance(chance)) { this.escapeNow(); return; }
    this.escapeFails++;
    this.showHelp(Terms.get('escape_failure'));
  },
  escapeNow: function () { this.flow = BattleFlow.escape(this); },
  terminate: function () { this.flow = BattleFlow.finish(this, 'abort'); },
  /* RPG_RT keeps the absolute HP/SP, clamped to the new maximums */
  transformEnemy: function (e, enemyId) {
    e.enemyId = enemyId; e.data = DB.enemy(enemyId); e.name = e.data.name;
    e.hp = Math.max(1, Math.min(e.hp, e.maxHp()));
    e.sp = Math.min(e.sp, e.maxSp());
    e.flash = BattleSprites.makeFlash(31, 31, 31, 31, 20);
  },
});

/* Enemy action from its AI pick (basic actions, skills, transformation). */
var BattleEnemyActions = {
  BASIC_KIND: [ACTION.ATTACK, ACTION.ATTACK, ACTION.DEFEND, ACTION.OBSERVE, ACTION.CHARGE, ACTION.SELF_DESTRUCT, ACTION.ESCAPE, ACTION.NOTHING],
  build: function (e, battle) {
    var pick = EnemyAI.choose(e, battle);
    if (!pick) return new BattleAction({ kind: ACTION.NOTHING, source: e });
    var action = this.fromPick(e, pick, battle);
    action.enemyPick = pick;
    return action;
  },
  fromPick: function (e, pick, battle) {
    if (pick.kind === ENEMY_KIND.SKILL) return this.skillAction(e, pick.skill_id, battle);
    if (pick.kind === ENEMY_KIND.TRANSFORM) return new BattleAction({ kind: ACTION.TRANSFORM, source: e, enemyId: pick.enemy_id });
    var kind = this.BASIC_KIND[pick.basic] || ACTION.NOTHING;
    if (pick.basic === ENEMY_BASIC.ESCAPE && battle.condition === CONDITION.SURROUND) kind = ACTION.NOTHING;
    return new BattleAction({ kind: kind, source: e, target: this.randomActor(), dual: pick.basic === ENEMY_BASIC.DUAL });
  },
  /* the action's switches flip once it has run (EasyRPG Game_BattleAlgorithm switch_on/off) */
  applySwitches: function (action) {
    var pick = action.enemyPick;
    if (!pick) return;
    if (pick.switch_on) GameState.setSw(pick.switch_on_id, true);
    if (pick.switch_off) GameState.setSw(pick.switch_off_id, false);
  },
  skillAction: function (e, skillId, battle) {
    var sk = DB.skill(skillId);
    var target = sk.scope === SCOPE.ENEMY ? this.randomActor() : sk.scope === SCOPE.ALLY ? BattleAuto.pick(battle.activeEnemies()) : e;
    return new BattleAction({ kind: ACTION.SKILL, source: e, skill: skillId, target: target || e });
  },
  randomActor: function () {
    var alive = Party.alive();
    return alive.length ? alive[Rand.int(0, alive.length - 1)] : null;
  },
};
