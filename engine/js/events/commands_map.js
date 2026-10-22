/* Teleports, character positions, screen effects, pictures, map animations and move routes. */
var DECISION_TURN_FRAMES = 6;   /* RPG Maker waits are in tenths of a second: 6 frames each */

Object.assign(Interpreter.prototype, {
  /* Teleport / Erase / Show Screen must not run while a message is still on screen */
  blockedByMessage: function () { return !!MessageWindow.queue; },
});

EventCommands[10810] = function (c) { /* Teleport */
  if (this.blockedByMessage()) return false;
  var p = c.params;
  this.waiting = 'teleport';
  Game.teleport(p[0], p[1], p[2], p.length > 3 ? p[3] - 1 : -1);
  return true;
};
EventCommands[10820] = function (c) { /* MemorizeLocation */
  GameState.setV(c.params[0], GameMap.id); GameState.setV(c.params[1], Player.x); GameState.setV(c.params[2], Player.y);
  return true;
};
EventCommands[10830] = function (c) { /* RecallToLocation */
  var p = c.params;
  this.waiting = 'teleport';
  Game.teleport(GameState.v(p[0]), GameState.v(p[1]), GameState.v(p[2]), -1);
  return true;
};
EventCommands[10860] = function (c) { /* SetEventLocation */
  var p = c.params, ev = this.character(p[0]);
  if (!ev) return true;
  ev.x = this.valueOr(p[1], p[2]); ev.y = this.valueOr(p[1], p[3]); ev.remainingStep = 0;
  if (p.length > 4 && p[4] > 0) ev.forceFacing(p[4] - 1);
  return true;
};
EventCommands[10870] = function (c) { /* SwapEventLocations */
  var e1 = this.character(c.params[0]), e2 = this.character(c.params[1]);
  if (!e1 || !e2) return true;
  var tx = e1.x, ty = e1.y;
  e1.x = e2.x; e1.y = e2.y; e2.x = tx; e2.y = ty;
  return true;
};
EventCommands[10910] = function (c) { /* GetTerrainID */
  var p = c.params;
  GameState.setV(p[3], GameMap.terrainAt(this.valueOr(p[0], p[1]), this.valueOr(p[0], p[2])));
  return true;
};
EventCommands[10920] = function (c) { /* GetEventID */
  var p = c.params, evs = GameMap.eventsAt(this.valueOr(p[0], p[1]), this.valueOr(p[0], p[2]));
  GameState.setV(p[3], evs.length ? evs[evs.length - 1].id : 0);
  return true;
};

/* p[0] = transition type; 20 means "instant" in RPG Maker's list */
EventCommands[11010] = function (c) { /* EraseScreen */
  if (this.blockedByMessage()) return false;
  Screen.fadeOut(c.params[0] === 20 ? 1 : 20); Screen.erased = true; this.waiting = 'fade';
  return true;
};
EventCommands[11020] = function (c) { /* ShowScreen */
  if (this.blockedByMessage()) return false;
  Screen.fadeIn(c.params[0] === 20 ? 1 : 20); Screen.erased = false; this.waiting = 'fade';
  return true;
};
EventCommands[11030] = function (c) { var p = c.params; Screen.setTint(p[0], p[1], p[2], p[3], p[4]); if (p[5]) this.waiting = 'tint'; return true; };
EventCommands[11040] = function (c) { var p = c.params; Screen.setFlash(p[0], p[1], p[2], p[3], p[4]); if (p[5]) this.waiting = 'flash'; return true; };
EventCommands[11050] = function (c) { var p = c.params; Screen.setShake(p[0], p[1], p[2]); if (p[3]) this.waiting = 'shake'; return true; };
EventCommands[11060] = function (c) { /* PanScreen */
  var p = c.params;
  GameMap.panScreen(p[0], p[1], p[2], p[3], p[4]);
  if (p[4] && (p[0] === 2 || p[0] === 3)) this.waiting = 'pan';
  return true;
};
EventCommands[11070] = function (c) { Screen.setWeather(c.params[0], c.params[1]); return true; };

EventCommands[11110] = function (c) { /* ShowPicture */
  var p = c.params;
  Pictures.show(p[0], { name: c.string, x: this.valueOr(p[1], p[2]), y: this.valueOr(p[1], p[3]), fixed: p[4] > 0, mag: p[5],
    trans: p[6], r: p[8], g: p[9], b: p[10], s: p[11], effect: p[12], power: p[13] });
  return true;
};
EventCommands[11120] = function (c) { /* MovePicture */
  var p = c.params;
  Pictures.move(p[0], { x: this.valueOr(p[1], p[2]), y: this.valueOr(p[1], p[3]), mag: p[5], trans: p[6], effect: p[12], power: p[13] },
    p[14] * DECISION_TURN_FRAMES);
  if (p[15]) { this.waiting = 'picture'; this.waitPicture = p[0]; }
  return true;
};
EventCommands[11130] = function (c) { Pictures.erase(c.params[0]); return true; };

EventCommands[11210] = function (c) { /* ShowBattleAnimation on the map */
  var p = c.params;
  BattleAnim.playOnMap(p[0], this.character(p[1]), !!p[3]);
  if (p[2]) this.waiting = 'anim';
  return true;
};
EventCommands[11310] = function (c) { Player.hidden = c.params[0] === 0; return true; };
EventCommands[11320] = function (c) { /* FlashSprite */
  var p = c.params, ch = this.character(p[0]);
  var frames = Math.max(1, p[5] * DECISION_TURN_FRAMES);
  if (ch) ch.flash = { r: p[1], g: p[2], b: p[3], power: p[4], frames: frames, t: 0 };
  if (p[6]) this.wait = p[5] * DECISION_TURN_FRAMES;
  return true;
};
EventCommands[11330] = function (c) { /* MoveEvent: route decoded by tools/rmconv/routes.py */
  var p = c.params, mv = this.character(p[0]);
  if (!mv) return true;
  mv.setRoute(c.route || [], p[2] !== 0, p[3] !== 0, true);
  if (p[1]) mv.moveFrequency = p[1];
  return true;
};
EventCommands[11340] = function () { this.waiting = 'move'; return true; };
EventCommands[11350] = function () { /* StopAllMovement */
  GameMap.events.forEach(function (e) { if (e.route && e.route.override) e.onRouteDone(); });
  Player.route = null;
  return true;
};
EventCommands[11410] = function (c) { this.wait = c.params[0] * DECISION_TURN_FRAMES; return true; };
EventCommands[11710] = function (c) { GameMap.setChipset(c.params[0]); return true; };
EventCommands[11720] = function (c) {
  var p = c.params;
  GameMap.setParallax(c.string, p[0] !== 0, p[1] !== 0, p[2] !== 0, p[3], p[4] !== 0, p[5]);
  return true;
};
EventCommands[11740] = function (c) { GameMap.encounterStepsOverride = c.params[0]; return true; };
