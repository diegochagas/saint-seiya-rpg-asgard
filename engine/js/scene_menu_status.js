/* Status screen (RPG Maker 2003 layout): profile on the left, HP/MP/XP, parameters and
   equipment on the right. Left/right switches between party members. */
function SceneStatus(actor) { this.actor = actor; }
SceneStatus.prototype = {
  start: function () {
    this.info = new Window_Base(0, 0, 124, 208);
    this.gold = new Window_Base(0, 208, 124, 32);
    this.vitals = new Window_Base(124, 0, 196, 64);
    this.params = new Window_Base(124, 64, 196, 80);
    this.equips = new Window_Base(124, 144, 196, 96);
    this.refresh();
    Input.clear();
  },
  windows: function () { return [this.info, this.gold, this.vitals, this.params, this.equips]; },
  refresh: function () {
    this.windows().forEach(function (w) { w.clear(); });
    this.drawInfo(this.info, this.actor);
    this.gold.drawGold(0, 0);
    this.drawVitals(this.vitals, this.actor);
    this.drawParams(this.params, this.actor);
    this.drawEquips(this.equips, this.actor);
    this.windows().forEach(function (w) { w.dirty = false; });
  },
  drawInfo: function (w, a) {
    w.drawActorFace(a, 0, 0);
    var rows = [['statusName', 'drawActorName'], ['statusClass', 'drawActorClass'],
      ['statusTitle', 'drawActorTitle'], ['statusState', 'drawActorState']];
    rows.forEach(function (row, i) {
      w.text(I18N.t(row[0]), 0, 50 + i * 32, 1);
      w[row[1]](a, 36, 66 + i * 32);
    });
    w.text(Terms.get('level'), 0, 178, 1);
    w.text(String(a.level), 78, 178, 0, { align: 'right' });
  },
  drawVitals: function (w, a) {
    var rows = [['health_points', a.hp, a.maxHp()], ['spirit_points', a.sp, a.maxSp()], ['exp_short', a.exp, a.nextExp()]];
    rows.forEach(function (row, i) {
      var y = 2 + i * 16;
      w.text(Terms.get(row[0]), 1, y, 1);
      w.text(String(row[1]), 90, y, 0, { align: 'right' });
      w.text('/', 90, y, 0);
      w.text(row[2] < 0 ? '------' : String(row[2]), 138, y, 0, { align: 'right' });
    });
  },
  drawParams: function (w, a) {
    var rows = [['attack', a.atk()], ['defense', a.def()], ['spirit', a.spi()], ['agility', a.agi()]];
    rows.forEach(function (row, i) {
      w.text(Terms.get(row[0]), 0, 2 + i * 16, 1);
      w.text(String(row[1]), 90, 2 + i * 16, 0, { align: 'right' });
    });
  },
  drawEquips: function (w, a) {
    for (var i = 0; i < 5; i++) {
      var type = i === 1 && a.twoWeapon ? ITEM_WEAPON : i + 1;
      w.text(Terms.get(EQUIP_SLOT_TERMS[type - 1]), 0, 2 + i * 16, 1);
      if (a.equip[i]) w.text(DB.itemName(a.equip[i]), 60, 2 + i * 16, 0);
    }
  },
  switchActor: function (step) {
    var n = Party.size(), i = Party.members.indexOf(this.actor);
    if (n < 2) return;
    Audio_.sys('cursor');
    this.actor = Party.members[(i + step + n) % n];
    this.refresh();
  },
  onLanguageChange: function () { this.refresh(); },
  update: function () {
    this.windows().forEach(function (w) { w.update(); });
    if (Input.triggered('cancel')) { Audio_.sys('cancel'); Game.pop(); return; }
    if (Input.triggered('right')) this.switchActor(1);
    else if (Input.triggered('left')) this.switchActor(-1);
  },
  draw: function (ctx) {
    var map = Game.scenes[0];
    if (map && map.draw) map.draw(ctx);
    this.windows().forEach(function (w) { w.draw(ctx); });
  },
};
