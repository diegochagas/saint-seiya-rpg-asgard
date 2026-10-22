/* Gold, items, party members and actor changes (10310-10640, 2k3 1008 ChangeClass). */
var EQUIP_ALL_SLOTS = 5;

Object.assign(Interpreter.prototype, {
  /* +n or -n depending on the command's operation param (0 = increase) */
  signed: function (op, n) { return op === 0 ? n : -n; },
  forActors: function (p, fn) { this.actorsFor(p[0], p[1]).forEach(fn); },
  /* ChangeExp / ChangeLevel collect level-up lines and show them when the flag is set */
  levelMessages: function (p, change) {
    var msgs = [];
    this.forActors(p, function (a) { msgs = msgs.concat(change(a)); });
    return p[5] && msgs.length ? this.queueMessages(msgs) : true;
  },
  equipItem: function (actors, itemId) {
    var it = DB.item(itemId);
    if (!it || it.type < 1 || it.type > 5) return;
    actors.forEach(function (a) {
      if (!a.canEquip(it)) return;
      if (!Party.hasItem(itemId)) Party.addItem(itemId, 1);
      a.changeEquipment(a.slotFor(it), itemId);
    });
  },
  unequipSlot: function (actors, slot) {
    actors.forEach(function (a) {
      for (var s = 0; s < 5; s++) if ((slot === EQUIP_ALL_SLOTS || s === slot) && a.equip[s]) a.changeEquipment(s, 0);
    });
  },
});

EventCommands[10310] = function (c) { /* ChangeGold */
  var p = c.params;
  Party.changeGold(this.signed(p[0], this.valueOr(p[1], p[2])));
  return true;
};
EventCommands[10320] = function (c) { /* ChangeItems */
  var p = c.params;
  Party.addItem(this.valueOr(p[1], p[2]), this.signed(p[0], this.valueOr(p[3], p[4])));
  GameMap.refreshEvents();
  return true;
};
EventCommands[10330] = function (c) { /* ChangePartyMembers */
  var p = c.params, id = this.valueOr(p[1], p[2]);
  if (p[0] === 0) Party.addActor(id); else Party.removeActor(id);
  Player.refreshSprite();
  GameMap.refreshEvents();
  return true;
};
EventCommands[10410] = function (c) { /* ChangeExp */
  var p = c.params, amount = this.signed(p[2], this.valueOr(p[3], p[4]));
  return this.levelMessages(p, function (a) { return a.changeExp(amount); });
};
EventCommands[10420] = function (c) { /* ChangeLevel */
  var p = c.params, amount = this.signed(p[2], this.valueOr(p[3], p[4]));
  return this.levelMessages(p, function (a) { return a.changeLevel(amount); });
};
EventCommands[10430] = function (c) { /* ChangeParameters */
  var p = c.params, amount = this.signed(p[2], this.valueOr(p[4], p[5]));
  this.forActors(p, function (a) { a.paramBonus[p[3]] += amount; a.clampHpSp(); });
  return true;
};
EventCommands[10440] = function (c) { /* ChangeSkills */
  var p = c.params, skill = this.valueOr(p[3], p[4]);
  this.forActors(p, function (a) { if (p[2] === 0) a.learnSkill(skill); else a.forgetSkill(skill); });
  return true;
};
EventCommands[10450] = function (c) { /* ChangeEquipment */
  var p = c.params, actors = this.actorsFor(p[0], p[1]);
  if (p[2] === 0) this.equipItem(actors, this.valueOr(p[3], p[4]));
  else this.unequipSlot(actors, p[3]);
  return true;
};
EventCommands[10460] = function (c) { /* ChangeHP */
  var p = c.params, amount = this.signed(p[2], this.valueOr(p[3], p[4]));
  this.forActors(p, function (a) { a.changeHp(amount, p[5] !== 0); });
  return true;
};
EventCommands[10470] = function (c) { /* ChangeSP */
  var p = c.params, amount = this.signed(p[2], this.valueOr(p[3], p[4]));
  this.forActors(p, function (a) { a.changeSp(amount); });
  return true;
};
EventCommands[10480] = function (c) { /* ChangeCondition */
  var p = c.params;
  this.forActors(p, function (a) { if (p[2] === 0) a.addState(p[3]); else a.removeState(p[3]); });
  return true;
};
EventCommands[10490] = function (c) { this.forActors(c.params, function (a) { a.fullHeal(); }); return true; };
EventCommands[10500] = function () { return true; }; /* SimulatedAttack: unused */

EventCommands[10610] = function (c) { var a = Party.actor(c.params[0]); if (a) a.name = c.string; return true; };
EventCommands[10620] = function (c) { var a = Party.actor(c.params[0]); if (a) a.title = c.string; return true; };
EventCommands[10630] = function (c) { /* ChangeSpriteAssociation */
  var p = c.params, a = Party.actor(p[0]);
  if (!a) return true;
  a.charName = c.string; a.charIndex = p[1]; a.transparent = p[2] !== 0;
  Player.refreshSprite();
  return true;
};
EventCommands[10640] = function (c) { /* ChangeActorFace */
  var a = Party.actor(c.params[0]);
  if (a) { a.faceName = c.string; a.faceIndex = c.params[1]; }
  return true;
};

/* RPG Maker 2003 ChangeClass: [actor mode, actor, class, back to level 1?, skill mode, param mode, show msg] */
EventCommands[1008] = function (c) {
  var p = c.params;
  this.actorsFor(p[0], p[1]).forEach(function (a) {
    a.changeClass(p[2], { resetLevel: p[3] !== 0, skillMode: p[4], paramMode: p[5] });
  });
  return true;
};
