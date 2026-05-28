# MPF Documentos — Sistema de Redacción Profesional
### MPF Ingeniería Civil SPA · Proyecto Río Tinto

---

## Estructura del proyecto

```
mpf-docs/
├── src/
│   ├── lib/
│   │   ├── firebase.js       ← Configuración Firebase
│   │   ├── auth.js           ← Usuarios y contraseñas
│   │   ├── claude.js         ← API Anthropic (IA)
│   │   └── documentos.js     ← Guardar/cargar historial
│   ├── components/
│   │   ├── Layout.jsx        ← Sidebar + navegación
│   │   └── ResultPanel.jsx   ← Panel de resultado con copiar/guardar
│   ├── pages/
│   │   ├── Login.jsx         ← Pantalla de login
│   │   ├── PlanTrabajo.jsx   ← Módulo Plan de Trabajo
│   │   ├── InformeDiario.jsx ← Módulo Informe Diario
│   │   └── Historial.jsx     ← Historial de documentos
│   ├── App.jsx
│   ├── main.jsx
│   └── index.css
├── index.html
├── vite.config.js
├── package.json
├── firebase.json             ← Hosting config
└── firestore.rules           ← Reglas de seguridad
```

---

## PASO 1 — Instalar dependencias

```bash
cd mpf-docs
npm install
```

---

## PASO 2 — Configurar Firebase

1. Ve a https://console.firebase.google.com
2. Crea un proyecto (o usa el existente de FleetCore)
3. Activa **Firestore Database** (modo producción)
4. Activa **Firebase Hosting**
5. Ve a Configuración del proyecto → Tus apps → Agregar app web
6. Copia los datos de configuración y pégalos en `src/lib/firebase.js`:

```js
const firebaseConfig = {
  apiKey:            "AIza...",
  authDomain:        "mi-proyecto.firebaseapp.com",
  projectId:         "mi-proyecto",
  storageBucket:     "mi-proyecto.appspot.com",
  messagingSenderId: "123456789",
  appId:             "1:123456789:web:abc123",
}
```

---

## PASO 3 — Configurar la API Key de Anthropic

En `src/lib/claude.js`, reemplaza:

```js
const ANTHROPIC_API_KEY = "TU_ANTHROPIC_API_KEY"
```

> ⚠️ **IMPORTANTE PARA PRODUCCIÓN**: La API Key queda expuesta en el cliente.
> Para mayor seguridad, muévela a una Cloud Function de Firebase:
> Ver sección "Seguridad avanzada" al final de este README.

---

## PASO 4 — Agregar o cambiar usuarios

En `src/lib/auth.js`, edita el objeto `USERS`:

```js
export const USERS = {
  admin:      { password: "mpf2024",     nombre: "Administrador",      rol: "admin" },
  supervisor: { password: "supervisor1", nombre: "Supervisor de Obra",  rol: "supervisor" },
  juan:       { password: "mipass123",   nombre: "Juan Riquelme",       rol: "operador" },
  gustavo:    { password: "otropass",    nombre: "Gustavo Faundez",     rol: "operador" },
  // agrega los que necesites...
}
```

Reglas: el nombre de la clave (ej: `juan`) es el usuario que se escribe al ingresar.

---

## PASO 5 — Probar en local

```bash
npm run dev
```

Abre http://localhost:5173

---

## PASO 6 — Desplegar en Firebase Hosting

```bash
# Instalar Firebase CLI (si no lo tienes)
npm install -g firebase-tools

# Login
firebase login

# Inicializar en el proyecto (solo primera vez)
firebase use --add
# Selecciona tu proyecto Firebase

# Build de producción
npm run build

# Publicar reglas de Firestore
firebase deploy --only firestore:rules

# Publicar la app
firebase deploy --only hosting
```

Tu app quedará disponible en:
`https://TU-PROYECTO.web.app`

---

## Seguridad avanzada (opcional pero recomendado)

Para no exponer la API Key de Anthropic en el cliente, crea una Cloud Function:

```bash
firebase init functions
```

```js
// functions/index.js
const functions = require('firebase-functions')
const fetch = require('node-fetch')

exports.generarDocumento = functions.https.onCall(async (data) => {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': functions.config().anthropic.key,  // firebase functions:config:set anthropic.key="sk-..."
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(data),
  })
  return response.json()
})
```

Luego en `src/lib/claude.js` reemplaza el fetch directo por una llamada a la function.

---

## Módulos disponibles

| Módulo | Descripción |
|--------|-------------|
| Plan de Trabajo | Genera plan diario formal para presentar al mandante |
| Informe Diario | Convierte borrador en informe técnico profesional |
| Historial | Consulta y copia documentos generados anteriormente |

---

## Stack técnico

- **Frontend**: React 18 + Vite
- **Base de datos**: Firebase Firestore
- **Hosting**: Firebase Hosting
- **IA**: Anthropic Claude (claude-sonnet)
- **Auth**: Login simple por sessionStorage (sin Firebase Auth)
