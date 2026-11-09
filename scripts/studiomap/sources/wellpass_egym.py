"""EGYM Wellpass – offizielle Standortdaten aus dem Wellpass-Gym-Finder.

Der Gym-Finder (https://de.egym-wellpass.com/de-de/gym-finder) bettet
https://locations.egym.com/embed/web/wellpass ein und lädt beim Start alle
Partner auf einmal von
``https://gymfinder.int.api.egym.com/v1/gym/overview?searchFilter=wellpass&limit=20000``.

Die robots.txt von locations.egym.com untersagt automatisierte Zugriffe. Der
vorgesehene Weg ist deshalb ein **Export aus dem eigenen Browser**: Gym-Finder
öffnen, in den Entwicklertools (Network) die Antwort von ``overview`` als HAR
oder per „Copy response“ als JSON speichern und in ``data/WP-network/`` ablegen
(siehe README). ``load_file`` liest beides.

Antwortformat (Kurzschlüssel, Stand 11/2026), je Eintrag in ``gyms``:
``egi`` EGYM-ID, ``a`` Name, ``lat``/``lng``, ``slug`` (beginnt mit dem Ort),
``sp`` Bundesland (BE, BY, NRW … bzw. österreichische Länder), ``st`` Studiotyp,
``ac`` Aktivitäten [{a: Code}], ``mt`` Mitgliedschaften (UNLIMITED, PLUS_1),
``tz`` Zeitzone, ``lc`` Sprache. Adressen enthält die Übersicht nicht.
"""

from __future__ import annotations

import json
import re
import unicodedata
import urllib.parse
from pathlib import Path
from typing import Any, Callable

from ..activities import EGYM_STUDIO_TYPE_DE, REGION_DE, egym_activities
from ..http import FetchError, PoliteClient
from ..io import now_iso
from ..records import SOURCE_OFFICIAL, SourceRecord

API = "https://gymfinder.int.api.egym.com/v1/gym/overview"
GYM_FINDER_URL = "https://de.egym-wellpass.com/de-de/gym-finder"
HEADERS = {
    "Accept": "application/json",
    "Accept-Language": "de-de",
    "Origin": "https://locations.egym.com",
    "Referer": "https://locations.egym.com/",
}
# Deutschland grob; zusammen mit Bundesland/Zeitzone zur Abgrenzung von AT/CH/NL
DE_BOUNDS = (47.2, 55.1, 5.8, 15.1)
AT_REGIONS = {"Wien", "Niederösterreich", "Oberösterreich", "Salzburg", "Tirol", "Tyrol", "Vorarlberg",
              "Kärnten", "Steiermark", "Styria", "Burgenland"}


PLACE_PREFIXES = {"bad", "neu", "sankt", "st"}


class ExportFileError(ValueError):
    pass


def _fold(text: str) -> str:
    t = text.lower().translate(str.maketrans({"ä": "ae", "ö": "oe", "ü": "ue", "ß": "ss"}))
    t = unicodedata.normalize("NFKD", t).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", t).strip("-")


def city_from_slug(slug: str, name: str) -> str | None:
    """Der Slug beginnt mit dem Ort („kiel-kieler-naturheilpraxis“). Übernommen
    wird er nur, wenn er auch im Namen vorkommt – dann in dessen Schreibweise
    („Kiel“, „Bad Tölz“). Sonst None (Ort unbekannt)."""
    tokens = slug.split("-")
    words = [w.strip(".,;:()[]\"'-–") for w in name.split()]
    folded = [_fold(w) for w in words]
    for k in (4, 3, 2, 1):
        if len(tokens) <= k or any(not t.isalpha() for t in tokens[:k]):
            continue
        prefix = "-".join(tokens[:k])
        for i, f in enumerate(folded):
            # ein Wort, ggf. mit Bindestrich („Steinbach-Hallenberg“)
            if f == prefix:
                return words[i]
            # zwei Wörter nur bei typischen Ortsvorsätzen („Bad Tölz“, „Sankt Augustin“)
            if f in PLACE_PREFIXES and i + 1 < len(words) and prefix in (f"{f}-{folded[i + 1]}", f"{f}{folded[i + 1]}"):
                return f"{words[i]} {words[i + 1]}"
    return None


def _in_germany(g: dict) -> bool:
    sp = g.get("sp")
    if sp in REGION_DE:
        return True
    if sp in AT_REGIONS or g.get("lc") == "de_AT" or g.get("tz") not in (None, "Europe/Berlin", "CET"):
        return False
    lat, lng = g.get("lat"), g.get("lng")
    if not isinstance(lat, (int, float)) or not isinstance(lng, (int, float)):
        return False
    s, n, w, e = DE_BOUNDS
    return s <= lat <= n and w <= lng <= e


