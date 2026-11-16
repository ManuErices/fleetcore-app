// Pruebas del maestro de clientes (parte pura) y de sus cruces.
// Ejecutar: node src/lib/clientesBase.test.js
import assert from "node:assert/strict";
import {
  rutCliente, clienteDe, clientePorNombre, clientePorRut, claveCliente,
  planVincularMandantes, clientesDeRCVVentas,
} from "./clientesBase.js";
import { controlVentas, ventasPorCliente } from "./contabilidad/ventasControl.js";
import { cobrosDeCuenta, rutsEnTexto } from "./finanzas/referencias.js";

// RUT válidos: 76.086.428-5 y 96.790.240-3 (módulo 11)
const A = "76.086.428-5", B = "96.790.240-3";
assert.equal(rutCliente(A), "760864285");
assert.equal(rutCliente("76086428-4"), "");            // dígito malo
assert.equal(rutCliente(""), "");

const clientes = [
  { id: "c1", nombre: "Constructora Pérez SpA", rut: A },          // ficha antigua de Rental (id automático)
  { id: `rut_${rutCliente(B)}`, nombre: "Minera Sur S.A.", rut: B, rutNormalizado: rutCliente(B) },
  { id: "c3", nombre: "Transportes Lagos Ltda", rut: "" },
  { id: "c4", nombre: "Transportes Lagos", rut: "", activo: false },  // mismo nombre: ambiguo
];

// clienteDe: id → RUT → nombre único
assert.equal(clienteDe(clientes, { clienteId: "c1" }).id, "c1");
assert.equal(clienteDe(clientes, { rut: "76086428-5" }).id, "c1");
assert.equal(clienteDe(clientes, { nombre: "CONSTRUCTORA PEREZ" }).id, "c1");
assert.equal(clienteDe(clientes, { nombre: "minera sur" }).id, `rut_${rutCliente(B)}`);
assert.equal(clienteDe(clientes, { nombre: "Transportes Lagos" }), null, "nombre ambiguo no calza");
assert.equal(clienteDe(clientes, { nombre: "Constructora Pérez", rut: B }).id, `rut_${rutCliente(B)}`, "RUT manda sobre el nombre");
assert.equal(clienteDe(clientes, { nombre: "Constructora Pérez", rut: "11.111.111-1" }), null, "RUT distinto al de la ficha que calza por nombre");
assert.equal(clientePorRut(clientes, "760864285").id, "c1");
assert.equal(clientePorNombre(clientes, "Otra"), null);
assert.equal(claveCliente(clientes, { nombre: "Nadie", rut: "11.111.111-1" }).clave, "rut:111111111");
assert.equal(claveCliente(clientes, { nombre: "Nadie S.A." }).clave, "nom:NADIE");

// Vincular mandantes
const obras = [
  { id: "p1", name: "Ruta 5", mandante: "CONSTRUCTORA PEREZ SPA" },
  { id: "p2", name: "Puente", mandante: "Vialidad" },
  { id: "p3", name: "Tranque", mandante: "vialidad " },
  { id: "p4", name: "Ya", mandante: "x", clienteId: "c1" },
  { id: "p5", name: "Sin", mandante: "" },
  { id: "p6", name: "Ambigua", mandante: "Transportes Lagos" },
];
const plan = planVincularMandantes(obras, clientes);
assert.deepEqual(plan.vincular.map(v => [v.projectId, v.clienteId]), [["p1", "c1"]]);
assert.equal(plan.yaVinculadas, 1);
assert.equal(plan.sinMandante, 1);
assert.deepEqual(plan.sinCliente.map(g => [g.mandante, g.obras.map(o => o.projectId)]),
  [["Transportes Lagos", ["p6"]], ["Vialidad", ["p2", "p3"]]]);

// RCV de ventas: RUT únicos, sin consumidor final
const filas = [
  { "Tipo Doc": "33", "Rut cliente": "76086428-5", "Razon Social": "CONSTRUCTORA PEREZ SPA" },
  { "Tipo Doc": "33", "Rut cliente": "76086428-5", "Razon Social": "CONSTRUCTORA PEREZ SPA" },
  { "Tipo Doc": "39", "Rut cliente": "66666666-6", "Razon Social": "" },
  { "Tipo Doc": "33", "Rut Cliente": "96790240-3", "Razón Social": "MINERA SUR SA" },
  { "Tipo Doc": "33", "Rut cliente": "12345678-0", "Razon Social": "RUT MALO" },
];
assert.deepEqual(clientesDeRCVVentas(filas), [
  { rut: "760864285", razonSocial: "CONSTRUCTORA PEREZ SPA", documentos: 2 },
  { rut: "967902403", razonSocial: "MINERA SUR SA", documentos: 1 },
]);

// Control de ventas: cliente de Rental desde la ficha; OT por la obra
const rental = [
  { id: "e1", numero: "1", fechaEmision: "2026-03-10", neto: 1000, clienteId: "c1", clienteNombre: "Perez" },
  { id: "e2", numero: "2", fechaEmision: "2026-03-12", neto: 500, clienteId: "borrado", clienteNombre: "Minera Sur" },
];
const ot = [
  { projectId: "p1", year: 2026, month: 3, estadosPago: 2000 },
  { projectId: "p2", year: 2026, month: 4, estadosPago: 700 },
];
const cv = controlVentas(rental, ot, 2026, [], { clientes });
assert.equal(cv[2].sinFactura[0].cliente, "Constructora Pérez SpA");
assert.equal(cv[2].sinFactura[1].clienteId, `rut_${rutCliente(B)}`, "clienteId inexistente: cae a nombre");
assert.equal(cv[2].fleetcore, 3500);
const porCli = ventasPorCliente(rental, ot, 2026, { clientes, proyectos: [{ ...obras[0], clienteId: "c1" }, obras[1]] });
assert.deepEqual(porCli.map(c => [c.clave, c.rental, c.ot, c.total, c.sinFicha]), [
  ["id:c1", 1000, 2000, 3000, false],
  ["nom:VIALIDAD", 0, 700, 700, true],
  [`id:rut_${rutCliente(B)}`, 500, 0, 500, false],
]);

// Finanzas: cobros de una cuenta del flujo
const cobros = [
  { id: "a", cliente: "Constructora Pérez SpA", clienteId: "c1", clienteRut: "760864285" },
  { id: "b", cliente: "Constructora Pérez Norte", clienteId: "c9", clienteRut: "111111111" },
  { id: "c", cliente: "Minera Sur S.A.", clienteId: "m", clienteRut: "967902403" },
];
assert.deepEqual(rutsEnTexto("Pérez 76.086.428-5 y 1-9"), ["760864285"]);
assert.deepEqual(cobrosDeCuenta(cobros, { clienteId: "c1", nombre: "x" }).map(c => c.id), ["a"]);
assert.deepEqual(cobrosDeCuenta(cobros, { nombre: "Cobro Pérez", cliente: "76.086.428-5" }).map(c => c.id), ["a"]);
assert.deepEqual(cobrosDeCuenta(cobros, { nombre: "Constructora Pérez" }).map(c => c.id).sort(), ["a", "b"], "solo nombre: respaldo");
assert.deepEqual(cobrosDeCuenta(cobros, { nombre: "Minera Sur" }).map(c => c.id), ["c"]);

console.log("clientesBase: OK");
