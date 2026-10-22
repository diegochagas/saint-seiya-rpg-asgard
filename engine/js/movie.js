/* PlayMovie (11560): plays the converted WebM in a <video> laid over the game canvas.
   Confirm or cancel skips it; a missing file or a blocked autoplay just continues the event. */
var MoviePlayer = {
  video: null,

  /** @param {string} name movie name from the event @returns {boolean} true when playback started */
  play: function (name) {
    var url = Loader.audioUrl('movie', name);
    if (!url) { console.warn('movie not converted: ' + name); return false; }
    var v = this.makeVideo();
    v.src = url;
    v.style.display = 'block';
    Audio_.pauseBgm();
    v.play().catch(function (err) { console.warn('movie playback blocked', err); MoviePlayer.stop(); });
    return true;
  },
  makeVideo: function () {
    if (this.video) return this.video;
    var v = document.createElement('video');
    v.id = 'movie';
    v.playsInline = true;
    v.addEventListener('ended', function () { MoviePlayer.stop(); });
    document.getElementById('stage').appendChild(v);
    this.video = v;
    return v;
  },
  playing: function () {
    if (!this.video || this.video.style.display !== 'block') return false;
    if (Input.triggered('ok') || Input.triggered('cancel')) { this.stop(); return false; }
    return true;
  },
  stop: function () {
    if (!this.video) return;
    this.video.pause();
    this.video.style.display = 'none';
    this.video.removeAttribute('src');
    Audio_.resumeBgm();
  },
};
