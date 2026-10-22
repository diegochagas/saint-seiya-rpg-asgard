/* Event command interpreter (RPG Maker 2000/2003 semantics).
   The command bodies live in events/commands_*.js and register themselves in EventCommands:
   each runs with `this` = the Interpreter and returns true (advance), false (retry next frame)
   or 'jumped' (index already moved). */
var EventCommands = {};

/* Codes that only mark structure (branch ends, comments, message continuation lines). */
var NO_OP_CODES = [10, 12410, 22410, 20110, 20141, 22011, 20713, 20722, 20732];
NO_OP_CODES.forEach(function (code) { EventCommands[code] = function () { return true; }; });

var MAX_COMMANDS_PER_FRAME = 1000;
var unsupportedSeen = {};

function warnUnsupported(code) {
  if (unsupportedSeen[code]) return;
  unsupportedSeen[code] = true;
  console.warn('unsupported event command ' + code + ': skipped');
}

/**
 * @param {number} eventId map event id that owns the commands (0 = common event)
 * @param {boolean} parallel true for parallel-process interpreters
 */
function Interpreter(eventId, parallel) {
  this.eventId = eventId;
  this.parallel = parallel;
  this.list = null;
  this.index = 0;
  this.wait = 0;
  this.waiting = null;      /* string tag of what we wait for */
  this.branchResult = {};   /* indent -> choice/battle result */
  this.loopDepth = 0;
  this.callStack = [];
}

/* What each `waiting` tag waits for; true = done waiting. */
var INTERPRETER_WAITS = {
  message: function () { return !MessageWindow.queue; },
  fade: function () { return !Screen.fadeBusy(); },
  tint: function () { return !Screen.tintBusy(); },
  flash: function () { return !Screen.flashBusy(); },
  shake: function () { return !Screen.shakeBusy(); },
  pan: function () { return !GameMap.pan.waiting; },
  teleport: function () { return !Game.teleporting; },
  battle: function () { return !Game.battleRunning; },
  scene: function () { return Game.sceneStackDepth() <= 1 && !Game.transitionBusy(); },
  move: function () { return !GameMap.events.some(function (e) { return e.routeActive(); }) && !Player.routeActive(); },
  anim: function () { return !BattleAnim.busy(); },
  picture: function (it) { return !Pictures.busy(it.waitPicture); },
  keyinput: function (it) { return it.keyInputCheck(); },
  movie: function () { return !MoviePlayer.playing(); },
};

Interpreter.prototype = {
  running: function () { return !!this.list; },
  setup: function (commands, eventId) {
    this.list = commands;
    this.index = 0;
    this.eventId = eventId == null ? this.eventId : eventId;
    this.wait = 0;
    this.waiting = null;
    this.callStack = [];
  },
  end: function () {
    if (this.callStack.length) {
      var f = this.callStack.pop();
      this.list = f.list; this.index = f.index; this.eventId = f.eventId;
      return;
    }
    this.list = null;
  },
  cmd: function () { return this.list ? this.list[this.index] : null; },

  update: function () {
    var guard = 0;
    while (this.list && guard++ < MAX_COMMANDS_PER_FRAME) {
      if (this.wait > 0) { this.wait--; return; }
      if (this.waiting && !this.checkWaiting()) return;
      this.waiting = null;
      if (this.index >= this.list.length) { this.end(); continue; }
      var r = this.execute(this.list[this.index]);
      if (r === false) return;           /* wait, index not advanced or already handled */
      if (r !== 'jumped') this.index++;
    }
  },
  checkWaiting: function () {
    var check = INTERPRETER_WAITS[this.waiting];
    return check ? check(this) : true;
  },
  execute: function (c) {
    var run = EventCommands[c.code];
    if (run) return run.call(this, c);
    warnUnsupported(c.code);   /* skipped like RPG_RT skips codes it does not know */
    return true;
  },

  /* ---- helpers shared by the command files ---- */
  valueOr: function (mode, v) { return mode === 0 ? v : GameState.v(v); },
  actorsFor: function (mode, id) {
    if (mode === 0) return Party.members.slice();
    var a = Party.actor(mode === 1 ? id : GameState.v(id));
    return a ? [a] : [];
  },
  character: function (id) {
    if (id === 10001) return Player;
    if (id >= 10002 && id <= 10004) return null;   /* vehicles: not used */
    var wanted = id === 10005 ? this.eventId : id;
    return GameMap.events.find(function (e) { return e.id === wanted; }) || null;
  },
  skipToIndent: function (codes, indent) {
    for (var i = this.index + 1; i < this.list.length; i++) {
      var c = this.list[i];
      if (c.indent === indent && codes.indexOf(c.code) >= 0) { this.index = i; return true; }
      if (c.indent < indent) break;
    }
    return false;
  },
  /* jump to a handler (e.g. 20140 choice n) of same indent, positioning AFTER it */
  jumpToBranch: function (code, indent, predicate) {
    for (var i = this.index + 1; i < this.list.length; i++) {
      var c = this.list[i];
      if (c.indent < indent) break;
      if (c.indent === indent && c.code === code && (!predicate || predicate(c))) { this.index = i + 1; return true; }
    }
    return false;
  },
  /* run another command list, then come back after the current command */
  callCommands: function (cmds) {
    if (!cmds || !cmds.length) return true;
    this.callStack.push({ list: this.list, index: this.index + 1, eventId: this.eventId });
    this.list = cmds;
    this.index = 0;
    return 'jumped';
  },
  /* start a scene/battle/shop whose callback resumes the list: index points past the command */
  awaitScene: function (tag) {
    this.waiting = tag;
    this.index++;
    return 'jumped';
  },
};
