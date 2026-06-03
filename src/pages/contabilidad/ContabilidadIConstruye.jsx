import React, { useState, useCallback, useRef, useMemo } from "react";
import * as XLSX from "xlsx";
import { useContabilidad, fmt } from "./ContabilidadContext";

// ══════════════════════════════════════════════════════════════════════════════
// PLAN DE CUENTAS MPFINGENIERIA — mapeado al sistema de tipos de FleetCore
// Código real → { nombre, tipo (FleetCore), grupo }
// ══════════════════════════════════════════════════════════════════════════════
export const PLAN_MPFINGENIERIA = [
  // ACTIVO CORRIENTE
  { codigo: "1.01.01.01", nombre: "Caja",                          tipo: "activo_corriente" },
  { codigo: "1.01.01.02", nombre: "Banco de Chile",                tipo: "activo_corriente" },
  { codigo: "1.01.01.03", nombre: "Banco Bice",                    tipo: "activo_corriente" },
  { codigo: "1.01.01.04", nombre: "Banco Santander",               tipo: "activo_corriente" },
  { codigo: "1.01.01.05", nombre: "Banco Itau",                    tipo: "activo_corriente" },
  { codigo: "1.01.01.06", nombre: "Banco Estado",                  tipo: "activo_corriente" },
  { codigo: "1.01.01.07", nombre: "Banco Scotiabank",              tipo: "activo_corriente" },
  { codigo: "1.01.01.10", nombre: "Fondos por Rendir",             tipo: "activo_corriente" },
  { codigo: "1.01.02.01", nombre: "Deudores por venta",            tipo: "activo_corriente" },
  { codigo: "1.01.02.02", nombre: "Retenciones por Facturar",      tipo: "activo_corriente" },
  { codigo: "1.01.02.03", nombre: "Obras Ejecutadas por Cobrar",   tipo: "activo_corriente" },
  { codigo: "1.01.02.04", nombre: "Boletas en Garantía",           tipo: "activo_corriente" },
  { codigo: "1.01.02.05", nombre: "Retenciones de clientes",       tipo: "activo_corriente" },
  { codigo: "1.01.03.01", nombre: "Anticipo de Empleados",         tipo: "activo_corriente" },
  { codigo: "1.01.03.02", nombre: "Prestamos Empleados",           tipo: "activo_corriente" },
  { codigo: "1.01.04.01", nombre: "Cuenta Empresa Relacionada",    tipo: "activo_corriente" },
  { codigo: "1.01.05.01", nombre: "Existencias",                   tipo: "activo_corriente" },
  { codigo: "1.01.06.01", nombre: "IVA Credito Fiscal",            tipo: "iva_credito"      },
  { codigo: "1.01.06.02", nombre: "PPM",                           tipo: "ppm"              },
  { codigo: "1.01.06.03", nombre: "Otros Impuestos por Recuperar", tipo: "activo_corriente" },
  { codigo: "1.01.06.04", nombre: "Remanente Crédito Fiscal",      tipo: "iva_credito"      },
  { codigo: "1.01.07.01", nombre: "Anticipo Proveedores",          tipo: "activo_corriente" },
  { codigo: "1.01.07.02", nombre: "Garantia Arriendo",             tipo: "activo_corriente" },
  { codigo: "1.01.07.03", nombre: "Anticipo Honorarios",           tipo: "activo_corriente" },
  { codigo: "1.01.08.01", nombre: "Otros activos circulantes",     tipo: "activo_corriente" },
  { codigo: "1.01.08.02", nombre: "Documentos enviados a Factoring",tipo:"activo_corriente" },
  { codigo: "1.01.09.01", nombre: "Contratos de leasing (neto)",   tipo: "activo_corriente" },
  // ACTIVO NO CORRIENTE
  { codigo: "1.02.02.01", nombre: "Maquinarias y equipos",         tipo: "activo_no_corriente" },
  { codigo: "1.02.02.02", nombre: "Equipos Menores Activo Fijo",   tipo: "activo_no_corriente" },
  { codigo: "1.02.03.01", nombre: "Muebles y Utiles",              tipo: "activo_no_corriente" },
  { codigo: "1.02.03.02", nombre: "Equipos Computacionales",       tipo: "activo_no_corriente" },
  { codigo: "1.02.03.03", nombre: "Vehiculos Menores",             tipo: "activo_no_corriente" },
  { codigo: "1.02.04.01", nombre: "Depreciación Acumulada",        tipo: "activo_no_corriente" },
  { codigo: "1.03.01.01", nombre: "Inversiones empresas relacionadas", tipo: "activo_no_corriente" },
  { codigo: "1.03.02.01", nombre: "Deudores a largo plazo",        tipo: "activo_no_corriente" },
  { codigo: "1.03.04.01", nombre: "Contratos de leasing LP (neto)",tipo: "activo_no_corriente" },
  // PASIVO CORRIENTE
  { codigo: "2.01.01.01", nombre: "Prestamos por Pagar CP",        tipo: "pasivo_corriente" },
  { codigo: "2.01.01.02", nombre: "Linea de Credito Banco",        tipo: "pasivo_corriente" },
  { codigo: "2.01.01.03", nombre: "Tarjeta de Credito Banco",      tipo: "pasivo_corriente" },
  { codigo: "2.01.02.01", nombre: "Prestamos por Pagar LP, porción CP", tipo: "pasivo_corriente" },
  { codigo: "2.01.02.02", nombre: "Obligaciones por Leasing",      tipo: "pasivo_corriente" },
  { codigo: "2.01.04.01", nombre: "Proveedores por Pagar",         tipo: "pasivo_corriente" },
  { codigo: "2.01.04.02", nombre: "Honorarios por Pagar",          tipo: "pasivo_corriente" },
  { codigo: "2.01.04.03", nombre: "Cheques por Pagar",             tipo: "pasivo_corriente" },
  { codigo: "2.01.04.04", nombre: "Rendiciones por Pagar",         tipo: "pasivo_corriente" },
  { codigo: "2.01.05.01", nombre: "Remuneraciones por Pagar",      tipo: "pasivo_corriente" },
  { codigo: "2.01.07.01", nombre: "Provisiones Varias",            tipo: "pasivo_corriente" },
  { codigo: "2.01.07.02", nombre: "Provisión Costos de Obras",     tipo: "pasivo_corriente" },
  { codigo: "2.01.08.04", nombre: "IVA Debito Fiscal",             tipo: "iva_debito"       },
  { codigo: "2.01.08.05", nombre: "Impuestos por Pagar",           tipo: "pasivo_corriente" },
  { codigo: "2.01.08.06", nombre: "IVA Postergado",                tipo: "pasivo_corriente" },
  { codigo: "2.01.08.01", nombre: "Leyes Sociales por Pagar",      tipo: "pasivo_corriente" },
  { codigo: "2.01.09.01", nombre: "Impuesto a la renta",           tipo: "pasivo_corriente" },
  { codigo: "2.01.10.01", nombre: "Anticipo de Clientes",          tipo: "pasivo_corriente" },
  // PASIVO NO CORRIENTE
  { codigo: "2.02.01.01", nombre: "Prestamo Bancario Largo Plazo", tipo: "pasivo_no_corriente" },
  { codigo: "2.01.02.02", nombre: "Obligaciones por Leasing LP",   tipo: "pasivo_no_corriente" },
  // PATRIMONIO
  { codigo: "2.03.01.01", nombre: "Capital",                       tipo: "patrimonio" },
  { codigo: "2.03.02.01", nombre: "Utilidades acumuladas",         tipo: "patrimonio" },
  { codigo: "2.03.02.02", nombre: "Utilidad del Ejercicio",        tipo: "patrimonio" },
  { codigo: "2.03.03.03", nombre: "Resultado Acumulado",           tipo: "patrimonio" },
  // INGRESOS
  { codigo: "3.01.01.01", nombre: "Ingreso por obra",              tipo: "ingreso" },
  { codigo: "3.01.01.02", nombre: "Otros Ingresos Operacionales",  tipo: "ingreso" },
  { codigo: "3.02.02.01", nombre: "Utilidad en venta de Activo Fijo", tipo: "otro_resultado" },
  { codigo: "3.02.02.02", nombre: "Otros ingresos no operacionales",  tipo: "otro_resultado" },
  // COSTOS DE OBRA (cuentas 4.xx que el Excel no mostraba, pero son estándar para una constructora)
  { codigo: "4.01.01.01", nombre: "Subcontratos",                  tipo: "costo" },
  { codigo: "4.01.01.02", nombre: "Materiales y Suministros",      tipo: "costo" },
  { codigo: "4.01.01.03", nombre: "Mano de Obra Directa",          tipo: "costo" },
  { codigo: "4.01.01.04", nombre: "Arriendo de Equipos",           tipo: "costo" },
  { codigo: "4.01.01.05", nombre: "Fletes y Transportes",          tipo: "costo" },
  { codigo: "4.01.01.06", nombre: "Combustibles y Lubricantes",    tipo: "costo" },
  { codigo: "4.01.01.07", nombre: "EPP y Seguridad",               tipo: "costo" },
  { codigo: "4.01.01.08", nombre: "Servicios de Terceros",         tipo: "costo" },
  { codigo: "4.01.01.09", nombre: "Otros Costos de Obra",          tipo: "costo" },
  // GASTOS ADMINISTRACIÓN (5.xx)
  { codigo: "5.01.01.01", nombre: "Remuneraciones Administración", tipo: "gasto_adm" },
  { codigo: "5.01.01.02", nombre: "Arriendos Oficina",             tipo: "gasto_adm" },
  { codigo: "5.01.01.03", nombre: "Gastos Generales Adm.",         tipo: "gasto_adm" },
  { codigo: "5.01.01.04", nombre: "Honorarios Profesionales",      tipo: "gasto_adm" },
  { codigo: "5.01.01.05", nombre: "Comunicaciones y TI",           tipo: "gasto_adm" },
  { codigo: "5.01.01.06", nombre: "Capacitación",                  tipo: "gasto_adm" },
  { codigo: "5.01.01.07", nombre: "Seguros",                       tipo: "gasto_adm" },
  { codigo: "5.01.01.08", nombre: "Depreciación del Período",      tipo: "otro_resultado" },
  // GASTOS FINANCIEROS (6.xx)
  { codigo: "6.01.01.01", nombre: "Intereses Bancarios",           tipo: "gasto_fin" },
  { codigo: "6.01.01.02", nombre: "Intereses Leasing",             tipo: "gasto_fin" },
  { codigo: "6.01.01.03", nombre: "Comisiones Bancarias",          tipo: "gasto_fin" },
];

