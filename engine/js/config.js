/* Global constants for the RPG Maker 2000/2003 style runtime. */

/**
 * localStorage key for this game. GAME_INFO.id comes from the game repo's game/config.js, loaded
 * before the engine: two games served from one origin (GitHub Pages) must not share saves.
 * @param {string} suffix @returns {string} example: gameStorageKey('_settings') === 'holy_avenger_settings'
 */
function gameStorageKey(suffix) {
  if (typeof GAME_INFO === 'undefined' || !GAME_INFO.id) {
    throw new Error('GAME_INFO.id is missing: define it in game/config.js, e.g. var GAME_INFO = { id: "my_game" }');
  }
  return GAME_INFO.id + suffix;
}

var CONFIG = {
  SCREEN_W: 320,
  SCREEN_H: 240,
  TILE: 16,
  FPS: 60,
  /* movement sub-steps per tile (RPG_RT works in 1/16 pixel units: 16 px * 16) */
  STEP: 256,
  FONT_ADVANCE: 6,    /* half-width glyph advance in px */
  LINE_HEIGHT: 16,
  SAVE_PREFIX: gameStorageKey('_save_'),
  SETTINGS_KEY: gameStorageKey('_settings'),
  MAX_SAVES: 15,
  DATA_DIR: 'data/',
};

/* Tile id blocks (see EasyRPG map_data.h) */
var TILES = {
  BLOCK_A: 0, BLOCK_B: 2000, BLOCK_C: 3000, BLOCK_D: 4000, BLOCK_E: 5000, BLOCK_F: 10000,
  BLOCK_D_STRIDE: 50,
  INDEX_A: 0, INDEX_B: 2, INDEX_C: 3, INDEX_D: 6, INDEX_E: 18, INDEX_F: 162,
  PASS_DOWN: 1, PASS_LEFT: 2, PASS_RIGHT: 4, PASS_UP: 8, PASS_ABOVE: 16, PASS_WALL: 32, PASS_COUNTER: 64,
};

var DIR = { UP: 0, RIGHT: 1, DOWN: 2, LEFT: 3 };
var DIR_DX = [0, 1, 0, -1];
var DIR_DY = [-1, 0, 1, 0];
var DIR_PASS = [TILES.PASS_UP, TILES.PASS_RIGHT, TILES.PASS_DOWN, TILES.PASS_LEFT];
