// Pruebas del mapeo cuentas de costo OT → plan contable.
// Ejecutar: node src/lib/contabilidad/mapeoCuentas.test.js
import assert from "node:assert/strict";
import {
  sugerirCuenta, sugerirMapeoOT, cuentaDeCodigoOT, normalizarCodigoOT, codigoDominante,
  codigosOTPorRut, aplicarCuentaAsiento, cuentasDeCosto, resolverCodigoOT,
} from "./mapeoCuentas.js";
import { PLAN_CUENTAS } from "../planCuentas.js";

const cuentas = [
  { id: "caja", codigo: "1-01-001", nombre: "Caja", tipo: "activo_corriente" },
  { id: "cxp", codigo: "2-01-001", nombre: "Cuentas por Pagar", tipo: "pasivo_corriente" },
  { id: "mo", codigo: "5-01-001", nombre: "Costo Mano de Obra", tipo: "costo" },
  { id: "mat", codigo: "5-01-002", nombre: "Materiales y Suministros", tipo: "costo" },
  { id: "comb", codigo: "5-01-003", nombre: "Combustible y Lubricantes", tipo: "costo" },
  { id: "arrmaq", codigo: "5-01-004", nombre: "Arriendo Maquinaria", tipo: "costo" },
  { id: "flete", codigo: "5-01-005", nombre: "Fletes y Transportes", tipo: "costo" },
  { id: "aloj", codigo: "5-01-006", nombre: "Alojamiento y Alimentación", tipo: "costo" },
  { id: "gg", codigo: "6-01-003", nombre: "Gastos Generales", tipo: "gasto_adm" },
  { id: "banc", codigo: "6-02-002", nombre: "Gastos Bancarios", tipo: "gasto_fin" },
  { id: "int", codigo: "6-02-003", nombre: "Intereses Bancarios", tipo: "gasto_fin" },
  { id: "vieja", codigo: "5-09-999", nombre: "Materiales viejos", tipo: "costo", activa: false },
];

// normalizarCodigoOT
assert.equal(normalizarCodigoOT("3.2 MATERIALES OBRAS CIVILES"), "3.2");
assert.equal(normalizarCodigoOT(" 03.02 "), "3.2");
assert.equal(normalizarCodigoOT("5,22"), "5.22");
assert.equal(normalizarCodigoOT("sin código"), "");

// cuentasDeCosto: solo resultado (costo/gasto) y activas
assert.deepEqual(cuentasDeCosto(cuentas).map(c => c.id).sort(),
  ["aloj", "arrmaq", "banc", "comb", "flete", "gg", "int", "mat", "mo"]);

// sugerirCuenta por nombre y por categoría
const id = (codigo, nombre) => sugerirCuenta(codigo, nombre, cuentas)?.id || null;
assert.equal(id("1.1", "MANO DE OBRA DIRECTO"), "mo");
assert.equal(id("1.2", "MANO DE OBRA INDIRECTO"), "mo");
assert.equal(id("3.2", "MATERIALES OBRAS CIVILES"), "mat");
assert.equal(id("3.4", "ASFALTO"), "mat", "categoría 3 cae en materiales aunque el nombre no calce");
assert.equal(id("4.1", "DIÉSEL"), "comb");
assert.equal(id("4.2", "BENCINA"), "comb");
assert.equal(id("2.5", "FLETES DE MAQUINARIA"), "flete", "el nombre gana a la pista de categoría");
assert.equal(id("5.1", "ALOJAMIENTOS"), "aloj");
assert.equal(id("5.22", "GASTOS BANCARIOS Y FINANCIEROS"), "banc");
assert.equal(id("5.13", "GASTOS ARQUEOLÓGICOS"), "gg", "gasto de obra sin cuenta propia → gastos generales");
assert.equal(sugerirCuenta("3.2", "MATERIALES", []), null);
assert.equal(sugerirCuenta("9.9", "ZZZ", cuentas), null);

// sugerirMapeoOT respeta lo guardado y descarta cuentas que ya no existen
const m = sugerirMapeoOT(PLAN_CUENTAS, cuentas, { "3.2": "gg", "4.1": "borrada" });
assert.equal(m["3.2"], "gg");
assert.equal(m["4.1"], "comb");
assert.equal(m["1.1"], "mo");
assert.ok(Object.keys(m).length >= 40, "casi todo el plan OT recibe sugerencia");

// cuentaDeCodigoOT
const mapeo = { "3.2": "mat", "5.22": "banc" };
assert.equal(cuentaDeCodigoOT(mapeo, "3.2"), "mat");
assert.equal(cuentaDeCodigoOT(mapeo, "3.2 MATERIALES OBRAS CIVILES"), "mat");
assert.equal(cuentaDeCodigoOT(mapeo, "03.2"), "mat");
assert.equal(cuentaDeCodigoOT(mapeo, "3.3"), null);
assert.equal(cuentaDeCodigoOT(null, "3.2"), null);
assert.equal(cuentaDeCodigoOT(mapeo, ""), null);

