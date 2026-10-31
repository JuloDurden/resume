import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter, Route, Routes } from 'react-router-dom'
import Dashboard from './pages/Dashboard'
import ResumeEditor from './pages/ResumeEditor'
import LetterEditor from './pages/LetterEditor'
import { Toasts } from './components/ui'
import './styles/app.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/cv/:id" element={<ResumeEditor />} />
        <Route path="/lettre/:id" element={<LetterEditor />} />
        <Route path="*" element={<Dashboard />} />
      </Routes>
    </HashRouter>
    <Toasts />
  </StrictMode>,
)
