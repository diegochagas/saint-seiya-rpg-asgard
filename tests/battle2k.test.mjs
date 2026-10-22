// RPG Maker 2000 front-view battle: formulas, enemy AI conditions and a full turn run headless.
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadScripts, fakeLoader } from "../engine/testing/harness.mjs";

const BATTLE2K_FILES = ["rules", "enemy", "scene", "sprites", "messages", "input", "targets", "ai", "actions", "skills", "outcome"]
  .map((f) => `engine/js/battle2k/${f}.js`);
const noVariance = (a) => a;   // rand(min, max) -> min

function battler(stats) {
  return { atk: () => stats.atk, def: () => stats.def, spi: () => stats.spi || 0, agi: () => stats.agi || 50,
    defending: !!stats.defending, attributeRate: (id) => (stats.ranks || {})[id] ?? 100 };
}

function rules() {
  return loadScripts(["engine/js/battle2k/rules.js"]).Battle2kRules;
}

test("attack damage is atk/2 - def/4, x3 critical, x2 charged, halved when defending", () => {
  const R = rules();
  const src = battler({ atk: 100, def: 0 }), tgt = battler({ atk: 0, def: 40 });
  const o = { critical: false, charged: false, weapon: null, rand: noVariance };
  // 50 - 10 = 40, variance 4 at its minimum: 40 + 0 - 8 = 32
  assert.equal(R.attackDamage(src, tgt, o), 32);
  assert.equal(R.attackDamage(src, tgt, { ...o, critical: true }), 120 - 24);
  assert.equal(R.attackDamage(src, tgt, { ...o, charged: true }), 80 - 16);
  assert.equal(R.attackDamage(src, battler({ def: 40, defending: true }), o), 16);
});

test("weapon attributes use the target's best rate", () => {
  const R = rules();
  const weak = battler({ def: 0, ranks: { 1: 50, 2: 200 } });
  assert.equal(R.attackAttrMult(weak, { attribute_set: [true, true] }), 200);
  assert.equal(R.attackAttrMult(weak, { attribute_set: [] }), 100);
  assert.equal(R.attackAttrMult(weak, null), 100);
});

test("hit chance falls when the target is faster", () => {
  const R = rules();
  assert.equal(R.toHit(battler({ agi: 50 }), battler({ agi: 50 }), 90), 90);
  assert.equal(R.toHit(battler({ agi: 50 }), battler({ agi: 150 }), 90), 80);
});

test("skill effect: power + atk/20 + spi/40 per rate, minus target defence when offensive", () => {
  const R = rules();
  const sk = { power: 10, physical_rate: 10, magical_rate: 0, ignore_defense: false, attribute_effects: [] };
  // 10 + 10*100/20 = 60; minus 10*40/40 = 10
  assert.equal(R.skillBase(sk, battler({ atk: 100 }), battler({ def: 40 }), true), 50);
  assert.equal(R.skillBase(sk, battler({ atk: 100 }), battler({ def: 40 }), false), 60);
});

test("escape chance: agility ratio, +10 per failure, certain on first strike", () => {
  const R = rules();
  assert.equal(R.escapeChance(50, 100, 0, false), 75);
  assert.equal(R.escapeChance(50, 100, 2, false), 95);
  assert.equal(R.escapeChance(1, 100, 0, true), 100);
});

/* ---- whole scene, headless ---- */

const params = (v) => ({ maxhp: Array(50).fill(200), maxsp: Array(50).fill(20), attack: Array(50).fill(v),
  defense: Array(50).fill(10), spirit: Array(50).fill(10), agility: Array(50).fill(50) });
const actorDb = { name: "Seiya", title: "", character_name: "", character_index: 0, transparent: false, face_name: "", face_index: 0,
  initial_level: 1, final_level: 25, class_id: 0, critical_hit: false, critical_hit_chance: 30, unarmed_animation: 0,
  initial_equipment: { weapon_id: 0, shield_id: 0, armor_id: 0, helmet_id: 0, accessory_id: 0 },
  parameters: params(300), skills: {}, state_ranks: [], attribute_ranks: [], exp_base: 10, exp_inflation: 20, exp_correction: 0 };
