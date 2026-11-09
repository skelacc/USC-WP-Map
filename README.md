# Studio Map Berlin

Persönliche, lokal laufende Webanwendung, die Fitness- und Sportstudios in Berlin auf einer interaktiven Karte zeigt und die Partnerstandorte von **Urban Sports Club (USC)** und **EGYM Wellpass** zusammenführt. Auf einen Blick sieht man:

| Kategorie | Marker |
|---|---|
| Nur Urban Sports Club | blauer Kreis |
| Nur Wellpass | oranges Quadrat (auf der Spitze) |
| Beide Anbieter | größerer grüner Kreis mit weißem Ring |

Farbe **und** Form unterscheiden die Kategorien, damit sie auch bei Farbsehschwäche erkennbar sind. Cluster zeigen die Anzahl und als Farbring die Anteile der drei Kategorien.

**Datenstand im Repository:** 3. November 2026 (Standorte), 9. November 2026 (USC-Details). 2.314 Standorte (2.221 USC, 239 Wellpass, davon 146 bei beiden Anbietern). Für alle 2.221 USC-Studios liegen Plus-Kennzeichen (310 Plus-Studios), Besuchs- und Aktivitätslimits je Stufe, PLZ und Bewertung vor. Beispiel: Massage ist mit M in 32 Studios buchbar. Dazu kommen 20 unsichere Zuordnungsvorschläge, die auf eine manuelle Prüfung warten.

---

## Bedienung

**Karte (Verhalten wie in der Urban-Sports-Club-App):**
- **Cluster antippen:** Die Karte zoomt auf die Studios im Cluster. Liegen mehrere Angebote an derselben Adresse, fächern sie sich auf.
- **Pin antippen:** Der Pin wird markiert, unten erscheint eine **Vorschaukarte** mit Name, Anbietern, Bewertung, Entfernung, Adresse und den ersten Aktivitäten (gewählte Aktivitäten fett). **Seitlich wischen** wechselt zu den nächstgelegenen Studios, die Karte folgt.
- **Vorschaukarte antippen:** Die **Details** öffnen sich (mobil als großes Sheet, am Desktop links).
- **Freie Karte antippen:** Die Auswahl schließt sich.
- Am Desktop zeigt das Überfahren eines Pins den Namen.

**Filterleiste** (mobil seitlich wischbar, Einstellungen werden gespeichert):
- **USC-Stufe** (Standard **M / Classic**): Studios und Aktivitäten, die bei USC erst in höheren Stufen enthalten sind, zählen nicht als USC.
- **Aktivität** (z. B. Massage, Mehrfachauswahl): Zeigt nur Studios, in denen die Aktivität **mit deiner Stufe buchbar** ist. Grundlage sind die Kategorie-Limits je Stufe von der USC-Studioseite. Beispiel: Massage in einem Yoga-Studio, das M-Mitglieder nutzen dürfen, ist oft erst ab L buchbar. Bei Wellpass zählt, ob die Aktivität angeboten wird.
- **Plus** (Standard **aus**): USC-Plus-Angebote (nur mit Plus-Check-in) sind ausgeblendet. Eingeschaltet erscheinen sie wieder.
- **Beide / Nur USC / Nur Wellpass**: Auswahl der Anbieter-Kategorien (Doppelklick: nur diese).

**Details:** Bei zusammengeführten Studios gibt es Tabs **Übersicht | USC | Wellpass** mit allen Angaben je Anbieter: Name dort, Adresse, Website, Telefon, Bewertung, Plus-Kennzeichen, **Besuche pro Monat je Stufe (S/M/L/XL)** und **Aktivitäten mit Verfügbarkeit in deiner Stufe** (z. B. „M: 4× / Monat“, „erst ab L“).

