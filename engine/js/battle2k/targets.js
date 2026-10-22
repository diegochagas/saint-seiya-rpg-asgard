/* RPG Maker 2000 battle: choosing an enemy (name list + blinking battler) or an ally (cursor on
   the status window). Part of SceneBattle2k (see scene.js). */
Object.assign(SceneBattle2k.prototype, {
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
    if (this.selectingTarget === 'enemy') this.updateEnemyTarget();
    else this.updateAllyTarget();
  },
  /* the cursor index moved by up/down (and left/right when allowed), wrapping around n entries */
  cursorStep: function (n, sideways) {
    if (Input.repeated('down') || (sideways && Input.repeated('right'))) return (this.targetIndex + 1) % n;
    if (Input.repeated('up') || (sideways && Input.repeated('left'))) return (this.targetIndex + n - 1) % n;
    return this.targetIndex;
  },
  confirmed: function (key) {
    if (!Input.triggered(key)) return false;
    Input.consume(key);
    Audio_.sys(key === 'ok' ? 'decision' : 'cancel');
    return true;
  },
  updateEnemyTarget: function () {
    var al = this.alive(), next = this.cursorStep(al.length, true);
    if (next !== this.targetIndex) { this.targetIndex = next; Audio_.sys('cursor'); }
    else if (this.confirmed('ok')) { this.endTargetSelect(); this.targetCb(al[this.targetIndex]); }
    else if (this.confirmed('cancel')) { this.endTargetSelect(); this.command.visible = true; this.command.active = true; }
    this.targetWin.setIndex(Math.min(this.targetIndex, al.length - 1));
  },
  updateAllyTarget: function () {
    var next = this.cursorStep(Party.size(), false);
    if (next !== this.targetIndex) { this.targetIndex = next; this.status.setIndex(next); Audio_.sys('cursor'); return; }
    if (this.confirmed('ok')) { this.endAllyTarget(); this.targetCb(Party.members[this.targetIndex]); }
    else if (this.confirmed('cancel')) { this.endAllyTarget(); this.command.active = true; }
  },
  endAllyTarget: function () { this.selectingTarget = false; this.status.setIndex(this.actorIndex); },
});
