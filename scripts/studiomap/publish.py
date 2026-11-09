"""Veröffentlichung: Kerndatei für Berlin + Kacheln für den Rest Deutschlands.

Damit die App schnell startet, enthält ``public/data/studios.json`` nur den
Großraum Berlin (alle Anbieter, volles Format). Reine Wellpass-Studios
außerhalb liegen kompakt in Kacheln von 1° × 1° unter ``public/data/tiles/``:

    tiles/index.json   {cells: {"48_11": 812, …}, activities: [...], types: [...], regions: {...}, …}
    tiles/48_11.json   [{"i": "1031522", "n": "Name", "c": [lat, lng], "s": "slug", "o": "Ort",
                         "r": "BY", "t": 0, "a": [3, 7], "p": 1,
                         "st": "Straße 1", "z": "80331", "d": "Bezirk", "x": 1 (Adresse ungefähr)}, …]

Die App lädt nur die Kacheln im Kartenausschnitt (oder auf Wunsch alle) und
baut daraus dieselben Studio-Objekte wie in der Kerndatei (src/lib/tiles.ts).
"""

from __future__ import annotations

import math
import shutil
from typing import Any

from . import paths
from .activities import REGION_DE
from .io import read_json, write_json_atomic

TILES = paths.PUBLISHED.parent / "tiles"
TILE_INDEX = TILES / "index.json"
# Großraum Berlin inkl. Potsdam: immer in der Kerndatei
CORE_BOUNDS = (52.30, 52.72, 12.95, 13.85)  # S, N, W, E
CELL_DEG = 1.0
GYM_FINDER_BASE = "https://de.egym-wellpass.com/de-de/gym-finder/"
REGION_CODE = {v: k for k, v in REGION_DE.items()}


def in_core(lat: float, lng: float) -> bool:
    s, n, w, e = CORE_BOUNDS
    return s <= lat <= n and w <= lng <= e


def cell_id(lat: float, lng: float) -> str:
    return f"{math.floor(lat / CELL_DEG)}_{math.floor(lng / CELL_DEG)}"


def _tile_candidate(s: dict) -> bool:
    """Nur einfache, offizielle Wellpass-Einträge außerhalb Berlins wandern in Kacheln."""
    c = s.get("coordinates")
    d = s["providerDetails"].get("wellpass")
    return (
        bool(c) and d is not None and not s["providers"].get("urbanSportsClub") and s.get("matchConfidence") == "single"
        and d.get("source") == "official" and not s.get("extraMembers") and (d.get("url") or "").startswith(GYM_FINDER_BASE)
        and not in_core(c["latitude"], c["longitude"])
    )


def split(dataset: dict) -> tuple[dict, dict[str, list], dict]:
    core: list[dict] = []
    tiles: dict[str, list] = {}
    activities: dict[str, int] = {}
    types: dict[str, int] = {}

    def idx(table: dict[str, int], v: str) -> int:
        return table.setdefault(v, len(table))

    fetched = None
    for s in dataset["studios"]:
        if not _tile_candidate(s):
            core.append(s)
            continue
        d = s["providerDetails"]["wellpass"]
        c = s["coordinates"]
        fetched = fetched or d.get("fetchedAt")
        rec: dict[str, Any] = {
            "i": d["sourceId"],
            "n": s["name"],
            "c": [round(c["latitude"], 5), round(c["longitude"], 5)],
            "s": d["url"][len(GYM_FINDER_BASE):],
        }
        a = s["address"]
        if a.get("city"):
            rec["o"] = a["city"]
        if a.get("region"):
            rec["r"] = REGION_CODE.get(a["region"], a["region"])
        for k, short in (("street", "st"), ("postalCode", "z"), ("district", "d")):
            if a.get(k):
                rec[short] = a[k]
        if a.get("approximate"):
            rec["x"] = 1
        if s.get("categories"):
            rec["t"] = idx(types, s["categories"][0])
        acts = [idx(activities, x["name"]) for x in d.get("activities") or []]
        if acts:
            rec["a"] = acts
        if d.get("plus1"):
            rec["p"] = 1
        tiles.setdefault(cell_id(c["latitude"], c["longitude"]), []).append(rec)

    index = {
        "schemaVersion": 1,
        "generatedAt": dataset.get("generatedAt"),
        "fetchedAt": fetched,
        "cellDeg": CELL_DEG,
        "coreBounds": list(CORE_BOUNDS),
        "urlBase": GYM_FINDER_BASE,
        "activities": list(activities),
        "types": list(types),
        "regions": REGION_DE,
        "total": sum(len(v) for v in tiles.values()),
        "cells": {k: len(v) for k, v in sorted(tiles.items())},
    }
    core_ds = {**dataset, "studios": core, "tiles": {"index": "tiles/index.json", "total": index["total"]}}
    return core_ds, tiles, index


def write_published(dataset: dict) -> dict:
    core, tiles, index = split(dataset)
    tmp = TILES.with_name(".tiles.tmp")
    shutil.rmtree(tmp, ignore_errors=True)
    tmp.mkdir(parents=True)
    for cid, recs in tiles.items():
        write_json_atomic(tmp / f"{cid}.json", recs, compact=True)
    write_json_atomic(tmp / "index.json", index, compact=True)
    shutil.rmtree(TILES, ignore_errors=True)
    tmp.rename(TILES)
    write_json_atomic(paths.PUBLISHED, core, compact=True)
    return {"core": len(core["studios"]), "tiles": index["total"], "cells": len(tiles)}


def read_published() -> dict | None:
    """Veröffentlichter Stand als ein Datenbestand (Kacheln als Kurzform – genug für den Vergleich)."""
    core = read_json(paths.PUBLISHED, None)
    if core is None:
        return None
    index = read_json(TILE_INDEX, None)
    studios = list(core.get("studios", []))
    if index and core.get("tiles"):
        for cid in index.get("cells", {}):
            for r in read_json(TILES / f"{cid}.json", []) or []:
                studios.append({
                    "id": f"wp-{r['i']}", "name": r["n"], "address": {"street": None, "city": r.get("o")},
                    "coordinates": {"latitude": r["c"][0], "longitude": r["c"][1]},
                    "providers": {"urbanSportsClub": False, "wellpass": True},
                })
    return {**core, "studios": studios}
