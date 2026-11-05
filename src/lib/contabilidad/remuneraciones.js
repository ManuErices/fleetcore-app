/**
 * Libro de remuneraciones (Talana, "Libro remuneraciones completo") → filas
 * Remuneraciones y Finiquitos del Flujo Mensual. Lógica pura.
 *
 * Criterio (gasto tributario, art. 31 LIR; en 14 A en el mes en que se
 * devenga la remuneración, que es el Año/Mes del libro):
 *
 *   Remuneraciones = Remuneración Total (haberes imponibles + no imponibles,
 *                    sin tope) − indemnizaciones del finiquito
 *                  + aportes del empleador (SIS, seguro de cesantía
 *                    empleador y fondo solidario, accidentes del trabajo,
 *                    capitalización individual y expectativa de vida de la
 *                    reforma previsional)
 *
 *   Finiquitos     = indemnización por años de servicio + vacaciones
 *                    pendientes − descuento AFC (art. 13 Ley 19.728: lo que
 *                    el empleador aportó a la cuenta de cesantía se imputa a
 *                    la indemnización; no lo paga la empresa ahora)
 *
 * Lo que NO es gasto adicional: descuentos legales del trabajador (AFP, salud,
 * cesantía del trabajador, impuesto único) y anticipos, porque ya están
 * dentro de la Remuneración Total.
 */

