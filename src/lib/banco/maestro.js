/**
 * src/lib/banco/maestro.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Completa el maestro de proveedores con los datos bancarios de nóminas ya
 * subidas (plantilla Pago Fácil) y certificados de pago del Banco de Chile.
 *
 * Regla de oro: nunca pisa un dato que ya existe. Solo llena lo vacío, y crea
 * fichas nuevas únicamente para los RUT que se elijan.
 */
import { collection, getDocs } from "firebase/firestore";
import { db } from "../firebase";
import { completarProveedor, guardarProveedor, formatearRut } from "../proveedores";
import { tipoMaestroDe } from "./nomina.js";

const digitos = (rut) => String(rut || "").replace(/[^0-9kK]/g, "").toUpperCase();

export async function cargarProveedores(empresaId) {
  const snap = await getDocs(collection(db, "empresas", empresaId, "proveedores"));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

/**
 * Qué haría el completado, sin escribir nada:
 *  · crear:      RUT que no tienen ficha.
 *  · completar:  fichas existentes con datos bancarios vacíos que sí vienen.
 *  · completas:  fichas que ya tienen todo (no se tocan).
 * Si un RUT trae varias cuentas, se usa la última que aparece y se avisa.
 */
export function planificarCompletado(proveedores, beneficiarios) {
  const porRut = new Map();
  for (const b of beneficiarios) {
    const k = digitos(b.rut);
    if (!porRut.has(k)) porRut.set(k, []);
    porRut.get(k).push(b);
  }
  const crear = [], completar = [], completas = [];
  for (const [rut, lista] of porRut) {
    const b = lista[lista.length - 1];
    const otrasCuentas = [...new Set(lista.map(x => x.cuenta))].length - 1;
    const datos = {
      banco: b.banco || "", tipoCuenta: tipoMaestroDe(b.tipoCuenta), numeroCuenta: b.cuenta || "", emailComprobante: b.mail || "",
    };
    const prov = proveedores.find(p => digitos(p.rutNormalizado || p.rut) === rut);
    if (!prov) { crear.push({ rut, beneficiario: b, datos, otrasCuentas }); continue; }
    // Se le paga por portal web o cargo automático: es decisión de la ficha, no se toca.
    if (prov.medioPago && prov.medioPago !== "transferencia") { completas.push({ rut, proveedor: prov, otroMedio: true }); continue; }
    const actual = completarProveedor(prov);
    const cambios = {};
    for (const [campo, valor] of Object.entries(datos)) {
      if (valor && !String(actual.transferencia[campo] || "").trim()) cambios[campo] = valor;
    }
    const cambiaMedio = !actual.medioPago && Object.keys(cambios).length > 0;
    if (Object.keys(cambios).length || cambiaMedio) completar.push({ rut, proveedor: prov, beneficiario: b, cambios, cambiaMedio, otrasCuentas });
    else completas.push({ rut, proveedor: prov });
  }
  return { crear, completar, completas };
}

/**
 * Aplica el plan. `rutsACrear`: los RUT de `plan.crear` que se deben crear.
 * Devuelve cuántas fichas se crearon y completaron, y los errores por RUT.
 */
export async function aplicarCompletado(empresaId, plan, rutsACrear = new Set()) {
  let creadas = 0, completadas = 0;
  const errores = [];
  for (const c of plan.completar) {
    try {
      const form = completarProveedor(c.proveedor);
      form.transferencia = { ...form.transferencia, ...c.cambios };
      if (c.cambiaMedio) form.medioPago = "transferencia";
      await guardarProveedor(empresaId, form, c.proveedor.id);
      completadas++;
    } catch (e) { errores.push({ rut: c.rut, mensaje: e.message }); }
  }
  for (const c of plan.crear) {
    if (!rutsACrear.has(c.rut)) continue;
    try {
      const form = completarProveedor({
        razonSocial: c.beneficiario.nombre, rut: formatearRut(c.rut), medioPago: "transferencia",
        transferencia: { titular: "", rutTitular: "", ...c.datos },
        notas: "Ficha creada desde una nómina o certificado de pago del Banco de Chile.",
      });
      await guardarProveedor(empresaId, form, null);
      creadas++;
    } catch (e) { errores.push({ rut: c.rut, mensaje: e.message }); }
  }
  return { creadas, completadas, errores };
}