// ── Mapeo de palabras clave en glosa → código de cuenta sugerida ──────────────
const SUGERENCIAS_GLOSA = [
  // Transportes / fletes
  { keys: ["camión", "camion", "tolva", "aljibe", "flete", "transporte", "vehiculo", "tracto"], codigo: "4.01.01.05" },
  // Subcontratos / fabricación
  { keys: ["fabricación", "fabricacion", "subcontrato", "instalación", "instalacion", "construcción", "obras"],  codigo: "4.01.01.01" },
  // Arriendo equipos / GPS / maquinaria
  { keys: ["arriendo", "renta", "gps", "satelital", "equipo", "maquinaria", "pluma", "grúa", "grua"],            codigo: "4.01.01.04" },
  // EPP / seguridad
  { keys: ["epp", "seguridad", "casco", "antiparras", "guante", "chaleco", "uniforme", "optica", "lente"],       codigo: "4.01.01.07" },
  // Materiales / insumos
  { keys: ["material", "insumo", "tubos", "corrugado", "fierro", "granular", "árido", "arido", "filtro", "cardan", "neumático", "neumatico", "escotilla", "repuesto", "artículo", "articulo"], codigo: "4.01.01.02" },
  // Combustible
  { keys: ["combustible", "petróleo", "petroleo", "bencina", "gasoil"],                                           codigo: "4.01.01.06" },
  // Salud / exámenes
  { keys: ["examen", "exámen", "preocupacional", "salud", "médico", "medico", "preomed"],                         codigo: "4.01.01.07" },
  // Capacitación / RRHH
  { keys: ["capacitación", "capacitacion", "universidad", "curso", "charla"],                                     codigo: "5.01.01.06" },
  // Honorarios
  { keys: ["honorario", "asesoría", "asesoria", "consultoría", "consultoria", "profesional"],                     codigo: "5.01.01.04" },
  // Arriendo oficina / alojamiento
  { keys: ["arriendo oficina", "alojamiento", "habitación", "habitacion", "oficina"],                             codigo: "5.01.01.02" },
  // Comunicaciones / telefonía
  { keys: ["teléfono", "telefono", "telefonía", "telefonia", "internet", "talana", "comunicación"],               codigo: "5.01.01.05" },
  // Motosoldadora / herramientas (se activa como material/equipo)
  { keys: ["motosoldadora", "soldadora", "herramienta", "oxicorte", "vibrador"],                                  codigo: "4.01.01.02" },
];

