"""Generic RPG Maker 2000/2003 LCF reader driven by liblcf's schema CSVs.

The CSV files next to this module (fields.csv, enums.csv, flags.csv) come from
https://github.com/EasyRPG/liblcf (generator/csv) and describe every chunk id,
type and default value of the LDB / LMT / LMU formats.
"""
import csv
import os
import struct

HERE = os.path.dirname(os.path.abspath(__file__))

# "2k" or "2k3": decides 2k|2k3 defaults and whether 2k3-only fields get defaults.
ENGINE = "2k"

# ---------------------------------------------------------------------------
# Schema
# ---------------------------------------------------------------------------


def _parse_list_default(raw: str):
    # e.g. [1]*162 or [31]+[15]*143 from liblcf's CSV (trusted, shipped with this repo)
    try:
        return eval(raw, {"__builtins__": {}}, {})  # noqa: S307
    except Exception:  # noqa: BLE001
        return None


def _parse_number(raw: str):
    for cast in (int, float):
        try:
            return cast(raw)
        except ValueError:
            continue
    return raw


def _parse_default(raw: str, typ: str):
    raw = raw.strip()
    if "|" in raw:  # "2k|2k3" defaults: pick the one of the engine being read
        raw = raw.split("|")[1 if ENGINE == "2k3" else 0]
    if raw == "":
        return None
    if raw.startswith('"') and raw.endswith('"'):
        return raw.strip('"')
    if raw in ("True", "False"):
        return raw == "True"
    if raw.startswith("["):
        return _parse_list_default(raw)
    return _parse_number(raw)


def _csv_rows(name: str) -> list[dict]:
    with open(os.path.join(HERE, name), newline="") as f:
        return list(csv.DictReader(f))


def _field_from_row(row: dict) -> dict:
    idx = row["Index"].strip()
    return {
        "name": row["Field"],
        "size_field": row["Size Field?"].strip() == "t",
        "type": row["Type"].strip(),
        "id": int(idx, 16) if idx else None,
        "default": _parse_default(row["Default Value"], row["Type"]),
        "is2k3": row["Is2k3"].strip() == "1",
    }


class Schema:
    def __init__(self) -> None:
        self.fields: dict[str, list[dict]] = {}  # struct -> list of field dicts
        self.flags: dict[str, list[str]] = {}    # struct -> ordered flag names
        self.enums: dict[str, dict[int, str]] = {}  # "Struct_Entry" -> {value: name}
        for row in _csv_rows("fields.csv"):
            self.fields.setdefault(row["Structure"], []).append(_field_from_row(row))
        for row in _csv_rows("flags.csv"):
            self.flags.setdefault(row["Structure"], []).append(row["Field"])
        for row in _csv_rows("enums.csv"):
            key = row["Structure"] + "_" + row["Entry"]
            self.enums.setdefault(key, {})[int(row["Index"])] = row["Value"]

    def chunk_fields(self, st):
        return [fl for fl in self.fields[st] if fl["id"] is not None]

    def raw_fields(self, st):
        return [fl for fl in self.fields[st] if fl["id"] is None]


SCHEMA = Schema()


def set_engine(engine):
    """Select "2k" or "2k3" before reading; reloads the schema defaults.

    Example: set_engine("2k3"); db = read_database(".../RPG_RT.ldb")
    """
    global ENGINE, SCHEMA
    if engine not in ("2k", "2k3"):
        raise ValueError("engine %r: expected '2k' or '2k3'" % engine)
    ENGINE = engine
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


PARAMETER_NAMES = ["maxhp", "maxsp", "attack", "defense", "spirit", "agility"]
EQUIPMENT_NAMES = ["weapon_id", "shield_id", "armor_id", "helmet_id", "accessory_id"]
INT_TYPES = ("Int32", "Int16", "Int8", "UInt8", "UInt32")
SKIPPED_TYPES = ("DatabaseVersion", "Type", "EmptyBlock")


def _ber_list(data: bytes) -> list[int]:
    s = Stream(data)
    out = []
    while not s.eof():
        out.append(s.ber())
    return out