def parse_response(data: Any, fetched_at: str) -> list[SourceRecord]:
    gyms = data.get("gyms") if isinstance(data, dict) else None
    if not isinstance(gyms, list):
        raise FetchError("Wellpass (offiziell): unerwartetes Antwortformat – Liste 'gyms' fehlt")
    out: dict[str, SourceRecord] = {}
    for g in gyms:
        if not isinstance(g, dict) or not _in_germany(g):
            continue
        gid = str(g.get("egi") or g.get("id") or "").strip()
        name = re.sub(r"\s+", " ", str(g.get("a") or "")).strip()
        if not gid or not name:
            continue
        lat, lng = g.get("lat"), g.get("lng")
        if not isinstance(lat, (int, float)) or not isinstance(lng, (int, float)):
            lat = lng = None
        slug = str(g.get("slug") or "")
        region = g.get("sp") if g.get("sp") in REGION_DE else None
        codes = [a.get("a") for a in g.get("ac") or [] if isinstance(a, dict) and a.get("a")]
        st = g.get("st")
        out[gid] = SourceRecord(
            provider="wellpass",
            source=SOURCE_OFFICIAL,
            sourceId=gid,
            name=name,
            city="Berlin" if region == "BE" else city_from_slug(slug, name),
            region=region,
            latitude=round(lat, 6) if lat is not None else None,
            longitude=round(lng, 6) if lng is not None else None,
            coordinatePrecision="source" if lat is not None else None,
            providerUrl=f"{GYM_FINDER_URL}/{urllib.parse.quote(slug)}" if slug else None,
            categories=[EGYM_STUDIO_TYPE_DE.get(st, str(st).replace("_", " ").title())] if st else [],
            fetchedAt=fetched_at,
            extra={
                "activities": egym_activities(codes),
                "plus1": "PLUS_1" in (g.get("mt") or []),
                "slug": slug,
            },
        )
    return list(out.values())


def _decode_concatenated(text: str) -> list[Any]:
    """Ein oder mehrere direkt aneinandergehängte JSON-Werte (z. B. doppelt eingefügt)."""
    dec = json.JSONDecoder()
    i, n, out = 0, len(text), []
    while i < n:
        while i < n and text[i].isspace():
            i += 1
        if i >= n:
            break
        obj, i = dec.raw_decode(text, i)
        out.append(obj)
    return out


def load_file(path: Path) -> tuple[dict, str]:
    """Liest einen Browser-Export: HAR (Network-Log) oder die kopierte JSON-Antwort.
    Liefert (Antwort, Zeitpunkt der Aufnahme)."""
    try:
        text = path.read_text(encoding="utf-8-sig")
    except OSError as e:
        raise ExportFileError(f"Datei nicht lesbar: {path} ({e})") from e
    try:
        values = _decode_concatenated(text)
    except json.JSONDecodeError as e:
        raise ExportFileError(f"{path.name} ist kein gültiges JSON ({e})") from e
    if not values:
        raise ExportFileError(f"{path.name} ist leer")
    first = values[0]
    stamp = now_iso()
    if isinstance(first, dict) and isinstance(first.get("log"), dict):
        # HAR: größte Antwort von …/gym/overview verwenden
        best: tuple[int, str, str] | None = None
        for e in first["log"].get("entries") or []:
            url = (e.get("request") or {}).get("url") or ""
            content = (e.get("response") or {}).get("content") or {}
            body = content.get("text")
            if "/gym/overview" not in url or not body:
                continue
            if content.get("encoding") == "base64":
                import base64
                body = base64.b64decode(body).decode("utf-8")
            if not best or len(body) > best[0]:
                best = (len(body), body, e.get("startedDateTime") or stamp)
        if not best:
            raise ExportFileError(
                f"{path.name}: kein Aufruf von …/gym/overview mit Inhalt gefunden. "
                "Aufzeichnung vor dem Neuladen der Seite starten (siehe README)."
            )
        data = json.loads(best[1])
        stamp = _utc(best[2]) or stamp
    else:
        data = first
        stamp = _file_time(path)
    if not isinstance(data, dict) or not isinstance(data.get("gyms"), list):
        raise ExportFileError(f"{path.name}: keine Gym-Finder-Antwort (Liste 'gyms' fehlt)")
    return data, stamp


def _utc(value: str) -> str | None:
    from datetime import datetime, timezone
    try:
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _file_time(path: Path) -> str:
    from datetime import datetime, timezone
    return datetime.fromtimestamp(path.stat().st_mtime, timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def newest_export(directory: Path) -> Path | None:
    files = [p for p in directory.glob("*") if p.suffix.lower() in (".har", ".json") and p.is_file()] if directory.is_dir() else []
    return max(files, key=lambda p: p.stat().st_mtime) if files else None


def import_file(path: Path, progress: Callable[[str], None]) -> list[SourceRecord]:
    progress(f"Wellpass: lese Gym-Finder-Export {path.name} …")
    data, stamp = load_file(path)
    records = parse_response(data, stamp)
    if not records:
        raise FetchError("Wellpass (offiziell): keine Studios in Deutschland in der Datei")
    berlin = sum(1 for r in records if r.region == "BE")
    progress(f"Wellpass: {len(records)} Studios in Deutschland ({berlin} in Berlin) aus {len(data['gyms'])} Einträgen")
    return records


def fetch(client: PoliteClient, progress: Callable[[str], None], should_stop: Callable[[], bool]) -> list[SourceRecord]:
    """Direkter Abruf (nur mit --wellpass-official). Bevorzugt ist der Export aus dem Browser."""
    if should_stop():
        raise InterruptedError
    progress("Wellpass: Abfrage beim offiziellen Gym-Finder …")
    qs = urllib.parse.urlencode({"searchFilter": "wellpass", "limit": 20000})
    data = client.get_json(f"{API}?{qs}", HEADERS)
    records = parse_response(data, now_iso())
    if not records:
        raise FetchError("Wellpass (offiziell): keine Studios erhalten")
    progress(f"Wellpass: {len(records)} Studios vom offiziellen Gym-Finder")
    return records
