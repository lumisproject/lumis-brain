import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Landing from './pages/Landing'
import Auth from './pages/Auth'
import SignUp from './pages/SignUp'
import Dashboard from './pages/Dashboard'
import Syncing from './pages/Syncing'
import JiraConnect from './pages/JiraConnect'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Auth />} />
        <Route path="/auth" element={<Auth />} /> 
        <Route path="/signup" element={<SignUp />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/syncing" element={<Syncing />} />
        <Route path="/auth/jira/callback" element={<JiraConnect />} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App