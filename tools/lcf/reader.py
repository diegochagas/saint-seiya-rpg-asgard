"""Generic RPG Maker 2000/2003 LCF reader driven by liblcf's schema CSVs.

The CSV files next to this module (fields.csv, enums.csv, flags.csv) come from
https://github.com/EasyRPG/liblcf (generator/csv) and describe every chunk id,
type and default value of the LDB / LMT / LMU formats.
"""
import csv
import os
import struct

HERE = os.path.dirname(os.path.abspath(__file__))

# ---------------------------------------------------------------------------
# Schema
# ---------------------------------------------------------------------------


def _parse_default(raw, typ):
    raw = raw.strip()
    if raw == "":
        return None
    if "|" in raw:  # "2k|2k3" defaults: keep the RPG Maker 2000 one
        raw = raw.split("|")[0]
    if raw.startswith('"') and raw.endswith('"'):
        return raw.strip('"')
    if raw == "True":
        return True
    if raw == "False":
        return False
    if raw.startswith("["):  # e.g. [1]*162 or [31]+[15]*143 or "[1]"
        try:
            return eval(raw, {"__builtins__": {}}, {})  # noqa: S307 (trusted CSV)
        except Exception:
            return None
    try:
        return int(raw)
    except ValueError:
        try:
            return float(raw)
        except ValueError:
            return raw


class Schema:
    def __init__(self):
        self.fields = {}  # struct -> list of dicts
        self.flags = {}   # struct -> ordered flag names
        self.enums = {}   # "Struct.Entry" -> {value: name}
        with open(os.path.join(HERE, "fields.csv"), newline="") as f:
            for row in csv.DictReader(f):
                st = row["Structure"]
                idx = row["Index"].strip()
                self.fields.setdefault(st, []).append({
                    "name": row["Field"],
                    "size_field": row["Size Field?"].strip() == "t",
                    "type": row["Type"].strip(),
                    "id": int(idx, 16) if idx else None,
                    "default": _parse_default(row["Default Value"], row["Type"]),
                    "is2k3": row["Is2k3"].strip() == "1",
                })
        with open(os.path.join(HERE, "flags.csv"), newline="") as f:
            for row in csv.DictReader(f):
                self.flags.setdefault(row["Structure"], []).append(row["Field"])
        with open(os.path.join(HERE, "enums.csv"), newline="") as f:
            for row in csv.DictReader(f):
                key = row["Structure"] + "_" + row["Entry"]
                self.enums.setdefault(key, {})[int(row["Index"])] = row["Value"]

    def chunk_fields(self, st):
        return [fl for fl in self.fields[st] if fl["id"] is not None]

    def raw_fields(self, st):
        return [fl for fl in self.fields[st] if fl["id"] is None]


SCHEMA = Schema()

# ---------------------------------------------------------------------------
# Binary helpers
# ---------------------------------------------------------------------------


class Stream:
    def __init__(self, data, pos=0, end=None):
        self.b = data
        self.p = pos
        self.end = len(data) if end is None else end

    def eof(self):
        return self.p >= self.end

    def ber(self):
        v = 0
        while True:
            c = self.b[self.p]
            self.p += 1
            v = (v << 7) | (c & 0x7F)
            if not (c & 0x80):
                break
        if v >= 0x80000000:
            v -= 0x100000000
        return v

    def read(self, n):
        d = self.b[self.p:self.p + n]
        self.p += n
        return d

    def string(self, n):
        return self.read(n).decode(ENCODING, errors="replace")


ENCODING = "cp1252"


def set_encoding(enc):
    global ENCODING
    ENCODING = enc


# ---------------------------------------------------------------------------
# Decoders
# ---------------------------------------------------------------------------


