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
* über 250 m Abstand wird nie automatisch zugeordnet; über 120 m nur bei
  praktisch gleichem Namen und fehlender Adresse (Wellpass-Gym-Finder).

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
    elif ku and (kosm := address_key(w.extra.get("osmStreet"))):
        # Wellpass-Adresse nur aus der Position ermittelt (OSM, ungefähr): Übereinstimmung
        # zählt als Beleg, Abweichung zählt nicht dagegen (Nachbarhausnummer, Eckhaus …)
        if kosm == ku:
            addr = "exact"
            reasons.append(f"Adresse an der Wellpass-Position identisch ({u.street} ≙ {w.extra['osmStreet']}, OpenStreetMap)")
        else:
            addr = "unknown"
            reasons.append(f"Adresse an der Wellpass-Position abweichend ({w.extra['osmStreet']}, OpenStreetMap) – nicht gewertet")
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

    # Adresse nur aus der Wellpass-Position ermittelt (OSM): oft mehrere Anbieter im selben Haus
    # (Sportanlage, Schule) → für eine automatische Zuordnung deutlich ähnlicherer Name nötig
    osm_only = addr == "exact" and not w.street and bool(w.extra.get("osmStreet"))
    level = "none"
    if addr == "exact" and sim >= (0.75 if osm_only else 0.6) and (dist is None or dist <= MAX_CANDIDATE_DISTANCE_M):
        level = "auto"
    elif addr != "different" and sim >= 0.85 and near:
        level = "auto"
    elif addr == "unknown" and sim >= 0.95 and dist is not None and dist <= MAX_CANDIDATE_DISTANCE_M:
        # ohne Adressvergleich (Wellpass-Gym-Finder): praktisch gleicher Name, z. B. Bäder und Parks mit weit auseinanderliegenden Pins
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
    """Vollständige Angaben je Anbieter – das Frontend zeigt sie in eigenen
    Tabs und kann Studios damit auch selbst zusammenführen/trennen."""
    from .activities import usc_activities, usc_plan_included, wellpass_activity

    det = r.extra.get("details") or {}
    d: dict[str, Any] = {
        "sourceId": r.sourceId,
        "source": r.source,
        "key": r.key,
        "name": r.name,
        "url": r.providerUrl,
        "address": _address(r),
        "coordinates": (
            {"latitude": r.latitude, "longitude": r.longitude, "precision": r.coordinatePrecision or "source"}
            if r.latitude is not None else None
        ),
        "website": r.website,
        "phone": r.phone or det.get("phone"),
        "plans": r.plans or None,
        "categories": r.categories or None,
        "fetchedAt": r.fetchedAt,
    }
    if r.provider == "urbanSportsClub":
        d["activities"] = usc_activities(r.categories, det or None)
        d["planIncluded"] = usc_plan_included(det or None, r.plans)
        d["plus"] = bool(det.get("plus")) if det else None
        d["rating"] = det.get("rating")
        d["ratingCount"] = det.get("ratingCount")
        d["visitLimits"] = {l["size"]: l["perMonth"] if l["included"] else 0 for l in det.get("limits") or [] if l.get("size")} or None
        d["detailsFetchedAt"] = det.get("fetchedAt")
    elif "activities" in r.extra:  # offizieller Gym-Finder: Aktivitätscodes bereits übersetzt
        d["activities"] = [{"name": n, "limits": None} for n in r.extra["activities"]]
        d["plus1"] = bool(r.extra.get("plus1"))
    else:
        d["activities"] = [{"name": n, "limits": None} for n in sorted({wellpass_activity(c) for c in r.categories})]
    return d


def _address(r: SourceRecord) -> dict[str, Any]:
    from .activities import REGION_DE

    a: dict[str, Any] = {"street": r.street, "postalCode": r.postalCode, "city": r.city, "district": r.district}
    if r.region and r.region != "BE":
        a["region"] = REGION_DE.get(r.region, r.region)
    return a


FIELD_PROVIDERS = ("urbanSportsClub", "wellpass")


