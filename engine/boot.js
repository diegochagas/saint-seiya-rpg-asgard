/* Loads the engine's script-tag files in order (no build step). A game's index.html includes its
   own game/*.js first, then this file, so adding or splitting an engine file only touches this
   list. Scripts inserted with async = false still run one after another in list order. */
var ENGINE_SCRIPTS = [
  'js/config.js', 'js/i18n.js', 'js/loader.js', 'js/input.js', 'js/audio.js', 'js/gfx.js', 'js/font.js',
  'js/window.js', 'js/state.js', 'js/actor.js', 'js/actor_growth.js', 'js/party.js', 'js/character.js',
  'js/map_event.js', 'js/map.js', 'js/map_tiles.js', 'js/screen.js', 'js/message.js', 'js/movie.js',
  'js/events/interpreter.js', 'js/events/conditions.js', 'js/events/commands_message.js',
  'js/events/commands_flow.js', 'js/events/commands_party.js', 'js/events/commands_map.js',
  'js/events/commands_scene.js', 'js/events/commands_system.js',
  'js/battle_anim.js', 'js/scene_title.js', 'js/scene_map.js', 'js/scene_menu.js', 'js/scene_menu_item.js',
  'js/scene_menu_skill.js', 'js/scene_menu_equip.js', 'js/scene_menu_status.js', 'js/scene_shop.js',
  /* RPG Maker 2003 side-view ATB battle */
  'js/battle/rules.js', 'js/battle/enemy.js', 'js/battle/layout.js', 'js/battle/sprites.js', 'js/battle/windows.js',
  'js/battle/ai.js', 'js/battle/atb.js', 'js/battle/effects.js', 'js/battle/actions.js', 'js/battle/action_parts.js',
  'js/battle/events.js', 'js/battle/input.js', 'js/battle/input_commands.js', 'js/battle/input_targets.js',
  'js/battle/scene.js', 'js/battle/scene_loop.js', 'js/battle/scene_flow.js',
  /* RPG Maker 2000 front-view battle */
  'js/battle2k/rules.js', 'js/battle2k/enemy.js', 'js/battle2k/scene.js', 'js/battle2k/sprites.js',
  'js/battle2k/messages.js', 'js/battle2k/input.js', 'js/battle2k/targets.js', 'js/battle2k/ai.js',
  'js/battle2k/actions.js', 'js/battle2k/skills.js', 'js/battle2k/outcome.js',
  'js/scene_file.js', 'js/scene_gameover.js', 'js/game.js', 'js/debug_start.js', 'js/main.js',
];

(function () {
  var here = document.currentScript, base = here.src.replace(/boot\.js(\?.*)?$/, '');
  ENGINE_SCRIPTS.forEach(function (file) {
    var tag = document.createElement('script');
    tag.src = base + file;
    tag.async = false;
    here.parentNode.appendChild(tag);
  });
})();
