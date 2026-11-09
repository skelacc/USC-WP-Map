"""Tests für Normalisierung, Dublettenerkennung und Importdateien.
Ausführen: npm run test:py  (oder: cd scripts && python3 -m unittest discover -s tests)"""

from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from studiomap.diff import diff, plausibility_warnings  # noqa: E402
from studiomap.merge import compare, merge  # noqa: E402
from studiomap.normalize import address_key, name_similarity  # noqa: E402
from studiomap.records import SourceRecord  # noqa: E402
from studiomap.sources import manual, usc, wellpass_egym, wellpass_fff  # noqa: E402
from studiomap import addresses, publish  # noqa: E402
from studiomap.supplement import link_fair_for_fitness  # noqa: E402


def usc_rec(sid, name, street=None, lat=None, lng=None, **kw):
    return SourceRecord("urbanSportsClub", "official", sid, name, street=street, latitude=lat, longitude=lng,
                        coordinatePrecision="source" if lat else None, fetchedAt="2026-11-03T10:00:00Z", **kw)


def wp_rec(sid, name, street=None, lat=None, lng=None, **kw):
    return SourceRecord("wellpass", "fair-for-fitness", sid, name, street=street, latitude=lat, longitude=lng,
                        coordinatePrecision="source" if lat else None, fetchedAt="2026-11-03T10:00:00Z", **kw)


class NormalizeTests(unittest.TestCase):
    def test_address_variants(self):
        self.assertEqual(address_key("Musterstraße 12"), address_key("Musterstr. 12a"))
        self.assertEqual(address_key("Rheinstraße 45/46"), address_key("Rheinstraße 45-46"))
        self.assertEqual(address_key("Gabriele-Tergit-Promenade 17 a-d"), address_key("Gabriele-Tergit-Promenade 17A"))
        self.assertEqual(address_key("Prinz-Regentenstr. 42"), address_key("Prinzregentenstraße 42"))
        self.assertEqual(address_key("Straße des 17. Juni 100"), "strdes17juni|100")
        self.assertEqual(address_key("Leuschnerdamm 13, Aufgang 2"), address_key("Leuschnerdamm 13/Aufgang 2 Etage 2"))
        self.assertNotEqual(address_key("Siemensdamm 43"), address_key("Siemensdamm 44"))
        self.assertEqual(address_key("Gartenhaus"), "")

    def test_name_similarity(self):
        self.assertEqual(name_similarity("Fitness First Berlin Mitte", "Fitness First – Berlin Mitte"), 1.0)
        self.assertGreaterEqual(name_similarity("SUNYOGA Friedrichshain", "SunYoga"), 0.85)
        # Gattungsbegriffe allein reichen nicht
        self.assertLess(name_similarity("Just a lil' break Yoga", "O-Yoga"), 0.6)
        self.assertLess(name_similarity("Pilatesengel-Reformer", "Pilates Studio"), 0.6)


