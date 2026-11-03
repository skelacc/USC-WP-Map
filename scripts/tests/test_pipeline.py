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
        p = self.write("x.csv", "provider,name,latitude,longitude\nfoo,Studio,,\nwellpass,,,\nwellpass,X,abc,13\nwellpass,Y,48.1,11.5\nwellpass,Z,52.5,\nwellpass,OK,,\n")
        recs, errs = manual.parse_file(p)
        self.assertEqual([r.name for r in recs], ["OK"])
        self.assertEqual(len(errs), 5)
        self.assertTrue(any("Zeile 2" in e and "Anbieter" in e for e in errs))
        self.assertTrue(any("außerhalb Berlins" in e for e in errs))

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
    def test_parse(self):
        data = {"gyms": [
            {"gymId": 1, "alias": "Gym A", "qualitrainGym": True, "website": "https://a.de",
             "address": {"street": "Torstraße", "streetNumber": "1", "zipCode": "10119", "city": "Berlin", "coordinates": [13.40, 52.53]},
             "options": {"activities": [{"activity": "YOGA_STUDIO"}]}},
            {"gymId": 2, "alias": "Potsdam", "qualitrainGym": True, "address": {"zipCode": "14467", "city": "Potsdam", "coordinates": [13.06, 52.40]}},
            {"gymId": 3, "alias": "Nur Frankreich", "qualitrainGym": False, "address": {"zipCode": "10115", "city": "Berlin"}},
            {"gymId": 4, "alias": "Ohne Koordinaten", "address": {"street": "Weg", "streetNumber": "2", "zipCode": "10115", "city": "Berlin"}},
        ]}
        recs = wellpass_egym.parse_response(data, "2026-11-03T00:00:00Z")
        self.assertEqual(sorted(r.name for r in recs), ["Gym A", "Ohne Koordinaten"])
        a = next(r for r in recs if r.name == "Gym A")
        self.assertEqual((a.street, a.postalCode, a.latitude, a.longitude), ("Torstraße 1", "10119", 52.53, 13.40))
        self.assertEqual(a.source, "official")
        self.assertEqual(a.categories, ["Yoga Studio"])
        with self.assertRaises(Exception):
            wellpass_egym.parse_response({"foo": []}, "x")


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
