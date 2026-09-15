/* Main menu (Item / Skill / Equipment / Save / Quit) with item, skill, equip and status sub-screens. */

function SceneMenu() {
  this.state = 'command';
  this.cmd = null; this.gold = null; this.status = null;
}
SceneMenu.prototype = {
  start: function () {
    var self = this;
    var cmds = [Terms.get('command_item'), Terms.get('command_skill'), Terms.get('menu_equipment'), Terms.get('menu_save'), Terms.get('menu_quit')];
    this.cmd = new Window_Command(0, 0, 88, cmds);
    this.cmd.active = true;
    this.cmd.disabled = { 3: !GameState.saveAllowed };
    this.cmd.onOk = function (i) { self.onCommand(i); };
    this.cmd.onCancel = function () { Audio_.sys('cancel'); Game.pop(); };
    this.gold = new Window_Base(0, 208, 88, 32);
    this.status = new Window_Selectable(88, 0, 232, 240);
    this.status.rowHeight = 56;
    this.status.itemMax = Party.size();
    this.status.index = -1;
    this.status.onCancel = function () { Audio_.sys('cancel'); self.status.active = false; self.status.index = -1; self.cmd.active = true; };
    this.status.onOk = function (i) { self.onActor(i); };
    this.refresh();
    Input.clear();
  },
  refresh: function () {
    var g = this.gold;
    g.clear(); g.drawGold(0, 0);
    var s = this.status;
    s.clear();
    for (var i = 0; i < Party.size(); i++) {
      var a = Party.members[i], y = i * 56;
      s.drawActorFace(a, 0, y + 4);
      s.drawActorName(a, 56, y);
      s.drawActorTitle(a, 56 + 96, y);
      s.drawActorLevel(a, 56, y + 16);
      s.drawActorState(a, 56 + 48, y + 16);
      s.drawActorExp(a, 56 + 96, y + 16);
      s.drawActorHp(a, 56, y + 32);
      s.drawActorSp(a, 56 + 96, y + 32);
    }
    s.dirty = false; g.dirty = false;
  },
  onCommand: function (i) {
    if (i === 0) { Audio_.sys('decision'); Game.push(new SceneItem()); return; }
    if (i === 1 || i === 2) {
      Audio_.sys('decision');
      this.pendingCommand = i;
      this.cmd.active = false;
      this.status.active = true;
      this.status.setIndex(0);
      return;
    }
    if (i === 3) {
      if (!GameState.saveAllowed) { Audio_.sys('buzzer'); return; }
      Audio_.sys('decision'); Game.push(new SceneFile('save')); return;
    }
    Audio_.sys('decision');
    Game.push(new SceneQuit());
  },
  onActor: function (i) {
    Audio_.sys('decision');
    var actor = Party.members[i];
    if (this.pendingCommand === 1) Game.push(new SceneSkill(actor));
    else Game.push(new SceneEquip(actor));
  },
  resume: function () {
    this.refresh();
    this.cmd.disabled = { 3: !GameState.saveAllowed };
    this.cmd.dirty = true;
    if (this.status.active) { /* keep actor selection */ } else this.cmd.active = true;
    Input.clear();
  },
  onLanguageChange: function () { var idx = this.cmd.index; this.start(); this.cmd.index = idx; },
  update: function () { this.cmd.update(); this.status.update(); this.gold.update(); },
  draw: function (ctx) {
    var map = Game.scenes[0];
    if (map && map.draw) map.draw(ctx);
    this.cmd.draw(ctx); this.gold.draw(ctx); this.status.draw(ctx);
  },
};

/* ---- Quit confirmation ---- */
function SceneQuit() {}
SceneQuit.prototype = {
  start: function () {
    var self = this;
    this.help = new Window_Help(0, 72, 320, 32);
    this.help.setText(Terms.get('exit_game_message'));
    this.cmd = new Window_Command(120, 104, 80, [Terms.get('yes'), Terms.get('no')]);
    this.cmd.index = 1;
    this.cmd.active = true;
    this.cmd.onOk = function (i) { if (i === 0) { Audio_.sys('decision'); Game.toTitle(); } else { Audio_.sys('cancel'); Game.pop(); } };
    this.cmd.onCancel = function () { Audio_.sys('cancel'); Game.pop(); };
  },
  update: function () { this.help.update(); this.cmd.update(); },
  draw: function (ctx) {
    var under = Game.scenes[Game.scenes.length - 2];
    if (under) under.draw(ctx);
    this.help.draw(ctx); this.cmd.draw(ctx);
  },
};

