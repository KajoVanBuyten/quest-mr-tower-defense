# Rift Defense – Mixed-Reality Tower Defense

**Rift Defense** ist ein WebXR-Mixed-Reality-Spiel für die **Meta Quest 3**, das direkt im **Meta Quest Browser** läuft. Dein echtes Zimmer wird zum Schlachtfeld: Dimensionsrisse reißen in deinen Wänden auf, Void-Kreaturen kriechen heraus, fallen zu Boden und marschieren um deine Möbel herum auf einen Energiekern zu, den du auf Boden oder Tisch platzierst. Du verteidigst ihn mit Türmen auf echten Oberflächen, einem Hand-Blaster und einem Orbitalschlag.

▶ **Spielen:** https://kajovanbuyten.github.io/quest-mr-tower-defense/

## Features

- **Risse in echten Wänden** – über Plane Detection (`semanticLabel: 'wall'`) erkannt; ohne Raumdaten öffnen sich die Risse an virtuellen Positionen rund um den Spieler. Animierter Portal-Shader mit Wirbel, Verzerrung, knisternden Rändern und Lichtschein auf dem Boden.
- **Pfadfindung um Möbel** – Boden-Navigationsgitter mit Dijkstra-Flow-Field. Möbel aus erkannten Flächen, beschrifteten Raum-Meshes und dem globalen Raum-Mesh werden zu blockierten Zellen. Türme auf dem Boden blockieren ebenfalls – ein Turm, der den Weg komplett versperren würde, wird abgelehnt.
- **Vier Turmtypen** (je 3 Stufen)
  - **Laser** – Dauerstrahl auf ein Ziel
  - **Tesla** – Kettenblitz über mehrere Gegner
  - **Plasma-Mörser** – ballistische Geschosse mit Flächenschaden
  - **Frost** – Eis-Puls, verlangsamt alle Gegner in Reichweite
  - Türme auf **Tischen/Regalen** erhalten durch die Höhe bis zu **+42 % Reichweite**.
- **Drei Gegnertypen + Boss** – flinke Schwärmer, gepanzerte Tanks, Flieger, die durch den Raum kreisen, und ein riesiger Koloss in der finalen Welle, der unterwegs Schwärmer ausbrütet.
- **Spieler-Waffen** – Hand-Blaster mit Überhitzung und ein aufladbarer **Orbitalschlag**.
- **Effekte** – Dissolve-Shader beim Tod, instanzierte Partikel, schwebende Schadenszahlen, Hologramm-Aufbau der Türme, Schild-Ripple am Kern bei Treffern.
- **Echte Verdeckung & Schatten** – erkannte Flächen und Raum-Meshes werden als reine Tiefenmaske (`colorWrite: false`) gerendert, Kreaturen verschwinden hinter echten Möbeln. Shadow-Catcher auf Boden und Tischen werfen ihre Schatten in den echten Raum. Wird Depth Sensing unterstützt, verdeckt zusätzlich die Tiefenkarte des Headsets.
- **Prozeduraler 3D-Sound** – alle Klänge werden mit der WebAudio-API live synthetisiert und per HRTF-Panner räumlich platziert. Es gibt keine einzige Audiodatei.
- **Komplett prozedural** – Geometrie, Texturen, Umgebungslicht (`<Environment>` aus drei mit `<Lightformer>`-Kindern) und Sounds entstehen im Browser. Zur Laufzeit wird nichts von externen Servern geladen; auch die Controller-Layouts werden lokal ausgeliefert.
- **Desktop-Vorschau** – im normalen Browser spielbar: stilisierte virtuelle Wohnung (Boden, Wände, Tisch, Sofa, Sideboard) mit OrbitControls, Bloom-Postprocessing und Maussteuerung.

## Steuerung

### Controller

| Eingabe | Aktion |
| --- | --- |
| Rechter Trigger | Kern platzieren, Turm bauen, Turm upgraden (auf Turm zielen), Menü bedienen |
| Rechter Grip (halten) | Hand-Blaster |
| A | Orbitalschlag auf den Zielpunkt |
| B | Anvisierten Turm verkaufen (60 %) |
| Rechter Stick links/rechts, Y | Turmtyp wechseln |
| X | Nächste Welle starten / Neustart |
| Linker Trigger | Orbitalschlag |
| Linke Hand | Handgelenk-Menü: Turmwahl, Credits, Welle, Orbital |

### Hand-Tracking

