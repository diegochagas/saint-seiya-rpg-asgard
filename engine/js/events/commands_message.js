/* Message, choice and number-input commands (10110-10150) plus level-up message queues. */
var SHOW_MESSAGE = 10110, MESSAGE_LINE = 20110, SHOW_CHOICE = 10140, INPUT_NUMBER = 10150;
var CHOICE_CASE = 20140, CHOICE_END = 20141;
var MESSAGE_MAX_LINES = 4;

Object.assign(Interpreter.prototype, {
  /* collect a message: following ShowMessage_2 lines, then optional choice/number */
  collectMessage: function () {
    var lines = [this.cmd().string];
    var i = this.index + 1;
    while (i < this.list.length && this.list[i].code === MESSAGE_LINE) { lines.push(this.list[i].string); i++; }
    var req = { lines: lines, choices: null, number: null };
    var next = this.list[i];
    if (next && next.code === SHOW_CHOICE) {
      req.choices = next.string.split('/');
      req.choiceCancel = next.params[0];
      req.choiceIndent = next.indent;
      req.choiceAt = i++;
    } else if (next && next.code === INPUT_NUMBER) {
      req.number = { digits: next.params[0], variable: next.params[1] };
      i++;
    }
    /* keep the window open if another message follows immediately */
    req.keepOpen = i < this.list.length && this.list[i].code === SHOW_MESSAGE && !req.choices && !req.number;
    req.nextIndex = i;
    return req;
  },
  /* after a choice: continue inside the matching "[choice n]" branch, or after the choice block */
  jumpToChoice: function (at, indent, choice) {
    this.index = at;
    if (this.jumpToBranch(CHOICE_CASE, indent, function (cc) { return cc.params[0] === choice; })) return;
    this.index = at;
    this.skipToIndent([CHOICE_END], indent);
    this.index++;
  },
  /* show up to 4 lines per window; the rest follow in further windows */
  queueMessages: function (msgs) {
    if (MessageWindow.queue) return false;
    var self = this;
    var rest = msgs.slice(MESSAGE_MAX_LINES);
    this.waiting = 'message';
    MessageWindow.show({ lines: msgs.slice(0, MESSAGE_MAX_LINES) }, function () {
      if (rest.length) self.pendingMessages = rest;
    });
    return true;
  },
});

/* Drains level-up lines left by queueMessages before the next command runs. */
INTERPRETER_WAITS.message = function (it) {
  if (MessageWindow.queue) return false;
  if (!it.pendingMessages) return true;
  var rest = it.pendingMessages;
  it.pendingMessages = null;
  it.queueMessages(rest);
  return false;
};

EventCommands[SHOW_MESSAGE] = function () {
  if (MessageWindow.queue) return false;
  var self = this, req = this.collectMessage();
  var numberVar = req.number ? req.number.variable : null;
  this.index = req.nextIndex;
  this.waiting = 'message';
  MessageWindow.show(req, function (res) {
    if (res.choice != null) self.jumpToChoice(req.choiceAt, req.choiceIndent, res.choice);
    if (numberVar != null && res.number != null) GameState.setV(numberVar, res.number);
  });
  return 'jumped';
};

EventCommands[10120] = function (c) { /* MessageOptions */
  var p = c.params, m = GameState.message;
  m.transparent = p[0] !== 0; m.position = p[1]; m.fixed = p[2] === 0; m.continueEvents = p[3] !== 0;
  return true;
};

EventCommands[10130] = function (c) { /* ChangeFaceGraphic */
  var p = c.params, m = GameState.message;
  m.face = c.string; m.faceIndex = p[0]; m.faceRight = p[1] !== 0; m.faceFlip = p[2] !== 0;
  return true;
};

EventCommands[SHOW_CHOICE] = function (c) { /* ShowChoice without preceding message */
  if (MessageWindow.queue) return false;
  var self = this, at = this.index;
  this.waiting = 'message';
  this.index++;
  MessageWindow.show({ lines: [], choices: c.string.split('/'), choiceCancel: c.params[0] }, function (res) {
    self.jumpToChoice(at, c.indent, res.choice);
  });
  return 'jumped';
};

/* reached the start of another choice branch: skip to end */
EventCommands[CHOICE_CASE] = function (c) { this.skipToIndent([CHOICE_END], c.indent); return true; };

EventCommands[INPUT_NUMBER] = function (c) {
  if (MessageWindow.queue) return false;
  var v = c.params[1];
  this.waiting = 'message';
  MessageWindow.show({ lines: [], number: { digits: c.params[0] } }, function (res) {
    if (res.number != null) GameState.setV(v, res.number);
  });
  return true;
};
