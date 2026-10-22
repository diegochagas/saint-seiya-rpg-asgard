/* RPG Maker 2000 front-view battle scene: options (Fight / Auto / Escape), per-actor commands,
   agility-ordered turns, text messages in the bottom window, rewards and level ups.
   The other parts of SceneBattle2k live in this folder: messages.js (message queue, troop pages),
   input.js (commands and targets), ai.js, actions.js, skills.js, outcome.js. */
var BATTLE2K_WINDOW_Y = 160;
var BATTLE2K_SIDE_W = 76;
var BATTLE2K_FLASH_FRAMES = 12;

/**
 * @param {{troopId:number, background:?string, terrainId:number, allowEscape:boolean, firstStrike:boolean}} args
 * @param {function(string)} onDone 'victory' | 'escape' | 'defeat'
 */
function SceneBattle2k(args, onDone) {
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
SceneBattle2k.prototype = {
  start: function () {
    var troop = DB.troop(this.args.troopId), self = this;
    this.troop = troop;
    Object.keys(troop.members).forEach(function (k, i) { self.enemies.push(new Battle2kEnemy(troop.members[k], i)); });
    this.backdrop = Loader.image('backdrop', this.backdropName());
    this.createWindows();
    this.refreshStatus();
    Screen.fade = 1;
    Screen.fadeOut(0);
    Screen.fade = 0;
    Screen.fadeIn(15);
    this.startMusic();
    this.runTroopEvents(true);
    this.state = 'intro';
    var appeared = this.enemies.filter(function (e) { return !e.hidden; }).map(function (e) { return e.name + Terms.get('encounter'); });
    this.showMessages(appeared, function () { self.startTurn(); });
    Input.clear();
  },
  backdropName: function () {
    if (this.args.background) return this.args.background;
    var t = DB.terrain(this.args.terrainId || 1);
    return t ? t.background_name : '';
  },
  startMusic: function () {
    Audio_.playSe(GameState.system.battle_se || Loader.db.system.battle_se);
    var music = GameState.system.battle_music;
    this.prevBgm = null;
    if (music && music.name && music.name !== '(OFF)') { this.prevBgm = Audio_.bgmCurrent; Audio_.playBgm(music); }
    this.mapBgm = Audio_.bgmCurrent;
  },

  refreshStatus: function () {
    var w = this.status;
    w.clear();
    for (var i = 0; i < Party.size(); i++) this.drawStatusRow(w, Party.members[i], i * 16);
    w.dirty = false;
  },
  drawStatusRow: function (w, a, y) {
    w.text(a.name, 0, y, a.isDead() ? 3 : 0);
    var st = a.significantState();
    if (st) w.text(st.name, 60, y, st.color);
    w.text(Terms.get('hp_short'), 108, y, 1);
    w.text(String(a.hp), 150, y, a.hp === 0 ? 5 : a.hp <= a.maxHp() / 4 ? 4 : 0, { align: 'right' });
    w.text(Terms.get('sp_short'), 160, y, 1);
    w.text(String(a.sp), 200, y, a.sp <= a.maxSp() / 4 ? 4 : 0, { align: 'right' });
  },

  update: function () {
    [this.options, this.command, this.status, this.msg, this.list, this.targetWin].forEach(function (w) { w.update(); });
    BattleAnim.update();
    this.enemies.forEach(function (e) { if (e.flash > 0) e.flash--; if (e.fadeOut > 0) e.fadeOut--; });
    if (this.state === 'done') { this.updateClosing(); return; }
    if (this.wait > 0) { this.updateWait(); return; }
    if (this.selectingTarget) this.updateTargetSelect();
  },
  updateWait: function () {
    this.wait--;
    if (Input.pressed('ok') || Input.pressed('cancel')) this.wait = Math.max(0, this.wait - 2);
    if (this.wait <= 0) this.processQueue();
  },
  updateClosing: function () {
    if (this.finishTimer > 0) { this.finishTimer--; return; }
    if (Screen.fadeBusy()) return;
    this.state = 'closed';
    BattleAnim.clear();
    Screen.fadeIn(15);
    this.onDone(this.result);
  },
};
