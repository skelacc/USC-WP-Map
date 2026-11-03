"""Manueller Import aus CSV- oder JSON-Dateien in ``data/manual/import/``.

Damit lassen sich Standorte ergänzen, die keine automatisierte Quelle
liefert (z. B. aus dem offiziellen Wellpass-Gym-Finder abgeschriebene
Studios). Vorlage: ``data/manual/import/_vorlage.csv``.

CSV-Spalten (Kopfzeile Pflicht, Trennzeichen , oder ;):
  provider      urbanSportsClub | wellpass  (auch: usc, wp)   – Pflicht
  name          Studioname                                     – Pflicht
  street        Straße und Hausnummer
  postalCode    Postleitzahl
  city          Standard: Berlin
  district      Bezirk
  latitude      Dezimalgrad (Punkt als Dezimaltrenner)
  longitude     Dezimalgrad
  website       URL
  sourceId      eigene stabile ID (sonst aus Name+Adresse gebildet)
  categories    Sportarten, mit | getrennt
  sourceNote    Herkunft der Angabe, z. B. "Wellpass Gym-Finder, 03.11.2026"

JSON: Liste von Objekten mit denselben Feldern.
"""

from __future__ import annotations

import csv
import hashlib
import io
import json
from pathlib import Path

from ..io import now_iso
from ..normalize import base_text
from ..records import SOURCE_MANUAL, SourceRecord, validate_record

PROVIDER_ALIASES = {
    "urbansportsclub": "urbanSportsClub", "usc": "urbanSportsClub", "urban sports club": "urbanSportsClub",
    "wellpass": "wellpass", "wp": "wellpass", "egym wellpass": "wellpass", "egym": "wellpass",
}
REQUIRED = {"provider", "name"}


class ImportFileError(ValueError):
    pass


def _float(v: object) -> float | None:
    if v is None or (isinstance(v, str) and not v.strip()):
        return None
    try:
        return float(str(v).replace(",", ".")) if not isinstance(v, (int, float)) else float(v)
    except ValueError:
        raise ImportFileError(f"ungültige Zahl '{v}'")


def _rows_from_file(path: Path) -> list[dict]:
    text = path.read_text(encoding="utf-8-sig")
    if path.suffix.lower() == ".json":
        try:
            data = json.loads(text)
        except json.JSONDecodeError as e:
            raise ImportFileError(f"{path.name}: kein gültiges JSON ({e.msg}, Zeile {e.lineno})")
        if isinstance(data, dict) and isinstance(data.get("studios"), list):
            data = data["studios"]
        if not isinstance(data, list):
            raise ImportFileError(f"{path.name}: JSON muss eine Liste von Studios sein")
        return data
    try:
        dialect = csv.Sniffer().sniff(text.splitlines()[0] if text else "", delimiters=",;\t")
    except csv.Error:
        dialect = csv.excel
    reader = csv.DictReader(io.StringIO(text), dialect=dialect)
    if not reader.fieldnames:
        raise ImportFileError(f"{path.name}: leere Datei oder fehlende Kopfzeile")
    missing = REQUIRED - {f.strip() for f in reader.fieldnames}
    if missing:
        raise ImportFileError(f"{path.name}: Pflichtspalten fehlen: {', '.join(sorted(missing))}")
    return [{(k or "").strip(): (v.strip() if isinstance(v, str) else v) for k, v in row.items()} for row in reader]


def parse_file(path: Path) -> tuple[list[SourceRecord], list[str]]:
    """Gibt (gültige Datensätze, Fehlermeldungen) zurück. Ungültige Zeilen
    werden übersprungen, nie geraten."""
    rows = _rows_from_file(path)
    fetched = now_iso()
    records: list[SourceRecord] = []
    errors: list[str] = []
    for i, row in enumerate(rows, start=2 if path.suffix.lower() == ".csv" else 1):
        where = f"{path.name} {'Zeile' if path.suffix.lower() == '.csv' else 'Eintrag'} {i}"
        if not isinstance(row, dict):
            errors.append(f"{where}: kein Objekt")
            continue
        prov = PROVIDER_ALIASES.get(base_text(str(row.get("provider", ""))).replace("  ", " "))
        if not prov:
            errors.append(f"{where}: unbekannter Anbieter '{row.get('provider')}'")
            continue
        try:
            lat, lng = _float(row.get("latitude")), _float(row.get("longitude"))
        except ImportFileError as e:
            errors.append(f"{where}: {e}")
            continue
        name = str(row.get("name") or "").strip()
        street = str(row.get("street") or "").strip() or None
        sid = str(row.get("sourceId") or "").strip()
        if not sid:
            sid = hashlib.sha1(f"{base_text(name)}|{base_text(street)}".encode()).hexdigest()[:12]
        cats = row.get("categories") or []
        if isinstance(cats, str):
            cats = [c.strip() for c in cats.split("|") if c.strip()]
        rec = SourceRecord(
            provider=prov,
            source=SOURCE_MANUAL,
            sourceId=f"{path.stem}:{sid}",
            name=name,
            street=street,
            postalCode=str(row.get("postalCode") or "").strip() or None,
            city=str(row.get("city") or "Berlin").strip(),
            district=str(row.get("district") or "").strip() or None,
            latitude=lat,
            longitude=lng,
            coordinatePrecision="source" if lat is not None else None,
            website=str(row.get("website") or "").strip() or None,
            categories=list(cats),
            fetchedAt=fetched,
            extra={"file": path.name, "sourceNote": row.get("sourceNote")},
        )
        problems = validate_record(rec)
        if problems:
            errors.append(f"{where}: {'; '.join(problems)}")
            continue
        records.append(rec)
    return records, errors


def import_dir(directory: Path) -> tuple[list[SourceRecord], list[str]]:
    records: list[SourceRecord] = []
    errors: list[str] = []
    if not directory.exists():
        return records, errors
    for path in sorted(directory.iterdir()):
        if path.name.startswith(("_", ".")) or path.suffix.lower() not in (".csv", ".json"):
            continue
        try:
            recs, errs = parse_file(path)
        except (ImportFileError, UnicodeDecodeError, csv.Error) as e:
            errors.append(f"{path.name}: Datei übersprungen – {e}")
            continue
        records.extend(recs)
        errors.extend(errs)
    return records, errors
