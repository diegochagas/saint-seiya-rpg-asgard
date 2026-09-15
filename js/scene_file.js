/* Save / load slot selection (localStorage). */
function SceneFile(mode) {
  this.mode = mode;   /* 'save' | 'load' */
  this.help = null;
  this.list = null;
  this.index = 0;
  this.slots = [];
}
SceneFile.prototype = {
  start: function () {
    this.help = new Window_Help(0, 0, 320, 32);
    this.help.setText(Terms.get(this.mode === 'save' ? 'save_game_message' : 'load_game_message'));
    this.list = new Window_Selectable(0, 32, 320, 208);
    this.list.rowHeight = 64;
    this.list.itemMax = CONFIG.MAX_SAVES;
    this.list.wrap = false;
    var self = this;
    this.list.onOk = function (i) { self.select(i); };
    this.list.onCancel = function () { Audio_.sys('cancel'); Game.pop(); };
    this.list.active = true;
    this.refreshSlots();
    var first = 0;
    for (var i = 0; i < CONFIG.MAX_SAVES; i++) if (this.slots[i]) { first = i; break; }
    if (this.mode === 'save') { first = 0; for (var j = 0; j < CONFIG.MAX_SAVES; j++) if (!this.slots[j]) { first = j; break; } }
    this.list.setIndex(first);
    Input.clear();
  },
  refreshSlots: function () {
    this.slots = [];
    for (var i = 1; i <= CONFIG.MAX_SAVES; i++) this.slots.push(GameState.readSlot(i));
    this.list.dirty = true;
  },
  select: function (i) {
    var slot = i + 1;
    if (this.mode === 'save') {
      Audio_.sys('decision');
      GameState.save(slot, GameMap.serialize());
      this.refreshSlots();
      Game.pop();
    } else {
      var data = this.slots[i];
      if (!data) { Audio_.sys('buzzer'); return; }
      Audio_.sys('decision');
      Screen.fadeOut(15);
      this.pendingLoad = data;
      this.list.active = false;
    }
  },
  onLanguageChange: function () { this.help.setText(Terms.get(this.mode === 'save' ? 'save_game_message' : 'load_game_message')); this.list.dirty = true; },
  update: function () {
    this.help.update();
    this.list.update();
    if (this.pendingLoad && !Screen.fadeBusy()) { var d = this.pendingLoad; this.pendingLoad = null; Game.loadGame(d); }
  },
  draw: function (ctx) {
    var under = Game.scenes[Game.scenes.length - 2];
    if (under && under.draw && !(under instanceof SceneTitle)) under.draw(ctx); else { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, 320, 240); }
    if (under instanceof SceneTitle) under.draw(ctx);
    if (this.list.dirty) this.refreshList();
    this.help.draw(ctx);
    this.list.draw(ctx);
  },
  refreshList: function () {
    var w = this.list;
    w.contents = Gfx.makeCanvas(w.width - 16, CONFIG.MAX_SAVES * 64);
    w.cctx = w.contents.getContext('2d');
    w.cctx.imageSmoothingEnabled = false;
    for (var i = 0; i < CONFIG.MAX_SAVES; i++) {
      var y = i * 64;
      var s = this.slots[i];
      w.text(Terms.get('file') + ' ' + (i + 1), 0, y, 1);
      if (!s) { w.text(I18N.t('slotEmpty'), 0, y + 16, 3); continue; }
      var t = s.title || {};
      w.text(t.leader || '', 0, y + 16, 0);
      w.text(Terms.get('lvl_short') + ' ' + (t.level || 0), 0, y + 32, 0);
      w.text(Terms.get('hp_short') + ' ' + (t.hp || 0), 60, y + 32, 0);
      var faces = t.faces || [];
      for (var f = 0; f < faces.length && f < 4; f++) {
        var img = Loader.image('faceset', faces[f].name);
        if (!img) continue;
        var fi = faces[f].index;
        w.cctx.drawImage(img, (fi % 4) * 48, Math.floor(fi / 4) * 48, 48, 48, 100 + f * 52, y + 8, 48, 48);
      }
      var d = new Date(s.time || 0);
      w.text(d.toLocaleDateString() + ' ' + d.toLocaleTimeString().slice(0, 5), w.cw(), y, 0, { align: 'right' });
    }
    w.dirty = false;
  },
};
