"""Atomare Dateioperationen und maschinenlesbare Fortschrittsmeldungen."""

from __future__ import annotations

import json
import os
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def today() -> str:
    return datetime.now(timezone.utc).date().isoformat()


def read_json(path: Path, default: Any = None) -> Any:
    if not path.exists():
        return default
    with path.open(encoding="utf-8") as f:
        return json.load(f)


def write_json_atomic(path: Path, data: Any, compact: bool = False) -> None:
    """Schreibt erst in eine temporäre Datei und benennt dann um – ein
    abgebrochener Import hinterlässt so nie eine halbe Datei."""
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=path.parent, prefix=f".{path.name}.", suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            if compact:
                json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
            else:
                json.dump(data, f, ensure_ascii=False, indent=1)
            f.write("\n")
        os.replace(tmp, path)
    except BaseException:
        if os.path.exists(tmp):
            os.unlink(tmp)
        raise


def emit(kind: str, message: str, **extra: Any) -> None:
    """Eine Zeile JSON auf stdout. Der Vite-Dev-Server reicht diese Zeilen
    als Live-Status an die Oberfläche weiter; auf der Konsole bleiben sie lesbar."""
    line = {"type": kind, "message": message, "time": now_iso(), **extra}
    sys.stdout.write(json.dumps(line, ensure_ascii=False) + "\n")
    sys.stdout.flush()
