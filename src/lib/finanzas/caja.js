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

// ─── Recurrentes (mismas reglas que FinanzasFlujoCaja) ───────────────────────
const enPesos = (v) => { const n = String(v ?? "").replace(/\D/g, ""); return n ? parseInt(n, 10) : 0; };

/**
 * Rellena en memoria las cuentas recurrentes: solo semanas futuras (desde hoy)
 * y vacías; nunca pisa lo escrito a mano. Mensual = primera semana futura de
 * cada mes; quincenal = una sí, una no; semanal = todas.
 */
export function rellenarRecurrentes(cuentas, pagos, semanas, hoy) {
  const h = new Date(hoy); h.setHours(0, 0, 0, 0);
  const lleno = { ...pagos };
  for (const c of cuentas) {
    if (!c.recurrente || !c.montoRecurrente) continue;
    const base = Math.abs(enPesos(c.montoRecurrente));
    const monto = c.categoria === "INGRESOS" ? base : -base;
    const futuras = semanas.filter(w => w.inicio >= h);
    futuras.forEach((w, idx) => {
      const key = `${c.id}-${w.key}`;
      if (lleno[key]) return;
      const freq = c.frecuenciaRecurrente || "mensual";
      let aplicar = false;
      if (freq === "semanal") aplicar = true;
      else if (freq === "quincenal") aplicar = idx % 2 === 0;
      else if (freq === "mensual") aplicar = !futuras.slice(0, idx).some(pw => pw.mes === w.mes);
      if (aplicar) lleno[key] = monto;
    });
  }
  return lleno;
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
  const plan = rellenarRecurrentes(cuentas, pagos, semanas, hoy);
  let saldo = saldoInicial;
  const filas = semanas.map((w, i) => {
    const partidas = [];
    for (const c of cuentas) {
      const key = `${c.id}-${w.key}`;
      const monto = plan[key] || 0;
      if (!monto) continue;
      const pagado = !!pagados[key];
      const real = reales[key];
      const pendiente = pagado ? 0 : (i === 0 ? pendienteDe(monto, real) : monto);
      partidas.push({
        key, cuenta: c, monto, pendiente, pagado, real,
        esIngreso: monto > 0, prioridad: prioridadDe(c),
        recurrente: !pagos[key] && plan[key] !== undefined,
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
