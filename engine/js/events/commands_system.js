/* System music/sounds/graphics, audio, movie, key input and menu/save access. */
var SYSTEM_MUSIC_KEYS = ['title_music', 'battle_music', 'battle_end_music', 'inn_music', 'boat_music', 'ship_music',
  'airship_music', 'gameover_music'];
var SYSTEM_SE_KEYS = ['cursor_se', 'decision_se', 'cancel_se', 'buzzer_se', 'battle_se', 'escape_se', 'enemy_attack_se',
  'enemy_damaged_se', 'actor_damaged_se', 'dodge_se', 'enemy_death_se', 'item_se'];
var KEY_INPUT_CODES = { down: 1, left: 2, right: 3, up: 4, ok: 5, cancel: 6 };

Object.assign(Interpreter.prototype, {
  keyInput: function (c) {
    var p = c.params;
    this.keyInputVar = p[0];
    this.keyInputWait = p[1] !== 0;
    this.keyInputDirs = p.length < 6 || p[2] !== 0;
    this.keyInputOk = p.length > 3 ? p[3] !== 0 : true;
    this.keyInputCancel = p.length > 4 ? p[4] !== 0 : true;
    if (this.keyInputWait) { this.waiting = 'keyinput'; return true; }
    this.keyInputCheck();
    return true;
  },
  pressedDirection: function () {
    var dirs = ['down', 'left', 'right', 'up'];
    for (var i = 0; i < dirs.length; i++) if (Input.pressed(dirs[i])) return KEY_INPUT_CODES[dirs[i]];
    return 0;
  },
  keyInputCheck: function () {
    var v = this.keyInputDirs ? this.pressedDirection() : 0;
    if (this.keyInputOk && Input.triggered('ok')) v = KEY_INPUT_CODES.ok;
    if (this.keyInputCancel && Input.triggered('cancel')) v = KEY_INPUT_CODES.cancel;
    if (!v && this.keyInputWait) return false;
    GameState.setV(this.keyInputVar, v);
    return true;
  },
  /* Save / menu / load scenes resume the list when they close */
  openScene: function (open) {
    if (this.blockedByMessage()) return false;
    open();
    return this.awaitScene('scene');
  },
});

EventCommands[10660] = function (c) { /* ChangeSystemBGM */
  var p = c.params;
  GameState.system[SYSTEM_MUSIC_KEYS[p[0]]] = { name: c.string, fadein: p[1], volume: p[2], tempo: p[3], balance: p[4] };
  return true;
};
EventCommands[10670] = function (c) { /* ChangeSystemSFX */
  var p = c.params;
  GameState.system[SYSTEM_SE_KEYS[p[0]]] = { name: c.string, volume: p[1], tempo: p[2], balance: p[3] };
  return true;
};
EventCommands[10680] = function (c) { GameState.system.system_name = c.string; Gfx.setSystem(c.string); return true; };
EventCommands[10690] = function (c) { /* ChangeScreenTransitions: kept for a later look, fades are used */
  GameState.transitions[c.params[0]] = c.params[1];
  return true;
};

EventCommands[11510] = function (c) {
  var p = c.params;
  Audio_.playBgm({ name: c.string, fadein: p[0], volume: p[1], tempo: p[2], balance: p[3] });
  return true;
};
EventCommands[11520] = function (c) { Audio_.fadeOutBgm(c.params[0]); return true; };
EventCommands[11530] = function () { Audio_.memorizeBgm(); return true; };
EventCommands[11540] = function () { Audio_.playMemorizedBgm(); return true; };
EventCommands[11550] = function (c) {
  var p = c.params;
  Audio_.playSe({ name: c.string, volume: p[0], tempo: p[1], balance: p[2] });
  return true;
};
EventCommands[11560] = function (c) { /* PlayMovie: [x mode, x, y, width, height] */
  if (!MoviePlayer.play(c.string)) return true;
  this.waiting = 'movie';
  return true;
};
EventCommands[11610] = function (c) { return this.keyInput(c); };

EventCommands[11750] = function () { return true; };                  /* ChangeEncounterRate: map value is used */
EventCommands[11810] = EventCommands[11820] = EventCommands[11830] = function () { return true; }; /* tileset swaps: unused */
EventCommands[11840] = function (c) { GameState.escapeAllowed = c.params[0] !== 0; return true; };
EventCommands[11930] = function (c) { GameState.saveAllowed = c.params[0] !== 0; return true; };
EventCommands[11960] = function (c) { GameState.menuAllowed = c.params[0] !== 0; return true; };
EventCommands[11910] = function () { return this.openScene(function () { Game.openSave(); }); };
EventCommands[11950] = function () { return this.openScene(function () { Game.openMenu(); }); };
EventCommands[5001] = function () { return this.openScene(function () { Game.openLoad(); }); };   /* 2k3 OpenLoadMenu */

EventCommands[12420] = function () { Game.gameOver(); this.list = null; return false; };
EventCommands[12510] = function () { Game.toTitle(); this.list = null; return false; };
EventCommands[5002] = function () { Game.toTitle(); this.list = null; return false; };          /* 2k3 ExitGame */
