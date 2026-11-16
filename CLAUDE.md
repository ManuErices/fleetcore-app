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

### Seguridad (reglas y funciones)
- **Alta de usuarios** (`firestore.rules`, `users/{uid}`): a user can only give himself a role/empresa through a verifiable path — owner of an empresa whose `adminUid`/`adminEmail` is his (`esDuenoDeEmpresa`), a valid unused invitation (`invitacionId` on the user doc, `aceptaInvitacion`), a `trabajadores` ficha with his email (`trabajadorId`), or no empresa yet. Admins can't grant `superadmin` nor `empresasIds` they don't have (`adminNoEscala`).
- **Permisos por área**: `areaDe(empresaId, modulos, patron)` mirrors App.jsx gating (admin_contrato all; administrativo/operador only modules in `modulos`, list or legacy "a,b" string). RRHH collections write `puedeRRHH`, read `leeSueldos` (RRHH, Contabilidad, Finanzas, fleetcore); Finanzas collections write `puedeFinanzas`, read `leeFinanzas`; Contabilidad (`journal_entries`, `chart_of_accounts`, `periods`, `flujo_mensual`…) write `puedeContabilidad`. Keep `areaDe` doing ONE read of the user doc: chaining helpers that each `get()` exceeded the rules evaluation limit and failed whole requests.
- **Storage** (`storage.rules`): every `empresas/{id}/…` path checks membership via `firestore.get(users/{uid})`; labor files (contratos, finiquitos, anexos, documentos) only RRHH roles, plus the portal worker for his own folder. Fuel photos `reportes/{empresaId}/…`.
- **Cloud Functions**: HTTP functions acting for a user verify the Firebase idToken (`uidVerificado(req)`) and overwrite `callerUid`/`userId` from it. The client adds `Authorization: Bearer` to every call to the functions automatically (fetch wrapper in `src/lib/firebase.js`).
- **QR passwords** live only in `empresas/{id}/credenciales_qr/{trab_<id>|user_<uid>}` (`src/lib/credencialesQR.js`, office only); old plain-text `password` fields are moved there when an admin opens Admin → Operadores/Usuarios.
- PINs: the hash lives only in `pins/{usuario}` and is NOT readable from the app; verification, existence check and Documentos login go through the Cloud Function `verificarPinFirma` (lockout 15 min after 5 failures). `usuarios` docs can't carry `pinHash` (superadmin runs `migrarPinsUsuarios` once). Logout terminates Firestore and clears the offline cache.
- Linking by email (operator via `trabajadorId`, admin via `adminEmail`) requires `email_verified`; EmpresaSetup offers to send the verification email.
- Finiquito: besides the client, `onFiniquitoGuardado` (Functions, Admin SDK) marks linked users `finiquitado`, revokes their sessions and deletes the QR credential.
- Assistant quota: `api/agente/chat.js` increments `agente_uso/{uid}_{AAAA-MM-DD}` with the user's own token; rules only allow +1 up to 300/day (429 after that).
- Rule tests: `tests/reglas/test.mjs` (Firestore + Storage emulator).

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