**Zusammenführen:**
- **„Ähnlich wie …“-Hinweis:** In den Details direkt „Zusammenführen…“ oder „Verschieden“ wählen.
- **Beliebiges Studio:** „Mit einem Wellpass-/USC-Studio zusammenführen…“ zeigt die Studios des anderen Anbieters in der Nähe (mit Suche).
- **Angaben wählen:** Im Dialog legst du fest, welcher **Name** (USC, Wellpass oder eigener), welche **Adresse**, welche **Position** und welche **Website** gelten.
- **Ändern und trennen:** Zusammengeführte Studios lassen sich über „Angaben ändern“ anpassen oder über „Trennen“ wieder aufteilen. Das geht auch bei automatischen Zuordnungen.
- **Speicherort und Sync zwischen Geräten:** Entscheidungen liegen zunächst im Browser des Geräts. Unter **Einstellungen → Sync** gibt es zwei Wege:
  - **Automatisch über GitHub:** Die App speichert sie im Issue „Studio Map: Zuordnungen (Sync)“ deines Repositorys. **Lesen** klappt ohne Anmeldung, weil das Repository öffentlich ist; jedes Gerät übernimmt beim Start den Stand. **Schreiben** braucht auf dem jeweiligen Gerät einmalig einen Fine-grained Token. Den erstellst du unter GitHub → Settings → Developer settings → Fine-grained tokens, mit Zugriff nur auf dieses Repository und der Berechtigung *Issues: Read and write*. Der Token bleibt im Browser. Zusammengeführt wird je Studio-Paar, bei Widersprüchen gilt die neuere Entscheidung. Das Issue ist öffentlich sichtbar, enthält aber nur Studio-IDs und gewählte Namen.
  - **Per Datei:** Auf einem Gerät exportieren, auf dem anderen importieren (wird zusammengeführt, nichts geht verloren).
  - Unter `npm run dev` landen Entscheidungen zusätzlich in `data/manual/match_decisions.json`.

**Einstellungen & Info** (Zahnrad oben rechts):
- **Info:** wichtige Hinweise zur Aussagekraft der Daten (Wellpass unvollständig, USC-Limits gelten für Privatmitgliedschaften, Plus, Lücken) und Datenstand.
- **Sync:** wie oben beschrieben.
- **Zuordnungen:** offene Vorschläge.
- **Daten:** Quellen, Aktualisierung (nur unter `npm run dev`) und Import eigener Dateien.

**Weitere Funktionen:**
- Fehlertolerante Suche (Tippfehler, fehlende Leerzeichen und Bindestriche, Umlaute).
- Liste sortiert nach Name, Entfernung oder Relevanz.
- Knopf „Zu meinem Standort“.
- Lässt sich als App auf den Startbildschirm legen.

## Voraussetzungen

- Node.js ≥ 20 (getestet mit 22) und npm
- Python ≥ 3.10 (getestet mit 3.13). Es werden **keine Python-Pakete** benötigt, nur die Standardbibliothek.

## Installation und Start

```bash
git clone <repo-url> && cd usc-wp-map
npm install
npm run dev            # http://localhost:5173
```

Die Studiodaten liegen bereits in `public/data/studios.json`, die App ist also sofort nutzbar.

- **Auf dem Smartphone im WLAN:** `npm run dev` zeigt zusätzlich eine Netzwerk-Adresse an (z. B. `http://192.168.x.x:5173`). Browser erlauben die Standortbestimmung nur über HTTPS oder `localhost`. Über die LAN-Adresse sortiert die Liste deshalb nach Entfernung zur Kartenmitte.
- **Statischer Build (ohne Node-Server):** `npm run build` erzeugt `dist/`, das sich mit jedem statischen Webserver ausliefern lässt (z. B. `npx vite preview` oder `python3 -m http.server -d dist`). Im statischen Build gibt es keine Aktualisierung per Knopfdruck. Die App zeigt dann die passenden Kommandozeilenbefehle an.

## Online stellen (GitHub Pages)

Das Repository ist öffentlich, GitHub Pages ist dafür kostenlos. Der Workflow `.github/workflows/pages.yml` baut die App bei jedem Push auf den Standard-Branch und veröffentlicht sie.

