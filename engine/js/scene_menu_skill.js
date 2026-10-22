/* Menu skill list for one actor. */

/* ---- Skills ---- */
function SceneSkill(actor) { this.actor = actor; }
SceneSkill.prototype = {
  start: function () {
    var self = this;
    this.help = new Window_Help(0, 0, 320, 32);
    this.info = new Window_Base(0, 32, 320, 32);
    this.list = new Window_Selectable(0, 64, 320, 176);
    this.list.columns = 2;
    this.list.active = true;
    this.list.onOk = function (i) { self.use(i); };
    this.list.onCancel = function () { Audio_.sys('cancel'); Game.pop(); };
    this.refresh();
    this.list.setIndex(this.actor.skills.length ? 0 : -1);
    Input.clear();
  },
  refresh: function () {
    var a = this.actor, w = this.list;
    this.info.clear();
    this.info.drawActorName(a, 0, 0); this.info.drawActorLevel(a, 80, 0); this.info.drawActorHp(a, 140, 0); this.info.drawActorSp(a, 230, 0);
    this.info.dirty = false;
    w.itemMax = a.skills.length;
    w.clear();
    for (var i = 0; i < a.skills.length; i++) {
      var sk = DB.skill(a.skills[i]), r = w.itemRect(i);
      var usable = sk.occasion_field && a.sp >= sk.sp_cost;
      w.text(sk.name, r.x, r.y, usable ? 0 : 3);
      w.text('-' + sk.sp_cost, r.x + r.w - 24, r.y, usable ? 0 : 3);
    }
    w.dirty = false;
  },
  use: function (i) {
    var sk = DB.skill(this.actor.skills[i]);
    if (!sk || !sk.occasion_field || this.actor.sp < sk.sp_cost || sk.scope < 2) { Audio_.sys('buzzer'); return; }
    Audio_.sys('decision');
    var self = this, actor = this.actor;
    Game.push(new SceneTarget(function (target) {
      var targets = sk.scope === 4 ? Party.members : sk.scope === 2 ? [actor] : [target];
      var any = false;
      targets.forEach(function (t) {
        if (t.isDead() && !(sk.state_effects[0])) return;
        if (sk.affect_hp) { t.changeHp(sk.power + Math.floor(sk.magical_rate * actor.spi() / 40), false); any = true; }
        if (sk.affect_sp) { t.changeSp(sk.power); any = true; }
        for (var s = 0; s < sk.state_effects.length; s++) if (sk.state_effects[s]) { t.removeState(s + 1); any = true; }
      });
      if (!any) { Audio_.sys('buzzer'); return false; }
      actor.changeSp(-sk.sp_cost);
      Audio_.playSe(sk.sound_effect);
      self.refresh();
      return true;
    }, sk.scope === 4));
  },
  resume: function () { this.refresh(); this.list.active = true; Input.clear(); },
  update: function () {
    this.help.update(); this.info.update(); this.list.update();
    var sk = DB.skill(this.actor.skills[this.list.index]);
    this.help.setText(sk ? sk.description : '');
  },
  draw: function (ctx) { var map = Game.scenes[0]; if (map && map.draw) map.draw(ctx); this.help.draw(ctx); this.info.draw(ctx); this.list.draw(ctx); },
};

