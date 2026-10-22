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
    if (!Loader.map(this.mapId)) { this.waitForMap(); return; }
    this.ready = true;
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
  /* Maps load on demand: start() again once the first map has arrived. */
  waitForMap: function () {
    var self = this;
    this.ready = false;
    Loader.ensureMap(this.mapId).then(function () { self.start(); }).catch(function (err) { console.error(err); });
  },
  resume: function () { Input.clear(); },

  update: function () {
    if (!this.ready) return;
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
      var out = GameState.transitions[TRANSITION.TELEPORT_OUT];
      if (Screen.fade > 0 && !Screen.erased && out !== TRANSITION.NONE) Screen.fadeOut(Screen.transitionFrames(out));
      this.teleportPhase = 1;
    } else if (this.teleportPhase === 1) {
      if (Screen.fadeBusy()) return;
      if (!Loader.map(t.mapId)) { Loader.ensureMap(t.mapId); return; }
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
      if (!Screen.erased) Screen.fadeIn(Screen.transitionFrames(GameState.transitions[TRANSITION.TELEPORT_IN]));
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
    var args = { troopId: troopId, background: null, terrainId: terrainId, allowEscape: true, firstStrike: false, random: true,
      condition: Loader.is2k3() ? BattleLayout.randomCondition(terrainId) : CONDITION.NONE };
    Game.startBattle(args, function (result) { if (result === 'defeat') DeathHandler.run(); });
  },

  draw: function (ctx) {
    if (!this.ready) return;
    GameMap.draw(ctx);
    Pictures.draw(ctx);
    MessageWindow.draw(ctx);
  },
};

/* Losing a random battle: RPG Maker 2003's BattleCommands.death_handler can run a common event
   and/or teleport the party instead of Game Over (EasyRPG game_map.cpp). */
var DeathHandler = {
  run: function () {
    var bc = Loader.db.battlecommands;
    if (!Loader.is2k3() || !bc || !bc.death_handler) { Game.gameOver(); return; }
    var ce = Loader.db.commonevents[bc.death_event];
    if (ce && ce.event_commands.length) GameMap.interpreter.setup(ce.event_commands, 0);
    if (bc.death_teleport) Game.teleport(bc.death_teleport_id, bc.death_teleport_x, bc.death_teleport_y, bc.death_teleport_face - 1);
  },
};
