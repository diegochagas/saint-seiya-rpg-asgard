/* BattleInput, continued: choosing an enemy (cursor + names window) or an ally (status window). */
Object.assign(BattleInput.prototype, {
  beginTarget: function (pending, ally) {
    var w = this.w();
    this.pending = pending;
    this.returnPhase = this.phase;
    if (ally) {
      this.phase = INPUT.ALLY;
      w.status.index = Party.members.indexOf(this.actor);
      return;
    }
    this.phase = INPUT.ENEMY;
    w.target.visible = true;
    w.target.refresh();
    w.target.setIndex(0);
  },
  endTarget: function () {
    this.w().target.visible = false;
    this.battle.hideHelp();
  },
  targetCancel: function () {
    Audio_.sys('cancel');
    this.endTarget();
    if (this.pending.kind === ACTION.SKILL && !this.pending.viaItem) this.openSkills(null);
    else if (this.pending.kind !== ACTION.ATTACK) this.openItems();
    else this.openCommands(this.actor);
  },
  updateEnemyTarget: function () {
    var t = this.w().target;
    t.refresh();
    var list = t.targets();
    if (!list.length) { this.endTarget(); this.openCommands(this.actor); return; }
    if (t.index >= list.length) t.setIndex(list.length - 1);
    this.moveIndex(t, list.length);
    var e = t.selected();
    this.battle.showTargetStates(e);
    if (this.actor) this.battle.spriteOf(this.actor).flipped = e.x > this.actor.x;
    if (Input.triggered('ok')) { Input.consume('ok'); Audio_.sys('decision'); this.endTarget(); this.commit(Object.assign(this.pending, { target: e })); }
    else if (Input.triggered('cancel')) { Input.consume('cancel'); this.targetCancel(); }
  },
  updateAllyTarget: function () {
    var st = this.w().status;
    this.moveIndex(st, Party.size());
    if (Input.triggered('ok')) { Input.consume('ok'); Audio_.sys('decision'); this.commit(Object.assign(this.pending, { target: Party.members[st.index] })); }
    else if (Input.triggered('cancel')) { Input.consume('cancel'); st.index = Party.members.indexOf(this.actor); this.targetCancel(); }
  },
  moveIndex: function (win, count) {
    var step = Input.repeated('down') || Input.repeated('right') ? 1 : Input.repeated('up') || Input.repeated('left') ? -1 : 0;
    if (!step || count < 2) return;
    Audio_.sys('cursor');
    win.setIndex((win.index + step + count) % count);
  },
  /* queue the action and give control back to actor selection */
  commit: function (spec) {
    var w = this.w();
    this.battle.queueAction(new BattleAction(Object.assign({ source: this.actor }, spec)));
    w.command.active = false;
    this.pending = null;
    this.toActorPhase();
  },
  /** cursor sprites over the chosen battler (System2 rows 0 enemy / 16 ally) */
  drawCursors: function (ctx) {
    if (this.phase === INPUT.ENEMY) {
      var e = this.w().target.selected(), img = e && e.image();
      if (e) System2.drawCursor(ctx, e.x + (img ? img.width / 2 : 0), e.y, this.counter, false);
      return;
    }
    var who = this.phase === INPUT.ALLY ? Party.members[this.w().status.index] : this.actor;
    if (who && this.phase !== INPUT.ACTOR && this.phase !== INPUT.OPTIONS) System2.drawCursor(ctx, who.x, who.y - 40, this.counter, true);
  },
});

/* AutoBattle, and battlers that confusion or berserk states control. */
var BattleAuto = {
  pick: function (list) { return list.length ? list[Rand.int(0, list.length - 1)] : null; },
  actionFor: function (actor, battle) {
    return new BattleAction({ kind: ACTION.ATTACK, source: actor, target: this.pick(battle.activeEnemies()) });
  },
  /** @returns {BattleAction|null} forced normal attack: restriction 2 hits the other side, 3 its own side */
  confused: function (b, battle) {
    var r = BattlerStates.confusion(b);
    if (!r) return null;
    var own = b.isEnemy ? battle.activeEnemies() : Party.alive();
    var other = b.isEnemy ? Party.alive() : battle.activeEnemies();
    var pool = r === 3 ? own.filter(function (x) { return x !== b; }) : other;
    return new BattleAction({ kind: ACTION.ATTACK, source: b, target: this.pick(pool.length ? pool : other) });
  },
};
