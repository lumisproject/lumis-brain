import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../supabase'

export default function JiraConnect() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [status, setStatus] = useState('verifying')

  useEffect(() => {
    const verifyConnection = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      
      if (!session) {
        navigate('/login')
        return
      }

      // Check if the callback returned successfully
      const message = searchParams.get('message')
      if (message === 'Jira connected successfully') {
        setStatus('success')
        setTimeout(() => navigate('/dashboard'), 2000)
      } else {
        setStatus('error')
      }
    }

    verifyConnection()
  }, [searchParams, navigate])

  return (
    <div className="page-center">
      <div className="auth-card">
        <div className="auth-header">
          <h1>Jira Integration</h1>
          {status === 'verifying' && <p>Finalizing connection to Atlassian...</p>}
          {status === 'success' && (
            <p style={{ color: '#10b981' }}>✅ Successfully connected! Returning to dashboard...</p>
          )}
          {status === 'error' && (
            <p style={{ color: '#ef4444' }}>❌ Connection failed. Please try again.</p>
          )}
        </div>
        
        <button onClick={() => navigate('/dashboard')} className="btn btn-outline" style={{ width: '100%' }}>
          Back to Dashboard
        </button>
      </div>
    </div>
  )
}