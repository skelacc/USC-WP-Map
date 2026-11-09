"""Normalisierung von Adressen und Studionamen für die Dublettenerkennung."""

from __future__ import annotations

import math
import re
import unicodedata
from difflib import SequenceMatcher

BERLIN_DISTRICTS = [
    "mitte", "friedrichshain", "kreuzberg", "pankow", "prenzlauer berg", "charlottenburg",
    "wilmersdorf", "spandau", "steglitz", "zehlendorf", "tempelhof", "schoeneberg",
    "neukoelln", "treptow", "koepenick", "marzahn", "hellersdorf", "lichtenberg",
    "reinickendorf", "wedding", "moabit", "tiergarten", "friedenau", "weissensee",
    "adlershof", "dahlem", "lankwitz", "mariendorf", "britz", "rudow", "gesundbrunnen",
]

# Wörter ohne Unterscheidungskraft im Studionamen
STOPWORDS = {
    "berlin", "gmbh", "ug", "ev", "e", "v", "co", "kg", "ohg", "gbr", "mbh", "the", "der", "die",
    "das", "und", "and", "in", "im", "am", "an", "by", "de", "studio", "club", "center", "centre",
    "zentrum",
}

UMLAUTS = str.maketrans({"ä": "ae", "ö": "oe", "ü": "ue", "ß": "ss", "Ä": "ae", "Ö": "oe", "Ü": "ue"})


def ascii_fold(text: str) -> str:
    text = text.translate(UMLAUTS)
    text = unicodedata.normalize("NFKD", text)
    return "".join(c for c in text if not unicodedata.combining(c))


def base_text(text: str | None) -> str:
    if not text:
        return ""
    t = ascii_fold(text.lower())
    t = re.sub(r"[^a-z0-9]+", " ", t)
    return re.sub(r"\s+", " ", t).strip()


# ---------------------------------------------------------------- Adressen

_STREET_SUFFIX = [
    (r"\bstrasse\b", "str"),
    (r"strasse\b", "str"),
    (r"\bstr\b\.?", "str"),
    (r"\bplatz\b", "pl"),
    (r"platz\b", "pl"),
    (r"\ballee\b", "al"),
    (r"allee\b", "al"),
    (r"\bdamm\b", "damm"),
]


_NUMBER = re.compile(r"(\d+)\s*([a-z](?![a-z]))?(?:\s*[-/–]\s*\d+\s*[a-z]?(?![a-z]))?")


def split_street(street: str | None) -> tuple[str, str]:
    """Teilt 'Musterstraße 12a' in ('musterstr', '12a'). Maßgeblich ist die
    erste Hausnummer(ngruppe) nach dem Straßennamen; Ordnungszahlen wie in
    'Straße des 17. Juni 100' werden übersprungen. Zusätze danach
    ('Aufgang 2', '1. OG') werden ignoriert."""
    if not street:
        return "", ""
    # Zusätze vor der eigentlichen Adresse („Bürgerhaus Südspitze, Marchwitzastraße 24“):
    # das erste Komma-Segment nehmen, das Straße und Hausnummer enthält
    if "," in street:
        parts = [p.strip() for p in street.split(",")]
        street = next((p for p in parts if re.search(r"[A-Za-zÄÖÜäöüß]{3}.*\d", p)), street)
    s = ascii_fold(street.lower())
    matches = [m for m in _NUMBER.finditer(s) if m.start() > 0 and not s[m.end():].startswith(".")]
    number = ""
    if matches:
        m = matches[0]
        number = re.sub(r"\s", "", m.group(0))
        s = s[: m.start()]
    s = re.sub(r"[^a-z0-9]+", " ", s).strip()
    for pat, rep in _STREET_SUFFIX:
        s = re.sub(pat, rep, s)
    s = s.replace(" ", "")
    return s, number


def first_house_number(number: str) -> str:
    m = re.match(r"\d+", number or "")
    return m.group(0) if m else ""


def house_numbers(number: str) -> set[int]:
    """'24-26' → {24, 25, 26}, '45/46' → {45, 46}, '12a' → {12}."""
    nums = [int(n) for n in re.findall(r"\d+", number or "")]
    if len(nums) >= 2 and 0 <= nums[1] - nums[0] <= 20:
        return set(range(nums[0], nums[1] + 1))
    return set(nums[:1])


