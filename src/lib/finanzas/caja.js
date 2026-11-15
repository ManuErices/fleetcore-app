/**
 * src/lib/finanzas/caja.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Lógica pura (sin Firestore) para responder lo que pregunta gerencia:
 *  · ¿cuánta caja hay y cómo se proyecta las próximas 13 semanas?
 *  · ¿qué se paga cada semana, y qué se puede mover si la caja no alcanza?
 *  · ¿cuánto se puede pagar de más sin bajar del colchón?
 *
 * Trabaja sobre los mismos datos del flujo de caja: un monto por cuenta y por
 * semana (llave `${cuentaId}-${lunes}`), en pesos, ingresos positivos y egresos
 * negativos. Las recurrentes se rellenan con las mismas reglas del flujo.
 */

export const COLCHON_POR_DEFECTO = 5_000_000;
export const SEMANAS_HORIZONTE = 13;

// ─── Prioridades de pago ──────────────────────────────────────────────────────
export const PRIORIDADES = {
  ineludible:  { label: "Ineludible",  orden: 0, descripcion: "No se mueve: sueldos, imposiciones, impuestos y cuotas." },
  operar:      { label: "Para operar", orden: 1, descripcion: "Si se atrasa, se para la obra: combustible, arriendos de equipos, subcontratos." },
  conversable: { label: "Conversable", orden: 2, descripcion: "Una llamada puede mover la fecha." },
};

const sinTildes = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

/** Prioridad sugerida por el nombre de la cuenta, mientras nadie la defina. */
export function sugerirPrioridad(cuenta) {
  const t = sinTildes([cuenta.nombre, cuenta.subcategoria, cuenta.detalle].join(" "));
  if (/sueldo|remunerac|imposic|previs|afp|isapre|impuesto|iva|f29|ppm|tesoreria|credito|cuota|leasing|banco|prestamo/.test(t)) return "ineludible";
  if (/combustible|petroleo|diesel|copec|arriendo|subcontrat|maquinaria|equipo|repuesto|mantencion|flete|transporte/.test(t)) return "operar";
  return "conversable";
}
export const prioridadDe = (cuenta) => (PRIORIDADES[cuenta.prioridad] ? cuenta.prioridad : sugerirPrioridad(cuenta));

// ─── Semanas ──────────────────────────────────────────────────────────────────
const dos = (n) => String(n).padStart(2, "0");
export const claveDia = (d) => `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`;

export function lunesDe(fecha) {
  const d = new Date(fecha); d.setHours(0, 0, 0, 0);
  const dow = d.getDay();
  d.setDate(d.getDate() + (dow === 0 ? -6 : 1 - dow));
  return d;
}

const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sept", "oct", "nov", "dic"];
export const fechaCorta = (d) => `${d.getDate()} ${MESES_CORTOS[d.getMonth()]}`;

/**
 * `n` semanas desde la semana de `hoy`. Cada una sabe a qué mes pertenece
 * para las recurrentes mensuales, con la regla del flujo: la semana en curso
 * cuenta como del mes de hoy; las demás, del mes de su lunes.
 */
export function semanasDesde(hoy, n = SEMANAS_HORIZONTE) {
  const base = lunesDe(hoy);
  const mesHoy = `${hoy.getFullYear()}-${dos(hoy.getMonth() + 1)}`;
  return Array.from({ length: n }, (_, i) => {
    const inicio = new Date(base); inicio.setDate(base.getDate() + 7 * i);
    const fin = new Date(inicio); fin.setDate(inicio.getDate() + 6);
    return {
      key: claveDia(inicio), indice: i, inicio, fin,
      mes: i === 0 ? mesHoy : `${inicio.getFullYear()}-${dos(inicio.getMonth() + 1)}`,
      etiqueta: `S${i + 1}`,
      rango: `${fechaCorta(inicio)} al ${fechaCorta(fin)}`,
    };
  });
}

// ─── Recurrentes (las MISMAS reglas para "La semana" y la planilla) ───────────
// FinanzasFlujoCaja usa esta función: si cada pantalla tuviera su copia, la
// planilla y "La semana" mostrarían montos distintos.
const enPesos = (v) => { const n = String(v ?? "").replace(/\D/g, ""); return n ? parseInt(n, 10) : 0; };

/**
 * Mes ("AAAA-MM") al que pertenece la semana que parte el lunes `lunesKey`.
 * Regla del flujo: cada semana es del mes de su lunes, salvo la que contiene
 * el día 1 del mes de hoy, que cuenta como del mes en curso (es la primera
 * columna de la planilla y la semana 0 de "La semana").
 */
