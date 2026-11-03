"""Zusammenführung der Anbieterlisten und Dublettenerkennung.

Mehrstufiges Verfahren je Paar (USC-Datensatz u, Wellpass-Datensatz w):

1. Adressen normalisieren (``normalize.address_key``).
2. Exakter Adressvergleich (Straße + erste Hausnummer, ggf. PLZ).
3. Namen normalisieren (Kleinschreibung, Umlaute, Rechtsformen, „Berlin“ …).
4. Namensähnlichkeit (Zeichenfolge + Token-Überdeckung).
5. Geografische Distanz der Koordinaten.
6. Einstufung:
   * ``auto``    – sicher genug für automatische Zusammenführung
   * ``review``  – plausibel, aber unsicher → Vorschlag zur manuellen Prüfung,
                   bleibt bis zur Bestätigung GETRENNT
   * kein Treffer

Schutz vor dem Zusammenlegen verschiedener Filialen einer Kette:
* abweichende Hausnummer in derselben Straße oder abweichende Straße
  verhindert ``auto``;
* widersprüchliche Bezirksangaben im Namen („… Mitte“ vs. „… Spandau“)
  verhindern jede Zuordnung;
* über 250 m Abstand wird nie automatisch zugeordnet.

Manuelle Entscheidungen (``data/manual/match_decisions.json``) haben
Vorrang: bestätigt → zusammengeführt (``verified``), abgelehnt → getrennt.
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass, field
from typing import Any

from . import SCHEMA_VERSION
from .io import now_iso
from .normalize import (address_key, branch_hint, haversine_m, name_similarity,
                        split_street)
from .records import SourceRecord

MAX_CANDIDATE_DISTANCE_M = 250
AUTO_MAX_DISTANCE_M = 120


@dataclass
class MatchResult:
    level: str  # auto | review | none
    score: float
    reasons: list[str] = field(default_factory=list)
    distance_m: float | None = None
    name_similarity: float = 0.0
    address_match: str = "unknown"  # exact | different | unknown


def compare(u: SourceRecord, w: SourceRecord) -> MatchResult:
    reasons: list[str] = []
    dist = None
    if None not in (u.latitude, u.longitude, w.latitude, w.longitude):
        dist = haversine_m(u.latitude, u.longitude, w.latitude, w.longitude)  # type: ignore[arg-type]

    ku, kw = address_key(u.street, u.postalCode), address_key(w.street, w.postalCode)
    if ku and kw:
        if ku == kw and not (u.postalCode and w.postalCode and u.postalCode != w.postalCode):
            addr = "exact"
            reasons.append(f"Adresse identisch ({u.street} ≙ {w.street})")
        else:
            addr = "different"
            su, sw = split_street(u.street)[0], split_street(w.street)[0]
            reasons.append(
                f"{'Hausnummer' if su == sw else 'Adresse'} abweichend ({u.street} ≠ {w.street})"
            )
    else:
        addr = "unknown"
        reasons.append("Adressvergleich nicht möglich (Angabe fehlt)")

    sim = name_similarity(u.name, w.name)
    reasons.append(f"Namensähnlichkeit {sim:.2f} („{u.name}“ / „{w.name}“)")
    if dist is not None:
        reasons.append(f"Abstand {dist:.0f} m")
    else:
        reasons.append("Abstand unbekannt (Koordinaten fehlen)")

    hu, hw = branch_hint(u.name), branch_hint(w.name)
    if hu and hw and not (hu & hw):
        reasons.append(f"Unterschiedliche Ortsangabe im Namen ({', '.join(sorted(hu))} / {', '.join(sorted(hw))})")
        return MatchResult("none", 0.0, reasons, dist, sim, addr)

    near = dist is not None and dist <= AUTO_MAX_DISTANCE_M
    close = dist is None or dist <= MAX_CANDIDATE_DISTANCE_M

    score = 0.5 * sim
    if addr == "exact":
        score += 0.4
    elif addr == "different":
        score -= 0.3
    if dist is not None:
        score += 0.1 * max(0.0, 1 - dist / MAX_CANDIDATE_DISTANCE_M)
    score = round(max(0.0, min(1.0, score)), 3)

    level = "none"
    if addr == "exact" and sim >= 0.6 and (dist is None or dist <= MAX_CANDIDATE_DISTANCE_M):
        level = "auto"
    elif addr != "different" and sim >= 0.85 and near:
        level = "auto"
    elif addr == "exact" and close and sim >= 0.45:
        level = "review"  # gleiche Adresse, Namen nur teilweise ähnlich
    elif sim >= (0.85 if addr == "different" else 0.6) and close and dist is not None:
        level = "review"
    elif sim >= 0.4 and dist is not None and dist <= 40 and addr != "different":
        level = "review"
    return MatchResult(level, score, reasons, dist, sim, addr)


def pair_id(u: SourceRecord, w: SourceRecord) -> str:
    return f"{u.key}~{w.key}"


def _studio_id(primary: SourceRecord) -> str:
    """Stabile ID je Standort, abgeleitet aus der Quell-ID des führenden Datensatzes."""
    prefix = {"urbanSportsClub": "usc", "wellpass": "wp"}[primary.provider]
    if primary.source == "official":
        return f"{prefix}-{primary.sourceId}"
    h = hashlib.sha1(primary.key.encode()).hexdigest()[:10]
    return f"{prefix}-{h}"


def _provider_detail(r: SourceRecord) -> dict[str, Any]:
    return {
        "sourceId": r.sourceId,
        "source": r.source,
        "name": r.name,
        "url": r.providerUrl,
        "plans": r.plans or None,
        "categories": r.categories or None,
        "fetchedAt": r.fetchedAt,
    }


def _build_studio(records: list[SourceRecord], confidence: str, match: dict | None) -> dict[str, Any]:
    # Führender Datensatz: offizielle Quelle mit Koordinaten bevorzugt (USC zuerst)
    ordered = sorted(records, key=lambda r: (r.source != "official", r.latitude is None, r.provider != "urbanSportsClub"))
    p = ordered[0]

    def first(attr: str):
        for r in ordered:
            v = getattr(r, attr)
            if v:
                return v
        return None

    coord_rec = next((r for r in ordered if r.latitude is not None), None)
    providers = {"urbanSportsClub": False, "wellpass": False}
    source: dict[str, str | None] = {"urbanSportsClub": None, "wellpass": None}
    details: dict[str, Any] = {}
    for r in records:
        providers[r.provider] = True
        source[r.provider] = r.source
        details[r.provider] = _provider_detail(r)
    fetched = sorted(r.fetchedAt for r in records if r.fetchedAt)
    categories = sorted({c for r in records for c in r.categories})
    return {
        "id": _studio_id(p),
        "name": p.name,
        "address": {
            "street": first("street"),
            "postalCode": first("postalCode"),
            "city": first("city") or "Berlin",
            "district": first("district"),
        },
        "coordinates": (
            {
                "latitude": coord_rec.latitude,
                "longitude": coord_rec.longitude,
                "precision": coord_rec.coordinatePrecision or "source",
                "from": coord_rec.provider,
            }
            if coord_rec
            else None
        ),
        "providers": providers,
        "providerDetails": details,
        "website": first("website"),
        "phone": first("phone"),
        "categories": categories,
        "source": source,
        "lastVerified": fetched[0][:10] if fetched else None,
        "matchConfidence": confidence,
        "match": match,
    }


def merge(records: list[SourceRecord], decisions: list[dict] | None = None) -> dict[str, Any]:
    usc = [r for r in records if r.provider == "urbanSportsClub"]
    wp = [r for r in records if r.provider == "wellpass"]
    decided = {d["pair"]: d for d in (decisions or []) if d.get("pair") and d.get("decision") in ("confirm", "reject")}
    by_key = {r.key: r for r in records}

    # Grobe räumliche Vorauswahl über ein ~500-m-Raster
    def cell(r: SourceRecord) -> tuple[int, int] | None:
        if r.latitude is None or r.longitude is None:
            return None
        return int(r.latitude / 0.0045), int(r.longitude / 0.0075)

    grid: dict[tuple[int, int], list[SourceRecord]] = {}
    for u in usc:
        c = cell(u)
        if c:
            grid.setdefault(c, []).append(u)
    usc_by_addr: dict[str, list[SourceRecord]] = {}
    for u in usc:
        k = address_key(u.street)
        if k:
            usc_by_addr.setdefault(k, []).append(u)

    pairs: list[tuple[SourceRecord, SourceRecord, MatchResult]] = []
    for w in wp:
        cands: dict[str, SourceRecord] = {}
        c = cell(w)
        if c:
            for dx in (-1, 0, 1):
                for dy in (-1, 0, 1):
                    for u in grid.get((c[0] + dx, c[1] + dy), []):
                        cands[u.key] = u
        for u in usc_by_addr.get(address_key(w.street), []):
            cands[u.key] = u
        for u in cands.values():
            pid = pair_id(u, w)
            if pid in decided:
                continue
            res = compare(u, w)
            if res.level != "none":
                pairs.append((u, w, res))

    used: set[str] = set()
    merged_groups: list[tuple[list[SourceRecord], str, dict]] = []

    # 1) Manuell bestätigte Paare haben Vorrang
    for pid, d in decided.items():
        if d["decision"] != "confirm":
            continue
        uk, wk = pid.split("~", 1)
        u, w = by_key.get(uk), by_key.get(wk)
        if not u or not w or uk in used or wk in used:
            continue  # Datensatz nicht mehr in den Quellen → Entscheidung ruht
        used.update((uk, wk))
        res = compare(u, w)
        merged_groups.append(([u, w], "verified", {
            "method": "manual", "score": res.score, "reasons": res.reasons,
            "decidedAt": d.get("decidedAt"), "distanceM": round(res.distance_m) if res.distance_m is not None else None,
        }))

    # 2) Automatische Treffer, bestes Paar zuerst, jeweils 1:1
    pairs.sort(key=lambda t: (t[2].level != "auto", -t[2].score))
    candidates: list[dict] = []
    for u, w, res in pairs:
        if res.level == "auto":
            if u.key in used or w.key in used:
                continue
            used.update((u.key, w.key))
            merged_groups.append(([u, w], "high", {
                "method": "automatic", "score": res.score, "reasons": res.reasons,
                "distanceM": round(res.distance_m) if res.distance_m is not None else None,
            }))
    for u, w, res in pairs:
        if res.level == "review" and u.key not in used and w.key not in used:
            candidates.append({
                "id": pair_id(u, w),
                "status": "pending",
                "score": res.score,
                "distanceM": round(res.distance_m) if res.distance_m is not None else None,
                "nameSimilarity": res.name_similarity,
                "addressMatch": res.address_match,
                "reasons": res.reasons,
                "urbanSportsClub": {"key": u.key, "name": u.name, "street": u.street, "district": u.district},
                "wellpass": {"key": w.key, "name": w.name, "street": w.street, "postalCode": w.postalCode},
            })

    studios = [_build_studio(g, conf, m) for g, conf, m in merged_groups]
    for r in records:
        if r.key not in used:
            studios.append(_build_studio([r], "single", None))

    # IDs eindeutig halten (z. B. zwei manuelle Einträge mit gleicher Herkunft)
    seen: dict[str, int] = {}
    for s in studios:
        n = seen.get(s["id"], 0)
        seen[s["id"]] = n + 1
        if n:
            s["id"] = f"{s['id']}-{n}"
        # Studio-ID im Kandidaten vermerken, damit das Frontend Vorschläge anzeigen kann
    key_to_studio = {}
    for s in studios:
        for prov, det in s["providerDetails"].items():
            key_to_studio[f"{prov}:{det['source']}:{det['sourceId']}"] = s["id"]
    for c in candidates:
        c["urbanSportsClub"]["studioId"] = key_to_studio.get(c["urbanSportsClub"]["key"])
        c["wellpass"]["studioId"] = key_to_studio.get(c["wellpass"]["key"])

    studios.sort(key=lambda s: (s["name"] or "").lower())
    rejected = [pid for pid, d in decided.items() if d["decision"] == "reject"]
    return {
        "schemaVersion": SCHEMA_VERSION,
        "generatedAt": now_iso(),
        "studios": studios,
        "matchCandidates": candidates,
        "rejectedPairs": rejected,
    }