// Encontrar sugerencia por palabras clave en la glosa
function sugerirCuenta(glosa = "", proveedor = "") {
  const texto = (glosa + " " + proveedor).toLowerCase();
  for (const s of SUGERENCIAS_GLOSA) {
    if (s.keys.some(k => texto.includes(k))) return s.codigo;
  }
  return "4.01.01.09"; // Otros Costos de Obra por defecto
}

const PLAN_MAP = Object.fromEntries(PLAN_MPFINGENIERIA.map(c => [c.codigo, c]));

// ══════════════════════════════════════════════════════════════════════════════
// PARSEO DE ARCHIVOS (igual que versión anterior, robusto)
// ══════════════════════════════════════════════════════════════════════════════
function parseNum(v) {
  if (v === null || v === undefined || v === "") return 0;
  if (typeof v === "number") return Math.abs(v);
  const s = String(v).trim();
  const clean = s.replace(/\./g, "").replace(",", ".").replace(/[^0-9.\-]/g, "");
  const n = parseFloat(clean);
  return isNaN(n) ? 0 : Math.abs(n);
}

function parseFecha(v) {
  if (!v && v !== 0) return new Date().toISOString().slice(0, 10);
  if (v instanceof Date || (typeof v === "object" && v !== null && typeof v.getFullYear === "function"))
    return v.toISOString().slice(0, 10);
  if (typeof v === "number") {
    const d = new Date((v - 25569) * 86400 * 1000);
    return d.toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  const m1 = s.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})$/);
  if (m1) return `${m1[3]}-${m1[2].padStart(2,"0")}-${m1[1].padStart(2,"0")}`;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return new Date().toISOString().slice(0, 10);
}

function col(headers, ...keywords) {
  for (const kw of keywords) {
    const i = headers.findIndex(h => String(h||"").toLowerCase().includes(kw.toLowerCase()));
    if (i >= 0) return i;
  }
  return -1;
}

function detectarTipo(headers) {
  const h = headers.map(x => String(x||"").toLowerCase());
  if (h.some(x => x.includes("folio") || x.includes("monto factura") || x.includes("n factura"))) return "factura_oc";
  if (h.some(x => x.includes("montorecibido") || x.includes("saldo por recibir") || x.includes("n oc") || x.includes("nombre oc"))) return "oc";
  if (h.some(x => x.includes("numero") || x.includes("número")) && h.some(x => x.includes("total"))) return "ep";
  return "generico";
}