### Datos maestros compartidos
- **Terceros por RUT** (`src/lib/terceros.js` over the `proveedores` master): `asegurarTerceros(empresaId, [{rut, razonSocial}])` creates missing fichas (stable id `rut_<rutNormalizado>`, never overwrites) and returns rut→id; the OC, subcontratos, rendiciones and deuda importers store `proveedorId` on each document. Finanzas → Proveedores has "Maestro único de proveedores" (`planificarUnificacion`/`aplicarUnificacion`) to create fichas and link existing documents, and groups suppliers by RUT.
- **Clientes por RUT** (`src/lib/clientes.js` over `rentalClients` — THE clients master, no parallel collection; pure matching in `src/lib/clientesBase.js`, RUT helpers in `src/lib/rut.js`): `asegurarClientes(empresaId, [{rut, razonSocial}], origen)` creates missing fichas (id `rut_<rut>`, matching existing docs by normalized RUT whatever their id, never overwrites); `clienteDe(lista, {clienteId, rut, nombre})` matches id → RUT → unique normalized name. Projects carry `clienteId` (+ `mandante` text for display; Admin → Proyectos selector, "Vincular mandantes" plan/apply); Rental `upsertRentalClient` dedupes with the same helper; Control de ventas groups by client (OT = the project's `clienteId`), Finanzas `cobrosDeCuenta` matches clienteId/RUT before name, and income accounts of the cash flow pick their client from the master in ModalCuenta (`SelectorCliente.jsx`: select, inline create by RUT via `asegurarCliente`, suggestion by name for old text-only accounts, the obra's `clienteId` prefilled) storing `clienteId`/`clienteRut`/`cliente` (also in proposal accounts); the RCV de ventas modal offers (unchecked) to add missing RUTs. Rule: Rental roles write; Contabilidad/Finanzas/OT (`areaDe`) may only create `rut_<rutNormalizado>` docs.
- **Obras = centros de costo** (`src/lib/obras.js`): RRHH `centros_costo` docs carry `projectId` (select in RRHH → Centros de costo, plus "Crear desde obras"). `obraDe({obras, centros}, {codigo, nombre})` maps a cost-center code/name or unit to a project; the Rendiciones import uses it.
- **Imports without duplicates** (`src/lib/importacion.js`, `guardarSinDuplicar`): OC (N° OC + obra) and subcontratos (SC + línea + EP + cuenta + descripción + obra) re-imports update instead of creating new docs, and delete old duplicates.

- **Combustible por máquina** (`src/lib/combustible.js`, `listarConsumosCombustible`): Oficina Técnica screens (Combustible, Dashboard, Consolidado, Estado de pago) read WorkFleet deliveries (`reportes_combustible`, tipo "entrega") plus the Excel `fuelLogs`; a dispatch present in both (same machine, day, liters ±1) counts once (`fuente: "ambas"`). WorkFleet entries are read-only there. `listFuelLogsByRange` stays Excel-only (the Excel importer relies on it). Each consumption is priced with the price per liter of the latest WorkFleet fuel purchase (entrada, `precioPorLitro` or total ÷ liters) on or before its date, same project first (`valorizarConsumos`, `costoConsumo(c, precioRespaldo)`); screens fall back to their old price when there is none.

