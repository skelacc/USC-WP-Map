"""Vergleich eines neuen Datenbestands mit dem veröffentlichten."""

from __future__ import annotations

from typing import Any

LIST_LIMIT = 300


def _summary(s: dict) -> dict:
    return {"id": s["id"], "name": s["name"], "street": (s.get("address") or {}).get("street"), "providers": s["providers"]}


def provider_counts(studios: list[dict]) -> dict[str, int]:
    c = {"total": len(studios), "urbanSportsClub": 0, "wellpass": 0, "both": 0, "uscOnly": 0, "wellpassOnly": 0, "withoutCoordinates": 0}
    for s in studios:
        u, w = s["providers"].get("urbanSportsClub"), s["providers"].get("wellpass")
        c["urbanSportsClub"] += bool(u)
        c["wellpass"] += bool(w)
        c["both"] += bool(u and w)
        c["uscOnly"] += bool(u and not w)
        c["wellpassOnly"] += bool(w and not u)
        c["withoutCoordinates"] += s.get("coordinates") is None
    return c


def diff(old: dict | None, new: dict) -> dict[str, Any]:
    old_studios = {s["id"]: s for s in (old or {}).get("studios", [])}
    new_studios = {s["id"]: s for s in new["studios"]}
    added = [_summary(new_studios[i]) for i in new_studios.keys() - old_studios.keys()]
    removed = [_summary(old_studios[i]) for i in old_studios.keys() - new_studios.keys()]
    changed = []
    for i in new_studios.keys() & old_studios.keys():
        if new_studios[i]["providers"] != old_studios[i]["providers"]:
            changed.append({**_summary(new_studios[i]), "before": old_studios[i]["providers"]})
    key = lambda s: (s["name"] or "").lower()  # noqa: E731
    # Listen gekürzt (bei ganz Deutschland sonst > 10.000 Einträge); Gesamtzahlen separat
    return {
        "before": provider_counts(list(old_studios.values())) if old else None,
        "after": provider_counts(new["studios"]),
        "added": sorted(added, key=key)[:LIST_LIMIT],
        "removed": sorted(removed, key=key)[:LIST_LIMIT],
        "providersChanged": sorted(changed, key=key)[:LIST_LIMIT],
        "totals": {"added": len(added), "removed": len(removed), "providersChanged": len(changed)},
    }


def plausibility_warnings(report_diff: dict) -> list[str]:
    """Warnungen bei auffälligen Einbrüchen – Hinweis auf eine geänderte
    Quelle statt echter Schließungen. Blockiert ``apply`` ohne --force."""
    warnings = []
    before, after = report_diff.get("before"), report_diff["after"]
    if not before:
        return warnings
    for k, label in (("urbanSportsClub", "Urban Sports Club"), ("wellpass", "Wellpass")):
        if before[k] >= 20 and after[k] < before[k] * 0.7:
            warnings.append(f"{label}: Anzahl fällt von {before[k]} auf {after[k]} (> 30 % Rückgang)")
    return warnings
