"""Collect every asset name a project references, grouped by asset category."""
from __future__ import annotations

import collections

from .project import MOVE_EVENT, Project, event_command_lists
from .routes import decode_inline_route

# event command code -> asset category of the command's string
CMD_ASSET = {
    10130: "faceset", 10630: "charset", 10640: "faceset", 10660: "music", 10670: "sound",
    10680: "system", 10710: "backdrop", 11110: "picture", 11510: "music", 11550: "sound",
    11560: "movie", 11720: "panorama", 13210: "backdrop",
}
ENEMY_ENCOUNTER = 10710
SPECIFIC_BACKGROUND = 1
ROUTE_GRAPHIC, ROUTE_SE = 34, 35
POSE_CHARSET = 0  # BattlerAnimationPose.animation_type: 0 = BattleCharSet cell, 1 = battle animation


class RefSet:
    def __init__(self) -> None:
        self.by_cat: dict[str, set[str]] = collections.defaultdict(set)

    def add(self, cat: str, name: str | None) -> None:
        if name and name != "(OFF)":
            self.by_cat[cat].add(name)

    def audio(self, cat: str, entry: dict) -> None:
        self.add(cat, entry.get("name"))


def scan_commands(refs: RefSet, cmds: list[dict]) -> None:
    for c in cmds:
        cat = CMD_ASSET.get(c["code"])
        if cat and not (c["code"] == ENEMY_ENCOUNTER and c["params"][2] != SPECIFIC_BACKGROUND):
            refs.add(cat, c["string"])
        if c["code"] == MOVE_EVENT:
            scan_route(refs, c.get("route") or decode_inline_route(c["params"][4:]))


def scan_route(refs: RefSet, move_commands: list[dict]) -> None:
    for mc in move_commands:
        if mc["code"] == ROUTE_GRAPHIC:
            refs.add("charset", mc.get("string"))
        elif mc["code"] == ROUTE_SE:
            refs.add("sound", mc.get("string"))


def scan_database(refs: RefSet, db: dict) -> None:
    for a in db["actors"].values():
        refs.add("charset", a["character_name"])
        refs.add("faceset", a["face_name"])
    for e in db["enemies"].values():
        refs.add("monster", e["battler_name"])
    for an in db["animations"].values():
        refs.add("battle2" if an.get("large") else "battle", an["animation_name"])
        for t in an["timings"].values():
            refs.audio("sound", t["se"])
    for t in db["terrains"].values():
        refs.add("backdrop", t["background_name"])
    for c in db["chipsets"].values():
        refs.add("chipset", c["chipset_name"])
    for s in db["skills"].values():
        refs.audio("sound", s["sound_effect"])


def scan_system(refs: RefSet, sysd: dict) -> None:
    refs.add("system", sysd["system_name"])
    refs.add("system2", sysd.get("system2_name"))
    refs.add("title", sysd["title_name"])
    refs.add("gameover", sysd["gameover_name"])
    if sysd.get("show_frame"):
        refs.add("frame", sysd.get("frame_name"))
    for k, v in sysd.items():
        if k.endswith("_music"):
            refs.audio("music", v)
        elif k.endswith("_se"):
            refs.audio("sound", v)


def scan_battler_animations(refs: RefSet, db: dict) -> None:
    """RM2003 side-view battlers: pose sheets in BattleCharSet, weapon sheets in BattleWeapon."""
    for ba in db.get("battleranimations", {}).values():
        for pose in ba["poses"].values():
            if pose["animation_type"] == POSE_CHARSET:
                refs.add("battlecharset", pose["battler_name"])
        for weapon in ba["weapons"].values():
            refs.add("battleweapon", weapon["weapon_name"])


def scan_maps(refs: RefSet, project: Project) -> None:
    for mi in project.tree["maps"].values():
        refs.audio("music", mi["music"])
        refs.add("backdrop", mi["background_name"])
    for m in project.maps.values():
        refs.add("panorama", m["parallax_name"])
        for ev in m["events"].values():
            for pg in ev["pages"].values():
                refs.add("charset", pg["character_name"])
                scan_route(refs, pg["move_route"].get("move_commands", []))


def collect_refs(project: Project) -> dict[str, set[str]]:
    """Example: collect_refs(p)["charset"] -> {"Hero1", "People2", ...}"""
    refs = RefSet()
    scan_database(refs, project.db)
    scan_system(refs, project.db["system"])
    scan_battler_animations(refs, project.db)
    scan_maps(refs, project)
    for cmds in event_command_lists(project):
        scan_commands(refs, cmds)
    return refs.by_cat
