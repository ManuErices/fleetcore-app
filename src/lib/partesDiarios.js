/**
 * src/lib/partesDiarios.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Horas de máquina por día, desde las DOS fuentes que conviven mientras
 * WorkFleet reemplaza al Excel (mismo criterio que src/lib/combustible.js):
 *
 *   · WorkFleet: `reportes_detallados` (parte diario que llena el operador en
 *     terreno: horómetro, kilometraje, actividades, estado de la máquina).
 *   · Excel:     `dailyLogs` (importado o tipeado en Oficina Técnica).
 *
 * Antes Oficina Técnica (Dashboard, Detalle Flota) leía solo dailyLogs: las
 * horas registradas en terreno no llegaban, y el mismo día se tipeaba dos
 * veces. Ahora se leen las dos y queda UN registro por máquina y día.
 *
 * Regla cuando el día está en ambas: manda el Excel (es lo que Oficina
 * Técnica revisó y con lo que se cobra); el registro queda `fuente: "ambas"`
 * con `horasWorkFleet` y, si difieren en más de 0,5 h, `diferenciaHoras`
 * (WorkFleet − Excel) y `discrepancia: true` para revisarlo a mano.
 *
 * Los registros que vienen solo de WorkFleet son de solo lectura
 * (`soloLectura: true`): se corrigen en WorkFleet, no en Oficina Técnica.
 * listLogsByRange (db.js) sigue leyendo solo dailyLogs porque el importador
 * Excel lo usa para detectar sus propios duplicados.
 */
import { collection, getDocs, query, where, Timestamp } from "firebase/firestore";
import { db } from "./firebase";
import { listLogsByRange, listMachines } from "./db";
import { obraEnFecha } from "./maquinas";
import { fechaISO, desdeISO, sumarDias } from "./fechas";

const TOLERANCIA_HORAS = 0.5;
// Un horómetro que avanza más de 24 h en un día es un error de tipeo (o un
// cambio de horómetro): no se usa, se cae a las horas de las actividades.
const MAX_HORAS_DIA = 24;

