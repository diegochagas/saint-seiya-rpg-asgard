"""Find referenced assets in the game + RTP folders and write them as web assets."""
from __future__ import annotations

import json
import os
from dataclasses import dataclass, field

from . import media

IMAGE_EXT = (".png", ".bmp", ".xyz")
AUDIO_EXT = (".mid", ".midi", ".wav", ".ogg", ".mp3")
MOVIE_EXT = (".avi", ".mpg", ".mpeg", ".mp4", ".wmv")
MIDI_EXT = (".mid", ".midi")
MIDI_OGG_QUALITY = "1"

# category -> (folder in the RPG Maker project, kind); kind: "alpha"/"opaque" image, "audio", "movie"
CATEGORIES = {
    "chipset": ("ChipSet", "alpha"), "charset": ("CharSet", "alpha"), "faceset": ("FaceSet", "alpha"),
    "monster": ("Monster", "alpha"), "battle": ("Battle", "alpha"), "battle2": ("Battle2", "alpha"),
    "battlecharset": ("BattleCharSet", "alpha"), "battleweapon": ("BattleWeapon", "alpha"),
    "backdrop": ("Backdrop", "opaque"), "panorama": ("Panorama", "opaque"), "picture": ("Picture", "alpha"),
    "system": ("System", "alpha"), "system2": ("System2", "alpha"), "frame": ("Frame", "alpha"),
    "title": ("Title", "opaque"), "gameover": ("GameOver", "opaque"),
    "music": ("Music", "audio"), "sound": ("Sound", "audio"), "movie": ("Movie", "movie"),
}
EXTS = {"alpha": IMAGE_EXT, "opaque": IMAGE_EXT, "audio": AUDIO_EXT, "movie": MOVIE_EXT}


class AssetIndex:
    """Case-insensitive lookup of resource files across the game folder and RTP folders."""

    def __init__(self, roots: list[str]) -> None:
        self.files: dict[tuple[str, str], list[str]] = {}
        for root in roots:
            for folder in sorted(os.listdir(root)) if os.path.isdir(root) else []:
                self._add_folder(os.path.join(root, folder))

    def _add_folder(self, fp: str) -> None:
        if not os.path.isdir(fp):
            return
        for fn in os.listdir(fp):
            key = (os.path.basename(fp).lower(), os.path.splitext(fn)[0].lower())
            self.files.setdefault(key, []).append(os.path.join(fp, fn))

    def find(self, folder: str, name: str, exts: tuple[str, ...]) -> str | None:
        for path in self.files.get((folder.lower(), name.lower()), []):
            if os.path.splitext(path)[1].lower() in exts:
                return path
        return None


@dataclass
class ExportOptions:
    assets_dir: str
    sf2: str = ""
    skip_audio: bool = False
    missing: list[str] = field(default_factory=list)


def _audio(src: str, dst: str, opts: ExportOptions) -> None:
    if os.path.splitext(src)[1].lower() not in MIDI_EXT:
        media.to_ogg(src, dst)
        return
    if not opts.sf2:
        raise RuntimeError("MIDI %s needs --sf2 <GM soundfont>" % src)
    tmp = dst + ".wav"
    media.render_midi(src, tmp, opts.sf2)
    media.to_ogg(tmp, dst, quality=MIDI_OGG_QUALITY)
    os.remove(tmp)


def export_one(cat: str, kind: str, src: str, opts: ExportOptions, safe: str) -> object:
    """Write one asset; returns its manifest entry (path string, or file + size for images)."""
    rel = {"audio": "%s.ogg", "movie": "%s.webm"}.get(kind, "%s.png") % safe
    dst = os.path.join(opts.assets_dir, cat, rel)
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    if kind in ("alpha", "opaque"):
        w, h = media.convert_image(src, dst, kind == "alpha")
        return {"file": "assets/%s/%s" % (cat, rel), "w": w, "h": h}
    if os.path.exists(dst):  # audio/movie encoding is slow: reuse earlier output
        return "assets/%s/%s" % (cat, rel)
    if kind == "movie":
        media.to_webm(src, dst)
    else:
        _audio(src, dst, opts)
    return "assets/%s/%s" % (cat, rel)


def export_category(cat: str, names: set[str], index: AssetIndex, opts: ExportOptions, log) -> dict:
    folder, kind = CATEGORIES[cat]
    entries = {}
    for name in sorted(names):
        src = index.find(folder, name, EXTS[kind])
        if not src:
            opts.missing.append("%s/%s" % (folder, name))
            continue
        if kind == "audio" and opts.skip_audio:
            continue
        try:
            entries[name] = export_one(cat, kind, src, opts, name.lower().replace(" ", "_"))
        except (RuntimeError, OSError, ValueError) as ex:
            opts.missing.append("%s/%s (%s)" % (folder, name, ex))
            continue
        log("  %s/%s <- %s" % (cat, name, src))
    return entries


def export_assets(refs: dict[str, set[str]], index: AssetIndex, opts: ExportOptions, log) -> dict:
    """Example: export_assets({"charset": {"Hero"}}, idx, opts, print) -> {"charset": {"Hero": {...}}}"""
    manifest = {}
    for cat in CATEGORIES:
        if refs.get(cat):
            manifest[cat] = export_category(cat, refs[cat], index, opts, log)
    return manifest


def write_json(obj: object, path: str) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, separators=(",", ":"))
