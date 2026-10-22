/* BGM / SE playback with HTMLAudio. Music loops whole (RPG Maker 2000/2003 behaviour). */
var Audio_ = {
  unlocked: false,
  bgm: null,
  bgmName: null,
  bgmVolume: 100,
  bgmFade: null,
  memorized: null,
  sePool: {},
  muted: false,
  masterVolume: 1,

  init: function () {
    var self = this;
    var unlock = function () {
      if (self.unlocked) return;
      self.unlocked = true;
      if (self.bgm && self.bgm.paused) self.bgm.play().catch(function () {});
    };
    window.addEventListener('keydown', unlock);
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('touchstart', unlock);
  },

  /* music: {name, fadein, volume, tempo, balance} */
  playBgm: function (music) {
    if (!music || !music.name || music.name === '(OFF)') return;
    var url = Loader.audioUrl('music', music.name);
    if (!url) return;
    if (this.bgmName === music.name && this.bgm && !this.bgm.paused && !this.bgmFade) {
      this.bgmVolume = music.volume == null ? 100 : music.volume;
      this.applyVolume();
      return;
    }
    this.stopBgm();
    var a = new Audio(url);
    a.loop = true;
    this.bgm = a;
    this.bgmName = music.name;
    this.bgmVolume = music.volume == null ? 100 : music.volume;
    this.bgmCurrent = { name: music.name, fadein: music.fadein || 0, volume: this.bgmVolume, tempo: music.tempo || 100, balance: music.balance || 50 };
    var fadein = music.fadein || 0;
    if (fadein > 0) {
      this.bgmFade = { from: 0, to: 1, frames: Math.round(fadein / 1000 * CONFIG.FPS), t: 0 };
      a.volume = 0;
    } else {
      this.applyVolume();
    }
    if (this.unlocked) a.play().catch(function () {});
  },

  applyVolume: function () {
    if (!this.bgm) return;
    var v = (this.bgmVolume / 100) * this.masterVolume * (this.muted ? 0 : 1);
    this.bgm.volume = Math.max(0, Math.min(1, v));
  },

  stopBgm: function () {
    if (this.bgm) { try { this.bgm.pause(); } catch (e) {} }
    this.bgm = null;
    this.bgmName = null;
    this.bgmFade = null;
  },

  fadeOutBgm: function (ms) {
    if (!this.bgm) return;
    if (ms <= 0) { this.stopBgm(); return; }
    this.bgmFade = { from: 1, to: 0, frames: Math.round(ms / 1000 * CONFIG.FPS), t: 0, stopAtEnd: true };
  },

  /* PlayMovie silences the music and brings it back afterwards */
  pauseBgm: function () { if (this.bgm) this.bgm.pause(); },
  resumeBgm: function () { if (this.bgm && this.unlocked) this.bgm.play().catch(function () {}); },

  memorizeBgm: function () { this.memorized = this.bgmCurrent ? Object.assign({}, this.bgmCurrent) : null; },
  playMemorizedBgm: function () { if (this.memorized) this.playBgm(this.memorized); },

  update: function () {
    if (this.bgmFade && this.bgm) {
      var f = this.bgmFade;
      f.t++;
      var r = f.frames <= 0 ? 1 : Math.min(1, f.t / f.frames);
      var vol = f.from + (f.to - f.from) * r;
      this.bgm.volume = Math.max(0, Math.min(1, vol * (this.bgmVolume / 100) * this.masterVolume * (this.muted ? 0 : 1)));
      if (r >= 1) {
        if (f.stopAtEnd) this.stopBgm();
        this.bgmFade = null;
      }
    }
  },

  /* sound: {name, volume, tempo, balance} */
  playSe: function (sound) {
    if (!sound || !sound.name || sound.name === '(OFF)' || !this.unlocked) return;
    var url = Loader.audioUrl('sound', sound.name);
    if (!url) return;
    var a = new Audio(url);
    var vol = (sound.volume == null ? 100 : sound.volume) / 100;
    a.volume = Math.max(0, Math.min(1, vol * this.masterVolume * (this.muted ? 0 : 1)));
    if (sound.tempo && sound.tempo !== 100) {
      try { a.playbackRate = sound.tempo / 100; a.preservesPitch = false; } catch (e) {}
    }
    a.play().catch(function () {});
  },

  /* system sound effects by key: cursor, decision, cancel, buzzer, ... */
  sys: function (key) {
    var current = GameState.system || Loader.db.system;   /* ChangeSystemSFX edits the runtime copy */
    var s = current[key + '_se'] || Loader.db.system[key + '_se'];
    if (s) this.playSe(s);
  },
};