class MatchTests(unittest.TestCase):
    def test_same_studio_different_spelling_is_merged(self):
        u = usc_rec("1", "Fitness First Berlin Mitte", "Musterstraße 12", 52.5200, 13.4000)
        w = wp_rec("a", "Fitness First – Berlin Mitte", "Musterstr. 12", 52.5201, 13.4001)
        out = merge([u, w])
        self.assertEqual(len(out["studios"]), 1)
        s = out["studios"][0]
        self.assertEqual(s["providers"], {"urbanSportsClub": True, "wellpass": True})
        self.assertEqual(s["matchConfidence"], "high")
        self.assertTrue(any("Adresse identisch" in r for r in s["match"]["reasons"]))

    def test_chain_branches_are_not_merged(self):
        u = usc_rec("1", "McFIT Berlin-Mitte", "Torstraße 1", 52.5290, 13.4010)
        w = wp_rec("a", "McFIT Berlin-Spandau", "Carl-Schurz-Straße 5", 52.5360, 13.2000)
        w2 = wp_rec("b", "McFIT Berlin-Mitte", "Rosenthaler Straße 40", 52.5295, 13.4015)  # andere Adresse, nah
        out = merge([u, w, w2])
        self.assertEqual(len(out["studios"]), 3)
        self.assertTrue(all(s["matchConfidence"] == "single" for s in out["studios"]))
        # unterschiedliche Hausnummer/Straße → höchstens Prüfvorschlag
        res = compare(u, w2)
        self.assertNotEqual(res.level, "auto")

    def test_district_conflict_blocks_match(self):
        u = usc_rec("1", "Bodystreet Mitte", None, 52.5200, 13.4000)
        w = wp_rec("a", "Bodystreet Spandau", None, 52.5201, 13.4001)
        self.assertEqual(compare(u, w).level, "none")

    def test_uncertain_match_needs_review(self):
        u = usc_rec("1", "authentic body berlin - neukölln", "Boddinstr 4", 52.4800, 13.4300)
        w = wp_rec("a", "authentic body control", None, 52.48005, 13.43005)
        out = merge([u, w])
        self.assertEqual(len(out["studios"]), 2, "unsichere Treffer dürfen nicht zusammengeführt werden")
        self.assertEqual(len(out["matchCandidates"]), 1)

    def test_manual_decisions(self):
        u = usc_rec("1", "authentic body berlin - neukölln", "Boddinstr 4", 52.4800, 13.4300)
        w = wp_rec("a", "authentic body control", None, 52.48005, 13.43005)
        pair = f"{u.key}~{w.key}"
        out = merge([u, w], [{"pair": pair, "decision": "confirm"}])
        self.assertEqual(len(out["studios"]), 1)
        self.assertEqual(out["studios"][0]["matchConfidence"], "verified")
        a = usc_rec("2", "Same Gym", "Weg 1", 52.5, 13.4)
        b = wp_rec("b", "Same Gym", "Weg 1", 52.5, 13.4)
        out = merge([a, b], [{"pair": f"{a.key}~{b.key}", "decision": "reject"}])
        self.assertEqual(len(out["studios"]), 2)

    def test_missing_coordinates_kept_without_guessing(self):
        u = usc_rec("1", "Ohne Ort Studio", "Weg 1")
        out = merge([u])
        self.assertIsNone(out["studios"][0]["coordinates"])

    def test_one_to_one(self):
        w = wp_rec("a", "Gezer Spa & Fitness", "Behrenstraße 10", 52.5159, 13.3885)
        u1 = usc_rec("1", "Gezer Spa & Fitness im Westin Grand", "Behrenstraße 10", 52.5159, 13.3885)
        u2 = usc_rec("2", "Gezer Spa & Fitness im Westin Grand - Massage", "Behrenstraße 10", 52.5159, 13.3885)
        out = merge([w, u1, u2])
        self.assertEqual(sum(1 for s in out["studios"] if s["providers"]["wellpass"]), 1)
        self.assertEqual(len(out["studios"]), 2)


class ManualImportTests(unittest.TestCase):
    def write(self, name, content):
        d = Path(tempfile.mkdtemp())
        p = d / name
        p.write_text(content, encoding="utf-8")
        return p

    def test_valid_csv_with_semicolon_and_missing_coords(self):
        p = self.write("x.csv", "provider;name;street;latitude;longitude\nwp;Studio A;Weg 1;;\nusc;Studio B;Weg 2;52,52;13,40\n")
        recs, errs = manual.parse_file(p)
        self.assertEqual(errs, [])
        self.assertEqual([r.provider for r in recs], ["wellpass", "urbanSportsClub"])
        self.assertIsNone(recs[0].latitude)
        self.assertAlmostEqual(recs[1].latitude, 52.52)

    def test_invalid_rows_are_reported_and_skipped(self):
        p = self.write("x.csv", "provider,name,latitude,longitude\nfoo,Studio,,\nwellpass,,,\nwellpass,X,abc,13\nwellpass,Y,40.4,-3.7\nwellpass,Z,52.5,\nwellpass,OK,,\n")
        recs, errs = manual.parse_file(p)
        self.assertEqual([r.name for r in recs], ["OK"])
        self.assertEqual(len(errs), 5)
        self.assertTrue(any("Zeile 2" in e and "Anbieter" in e for e in errs))
        self.assertTrue(any("außerhalb Deutschlands" in e for e in errs))

    def test_broken_files(self):
        with self.assertRaises(manual.ImportFileError):
            manual.parse_file(self.write("x.csv", "name,street\nA,B\n"))
        with self.assertRaises(manual.ImportFileError):
            manual.parse_file(self.write("x.json", "{kaputt"))
        with self.assertRaises(manual.ImportFileError):
            manual.parse_file(self.write("x.json", '{"a": 1}'))

    def test_import_dir_skips_template_and_broken(self):
        d = Path(tempfile.mkdtemp())
        (d / "_vorlage.csv").write_text("provider,name\nwellpass,Vorlage\n")
        (d / "kaputt.json").write_text("[")
        (d / "gut.json").write_text(json.dumps([{"provider": "wellpass", "name": "Gut"}]))
        recs, errs = manual.import_dir(d)
        self.assertEqual([r.name for r in recs], ["Gut"])
        self.assertEqual(len(errs), 1)


