import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter, Route, Routes } from 'react-router-dom'
import Dashboard from './pages/Dashboard'
import ResumeEditor from './pages/ResumeEditor'
import LetterEditor from './pages/LetterEditor'
import { ShowcaseDoc, ShowcasePage } from './pages/Showcase'
import { Toasts } from './components/ui'
import { UpdateBanner } from './components/UpdateBanner'
import { RomeDrawer } from './components/RomeDrawer'
import './styles/app.css'
import { startAutoSync } from './store/sync'

startAutoSync()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/cv/:id" element={<ResumeEditor />} />
        <Route path="/lettre/:id" element={<LetterEditor />} />
        <Route path="/vitrine" element={<ShowcasePage />} />
        <Route path="/vitrine/:id" element={<ShowcaseDoc />} />
        <Route path="*" element={<Dashboard />} />
      </Routes>
    </HashRouter>
    <Toasts />
    <UpdateBanner />
    <RomeDrawer />
  </StrictMode>,
)