export function mesDeSemana(lunesKey, hoy) {
  const mesHoy = `${hoy.getFullYear()}-${dos(hoy.getMonth() + 1)}`;
  if (claveDia(lunesDe(new Date(hoy.getFullYear(), hoy.getMonth(), 1))) === lunesKey) return mesHoy;
  return lunesKey.slice(0, 7);
}

// Semanas enteras entre dos lunes "AAAA-MM-DD" (en UTC, para que el cambio de
// hora no deje una semana de 6,96 días).
const semanasEntre = (a, b) => {
  const ua = Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10));
  const ub = Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10));
  return Math.round((ub - ua) / (7 * 86400000));
};

// Ancla fija de las quincenales cuando la cuenta no dice cuándo partió (un lunes).
const ANCLA_QUINCENAL = "2024-01-01";

/**
 * Lunes desde el que se cuentan las quincenas de una cuenta: su fecha de
 * inicio (inicioRecurrente) o de creación (creadoEn); si no tiene, una fecha
 * fija. Antes la paridad se contaba desde hoy y la quincena cambiaba de semana
 * cada semana.
 */
export function anclaQuincenal(cuenta) {
  const f = cuenta.inicioRecurrente || cuenta.creadoEn;
  let d = null;
  if (typeof f === "string" && /^\d{4}-\d{2}-\d{2}$/.test(f)) d = new Date(+f.slice(0, 4), +f.slice(5, 7) - 1, +f.slice(8, 10));
  else if (f) d = new Date(f?.toDate ? f.toDate() : f);
  return d && !isNaN(d) ? claveDia(lunesDe(d)) : ANCLA_QUINCENAL;
}

/**
 * Rellena en memoria las cuentas recurrentes, sin escribir nada (el flujo se
 * llena a mano a propósito). Reglas:
 *  · "Escrito" = existe el documento en flujo_pagos, aunque sea 0. Un 0 es una
 *    decisión (se canceló la cuota, se arrastró a otra semana) y no se vuelve
 *    a rellenar.
 *  · Solo desde la semana en curso, incluida (antes, desde el martes la
 *    semana en curso dejaba de contar y la mensual saltaba a la siguiente).
 *  · Mensual: en la primera semana a la vista del mes, y solo si NINGUNA
 *    semana de ese mes (pasada o futura, visible o no) tiene algo escrito o la
 *    marca de pagado para esa cuenta. Si no, salía dos veces en el mes.
 *  · Quincenal: semanas pares contadas desde anclaQuincenal(cuenta).
 *  · Semanal: todas las semanas vacías.
 *  · Una celda marcada como pagada sin monto escrito muestra el monto
 *    recurrente (es lo que se pagó ahí), también en semanas pasadas.
 * `semanas`: [{ key: lunes "AAAA-MM-DD" }]. `pagados`: { key: true }.
 */
export function rellenarRecurrentes(cuentas, pagos, semanas, hoy, pagados = {}) {
  const lunesHoy = claveDia(lunesDe(hoy));
  const lleno = { ...pagos };
  const recurrentes = cuentas.filter(c => c.recurrente && c.montoRecurrente);
  if (!recurrentes.length) return lleno;

  // Meses con algo escrito o pagado, por cuenta.
  const mesesOcupados = new Map();
  const marcar = (key) => {
    const semana = key.slice(-10), cuentaId = key.slice(0, -11);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(semana)) return;
    if (!mesesOcupados.has(cuentaId)) mesesOcupados.set(cuentaId, new Set());
    mesesOcupados.get(cuentaId).add(mesDeSemana(semana, hoy));
  };
  Object.keys(pagos).forEach(marcar);
  Object.keys(pagados).forEach(k => { if (pagados[k]) marcar(k); });

  for (const c of recurrentes) {
    const base = Math.abs(enPesos(c.montoRecurrente));
    const monto = c.categoria === "INGRESOS" ? base : -base;
    const freq = c.frecuenciaRecurrente || "mensual";
    const ocupados = new Set(mesesOcupados.get(c.id) || []);
    const ancla = freq === "quincenal" ? anclaQuincenal(c) : null;
    for (const w of semanas) {
      const key = `${c.id}-${w.key}`;
      if (key in lleno) continue;                      // escrito a mano (también 0)
      if (pagados[key]) { lleno[key] = monto; continue; }
      if (w.key < lunesHoy) continue;                   // el pasado no se rellena
      let aplicar = false;
      if (freq === "semanal") aplicar = true;
      else if (freq === "quincenal") aplicar = semanasEntre(ancla, w.key) % 2 === 0;
      else if (freq === "mensual") {
        const mes = mesDeSemana(w.key, hoy);
        aplicar = !ocupados.has(mes);
        if (aplicar) ocupados.add(mes);
      }
      if (aplicar) lleno[key] = monto;
    }
  }
  return lleno;
}