const enemyDb = { name: "Soldier", max_hp: 20, max_sp: 0, attack: 5, defense: 0, spirit: 0, agility: 1, exp: 12, gold: 7,
  drop_id: 0, critical_hit: false, battler_name: "soldier", attribute_ranks: [], state_ranks: [],
  actions: { 1: { kind: 0, basic: 0, rating: 5, condition_type: 0 } } };

function windowStub() {
  return function () {
    Object.assign(this, { visible: true, active: false, index: -1, frame: 0, itemMax: 0 });
    this.clear = this.update = this.draw = this.text = () => {};
    this.setIndex = (i) => { this.index = i; };
    this.itemRect = () => ({ x: 0, y: 0, w: 100, h: 16 });
  };
}

function battleGame() {
  const db = { actors: { 1: actorDb }, enemies: { 1: enemyDb }, classes: {}, items: {}, skills: {}, states: {}, attributes: {},
    terms: {}, terrains: {}, animations: {}, system: {},
    troops: { 1: { members: { 1: { enemy_id: 1, x: 160, y: 80, invisible: false } }, pages: {} } } };
  const silent = () => {};
  const ctx = loadScripts(["engine/js/state.js", "engine/js/actor.js", "engine/js/actor_growth.js", "engine/js/party.js", ...BATTLE2K_FILES], {
    Loader: fakeLoader(db, "2k"), I18N: { term: () => null, ptFallback: () => null },
    Window_Command: windowStub(), Window_Selectable: windowStub(), Window_Base: windowStub(),
    Audio_: { playSe: silent, playBgm: silent, sys: silent, bgmCurrent: null },
    Screen: { fadeOut: silent, fadeIn: silent, setShake: silent, fadeBusy: () => false, reset: silent },
    Pictures: { clear: silent },
    Input: { clear: silent, pressed: () => false, repeated: () => false, triggered: () => false, consume: silent },
    BattleAnim: { update: silent, clear: silent, play: silent, drawBattle: silent },
    Gfx: {}, ItemEffect: {}, GameMap: {}, Player: { refreshSprite: silent },
  });
  ctx.GameState.newGame();
  ctx.Rand.seed(7);
  ctx.Party.members = [];
  ctx.Party.addActor(1);
  return ctx;
}

/** run the step queue until the scene closes (message waits count down like frames) */
function runToEnd(scene) {
  for (let frame = 0; frame < 5000 && scene.state !== "closed"; frame++) scene.update();
}

test("Auto battle beats a weak troop: victory, gold and exp", () => {
  const ctx = battleGame();
  let result = null;
  const scene = new ctx.SceneBattle2k({ troopId: 1, background: null, terrainId: 1, allowEscape: true, firstStrike: false }, (r) => { result = r; });
  scene.start();
  runToEnd(scene);   // intro message, then the options window waits for input
  assert.equal(scene.state, "options");
  scene.onOption(1);
  runToEnd(scene);
  assert.equal(result, "victory");
  assert.equal(ctx.Party.gold, 7);
  assert.equal(ctx.Party.members[0].exp, 12);
});

test("enemy actions respect turn conditions and fall back to a plain attack", () => {
  const ctx = battleGame();
  const scene = new ctx.SceneBattle2k({ troopId: 1, terrainId: 1 }, () => {});
  scene.start();
  const e = scene.enemies[0];
  const everyThird = { condition_type: 2, condition_param1: 3, condition_param2: 3 };
  scene.turn = 6;
  assert.equal(scene.enemyActionAllowed(e, everyThird), true);
  scene.turn = 4;
  assert.equal(scene.enemyActionAllowed(e, everyThird), false);
  e.data = { ...enemyDb, actions: { 1: { kind: 0, basic: 2, rating: 5, ...everyThird } } };
  assert.equal(scene.enemyAction(e).type, "attack");
});
