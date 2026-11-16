// node src/lib/finanzas/costosFijos.test.js
import assert from "node:assert/strict";
import {
  costoVigenteEnMes, costoDelMesEnPesos, montoMensual, leasingMensualPorMaquina, leasingDeMaquina, sumarMesesClave,
} from "./costosFijos.js";

const hoy = "2026-11-16";
assert.equal(sumarMesesClave("2026-11", 3), "2027-02");
assert.equal(sumarMesesClave("2026-01", -1), "2025-12");
assert.equal(montoMensual({ monto: 300, frecuencia: "trimestral" }), 100);
assert.equal(montoMensual({ monto: 300, frecuencia: "unico" }), 0);

// Empieza en marzo, 6 cuotas mensuales → marzo..agosto
const c = { monto: 1000, frecuencia: "mensual", fechaInicio: "2026-03-05", cuotasTotales: 6 };
assert.equal(costoVigenteEnMes(c, "2026-02", hoy), false);
assert.equal(costoVigenteEnMes(c, "2026-03", hoy), true);
assert.equal(costoVigenteEnMes(c, "2026-08", hoy), true);
assert.equal(costoVigenteEnMes(c, "2026-09", hoy), false);
// Fecha de término
assert.equal(costoVigenteEnMes({ monto: 1, fechaTermino: "2026-05-31" }, "2026-06", hoy), false);
assert.equal(costoVigenteEnMes({ monto: 1, fechaTermino: "2026-05-31" }, "2026-05", hoy), true);
// Inactivo
assert.equal(costoVigenteEnMes({ monto: 1, activo: false }, "2026-05", hoy), false);
// Sin inicio y todas pagadas → fuera desde el mes actual, dentro antes
const pag = { monto: 1, cuotasTotales: 3, cuotasPagadas: 3 };
assert.equal(costoVigenteEnMes(pag, "2026-11", hoy), false);
assert.equal(costoVigenteEnMes(pag, "2026-01", hoy), true);
// Pago único: completo en su mes
const u = { monto: 500, frecuencia: "unico", fechaInicio: "2026-04-10" };
assert.equal(costoDelMesEnPesos(u, "2026-04", null, hoy), 500);
assert.equal(costoDelMesEnPesos(u, "2026-05", null, hoy), 0);
// UF
assert.equal(costoDelMesEnPesos({ monto: 10, moneda: "UF" }, "2026-05", { uf: 40000 }, hoy), 400000);
assert.equal(costoDelMesEnPesos({ monto: 10, moneda: "UF" }, "2026-05", null, hoy), null);

// Leasing por máquina
const costos = [
  { id: "a", categoria: "leasing", activoVinculadoId: "m1", monto: 20, moneda: "UF", frecuencia: "mensual" },
  { id: "b", categoria: "leasing", activoVinculadoId: "m1", monto: 600000, frecuencia: "trimestral" },
  { id: "c", categoria: "leasing", activoVinculadoId: "m2", monto: 1, fechaTermino: "2026-01-01" },   // terminado
  { id: "d", categoria: "credito", activoVinculadoId: "m3", monto: 100 },
  { id: "e", categoria: "leasing", activoVinculadoId: "m4", monto: 100, fechaInicio: "2027-01-01" },  // aún no empieza
];
const pm = leasingMensualPorMaquina(costos, { uf: 40000 }, { hoy });
assert.equal(pm.get("m1").mensual, 800000 + 200000);
assert.equal(pm.has("m2"), false);
assert.equal(pm.has("m3"), false);
assert.equal(pm.has("m4"), false);
assert.equal(leasingMensualPorMaquina(costos, null, { hoy, categorias: ["leasing", "credito"] }).get("m3").mensual, 100);
assert.equal(leasingMensualPorMaquina(costos, null, { hoy }).get("m1").sinConvertir, 1);
assert.deepEqual(leasingDeMaquina({ id: "m1", leasingMensual: 5 }, pm), { monto: 1000000, fuente: "costos_fijos" });
assert.deepEqual(leasingDeMaquina({ id: "m9", leasingMensual: 5 }, pm), { monto: 5, fuente: "ficha" });
assert.deepEqual(leasingDeMaquina({ id: "m9" }, pm), { monto: 0, fuente: null });
console.log("costosFijos.test.js: OK");
