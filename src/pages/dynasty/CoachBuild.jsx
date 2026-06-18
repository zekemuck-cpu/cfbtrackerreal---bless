import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePathPrefix } from '../../hooks/usePathPrefix'

const COACH_BUILDER_URL = 'https://collegefootball.gg/coach-builder/'

export default function CoachBuild() {
  const navigate = useNavigate()
  const pathPrefix = usePathPrefix()
  const [blocked, setBlocked] = useState(false)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 'calc(100vh - 60px)', backgroundColor: '#0a0d14' }}>
      {/* Top bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '10px 16px',
          borderBottom: '1px solid #1e2535',
          backgroundColor: '#0d1117',
          flexShrink: 0,
        }}
      >
        <button
          onClick={() => navigate(`${pathPrefix}/coach-career`)}
          style={{ color: '#94a3b8', fontSize: 13, fontWeight: 500, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
        >
          ← Back
        </button>
        <div style={{ flex: 1, textAlign: 'center' }}>
          <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: '1.15rem', letterSpacing: '4px', color: '#f8fafc' }}>
            COACH BUILD
          </span>
        </div>
        <a
          href={COACH_BUILDER_URL}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: '#475569', fontSize: 11, fontWeight: 600, letterSpacing: '1.5px', textDecoration: 'none' }}
        >
          OPEN IN TAB ↗
        </a>
      </div>

      {/* iframe or fallback */}
      {blocked ? (
        <Fallback url={COACH_BUILDER_URL} />
      ) : (
        <iframe
          src={COACH_BUILDER_URL}
          title="Coach Builder"
          onError={() => setBlocked(true)}
          style={{
            flex: 1,
            width: '100%',
            border: 'none',
            display: 'block',
            minHeight: 600,
          }}
          allow="fullscreen"
        />
      )}
    </div>
  )
}

function Fallback({ url }) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: 32, textAlign: 'center' }}>
      <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: '1.4rem', letterSpacing: '2px', color: '#f1f5f9' }}>
        Embedding Blocked
      </div>
      <div style={{ fontSize: 13, color: '#64748b', maxWidth: 380, lineHeight: 1.6 }}>
        collegefootball.gg does not allow embedding in other sites. Open it directly in a new tab instead.
      </div>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          display: 'inline-block',
          padding: '10px 24px',
          backgroundColor: '#1d4ed8',
          color: '#fff',
          borderRadius: 6,
          fontWeight: 700,
          fontSize: 13,
          letterSpacing: '1.5px',
          textDecoration: 'none',
        }}
      >
        Open Coach Builder ↗
      </a>
    </div>
  )
}
