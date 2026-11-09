"""Ablaufsteuerung: Abrufen → Zusammenführen → Prüfen → Übernehmen.

Datenfluss (nichts wird ungeprüft überschrieben):

    Quellen ──fetch──▶ data/staging/raw/*.json ─┐
                                               ├─merge─▶ data/staging/studios.json + report.json
    data/raw/*.json (Stand der Veröffentlichung)┘                │
                                                                 ▼ apply (nach Prüfung)
                         public/data/studios.json  ◀── Sicherung in data/backups/

Schlägt eine Quelle fehl, wird für sie der zuletzt veröffentlichte Stand
weiterverwendet und der Fehler im Bericht vermerkt.
"""

from __future__ import annotations

import json
import shutil
import signal
from datetime import datetime
from pathlib import Path
from typing import Any, Callable

from . import paths
from .diff import diff, plausibility_warnings
from .geocode import geocode_missing
from .http import FetchError, PoliteClient
from .io import emit, now_iso, read_json, write_json_atomic
from .merge import merge
from .records import SourceRecord, validate_record
from .sources import manual, usc, usc_details, wellpass_egym, wellpass_fff

STAGING_RAW = paths.STAGING / "raw"
USC_DETAILS = paths.RAW / "usc_details.json"

SOURCES: dict[str, dict[str, Any]] = {
    "usc": {
        "provider": "urbanSportsClub",
        "label": "Urban Sports Club – urbansportsclub.com (offizielle Website)",
        "url": "https://urbansportsclub.com/de/venues",
        "kind": "official",
        "note": "Öffentliche Standortsuche der Anbieter-Website; keine dokumentierte API.",
    },
    "wellpass": {
        "provider": "wellpass",
        "label": "EGYM Wellpass – über Fair for Fitness (Drittquelle)",
        "url": "https://fair-for-fitness.de/firmenfitness",
        "kind": "fair-for-fitness",
        "note": "Dokumentierte öffentliche API von Fair for Fitness. Quelle: Fair for Fitness (https://fair-for-fitness.de), Angaben ohne Gewähr.",
    },
    "manual": {
        "provider": None,
        "label": "Manuelle Importdateien (data/manual/import)",
        "url": None,
        "kind": "manual",
        "note": "CSV/JSON-Dateien, selbst gepflegt.",
    },
}
MANUAL_IMPORT_DIR = paths.MANUAL / "import"


class Cancelled(Exception):
    pass


_stop = False


def _install_signal_handlers() -> None:
    def handler(signum, frame):  # noqa: ARG001
        global _stop
        _stop = True

    signal.signal(signal.SIGTERM, handler)
    signal.signal(signal.SIGINT, handler)


def should_stop() -> bool:
    return _stop


def _load_raw(path: Path) -> tuple[list[SourceRecord], dict]:
    data = read_json(path, None)
    if not data:
        return [], {}
    return [SourceRecord.from_dict(r) for r in data.get("records", [])], data.get("meta", {})


def _save_raw(path: Path, records: list[SourceRecord], meta: dict) -> None:
    write_json_atomic(path, {"meta": meta, "records": [r.to_dict() for r in records]})


WELLPASS_OFFICIAL_META = {
    "label": "EGYM Wellpass – offizieller Gym-Finder (einmaliger Abgleich)",
    "url": "https://de.egym-wellpass.com/de-de/gym-finder",
    "kind": "official",
    "note": "Daten des offiziellen Wellpass-Gym-Finders, einmalig für den privaten Gebrauch abgerufen.",
}


def fetch_source(name: str, client: PoliteClient, progress: Callable[[str], None], geocode: bool, wellpass_official: bool = False) -> tuple[list[SourceRecord], list[str]]:
    if name == "usc":
        return usc.fetch(client, progress, should_stop), []
    if name == "wellpass":
        if wellpass_official:
            return wellpass_egym.fetch(client, progress, should_stop), []
        return wellpass_fff.fetch(client, progress, should_stop), []
    if name == "manual":
        records, errors = manual.import_dir(MANUAL_IMPORT_DIR)
        if geocode:
            errors += geocode_missing(records, progress)
        progress(f"Manuell: {len(records)} Einträge aus {MANUAL_IMPORT_DIR.relative_to(paths.ROOT)}")
        return records, errors
    raise ValueError(f"Unbekannte Quelle: {name}")


def _published_dataset(records_by_source: dict[str, tuple[list[SourceRecord], dict]]) -> dict:
    all_records: list[SourceRecord] = []
    for recs, _ in records_by_source.values():
        all_records.extend(recs)
    # USC-Detailangaben (Plus, Limits je Stufe/Aktivität, PLZ …) anhängen
    details = read_json(USC_DETAILS, {}) or {}
    for r in all_records:
        if r.provider == "urbanSportsClub" and r.providerUrl:
            det = details.get(r.providerUrl.rsplit("/", 1)[1])
            if det:
                r.extra["details"] = det
    decisions = read_json(paths.DECISIONS, [])
    dataset = merge(all_records, decisions)
    dataset["sources"] = [
        {"id": k, **{kk: vv for kk, vv in SOURCES[k].items()}, **meta}
        for k, (recs, meta) in records_by_source.items()
        if meta
    ]
    return dataset


