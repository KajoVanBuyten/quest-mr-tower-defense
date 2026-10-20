import { useEffect, useState } from 'react'
import { sfx } from '../game/audio'
import { MAX_TOWER_LEVEL, TOWER_ORDER, TOWERS } from '../game/config'
import { game } from '../game/Game'
import { useUI } from '../game/uiStore'

function Toast() {
  const message = useUI((s) => s.message)
  const key = useUI((s) => s.messageKey)
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    if (!message) return
    setVisible(true)
    const t = window.setTimeout(() => setVisible(false), 3200)
    return () => window.clearTimeout(t)
  }, [key, message])
  return (
    <div key={key} className={`toast ${visible ? 'show' : ''}`}>
      {message}
    </div>
  )
}

export function DesktopHud() {
  const s = useUI()
  const [muted, setMuted] = useState(false)
  if (s.phase === 'menu' || s.xr) return null
  const hp = s.coreHp / s.coreMax
  const hpColor = hp > 0.6 ? '#4ff7c8' : hp > 0.3 ? '#ffd24f' : '#ff4d6a'
  const ended = s.phase === 'gameover' || s.phase === 'victory'

  return (
    <div className="hud">
      <div className="hud-top">
        <div className="hud-card">
          <div className="hud-brand">
            RIFT <b>DEFENSE</b>
          </div>
          <div className="hud-row">
            <span className="hud-label">Welle</span>
            <span className="hud-value">
              {s.phase === 'wave' ? s.wave : Math.min(s.wave + 1, s.totalWaves)}
              <small>/{s.totalWaves}</small>
            </span>
          </div>
          <div className="hud-row">
            <span className="hud-label">Kern</span>
            <div className="hud-bar">
              <div style={{ width: `${hp * 100}%`, background: hpColor, boxShadow: `0 0 12px ${hpColor}` }} />
            </div>
            <span className="hud-num" style={{ color: hpColor }}>
              {s.coreHp}
            </span>
          </div>
          <div className="hud-row">
            <span className="hud-label">Credits</span>
            <span className="hud-credits">◆ {s.credits}</span>
          </div>
          {s.phase === 'wave' && <div className="hud-sub">{s.enemiesAlive} Gegner verbleibend</div>}
        </div>
        <div className="hud-right">
          <button
            className="icon-btn"
            title={muted ? 'Ton an' : 'Ton aus'}
            onClick={() => {
              sfx.setMuted(!muted)
              setMuted(!muted)
            }}
          >
            {muted ? '🔇' : '🔊'}
          </button>
          <button className="icon-btn" title="Zurück zum Menü" onClick={() => game.exitXR()}>
            ✕
          </button>
        </div>
      </div>

      {s.phase === 'placeCore' && <div className="hud-center-hint">Klicke auf Boden oder Tisch, um den Energiekern zu platzieren</div>}
      {s.hoverInfo && <div className="hud-hover">{s.hoverInfo}{s.hoverInfo.includes('MAX') ? '' : ` · Klick: Upgrade (max. Stufe ${MAX_TOWER_LEVEL}) · Rechtsklick: verkaufen`}</div>}

      <Toast />

      {ended && (
        <div className={`endscreen ${s.phase}`}>
          <h2>{s.phase === 'victory' ? 'SIEG' : 'KERN ZERSTÖRT'}</h2>
          <p>
            {s.phase === 'victory' ? 'Alle zehn Wellen abgewehrt.' : `Du hast bis Welle ${s.wave} durchgehalten.`} {s.kills} Kreaturen besiegt.
          </p>
          <div className="end-actions">
            <button className="btn-primary small" onClick={() => game.restart()}>
              Neu starten
            </button>
            <button className="btn-ghost small" onClick={() => game.exitXR()}>
              Menü
            </button>
          </div>
        </div>
      )}

      {(s.phase === 'build' || s.phase === 'wave') && (
        <div className="hud-bottom">
          <div className="tower-bar">
            {TOWER_ORDER.map((t, i) => {
              const def = TOWERS[t]
              const afford = s.credits >= def.cost
              return (
                <button
                  key={t}
                  className={`tower-btn ${s.selected === t ? 'active' : ''} ${afford ? '' : 'poor'}`}
                  style={{ ['--c' as string]: def.color }}
                  onClick={() => game.selectTower(t)}
                >
                  <span className="key">{i + 1}</span>
                  <i />
                  <b>{def.name}</b>
                  <span className="cost">◆ {def.cost}</span>
                </button>
              )
            })}
          </div>
          <div className="action-bar">
            <div className="meter">
              <span>Orbital</span>
              <div className="meter-bar ult">
                <div style={{ width: `${s.ult * 100}%` }} />
              </div>
            </div>
            <div className="meter">
              <span>{s.overheated ? 'Überhitzt' : 'Blaster'}</span>
              <div className={`meter-bar heat ${s.overheated ? 'hot' : ''}`}>
                <div style={{ width: `${s.heat * 100}%` }} />
              </div>
            </div>
            {s.phase === 'build' ? (
              <button className="btn-primary small" onClick={() => game.startWave()}>
                ▶ Welle {s.wave + 1} starten
              </button>
            ) : (
              <button className={`btn-secondary small ${s.ult >= 1 ? 'ready' : ''}`} disabled={s.ult < 1} onClick={() => game.armOrbital()}>
                ✦ Orbitalschlag
              </button>
            )}
          </div>
          <div className="keys-hint">Linksklick bauen/upgraden · Rechtsklick verkaufen · F Blaster · Q Orbital · Leertaste Welle · Ziehen: Kamera</div>
        </div>
      )}
    </div>
  )
}
