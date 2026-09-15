#!/usr/bin/env python3
"""Convert an RPG Maker 2000 project into the JSON + web assets used by this game.

Usage:
    python tools/convert.py --game "<project folder>" --rtp "<RTP 2000 folder>" \
        [--out <repo root>] [--sf2 <soundfont.sf2>] [--skip-audio] [--encoding cp1252]

Nothing here is specific to one game: every path comes from the command line.
Output:
    data/database.json, data/maptree.json, data/maps/mapNNNN.json,
    data/manifest.json (asset index), assets/<category>/<name>.<ext>
"""
import argparse
import collections
import json
import os
import shutil
import struct
import subprocess
import sys
import wave

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lcf import reader  # noqa: E402

try:
    from PIL import Image
except ImportError:  # pragma: no cover
    Image = None

IMAGE_EXT = (".png", ".bmp", ".xyz")
AUDIO_EXT = (".mid", ".midi", ".wav", ".ogg", ".mp3")

# category -> (folder name in RPG Maker project, transparent?)
CATEGORIES = {
    "chipset": ("ChipSet", True),
    "charset": ("CharSet", True),
    "faceset": ("FaceSet", True),
    "monster": ("Monster", True),
    "battle": ("Battle", True),
    "backdrop": ("Backdrop", False),
    "panorama": ("Panorama", False),
    "picture": ("Picture", True),
    "system": ("System", True),
    "title": ("Title", False),
    "gameover": ("GameOver", False),
    "music": ("Music", None),
    "sound": ("Sound", None),
}

# event command code -> asset category of the command's string
CMD_ASSET = {
    10130: "faceset", 10630: "charset", 10640: "faceset", 10660: "music", 10670: "sound",
    10680: "system", 10710: "backdrop", 11110: "picture", 11510: "music", 11550: "sound",
    11720: "panorama", 13210: "backdrop",
}


def log(msg):
    print(msg, file=sys.stderr)


# ---------------------------------------------------------------------------
# Asset lookup
# ---------------------------------------------------------------------------


class AssetIndex:
    """Case-insensitive lookup of resource files across the game folder and RTP."""

    def __init__(self, roots):
        self.files = {}  # (folder.lower(), basename-without-ext.lower()) -> [paths]
        for root in roots:
            if not root or not os.path.isdir(root):
                continue
            for folder in os.listdir(root):
                fp = os.path.join(root, folder)
                if not os.path.isdir(fp):
                    continue
                for fn in os.listdir(fp):
                    base, ext = os.path.splitext(fn)
                    key = (folder.lower(), base.lower())
                    self.files.setdefault(key, []).append(os.path.join(fp, fn))

    def find(self, folder, name, exts):
        for path in self.files.get((folder.lower(), name.lower()), []):
            if os.path.splitext(path)[1].lower() in exts:
                return path
        return None


# ---------------------------------------------------------------------------
# Image conversion
# ---------------------------------------------------------------------------


def convert_image(src, dst, transparent):
    im = Image.open(src)
    if im.mode == "P":
        pal = im.getpalette()
        if transparent:
            # RPG Maker 2000: palette index 0 is the transparent colour
            im = im.convert("RGBA")
            src_idx = Image.open(src)
            mask = src_idx.point(lambda i: 255 if i == 0 else 0, mode="L") if src_idx.mode == "P" else None
            if mask is not None:
                alpha = Image.eval(mask, lambda v: 255 - v)
                im.putalpha(alpha)
        else:
            im = im.convert("RGB")
    elif transparent and im.mode != "RGBA":
        im = im.convert("RGBA")
    im.save(dst, optimize=True)
    return im.size


# ---------------------------------------------------------------------------
# Audio conversion
# ---------------------------------------------------------------------------


