# Saint Seiya RPG - Asgard Chapter (browser remake)

A browser remake of the Brazilian fan game *Saint Seiya RPG - Asgard Chapter* (v2.00),
originally made with RPG Maker 2000. The original project data (maps, database, events)
is converted to JSON by a Python tool and played by a vanilla JavaScript runtime that
reimplements the RPG Maker 2000 engine: tile maps with autotiles, events and move routes,
message windows with the original bitmap fonts, menus, shops, inns, front-view battles,
pictures, screen effects and save/load.

No build step, no dependencies: open `index.html` over HTTP (GitHub Pages works).

## Play

```bash
python3 tools/serve.py 8090
```

Then open <http://localhost:8090>.

| Action          | Keyboard                         | Touch |
|-----------------|----------------------------------|-------|
| Move            | Arrows / WASD                    | D-pad |
| Confirm / talk  | Z, Enter, Space                  | Z     |
| Cancel / menu   | X, Esc, C                        | X     |
| Run             | Shift                            |       |

The **EN/PT** button in the top bar switches the interface language. Dialogue stays in
the original Portuguese; menu and battle vocabulary switches to English.

## Layout

```
index.html, style.css      page shell
js/                        runtime (script-tag globals, load order in index.html)
  config.js  i18n.js  loader.js  input.js  audio.js  gfx.js  font.js  window.js
  state.js  actor.js  party.js  character.js  map.js  screen.js  message.js
  interpreter.js  battle_anim.js  scene_*.js  game.js  main.js
data/                      converted game data (database.json, maptree.json, maps/*.json, manifest.json)
assets/                    converted graphics (RGBA PNG), audio (OGG) and bitmap fonts
tools/convert.py           RPG Maker 2000 project -> data/ + assets/
tools/fon2png.py           Windows .fon bitmap font -> PNG atlas + metrics
tools/lcf/                 generic LCF reader driven by liblcf's schema CSVs
tools/serve.py             no-cache static server for development
```

## Regenerating the data

```bash
python3 -m venv --system-site-packages .venv
.venv/bin/pip install --no-deps -r tools/requirements.txt
.venv/bin/python tools/convert.py \
  --game "/path/to/Saint Seiya RPG - Asgard Chapter" \
  --rtp "/path/to/RTP/2000" \
  --sf2 /usr/share/sounds/sf2/default-GM.sf2
python3 tools/fon2png.py "/path/to/game/System/Rmg2000.fon" assets/font/rmg2000.png assets/font/rmg2000.json
python3 tools/fon2png.py "/path/to/game/System/Rm2000.fon"  assets/font/rm2000.png  assets/font/rm2000.json
```

`convert.py` needs Pillow and `ffmpeg`; MIDI music is rendered with `tinysoundfont` and a
GM SoundFont. Assets missing from the project folder are taken from the RTP folder(s).

## Engine notes

- Screen is 320x240, tiles 16px, 60 fps, movement in 1/256-tile steps like RPG_RT.
- Chipset autotiles, passability and terrain follow EasyRPG's documented layout.
- Text uses the game's own `.fon` fonts with the System graphic's colour cells and a
  fixed 6px advance, so accents render exactly like the original.
- Battle formulas (hit, critical, damage, variance, EXP curve) follow RPG Maker 2000.
- Saves live in `localStorage` (15 slots) and store switches, variables, party, items,
  map position, event positions, screen tint and weather.

## Credits and licensing

The game, its story, sprites and music arrangements belong to their original fan
authors; Saint Seiya is © Masami Kurumada / Toei Animation. Several graphics and songs
come from the RPG Maker 2000 RTP, whose license restricts use to RPG Maker games. Keep
that in mind before publishing the `assets/` folder. The runtime code in `js/` and
`tools/` is original; `tools/lcf/*.csv` come from the liblcf project (MIT).
