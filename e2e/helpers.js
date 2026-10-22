// Shared Playwright helpers: console error capture, canvas-not-blank, scene waits, screenshots, key taps.

/** @returns {string[]} filled with page errors and console errors as they happen */
export function collectErrors(page) {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  return errors;
}

/** true when the game canvas has more than one colour */
export async function canvasDrawn(page) {
  return page.locator("#game").evaluate((c) => {
    const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
    for (let i = 4; i < d.length; i += 4) if (d[i] !== d[0] || d[i + 1] !== d[1] || d[i + 2] !== d[2]) return true;
    return false;
  });
}

/** waits until the top scene is an instance of the named global scene class */
export async function waitForScene(page, name) {
  await page.waitForFunction((n) => window.Game && Game.scene() instanceof window[n], name, { timeout: 30_000 });
}

export const shot = (page, info, name) => page.screenshot({ path: `e2e/screenshots/${info.project.name}-${name}.png` });

export async function tap(page, key) {
  await page.keyboard.down(key);
  await page.waitForTimeout(60);
  await page.keyboard.up(key);
}

/** confirm messages until no event is running on the map (autorun cut-scenes on arrival) */
export async function finishEvents(page, maxTaps = 60) {
  for (let i = 0; i < maxTaps; i++) {
    if (await page.evaluate(() => !MessageWindow.busy() && !GameMap.interpreter.running())) return true;
    await tap(page, "Enter");
    await page.waitForTimeout(150);
  }
  return false;
}
