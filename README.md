# Rift Defense – Mixed-Reality Tower Defense

**Rift Defense** ist ein WebXR-Mixed-Reality-Spiel für die **Meta Quest 3**, das direkt im **Meta Quest Browser** läuft. Dein echtes Zimmer wird zum Schlachtfeld: Dimensionsrisse reißen in deinen Wänden auf, Void-Kreaturen kriechen heraus, fallen zu Boden und marschieren um deine Möbel herum auf einen Energiekern zu, den du auf Boden oder Tisch platzierst. Du verteidigst ihn mit Türmen auf echten Oberflächen, einem Hand-Blaster und einem Orbitalschlag – über **50 Wellen** und danach im **Endlos-Modus**.

▶ **Spielen:** https://kajovanbuyten.github.io/quest-mr-tower-defense/

## Features

- **Risse in echten Wänden** – über Plane Detection (`semanticLabel: 'wall'`) erkannt. Die drei Risse werden auf **verschiedene Wände** verteilt: innerhalb der echten Wandfläche, auf Brusthöhe (ca. 1,0–1,6 m), nicht hinter Schränken versteckt, möglichst im Blickfeld und weit auseinander. Reicht der Platz nicht, teilen sich Risse eine lange Wand oder schweben frei im Raum – nie außerhalb davon. Die Risse sitzen einige Zentimeter vor der Wand und werden weder von der Wand-Verdeckung noch von Depth Sensing abgeschnitten.
- **Riss-Intro** – nach dem Platzieren des Kerns reißen die Risse nacheinander auf, jeweils mit räumlichem Sound aus ihrer Richtung. Pfeile am Rand des Sichtfelds zeigen auf Risse, die du noch nicht gesehen hast (und zu Beginn jeder Welle).
- **Pfadfindung um Möbel** – Boden-Navigationsgitter mit Dijkstra-Flow-Field. Möbel aus erkannten Flächen, beschrifteten Raum-Meshes und dem globalen Raum-Mesh werden zu blockierten Zellen. Türme auf dem Boden blockieren ebenfalls – ein Turm, der den Weg komplett versperren würde, wird abgelehnt.
- **Vier Turmtypen mit je 5 Stufen**
  - **Laser** – Dauerstrahl auf ein Ziel
  - **Tesla** – Kettenblitz über mehrere Gegner, doppelter Schaden gegen Energieschilde
  - **Plasma-Mörser** – ballistische Geschosse mit Flächenschaden
  - **Frost** – Eis-Puls, verlangsamt alle Gegner in Reichweite
  - Türme auf **Tischen, Sofas und Regalen** erhalten durch die Höhe bis zu **+42 % Reichweite**.
- **Platzieren** – ein Hologramm des gewählten Turms steht aufrecht am Zielpunkt, grün/farbig = möglich, rot = nicht möglich (mit Begründung und Kosten im Label), dazu der Reichweitenkreis auf der Oberfläche. Der Turm wird immer auf die **Oberkante** der getroffenen Fläche gesetzt: Ein Prüfstrahl von oben gegen erkannte Flächen und Möbel-Volumen (z. B. Sofa) verhindert, dass Türme in Möbeln verschwinden. Schräge oder senkrechte Flächen werden abgelehnt bzw. auf die Oberkante gehoben. Bestätigung mit Sound, Bau-Animation und Vibration.
- **Auswahl & Upgrades** – Turm anzielen (Hervorhebungsring) und auswählen: Über dem Turm erscheint eine Info-Karte mit Stufe, Schaden, Reichweite, Werten der nächsten Stufe, Upgrade-Kosten, Verkaufswert und Zielmodus (*Erster, Letzter, Stärkster, Nächster*) sowie den Knöpfen **Upgrade**, **Verkauf** und **Ziel**. Jede Stufe verändert das Modell sichtbar: Stufen-Lichter, zweiter Leuchtring, Finnen, kreisende Kristalle, goldene Krone auf Stufe 5, dazu Größe und Leuchtfarbe. Upgrades lösen eine Partikel-Explosion, Sound und Vibration aus; fehlen Credits, gibt es rotes Feedback an Karte und Turm.
- **50 Wellen** – die ersten zehn sind handgebaut und führen nacheinander neue Ideen ein, danach folgt ein Zehn-Wellen-Bogen (Neue Front, Panzerkolonne, Luftangriff, Zellteilung, Mini-Boss, Sturmlauf, Festung, Schwarm, Elite, Boss), der mit jeder Dekade härter wird. **Alle 5 Wellen ein Mini-Boss**, **alle 10 Wellen ein Koloss**, Welle 50 ist das große Finale. Die **Wellenvorschau** im HUD, über dem Kern und am Handgelenk zeigt, was als Nächstes kommt.
- **Zehn Kreaturen** – Schwärmer, **Läufer** (schnell), **Milben**, **Teiler** (zerfallen in Milben), **Heiler** (heilen Nachbarn), **Schildträger** (regenerierender Energieschild), Panzer, **Flieger** (auch als Schwärme), **Brutmutter** (Mini-Boss) und **Koloss** (Boss). Neue Kreaturen werden beim ersten Auftreten angekündigt.
- **Endlos-Modus** – nach dem Sieg in Welle 50 geht es auf Wunsch endlos weiter: zufällig, aber reproduzierbar zusammengesetzte Wellen mit stetig steigender Stärke. **Punkte und Rekord** (beste Punktzahl und höchste Welle) werden im Browser (`localStorage`) gespeichert.
- **Spieler-Waffen** – Hand-Blaster mit Überhitzung und ein aufladbarer **Orbitalschlag**.
- **Effekte** – Dissolve-Shader beim Tod, instanzierte Partikel, schwebende Schadenszahlen, Hologramm-Aufbau der Türme, Schild-Ripple am Kern bei Treffern.
- **Echte Verdeckung & Schatten** – erkannte Flächen und Raum-Meshes werden als reine Tiefenmaske (`colorWrite: false`) gerendert, Kreaturen verschwinden hinter echten Möbeln. Shadow-Catcher auf Boden und Tischen werfen ihre Schatten in den echten Raum. Wird Depth Sensing unterstützt, verdeckt zusätzlich die Tiefenkarte des Headsets – bilinear interpoliert und mit kleinem, entfernungsabhängigem Versatz, damit Kanten weich verlaufen und Objekte an Wänden nicht flackern.
- **Saubere Transparenz im Passthrough** – alle Leuchteffekte (Risse, Schild, Strahlen, Partikel, Hologramme, Ringe) schreiben keinen Alpha-Wert in den Framebuffer: Sie addieren nur Licht zum Kamerabild, statt schwarze Flächen über den Raum zu legen. Hintergrund, Nebel und Clear-Color sind im AR-Modus vollständig transparent.
- **Prozeduraler 3D-Sound** – alle Klänge werden mit der WebAudio-API live synthetisiert und per HRTF-Panner räumlich platziert. Es gibt keine einzige Audiodatei.
- **Komplett prozedural** – Geometrie, Texturen, Umgebungslicht (`<Environment>` aus drei mit `<Lightformer>`-Kindern) und Sounds entstehen im Browser. Zur Laufzeit wird nichts von externen Servern geladen; auch die Controller-Layouts werden lokal ausgeliefert.
- **Desktop-Vorschau** – im normalen Browser spielbar: stilisierte virtuelle Wohnung (Boden, Wände, Tisch, Sofa, Sideboard) mit OrbitControls, Bloom-Postprocessing und Maussteuerung.

