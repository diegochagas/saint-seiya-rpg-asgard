/* Game over screen: shows the GameOver graphic, any key returns to the title. */
function SceneGameOver() { this.t = 0; }
SceneGameOver.prototype = {
  start: function () {
    Audio_.stopBgm();
    Audio_.playBgm((GameState.system && GameState.system.gameover_music) || Loader.db.system.gameover_music);
    Screen.reset();
    Screen.fade = 0;
    Screen.fadeIn(30);
    Input.clear();
  },
  update: function () {
    this.t++;
    if (this.t > 60 && (Input.triggered('ok') || Input.triggered('cancel')) && !Screen.fadeBusy()) {
      Screen.fadeOut(20);
      this.leaving = true;
    }
    if (this.leaving && !Screen.fadeBusy()) { this.leaving = false; Game.toTitle(); }
  },
  draw: function (ctx) {
    var img = Loader.image('gameover', Loader.db.system.gameover_name);
    if (img) ctx.drawImage(img, 0, 0); else { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, 320, 240); }
  },
};
