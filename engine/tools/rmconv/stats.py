"""Event command usage report (which commands the runtime has to implement)."""
from __future__ import annotations

import collections

from lcf import reader

from .project import Project, event_command_lists


def command_usage(project: Project) -> collections.Counter:
    codes: collections.Counter = collections.Counter()
    for cmds in event_command_lists(project):
        codes.update(c["code"] for c in cmds)
    return codes


def log_command_usage(project: Project, log) -> None:
    names = reader.SCHEMA.enums["EventCommand_Code"]
    log("Event command usage:")
    for code, n in sorted(command_usage(project).items()):
        log("  %6d %-28s %d" % (code, names.get(code, "?"), n))
