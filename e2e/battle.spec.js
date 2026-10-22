// RPG Maker 2000 front-view battle: Fight -> Attack -> target through the windows, then Auto
// battle to victory with gold and exp. Screenshots as evidence.
import { test, expect } from "@playwright/test";
import { collectErrors, shot, tap } from "./helpers.js";

/** move the Fight / Auto / Escape cursor to index with the arrow keys, then confirm */
async function chooseOption(page, index) {
  for (let i = 0; i < 3 && (await page.evaluate(() => Game.scene().options.index)) !== index; i++) await tap(page, "ArrowDown");
  await tap(page, "Enter");
}

test("attack through the command window, then auto battle to victory", async ({ page }, info) => {
  const errors = collectErrors(page);
  await page.goto("/?battle=3&seed=3");
  await page.waitForFunction(() => Game.scene() instanceof SceneBattle2k && Game.scene().state === "options", null, { timeout: 30_000 });
  await page.waitForTimeout(300);
  await shot(page, info, "battle-options");

  await tap(page, "Enter");   // Fight
  await page.waitForFunction(() => Game.scene().state === "command");
  await shot(page, info, "battle-command");
  await tap(page, "Enter");   // Attack
  await page.waitForFunction(() => Game.scene().selectingTarget === "enemy");
  await page.waitForTimeout(200);
  await shot(page, info, "battle-target");
  await tap(page, "Enter");   // first enemy
  await page.waitForFunction(() => Game.scene().state === "action" || Game.scene().turn >= 2, null, { timeout: 10_000 });

  const goldBefore = await page.evaluate(() => Party.gold);
  for (let round = 0; round < 30 && (await page.evaluate(() => !window.__lastBattleResult)); round++) {
    const waiting = await page.evaluate(() => Game.scene().state === "options" && Game.scene().options.active);
    if (waiting) await chooseOption(page, 1);   // Auto
    await page.keyboard.down("Enter"); await page.waitForTimeout(400); await page.keyboard.up("Enter");
    if (await page.evaluate(() => Game.scene().msgLines && Game.scene().msgLines[0] === Terms.get("victory"))) await shot(page, info, "battle-victory");
  }
  expect(await page.evaluate(() => window.__lastBattleResult)).toBe("victory");
  expect(await page.evaluate(() => Party.gold)).toBeGreaterThan(goldBefore);
  expect(errors).toEqual([]);
});
