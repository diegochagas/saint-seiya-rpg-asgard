// Smoke: boots over a static server, title draws, EN/PT switches to this game's terms (Cosmo,
// Cloth), new game reaches the intro map, the menu opens, Asgard (map 2) and the village of
// Nemea (map 3) draw. Screenshots land in e2e/screenshots/ as evidence.
import { test, expect } from "@playwright/test";
import { collectErrors, canvasDrawn, waitForScene, shot, finishEvents } from "./helpers.js";

test("title, language toggle, new game and menu", async ({ page }, info) => {
  const errors = collectErrors(page);
  await page.goto("/?seed=42");
  await waitForScene(page, "SceneTitle");
  await page.waitForTimeout(600);
  expect(await canvasDrawn(page)).toBe(true);
  await shot(page, info, "title");

  const before = await page.locator("#btn-lang").innerText();
  await page.locator("#btn-lang").click();
  expect(await page.locator("#btn-lang").innerText()).not.toBe(before);
  const lang = await page.evaluate(() => I18N.lang);
  const terms = await page.evaluate(() => [Terms.get("sp_short"), Terms.get("armor")]);
  if (lang === "en") expect(terms).toEqual(["CO", "Cloth"]);

  await page.locator("#game").click();
  await page.keyboard.press("Enter");
  await waitForScene(page, "SceneMap");
  await page.waitForTimeout(1500);
  expect(await canvasDrawn(page)).toBe(true);
  await shot(page, info, "intro");

  await page.evaluate(() => { GameMap.interpreter.list = null; MessageWindow.queue = null; Game.openMenu(); });
  await waitForScene(page, "SceneMenu");
  await page.waitForTimeout(300);
  await shot(page, info, "menu");
  expect(errors).toEqual([]);
});

for (const [name, url, mapId] of [["asgard", "/?map=2&x=48&y=187&seed=1", 2], ["village", "/?map=3&x=19&y=28&seed=1", 3]]) {
  test(`map ${mapId} (${name}) loads on demand and the player walks`, async ({ page }, info) => {
    const errors = collectErrors(page);
    await page.goto(url);
    await waitForScene(page, "SceneMap");
    await page.waitForFunction((id) => GameMap.id === id, mapId);
    await page.waitForTimeout(800);
    expect(await canvasDrawn(page)).toBe(true);
    await shot(page, info, `map${mapId}`);
    expect(await finishEvents(page)).toBe(true);
    const visited = new Set([await page.evaluate(() => [Player.x, Player.y].join())]);
    for (const key of ["ArrowUp", "ArrowLeft", "ArrowDown", "ArrowRight"]) {
      await page.keyboard.down(key); await page.waitForTimeout(300); await page.keyboard.up(key);
      await page.waitForTimeout(200);
      visited.add(await page.evaluate(() => [Player.x, Player.y].join()));
    }
    expect(visited.size).toBeGreaterThan(1);
    expect(errors).toEqual([]);
  });
}
