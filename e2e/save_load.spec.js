// Save on the village map through the save screen, back to the title, Load Game, and the party is
// back on the same map and tile. Saves keep the original localStorage keys (ssrpg_asgard_save_N).
import fs from "node:fs";
import { test, expect } from "@playwright/test";
import { collectErrors, waitForScene, shot, tap } from "./helpers.js";

test("save in the village, load it from the title screen", async ({ page }, info) => {
  const errors = collectErrors(page);
  await page.goto("/?map=3&x=19&y=28&seed=2");
  await page.waitForFunction(() => window.GameMap && GameMap.id === 3, null, { timeout: 30_000 });
  await page.waitForTimeout(500);
  const where = await page.evaluate(() => [GameMap.id, Player.x, Player.y]);

  await page.evaluate(() => Game.openSave());
  await waitForScene(page, "SceneFile");
  await page.waitForTimeout(300);
  await tap(page, "Enter");   // first empty slot
  await page.waitForFunction(() => localStorage.getItem("ssrpg_asgard_save_1") !== null);
  await shot(page, info, "save");

  await page.evaluate(() => Game.toTitle());
  await waitForScene(page, "SceneTitle");
  await page.waitForFunction(() => !Screen.fadeBusy());
  expect(await page.evaluate(() => Game.scene().cmd.index)).toBe(1);   // with saves the cursor starts on Load Game
  await tap(page, "Enter");
  await waitForScene(page, "SceneFile");
  await page.waitForTimeout(300);
  await shot(page, info, "load");
  await tap(page, "Enter");
  await waitForScene(page, "SceneMap");
  await page.waitForFunction(() => GameMap.id === 3);
  await page.waitForTimeout(600);
  expect(await page.evaluate(() => [GameMap.id, Player.x, Player.y])).toEqual(where);
  await shot(page, info, "loaded");
  expect(errors).toEqual([]);
});

// A save written by the previous Asgard engine (a977249, before the shared engine) still loads:
// tests/fixtures/save_a977249.json was made by that version (map 1, 321 gold, switch 5, variable 7).
test("a save from the old Asgard engine loads", async ({ page }, info) => {
  const errors = collectErrors(page);
  const oldSave = fs.readFileSync(new URL("../tests/fixtures/save_a977249.json", import.meta.url), "utf8");
  await page.addInitScript((save) => localStorage.setItem("ssrpg_asgard_save_1", save), oldSave);
  await page.goto("/");
  await waitForScene(page, "SceneTitle");
  await page.waitForFunction(() => !Screen.fadeBusy());
  await tap(page, "Enter");   // Load Game (the cursor starts there when a save exists)
  await waitForScene(page, "SceneFile");
  await page.waitForTimeout(300);
  await shot(page, info, "load-old-save");
  await tap(page, "Enter");
  await waitForScene(page, "SceneMap");
  await page.waitForTimeout(600);
  const state = await page.evaluate(() => ({ map: GameMap.id, gold: Party.gold, sw: GameState.sw(5), v: GameState.v(7),
    exp: Party.members[0].exp, items: Party.itemCount(1) }));
  expect(state).toEqual({ map: 1, gold: 321, sw: true, v: 42, exp: 400, items: 3 });
  expect(errors).toEqual([]);
});