def _int32s(data: bytes) -> list[int]:
    return list(struct.unpack("<%di" % (len(data) // 4), data[: len(data) // 4 * 4]))


def _parameters(data: bytes) -> dict:
    n = len(data) // 12
    vals = _int16s(data)
    return {nm: vals[i * n:(i + 1) * n] for i, nm in enumerate(PARAMETER_NAMES)}


def _equipment(data: bytes) -> dict:
    vals = _int16s(data)
    return {nm: (vals[i] if i < len(vals) else 0) for i, nm in enumerate(EQUIPMENT_NAMES)}


def _rect(data: bytes) -> dict:
    vals = _uint32s(data)
    return {"l": vals[0], "t": vals[1], "r": vals[2], "b": vals[3]}


def _flags(st: str, data: bytes) -> dict:
    bits = int.from_bytes(data, "little") if data else 0
    return {nm: bool(bits >> i & 1) for i, nm in enumerate(SCHEMA.flags.get(st, []))}


# exact type name -> decoder(data)
SIMPLE_DECODERS = {
    "Boolean": lambda d: Stream(d).ber() != 0,
    "Double": lambda d: struct.unpack("<d", d[:8])[0],
    "String": lambda d: Stream(d).string(len(d)),
    "DBString": lambda d: Stream(d).string(len(d)),
    "Vector<Int16>": _int16s,
    "Vector<UInt8>": list,
    "Vector<UInt32>": _uint32s,
    "Vector<Int32>": _ber_list,
    "Vector<Boolean>": lambda d: [b != 0 for b in d],
    "DBBitArray": lambda d: [b != 0 for b in d],
    "Vector<EventCommand>": lambda d: read_event_commands(Stream(d)),
    "Vector<MoveCommand>": lambda d: read_move_commands(Stream(d)),
    # RM2003 stores battle command lists as raw little-endian int32 (liblcf "uncompressed")
    "Vector<Ref<BattleCommand:Int32>>": _int32s,
    "Parameters": _parameters,
    "Equipment": _equipment,
    "Rect": _rect,
}


def _decode_scalar(typ: str, data: bytes):
    if typ.startswith("Ref<") and ":Int16" in typ:
        return _int16s(data)[0]
    return Stream(data).ber()


def decode_value(typ: str, data: bytes, st_name: str | None = None):
    """Decode a chunk payload of the given liblcf type.

    Example: decode_value("Vector<Int16>", b"\x01\x00\x02\x00") -> [1, 2]
    """
    if typ in SIMPLE_DECODERS:
        return SIMPLE_DECODERS[typ](data)
    if typ in INT_TYPES or typ.startswith(("Enum<", "Ref<")):
        return _decode_scalar(typ, data)
    if typ.startswith("Vector<Ref<"):  # e.g. Vector<Ref<Item>> -> BER sequence
        return _ber_list(data)
    if typ.startswith("Array<"):
        return read_array(Stream(data), typ[6:-1].split(":")[0])
    if typ.endswith("_Flags"):
        return _flags(typ[:-6], data)
    if typ in SKIPPED_TYPES or typ.startswith("Count<"):
        return None
    if typ in SCHEMA.fields:
        return read_struct(Stream(data), typ)
    raise ValueError("unknown liblcf type %r in struct %r: expected a type from fields.csv" % (typ, st_name))


def _empty_value(typ: str, has_chunk: bool):
    """Value of a field missing from the file and without a CSV default."""
    if typ in ("Sound", "Music") or (typ in SCHEMA.fields and has_chunk):
        return defaults_for(typ)
    if typ.startswith("Array<"):
        return {}
    if typ.startswith("Vector<") or typ == "DBBitArray":
        return []
    if typ in ("String", "DBString"):
        return ""
    if typ == "Parameters":
        return {k: [] for k in PARAMETER_NAMES}
    if typ == "Equipment":
        return {k: 0 for k in EQUIPMENT_NAMES}
    if typ.endswith("_Flags"):
        return {nm: False for nm in SCHEMA.flags.get(typ[:-6], [])}
    if typ == "Rect":
        return {"l": 0, "t": 0, "r": 0, "b": 0}
    return 0


def _has_default(fl: dict) -> bool:
    if fl["size_field"] or (fl["is2k3"] and ENGINE != "2k3"):
        return False
    return not (fl["type"].startswith("Count<") or fl["type"] in SKIPPED_TYPES)


def defaults_for(st: str) -> dict:
    """Default values of every field of struct st (what RPG_RT assumes for missing chunks)."""
    out = {}
    for fl in SCHEMA.fields[st]:
        if not _has_default(fl):
            continue
        d = fl["default"]
        if d is None:
            d = _empty_value(fl["type"], fl["id"] is not None)
        out[fl["name"]] = list(d) if isinstance(d, list) else d
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
