# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev        # Start dev server (Vite, localhost:5173)
npm run build      # Production build → dist/
npm run preview    # Preview production build locally
```

No test suite. No linter script in package.json (`eslint.config.js` exists but no `npm run lint`).

For Firebase Functions (in `/functions/`):
```bash
cd functions && npm install
firebase deploy --only functions
```

## Architecture

### Multi-tenant, multi-app SaaS

The app hosts several independent sub-applications under one Firebase project (`mpf-maquinaria`). Every user belongs to one **empresa** (tenant). All Firestore data lives under `empresas/{empresaId}/...` subcollections.

**Auth + tenant resolution:**
1. `src/lib/firebase.js` initializes Firebase with offline persistence (IndexedDB, multi-tab).
2. `src/lib/useEmpresa.jsx` exports `EmpresaProvider` + `useEmpresa()` — reads `users/{uid}.empresaId` from Firestore and provides it via React context to the whole app.
3. `src/App.jsx` wraps every shell in `<EmpresaProvider>` and uses `localStorage.selectedApp` to decide which sub-app to render.

### Sub-applications (selectedApp values)
| Key | Shell | Notes |
|---|---|---|
| *(default)* | `Shell` in App.jsx | Oficina Técnica — machines, fuel, logs, payroll, OC, etc. |
| `workfleet` / `workfleet-m` | `OperadoresApp` | Mobile-first app for field operators |
| `rrhh` | `RRHHShell` | HR management |
| `reportes` | `ReportesShell` | Read-only reports for managers |
| `finanzas` | `FinanzasApp` | Cash flow, assets |
| `contabilidad` | `ContabilidadApp` | Accounting |
| `pricing` | `PricingPage` | Subscription management |

### Role system
Roles live in `users/{uid}.role`. Only two matter for access control gates:
- `superadmin` — full access to all apps and admin routes
- `admin_contrato` — admin-level within their empresa
- `operador`, `administrativo`, `mandante`, `trabajador` — various restrictions

`isAdmin = role === 'superadmin' || role === 'admin_contrato'` is the main gate used across components.

### Firestore data model
Every collection lives under `empresas/{empresaId}/`:
- `projects` — obras/projects
- `machines` — fleet equipment
- `trabajadores` — employees
- `equipos_surtidores` — fuel dispenser trucks
- `empresas_combustible` — fuel supplier companies
- `estaciones_combustible` — fixed fuel stations (filtered by project)
- `reportes_combustible` — fuel reports (entrada/entrega)
- `dailyLogs`, `payroll`, etc.

Global collections: `users`, `empresas`.

### Combustible (fuel) module
Located in `src/components/combustible/`. A 3-step wizard orchestrated by `CombustibleForm.jsx`:

```
src/components/combustible/
├── CombustibleForm.jsx          ← orchestrator (renders steps + modals)
├── hooks/useCombustibleForm.js  ← all state, effects, CRUD handlers, handleSubmit
├── steps/
│   ├── TipoStep.jsx             ← Paso 1: entrada vs. entrega selector
│   ├── ControlStep.jsx          ← Paso 2: project, date, repartidor, origen/destino
│   ├── EntradaStep.jsx          ← Paso 3a: amounts, docs, foto (fuel intake)
│   └── EntregaStep.jsx          ← Paso 3b: machine, receptor, foto (fuel dispense)
└── modals/
    ├── EquipoSurtidorModal.jsx
    ├── EmpresaModal.jsx
    ├── MaquinaModal.jsx
    └── EmpleadoModal.jsx
```

Entry points: `src/components/CombustibleModal.jsx` (inline modal) and `src/components/CombustiblePage.jsx` (full-page wrapper for the WorkFleet app).

**Wizard flow:** Paso 1 → Paso 2 → Paso 3 (branches by `tipoReporte`). Role differences (`isAdmin`) are inline conditionals within steps, not separate components. `isAdmin = role === 'superadmin' || role === 'admin_contrato'`.

**Paso 2 / entrada tipoOrigen values:** `interno` (MPF internal), `estacion` (fixed fuel station), `externo` (third-party supplier).

Photo capture uses `src/components/CameraCapture.jsx`. Photos upload to Firebase Storage; if quota exceeded, base64 is stored in Firestore (capped at 500 KB to stay under the 1 MB doc limit).

Vouchers: `src/utils/voucherThermalGenerator.js` (thermal) + `src/utils/voucherPdfGenerator.js` (PDF). `src/components/VoucherGenerator.jsx` handles the post-submit modal.

### Plan/billing system
`src/lib/plans.js` defines 4 modules (`rrhh`, `finanzas`, `fleetcore`, `workfleet`) with CLP prices. Plans are stored in Firestore as comma-separated module IDs (e.g. `"rrhh,finanzas"`). `src/hooks/usePlan.js` reads the active plan. Payment is via MercadoPago (webhook at `api/webhooks/mercadopago.js`).

### PWA / offline
Service worker at `public/sw.js`. Firebase Firestore uses `persistentLocalCache` with `persistentMultipleTabManager` for offline support. Session validity is tracked manually in `localStorage` (20-day window). `src/components/ConnectionStatus.jsx` monitors `window.online/offline`.

### Email / notifications
Firebase Functions (`functions/index.js`) send emails via AWS SES (`functions/ses.js`) and SMS via Twilio (`functions/twilio.js`). Email templates are in `functions/email-templates.js`.
