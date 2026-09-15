/* Party: members, all actors registry, inventory and gold. */
var Party = {
  actors: {},      /* id -> Actor (every actor exists, in party or not) */
  members: [],     /* Actor list in party order */
  items: {},       /* itemId -> count */
  gold: 0,
  steps: 0,

  init: function () {
    this.actors = {};
    this.members = [];
    this.items = {};
    this.gold = 0;
    this.steps = 0;
    for (var id in Loader.db.actors) this.actors[id] = new Actor(parseInt(id, 10));
    var start = Loader.db.system.party || [];
    for (var i = 0; i < start.length; i++) this.addActor(start[i]);
  },

  actor: function (id) { return this.actors[id]; },
  size: function () { return this.members.length; },
  has: function (id) { return this.members.some(function (a) { return a.id === id; }); },
  addActor: function (id) {
    if (this.has(id) || this.members.length >= 4) return;
    var a = this.actors[id];
    if (a) this.members.push(a);
  },
  removeActor: function (id) {
    this.members = this.members.filter(function (a) { return a.id !== id; });
  },
  leader: function () { return this.members[0]; },
  alive: function () { return this.members.filter(function (a) { return !a.isDead(); }); },
  allDead: function () { return this.members.length > 0 && this.alive().length === 0; },

  itemCount: function (id) { return this.items[id] | 0; },
  addItem: function (id, n) {
    if (!DB.item(id)) return;
    var c = (this.items[id] | 0) + n;
    c = Math.max(0, Math.min(99, c));
    if (c === 0) delete this.items[id]; else this.items[id] = c;
  },
  hasItem: function (id) { return this.itemCount(id) > 0; },
  equippedCount: function (id) {
    var n = 0;
    for (var k in this.actors) { var a = this.actors[k]; for (var s = 0; s < 5; s++) if (a.equip[s] === id) n++; }
    return n;
  },
  itemIds: function () {
    var self = this;
    return Object.keys(this.items).map(function (k) { return parseInt(k, 10); }).filter(function (id) { return self.items[id] > 0; }).sort(function (a, b) { return a - b; });
  },
  changeGold: function (n) { this.gold = Math.max(0, Math.min(999999, this.gold + n)); },

  averageLevel: function () {
    if (!this.members.length) return 1;
    return Math.floor(this.members.reduce(function (s, a) { return s + a.level; }, 0) / this.members.length);
  },

  serialize: function () {
    var actors = {};
    for (var k in this.actors) actors[k] = this.actors[k].serialize();
    return { actors: actors, members: this.members.map(function (a) { return a.id; }), items: this.items, gold: this.gold, steps: this.steps };
  },
  restore: function (s) {
    this.actors = {};
    for (var k in s.actors) this.actors[k] = Actor.restore(s.actors[k]);
    for (var id in Loader.db.actors) if (!this.actors[id]) this.actors[id] = new Actor(parseInt(id, 10));
    var self = this;
    this.members = s.members.map(function (id) { return self.actors[id]; }).filter(Boolean);
    this.items = s.items || {};
    this.gold = s.gold | 0;
    this.steps = s.steps | 0;
  },
};
