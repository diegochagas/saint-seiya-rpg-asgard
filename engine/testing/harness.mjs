// Loads the game's script-tag files into a Node vm context so pure logic can be tested
// without a browser. Top-level `var`/function declarations become properties of the context.
import vm from "node:vm";
import fs from "node:fs";

const ROOT = new URL("../../", import.meta.url);

/**
 * @param {string[]} files paths relative to the repo root, in index.html order
 * @param {object} globals fakes the files expect (Loader, GameMap, ...)
 * @returns {object} the vm context holding every global the files defined
 */
export function loadScripts(files, globals = {}) {
  const ctx = vm.createContext({ console, URLSearchParams, ...globals });
  for (const file of files) {
    vm.runInContext(fs.readFileSync(new URL(file, ROOT), "utf8"), ctx, { filename: file });
  }
  return ctx;
}

/** Minimal Loader stand-in: a database object plus the engine name. */
export function fakeLoader(db, engine = "2k3") {
  return {
    db,
    manifest: { engine },
    engine: () => engine,
    is2k3: () => engine === "2k3",
    image: () => null,
  };
}

/** Reads one converted JSON file from data/ (skips the test when the data was not generated). */
export function readData(rel) {
  const url = new URL("data/" + rel, ROOT);
  return fs.existsSync(url) ? JSON.parse(fs.readFileSync(url, "utf8")) : null;
}
