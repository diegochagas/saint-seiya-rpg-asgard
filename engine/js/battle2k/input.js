/* RPG Maker 2000 battle: turn start, party options, per-actor commands, item/skill lists.
   Target selection is in targets.js. Part of SceneBattle2k (see scene.js). */
var BATTLE2K_OPTION = { FIGHT: 0, AUTO: 1, ESCAPE: 2 };
var BATTLE2K_COMMAND = { ATTACK: 0, DEFEND: 1, ITEM: 2, SKILL: 3 };
var BATTLE2K_ITEM_MEDICINE = 6;
var BATTLE2K_SCOPE = { ENEMY: 0, ALL_ENEMIES: 1, SELF: 2, ALLY: 3, PARTY: 4 };

Object.assign(SceneBattle2k.prototype, {
  startTurn: function () {
    this.turn++;
    this.clearMessages();
    this.actions = [];
    this.runTroopEvents(false);
    Party.members.forEach(function (a) { a.defending = false; });
    this.enemies.forEach(function (e) { e.defending = false; });
    this.status.visible = true; this.options.visible = true; this.options.active = true;
    this.state = 'options';
    this.refreshStatus();
    this.processQueue();
  },
  onOption: function (i) {
    if (i === BATTLE2K_OPTION.ESCAPE && !this.args.allowEscape) { Audio_.sys('buzzer'); return; }
    Audio_.sys('decision');
    this.options.active = false;
    if (i === BATTLE2K_OPTION.FIGHT) { this.actorIndex = -1; this.nextActor(); }
    else if (i === BATTLE2K_OPTION.AUTO) this.autoBattle();
    else this.tryEscape();
  },
  autoBattle: function () {
    var self = this;
    Party.members.forEach(function (a) { if (a.canAct()) self.actions.push({ actor: a, type: 'attack', target: self.randomEnemy() }); });
    this.beginActions();
  },
  alive: function () { return this.enemies.filter(function (e) { return e.exists(); }); },
  randomEnemy: function () { var al = this.alive(); return al.length ? al[Rand.int(0, al.length - 1)] : null; },
  randomActor: function () { var al = Party.alive(); return al.length ? al[Rand.int(0, al.length - 1)] : null; },

  nextActor: function () {
    do { this.actorIndex++; } while (this.actorIndex < Party.size() && !Party.members[this.actorIndex].canAct());
    if (this.actorIndex >= Party.size()) { this.beginActions(); return; }
    this.current = Party.members[this.actorIndex];
    this.options.visible = false;
    this.command.visible = true; this.command.active = true; this.command.setIndex(0);
    this.status.setIndex(this.actorIndex);
    this.state = 'command';
  },
  prevActor: function () {
    Audio_.sys('cancel');
    var i = this.actorIndex - 1;
    while (i >= 0 && !Party.members[i].canAct()) i--;
    if (i < 0) { this.backToOptions(); return; }
    this.actions.pop();
    this.actorIndex = i - 1;
    this.nextActor();
  },
  backToOptions: function () {
    this.actions = [];
    this.command.visible = false; this.command.active = false;
    this.status.index = -1;
    this.options.visible = true; this.options.active = true;
    this.state = 'options';
  },
  /* queue the current actor's action and move on to the next actor */
  commit: function (action) { action.actor = this.current; this.actions.push(action); this.nextActor(); },
  onCommand: function (i) {
    var self = this;
    Audio_.sys('decision');
    if (i === BATTLE2K_COMMAND.ATTACK) {
      this.command.active = false;
      this.selectTarget(function (t) { self.commit({ type: 'attack', target: t }); });
    } else if (i === BATTLE2K_COMMAND.DEFEND) this.commit({ type: 'defend' });
    else this.openList(i === BATTLE2K_COMMAND.ITEM ? 'item' : 'skill');
  },

  listIds: function (kind) {
    if (kind === 'item') return Party.itemIds().filter(function (id) { var it = DB.item(id); return it.type === BATTLE2K_ITEM_MEDICINE && it.occasion_battle; });
    return this.current.skills.filter(function (id) { var sk = DB.skill(id); return sk && sk.occasion_battle; });
  },
  drawListRow: function (w, kind, id, r) {
    if (kind === 'item') {
      w.text(DB.item(id).name, r.x, r.y, 0);
      w.text(':' + Party.itemCount(id), r.x + r.w - 24, r.y, 0);
      return;
    }
    var sk = DB.skill(id), color = this.current.sp >= sk.sp_cost ? 0 : 3;
    w.text(sk.name, r.x, r.y, color);
    w.text('-' + sk.sp_cost, r.x + r.w - 24, r.y, color);
  },
  openList: function (kind) {
    var w = this.list;
    this.listKind = kind;
    this.ids = this.listIds(kind);
    w.itemMax = this.ids.length;
    w.clear();
    for (var i = 0; i < this.ids.length; i++) this.drawListRow(w, kind, this.ids[i], w.itemRect(i));
    w.dirty = false;
    if (!this.ids.length) { Audio_.sys('buzzer'); return; }
    this.command.active = false;
    w.visible = true; w.active = true; w.setIndex(0);
  },
  closeList: function () { this.list.visible = false; this.list.active = false; },
  onListPick: function (i) {
    var self = this, id = this.ids[i];
    if (this.listKind === 'item') {
      Audio_.sys('decision');
      this.closeList();
      this.selectAlly(function (t) { self.commit({ type: 'item', item: id, target: t }); });
      return;
    }
    var sk = DB.skill(id);
    if (this.current.sp < sk.sp_cost) { Audio_.sys('buzzer'); return; }
    Audio_.sys('decision');
    this.closeList();
    this.pickSkillTarget(sk, id);
  },
  pickSkillTarget: function (sk, id) {
    var self = this, done = function (t) { self.commit({ type: 'skill', skill: id, target: t }); };
    if (sk.scope === BATTLE2K_SCOPE.ENEMY) this.selectTarget(done);
    else if (sk.scope === BATTLE2K_SCOPE.ALLY) this.selectAlly(done);
    else done(null);
  },
});
