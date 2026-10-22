/* EN/PT language layer for the runtime's own UI strings.
   The game's dialogue, items and menu terms come from the original database (Portuguese);
   the runtime can override the database "terms" with English when EN is active. */
var I18N = {
  lang: 'pt',

  init: function (saved) {
    if (saved === 'en' || saved === 'pt') { this.lang = saved; return; }
    var nav = (typeof navigator !== 'undefined' && navigator.language) || 'pt';
    this.lang = /^pt/i.test(nav) ? 'pt' : 'en';
  },

  toggle: function () { this.lang = this.lang === 'en' ? 'pt' : 'en'; },

  t: function (key) {
    var node = this.S[key];
    if (!node) return key;
    return node[this.lang] != null ? node[this.lang] : node.pt;
  },

  /* database term override: the EN term when EN is active, else null */
  term: function (key) {
    if (this.lang !== 'en') return null;
    var v = TERMS_EN[key];
    return v == null ? null : v;
  },
  /* PT replacement for database terms the author never translated (Japanese defaults) */
  ptFallback: function (key) {
    var v = TERMS_PT_FALLBACK[key];
    return v == null ? null : v;
  },

  S: {
    loading:      { en: 'Loading…', pt: 'Carregando…' },
    loadError:    { en: 'Failed to load game data. Serve this folder over HTTP.', pt: 'Falha ao carregar os dados. Sirva esta pasta por HTTP.' },
    help:         { en: 'Arrows/WASD: move · Z/Enter/Space: confirm · X/Esc: cancel/menu · Shift: run',
                    pt: 'Setas/WASD: mover · Z/Enter/Espaço: confirmar · X/Esc: cancelar/menu · Shift: correr' },
    tapToStart:   { en: 'Tap or press a key to enable audio', pt: 'Toque ou aperte uma tecla para ativar o áudio' },
    slotEmpty:    { en: 'Empty', pt: 'Vazio' },
    saved:        { en: 'Game saved.', pt: 'Jogo salvo.' },
    noSaves:      { en: 'No saved games.', pt: 'Nenhum jogo salvo.' },
    quitConfirm:  { en: 'Return to title screen?', pt: 'Voltar à tela de título?' },
    languageName: { en: 'English', pt: 'Português' },
    exited:       { en: 'Game closed. You can close this tab.', pt: 'Jogo encerrado. Pode fechar esta aba.' },
    statusName:   { en: 'Name', pt: 'Nome' },
    statusClass:  { en: 'Class', pt: 'Classe' },
    statusTitle:  { en: 'Title', pt: 'Título' },
    statusState:  { en: 'State', pt: 'Estado' },
  }
};
