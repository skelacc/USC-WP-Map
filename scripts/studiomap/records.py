"""Gemeinsames Format für Quelldatensätze und deren Validierung."""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any

PROVIDERS = ("urbanSportsClub", "wellpass")

# Bekannte Quellenarten
SOURCE_OFFICIAL = "official"  # Website des Anbieters selbst
SOURCE_THIRD_PARTY = "fair-for-fitness"  # dokumentierte API eines Vergleichsportals
SOURCE_MANUAL = "manual"  # manuell gepflegte CSV-/JSON-Datei


@dataclass
class SourceRecord:
    provider: str  # urbanSportsClub | wellpass
    source: str  # official | fair-for-fitness | manual
    sourceId: str  # stabile ID innerhalb der Quelle
    name: str
    street: str | None = None
    postalCode: str | None = None
    city: str | None = "Berlin"
    district: str | None = None
    region: str | None = None  # Bundesland-Kürzel (z. B. "BE", "BY"), soweit bekannt
    latitude: float | None = None
    longitude: float | None = None
    # source = Koordinaten aus der Quelle; geocoded = per Adresssuche ermittelt (unsicherer)
    coordinatePrecision: str | None = None
    website: str | None = None
    providerUrl: str | None = None  # Studioseite beim Anbieter
    categories: list[str] = field(default_factory=list)
    plans: list[str] = field(default_factory=list)  # z. B. USC-Stufen
    phone: str | None = None
    fetchedAt: str | None = None
    extra: dict[str, Any] = field(default_factory=dict)

    @property
    def key(self) -> str:
        return f"{self.provider}:{self.source}:{self.sourceId}"

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> "SourceRecord":
        known = {f for f in cls.__dataclass_fields__}  # type: ignore[attr-defined]
        return cls(**{k: v for k, v in d.items() if k in known})


class ValidationError(ValueError):
    pass


def validate_record(r: SourceRecord) -> list[str]:
    """Liefert eine Liste von Problemen (leer = gültig). Fehlende optionale
    Angaben sind erlaubt; unplausible Angaben nicht."""
    problems: list[str] = []
    if r.provider not in PROVIDERS:
        problems.append(f"unbekannter Anbieter '{r.provider}'")
    if not r.sourceId:
        problems.append("fehlende sourceId")
    if not r.name or not r.name.strip():
        problems.append("fehlender Name")
    if (r.latitude is None) != (r.longitude is None):
        problems.append("nur eine Koordinate angegeben")
    if r.latitude is not None and r.longitude is not None:
        if not (47.2 <= r.latitude <= 55.1 and 5.8 <= r.longitude <= 15.1):
            problems.append(f"Koordinaten außerhalb Deutschlands ({r.latitude}, {r.longitude})")
    return problems