/**
 * Lo que todavía mueve la caja de una partida (misma regla para "La semana" y
 * el saldo acumulado de la planilla): lo pagado ✓ ya no; en la semana en curso,
 * solo lo que el banco todavía no muestra; en las futuras, todo.
 */
export function pendientePartida(monto, { pagado = false, real, semanaEnCurso = false } = {}) {
  if (!monto || pagado) return 0;
  return semanaEnCurso ? pendienteDe(monto, real) : monto;
}

/**
 * Saldo proyectado al cierre de cada semana, desde la semana en curso: parte
 * del saldo de hoy y suma solo lo pendiente. Las semanas pasadas no tienen
 * saldo proyectado (lo que pasó ya está en el saldo de partida; sumarlo de
 * nuevo lo contaba dos veces). Devuelve { [lunes]: saldo }.
 */
export function saldosProyectados({ cuentas, plan, pagados = {}, reales = {}, saldoInicial = 0, semanas, hoy }) {
  const lunesHoy = claveDia(lunesDe(hoy));
  const salida = {};
  let saldo = saldoInicial;
  for (const w of semanas) {
    if (w.key < lunesHoy) continue;
    for (const c of cuentas) {
      const key = `${c.id}-${w.key}`;
      saldo += pendientePartida(plan[key] || 0, { pagado: !!pagados[key], real: reales[key], semanaEnCurso: w.key === lunesHoy });
    }
    salida[w.key] = saldo;
  }
  return salida;
}

// ─── Proyección ───────────────────────────────────────────────────────────────
// Diferencias bajo $1.000 son redondeo, no deuda (la misma tolerancia de la
// marca ✓ del flujo de caja).
export const TOLERANCIA = 1000;

/**
 * Lo que falta que pase de un monto planeado, dado lo que ya pasó en el banco.
 * Si el banco ya cubrió el monto (o más, o casi todo), no falta nada; si cubrió
 * una parte, falta el resto. Un real de signo contrario no se descuenta.
 */
export function pendienteDe(monto, real) {
  if (!monto) return 0;
  if (real === undefined || real === null || Math.sign(real) !== Math.sign(monto)) return monto;
  const resto = Math.abs(monto) - Math.abs(real);
  return resto >= TOLERANCIA ? Math.sign(monto) * resto : 0;
}

/**
 * Proyecta la caja semana a semana.
 *  · Semana en curso: solo lo no marcado como pagado y lo que el banco todavía
 *    no muestra (el saldo de partida ya incluye lo que pasó).
 *  · Semanas futuras: todo lo no marcado como pagado.
 * Devuelve, por semana: partidas, ingresos y egresos pendientes, saldo al
 * cerrar. Y en total: la semana más baja, lo disponible para extras sobre el
 * colchón, o lo que falta si alguna semana baja de él.
 */
export function proyectar({ cuentas, pagos, pagados = {}, reales = {}, saldoInicial = 0, semanas, hoy, colchon = COLCHON_POR_DEFECTO }) {
  const plan = rellenarRecurrentes(cuentas, pagos, semanas, hoy, pagados);
  let saldo = saldoInicial;
  const filas = semanas.map((w, i) => {
    const partidas = [];
    for (const c of cuentas) {
      const key = `${c.id}-${w.key}`;
      const monto = plan[key] || 0;
      if (!monto) continue;
      const pagado = !!pagados[key];
      const real = reales[key];
      const pendiente = pendientePartida(monto, { pagado, real, semanaEnCurso: i === 0 });
      partidas.push({
        key, cuenta: c, monto, pendiente, pagado, real,
        esIngreso: monto > 0, prioridad: prioridadDe(c),
        // Recurrente = puesto por la regla, no escrito (un 0 escrito también es escrito).
        recurrente: !(key in pagos) && plan[key] !== undefined,
      });
    }
    const ingresos = partidas.reduce((s, p) => s + Math.max(0, p.pendiente), 0);
    const egresos = partidas.reduce((s, p) => s + Math.min(0, p.pendiente), 0);
    const saldoInicio = saldo;
    saldo = saldo + ingresos + egresos;
    return { ...w, partidas, ingresos, egresos, saldoInicio, saldoFin: saldo, bajoColchon: saldo < colchon };
  });

  let iMin = 0;
  filas.forEach((f, i) => { if (f.saldoFin < filas[iMin].saldoFin) iMin = i; });
  const minimo = filas.length ? filas[iMin].saldoFin : saldoInicial;
  return {
    semanas: filas, saldoInicial, colchon,
    semanaMinima: filas[iMin] || null,
    minimo,
    disponible: Math.max(0, minimo - colchon),
    deficit: Math.max(0, colchon - minimo),
  };
}