def cmd_fetch(source_names: list[str], geocode: bool = False, wellpass_official: bool = False) -> int:
    _install_signal_handlers()
    paths.ensure_dirs()
    STAGING_RAW.mkdir(parents=True, exist_ok=True)
    client = PoliteClient()
    report: dict[str, Any] = {"startedAt": now_iso(), "sources": {}, "errors": []}
    records_by_source: dict[str, tuple[list[SourceRecord], dict]] = {}
    emit("start", f"Import gestartet: {', '.join(source_names)}")

    for name in SOURCES:
        published_path = paths.RAW / f"{name}.json"
        if name not in source_names:
            # nicht angefordert → veröffentlichten Stand unverändert übernehmen
            records_by_source[name] = _load_raw(published_path)
            continue
        try:
            recs, row_errors = fetch_source(name, client, lambda m: emit("progress", m), geocode, wellpass_official)
            if should_stop():
                raise InterruptedError
            invalid = []
            valid = []
            for r in recs:
                problems = validate_record(r)
                (invalid if problems else valid).append((r, problems))
            errors = row_errors + [f"{r.name or r.sourceId}: {'; '.join(p)}" for r, p in invalid]
            meta = {"fetchedAt": now_iso(), "count": len(valid), "status": "ok", "skipped": len(invalid)}
            if name == "wellpass" and wellpass_official:
                meta.update(WELLPASS_OFFICIAL_META)
            records = [r for r, _ in valid]
            _save_raw(STAGING_RAW / f"{name}.json", records, meta)
            records_by_source[name] = (records, meta)
            report["sources"][name] = {**meta, "errors": errors[:200]}
            emit("source-done", f"{name}: {len(records)} Datensätze", source=name, count=len(records), errors=len(errors))
        except (InterruptedError, KeyboardInterrupt):
            emit("cancelled", "Import abgebrochen – bestehender Datenbestand bleibt unverändert.")
            return 130
        except (FetchError, ValueError, KeyError, OSError) as e:
            old, old_meta = _load_raw(published_path)
            records_by_source[name] = (old, old_meta)
            msg = f"{name}: {e}"
            report["errors"].append(msg)
            report["sources"][name] = {"status": "failed", "error": str(e), "keptPrevious": len(old)}
            emit("error", f"{msg} – bisheriger Stand ({len(old)} Datensätze) bleibt erhalten", source=name)

    if should_stop():
        emit("cancelled", "Import abgebrochen – bestehender Datenbestand bleibt unverändert.")
        return 130

    emit("progress", "Führe Anbieterlisten zusammen und erkenne Dubletten …")
    dataset = _published_dataset(records_by_source)
    published = read_json(paths.PUBLISHED, None)
    d = diff(published, dataset)
    report.update({
        "finishedAt": now_iso(),
        "diff": d,
        "warnings": plausibility_warnings(d),
        "matchCandidates": len(dataset["matchCandidates"]),
        "requested": source_names,
    })
    write_json_atomic(paths.STAGING_STUDIOS, dataset)
    write_json_atomic(paths.STAGING_REPORT, report)
    emit("done", f"Import fertig: {d['after']['total']} Studios, {len(d['added'])} neu, {len(d['removed'])} entfernt. Bitte prüfen und übernehmen.", report=report)
    return 0 if not report["errors"] else 2


def _backup_published() -> Path | None:
    if not paths.PUBLISHED.exists():
        return None
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    target = paths.BACKUPS / f"studios-{stamp}.json"
    shutil.copy2(paths.PUBLISHED, target)
    # nur die letzten 10 Sicherungen behalten
    backups = sorted(paths.BACKUPS.glob("studios-*.json"))
    for old in backups[:-10]:
        old.unlink()
    return target


def cmd_apply(force: bool = False) -> int:
    report = read_json(paths.STAGING_REPORT, None)
    dataset = read_json(paths.STAGING_STUDIOS, None)
    if not report or not dataset:
        emit("error", "Kein geprüfter Import vorhanden. Bitte zuerst 'fetch' ausführen.")
        return 1
    if report.get("warnings") and not force:
        emit("error", "Übernahme blockiert wegen Auffälligkeiten: " + " | ".join(report["warnings"]) + " (mit --force trotzdem übernehmen)")
        return 3
    backup = _backup_published()
    for f in STAGING_RAW.glob("*.json"):
        shutil.move(str(f), paths.RAW / f.name)
    write_json_atomic(paths.PUBLISHED, dataset, compact=True)
    paths.STAGING_STUDIOS.unlink(missing_ok=True)
    paths.STAGING_REPORT.unlink(missing_ok=True)
    emit("done", f"Datenbestand übernommen ({len(dataset['studios'])} Studios)." + (f" Sicherung: {backup.relative_to(paths.ROOT)}" if backup else ""))
    return 0


