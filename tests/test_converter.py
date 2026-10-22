"""Converter unit tests (python3 -m unittest discover -s tests -p 'test_*.py')."""
from __future__ import annotations

import os
import struct
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "engine", "tools"))
from lcf import reader  # noqa: E402
from rmconv import refs, routes  # noqa: E402
from rmconv.project import Project  # noqa: E402


class RouteDecodingTest(unittest.TestCase):
    def test_graphic_change_carries_name_and_index(self) -> None:
        params = [1, 34, 4, ord("H"), ord("e"), ord("r"), ord("o"), 2, 2]
        self.assertEqual(routes.decode_inline_route(params),
                         [{"code": 1}, {"code": 34, "string": "Hero", "a": 2}, {"code": 2}])

    def test_sound_effect_has_volume_tempo_balance(self) -> None:
        params = [35, 1, ord("A"), 80, 100, 50]
        self.assertEqual(routes.decode_inline_route(params), [{"code": 35, "string": "A", "a": 80, "b": 100, "c": 50}])


class ReaderTest(unittest.TestCase):
    def tearDown(self) -> None:
        reader.set_engine("2k")

    def test_2003_battle_commands_are_raw_int32(self) -> None:
        data = struct.pack("<4i", 1, 7, 0, -1)
        self.assertEqual(reader.decode_value("Vector<Ref<BattleCommand:Int32>>", data), [1, 7, 0, -1])

    def test_engine_switch_rejects_unknown_names(self) -> None:
        with self.assertRaisesRegex(ValueError, "'2k4'"):
            reader.set_engine("2k4")

    def test_2003_fields_get_defaults_only_in_2003(self) -> None:
        reader.set_engine("2k")
        self.assertNotIn("battle_commands", reader.defaults_for("Actor"))
        reader.set_engine("2k3")
        self.assertIn("battle_commands", reader.defaults_for("Actor"))


class RefsTest(unittest.TestCase):
    def test_battler_poses_and_weapons_are_collected(self) -> None:
        db = {"battleranimations": {1: {
            "poses": {1: {"animation_type": 0, "battler_name": "Knight"}, 2: {"animation_type": 1, "battler_name": "Skip"}},
            "weapons": {1: {"weapon_name": "Swords"}},
        }}}
        found = refs.RefSet()
        refs.scan_battler_animations(found, db)
        self.assertEqual(found.by_cat["battlecharset"], {"Knight"})
        self.assertEqual(found.by_cat["battleweapon"], {"Swords"})

    def test_movie_command_is_referenced(self) -> None:
        found = refs.RefSet()
        refs.scan_commands(found, [{"code": 11560, "string": "Intro", "params": [0, 0, 0, 320, 240]}])
        self.assertEqual(found.by_cat["movie"], {"Intro"})

    def test_project_dataclass_keeps_engine(self) -> None:
        self.assertEqual(Project(db={}, tree={}, maps={}, engine="2k3").engine, "2k3")


if __name__ == "__main__":
    unittest.main()
