/* Event command interpreter (RPG Maker 2000 semantics). */

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
    if (!this.list) return;
    var guard = 0;
    while (this.list && guard++ < 1000) {
      if (this.wait > 0) { this.wait--; return; }
      if (this.waiting) {
        if (!this.checkWaiting()) return;
        this.waiting = null;
      }
      if (this.index >= this.list.length) { this.end(); continue; }
      var c = this.list[this.index];
      var r = this.execute(c);
      if (r === false) return;           /* wait, index not advanced or already handled */
      if (r !== 'jumped') this.index++;
    }
  },

  checkWaiting: function () {
    switch (this.waiting) {
      case 'message': return !MessageWindow.queue;
      case 'fade': return !Screen.fadeBusy();
      case 'tint': return !Screen.tintBusy();
      case 'flash': return !Screen.flashBusy();
      case 'shake': return !Screen.shakeBusy();
      case 'pan': return !GameMap.pan.waiting;
      case 'teleport': return !Game.teleporting;
      case 'battle': return !Game.battleRunning;
      case 'scene': return Game.sceneStackDepth() <= 1 && !Game.transitionBusy();
      case 'move': return !GameMap.events.some(function (e) { return e.routeActive(); }) && !Player.routeActive();
      case 'anim': return !BattleAnim.busy();
      case 'picture': return !Pictures.busy(this.waitPicture);
      case 'keyinput': return this.keyInputCheck();
    }
    return true;
  },

  /* ---- helpers ---- */
  valueOr: function (mode, v) { return mode === 0 ? v : GameState.v(v); },
  actorsFor: function (mode, id) {
    if (mode === 0) return Party.members.slice();
    if (mode === 1) return Party.actor(id) ? [Party.actor(id)] : [];
    var a = Party.actor(GameState.v(id));
    return a ? [a] : [];
  },
  character: function (id) {
    if (id === 10001) return Player;
    if (id === 10005) return GameMap.events.find(function (e) { return e.id === this.eventId; }, this) || null;
    if (id >= 10002 && id <= 10004) return null;
    return GameMap.events.find(function (e) { return e.id === id; }) || null;
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

  /* collect a message: following ShowMessage_2 lines, then optional choice/number */
  collectMessage: function () {
    var lines = [this.cmd().string];
    var i = this.index + 1;
    while (i < this.list.length && this.list[i].code === 20110) { lines.push(this.list[i].string); i++; }
    var req = { lines: lines, choices: null, number: null };
    if (i < this.list.length && this.list[i].code === 10140) {
      req.choices = this.list[i].string.split('/');
      req.choiceCancel = this.list[i].params[0];
      req.choiceIndent = this.list[i].indent;
      req.choiceAt = i;
      i++;
    } else if (i < this.list.length && this.list[i].code === 10150) {
      req.number = { digits: this.list[i].params[0], variable: this.list[i].params[1] };
      i++;
    }
    /* keep the window open if another message follows immediately */
    req.keepOpen = i < this.list.length && this.list[i].code === 10110 && !req.choices && !req.number;
    req.nextIndex = i;
    return req;
  },

  execute: function (c) {
    var p = c.params, s = c.string, self = this;
    switch (c.code) {
      case 10: case 12410: case 22410: case 20110: case 20141: case 22011: case 20713: case 20722: case 20732:
        return true;

      case 10110: { /* ShowMessage */
        if (MessageWindow.queue) return false;
        var req = this.collectMessage();
        var nextIndex = req.nextIndex, choiceIndent = req.choiceIndent, choiceAt = req.choiceAt, numberVar = req.number ? req.number.variable : null;
        this.index = nextIndex;
        this.waiting = 'message';
        MessageWindow.show(req, function (res) {
          if (res.choice != null) {
            self.index = choiceAt;
            var found = self.jumpToBranch(20140, choiceIndent, function (cc) { return cc.params[0] === res.choice; });
            if (!found) { self.index = choiceAt; self.skipToIndent([20141], choiceIndent); self.index++; }
          }
          if (numberVar != null && res.number != null) GameState.setV(numberVar, res.number);
        });
        return 'jumped';
      }
      case 10120: { /* MessageOptions */
        var m = GameState.message;
        m.transparent = p[0] !== 0; m.position = p[1]; m.fixed = p[2] === 0; m.continueEvents = p[3] !== 0;
        return true;
      }
      case 10130: { /* ChangeFaceGraphic */
        var mm = GameState.message;
        mm.face = s; mm.faceIndex = p[0]; mm.faceRight = p[1] !== 0; mm.faceFlip = p[2] !== 0;
        return true;
      }
      case 10140: { /* ShowChoice without preceding message */
        if (MessageWindow.queue) return false;
        var choices = s.split('/');
        var indent = c.indent, at = this.index;
        var cancel = p[0];
        this.waiting = 'message';
        this.index++;
        MessageWindow.show({ lines: [], choices: choices, choiceCancel: cancel }, function (res) {
          self.index = at;
          var found = self.jumpToBranch(20140, indent, function (cc) { return cc.params[0] === res.choice; });
          if (!found) { self.index = at; self.skipToIndent([20141], indent); self.index++; }
        });
        return 'jumped';
      }
      case 20140: { /* reached the start of another choice branch: skip to end */
        this.skipToIndent([20141], c.indent);
        return true;
      }
      case 10150: { /* InputNumber */
        if (MessageWindow.queue) return false;
        var v = p[1];
        this.waiting = 'message';
        MessageWindow.show({ lines: [], number: { digits: p[0] } }, function (res) { if (res.number != null) GameState.setV(v, res.number); });
        return true;
      }
      case 10210: { /* ControlSwitches */
        var a = p[1], b = p[1];
        if (p[0] === 1) { a = p[1]; b = p[2]; }
        else if (p[0] === 2) { a = b = GameState.v(p[1]); }
        for (var i = a; i <= b; i++) {
          if (p[3] === 0) GameState.setSw(i, true); else if (p[3] === 1) GameState.setSw(i, false); else GameState.setSw(i, !GameState.sw(i));
        }
        GameMap.refreshEvents();
        return true;
      }
      case 10220: return this.controlVariables(p);
      case 10230: return true; /* timer: unused */
      case 10310: { var g = this.valueOr(p[1], p[2]); Party.changeGold(p[0] === 0 ? g : -g); return true; }
      case 10320: {
        var itemId = this.valueOr(p[1], p[2]);
        var n = this.valueOr(p[3], p[4]);
        Party.addItem(itemId, p[0] === 0 ? n : -n);
        GameMap.refreshEvents();
        return true;
      }
      case 10330: {
        var aid = this.valueOr(p[1], p[2]);
        if (p[0] === 0) Party.addActor(aid); else Party.removeActor(aid);
        Player.refreshSprite();
        GameMap.refreshEvents();
        return true;
      }
      case 10410: { /* ChangeExp */
        var amt = this.valueOr(p[3], p[4]);
        var msgs = [];
        this.actorsFor(p[0], p[1]).forEach(function (a) { msgs = msgs.concat(a.changeExp(p[2] === 0 ? amt : -amt)); });
        if (p[5] && msgs.length) return this.queueMessages(msgs);
        return true;
      }
      case 10420: {
        var lv = this.valueOr(p[3], p[4]);
        var msgs2 = [];
        this.actorsFor(p[0], p[1]).forEach(function (a) { msgs2 = msgs2.concat(a.changeLevel(p[2] === 0 ? lv : -lv)); });
        if (p[5] && msgs2.length) return this.queueMessages(msgs2);
        return true;
      }
      case 10430: {
        var val = this.valueOr(p[4], p[5]);
        this.actorsFor(p[0], p[1]).forEach(function (a) { a.paramBonus[p[3]] += p[2] === 0 ? val : -val; a.hp = Math.min(a.hp, a.maxHp()); });
        return true;
      }
      case 10440: {
        var sk = this.valueOr(p[3], p[4]);
        this.actorsFor(p[0], p[1]).forEach(function (a) { if (p[2] === 0) a.learnSkill(sk); else a.forgetSkill(sk); });
        return true;
      }
      case 10450: { /* ChangeEquipment */
        var actors = this.actorsFor(p[0], p[1]);
        if (p[2] === 0) {
          var iid = this.valueOr(p[3], p[4]);
          var it = DB.item(iid);
          if (it && it.type >= 1 && it.type <= 5) {
            actors.forEach(function (a) {
              if (!a.canEquip(it)) return;
              if (!Party.hasItem(iid)) Party.addItem(iid, 1);
              a.changeEquipment(it.type - 1, iid);
            });
          }
        } else {
          actors.forEach(function (a) {
            if (p[3] === 5) { for (var sl = 0; sl < 5; sl++) if (a.equip[sl]) a.changeEquipment(sl, 0); }
            else if (a.equip[p[3]]) a.changeEquipment(p[3], 0);
          });
        }
        return true;
      }
      case 10460: {
        var hp = this.valueOr(p[3], p[4]);
        this.actorsFor(p[0], p[1]).forEach(function (a) { a.changeHp(p[2] === 0 ? hp : -hp, p[5] !== 0); });
        return true;
      }
      case 10470: {
        var sp = this.valueOr(p[3], p[4]);
        this.actorsFor(p[0], p[1]).forEach(function (a) { a.changeSp(p[2] === 0 ? sp : -sp); });
        return true;
      }
      case 10480: {
        this.actorsFor(p[0], p[1]).forEach(function (a) { if (p[2] === 0) a.addState(p[3]); else a.removeState(p[3]); });
        return true;
      }
      case 10490: this.actorsFor(p[0], p[1]).forEach(function (a) { a.fullHeal(); }); return true;
      case 10500: return true; /* SimulatedAttack: unused */
      case 10610: { var a1 = Party.actor(p[0]); if (a1) a1.name = s; return true; }
      case 10620: { var a2 = Party.actor(p[0]); if (a2) a2.title = s; return true; }
      case 10630: { var a3 = Party.actor(p[0]); if (a3) { a3.charName = s; a3.charIndex = p[1]; a3.transparent = p[2] !== 0; Player.refreshSprite(); } return true; }
      case 10640: { var a4 = Party.actor(p[0]); if (a4) { a4.faceName = s; a4.faceIndex = p[1]; } return true; }
      case 10660: {
        var keys = ['title_music', 'battle_music', 'battle_end_music', 'inn_music', 'boat_music', 'ship_music', 'airship_music', 'gameover_music'];
        GameState.system[keys[p[0]]] = { name: s, fadein: p[1], volume: p[2], tempo: p[3], balance: p[4] };
        return true;
      }
      case 10670: {
        var skeys = ['cursor_se', 'decision_se', 'cancel_se', 'buzzer_se', 'battle_se', 'escape_se', 'enemy_attack_se', 'enemy_damaged_se', 'actor_damaged_se', 'dodge_se', 'enemy_death_se', 'item_se'];
        GameState.system[skeys[p[0]]] = { name: s, volume: p[1], tempo: p[2], balance: p[3] };
        return true;
      }
      case 10680: GameState.system.system_name = s; Gfx.setSystem(s); return true;
      case 10690: return true;
      case 10710: { /* EnemyEncounter */
        var troopId = this.valueOr(p[0], p[1]);
        var bg = null, terrainId = 0;
        if (p[2] === 1) bg = s; else if (p[2] === 2) terrainId = p[8] || 0;
        var indentB = c.indent;
        this.waiting = 'battle';
        var escapeMode = p[3], defeatMode = p[4];
        this.index++;
        Game.startBattle({ troopId: troopId, background: bg, terrainId: terrainId, allowEscape: escapeMode !== 0, firstStrike: !!p[5], defeatMode: defeatMode }, function (result) {
          /* result: 'victory' | 'escape' | 'defeat' */
          self.index--; /* back at the encounter command */
          if (result === 'victory') {
            if (!self.jumpToBranch(20710, indentB)) self.index++;
          } else if (result === 'escape') {
            if (escapeMode === 1) { self.list = null; return; }
            if (!self.jumpToBranch(20711, indentB)) self.index++;
          } else {
            if (defeatMode === 0) { Game.gameOver(); self.list = null; return; }
            if (!self.jumpToBranch(20712, indentB)) self.index++;
          }
        });
        return 'jumped';
      }
      case 20710: case 20711: case 20712: this.skipToIndent([20713], c.indent); return true;
      case 10720: { /* OpenShop */
        var items = p.slice(4);
        var indentS = c.indent;
        this.waiting = 'scene';
        this.index++;
        Game.openShop({ type: p[1], style: p[0], items: items }, function (bought) {
          self.index--;
          if (p[2]) {
            if (!self.jumpToBranch(bought ? 20720 : 20721, indentS)) self.index++;
          } else self.index++;
        });
        return 'jumped';
      }
      case 20720: case 20721: this.skipToIndent([20722], c.indent); return true;
      case 10730: return this.showInn(c);
      case 20730: case 20731: this.skipToIndent([20732], c.indent); return true;
      case 10740: return true; /* EnterHeroName: unused */
      case 10810: { /* Teleport */
        if (MessageWindow.queue) return false;
        this.waiting = 'teleport';
        Game.teleport(p[0], p[1], p[2], p.length > 3 ? p[3] - 1 : -1);
        return true;
      }
      case 10820: GameState.setV(p[0], GameMap.id); GameState.setV(p[1], Player.x); GameState.setV(p[2], Player.y); return true;
      case 10830: this.waiting = 'teleport'; Game.teleport(GameState.v(p[0]), GameState.v(p[1]), GameState.v(p[2]), -1); return true;
      case 10860: {
        var ev = this.character(p[0]);
        if (ev) { ev.x = this.valueOr(p[1], p[2]); ev.y = this.valueOr(p[1], p[3]); ev.remainingStep = 0; if (p.length > 4 && p[4] > 0) ev.forceFacing(p[4] - 1); }
        return true;
      }
      case 10870: {
        var e1 = this.character(p[0]), e2 = this.character(p[1]);
        if (e1 && e2) { var tx = e1.x, ty = e1.y; e1.x = e2.x; e1.y = e2.y; e2.x = tx; e2.y = ty; }
        return true;
      }
      case 10910: GameState.setV(p[3], GameMap.terrainAt(this.valueOr(p[0], p[1]), this.valueOr(p[0], p[2]))); return true;
      case 10920: {
        var evs = GameMap.eventsAt(this.valueOr(p[0], p[1]), this.valueOr(p[0], p[2]));
        GameState.setV(p[3], evs.length ? evs[evs.length - 1].id : 0);
        return true;
      }
      case 11010: { if (MessageWindow.queue) return false; Screen.fadeOut(p[0] === 20 ? 1 : 20); Screen.erased = true; this.waiting = 'fade'; return true; }
      case 11020: { if (MessageWindow.queue) return false; Screen.fadeIn(p[0] === 20 ? 1 : 20); Screen.erased = false; this.waiting = 'fade'; return true; }
      case 11030: Screen.setTint(p[0], p[1], p[2], p[3], p[4]); if (p[5]) this.waiting = 'tint'; return true;
      case 11040: Screen.setFlash(p[0], p[1], p[2], p[3], p[4]); if (p[5]) this.waiting = 'flash'; return true;
      case 11050: Screen.setShake(p[0], p[1], p[2]); if (p[3]) this.waiting = 'shake'; return true;
      case 11060: GameMap.panScreen(p[0], p[1], p[2], p[3], p[4]); if (p[4] && (p[0] === 2 || p[0] === 3)) this.waiting = 'pan'; return true;
      case 11070: Screen.setWeather(p[0], p[1]); return true;
      case 11110: {
        Pictures.show(p[0], { name: s, x: this.valueOr(p[1], p[2]), y: this.valueOr(p[1], p[3]), fixed: p[4] > 0, mag: p[5], trans: p[6], r: p[8], g: p[9], b: p[10], s: p[11], effect: p[12], power: p[13] });
        return true;
      }
      case 11120: {
        Pictures.move(p[0], { x: this.valueOr(p[1], p[2]), y: this.valueOr(p[1], p[3]), mag: p[5], trans: p[6], effect: p[12], power: p[13] }, p[14] * 6);
        if (p[15]) { this.waiting = 'picture'; this.waitPicture = p[0]; }
        return true;
      }
      case 11130: Pictures.erase(p[0]); return true;
      case 11210: {
        var target = this.character(p[1]);
        BattleAnim.playOnMap(p[0], target, !!p[3]);
        if (p[2]) this.waiting = 'anim';
        return true;
      }
      case 11310: Player.hidden = p[0] === 0; return true;
      case 11320: {
        var ch = this.character(p[0]);
        if (ch) ch.flash = { r: p[1], g: p[2], b: p[3], power: p[4], frames: Math.max(1, p[5] * 6), t: 0 };
        if (p[6]) this.wait = p[5] * 6;
        return true;
      }
      case 11330: {
        var mv = this.character(p[0]);
        if (mv) mv.setRoute(c.route || [], p[2] !== 0, p[3] !== 0, true);
        if (mv && p[1]) mv.moveFrequency = p[1];
        return true;
      }
      case 11340: this.waiting = 'move'; return true;
      case 11350: GameMap.events.forEach(function (e) { if (e.route && e.route.override) e.onRouteDone(); }); Player.route = null; return true;
      case 11410: this.wait = p[0] * 6; return true;
      case 11510: Audio_.playBgm({ name: s, fadein: p[0], volume: p[1], tempo: p[2], balance: p[3] }); return true;
      case 11520: Audio_.fadeOutBgm(p[0]); return true;
      case 11530: Audio_.memorizeBgm(); return true;
      case 11540: Audio_.playMemorizedBgm(); return true;
      case 11550: Audio_.playSe({ name: s, volume: p[0], tempo: p[1], balance: p[2] }); return true;
      case 11560: return true; /* movie */
      case 11610: return this.keyInput(c);
      case 11710: GameMap.setChipset(p[0]); return true;
      case 11720: GameMap.setParallax(s, p[0] !== 0, p[1] !== 0, p[2] !== 0, p[3], p[4] !== 0, p[5]); return true;
      case 11740: GameMap.encounterStepsOverride = p[0]; return true;
      case 11750: return true;
      case 11810: case 11820: case 11830: return true;
      case 11840: GameState.escapeAllowed = p[0] !== 0; return true;
      case 11910: { if (MessageWindow.queue) return false; this.waiting = 'scene'; this.index++; Game.openSave(); return 'jumped'; }
      case 11930: GameState.saveAllowed = p[0] !== 0; return true;
      case 11950: { if (MessageWindow.queue) return false; this.waiting = 'scene'; this.index++; Game.openMenu(); return 'jumped'; }
      case 11960: GameState.menuAllowed = p[0] !== 0; return true;
      case 12010: { /* ConditionalBranch */
        var ok = this.evalCondition(c);
        if (ok) return true;
        if (!this.skipToIndent([22010, 22011], c.indent)) this.index = this.list.length;
        return true;
      }
      case 22010: this.skipToIndent([22011], c.indent); return true;
      case 12110: return true;
      case 12120: {
        for (var li = 0; li < this.list.length; li++) if (this.list[li].code === 12110 && this.list[li].params[0] === p[0]) { this.index = li; return 'jumped'; }
        return true;
      }
      case 12210: return true;
      case 12220: { this.skipToIndent([22210], c.indent - 0); return true; }
      case 22210: {
        for (var lj = this.index - 1; lj >= 0; lj--) if (this.list[lj].code === 12210 && this.list[lj].indent === c.indent) { this.index = lj + 1; return 'jumped'; }
        return true;
      }
      case 12310: this.list = null; return false;
      case 12320: { var me = this.character(10005); if (me) { me.erased = true; me.refresh(); } this.list = null; return false; }
      case 12330: { /* CallEvent */
        var cmds = null;
        if (p[0] === 0) { var ce = Loader.db.commonevents[p[1]]; cmds = ce ? ce.event_commands : null; }
        else {
          var evId = p[0] === 1 ? p[1] : GameState.v(p[1]);
          var pgId = p[0] === 1 ? p[2] : GameState.v(p[2]);
          var evc = this.character(evId);
          if (evc && evc.data.pages[pgId]) cmds = evc.data.pages[pgId].event_commands;
        }
        if (cmds && cmds.length) {
          this.callStack.push({ list: this.list, index: this.index + 1, eventId: this.eventId });
          this.list = cmds; this.index = 0;
          return 'jumped';
        }
        return true;
      }
      case 12420: Game.gameOver(); this.list = null; return false;
      case 12510: Game.toTitle(); this.list = null; return false;
      case 1005: { var cev = Loader.db.commonevents[p[0]]; if (cev && cev.event_commands.length) { this.callStack.push({ list: this.list, index: this.index + 1, eventId: this.eventId }); this.list = cev.event_commands; this.index = 0; return 'jumped'; } return true; }
      case 5001: this.waiting = 'scene'; this.index++; Game.openLoad(); return 'jumped';
      case 5002: Game.toTitle(); this.list = null; return false;
      default:
        /* battle-only commands or unsupported: ignore */
        return true;
    }
  },

  queueMessages: function (msgs) {
    if (MessageWindow.queue) return false;
    var lines = msgs.slice(0, 4);
    var rest = msgs.slice(4);
    var self = this;
    this.waiting = 'message';
    MessageWindow.show({ lines: lines }, function () {
      if (rest.length) { self.index--; self.pendingMsgs = rest; }
    });
    return true;
  },

  controlVariables: function (p) {
    var value = 0;
    switch (p[4]) {
      case 0: value = p[5]; break;
      case 1: value = GameState.v(p[5]); break;
      case 2: value = GameState.v(GameState.v(p[5])); break;
      case 3: value = Rand.int(Math.min(p[5], p[6]), Math.max(p[5], p[6])); break;
      case 4: value = p[6] === 0 ? Party.itemCount(p[5]) : Party.equippedCount(p[5]); break;
      case 5: {
        var a = Party.actor(p[5]);
        if (a) value = [a.level, a.exp, a.hp, a.sp, a.maxHp(), a.maxSp(), a.atk(), a.def(), a.spi(), a.agi(), a.equip[0], a.equip[1], a.equip[2], a.equip[3], a.equip[4]][p[6]] || 0;
        break;
      }
      case 6: {
        var ch = this.character(p[5]);
        if (ch) value = [GameMap.id, ch.x, ch.y, ch.facing === 0 ? 8 : ch.facing === 1 ? 6 : ch.facing === 2 ? 2 : 4, ch.screenX() - GameMap.ox + 8, ch.screenY() - GameMap.oy + 8][p[6]] || 0;
        break;
      }
      case 7: value = [Party.gold, 0, Party.size(), GameState.saveCount, 0, 0, 0, Math.floor(GameState.playTime / 60), 0][p[5]] || 0; break;
    }
    var a1 = p[1], b1 = p[1];
    if (p[0] === 1) { a1 = p[1]; b1 = p[2]; } else if (p[0] === 2) { a1 = b1 = GameState.v(p[1]); }
    for (var i = a1; i <= b1; i++) {
      var cur = GameState.v(i), nv = cur;
      switch (p[3]) {
        case 0: nv = value; break;
        case 1: nv = cur + value; break;
        case 2: nv = cur - value; break;
        case 3: nv = cur * value; break;
        case 4: nv = value !== 0 ? Math.trunc(cur / value) : cur; break;
        case 5: nv = value !== 0 ? cur % value : 0; break;
      }
      GameState.setV(i, nv);
    }
    GameMap.refreshEvents();
    return true;
  },

  evalCondition: function (c) {
    var p = c.params;
    switch (p[0]) {
      case 0: return GameState.sw(p[1]) === (p[2] === 0);
      case 1: {
        var v1 = GameState.v(p[1]), v2 = this.valueOr(p[2], p[3]);
        switch (p[4]) { case 0: return v1 === v2; case 1: return v1 >= v2; case 2: return v1 <= v2; case 3: return v1 > v2; case 4: return v1 < v2; case 5: return v1 !== v2; }
        return false;
      }
      case 2: return false;
      case 3: return p[2] === 0 ? Party.gold >= p[1] : Party.gold <= p[1];
      case 4: {
        var has = Party.hasItem(p[1]) || Party.equippedCount(p[1]) > 0;
        return p[2] === 0 ? has : !has;
      }
      case 5: {
        var a = Party.actor(p[1]);
        if (!a) return false;
        switch (p[2]) {
          case 0: return Party.has(p[1]);
          case 1: return a.name === c.string;
          case 2: return a.level >= p[3];
          case 3: return a.hp >= p[3];
          case 4: return a.skills.indexOf(p[3]) >= 0;
          case 5: return a.equip.indexOf(p[3]) >= 0;
          case 6: return a.states.indexOf(p[3]) >= 0;
        }
        return false;
      }
      case 6: { var ch = this.character(p[1]); if (!ch) return false; var map = { 0: 8, 1: 6, 2: 2, 3: 4 }; return map[ch.facing] === p[2] || ch.facing === p[2]; }
      case 7: return false;
      case 8: return Input.pressed('ok');
      case 9: return true;
      case 10: return false;
    }
    return false;
  },

  showInn: function (c) {
    if (MessageWindow.queue) return false;
    var p = c.params, self = this;
    var type = p[0] === 0 ? 'a' : 'b';
    var price = p[1];
    var indent = c.indent;
    var lines = [Terms.get('inn_' + type + '_greeting_1') + price + Terms.get('inn_' + type + '_greeting_2'), Terms.get('inn_' + type + '_greeting_3')];
    var choices = [Terms.get('inn_' + type + '_accept'), Terms.get('inn_' + type + '_cancel')];
    this.waiting = 'message';
    this.index++;
    MessageWindow.show({ lines: lines, choices: choices, choiceCancel: 2 }, function (res) {
      var stay = res.choice === 0 && Party.gold >= price;
      if (res.choice === 0 && Party.gold < price) stay = false;
      if (stay) {
        Party.changeGold(-price);
        Game.innSleep(function () {
          self.index--;
          if (p[2]) { if (!self.jumpToBranch(20730, indent)) self.index++; } else self.index++;
        });
        self.waiting = 'scene';
      } else {
        self.index--;
        if (p[2]) { if (!self.jumpToBranch(20731, indent)) self.index++; } else self.index++;
      }
    });
    return 'jumped';
  },

  keyInput: function (c) {
    var p = c.params;
    this.keyInputVar = p[0];
    this.keyInputWait = p[1] !== 0;
    this.keyInputDirs = p.length < 6 || p[2] !== 0;
    this.keyInputOk = p.length > 3 ? p[3] !== 0 : true;
    this.keyInputCancel = p.length > 4 ? p[4] !== 0 : true;
    if (this.keyInputWait) { this.waiting = 'keyinput'; return true; }
    this.keyInputCheck();
    return true;
  },
  keyInputCheck: function () {
    var v = 0;
    if (this.keyInputDirs) {
      if (Input.pressed('down')) v = 1; else if (Input.pressed('left')) v = 2; else if (Input.pressed('right')) v = 3; else if (Input.pressed('up')) v = 4;
    }
    if (this.keyInputOk && Input.triggered('ok')) v = 5;
    if (this.keyInputCancel && Input.triggered('cancel')) v = 6;
    if (v || !this.keyInputWait) { GameState.setV(this.keyInputVar, v); return true; }
    return false;
  },
};
