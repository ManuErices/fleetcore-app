/**
 * Kardex de activo fijo (Excel con una hoja por año) → fila Depreciación del
 * Flujo Mensual. Lógica pura. Solo aplica en 14 A: en 14 D N°3 el activo se
 * rebaja completo al comprarlo (depreciación instantánea).
 *
 * Para el año X se usa la hoja del último año anterior a X (la del cierre):
 * de cada activo, su valor residual y los meses de vida útil que le quedan.
 *
 *   Cuota mensual X = valor residual al cierre / meses restantes
 *
 * Es depreciación lineal sobre lo que queda por depreciar, así el activo
 * termina exactamente en cero al fin de su vida útil.
 *
 * El kardex 2025 de MPF calculaba "valor actualizado (bruto) / meses
 * restantes × 12": como divide el valor BRUTO por una vida que se acorta,
 * la cuota sube cada año y la suma termina superando el costo del activo.
 * Aquí se informa cuánto daría esa fórmula para poder compararla.
 */

const norm = s => String(s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");
const num = v => (typeof v === "number" ? v : parseFloat(String(v ?? "").replace(/\./g, "").replace(",", ".")));

/** Fila de encabezados de una hoja de kardex, o -1. */
function encabezadoKardex(filas) {
  for (let i = 0; i < Math.min(filas?.length || 0, 10); i++) {
    const c = (filas[i] || []).map(norm);
    if (c.includes("vresidual") && c.includes("restante") && c.some(x => x.startsWith("descrip"))) return i;
  }
  return -1;
}

/** hojas: { [nombre]: filas (header: 1) }. Devuelve los años con hoja de kardex. */
export function detectarKardex(hojas) {
  return Object.entries(hojas)
    .filter(([, filas]) => encabezadoKardex(filas) >= 0)
    .map(([nombre]) => ({ nombre, anio: +(String(nombre).match(/(19|20)\d{2}/)?.[0]) || null }))
    .filter(h => h.anio);
}

/**
 * Calcula la depreciación del año `anio` desde la hoja de cierre anterior.
 * Devuelve null si no hay una hoja de un año anterior.
 */
export function depreciacionDesdeKardex(hojas, anio) {
  const disponibles = detectarKardex(hojas).filter(h => h.anio < anio).sort((a, b) => b.anio - a.anio);
  const hoja = disponibles[0];
  if (!hoja) return null;
  const filas = hojas[hoja.nombre];
  const iEnc = encabezadoKardex(filas);
  const enc = filas[iEnc].map(norm);
  const col = n => enc.indexOf(n);
  const c = {
    cuenta: col("ccontable"), fecha: col("fecha"), desc: enc.findIndex(x => x.startsWith("descrip")),
    actualizado: col("actualizado"), inicial: col("inicial"), restante: col("restante"),
    residual: col("vresidual"), delEjercicio: col("delejercicio"),
  };

  const activos = [];
  const omitidos = [];
  let cuentaActual = "";
  filas.slice(iEnc + 1).forEach(f => {
    const desc = String(f[c.desc] ?? "").trim();
    if (String(f[c.cuenta] ?? "").trim()) cuentaActual = String(f[c.cuenta]).trim();
    const tieneFecha = f[c.fecha] !== "" && f[c.fecha] != null;
    if (!desc || !tieneFecha) return;                        // subtotales y notas
    const actualizado = num(f[c.actualizado]);
    const residual = num(f[c.residual]);
    const restante = num(f[c.restante]);
    if (!Number.isFinite(actualizado) || !Number.isFinite(residual)) {
      omitidos.push({ descripcion: desc, motivo: String(f[c.actualizado] ?? "sin valor") });   // "vendida"
      return;
    }
    if (residual <= 0 || !(restante > 0)) {
      omitidos.push({ descripcion: desc, motivo: "ya depreciado" });
      return;
    }
    const cuotaMensual = residual / restante;
    const meses = Math.min(12, restante);
    const porMes = Array.from({ length: 12 }, (_, m) => (m < meses ? cuotaMensual : 0));
    // Fórmula del kardex anterior, para comparar
    const formulaAnterior = actualizado / restante * 12;
    activos.push({
      cuenta: cuentaActual || String(f[c.cuenta] ?? ""), descripcion: desc,
      actualizado, residual, restante, cuotaMensual, meses,
      delAnio: cuotaMensual * meses, formulaAnterior, porMes,
      depreciacionAnterior: Number.isFinite(num(f[c.delEjercicio])) ? num(f[c.delEjercicio]) : 0,
    });
  });

  const porMes = Array.from({ length: 12 }, (_, m) => Math.round(activos.reduce((s, a) => s + a.porMes[m], 0)));
  const porCuenta = {};
  activos.forEach(a => { porCuenta[a.cuenta] = (porCuenta[a.cuenta] || 0) + a.delAnio; });
  const sum = k => activos.reduce((s, a) => s + a[k], 0);
  return {
    hoja: hoja.nombre, anioBase: hoja.anio, anio, activos, omitidos, porMes, porCuenta,
    total: porMes.reduce((s, v) => s + v, 0),
    residualTotal: sum("residual"),
    totalFormulaAnterior: sum("formulaAnterior"),
    depreciacionAnioBase: sum("depreciacionAnterior"),
  };
}
