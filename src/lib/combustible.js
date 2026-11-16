/**
 * src/lib/combustible.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Consumo de combustible por máquina, desde las DOS fuentes que conviven
 * mientras WorkFleet reemplaza al Excel:
 *
 *   · WorkFleet: `reportes_combustible` con tipo "entrega" (lo que se le
 *     despachó a cada máquina en terreno, con firma).
 *   · Excel:     `fuelLogs` (importado en Oficina Técnica → Combustible).
 *
 * Antes las pantallas de Oficina Técnica (Combustible, Dashboard, Consolidado,
 * Estado de pago) leían solo el Excel: lo registrado en WorkFleet no llegaba
 * a los costos. Ahora se leen las dos y un mismo despacho que está en ambas
 * (misma máquina, mismo día, mismos litros) se cuenta una sola vez.
 *
 * Cada consumo trae `fuente`: "workfleet" | "excel" | "ambas", y los de
 * WorkFleet son de solo lectura (se corrigen en WorkFleet).
 *
 * Precio: el diésel cambia semana a semana, así que cada consumo se valoriza
 * con el precio por litro de la última CARGA registrada en WorkFleet hasta
 * ese día (entrada desde estación, precio = total ÷ litros de sus
 * documentos), primero de la misma obra y si no, de cualquiera. Trae
 * `precioLitro`, `costo` y `precioFecha`; si no hay ninguna carga con
 * precio, `costo` queda null y la pantalla usa su precio de respaldo
 * (fetchFuelPrices: primero el precio manual de fuelPrices/current).
 *
 * Camión aljibe (combustibleRegistros, Oficina Técnica → Combustible): es el
 * control del diésel que salió del camión, importado por obra, con precio
 * FIJADO por mes (combustiblePrecioMensual). PRECEDENCIA: en un mes en que la
 * obra tiene registros del aljibe, esos registros SON el consumo del mes y se
 * descartan los de WorkFleet y fuelLogs de ese mes (son el mismo diésel). Los
 * meses sin registros del aljibe siguen con WorkFleet + Excel. Antes solo
 * Estado de pago aplicaba esta regla y el Dashboard/Consolidado/Combustible
 * mostraban otros litros para el mismo mes. Un registro del aljibe se asocia
 * a la máquina por patente/código (si no calza, queda sin máquina); su precio
 * es el fijado para el mes, si no la última carga de WorkFleet, si no null
 * (precio de respaldo de la pantalla).
 *
 * Obra de una entrega de WorkFleet sin projectId: la obra en que estaba la
 * máquina ese día (obraEnFecha, igual que partesDiarios.js), para que litros
 * y horas de la misma máquina caigan en la misma obra (L/h, costo/hora).
 */
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "./firebase";
import { listFuelLogsByRange, listCombustibleRegistros, listCombustiblePrecioMensualByYear } from "./db";
import { obraEnFecha, normalizarPatente, listarMaquinas } from "./maquinas";

const TOLERANCIA_LITROS = 1;

/** Entregas de WorkFleet → mismo formato que fuelLogs. */
export function entregasComoConsumos(reportes, { projectId, desde, hasta, maquinasPorId = {} } = {}) {
  return (reportes || [])
    .filter(r => r.tipo === "entrega")
    .map(r => {
      const e = r.datosEntrega || {};
      const machineId = e.machineId || r.machineId || "";
      const date = String(e.fecha || r.fecha || r.datosControl?.fecha || "").slice(0, 10);
      let obra = r.projectId || r.datosControl?.projectId || "";
      if (!obra && maquinasPorId[machineId] && date) obra = obraEnFecha(maquinasPorId[machineId], date) || "";
      return {
        id: `wf_${r.id}`,
        reporteId: r.id,
        machineId,
        date,
        liters: Number(e.cantidadLitros ?? r.cantidadLitros) || 0,
        origin: "WorkFleet",
        projectId: obra,
        operador: r.operadorNombre || e.receptorNombre || "",
        horometro: e.horometroOdometro ?? null,
        fuente: "workfleet",
        soloLectura: true,
      };
    })
    .filter(c => c.machineId && c.date && c.liters > 0)
    .filter(c => !projectId || c.projectId === projectId)
    .filter(c => (!desde || c.date >= desde) && (!hasta || c.date <= hasta));
}

