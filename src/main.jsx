import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.jsx";
import "./index.css";

// ========================================
// IMPORTAR Y REGISTRAR SERVICE WORKER (PWA)
// ========================================
import { registerServiceWorker } from "./registerSW";

// Registrar Service Worker para funcionalidad offline
registerServiceWorker();

// Utilidad de migración disponible en consola solo en dev
// Uso: window.__seedMachines('EMPRESA_ID')
if (import.meta.env.DEV) {
  import('./utils/migrations/seedMachines.js').then(mod => {
    window.__seedMachines = mod.runSeedMachines;
    console.log('[DEV] Migración disponible: window.__seedMachines("EMPRESA_ID")');
  });
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
