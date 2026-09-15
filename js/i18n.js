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

  /* database term override: returns the EN term when EN is active, else null */
  term: function (key) {
    if (this.lang !== 'en') return null;
    var v = this.TERMS_EN[key];
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
  },

  /* English replacements for the database "terms" (RPG Maker 2000 vocabulary). */
  TERMS_EN: {
    encounter: ' appeared!', special_combat: 'Special combat', escape_success: 'Escaped!',
    escape_failure: 'Cannot escape!', victory: 'Victory!', defeat: 'Defeat…',
    exp_received: ' EXP received', gold_recieved_a: '', gold_recieved_b: ' gold found',
    item_recieved: ' found', attacking: ' attacks', enemy_critical: 'Critical hit!',
    actor_critical: 'Critical hit!', defending: ' defends', observing: ' watches',
    focus: ' focuses', autodestruction: ' self-destructs', enemy_escape: ' flees',
    enemy_transform: ' transforms', enemy_damaged: ' takes ', enemy_undamaged: ' takes no damage',
    actor_damaged: ' takes ', actor_undamaged: ' takes no damage', skill_failure_a: ' fails',
    skill_failure_b: ' fails', skill_failure_c: ' fails', dodge: ' dodges', use_item: ' uses ',
    hp_recovery: ' recovers ', parameter_increase: ' rises', parameter_decrease: ' falls',
    enemy_hp_absorbed: ' absorbed', actor_hp_absorbed: ' absorbed', resistance_increase: ' up',
    resistance_decrease: ' down', level_up: ' reached!', skill_learned: ' learned',
    shop_greeting1: 'Welcome, Saint! What do you need?', shop_regreeting1: 'Anything else?',
    shop_buy1: 'Buy', shop_sell1: 'Sell', shop_leave1: 'Leave', shop_buy_select1: 'What will you buy?',
    shop_buy_number1: 'How many?', shop_purchased1: 'Thank you!', shop_sell_select1: 'What will you sell?',
    shop_sell_number1: 'How many?', shop_sold1: 'Thank you!',
    shop_greeting2: 'Welcome! What do you need?', shop_regreeting2: 'Anything else?',
    shop_buy2: 'Buy', shop_sell2: 'Sell', shop_leave2: 'Leave', shop_buy_select2: 'What will you buy?',
    shop_buy_number2: 'How many?', shop_purchased2: 'Thank you!', shop_sell_select2: 'What will you sell?',
    shop_sell_number2: 'How many?', shop_sold2: 'Thank you!',
    shop_greeting3: 'Welcome! What do you need?', shop_regreeting3: 'Anything else?',
    shop_buy3: 'Buy', shop_sell3: 'Sell', shop_leave3: 'Leave', shop_buy_select3: 'What will you buy?',
    shop_buy_number3: 'How many?', shop_purchased3: 'Thank you!', shop_sell_select3: 'What will you sell?',
    shop_sell_number3: 'How many?', shop_sold3: 'Thank you!',
    inn_a_greeting_1: 'A night here costs ', inn_a_greeting_2: ' gold.', inn_a_greeting_3: 'Will you stay?',
    inn_a_accept: 'Yes', inn_a_cancel: 'No',
    inn_b_greeting_1: 'A night here costs ', inn_b_greeting_2: ' gold.', inn_b_greeting_3: 'Will you stay?',
    inn_b_accept: 'Yes', inn_b_cancel: 'No',
    possessed_items: 'Owned', equipped_items: 'Equipped', gold: ' G',
    battle_fight: 'Fight', battle_auto: 'Auto', battle_escape: 'Escape',
    command_attack: 'Attack', command_defend: 'Defend', command_item: 'Item', command_skill: 'Skill',
    menu_equipment: 'Equipment', menu_save: 'Save', menu_quit: 'Quit',
    new_game: 'New Game', load_game: 'Load Game', exit_game: 'Exit',
    level: 'Level', health_points: 'HP', spirit_points: 'Cosmo', normal_status: 'Normal',
    exp_short: 'EXP', lvl_short: 'Lv', hp_short: 'HP', sp_short: 'CO', sp_cost: 'Cost',
    attack: 'Attack', defense: 'Defense', spirit: 'Mind', agility: 'Agility',
    weapon: 'Technique', shield: 'Shield', armor: 'Cloth', helmet: 'Helmet', accessory: 'Accessory',
    save_game_message: 'Save to which slot?', load_game_message: 'Load which slot?', file: 'Slot',
    exit_game_message: 'Quit the game?', yes: 'Yes', no: 'No',
  },
};
