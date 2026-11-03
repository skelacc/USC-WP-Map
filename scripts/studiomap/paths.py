"""Zentrale Pfade der Datenhaltung."""

from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data"
RAW = DATA / "raw"  # normalisierte Rohdaten je Quelle (letzter erfolgreicher Import)
MANUAL = DATA / "manual"  # manuell gepflegte Dateien (CSV-Importe, Match-Entscheidungen)
STAGING = DATA / "staging"  # Ergebnis eines Imports, noch NICHT veröffentlicht
BACKUPS = DATA / "backups"  # Sicherungen vor jedem Übernehmen
PUBLISHED = ROOT / "public" / "data" / "studios.json"  # vom Frontend gelesen

STAGING_STUDIOS = STAGING / "studios.json"
STAGING_REPORT = STAGING / "report.json"
DECISIONS = MANUAL / "match_decisions.json"
STATUS = STAGING / "status.json"


def ensure_dirs() -> None:
    for p in (RAW, MANUAL, STAGING, BACKUPS, PUBLISHED.parent):
        p.mkdir(parents=True, exist_ok=True)
