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

### Agente IA (asistente por texto y voz)
Floating assistant mounted in `PWAWrapper` (App.jsx), so it appears in every sub-app. It answers questions and runs tasks with Claude tool use.

```
api/agente/chat.js              ← Vercel function: validates Firebase idToken, calls Claude (one turn)
api/agente/_herramientas.js     ← system prompt + tool schemas (what Claude sees)
src/lib/agente/herramientas.js  ← tool registry + fleet executors (run in the browser with the user's Firestore)
src/lib/agente/herramientasFinanzas.js ← cash-flow tools; reuse src/lib/finanzas/caja.js so numbers match "La semana"
src/lib/agente/herramientasEquipo.js   ← resumen_del_dia, consultar_datos (allowlisted collections), team memory
src/lib/agente/useAgente.js     ← conversation loop, confirmations, sessionStorage persistence
src/components/agente/AgenteIA.jsx ← UI: chat panel, dictation (Web Speech API), read-aloud
```

Tools execute client-side on purpose: Firestore rules and `empresaId` scoping apply exactly as if the user acted by hand; the server never touches the DB. Tools that write data are listed in `ACCIONES_QUE_MODIFICAN` and require a confirmation card. To add a tool: add its schema in `_herramientas.js` and an executor with the same name in `herramientas.js`.

The conversation history is append-only and assistant `content` (including thinking blocks) is sent back unchanged — editing it makes the API reject the request. Team memory lives in `empresas/{id}/agente_memoria` (rule in `firestore.rules`); it's loaded once per conversation into the context. Finance sections are opened via `sessionStorage['agenteIA:finanzasVista']` + the `agente:finanzas` window event (FinanzasApp has no per-section routes). Env vars in Vercel: `ANTHROPIC_API_KEY` (required), `ANTHROPIC_AGENTE_MODEL`, `ANTHROPIC_AGENTE_EFFORT` (optional).

### Autodesarrollo (mejoras pedidas al agente)
Each platform improvement is a GitHub issue labeled `mejora`. Flow: `proponer_mejora` (agent tool → `api/mejoras`) creates the issue with label `propuesta` → an approver runs `aprobar_mejora`, which adds the label `aprobada` → `.github/workflows/agente-mejora.yml` runs Claude Code on branch `mejora-N`, then the workflow (not the model) commits and opens a PR → Vercel preview → **a human reviews and merges in GitHub**. Neither the agent nor `api/mejoras` can merge, on purpose.

- Approvers: `superadmin`, or uids in `plataforma/mejoras.aprobadores` (Firestore doc only a superadmin can write — not a field on `users/{uid}`, because users can edit their own doc).
- `.github/workflows/agente-revision-diaria.yml` reviews one module per weekday and opens ≤3 `propuesta` issues; it never edits code.
- The development workflow refuses results that touch `.github/`, `firestore.rules`, `storage.rules`, `vercel.json` or `firebase.json`.
- Server helpers shared by API functions live in `api/_comun/` (token validation and Firestore REST reads with the user's own idToken).
- Setup: Vercel env `GITHUB_TOKEN_MEJORAS` (fine-grained PAT: Issues read/write, Pull requests read); repo secret `ANTHROPIC_API_KEY`; repo variable `MEJORAS_RAMA_BASE` (default `main`); repo setting "Allow GitHub Actions to create and approve pull requests".

### Propuestas de flujo de caja
`Finanzas → Propuestas` (`src/pages/finanzas/FinanzasPropuestas.jsx`): drafts that change the cash flow without touching it. Stored in `empresas/{id}/flujo_propuestas` as deltas only — `cambios.pagos["<cuentaId>-<lunes>"] = { valor, antes }`, `cambios.cuentas["nueva_xxx"]` (accounts that exist only in the proposal), `cambios.colchon`. `antes` is the original value when proposed; if the flow changed since, the change is flagged as a conflict.

- Pure logic in `src/lib/finanzas/propuestas.js` (`datosConPropuesta` builds the "what-if" data so both versions are projected with `caja.js`); Firestore in `src/lib/finanzas/propuestasDatos.js`.
- Approval (`aplicarPropuesta`, admins only in UI and agent) writes everything in one `writeBatch`: new accounts get real ids and their partidas are re-pointed; changed partidas lose their "pagado" mark.
- The comparison is a notebook-style correction: a slider/buttons drive `t` (0 = original, 1 = proposal); the line chart morphs, the area between versions is shaded menta/rosa, and each amount is struck through while the new one is written above. Respects `prefers-reduced-motion`.
- **Proposal mode inside the sheet** (`FinanzasFlujoCaja.jsx`): "Proponer cambios" creates/resumes a proposal and the same spreadsheet keeps working, but `handlePayment`, drag & drop and "Nueva cuenta" write to the proposal (`guardarCeldasPropuesta`, `agregarCuentaNueva`); paid marks, notes and editing/deleting existing accounts are disabled there. State: `pagosActual` (flow as shown today), `pagosGuardados` (raw `flujo_pagos`), `pagosPropuesta` (raw + proposal + recurrences); `payments` is what gets drawn — actual, proposal, or a `lerp` of the changed cells driven by `t`, so totals, KPIs and the running balance animate too. The active proposal id is kept in `sessionStorage['finanzas:propuestaActiva:<empresaId>']`. Shared transition hook/control: `src/pages/finanzas/transicion.jsx`.
- The agent defaults to proposals for cash-flow changes (`crear_propuesta_flujo`, `editar_propuesta_flujo`, `comparar_propuesta_flujo`), and opens them with `navegar_a` + `propuesta_id`.