/* ---- Item list (menu) ---- */
function SceneItem() {}
SceneItem.prototype = {
  start: function () {
    var self = this;
    this.help = new Window_Help(0, 0, 320, 32);
    this.list = new Window_Selectable(0, 32, 320, 208);
    this.list.columns = 2;
    this.list.active = true;
    this.list.onOk = function (i) { self.useItem(i); };
    this.list.onCancel = function () { Audio_.sys('cancel'); Game.pop(); };
    this.target = null;
    this.refresh();
    this.list.setIndex(this.ids.length ? 0 : -1);
    Input.clear();
  },
  refresh: function () {
    this.ids = Party.itemIds();
    var w = this.list;
    w.itemMax = this.ids.length;
    w.contents = Gfx.makeCanvas(w.width - 16, Math.max(w.height - 16, Math.ceil(this.ids.length / 2) * 16));
    w.cctx = w.contents.getContext('2d'); w.cctx.imageSmoothingEnabled = false;
    for (var i = 0; i < this.ids.length; i++) {
      var it = DB.item(this.ids[i]), r = w.itemRect(i);
      var usable = it.type === 6 || it.type === 7 || it.type === 8 || (it.type === 10 && it.occasion_field2);
      w.text(it.name, r.x, r.y, usable ? 0 : 3);
      w.text(':' + Party.itemCount(this.ids[i]), r.x + r.w - 24, r.y, usable ? 0 : 3);
    }
    w.dirty = false;
    if (this.list.index >= this.ids.length) this.list.setIndex(this.ids.length - 1);
    this.updateHelp();
  },
  updateHelp: function () {
    var id = this.ids[this.list.index];
    this.help.setText(id ? DB.item(id).description : '');
  },
  useItem: function (i) {
    var id = this.ids[i];
    if (!id) return;
    var it = DB.item(id);
    if (it.type === 6 || it.type === 7 || it.type === 8) {
      Audio_.sys('decision');
      var self = this;
      this.target = new SceneTarget(function (actor) { return self.applyItem(it, id, actor); }, it.entire_party);
      Game.push(this.target);
      return;
    }
    if (it.type === 10 && it.occasion_field2) {
      Audio_.sys('decision');
      GameState.setSw(it.switch_id, true);
      if (it.uses > 0) Party.addItem(id, -1);
      GameMap.refreshEvents();
      Game.pop(); Game.pop();
      return;
    }
    Audio_.sys('buzzer');
  },
  applyItem: function (it, id, actor) {
    var targets = it.entire_party ? Party.members : [actor];
    var any = false;
    targets.forEach(function (a) { if (ItemEffect.usable(it, a)) { ItemEffect.apply(it, a); any = true; } });
    if (!any) { Audio_.sys('buzzer'); return false; }
    Audio_.playSe(GameState.system.item_se || Loader.db.system.item_se);
    if (it.uses > 0) Party.addItem(id, -1);
    return true;
  },
  resume: function () { this.refresh(); this.list.active = true; Input.clear(); },
  update: function () {
    this.help.update(); this.list.update();
    if (this.list.active) this.updateHelp();
  },
  draw: function (ctx) {
    var map = Game.scenes[0]; if (map && map.draw) map.draw(ctx);
    this.help.draw(ctx); this.list.draw(ctx);
  },
};

/* Item / skill effects on the field */
var ItemEffect = {
  usable: function (it, a) {
    if (it.type === 7) return a.skills.indexOf(it.skill_id) < 0;      /* book: learn skill */
    if (it.type === 8) return true;                                     /* material: permanent stat */
    if (it.ko_only && !a.isDead()) return false;
    if (!it.ko_only && a.isDead()) return false;
    if (it.recover_hp || it.recover_hp_rate) { if (a.hp < a.maxHp() || a.isDead()) return true; }
    if (it.recover_sp || it.recover_sp_rate) { if (a.sp < a.maxSp()) return true; }
    for (var i = 0; i < it.state_set.length; i++) if (it.state_set[i] && a.states.indexOf(i + 1) >= 0) return true;
    return false;
  },
  apply: function (it, a) {
    if (it.type === 7) { a.learnSkill(it.skill_id); return; }
    if (it.type === 8) {
      a.paramBonus[0] += it.max_hp_points; a.paramBonus[1] += it.max_sp_points; a.paramBonus[2] += it.atk_points2;
      a.paramBonus[3] += it.def_points2; a.paramBonus[4] += it.spi_points2; a.paramBonus[5] += it.agi_points2;
      return;
    }
    for (var i = 0; i < it.state_set.length; i++) if (it.state_set[i]) a.removeState(i + 1);
    if (a.isDead() && it.ko_only) a.removeState(1);
    if (it.recover_hp || it.recover_hp_rate) a.changeHp(it.recover_hp + Math.floor(a.maxHp() * it.recover_hp_rate / 100), false);
    if (it.recover_sp || it.recover_sp_rate) a.changeSp(it.recover_sp + Math.floor(a.maxSp() * it.recover_sp_rate / 100));
  },
};