1. Auf GitHub im Repository: **Settings → Pages → Build and deployment → Source: „GitHub Actions“** wählen (einmalig).
2. Den Branch mit dem Code zum Standard-Branch machen bzw. in ihn mergen (Settings → General → Default branch, oder Pull Request mergen).
3. Unter **Actions → GitHub Pages** läuft dann der Build (ca. 1 Minute). Danach ist die Seite unter `https://skelacc.github.io/USC-WP-Map/` erreichbar. Neu starten lässt er sich dort auch per „Run workflow“.

Hinweise:
- Die Seite ist **öffentlich**, inklusive der Studiodaten.
- Über HTTPS funktioniert am Handy auch der Standort-Knopf.
- „Daten aktualisieren“ gibt es online nicht (kein Server). Aktualisiert wird lokal (siehe unten), danach committen und pushen, und die Seite baut sich neu.

## Datenquellen – Ergebnis der Recherche

| Quelle | Öffentliche API? | Gewählter Weg | Was zuverlässig verfügbar ist |
|---|---|---|---|
| **Urban Sports Club**<br>urbansportsclub.com/de/venues | Keine dokumentierte API, kein Export | Die öffentliche Standortsuche lädt ihre Daten ohne Login selbst nach: `/de/studios-map?city_id=1&plan_type=N` (JSON mit Name, Koordinaten, Slug) und `/de/venues?…&page=N` (HTML-Liste mit Straße, Bezirk, Sportarten). Diese Abfragen stellt der Import auf die gleiche Weise. | Name, Koordinaten, Straße (ohne PLZ), Bezirk, Sportarten, Link zur Studioseite, **USC-Stufen** (pro Stufe abgefragt) |
| **EGYM Wellpass**<br>de.egym-wellpass.com/de-de/gym-finder | Keine dokumentierte API, kein Export | Der Gym-Finder bettet `locations.egym.com` ein. **Deren robots.txt sperrt alle automatisierten Zugriffe (`Disallow: /`)**, daher gibt es keinen direkten Abruf. Stattdessen wird die **dokumentierte öffentliche API von Fair for Fitness** verwendet (siehe nächste Zeile). | – |
| **USC-Studioseiten**<br>urbansportsclub.com/de/venues/&lt;studio&gt; | Nein; die Seite lädt ihre Daten in einem eigenen Format (Next.js) | `enrich-usc`: eine Anfrage je Studio (Header `RSC: 1`, ~100 KB), 1 Anfrage/s, Zwischenspeicher `data/raw/usc_details.json` | **Plus**-Kennzeichen, **Besuchslimits je Stufe**, **Kategorie-Limits je Stufe** (z. B. Massage: M 0, L 1, XL 2 pro Monat), PLZ, Telefon, Bewertung |
| **EGYM Wellpass – offiziell** (optional) | Nicht dokumentiert: `gymfinder.int.api.egym.com/v1/gym/overview` (vom Gym-Finder genutzt) | Nur mit `--wellpass-official`, gedacht für einen **einmaligen** privaten Abgleich, weil die robots.txt automatisierte Zugriffe untersagt. Eine Anfrage für Berlin, 30 km Radius. | Name, Adresse mit PLZ, Koordinaten, Website, Telefon, Sportarten. Vollständiger als Fair for Fitness. |
| **Fair for Fitness**<br>fair-for-fitness.de | **Ja**: OpenAPI unter `/openapi.json`; robots.txt erlaubt `/api/search` ausdrücklich. Lizenz: „Daten ohne Gewähr; Nutzung mit Attribution + Link erlaubt“ | `GET /api/search?lat=…&lng=…&radius=30&networks=wellpass`, gefiltert auf Berliner PLZ | Name, Koordinaten, Adresse (meist mit PLZ), teils Website und Telefon. Die Wellpass-Zuordnung stammt von Fair for Fitness (**Drittquelle**) und ist überall so gekennzeichnet. |
| **Eigene Dateien** | – | CSV/JSON in `data/manual/import/` oder Upload über die App | was man selbst einträgt (z. B. aus dem offiziellen Wellpass-Gym-Finder abgeschrieben) |