/**
 * Une Excel y WorkFleet. Un registro del Excel que coincide con una entrega
 * de WorkFleet (máquina, día y litros ±1) es el mismo despacho: queda uno,
 * marcado "ambas".
 */
export function unirConsumos(excel, workfleet) {
  const libres = [...workfleet];
  const salida = (excel || []).map(x => {
    const i = libres.findIndex(w => w.machineId === x.machineId && w.date === x.date
      && Math.abs((w.liters || 0) - (Number(x.liters) || 0)) <= TOLERANCIA_LITROS);
    if (i < 0) return { ...x, fuente: "excel" };
    const [w] = libres.splice(i, 1);
    return { ...x, fuente: "ambas", reporteId: w.reporteId };
  });
  return [...salida, ...libres].sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

/** Cargas (entradas) con precio por litro, ordenadas por fecha. */
export function preciosDeCargas(reportes) {
  return (reportes || [])
    .filter(r => r.tipo === "entrada")
    .map(r => {
      const e = r.datosEntrada || {};
      let precio = Number(r.precioPorLitro ?? e.precioPorLitro) || 0;
      if (!precio) {
        const total = Number(r.totalMonto ?? e.totalMonto) || 0;
        const litros = Number(r.cantidad ?? e.cantidad) || 0;
        precio = total > 0 && litros > 0 ? total / litros : 0;
      }
      return {
        fecha: String(e.fechaDocumento || r.fecha || r.datosControl?.fecha || "").slice(0, 10),
        projectId: r.projectId || r.datosControl?.projectId || "",
        precio,
      };
    })
    .filter(c => c.precio > 0 && c.fecha)
    .sort((a, b) => a.fecha.localeCompare(b.fecha));
}

/** Precio vigente a una fecha: última carga hasta ese día (misma obra primero). */
export function precioVigente(cargas, fecha, projectId) {
  let mismaObra = null, cualquiera = null;
  for (const c of cargas) {
    if (c.fecha > fecha) break;
    cualquiera = c;
    if (projectId && c.projectId === projectId) mismaObra = c;
  }
  return mismaObra || cualquiera;
}

/** Agrega precioLitro / costo / precioFecha a cada consumo. */
export function valorizarConsumos(consumos, cargas) {
  return consumos.map(c => {
    const p = precioVigente(cargas, c.date, c.projectId);
    return p
      ? { ...c, precioLitro: p.precio, costo: (Number(c.liters) || 0) * p.precio, precioFecha: p.fecha }
      : { ...c, precioLitro: null, costo: null, precioFecha: null };
  });
}

/** Costo de un consumo: el valorizado, o litros × precio de respaldo. */
export const costoConsumo = (c, precioRespaldo) =>
  c.costo != null ? c.costo : (Number(c.liters) || 0) * (Number(precioRespaldo) || 0);

/** Cargas de WorkFleet con precio (para valorizar litros que no vienen de WorkFleet). */
export async function listarCargasCombustible(empresaId) {
  const reportes = await getDocs(query(collection(db, "empresas", empresaId, "reportes_combustible"), where("tipo", "==", "entrada")))
    .then(s => s.docs.map(d => ({ id: d.id, ...d.data() })))
    .catch(() => []);
  return preciosDeCargas(reportes);
}

/**
 * Registros del camión aljibe → forma de consumo. `preciosMes` = { "AAAA-MM": precioLitro }.
 * La máquina se busca por patente o código normalizado.
 */
export function registrosAljibeComoConsumos(registros, { desde, hasta, maquinas = [], preciosMes = {} } = {}) {
  const porLlave = {};
  maquinas.forEach(m => {
    [m.patente, m.code, m.codigo].forEach(v => { const k = normalizarPatente(v); if (k && !porLlave[k]) porLlave[k] = m.id; });
  });
  return (registros || [])
    .map(r => {
      const date = String(r.fecha || "").slice(0, 10);
      const precio = Number(preciosMes[date.slice(0, 7)]) || 0;
      return {
        id: `cb_${r.id}`,
        registroId: r.id,
        machineId: porLlave[normalizarPatente(r.codigoPatente)] || "",
        patente: r.codigoPatente || "",
        date,
        liters: Number(r.litros) || 0,
        origin: "Camión aljibe",
        projectId: r.projectId || "",
        horometro: r.horometro ?? null,
        fuente: "aljibe",
        soloLectura: true,
        precioMes: precio || null,
      };
    })
    .filter(c => c.date && c.liters > 0)
    .filter(c => (!desde || c.date >= desde) && (!hasta || c.date <= hasta));
}

/**
 * Precedencia del camión aljibe: en cada mes con registros del aljibe se
 * quedan solo ellos; en los demás meses, los consumos WorkFleet/Excel.
 */
export function aplicarPrecedenciaAljibe(consumos, aljibe) {
  const mesesAljibe = new Set((aljibe || []).map(c => c.date.slice(0, 7)));
  if (!mesesAljibe.size) return consumos;
  return [...consumos.filter(c => !mesesAljibe.has(String(c.date).slice(0, 7))), ...aljibe]
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

/** Valoriza: el aljibe con su precio fijado del mes; el resto (y el aljibe sin precio) con las cargas. */
function valorizarTodo(consumos, cargas) {
  const conPrecioMes = consumos.filter(c => c.precioMes);
  const resto = valorizarConsumos(consumos.filter(c => !c.precioMes), cargas);
  return [
    ...conPrecioMes.map(c => ({ ...c, precioLitro: c.precioMes, costo: c.liters * c.precioMes, precioFecha: c.date.slice(0, 7) })),
    ...resto,
  ].sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

/** Consumos de una obra en un rango, de todas las fuentes y sin duplicar. */
export async function listarConsumosCombustible(empresaId, projectId, desde, hasta) {
  const anios = [];
  if (projectId && desde && hasta) for (let a = Number(desde.slice(0, 4)); a <= Number(hasta.slice(0, 4)); a++) anios.push(a);
  const [excel, reportes, maquinas, registros, precios] = await Promise.all([
    listFuelLogsByRange(empresaId, projectId, desde, hasta),
    getDocs(query(collection(db, "empresas", empresaId, "reportes_combustible"), where("tipo", "in", ["entrega", "entrada"])))
      .then(s => s.docs.map(d => ({ id: d.id, ...d.data() })))
      .catch(() => []),
    listarMaquinas(empresaId).catch(() => []),
    projectId ? listCombustibleRegistros(empresaId, projectId).catch(() => []) : Promise.resolve([]),
    Promise.all(anios.map(a => listCombustiblePrecioMensualByYear(empresaId, projectId, a).catch(() => []))).then(r => r.flat()),
  ]);
  const maquinasPorId = Object.fromEntries(maquinas.map(m => [m.id, m]));
  const preciosMes = {};
  precios.forEach(p => { if (Number(p.precioLitro) > 0) preciosMes[`${p.year}-${String(p.month).padStart(2, "0")}`] = Number(p.precioLitro); });
  const consumos = unirConsumos(excel, entregasComoConsumos(reportes, { projectId, desde, hasta, maquinasPorId }));
  const aljibe = registrosAljibeComoConsumos(registros, { desde, hasta, maquinas, preciosMes });
  return valorizarTodo(aplicarPrecedenciaAljibe(consumos, aljibe), preciosDeCargas(reportes));
}
