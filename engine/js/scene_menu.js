/* Main menu (2003: commands from System.menu_commands) and the quit confirmation.
   Sub-screens: scene_menu_item.js, scene_menu_skill.js, scene_menu_equip.js, scene_menu_status.js. */

/* RPG Maker 2003 System.menu_commands ids; 2000 always shows Item, Skill, Equipment, Save. */
var MENU_ITEM = 1, MENU_SKILL = 2, MENU_EQUIP = 3, MENU_SAVE = 4, MENU_STATUS = 5, MENU_QUIT = -1;
var MENU_TERMS = { 1: 'command_item', 2: 'command_skill', 3: 'menu_equipment', 4: 'menu_save', 5: 'status' };
var MENU_ROW_HEIGHT = 48;
/* commands that first pick an actor; scene constructors are looked up late (they load after this file) */
var MENU_NEEDS_ACTOR = { 2: 'SceneSkill', 3: 'SceneEquip', 5: 'SceneStatus' };

function SceneMenu() {
  this.cmd = null; this.gold = null; this.status = null;
}
SceneMenu.prototype = {
  /* Row / Order / Wait (6-8) belong to the 2003 battle options and are left out here */
  commandIds: function () {
    var ids = Loader.is2k3() ? (Loader.db.system.menu_commands || []) : [MENU_ITEM, MENU_SKILL, MENU_EQUIP, MENU_SAVE];
    return ids.filter(function (id) { return MENU_TERMS[id]; }).concat([MENU_QUIT]);
  },
  buildCommands: function () {
    var self = this;
    this.ids = this.commandIds();
    var labels = this.ids.map(function (id) { return Terms.get(id === MENU_QUIT ? 'menu_quit' : MENU_TERMS[id]); });
    this.cmd = new Window_Command(0, 0, 88, labels);
    this.cmd.active = true;
    this.cmd.onOk = function (i) { self.onCommand(self.ids[i]); };
    this.cmd.onCancel = function () { Audio_.sys('cancel'); Game.pop(); };
    this.refreshSaveFlag();
  },
  refreshSaveFlag: function () {
    var saveAt = this.ids.indexOf(MENU_SAVE);
    this.cmd.disabled = {};
    if (saveAt >= 0) this.cmd.disabled[saveAt] = !GameState.saveAllowed;
    this.cmd.dirty = true;
  },
  start: function () {
    var self = this;
    this.buildCommands();
    this.gold = new Window_Base(0, 208, 88, 32);
    this.status = new Window_Selectable(88, 0, 232, 240);
    this.status.rowHeight = MENU_ROW_HEIGHT;
    this.status.itemMax = Party.size();
    this.status.index = -1;
    this.status.onCancel = function () { Audio_.sys('cancel'); self.status.active = false; self.status.index = -1; self.cmd.active = true; };
    this.status.onOk = function (i) { self.onActor(i); };
    this.refresh();
    Input.clear();
  },
  drawMember: function (s, a, y) {
    s.drawActorFace(a, 0, y);
    s.drawActorName(a, 56, y + 2);
    s.drawActorTitle(a, 56 + 88, y + 2);
    s.drawActorLevel(a, 56, y + 18);
    s.drawActorState(a, 56 + 42, y + 18);
    s.drawActorExp(a, 56, y + 34);
    var hpX = 56 + 106 - (Loader.is2k3() ? 12 : 0);   /* 4-digit HP needs the room */
    s.drawActorHp(a, hpX, y + 18);
    s.drawActorSp(a, hpX, y + 34);
  },
  refresh: function () {
    this.gold.clear();
    this.gold.drawGold(0, 0);
    this.status.clear();
    for (var i = 0; i < Party.size(); i++) this.drawMember(this.status, Party.members[i], i * MENU_ROW_HEIGHT);
    this.status.dirty = false; this.gold.dirty = false;
  },
  pickActor: function (id) {
    this.pendingCommand = id;
    this.cmd.active = false;
    this.status.active = true;
    this.status.setIndex(0);
  },
  onCommand: function (id) {
    if (id === MENU_SAVE && !GameState.saveAllowed) { Audio_.sys('buzzer'); return; }
    Audio_.sys('decision');
    if (MENU_NEEDS_ACTOR[id]) { this.pickActor(id); return; }
    if (id === MENU_ITEM) Game.push(new SceneItem());
    else if (id === MENU_SAVE) Game.push(new SceneFile('save'));
    else Game.push(new SceneQuit());
  },
  onActor: function (i) {
    Audio_.sys('decision');
    var SceneForActor = window[MENU_NEEDS_ACTOR[this.pendingCommand]];
    Game.push(new SceneForActor(Party.members[i]));
  },
  resume: function () {
    this.refresh();
    this.refreshSaveFlag();
    if (!this.status.active) this.cmd.active = true;
    Input.clear();
  },
  onLanguageChange: function () { var idx = this.cmd.index; this.start(); this.cmd.index = idx; },
  update: function () { this.cmd.update(); this.status.update(); this.gold.update(); },
  draw: function (ctx) {
    var map = Game.scenes[0];
    if (map && map.draw) map.draw(ctx);
    this.cmd.draw(ctx); this.gold.draw(ctx); this.status.draw(ctx);
  },
};

/* ---- Quit confirmation ---- */
function SceneQuit() {}
SceneQuit.prototype = {
  start: function () {
    var self = this;
    this.help = new Window_Help(0, 72, 320, 32);
    this.help.setText(Terms.get('exit_game_message'));
    this.cmd = new Window_Command(120, 104, 80, [Terms.get('yes'), Terms.get('no')]);
    this.cmd.index = 1;
    this.cmd.active = true;
    this.cmd.onOk = function (i) { if (i === 0) { Audio_.sys('decision'); Game.toTitle(); } else { Audio_.sys('cancel'); Game.pop(); } };
    this.cmd.onCancel = function () { Audio_.sys('cancel'); Game.pop(); };
  },
  update: function () { this.help.update(); this.cmd.update(); },
  draw: function (ctx) {
    var under = Game.scenes[Game.scenes.length - 2];
    if (under) under.draw(ctx);
    this.help.draw(ctx); this.cmd.draw(ctx);
  },
};

