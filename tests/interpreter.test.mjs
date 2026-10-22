// Event interpreter flow: loops, branches.
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadScripts } from "../engine/testing/harness.mjs";

function interp() {
  const ctx = loadScripts(["engine/js/events/interpreter.js", "engine/js/events/conditions.js", "engine/js/events/commands_flow.js"], {
    GameState: { vars: {}, sw: () => false, v(id) { return this.vars[id] | 0; }, setV(id, x) { this.vars[id] = x; }, setSw() {} },
    GameMap: { refreshEvents() {}, events: [] }, MessageWindow: {}, Rand: { int: (a) => a },
  });
  return ctx;
}

test("BreakLoop leaves the loop it is nested in", () => {
  const ctx = interp();
  const add = { code: 10220, indent: 1, params: [0, 1, 1, 1, 0, 1] };   // var1 += 1
  const list = [
    { code: 12210, indent: 0, params: [] },
    add,
    { code: 12220, indent: 1, params: [] },
    { code: 10, indent: 1, params: [] },
    { code: 22210, indent: 0, params: [] },
    { code: 10220, indent: 0, params: [0, 2, 2, 0, 0, 7] },             // var2 = 7
  ];
  const it = new ctx.Interpreter(0, false);
  it.setup(list, 0);
  it.update();
  assert.equal(ctx.GameState.v(1), 1, "the loop body ran once");
  assert.equal(ctx.GameState.v(2), 7, "execution continued after the loop");
  assert.equal(it.running(), false);
});