**Umgang mit Zugriffen:** Die USC-Pfade sind laut robots.txt nicht gesperrt (gesperrt sind nur `/membership`, `/reservations` und `/account`). Der Import sendet einen eindeutigen User-Agent und wartet 1,5 s zwischen den Anfragen. Er ist für seltene, manuelle Läufe gedacht (ca. 75 Anfragen, ca. 2 Minuten). Die Nutzungsbedingungen von USC erwähnen automatisierte Abrufe nicht ausdrücklich. Die Anwendung ist nur für den privaten Gebrauch gedacht. Wer das anders bewertet, kann die Quelle `usc` beim Import abwählen.

## Datenimport und Aktualisierung

Der Import ist strikt vom Frontend getrennt (`scripts/studiomap`, nur Python-Standardbibliothek). Das Frontend liest nur `public/data/studios.json`.

```
Quellen ──fetch──▶ data/staging/raw/*.json ─┐
                                            ├─ Zusammenführung ─▶ data/staging/studios.json + report.json
data/raw/*.json (veröffentlichter Stand) ───┘                         │  Prüfen
                                                                      ▼  apply
                           public/data/studios.json  ◀── Sicherung in data/backups/ (letzte 10)
```

**In der App** (unter `npm run dev`): „Daten“ → „Aktualisieren“ → Quellen wählen → „Daten aktualisieren“. Der Fortschritt erscheint live, „Abbrechen“ beendet den Import. Danach folgt ein Bericht mit Zählern vorher/nachher sowie Listen der neuen, entfernten und geänderten Standorte und dem Fehlerprotokoll. Mit **Übernehmen** oder **Verwerfen** entscheidet man über den Stand.

**Per Kommandozeile:**

```bash
npm run data:fetch                         # alle Quellen → Staging + Bericht
npm run data:fetch -- --sources wellpass   # nur einzelne Quellen
npm run data:fetch -- --sources wellpass --wellpass-official   # Wellpass einmalig vom offiziellen Gym-Finder
npm run data:fetch -- --sources manual --geocode   # fehlende Koordinaten per Nominatim ergänzen (als „ungefähr“ markiert)
npm run data:apply                         # geprüften Stand veröffentlichen
npm run data:discard                       # vorbereiteten Stand verwerfen
npm run data:rebuild                       # offline neu zusammenführen (z. B. nach Änderungen am Algorithmus)
npm run data:enrich-usc                    # USC-Studioseiten laden: Plus, Limits je Stufe/Aktivität, PLZ, Bewertung
                                           # (~2.200 Seiten, ca. 1 Std.; Zwischenspeicher, setzt nach Abbruch fort,
                                           #  holt danach nur Einträge älter als 30 Tage) – anschließend data:rebuild
npm run data:validate -- datei.csv         # Importdatei prüfen
```

**Schutzmechanismen:**
- Ein Import überschreibt nie direkt die veröffentlichten Daten. Er landet zuerst im Staging und wird erst nach Bestätigung übernommen.
- Schlägt eine Quelle fehl, wird für sie der bisherige Stand beibehalten und der Fehler im Bericht vermerkt.
- Sinkt die Zahl der Standorte eines Anbieters um mehr als 30 %, blockiert `apply` (das deutet eher auf eine geänderte Quelle als auf Schließungen hin). Übernehmen geht dann nur ausdrücklich mit `--force` bzw. „Trotz Warnungen übernehmen“.
- Alle Dateien werden atomar geschrieben, ein Abbruch hinterlässt also keine halben Dateien. Vor jeder Veröffentlichung wird eine Sicherung angelegt.

### Eigene CSV-/JSON-Dateien

