/**
 * src/lib/banco/certificados.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Lee el "Certificado de Pago" (PDF) del Banco de Chile: el detalle de una
 * nómina, beneficiario por beneficiario. Con él, la línea única
 * "Provision: Proveedores" de la cartola se abre en los pagos que contiene.
 *
 * La tabla se lee por la posición horizontal de cada columna, no por el orden
 * del texto: así un nombre o un banco que ocupa dos líneas no se mezcla con la
 * columna vecina.
 *
 * Uso:
 *   const cert = await leerCertificadoPago(await archivo.arrayBuffer());
 *   const calce = calzarNomina(cert, cartola.movimientos);
 */
import { numero, fechaISO, normalizar, normalizarRut } from "./cartolas.js";

const RUT = /^\d{1,2}\.\d{3}\.\d{3}-[\dkK]$/;

// ─── Texto con posición desde el PDF ──────────────────────────────────────────
/**
 * Devuelve los trozos de texto del PDF con su página y posición.
 * `pdfjsLib` es opcional: en el navegador se carga solo; en pruebas con Node se
 * pasa la versión "legacy".
 */
export async function trozosDePdf(arrayBuffer, pdfjsLib = null) {
  let pdfjs = pdfjsLib;
  if (!pdfjs) {
    // En el navegador (Vite): la librería y su worker se cargan solo cuando
    // alguien sube un certificado, para no engordar la carga inicial.
    pdfjs = await import("pdfjs-dist");
    const { default: workerUrl } = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
    pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  }
  const doc = await pdfjs.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
  const trozos = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const pagina = await doc.getPage(p);
    const contenido = await pagina.getTextContent();
    for (const it of contenido.items) {
      const str = (it.str || "").trim();
      if (str) trozos.push({ pagina: p, x: it.transform[4], y: it.transform[5], str });
    }
  }
  return trozos;
}

// ─── Certificado de pago del Banco de Chile ──────────────────────────────────
const COLUMNAS = [
  ["rut", "Rut Beneficiario"], ["nombre", "Nombre Beneficiario"], ["fecha", "Fecha de"],
  ["medio", "Medio de"], ["banco", "Banco"], ["cuenta", "N° de Cuenta"], ["monto", "Monto"], ["estado", "Estado"],
];

export function parsearCertificadoPago(trozos) {
  const todo = trozos.map(t => t.str).join(" ");
  if (!/certificado de pago/i.test(todo)) {
    throw new Error("No parece un certificado de pago del Banco de Chile.");
  }
  const rutEmpresa = normalizarRut((todo.match(/Rut Empresa:\s*([\d.]+-[\dkK])/i) || [])[1]);
  const razonSocial = ((todo.match(/Raz[oó]n Social:\s*(.+?)\s+Rut Empresa/i) || [])[1] || "").trim();

  // Bordes de columna desde el encabezado de la tabla (página 1).
  const encRut = trozos.find(t => t.str === "Rut Beneficiario");
  if (!encRut) throw new Error("No encontré la tabla de pagos en el certificado.");
  const enLinea = trozos.filter(t => t.pagina === encRut.pagina && Math.abs(t.y - encRut.y) < 6);
  const inicios = COLUMNAS.map(([clave, titulo]) => {
    const t = enLinea.find(e => e.str === titulo || e.str.startsWith(titulo));
    return { clave, x: t ? t.x : null };
  });
  if (inicios.some(c => c.x === null)) throw new Error("El encabezado del certificado no tiene las columnas esperadas.");
  const columnaDe = (x) => {
    let elegida = inicios[0].clave;
    for (const c of inicios) if (x >= c.x - 4) elegida = c.clave;
    return elegida;
  };

  // Recorre página por página, de arriba abajo (en PDF la "y" crece hacia arriba).
  const filas = [];
  let actual = null;
  const paginas = [...new Set(trozos.map(t => t.pagina))].sort((a, b) => a - b);
  for (const p of paginas) {
    const deLaPagina = trozos
      .filter(t => t.pagina === p && !(p === encRut.pagina && t.y >= encRut.y - 2))
      .sort((a, b) => (b.y - a.y) || (a.x - b.x));
    for (const t of deLaPagina) {
      if (/^(Se extiende|Infórmese|Página|© Todos)/.test(t.str)) { actual = null; continue; }
      const col = columnaDe(t.x);
      if (col === "rut" && RUT.test(t.str)) {
        actual = { rut: t.str, nombre: [], fecha: [], medio: [], banco: [], cuenta: [], monto: [], estado: [] };
        filas.push(actual);
        continue;
      }
      if (actual) actual[col].push(t.str);
    }
  }

  const pagos = filas.map(f => ({
    rut: normalizarRut(f.rut),
    nombre: f.nombre.join(" ").replace(/\s+/g, " ").trim(),
    fecha: fechaISO(f.fecha.join("")),
    medio: f.medio.join(" ").replace(/\s+/g, " ").trim(),
    banco: f.banco.join(" ").replace(/\s+/g, " ").trim(),
    cuenta: f.cuenta.join(""),
    monto: numero(f.monto.join("")),
    estado: f.estado.join(" ").replace(/\s+/g, " ").trim(),
  }));
  if (pagos.length === 0) throw new Error("El certificado no trae pagos.");

  const efectuados = pagos.filter(p => /efectuad/i.test(p.estado));
  return {
    tipo: "certificado_pago_bancochile",
    razonSocial, rutEmpresa,
    fechas: [...new Set(pagos.map(p => p.fecha))].sort(),
    pagos,
    total: pagos.reduce((s, p) => s + p.monto, 0),
    totalEfectuado: efectuados.reduce((s, p) => s + p.monto, 0),
    rechazados: pagos.filter(p => !/efectuad/i.test(p.estado)),
  };
}

