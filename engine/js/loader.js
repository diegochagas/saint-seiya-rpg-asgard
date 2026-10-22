/* Loads the converted game data (JSON) and caches images / audio by manifest name.
   Maps load on demand (a game can have hundreds) and the teleport targets of a map are prefetched. */
var TELEPORT_CODE = 10810;
var NON_IMAGE_CATEGORIES = { music: 1, sound: 1, movie: 1, engine: 1 };

var Loader = {
  db: null,
  tree: null,
  manifest: null,
  maps: {},
  mapRequests: {},
  images: {},
  fonts: {},
  progress: { done: 0, total: 0 },

  fetchJSON: function (url) {
    return fetch(url).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status + ' for ' + url);
      return r.json();
    });
  },

  loadImage: function (url) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () { resolve(img); };
      img.onerror = function () { reject(new Error('image ' + url)); };
      img.src = url;
    });
  },

  /** @returns {string} "2k" or "2k3", written by tools/convert.py */
  engine: function () { return (this.manifest && this.manifest.engine) || '2k'; },
  is2k3: function () { return this.engine() === '2k3'; },

  imageJobs: function () {
    var self = this, jobs = [];
    Object.keys(this.manifest).forEach(function (cat) {
      if (NON_IMAGE_CATEGORIES[cat]) return;
      Object.keys(self.manifest[cat]).forEach(function (name) {
        jobs.push(self.loadImage(self.manifest[cat][name].file).then(function (img) {
          self.images[cat + '/' + name.toLowerCase()] = img;
        }));
      });
    });
    return jobs;
  },
  fontJobs: function () {
    var self = this;
    return ['rm2000', 'rmg2000'].map(function (f) {
      return Promise.all([self.loadImage('assets/font/' + f + '.png'), self.fetchJSON('assets/font/' + f + '.json')])
        .then(function (r) { self.fonts[f] = { img: r[0], metrics: r[1] }; });
    });
  },
  trackProgress: function (jobs, onProgress) {
    var self = this;
    this.progress.total = jobs.length;
    this.progress.done = 0;
    return Promise.all(jobs.map(function (p) {
      return p.then(function () {
        self.progress.done++;
        if (onProgress) onProgress(self.progress.done, self.progress.total);
      });
    }));
  },

  /* Load database, map tree, manifest, fonts and every image referenced by the manifest. */
  loadAll: function (onProgress) {
    var self = this;
    var D = CONFIG.DATA_DIR;
    return Promise.all([
      this.fetchJSON(D + 'database.json'),
      this.fetchJSON(D + 'maptree.json'),
      this.fetchJSON(D + 'manifest.json'),
    ]).then(function (res) {
      self.db = res[0];
      self.tree = res[1];
      self.manifest = res[2];
      var start = self.tree.start.party_map_id;
      var jobs = self.imageJobs().concat(self.fontJobs(), [self.ensureMap(start)]);
      return self.trackProgress(jobs, onProgress);
    });
  },

  /** @param {number} id map id @returns {Promise<object>} the map, fetched once */
  ensureMap: function (id) {
    var self = this;
    if (this.maps[id]) return Promise.resolve(this.maps[id]);
    if (!this.mapRequests[id]) {
      var n = ('0000' + id).slice(-4);
      this.mapRequests[id] = this.fetchJSON(CONFIG.DATA_DIR + 'maps/map' + n + '.json').then(function (m) {
        self.maps[id] = m;
        return m;
      });
    }
    return this.mapRequests[id];
  },
  /* Fetch in the background every map this one can teleport to, so transfers rarely wait. */
  prefetchTeleportTargets: function (map) {
    var self = this;
    Object.keys(map.events).forEach(function (k) {
      var pages = map.events[k].pages;
      Object.keys(pages).forEach(function (pk) {
        pages[pk].event_commands.forEach(function (c) {
          if (c.code === TELEPORT_CODE && self.tree.maps[c.params[0]]) self.ensureMap(c.params[0]).catch(function () {});
        });
      });
    });
  },

  image: function (cat, name) {
    if (!name) return null;
    return this.images[cat + '/' + String(name).toLowerCase()] || null;
  },
  imageEntry: function (cat, name) {
    var m = this.manifest[cat];
    return m && name ? m[name] || null : null;
  },

  audioUrl: function (cat, name) {
    if (!name || name === '(OFF)') return null;
    var m = this.manifest[cat];
    if (!m) return null;
    if (m[name]) return m[name];
    var lower = name.toLowerCase();
    for (var k in m) if (k.toLowerCase() === lower) return m[k];
    return null;
  },

  map: function (id) { return this.maps[id] || null; },
};