function parsearArchivo(buffer) {
  const wb  = XLSX.read(buffer, { type: "array", cellDates: true });
  const ws  = wb.Sheets[wb.SheetNames[0]];
  const rawN = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true });
  const rawS = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: false });
  if (!rawN || rawN.length < 2) return { filas: [], tipoArchivo: "generico" };

  let headerRow = 0;
  for (let i = 0; i < Math.min(15, rawN.length); i++) {
    if ((rawN[i]||[]).filter(Boolean).length >= 3) { headerRow = i; break; }
  }

  const headers = (rawN[headerRow]||[]).map(h => String(h||"").trim());
  const tipoArchivo = detectarTipo(headers);

  const dataRows = rawN.slice(headerRow+1).map((rowN, idx) => {
    const rowS = rawS[headerRow+1+idx] || [];
    return headers.map((_, ci) => {
      const vN = rowN ? rowN[ci] : null;
      const vS = rowS ? rowS[ci] : null;
      if (typeof vN === "number") return vN;
      if (vS instanceof Date) return vS;
      return vS !== null && vS !== undefined ? vS : vN;
    });
  }).filter(row => row.filter(Boolean).length >= 2);

  const iNOC       = col(headers, "n° orden compra","n orden compra","n oc","nº orden","n° oc");
  const iNombre    = col(headers, "nombre orden compra","nombre oc","nombre orden");
  const iProveedor = col(headers, "proveedor");
  const iFechaEnv  = col(headers, "fecha de envio","fecha envio","fecha");
  const iFechaFact = col(headers, "fecha de recepción factura","fecha recepcion factura","fecha recepción factura");
  const iTotalOC   = col(headers, "total oc");
  const iMontoFact = col(headers, "monto factura");
  const iMontoRec  = col(headers, "monto recibido");
  const iNFact     = col(headers, "n factura");
  const iFolio     = col(headers, "folio unico","folio único");
  const iCentro    = col(headers, "centro de gestion","centro de gestión");
  const iNumero    = col(headers, "numero","número");
  const iTotal     = col(headers, "total");
  const iEstado    = col(headers, "estado");
  const iObra      = col(headers, "obra","centro de gestión","centro de gestion");
  const iMonto     = headers.findIndex(h => String(h||"").toLowerCase() === "monto");

  let filas = [];
  if (tipoArchivo === "factura_oc") {
    filas = dataRows.map(row => {
      const montoFact = iMontoFact >= 0 ? parseNum(row[iMontoFact]) : 0;
      const montoRec  = iMontoRec  >= 0 ? parseNum(row[iMontoRec])  : 0;
      const totalOC   = iTotalOC   >= 0 ? parseNum(row[iTotalOC])   : 0;
      const monto = montoFact || montoRec || totalOC;
      if (!monto) return null;
      const fechaRaw = (iFechaFact >= 0 && row[iFechaFact]) ? row[iFechaFact] : row[iFechaEnv];
      return {
        tipoArchivo: "factura_oc",
        nDoc:      String(row[iNOC]||"").trim(),
        glosa:     String(row[iNombre]||"").trim(),
        proveedor: String(row[iProveedor]||"").trim(),
        fecha:     parseFecha(fechaRaw),
        monto,
        folio:     String((iFolio>=0?row[iFolio]:null)||(iNFact>=0?row[iNFact]:null)||"").trim(),
        proyecto:  "",
      };
    }).filter(Boolean);
  } else if (tipoArchivo === "oc") {
    filas = dataRows.map(row => {
      const monto = parseNum(iMonto >= 0 ? row[iMonto] : 0);
      if (!monto) return null;
      return {
        tipoArchivo: "oc",
        nDoc:      String(row[iNOC]||"").trim(),
        glosa:     String(row[iNombre]||"").trim(),
        proveedor: String(row[iProveedor]||"").trim(),
        fecha:     parseFecha(row[iFechaEnv]),
        proyecto:  String(row[iObra]||"").trim(),
        monto, folio: "",
      };
    }).filter(Boolean);
  } else if (tipoArchivo === "ep") {
    filas = dataRows.map(row => {
      const total = parseNum(row[iTotal]);
      const nDoc  = String(row[iNumero]||"").trim();
      if (!total || total < 100 || !nDoc) return null;
      return {
        tipoArchivo: "ep",
        nDoc,
        glosa:    `EP ${nDoc}`,
        proyecto: String(row[iCentro]||"").trim(),
        fecha:    parseFecha(row[iFechaEnv >= 0 ? iFechaEnv : iNumero]),
        monto:    total,
        proveedor:"", folio: "",
        estado:   String(row[iEstado]||"").trim(),
      };
    }).filter(Boolean);
  }

  return { filas, tipoArchivo };
}

