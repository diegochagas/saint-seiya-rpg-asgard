// Checks every game repo runs against itself (tests/game.test.mjs): the page loads the game files
// and the engine, the save keys stay the ones old saves used, the terms tables match the database,
// and the converted data is complete.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { loadScripts, readData } from "./harness.mjs";

const ROOT = new URL("../../", import.meta.url);
const PAGE_SCRIPTS = ["game/config.js", "game/terms.js", "engine/boot.js"];

function pageScripts() {
  const html = fs.readFileSync(new URL("index.html", ROOT), "utf8");
  return [...html.matchAll(/<script src="([^"]+)"/g)].map((m) => m[1]);
}

/**
 * Registers the contract tests for the game repo this module was vendored into.
 * @param {{gameId: string, engine: "2k"|"2k3"}} expected
 * example: checkGameRepo({ gameId: "holy_avenger", engine: "2k3" })
 */
export function checkGameRepo(expected) {
  test("index.html loads the game files, then engine/boot.js", () => {
    assert.deepEqual(pageScripts(), PAGE_SCRIPTS);
  });

  test("save keys stay the ones existing saves use", () => {
    const { CONFIG } = loadScripts(["game/config.js", "engine/js/config.js"]);
    assert.equal(CONFIG.SAVE_PREFIX, expected.gameId + "_save_");
    assert.equal(CONFIG.SETTINGS_KEY, expected.gameId + "_settings");
  });

  test("every English or fallback term names a database term", { skip: !readData("database.json") }, () => {
    const { TERMS_EN, TERMS_PT_FALLBACK } = loadScripts(["game/terms.js"]);
    const known = new Set(Object.keys(readData("database.json").terms));
    const unknown = [...Object.keys(TERMS_EN), ...Object.keys(TERMS_PT_FALLBACK)].filter((k) => !known.has(k));
    assert.deepEqual(unknown, []);
  });

  test("converted data matches the engine and has every map", { skip: !readData("manifest.json") }, () => {
    assert.equal(readData("manifest.json").engine || "2k", expected.engine);
    const tree = readData("maptree.json").maps;
    const MAP_TYPE = 1;   // 0 is the root, 2 an area (a region of its parent map, no file)
    const missing = Object.keys(tree).filter((id) => {
      const file = "maps/map" + String(id).padStart(4, "0") + ".json";
      return tree[id].type === MAP_TYPE && !fs.existsSync(new URL("data/" + file, ROOT));
    });
    assert.deepEqual(missing, []);
  });
}
