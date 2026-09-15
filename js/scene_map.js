/* The map scene: runs the map, handles teleports, menu and random encounters. */
function SceneMap(mapId, fadeIn) {
  this.mapId = mapId;
  this.fadeIn = fadeIn;
  this.restoreMapState = null;
  this.restoreBgm = null;
  this.teleportPhase = 0;
}
SceneMap.prototype = {
  start: function () {
    GameMap.setup(this.mapId);
    if (this.restoreMapState) this.applyMapState(this.restoreMapState);
    if (this.restoreBgm) Audio_.playBgm(this.restoreBgm);
    BattleAnim.clear();
    if (this.fadeIn) Screen.fadeIn(20);
    Game.teleporting = false;
    Input.clear();
  },
  applyMapState: function (m) {
    if (m.chipsetId && m.chipsetId !== GameMap.chipsetId) GameMap.setChipset(m.chipsetId);
    GameMap.encounterStepsOverride = m.encounterOverride == null ? -1 : m.encounterOverride;
    (m.erased || []).forEach(function (id) { var e = GameMap.events.find(function (x) { return x.id === id; }); if (e) { e.erased = true; e.refresh(); } });
    (m.events || []).forEach(function (es) { var e = GameMap.events.find(function (x) { return x.id === es.id; }); if (e) { e.x = es.x; e.y = es.y; e.facing = es.facing; } });
  },
  resume: function () { Input.clear(); },

  update: function () {
    GameState.playTime++;
    Pictures.update();
    BattleAnim.update();
    if (Game.pendingTeleport) { this.updateTeleport(); return; }
    MessageWindow.update();
    MessageWindow.pollClose();
    GameMap.update();
    if (Player.menuCalling) {
      Player.menuCalling = false;
      if (!GameMap.interpreter.running() && !MessageWindow.busy()) { Audio_.sys('decision'); Game.openMenu(); return; }
    }
    if (Player.encounterCalling) {
      Player.encounterCalling = false;
      this.startRandomEncounter();
    }
  },

  updateTeleport: function () {
    var t = Game.pendingTeleport;
    if (this.teleportPhase === 0) {
      if (MessageWindow.busy()) return;
      if (Screen.fade > 0 && !Screen.erased) { Screen.fadeOut(12); }
      this.teleportPhase = 1;
    } else if (this.teleportPhase === 1) {
      if (Screen.fadeBusy()) return;
      var sameMap = t.mapId === GameMap.id;
      Player.x = t.x; Player.y = t.y; Player.remainingStep = 0; Player.route = null;
      if (t.facing >= 0) Player.forceFacing(t.facing);
      if (!sameMap) {
        var oldParallel = GameMap.commonParallel;
        var interp = GameMap.interpreter;
        GameMap.setup(t.mapId);
        GameMap.interpreter = interp;          /* the running event keeps executing */
        Pictures.clear();
        BattleAnim.clear();
      } else {
        GameMap.updateScroll();
      }
      GameMap.pan.x = 0; GameMap.pan.y = 0; GameMap.pan.tx = 0; GameMap.pan.ty = 0;
      Player.encounterRate = 0;
      if (!Screen.erased) Screen.fadeIn(12);
      this.teleportPhase = 2;
    } else if (this.teleportPhase === 2) {
      if (Screen.fadeBusy()) return;
      this.teleportPhase = 0;
      Game.pendingTeleport = null;
      Game.teleporting = false;
    }
  },

  encounterTroops: function () {
    var out = [];
    var info = DB.mapInfo(GameMap.id);
    var push = function (encs) { for (var k in encs) out.push(encs[k].troop_id); };
    push(info.encounters);
    for (var id in Loader.tree.maps) {
      var m = Loader.tree.maps[id];
      if (m.parent_map === GameMap.id && m.type === 2) {
        var r = m.area_rect;
        if (Player.x >= r.l && Player.x < r.r && Player.y >= r.t && Player.y < r.b) push(m.encounters);
      }
    }
    return out;
  },
  startRandomEncounter: function () {
    var troops = this.encounterTroops();
    if (!troops.length) return;
    var troopId = troops[Rand.int(0, troops.length - 1)];
    var terrainId = GameMap.terrainAt(Player.x, Player.y);
    Game.startBattle({ troopId: troopId, background: null, terrainId: terrainId, allowEscape: true, firstStrike: false, random: true }, function (result) {
      if (result === 'defeat') Game.gameOver();
    });
  },

  draw: function (ctx) {
    GameMap.draw(ctx);
    Pictures.draw(ctx);
    MessageWindow.draw(ctx);
  },
};