/**
 * ¿Se puede pagar `monto` de más en la semana `indice`? Un pago baja el saldo
 * de esa semana y de todas las siguientes; las anteriores no cambian. Por eso
 * se evalúan solo las semanas desde el pago. Si alguna semana anterior ya está
 * bajo el colchón, es un problema que existe con o sin este pago: se informa
 * aparte (`yaBajoAntes`) y no cambia la respuesta.
 * Devuelve si alcanza, cómo queda la semana más baja desde el pago y, si no
 * alcanza, desde qué semana sí alcanzaría.
 */
export function simularPago(proy, monto, indice = 0) {
  const fs = proy.semanas;
  const minDesde = (j) => Math.min(...fs.slice(j).map(f => f.saldoFin));
  const semanaQueBaja = fs.slice(indice).reduce((a, f) => (f.saldoFin < a.saldoFin ? f : a), fs[indice]);
  const quedaMin = semanaQueBaja.saldoFin - monto;
  const alcanza = quedaMin >= proy.colchon;
  let desde = null;
  if (!alcanza) {
    for (let j = indice + 1; j < fs.length; j++) {
      if (minDesde(j) - monto >= proy.colchon) { desde = fs[j]; break; }
    }
  }
  const yaBajoAntes = fs.slice(0, indice).find(f => f.bajoColchon) || null;
  return { alcanza, quedaMin, desde, semanaQueBaja, yaBajoAntes };
}

/**
 * Para la primera semana que baja del colchón: qué pagos "conversables"
 * pendientes (de esa semana o antes) conviene mover, y a qué semana. Mover un
 * pago de la semana a a la b sube el saldo de las semanas entre a y b-1 y no
 * cambia las demás, así que el destino es la primera semana desde la cual
 * todas quedan sobre el colchón. Si no existe, mover no alcanza: hace falta
 * caja (adelantar un cobro, factorizar, línea de crédito).
 */
export function proponerMovimientos(proy) {
  const fs = proy.semanas;
  const iBaja = fs.findIndex(f => f.bajoColchon);
  if (iBaja < 0) return null;
  const falta = proy.colchon - fs[iBaja].saldoFin;

  let destino = null;
  for (let b = iBaja + 1; b < fs.length; b++) {
    if (fs.slice(b).every(f => f.saldoFin >= proy.colchon)) { destino = fs[b]; break; }
  }

  const candidatos = fs.slice(0, iBaja + 1)
    .flatMap(f => f.partidas.filter(p => !p.esIngreso && p.pendiente < 0 && p.prioridad === "conversable").map(p => ({ ...p, semana: f })))
    .sort((a, b) => a.pendiente - b.pendiente);          // los más grandes primero
  const elegidos = []; let suma = 0;
  for (const c of candidatos) { if (suma >= falta) break; elegidos.push(c); suma += -c.pendiente; }

  return {
    semana: fs[iBaja], falta, destino, elegidos, suma,
    alcanza: !!destino && suma >= falta,
  };
}

/**
 * Partidas de semanas pasadas (hasta `semanasAtras`) que no están marcadas como
 * pagadas ni aparecen en el banco. No entran a la proyección: se muestran para
 * revisar, porque lo normal es que ya se hayan pagado y falte marcarlas.
 */
export function partidasSinCerrar({ cuentas, pagos, pagados = {}, reales = {}, hoy, semanasAtras = 4 }) {
  const lunesHoy = lunesDe(hoy);
  const desde = new Date(lunesHoy); desde.setDate(desde.getDate() - 7 * semanasAtras);
  const dHoy = claveDia(lunesHoy), dDesde = claveDia(desde);
  const porId = new Map(cuentas.map(c => [c.id, c]));
  const out = [];
  for (const [key, monto] of Object.entries(pagos)) {
    if (!monto) continue;
    const semana = key.slice(-10), cuentaId = key.slice(0, -11);
    if (semana < dDesde || semana >= dHoy) continue;
    const c = porId.get(cuentaId);
    if (!c || pagados[key]) continue;
    if (pendienteDe(monto, reales[key]) === 0) continue;
    out.push({ key, cuenta: c, semana, monto });
  }
  return out.sort((a, b) => a.semana.localeCompare(b.semana));
}
