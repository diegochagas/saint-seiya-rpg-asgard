#!/usr/bin/env python3
"""Convert an RPG Maker 2000/2003 project into the JSON + web assets used by this game.

Usage:
    python engine/tools/convert.py --game "<project folder>" --rtp "<RTP folder>" [--rtp ...] \
        [--out <game repo root>] [--sf2 <soundfont.sf2>] [--skip-audio] [--encoding cp1252]

Nothing here is specific to one game: every path comes from the command line.
Output:
    data/database.json, data/maptree.json, data/maps/mapNNNN.json,
    data/manifest.json (asset index + engine), assets/<category>/<name>.<ext>
"""
from __future__ import annotations

import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from rmconv import export, project, refs, stats  # noqa: E402


def log(msg: str) -> None:
    print(msg, file=sys.stderr)


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--game", required=True, help="RPG Maker project folder (contains RPG_RT.ldb)")
    ap.add_argument("--rtp", action="append", default=[], help="RTP folder(s) used for missing assets")
    ap.add_argument("--out", default=os.getcwd(), help="game repo root (default: current folder)")
    ap.add_argument("--sf2", default="", help="GM SoundFont for MIDI rendering")
    ap.add_argument("--skip-audio", action="store_true")
    ap.add_argument("--encoding", default="cp1252")
    return ap.parse_args(argv)


def write_data(proj: project.Project, data_dir: str) -> None:
    export.write_json(proj.db, os.path.join(data_dir, "database.json"))
    export.write_json(proj.tree, os.path.join(data_dir, "maptree.json"))
    for mid, m in proj.maps.items():
        export.write_json(m, os.path.join(data_dir, "maps", "map%04d.json" % mid))


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    out = os.path.abspath(args.out)
    log("Reading %s ..." % args.game)
    proj = project.load_project(args.game, args.encoding, log)
    db = proj.db
    log("  RPG Maker %s: %d maps, %d actors, %d enemies, %d troops" % (
        proj.engine, len(proj.maps), len(db["actors"]), len(db["enemies"]), len(db["troops"])))
    write_data(proj, os.path.join(out, "data"))
    opts = export.ExportOptions(os.path.join(out, "assets"), args.sf2, args.skip_audio)
    index = export.AssetIndex([args.game] + args.rtp)
    manifest = export.export_assets(refs.collect_refs(proj), index, opts, log)
    manifest["engine"] = proj.engine
    export.write_json(manifest, os.path.join(out, "data", "manifest.json"))
    for m in opts.missing:
        log("MISSING " + m)
    stats.log_command_usage(proj, log)
    return 0


if __name__ == "__main__":
    sys.exit(main())
