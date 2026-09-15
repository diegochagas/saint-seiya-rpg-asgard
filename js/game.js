/* Main loop, scene stack and cross-scene operations (teleport, battle, shop, menus). */
var Game = {
  scenes: [],
  frame: null,
  fctx: null,
  teleporting: false,
  battleRunning: false,
  pendingTeleport: null,
  lastTime: 0,
  acc: 0,
  running: false,

  init: function () {
    this.frame = Gfx.makeCanvas(CONFIG.SCREEN_W, CONFIG.SCREEN_H);
    this.fctx = this.frame.getContext('2d');
    this.fctx.imageSmoothingEnabled = false;
  },

  scene: function () { return this.scenes[this.scenes.length - 1] || null; },
  sceneStackDepth: function () { return this.scenes.length; },
  push: function (s) { this.scenes.push(s); if (s.start) s.start(); },
  pop: function () { var s = this.scenes.pop(); if (s && s.stop) s.stop(); var top = this.scene(); if (top && top.resume) top.resume(); },
  replace: function (s) { while (this.scenes.length) this.pop(); this.push(s); },
  transitionBusy: function () { return Screen.fadeBusy(); },

  start: function () {
    this.running = true;
    this.lastTime = performance.now();
    var self = this;
    var loop = function (t) {
      if (!self.running) return;
      var dt = t - self.lastTime;
      self.lastTime = t;
      self.acc += Math.min(dt, 100);
      var step = 1000 / CONFIG.FPS;
      var n = 0;
      try {
        while (self.acc >= step && n < 4) { self.update(); self.acc -= step; n++; }
        if (n === 4) self.acc = 0;
        self.draw();
      } catch (err) {
        /* never let one bad frame kill the game loop */
        self.acc = 0;
        if (!self.lastError || self.lastError !== String(err)) { self.lastError = String(err); console.error(err); }
      }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  },

  update: function () {
    Input.update();
    Audio_.update();
    GameState.frame++;
    var s = this.scene();
    if (s) s.update();
    Screen.update();
  },
  draw: function () {
    var ctx = this.fctx;
    ctx.clearRect(0, 0, CONFIG.SCREEN_W, CONFIG.SCREEN_H);
    var s = this.scene();
    if (s) s.draw(ctx);
    Screen.compose(Gfx.ctx, this.frame);
  },

  /* ---- operations used by interpreter / scenes ---- */
  newGame: function () {
    GameState.newGame();
    Player.refreshSprite();
    var st = Loader.tree.start;
    Player.x = st.party_x; Player.y = st.party_y; Player.facing = DIR.DOWN; Player.hidden = false;
    Player.remainingStep = 0; Player.route = null;
    Screen.fade = 0;
    this.replace(new SceneMap(st.party_map_id, true));
  },
  loadGame: function (data) {
    GameState.newGame();
    GameState.restore(data);
    Player.refreshSprite();
    var m = data.map;
    Player.x = m.x; Player.y = m.y; Player.facing = m.facing; Player.hidden = !!m.hidden;
    Player.remainingStep = 0; Player.route = null;
    Screen.fade = 0;
    var scene = new SceneMap(m.id, true);
    scene.restoreMapState = m;
    scene.restoreBgm = data.bgm;
    this.replace(scene);
  },
  teleport: function (mapId, x, y, facing) {
    this.teleporting = true;
    this.pendingTeleport = { mapId: mapId, x: x, y: y, facing: facing };
  },
  startBattle: function (args, cb) {
    this.battleRunning = true;
    var self = this;
    this.push(new SceneBattle(args, function (result) {
      self.pop();
      self.battleRunning = false;
      cb(result);
    }));
  },
  openShop: function (args, cb) {
    var self = this;
    this.push(new SceneShop(args, function (bought) { self.pop(); cb(bought); }));
  },
  openMenu: function () { this.push(new SceneMenu()); },
  openSave: function () { this.push(new SceneFile('save')); },
  openLoad: function () { this.push(new SceneFile('load')); },
  gameOver: function () { this.replace(new SceneGameOver()); },
  toTitle: function () { Audio_.stopBgm(); Screen.reset(); this.replace(new SceneTitle()); },
  /* "Exit": ask the local dev server to stop (ignored on static hosting), then show a closing screen */
  exitGame: function () {
    Audio_.stopBgm();
    try { fetch('/__exit', { method: 'POST' }).catch(function () {}); } catch (e) {}
    this.replace({
      update: function () {},
      draw: function (ctx) {
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, CONFIG.SCREEN_W, CONFIG.SCREEN_H);
        Font.draw(ctx, I18N.t('exited'), CONFIG.SCREEN_W / 2, 112, 0, { align: 'center' });
      },
    });
    Screen.fade = 1;
    this.running = false;
    this.draw();
    try { window.close(); } catch (e) {}
  },
  innSleep: function (cb) {
    var mapScene = this.scenes[0];
    var self = this;
    var prevBgm = Audio_.bgmCurrent;
    this.push({
      t: 0,
      update: function () {
        this.t++;
        if (this.t === 1) { Screen.fadeOut(20); }
        if (this.t === 22) {
          Party.members.forEach(function (a) { a.fullHeal(); });
          Audio_.stopBgm();
          Audio_.playBgm(GameState.system.inn_music);
        }
        if (this.t === 22 + 150) { Screen.fadeIn(20); }
        if (this.t === 22 + 172) {
          if (prevBgm) Audio_.playBgm(prevBgm); else GameMap.playMusic();
          self.pop();
          cb();
        }
      },
      draw: function (ctx) { if (mapScene) mapScene.draw(ctx); },
    });
  },
};
