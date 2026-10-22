"""MoveEvent (11330) stores its route as a flat int list inside the command params."""
from __future__ import annotations

STRING_CODES = (34, 35)          # change graphic, play SE
ONE_ARG_CODES = (32, 33, 34, 35)  # switch on/off, graphic index, SE volume
SE_CODE = 35                      # SE also has tempo + balance


def _read_one(params: list[int], i: int) -> tuple[dict, int]:
    code = params[i]
    i += 1
    c: dict = {"code": code}
    if code in STRING_CODES:
        n = params[i]
        c["string"] = "".join(chr(x) for x in params[i + 1:i + 1 + n])
        i += 1 + n
    if code in ONE_ARG_CODES:
        c["a"] = params[i]
        i += 1
    if code == SE_CODE:
        c["b"], c["c"] = params[i], params[i + 1]
        i += 2
    return c, i


def decode_inline_route(params: list[int]) -> list[dict]:
    """Example: decode_inline_route([1, 34, 1, 72, 0]) -> [{"code": 1}, {"code": 34, "string": "H", "a": 0}]"""
    out = []
    i = 0
    while i < len(params):
        c, i = _read_one(params, i)
        out.append(c)
    return out
