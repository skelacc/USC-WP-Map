# Entwicklungsvorgaben – Studio Map Berlin

Verbindliche Regeln für alle Änderungen an diesem Projekt (Mensch und KI).

## Bedienung (UI/UX)

- **Mobile first.** Hauptnutzung am Android-Smartphone (Chrome, Firefox). Jede Änderung im Handy-Format prüfen.
- **Zerstörerische Aktionen sind immer mindestens zweistufig.** Dazu zählen Löschen, Trennen, Verwerfen und Token entfernen. Nichts darf durch einen einzelnen versehentlichen Tipp passieren.
  - Standard: `ConfirmButton` (`src/components/ui/confirm-button.tsx`). Erster Tipp klappt auf, z. B. Mülleimer → „🗑 Löschen“ + Abbrechen; erst der zweite Tipp führt aus.
  - Bei Mehrfachauswahl: Symbol im Kopf antippen → Elemente auswählen → bestätigen (Beispiel: Notizen).
- **Keine redundanten Bedienelemente oder Texte.** Eine Aktion steht einmal an einer Stelle, nicht an jedem Eintrag. Wiederkehrende Aktionen bekommen ein eindeutiges Symbol statt Text.
- **Reine Symbol-Schaltflächen** haben immer `aria-label` und `title`.
- **Dialoge öffnen keine Bildschirmtastatur.** In `DialogContent` gehört `onOpenAutoFocus={(e) => e.preventDefault()}`, das Eingabefeld wird erst durch Antippen fokussiert.
- **Bottom-Sheets** lassen oben ein Stück Karte frei (max. ~80 dvh) und schließen sich durch Herunterwischen (`SwipeDownSheet`). Seitliches Wischen wechselt Tabs.
- **Lesbarkeit:** Inhalte in Karten gliedern (weiße Karte `bg-background` auf leicht grauem Grund `bg-muted/50`).
- **Zustand merken**, wo es den Ablauf erleichtert: Filter, offener Tab, Scrollposition. Nach einer Unteraktion (z. B. Zusammenführen aus den Einstellungen) zurück zum Ausgangspunkt.
- **UI-Texte auf Deutsch**, knapp und verständlich.

## Daten

- **Keine erfundenen Studios, Adressen oder Anbieterzuordnungen.** Unsichere Angaben werden gekennzeichnet (z. B. `precision: "geocoded"`).
- **Abrufe höflich:** höchstens 1 Anfrage pro Sekunde, eindeutiger User-Agent, robots.txt beachten.
- **Abgerufene Daten vollständig speichern** (`data/raw/…`), damit spätere Auswertungen ohne erneuten Abruf möglich sind. Erneut abgerufen wird nur, was fehlt oder veraltet ist. Beispiel: `enrich-usc` lädt nur Einträge nach, die fehlen, älter als 90 Tage sind oder in einem älteren Format vorliegen (`SCHEMA`).
- **Datenimport und Frontend bleiben getrennt.** Das Frontend liest nur `public/data/…`.
- **Nutzerdaten** (Zuordnungen, Bewertungen, Notizen, Korrekturen) werden über Eintragsschlüssel `provider:source:id` gespeichert, nie über Studio-IDs. So überstehen sie Zusammenführungen und Neuaufbauten.

## Arbeitsweise

- **Vor jedem Push:**
  - `npx tsc -b`, `npm test` und `npm run test:py` müssen grün sein.
  - Neue Logik bekommt Tests.
- **Vorher integrieren:** Auf dem Branch wird parallel gearbeitet. Vor dem Push `git fetch` und fremde Änderungen integrieren (rebase/cherry-pick), **nie** force-pushen oder fremde Commits überschreiben.
- **Browser-Check** für sichtbare Änderungen mit Playwright im Handy-Format (z. B. `devices['Pixel 7']`).
