/* Front-view battle (RPG Maker 2000 style): options, per-actor commands, agility ordered turns,
   text messages in the bottom window, rewards and level ups. */

function BattleEnemy(member, idx) {
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
BattleEnemy.prototype = {
  maxHp: function () { return this.data.max_hp; },
  maxSp: function () { return this.data.max_sp; },
  atk: function () { return this.data.attack; },
  def: function () { return this.data.defense; },
  spi: function () { return this.data.spirit; },
  agi: function () { return this.data.agility; },
  isDead: function () { return this.dead; },
  exists: function () { return !this.dead && !this.hidden && !this.escaped; },
  canAct: function () { return this.exists() && !this.states.some(function (s) { var st = DB.state(s); return st && st.restriction === 1; }); },
  hitChance: function () { return 90; },
  critChance: function () { return this.data.critical_hit ? 100 / Math.max(1, this.data.critical_hit_chance) : 0; },
  attributeRate: function (attrId) {
    var ranks = this.data.attribute_ranks;
    var rank = ranks[attrId - 1] == null ? 2 : ranks[attrId - 1];
    var at = DB.attribute(attrId);
    return at ? [at.a_rate, at.b_rate, at.c_rate, at.d_rate, at.e_rate][rank] : 100;
  },
  stateRate: function (stateId) {
    var ranks = this.data.state_ranks;
    var rank = ranks[stateId - 1] == null ? 2 : ranks[stateId - 1];
    var st = DB.state(stateId);
    return [st.a_rate, st.b_rate, st.c_rate, st.d_rate, st.e_rate][rank];
  },
  changeHp: function (d) { this.hp = Math.max(0, Math.min(this.maxHp(), this.hp + d)); if (this.hp === 0) { this.dead = true; this.fadeOut = 30; } },
  addState: function (id) { if (id === 1) { this.changeHp(-this.hp); return true; } if (this.states.indexOf(id) < 0) { this.states.push(id); return true; } return false; },
  removeState: function (id) { var i = this.states.indexOf(id); if (i >= 0) this.states.splice(i, 1); },
  stateMult: function () { return 1; },
};

function SceneBattle(args, onDone) {
  this.args = args;
  this.onDone = onDone;
  this.enemies = [];
  this.state = 'init';
  this.turn = 0;
  this.actions = [];
  this.queue = [];      /* message/step queue */
  this.wait = 0;
  this.escapeFails = 0;
  this.actorIndex = 0;
  this.result = null;
}
SceneBattle.prototype = {
  start: function () {
    var troop = DB.troop(this.args.troopId);
    var self = this;
    this.troop = troop;
    var i = 0;
    for (var k in troop.members) this.enemies.push(new BattleEnemy(troop.members[k], i++));
    var bgName = this.args.background;
    if (!bgName) { var t = DB.terrain(this.args.terrainId || 1); bgName = t ? t.background_name : ''; }
    this.backdrop = Loader.image('backdrop', bgName);
    this.options = new Window_Command(0, 160, 76, [Terms.get('battle_fight'), Terms.get('battle_auto'), Terms.get('battle_escape')]);
    this.options.onOk = function (i) { self.onOption(i); };
    this.options.onCancel = function () {};
    this.command = new Window_Command(0, 160, 76, [Terms.get('command_attack'), Terms.get('command_defend'), Terms.get('command_item'), Terms.get('command_skill')]);
    this.command.visible = false;
    this.command.onOk = function (i) { self.onCommand(i); };
    this.command.onCancel = function () { self.prevActor(); };
    this.status = new Window_Selectable(76, 160, 244, 80);
    this.status.itemMax = Party.size();
    this.status.index = -1;
    this.msg = new Window_Base(0, 160, 320, 80);
    this.msg.visible = false;
    this.msgLines = [];
    this.list = new Window_Selectable(0, 160, 320, 80);
    this.list.columns = 2;
    this.list.visible = false;
    this.list.onCancel = function () { Audio_.sys('cancel'); self.list.visible = false; self.list.active = false; self.command.active = true; };
    this.list.onOk = function (i) { self.onListPick(i); };
    this.targetIndex = 0;
    this.selectingTarget = false;
    this.targetWin = new Window_Selectable(0, 160, 76, 80);
    this.targetWin.visible = false;
    this.refreshStatus();
    Screen.fade = 1;
    Screen.fadeOut(0);
    Screen.fade = 0;
    Screen.fadeIn(15);
    Audio_.playSe(GameState.system.battle_se || Loader.db.system.battle_se);
    var music = GameState.system.battle_music;
    if (music && music.name && music.name !== '(OFF)') { this.prevBgm = Audio_.bgmCurrent; Audio_.playBgm(music); }
    else this.prevBgm = null;
    this.mapBgm = Audio_.bgmCurrent;
    this.runTroopEvents(true);
    this.state = 'intro';
    this.showMessages(this.enemies.filter(function (e) { return !e.hidden; }).map(function (e) { return e.name + Terms.get('encounter'); }), function () { self.startTurn(); });
    Input.clear();
  },

  /* troop pages: only "turn" conditions supported (turn_a + turn_b * n) plus unconditional */
  runTroopEvents: function (first) {
    var self = this;
    for (var k in this.troop.pages) {
      var pg = this.troop.pages[k];
      var f = pg.condition.flags;
      var ok = true;
      if (f.turn) {
        var a = pg.condition.turn_a, b = pg.condition.turn_b;
        ok = b === 0 ? this.turn === a : (this.turn >= a && (this.turn - a) % b === 0);
      } else if (f.switch_a || f.switch_b || f.variable || f.fatigue || f.enemy_hp || f.actor_hp) ok = false;
      else ok = first;
      if (!ok || pg._ran === this.turn) continue;
      pg._ran = this.turn;
      pg.event_commands.forEach(function (c) {
        if (c.code === 11510) Audio_.playBgm({ name: c.string, fadein: c.params[0], volume: c.params[1], tempo: c.params[2], balance: c.params[3] });
        else if (c.code === 11550) Audio_.playSe({ name: c.string, volume: c.params[0], tempo: c.params[1], balance: c.params[2] });
        else if (c.code === 10210) { GameState.setSw(c.params[1], c.params[3] === 0); }
        else if (c.code === 10110) self.queue.push({ msg: c.string });
      });
    }
  },

  refreshStatus: function () {
    var w = this.status;
    w.clear();
    for (var i = 0; i < Party.size(); i++) {
      var a = Party.members[i], y = i * 16;
      w.text(a.name, 0, y, a.isDead() ? 3 : 0);
      var st = a.significantState();
      if (st) w.text(st.name, 60, y, st.color);
      w.text(Terms.get('hp_short'), 108, y, 1);
      w.text(String(a.hp), 150, y, a.hp === 0 ? 5 : a.hp <= a.maxHp() / 4 ? 4 : 0, { align: 'right' });
      w.text(Terms.get('sp_short'), 160, y, 1);
      w.text(String(a.sp), 200, y, a.sp <= a.maxSp() / 4 ? 4 : 0, { align: 'right' });
    }
    w.dirty = false;
  },

  /* ---- message queue ---- */
  showMessages: function (lines, done) {
    var self = this;
    lines.forEach(function (l) { self.queue.push({ msg: l }); });
    this.queue.push({ fn: done });
    this.processQueue();
  },
  processQueue: function () {
    while (this.queue.length && this.wait <= 0) {
      var q = this.queue.shift();
      if (q.msg != null) { this.pushLine(q.msg); this.wait = 25; }
      else if (q.wait) this.wait = q.wait;
      else if (q.fn) q.fn();
      else if (q.act) q.act();
    }
  },
  pushLine: function (text) {
    this.msg.visible = true;
    this.options.visible = false; this.command.visible = false; this.status.visible = false; this.list.visible = false; this.targetWin.visible = false;
    this.msgLines.push(text);
    if (this.msgLines.length > 4) this.msgLines.shift();
    this.msg.clear();
    for (var i = 0; i < this.msgLines.length; i++) this.msg.text(this.msgLines[i], 0, i * 16, 0);
    this.msg.dirty = false;
  },
  clearMessages: function () { this.msgLines = []; this.msg.visible = false; this.msg.clear(); },

  /* ---- turn setup ---- */
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
    if (i === 0) { Audio_.sys('decision'); this.options.active = false; this.actorIndex = -1; this.nextActor(); }
    else if (i === 1) {
      Audio_.sys('decision');
      var self = this;
      Party.members.forEach(function (a) { if (a.canAct()) self.actions.push({ actor: a, type: 'attack', target: self.randomEnemy() }); });
      this.options.active = false;
      this.beginActions();
    } else {
      if (!this.args.allowEscape) { Audio_.sys('buzzer'); return; }
      Audio_.sys('decision');
      this.options.active = false;
      this.tryEscape();
    }
  },
  alive: function () { return this.enemies.filter(function (e) { return e.exists(); }); },
  randomEnemy: function () { var al = this.alive(); return al.length ? al[Rand.int(0, al.length - 1)] : null; },
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
    if (i < 0) { this.actions = []; this.command.visible = false; this.command.active = false; this.status.index = -1; this.options.visible = true; this.options.active = true; this.state = 'options'; return; }
    this.actions.pop();
    this.actorIndex = i - 1;
    this.nextActor();
  },
  onCommand: function (i) {
    var self = this;
    if (i === 0) { Audio_.sys('decision'); this.command.active = false; this.selectTarget(function (t) { self.actions.push({ actor: self.current, type: 'attack', target: t }); self.nextActor(); }); }
    else if (i === 1) { Audio_.sys('decision'); this.actions.push({ actor: this.current, type: 'defend' }); this.nextActor(); }
    else if (i === 2) { Audio_.sys('decision'); this.openList('item'); }
    else { Audio_.sys('decision'); this.openList('skill'); }
  },
  openList: function (kind) {
    var self = this, w = this.list;
    this.listKind = kind;
    if (kind === 'item') this.ids = Party.itemIds().filter(function (id) { var it = DB.item(id); return it.type === 6 && it.occasion_battle; });
    else this.ids = this.current.skills.filter(function (id) { var sk = DB.skill(id); return sk && sk.occasion_battle; });
    w.itemMax = this.ids.length;
    w.clear();
    for (var i = 0; i < this.ids.length; i++) {
      var r = w.itemRect(i);
      if (kind === 'item') { var it = DB.item(this.ids[i]); w.text(it.name, r.x, r.y, 0); w.text(':' + Party.itemCount(this.ids[i]), r.x + r.w - 24, r.y, 0); }
      else { var sk = DB.skill(this.ids[i]); var ok = this.current.sp >= sk.sp_cost; w.text(sk.name, r.x, r.y, ok ? 0 : 3); w.text('-' + sk.sp_cost, r.x + r.w - 24, r.y, ok ? 0 : 3); }
    }
    w.dirty = false;
    if (!this.ids.length) { Audio_.sys('buzzer'); return; }
    this.command.active = false;
    w.visible = true; w.active = true; w.setIndex(0);
  },
  onListPick: function (i) {
    var self = this, id = this.ids[i];
    if (this.listKind === 'item') {
      Audio_.sys('decision');
      this.list.visible = false; this.list.active = false;
      this.selectAlly(function (t) { self.actions.push({ actor: self.current, type: 'item', item: id, target: t }); self.nextActor(); });
    } else {
      var sk = DB.skill(id);
      if (this.current.sp < sk.sp_cost) { Audio_.sys('buzzer'); return; }
      Audio_.sys('decision');
      this.list.visible = false; this.list.active = false;
      if (sk.scope === 0) this.selectTarget(function (t) { self.actions.push({ actor: self.current, type: 'skill', skill: id, target: t }); self.nextActor(); });
      else if (sk.scope === 3) this.selectAlly(function (t) { self.actions.push({ actor: self.current, type: 'skill', skill: id, target: t }); self.nextActor(); });
      else { self.actions.push({ actor: self.current, type: 'skill', skill: id, target: null }); self.nextActor(); }
    }
  },
  selectTarget: function (cb) {
    var al = this.alive();
    if (!al.length) { cb(null); return; }
    this.selectingTarget = 'enemy';
    this.targetIndex = 0;
    this.targetCb = cb;
    this.command.active = false;
    this.command.visible = false;
    var w = this.targetWin;
    w.clear();
    for (var i = 0; i < al.length; i++) w.text(al[i].name, 0, i * 16, 0);
    w.dirty = false;
    w.itemMax = al.length;
    w.setIndex(0);
    w.visible = true;
  },
  endTargetSelect: function () {
    this.selectingTarget = false;
    this.targetWin.visible = false;
    this.targetWin.index = -1;
  },
  selectAlly: function (cb) {
    this.selectingTarget = 'ally';
    this.targetIndex = this.actorIndex;
    this.targetCb = cb;
    this.status.setIndex(this.targetIndex);
    this.status.active = false;
  },
  updateTargetSelect: function () {
    if (this.selectingTarget === 'enemy') {
      var al = this.alive();
      if (Input.repeated('down') || Input.repeated('right')) { this.targetIndex = (this.targetIndex + 1) % al.length; Audio_.sys('cursor'); }
      else if (Input.repeated('up') || Input.repeated('left')) { this.targetIndex = (this.targetIndex + al.length - 1) % al.length; Audio_.sys('cursor'); }
      else if (Input.triggered('ok')) { Input.consume('ok'); Audio_.sys('decision'); this.endTargetSelect(); this.targetCb(al[this.targetIndex]); }
      else if (Input.triggered('cancel')) { Input.consume('cancel'); Audio_.sys('cancel'); this.endTargetSelect(); this.command.visible = true; this.command.active = true; }
      this.targetWin.setIndex(Math.min(this.targetIndex, al.length - 1));
    } else {
      var n = Party.size();
      if (Input.repeated('down')) { this.targetIndex = (this.targetIndex + 1) % n; this.status.setIndex(this.targetIndex); Audio_.sys('cursor'); }
      else if (Input.repeated('up')) { this.targetIndex = (this.targetIndex + n - 1) % n; this.status.setIndex(this.targetIndex); Audio_.sys('cursor'); }
      else if (Input.triggered('ok')) { Input.consume('ok'); Audio_.sys('decision'); this.selectingTarget = false; this.status.setIndex(this.actorIndex); this.targetCb(Party.members[this.targetIndex]); }
      else if (Input.triggered('cancel')) { Input.consume('cancel'); Audio_.sys('cancel'); this.selectingTarget = false; this.status.setIndex(this.actorIndex); this.command.active = true; }
    }
  },

  /* ---- action execution ---- */
  beginActions: function () {
    var self = this;
    this.command.visible = false; this.command.active = false;
    this.status.index = -1;
    this.enemies.forEach(function (e) { if (e.canAct()) self.actions.push(self.enemyAction(e)); });
    this.actions.forEach(function (a) { a.speed = (a.actor.agi ? a.actor.agi() : 1) * (0.9 + Math.random() * 0.2); });
    this.actions.sort(function (a, b) { return b.speed - a.speed; });
    this.clearMessages();
    this.state = 'action';
    this.execNext();
  },
  enemyAction: function (e) {
    var actions = [];
    for (var k in e.data.actions) actions.push(e.data.actions[k]);
    var valid = actions.filter(function (a) {
      if (a.condition_type === 1) return GameState.sw(a.switch_id);
      if (a.condition_type === 2) return a.condition_param2 === 0 ? this.turn === a.condition_param1 : (this.turn >= a.condition_param1 && (this.turn - a.condition_param1) % a.condition_param2 === 0);
      if (a.condition_type === 3) { var n = this.alive().length; return n >= a.condition_param1 && n <= a.condition_param2; }
      if (a.condition_type === 4) { var hp = e.hp * 100 / e.maxHp(); return hp >= a.condition_param1 && hp <= a.condition_param2; }
      if (a.condition_type === 5) { var sp = e.maxSp() ? e.sp * 100 / e.maxSp() : 0; return sp >= a.condition_param1 && sp <= a.condition_param2; }
      if (a.condition_type === 6) { var lv = Party.averageLevel(); return lv >= a.condition_param1 && lv <= a.condition_param2; }
      return true;
    }, this);
    if (!valid.length) return { actor: e, type: 'attack', enemy: true, target: this.randomActor() };
    var max = Math.max.apply(null, valid.map(function (a) { return a.rating; }));
    var pool = valid.filter(function (a) { return a.rating >= max - 10; });
    var total = pool.reduce(function (s, a) { return s + a.rating; }, 0), r = Math.random() * total, pick = pool[0];
    for (var i = 0; i < pool.length; i++) { r -= pool[i].rating; if (r <= 0) { pick = pool[i]; break; } }
    if (pick.kind === 1) { var sk = DB.skill(pick.skill_id); return { actor: e, type: 'skill', enemy: true, skill: pick.skill_id, target: sk && sk.scope <= 1 ? this.randomActor() : null, action: pick }; }
    if (pick.kind === 2) return { actor: e, type: 'transform', enemy: true, transform: pick.enemy_id, action: pick };
    var basic = pick.basic;
    if (basic === 1) return { actor: e, type: 'attack', enemy: true, target: this.randomActor(), dual: true, action: pick };
    if (basic === 2) return { actor: e, type: 'defend', enemy: true, action: pick };
    if (basic === 3) return { actor: e, type: 'observe', enemy: true, action: pick };
    if (basic === 4) return { actor: e, type: 'charge', enemy: true, action: pick };
    if (basic === 5) return { actor: e, type: 'selfdestruct', enemy: true, action: pick };
    if (basic === 6) return { actor: e, type: 'escape', enemy: true, action: pick };
    if (basic === 7) return { actor: e, type: 'nothing', enemy: true, action: pick };
    return { actor: e, type: 'attack', enemy: true, target: this.randomActor(), action: pick };
  },
  randomActor: function () { var al = Party.alive(); return al.length ? al[Rand.int(0, al.length - 1)] : null; },

  execNext: function () {
    var self = this;
    if (this.checkEnd()) return;
    if (!this.actions.length) { this.queue.push({ fn: function () { self.startTurn(); } }); this.processQueue(); return; }
    var act = this.actions.shift();
    var a = act.actor;
    if (act.enemy ? !a.exists() : a.isDead()) { this.execNext(); return; }
    if (!act.enemy && !a.canAct()) { this.execNext(); return; }
    if (act.action && (act.action.switch_on || act.action.switch_off)) {
      if (act.action.switch_on) GameState.setSw(act.action.switch_on_id, true);
      if (act.action.switch_off) GameState.setSw(act.action.switch_off_id, false);
    }
    this.clearMessages();
    var lines = [];
    var after = [];
    switch (act.type) {
      case 'attack': this.doAttack(act, lines, after); break;
      case 'defend': a.defending = true; lines.push(a.name + Terms.get('defending')); break;
      case 'observe': lines.push(a.name + Terms.get('observing')); break;
      case 'charge': a.charged = true; lines.push(a.name + Terms.get('focus')); break;
      case 'nothing': break;
      case 'escape': lines.push(a.name + Terms.get('enemy_escape')); a.escaped = true; a.fadeOut = 30; break;
      case 'selfdestruct': this.doSelfDestruct(act, lines); break;
      case 'skill': this.doSkill(act, lines, after); break;
      case 'item': this.doItem(act, lines); break;
      case 'transform': { var nd = DB.enemy(act.transform); if (nd) { lines.push(a.name + Terms.get('enemy_transform')); a.id = act.transform; a.data = nd; a.name = nd.name; a.hp = Math.min(a.hp, nd.max_hp); } break; }
    }
    lines.forEach(function (l) { self.queue.push({ msg: l }); });
    after.forEach(function (f) { self.queue.push({ act: f }); });
    this.queue.push({ fn: function () { self.refreshStatus(); self.execNext(); } });
    this.processQueue();
  },

  toHit: function (src, tgt, base) {
    var srcAgi = Math.max(1, src.agi()), tgtAgi = tgt.agi();
    return 100 - (100 - base) * (1 + (tgtAgi / srcAgi - 1) / 2);
  },
  variance: function (base, v) {
    if (v > 0 && base > 0) { var adj = Math.max(1, Math.floor(v * base / 10)); return base + Rand.int(0, adj) - Math.floor(adj / 2); }
    return base;
  },
  attackAttrMult: function (src, tgt, weapon) {
    if (!weapon) return 100;
    var mult = -1;
    for (var i = 0; i < weapon.attribute_set.length; i++) if (weapon.attribute_set[i]) { var r = tgt.attributeRate(i + 1); mult = Math.max(mult, r); }
    return mult < 0 ? 100 : mult;
  },
  doAttack: function (act, lines, after) {
    var a = act.actor, t = act.target, self = this;
    if (!t || (t.exists ? !t.exists() : t.isDead())) { t = act.enemy ? this.randomActor() : this.randomEnemy(); }
    if (!t) return;
    lines.push(a.name + Terms.get('attacking'));
    var hits = act.dual || (!act.enemy && a.weapon() && a.weapon().dual_attack) ? 2 : 1;
    for (var h = 0; h < hits; h++) {
      (function (hitIndex) {
        var target = t;
        var weapon = act.enemy ? null : a.weapon();
        var hit = Rand.chance(self.toHit(a, target, a.hitChance()));
        if (!hit) { lines.push(target.name + Terms.get('dodge')); after.push(function () { Audio_.playSe(GameState.system.dodge_se || Loader.db.system.dodge_se); }); return; }
        var crit = Rand.chance(a.critChance());
        var dmg = Math.max(0, Math.floor(a.atk() / 2 - target.def() / 4));
        dmg = Math.floor(dmg * self.attackAttrMult(a, target, weapon) / 100);
        if (crit) dmg *= 3; else if (a.charged) { dmg *= 2; a.charged = false; }
        dmg = self.variance(dmg, 4);
        if (target.defending) dmg = Math.floor(dmg / 2);
        var animId = act.enemy ? 0 : a.attackAnimation();
        if (crit) lines.push(Terms.get(act.enemy ? 'enemy_critical' : 'actor_critical'));
        lines.push(dmg > 0 ? target.name + ' ' + dmg + Terms.get(act.enemy ? 'actor_damaged' : 'enemy_damaged') : target.name + Terms.get(act.enemy ? 'actor_undamaged' : 'enemy_undamaged'));
        /* apply when the message shows: queue an action right before */
        var idx = lines.length - 1;
        after.push(function () {
          if (act.enemy) { Audio_.playSe(GameState.system.enemy_attack_se || Loader.db.system.enemy_attack_se); }
          else if (animId) self.playAnimOnEnemy(animId, target);
          target.changeHp(-dmg, true);
          if (act.enemy) { Audio_.playSe(GameState.system.actor_damaged_se || Loader.db.system.actor_damaged_se); Screen.setShake(2, 6, 2); }
          else { target.flash = 12; Audio_.playSe(GameState.system.enemy_damaged_se || Loader.db.system.enemy_damaged_se); }
          if (target.dead) Audio_.playSe(GameState.system.enemy_death_se || Loader.db.system.enemy_death_se);
          /* weapon states */
          if (weapon && weapon.state_chance > 0) {
            for (var s = 0; s < weapon.state_set.length; s++) if (weapon.state_set[s] && Rand.chance(weapon.state_chance * target.stateRate(s + 1) / 100)) target.addState(s + 1);
          }
          self.refreshStatus();
        });
      })(h);
    }
  },
  doSelfDestruct: function (act, lines) {
    var a = act.actor, self = this;
    lines.push(a.name + Terms.get('autodestruction'));
    Party.alive().forEach(function (t) {
      var dmg = self.variance(Math.max(0, a.atk() - Math.floor(t.def() / 2)), 4);
      if (t.defending) dmg = Math.floor(dmg / 2);
      lines.push(t.name + ' ' + dmg + Terms.get('actor_damaged'));
      t.changeHp(-dmg, true);
    });
    a.changeHp(-a.hp);
  },
  doSkill: function (act, lines, after) {
    var a = act.actor, sk = DB.skill(act.skill), self = this;
    if (!sk) return;
    var enemySide = !!act.enemy;
    if (!enemySide) a.changeSp(-sk.sp_cost);
    else a.sp = Math.max(0, a.sp - sk.sp_cost);
    var msg1 = sk.using_message1 || '', msg2 = sk.using_message2 || '';
    lines.push(a.name + msg1);
    if (msg2) lines.push(msg2);
    var targets;
    if (sk.scope === 0) targets = [act.target || (enemySide ? this.randomActor() : this.randomEnemy())];
    else if (sk.scope === 1) targets = enemySide ? Party.alive() : this.alive();
    else if (sk.scope === 2) targets = [a];
    else if (sk.scope === 3) targets = [act.target || a];
    else targets = enemySide ? this.enemies.filter(function (e) { return e.exists(); }) : Party.members.filter(function (m) { return !m.isDead() || sk.state_effects[0]; });
    targets = targets.filter(Boolean);
    var offensive = sk.scope <= 1;
    targets.forEach(function (t) {
      if (offensive && !Rand.chance(sk.hit)) { lines.push(t.name + Terms.get('dodge')); return; }
      var effect = sk.power + Math.floor(sk.physical_rate * a.atk() / 20) + Math.floor(sk.magical_rate * a.spi() / 40);
      if (offensive && !sk.ignore_defense) effect -= Math.floor(sk.physical_rate * t.def() / 40) + Math.floor(sk.magical_rate * t.spi() / 80);
      effect = Math.max(0, effect);
      var mult = -1;
      for (var i = 0; i < sk.attribute_effects.length; i++) if (sk.attribute_effects[i]) mult = Math.max(mult, t.attributeRate(i + 1));
      if (mult >= 0) effect = Math.floor(effect * mult / 100);
      effect = self.variance(effect, sk.variance);
      if (offensive && t.defending) effect = Math.floor(effect / 2);
      if (sk.affect_hp) {
        if (offensive) { lines.push(t.name + ' ' + effect + Terms.get(enemySide ? 'actor_damaged' : 'enemy_damaged')); t.changeHp(-effect, true); if (t.flash != null) t.flash = 12; }
        else { lines.push(t.name + ' ' + effect + Terms.get('hp_recovery')); t.changeHp(effect, false); }
      }
      if (sk.affect_sp) { if (offensive) t.sp = Math.max(0, t.sp - effect); else if (t.changeSp) t.changeSp(effect); else t.sp = Math.min(t.maxSp(), t.sp + effect); }
      for (var s = 0; s < sk.state_effects.length; s++) {
        if (!sk.state_effects[s]) continue;
        if (offensive) { if (Rand.chance(t.stateRate(s + 1))) { t.addState(s + 1); var st = DB.state(s + 1); lines.push(t.name + (enemySide ? st.message_actor : st.message_enemy)); } }
        else t.removeState(s + 1);
      }
    });
    if (sk.animation_id && !enemySide && offensive) after.unshift(function () { targets.forEach(function (t) { self.playAnimOnEnemy(sk.animation_id, t); }); });
    if (sk.sound_effect && sk.sound_effect.name !== '(OFF)') after.unshift(function () { Audio_.playSe(sk.sound_effect); });
  },
  doItem: function (act, lines) {
    var a = act.actor, it = DB.item(act.item), t = act.target || a;
    if (!it) return;
    lines.push(it.name + Terms.get('use_item'));
    var targets = it.entire_party ? Party.members : [t];
    targets.forEach(function (x) {
      if (!ItemEffect.usable(it, x)) return;
      var before = x.hp;
      ItemEffect.apply(it, x);
      if (x.hp > before) lines.push(x.name + ' ' + (x.hp - before) + Terms.get('hp_recovery'));
    });
    if (it.uses > 0) Party.addItem(act.item, -1);
    Audio_.playSe(GameState.system.item_se || Loader.db.system.item_se);
  },
  playAnimOnEnemy: function (animId, e) {
    var anim = DB.animation(animId);
    if (!anim) return;
    var img = Loader.image('monster', e.data.battler_name);
    var h = img ? img.height : 32;
    var y = anim.position === 0 ? e.y - h / 2 : anim.position === 1 ? e.y : e.y + h / 2;
    BattleAnim.play(animId, e.x, y, { onFlash: function (tm) { e.flash = 8; } });
  },

  tryEscape: function () {
    var self = this;
    var pAgi = Party.alive().reduce(function (s, a) { return s + a.agi(); }, 0) / Math.max(1, Party.alive().length);
    var eAgi = this.alive().reduce(function (s, e) { return s + e.agi(); }, 0) / Math.max(1, this.alive().length);
    var chance = this.args.firstStrike ? 100 : Math.min(100, 150 * pAgi / Math.max(1, eAgi)) + this.escapeFails * 10;
    this.clearMessages();
    if (Rand.chance(chance)) {
      Audio_.playSe(GameState.system.escape_se || Loader.db.system.escape_se);
      this.showMessages([Terms.get('escape_success')], function () { self.finish('escape'); });
    } else {
      this.escapeFails++;
      this.showMessages([Terms.get('escape_failure')], function () { self.actions = []; self.beginActions(); });
    }
  },

  checkEnd: function () {
    var self = this;
    if (this.state === 'ending') return true;
    if (Party.allDead()) {
      this.state = 'ending';
      this.queue = [];
      this.showMessages([Terms.get('defeat')], function () { self.finish('defeat'); });
      return true;
    }
    if (!this.enemies.some(function (e) { return e.exists(); })) {
      this.state = 'ending';
      this.queue = [];
      this.victory();
      return true;
    }
    return false;
  },
  victory: function () {
    var self = this;
    var exp = 0, gold = 0, items = [];
    this.enemies.forEach(function (e) {
      if (e.escaped) return;
      exp += e.data.exp; gold += e.data.gold;
      if (e.data.drop_id && Rand.chance(e.data.drop_prob)) items.push(e.data.drop_id);
    });
    var lines = [Terms.get('victory')];
    if (exp > 0) lines.push(exp + Terms.get('exp_received'));
    if (gold > 0) lines.push(Terms.get('gold_recieved_a') + gold + Terms.get('gold_recieved_b'));
    items.forEach(function (id) { lines.push(DB.item(id).name + Terms.get('item_recieved')); });
    Party.changeGold(gold);
    items.forEach(function (id) { Party.addItem(id, 1); });
    var lvl = [];
    Party.members.forEach(function (a) { if (!a.isDead()) lvl = lvl.concat(a.changeExp(exp)); });
    var endMusic = GameState.system.battle_end_music;
    if (endMusic && endMusic.name && endMusic.name !== '(OFF)') Audio_.playBgm(endMusic);
    this.clearMessages();
    this.showMessages(lines.concat(lvl), function () { self.finish('victory'); });
  },
  finish: function (result) {
    var self = this;
    this.result = result;
    this.state = 'done';
    Screen.fadeOut(15);
    this.finishTimer = 16;
    this.queue.push({ wait: 5 });
    if (result !== 'defeat') {
      if (this.mapBgm && (this.prevBgm || (GameState.system.battle_end_music && GameState.system.battle_end_music.name !== '(OFF)'))) Audio_.playBgm(this.mapBgm);
      else if (this.mapBgm && this.mapBgm.name !== (Audio_.bgmCurrent || {}).name) Audio_.playBgm(this.mapBgm);
    }
  },

  update: function () {
    this.options.update(); this.command.update(); this.status.update(); this.msg.update(); this.list.update(); this.targetWin.update();
    BattleAnim.update();
    this.enemies.forEach(function (e) { if (e.flash > 0) e.flash--; if (e.fadeOut > 0) e.fadeOut--; });
    if (this.state === 'done') {
      if (this.finishTimer > 0) { this.finishTimer--; return; }
      if (!Screen.fadeBusy()) { var r = this.result; this.state = 'closed'; BattleAnim.clear(); Screen.fadeIn(15); this.onDone(r); }
      return;
    }
    if (this.wait > 0) {
      this.wait--;
      if (Input.pressed('ok') || Input.pressed('cancel')) this.wait = Math.max(0, this.wait - 2);
      if (this.wait <= 0) this.processQueue();
      return;
    }
    if (this.selectingTarget) this.updateTargetSelect();
  },

  draw: function (ctx) {
    if (this.backdrop) ctx.drawImage(this.backdrop, 0, 0); else { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, 320, 160); }
    var self = this;
    this.enemies.forEach(function (e) {
      if (e.hidden) return;
      if (e.dead && e.fadeOut <= 0) return;
      if (e.escaped && e.fadeOut <= 0) return;
      var img = Loader.image('monster', e.data.battler_name);
      if (!img) return;
      var x = Math.round(e.x - img.width / 2), y = Math.round(e.y - img.height / 2);
      ctx.save();
      if (e.dead || e.escaped) ctx.globalAlpha = e.fadeOut / 30;
      ctx.drawImage(img, x, y);
      if (e.flash > 0) {
        var tmp = Gfx.makeCanvas(img.width, img.height), tc = tmp.getContext('2d');
        tc.drawImage(img, 0, 0); tc.globalCompositeOperation = 'source-in';
        tc.fillStyle = 'rgba(255,255,255,' + (e.flash / 12) + ')'; tc.fillRect(0, 0, img.width, img.height);
        ctx.drawImage(tmp, x, y);
      }
      ctx.restore();
    });
    BattleAnim.drawBattle(ctx);
    if (this.selectingTarget === 'enemy') {
      var al = this.alive(), e = al[this.targetIndex];
      if (e && (this.targetWin.frame % 16) < 8) {
        var img2 = Loader.image('monster', e.data.battler_name);
        if (img2) {
          var tmp2 = Gfx.makeCanvas(img2.width, img2.height), tc2 = tmp2.getContext('2d');
          tc2.drawImage(img2, 0, 0); tc2.globalCompositeOperation = 'source-in';
          tc2.fillStyle = 'rgba(255,255,255,0.5)'; tc2.fillRect(0, 0, img2.width, img2.height);
          ctx.drawImage(tmp2, Math.round(e.x - img2.width / 2), Math.round(e.y - img2.height / 2));
        }
      }
    }
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 160, 320, 80);
    this.options.draw(ctx); this.command.draw(ctx); this.targetWin.draw(ctx); this.status.draw(ctx); this.msg.draw(ctx); this.list.draw(ctx);
  },
};