/* ---- Target selection (actor list) ---- */
function SceneTarget(onSelect, all) { this.onSelect = onSelect; this.all = all; }
SceneTarget.prototype = {
  start: function () {
    var self = this;
    this.win = new Window_Selectable(0, 0, 320, 240);
    this.win.rowHeight = 56;
    this.win.itemMax = Party.size();
    this.win.active = true;
    this.win.setIndex(0);
    this.win.onOk = function (i) { if (self.onSelect(Party.members[i])) self.refresh(); };
    this.win.onCancel = function () { Audio_.sys('cancel'); Game.pop(); };
    this.refresh();
  },
  refresh: function () {
    var s = this.win;
    s.clear();
    for (var i = 0; i < Party.size(); i++) {
      var a = Party.members[i], y = i * 56;
      s.drawActorFace(a, 0, y + 4);
      s.drawActorName(a, 56, y);
      s.drawActorLevel(a, 56 + 90, y);
      s.drawActorState(a, 56 + 150, y);
      s.drawActorHp(a, 56, y + 16);
      s.drawActorSp(a, 56, y + 32);
    }
    s.dirty = false;
  },
  update: function () { this.win.update(); },
  draw: function (ctx) { var map = Game.scenes[0]; if (map && map.draw) map.draw(ctx); this.win.draw(ctx); },
};

/* ---- Skills ---- */
function SceneSkill(actor) { this.actor = actor; }
SceneSkill.prototype = {
  start: function () {
    var self = this;
    this.help = new Window_Help(0, 0, 320, 32);
    this.info = new Window_Base(0, 32, 320, 32);
    this.list = new Window_Selectable(0, 64, 320, 176);
    this.list.columns = 2;
    this.list.active = true;
    this.list.onOk = function (i) { self.use(i); };
    this.list.onCancel = function () { Audio_.sys('cancel'); Game.pop(); };
    this.refresh();
    this.list.setIndex(this.actor.skills.length ? 0 : -1);
    Input.clear();
  },
  refresh: function () {
    var a = this.actor, w = this.list;
    this.info.clear();
    this.info.drawActorName(a, 0, 0); this.info.drawActorLevel(a, 80, 0); this.info.drawActorHp(a, 140, 0); this.info.drawActorSp(a, 230, 0);
    this.info.dirty = false;
    w.itemMax = a.skills.length;
    w.clear();
    for (var i = 0; i < a.skills.length; i++) {
      var sk = DB.skill(a.skills[i]), r = w.itemRect(i);
      var usable = sk.occasion_field && a.sp >= sk.sp_cost;
      w.text(sk.name, r.x, r.y, usable ? 0 : 3);
      w.text('-' + sk.sp_cost, r.x + r.w - 24, r.y, usable ? 0 : 3);
    }
    w.dirty = false;
  },
  use: function (i) {
    var sk = DB.skill(this.actor.skills[i]);
    if (!sk || !sk.occasion_field || this.actor.sp < sk.sp_cost || sk.scope < 2) { Audio_.sys('buzzer'); return; }
    Audio_.sys('decision');
    var self = this, actor = this.actor;
    Game.push(new SceneTarget(function (target) {
      var targets = sk.scope === 4 ? Party.members : sk.scope === 2 ? [actor] : [target];
      var any = false;
      targets.forEach(function (t) {
        if (t.isDead() && !(sk.state_effects[0])) return;
        if (sk.affect_hp) { t.changeHp(sk.power + Math.floor(sk.magical_rate * actor.spi() / 40), false); any = true; }
        if (sk.affect_sp) { t.changeSp(sk.power); any = true; }
        for (var s = 0; s < sk.state_effects.length; s++) if (sk.state_effects[s]) { t.removeState(s + 1); any = true; }
      });
      if (!any) { Audio_.sys('buzzer'); return false; }
      actor.changeSp(-sk.sp_cost);
      Audio_.playSe(sk.sound_effect);
      self.refresh();
      return true;
    }, sk.scope === 4));
  },
  resume: function () { this.refresh(); this.list.active = true; Input.clear(); },
  update: function () {
    this.help.update(); this.info.update(); this.list.update();
    var sk = DB.skill(this.actor.skills[this.list.index]);
    this.help.setText(sk ? sk.description : '');
  },
  draw: function (ctx) { var map = Game.scenes[0]; if (map && map.draw) map.draw(ctx); this.help.draw(ctx); this.info.draw(ctx); this.list.draw(ctx); },
};

