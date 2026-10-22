/* Battle encounters, shops and inns: each opens a scene and resumes in the matching branch. */
var VICTORY_CASE = 20710, ESCAPE_CASE = 20711, DEFEAT_CASE = 20712, ENCOUNTER_END = 20713;
var SHOP_BOUGHT_CASE = 20720, SHOP_NOTHING_CASE = 20721, SHOP_END = 20722;
var INN_STAY_CASE = 20730, INN_LEAVE_CASE = 20731, INN_END = 20732;
var ESCAPE_ENDS_EVENT = 1, ESCAPE_HAS_BRANCH = 2, DEFEAT_GAME_OVER = 0, DEFEAT_HAS_BRANCH = 1;

Object.assign(Interpreter.prototype, {
  /* resume after a scene: index was moved past the command, step back and jump into a branch */
  resumeInBranch: function (code, indent, useBranches) {
    this.index--;
    if (!useBranches || !this.jumpToBranch(code, indent)) this.index++;
  },
  encounterArgs: function (c) {
    var p = c.params;
    return {
      troopId: this.valueOr(p[0], p[1]),
      background: p[2] === 1 ? c.string : null,
      terrainId: p[2] === 2 ? p[8] || 0 : 0,
      allowEscape: p[3] !== 0,
      firstStrike: !!p[5],
      defeatMode: p[4],
      condition: p.length > 6 ? p[6] : 0,   /* 2003: normal / initiative / back / surround / pincers */
    };
  },
  onBattleEnd: function (c, result) {
    var escapeMode = c.params[3], defeatMode = c.params[4];
    if (result === 'abort') return;   /* TerminateBattle: the branch markers that follow are skipped */
    if (result === 'escape' && escapeMode === ESCAPE_ENDS_EVENT) { this.list = null; return; }
    if (result === 'defeat' && defeatMode === DEFEAT_GAME_OVER) { Game.gameOver(); this.list = null; return; }
    var code = { victory: VICTORY_CASE, escape: ESCAPE_CASE, defeat: DEFEAT_CASE }[result];
    /* branches exist only when escape or defeat has its own handler */
    this.resumeInBranch(code, c.indent, escapeMode === ESCAPE_HAS_BRANCH || defeatMode === DEFEAT_HAS_BRANCH);
  },
  innGreeting: function (type, price) {
    var g = 'inn_' + type + '_greeting_';
    return [Terms.get(g + '1') + price + Terms.get(g + '2'), Terms.get(g + '3')];
  },
  showInn: function (c) {
    if (MessageWindow.queue) return false;
    var p = c.params, self = this, price = p[1], type = p[0] === 0 ? 'a' : 'b';
    var choices = [Terms.get('inn_' + type + '_accept'), Terms.get('inn_' + type + '_cancel')];
    this.waiting = 'message';
    this.index++;
    MessageWindow.show({ lines: this.innGreeting(type, price), choices: choices, choiceCancel: 2 }, function (res) {
      if (res.choice !== 0 || Party.gold < price) { self.resumeInBranch(INN_LEAVE_CASE, c.indent, p[2]); return; }
      Party.changeGold(-price);
      self.waiting = 'scene';
      Game.innSleep(function () { self.resumeInBranch(INN_STAY_CASE, c.indent, p[2]); });
    });
    return 'jumped';
  },
});

EventCommands[10710] = function (c) { /* EnemyEncounter */
  var self = this;
  Game.startBattle(this.encounterArgs(c), function (result) { self.onBattleEnd(c, result); });
  return this.awaitScene('battle');
};
EventCommands[VICTORY_CASE] = EventCommands[ESCAPE_CASE] = EventCommands[DEFEAT_CASE] = function (c) {
  this.skipToIndent([ENCOUNTER_END], c.indent);
  return true;
};

EventCommands[10720] = function (c) { /* OpenShop: [style, type, has branches, ?, item ids...] */
  var p = c.params, self = this;
  Game.openShop({ type: p[1], style: p[0], items: p.slice(4) }, function (bought) {
    self.resumeInBranch(bought ? SHOP_BOUGHT_CASE : SHOP_NOTHING_CASE, c.indent, p[2]);
  });
  return this.awaitScene('scene');
};
EventCommands[SHOP_BOUGHT_CASE] = EventCommands[SHOP_NOTHING_CASE] = function (c) {
  this.skipToIndent([SHOP_END], c.indent);
  return true;
};

EventCommands[10730] = function (c) { return this.showInn(c); };
EventCommands[INN_STAY_CASE] = EventCommands[INN_LEAVE_CASE] = function (c) {
  this.skipToIndent([INN_END], c.indent);
  return true;
};
EventCommands[10740] = function () { return true; }; /* EnterHeroName: unused */
