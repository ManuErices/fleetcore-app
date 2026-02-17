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

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
