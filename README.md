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
- **Echte Origins (OGN) Datenbank & SVG-Fallback:**
  - Automatische Bildverknüpfung über öffentliche CDNs (`OGN-xxx.webp`).
  - Ausfallsicherer **SVG-Karten-Generator** für Offline-Nutzung.
  - Eigene Bild-URLs oder Bilddatei-Uploads direkt im Bearbeiten-Dialog.
- **Live-Statistiken:**
  - Gesamtkarten (Kopien), Normal/Foil-Aufteilung, prozentualer Sammlungs-Fortschritt und Anzahl vollständiger Playsets.
- **Filter & Sortierung:**
  - Nach Domain (*Fury* 🔴, *Calm* 🟢, *Mind* 🔵, *Body* 🟡, *Chaos* 🟣, *Order* 🟠, *Neutral* ⚪).
  - Nach Besitzstatus (*Alle*, *Im Besitz*, *Nur Foil ✨*, *Fehlend*, *Playset offen < 3*, *Playset voll 3+*).
  - Nach Seltenheit (*Common*, *Uncommon*, *Rare*, *Epic*, *Showcase / Alt-Art*), Set und Kartentyp.
- **Datensicherheit & Export:**
  - Automatische Speicherung im Browser via `localStorage`.
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