def _int16s(data):
    return list(struct.unpack("<%dh" % (len(data) // 2), data[: len(data) // 2 * 2]))


def _uint32s(data):
    return list(struct.unpack("<%dI" % (len(data) // 4), data[: len(data) // 4 * 4]))


def read_event_commands(s):
    cmds = []
    while not s.eof():
        code = s.ber()
        indent = s.ber()
        slen = s.ber()
        text = s.string(slen)
        n = s.ber()
        params = [s.ber() for _ in range(n)]
        if code == 0 and s.eof():
            break
        cmds.append({"code": code, "indent": indent, "string": text, "params": params})
    return cmds


# MoveCommand codes that carry extra data
_MOVE_STRING = {34, 35}
_MOVE_A = {32, 33, 34, 35}
_MOVE_BC = {35}


def read_move_commands(s):
    cmds = []
    while not s.eof():
        code = s.ber()
        c = {"code": code}
        if code in _MOVE_STRING:
            n = s.ber()
            c["string"] = s.string(n)
        if code in _MOVE_A:
            c["a"] = s.ber()
        if code in _MOVE_BC:
            c["b"] = s.ber()
            c["c"] = s.ber()
        cmds.append(c)
    return cmds


def decode_value(typ, data, st_name=None):
    """Decode a chunk payload of the given liblcf type."""
    s = Stream(data)
    if typ in ("Int32", "Int16", "Int8", "UInt8", "UInt32") or typ.startswith("Enum<") or typ.startswith("Ref<"):
        if typ.startswith("Ref<") and ":Int16" in typ:
            return _int16s(data)[0]
        return s.ber()
    if typ == "Boolean":
        return s.ber() != 0
    if typ == "Double":
        return struct.unpack("<d", data[:8])[0]
    if typ in ("String", "DBString"):
        return s.string(len(data))
    if typ == "Vector<Int16>":
        return _int16s(data)
    if typ == "Vector<UInt8>":
        return list(data)
    if typ == "Vector<UInt32>":
        return _uint32s(data)
    if typ == "Vector<Int32>":
        out = []
        while not s.eof():
            out.append(s.ber())
        return out
    if typ == "Vector<Boolean>":
        return [b != 0 for b in data]
    if typ == "DBBitArray":
        return [b != 0 for b in data]
    if typ == "Vector<EventCommand>":
        return read_event_commands(s)
    if typ == "Vector<MoveCommand>":
        return read_move_commands(s)
    if typ.startswith("Vector<Ref<"):
        # e.g. Vector<Ref<BattleCommand:Int32>> -> BER sequence
        out = []
        while not s.eof():
            out.append(s.ber())
        return out
    if typ.startswith("Array<"):
        inner = typ[6:-1].split(":")[0]
        return read_array(s, inner)
    if typ == "Parameters":
        n = len(data) // 12
        vals = _int16s(data)
        names = ["maxhp", "maxsp", "attack", "defense", "spirit", "agility"]
        return {nm: vals[i * n:(i + 1) * n] for i, nm in enumerate(names)}
    if typ == "Equipment":
        vals = _int16s(data)
        names = ["weapon_id", "shield_id", "armor_id", "helmet_id", "accessory_id"]
        return {nm: (vals[i] if i < len(vals) else 0) for i, nm in enumerate(names)}
    if typ == "Rect":
        vals = _uint32s(data)
        return {"l": vals[0], "t": vals[1], "r": vals[2], "b": vals[3]}
    if typ.endswith("_Flags"):
        st = typ[:-6]
        names = SCHEMA.flags.get(st, [])
        bits = int.from_bytes(data, "little") if data else 0
        return {nm: bool(bits >> i & 1) for i, nm in enumerate(names)}
    if typ in ("DatabaseVersion", "Type", "EmptyBlock") or typ.startswith("Count<"):
        return None
    if typ in SCHEMA.fields:
        return read_struct(s, typ)
    raise ValueError("unknown type " + typ)


def defaults_for(st):
    out = {}
    for fl in SCHEMA.fields[st]:
        if fl["size_field"] or fl["is2k3"]:
            continue
        d = fl["default"]
        typ = fl["type"]
        if typ.startswith("Count<") or typ in ("DatabaseVersion", "Type", "EmptyBlock"):
            continue
        if d is None:
            if typ in ("Sound", "Music"):
                d = defaults_for(typ)
            elif typ.startswith("Array<"):
                d = {}
            elif typ.startswith("Vector<") or typ == "DBBitArray":
                d = []
            elif typ in ("String", "DBString"):
                d = ""
            elif typ in SCHEMA.fields and fl["id"] is not None:
                d = defaults_for(typ)
            elif typ == "Parameters":
                d = {k: [] for k in ("maxhp", "maxsp", "attack", "defense", "spirit", "agility")}
            elif typ == "Equipment":
                d = {k: 0 for k in ("weapon_id", "shield_id", "armor_id", "helmet_id", "accessory_id")}
            elif typ.endswith("_Flags"):
                d = {nm: False for nm in SCHEMA.flags.get(typ[:-6], [])}
            elif typ == "Rect":
                d = {"l": 0, "t": 0, "r": 0, "b": 0}
            else:
                d = 0
        elif isinstance(d, list):
            d = list(d)
        out[fl["name"]] = d
    return out


def read_struct(s, st):
    """Read chunks of struct `st` from stream until id 0 or end."""
    by_id = {fl["id"]: fl for fl in SCHEMA.chunk_fields(st)}
    out = defaults_for(st)
    while not s.eof():
        cid = s.ber()
        if cid == 0:
            break
        length = s.ber()
        payload = s.read(length)
        fl = by_id.get(cid)
        if fl is None or fl["size_field"]:
            continue
        val = decode_value(fl["type"], payload, st)
        if val is not None:
            out[fl["name"]] = val
    return out


def read_array(s, st):
    count = s.ber()
    out = {}
    for _ in range(count):
        idx = s.ber()
        out[idx] = read_struct(s, st)
    return out


# ---------------------------------------------------------------------------
# Files
# ---------------------------------------------------------------------------


def _open(path, magic):
    data = open(path, "rb").read()
    s = Stream(data)
    n = s.ber()
    header = s.read(n).decode("ascii", "replace")
    if header != magic:
        raise ValueError("%s: bad header %r (expected %s)" % (path, header, magic))
    return s


def read_database(path):
    s = _open(path, "LcfDataBase")
    return read_struct(s, "Database")


def read_map(path):
    s = _open(path, "LcfMapUnit")
    return read_struct(s, "Map")


def read_maptree(path):
    s = _open(path, "LcfMapTree")
    maps = read_array(s, "MapInfo")
    n = s.ber()
    order = [s.ber() for _ in range(n)]
    active = s.ber()
    start = read_struct(s, "Start")
    return {"maps": maps, "tree_order": order, "active_node": active, "start": start}