// codigoDominante
assert.deepEqual(codigoDominante([{ codigo: "3.2", monto: 900 }, { codigo: "3.9", monto: 100 }]), { codigo: "3.2", participacion: 0.9 });
assert.equal(codigoDominante([{ codigo: "3.2", monto: 600 }, { codigo: "2.1", monto: 400 }]), null);
assert.equal(codigoDominante([]), null);
assert.equal(codigoDominante([{ codigo: "3.2", monto: 500 }, { codigo: "", monto: 500 }]), null, "lo sin código cuenta en el total");
assert.equal(codigoDominante([{ codigo: "001-1", monto: 500 }]), null, "un centro de gestión no es un código OT");

// codigosOTPorRut: OC (por facturado) + subcontratos (por montoEP)
const porRut = codigosOTPorRut({
  ordenes: [
    { rutProveedor: "76.123.456-7", items: [{ codigoCC: "3.2", facturado: 1000 }, { codigoCC: "3.9", facturado: 50 }] },
    { rutProveedor: "77.000.000-1", items: [{ codigoCC: "3.2", facturado: 500 }, { codigoCC: "2.6", facturado: 500 }] },
    { rutProveedor: "78.000.000-2", items: [{ codigoCC: "", cuentasCosto: "5.8 ELEMENTOS DE PROTECCIÓN PERSONAL (EPP)", subTotal: 300 }] },
  ],
  subcontratos: [{ rutSubcontratista: "79.111.222-3", codigoCuentaCosto: "2.1", montoEP: 5000 }],
});
assert.equal(porRut["761234567"].codigo, "3.2");
assert.equal(porRut["761234567"].fuente, "OC");
assert.equal(porRut["770000001"], undefined, "mitad y mitad: no se adivina");
assert.equal(porRut["780000002"].codigo, "5.8");
assert.equal(porRut["791112223"].codigo, "2.1");
assert.equal(porRut["791112223"].fuente, "subcontrato");

// aplicarCuentaAsiento: factura (debe) y NC (haber), mueve también el exento
const factura = {
  lineas: [
    { cuentaId: "gg", cuentaNombre: "Gastos Generales", debe: 1000, haber: 0 },
    { cuentaId: "gg", cuentaNombre: "Gastos Generales", debe: 200, haber: 0 },
    { cuentaId: "ivacf", cuentaNombre: "IVA Crédito Fiscal", debe: 190, haber: 0 },
    { cuentaId: "cxp", cuentaNombre: "Cuentas por Pagar", debe: 0, haber: 1390 },
  ],
};
const f2 = aplicarCuentaAsiento(factura, cuentas.find(c => c.id === "mat"), "3.2 → Materiales");
assert.deepEqual(f2.lineas.map(l => l.cuentaId), ["mat", "mat", "ivacf", "cxp"]);
assert.equal(f2.lineas[0].descripcion, "3.2 → Materiales");
assert.equal(factura.lineas[0].cuentaId, "gg", "no muta el original");
const nc = { _esNC: true, lineas: [
  { cuentaId: "cxp", cuentaNombre: "Cuentas por Pagar", debe: 119, haber: 0 },
  { cuentaId: "gg", cuentaNombre: "Gastos Generales", debe: 0, haber: 100 },
  { cuentaId: "ivacf", cuentaNombre: "IVA Crédito Fiscal", debe: 0, haber: 19 },
] };
assert.deepEqual(aplicarCuentaAsiento(nc, { id: "mat", nombre: "Materiales" }).lineas.map(l => l.cuentaId), ["cxp", "mat", "ivacf"]);
assert.equal(aplicarCuentaAsiento({ lineas: [] }, { id: "mat" }).lineas.length, 0);

// resolverCodigoOT: documento > OC citada > dominante del proveedor
const ctx = {
  ordenesPorNumero: { "1234": { numeroOC: "1234", items: [{ codigoCC: "2.6", facturado: 100 }] } },
  porRut,
};
assert.deepEqual(resolverCodigoOT({ rut: "76123456-7", facturas: [{ _neto: 100, _codigoOT: "5.8" }] }, ctx), { codigo: "5.8", fuente: "documento" });
assert.deepEqual(resolverCodigoOT({ rut: "76123456-7", facturas: [{ _neto: 100, _numeroOC: "1234" }] }, ctx), { codigo: "2.6", fuente: "OC 1234" });
assert.deepEqual(resolverCodigoOT({ rut: "76.123.456-7", facturas: [{ _neto: 100 }] }, ctx), { codigo: "3.2", fuente: "OC del proveedor" });
assert.equal(resolverCodigoOT({ rut: "1-9", facturas: [{ _neto: 100 }] }, ctx), null);

console.log("mapeoCuentas: OK");
