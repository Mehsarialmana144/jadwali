import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import { ThemeProvider } from './lib/theme.jsx'
import './index.css'
import { registerServiceWorker } from './lib/push'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </React.StrictMode>,
)
 
window.addEventListener('load', () => { registerServiceWorker() })
window.addEventListener('load', () => { navigator.storage?.persist?.().catch(() => {}) })