class SourceParserTests(unittest.TestCase):
    def test_usc_list_fragment(self):
        html = '''<div class="smm-studio-snippet b-studio-item" data-address-id="23555" data-position="1">
          <p class="smm-studio-snippet__title"><a class="smm-studio-snippet__studio-link" href="/de/venues/kniger">Kniger &amp; Co</a></p>
          <div class="disciplines">Crosstraining &middot; Fitness</div>
          <p class="smm-studio-snippet__address">Friedrichshain-Kreuzberg, <span class="smm-studio-snippet__address-street">Alexandrinenstraße 2-3</span></p>
        </div>'''
        out = usc.parse_list_fragment(html)
        self.assertEqual(out["23555"]["name"], "Kniger & Co")
        self.assertEqual(out["23555"]["street"], "Alexandrinenstraße 2-3")
        self.assertEqual(out["23555"]["district"], "Friedrichshain-Kreuzberg")
        self.assertEqual(out["23555"]["categories"], ["Crosstraining", "Fitness"])

    def test_fff_response(self):
        data = {
            "results": [
                {"gym": {"id": "g1", "name": "Gym 1", "street": "Weg 1", "postalCode": "10115", "city": "Berlin", "lat": 52.5, "lng": 13.4, "partnerNetworks": ["wellpass"]}},
                {"gym": {"id": "g2", "name": "Potsdam Gym", "street": "Weg 1", "postalCode": "14467", "city": "Potsdam", "lat": 52.4, "lng": 13.06, "partnerNetworks": ["wellpass"]}},
                {"gym": {"id": "g3", "name": "Andere", "street": "Weg 2", "postalCode": "10115", "city": "Berlin", "lat": 52.5, "lng": 13.4, "partnerNetworks": ["hansefit"]}},
            ],
            "unpriced": [
                {"id": "u1", "name": "Pin", "city": "Berlin", "lat": 52.5, "lng": 13.4,
                 "googleMapsUrl": "https://www.google.com/maps/search/?api=1&query=Pin%2C%20Wilhelmstra%C3%9Fe%2014%2C%2010963%2C%20Berlin"},
            ],
        }
        recs = wellpass_fff.parse_response(data, "2026-11-03T00:00:00Z")
        self.assertEqual(sorted(r.sourceId for r in recs), ["g1", "u1"])
        pin = next(r for r in recs if r.sourceId == "u1")
        self.assertEqual((pin.street, pin.postalCode), ("Wilhelmstraße 14", "10963"))
        with self.assertRaises(Exception):
            wellpass_fff.parse_response({"foo": 1}, "x")


