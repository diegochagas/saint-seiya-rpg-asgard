// Actor growth rules: RPG Maker 2000 vs 2003 exp curves and ChangeClass.
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadScripts, fakeLoader } from "../engine/testing/harness.mjs";

const curve = { exp_base: 30, exp_inflation: 30, exp_correction: 0 };

function gameWith(db, engine = "2k3") {
  const ctx = loadScripts(["engine/js/state.js", "engine/js/actor.js", "engine/js/actor_growth.js"], { Loader: fakeLoader(db, engine), I18N: { term: () => null, ptFallback: () => null } });
  ctx.Party = { addItem() {} };
  return ctx;
}

const params = (hp) => ({ maxhp: Array(99).fill(hp), maxsp: Array(99).fill(10), attack: Array(99).fill(20),
  defense: Array(99).fill(20), spirit: Array(99).fill(20), agility: Array(99).fill(20) });

function actorDb(extra = {}) {
  return {
    name: "Hero", title: "", character_name: "", character_index: 0, transparent: false, face_name: "", face_index: 0,
    initial_level: 1, final_level: 99, class_id: 1, battler_animation: 3, two_weapon: false, battle_commands: [1, 2, 0, -1],
    initial_equipment: { weapon_id: 0, shield_id: 0, armor_id: 0, helmet_id: 0, accessory_id: 0 },
    parameters: params(100), skills: {}, state_ranks: [], attribute_ranks: [], ...curve, ...extra,
  };
}

test("2003 exp curve is linear: base + level * inflation per level", () => {
  const ctx = gameWith({});
  // level 1 -> 2: 30 + 1*30 = 60; level 2 -> 3 adds 30 + 2*30 = 90
  assert.equal(ctx.expCurve(curve, 1, "2k3"), 60);
  assert.equal(ctx.expCurve(curve, 2, "2k3"), 150);
});

test("2000 exp curve matches RPG_RT's inflation formula", () => {
  const ctx = gameWith({}, "2k");
  assert.equal(ctx.expCurve(curve, 1, "2k"), 30);
  assert.equal(ctx.expCurve(curve, 2, "2k"), 30 + Math.trunc(30 * 1.8));
});

test("2003 actors take battle commands without the empty slots", () => {
  const ctx = gameWith({ actors: { 1: actorDb() }, classes: {}, items: {}, states: {}, system: {} });
  const a = new ctx.Actor(1);
  assert.deepEqual(a.battleCommands, [1, 2]);
  assert.equal(a.battlerAnimation, 3);
});

test("ChangeClass keeps current stats, switches to the class growth table and resets exp", () => {
  const klass = { name: "Knight", two_weapon: true, lock_equipment: false, auto_battle: false, super_guard: false,
    parameters: params(500), ...curve, exp_base: 10, battler_animation: 7, skills: {}, battle_commands: [1, 3],
    state_ranks: [], attribute_ranks: [] };
  const ctx = gameWith({ actors: { 1: actorDb() }, classes: { 2: klass }, items: {}, states: {}, system: {}, terms: {}, skills: {} });
  const a = new ctx.Actor(1);
  a.changeExp(1000);
  const level = a.level, hp = a.maxHp();
  a.changeClass(2, { resetLevel: false, skillMode: 0, paramMode: 0 });
  assert.equal(a.level, level);
  assert.equal(a.maxHp(), hp, "param mode 0 keeps the max HP the actor had");
  assert.equal(a.exp, a.expForLevel(level));
  assert.equal(a.twoWeapon, true);
  assert.equal(a.battlerAnimation, 7);
  assert.deepEqual(a.battleCommands, [1, 3]);
});

test("ChangeClass to a missing class reports the class id", () => {
  const ctx = gameWith({ actors: { 1: actorDb() }, classes: {}, items: {}, states: {}, system: {} });
  const a = new ctx.Actor(1);
  assert.throws(() => a.changeClass(9, { resetLevel: false, skillMode: 0, paramMode: 0 }), /class 9/);
});

test("seeded Rand repeats the same sequence", () => {
  const ctx = gameWith({});
  ctx.Rand.seed(42);
  const first = [ctx.Rand.int(1, 100), ctx.Rand.int(1, 100), ctx.Rand.int(1, 100)];
  ctx.Rand.seed(42);
  assert.deepEqual([ctx.Rand.int(1, 100), ctx.Rand.int(1, 100), ctx.Rand.int(1, 100)], first);
});