const normCol = s => String(s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");
const num = v => { const n = typeof v === "number" ? v : parseFloat(String(v ?? "").replace(/[^0-9.-]/g, "")); return Number.isFinite(n) ? n : 0; };

// Aportes de cargo del empleador (columnas que van DESPUÉS de los descuentos
// en el libro de Talana). Las columnas "… Patronal" / "… Empresarial" que
// aparecen entre los descuentos son aportes del empleador que se le cobran
// al trabajador (ej. socios): no son costo de la empresa.
export const APORTES_EMPLEADOR = [
  { id: "sis",          nombre: "Seguro de invalidez y sobrevivencia (SIS)", col: "Seguro Invalidez y Supervivencia (SIS)" },
  { id: "cesantia",     nombre: "Seguro de cesantía empleador",               col: "Seguro Cesantia Empleador" },
  { id: "solidario",    nombre: "Seguro de cesantía, fondo solidario",        col: "Seguro Cesantia (Fondo Solidario)" },
  { id: "accidentes",   nombre: "Seguro de accidentes del trabajo (mutual)",  col: "Seguro accidentes del Trabajo" },
  { id: "capitalizacion", nombre: "Reforma previsional: capitalización individual", col: "Capitalización Individual AFP" },
  { id: "expectativa",  nombre: "Reforma previsional: expectativa de vida",  col: "Expectativa de Vida" },
];

const COL = {
  anio: "Año", mes: "Mes", rut: "Rut del Trabajador", nombre: "Nombre", paterno: "Apellido Paterno",
  dias: "Días Trabajados", imponible: "Remuneración Imponible", noImponible: "Remuneración No Imponible",
  total: "Remuneración Total", descLegales: "Descuentos Legales", otrosDesc: "Otros Descuentos",
  impuestos: "Impuestos", liquido: "Sueldo Liquido A Pago", anticipos: "Anticipos",
  ias: "Indemnización por Años de Servicio (IAS)", vacaciones: "Indemnización por Vacaciones Pendientes",
  descAFC: "Descuento AFC",
};

/** Busca la fila de encabezados (la que tiene "Rut del Trabajador"). */
export function detectarLibroRemuneraciones(filas) {
  for (let i = 0; i < Math.min(filas?.length || 0, 15); i++) {
    if ((filas[i] || []).some(c => normCol(c) === normCol(COL.rut))) return i;
  }
  return -1;
}

/**
 * filas: arreglo de arreglos (sheet_to_json con header: 1). El libro trae
 * columnas repetidas ("Sueldo Base", "Impuestos"): se usa la primera.
 */
export function resumirLibroRemuneraciones(filas) {
  const iEnc = detectarLibroRemuneraciones(filas);
  if (iEnc < 0) return null;
  const enc = filas[iEnc].map(normCol);
  const idx = nombre => enc.indexOf(normCol(nombre));
  const c = Object.fromEntries(Object.entries(COL).map(([k, v]) => [k, idx(v)]));
  const cAportes = APORTES_EMPLEADOR.map(a => ({ ...a, i: idx(a.col) }));
  const v = (r, i) => (i >= 0 ? num(r[i]) : 0);

  const datos = filas.slice(iEnc + 1).filter(r => c.rut >= 0 && /\d/.test(String(r[c.rut] ?? "")) && String(r[c.anio] ?? "") !== "");

  const r = {
    documentos: datos.length, trabajadores: new Set(datos.map(x => String(x[c.rut]).trim())).size,
    anio: null, mes: null,
    haberes: 0, imponible: 0, noImponible: 0,
    aportes: Object.fromEntries(APORTES_EMPLEADOR.map(a => [a.id, 0])), totalAportes: 0,
    ias: 0, vacaciones: 0, descuentoAFC: 0,
    descuentosLegales: 0, otrosDescuentos: 0, impuestos: 0, anticipos: 0, liquido: 0,
    duplicados: [],   // finiquitos que el libro repite en otra liquidación del mismo trabajador
    sobreTope: 0,     // trabajadores con haberes sobre el tope imponible
    faltan: Object.entries(c).filter(([k, i]) => i < 0 && ["total", "rut", "anio", "mes"].includes(k)).map(([k]) => COL[k]),
  };
  const meses = {};

  // Finiquito repetido: una fila "solo finiquito" (sin días, solo IAS o
  // vacaciones) cuyo mismo monto aparece dentro de otra liquidación del
  // mismo trabajador ese mes. Se cuenta una sola vez.
  const porRut = {};
  datos.forEach((x, n) => { (porRut[String(x[c.rut]).trim()] ||= []).push(n); });
  const omitir = new Set();
  Object.values(porRut).forEach(ns => {
    if (ns.length < 2) return;
    ns.forEach(n => {
      const x = datos[n];
      const ias = v(x, c.ias), vac = v(x, c.vacaciones);
      const soloFiniquito = v(x, c.dias) === 0 && (ias || vac) && Math.abs(v(x, c.total) - ias - vac) < 1;
      if (!soloFiniquito) return;
      const otra = ns.find(m => m !== n && !omitir.has(m) && v(datos[m], c.ias) === ias && v(datos[m], c.vacaciones) === vac && v(datos[m], c.dias) > 0);
      if (otra !== undefined) {
        omitir.add(n);
        r.duplicados.push({ rut: String(x[c.rut]).trim(), nombre: `${x[c.nombre] ?? ""} ${x[c.paterno] ?? ""}`.trim(), monto: ias + vac });
      }
    });
  });

  datos.forEach((x, n) => {
    if (c.anio >= 0 && c.mes >= 0) {
      const k = `${num(x[c.anio])}-${num(x[c.mes]) - 1}`;
      meses[k] = (meses[k] || 0) + 1;
    }
    if (omitir.has(n)) return;
    const total = v(x, c.total);
    r.haberes += total;
    r.imponible += v(x, c.imponible);
    r.noImponible += v(x, c.noImponible);
    if (total - v(x, c.imponible) - v(x, c.noImponible) > 1) r.sobreTope++;
    cAportes.forEach(a => { const m = v(x, a.i); r.aportes[a.id] += m; r.totalAportes += m; });
    r.ias += v(x, c.ias);
    r.vacaciones += v(x, c.vacaciones);
    r.descuentoAFC += v(x, c.descAFC);
    r.descuentosLegales += v(x, c.descLegales);
    r.otrosDescuentos += v(x, c.otrosDesc);
    r.impuestos += v(x, c.impuestos);
    r.anticipos += v(x, c.anticipos);
    r.liquido += v(x, c.liquido);
  });

  const top = Object.entries(meses).sort((a, b) => b[1] - a[1])[0];
  if (top) { const [a, m] = top[0].split("-").map(Number); r.anio = a; r.mes = m; }

  r.indemnizaciones = r.ias + r.vacaciones;
  r.remuneraciones = Math.round(r.haberes - r.indemnizaciones + r.totalAportes);
  r.finiquitos = Math.round(r.indemnizaciones - r.descuentoAFC);
  r.montoDuplicados = r.duplicados.reduce((s, d) => s + d.monto, 0);
  return r;
}