// ══════════════════════════════════════════════════════════════════════════════
// GENERAR PROPUESTA DE ASIENTOS (con cuentas reales de MPFINGENIERIA)
// ══════════════════════════════════════════════════════════════════════════════
function generarPropuesta(filas, tipoArchivo) {
  // Cuentas fijas del plan real
  const C_IVA_CF    = PLAN_MAP["1.01.06.01"]; // IVA Credito Fiscal
  const C_IVA_DF    = PLAN_MAP["2.01.08.04"]; // IVA Debito Fiscal
  const C_PAGAR     = PLAN_MAP["2.01.04.01"]; // Proveedores por Pagar
  const C_COBRAR    = PLAN_MAP["1.01.02.01"]; // Deudores por venta
  const C_INGRESO   = PLAN_MAP["3.01.01.01"]; // Ingreso por obra

  return filas.map((f, idx) => {
    const { glosa, proveedor, nDoc, folio, proyecto, fecha, monto } = f;
    const [anio, mes] = fecha.split("-");
    const periodo = `${anio}-${mes}`;
    const netoVal = Math.round(monto / 1.19);
    const ivaVal  = monto - netoVal;

    const glosaTxt = [
      glosa || proveedor || nDoc,
      proveedor && proveedor !== glosa ? `· ${proveedor}` : "",
      nDoc   ? `· ${nDoc}`   : "",
      folio  ? `· F°${folio}` : "",
      proyecto ? `· ${proyecto}` : "",
    ].filter(Boolean).join(" ");

    // Sugerir cuenta de costo/gasto basado en glosa+proveedor
    const codigoCosto = sugerirCuenta(glosa, proveedor);
    const cuentaCosto = PLAN_MAP[codigoCosto];

    if (tipoArchivo === "factura_oc" || tipoArchivo === "oc") {
      return {
        id: idx,
        fecha, glosa: glosaTxt, tipo: "iconstruye", origen: "iconstruye",
        tipoDoc: tipoArchivo === "ep" ? "ep" : tipoArchivo === "oc" ? "oc" : "factura",
        periodo, proveedor, folio, proyecto,
        totalDebe: monto,
        // Propuesta editable: cada línea tiene codigoSugerido que el usuario puede cambiar
        lineasPropuesta: [
          {
            rol: "costo",
            codigoCuenta: cuentaCosto.codigo,
            nombreCuenta: cuentaCosto.nombre,
            tipoCuenta:   cuentaCosto.tipo,
            debe: netoVal, haber: 0,
            descripcion: glosa || proveedor,
            editable: true,
            label: "Cuenta de costo/gasto",
          },
          {
            rol: "iva_cf",
            codigoCuenta: C_IVA_CF.codigo,
            nombreCuenta: C_IVA_CF.nombre,
            tipoCuenta:   C_IVA_CF.tipo,
            debe: ivaVal, haber: 0,
            descripcion: "IVA Crédito Fiscal",
            editable: false,
            label: "IVA CF",
          },
          {
            rol: "pagar",
            codigoCuenta: C_PAGAR.codigo,
            nombreCuenta: C_PAGAR.nombre,
            tipoCuenta:   C_PAGAR.tipo,
            debe: 0, haber: monto,
            descripcion: folio ? `Folio ${folio}` : (proveedor || nDoc),
            editable: true,
            label: "Cuenta por pagar",
          },
        ],
      };
    } else { // EP
      return {
        id: idx,
        fecha, glosa: glosaTxt, tipo: "iconstruye", origen: "iconstruye",
        tipoDoc: "ep", periodo, proyecto, folio: "",
        totalDebe: monto,
        lineasPropuesta: [
          {
            rol: "cobrar",
            codigoCuenta: C_COBRAR.codigo,
            nombreCuenta: C_COBRAR.nombre,
            tipoCuenta:   C_COBRAR.tipo,
            debe: monto, haber: 0,
            descripcion: glosaTxt,
            editable: true,
            label: "Cuenta por cobrar",
          },
          {
            rol: "ingreso",
            codigoCuenta: C_INGRESO.codigo,
            nombreCuenta: C_INGRESO.nombre,
            tipoCuenta:   C_INGRESO.tipo,
            debe: 0, haber: netoVal,
            descripcion: `EP: ${nDoc}`,
            editable: true,
            label: "Cuenta de ingreso",
          },
          {
            rol: "iva_df",
            codigoCuenta: C_IVA_DF.codigo,
            nombreCuenta: C_IVA_DF.nombre,
            tipoCuenta:   C_IVA_DF.tipo,
            debe: 0, haber: ivaVal,
            descripcion: "IVA Débito Fiscal",
            editable: false,
            label: "IVA DF",
          },
        ],
      };
    }
  });
}

