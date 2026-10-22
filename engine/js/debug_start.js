/* Test entry points used by the Playwright specs and for checking one map or battle quickly:
     ?map=12&x=5&y=7     new game placed on map 12 at (5, 7)
     ?battle=88          new game, then straight into a battle with troop 88
     ?party=1,2,3        replace the starting party (with ?map or ?battle)
     ?seed=42            deterministic Rand (see state.js) */
var DebugStart = {
  /** @param {URLSearchParams} q @returns {boolean} true when a debug start was used */
  boot: function (q) {
    if (q.has('seed')) Rand.seed(parseInt(q.get('seed'), 10));
    if (!q.has('map') && !q.has('battle')) return false;
    Game.newGame();
    if (q.has('party')) this.setParty(q.get('party'));
    if (q.has('map')) this.placeOnMap(parseInt(q.get('map'), 10), parseInt(q.get('x') || '0', 10), parseInt(q.get('y') || '0', 10));
    if (q.has('battle')) this.battle(parseInt(q.get('battle'), 10));
    return true;
  },
  setParty: function (list) {
    Party.members = [];
    list.split(',').forEach(function (id) { Party.addActor(parseInt(id, 10)); });
    Player.refreshSprite();
  },
  placeOnMap: function (mapId, x, y) {
    Player.x = x; Player.y = y;
    Game.replace(new SceneMap(mapId, true));
  },
  battle: function (troopId) {
    Game.startBattle({ troopId: troopId, background: null, terrainId: 1, allowEscape: true, firstStrike: false }, function (r) {
      window.__lastBattleResult = r;
    });
  },
};
