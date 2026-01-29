# MPF Maquinaria • Operaciones (React + Vite + Firebase)

## Instalación
```bash
npm install
```

## Variables de entorno
Copia `.env.example` a `.env` y completa con tu config de Firebase.

## Ejecutar
```bash
npm run dev
```

## Deploy Vercel
- Build: `npm run build`
- Output: `dist`
- Agrega variables `VITE_FIREBASE_*` en Vercel → Settings → Environment Variables

## Firestore (colecciones)
- `projects`: { name, active }
- `machines`: { code, name, type, projectId, ownership, internalRateProductive, internalRateStandby, clientRateProductive, clientRateStandby, active }
- `dailyLogs`: { date(YYYY-MM-DD), machineId, projectId, productiveHours, standbyHours, downtimeHours, notes }

### Reglas mínimas (solo auth)
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

## Primer dato (1 vez)
En Firestore crea un doc en `projects`:
```json
{ "name": "Nuevo Cobre", "active": true }
```