def cmd_discard() -> int:
    shutil.rmtree(paths.STAGING, ignore_errors=True)
    paths.STAGING.mkdir(parents=True, exist_ok=True)
    emit("done", "Import verworfen. Veröffentlichter Datenbestand unverändert.")
    return 0


def cmd_rebuild() -> int:
    """Erzeugt den veröffentlichten Datenbestand neu aus data/raw (offline),
    z. B. nach geänderten Match-Entscheidungen oder Algorithmus-Anpassungen."""
    paths.ensure_dirs()
    records_by_source = {name: _load_raw(paths.RAW / f"{name}.json") for name in SOURCES}
    if not any(recs for recs, _ in records_by_source.values()):
        emit("error", "Keine Rohdaten in data/raw – bitte zuerst importieren.")
        return 1
    dataset = _published_dataset(records_by_source)
    _backup_published()
    write_json_atomic(paths.PUBLISHED, dataset, compact=True)
    emit("done", f"Datenbestand neu erzeugt: {len(dataset['studios'])} Studios, {len(dataset['matchCandidates'])} offene Zuordnungsvorschläge.")
    return 0


def cmd_decide(pair: str, decision: str, fields: str | None = None) -> int:
    if decision not in ("confirm", "reject", "reset"):
        emit("error", f"Ungültige Entscheidung: {decision}")
        return 1
    if "~" not in pair:
        emit("error", f"Ungültige Paar-ID: {pair}")
        return 1
    decisions = [d for d in read_json(paths.DECISIONS, []) if d.get("pair") != pair]
    if decision != "reset":
        entry: dict[str, Any] = {"pair": pair, "decision": decision, "decidedAt": now_iso()}
        if fields:
            try:
                parsed = json.loads(fields)
            except json.JSONDecodeError as e:
                emit("error", f"--fields ist kein gültiges JSON: {e}")
                return 1
            if isinstance(parsed, dict):
                entry["fields"] = parsed
        decisions.append(entry)
    write_json_atomic(paths.DECISIONS, decisions)
    emit("progress", f"Entscheidung gespeichert: {decision}")
    return cmd_rebuild()


def cmd_validate(file: str) -> int:
    """Prüft eine Importdatei. Exit 0 = gültig (ggf. mit übersprungenen Zeilen),
    1 = Datei unbrauchbar."""
    path = Path(file)
    if not path.exists():
        emit("error", f"Datei nicht gefunden: {file}")
        return 1
    try:
        records, errors = manual.parse_file(path)
    except (manual.ImportFileError, UnicodeDecodeError) as e:
        emit("error", f"Datei unbrauchbar: {e}")
        return 1
    without = sum(1 for r in records if r.latitude is None)
    emit("done", f"{len(records)} gültige Einträge, {len(errors)} Fehler, {without} ohne Koordinaten",
         valid=len(records), errors=errors[:200], withoutCoordinates=without,
         providers={p: sum(1 for r in records if r.provider == p) for p in ("urbanSportsClub", "wellpass")})
    return 0 if records else 1



def cmd_enrich_usc(max_age_days: int = 30, limit: int | None = None) -> int:
    """Lädt Detailangaben (Plus, Limits je Stufe/Aktivität, PLZ, Bewertung) für
    alle USC-Studios des veröffentlichten Stands. Zwischenspeicher:
    data/raw/usc_details.json – abgebrochene Läufe setzen dort fort."""
    _install_signal_handlers()
    records, _ = _load_raw(paths.RAW / "usc.json")
    slugs = sorted({r.providerUrl.rsplit("/", 1)[1] for r in records if r.providerUrl})
    if limit:
        slugs = slugs[:limit]
    cache = read_json(USC_DETAILS, {}) or {}
    client = PoliteClient(delay=1.0)
    try:
        cache, errors = usc_details.fetch_details(
            slugs, cache, client, lambda m: emit("progress", m), should_stop,
            lambda c: write_json_atomic(USC_DETAILS, c), max_age_days,
        )
    except InterruptedError:
        emit("cancelled", "Abgebrochen – bisher geladene Details sind gespeichert.")
        return 130
    for e in errors[:50]:
        emit("error", e)
    emit("done", f"USC-Details: {len(cache)} Studios im Zwischenspeicher, {len(errors)} Fehler. Jetzt 'rebuild' ausführen.")
    return 0 if not errors else 2
