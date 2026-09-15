/* Global game state: switches, variables, system settings, save/load. */

var Terms = {
  get: function (key) {
    var en = I18N.term(key);
    if (en != null) return en;
    var v = Loader.db.terms[key];
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
  frame: 0,
  playTime: 0,       /* frames */
  saveCount: 0,
  message: { transparent: false, position: 2, fixed: false, continueEvents: false, face: '', faceIndex: 0, faceRight: false, faceFlip: false },
  encounterSteps: 0,
  memorized: null,

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
    val = Math.max(-999999, Math.min(999999, val | 0));
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
      flags: { save: this.saveAllowed, menu: this.menuAllowed, teleport: this.teleportAllowed, escape: this.escapeAllowed },
      message: this.message,
      party: Party.serialize(),
      map: mapState,
      bgm: Audio_.bgmCurrent || null,
      screen: Screen.serialize(),
      pictures: Pictures.serialize(),
      title: {
        leader: Party.members[0] ? Party.members[0].name : '',
        level: Party.members[0] ? Party.members[0].level : 0,
        hp: Party.members[0] ? Party.members[0].hp : 0,
        faces: Party.members.map(function (a) { return { name: a.faceName, index: a.faceIndex }; }),
      },
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

/* Deterministic-enough RNG helpers */
var Rand = {
  int: function (min, max) { return min + Math.floor(Math.random() * (max - min + 1)); },
  chance: function (pct) { return Math.random() * 100 < pct; },
};
