// RPG Maker 2003 battle rules: formulas, enemy AI weighting and troop page timing.
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadScripts, fakeLoader } from "../engine/testing/harness.mjs";

const attributes = { 1: { type: 0, a_rate: 200, b_rate: 150, c_rate: 100, d_rate: 50, e_rate: 0 },
  2: { type: 1, a_rate: 200, b_rate: 150, c_rate: 100, d_rate: 50, e_rate: 0 } };

function battleContext(db = {}) {
  const ctx = loadScripts(["engine/js/state.js", "engine/js/actor.js", "engine/js/battle/rules.js", "engine/js/battle/ai.js", "engine/js/battle/events.js"],
    { Loader: fakeLoader({ attributes, states: {}, system: {}, ...db }), EventCommands: {}, I18N: { term: () => null } });
  return ctx;
}

function battler(stats) {
  return { atk: () => stats.atk, def: () => stats.def, spi: () => stats.spi || 10, agi: () => stats.agi || 50,
    maxHp: () => 100, hp: 100, sp: 10, maxSp: () => 10, states: [], isEnemy: !!stats.enemy, row: 0,
    defending: !!stats.defending, superGuard: false, weapons: () => [], hitChance: () => 90, critChance: () => 0,
    canAct: () => true, attributeRate: (id) => (stats.ranks || {})[id] ?? 100 };
}
const noVariance = (a) => a;   // rand(min, max) -> min

test("ATB increment shares 300000 by agility like RPG_RT's integer maths", () => {
  const { BattleRules } = battleContext();
  // sum 200, agi 49: divisor floor(20000/50)=400 -> 750 per frame
  assert.equal(BattleRules.atbIncrement(49, 200), 750);
});

test("turn conditions: every 0 means exactly the base turn", () => {
  const { BattleRules } = battleContext();
  assert.equal(BattleRules.checkTurns(3, 3, 0), true);
  assert.equal(BattleRules.checkTurns(4, 3, 0), false);
  assert.equal(BattleRules.checkTurns(7, 1, 3), true);
  assert.equal(BattleRules.checkTurns(6, 1, 3), false);
});

test("variance 4 stays within +-20%", () => {
  const { BattleRules } = battleContext();
  assert.equal(BattleRules.variance(100, 4, noVariance), 80);
  assert.equal(BattleRules.variance(100, 4, (a, b) => b), 120);
  assert.equal(BattleRules.variance(0, 4, (a, b) => b), 0);
});

test("normal damage: atk/2 - def/4, front-row actor bonus, defend halves", () => {
  const { BattleRules, CONDITION } = battleContext();
  const actor = battler({ atk: 100, def: 0 });
  const enemy = battler({ atk: 100, def: 40, enemy: true });
  const o = { condition: CONDITION.NONE, critical: false, charged: false, rand: noVariance };
  // (50 - 10) * 1.25 = 50, variance min -> 40
  assert.equal(BattleRules.normalDamage(actor, enemy, o), 40);
  // enemies get no row bonus: 50 - 0 = 50 -> 40
  assert.equal(BattleRules.normalDamage(enemy, actor, o), 40);
  const guarded = battler({ atk: 0, def: 0, defending: true });
  assert.equal(BattleRules.normalDamage(enemy, guarded, o), 20);
});

test("attribute multiplier combines physical and magical rates", () => {
  const { BattleRules } = battleContext();
  const weakToFire = battler({ atk: 0, def: 0, ranks: { 1: 200, 2: 50 } });
  assert.equal(BattleRules.attributeMultiplier([1], weakToFire, 100), 200);
  assert.equal(BattleRules.attributeMultiplier([1, 2], weakToFire, 100), 100);   // 50% of (200% of 100)
  assert.equal(BattleRules.attributeMultiplier([], weakToFire, 100), 100);
});

test("escape chance: 150 - 100 * enemy/actor agility, +10 per failure", () => {
  const { BattleRules } = battleContext();
  assert.equal(BattleRules.escapeChance(100, 100, 0), 50);
  assert.equal(BattleRules.escapeChance(100, 100, 2), 70);
  assert.equal(BattleRules.escapeChance(300, 100, 0), 0);
});

test("enemy AI only picks actions within 10 rating points of the best", () => {
  const ctx = battleContext({ skills: {} });
  const act = (rating, basic) => ({ kind: 0, basic, rating, condition_type: 0, switch_on: false, switch_off: false });
  const enemy = { hp: 10, maxHp: () => 10, sp: 0, maxSp: () => 0, data: { actions: { 1: act(50, 0), 2: act(30, 2) } } };
  ctx.Rand.seed(7);
  for (let i = 0; i < 20; i++) assert.equal(ctx.EnemyAI.choose(enemy, { turn: 1, activeEnemies: () => [enemy] }).basic, 0);
});

test("troop pages: turn pages fire before actions, HP pages after, once per turn", () => {
  const ctx = battleContext();
  const flags = (on) => Object.fromEntries(["switch_a", "switch_b", "variable", "turn", "fatigue", "enemy_hp", "actor_hp",
    "turn_enemy", "turn_actor", "command_actor"].map((f) => [f, f === on]));
  const cond = (on, extra = {}) => ({ flags: flags(on), turn_a: 0, turn_b: 2, enemy_id: 0, enemy_hp_min: 0, enemy_hp_max: 50, ...extra });
  const enemy = { hp: 10, maxHp: () => 100 };
  const battle = { turn: 2, enemies: [enemy], pagesRun: {}, troop: { pages: {
    1: { condition: cond("turn"), event_commands: [{ code: 10 }] },
    2: { condition: cond("enemy_hp"), event_commands: [{ code: 10 }] } } } };
  assert.equal(ctx.TroopPages.next(battle, "before", null), battle.troop.pages[1]);
  assert.equal(ctx.TroopPages.next(battle, "before", null), null, "a page runs once per turn");
  assert.equal(ctx.TroopPages.next(battle, "after", null), battle.troop.pages[2]);
});
