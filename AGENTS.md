# Saint Seiya RPG - Asgard Chapter (browser remake)

Vanilla JS remake of the RPG Maker 2000 fan game *Saint Seiya RPG - Asgard Chapter*. No RPG Maker code runs: the
shared engine's converter turns the original project into JSON + PNG/OGG/WebM, and the shared
runtime reproduces RPG_RT's behaviour (EasyRPG Player sources were a behaviour reference only).

- Engine: `engine/` is a vendored copy of the sibling repo `rpgmaker-web-engine` (runtime,
  converter, test harness). **Never edit it here**: fix the engine repo, commit, then run
  `../rpgmaker-web-engine/scripts/vendor-engine .`; `scripts/check` fails if `engine/` was touched.
- This repo's own code: `game/config.js` (`GAME_INFO.id`, the save keys), `game/terms.js` (English
  database terms with the Saint Seiya vocabulary: Cosmo, Cloth, Technique), `index.html`, `tests/`, `e2e/`.
- The battle is RPG Maker 2000's front view (`engine/js/battle2k/`), chosen because
  `data/manifest.json` says `"engine": "2k"`.
- Data: regenerate with `engine/tools/convert.py` (see README); never hand-edit `data/` or `assets/`.
- Test hooks: `?map=ID&x=&y=`, `?battle=TROOP`, `?party=1,2`, `?seed=N` (engine/js/debug_start.js).
- Dev server: `python3 engine/tools/serve.py 8090` (launch.json entry `saint-seiya-rpg-asgard`).

## Testing and shipping (dev-playbook)

This repo follows the dev-playbook (`~/.claude/skills/dev-playbook/PLAYBOOK.md`).

- One gate: `scripts/check` (engine copy intact + game contract tests + clean-code audit; engine
  unit tests run in rpgmaker-web-engine). The pre-push
  hook runs it (`git config core.hooksPath .githooks`). Never push with `--no-verify`.
- Bugs: write a failing regression test first, then fix.
- Never weaken, skip or delete a test to make it pass.
- UI changes: run the Playwright e2e (`npx playwright test`) and attach desktop (1280) + mobile (375)
  screenshots of every changed screen to the PR or final message.
- Risk class for this repo: none (a game; saves live in the player's localStorage).
  Save-format changes still need old saves to load: `e2e/save_load.spec.js` loads
  `tests/fixtures/save_a977249.json`, written by the pre-shared-engine version.
- No real paths, IPs, passwords or tokens in code, tests, fixtures or docs.
- Before finishing: run `/code-review` on the diff, then give the evidence package:
  summary, risk class, test results, screenshots, rollback steps.

## Clean code (dev-playbook CLEAN-CODE.md)

Language: vanilla JS (script-tag globals, ES5 style like the engine) for `game/`, ES modules for `tests/` and `e2e/`.
Formatter: none enforced yet; match the surrounding code, don't discuss style.

- Functions 4–20 lines. Files ≤300 lines, hard max 500. `scripts/clean-code-audit --strict` runs in
  `scripts/check` (it measures file length for JS and function length for Python).
- One responsibility per module. Layout: `game/` (this game's settings), `engine/` (vendored),
  `tests/`, `e2e/`. Engine layout rules live in rpgmaker-web-engine's AGENTS.md.
- Names specific and searchable (<5 grep hits). Banned: `data`, `handler`, `utils`, `Manager`, `Service`
  (existing `data` fields mirror RPG Maker's own naming; don't add new ones).
- Types explicit: JSDoc `@param`/`@returns` on functions other files call; type hints on every Python `def`.
- Early returns, max 2 nested levels. Extract duplicated logic the second time it appears.
- Errors include the offending value and the expected shape
  (`ChangeClass: class 9 does not exist`).
- Comments: keep the ones you find, they carry intent. Write WHY, cite issue numbers / SHAs.
- Dependencies injected via parameters where tests need fakes (`engine/testing/harness.mjs` loads scripts into a vm).
- Logging: plain text (browser console, CLI stderr).
- Defensive code this repo needs: none beyond input validation (a missing asset or map logs and continues).
- README has an "Architecture" section; update it when the shape changes.
- `scripts/setup` bootstraps a clean machine idempotently; `scripts/check` is the single validation command.
