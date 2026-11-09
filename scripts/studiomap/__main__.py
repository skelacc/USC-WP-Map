"""Kommandozeile: ``python3 -m studiomap <befehl>`` (aus dem Ordner scripts/)
bzw. ``npm run data:<befehl>`` im Projektordner."""

from __future__ import annotations

import argparse
import sys

from . import pipeline


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(prog="studiomap", description="Datenimport für die Fitness Studio Map Berlin")
    sub = p.add_subparsers(dest="cmd", required=True)

    f = sub.add_parser("fetch", help="Quellen abrufen und Import vorbereiten (Staging)")
    f.add_argument("--sources", default="usc,wellpass,manual", help="Komma-Liste: usc,wellpass,manual")
    f.add_argument("--wellpass-official", action="store_true",
                   help="Wellpass einmalig direkt vom offiziellen Gym-Finder abrufen (statt Fair for Fitness)")
    f.add_argument("--geocode", action="store_true", help="fehlende Koordinaten manueller Einträge per Nominatim ermitteln")

    a = sub.add_parser("apply", help="geprüften Import übernehmen")
    a.add_argument("--force", action="store_true", help="trotz Plausibilitätswarnungen übernehmen")

    sub.add_parser("discard", help="vorbereiteten Import verwerfen")
    sub.add_parser("rebuild", help="Datenbestand offline aus data/raw neu erzeugen")

    d = sub.add_parser("decide", help="Zuordnungsvorschlag bestätigen/ablehnen")
    d.add_argument("pair", help="Paar-ID aus matchCandidates[].id")
    d.add_argument("decision", choices=["confirm", "reject", "reset"])
    d.add_argument("--keys", default=None, help='JSON-Liste der Eintragsschlüssel (für Gruppen > 2)')
    d.add_argument("--fields", default=None, help='JSON, z. B. {"name": "wellpass", "address": "urbanSportsClub"}')

    e = sub.add_parser("enrich-usc", help="USC-Detailseiten laden (Plus, Limits je Stufe/Aktivität, PLZ, Bewertung)")
    e.add_argument("--max-age-days", type=int, default=30)
    e.add_argument("--limit", type=int, default=None)

    v = sub.add_parser("validate", help="Importdatei (CSV/JSON) prüfen, ohne etwas zu ändern")
    v.add_argument("file")

    args = p.parse_args(argv)
    if args.cmd == "enrich-usc":
        return pipeline.cmd_enrich_usc(args.max_age_days, args.limit)
    if args.cmd == "validate":
        return pipeline.cmd_validate(args.file)
    if args.cmd == "fetch":
        names = [s.strip() for s in args.sources.split(",") if s.strip()]
        unknown = [n for n in names if n not in pipeline.SOURCES]
        if unknown:
            p.error(f"unbekannte Quelle(n): {', '.join(unknown)}")
        return pipeline.cmd_fetch(names, geocode=args.geocode, wellpass_official=args.wellpass_official)
    if args.cmd == "apply":
        return pipeline.cmd_apply(force=args.force)
    if args.cmd == "discard":
        return pipeline.cmd_discard()
    if args.cmd == "rebuild":
        return pipeline.cmd_rebuild()
    if args.cmd == "decide":
        return pipeline.cmd_decide(args.pair, args.decision, args.fields, args.keys)
    return 1


if __name__ == "__main__":
    sys.exit(main())