- **Maestro de máquinas** (`src/lib/maquinas.js`): one `machines` doc per physical machine, unique key = patente (ignoring dashes/spaces; internal `code` when there is no patente). Master screens: Admin → Máquinas (identification, propiedad, obra, activa) and Maquinaria → Equipo (obra, centro de costo, horómetro, mantención); Finanzas/Contabilidad edit values and depreciation, Oficina Técnica the tariffs. Every writer goes through `guardarMaquina(empresaId, datos, { id, original, origen })` (merge, writes only fields that changed vs `original`, so a screen never overwrites another area's fields; creating a duplicate throws `MaquinaDuplicada`) or `asegurarMaquina` (importers/combustible: reuse the existing ficha, only fill empty fields). `upsertMachine` in `db.js` delegates to it. Vocabulary: `ownership` OWN | LEASING | CREDITO_AUTO | RENTED (`esPropia`/`esArrendada`), `active` (never `activo`; `estaActiva` reads both), `tipo` = asset class (maquinaria/vehiculo/herramienta/otro) and `type` = equipment kind ("Excavadora"). Admin → Máquinas → "Revisar maestro" (`UnificarMaquinas.jsx`) normalizes old fichas and merges duplicates: `fusionarMaquinas` re-points every `machineId`/`maquinaId`/`activoVinculadoId` (also nested, e.g. `datosEntrega.machineId`, `lineas[].machineId`) in `REFERENCIAS_MAQUINA`, fills the kept ficha with data only the others had, and deletes them. Capacitación never writes real data (`simularAlta`).
  - **Historial de obras**: `projectId` is the current obra; `historialObras: [{ projectId, desde, hasta }]` (AAAA-MM-DD, `hasta: null` = current) is maintained by `guardarMaquina` whenever `projectId` changes (`fechaObra` option, default today). `listMachines(empresaId, projectId, { desde, hasta, soloActual })` returns machines that were in the obra in that range (`estuvoEnObra`), so past reports keep a machine after it moves; OT → Equipos uses `soloActual`. Shown and editable in Maquinaria → Equipo (`HistorialObras.jsx`).
  - **Surtidores**: fuel trucks are machines with `esSurtidor: true` (+ `capacidad`). `cargarSurtidores` also returns docs still in the legacy `equipos_surtidores` collection; "Revisar maestro" migrates them (`migrarSurtidores`: same id, or merged into the machine with that patente and references re-pointed, `equipoSurtidorId` included). Admin → Surtidores writes to the master.
  - **Activos**: Finanzas → Activos and Contabilidad → Activos fijos render the same `src/pages/activos/ActivosPagina.jsx` (Finanzas passes its project selector).

- **Partes diarios por máquina** (`src/lib/partesDiarios.js`, `listarLogsObra`): Oficina Técnica (Dashboard, Detalle Flota) reads `dailyLogs` (Excel) plus WorkFleet `reportes_detallados` mapped to the dailyLogs shape (hours = horómetro final − inicial, or the sum of activities; detenida → standby 24, mantención/fuera de servicio → downtime 24). One record per machine and day: when both exist the Excel wins (`fuente: "ambas"`, `diferenciaHoras`/`discrepancia` if they differ by more than 0,5 h); WorkFleet-only rows are read-only. Registro Diario edits dailyLogs only and shows the WorkFleet report as reference. `listLogsByRange` stays Excel-only (the importer relies on it).

- **Maestro de trabajadores** (`src/lib/trabajadores.js`): one `trabajadores` doc per RUT (`rutTrabajador` normalizes dots/dash). RRHH owns the ficha; other writers (OT payroll importer, WorkFleet combustible, Admin → Operadores) find by RUT (`getEmployeeByRut`, `asegurarTrabajador`) and only fill empty fields. Admin → Operadores → "Revisar duplicados" merges fichas with the same RUT (`fusionarTrabajadores` re-points `trabajadorId`/`employeeId`/`operadorId`/`receptorId`/`repartidorId`… in `REFERENCIAS_TRABAJADOR`).

- **Fechas**: calendar dates are "AAAA-MM-DD" strings in Chile time — use `src/lib/fechas.js` (`hoyISO`, `fechaISO`, `desdeISO`, `partesISO`, `serialExcelAISO`), never `toISOString().slice(0,10)` or `new Date("AAAA-MM-DD").getMonth()`.

- **Costos e ingresos de obra, fuente única** (`src/lib/costosObra.js`): OC = **facturado** (`costoOC`, `costoItemOC`; comprometido only as info via `comprometidoOC`); subcontratos = `montoEP` in the **mes asociado** (`mesSubcontrato`, `costoSubcontratos`, `subcontratosDelPeriodo`), balance once per contract (`saldoSubcontratos` — each EP line repeats the contract balance, never sum it per row); mandante income = **venta bruta** (`ventaOT`: EP + reajustes + multas with sign), retención shown apart (`retencionOT`). Used by OT Dashboard/Consolidado/Estado de pago, Finanzas Obras/Reportes/Proveedores and Control de ventas. Finanzas → Obras adds labor (`manoObra.js`) and fuel (`combustible.js`) so an obra's cost matches the OT Dashboard. Maintenance cost per obra: `src/lib/mantencionObra.js` (`costosMantencionObra`, obra by `obraEnFecha`). The camión aljibe (`combustibleRegistros`) precedence for a month lives in `listarConsumosCombustible`; manual diesel price is `fuelPrices/current`.
- **Baja de máquina**: `darDeBajaMaquina` (`fechaBaja`, `motivoBaja`; refuses with an active rental contract; closes the obra tramo), `activaEn`; periods use `activaEnPeriodo` (`src/lib/maquinasPeriodo.js`). Depreciation runs until the month of `fechaBaja`. Admin → Máquinas deletes only without references, else offers "Dar de baja". Obras: `obraDuplicada` (src/lib/obras.js) on every create path; `deleteProject` refuses when referenced.
- **Finiquito corta el acceso**: saving a finiquito sets linked `users` to `finiquitado` and deletes the QR credential; rules (`canWriteEmpresa`, `areaDe`, `esOficina`) require `users.estado` absent or `activo`; pickers hide non-active workers.
- **Depreciación**: Activos (`ActivosPagina`) uses the same `depreciacion.js` as Contabilidad (vida útil table in `src/lib/contabilidad/vidaUtil.js`); leasing/arrendadas shown as "no se deprecia". **Leasing por máquina**: `leasingMensualPorMaquina` (`src/lib/finanzas/costosFijos.js`, from costos_fijos linked by `activoVinculadoId`, in pesos) with fallback to `machines.leasingMensual`; used by Rental profitability and dashboards. Costos fijos by month: `costoVigenteEnMes`/`costoDelMesEnPesos`.
- **Agente = pantallas**: `calcularFlujoMensual`/`normalizarFlujoMensual` (tributario.js) shared by the Flujo Mensual screen and `resumen_tributario`; deuda aggregation in `src/lib/finanzas/deuda.js` shared by FinanzasDeuda and the agent.

- **Mano de obra por obra** (`src/lib/manoObra.js`): Oficina Técnica (Dashboard, Consolidado, Estado de pago) takes labor cost from RRHH liquidaciones (`costosManoObraRRHH` in `src/pages/rrhh/resumenContable.js`: haberes + aportes per worker and month, project = the worker's cost center → `obraDe`, else `trabajador.projectId`; borradores included; cached 5 min) and falls back to the Excel `employeeMonthlyData` only for months with no RRHH data for that project. Rows carry `fuente`.

### Rental de maquinaria: moneda (CLP / UF)
Cotizaciones, OC, contratos y estados de pago (`src/lib/rental.js`, pages `src/pages/maquinaria/Rental*.jsx`) can be in pesos or UF (`moneda`). The quote (or a manual contract) sets it; its OC, contract, enmiendas and EEPP inherit it, and a contract's currency can't change once it has OC/EEPP. In UF, tariffs and amounts are stored with 2 decimals in `*UF` fields (`netoUF`, `montoNetoUF`, `netoMensualUF`…) and the usual fields (`neto`, `montoNeto`, `netoMensual`, `total`…) stay in **pesos** (at the document's `valorUF`), so cobranza, rentabilidad and KPIs keep summing pesos. OC/contract balances are controlled in the document currency (`saldoOC`/`saldoContrato` return `moneda` and `saldoPesos` for cross-document sums). Each EEPP in UF stores the UF it is billed with; the UF of the day comes from `obtenerIndicadores` (`src/lib/finanzas/monedas.js`).

### Diseño de Contabilidad
Contabilidad uses the same "cuaderno" design system as Finanzas: `AppShellLayout variante="cuaderno"`, `html.cuaderno-activo` while mounted, and every screen/modal built from `src/pages/finanzas/cuaderno.jsx` (Titulo, Hoja, Cifra, LineaGuia, Resaltado, Nota, Boton, Campo, ModalCuaderno…). In Contabilidad every amount uses `<Cifra escala="pesos">` (Cifra's default divides by 1000). No gradients, bold, emojis or colored pills. The printed PDFs (`ContabilidadExportPDF.jsx` generators) keep their own design.

### Flujo Mensual tributario (Contabilidad)
`Contabilidad → Flujo Mensual` (`src/pages/contabilidad/ContabilidadFlujoMensual.jsx`) is the tax base per month (14 A: devengado, by document date; 14 D N°3: cash). In 14 A the RCV column "Monto Neto Activo Fijo" is excluded from Compras (it is depreciated: rows Depreciación / Corrección monetaria). The rules that depend on the law live in `src/lib/contabilidad/tributario.js` (pure): Primera Categoría rate by regime **and year** (14 D N°3: 12,5% 2025-2027, 15% 2028, 25% 2029+), PPM rate, tax on the **accumulated** base (`impuestoMensualAcumulado`), and RCV summaries (`resumirRCVCompras` / `resumirRCVVentas`).

- Compras from the RCV = neto + exento − NC + IVA no recuperable + impuesto sin derecho a crédito + otros impuestos no recuperables. "Codigo Otro Impuesto": 28 diésel (recoverable by `dieselRecuperablePct`), 15 IVA retenido (credit); any other/unknown code is treated as cost and flagged "revisar".
- RCV import splits documents by **Fecha Docto** (`repartirRCVPorMes`; default, devengado) or loads all in one month. Each RCV period's contribution per month is stored in `rcv.periodos[filaId]["YYYY-MM"].porMes`; `aplicarAporteRCV` subtracts the previous contribution of that period before adding the new one, so re-importing never duplicates and manual amounts survive. Months of another year (e.g. December invoices in January's RCV) are written right away to that year's doc.
- Purchases from leasing, banks and factoring come in the RCV too: `separarRCVPorFila` moves them by supplier RUT to Leasing / Gastos financieros / Arriendos (reclassification, the tax base doesn't change). Rules live in `configTributaria.reglasFilaRCV` (`{ rutSinPuntos: { fila, nombre } }`, defaults in `REGLAS_FILA_RCV_DEFECTO`) and are edited from the import modal; names that look financial without a rule are suggested. Bank-loan interest isn't invoiced, so it is not in the RCV.
- RCV CSVs must be read with `XLSX.read(..., { raw: true })`: with `raw: false` XLSX parses dd/mm/yyyy as mm/dd and turns dates into serial numbers, so documents land in the wrong month.
- The same import button takes Talana's payroll book ("Libro remuneraciones completo" .xlsx, detected by the "Rut del Trabajador" column; logic in `src/lib/contabilidad/remuneraciones.js`). Remuneraciones = Remuneración Total − IAS − vacaciones pendientes + employer contributions (SIS, cesantía empleador + fondo solidario, accidentes, reforma: capitalización + expectativa de vida — the columns after the deductions; the "… Patronal/Empresarial" ones among the deductions are charged to the worker and are not company cost). Finiquitos = IAS + vacaciones − Descuento AFC. Loaded in the book's Año/Mes (devengado) through `aplicarAporteRCV`, so re-importing replaces. A finiquito-only row repeated with the same amount inside another row of the same worker is counted once and flagged.
- It also takes the SII "boletas de honorarios recibidas" report (annual: one row per month; monthly: one row per boleta), logic in `src/lib/contabilidad/honorarios.js`. Honorarios = BRUTO of vigentes (anuladas excluded; withholding is part of the bruto). SII `.xls` files are HTML tables in Windows-1252: decode with `leerTextoDetectando` and `XLSX.read(text, { type: "string" })`, or the "ñ" eats the year. Stored as one period per month ("YYYY-MM") so annual and monthly reports replace each other instead of adding up.
- And the fixed-asset kardex (one sheet per year with "V. Residual" and "Restante"; `src/lib/contabilidad/kardex.js`): Depreciación of year X = residual at the close of the latest earlier sheet ÷ remaining months, per asset, for min(12, remaining) months (straight line on what is left). The old kardex formula (gross value ÷ remaining months × 12) over-depreciates and is only shown for comparison. Stored under period `kardex-YYYY`.
- Rindegastos expense report ("ReporteGastos", detected by "Propietario del Gasto" + "Monto Aprobado"; `src/lib/contabilidad/rendiciones.js`) → Rendiciones, by "Fecha de Emisión". Counts boletas/peajes/vouchers and (optionally) comprobantes de egreso; excludes facturas (already in the RCV → double count), boletas de honorarios (in Honorarios) and rejected expenses; "en revisión" and "DTE no recibido" facturas are toggles in the modal. In the months the report covers, the imported amount replaces manual estimates.
- **"Traer de FleetCore"** (preferred over the file imports): Remuneraciones/Finiquitos from RRHH via `src/pages/rrhh/resumenContable.js` (`resumenRRHHAnio`: same engine as the LRE — `liquidacionDe` + `filaLRE`, Remuneraciones = LRE 5201 + 5410; Finiquitos = `calcularFiniquito().totalHaberes` in the termination month, minus the month's salary if that month also has a liquidación; borradores excluded unless chosen) and Rendiciones from Oficina Técnica's `rendiciones` collection (`resumirRendicionesDocs`, same rules as the Rindegastos file). Each month with source data is fixed with `fijarMesDesdeFuente` (period `rrhh-YYYY-MM` / `ot-YYYY-MM`): it removes what other imports contributed to that month and replaces manual values. Months without source data keep the Talana/Rindegastos imports.
- Oficina Técnica's Rendiciones import keeps every rendición unit (each linked to the project whose name matches the unit, or to the selected project for "Nuevo Cobre", else no project) and uses a stable key, so re-importing updates instead of duplicating and removes old duplicates.
- `perdidaArrastre` (per-year doc field, from last year's F22) is subtracted from the accumulated base before the tax (`impuestoMensualAcumulado(base, tasa, perdida)`); no cap applies as of 2026.
- Utilidad Líquida = Base Imponible − Impto − Multas (multas are not deductible, so they don't touch the base).
- **Control de ventas** (collapsible sheet under the Flujo Mensual table, read-only, `src/lib/contabilidad/ventasControl.js`): Ingresos row vs Rental EEPP (`rentalPayments`, neto by `fechaEmision`, no anulados; flags EEPP without `factura.numero` or invoiced in another month) + OT `estadoPagoIngresos` (estadosPago + reajustes + multas, not retenciones). Never touches the tax base.
- **Centralización de remuneraciones** (Libro Diario → Importar → "Centralizar remuneraciones (RRHH)", `ContabilidadCentralizacion.jsx`): one asiento per month from `codigosLREMes` (resumenContable.js, same engine as the LRE). Pure builder `src/lib/contabilidad/centralizacion.js` (tests in `centralizacion.test.js`); mapping concept→account in `empresas/{id}/config/centralizacion`; `importHash = rrhh-centralizacion-YYYY-MM`, an existing one is reversed (not deleted) before re-registering.
- **Cuentas de costo OT → plan contable** (Plan de cuentas → "Cuentas de costo de Oficina Técnica", `ContabilidadMapeoOT.jsx`): each `src/lib/planCuentas.js` code ("1.1"…"5.25") → `chart_of_accounts` id, stored in `empresas/{id}/config/mapeoCuentas.mapeo`; pure helpers + name-similarity suggestions in `src/lib/contabilidad/mapeoCuentas.js` (`sugerirCuenta`, `cuentaDeCodigoOT`, `resolverCodigoOT`; tests in `mapeoCuentas.test.js`).
- The purchases importer (`ContabilidadImportIConstruct.jsx`) uses it: code from the document (iConstruye cost-code/OC column, if present) or the supplier's dominant code (≥80%) in OT `purchaseOrders`/`subcontratos` by RUT; priority learned rule > OT code > name regex; fuel and sales untouched. RRHH's old non-persistent payroll plan (`PLAN_CUENTAS_DEFAULT`) was removed; its tab points to the centralización.
- Tax config (regime, >50.000 UF, PPM 14 A, % diésel) is stored in `empresas/{id}/config/tributario` and shared through `ContabilidadContext` (`configTributaria`, `guardarConfigTributaria`); the Tributario tab uses the same regime.
