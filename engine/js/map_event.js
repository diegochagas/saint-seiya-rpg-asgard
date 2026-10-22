/* Map events (pages, triggers, move types) and the player character. */

/* --------------------------------------------------------------------------- */

function GameEvent(map, id, data) {
  Character.call(this);
  this.id = id;
  this.data = data;
  this.name = data.name;
  this.x = data.x; this.y = data.y;
  this.page = null;
  this.pageIndex = -1;
  this.erased = false;
  this.startingPage = false;
  this.interpreter = null;    /* parallel interpreter */
  this.waitingActionKey = false;
  this.mapId = map;
  this.refresh();
}
GameEvent.prototype = Object.create(Character.prototype);
Object.assign(GameEvent.prototype, {
  pages: function () {
    var self = this;
    return Object.keys(this.data.pages).map(function (k) { return parseInt(k, 10); }).sort(function (a, b) { return a - b; }).map(function (k) { return self.data.pages[k]; });
  },
  pageMeetsConditions: function (pg) {
    var c = pg.condition, f = c.flags;
    if (f.switch_a && !GameState.sw(c.switch_a_id)) return false;
    if (f.switch_b && !GameState.sw(c.switch_b_id)) return false;
    if (f.variable && GameState.v(c.variable_id) < c.variable_value) return false;
    if (f.item && !Party.hasItem(c.item_id)) return false;
    if (f.actor && !Party.has(c.actor_id)) return false;
    if (f.timer) return false;
    return true;
  },
  refresh: function () {
    if (this.erased) { this.page = null; return; }
    var pages = this.pages();
    var found = null, idx = -1;
    for (var i = pages.length - 1; i >= 0; i--) {
      if (this.pageMeetsConditions(pages[i])) { found = pages[i]; idx = i; break; }
    }
    if (idx === this.pageIndex) return;
    this.pageIndex = idx;
    this.page = found;
    this.route = null;
    this.interpreter = null;
    if (!found) { this.charName = ''; this.visible = false; return; }
    this.visible = true;
    this.charName = found.character_name;
    this.charIndex = found.character_index;
    this.facing = found.character_direction;
    this.pattern = found.character_pattern;
    this.transparent = found.translucent;
    this.moveSpeed = found.move_speed;
    this.moveFrequency = found.move_frequency;
    this.animType = found.animation_type;
    this.layer = found.layer;
    this.through = false;
    this.facingLocked = false;
    this.animPaused = false;
    this.opacity = 1;
    if (found.move_type === 6 && found.move_route.move_commands.length) {
      this.setRoute(found.move_route.move_commands, found.move_route.repeat, found.move_route.skippable, false);
    }
    if (found.trigger === 4) this.interpreter = new Interpreter(this.id, true);
  },
  isTileEvent: function () { return false; },
  trigger: function () { return this.page ? this.page.trigger : -1; },
  commands: function () { return this.page ? this.page.event_commands : []; },
  update: function () {
    if (!this.page) return;
    Character.prototype.update.call(this);
    if (this.route) return;
    if (this.isStopping() && this.stopCount >= STOP_STEP(this.moveFrequency) && !GameMap.eventsFrozen()) {
      var mt = this.page.move_type;
      if (mt === 1) { this.move(Rand.int(0, 3)); }
      else if (mt === 2) { this.moveTypeCycle(DIR.UP, DIR.DOWN); }
      else if (mt === 3) { this.moveTypeCycle(DIR.LEFT, DIR.RIGHT); }
      else if (mt === 4) { this.turnToward(Player.x, Player.y); this.move(this.facing); }
      else if (mt === 5) { this.turnAway(Player.x, Player.y); this.move(this.facing); }
      if (this.moveFailed) this.stopCount = 0;
    }
  },
  moveTypeCycle: function (a, b) {
    if (this.cycleDir == null) this.cycleDir = a;
    if (!this.move(this.cycleDir)) this.cycleDir = this.cycleDir === a ? b : a;
  },
  onRouteDone: function () {
    if (this.route && this.route.override) {
      this.route = null;
      if (this.page && this.page.move_type === 6) this.setRoute(this.page.move_route.move_commands, this.page.move_route.repeat, this.page.move_route.skippable, false);
    }
  },
  /* returns true when the event should start */
  checkTrigger: function (triggers, playerFacing) {
    if (!this.page || this.erased) return false;
    return triggers.indexOf(this.page.trigger) >= 0;
  },
});

/* --------------------------------------------------------------------------- */

var Player = Object.assign(new Character(), {
  hidden: false,
  encounterRate: 0,
  encounterIdx: 0,
  menuCalling: false,
  encounterCalling: false,
  teleportTarget: null,

  refreshSprite: function () {
    var lead = Party.leader();
    if (!lead) { this.charName = ''; return; }
    this.charName = lead.charName;
    this.charIndex = lead.charIndex;
    this.transparent = lead.transparent;
  },
  visibleOnMap: function () { return !this.hidden && this.visible; },
  updateInput: function () {
    if (this.isMoving() || this.routeActive() || GameMap.eventsFrozen()) return;
    var d = Input.dir4();
    this.moveSpeed = Input.pressed('shift') ? 5 : 4;
    if (d >= 0) {
      this.setFacing(d);
      if (!this.move(d)) {
        this.stopCount = 0;
        GameMap.checkTouchAhead(d);
      }
    }
    if (Input.triggered('ok')) {
      if (!GameMap.checkActionEvent()) { /* nothing */ }
    }
    if (Input.triggered('cancel') && GameState.menuAllowed) this.menuCalling = true;
  },
  onStepDone: function () {
    Party.steps++;
    GameMap.onPlayerStep();
  },
  update: function () {
    Character.prototype.update.call(this);
  },
  /* encounter rate (EasyRPG UpdateEncounterSteps) */
  updateEncounter: function () {
    var steps = GameMap.encounterSteps();
    if (steps <= 0) { this.encounterRate = 0; return; }
    var terrain = DB.terrain(GameMap.terrainAt(this.x, this.y));
    if (!terrain) return;
    this.encounterRate += terrain.encounter_rate;
    var table = [[0, 0.0625], [20, 0.125], [40, 0.25], [60, 0.5], [100, 2.0], [140, 4.0], [160, 8.0], [180, 16.0], [1e9, 16.0]];
    var ratio = this.encounterRate / steps;
    var idx = 0;
    while (ratio >= table[idx + 1][0]) idx++;
    var p = (1 / steps) * table[idx][1] * (terrain.encounter_rate / 100) * 100;
    if (Rand.next() * 100 >= p) return;
    this.encounterRate = 0;
    this.encounterCalling = true;
  },
});