export async function leerCertificadoPago(arrayBuffer, pdfjsLib = null) {
  return parsearCertificadoPago(await trozosDePdf(arrayBuffer, pdfjsLib));
}

// ─── Calce con la cartola ─────────────────────────────────────────────────────
const dias = (a, b) => Math.abs((new Date(a) - new Date(b)) / 86400000);

/**
 * Busca en la cartola la línea "Provision: Proveedores" que corresponde a esta
 * nómina: mismo total, misma fecha (o hasta 3 días después, por fines de semana
 * y feriados). Devuelve el movimiento o null.
 */
export function calzarNomina(certificado, movimientos) {
  const fecha = certificado.fechas[0];
  const candidatas = movimientos.filter(m =>
    /^provision proveedores/.test(normalizar(m.descripcion)) &&
    Math.round(m.cargo) === Math.round(certificado.totalEfectuado) &&
    (!fecha || (m.fecha >= fecha && dias(m.fecha, fecha) <= 3)));
  candidatas.sort((a, b) => dias(a.fecha, fecha) - dias(b.fecha, fecha));
  return candidatas[0] || null;
}

/**
 * Pagos de la nómina que además aparecen sueltos en la cartola, al mismo
 * beneficiario y por el mismo monto, dentro de `ventana` días. Pueden ser
 * duplicados o devoluciones: se muestran para revisar, no se corrigen solos.
 */
// Sufijos de sociedad y palabras de relleno: no sirven para reconocer a nadie.
const PALABRAS_VACIAS = new Set(["spa", "ltda", "limitada", "sa", "s", "a", "eirl", "cia", "compania", "y", "de", "del", "la", "el", "los", "las"]);

export function buscarRepeticiones(certificado, movimientos, ventana = 10) {
  const hallazgos = [];
  for (const p of certificado.pagos) {
    // Palabras que identifican al beneficiario (las dos primeras con sentido).
    const palabras = normalizar(p.nombre).split(" ").filter(w => w.length >= 2 && !PALABRAS_VACIAS.has(w)).slice(0, 2);
    for (const m of movimientos) {
      if (/^provision /.test(normalizar(m.descripcion))) continue;
      if (dias(m.fecha, p.fecha) > ventana) continue;
      const monto = m.cargo || m.abono;
      if (Math.round(monto) !== Math.round(p.monto)) continue;
      const d = normalizar(m.descripcion);
      const palabrasMov = new Set(d.split(" "));
      const mismoNombre = palabras.length > 0 && palabras.every(w => palabrasMov.has(w));   // palabras completas, no pedazos
      const esDevolucion = m.abono > 0 && /^devolucion|retorno de transf/.test(d);
      if (mismoNombre && m.cargo > 0) hallazgos.push({ tipo: "posible_duplicado", pago: p, movimiento: m });
      else if (esDevolucion) hallazgos.push({ tipo: "devolucion_mismo_monto", pago: p, movimiento: m });
    }
  }
  return hallazgos;
}

/**
 * Datos bancarios por beneficiario, para completar el maestro de proveedores.
 * Si un RUT aparece varias veces, queda la última cuenta usada.
 */
export function datosBancariosDe(certificado) {
  const porRut = new Map();
  for (const p of certificado.pagos) {
    if (!p.rut) continue;
    porRut.set(p.rut, { rut: p.rut, nombre: p.nombre, banco: p.banco, numeroCuenta: p.cuenta, medio: p.medio });
  }
  return [...porRut.values()];
}
