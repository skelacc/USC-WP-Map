"""Verknüpfung offizieller Wellpass-Einträge mit den früheren Daten von Fair for Fitness.

Die Übersicht des Gym-Finders enthält keine Adressen. Fair for Fitness hat für
einen Teil der Studios Straße, PLZ, Website und Telefon. Gleiche Studios werden
über Namensähnlichkeit und Abstand erkannt (vorsichtig, 1:1); dann
  * ergänzt der Fair-for-Fitness-Eintrag fehlende Angaben des offiziellen und
  * wird sein Schlüssel als Alias des offiziellen geführt. So gelten frühere
    Zusammenführungen (mit Fair-for-Fitness-Schlüsseln) weiter.
"""

from __future__ import annotations

from .normalize import haversine_m, name_similarity
from .records import SourceRecord

MAX_DISTANCE_M = 150
MAX_DISTANCE_SAME_NAME_M = 400  # Fair-for-Fitness-Koordinaten liegen teils ein paar hundert Meter daneben


def link_fair_for_fitness(official: list[SourceRecord], fff: list[SourceRecord]) -> dict[str, str]:
    """Ergänzt ``official`` in place, liefert {fff_key: official_key}."""
    if not official or not fff:
        return {}

    def cell(lat: float, lng: float) -> tuple[int, int]:
        return int(lat / 0.002), int(lng / 0.003)  # ~220 m

    grid: dict[tuple[int, int], list[SourceRecord]] = {}
    for o in official:
        if o.latitude is not None and o.longitude is not None:
            grid.setdefault(cell(o.latitude, o.longitude), []).append(o)

    pairs: list[tuple[float, SourceRecord, SourceRecord]] = []
    for f in fff:
        if f.latitude is None or f.longitude is None:
            continue
        cx, cy = cell(f.latitude, f.longitude)
        for dx in (-2, -1, 0, 1, 2):
            for dy in (-2, -1, 0, 1, 2):
                for o in grid.get((cx + dx, cy + dy), []):
                    dist = haversine_m(f.latitude, f.longitude, o.latitude, o.longitude)  # type: ignore[arg-type]
                    if dist > MAX_DISTANCE_SAME_NAME_M:
                        continue
                    sim = name_similarity(f.name, o.name)
                    if (sim >= 0.6 and dist <= MAX_DISTANCE_M) or sim >= 0.95:
                        pairs.append((sim - dist / 1000, f, o))

    aliases: dict[str, str] = {}
    used: set[str] = set()
    for _, f, o in sorted(pairs, key=lambda t: -t[0]):
        if f.key in aliases or o.key in used:
            continue
        aliases[f.key] = o.key
        used.add(o.key)
        o.street = o.street or f.street
        o.postalCode = o.postalCode or f.postalCode
        o.website = o.website or f.website
        o.phone = o.phone or f.phone
        o.extra["addressFrom"] = "fair-for-fitness"
    return aliases
