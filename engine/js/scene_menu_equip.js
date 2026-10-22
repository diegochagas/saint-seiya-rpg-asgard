/* Equipment screen for one actor (2003: two-weapon actors carry a weapon in the shield slot,
   locked equipment cannot be changed). */
var EQUIP_SLOT_TERMS = ['weapon', 'shield', 'armor', 'helmet', 'accessory'];

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
    for (var i = 0; i < 5; i++) {
      s.text(Terms.get(EQUIP_SLOT_TERMS[this.slotItemType(i) - 1]), 0, i * 16, 1);
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
  /* item type a slot accepts: 1 weapon ... 5 accessory */
  slotItemType: function (slot) { return slot === 1 && this.actor.twoWeapon ? ITEM_WEAPON : slot + 1; },
  candidates: function (slot) {
    var a = this.actor, type = this.slotItemType(slot);
    return Party.itemIds().filter(function (id) { var it = DB.item(id); return it.type === type && a.canEquip(it); });
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
  /* locked actors and cursed items stay put (RPG Maker 2003) */
  openItems: function (slot) {
    var cur = this.actor.equip[slot] ? DB.item(this.actor.equip[slot]) : null;
    if (this.actor.lockEquipment || (cur && cur.cursed)) { Audio_.sys('buzzer'); return; }
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