class WellpassOfficialTests(unittest.TestCase):
    GYMS = {"gyms": [
        {"egi": "1", "a": "Yoga Rebellion Berlin Neukölln", "lat": 52.48, "lng": 13.43, "slug": "berlin-yoga-rebellion",
         "sp": "BE", "st": "YOGA_STUDIO", "ac": [{"a": "YOGA"}, {"a": "PILATES", "c": True}], "mt": ["UNLIMITED", "PLUS_1"],
         "tz": "Europe/Berlin", "lc": "de_DE"},
        {"egi": "2", "a": "Lorenz Hill Yoga Bad Tölz", "lat": 47.76, "lng": 11.56, "slug": "badtoelz-lorenz-hill", "sp": "BY",
         "st": "GYM", "ac": [{"a": "FITNESS"}, {"a": "MUSCULATION"}, {"a": "BOULDERING_CLIMBING"}], "mt": ["UNLIMITED"]},
        {"egi": "3", "a": "Fit Wien", "lat": 48.2, "lng": 16.37, "slug": "wien-fit", "sp": "Wien", "st": "GYM", "ac": [], "mt": []},
        {"egi": "4", "a": "Ohne Land Hamburg", "lat": 53.55, "lng": 9.99, "slug": "hamburg-ohne-land", "st": "GYM", "ac": [], "mt": [],
         "tz": "Europe/Berlin", "lc": "de_DE"},
        {"egi": "5", "a": "Ohne Land Salzburg", "lat": 47.8, "lng": 13.04, "slug": "salzburg-x", "st": "GYM", "ac": [], "mt": [],
         "tz": "Europe/Vienna"},
    ]}

    def test_parse(self):
        recs = {r.sourceId: r for r in wellpass_egym.parse_response(self.GYMS, "2026-11-09T00:00:00Z")}
        self.assertEqual(sorted(recs), ["1", "2", "4"])  # Österreich ausgeschlossen
        a = recs["1"]
        self.assertEqual((a.source, a.city, a.region, a.latitude), ("official", "Berlin", "BE", 52.48))
        self.assertEqual(a.categories, ["Yogastudio"])
        self.assertEqual(a.extra["activities"], ["Pilates", "Yoga"])
        self.assertTrue(a.extra["plus1"])
        self.assertEqual(a.providerUrl, "https://de.egym-wellpass.com/de-de/gym-finder/berlin-yoga-rebellion")
        b = recs["2"]
        self.assertEqual((b.city, b.region), ("Bad Tölz", "BY"))
        self.assertEqual(b.extra["activities"], ["Bouldern", "Fitness", "Klettern"])
        self.assertFalse(b.extra["plus1"])
        self.assertEqual(recs["4"].city, "Hamburg")
        with self.assertRaises(Exception):
            wellpass_egym.parse_response({"foo": []}, "x")

    def test_city_from_slug(self):
        f = wellpass_egym.city_from_slug
        self.assertEqual(f("kiel-kieler-naturheilpraxis", "Kieler Naturheilpraxis Kiel"), "Kiel")
        self.assertEqual(f("steinbach-hallenberg-fit", "fit+ Steinbach-Hallenberg"), "Steinbach-Hallenberg")
        self.assertEqual(f("muenchen-pasing-osho", "OSHO Leela München Pasing"), "München")
        self.assertIsNone(f("muenchen-munichpoledance", "Munich Poledance"))

    def test_load_har_and_concatenated_json(self):
        body = json.dumps(self.GYMS)
        har = {"log": {"entries": [
            {"request": {"url": "https://gymfinder.int.api.egym.com/v1/search-filter/wellpass"}, "response": {"content": {"text": "[]"}}},
            {"request": {"url": "https://gymfinder.int.api.egym.com/v1/gym/overview?searchFilter=wellpass&limit=20000"},
             "response": {"content": {"text": body}}, "startedDateTime": "2026-11-09T19:38:53.123Z"},
        ]}}
        with tempfile.TemporaryDirectory() as d:
            h = Path(d) / "x.har"
            h.write_text(json.dumps(har), encoding="utf-8")
            data, stamp = wellpass_egym.load_file(h)
            self.assertEqual(len(data["gyms"]), 5)
            self.assertEqual(stamp, "2026-11-09T19:38:53Z")
            j = Path(d) / "x.json"
            j.write_text(body + body, encoding="utf-8")  # doppelt eingefügt
            self.assertEqual(len(wellpass_egym.load_file(j)[0]["gyms"]), 5)
            empty = Path(d) / "leer.har"
            empty.write_text(json.dumps({"log": {"entries": []}}), encoding="utf-8")
            with self.assertRaises(wellpass_egym.ExportFileError):
                wellpass_egym.load_file(empty)


