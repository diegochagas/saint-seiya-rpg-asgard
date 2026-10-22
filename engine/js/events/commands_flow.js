/* Switches, variables, branches, labels, loops and event calls. */
var BRANCH_ELSE = 22010, BRANCH_END = 22011, LABEL = 12110, LOOP_START = 12210, LOOP_END = 22210;

Object.assign(Interpreter.prototype, {
  /* switch/variable range from the (mode, a, b) triple: single, range, or "id in variable" */
  targetRange: function (mode, a, b) {
    if (mode === 1) return [a, b];
    if (mode === 2) { var id = GameState.v(a); return [id, id]; }
    return [a, a];
  },
});

EventCommands[10210] = function (c) { /* ControlSwitches */
  var p = c.params, r = this.targetRange(p[0], p[1], p[2]);
  for (var i = r[0]; i <= r[1]; i++) GameState.setSw(i, p[3] === 2 ? !GameState.sw(i) : p[3] === 0);
  GameMap.refreshEvents();
  return true;
};

EventCommands[10220] = function (c) { /* ControlVariables */
  var p = c.params, r = this.targetRange(p[0], p[1], p[2]);
  var value = VariableOperands.value(this, p);
  for (var i = r[0]; i <= r[1]; i++) GameState.setV(i, VariableOperands.apply(p[3], GameState.v(i), value));
  GameMap.refreshEvents();
  return true;
};

EventCommands[10230] = function () { return true; }; /* timer: unused by the converted games */

EventCommands[12010] = function (c) { /* ConditionalBranch */
  if (EventConditions.check(this, c)) return true;
  if (!this.skipToIndent([BRANCH_ELSE, BRANCH_END], c.indent)) this.index = this.list.length;
  return true;
};
EventCommands[BRANCH_ELSE] = function (c) { this.skipToIndent([BRANCH_END], c.indent); return true; };

EventCommands[LABEL] = function () { return true; };
EventCommands[12120] = function (c) { /* JumpToLabel */
  for (var i = 0; i < this.list.length; i++) {
    if (this.list[i].code === LABEL && this.list[i].params[0] === c.params[0]) { this.index = i; return 'jumped'; }
  }
  return true;
};

EventCommands[LOOP_START] = function () { return true; };
/* BreakLoop: jump to the end of the innermost loop around it (its end sits at a lower indent) */
EventCommands[12220] = function (c) {
  for (var i = this.index + 1; i < this.list.length; i++) {
    if (this.list[i].code === LOOP_END && this.list[i].indent < c.indent) { this.index = i; return true; }
  }
  this.index = this.list.length;
  return 'jumped';
};
EventCommands[LOOP_END] = function (c) {
  for (var i = this.index - 1; i >= 0; i--) {
    if (this.list[i].code === LOOP_START && this.list[i].indent === c.indent) { this.index = i + 1; return 'jumped'; }
  }
  return true;
};

EventCommands[12310] = function () { this.list = null; return false; }; /* EndEventProcessing */
EventCommands[12320] = function () { /* EraseEvent */
  var me = this.character(10005);
  if (me) { me.erased = true; me.refresh(); }
  this.list = null;
  return false;
};

EventCommands[12330] = function (c) { /* CallEvent: common event, or a page of a map event */
  var p = c.params;
  if (p[0] === 0) {
    var ce = Loader.db.commonevents[p[1]];
    return this.callCommands(ce ? ce.event_commands : null);
  }
  var ev = this.character(p[0] === 1 ? p[1] : GameState.v(p[1]));
  var page = ev ? ev.data.pages[p[0] === 1 ? p[2] : GameState.v(p[2])] : null;
  return this.callCommands(page ? page.event_commands : null);
};
EventCommands[1005] = function (c) { /* CallCommonEvent (2k3 battle list form) */
  var ce = Loader.db.commonevents[c.params[0]];
  return this.callCommands(ce ? ce.event_commands : null);
};
