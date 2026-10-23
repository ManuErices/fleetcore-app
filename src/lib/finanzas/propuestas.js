/**
 * src/lib/finanzas/propuestas.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Propuestas de flujo de caja: borradores que cambian el flujo SIN tocarlo.
 *
 * Una propuesta guarda solo diferencias sobre el flujo original:
 *   cambios.pagos   { "<cuentaId>-<lunes>": { valor, antes } }
 *                   valor: el monto que tendría la partida (con signo, como en
 *                   flujo_pagos); antes: lo que había en el original cuando se
 *                   propuso, para detectar si alguien lo cambió después.
 *   cambios.cuentas { "<nueva_xxx>": { nombre, categoria, ... } }
 *                   cuentas que la propuesta crea; sus partidas usan ese id.
 *   cambios.colchon número, si la propuesta cambia el colchón.
 *
 * Todo aquí es lógica pura: con los mismos datos de cargarDatosCaja arma la
 * versión "con la propuesta", para proyectar las dos con caja.js y compararlas.
 */

export const PREFIJO_CUENTA_NUEVA = "nueva_";

export const ESTADOS_PROPUESTA = {
  borrador:    { label: "Borrador",     descripcion: "En preparación; nadie la ha revisado." },
  en_revision: { label: "En revisión",  descripcion: "Esperando que un administrador la apruebe." },
  aplicada:    { label: "Aprobada",     descripcion: "Se aprobó y sus cambios ya están en el flujo." },
  rechazada:   { label: "Rechazada",    descripcion: "Un administrador la rechazó; el flujo no cambió." },
  descartada:  { label: "Descartada",   descripcion: "Quien la creó la dejó de lado." },
};

export const esEditable = (p) => p && (p.estado === "borrador" || p.estado === "en_revision");

/** Separa "<cuentaId>-<AAAA-MM-DD>" en sus partes. */
export function partesClave(key) {
  return { cuentaId: key.slice(0, -11), semana: key.slice(-10) };
}

/** Monto con el signo que corresponde a la cuenta: ingresos +, egresos −. */
export function conSigno(cuenta, monto) {
  const abs = Math.abs(Math.round(Number(monto) || 0));
  return cuenta?.categoria === "INGRESOS" ? abs : -abs;
}

/** Cuentas nuevas de la propuesta, con la forma de una flujo_cuentas. */
export function cuentasNuevas(propuesta) {
  return Object.entries(propuesta?.cambios?.cuentas || {}).map(([id, c]) => ({ ...c, id, esNueva: true }));
}

/**
 * Los datos de caja tal como quedarían si la propuesta se aprobara.
 * No modifica `datos`.
 */
export function datosConPropuesta(datos, propuesta) {
  const cambios = propuesta?.cambios || {};
  const pagos = { ...datos.pagos };
  for (const [key, c] of Object.entries(cambios.pagos || {})) {
    if (c.valor) pagos[key] = c.valor; else delete pagos[key];
  }
  // Una partida reemplazada deja de estar "pagada": es otra decisión.
  const pagados = { ...datos.pagados };
  for (const key of Object.keys(cambios.pagos || {})) delete pagados[key];

  return {
    ...datos,
    cuentas: [...datos.cuentas, ...cuentasNuevas(propuesta)],
    pagos,
    pagados,
    colchon: typeof cambios.colchon === "number" ? cambios.colchon : datos.colchon,
  };
}

/**
 * Lista legible de lo que cambia, para mostrar las correcciones.
 * `actual` es lo que hay hoy en el flujo; si difiere de `antes`, alguien
 * modificó el original después de proponer (conflicto).
 */
export function listarCambios(datos, propuesta) {
  const porId = new Map([...datos.cuentas, ...cuentasNuevas(propuesta)].map(c => [c.id, c]));
  const filas = Object.entries(propuesta?.cambios?.pagos || {}).map(([key, c]) => {
    const { cuentaId, semana } = partesClave(key);
    const cuenta = porId.get(cuentaId);
    const actual = datos.pagos[key] || 0;
    const antes = c.antes || 0;
    return {
      key, semana, cuentaId,
      cuenta: cuenta?.nombre || "(cuenta eliminada)",
      cuentaNueva: !!cuenta?.esNueva,
      esIngreso: cuenta?.categoria === "INGRESOS",
      original: actual,
      propuesto: c.valor || 0,
      diferencia: (c.valor || 0) - actual,
      conflicto: actual !== antes,
      antes,
    };
  });
  return filas.sort((a, b) => a.semana.localeCompare(b.semana) || a.cuenta.localeCompare(b.cuenta));
}

export const conflictosDe = (datos, propuesta) => listarCambios(datos, propuesta).filter(f => f.conflicto);

/**
 * Compara dos proyecciones semana a semana (las de caja.js).
 * Devuelve las filas y un resumen de cómo cambia la semana más baja.
 */
export function compararProyecciones(original, propuesta) {
  const semanas = original.semanas.map((o, i) => {
    const p = propuesta.semanas[i];
    return {
      key: o.key, etiqueta: o.etiqueta, rango: o.rango,
      original: o.saldoFin, propuesta: p.saldoFin, diferencia: p.saldoFin - o.saldoFin,
      bajoOriginal: o.bajoColchon, bajoPropuesta: p.bajoColchon,
    };
  });
  return {
    semanas,
    minimoOriginal: original.minimo,
    minimoPropuesta: propuesta.minimo,
    deficitOriginal: original.deficit,
    deficitPropuesta: propuesta.deficit,
    disponibleOriginal: original.disponible,
    disponiblePropuesta: propuesta.disponible,
    semanasBajoOriginal: semanas.filter(s => s.bajoOriginal).length,
    semanasBajoPropuesta: semanas.filter(s => s.bajoPropuesta).length,
    cierreOriginal: original.semanas.at(-1)?.saldoFin ?? original.saldoInicial,
    cierrePropuesta: propuesta.semanas.at(-1)?.saldoFin ?? propuesta.saldoInicial,
  };
}