class OfficialWellpassMergeTests(unittest.TestCase):
    def off(self, sid, name, lat, lng, region="BE", city="Berlin"):
        return SourceRecord("wellpass", "official", sid, name, city=city, region=region, latitude=lat, longitude=lng,
                            coordinatePrecision="source", providerUrl=f"{publish.GYM_FINDER_BASE}{sid}-slug",
                            fetchedAt="2026-11-09T00:00:00Z", extra={"activities": ["Yoga"], "plus1": True})

    def test_link_fair_for_fitness_and_aliases(self):
        o = [self.off("1", "Holmes Place Berlin Schloßstraße", 52.4560, 13.3200), self.off("2", "Move & Meet Berlin Mitte", 52.5321, 13.3967)]
        f = [wp_rec("ffa", "Holmes Place Berlin Schlossstrasse", "Schloßstraße 1", 52.4575, 13.3200, postalCode="12163"),
             wp_rec("ffb", "YOU GLOW Yoga & Womanhood Mitte", "Ackerstraße 23", 52.5321, 13.3964)]
        aliases = link_fair_for_fitness(o, f)
        self.assertEqual(aliases, {"wellpass:fair-for-fitness:ffa": "wellpass:official:1"})  # ~170 m, gleicher Name
        self.assertEqual((o[0].street, o[0].postalCode), ("Schloßstraße 1", "12163"))
        self.assertIsNone(o[1].street)  # nur „Mitte“ gemeinsam → keine Verknüpfung

    def test_old_decision_follows_alias(self):
        u = usc_rec("9", "Holmes Place Schlossstrasse", "Schloßstraße 1", 52.4560, 13.3201)
        o = self.off("1", "Ganz anderer Name", 52.4600, 13.3300)
        d = [{"pair": "urbanSportsClub:official:9~wellpass:fair-for-fitness:ffa", "decision": "confirm", "decidedAt": "x"}]
        out = merge([u, o], d, {"wellpass:fair-for-fitness:ffa": "wellpass:official:1"})
        self.assertEqual(len(out["studios"]), 1)
        self.assertEqual(out["studios"][0]["matchConfidence"], "verified")

    def test_same_name_without_address_merges_up_to_250m(self):
        u = usc_rec("9", "Sommerbad Pankow", "Wolfshagener Str. 91", 52.5800, 13.4000)
        o = self.off("1", "Sommerbad Pankow", 52.5815, 13.4000)  # ~167 m
        out = merge([u, o])
        self.assertEqual(len(out["studios"]), 1)
        self.assertEqual(out["studios"][0]["providerDetails"]["wellpass"]["plus1"], True)

    def test_reverse_geocoding_parse_and_apply(self):
        res = {"lat": "52.46278", "lon": "13.34087", "name": "MO.VE",
               "address": {"road": "Kissinger Straße", "house_number": "9", "postcode": "12157", "borough": "Steglitz-Zehlendorf", "city": "Berlin"}}
        hit = addresses.parse_reverse(res, 52.462781, 13.340874)
        self.assertEqual((hit["street"], hit["postalCode"], hit["district"], hit["place"]), ("Kissinger Straße 9", "12157", "Steglitz-Zehlendorf", "MO.VE"))
        far = addresses.parse_reverse({**res, "lat": "52.4640"}, 52.462781, 13.340874)  # ~135 m daneben
        self.assertEqual(far["street"], "Kissinger Straße")  # ohne Hausnummer
        self.assertIsNone(addresses.parse_reverse({"error": "Unable to geocode"}, 0, 0))
        ds = merge([self.off("1", "MO.VE Berlin", 52.462781, 13.340874), usc_rec("9", "Anderes", "Weg 1", 52.5, 13.4)])
        cache = {"1": {**hit, "lat": 52.462781, "lng": 13.340874}}
        self.assertEqual(addresses.apply_addresses(ds, cache), 1)
        s = next(x for x in ds["studios"] if x["name"] == "MO.VE Berlin")
        self.assertEqual((s["address"]["street"], s["address"]["approximate"]), ("Kissinger Straße 9", True))
        moved = merge([self.off("1", "MO.VE Berlin", 52.47, 13.34)])
        self.assertEqual(addresses.apply_addresses(moved, cache), 0)  # Position geändert → nicht übernehmen

    def test_osm_address_only_counts_when_equal(self):
        u = usc_rec("9", "Yogic Escape Yoga & Wellness Studio", "Kissinger Str. 9", 52.4628, 13.3409)
        w = self.off("1", "Yogic Escape & Friends", 52.4644, 13.3409)  # ~180 m (Pin auf dem Hof)
        self.assertEqual(compare(u, w).level, "review")  # ohne Adresse: zu weit für eine automatische Zuordnung
        w.extra["osmStreet"] = "Kissinger Straße 9"
        r = compare(u, w)
        self.assertEqual((r.address_match, r.level), ("exact", "auto"))
        w.extra["osmStreet"] = "Kissinger Straße 11"  # Nachbarhaus: zählt nicht dagegen
        self.assertEqual(compare(u, w).address_match, "unknown")
        lw = self.off("3", "Padel Lankwitz Berlin", 52.43, 13.35)
        lw.extra["osmStreet"] = "Leonorenstraße 37"
        r = compare(usc_rec("7", "Eisbahn Lankwitz", "Leonorenstraße 37", 52.43, 13.35), lw)
        self.assertEqual((r.address_match, r.level), ("exact", "review"))  # gleiche Anlage, anderes Angebot
        same = self.off("2", "Sommerbad Pankow", 52.5815, 13.4000)
        same.extra["osmStreet"] = "Andere Straße 3"
        self.assertEqual(compare(usc_rec("8", "Sommerbad Pankow", "Wolfshagener Str. 91", 52.58, 13.40), same).level, "auto")

    def test_split_core_and_tiles(self):
        recs = [usc_rec("9", "USC Berlin", "Weg 1", 52.5, 13.4), self.off("1", "Yoga Berlin", 52.51, 13.41),
                self.off("2", "Yoga Bad Tölz", 47.76, 11.56, region="BY", city="Bad Tölz")]
        core, tiles, index = publish.split(merge(recs))
        self.assertEqual(sorted(s["name"] for s in core["studios"]), ["USC Berlin", "Yoga Berlin"])
        self.assertEqual(list(tiles), ["47_11"])
        t = tiles["47_11"][0]
        self.assertEqual((t["i"], t["n"], t["o"], t["r"], t["s"], t["p"]), ("2", "Yoga Bad Tölz", "Bad Tölz", "BY", "2-slug", 1))
        self.assertEqual([index["activities"][i] for i in t["a"]], ["Yoga"])
        self.assertEqual(index["total"], 1)
        self.assertEqual(core["tiles"]["total"], 1)


