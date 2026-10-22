/* BattleInput, continued: actor commands, skill/item lists and target selection. */
var SKILL_KIND = { NORMAL: 0, TELEPORT: 1, ESCAPE: 2, SWITCH: 3 };
var ITEM_KIND = { MEDICINE: 6, SPECIAL: 8, SWITCH: 9 };

/* teleport/escape skills never work in battle; switch skills only when flagged for battle */
BattleInput.skillUsable = function (sk) {
  if (sk.type === SKILL_KIND.TELEPORT || sk.type === SKILL_KIND.ESCAPE) return false;
  return sk.type !== SKILL_KIND.SWITCH || sk.occasion_battle;
};
BattleInput.itemUsable = function (it) {
  if (it.type === ITEM_KIND.MEDICINE) return !it.occasion_field1;
  if (it.type === ITEM_KIND.SPECIAL) return true;
  if (it.type === ITEM_KIND.SWITCH) return it.occasion_battle;
  return it.type >= ITEM_WEAPON && it.type <= ITEM_ACCESSORY && it.use_skill;
};

Object.assign(BattleInput.prototype, {
  commandsOf: function (actor) {
    return actor.battleCommands.map(function (id) { return { id: id, cmd: DB.battleCommand(id) }; })
      .filter(function (c) { return c.cmd; });
  },
  openCommands: function (actor) {
    var w = this.w();
    this.actor = actor;
    this.commands = this.commandsOf(actor);
    w.command.labels = this.commands.map(function (c) { return c.cmd.name; });
    w.command.itemMax = this.commands.length;
    w.command.disabled = {};
    var self = this;
    this.commands.forEach(function (c, i) { if (c.cmd.type === COMMAND_TYPE.ESCAPE && !self.battle.escapeAllowed()) w.command.disabled[i] = true; });
    w.command.setIndex(0);
    w.command.active = true;
    w.command.dirty = true;
    w.status.index = Party.members.indexOf(actor);
    this.phase = INPUT.COMMAND;
  },
  /* back to the party menu (Fight / Auto / Escape); the actor keeps its full gauge */
  onCommandCancel: function () {
    Audio_.sys('cancel');
    this.battle.readyActors.unshift(this.actor);
    this.w().command.active = false;
    this.showOptions(false);
  },
  onCommand: function (i) {
    var c = this.commands[i];
    if (this.w().command.disabled[i]) { Audio_.sys('buzzer'); return; }
    Audio_.sys('decision');
    this.actor.lastBattleCommand = c.id;
    this.w().command.active = false;
    var t = c.cmd.type;
    if (t === COMMAND_TYPE.ATTACK) this.beginTarget({ kind: ACTION.ATTACK }, false);
    else if (t === COMMAND_TYPE.SKILL || t === COMMAND_TYPE.SUBSKILL) this.openSkills(this.skillFilter(c));
    else if (t === COMMAND_TYPE.ITEM) this.openItems();
    else if (t === COMMAND_TYPE.DEFENSE) this.commit({ kind: ACTION.DEFEND });
    else if (t === COMMAND_TYPE.ESCAPE) this.commit({ kind: ACTION.ESCAPE });
    else this.commit({ kind: ACTION.NOTHING });
  },
  /* subskill commands list skills of type 4, 5, ... in the order the subskill commands appear */
  skillFilter: function (c) {
    if (c.cmd.type !== COMMAND_TYPE.SUBSKILL) return null;
    var cmds = Loader.db.battlecommands.commands, n = 0;
    Object.keys(cmds).forEach(function (k) { if (+k < c.id && cmds[k].type === COMMAND_TYPE.SUBSKILL) n++; });
    return SKILL_TYPE_SUBSKILL_BASE + n;
  },
  openSkills: function (type) {
    var a = this.actor, list = this.w().list;
    this.listIds = a.skills.filter(function (id) { var sk = DB.skill(id); return sk && (type === null || sk.type === type); });
    list.setEntries(this.listIds.map(function (id) {
      var sk = DB.skill(id), cost = BattleRules.skillCost(a, sk);
      return { name: sk.name, count: cost, enabled: cost <= a.sp && BattleInput.skillUsable(sk), description: sk.description };
    }));
    this.openList(INPUT.SKILL);
  },
  openItems: function () {
    var list = this.w().list;
    this.listIds = Party.itemIds();
    list.setEntries(this.listIds.map(function (id) {
      var it = DB.item(id);
      return { name: it.name, count: Party.itemCount(id), enabled: BattleInput.itemUsable(it), description: it.description };
    }));
    this.openList(INPUT.ITEM);
  },
  openList: function (phase) {
    var list = this.w().list;
    list.visible = true;
    list.active = true;
    this.phase = phase;
  },
  closeList: function () { var l = this.w().list; l.visible = false; l.active = false; this.battle.hideHelp(); },
  onListCancel: function () { Audio_.sys('cancel'); this.closeList(); this.openCommands(this.actor); },
  onListPick: function () {
    var e = this.w().list.current();
    if (!e || !e.enabled) { Audio_.sys('buzzer'); return; }
    Audio_.sys('decision');
    var id = this.listIds[this.w().list.index];
    this.closeList();
    if (this.phase === INPUT.SKILL) this.pickSkill(id); else this.pickItem(id);
  },
  pickSkill: function (id) {
    var sk = DB.skill(id), pending = { kind: ACTION.SKILL, skill: id };
    if (sk.scope === SCOPE.ENEMY) this.beginTarget(pending, false);
    else if (sk.scope === SCOPE.ALLY) this.beginTarget(pending, true);
    else this.commit(pending);
  },
  pickItem: function (id) {
    var it = DB.item(id), pending = { kind: ACTION.ITEM, item: id };
    if (it.type === ITEM_KIND.SWITCH) { this.commit(pending); return; }
    if (it.use_skill || it.type === ITEM_KIND.SPECIAL) { this.pickSkillItem(it, pending); return; }
    if (it.entire_party) this.commit(pending); else this.beginTarget(pending, true);
  },
  pickSkillItem: function (it, pending) {
    var sk = DB.skill(it.skill_id);
    pending.kind = ACTION.SKILL; pending.skill = it.skill_id; pending.viaItem = it;
    if (sk && (sk.scope === SCOPE.ENEMY || sk.scope === SCOPE.ALLY)) this.beginTarget(pending, sk.scope === SCOPE.ALLY);
    else this.commit(pending);
  },
});