def _apply_overrides(studio: dict[str, Any], fields: dict[str, Any] | None) -> None:
    """Manuell gewählte Angaben bei einer Zusammenführung: je Feld der Anbieter
    ("urbanSportsClub"/"wellpass") oder ein eigener Text {"custom": "..."}."""
    if not fields:
        return
    det = studio["providerDetails"]
    for field, choice in fields.items():
        if isinstance(choice, dict) and "custom" in choice:
            value = choice["custom"]
            if field == "name":
                studio["name"] = value
            elif field == "website":
                studio["website"] = value
            continue
        members = {d["key"]: d for d in det.values()} | {m["detail"]["key"]: m["detail"] for m in studio.get("extraMembers", [])}
        if choice in FIELD_PROVIDERS and choice in det:
            src = det[choice]
        elif choice in members:
            src = members[choice]
        else:
            continue
        prov = choice if choice in FIELD_PROVIDERS else choice.split(":", 1)[0]
        if field == "name":
            studio["name"] = src["name"]
        elif field == "address":
            studio["address"] = dict(src["address"])
        elif field == "coordinates" and src.get("coordinates"):
            studio["coordinates"] = {**src["coordinates"], "from": prov}
        elif field == "website":
            studio["website"] = src.get("website")
    studio["fieldChoices"] = fields


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
    extra: list[dict[str, Any]] = []
    for r in records:  # Reihenfolge der Gruppe bleibt erhalten
        providers[r.provider] = True
        if r.provider in details:
            extra.append({"provider": r.provider, "detail": _provider_detail(r)})
            continue
        source[r.provider] = r.source
        details[r.provider] = _provider_detail(r)
    fetched = sorted(r.fetchedAt for r in records if r.fetchedAt)
    categories = sorted({c for r in records for c in r.categories})
    all_details = list(details.values()) + [m["detail"] for m in extra]
    activities = sorted({a["name"] for d in all_details for a in d.get("activities") or []})
    return {
        "id": _studio_id(p),
        "name": p.name,
        "address": {
            "street": first("street"),
            "postalCode": first("postalCode") or next((r.extra.get("details", {}).get("postalCode") for r in ordered if r.extra.get("details", {}).get("postalCode")), None),
            "city": first("city"),
            "district": first("district"),
            **({"region": _address(reg)["region"]} if (reg := next((r for r in ordered if r.region and r.region != "BE"), None)) else {}),
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
        **({"extraMembers": extra} if extra else {}),
        "website": first("website"),
        "phone": first("phone"),
        "categories": categories,
        "activities": activities,
        "source": source,
        "lastVerified": fetched[0][:10] if fetched else None,
        "matchConfidence": confidence,
        "match": match,
    }


def translate_decision(d: dict, aliases: dict[str, str]) -> dict:
    """Ersetzt veraltete Eintragsschlüssel (z. B. Fair for Fitness → offizieller
    Gym-Finder) in einer Entscheidung, auch in den gewählten Feldern."""
    if not aliases:
        return d
    keys = d.get("keys") or (d.get("pair") or "").split("~")
    if not any(k in aliases for k in keys):
        return d
    out = {**d, "keys": [aliases.get(k, k) for k in keys]}
    if isinstance(d.get("fields"), dict):
        out["fields"] = {f: (aliases.get(v, v) if isinstance(v, str) else v) for f, v in d["fields"].items()}
    return out


def merge(records: list[SourceRecord], decisions: list[dict] | None = None, aliases: dict[str, str] | None = None) -> dict[str, Any]:
    usc = [r for r in records if r.provider == "urbanSportsClub"]
    wp = [r for r in records if r.provider == "wellpass"]
    by_key = {r.key: r for r in records}
    # Entscheidungen betreffen Gruppen von Einträgen (beliebig viele, auch vom
    # selben Anbieter). Spätere Entscheidungen überschreiben frühere.
    valid = [translate_decision(d, aliases or {}) for d in (decisions or []) if d.get("pair") and d.get("decision") in ("confirm", "reject")]
    groups: list[tuple[list[str], dict]] = []
    decided: dict[str, dict] = {}  # USC~Wellpass-Paare, die der Automatik entzogen sind
    for d in valid:
        keys = d.get("keys") or d["pair"].split("~")
        for uk in (k for k in keys if k.startswith("urbanSportsClub:")):
            for wk in (k for k in keys if k.startswith("wellpass:")):
                decided[f"{uk}~{wk}"] = d
        if d["decision"] == "confirm":
            ks = set(keys)
            groups = [(g, gd) for g, gd in groups if not set(g) <= ks]  # umfassendere Gruppe ersetzt
            groups.append((keys, d))
        else:
            groups = [(g, gd) for g, gd in groups if not (len(set(g) & set(keys)) >= 2)]

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

    # 1) Manuell bestätigte Gruppen haben Vorrang
    for keys, d in groups:
        recs = [by_key[k] for k in keys if k in by_key and k not in used]
        if len(recs) < 2:
            continue  # Einträge nicht (mehr) in den Quellen → Entscheidung ruht
        used.update(r.key for r in recs)
        u = next((r for r in recs if r.provider == "urbanSportsClub"), None)
        w = next((r for r in recs if r.provider == "wellpass"), None)
        res = compare(u, w) if u and w else None
        merged_groups.append((recs, "verified", {
            "method": "manual", "score": res.score if res else 1.0, "reasons": res.reasons if res else ["Manuell zusammengeführt"],
            "decidedAt": d.get("decidedAt"),
            "distanceM": round(res.distance_m) if res and res.distance_m is not None else None,
            "fields": d.get("fields"),
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

    studios = []
    for g, conf, m in merged_groups:
        st = _build_studio(g, conf, m)
        _apply_overrides(st, (m or {}).get("fields"))
        studios.append(st)
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