/* ---- Equipment ---- */
function SceneEquip(actor) { this.actor = actor; }
SceneEquip.prototype = {
  start: function () {
    var self = this;
    this.help = new Window_Help(0, 0, 320, 32);
    this.stats = new Window_Base(0, 32, 124, 96);
    this.slots = new Window_Selectable(124, 32, 196, 96);
    this.slots.itemMax = 5;
    this.slots.active = true;
    this.slots.onOk = function (i) { self.openItems(i); };
    this.slots.onCancel = function () { Audio_.sys('cancel'); Game.pop(); };
    this.items = new Window_Selectable(0, 128, 320, 112);
    this.items.columns = 2;
    this.items.onOk = function (i) { self.equip(i); };
    this.items.onCancel = function () { Audio_.sys('cancel'); self.items.active = false; self.items.index = -1; self.slots.active = true; self.refreshItems(); };
    this.slots.setIndex(0);
    this.refresh();
    Input.clear();
  },
  refresh: function () {
    var a = this.actor, s = this.slots, st = this.stats;
    s.clear();
    var names = ['weapon', 'shield', 'armor', 'helmet', 'accessory'];
    for (var i = 0; i < 5; i++) {
      s.text(Terms.get(names[i]), 0, i * 16, 1);
      s.text(a.equip[i] ? DB.item(a.equip[i]).name : '', 66, i * 16, 0);
    }
    s.dirty = false;
    this.refreshStats(null);
    this.refreshItems();
  },
  refreshStats: function (preview) {
    var a = this.actor, st = this.stats;
    st.clear();
    st.drawActorName(a, 0, 0);
    var labels = ['attack', 'defense', 'spirit', 'agility'];
    var cur = [a.atk(), a.def(), a.spi(), a.agi()];
    for (var i = 0; i < 4; i++) {
      st.text(Terms.get(labels[i]), 0, 16 + i * 16, 1);
      st.text(String(cur[i]), 72, 16 + i * 16, 0, { align: 'right' });
      if (preview) {
        var v = preview[i], color = v > cur[i] ? 2 : v < cur[i] ? 3 : 0;
        st.text('>', 74, 16 + i * 16, 1);
        st.text(String(v), 108, 16 + i * 16, color, { align: 'right' });
      }
    }
    st.dirty = false;
  },
  candidates: function (slot) {
    var a = this.actor;
    var ids = Party.itemIds().filter(function (id) { var it = DB.item(id); return it.type === slot + 1 && a.canEquip(it); });
    return ids;
  },
  refreshItems: function () {
    var w = this.items, slot = this.slots.index;
    this.ids = this.candidates(slot);
    w.itemMax = this.ids.length + 1;
    w.contents = Gfx.makeCanvas(w.width - 16, Math.max(w.height - 16, Math.ceil(w.itemMax / 2) * 16));
    w.cctx = w.contents.getContext('2d'); w.cctx.imageSmoothingEnabled = false;
    for (var i = 0; i < this.ids.length; i++) {
      var it = DB.item(this.ids[i]), r = w.itemRect(i);
      w.text(it.name, r.x, r.y, 0);
      w.text(':' + Party.itemCount(this.ids[i]), r.x + r.w - 24, r.y, 0);
    }
    var rr = w.itemRect(this.ids.length);
    w.text('---', rr.x, rr.y, 0);
    w.dirty = false;
  },
  openItems: function (slot) {
    Audio_.sys('decision');
    this.refreshItems();
    this.slots.active = false;
    this.items.active = true;
    this.items.setIndex(0);
  },
  equip: function (i) {
    var slot = this.slots.index;
    var id = i < this.ids.length ? this.ids[i] : 0;
    Audio_.sys('decision');
    this.actor.changeEquipment(slot, id);
    this.items.active = false; this.items.index = -1; this.slots.active = true;
    this.refresh();
  },
  update: function () {
    this.help.update(); this.stats.update(); this.slots.update(); this.items.update();
    if (this.slots.active) {
      var eq = this.actor.equip[this.slots.index];
      this.help.setText(eq ? DB.item(eq).description : '');
      if (this.lastSlot !== this.slots.index) { this.lastSlot = this.slots.index; this.refreshItems(); }
    } else if (this.items.active) {
      var id = this.items.index < this.ids.length ? this.ids[this.items.index] : 0;
      this.help.setText(id ? DB.item(id).description : '');
      var a = this.actor, slot = this.slots.index, old = a.equip[slot];
      a.setEquipment(slot, id);
      var prev = [a.atk(), a.def(), a.spi(), a.agi()];
      a.setEquipment(slot, old);
      this.refreshStats(prev);
    }
  },
  draw: function (ctx) {
    var map = Game.scenes[0]; if (map && map.draw) map.draw(ctx);
    this.help.draw(ctx); this.stats.draw(ctx); this.slots.draw(ctx); this.items.draw(ctx);
  },
};
