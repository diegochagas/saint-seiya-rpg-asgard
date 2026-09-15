/* Keyboard + touch input with RPG Maker style "triggered / pressed / repeat" queries. */
var Input = {
  KEYS: {
    ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
    KeyW: 'up', KeyS: 'down', KeyA: 'left', KeyD: 'right',
    KeyZ: 'ok', Enter: 'ok', Space: 'ok', NumpadEnter: 'ok',
    KeyX: 'cancel', Escape: 'cancel', Backspace: 'cancel', KeyC: 'cancel',
    ShiftLeft: 'shift', ShiftRight: 'shift',
    Numpad8: 'up', Numpad2: 'down', Numpad4: 'left', Numpad6: 'right',
  },
  KEYS_BY_KEY: {
    ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
    w: 'up', s: 'down', a: 'left', d: 'right', W: 'up', S: 'down', A: 'left', D: 'right',
    z: 'ok', Z: 'ok', Enter: 'ok', ' ': 'ok', x: 'cancel', X: 'cancel', Escape: 'cancel', Backspace: 'cancel',
    c: 'cancel', C: 'cancel', Shift: 'shift',
  },
  keyOf: function (e) { return this.KEYS[e.code] || this.KEYS_BY_KEY[e.key] || null; },
  state: {},      /* key -> pressed */
  latch: {},      /* key pressed since last update (survives same-frame keyup) */
  frames: {},     /* key -> number of frames held */
  prev: {},
  anyKeyFrame: false,
  onAny: null,

  init: function () {
    var self = this;
    window.addEventListener('keydown', function (e) {
      var k = self.keyOf(e);
      if (k) { e.preventDefault(); self.state[k] = true; self.latch[k] = true; }
      self.anyKeyFrame = true;
      if (self.onAny) self.onAny();
    });
    window.addEventListener('keyup', function (e) {
      var k = self.keyOf(e);
      if (k) { e.preventDefault(); self.state[k] = false; }
    });
    window.addEventListener('blur', function () { self.state = {}; });
    var btns = document.querySelectorAll('.ctrl-btn');
    Array.prototype.forEach.call(btns, function (b) {
      var k = b.getAttribute('data-key');
      var down = function (e) { e.preventDefault(); self.state[k] = true; self.latch[k] = true; b.classList.add('pressed'); if (self.onAny) self.onAny(); };
      var up = function (e) { e.preventDefault(); self.state[k] = false; b.classList.remove('pressed'); };
      b.addEventListener('touchstart', down, { passive: false });
      b.addEventListener('touchend', up, { passive: false });
      b.addEventListener('touchcancel', up, { passive: false });
      b.addEventListener('mousedown', down);
      b.addEventListener('mouseup', up);
      b.addEventListener('mouseleave', up);
    });
  },

  /* call once per frame */
  update: function () {
    for (var k in this.state) {
      if (this.state[k] || this.latch[k]) this.frames[k] = (this.frames[k] || 0) + 1;
      else this.frames[k] = 0;
    }
    this.latch = {};
    this.anyKeyFrame = false;
  },

  pressed: function (k) { return (this.frames[k] || 0) > 0; },
  /* mark a press as handled so no other window reacts to it this frame */
  consume: function (k) { if ((this.frames[k] || 0) > 0) this.frames[k] = Math.max(2, this.frames[k]); },
  triggered: function (k) { return this.frames[k] === 1; },
  /* true on first press and then every 4 frames after a 12 frame delay (menu cursor repeat) */
  repeated: function (k) {
    var f = this.frames[k] || 0;
    return f === 1 || (f >= 12 && (f - 12) % 4 === 0);
  },
  dir4: function () {
    if (this.pressed('down')) return DIR.DOWN;
    if (this.pressed('left')) return DIR.LEFT;
    if (this.pressed('right')) return DIR.RIGHT;
    if (this.pressed('up')) return DIR.UP;
    return -1;
  },
  clear: function () { this.state = {}; this.frames = {}; this.latch = {}; },
};
