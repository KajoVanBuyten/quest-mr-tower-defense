import { useState } from 'react'
import { sfx } from '../game/audio'
import { TOWER_ORDER, TOWERS } from '../game/config'
import { game } from '../game/Game'
import { useUI } from '../game/uiStore'
import { xrStore } from '../xr/store'

const FEATURES = [
  { icon: '◈', title: 'Risse in deinen Wänden', text: 'Dimensionsrisse öffnen sich auf den echten Wänden deines Raums – per Plane Detection erkannt.' },
  { icon: '⬡', title: 'Pfade um deine Möbel', text: 'Kreaturen kriechen heraus, fallen zu Boden und suchen per Flow-Field ihren Weg um Sofa und Tisch.' },
  { icon: '▲', title: 'Vier Turmtypen', text: 'Laser, Tesla, Plasma-Mörser und Frost. Auf Tischen gebaut erhalten Türme mehr Reichweite.' },
  { icon: '✦', title: 'Hand-Blaster & Orbital', text: 'Schieß selbst mit Controller oder Fingergeste und ruf einen Orbitalschlag auf die Horde.' },
  { icon: '◐', title: 'Echte Verdeckung', text: 'Raum-Mesh als Tiefenmaske und Schattenfänger: Monster verschwinden hinter echten Möbeln.' },
  { icon: '♪', title: 'Prozeduraler 3D-Sound', text: 'Jeder Klang wird live synthetisiert und per HRTF räumlich im Zimmer platziert.' },
]

export function Landing() {
  const phase = useUI((s) => s.phase)
  const ar = useUI((s) => s.arSupported)
  const vr = useUI((s) => s.vrSupported)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  if (phase !== 'menu') return null

  const enter = async (mode: 'ar' | 'vr') => {
    setError('')
    setBusy(true)
    try {
      await sfx.init()
      const session = mode === 'ar' ? await xrStore.enterAR() : await xrStore.enterVR()
      if (!session) setError('Die XR-Sitzung konnte nicht gestartet werden.')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const desktop = async () => {
    await sfx.init()
    game.startDesktop()
  }

  return (
    <div className="landing">
      <div className="landing-inner">
        <header className="hero">
          <div className="eyebrow">Mixed Reality · Meta Quest 3 · WebXR</div>
          <h1 className="title">
            <span>RIFT</span> DEFENSE
          </h1>
          <p className="lead">
            Dein Wohnzimmer ist das Schlachtfeld. Dimensionsrisse reißen in deinen echten Wänden auf, Void-Kreaturen strömen heraus und marschieren auf den
            Energiekern, den du auf Boden oder Tisch stellst. Baue Türme auf echten Oberflächen, greif selbst zum Blaster – und halte zehn Wellen stand.
          </p>
          <div className="cta">
            <button className="btn-primary" disabled={busy || ar === false} onClick={() => enter('ar')}>
              <span className="pulse" />
              Enter AR
            </button>
            {vr && !ar && (
              <button className="btn-secondary" disabled={busy} onClick={() => enter('vr')}>
                Enter VR
              </button>
            )}
            <button className="btn-ghost" onClick={desktop}>
              Im Browser spielen
            </button>
          </div>
          {ar === false && <p className="note">Dieser Browser unterstützt kein immersive-ar. Öffne die Seite im Meta Quest Browser – oder spiele die Desktop-Vorschau.</p>}
          {error && <p className="note error">{error}</p>}
        </header>

        <section className="features">
          {FEATURES.map((f) => (
            <article key={f.title} className="feature">
              <div className="feature-icon">{f.icon}</div>
              <h3>{f.title}</h3>
              <p>{f.text}</p>
            </article>
          ))}
        </section>

        <section className="towers-strip">
          {TOWER_ORDER.map((t) => (
            <div key={t} className="tower-chip" style={{ ['--c' as string]: TOWERS[t].color }}>
              <i />
              <b>{TOWERS[t].name}</b>
              <span>{TOWERS[t].description}</span>
            </div>
          ))}
        </section>

        <section className="controls">
          <div className="control-col">
            <h4>Controller</h4>
            <ul>
              <li><kbd>Rechter Trigger</kbd> Kern / Turm platzieren, Turm upgraden, Menü</li>
              <li><kbd>Rechter Grip</kbd> Hand-Blaster (Dauerfeuer, überhitzt)</li>
              <li><kbd>A</kbd> Orbitalschlag · <kbd>B</kbd> Turm verkaufen</li>
              <li><kbd>Stick ◂ ▸</kbd> / <kbd>Y</kbd> Turmtyp wechseln</li>
              <li><kbd>X</kbd> Welle starten · <kbd>Linker Trigger</kbd> Orbital</li>
            </ul>
          </div>
          <div className="control-col">
            <h4>Hand-Tracking</h4>
            <ul>
              <li><kbd>Rechts Pinch</kbd> (Daumen + Zeigefinger) platzieren / upgraden</li>
              <li><kbd>Rechts Daumen + Mittelfinger</kbd> Hand-Blaster</li>
              <li><kbd>Links Pinch</kbd> Orbitalschlag</li>
              <li><kbd>Zeigefinger</kbd> Handgelenk-Menü antippen</li>
            </ul>
          </div>
          <div className="control-col">
            <h4>Desktop-Vorschau</h4>
            <ul>
              <li><kbd>Linksklick</kbd> platzieren / upgraden · <kbd>Rechtsklick</kbd> verkaufen</li>
              <li><kbd>1–4</kbd> Turm wählen · <kbd>Leertaste</kbd> Welle</li>
              <li><kbd>F</kbd> (halten) Blaster · <kbd>Q</kbd> Orbitalschlag</li>
              <li><kbd>Ziehen</kbd> Kamera drehen · <kbd>Scrollen</kbd> Zoom</li>
            </ul>
          </div>
        </section>
        <footer className="foot">Alle Modelle, Texturen und Klänge werden prozedural im Browser erzeugt – keine externen Downloads.</footer>
      </div>
    </div>
  )
}