## Steuerung

### Controller

| Eingabe | Aktion |
| --- | --- |
| Rechter Trigger | Kern platzieren, Turm bauen, Turm auswählen, Knöpfe auf Info-Karte und Menü bedienen; Trigger ins Leere schließt die Karte |
| Rechter Grip (halten) | Hand-Blaster |
| A | Gewählten Turm upgraden – ohne Auswahl: Orbitalschlag auf den Zielpunkt |
| B | Auswahl schließen (bzw. anvisierten Turm auswählen) |
| Rechter Stick links/rechts, Y | Turmtyp wechseln |
| X | Nächste Welle starten / nach dem Sieg Endlos-Modus / Neustart |
| Linker Trigger | Orbitalschlag |
| Linke Hand | Handgelenk-Menü: Turmwahl, Credits, Welle, Orbital |

### Hand-Tracking

| Geste | Aktion |
| --- | --- |
| Rechts: Daumen + Zeigefinger (Pinch) | Platzieren / Turm auswählen / Karte und Menü per Strahl |
| Rechts: Daumen + Mittelfinger | Hand-Blaster |
| Links: Pinch | Orbitalschlag |
| Rechter Zeigefinger | Handgelenk-Menü am linken Arm antippen |

### Desktop

| Eingabe | Aktion |
| --- | --- |
| Linksklick | Platzieren / Turm auswählen / Karten-Knöpfe; Klick daneben schließt die Karte |
| Rechtsklick, Esc | Auswahl schließen |
| U / X / T | Gewählten (oder anvisierten) Turm upgraden / verkaufen / Zielmodus wechseln |
| 1–4 | Turmtyp wählen |
| Leertaste | Welle starten |
| E | Nach dem Sieg: Endlos-Modus |
| F (halten) | Blaster |
| Q | Orbitalschlag |
| Ziehen / Scrollen | Kamera drehen / zoomen |

## Auf der Meta Quest 3 öffnen

1. Meta Quest Browser öffnen und **https://kajovanbuyten.github.io/quest-mr-tower-defense/** aufrufen.
2. Optional, aber empfohlen: In den Quest-Einstellungen unter *Physischer Raum → Raumeinrichtung* den Raum scannen (Wände, Boden, Möbel). Ohne Raumdaten nutzt das Spiel virtuelle Risse und eine freie Spielfläche.
3. **Enter AR** drücken und die Berechtigung für Raumdaten erlauben.
4. Kurz im Raum umsehen, dann mit dem rechten Controller (oder Pinch) auf Boden oder Tisch zielen und den **Kern** platzieren.
5. Den Pfeilen folgen, bis du alle Risse gesehen hast. Türme bauen, **Welle starten** – und die Risse verteidigen.

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
