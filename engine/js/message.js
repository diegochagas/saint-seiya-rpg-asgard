/* The RPG Maker 2000 message window: 4 lines of text with control codes, face graphics,
   choices and number input. Driven by the interpreter through MessageWindow.show(). */

var MessageWindow = {
  /* RPG Maker 2003: BattleCommands.transparency also makes map messages translucent (160/255),
     except inside a battle using the traditional layout (EasyRPG window_message.cpp) */
  backOpacity: function () {
    var bc = Loader.is2k3() && Loader.db.battlecommands;
    if (!bc || bc.transparency !== 1) return 1;
    return Game.battleScene && bc.battle_type === 0 ? 1 : 160 / 255;
  },
  win: null,
  goldWin: null,
  queue: null,            /* current request */
  lines: [],              /* parsed lines: array of tokens */
  lineIndex: 0, charIndex: 0,
  waitFrames: 0,
  waitKey: false,
  autoClose: false,
  closing: false,
  color: 0,
  speed: 1,
  instant: false,
  choices: null,          /* {items, cancel, index, startLine} */
  numberInput: null,      /* {digits, value, pos, line} */
  showGold: false,
  finished: false,
  result: null,
  keepOpen: false,
  drawnCount: 0,
  faceLeftWidth: 0,
  frame: 0,

  init: function () {
    this.win = new Window_Base(0, 160, 320, 80);
    this.win.visible = false;
    this.goldWin = new Window_Base(320 - 88, 0, 88, 32);
    this.goldWin.visible = false;
  },

  busy: function () { return !!this.queue || this.win.visible && this.win.opening !== 0; },
  isOpenNow: function () { return this.win.visible; },

  /* request: {lines:[..], choices:[..]|null, choiceCancel:n, number:{digits,var}|null, keepOpen:bool}
     onDone(result) with result {choice, number} */
  show: function (req, onDone) {
    this.queue = req;
    this.onDone = onDone;
    this.finished = false;
    this.result = {};
    var m = GameState.message;
    var pos = m.position;
    if (!m.fixed && Player.visibleOnMap && Player.visibleOnMap()) {
      var py = Player.screenY() - GameMap.oy;
      if (pos === 2 && py >= 160 - 32) pos = 0;
      else if (pos === 0 && py < 80) pos = 2;
      else if (pos === 1 && py >= 80 - 32 && py < 160) pos = 0;
    }
    this.win.y = pos * 80;
    this.win.backOpacity = m.transparent ? 0 : MessageWindow.backOpacity();
    this.win.noFrame = m.transparent;
    this.lines = req.lines.map(this.parseLine, this);
    this.choices = null;
    this.numberInput = null;
    if (req.choices) {
      var start = this.lines.length;
      if (start + req.choices.length > 4) { this.lines = []; start = 0; }
      req.choices.forEach(function (c) { this.lines.push(this.parseLine(c)); }, this);
      this.choices = { items: req.choices, cancel: req.choiceCancel, index: 0, startLine: start, active: false };
    }
    if (req.number) {
      var nl = this.lines.length;
      if (nl >= 4) { this.lines = []; nl = 0; }
      this.numberInput = { digits: req.number.digits, value: 0, pos: 0, line: nl, active: false };
      this.lines.push([]);
    }
    this.lineIndex = 0; this.charIndex = 0; this.waitFrames = 0; this.waitKey = false;
    this.autoClose = false; this.color = 0; this.speed = 1; this.instant = false;
    this.showGold = false;
    this.win.clear();
    this.win.pause = false;
    this.faceLeftWidth = 0;
    this.drawFace();
    /* cancel any close animation still in progress from the previous message */
    this.win.opening = 0;
    this.win.visible = true;
    if (this.win.openness < 1) this.win.open();
    this.idleFrames = 0;
    this.keepOpen = !!req.keepOpen;
  },

  drawFace: function () {
    var m = GameState.message;
    if (!m.face) return;
    var img = Loader.image('faceset', m.face);
    if (!img) return;
    var i = m.faceIndex;
    var sx = (i % 4) * 48, sy = Math.floor(i / 4) * 48;
    var ctx = this.win.cctx;
    var x = m.faceRight ? this.win.cw() - 48 : 0;
    ctx.save();
    if (m.faceFlip) { ctx.translate(x + 48, 8); ctx.scale(-1, 1); ctx.drawImage(img, sx, sy, 48, 48, 0, 0, 48, 48); }
    else ctx.drawImage(img, sx, sy, 48, 48, x, 8, 48, 48);
    ctx.restore();
    if (!m.faceRight) this.faceLeftWidth = 56;
  },

  /* parse control codes into tokens: {ch} | {cmd, arg} */
  parseLine: function (text) {
    var out = [], i = 0, s = String(text);
    while (i < s.length) {
      var c = s[i];
      if (c === '\\' && i + 1 < s.length) {
        var n = s[i + 1].toLowerCase();
        var arg = null, j = i + 2;
        if ((n === 'c' || n === 's' || n === 'n' || n === 'v') && s[j] === '[') {
          var end = s.indexOf(']', j);
          if (end > j) { arg = s.substring(j + 1, end); j = end + 1; }
        }
        if (n === '\\') { out.push({ ch: '\\' }); i += 2; continue; }
        if (n === 'n' && arg != null) {
          var id = this.evalArg(arg);
          var a = id === 0 ? Party.leader() : Party.actor(id);
          var name = a ? a.name : '';
          for (var k = 0; k < name.length; k++) out.push({ ch: name[k] });
          i = j; continue;
        }
        if (n === 'v' && arg != null) {
          var val = String(GameState.v(this.evalArg(arg)));
          for (var k2 = 0; k2 < val.length; k2++) out.push({ ch: val[k2] });
          i = j; continue;
        }
        out.push({ cmd: n, arg: arg != null ? this.evalArg(arg) : null });
        i = j;
        continue;
      }
      out.push({ ch: c });
      i++;
    }
    return out;
  },
  evalArg: function (arg) {
    var s = String(arg);
    if (s.indexOf('\\v') === 0 || s.indexOf('\\V') === 0) {
      var m = /\[(\d+)\]/.exec(s);
      return m ? GameState.v(parseInt(m[1], 10)) : 0;
    }
    return parseInt(s, 10) || 0;
  },

  textX: function () { return this.faceLeftWidth; },
  lineY: function (i) { return i * 16; },

  update: function () {
    this.frame++;
    this.win.update();
    this.goldWin.update();
    if (!this.queue) {
      /* keepOpen bridges consecutive messages of one event; if nothing follows within 2 frames, close */
      this.idleFrames = (this.idleFrames || 0) + 1;
      if (this.win.visible && this.win.opening === 0 && (!this.keepOpen || this.idleFrames > 2)) { this.keepOpen = false; this.win.close(); }
      return;
    }
    this.idleFrames = 0;
    if (this.win.openness < 1) return;
    if (this.showGold && !this.goldWin.visible) { this.refreshGold(); this.goldWin.visible = true; }
    if (this.finished) return;
    if (this.choices && this.choices.active) { this.updateChoice(); return; }
    if (this.numberInput && this.numberInput.active) { this.updateNumber(); return; }
    if (this.waitKey) {
      if (Input.triggered('ok') || Input.triggered('cancel')) { Input.consume('ok'); Input.consume('cancel'); this.waitKey = false; this.win.pause = false; }
      return;
    }
    if (this.waitFrames > 0) { this.waitFrames--; return; }
    var budget = this.instant ? 1000 : 1;
    if (Input.pressed('ok') || Input.pressed('cancel')) budget = 4;
    while (budget-- > 0) {
      if (!this.step()) break;
    }
  },

  /* draw one token; returns false when the message is complete or paused */
  step: function () {
    if (this.lineIndex >= this.lines.length) { this.endText(); return false; }
    var line = this.lines[this.lineIndex];
    if (this.choices && this.lineIndex === this.choices.startLine && this.charIndex === 0 && !this.choices.drawn) {
      /* choices are drawn all at once */
      for (var ci = 0; ci < this.choices.items.length; ci++) this.drawLineInstant(this.choices.startLine + ci);
      this.choices.drawn = true;
      this.lineIndex = this.lines.length;
      this.endText();
      return false;
    }
    if (this.numberInput && this.lineIndex === this.numberInput.line) { this.lineIndex = this.lines.length; this.endText(); return false; }
    if (this.charIndex >= line.length) { this.lineIndex++; this.charIndex = 0; return true; }
    var tok = line[this.charIndex++];
    if (tok.ch != null) {
      var x = this.textX() + this.drawnX(line, this.charIndex - 1);
      Font.draw(this.win.cctx, tok.ch, x, this.lineY(this.lineIndex), this.color);
      if (this.speed > 1 && !this.instant) this.waitFrames = this.speed - 1;
      return !(this.waitFrames > 0);
    }
    switch (tok.cmd) {
      case 'c': this.color = tok.arg || 0; break;
      case 's': this.speed = Math.max(1, tok.arg || 1); break;
      case '$': this.showGold = true; break;
      case '!': this.waitKey = true; this.win.pause = true; return false;
      case '^': this.autoClose = true; break;
      case '_': break;
      case '.': this.waitFrames = 15; return false;
      case '|': this.waitFrames = 60; return false;
      case '>': this.instant = true; break;
      case '<': this.instant = false; break;
    }
    return true;
  },
  /* x offset of token index within line (control codes take no space, \_ takes half) */
  drawnX: function (line, idx) {
    var x = 0;
    for (var i = 0; i < idx; i++) {
      var t = line[i];
      if (t.ch != null) x += 6;
      else if (t.cmd === '_') x += 3;
    }
    return x;
  },
  drawLineInstant: function (li) {
    var line = this.lines[li];
    if (!line) return;
    var color = this.color;
    for (var i = 0; i < line.length; i++) {
      var t = line[i];
      if (t.ch != null) Font.draw(this.win.cctx, t.ch, this.textX() + this.drawnX(line, i), this.lineY(li), color);
      else if (t.cmd === 'c') color = t.arg || 0;
    }
  },

  endText: function () {
    if (this.choices) {
      this.choices.active = true;
      this.win.pause = false;
      return;
    }
    if (this.numberInput) {
      this.numberInput.active = true;
      this.drawNumber();
      return;
    }
    if (this.autoClose) { this.finish(); return; }
    this.win.pause = true;
    this.finished = true;
  },

  updateChoice: function () {
    var c = this.choices;
    if (Input.repeated('down')) { c.index = (c.index + 1) % c.items.length; Audio_.sys('cursor'); }
    else if (Input.repeated('up')) { c.index = (c.index + c.items.length - 1) % c.items.length; Audio_.sys('cursor'); }
    else if (Input.triggered('ok')) { Input.consume('ok'); Audio_.sys('decision'); this.result.choice = c.index; this.finish(); }
    else if (Input.triggered('cancel') && c.cancel > 0) {
      Input.consume('cancel');
      Audio_.sys('cancel');
      this.result.choice = c.cancel === 5 ? 4 : c.cancel - 1;
      this.finish();
    }
  },
  updateNumber: function () {
    var n = this.numberInput;
    var p = Math.pow(10, n.digits - 1 - n.pos);
    var digit = Math.floor(n.value / p) % 10;
    if (Input.repeated('up')) { n.value += ((digit + 1) % 10 - digit) * p; Audio_.sys('cursor'); this.drawNumber(); }
    else if (Input.repeated('down')) { n.value += ((digit + 9) % 10 - digit) * p; Audio_.sys('cursor'); this.drawNumber(); }
    else if (Input.repeated('right')) { n.pos = Math.min(n.digits - 1, n.pos + 1); Audio_.sys('cursor'); }
    else if (Input.repeated('left')) { n.pos = Math.max(0, n.pos - 1); Audio_.sys('cursor'); }
    else if (Input.triggered('ok')) { Input.consume('ok'); Audio_.sys('decision'); this.result.number = n.value; this.finish(); }
  },
  drawNumber: function () {
    var n = this.numberInput;
    var ctx = this.win.cctx;
    ctx.clearRect(this.textX(), this.lineY(n.line), 200, 16);
    var s = String(n.value);
    while (s.length < n.digits) s = '0' + s;
    Font.draw(ctx, s, this.textX() + 12, this.lineY(n.line), 0);
  },

  finish: function () {
    this.finished = true;
    this.win.pause = false;
    var cb = this.onDone, res = this.result;
    this.queue = null;
    this.goldWin.visible = false;
    if (!this.keepOpen) this.win.close();
    if (cb) cb(res);
  },
  /* called by interpreter each frame while waiting: advance on key when finished */
  waitingForKey: function () { return this.finished && !this.choices && !this.numberInput; },
  pollClose: function () {
    if (this.finished && this.queue && !(this.choices && this.choices.active) && !(this.numberInput && this.numberInput.active)) {
      if (Input.triggered('ok') || Input.triggered('cancel')) { Input.consume('ok'); Input.consume('cancel'); this.finish(); return true; }
    }
    return false;
  },

  refreshGold: function () {
    var w = this.goldWin;
    w.y = this.win.y === 0 ? 240 - 32 : 0;
    w.clear();
    var gold = Terms.get('gold');
    w.text(gold, w.cw(), 0, 1, { align: 'right' });
    w.text(String(Party.gold), w.cw() - Font.width(gold), 0, 0, { align: 'right' });
  },

  draw: function (ctx) {
    var self = this;
    this.win.drawUnderContents = function (c2) { self.drawCursor(c2); };
    this.win.draw(ctx);
    this.goldWin.draw(ctx);
  },
  drawCursor: function (ctx) {
    if (this.queue && this.choices && this.choices.active && this.win.openness >= 1) {
      var c = this.choices;
      var y = this.win.y + 8 + this.lineY(c.startLine + c.index);
      var w = Math.max(16, Font.width(c.items[c.index]) + 8);
      Gfx.drawCursor(ctx, this.win.x + 8 + this.textX() - 4, y, w, 16, false);
    }
    if (this.queue && this.numberInput && this.numberInput.active && this.win.openness >= 1) {
      var n = this.numberInput;
      Gfx.drawCursor(ctx, this.win.x + 8 + this.textX() + 12 + n.pos * 6 - 4, this.win.y + 8 + this.lineY(n.line), 14, 16, false);
    }
  },
};
