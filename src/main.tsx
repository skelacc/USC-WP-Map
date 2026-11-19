import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { initInstallPrompt } from './lib/install'

// früh lauschen: Chrome meldet das Installieren-Angebot oft vor dem ersten Rendern
initInstallPrompt(window)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
