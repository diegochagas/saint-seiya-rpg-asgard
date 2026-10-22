/* Shop: buy / sell with the database's shop vocabulary (3 greeting styles). */
function SceneShop(args, onDone) {
  this.type = args.type;        /* 0 buy+sell, 1 buy only, 2 sell only */
  this.style = args.style + 1;  /* terms suffix 1..3 */
  this.items = args.items;
  this.onDone = onDone;
  this.bought = false;
  this.state = 'greet';
}
SceneShop.prototype = {
  term: function (k) { return Terms.get('shop_' + k + this.style); },
  start: function () {
    var self = this;
    this.msg = new Window_Base(0, 0, 320, 80);
    this.gold = new Window_Base(232, 80, 88, 32);
    this.info = new Window_Base(0, 80, 232, 32);
    this.list = new Window_Selectable(0, 112, 320, 128);
    this.list.onOk = function (i) { self.pick(i); };
    this.list.onCancel = function () { Audio_.sys('cancel'); self.showCommands(true); };
    this.cmd = null;
    this.qty = new Window_Base(64, 80, 192, 64);
    this.qty.visible = false;
    this.count = 1;
    this.refreshGold();
    this.showCommands(false);
    Input.clear();
  },
  refreshGold: function () { this.gold.clear(); this.gold.drawGold(0, 0); this.gold.dirty = false; },
  setMessage: function (text) { this.msg.clear(); this.msg.text(text, 0, 0, 0); this.msg.dirty = false; },
  showCommands: function (again) {
    var self = this;
    this.state = 'command';
    this.setMessage(again ? this.term('regreeting') : this.term('greeting'));
    var cmds = [];
    if (this.type !== 2) cmds.push({ t: this.term('buy'), k: 'buy' });
    if (this.type !== 1) cmds.push({ t: this.term('sell'), k: 'sell' });
    cmds.push({ t: this.term('leave'), k: 'leave' });
    this.cmdKeys = cmds.map(function (c) { return c.k; });
    this.cmd = new Window_Command(0, 80, 320, cmds.map(function (c) { return c.t; }), cmds.length);
    this.cmd.active = true;
    this.cmd.onOk = function (i) { self.command(self.cmdKeys[i]); };
    this.cmd.onCancel = function () { self.leave(); };
    this.list.visible = false; this.list.active = false;
    this.info.visible = false; this.gold.visible = true;
  },
  command: function (k) {
    Audio_.sys('decision');
    if (k === 'leave') { this.leave(); return; }
    this.mode = k;
    this.cmd.visible = false; this.cmd.active = false;
    this.setMessage(k === 'buy' ? this.term('buy_select') : this.term('sell_select'));
    this.ids = k === 'buy' ? this.items.slice() : Party.itemIds();
    this.refreshList();
    this.list.visible = true; this.list.active = true;
    this.list.setIndex(this.ids.length ? 0 : -1);
    this.info.visible = true;
    this.state = 'list';
  },
  leave: function () {
    Audio_.sys('cancel');
    this.setMessage(this.term('leave'));
    var self = this;
    this.cmd.active = false;
    this.leaveTimer = 20;
  },
  refreshList: function () {
    var w = this.list, self = this;
    w.itemMax = this.ids.length;
    w.contents = Gfx.makeCanvas(w.width - 16, Math.max(w.height - 16, this.ids.length * 16));
    w.cctx = w.contents.getContext('2d'); w.cctx.imageSmoothingEnabled = false;
    for (var i = 0; i < this.ids.length; i++) {
      var it = DB.item(this.ids[i]);
      var price = this.mode === 'buy' ? it.price : Math.floor(it.price / 2);
      var ok = this.mode === 'buy' ? (Party.gold >= it.price && Party.itemCount(this.ids[i]) < 99) : it.price > 0;
      w.text(it.name, 0, i * 16, ok ? 0 : 3);
      w.text(String(price), w.cw() - 4, i * 16, ok ? 0 : 3, { align: 'right' });
      if (this.mode === 'sell') w.text(':' + Party.itemCount(this.ids[i]), w.cw() - 60, i * 16, ok ? 0 : 3, { align: 'right' });
    }
    w.dirty = false;
    this.refreshInfo();
  },
  refreshInfo: function () {
    var id = this.ids[this.list.index];
    var w = this.info;
    w.clear();
    if (id) {
      w.text(Terms.get('possessed_items'), 0, 0, 1);
      w.text(String(Party.itemCount(id)), 110, 0, 0, { align: 'right' });
      w.text(Terms.get('equipped_items'), 120, 0, 1);
      w.text(String(Party.equippedCount(id)), 216, 0, 0, { align: 'right' });
    }
    w.dirty = false;
  },
  pick: function (i) {
    var id = this.ids[i];
    if (!id) return;
    var it = DB.item(id);
    if (this.mode === 'buy' && (Party.gold < it.price || Party.itemCount(id) >= 99)) { Audio_.sys('buzzer'); return; }
    if (this.mode === 'sell' && it.price <= 0) { Audio_.sys('buzzer'); return; }
    Audio_.sys('decision');
    this.current = id;
    this.count = 1;
    this.setMessage(this.mode === 'buy' ? this.term('buy_number') : this.term('sell_number'));
    this.list.active = false;
    this.qty.visible = true;
    this.state = 'qty';
    this.refreshQty();
  },
  maxCount: function () {
    var it = DB.item(this.current);
    if (this.mode === 'buy') return Math.max(1, Math.min(99 - Party.itemCount(this.current), it.price > 0 ? Math.floor(Party.gold / it.price) : 99));
    return Party.itemCount(this.current);
  },
  refreshQty: function () {
    var it = DB.item(this.current), w = this.qty;
    w.clear();
    w.text(it.name, 0, 0, 0);
    w.text('x ' + this.count, 0, 24, 0);
    var price = this.mode === 'buy' ? it.price : Math.floor(it.price / 2);
    w.text(String(price * this.count) + Terms.get('gold'), w.cw(), 24, 0, { align: 'right' });
    w.dirty = false;
  },
  updateQty: function () {
    var max = this.maxCount();
    if (Input.repeated('right') || Input.repeated('up')) { this.count = Math.min(max, this.count + 1); Audio_.sys('cursor'); this.refreshQty(); }
    else if (Input.repeated('left') || Input.repeated('down')) { this.count = Math.max(1, this.count - 1); Audio_.sys('cursor'); this.refreshQty(); }
    else if (Input.triggered('ok')) {
      Input.consume('ok');
      var it = DB.item(this.current);
      if (this.mode === 'buy') { Party.changeGold(-it.price * this.count); Party.addItem(this.current, this.count); this.bought = true; }
      else { Party.changeGold(Math.floor(it.price / 2) * this.count); Party.addItem(this.current, -this.count); }
      Audio_.sys('decision');
      this.qty.visible = false;
      this.refreshGold();
      this.setMessage(this.mode === 'buy' ? this.term('purchased') : this.term('sold'));
      this.ids = this.mode === 'buy' ? this.items.slice() : Party.itemIds();
      this.refreshList();
      if (this.list.index >= this.ids.length) this.list.setIndex(this.ids.length - 1);
      this.list.active = true;
      this.state = 'list';
    } else if (Input.triggered('cancel')) {
      Input.consume('cancel');
      Audio_.sys('cancel');
      this.qty.visible = false;
      this.list.active = true;
      this.state = 'list';
      this.setMessage(this.mode === 'buy' ? this.term('buy_select') : this.term('sell_select'));
    }
  },
  update: function () {
    this.msg.update(); this.gold.update(); this.info.update(); this.list.update(); this.qty.update();
    if (this.cmd) this.cmd.update();
    if (this.leaveTimer != null) { this.leaveTimer--; if (this.leaveTimer <= 0) { this.leaveTimer = null; this.onDone(this.bought); } return; }
    if (this.state === 'qty') this.updateQty();
    else if (this.state === 'list' && this.list.active) { if (this.lastIndex !== this.list.index) { this.lastIndex = this.list.index; this.refreshInfo(); } }
  },
  draw: function (ctx) {
    var map = Game.scenes[0]; if (map && map.draw) map.draw(ctx);
    this.msg.draw(ctx);
    if (this.cmd && this.cmd.visible) this.cmd.draw(ctx);
    this.gold.draw(ctx); this.info.draw(ctx); this.list.draw(ctx); this.qty.draw(ctx);
  },
};