| Geste | Aktion |
| --- | --- |
| Rechts: Daumen + Zeigefinger (Pinch) | Platzieren / Upgraden / Menü per Strahl |
| Rechts: Daumen + Mittelfinger | Hand-Blaster |
| Links: Pinch | Orbitalschlag |
| Rechter Zeigefinger | Handgelenk-Menü am linken Arm antippen |

### Desktop

| Eingabe | Aktion |
| --- | --- |
| Linksklick | Platzieren / Upgraden |
| Rechtsklick | Turm verkaufen |
| 1–4 | Turm wählen |
| Leertaste | Welle starten |
| F (halten) | Blaster |
| Q | Orbitalschlag |
| Ziehen / Scrollen | Kamera drehen / zoomen |

## Auf der Meta Quest 3 öffnen

1. Meta Quest Browser öffnen und **https://kajovanbuyten.github.io/quest-mr-tower-defense/** aufrufen.
2. Optional, aber empfohlen: In den Quest-Einstellungen unter *Physischer Raum → Raumeinrichtung* den Raum scannen (Wände, Boden, Möbel). Ohne Raumdaten nutzt das Spiel virtuelle Risse und eine freie Spielfläche.
3. **Enter AR** drücken und die Berechtigung für Raumdaten erlauben.
4. Kurz im Raum umsehen, dann mit dem rechten Controller (oder Pinch) auf Boden oder Tisch zielen und den **Kern** platzieren.
5. Türme bauen, **Welle starten** – und die Risse verteidigen.

## Lokale Entwicklung

```bash
npm install
npm run dev -- --host
```

Der Dev-Server läuft dank `@vitejs/plugin-basic-ssl` über **HTTPS** (WebXR benötigt einen sicheren Kontext). Im Quest Browser die im Terminal angezeigte LAN-Adresse öffnen (z. B. `https://192.168.x.x:5173`) und die Zertifikatswarnung einmalig bestätigen.

```bash
npm run build     # TypeScript-Prüfung + Produktions-Build nach dist/
npm run preview   # Build lokal testen
```

Das Deployment auf GitHub Pages erfolgt automatisch über `.github/workflows/deploy.yml` bei jedem Push auf `main` (oder manuell per *workflow_dispatch*). In den Repository-Einstellungen muss unter *Pages* die Quelle **GitHub Actions** ausgewählt sein.

## Tech-Stack

- [React Three Fiber](https://github.com/pmndrs/react-three-fiber) 9 + [three.js](https://threejs.org) r186
- [@react-three/xr](https://github.com/pmndrs/xr) 6 – `createXRStore`, `<XR>`, `useXRPlanes`, `useXRMeshes`, `XRSpace`, `XRHitTest`, `requestXRAnchor`, eigene Controller-/Hand-Komponenten
- [@react-three/drei](https://github.com/pmndrs/drei) – `Environment` + `Lightformer`, `OrbitControls`
- [@react-three/postprocessing](https://github.com/pmndrs/react-postprocessing) – Bloom (nur außerhalb von XR)
- [zustand](https://github.com/pmndrs/zustand) – UI-Zustand
- Vite + TypeScript

### Verwendete WebXR-Features

Alle Features werden **optional** angefordert – fehlt eines, läuft das Spiel mit Fallback weiter:

| Feature | Verwendung | Fallback |
| --- | --- | --- |
| `hit-test` | Zielpunkt für Kern und Türme | Raycast gegen erkannte Flächen bzw. Bodenebene |
| `plane-detection` | Wände (Risse), Boden, Tische, Shadow-Catcher, Verdeckung | Virtuelle Risse um den Spieler, freie Spielfläche |
| `mesh-detection` | Möbel-Hindernisse und Verdeckung durch das Raum-Mesh | Nur Flächen |
| `anchors` | Spielwelt am Kern verankert, bleibt stabil im Raum | Statische Position |
| `hand-tracking` | Pinch-Gesten, Fingerblaster, Handgelenk-Menü | Controller |
| `depth-sensing` | Zusätzliche Verdeckung durch die Tiefenkarte | Flächen-/Mesh-Verdeckung |

Performance: instanzierte Gegner, Strahlen und Partikel (wenige Draw Calls), keine React-Renders in der Frame-Schleife, ein schattenwerfendes Licht, Foveated Rendering und 90 Hz Zielbildrate.

## Lizenz

MIT © Kajo Van Buyten – siehe [LICENSE](LICENSE).
