#!/usr/bin/env python3
"""Extract a Windows bitmap font (.fon, NE executable with FNT resources) into a
PNG glyph atlas + JSON metrics usable by the web runtime.

Usage: python tools/fon2png.py <font.fon> <out.png> <out.json> [--size 12]
"""
import json
import struct
import sys

from PIL import Image


def read_fnt_resources(data):
    if data[:2] != b"MZ":
        raise ValueError("not an MZ executable")
    ne = struct.unpack_from("<I", data, 0x3C)[0]
    if data[ne:ne + 2] != b"NE":
        raise ValueError("not an NE executable")
    rsrc = ne + struct.unpack_from("<H", data, ne + 0x24)[0]
    shift = struct.unpack_from("<H", data, rsrc)[0]
    p = rsrc + 2
    fonts = []
    while True:
        type_id, count = struct.unpack_from("<HH", data, p)
        if type_id == 0:
            break
        p += 8
        for _ in range(count):
            off, length = struct.unpack_from("<HH", data, p)
            p += 12
            if type_id == 0x8008:  # RT_FONT
                fonts.append(data[off << shift:(off << shift) + (length << shift)])
    return fonts


def parse_fnt(f):
    version = struct.unpack_from("<H", f, 0)[0]
    points = struct.unpack_from("<H", f, 0x44)[0]
    pix_height = struct.unpack_from("<H", f, 0x58)[0]
    first_char, last_char = f[0x5F], f[0x60]
    entry_size = 4 if version == 0x200 else 6
    table = 0x76 if version == 0x200 else 0x94
    glyphs = {}
    for i in range(last_char - first_char + 1):
        e = table + i * entry_size
        if version == 0x200:
            width, offset = struct.unpack_from("<HH", f, e)
        else:
            width, offset = struct.unpack_from("<HI", f, e)
        rows = []
        cols = (width + 7) // 8
        for y in range(pix_height):
            bits = 0
            for c in range(cols):
                bits = (bits << 8) | f[offset + c * pix_height + y]
            rows.append(bits >> (cols * 8 - width) if width else 0)
        glyphs[first_char + i] = (width, rows)
    return {"points": points, "height": pix_height, "glyphs": glyphs}


def main():
    src, out_png, out_json = sys.argv[1:4]
    want = 12
    if "--size" in sys.argv:
        want = int(sys.argv[sys.argv.index("--size") + 1])
    fonts = [parse_fnt(f) for f in read_fnt_resources(open(src, "rb").read())]
    font = min(fonts, key=lambda ft: abs(ft["height"] - want))
    h = font["height"]
    cell = 16
    img = Image.new("RGBA", (cell * 16, cell * 16), (0, 0, 0, 0))
    px = img.load()
    metrics = {"height": h, "cell": cell, "widths": {}}
    for code, (width, rows) in font["glyphs"].items():
        if code > 255:
            continue
        cx, cy = (code % 16) * cell, (code // 16) * cell
        for y, bits in enumerate(rows):
            for x in range(width):
                if bits >> (width - 1 - x) & 1:
                    px[cx + x, cy + y] = (255, 255, 255, 255)
        metrics["widths"][str(code)] = width
    img.save(out_png)
    with open(out_json, "w") as fp:
        json.dump(metrics, fp)
    print("%s: %d fonts, picked height %d, %d glyphs" % (src, len(fonts), h, len(metrics["widths"])))


if __name__ == "__main__":
    main()
