"""Read an RPG Maker 2000/2003 project folder into plain Python dicts."""
from __future__ import annotations

import os
import sys
from dataclasses import dataclass

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from lcf import reader  # noqa: E402

from .routes import decode_inline_route  # noqa: E402

MOVE_EVENT = 11330
RM2003_LDB_ID = 2003


@dataclass
class Project:
    db: dict
    tree: dict
    maps: dict[int, dict]
    engine: str  # "2k" or "2k3"


def detect_engine(game: str) -> str:
    """RM2003 databases carry ldb_id 2003 in System (liblcf DatabaseVersion)."""
    reader.set_engine("2k")
    db = reader.read_database(os.path.join(game, "RPG_RT.ldb"))
    return "2k3" if db["system"].get("ldb_id") == RM2003_LDB_ID else "2k"


def read_maps(game: str, tree: dict, log) -> dict[int, dict]:
    maps = {}
    for mid, info in tree["maps"].items():
        if info["type"] != 1:  # 0 = root, 2 = area
            continue
        path = os.path.join(game, "Map%04d.lmu" % mid)
        if not os.path.exists(path):
            log("  missing map file %s" % path)
            continue
        maps[mid] = reader.read_map(path)
    return maps


def inline_move_routes(maps: dict[int, dict]) -> None:
    """Decode MoveEvent's flat int route so the runtime gets ready-made commands."""
    for m in maps.values():
        for ev in m["events"].values():
            for pg in ev["pages"].values():
                for c in pg["event_commands"]:
                    if c["code"] == MOVE_EVENT:
                        c["route"] = decode_inline_route(c["params"][4:])
                        c["params"] = c["params"][:4]


def load_project(game: str, encoding: str, log) -> Project:
    """Example: load_project("/games/Holy Avenger", "cp1252", print).engine -> "2k3" """
    reader.set_encoding(encoding)
    engine = detect_engine(game)
    reader.set_engine(engine)
    db = reader.read_database(os.path.join(game, "RPG_RT.ldb"))
    tree = reader.read_maptree(os.path.join(game, "RPG_RT.lmt"))
    maps = read_maps(game, tree, log)
    inline_move_routes(maps)
    return Project(db=db, tree=tree, maps=maps, engine=engine)


def event_command_lists(project: Project):
    """Yield every event command list: map pages, common events, troop pages."""
    for m in project.maps.values():
        for ev in m["events"].values():
            for pg in ev["pages"].values():
                yield pg["event_commands"]
    for ce in project.db["commonevents"].values():
        yield ce["event_commands"]
    for tr in project.db["troops"].values():
        for pg in tr["pages"].values():
            yield pg["event_commands"]
