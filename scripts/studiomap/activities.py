"""Einheitliche Aktivitätsnamen (deutsch) über alle Quellen hinweg.

USC liefert in den Besuchslimits englische Kategorienamen, in der
Ergebnisliste deutsche; Wellpass (Fair for Fitness / Gym-Finder) eigene
Schlüssel. Alles wird auf die deutschen USC-Bezeichnungen abgebildet.
"""

from __future__ import annotations

from typing import Any

USC_EN_DE = {
    "Aerial": "Aerial", "Aqua": "Aqua", "Badminton": "Badminton", "Barre": "Barre",
    "Beach Volleyball": "Beach-Volleyball", "Bootcamp": "Bootcamp", "Bouldering": "Bouldern",
    "Boxing": "Boxsport", "Capoeira": "Capoeira", "Crosstraining": "Crosstraining", "EMS": "EMS",
    "EMS Cardio": "EMS Cardio", "Ice Skating": "Eislaufen", "Relaxation": "Entspannung",
    "Cycling": "Fahrrad fahren", "Fencing": "Fechten", "Fitness": "Fitness", "Free Fight": "Free Fight",
    "Functional Training": "Funktionelles Training", "Football": "Fußball", "Golf": "Golfspielen",
    "Hyrox": "Hyrox", "Indoor Cycling": "Indoorcycling", "Canoe and Kayak": "Kanu und Kajak",
    "Canoeing and Kayaking": "Kanu und Kajak", "Climbing": "Klettern", "Cryotherapy": "Kryotherapie",
    "Running": "Lauftreff", "Massage": "Massage", "Meditation": "Meditation",
    "Mixed Martial Arts": "Mixed Martial Arts", "Modern Self Defense": "Moderne Selbstverteidigung",
    "Padel": "Padel", "Parkour": "Parkour", "Personal Training": "Personal Training",
    "Pickleball": "Pickleball", "Pilates": "Pilates", "Pilates Reformer": "Pilates Reformer",
    "Pole Dance": "Pole Dance", "Qi Gong and Tai Chi": "Qi Gong und Tai Chi", "Sauna": "Sauna",
    "Swimming": "Schwimmen", "Skating": "Skaten", "Spa": "Spa", "Squash": "Squash",
    "Stand Up Paddling": "Stand Up Paddling", "Surfing": "Surfen", "Dance": "Tanzen",
    "Tennis": "Tennis", "Table Tennis": "Tischtennis",
    "Traditional Asian Martial Arts": "Traditionell-Asiatische Kampfkünste", "Trampoline": "Trampolin",
    "Vibration Training": "Vibrationstraining", "Hiking": "Wandern", "Wellness": "Wellness",
    "Yoga": "Yoga", "Live Class": "Live-Online-Kurs", "Volleyball": "Volleyball",
    "Basketball": "Basketball", "Rowing": "Rudern", "Sailing": "Segeln", "Kickboxing": "Kickboxen",
}

# Fair for Fitness "kategorie"
FFF_DE = {
    "gym": "Fitness", "yoga": "Yoga", "pilates": "Pilates", "crossfit": "Crosstraining", "ems": "EMS",
    "kampfsport": "Kampfsport", "frauen": "Fitness", "tanz": "Tanzen", "gesundheit": "Gesundheit",
    "kaeltekammer": "Kryotherapie", "schwimmbad": "Schwimmen", "oeffentlich": "Schwimmen",
    "powerplate": "Vibrationstraining", "egym": "Fitness", "betreut": "Gesundheit",
}

# Wellpass-Gym-Finder (z. B. "YOGA_STUDIO" → "Yoga Studio" in den Rohdaten)
EGYM_DE = {
    "gym": "Fitness", "fitness": "Fitness", "yoga studio": "Yoga", "yoga": "Yoga", "pilates": "Pilates",
    "crossfit": "Crosstraining", "martial arts": "Kampfsport", "dance": "Tanzen", "swimming pool": "Schwimmen",
    "swimming": "Schwimmen", "boulder hall": "Bouldern", "climbing": "Klettern", "wellness": "Wellness",
    "cycling": "Indoorcycling", "racket": "Racket-Sport", "ball sport": "Ballsport", "outdoor": "Outdoor",
    "water sport": "Wassersport", "golf": "Golfspielen", "online": "Live-Online-Kurs", "ems": "EMS",
    "massage": "Massage", "sauna": "Sauna", "physiotherapy": "Gesundheit",
}


def usc_activity(name: str) -> str:
    return USC_EN_DE.get(name, name)


def wellpass_activity(name: str) -> str:
    key = name.strip().lower().replace("_", " ")
    return FFF_DE.get(key) or EGYM_DE.get(key) or name.strip().title()


SIZES = ("S", "M", "L", "XL")


def usc_activities(categories: list[str], details: dict | None) -> list[dict[str, Any]]:
    """[{name, limits: {S,M,L,XL}}] – Limit pro Monat; -1 unbegrenzt, 0 nicht
    verfügbar, None unbekannt (keine Detaildaten)."""
    out: dict[str, dict[str, Any]] = {}
    limits = (details or {}).get("limits") or []
    for plan in limits:
        size = plan.get("size")
        if size not in SIZES:
            continue
        for c in plan.get("categories") or []:
            name = usc_activity(c.get("name") or "")
            if not name:
                continue
            entry = out.setdefault(name, {"name": name, "limits": {s: 0 for s in SIZES}})
            value = c.get("perMonth")
            entry["limits"][size] = (value if value is not None else -1) if plan.get("included") else 0
    # Aktivitäten ohne eigenes Kategorie-Limit erben das Besuchslimit des Studios
    venue_limit = {
        p.get("size"): ((p.get("perMonth") if p.get("perMonth") is not None else -1) if p.get("included") else 0)
        for p in limits
        if p.get("size") in SIZES
    }
    for cat in categories:
        if cat in out:
            continue
        out[cat] = {"name": cat, "limits": {s: venue_limit.get(s, 0) for s in SIZES} if limits else None}
    return sorted(out.values(), key=lambda a: a["name"])


def usc_plan_included(details: dict | None, plans: list[str]) -> dict[str, bool]:
    limits = (details or {}).get("limits") or []
    if limits:
        return {p.get("size"): bool(p.get("included")) for p in limits if p.get("size") in SIZES}
    names = {"Essential": "S", "Classic": "M", "Premium": "L", "Max": "XL"}
    return {names[p]: True for p in plans if p in names} | {s: False for s in SIZES if s not in {names.get(p) for p in plans}}