def same_address(a: str | None, b: str | None) -> bool:
    """Gleiche Straße und überlappende Hausnummern (Bereiche wie '24 - 26' eingeschlossen)."""
    sa, na = split_street(a)
    sb, nb = split_street(b)
    return bool(sa and na and sa == sb and house_numbers(na) & house_numbers(nb))


def address_key(street: str | None, postal_code: str | None = None) -> str:
    """Normalisierter Adressschlüssel 'musterstr|12'. Die Postleitzahl wird nur
    ergänzend verglichen, da sie nicht in jeder Quelle vorliegt."""
    name, number = split_street(street)
    if not name or not number:
        return ""
    return f"{name}|{first_house_number(number)}"


# ---------------------------------------------------------------- Namen


def name_tokens(name: str | None) -> list[str]:
    t = base_text(name)
    return [w for w in t.split() if w not in STOPWORDS and len(w) > 1]


def normalize_name(name: str | None) -> str:
    return " ".join(name_tokens(name))


# Gattungsbegriffe: tragen zur Zeichenähnlichkeit bei, aber nicht zur
# Token-Überdeckung (sonst wäre "O-Yoga" ≈ "Just a lil' break Yoga").
GENERIC = {
    "yoga", "fitness", "fit", "pilates", "gym", "sport", "sports", "training", "studios",
    "personal", "reformer", "dance", "tanz", "tanzschule", "health", "boxing", "boxen",
    "crossfit", "ems", "schwimmbad", "schwimmhalle", "bad", "kurse", "academy", "akademie",
    "wellness", "physiotherapie", "physio", "bootcamp", "outdoor", "hot", "flow", "spa",
    "massage", "kampfsport", "martial", "arts", "bouldern", "boulder", "climbing", "kletterhalle",
    "functional", "body", "mind", "healthclub", "fitnessstudio", "fitnessclub", "school", "schule",
}


# Ortsangaben sind ebenfalls nicht unterscheidungskräftig für den Studionamen
PLACE_WORDS = {w for d in BERLIN_DISTRICTS for w in d.split()} | {"xberg", "fhain", "kiez", "volkspark"}


def distinctive_tokens(name: str | None) -> list[str]:
    return [t for t in name_tokens(name) if t not in GENERIC and t not in PLACE_WORDS]


def name_similarity(a: str | None, b: str | None) -> float:
    """0..1 – Maximum aus Zeichenfolgen-Ähnlichkeit und Überdeckung der
    unterscheidungskräftigen Namensbestandteile."""
    na, nb = normalize_name(a), normalize_name(b)
    if not na or not nb:
        return 0.0
    if na == nb:
        return 1.0
    seq = SequenceMatcher(None, na, nb).ratio()
    da, db = set(distinctive_tokens(a)), set(distinctive_tokens(b))
    if da and db and da == db:
        overlap = 1.0
    elif da and db:
        # Teilüberdeckung ("authentic body" vs "authentic control") bleibt unsicher
        overlap = 0.84 * len(da & db) / min(len(da), len(db))
    else:
        overlap = 0.0
    # Kompakter Vergleich ohne Leerzeichen ("speedfit" vs "speed fit"); der
    # kürzere Name muss den längeren weitgehend abdecken.
    ca, cb = sorted((na.replace(" ", ""), nb.replace(" ", "")), key=len)
    contained = 0.9 if (len(ca) >= 5 and ca in cb and len(ca) / len(cb) >= 0.7) else 0.0
    return round(max(seq, overlap * 0.95, contained), 3)


def branch_hint(name: str | None) -> set[str]:
    """Bezirks-/Ortsangaben im Namen, z. B. 'Fitness First Mitte' -> {'mitte'}.
    Unterschiedliche Angaben sprechen gegen dieselbe Filiale."""
    t = " " + base_text(name) + " "
    return {d for d in BERLIN_DISTRICTS if f" {d} " in t}


# ---------------------------------------------------------------- Geo


def haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = p2 - p1
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def is_berlin_postal_code(pc: str | None) -> bool:
    if not pc or not re.fullmatch(r"\d{5}", pc):
        return False
    n = int(pc)
    return 10115 <= n <= 14199
