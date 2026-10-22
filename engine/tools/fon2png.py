#!/usr/bin/env python3
"""Extract a Windows bitmap font (.fon, NE executable with FNT resources) into a
PNG glyph atlas + JSON metrics usable by the web runtime.

Usage: python engine/tools/fon2png.py <font.fon> <out.png> <out.json> [--size 12]
Example: python engine/tools/fon2png.py Rm2000.fon assets/font/rm2000.png assets/font/rm2000.json
"""
from __future__ import annotations

import json
import struct
import sys

from PIL import Image

RT_FONT = 0x8008
ATLAS_CELL = 16


def read_fnt_resources(data: bytes) -> list[bytes]:
    """Every RT_FONT resource of an NE executable."""
    if data[:2] != b"MZ":
        raise ValueError("not an MZ executable: starts with %r" % data[:2])
    ne = struct.unpack_from("<I", data, 0x3C)[0]
    if data[ne:ne + 2] != b"NE":
        raise ValueError("not an NE executable: header %r at 0x%x" % (data[ne:ne + 2], ne))
    rsrc = ne + struct.unpack_from("<H", data, ne + 0x24)[0]
    shift = struct.unpack_from("<H", data, rsrc)[0]
    p = rsrc + 2
    fonts = []
    while True:
        type_id, count = struct.unpack_from("<HH", data, p)
        if type_id == 0:
            return fonts
        p += 8
        for _ in range(count):
            off, length = struct.unpack_from("<HH", data, p)
            p += 12
            if type_id == RT_FONT:
                fonts.append(data[off << shift:(off << shift) + (length << shift)])


def glyph_rows(f: bytes, offset: int, width: int, height: int) -> list[int]:
    """One int per pixel row, leftmost pixel in the highest bit (FNT stores glyphs column-major)."""
    cols = (width + 7) // 8
    rows = []
    for y in range(height):
        bits = 0
        for c in range(cols):
            bits = (bits << 8) | f[offset + c * height + y]
        rows.append(bits >> (cols * 8 - width) if width else 0)
    return rows


def parse_fnt(f: bytes) -> dict:
    """{"points", "height", "glyphs": {code: (width, rows)}} from one FNT resource (v2 or v3)."""
    version = struct.unpack_from("<H", f, 0)[0]
    pix_height = struct.unpack_from("<H", f, 0x58)[0]
    first_char, last_char = f[0x5F], f[0x60]
    entry_size, table, entry_fmt = (4, 0x76, "<HH") if version == 0x200 else (6, 0x94, "<HI")
    glyphs = {}
    for i in range(last_char - first_char + 1):
        width, offset = struct.unpack_from(entry_fmt, f, table + i * entry_size)
        glyphs[first_char + i] = (width, glyph_rows(f, offset, width, pix_height))
    return {"points": struct.unpack_from("<H", f, 0x44)[0], "height": pix_height, "glyphs": glyphs}


def render_atlas(font: dict) -> tuple[Image.Image, dict]:
    """16x16 grid of white glyphs (codes 0-255) and their metrics."""
    img = Image.new("RGBA", (ATLAS_CELL * 16, ATLAS_CELL * 16), (0, 0, 0, 0))
    px = img.load()
    metrics = {"height": font["height"], "cell": ATLAS_CELL, "widths": {}}
    for code, (width, rows) in font["glyphs"].items():
        if code > 255:
            continue
        cx, cy = (code % 16) * ATLAS_CELL, (code // 16) * ATLAS_CELL
        for y, bits in enumerate(rows):
            for x in range(width):
                if bits >> (width - 1 - x) & 1:
                    px[cx + x, cy + y] = (255, 255, 255, 255)
        metrics["widths"][str(code)] = width
    return img, metrics


def main() -> None:
    src, out_png, out_json = sys.argv[1:4]
    want = int(sys.argv[sys.argv.index("--size") + 1]) if "--size" in sys.argv else 12
    with open(src, "rb") as fp:
        fonts = [parse_fnt(f) for f in read_fnt_resources(fp.read())]
    font = min(fonts, key=lambda ft: abs(ft["height"] - want))
    img, metrics = render_atlas(font)
    img.save(out_png)
    with open(out_json, "w") as fp:
        json.dump(metrics, fp)
    print("%s: %d fonts, picked height %d, %d glyphs" % (src, len(fonts), font["height"], len(metrics["widths"])))


if __name__ == "__main__":
    main()