const num = (v) => {
  const n = parseFloat(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};
const redondear = (n) => Math.round(n * 100) / 100;

/** "AAAA-MM-DD" de la fecha del reporte: texto (formulario) o Timestamp/Date (datos antiguos). */
export function fechaReporte(valor) {
  if (!valor) return "";
  // Texto: se corta directo. Pasarlo por Date lo leería como medianoche UTC
  // y en Chile caería en el día anterior.
  if (typeof valor === "string") return /^\d{4}-\d{2}-\d{2}/.test(valor) ? valor.slice(0, 10) : fechaISO(valor);
  return fechaISO(valor);
}

/** Minutos entre "HH:MM" y "HH:MM" (si el fin es menor, cruzó la medianoche). */
function minutosEntre(inicio, fin) {
  const a = String(inicio || "").match(/^(\d{1,2}):(\d{2})/);
  const b = String(fin || "").match(/^(\d{1,2}):(\d{2})/);
  if (!a || !b) return 0;
  let m = (+b[1] * 60 + +b[2]) - (+a[1] * 60 + +a[2]);
  if (m < 0) m += 24 * 60;
  return m;
}
const horasDeTramos = (tramos) =>
  (Array.isArray(tramos) ? tramos : []).reduce((s, t) => s + minutosEntre(t?.horaInicio, t?.horaFin), 0) / 60;

/**
 * Un reporte_detallado → forma de dailyLogs.
 *
 * Horas productivas: horómetro final − inicial (lo que marca la máquina); si
 * no hay horómetro válido, la suma de las actividades efectivas. Si la
 * máquina no operó, el día completo va a standby o panne igual que lo hace
 * el importador Excel (24 h): "detenida" = standby; "mantencion" y
 * "fuera_servicio" = downtime.
 */
export function reporteComoLog(r, maquinasPorId = {}) {
  const date = fechaReporte(r.fecha || r.datosControl?.fecha);
  const machineId = r.machineId || "";
  let projectId = r.projectId || r.datosControl?.projectId || "";
  // Reportes antiguos sin obra: la obra en que estaba la máquina ese día
  // según su historialObras.
  if (!projectId && maquinasPorId[machineId]) projectId = obraEnFecha(maquinasPorId[machineId], date) || "";

  const horIni = num(r.horometroInicial), horFin = num(r.horometroFinal);
  const kmIni = num(r.kilometrajeInicial), kmFin = num(r.kilometrajeFinal);
  const difHorometro = horIni > 0 && horFin > horIni ? horFin - horIni : 0;
  const horasActividades = horasDeTramos(r.actividadesEfectivas);
  const estado = r.estadoMaquina || "operativa";

  let productiveHours = 0, standbyHours = 0, downtimeHours = 0;
  let origenHoras = "";
  if (estado === "mantencion" || estado === "fuera_servicio") {
    downtimeHours = 24;
  } else if (estado === "detenida") {
    standbyHours = 24;
  } else if (difHorometro > 0 && difHorometro <= MAX_HORAS_DIA) {
    productiveHours = difHorometro;
    origenHoras = "horometro";
  } else if (horasActividades > 0) {
    productiveHours = horasActividades;
    origenHoras = "actividades";
  }

  return {
    id: `wf_${r.id}`,
    reporteId: r.id,
    numeroReporte: r.numeroReporte || "",
    machineId,
    projectId,
    date,
    productiveHours: redondear(productiveHours),
    standbyHours,
    downtimeHours,
    // Kilometraje del DÍA (dailyLogs guarda lo recorrido, no el odómetro)
    kilometraje: kmIni > 0 && kmFin > kmIni ? redondear(kmFin - kmIni) : 0,
    horometroInicial: r.horometroInicial ?? "",
    horometroFinal: r.horometroFinal ?? "",
    // Informativo: tiempos no efectivos del parte (no se cobran como standby)
    horasNoEfectivas: redondear(horasDeTramos(r.tiemposNoEfectivos)),
    origenHoras,
    estadoMaquina: estado,
    operador: r.operador || "",
    notes: r.observaciones || "",
    origin: "WorkFleet",
    fuente: "workfleet",
    soloLectura: true,
  };
}

/** Reportes de WorkFleet → registros tipo dailyLogs de una obra y rango. */
export function reportesComoLogs(reportes, { projectId, desde, hasta, maquinasPorId } = {}) {
  return (reportes || [])
    .filter(r => r && r.deleted !== true)
    .map(r => reporteComoLog(r, maquinasPorId))
    .filter(l => l.machineId && l.date)
    .filter(l => !projectId || l.projectId === projectId)
    .filter(l => (!desde || l.date >= desde) && (!hasta || l.date <= hasta));
}

const clave = (l) => `${l.machineId}|${l.date}`;

/**
 * Une Excel (dailyLogs) y WorkFleet: un registro por máquina y día.
 * Si ambos existen manda el Excel y se marca la diferencia de horas.
 */
export function unirLogs(excelLogs, wfLogs) {
  // Dos reportes de WorkFleet del mismo día y máquina (p. ej. dos turnos
  // importados) se suman en uno, para que el calendario no pierda ninguno.
  const wf = new Map();
  for (const w of wfLogs || []) {
    const k = clave(w);
    const prev = wf.get(k);
    wf.set(k, !prev ? w : {
      ...prev,
      productiveHours: redondear(prev.productiveHours + w.productiveHours),
      standbyHours: Math.max(prev.standbyHours, w.standbyHours),
      downtimeHours: Math.max(prev.downtimeHours, w.downtimeHours),
      kilometraje: redondear(prev.kilometraje + w.kilometraje),
      reporteIds: [...(prev.reporteIds || [prev.reporteId]), w.reporteId],
    });
  }

  const salida = (excelLogs || []).map(x => {
    const w = wf.get(clave(x));
    if (!w) return { ...x, fuente: "excel" };
    wf.delete(clave(x));
    const horasExcel = num(x.productiveHours);
    const dif = redondear(w.productiveHours - horasExcel);
    return {
      ...x,
      fuente: "ambas",
      reporteId: w.reporteId,
      horasWorkFleet: w.productiveHours,
      // Lo que el Excel no trae se completa con el parte de terreno
      operador: x.operador || w.operador,
      horometroInicial: x.horometroInicial ?? w.horometroInicial,
      horometroFinal: x.horometroFinal ?? w.horometroFinal,
      ...(Math.abs(dif) > TOLERANCIA_HORAS ? { diferenciaHoras: dif, discrepancia: true } : {}),
    };
  });
  return [...salida, ...wf.values()].sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

/** Reportes de WorkFleet en un rango (la fecha puede ser texto o Timestamp). */
async function leerReportes(empresaId, desde, hasta) {
  const col = collection(db, "empresas", empresaId, "reportes_detallados");
  const leer = (q) => getDocs(q).then(s => s.docs.map(d => ({ id: d.id, ...d.data() }))).catch(() => []);
  // Firestore compara por tipo: un rango de texto no trae los Timestamps, así
  // que se hacen las dos consultas (con un día de margen para la zona
  // horaria; el filtro fino lo hace reportesComoLogs con la fecha de Chile).
  const [texto, instantes] = await Promise.all([
    leer(query(col, where("fecha", ">=", desde), where("fecha", "<=", hasta))),
    leer(query(col,
      where("fecha", ">=", Timestamp.fromDate(desdeISO(sumarDias(desde, -1)))),
      where("fecha", "<", Timestamp.fromDate(desdeISO(sumarDias(hasta, 2)))))),
  ]);
  return [...texto, ...instantes];
}

/** Partes diarios de una obra en un rango, de las dos fuentes y sin duplicar. */
export async function listarLogsObra(empresaId, projectId, desde, hasta) {
  const [excel, reportes] = await Promise.all([
    listLogsByRange(empresaId, projectId, desde, hasta),
    leerReportes(empresaId, desde, hasta),
  ]);
  // Las máquinas solo hacen falta si algún reporte no trae obra
  let maquinasPorId = {};
  if (reportes.some(r => !r.projectId && !r.datosControl?.projectId)) {
    const ms = await listMachines(empresaId).catch(() => []);
    maquinasPorId = Object.fromEntries(ms.map(m => [m.id, m]));
  }
  return unirLogs(excel, reportesComoLogs(reportes, { projectId, desde, hasta, maquinasPorId }));
}
