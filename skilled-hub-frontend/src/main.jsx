import React from 'react'
import ReactDOM from 'react-dom/client'
import './reactModalDefaults.js'
import App from './App.jsx'
import './index.css'
import { registerServiceWorker } from './registerServiceWorker.js'

registerServiceWorker()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