def render_midi(src, wav_out, sf2, seconds_max=600):
    import tinysoundfont as tsf

    rate = 44100
    synth = tsf.Synth(gain=-6.0, samplerate=rate)
    synth.sfload(sf2)
    seq = tsf.Sequencer(synth)
    seq.midi_load(src)
    chunk = 4096
    frames = []
    total = 0
    tail = 0
    while total < rate * seconds_max:
        buf = synth.generate(chunk)
        frames.append(bytes(buf))
        total += chunk
        if seq.is_empty():
            tail += chunk
            if tail >= rate * 1.5:
                break
    raw = b"".join(frames)
    n = len(raw) // 4
    floats = struct.unpack("<%df" % n, raw[: n * 4])
    ints = struct.pack("<%dh" % n, *[max(-32768, min(32767, int(v * 32767))) for v in floats])
    with wave.open(wav_out, "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(ints)


def to_ogg(src, dst, quality="4"):
    subprocess.run(
        ["ffmpeg", "-y", "-loglevel", "error", "-i", src, "-c:a", "libvorbis", "-q:a", quality, dst],
        check=True,
    )


# ---------------------------------------------------------------------------
# Reference collection
# ---------------------------------------------------------------------------


def collect_refs(db, tree, maps):
    refs = collections.defaultdict(set)

    def add(cat, name):
        if name and name != "(OFF)":
            refs[cat].add(name)

    def add_music(m):
        add("music", m.get("name"))

    def add_sound(s):
        add("sound", s.get("name"))

    def scan_commands(cmds):
        for c in cmds:
            cat = CMD_ASSET.get(c["code"])
            if cat:
                if c["code"] == 10710 and c["params"][2] != 1:
                    continue  # encounter: backdrop only when "specific background"
                add(cat, c["string"])
            if c["code"] == 11330:  # MoveEvent inline route
                for i in c["params"]:
                    pass
            if c["code"] == 11710:
                pass

    def scan_move(route):
        for mc in route.get("move_commands", []):
            if mc["code"] == 34:
                add("charset", mc.get("string"))
            elif mc["code"] == 35:
                add("sound", mc.get("string"))

    for a in db["actors"].values():
        add("charset", a["character_name"])
        add("faceset", a["face_name"])
    for e in db["enemies"].values():
        add("monster", e["battler_name"])
    for an in db["animations"].values():
        add("battle", an["animation_name"])
        for t in an["timings"].values():
            add_sound(t["se"])
    for t in db["terrains"].values():
        add("backdrop", t["background_name"])
    for c in db["chipsets"].values():
        add("chipset", c["chipset_name"])
    sysd = db["system"]
    add("system", sysd["system_name"])
    add("title", sysd["title_name"])
    add("gameover", sysd["gameover_name"])
    for k, v in sysd.items():
        if k.endswith("_music"):
            add_music(v)
        elif k.endswith("_se"):
            add_sound(v)
    for s in db["skills"].values():
        add_sound(s["sound_effect"])
    for ce in db["commonevents"].values():
        scan_commands(ce["event_commands"])
    for tr in db["troops"].values():
        for pg in tr["pages"].values():
            scan_commands(pg["event_commands"])
    for mi in tree["maps"].values():
        add_music(mi["music"])
        add("backdrop", mi["background_name"])
    for m in maps.values():
        add("panorama", m["parallax_name"])
        for ev in m["events"].values():
            for pg in ev["pages"].values():
                add("charset", pg["character_name"])
                scan_commands(pg["event_commands"])
                scan_move(pg["move_route"])
                for c in pg["event_commands"]:
                    if c["code"] == 11330:
                        # inline move route: parameters after the 4th are move commands
                        scan_move({"move_commands": decode_inline_route(c["params"][4:])})
    return refs


def decode_inline_route(params):
    """MoveEvent (11330) stores the route as a flat int list inside params."""
    out = []
    i = 0
    while i < len(params):
        code = params[i]
        i += 1
        c = {"code": code}
        if code in (34, 35):
            n = params[i]
            i += 1
            c["string"] = "".join(chr(x) for x in params[i:i + n])
            i += n
        if code in (32, 33, 34, 35):
            c["a"] = params[i]
            i += 1
        if code == 35:
            c["b"], c["c"] = params[i], params[i + 1]
            i += 2
        out.append(c)
    return out


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--game", required=True, help="RPG Maker 2000 project folder (contains RPG_RT.ldb)")
    ap.add_argument("--rtp", action="append", default=[], help="RTP folder(s) used as fallback for missing assets")
    ap.add_argument("--out", default=os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."), help="repo root")
    ap.add_argument("--sf2", default="", help="SoundFont for MIDI rendering (skips MIDI music if missing)")
    ap.add_argument("--skip-audio", action="store_true")
    ap.add_argument("--encoding", default="cp1252")
    args = ap.parse_args()

    reader.set_encoding(args.encoding)
    game = args.game
    out = os.path.abspath(args.out)
    data_dir = os.path.join(out, "data")
    maps_dir = os.path.join(data_dir, "maps")
    assets_dir = os.path.join(out, "assets")
    os.makedirs(maps_dir, exist_ok=True)

    log("Reading database...")
    db = reader.read_database(os.path.join(game, "RPG_RT.ldb"))
    tree = reader.read_maptree(os.path.join(game, "RPG_RT.lmt"))
    maps = {}
    for mid, info in tree["maps"].items():
        if info["type"] != 1:
            continue
        path = os.path.join(game, "Map%04d.lmu" % mid)
        if os.path.exists(path):
            maps[mid] = reader.read_map(path)
        else:
            log("  missing map file %s" % path)
    log("  %d maps, %d actors, %d items, %d enemies, %d troops" % (
        len(maps), len(db["actors"]), len(db["items"]), len(db["enemies"]), len(db["troops"])))

    # Decode inline move routes so the runtime does not have to
    for m in maps.values():
        for ev in m["events"].values():
            for pg in ev["pages"].values():
                for c in pg["event_commands"]:
                    if c["code"] == 11330:
                        c["route"] = decode_inline_route(c["params"][4:])
                        c["params"] = c["params"][:4]

    # ---- JSON ---------------------------------------------------------------
    def dump(obj, path):
        with open(path, "w", encoding="utf-8") as f:
            json.dump(obj, f, ensure_ascii=False, separators=(",", ":"))

    dump(db, os.path.join(data_dir, "database.json"))
    dump(tree, os.path.join(data_dir, "maptree.json"))
    for mid, m in maps.items():
        dump(m, os.path.join(maps_dir, "map%04d.json" % mid))

    # ---- Assets -------------------------------------------------------------
    refs = collect_refs(db, tree, maps)
    index = AssetIndex([game] + args.rtp)
    manifest = {}
    missing = []
    for cat, (folder, transparent) in CATEGORIES.items():
        names = sorted(refs.get(cat, []))
        if not names:
            continue
        cdir = os.path.join(assets_dir, cat)
        os.makedirs(cdir, exist_ok=True)
        manifest[cat] = {}
        for name in names:
            is_audio = transparent is None
            src = index.find(folder, name, AUDIO_EXT if is_audio else IMAGE_EXT)
            if not src:
                missing.append("%s/%s" % (folder, name))
                continue
            safe = name.lower().replace(" ", "_")
            ext = os.path.splitext(src)[1].lower()
            if is_audio:
                if args.skip_audio:
                    continue
                dst = os.path.join(cdir, safe + ".ogg")
                if not os.path.exists(dst):
                    try:
                        if ext in (".mid", ".midi"):
                            if not args.sf2:
                                missing.append("%s/%s (no --sf2 for MIDI)" % (folder, name))
                                continue
                            tmp = dst + ".wav"
                            render_midi(src, tmp, args.sf2)
                            to_ogg(tmp, dst)
                            os.remove(tmp)
                        else:
                            to_ogg(src, dst)
                    except Exception as ex:  # noqa: BLE001
                        missing.append("%s/%s (audio error: %s)" % (folder, name, ex))
                        continue
                manifest[cat][name] = "assets/%s/%s.ogg" % (cat, safe)
            else:
                dst = os.path.join(cdir, safe + ".png")
                w, h = convert_image(src, dst, transparent)
                manifest[cat][name] = {"file": "assets/%s/%s.png" % (cat, safe), "w": w, "h": h}
            log("  %s/%s <- %s" % (cat, name, os.path.relpath(src, os.path.dirname(game))))

    dump(manifest, os.path.join(data_dir, "manifest.json"))
    if missing:
        log("MISSING (%d):" % len(missing))
        for m in missing:
            log("  " + m)

    # ---- Stats ----------------------------------------------------------------
    codes = collections.Counter()
    for m in maps.values():
        for ev in m["events"].values():
            for pg in ev["pages"].values():
                for c in pg["event_commands"]:
                    codes[c["code"]] += 1
    for ce in db["commonevents"].values():
        for c in ce["event_commands"]:
            codes[c["code"]] += 1
    for tr in db["troops"].values():
        for pg in tr["pages"].values():
            for c in pg["event_commands"]:
                codes[c["code"]] += 1
    names = reader.SCHEMA.enums["EventCommand_Code"]
    log("Event command usage:")
    for code, n in sorted(codes.items()):
        log("  %6d %-28s %d" % (code, names.get(code, "?"), n))


if __name__ == "__main__":
    main()
