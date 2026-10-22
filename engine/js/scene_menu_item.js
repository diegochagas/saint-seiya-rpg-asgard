/* Menu item list, item effects outside battle and the actor target picker. */

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

