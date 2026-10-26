# 3D Winter Sports Race Tracks (FIS Ski Alpin & IBU Biathlon)

[![GitHub Pages](https://img.shields.io/badge/Live%20Demo-GitHub%20Pages-brightgreen?logo=github)](https://RLKO31.github.io/winter-sports-3d-tracks/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Three.js](https://img.shields.io/badge/3D-Three.js-000000?logo=three.js)](https://threejs.org/)
[![Open Data Bayern](https://img.shields.io/badge/Data-Open%20Data%20Bayern%20(CC%20BY%204.0)-blue)](https://geodatenonline.bayern.de/)

[English](#english-version) | [Deutsch](#deutsche-version)

---

## English Version

An interactive 3D web application and geospatial dashboard visualizing world-renowned winter sports competition tracks in their real alpine topographic landscape. Developed as a proof of concept for the upcoming **2026/2027 FIS Alpine Ski and IBU Biathlon World Cup** seasons.

The application allows users to explore the tracks in full 3D, inspect elevation profiles and slope gradients, fly through key sections, and switch between photorealistic winter snowpack, hypsometric relief tints, and studio clay modes.

**Live Website:** [https://RLKO31.github.io/winter-sports-3d-tracks/](https://RLKO31.github.io/winter-sports-3d-tracks/)

---

### Featured Venues in Proof of Concept

1. **Alpine Skiing: Garmisch-Partenkirchen - Kandahar (Men's Downhill)**
   - Start elevation: 1,690 m (Kreuzjoch) | Finish: 770 m (Kreuzeckbahn valley station)
   - Track length: 3,330 m | Vertical drop: 920 m
   - Highlight: **Freier Fall** - steepest pitch in the FIS World Cup circuit with a 92% slope gradient.
   - Key passages: Startschuss, Tröglhang, Olympia-Kurve, Panorama-Sprung, Bödele, Freier Fall, Hölle, Tauberschuss.

2. **Biathlon: Ruhpolding - Chiemgau Arena (3.3 km World Cup Loop)**
   - Elevation: 710 m - 755 m (115 m total climb)
   - Track length: 3,300 m competition loop plus 150 m penalty loop
   - Highlight: 30-lane smallbore shooting range, Fischer S curve combination, and Sonnentribüne spectator stadium.

---

### Core Application Features

- **Interactive 3D Orbit Navigation:** Full 360-degree rotation, pan, pitch, and zoom using Three.js and OrbitControls.
- **Topographic Terrain Engine:** Real 1-meter resolution Digital Elevation Model (DGM1) from the Bavarian Vermessungsverwaltung downsampled to a lightweight 60 FPS WebGL grid.
- **Visual Styles:**
  - *Winter Snow & Relief:* Alpine winter color gradient from lower valleys up to high-alpine snowpack.
  - *Hypsometric Elevation Tints:* Color-coded elevation contours.
  - *Studio Clay:* Clean monochrome rendering for slope and terrain structure analysis.
- **Dynamic Race Track Geometry:** Continuous 3D ribbon/tube geometry draped over the terrain, accompanied by station beacons and an animated skier/runner pulse marker.
- **Synchronized Elevation Profile HUD:** Bottom-docked profile graph displaying current altitude and slope position with click-to-focus camera interpolation.
- **Camera Presets:** Overview Panorama, Start Zone, Finish Arena, Key Milestone Close-up, and Nadir Top-down view.

---

### Geospatial Data Credits & Open Data Attribution

All underlying elevation and geographic data are provided under open access terms:

| Dataset | Provider / Source | License & Terms |
|---|---|---|
| **DGM1 (Digital Elevation Model, 1m)** | Bayerische Vermessungsverwaltung ([LDBV](https://geodatenonline.bayern.de/)) | [Creative Commons Attribution 4.0 International (CC BY 4.0)](https://creativecommons.org/licenses/by/4.0/) |
| **Track Coordinates & Infrastructure** | [OpenStreetMap](https://www.openstreetmap.org/copyright) & FIS/IBU Course Profiles | Open Database License (ODbL) / Public Homologation Data. |
| **3D Rendering Library** | [Three.js](https://threejs.org/) | MIT License. |

> **Official Attribution Notice:**  
> *"Datenquelle: Bayerische Vermessungsverwaltung – www.geodaten.bayern.de"*

---

### Local Execution

```bash
# Clone the repository
git clone https://github.com/RLKO31/winter-sports-3d-tracks.git
cd winter-sports-3d-tracks

# Serve locally (requires local HTTP server due to ES Modules)
npx serve .
# or with Python: python -m http.server 8080
```

---

### Legal Notice (§ 5 DDG) & Contact

- **Developer / Operator:** Ralf Oppel
- **Degree Program:** Geodata Management & Surveying
- **Academic Institution:** Technische Hochschule Würzburg-Schweinfurt (THWS)
- **Contact:** [ralf.oppel@study.thws.de](mailto:ralf.oppel@study.thws.de)
- **License:** [MIT License](LICENSE)

---

## Deutsche Version

Eine interaktive 3D-Webanwendung und ein Geodaten-Dashboard zur Visualisierung weltbekannter Wintersport-Rennstrecken in ihrer realen alpinen Topografie. Entwickelt als Proof of Concept für die bevorstehende Weltcup-Saison 2026/2027 in **Ski Alpin (FIS)** und **Biathlon (IBU)**.

Die Anwendung ermöglicht die freie 3D-Erkundung der Hänge, das Nachvollziehen von Schlüsselpassagen und Höhenprofilen sowie den Wechsel zwischen realistischer Winter-Schneeschattierung, Höhenschichten und Skulptur-Shading.

**Live-Webseite:** [https://RLKO31.github.io/winter-sports-3d-tracks/](https://RLKO31.github.io/winter-sports-3d-tracks/)

---

### Enthaltene Strecken im Proof of Concept

1. **Ski Alpin: Garmisch-Partenkirchen - Kandahar (Herren-Abfahrt)**
   - Starthöhe: 1.690 m (Kreuzjoch) | Zielhöhe: 770 m (Talstation Kreuzeckbahn)
   - Streckenlänge: 3.330 m | Höhendifferenz: 920 m
   - Highlight: **Freier Fall** - steilster Streckenabschnitt im gesamten alpinen Ski-Weltcup mit 92 % Gefälle.
   - Schlüsselstellen: Startschuss, Tröglhang, Olympia-Kurve, Panorama-Sprung, Bödele, Freier Fall, Hölle, Tauberschuss ins Ziel.

2. **Biathlon: Ruhpolding - Chiemgau Arena (3,3 km Weltcup-Loipe)**
   - Meereshöhe: 710 m - 755 m (115 m Gesamtanstieg)
   - Streckenlänge: 3.300 m Wettkampfrunde plus 150 m Strafrunde
   - Highlight: 30-Bahnen-Schießstand, das legendäre Fischer S und die Sonnentribüne.

---

### Funktionen der Web-Applikation

- **3D-Orbit-Steuerung:** Frei rotieren, verschieben und stufenlos zoomen via Three.js und OrbitControls.
- **Topografisches Relief:** Reales 1-Meter-Geländemodell (DGM1) der Bayerischen Vermessungsverwaltung, optimiert für flüssige 60 FPS im Browser.
- **Darstellungs-Modi:**
  - *Schnee & Relief:* Winterlicher Farbverlauf von den Talböden bis zu den alpinen Schneelagen.
  - *Höhenstufen:* Konturierte pseudofarben nach Höhenmeter.
  - *Studio Clay:* Monochromes Shading zur Erkennung feiner Hang- und Kantenstrukturen.
- **Dynamische Rennstrecke:** Dreidimensionales Streckenband auf dem Relief mit Schlüsselstellen-Baken und animiertem Läufer-Marker.
- **Interaktives Höhenprofil-HUD:** Am unteren Bildschirmrand eingeblendetes Streckenprofil mit Höhenanzeige und Klick-Fokussierung der 3D-Kamera.
- **Kamera-Presets:** Isometrisches Panorama, Startbereich, Zielstadion, Schlüsselstelle und Vogelperspektive.

---

### Geodatenbasis & Quellenangaben (Credits)

| Datensatz | Quelle / Anbieter | Lizenz |
|---|---|---|
| **DGM1 (Digitales Geländemodell, 1m)** | Bayerische Vermessungsverwaltung ([LDBV](https://geodatenonline.bayern.de/)) | [Creative Commons Namensnennung 4.0 International (CC BY 4.0)](https://creativecommons.org/licenses/by/4.0/deed.de) |
| **Streckengeometrien & Infrastruktur** | [OpenStreetMap](https://www.openstreetmap.org/copyright) & FIS/IBU Homologationsdaten | Open Database License (ODbL) / Freie Sportdaten. |
| **3D-Technologie** | [Three.js](https://threejs.org/) | MIT License. |

> **Offizieller Quellennachweis:**  
> *„Datenquelle: Bayerische Vermessungsverwaltung – www.geodaten.bayern.de“*

---

### Lokale Ausführung

```bash
# Repository klonen
git clone https://github.com/RLKO31/winter-sports-3d-tracks.git
cd winter-sports-3d-tracks

# Lokalen Webserver starten
npx serve .
# oder mit Python: python -m http.server 8080
```

---

### Impressum (§ 5 DDG) & Kontakt

- **Entwickler / Betreiber:** Ralf Oppel
- **Studiengang:** Geodatenmanagement / Vermessung
- **Akademische Einrichtung:** Technische Hochschule Würzburg-Schweinfurt (THWS)
- **Kontakt:** [ralf.oppel@study.thws.de](mailto:ralf.oppel@study.thws.de)
- **Lizenz:** [MIT License](LICENSE)