class ActivityAndOverrideTests(unittest.TestCase):
    def test_usc_activities_from_limits(self):
        from studiomap.activities import usc_activities, usc_plan_included
        det = {"limits": [
            {"size": "S", "included": False, "categories": []},
            {"size": "M", "included": True, "categories": [{"name": "Massage", "perMonth": 0}, {"name": "Yoga", "perMonth": 4}]},
            {"size": "L", "included": True, "categories": [{"name": "Massage", "perMonth": 1}, {"name": "Yoga", "perMonth": None}]},
            {"size": "XL", "included": True, "categories": [{"name": "Massage", "perMonth": 2}, {"name": "Yoga", "perMonth": -1}]},
        ]}
        acts = {a["name"]: a["limits"] for a in usc_activities(["Massage", "Yoga"], det)}
        self.assertEqual(acts["Massage"], {"S": 0, "M": 0, "L": 1, "XL": 2})
        self.assertEqual(acts["Yoga"], {"S": 0, "M": 4, "L": -1, "XL": -1})
        self.assertEqual(usc_plan_included(det, []), {"S": False, "M": True, "L": True, "XL": True})
        self.assertEqual(usc_plan_included(None, ["Premium", "Max"]), {"S": False, "M": False, "L": True, "XL": True})

    def test_confirm_with_field_overrides(self):
        u = usc_rec("1", "Studio Eins", "Torstraße 1", 52.5, 13.4)
        w = wp_rec("a", "Ganz anders GmbH", "Torstr. 1", 52.5001, 13.4001, postalCode="10119", website="https://wp.example")
        fields = {"name": {"custom": "Mein Studio"}, "address": "wellpass", "website": "wellpass"}
        out = merge([u, w], [{"pair": f"{u.key}~{w.key}", "decision": "confirm", "fields": fields}])
        self.assertEqual(len(out["studios"]), 1)
        s = out["studios"][0]
        self.assertEqual(s["name"], "Mein Studio")
        self.assertEqual(s["address"]["postalCode"], "10119")
        self.assertEqual(s["website"], "https://wp.example")
        self.assertEqual(s["providerDetails"]["wellpass"]["address"]["street"], "Torstr. 1")

    def test_group_of_three_including_same_provider(self):
        u1 = usc_rec("1", "Motions Tanzen", "Tempelhofer Ufer 36", 52.4990, 13.3770)
        u2 = usc_rec("2", "Motions Fitness", "Tempelhofer Ufer 36", 52.4990, 13.3770)
        u3 = usc_rec("3", "Booty Therapy", "Tempelhofer Ufer 36", 52.4991, 13.3771)
        w = wp_rec("a", "Motions Gleisdreieck", "Tempelhofer Ufer 36", 52.4990, 13.3770, postalCode="10963")
        keys = [u1.key, u2.key, u3.key, w.key]
        dec = {"pair": "~".join(keys), "keys": keys, "decision": "confirm",
               "fields": {"name": w.key, "address": w.key}}
        out = merge([u1, u2, u3, w], [dec])
        self.assertEqual(len(out["studios"]), 1)
        s = out["studios"][0]
        self.assertEqual(s["name"], "Motions Gleisdreieck")
        self.assertEqual(s["address"]["postalCode"], "10963")
        self.assertEqual(len(s["extraMembers"]), 2)
        # nur USC untereinander
        out2 = merge([u1, u2, w], [{"pair": f"{u1.key}~{u2.key}", "keys": [u1.key, u2.key], "decision": "confirm"}])
        grouped = [x for x in out2["studios"] if x.get("extraMembers")]
        self.assertEqual(len(grouped), 1)
        self.assertFalse(grouped[0]["providers"]["wellpass"])
        # Trennen der Gruppe: wieder einzeln, keine automatische Zusammenführung
        out3 = merge([u1, u2, u3, w], [dec, {"pair": "~".join(keys), "keys": keys, "decision": "reject"}])
        self.assertEqual(len(out3["studios"]), 4)

    def test_usc_details_parser(self):
        from studiomap.sources.usc_details import parse_venue_page
        page = ('<script type="application/ld+json">{"@context":"https://schema.org","@type":"SportsActivityLocation","name":"X",'
                '"address":{"@type":"PostalAddress","postalCode":"12045","streetAddress":"Weichselstraße 53"},"telephone":"+49 1",'
                '"aggregateRating":{"ratingValue":4.9,"reviewCount":81}}</script>'
                '{\\"data-testid\\":\\"plus-badge\\"}'
                '\\"venueLimits\\":{\\"b2c\\":[{\\"id\\":2,\\"name\\":\\"M\\",\\"planName\\":\\"Classic\\",\\"isProvidedByVenue\\":false,'
                '\\"monthlyLimitVenue\\":null,\\"categoryLimits\\":[]}]}')
        info = parse_venue_page(page.replace("\\\\", "\\"))
        self.assertTrue(info["plus"])
        self.assertEqual(info["postalCode"], "12045")
        self.assertEqual(info["rating"], 4.9)
        self.assertEqual(info["limits"][0]["size"], "M")
        self.assertFalse(info["limits"][0]["included"])


class DiffTests(unittest.TestCase):
    def test_diff_and_warning(self):
        old = merge([usc_rec(str(i), f"S{i}", None, 52.5, 13.4) for i in range(30)])
        new = merge([usc_rec(str(i), f"S{i}", None, 52.5, 13.4) for i in range(5, 15)])
        d = diff(old, new)
        self.assertEqual(len(d["removed"]), 20)
        self.assertEqual(len(d["added"]), 0)
        self.assertTrue(plausibility_warnings(d))


if __name__ == "__main__":
    unittest.main()
