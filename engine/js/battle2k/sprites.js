/* RPG Maker 2000 battle: windows and drawing (backdrop, enemy battlers with hit flash, death /
   escape fade and the blinking target highlight). Part of SceneBattle2k (see scene.js). */
Object.assign(SceneBattle2k.prototype, {
  createWindows: function () {
    var self = this, y = BATTLE2K_WINDOW_Y;
    this.options = new Window_Command(0, y, BATTLE2K_SIDE_W, [Terms.get('battle_fight'), Terms.get('battle_auto'), Terms.get('battle_escape')]);
    this.options.onOk = function (i) { self.onOption(i); };
    this.options.onCancel = function () {};
    this.command = new Window_Command(0, y, BATTLE2K_SIDE_W, [Terms.get('command_attack'), Terms.get('command_defend'), Terms.get('command_item'), Terms.get('command_skill')]);
    this.command.visible = false;
    this.command.onOk = function (i) { self.onCommand(i); };
    this.command.onCancel = function () { self.prevActor(); };
    this.status = new Window_Selectable(BATTLE2K_SIDE_W, y, 320 - BATTLE2K_SIDE_W, 80);
    this.status.itemMax = Party.size();
    this.status.index = -1;
    this.msg = new Window_Base(0, y, 320, 80);
    this.msg.visible = false;
    this.msgLines = [];
    this.createListWindows();
  },
  createListWindows: function () {
    var self = this, y = BATTLE2K_WINDOW_Y;
    this.list = new Window_Selectable(0, y, 320, 80);
    this.list.columns = 2;
    this.list.visible = false;
    this.list.onCancel = function () { Audio_.sys('cancel'); self.list.visible = false; self.list.active = false; self.command.active = true; };
    this.list.onOk = function (i) { self.onListPick(i); };
    this.targetIndex = 0;
    this.selectingTarget = false;
    this.targetWin = new Window_Selectable(0, y, BATTLE2K_SIDE_W, 80);
    this.targetWin.visible = false;
  },

  draw: function (ctx) {
    if (this.backdrop) ctx.drawImage(this.backdrop, 0, 0);
    else { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, 320, BATTLE2K_WINDOW_Y); }
    var self = this;
    this.enemies.forEach(function (e) { self.drawEnemy(ctx, e); });
    BattleAnim.drawBattle(ctx);
    if (this.selectingTarget === 'enemy') this.drawTargetBlink(ctx);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, BATTLE2K_WINDOW_Y, 320, 80);
    [this.options, this.command, this.targetWin, this.status, this.msg, this.list].forEach(function (w) { w.draw(ctx); });
  },
  enemyVisible: function (e) {
    if (e.hidden) return false;
    return !((e.dead || e.escaped) && e.fadeOut <= 0);
  },
  drawEnemy: function (ctx, e) {
    var img = this.enemyVisible(e) ? Loader.image('monster', e.data.battler_name) : null;
    if (!img) return;
    var x = Math.round(e.x - img.width / 2), y = Math.round(e.y - img.height / 2);
    ctx.save();
    if (e.dead || e.escaped) ctx.globalAlpha = e.fadeOut / BATTLE2K_FADE_FRAMES;
    ctx.drawImage(img, x, y);
    if (e.flash > 0) ctx.drawImage(battle2kWhiteOverlay(img, e.flash / BATTLE2K_FLASH_FRAMES), x, y);
    ctx.restore();
  },
  drawTargetBlink: function (ctx) {
    var e = this.alive()[this.targetIndex];
    if (!e || (this.targetWin.frame % 16) >= 8) return;
    var img = Loader.image('monster', e.data.battler_name);
    if (img) ctx.drawImage(battle2kWhiteOverlay(img, 0.5), Math.round(e.x - img.width / 2), Math.round(e.y - img.height / 2));
  },
});

/** @returns {HTMLCanvasElement} the image's silhouette filled with white at the given alpha */
function battle2kWhiteOverlay(img, alpha) {
  var tmp = Gfx.makeCanvas(img.width, img.height), tc = tmp.getContext('2d');
  tc.drawImage(img, 0, 0);
  tc.globalCompositeOperation = 'source-in';
  tc.fillStyle = 'rgba(255,255,255,' + alpha + ')';
  tc.fillRect(0, 0, img.width, img.height);
  return tmp;
}