Eine Vorlage liegt in `data/manual/import/_vorlage.csv` (Dateien mit `_` am Anfang werden ignoriert) und ist auch in der App unter „Daten“ → „Datei“ abrufbar.

| Spalte | Pflicht | Inhalt |
|---|---|---|
| `provider` | ja | `urbanSportsClub`/`usc` oder `wellpass`/`wp` |
| `name` | ja | Studioname |
| `street`, `postalCode`, `city`, `district` | | Adresse |
| `latitude`, `longitude` | | Dezimalgrad. Wenn sie fehlen, erscheint das Studio nur in der Liste (oder `--geocode` ermittelt eine als „ungefähr“ markierte Position). |
| `website`, `sourceId`, `categories` (mit `\|` getrennt), `sourceNote` | | optional |

Trennzeichen `,` oder `;`, Dezimalkomma wird akzeptiert. Ungültige Zeilen (unbekannter Anbieter, fehlender Name, Koordinaten außerhalb Berlins, unlesbare Zahlen) werden mit Zeilennummer gemeldet und übersprungen. Fehlen Pflichtspalten oder ist das JSON kaputt, wird die ganze Datei abgelehnt.

## Zusammenführung und Dublettenerkennung

`scripts/studiomap/merge.py` vergleicht jeden Wellpass-Standort mit USC-Standorten in der Nähe (und mit gleicher Adresse):

1. **Adressen normalisieren**: Umlaute, „Str./Straße“, Hausnummernbereiche wie „45/46“ oder „17 a-d“ und Zusätze wie „Aufgang 2“ werden vereinheitlicht.
2. **Exakter Adressvergleich**: Straße und erste Hausnummer, dazu die PLZ, wenn beide Quellen eine haben.
3. **Namen normalisieren**: Kleinschreibung, Rechtsformen, „Berlin“, Satzzeichen.
4. **Namensähnlichkeit**: Zeichenfolgen-Ähnlichkeit sowie Überdeckung der *unterscheidungskräftigen* Namensteile. Gattungswörter wie „Yoga“, „Fitness“ oder „Pilates“ und Ortsangaben zählen dabei nicht.
5. **Geografische Distanz** der Koordinaten.
6. **Einstufung:**
   - **automatisch zusammengeführt** (`matchConfidence: "high"`): gleiche Adresse und ähnlicher Name, oder identische Namenskerne bei höchstens 120 m Abstand ohne widersprüchliche Adresse.
   - **Prüfvorschlag** (`matchCandidates`): plausibel, aber unsicher. Diese Standorte **bleiben getrennt**, bis man sie bestätigt.
   - **kein Treffer**

**Schutz für Filialketten:** Eine abweichende Straße oder Hausnummer verhindert eine automatische Zuordnung. Widersprüchliche Ortsangaben im Namen („… Mitte“ vs. „… Spandau“) verhindern jede Zuordnung. Ab 120 m Abstand wird nichts automatisch zugeordnet, ab 250 m wird nicht einmal mehr verglichen. Jeder Datensatz wird höchstens einmal zugeordnet (1:1).

**Nachvollziehbarkeit:** Jedes zusammengeführte Studio enthält `match.reasons`, z. B. „Adresse identisch (Torellstr. 7 ≙ Torellstraße 7)“, „Namensähnlichkeit 0.95“ oder „Abstand 7 m“. Die App zeigt diese Gründe in der Detailansicht an.

**Manuelle Entscheidungen:** In der App unter „Daten“ → „Zuordnungen“ oder in der Detailansicht („Gleiches Studio“ / „Verschiedene Studios“, bzw. „Zuordnung lösen“ bei automatisch zusammengeführten Studios). Per Kommandozeile geht es mit `npm run data:decide -- "<Paar-ID>" confirm|reject|reset`. Die Entscheidungen liegen in `data/manual/match_decisions.json`, haben Vorrang vor dem Algorithmus und bleiben über spätere Importe erhalten. Bestätigte Paare erhalten `matchConfidence: "verified"`.

## Datenmodell

