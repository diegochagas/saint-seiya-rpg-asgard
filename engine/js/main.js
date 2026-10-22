/* Boot: load data, wire the top bar, start the loop. */
(function () {
  var settings = GameState.loadSettings();
  I18N.init(settings.lang);

  function applyLang() {
    document.getElementById('btn-lang').textContent = I18N.lang === 'pt' ? 'EN' : 'PT';
    document.getElementById('help').textContent = I18N.t('help');
    document.documentElement.lang = I18N.lang === 'pt' ? 'pt-BR' : 'en';
  }
  applyLang();

  document.getElementById('btn-lang').addEventListener('click', function () {
    I18N.toggle();
    GameState.saveSettings();
    applyLang();
    Game.scenes.forEach(function (s) { if (s.onLanguageChange) s.onLanguageChange(); });
  });
  document.getElementById('btn-fullscreen').addEventListener('click', function () {
    var el = document.getElementById('wrapper');
    if (document.fullscreenElement) document.exitFullscreen();
    else if (el.requestFullscreen) el.requestFullscreen();
  });

  Gfx.init();
  Input.init();
  Audio_.init();
  Game.init();

  var overlay = document.getElementById('overlay');
  var loading = document.getElementById('loading');
  loading.textContent = I18N.t('loading');

  Loader.loadAll(function (done, total) {
    loading.textContent = I18N.t('loading') + ' ' + Math.floor(done / total * 100) + '%';
  }).then(function () {
    Gfx.setSystem(Loader.db.system.system_name);
    MessageWindow.init();
    overlay.classList.add('hidden');
    DebugStart.boot(new URLSearchParams(location.search)) || Game.push(new SceneTitle());
    Game.start();
  }).catch(function (err) {
    console.error(err);
    loading.textContent = I18N.t('loadError') + ' (' + err.message + ')';
  });
})();
