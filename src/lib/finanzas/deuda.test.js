// node src/lib/finanzas/deuda.test.js
import assert from "node:assert/strict";
import { agruparDeudaPorAcreedor, totalesDeuda, llaveAcreedor } from "./deuda.js";

const docs = [
  { proveedorSlug: "acme", proveedorNombre: "ACME LTDA", saldoPendiente: 1000, estado: "vencido", diasMora: 10, fechaVencimiento: "2026-10-01" },
  { proveedorSlug: "acme", proveedorNombre: "Acme Ltda.", saldoPendiente: 500, estado: "pendiente", fechaVencimiento: "2026-12-01" },
  { proveedorSlug: "acme", proveedorNombre: "ACME LTDA", saldoPendiente: -200, estado: "anticipo_excedente" },
  { proveedorId: "rut_1", proveedorNombre: "Beta", saldoPendiente: 300, estado: "parcial", fechaVencimiento: "2026-11-20" },
  { proveedorNombre: "Gamma", saldoPendiente: 0, estado: "pagado" },
];
assert.equal(llaveAcreedor(docs[3]), "rut_1");
const g = agruparDeudaPorAcreedor(docs);
const acme = g.find(a => a.key === "acme");
assert.equal(g.length, 3);
assert.equal(acme.saldoPendiente, 1300);      // neto: el anticipo rebaja
assert.equal(acme.saldoVencido, 1000);
assert.equal(acme.anticipos, -200);
assert.equal(acme.maxDiasMora, 10);
assert.equal(acme.proximoVencimiento, "2026-12-01");
assert.equal(acme.documentos, 3);
const t = totalesDeuda(docs);
assert.equal(t.saldoTotal, 1600);
assert.equal(t.saldoVencido, 1000);
assert.equal(t.saldoAnticipos, -200);
assert.equal(t.docsVencidos, 1);
assert.equal(t.docsPendientes, 2);
// La suma por acreedor cuadra con el total
assert.equal(g.reduce((s, a) => s + a.saldoPendiente, 0), t.saldoTotal);
console.log("deuda.test.js: OK");