`public/data/studios.json`:

```jsonc
{
  "schemaVersion": 1,
  "generatedAt": "2026-11-03T10:39:14Z",
  "sources": [ { "id": "usc", "label": "…", "url": "…", "kind": "official", "fetchedAt": "…", "count": 2221 } ],
  "studios": [
    {
      "id": "usc-23555",                    // stabil: aus der Quell-ID abgeleitet
      "name": "HYROX Performance Center Kreuzberg by Kniger",
      "address": { "street": "Alexandrinenstraße 2-3", "postalCode": null, "city": "Berlin", "district": "Friedrichshain-Kreuzberg" },
      "coordinates": { "latitude": 52.4990962, "longitude": 13.4006585, "precision": "source", "from": "urbanSportsClub" },  // oder null
      "providers": { "urbanSportsClub": true, "wellpass": false },
      "providerDetails": {                  // je Anbieter: Herkunft, Name dort, Link, USC-Stufen, Abrufzeit
        "urbanSportsClub": { "sourceId": "23555", "source": "official", "name": "…", "url": "…", "plans": ["Classic", "Premium", "Max"], "categories": ["Fitness"], "fetchedAt": "…" }
      },
      "website": null, "phone": null, "categories": ["Crosstraining", "Fitness", "Hyrox"],
      "source": { "urbanSportsClub": "official", "wellpass": null },
      "lastVerified": "2026-11-03",
      "matchConfidence": "single",          // single | high | verified
      "match": null                          // bei Zusammenführung: { method, score, reasons[], distanceM }
    }
  ],
  "matchCandidates": [ { "id": "<usc-key>~<wellpass-key>", "score": 0.5, "reasons": ["…"], "urbanSportsClub": {…}, "wellpass": {…} } ],
  "rejectedPairs": []
}
```

- Ein Studio wird **einmal** gespeichert, auch wenn es bei beiden Anbietern gelistet ist. Die anbieterspezifischen Angaben stehen unter `providerDetails`.
- Fehlende Angaben sind `null`. Fehlende Koordinaten werden **nie geschätzt**. Per Geokodierung ermittelte Positionen tragen `precision: "geocoded"` und erscheinen gestrichelt bzw. mit Hinweis.
- **Erweiterungen** (Öffnungszeiten, Kurse, Bilder, Ausstattung, Favoriten, Notizen …) lassen sich als zusätzliche optionale Felder ergänzen, ohne Bestehendes zu ändern. Persönliche Daten wie Favoriten gehören in den LocalStorage (`src/lib/storage.ts`), nicht in die Studiotabelle.

## Projektstruktur

```
scripts/studiomap/        Datenimport & -aufbereitung (Python, ohne Abhängigkeiten)
  sources/usc.py            Quelle Urban Sports Club
  sources/wellpass_fff.py   Quelle Wellpass via Fair for Fitness
  sources/manual.py         CSV/JSON-Import
  normalize.py merge.py     Normalisierung, Dublettenerkennung
  diff.py pipeline.py       Bericht, Ablauf (fetch/apply/discard/rebuild/decide/validate)
scripts/tests/            Python-Tests
server/importApi.ts       lokale Import-API (nur im Vite-Dev-Server)
src/lib/                  Daten laden, Filter, Suche, Geo, Storage, API-Client (+ Tests)
src/components/map/       Karte, Marker, Clustering
src/components/filters/   Anbieterfilter, Suchfeld
src/components/list/      Studioliste
src/components/detail/    Detailansicht
src/components/data/      Datenbereich: Import, Zuordnungen, Datei-Upload
src/components/ui/        shadcn/ui-Komponenten
data/raw/                 normalisierte Quelldaten des veröffentlichten Stands
data/manual/              eigene Importdateien, Match-Entscheidungen
public/data/studios.json  veröffentlichter Datenbestand (vom Frontend gelesen)
```

## Tests

