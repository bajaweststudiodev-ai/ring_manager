import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import { registerSW } from 'virtual:pwa-register'

// immediate:true registra el SW en cuanto el script ejecuta, sin esperar
// a que la página esté completamente cargada. Crítico para iOS: si el usuario
// instala la app al inicio sin haber visto antes la página con el SW registrado,
// no hay caché y el modo avión falla. Con immediate:true el SW queda activo
// desde la primera visita con internet.
registerSW({ immediate: true })

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
