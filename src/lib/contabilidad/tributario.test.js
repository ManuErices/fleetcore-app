// Pruebas de la lógica pura del Flujo Mensual (sin Firebase).
// Ejecutar: node src/lib/contabilidad/tributario.test.js
import assert from "node:assert/strict";
import {
  aplicarAporteRCV, fijarMesDesdeFuente, mesesFijados, mesesOmitidosPorFuente, aportesRCV, cambiosDocFlujo,
  normalizarFlujoMensual, calcularFlujoMensual,
} from "./tributario.js";

const doc0 = () => ({
  anio: 2026,
  filas: [
    { id: "rendiciones", valores: Array(12).fill(0) },
    { id: "remuneraciones", valores: Array(12).fill(0) },
  ],
  rcv: {},
});
const val = (d, f, m) => d.filas.find(x => x.id === f).valores[m];

// 1) Marzo fijado desde Oficina Técnica; un Rindegastos de feb+mar omite marzo
let d = fijarMesDesdeFuente(doc0(), "rendiciones", 2, "ot-2026-03", 1000, {});
assert.deepEqual(mesesFijados(d, "rendiciones"), { 2: "ot-2026-03" });
assert.deepEqual(mesesOmitidosPorFuente(d, "rendiciones", { 1: 500, 2: 700 }), [2]);
d = aplicarAporteRCV(d, "rendiciones", "2026-03", { 1: 500, 2: 700 }, { archivo: "x" });
assert.equal(val(d, "rendiciones", 2), 1000);
assert.equal(val(d, "rendiciones", 1), 500);
assert.deepEqual(d.rcv.periodos.rendiciones["2026-03"].porMes, { 1: 500 });
assert.deepEqual(d.rcv.periodos.rendiciones["2026-03"].omitidosPorFuente, [2]);
// Reimportar el mismo archivo no cambia nada
d = aplicarAporteRCV(d, "rendiciones", "2026-03", { 1: 500, 2: 700 }, { archivo: "x" });
assert.equal(val(d, "rendiciones", 2), 1000);
assert.equal(val(d, "rendiciones", 1), 500);

// 2) Reemplazo pedido por el usuario: sale la fuente interna de ese mes
const e = aplicarAporteRCV(d, "rendiciones", "2026-03", { 1: 500, 2: 700 }, { archivo: "x" }, { reemplazarFijados: true });
assert.equal(val(e, "rendiciones", 2), 700);
assert.equal(val(e, "rendiciones", 1), 500);
assert.equal(e.rcv.periodos.rendiciones["ot-2026-03"], undefined);
assert.deepEqual(mesesFijados(e, "rendiciones"), {});

// 3) Archivo primero, fuente después: la fuente deja el mes en su monto, y
//    volver a importar el libro de Talana no suma encima
let f = aplicarAporteRCV(doc0(), "remuneraciones", "2026-04", { 3: 900 }, {});
f = fijarMesDesdeFuente(f, "remuneraciones", 3, "rrhh-2026-04", 1200, {});
assert.equal(val(f, "remuneraciones", 3), 1200);
f = aplicarAporteRCV(f, "remuneraciones", "2026-04", { 3: 900 }, {});
assert.equal(val(f, "remuneraciones", 3), 1200);
assert.equal(aportesRCV(f, "remuneraciones", 3).length, 1);

// 4) Datos ya duplicados por la versión anterior: reimportar los corrige
let g = doc0();
g.filas[1].valores[5] = 2000; // 1.200 de RRHH + 800 del archivo
g.rcv = { periodos: { remuneraciones: {
  "rrhh-2026-06": { porMes: { 5: 1200 } },
  "2026-06": { porMes: { 5: 800 } },
} } };
g = aplicarAporteRCV(g, "remuneraciones", "2026-06", { 5: 800 }, {});
assert.equal(val(g, "remuneraciones", 5), 1200);
assert.equal(g.rcv.periodos.remuneraciones["2026-06"], undefined);

// 5) Una fuente con monto 0 también fija el mes (RRHH: sin finiquitos)
let h = fijarMesDesdeFuente(doc0(), "remuneraciones", 7, "rrhh-2026-08", 0, {});
h = aplicarAporteRCV(h, "remuneraciones", "2026-08", { 7: 300 }, {});
assert.equal(val(h, "remuneraciones", 7), 0);

// 6) Sin fuente interna, reimportar reemplaza el aporte anterior como siempre
let k = aplicarAporteRCV(doc0(), "rendiciones", "2026-01", { 0: 100 }, {});
k.filas[0].valores[0] += 50; // algo escrito a mano se conserva
k = aplicarAporteRCV(k, "rendiciones", "2026-01", { 0: 150 }, {});
assert.equal(val(k, "rendiciones", 0), 200);

// 7) Guardado por campos: solo lo que cambió, bajando hasta rcv.periodos.fila.periodo
{
  const a = { anio: 2026, filas: [{ id: "x", valores: [1] }], multas: [0],
    rcv: { periodos: { compras: { "2026-01": { porMes: { 0: 1 } } } } } };
  const b = JSON.parse(JSON.stringify(a));
  assert.deepEqual(cambiosDocFlujo(a, b), {});
  b.multas = [5];
  b.rcv.periodos.compras["2026-02"] = { porMes: { 1: 2 } };
  b.rcv.periodos.honorarios = { "2026-01": { porMes: { 0: 3 } } };
  delete b.rcv.periodos.compras["2026-01"];
  const c = cambiosDocFlujo(a, b);
  assert.deepEqual(Object.keys(c).sort(), [
    "multas", "rcv.periodos.compras.2026-01", "rcv.periodos.compras.2026-02", "rcv.periodos.honorarios.2026-01",
  ]);
  assert.equal(c["rcv.periodos.compras.2026-01"], undefined);
  assert.ok(!("filas" in c));
}

// 9) Cálculo compartido planilla/agente: el signo de una fila fija viene de
//    FILAS_BASE (no del guardado) y el PPM solo de la fila Ingresos.
{
  const v = (x) => { const a = Array(12).fill(0); a[0] = x; return a; };
  const raw = {
    filas: [
      { id: "ingresos", label: "Ingresos", signo: 1, fija: true, valores: v(1000) },
      { id: "compras", label: "Compras", signo: 1, fija: true, valores: v(400) },          // signo guardado mal
      { id: "correccion_monetaria", label: "CM", signo: -1, fija: true, valores: v(50) },  // fija con signo +
      { id: "custom_1", label: "Otro ingreso", signo: 1, fija: false, valores: v(100) },
    ],
    multas: v(10),
  };
  const d = normalizarFlujoMensual(raw, 2026);
  assert.equal(d.impuestoAuto, true);
  const c = calcularFlujoMensual(d, { regimen: "14D3", ingresosSobre50milUF: false });
  assert.equal(c.baseImponible[0], 1000 - 400 + 50 + 100);
  assert.equal(c.tasa, 0.125);
  assert.equal(c.impuesto[0], Math.round(750 * 0.125));
  assert.equal(c.utilidad[0], 750 - Math.round(750 * 0.125) - 10);
  assert.equal(c.ppmSugerido[0], Math.round(1000 * 0.00125));   // solo Ingresos
  assert.equal(c.totalBaseImponible, 750);
  // Impuesto manual guardado se respeta
  const m = normalizarFlujoMensual({ ...raw, impuesto: v(99) }, 2026);
  assert.equal(m.impuestoAuto, false);
  assert.equal(calcularFlujoMensual(m, {}).impuesto[0], 99);
}

console.log("tributario.test.js: ok");
