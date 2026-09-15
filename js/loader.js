/* Loads the converted game data (JSON) and caches images / audio by manifest name. */
var Loader = {
  db: null,
  tree: null,
  manifest: null,
  maps: {},
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

  /* Load database, map tree, manifest and every asset referenced by the manifest. */
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
      var jobs = [];
      Object.keys(self.manifest).forEach(function (cat) {
        if (cat === 'music' || cat === 'sound') return;
        Object.keys(self.manifest[cat]).forEach(function (name) {
          var entry = self.manifest[cat][name];
          jobs.push(self.loadImage(entry.file).then(function (img) {
            self.images[cat + '/' + name.toLowerCase()] = img;
          }));
        });
      });
      ['rm2000', 'rmg2000'].forEach(function (f) {
        jobs.push(Promise.all([
          self.loadImage('assets/font/' + f + '.png'),
          self.fetchJSON('assets/font/' + f + '.json'),
        ]).then(function (r) { self.fonts[f] = { img: r[0], metrics: r[1] }; }));
      });
      var mapIds = Object.keys(self.tree.maps).filter(function (id) { return self.tree.maps[id].type === 1; });
      mapIds.forEach(function (id) {
        var n = ('0000' + id).slice(-4);
        jobs.push(self.fetchJSON(D + 'maps/map' + n + '.json').then(function (m) { self.maps[id] = m; }));
      });
      self.progress.total = jobs.length;
      self.progress.done = 0;
      return Promise.all(jobs.map(function (p) {
        return p.then(function () {
          self.progress.done++;
          if (onProgress) onProgress(self.progress.done, self.progress.total);
        });
      }));
    });
  },

  image: function (cat, name) {
    if (!name) return null;
    return this.images[cat + '/' + String(name).toLowerCase()] || null;
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
