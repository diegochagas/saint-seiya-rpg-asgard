/* RPG Maker 2000 battle: the bottom message window, the step queue that paces messages and
   effects, and the troop event pages. Part of SceneBattle2k (see scene.js). */
var BATTLE2K_MESSAGE_FRAMES = 25;
var BATTLE2K_MESSAGE_LINES = 4;

/* Troop page commands the 2000 battle runs itself: play BGM, play SE, switches, show message */
var BATTLE2K_TROOP_COMMANDS = {
  11510: function (c) { Audio_.playBgm({ name: c.string, fadein: c.params[0], volume: c.params[1], tempo: c.params[2], balance: c.params[3] }); },
  11550: function (c) { Audio_.playSe({ name: c.string, volume: c.params[0], tempo: c.params[1], balance: c.params[2] }); },
  10210: function (c) { GameState.setSw(c.params[1], c.params[3] === 0); },
  10110: function (c, scene) { scene.queue.push({ msg: c.string }); },
};

Object.assign(SceneBattle2k.prototype, {
  /* troop pages: only "turn" conditions supported (turn_a + turn_b * n) plus unconditional */
  runTroopEvents: function (first) {
    var self = this;
    Object.keys(this.troop.pages).forEach(function (k) {
      var pg = self.troop.pages[k];
      if (!self.troopPageDue(pg.condition, first) || pg._ran === self.turn) return;
      pg._ran = self.turn;
      pg.event_commands.forEach(function (c) {
        var run = BATTLE2K_TROOP_COMMANDS[c.code];
        if (run) run(c, self);
      });
    });
  },
  troopPageDue: function (cond, first) {
    var f = cond.flags;
    if (f.turn) return cond.turn_b === 0 ? this.turn === cond.turn_a : (this.turn >= cond.turn_a && (this.turn - cond.turn_a) % cond.turn_b === 0);
    if (f.switch_a || f.switch_b || f.variable || f.fatigue || f.enemy_hp || f.actor_hp) return false;
    return first;
  },

  /* ---- message queue: {msg}, {wait}, {fn} (callback) or {act} (effect when its message shows) ---- */
  showMessages: function (lines, done) {
    var self = this;
    lines.forEach(function (l) { self.queue.push({ msg: l }); });
    this.queue.push({ fn: done });
    this.processQueue();
  },
  processQueue: function () {
    while (this.queue.length && this.wait <= 0) {
      var q = this.queue.shift();
      if (q.msg != null) { this.pushLine(q.msg); this.wait = BATTLE2K_MESSAGE_FRAMES; }
      else if (q.wait) this.wait = q.wait;
      else if (q.fn) q.fn();
      else if (q.act) q.act();
    }
  },
  pushLine: function (text) {
    this.msg.visible = true;
    [this.options, this.command, this.status, this.list, this.targetWin].forEach(function (w) { w.visible = false; });
    this.msgLines.push(text);
    if (this.msgLines.length > BATTLE2K_MESSAGE_LINES) this.msgLines.shift();
    this.msg.clear();
    for (var i = 0; i < this.msgLines.length; i++) this.msg.text(this.msgLines[i], 0, i * 16, 0);
    this.msg.dirty = false;
  },
  clearMessages: function () { this.msgLines = []; this.msg.visible = false; this.msg.clear(); },
});
