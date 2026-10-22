// engine/boot.js must load every runtime file exactly once, and the save keys must come from the game.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { loadScripts } from "../engine/testing/harness.mjs";

const ENGINE = new URL("../engine/", import.meta.url);

function engineJsFiles(dir = "js") {
  return fs.readdirSync(new URL(dir + "/", ENGINE), { withFileTypes: true }).flatMap((d) =>
    d.isDirectory() ? engineJsFiles(path.posix.join(dir, d.name)) : d.name.endsWith(".js") ? [path.posix.join(dir, d.name)] : []);
}

function bootList() {
  const fakeDocument = { currentScript: { src: "http://x/engine/boot.js", parentNode: { appendChild() {} } }, createElement: () => ({}) };
  return loadScripts(["engine/boot.js"], { document: fakeDocument }).ENGINE_SCRIPTS;
}

test("boot.js lists every engine/js file once", () => {
  const listed = bootList();
  assert.deepEqual([...listed].sort(), engineJsFiles().sort());
  assert.equal(new Set(listed).size, listed.length);
});

test("config and main come first and last", () => {
  const listed = bootList();
  assert.equal(listed[0], "js/config.js");
  assert.equal(listed[listed.length - 1], "js/main.js");
});

test("save keys are derived from GAME_INFO.id", () => {
  const { CONFIG } = loadScripts(["engine/js/config.js"], { GAME_INFO: { id: "ssrpg_asgard" } });
  assert.equal(CONFIG.SAVE_PREFIX, "ssrpg_asgard_save_");
  assert.equal(CONFIG.SETTINGS_KEY, "ssrpg_asgard_settings");
});

test("a game without GAME_INFO fails at boot with a hint", () => {
  assert.throws(() => loadScripts(["engine/js/config.js"]), /GAME_INFO\.id is missing/);
});
