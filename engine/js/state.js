/* Global game state: switches, variables, system settings, save/load. */

/* Shift-JIS lead bytes read as cp1252 ("‚", "ƒ", "„"...) or a replacement char: an
   untranslated Japanese default term. */
var MOJIBAKE_PATTERN = /[\u201A\u0192\u201E\u2021\u02C6\u2030\u0160\u2039\u0152\u017D\uFFFD]/;

var Terms = {
  get: function (key) {
    var en = I18N.term(key);
    if (en != null) return en;
    var v = Loader.db.terms[key];
    if (v && MOJIBAKE_PATTERN.test(v)) v = I18N.ptFallback(key);
    return v == null ? '' : v;
  },
};

var DB = {
  actor: function (id) { return Loader.db.actors[id]; },
  item: function (id) { return Loader.db.items[id]; },
  skill: function (id) { return Loader.db.skills[id]; },
  enemy: function (id) { return Loader.db.enemies[id]; },
  troop: function (id) { return Loader.db.troops[id]; },
  terrain: function (id) { return Loader.db.terrains[id]; },
  state: function (id) { return Loader.db.states[id]; },
  chipset: function (id) { return Loader.db.chipsets[id]; },
  animation: function (id) { return Loader.db.animations[id]; },
  attribute: function (id) { return Loader.db.attributes[id]; },
  klass: function (id) { return (Loader.db.classes || {})[id] || null; },
  battlerAnimation: function (id) { return (Loader.db.battleranimations || {})[id] || null; },
  battleCommand: function (id) { var bc = Loader.db.battlecommands; return bc && bc.commands[id] || null; },
  mapInfo: function (id) { return Loader.tree.maps[id]; },
  itemName: function (id) { var it = this.item(id); return it ? it.name : ''; },
};

var GameState = {
  switches: {},
  variables: {},
  system: null,      /* runtime copies of system music / se */
  saveAllowed: true,
  menuAllowed: true,
  teleportAllowed: true,
  escapeAllowed: true,
  atbMode: 0,        /* 2003 ATB: 0 active (gauges run while choosing), 1 wait */
  frame: 0,
  playTime: 0,       /* frames */
  saveCount: 0,
  message: { transparent: false, position: 2, fixed: false, continueEvents: false, face: '', faceIndex: 0, faceRight: false, faceFlip: false },
  encounterSteps: 0,
  memorized: null,
  transitions: [],   /* ChangeScreenTransitions: teleport out/in, battle start out/in, battle end out/in */

  newGame: function () {
    this.switches = {};
    this.variables = {};
    var sys = Loader.db.system;
    this.system = {
      title_music: sys.title_music, battle_music: sys.battle_music, battle_end_music: sys.battle_end_music,
      inn_music: sys.inn_music, gameover_music: sys.gameover_music,
      cursor_se: sys.cursor_se, decision_se: sys.decision_se, cancel_se: sys.cancel_se, buzzer_se: sys.buzzer_se,
      battle_se: sys.battle_se, escape_se: sys.escape_se, enemy_attack_se: sys.enemy_attack_se,
      enemy_damaged_se: sys.enemy_damaged_se, actor_damaged_se: sys.actor_damaged_se, dodge_se: sys.dodge_se,
      enemy_death_se: sys.enemy_death_se, item_se: sys.item_se, system_name: sys.system_name,
    };
    this.transitions = [sys.transition_out, sys.transition_in, sys.battle_start_fadeout, sys.battle_start_fadein,
      sys.battle_end_fadeout, sys.battle_end_fadein];
    this.saveAllowed = true; this.menuAllowed = true; this.teleportAllowed = true; this.escapeAllowed = true;
    this.playTime = 0;
    this.message = { transparent: false, position: 2, fixed: false, continueEvents: false, face: '', faceIndex: 0, faceRight: false, faceFlip: false };
    Party.init();
    Pictures.clear();
    Screen.reset();
  },

  sw: function (id) { return !!this.switches[id]; },
  setSw: function (id, v) { this.switches[id] = !!v; },
  v: function (id) { return this.variables[id] | 0; },
  setV: function (id, val) {
    var limit = Loader.is2k3() ? 9999999 : 999999;   /* RPG_RT variable range per engine */
    val = Math.max(-limit, Math.min(limit, val | 0));
    this.variables[id] = val;
  },

  /* ---- save / load ---- */
  serialize: function (mapState) {
    return {
      version: 1,
      time: Date.now(),
      playTime: this.playTime,
      switches: this.switches,
      variables: this.variables,
      system: this.system,
      transitions: this.transitions,
      atbMode: this.atbMode,
      flags: { save: this.saveAllowed, menu: this.menuAllowed, teleport: this.teleportAllowed, escape: this.escapeAllowed },
      message: this.message,
      party: Party.serialize(),
      map: mapState,
      bgm: Audio_.bgmCurrent || null,
      screen: Screen.serialize(),
      pictures: Pictures.serialize(),
      title: this.saveTitleInfo(),
    };
  },

  /* what the load screen shows for a slot */
  saveTitleInfo: function () {
    var lead = Party.members[0];
    return {
      leader: lead ? lead.name : '', level: lead ? lead.level : 0, hp: lead ? lead.hp : 0,
      faces: Party.members.map(function (a) { return { name: a.faceName, index: a.faceIndex }; }),
    };
  },

  save: function (slot, mapState) {
    this.saveCount++;
    var data = this.serialize(mapState);
    try { localStorage.setItem(CONFIG.SAVE_PREFIX + slot, JSON.stringify(data)); return true; }
    catch (e) { console.error('save failed', e); return false; }
  },

  readSlot: function (slot) {
    try {
      var raw = localStorage.getItem(CONFIG.SAVE_PREFIX + slot);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  },

  restore: function (data) {
    this.switches = data.switches || {};
    this.variables = data.variables || {};
    this.system = data.system;
    if (data.transitions) this.transitions = data.transitions;
    this.atbMode = data.atbMode || 0;
    this.saveAllowed = data.flags.save; this.menuAllowed = data.flags.menu;
    this.teleportAllowed = data.flags.teleport; this.escapeAllowed = data.flags.escape;
    this.message = data.message;
    this.playTime = data.playTime || 0;
    Party.restore(data.party);
    Screen.restore(data.screen);
    Pictures.restore(data.pictures);
  },

  saveSettings: function () {
    try { localStorage.setItem(CONFIG.SETTINGS_KEY, JSON.stringify({ lang: I18N.lang })); } catch (e) {}
  },
  loadSettings: function () {
    try { return JSON.parse(localStorage.getItem(CONFIG.SETTINGS_KEY) || '{}'); } catch (e) { return {}; }
  },
};

/* RNG helpers. Math.random by default; seed(n) switches to mulberry32 so tests and
   screenshots are reproducible (?seed=42, see debug_start.js). */
var Rand = {
  next: Math.random,
  /** @param {number} n 32-bit seed */
  seed: function (n) {
    var a = n >>> 0;
    this.next = function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  },
  int: function (min, max) { return min + Math.floor(this.next() * (max - min + 1)); },
  chance: function (pct) { return this.next() * 100 < pct; },
};
