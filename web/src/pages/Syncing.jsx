import { useEffect, useState, useRef } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'

export default function Syncing() {
  const [searchParams] = useSearchParams()
  const projectId = searchParams.get('project_id')
  const navigate = useNavigate()
  
  // Initialize with a more descriptive starting log
  const [status, setStatus] = useState({ 
    logs: ["Initializing Unified Gateway..."], 
    status: 'processing', 
    step: 'Starting' 
  })
  const bottomRef = useRef(null)

  // Auto-scroll logs
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [status.logs])

  useEffect(() => {
    if (!projectId) return

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`http://localhost:5000/api/ingest/status/${projectId}`)
        const data = await res.json()
        
        setStatus(data)
        
        // REDIRECT LOGIC: Check both status AND logs for "DONE" signal
        if (data.status === 'completed' || data.logs.some(l => l.includes('DONE'))) {
          clearInterval(interval)
          // Small delay so the user can see the "DONE" message
          setTimeout(() => navigate('/dashboard'), 1500)
        }
      } catch (e) { 
        console.error("Connection to Lumis Engine lost:", e) 
      }
    }, 1200) // Slightly faster polling for smoother terminal feel

    return () => clearInterval(interval)
  }, [projectId, navigate])

  return (
    <div style={{ 
      height: '100vh', 
      background: '#09090b', 
      color: '#a1a1aa', 
      display: 'flex', 
      flexDirection: 'column', 
      fontFamily: 'monospace',
      fontSize: '0.9rem'
    }}>
      {/* Header Bar */}
      <div style={{ 
        padding: '16px 24px', 
        borderBottom: '1px solid #27272a', 
        display: 'flex', 
        justifyContent: 'space-between',
        alignItems: 'center',
        background: '#18181b'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {/* Animated pulse dot from friend's version */}
          <div className="pulse-dot" style={{ width: 8, height: 8, borderRadius: '50%', background: '#10b981' }}></div>
          <span style={{ fontWeight: 600, color: '#fff', letterSpacing: '0.02em' }}>
            LUMIS INTELLIGENCE — UNIFIED SYNC
          </span>
        </div>
        <button 
          onClick={() => navigate('/dashboard')} 
          style={{
            background: 'transparent', 
            color: '#71717a', 
            border: '1px solid #27272a', 
            padding: '6px 12px',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '0.8rem',
            transition: 'all 0.2s'
          }}
        >
          Skip to Dashboard
        </button>
      </div>

      {/* Terminal View */}
      <div style={{ flex: 1, padding: '40px', overflowY: 'auto', lineHeight: '1.6' }}>
        <div style={{ maxWidth: '900px', margin: '0 auto' }}>
          {status.logs.map((log, i) => (
            <div key={i} style={{ marginBottom: '8px', display: 'flex', gap: '12px' }}>
              {/* Timestamp for professional look */}
              <span style={{ color: '#3f3f46', userSelect: 'none' }}>
                [{new Date().toLocaleTimeString([], {hour12: false})}]
              </span>
              <span style={{ 
                color: log.includes('Error') ? '#ef4444' : log.includes('DONE') ? '#10b981' : '#e4e4e7' 
              }}>
                {log}
              </span>
            </div>
          ))}
          
          {/* Blinking Terminal Cursor */}
          {status.status !== 'completed' && (
            <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
               <span style={{ color: '#3f3f46' }}>[{new Date().toLocaleTimeString([], {hour12: false})}]</span>
               <span className="blinking-cursor" style={{ width: '8px', height: '18px', background: '#10b981' }}></span>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* Footer Status Bar */}
      <div style={{ 
        padding: '12px 24px', 
        borderTop: '1px solid #27272a', 
        background: '#09090b', 
        fontSize: '0.75rem', 
        color: '#52525b' 
      }}>
        Status: <span style={{ color: '#71717a' }}>{status.status.toUpperCase()}</span> | 
        Process: <span style={{ color: '#71717a' }}>{status.step}</span> | 
        Target: <span style={{ color: '#71717a' }}>Digital Twin + Jira Task Sync</span>
      </div>

      <style>{`
        @keyframes pulse {
          0% { opacity: 1; }
          50% { opacity: 0.4; }
          100% { opacity: 1; }
        }
        .pulse-dot { animation: pulse 2s infinite ease-in-out; }
        
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
        .blinking-cursor { animation: blink 1s step-end infinite; }
      `}</style>
    </div>
  )
}