// Convertir propuesta → asiento final
// Si una cuenta del plan MPFINGENIERIA no existe en Firestore, la crea primero.
async function propuestaAAsiento(p, cuentasFirestore, guardarCuenta) {
  // Cache local para no crear la misma cuenta dos veces en el mismo import
  const cacheCreadas = {};

  const resolverCuenta = async (codigoCuenta, nombreCuenta, tipoCuenta) => {
    // Buscar en Firestore (admite código con puntos o guiones)
    const existe = cuentasFirestore.find(x =>
      x.codigo === codigoCuenta ||
      x.codigo === codigoCuenta.replace(/\./g, "-") ||
      x.nombre?.toLowerCase() === nombreCuenta?.toLowerCase()
    );
    if (existe) return { id: existe.id, nombre: existe.nombre };

    // Ya la creamos en esta sesión de import
    if (cacheCreadas[codigoCuenta]) return cacheCreadas[codigoCuenta];

    // Crear cuenta nueva en Firestore
    const nuevaId = await guardarCuenta({
      codigo: codigoCuenta,
      nombre: nombreCuenta,
      tipo:   tipoCuenta || "costo",
      activa: true,
    });
    const resultado = { id: nuevaId || codigoCuenta, nombre: nombreCuenta };
    cacheCreadas[codigoCuenta] = resultado;
    return resultado;
  };

  const lineas = [];
  for (const l of p.lineasPropuesta) {
    const fc = await resolverCuenta(l.codigoCuenta, l.nombreCuenta, l.tipoCuenta);
    lineas.push({
      cuentaId:     fc.id,
      cuentaNombre: l.nombreCuenta,
      debe:  l.debe,
      haber: l.haber,
      descripcion: l.descripcion,
    });
  }

  return {
    fecha: p.fecha, glosa: p.glosa, tipo: p.tipo, origen: p.origen,
    tipoDoc: p.tipoDoc, periodo: p.periodo, proveedor: p.proveedor,
    folio: p.folio, proyecto: p.proyecto,
    totalDebe: lineas.reduce((s,l) => s + (l.debe||0), 0),
    lineas,
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// UI
// ══════════════════════════════════════════════════════════════════════════════
const TIPO_INFO = {
  factura_oc: { label: "Factura OC",   color: "bg-violet-100 text-violet-700"   },
  oc:         { label: "Orden Compra", color: "bg-blue-100 text-blue-700"       },
  ep:         { label: "Estado Pago",  color: "bg-emerald-100 text-emerald-700" },
};

// Selector de cuenta del plan (dropdown completo)
function SelectorCuenta({ linea, onChange }) {
  const grupos = useMemo(() => {
    const g = {};
    PLAN_MPFINGENIERIA.forEach(c => {
      const prefix = c.codigo.split(".")[0];
      const grupo = prefix === "1" ? "ACTIVO" : prefix === "2" ? "PASIVO / PATRIMONIO" : prefix === "3" ? "INGRESOS" : "COSTOS Y GASTOS";
      if (!g[grupo]) g[grupo] = [];
      g[grupo].push(c);
    });
    return g;
  }, []);

  return (
    <select
      value={linea.codigoCuenta}
      onChange={e => {
        const c = PLAN_MAP[e.target.value];
        if (c) onChange({ ...linea, codigoCuenta: c.codigo, nombreCuenta: c.nombre, tipoCuenta: c.tipo });
      }}
      className="w-full px-2 py-1.5 border-2 border-orange-200 rounded-lg text-xs font-semibold focus:outline-none focus:border-orange-400 bg-orange-50"
    >
      {Object.entries(grupos).map(([grupo, cuentas]) => (
        <optgroup key={grupo} label={`── ${grupo} ──`}>
          {cuentas.map(c => (
            <option key={c.codigo} value={c.codigo}>{c.codigo} — {c.nombre}</option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

// Fila de un asiento en el editor
function AsientoEditor({ propuesta, sel, onToggle, onCambiarCuenta, expandido, onToggleExpand }) {
  const isExpanded = expandido === propuesta.id;
  return (
    <div className={`border rounded-xl overflow-hidden transition-all ${sel ? "border-orange-200 bg-orange-50/20" : "border-slate-100 opacity-50"}`}>
      {/* Cabecera */}
      <div className="flex items-center gap-2 px-3 py-2.5">
        <input type="checkbox" className="w-3.5 h-3.5 accent-orange-500 flex-shrink-0"
          checked={sel} onChange={onToggle} />
        <div className="flex-1 min-w-0 cursor-pointer" onClick={onToggleExpand}>
          <p className="text-xs font-bold text-slate-800 truncate">{propuesta.glosa}</p>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-[10px] text-slate-400">{propuesta.fecha}</span>
            <span className="text-[10px] text-slate-400">{propuesta.periodo}</span>
            <span className="text-[10px] font-bold text-orange-500">
              {propuesta.lineasPropuesta.find(l=>l.editable)?.nombreCuenta}
            </span>
          </div>
        </div>
        <span className="text-xs font-black font-mono text-slate-700 flex-shrink-0">{fmt(propuesta.totalDebe)}</span>
        <button onClick={onToggleExpand}
          className={`w-6 h-6 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0 transition-transform ${isExpanded?"rotate-180":""}`}>
          <svg className="w-3 h-3 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"/></svg>
        </button>
      </div>

      {/* Editor de líneas */}
      {isExpanded && (
        <div className="border-t border-slate-100 px-3 pb-3 pt-2 space-y-2 bg-white">
          {propuesta.lineasPropuesta.map((linea, li) => (
            <div key={li} className="grid grid-cols-12 gap-2 items-center">
              <div className="col-span-1">
                <span className={`text-[9px] font-black px-1 py-0.5 rounded uppercase
                  ${linea.editable ? "bg-orange-100 text-orange-600" : "bg-slate-100 text-slate-400"}`}>
                  {linea.label?.split(" ")[0]}
                </span>
              </div>
              <div className="col-span-7">
                {linea.editable
                  ? <SelectorCuenta linea={linea} onChange={updated => onCambiarCuenta(propuesta.id, li, updated)} />
                  : <div className="px-2 py-1.5 bg-slate-50 border border-slate-100 rounded-lg text-xs text-slate-500">
                      {linea.codigoCuenta} — {linea.nombreCuenta}
                    </div>
                }
              </div>
              <div className="col-span-2 text-right">
                {linea.debe > 0 && <span className="text-xs font-mono font-bold text-emerald-600">{fmt(linea.debe)}</span>}
              </div>
              <div className="col-span-2 text-right">
                {linea.haber > 0 && <span className="text-xs font-mono font-bold text-red-500">{fmt(linea.haber)}</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────
export default function ContabilidadIConstruye({ onClose }) {
  const { cuentas, guardarAsiento, guardarCuenta, cargarCuentas } = useContabilidad();
  const fileRef = useRef(null);

  const [step, setStep]           = useState("upload");
  const [propuestas, setPropuestas] = useState([]);
  const [tipoDetec, setTipo]      = useState("");
  const [sel, setSel]             = useState(new Set());
  const [expandido, setExpandido] = useState(null);
  const [importados, setImport]   = useState(0);
  const [duplicados, setDuplicados] = useState(0);
  const [errores, setErrores]     = useState([]);
  const [fileName, setFileName]   = useState("");
  const [dragOver, setDragOver]   = useState(false);

  const procesarArchivo = useCallback((file) => {
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const buffer = new Uint8Array(e.target.result);
        const { filas, tipoArchivo } = parsearArchivo(buffer);
        const props = generarPropuesta(filas, tipoArchivo);
        setTipo(tipoArchivo);
        setPropuestas(props);
        setSel(new Set(props.map(p => p.id)));
        setStep("preview");
      } catch (err) {
        alert("Error al leer el archivo: " + err.message);
      }
    };
    reader.readAsArrayBuffer(file);
  }, []);

  const onDrop = useCallback((e) => {
    e.preventDefault(); setDragOver(false);
    procesarArchivo(e.dataTransfer.files[0]);
  }, [procesarArchivo]);

  const toggleSel   = (id) => setSel(s => { const ns = new Set(s); ns.has(id)?ns.delete(id):ns.add(id); return ns; });
  const toggleTodos = () => setSel(sel.size===propuestas.length ? new Set() : new Set(propuestas.map(p=>p.id)));

  const cambiarCuenta = (propuestaId, lineaIdx, updated) => {
    setPropuestas(ps => ps.map(p =>
      p.id !== propuestaId ? p : {
        ...p,
        lineasPropuesta: p.lineasPropuesta.map((l, i) => i === lineaIdx ? updated : l)
      }
    ));
  };

  const importar = async () => {
    setStep("importing");
    const errs = []; let ok = 0; let dups = 0;
    setDuplicados(0);
    // guardarCuenta extendida que retorna el id de la cuenta creada
    const guardarCuentaConId = async (data) => {
      const { addDoc, collection, serverTimestamp } = await import("firebase/firestore");
      // guardarCuenta del contexto no retorna id — usamos una versión directa
      // que sí lo hace, luego recargamos cuentas
      return await guardarCuenta(data);
    };
    for (const p of propuestas.filter(p => sel.has(p.id))) {
      try {
        const asiento = await propuestaAAsiento(p, cuentas, guardarCuenta);
        const resultado = await guardarAsiento(asiento);
        if (resultado?.duplicado) {
          dups++;
          setDuplicados(dups);
        } else {
          ok++; setImport(ok);
        }
      } catch (e) { errs.push(`${p.glosa?.slice(0,40)}: ${e.message}`); }
    }
    // Recargar cuentas por si se crearon nuevas durante el import
    cargarCuentas();
    setErrores(errs);
    setStep("done");
  };

  const totalSel = [...sel].reduce((s, id) => {
    const p = propuestas.find(x => x.id === id);
    return s + (p?.totalDebe || 0);
  }, 0);

  const info = TIPO_INFO[tipoDetec] || { label: "Desconocido", color: "bg-slate-100 text-slate-500" };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-3 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl my-auto overflow-hidden">

        {/* Header */}
        <div className="bg-gradient-to-r from-orange-600 to-amber-500 p-5 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center text-xl">🏗️</div>
            <div>
              <h2 className="font-black text-base">Importar desde IConstruye</h2>
              <p className="text-white/75 text-xs">Plan de cuentas MPFINGENIERIA · Propuesta automática editable</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>

        {/* Steps */}
        <div className="flex border-b border-slate-100">
          {[["upload","1","Subir"],["preview","2","Revisar y editar"],["done","3","Listo"]].map(([s,n,label]) => (
            <div key={s} className={`flex-1 flex items-center justify-center gap-2 py-3 text-xs font-bold
              ${step===s?"text-orange-600 border-b-2 border-orange-500":"text-slate-400"}`}>
              <span className={`w-5 h-5 rounded-full text-[10px] font-black flex items-center justify-center
                ${step===s?"bg-orange-500 text-white":"bg-slate-100 text-slate-400"}`}>{n}</span>
              <span className="hidden sm:inline">{label}</span>
            </div>
          ))}
        </div>

        <div className="p-5">

          {/* ── UPLOAD ── */}
          {step === "upload" && (
            <div className="space-y-5">
              <div className="grid sm:grid-cols-3 gap-3">
                {[
                  { icon:"🧾", tipo:"factura_oc", nombre:"Recepción y Facturación de OC", desc:"Facturas con folio real" },
                  { icon:"🛒", tipo:"oc",         nombre:"Órdenes de compra",             desc:"Compromisos de gasto"   },
                  { icon:"📋", tipo:"ep",         nombre:"Control Aprobación EP",         desc:"EPs de subcontratos"   },
                ].map(r => (
                  <div key={r.tipo} className="border-2 border-slate-100 rounded-xl p-3 hover:border-orange-200 transition-colors">
                    <div className="text-2xl mb-1">{r.icon}</div>
                    <p className="text-xs font-black text-slate-800">{r.nombre}</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">{r.desc}</p>
                    <span className={`mt-2 inline-block text-[10px] font-bold px-2 py-0.5 rounded-full ${TIPO_INFO[r.tipo]?.color}`}>
                      {TIPO_INFO[r.tipo]?.label}
                    </span>
                  </div>
                ))}
              </div>

              <div
                onDragOver={e=>{e.preventDefault();setDragOver(true);}}
                onDragLeave={()=>setDragOver(false)}
                onDrop={onDrop}
                onClick={()=>fileRef.current?.click()}
                style={{borderWidth:"3px"}}
                className={`border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all
                  ${dragOver?"border-orange-400 bg-orange-50":"border-slate-200 hover:border-orange-300 hover:bg-orange-50/30"}`}
              >
                <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden"
                  onChange={e=>{if(e.target.files[0]) procesarArchivo(e.target.files[0]);}}/>
                <div className="text-5xl mb-3">📂</div>
                <p className="text-sm font-black text-slate-700">Arrastra el Excel de IConstruye aquí</p>
                <p className="text-xs text-slate-400 mt-1">Propone cuentas del plan MPFINGENIERIA automáticamente</p>
                <div className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-orange-500 text-white rounded-xl text-xs font-bold">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"/></svg>
                  Seleccionar archivo
                </div>
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                <p className="text-xs font-black text-amber-800 mb-1">💡 IConstruye → Reportes → Exportar Excel</p>
                <ul className="text-xs text-amber-700 space-y-0.5">
                  <li>• <strong>Facturas:</strong> Recepción y Facturación de OC</li>
                  <li>• <strong>OC:</strong> Órdenes de compra</li>
                  <li>• <strong>EP:</strong> Control de Aprobación EP</li>
                </ul>
              </div>
            </div>
          )}

          {/* ── PREVIEW / EDITOR ── */}
          {step === "preview" && (
            <div className="space-y-3">
              {/* Barra de resumen */}
              <div className="flex flex-wrap items-center gap-3">
                <span className={`px-3 py-1.5 rounded-lg text-xs font-black ${info.color}`}>{info.label}</span>
                <span className="text-xs text-slate-400 truncate max-w-36">{fileName}</span>
                <div className="ml-auto flex gap-2">
                  <span className="text-xs bg-slate-100 text-slate-600 px-3 py-1.5 rounded-lg font-bold">{propuestas.length} asientos</span>
                  <span className="text-xs bg-orange-100 text-orange-700 px-3 py-1.5 rounded-lg font-bold">{sel.size} sel. · {fmt(totalSel)}</span>
                </div>
              </div>

              {/* Instrucción */}
              <div className="flex items-start gap-2 px-3 py-2 bg-blue-50 border border-blue-100 rounded-xl">
                <span className="text-sm">💡</span>
                <p className="text-xs text-blue-700">El sistema propone la cuenta de costo automáticamente. Haz clic en ▼ para revisar y cambiar cualquier cuenta antes de importar.</p>
              </div>

              {/* Selector de todos */}
              <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 rounded-xl">
                <input type="checkbox" className="w-3.5 h-3.5 accent-orange-500"
                  checked={sel.size===propuestas.length} onChange={toggleTodos}/>
                <span className="text-xs font-black text-slate-600 uppercase tracking-wider">Seleccionar todos</span>
                <div className="ml-auto flex gap-2 text-[10px] font-bold text-slate-400">
                  <span>CUENTA PROPUESTA</span>
                  <span className="w-20 text-right">DEBE</span>
                  <span className="w-20 text-right">HABER</span>
                  <span className="w-6"/>
                </div>
              </div>

              {propuestas.length === 0 ? (
                <div className="py-12 text-center">
                  <div className="text-4xl mb-2">🤔</div>
                  <p className="text-sm font-bold text-slate-600">No se detectaron asientos</p>
                  <button onClick={()=>setStep("upload")} className="mt-4 px-4 py-2 bg-orange-500 text-white rounded-xl text-xs font-bold">← Volver</button>
                </div>
              ) : (
                <div className="max-h-96 overflow-y-auto space-y-1.5 pr-1">
                  {propuestas.map(p => (
                    <AsientoEditor
                      key={p.id}
                      propuesta={p}
                      sel={sel.has(p.id)}
                      onToggle={()=>toggleSel(p.id)}
                      onCambiarCuenta={cambiarCuenta}
                      expandido={expandido}
                      onToggleExpand={()=>setExpandido(expandido===p.id?null:p.id)}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── IMPORTING ── */}
          {step === "importing" && (
            <div className="py-16 text-center">
              <div className="w-16 h-16 rounded-2xl bg-orange-100 flex items-center justify-center mx-auto mb-4 animate-pulse text-3xl">🏗️</div>
              <p className="text-sm font-black text-slate-700">Registrando en Libro Diario...</p>
              <p className="text-xs text-slate-400 mt-1">{importados} de {sel.size}</p>
              <div className="mt-4 w-48 h-2 bg-slate-100 rounded-full mx-auto overflow-hidden">
                <div className="h-full bg-orange-500 rounded-full transition-all" style={{width:`${sel.size?(importados/sel.size)*100:0}%`}}/>
              </div>
            </div>
          )}

          {/* ── DONE ── */}
          {step === "done" && (
            <div className="py-12 text-center space-y-4">
              <div className="w-16 h-16 rounded-2xl bg-emerald-100 flex items-center justify-center mx-auto text-3xl">✅</div>
              <div>
                <p className="text-lg font-black text-slate-800">{importados} asiento{importados!==1?"s":""} importado{importados!==1?"s":""}</p>
                {duplicados > 0 && (
                  <p className="text-xs font-bold text-amber-600 mt-1">
                    ⚠️ {duplicados} omitido{duplicados!==1?"s":""} por duplicado (ya existían en el período)
                  </p>
                )}
                <p className="text-xs text-slate-400 mt-1">Visibles en Libro Diario → filtro IConstruye</p>
              </div>
              {errores.length>0 && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-left max-h-28 overflow-y-auto">
                  <p className="text-xs font-black text-red-700 mb-1">{errores.length} error(es):</p>
                  {errores.map((e,i)=><p key={i} className="text-[10px] text-red-600">{e}</p>)}
                </div>
              )}
              <div className="flex gap-3 justify-center">
                <button onClick={()=>{setStep("upload");setPropuestas([]);setImport(0);setDuplicados(0);setErrores([]);setSel(new Set());}}
                  className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-sm">
                  Importar otro
                </button>
                <button onClick={onClose}
                  className="px-5 py-2.5 bg-gradient-to-r from-orange-600 to-amber-500 text-white font-bold rounded-xl text-sm shadow">
                  Ver Libro Diario
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {step === "preview" && propuestas.length > 0 && (
          <div className="px-5 pb-5 flex gap-3 border-t border-slate-100 pt-4">
            <button onClick={()=>setStep("upload")} className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-sm">← Volver</button>
            <div className="flex-1"/>
            <button onClick={importar} disabled={sel.size===0}
              className="px-6 py-2.5 bg-gradient-to-r from-orange-600 to-amber-500 disabled:opacity-40 text-white font-bold rounded-xl text-sm flex items-center gap-2 shadow">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10"/></svg>
              Importar {sel.size} asiento{sel.size!==1?"s":""} → Libro Diario
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
