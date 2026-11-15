// Pruebas de la centralización de remuneraciones y del control de ventas.
// Ejecutar: node src/lib/contabilidad/centralizacion.test.js
import assert from "node:assert/strict";
import { construirCentralizacion, montosCentralizacion, sugerirMapeo, finDeMes, hashCentralizacion, CONCEPTOS_CENTRALIZACION } from "./centralizacion.js";
import { controlVentas } from "./ventasControl.js";

const cuadra = (r) => assert.equal(r.totalDebe, r.totalHaber, `debe ${r.totalDebe} ≠ haber ${r.totalHaber}`);
const mapeoTodo = Object.fromEntries(CONCEPTOS_CENTRALIZACION.map(k => [k.id, "c_" + k.id]));

// 1) Mes típico: códigos LRE sumados (totales con la misma lógica de filaLRE)
const haberes = { 2101: 1500000, 2106: 200000, 2301: 60000, 2302: 40000, 2311: 22000 };
const desc = { 3141: 180000, 3143: 119000, 3144: 15000, 3151: 10200, 3161: 25000, 3185: 5000, 3188: 100000, 3110: 8000 };
const aportes = { 4151: 40800, 4152: 15640, 4155: 45000 };
const tot = (o) => Object.values(o).reduce((a, b) => a + b, 0);
const c1 = {
  ...haberes, ...desc, ...aportes,
  5201: tot(haberes), 5301: tot(desc), 5410: tot(aportes), 5501: tot(haberes) - tot(desc),
  saludIsapre: 70000,
};
let r = construirCentralizacion(c1, mapeoTodo, []);
cuadra(r);
assert.equal(r.ajuste, 0);
assert.deepEqual(r.faltan, []);
const m = r.montos;
assert.equal(m.gasto_remuneraciones, tot(haberes) - 22000);
assert.equal(m.asignacion_familiar, 22000);
assert.equal(m.gasto_leyes_sociales, tot(aportes));
assert.equal(m.afp_por_pagar, 180000 + 45000);
assert.equal(m.fonasa_por_pagar + m.isapre_por_pagar, 134000);
assert.equal(m.isapre_por_pagar, 70000);
assert.equal(m.afc_por_pagar, 10200 + 40800);
assert.equal(m.mutual_por_pagar, 15640);
assert.equal(m.iut_por_pagar, 25000);
assert.equal(m.anticipos, 100000);
assert.equal(m.ccaf_por_pagar, 8000);
assert.equal(m.otros_descuentos, 5000);
assert.equal(r.totalDebe, tot(haberes) + tot(aportes));

// 2) Líquido negativo informado en 0 → diferencia a Remuneraciones por pagar
const c2 = { 2101: 100000, 3188: 150000, 5201: 100000, 5301: 150000, 5410: 0, 5501: 0 };
r = construirCentralizacion(c2, mapeoTodo, []);
cuadra(r);
assert.equal(r.ajuste, -50000);
const liq = r.lineas.find(l => l.concepto === "remuneraciones_por_pagar");
assert.equal(liq.debe, 50000);   // negativo → al debe

// 3) Sin mapeo: se informa qué falta
r = construirCentralizacion(c1, {}, []);
assert.ok(r.faltan.includes("gasto_remuneraciones"));
cuadra(r);

// 4) Mes vacío: sin líneas
r = construirCentralizacion({}, mapeoTodo, []);
assert.equal(r.lineas.length, 0);
assert.equal(montosCentralizacion({}).gasto_remuneraciones, 0);

// 5) Sugerencia por nombre
const cuentas = [
  { id: "a", nombre: "Remuneraciones por Pagar", tipo: "pasivo_corriente" },
  { id: "b", nombre: "Costo Mano de Obra", tipo: "costo" },
  { id: "c", nombre: "AFP por pagar", tipo: "pasivo_corriente" },
  { id: "d", nombre: "Anticipos al personal", tipo: "activo_corriente" },
];
const sug = sugerirMapeo(cuentas);
assert.equal(sug.remuneraciones_por_pagar, "a");
assert.equal(sug.gasto_remuneraciones, "b");
assert.equal(sug.afp_por_pagar, "c");
assert.equal(sug.anticipos, "d");
assert.equal(sugerirMapeo(cuentas, { afp_por_pagar: "a" }).afp_por_pagar, "a"); // respeta lo guardado

assert.equal(finDeMes("2026-02"), "2026-02-28");
assert.equal(finDeMes("2028-02"), "2028-02-29");
assert.equal(hashCentralizacion("2026-10"), "rrhh-centralizacion-2026-10");

// 6) Control de ventas
const rental = [
  { numero: "1", fechaEmision: "2026-03-10", neto: 1000000, estado: "facturado", factura: { numero: "55", fechaEmision: "2026-03-12" } },
  { numero: "2", fechaEmision: "2026-03-20", neto: 500000, estado: "pendiente" },
  { numero: "3", fechaEmision: "2026-03-28", neto: 300000, estado: "facturado", factura: { numero: "56", fechaEmision: "2026-04-02" } },
  { numero: "4", fechaEmision: "2026-03-28", neto: 999999, estado: "anulado" },
  { numero: "5", fechaEmision: "2025-03-28", neto: 999999, estado: "pagado" },
  { numero: "6", fechaEmision: "2026-05-01", monto: 119000, estado: "pendiente" },   // antiguo, con IVA
];
const ot = [
  { year: 2026, month: 3, estadosPago: 2000000, retenciones: -100000, reajuste: 50000, multas: -20000, reajustePolinomico: 0 },
  { year: 2025, month: 3, estadosPago: 9 },
];
const ventasRCV = Array(12).fill(0); ventasRCV[2] = 3200000;
const cv = controlVentas(rental, ot, 2026, ventasRCV);
assert.equal(cv[2].rental, 1800000);
assert.equal(cv[2].ot, 2030000);
assert.equal(cv[2].fleetcore, 3830000);
assert.equal(cv[2].diferencia, 3200000 - 3830000);
assert.equal(cv[2].sinFactura.length, 1);
assert.equal(cv[2].facturaOtroMes.length, 1);
assert.equal(cv[4].rental, 100000);

console.log("centralizacion.test.js OK");
