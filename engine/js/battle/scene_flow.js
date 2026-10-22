/* Scripted battle phases: the opening, victory (rewards), defeat, escape and the final fade. */
var VICTORY_DELAY = 60, DEFEAT_DELAY = 60, ESCAPE_WALK_FRAMES = 30, BATTLE_FADE_FRAMES = 15;

/** Runs fn(frame) steps in order; a step returns true when it is done. */
function Sequence(steps) { this.steps = steps; this.index = 0; this.t = 0; }
Sequence.prototype.update = function () {
  while (this.index < this.steps.length) {
    if (!this.steps[this.index](this.t++)) return false;
    this.index++;
    this.t = 0;
  }
  return true;
};
function waitFrames(n) { return function (t) { return t >= n; }; }
function waitKey(min) { return function (t) { return t >= min && (Input.triggered('ok') || Input.triggered('cancel')); }; }

var BattleFlow = {
  /* battle SE + music, fade in, "Fight!" and the surprise line, then all troop pages */
  begin: function (b) {
    var sys = GameState.system || Loader.db.system;
    Audio_.playSe(sys.battle_se);
    b.mapBgm = Audio_.bgmCurrent ? Object.assign({}, Audio_.bgmCurrent) : null;
    if (sys.battle_music && sys.battle_music.name !== '(OFF)') Audio_.playBgm(sys.battle_music);
    Screen.fade = 0;
    Screen.fadeIn(BATTLE_FADE_FRAMES);
    var surprise = b.condition === CONDITION.INITIATIVE || b.condition === CONDITION.SURROUND || b.args.firstStrike;
    b.flow = new Sequence([
      this.helpLine(b, Terms.get('battle_start'), 10, 80),
      this.helpLine(b, surprise ? Terms.get('special_combat') : '', 30, 70),
      function () { b.hideHelp(); b.runPages(PAGE_MOMENT.START, null); b.input.showOptions(true); return true; },
    ]);
  },
  helpLine: function (b, text, min, max) {
    return function (t) {
      if (!text) return true;
      if (t === 0) b.showHelp(text);
      return t >= max || (t >= min && Input.pressed('ok'));
    };
  },
  /** @returns {boolean} true when the battle just ended (a flow took over) */
  checkEnd: function (b) {
    if (!b.activeEnemies().length) { b.flow = this.victory(b); return true; }
    if (BattleRules.unableToFight(Party.members)) { b.flow = this.defeat(b); return true; }
    return false;
  },
  rewards: function (b) {
    var r = { exp: 0, gold: 0, items: [] };
    b.enemies.forEach(function (e) {
      if (!e.dead) return;
      r.exp += e.data.exp; r.gold += e.data.gold;
      if (e.data.drop_id > 0 && Rand.chance(e.data.drop_prob)) r.items.push(e.data.drop_id);
    });
    return r;
  },
  rewardLines: function (r) {
    var lines = [Terms.get('victory')];
    if (r.exp > 0) lines.push(r.exp + Terms.get('exp_received'));
    if (r.gold > 0) lines.push(Terms.get('gold_recieved_a') + ' ' + r.gold + Terms.get('gold') + Terms.get('gold_recieved_b'));
    r.items.forEach(function (id) { lines.push(DB.item(id).name + Terms.get('item_recieved')); });
    return lines;
  },
  applyRewards: function (r) {
    var levelUps = [];
    Party.changeGold(r.gold);
    r.items.forEach(function (id) { Party.addItem(id, 1); });
    Party.alive().forEach(function (a) { levelUps = levelUps.concat(a.changeExp(r.exp)); });
    return levelUps;
  },
  victory: function (b) {
    var r = this.rewards(b), lines = this.rewardLines(r).concat(this.applyRewards(r));
    var sys = GameState.system || Loader.db.system;
    var steps = [waitFrames(VICTORY_DELAY), function () {
      Party.members.forEach(function (a) { a.defending = false; });
      b.sprites.forEach(function (s) { if (!s.actor.isDead()) s.setPose(POSE.VICTORY, POSE_LOOP); });
      if (sys.battle_end_music && sys.battle_end_music.name !== '(OFF)') Audio_.playBgm(sys.battle_end_music);
      return true;
    }, waitFrames(30)];
    lines.forEach(function (line) { steps.push(BattleFlow.notice(b, line)); });
    return new Sequence(steps.concat(this.finishSteps(b, 'victory')));
  },
  notice: function (b, line) {
    var wait = waitKey(10);
    return function (t) { if (t === 0) b.showHelp(line); return wait(t); };
  },
  defeat: function (b) {
    var sys = GameState.system || Loader.db.system;
    return new Sequence([waitFrames(DEFEAT_DELAY), function () { Audio_.playBgm(sys.gameover_music); return true; },
      waitFrames(DEFEAT_DELAY), this.notice(b, Terms.get('defeat'))].concat(this.finishSteps(b, 'defeat')));
  },
  escape: function (b) {
    BattleEffects.se('escape_se');
    b.sprites.forEach(function (s) { if (!s.actor.isDead()) s.setPose(POSE.WALK_RIGHT, POSE_LOOP); });
    var walk = function (t) { b.sprites.forEach(function (s) { s.dx = (s.flipped ? -6 : 6) * t; }); return t >= ESCAPE_WALK_FRAMES; };
    return new Sequence([walk].concat(this.finishSteps(b, 'escape')));
  },
  finish: function (b, result) { return new Sequence(this.finishSteps(b, result)); },
  finishSteps: function (b, result) {
    return [function () { b.hideHelp(); Screen.fadeOut(BATTLE_FADE_FRAMES); return true; },
      function () { return !Screen.fadeBusy(); },
      function () { BattleFlow.close(b, result); return true; }];
  },
  close: function (b, result) {
    BattleAnim.clear();
    FloatingNumbers.clear();
    Party.members.forEach(function (a) { a.defending = false; a.clearBattleStats(); a.attackSlot = null; });
    if (result !== 'defeat' && b.mapBgm) Audio_.playBgm(b.mapBgm);
    Game.battleScene = null;
    b.flow = { update: function () { return false; } };   /* frozen until the scene is popped */
    Screen.fadeIn(BATTLE_FADE_FRAMES);
    b.onDone(result);
  },
};
