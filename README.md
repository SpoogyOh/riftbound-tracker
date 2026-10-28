# Riftbound TCG – Karten- & Foil-Tracker 🃏✨

Ein moderner, intuitiver Tracker für deine **Riftbound TCG** Kartensammlung (League of Legends Trading Card Game).

Ermöglicht das unkomplizierte Zählen von **Normal-** und **Foil-Kopien**, Überwachen von Playsets (3×) und Durchsuchen deiner Sammlung im digitalen Sammelalbum-Stil (Binder).

![Riftbound Tracker Preview](https://img.shields.io/badge/Riftbound-TCG_Tracker-indigo?style=for-the-badge)

---

## ✨ Features

- **Getrennte Zähler für Normal & Foil ✨:**
  - Jede Karte verfügt über eigenständige `+` / `−` Buttons sowie direkte Zahleneingabe für Standard- und Foil-Kopien.
  - Dynamischer **Holo-Foil Glanzeffekt** auf Kartenbildern, sobald mindestens eine Foil-Kopie im Besitz ist.
- **Digitales Sammelalbum (Binder Look):**
  - **Karten-Grid:** Schicke 5:7 TCG-Kartenansicht mit Nummer, Domain-Badges und Foil-Status.
  - **Sammelalbum-Effekt:** Noch nicht besessene Karten (0 Kopien) werden dezent abgedunkelt dargestellt und erstrahlen in voller Farbe, sobald die erste Kopie eingetragen wird.
  - **Listen-Ansicht:** Kompakte Tabelle mit Mini-Thumbnails für ultraschnelles Eintragen großer Mengen.
  - **Lightbox / Großansicht:** Klick auf ein Kartenbild öffnet eine detailreiche Großansicht mit direkten `+` / `−` Zählern.
- **⚡ Schnelleingabe (Booster / Stapel scannen):**
  - Tippe einfach Name oder Sammlernummer (z. B. `OGN-001` oder `Jinx`) ein, wähle Normal/Foil und buche Karten in Sekundenschnelle ein.
- **Englischer OpenRift-Katalog & SVG-Fallback:**
  - Bildreferenzen aus OpenRift, einschließlich Sondervarianten.
  - Ausfallsicherer **SVG-Karten-Generator** für Offline-Nutzung.
  - Eigene Bild-URLs oder Bilddatei-Uploads direkt im Bearbeiten-Dialog.
- **Live-Statistiken:**
  - Gesamtkarten (Kopien), Normal/Foil-Aufteilung, prozentualer Sammlungs-Fortschritt und Anzahl vollständiger Playsets.
- **Filter & Sortierung:**
  - Nach Domain (*Fury* 🔴, *Calm* 🟢, *Mind* 🔵, *Body* 🟡, *Chaos* 🟣, *Order* 🟠, *Neutral* ⚪).
  - Nach Besitzstatus (*Alle*, *Im Besitz*, *Nur Foil ✨*, *Fehlend*, *Playset offen < 3*, *Playset voll 3+*).
  - Nach Seltenheit (*Common*, *Uncommon*, *Rare*, *Epic*, *Showcase / Alt-Art*), Set und Kartentyp.
- **Datensicherheit & Export:**
  - Automatische Speicherung im Browser via IndexedDB, mit `localStorage` als Fallback.
  - **CSV-Export** (kompatibel mit Excel, Google Sheets, LibreOffice).
  - **JSON-Backup** zum Sichern und Wiederherstellen auf jedem Gerät.

---

## 🚀 Installation & Start

Da der Tracker rein clientseitig (HTML5, Tailwind CSS, Vanilla JS) entwickelt ist, ist keine komplexe Server-Installation erforderlich:

1. **Repository klonen:**
   ```bash
   git clone https://github.com/SpoogyOh/riftbound-tracker.git
   cd riftbound-tracker
   ```

2. **Direkt im Browser öffnen:**
   Öffne einfach die Datei `index.html` in deinem favorisierten Webbrowser (Chrome, Safari, Firefox, Edge).

---

## 📁 Projektstruktur

```
riftbound-tracker/
├── index.html              # Hauptseite & Benutzeroberfläche (Standalone-Browser)
├── cards.js                # Vorkonfigurierter Riftbound-Katalog (Origins OGN)
├── app.js                  # Anwendungslogik, State Management, Filter & Export
├── riftbound_tracker.html  # All-in-One Version (für Antigravity / Inline-Vorschau)
├── chat-verlauf.md         # Dokumentation der Projektentwicklung
└── README.md               # Projektdokumentation
```

---

## 📄 Lizenz

MIT License – Frei zur persönlichen und Community-Nutzung.
Riftbound TCG und zugehörige Artworks sind Marken von Riot Games.

## OpenRift-Katalog und Speicherung

Der mitgelieferte englische Katalog wird aus [OpenRift](https://openrift.app/developers) erzeugt. Die Karten verlinken auf ihre OpenRift-Seiten. Kartenbilder werden bei Bedarf geladen, nicht als Bildarchiv mitgeliefert. Stand und Variantenanzahl erscheinen direkt in der App.

Normal-/Foil-Zwillinge teilen eine Zeile mit zwei Zählern. Alt-Art, signierte Ausgaben, Promostempel, unterschiedliche Größen und Sonderfinishes bleiben getrennt. Bei mehrdeutigen Druckeinträgen wird nicht automatisch zusammengefasst. Metallausgaben verwenden den Zähler „Normal / Sonderfinish“ und zeigen ihre Ausführung an. Nicht verfügbare Finishes sind gesperrt. Die Zahlen zählen Katalogvarianten, nicht nur unterschiedliche Spielkarten. Sets ohne bekannten englischen Erscheinungstermin sind nicht automatisch als unveröffentlicht eingestuft.

### Katalog aktualisieren (Node.js 22+)

```bash
npm ci
npm run catalog:update
npm run standalone:build
npm test
```

Der Import benötigt keinen API-Key und verwendet einen identifizierenden User-Agent mit Projekt-URL. Die Rohantwort und der ETag werden lokal unter `.cache/` aufbewahrt. Innerhalb einer Stunde erfolgt kein erneuter Abruf; danach wird `If-None-Match` verwendet. HTTP-Fehler ersetzen den vorhandenen Katalog nicht; es gibt keine automatischen Wiederholungsschleifen. Für eine vorhandene Rohantwort: `node scripts/import-openrift.mjs --input /pfad/catalog.json`.

`cards.js` enthält normalisierte Varianten einschließlich der zugrunde liegenden OpenRift-Druckeinträge, Regeltexte, Werte, Keywords, Tags und Bildreferenzen. `collection.js` übernimmt Zuordnung und Backups; `storage.js` speichert den persönlichen Bestand in IndexedDB. Falls IndexedDB nicht verfügbar ist, dient `localStorage` als gekennzeichneter Fallback. Speicherfehler werden sichtbar gemeldet. Die bestehende Oberfläche läuft weiterhin über `index.html`; die Einzeldatei `riftbound_tracker.html` wird aus denselben Quelldateien generiert.

### Bestehende Sammlung und Backups

Vor dem Wechsel bitte ein JSON-Backup herunterladen. Alte V1-/V2-Speicherschlüssel bleiben erhalten. Einträge werden nur bei eindeutiger Übereinstimmung von Nummer und Kartenname der normalen Standardvariante zugeordnet. Abweichende Namen, unklare Varianten oder inzwischen entfernte Karten bleiben mit „Zuordnung prüfen“ erhalten; ihre Zähler werden nicht verworfen. Neue Katalogeinträge erscheinen auch bei bestehenden Sammlungen.

Neue JSON-Backups verwenden `schemaVersion: 3` und enthalten Bestände und eigene Einträge separat vom Katalog. Alte JSON-Listen können weiterhin importiert werden. Der Import validiert die Daten vor dem Ersetzen. CSV enthält Varianten-ID, Variantenbezeichnung und Finishes. Browserdaten sind an das Browserprofil und den Ursprung gebunden; beim Wechsel von `file://` zu einem lokalen Server oder einer anderen Domain bitte per JSON exportieren/importieren. IndexedDB synchronisiert nicht zwischen Geräten.

### Quellenhinweis

OpenRift ist eine Community-Quelle und kann keine Rechte an Riot-Inhalten vergeben. Es gelten die [Riftbound-Richtlinien von Riot](https://developer.riotgames.com/policies/riftbound). Die technische Integration ist keine Zusicherung einer Riot-Freigabe.
