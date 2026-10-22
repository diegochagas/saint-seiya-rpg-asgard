/* Title screen: Title graphic + New Game / Load Game / Exit command window. */
function SceneTitle() {
  this.cmd = null;
  this.t = 0;
}
SceneTitle.prototype = {
  start: function () {
    this.buildWindow();
    Screen.reset();
    Screen.fade = 0;
    Screen.fadeIn(20);
    Audio_.playBgm(Loader.db.system.title_music);
    Gfx.setSystem(Loader.db.system.system_name);
    GameState.system = null;
    Input.clear();
  },
  buildWindow: function () {
    var cmds = [Terms.get('new_game'), Terms.get('load_game'), Terms.get('exit_game')];
    var w = 0;
    cmds.forEach(function (c) { w = Math.max(w, Font.width(c)); });
    w += 24;
    var idx = this.cmd ? this.cmd.index : (this.hasSaves() ? 1 : 0);
    this.cmd = new Window_Command(Math.floor((320 - w) / 2), 152, w, cmds);
    this.cmd.index = idx;
    this.cmd.active = true;
    this.cmd.disabled = { 1: !this.hasSaves() };
    var self = this;
    this.cmd.onOk = function (i) { self.select(i); };
  },
  onLanguageChange: function () { this.buildWindow(); },
  hasSaves: function () {
    for (var i = 1; i <= CONFIG.MAX_SAVES; i++) if (GameState.readSlot(i)) return true;
    return false;
  },
  select: function (i) {
    if (Screen.fadeBusy()) return;
    if (i === 0) {
      Audio_.sys('decision');
      Audio_.stopBgm();
      var self = this;
      this.cmd.active = false;
      Screen.fadeOut(20);
      this.pending = function () { Game.newGame(); };
    } else if (i === 1) {
      if (!this.hasSaves()) { Audio_.sys('buzzer'); return; }
      Audio_.sys('decision');
      Game.push(new SceneFile('load'));
    } else {
      Audio_.sys('decision');
      this.cmd.active = false;
      Audio_.fadeOutBgm(300);
      Screen.fadeOut(20);
      this.pending = function () { Game.exitGame(); };
    }
  },
  resume: function () { this.cmd.active = true; },
  update: function () {
    this.t++;
    this.cmd.update();
    if (this.pending && !Screen.fadeBusy()) { var p = this.pending; this.pending = null; p(); }
  },
  draw: function (ctx) {
    var img = Loader.image('title', Loader.db.system.title_name);
    if (img) ctx.drawImage(img, 0, 0); else { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, 320, 240); }
    this.cmd.draw(ctx);
  },
};
