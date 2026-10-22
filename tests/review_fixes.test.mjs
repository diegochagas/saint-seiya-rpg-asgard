// Regression tests for the code-review findings (written before the fixes).
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadScripts, fakeLoader } from "../engine/testing/harness.mjs";

const params = (v) => ({ maxhp: Array(99).fill(100), maxsp: Array(99).fill(10), attack: Array(99).fill(v),
  defense: Array(99).fill(v), spirit: Array(99).fill(v), agility: Array(99).fill(v) });
const states = {
  1: { restriction: 0, priority: 100, reduce_hit_ratio: 100 },
  2: { restriction: 1, priority: 10, reduce_hit_ratio: 100, auto_release_prob: 0 },   // paralysis that never wears off
  3: { restriction: 3, priority: 50, reduce_hit_ratio: 100 },                         // confusion: attack allies
  4: { restriction: 0, priority: 5, reduce_hit_ratio: 20 },                           // blind
};
const items = {
  1: { type: 1, atk_points1: 50, def_points1: 0, spi_points1: 0, agi_points1: 0, hit: 90, critical_hit: 0, attribute_set: [] },
  2: { type: 1, atk_points1: 10, def_points1: 0, spi_points1: 0, agi_points1: 0, hit: 90, critical_hit: 0, attribute_set: [] },
};
function actorDb() {
  return { name: "A", title: "", character_name: "", character_index: 0, transparent: false, face_name: "", face_index: 0,
    initial_level: 1, final_level: 99, class_id: 0, battler_animation: 1, two_weapon: true, battle_commands: [1],
    initial_equipment: { weapon_id: 1, shield_id: 2, armor_id: 0, helmet_id: 0, accessory_id: 0 },
    parameters: params(20), skills: {}, state_ranks: [], attribute_ranks: [], exp_base: 30, exp_inflation: 30, exp_correction: 0 };
}
function game() {
  const db = { actors: { 1: actorDb() }, classes: {}, items, states, system: {}, terms: {}, skills: {}, attributes: {} };
  const ctx = loadScripts(["engine/js/state.js", "engine/js/actor.js", "engine/js/actor_growth.js", "engine/js/battle/rules.js"],
    { Loader: fakeLoader(db), I18N: { term: () => null, ptFallback: () => null } });
  ctx.Party = { addItem() {} };
  return ctx;
}

test("a paralysed battler cannot act even when a stronger restriction is also active", () => {
  const ctx = game();
  const a = new ctx.Actor(1);
  a.addState(2); a.addState(3);
  assert.equal(a.canAct(), false);
});

test("the attacker's blindness lowers its hit chance (reduce_hit_ratio)", () => {
  const ctx = game();
  const a = new ctx.Actor(1), t = new ctx.Actor(1);
  const seeing = ctx.BattleRules.normalHitChance(a, t, 0);
  a.addState(4);
  assert.ok(ctx.BattleRules.normalHitChance(a, t, 0) < seeing / 2);
});

test("HP changes do not bring a dead actor back", () => {
  const ctx = game();
  const a = new ctx.Actor(1);
  a.changeHp(-9999, true);
  a.changeHp(9999, false);
  assert.equal(a.hp, 0);
  assert.equal(a.isDead(), true);
});

test("two-weapon actors attack with one weapon's attack per hit", () => {
  const ctx = game();
  const a = new ctx.Actor(1);
  assert.equal(a.atk(), 20 + 50 + 10);
  a.attackSlot = 1;
  assert.equal(a.atk(), 20 + 10);
  assert.deepEqual([...a.weapons().map((w) => w.atk_points1)], [10]);
});

test("battle stat changes stay within -base/2 .. +base", () => {
  const ctx = game();
  const a = new ctx.Actor(1);
  a.changeBattleStat(2, -1000);
  assert.equal(a.atk(), 40);   // base 80 halved
  a.changeBattleStat(2, 5000);
  assert.equal(a.atk(), 160);  // base 80 doubled
});

test("a party that can neither act nor recover counts as defeated", () => {
  const ctx = game();
  const a = new ctx.Actor(1);
  a.addState(2);
  assert.equal(ctx.BattleRules.unableToFight([a]), true);
  a.removeState(2);
  assert.equal(ctx.BattleRules.unableToFight([a]), false);
});