```bash
npm test          # Frontend: Filter, Suche, Sortierung (Vitest)
npm run test:py   # Python: Normalisierung, Zusammenführung, Filialketten, Entscheidungen,
                  # fehlende Koordinaten, fehlerhafte Importdateien, Quell-Parser, Diff
npm run build     # Typprüfung + Build
```

Außerdem im Browser geprüft (Playwright, Desktop und Pixel 7): Marker, Cluster, Filter, Suche, Sprung aus der Liste, Detailansicht, mobiles Bottom-Sheet, Upload einer fehlerhaften und einer gültigen Datei, Abbruch eines laufenden Imports (Datenbestand unverändert) sowie Übernehmen mit Sicherung.

## Bekannte Einschränkungen

- **Wellpass-Daten stammen standardmäßig aus einer Drittquelle.** Fair for Fitness erfasst nur einen Teil der Wellpass-Studios (Berlin: 239). Der Grund ist, dass Fair for Fitness ein Preisvergleich ist und Netzwerke nur bei bereits erfassten Studios zuordnet. Vollständiger ist der einmalige Abgleich mit `--wellpass-official`.
- **USC hat keine dokumentierte API.** Ändert USC seine Website, schlägt der Import mit klarer Meldung fehl, und der bisherige Stand bleibt erhalten. Dann muss `sources/usc.py` angepasst werden.
- Postleitzahlen stammen bei USC von den Studioseiten (bei 81 Standorten fehlen sie noch). Bei rund 25 Standorten fehlt die Straße, bei 5 fehlen Koordinaten (diese stehen nur in der Liste).
- Die Aktivitätslimits je Stufe gelten laut USC für Privatmitgliedschaften (B2C). Firmenmitgliedschaften können abweichen.
- USC listet viele **Kurse oder Anbieter innerhalb eines Hauses** als eigene „Venues“, z. B. „… @ Sarasvati“. Sie bleiben getrennte Einträge, und pro Wellpass-Studio wird höchstens ein USC-Eintrag zugeordnet.
- Die Zuordnung ist bewusst **konservativ**. Einige echte Dubletten erscheinen zunächst als Prüfvorschlag statt automatisch zusammengeführt.
- Die USC-Stufen werden angezeigt, aber noch nicht gefiltert (Phase 4).
- Die Kartenkacheln kommen von tile.openstreetmap.org (Internetverbindung nötig; [Nutzungsrichtlinie](https://operations.osmfoundation.org/policies/tiles/) für geringe private Nutzung beachten).

## Spätere Automatisierung

Die Architektur ist dafür vorbereitet: Jeder Schritt ist ein eigener, nicht-interaktiver CLI-Befehl mit maschinenlesbarer Ausgabe (JSON-Zeilen) und sinnvollen Exit-Codes (0 = ok, 2 = Quelle fehlgeschlagen, 3 = Übernahme wegen Warnungen blockiert, 130 = abgebrochen).

- **Lokal per cron** (z. B. monatlich): `cd scripts && python3 -m studiomap fetch && python3 -m studiomap apply`. `apply` verweigert auffällige Stände automatisch.
- **GitHub Actions:** Eine fertige, *inaktive* Vorlage liegt in `docs/monthly-import.example.yml`. Sie importiert monatlich und schlägt die Änderungen als Pull Request vor, statt sie direkt zu übernehmen.
- Neue Quellen lassen sich als weiteres Modul in `scripts/studiomap/sources/` (Funktion `fetch(...) -> list[SourceRecord]`) mit einem Eintrag in `pipeline.SOURCES` ergänzen.

## Lizenz und Quellenangaben

Privates Projekt. Kartendaten © OpenStreetMap-Mitwirkende. Wellpass-Zuordnungen: Quelle [Fair for Fitness](https://fair-for-fitness.de), ohne Gewähr. Studiodaten von Urban Sports Club: [urbansportsclub.com](https://urbansportsclub.com/de/venues). Alle Angaben ohne Gewähr. Vor einem Besuch bitte beim Anbieter prüfen.
