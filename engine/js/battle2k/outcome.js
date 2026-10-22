/* RPG Maker 2000 battle: escape, victory / defeat checks, rewards and closing the scene.
   Part of SceneBattle2k (see scene.js). */
Object.assign(SceneBattle2k.prototype, {
  tryEscape: function () {
    var self = this;
    var chance = Battle2kRules.escapeChance(Battle2kRules.averageAgi(Party.alive()), Battle2kRules.averageAgi(this.alive()),
      this.escapeFails, this.args.firstStrike);
    this.clearMessages();
    if (Rand.chance(chance)) {
      this.sysSe('escape_se');
      this.showMessages([Terms.get('escape_success')], function () { self.finish('escape'); });
      return;
    }
    this.escapeFails++;
    this.showMessages([Terms.get('escape_failure')], function () { self.actions = []; self.beginActions(); });
  },

  checkEnd: function () {
    var self = this;
    if (this.state === 'ending') return true;
    var lost = Party.allDead(), won = !lost && !this.enemies.some(function (e) { return e.exists(); });
    if (!lost && !won) return false;
    this.state = 'ending';
    this.queue = [];
    if (won) this.victory();
    else this.showMessages([Terms.get('defeat')], function () { self.finish('defeat'); });
    return true;
  },
  /** @returns {{exp:number, gold:number, items:number[]}} what the defeated (not fled) enemies leave */
  rewards: function () {
    var r = { exp: 0, gold: 0, items: [] };
    this.enemies.forEach(function (e) {
      if (e.escaped) return;
      r.exp += e.data.exp; r.gold += e.data.gold;
      if (e.data.drop_id && Rand.chance(e.data.drop_prob)) r.items.push(e.data.drop_id);
    });
    return r;
  },
  rewardLines: function (r) {
    var lines = [Terms.get('victory')];
    if (r.exp > 0) lines.push(r.exp + Terms.get('exp_received'));
    if (r.gold > 0) lines.push(Terms.get('gold_recieved_a') + r.gold + Terms.get('gold_recieved_b'));
    r.items.forEach(function (id) { lines.push(DB.item(id).name + Terms.get('item_recieved')); });
    return lines;
  },
  victory: function () {
    var self = this, r = this.rewards(), lines = this.rewardLines(r), levelUps = [];
    Party.changeGold(r.gold);
    r.items.forEach(function (id) { Party.addItem(id, 1); });
    Party.members.forEach(function (a) { if (!a.isDead()) levelUps = levelUps.concat(a.changeExp(r.exp)); });
    var endMusic = GameState.system.battle_end_music;
    if (endMusic && endMusic.name && endMusic.name !== '(OFF)') Audio_.playBgm(endMusic);
    this.clearMessages();
    this.showMessages(lines.concat(levelUps), function () { self.finish('victory'); });
  },
  finish: function (result) {
    this.result = result;
    this.state = 'done';
    Screen.fadeOut(15);
    this.finishTimer = 16;
    this.queue.push({ wait: 5 });
    if (result !== 'defeat') this.restoreMapMusic();
  },
  restoreMapMusic: function () {
    var endMusic = GameState.system.battle_end_music, current = Audio_.bgmCurrent || {};
    if (!this.mapBgm) return;
    if (this.prevBgm || (endMusic && endMusic.name !== '(OFF)')) Audio_.playBgm(this.mapBgm);
    else if (this.mapBgm.name !== current.name) Audio_.playBgm(this.mapBgm);
  },
});
