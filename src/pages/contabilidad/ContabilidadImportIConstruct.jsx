import React, { useState, useRef, useCallback, useMemo } from "react";
import * as XLSX from "xlsx";
import { fmt, normalizaRut, leerTextoDetectando, repararMojibake } from "./ContabilidadContext";
import {
  ModalCuaderno, Boton, Campo, Cifra, Titulo, Nota, Resaltado, VistoBueno, LineaGuia, Pestanas,
  casoTitulo, IconoBajar, IconoLapiz, IconoSubir, IconoAnterior, IconoSiguiente,
} from "../finanzas/cuaderno";

// Función para corregir dobles codificaciones UTF-8 en strings Latin1
// Reparación de doble codificación.
//
// La versión anterior era `decodeURIComponent(escape(str))`. Ese truco solo
// cubre bytes que existen en Latin-1 puro: funcionaba con "ÃRIDOS" → "ÁRIDOS"
// (Á = C3 81), pero con "Ó" = C3 93 el byte 0x93 se convierte en comilla
// tipográfica, escape() la codifica como %u201C, decodeURIComponent lanza y el
// catch devolvía el texto intacto. Por eso "Ã“PTICA" nunca se arreglaba.
// repararMojibake revierte también el rango 0x80–0x9F de Windows-1252.
const fixEncoding = (str) => repararMojibake(str || "");

// ─── Clasificación automática de proveedores ──────────────────────────────────
// Reglas basadas en razón social y RUT para asignar la cuenta de gasto correcta
const REGLAS_CLASIFICACION = [
  // Aerolineas / Pasajes
  { patron: /latam|sky|jetsmart|aerol|pasaje/i,                            tipo: "gasto_adm", label: "Pasajes y Traslados"          },
  // Fletes / Transporte
  { patron: /flete|bus |transporte/i,                                       tipo: "costo",    label: "Fletes y Transportes"          },
  // Bancos / Financiero
  { patron: /banco|bice|santander|scotiabank|bci|estado|financiero/i,       tipo: "gasto_fin", label: "Gastos Financieros"           },
  // Telecomunicaciones
  { patron: /entel|movistar|claro|wom|gtd|vtr|telecom/i,                    tipo: "gasto_adm", label: "Telecomunicaciones"           },
  // Arriendos oficina
  { patron: /arriendo|leasing|renta|inmobil/i,                              tipo: "gasto_adm", label: "Arriendos Oficina"            },
  // Subcontratos
  { patron: /construc|topograf|civil|montaje|genessis|seha|toro negro|segmas|trektrading|godiesel|safe truck|xcmg|bobinados|loncomilla/i, tipo: "costo", label: "Subcontratos" },
  // Seguridad industrial obra
  { patron: /seguridad.*ind|industrial.*seg|lean tech|veliz/i,              tipo: "costo",    label: "Seguridad Industrial"          },
  // Seguridad oficina
  { patron: /seguridad|vigilancia|guard/i,                                   tipo: "gasto_adm", label: "Seguridad Oficina"           },
  // Materiales y suministros
  { patron: /ferreteria|repuesto|cadagan|dicar|oiflex|ramflex|perno|implement|oxicom|prodalam|cadena|bhc|suministro/i, tipo: "costo", label: "Materiales y Suministros" },
  // Mantención equipos
  { patron: /lubri|serviteca|revision|tecnica|neumatico|mantenci/i,         tipo: "costo",    label: "Mantención y Reparación"       },
  // Honorarios / Servicios profesionales
  { patron: /abogad|notari|asesor|consultor|r&t|masaval/i,                  tipo: "gasto_adm", label: "Honorarios Profesionales"     },
  // Software / TI
  { patron: /software|tecnolog|global tec|linq|desarrollo|sistema/i,        tipo: "gasto_adm", label: "Suscripciones y Software"     },
  // Retail / Comercio general
  { patron: /cencosud|sodimac|retail|walmart|lider|jumbo|unimarc|supermercado/i, tipo: "gasto_adm", label: "Gastos Varios"          },
  // Peajes / Autopistas
  { patron: /autopista|costanera|ruta|vespucio|peaje|concesionaria/i,       tipo: "gasto_adm", label: "Peajes y Movilización"        },
  // Seguros
  { patron: /seguro|póliza|poliza|riesgo/i,                                  tipo: "gasto_adm", label: "Seguros"                     },
];

function clasificarProveedor(razonSocial) {
  const rs = String(razonSocial || "");
  for (const regla of REGLAS_CLASIFICACION) {
    if (regla.patron.test(rs)) return { tipo: regla.tipo, label: regla.label };
  }
  return { tipo: "gasto_adm", label: "Gastos Generales" };
}

// Aplica una regla APRENDIDA (proveedor RUT → cuenta/categoría elegida antes por el usuario)
// a un asiento de compra ya generado. Tiene prioridad sobre la clasificación por keywords.
/**
 * Aplica una regla APRENDIDA (proveedor RUT → cuenta elegida antes por el usuario).
 *
 * Cambios respecto de la versión anterior:
 *  · Ya no se filtra por `origen === "iconstruye"`. Las compras del RCV del SII
 *    pasan por el mismo constructor, pero el filtro por nombre de origen era
 *    frágil: ahora se decide por si el asiento tiene proveedor y líneas de gasto.
 *  · Solo se reasigna la línea de gasto PRINCIPAL (la de mayor debe que no sea
 *    IVA). Antes se reescribían todas, y un asiento que agrupaba documentos con
 *    cuentas de costo distintas se colapsaba en una sola.
 *  · La etiqueta se toma de la cuenta de destino, no del label guardado: así no
 *    vuelven a quedar desalineadas ("Arriendos Oficina" rotulada como
 *    "Gastos Generales").
 */
function aplicarReglaImport(asiento, reglasGasto) {
  if (!reglasGasto || !asiento._rut) return asiento;
  if (String(asiento.glosa || "").startsWith("NC")) return asiento; // las NC siguen la cuenta original
  const regla = reglasGasto[normalizaRut(asiento._rut)];
  if (!regla || !regla.cuentaId) return asiento;

  const esGasto = (l) => parseFloat(l.debe) > 0 && !/(iva|impuesto)/i.test(l.cuentaNombre || "");
  const candidatas = (asiento.lineas || []).filter(esGasto);
  if (!candidatas.length) return asiento;

  // La línea principal es la de mayor monto: es la que representa el gasto.
  const principal = candidatas.reduce((a, b) => (parseFloat(b.debe) > parseFloat(a.debe) ? b : a));
  const etiqueta = regla.categoriaLabel || regla.cuentaNombre || "Clasificado";

  const lineas = (asiento.lineas || []).map(l => l === principal
    ? { ...l, cuentaId: regla.cuentaId, cuentaNombre: regla.cuentaNombre,
        descripcion: `${regla.categoriaIcon || "🏷"} ${etiqueta} — regla aprendida` }
    : l);

  return {
    ...asiento, lineas,
    _clasificacion: etiqueta,
    _aprendido: true,
    _multiLinea: candidatas.length > 1,
    totalDebe: lineas.reduce((s, l) => s + (l.debe || 0), 0),
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function parseFecha(str) {
  if (!str) return null;
  const m = String(str).match(/(\d{2})-(\d{2})-(\d{4})/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return null;
}
function parseNum(v) {
  const n = parseFloat(String(v || "0").replace(/[^0-9.-]/g, ""));
  return isNaN(n) ? 0 : n;
}

// ─── Normalizar fila RCV SII Ventas → formato interno ───────────────────────
function normalizarRCV_Venta(fila) {
  const parseFechaRCV = (str) => {
    if (!str) return null;
    const s = String(str);
    const idx = s.search(/\d{2}\/\d{2}\/\d{4}/);
    if (idx === -1) return null;
    const part = s.slice(idx, idx + 10);
    const [d, m, y] = part.split("/");
    return y + "-" + m + "-" + d;
  };
  const n = (v) => { const x = parseFloat(String(v || "0").replace(/[^0-9.-]/g, "")); return isNaN(x) ? 0 : x; };
  const tipoDoc = parseInt(String(fila["Tipo Doc"] || "33")) || 33;

  const neto  = n(fila["Monto Neto"]);
  const iva   = n(fila["Monto IVA"]);
  const exento = n(fila["Monto Exento"]);
  const total = n(fila["Monto total"]) || n(fila["Monto Total"]);

  return {
    "_rut":           String(fila["Rut cliente"] || "").trim(),
    "_razonSocial":   fixEncoding((String(fila["Razon Social"] || "").trim())),
    "_folio":         String(fila["Folio"] || ""),
    "_fecha":         parseFechaRCV(fila["Fecha Docto"]) || parseFechaRCV(fila["Fecha Recepcion"]),
    "_tipoDoc":       tipoDoc,
    "_neto":          neto,
    "_iva":           iva,
    "_exento":        exento,
    "_impEspec":      0,
    "_impTabaco":     0,
    "_total":         total || (neto + iva + exento),
    "_esExento":      tipoDoc === 34,
    "_esNotaCredito": tipoDoc === 61,  // NC emitida (reduce débito fiscal)
    "_esCombustibleSII": false,
    "_activoFijo":    false,
    "_esVenta":       true,
  };
}

// ─── Detección de formato de archivo ────────────────────────────────────────────
// Detecta si el archivo es RCV del SII (CSV con columnas del SII) o iConstruct (Excel)
function detectarFormato(filas) {
  if (!filas || filas.length === 0) return "desconocido";
  const cols = Object.keys(filas[0]);
  // RCV Ventas SII: tiene "Rut cliente" y "Monto IVA"
  if (cols.includes("Rut cliente") && cols.includes("Monto IVA")) return "rcv_venta";
  // RCV Compras SII: tiene "RUT Proveedor" y "Monto IVA Recuperable"
  if (cols.includes("RUT Proveedor") && cols.includes("Monto IVA Recuperable")) return "rcv_sii";
  // iConstruct tiene estas
  if (cols.includes("Rut Emisor") && cols.includes("Estado Conciliación")) return "iconstruye";
  return "desconocido";
}

// ─── Normalizar fila RCV SII → formato interno común ────────────────────────────
function normalizarRCV(fila) {
  // Parsear fecha "dd/mm/yyyy" o "dd/mm/yyyy hh:mm:ss"
  const parseFechaRCV = (str) => {
    if (!str) return null;
    const s = String(str);
    // Buscar patrón dd/mm/yyyy
    const idx = s.search(/\d{2}\/\d{2}\/\d{4}/);
    if (idx === -1) return null;
    const part = s.slice(idx, idx + 10);
    const [d, m, y] = part.split("/");
    return y + "-" + m + "-" + d;
  };
  const n = (v) => { const x = parseFloat(String(v || "0").replace(/[^0-9.-]/g, "")); return isNaN(x) ? 0 : x; };

  // Tipo Doc: en el RCV puede venir como número (33, 34) o string ("Del Giro")
  // Para el tipo real de DTE usamos Tipo Doc de la columna correcta
  const tipoDocRaw = String(fila["Tipo Doc"] || "");
  const tipoDoc = /^\d+$/.test(tipoDocRaw.trim()) ? parseInt(tipoDocRaw) : 33;

  const neto   = n(fila["Monto Neto"]);
  const ivaRec = n(fila["Monto IVA Recuperable"]);
  const exento = n(fila["Monto Exento"]);
  const total  = n(fila["Monto Total"]);

  // ── Otros impuestos de la factura ("Codigo Otro Impuesto") ────────────────
  // Antes cualquier "Valor Otro Impuesto" > 0 se trataba como impuesto
  // específico al diésel (recuperable) y el proveedor quedaba clasificado como
  // combustible. Eso es incorrecto para proveedores que no venden combustible.
  // Ahora se decide por el código:
  //   28 diésel           → imp. específico recuperable (Ley 18.502)
  //   15 IVA retenido     → es IVA: va con el crédito fiscal
  //   cualquier otro      → no recuperable: mayor gasto (gasolina, bebidas,
  //                         licores, códigos desconocidos)
  // El IVA no recuperable y el impuesto sin derecho a crédito también son
  // mayor gasto; antes se ignoraban y el asiento quedaba descuadrado.
  const valorOtroImp = n(fila["Valor Otro Impuesto"]);
  const codOtroImp   = parseInt(String(fila["Codigo Otro Impuesto"] || "0").split(".")[0]) || 0;
  const impEspec     = codOtroImp === 28 && neto > 0 ? valorOtroImp : 0;
  const ivaRetenido  = codOtroImp === 15 ? valorOtroImp : 0;
  const otroNoRec    = valorOtroImp - impEspec - ivaRetenido;
  const ivaNoRec     = n(fila["Monto Iva No Recuperable"] || fila["Monto IVA No Recuperable"]);
  // Si la fila trae "otro impuesto", la columna sin derecho a crédito repite
  // ese mismo monto (ej. gasolina código 35): no se suma dos veces.
  const sinDerecho   = valorOtroImp ? 0 : n(fila["Impto. Sin Derecho a Credito"]);
  const impNoRecuperable = otroNoRec + ivaNoRec + sinDerecho;
  const esComb       = impEspec > 0;

  return {
    "_rut":              String(fila["RUT Proveedor"] || "").trim(),
    "_razonSocial":      fixEncoding((String(fila["Razon Social"]  || "").trim())),
    "_folio":            String(fila["Folio"]         || ""),
    "_fecha":            parseFechaRCV(fila["Fecha Docto"]) || parseFechaRCV(fila["Fecha Recepcion"]),
    "_tipoDoc":          tipoDoc,
    "_neto":             neto,
    "_iva":              ivaRec + ivaRetenido,
    "_exento":           exento,
    "_impEspec":         impEspec,
    "_impTabaco":        impNoRecuperable, // nombre histórico: todo impuesto no recuperable
    "_total":            total || (neto + ivaRec + ivaRetenido + impEspec + impNoRecuperable + exento),
    "_esExento":         tipoDoc === 34,
    "_esNotaCredito":    tipoDoc === 61,
    "_esCombustibleSII": esComb,
    "_activoFijo":       n(fila["Monto Neto Activo Fijo"]) > 0,
  };
}

// ─── Normalizar fila iConstruct → formato interno común ─────────────────────────
function normalizarIConstruct(fila) {
  const n  = (v) => parseFloat(String(v || "0").replace(/[^0-9.-]/g, "")) || 0;
  const tipoSII = n(fila["Tipo SII"]);
  const neto    = n(fila["Monto Neto"]);
  const iva     = n(fila["Monto IVA"]);
  const exento  = n(fila["Monto Exento"]);
  const total   = n(fila["Monto Total"]);

  // Detección matemática del imp. específico (iConstruct no lo desglosaba)
  const impEspecCalc = tipoSII === 33 && total > 0 ? Math.max(0, Math.round(total - neto - iva)) : 0;
  const esCombNombre = /copec|shell|enex|petrobras|terpel|gasco|gulf|petropower|duragas|abastible|estacion de servic|estación de servic|servicentro|bencinera/i.test(fila["Razón Social Emisor"] || "");
  const RUTS_COMB = new Set(["99520000-7","96568740-8","76069000-7","77316643-9","77017678-6","5788415-0","76196047-4","77583438-2","76683608-9"]);
  const esCombRUT = RUTS_COMB.has(String(fila["Rut Emisor"] || "").trim());
  const esCombMat = total > 0 && (impEspecCalc / total) > 0.01;

  const parseFecha = (str) => {
    const m = String(str || "").match(/(\d{2})-(\d{2})-(\d{4})/);
    return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
  };

  return {
    "_rut":         String(fila["Rut Emisor"] || "").trim(),
    "_razonSocial": fixEncoding((String(fila["Razón Social Emisor"] || "").trim())),
    "_folio":       String(fila["Folio"] || ""),
    "_fecha":       parseFecha(fila["Fecha Emisión"]),
    "_tipoDoc":     tipoSII,
    "_neto":        neto,
    "_iva":         iva,
    "_exento":      exento,
    "_impEspec":    (esCombNombre || esCombRUT || esCombMat) ? impEspecCalc : 0,
    "_total":       total,
    "_esExento":    tipoSII === 34,
    "_esNotaCredito": tipoSII === 61,
    "_impTabaco":   0,
    "_esCombustibleSII": esCombNombre || esCombRUT || esCombMat,
    "_activoFijo":  false,
  };
}

// ─── Motor de asientos ────────────────────────────────────────────────────────
// Detección combustible PRIMARIA: matemática de la factura.
// En Chile, facturas de combustible tienen Impuesto Específico Ley 18.502:
//   Total = Neto + IVA(19%) + Imp.Específico
// => Si (Total - Neto - IVA) / Total > 1%, es combustible con seguridad.
// SECUNDARIA: nombre del proveedor o RUT conocido de distribuidoras.
const ES_COMBUSTIBLE_NOMBRE = /copec|shell|enex|petrobras|terpel|gasco|gulf|petropower|duragas|abastible|estacion de servic|estación de servic|servicentro|lubricentro|prisma estaciones|bencinera/i;

// RUTs conocidos de distribuidoras de combustible y estaciones de servicio
const RUTS_COMBUSTIBLE = new Set([
  "99520000-7", // COPEC S.A.
  "96568740-8", // GASCO GLP S.A.
  "76069000-7", // ESTACION DE SERVICIOS TRES ESQUINAS
  "77316643-9", // PRISMA ESTACIONES DE SERVICIOS
  "77017678-6", // ELENA JARA NAVARRETE ESTACION DE SERVIC
  "76162708-2", // COMERCIAL SUAREZ SPA (estación)
  "5788415-0",  // PATRICIO SANTIAGO CAREY BRIONES (expendedor)
  "76196047-4", // COMERCIAL Y SERVICIOS JOVI LIMITADA (expendedor)
  "77583438-2", // COMERCIAL Y SERVICIOS VIGU LIMITADA (expendedor)
  "76683608-9", // COMERCIAL Y SERVICIOS SANTO DOMINGO LIMITADA (expendedor)
]);

// Detecta si las facturas de un proveedor tienen impuesto específico
// (criterio matemático: diferencia > 1% del total)
function detectarCombustiblePorFacturas(facturas) {
  let totalAcum = 0, impEspecAcum = 0;
  facturas.forEach(f => {
    const neto  = parseFloat(String(f["Monto Neto"]  ||"0").replace(/[^0-9.-]/g,""))||0;
    const iva   = parseFloat(String(f["Monto IVA"]   ||"0").replace(/[^0-9.-]/g,""))||0;
    const total = parseFloat(String(f["Monto Total"] ||"0").replace(/[^0-9.-]/g,""))||0;
    const tipoSII = parseFloat(String(f["Tipo SII"]||"0"))||0;
    if (tipoSII === 33 && total > 0) {
      const impEspec = total - neto - iva;
      if (impEspec > 0) { impEspecAcum += impEspec; totalAcum += total; }
    }
  });
  // Si el imp. específico supera el 1% del total acumulado → combustible
  return totalAcum > 0 && (impEspecAcum / totalAcum) > 0.01;
}

function esCombustible(rut, razonSocial, facturas) {
  return RUTS_COMBUSTIBLE.has(rut)
    || ES_COMBUSTIBLE_NOMBRE.test(razonSocial)
    || detectarCombustiblePorFacturas(facturas);
}

// ─── Hash de importación ─────────────────────────────────────────────────────
// Clave única por asiento: periodo + rut + folios ordenados
// Permite detectar duplicados entre importaciones del mismo archivo.
function calcularImportHash(periodo, rut, folios) {
  const foliosStr = [...folios].sort().join(",");
  return `${periodo}|${rut}|${foliosStr}`;
}

// ─── Detectar período desde las fechas del archivo ───────────────────────────
// Usa el mes/año que aparece en la mayoría de las facturas del archivo.
// El selector del modal es solo un fallback si no hay fechas.
function detectarPeriodoDesdeArchivo(filasNorm) {
  const conteo = {};
  filasNorm.forEach(f => {
    const fecha = f["_fecha"];
    if (!fecha) return;
    const match = String(fecha).match(/^(\d{4})-(\d{2})/);
    if (!match) return;
    const key = match[1] + "-" + match[2];
    conteo[key] = (conteo[key] || 0) + 1;
  });
  // Devolver el período con más documentos
  const entries = Object.entries(conteo);
  if (!entries.length) return null;
  entries.sort((a, b) => b[1] - a[1]);
  return entries[0][0];
}

// ─── Motor de asientos — Ventas ──────────────────────────────────────────────
// Asiento factura de venta:
//   DEBE:  Cuentas por Cobrar  = Total
//   HABER: Ingresos (neto)     = Monto Neto
//   HABER: IVA Débito Fiscal   = Monto IVA
//
// Asiento NC emitida (tipo 61):
//   DEBE:  Ingresos            = Monto Neto  (anula la venta)
//   DEBE:  IVA Débito Fiscal   = Monto IVA   (anula el débito)
//   HABER: Cuentas por Cobrar  = Total
function generarAsientosVenta(filasNorm, cuentas, periodo) {
  const findC = (pred) => cuentas.find(c => c.activa !== false && pred(c));

  const cCxC      = findC(c => c.tipo === "activo_corriente" && /cuentas por cobrar/i.test(c.nombre))
                 || findC(c => c.tipo === "activo_corriente" && /cobrar/i.test(c.nombre))
                 || findC(c => c.tipo === "activo_corriente" && /deudor/i.test(c.nombre));
  const cIVADeb   = findC(c => c.tipo === "iva_debito");
  const cIngreso  = findC(c => c.tipo === "ingreso" && /contrato/i.test(c.nombre))
                 || findC(c => c.tipo === "ingreso");

  const errores = [];
  if (!cCxC)    errores.push("Falta cuenta 'Cuentas por Cobrar' en el Plan de Cuentas.");
  if (!cIVADeb) errores.push("Falta cuenta 'IVA Débito Fiscal' en el Plan de Cuentas.");
  if (!cIngreso) errores.push("Falta cuenta de Ingresos en el Plan de Cuentas.");
  if (errores.length) return { asientos: [], errores };

  // Separar facturas de NC emitidas
  const facturas = filasNorm.filter(f => !f["_esNotaCredito"]);
  const ncs      = filasNorm.filter(f =>  f["_esNotaCredito"]);

  // Agrupar facturas por cliente
  const mapa = {};
  facturas.forEach(f => {
    const rut = f["_rut"] || "SIN_RUT";
    if (!mapa[rut]) mapa[rut] = { razonSocial: f["_razonSocial"] || rut, rut, docs: [] };
    mapa[rut].docs.push(f);
  });

  const asientosVenta = Object.values(mapa).map(cliente => {
    let totalNeto=0, totalIVA=0, totalExento=0, totalTotal=0;
    const folios=[]; let fechaRef=null;

    cliente.docs.forEach(f => {
      totalNeto   += f["_neto"]   || 0;
      totalIVA    += f["_iva"]    || 0;
      totalExento += f["_exento"] || 0;
      totalTotal  += f["_total"]  || 0;
      if (f["_folio"]) folios.push(f["_folio"]);
      if (!fechaRef && f["_fecha"]) fechaRef = f["_fecha"];
    });

    const foliosTxt = folios.length <= 3 ? folios.join(", ") : `${folios.slice(0,3).join(", ")} +${folios.length-3}`;
    const nDocs = cliente.docs.length;

    const lineas = [];
    // DEBE: CxC
    lineas.push({
      cuentaId: cCxC.id, cuentaNombre: cCxC.nombre,
      debe: totalTotal, haber: 0,
      descripcion: `${cliente.razonSocial} · RUT ${cliente.rut}`,
    });
    // HABER: Ingresos (neto + exento)
    if (totalNeto > 0) lineas.push({
      cuentaId: cIngreso.id, cuentaNombre: cIngreso.nombre,
      debe: 0, haber: totalNeto,
      descripcion: `Ingresos netos — F°${foliosTxt}`,
    });
    if (totalExento > 0) lineas.push({
      cuentaId: cIngreso.id, cuentaNombre: cIngreso.nombre,
      debe: 0, haber: totalExento,
      descripcion: `Ingresos exentos — F°${foliosTxt}`,
    });
    // HABER: IVA Débito
    if (totalIVA > 0) lineas.push({
      cuentaId: cIVADeb.id, cuentaNombre: cIVADeb.nombre,
      debe: 0, haber: totalIVA,
      descripcion: "IVA Débito Fiscal 19%",
    });

    // Ajuste centavos
    const sd = lineas.reduce((s,l)=>s+(l.debe||0),0);
    const sh = lineas.reduce((s,l)=>s+(l.haber||0),0);
    // Ajuste de redondeo: en pesos chilenos una diferencia real es de $1-2 por
    // el cálculo del IVA. Sobre eso ya no es redondeo, es un dato mal leído, así
    // que no se tapa. Antes se empujaban hasta $9 a la primera línea sin dejar rastro.
    if (Math.abs(sd-sh) > 0 && Math.abs(sd-sh) <= 2) lineas[0].debe += sh - sd;

    return {
      fecha:         fechaRef || `${periodo}-01`,
      glosa:         `${cliente.razonSocial} · ${nDocs} doc${nDocs>1?"s":""} · F°${foliosTxt}`,
      tipo:          "automatico",
      lineas,
      periodo,
      totalDebe:     lineas.reduce((s,l)=>s+(l.debe||0),0),
      origen:        "rcv_venta",
      importHash:    calcularImportHash(periodo, cliente.rut, folios),
      _rut:          cliente.rut,
      _razonSocial:  repararMojibake(cliente.razonSocial),
      _clasificacion:"Venta",
      _nDocs:        nDocs,
      _totalTotal:   totalTotal,
      _totalNeto:    totalNeto,
      _totalIVA:     totalIVA,
      _totalExento:  totalExento,
      _totalImpEspec:0,
      _facturas:     cliente.docs,
      _esVenta:      true,
    };
  });

  // NC emitidas — asiento inverso a la venta
  const mapaNC = {};
  ncs.forEach(f => {
    const rut = f["_rut"] || "SIN_RUT";
    if (!mapaNC[rut]) mapaNC[rut] = { razonSocial: f["_razonSocial"] || rut, rut, ncs: [] };
    mapaNC[rut].ncs.push(f);
  });

  const asientosNC = Object.values(mapaNC).map(cliente => {
    let totalNeto=0, totalIVA=0, totalTotal=0;
    const folios=[]; let fechaRef=null;
    cliente.ncs.forEach(f => {
      totalNeto  += f["_neto"]  || 0;
      totalIVA   += f["_iva"]   || 0;
      totalTotal += f["_total"] || 0;
      if (f["_folio"]) folios.push(`NCE°${f["_folio"]}`);
      if (!fechaRef && f["_fecha"]) fechaRef = f["_fecha"];
    });

    const foliosTxt = folios.join(", ");
    const lineas = [];
    // DEBE: Ingresos (anula venta)
    if (totalNeto > 0) lineas.push({
      cuentaId: cIngreso.id, cuentaNombre: cIngreso.nombre,
      debe: totalNeto, haber: 0,
      descripcion: `Anulación venta — NC emitida`,
    });
    // DEBE: IVA Débito (anula débito)
    if (totalIVA > 0) lineas.push({
      cuentaId: cIVADeb.id, cuentaNombre: cIVADeb.nombre,
      debe: totalIVA, haber: 0,
      descripcion: "Reverso IVA Débito Fiscal",
    });
    // HABER: CxC
    lineas.push({
      cuentaId: cCxC.id, cuentaNombre: cCxC.nombre,
      debe: 0, haber: totalTotal,
      descripcion: `${cliente.razonSocial} · NC emitida`,
    });

    const sd = lineas.reduce((s,l)=>s+(l.debe||0),0);
    const sh = lineas.reduce((s,l)=>s+(l.haber||0),0);
    if (Math.abs(sd-sh) > 0 && Math.abs(sd-sh) < 10) lineas[lineas.length-1].haber += sd - sh;

    return {
      fecha:         fechaRef || `${periodo}-01`,
      glosa:         `NCE — ${cliente.razonSocial} · ${foliosTxt}`,
      tipo:          "automatico",
      lineas,
      periodo,
      totalDebe:     lineas.reduce((s,l)=>s+(l.debe||0),0),
      origen:        "rcv_venta",
      importHash:    calcularImportHash(periodo, `NCE-${cliente.rut}`, folios),
      _rut:          cliente.rut,
      _razonSocial:  repararMojibake(cliente.razonSocial),
      _clasificacion:"NC Emitida",
      _nDocs:        cliente.ncs.length,
      _totalTotal:   totalTotal,
      _totalNeto:    totalNeto,
      _totalIVA:     totalIVA,
      _totalExento:  0,
      _totalImpEspec:0,
      _facturas:     cliente.ncs,
      _esNC:         true,
      _esVenta:      true,
    };
  });

  return { asientos: [...asientosVenta, ...asientosNC], errores: [] };
}

// Punto de entrada principal — detecta formato, normaliza y deriva el período
function generarAsientos(filas, cuentas, periodoFallback) {
  const formato = detectarFormato(filas);
  const normalizador = formato === "rcv_sii"    ? normalizarRCV
                     : formato === "rcv_venta"  ? normalizarRCV_Venta
                     : normalizarIConstruct;
  const filasNorm = filas.map(f => normalizador(f));
  const periodoDetectado = detectarPeriodoDesdeArchivo(filasNorm) || periodoFallback;
  const result = formato === "rcv_venta"
    ? generarAsientosVenta(filasNorm, cuentas, periodoDetectado)
    : generarAsientosDesdeNormalizadas(filasNorm, formato, cuentas, periodoDetectado);
  result.periodoDetectado = periodoDetectado;
  result.esVenta = formato === "rcv_venta";
  return result;
}

function generarAsientosDesdeNormalizadas(filasNorm, formato, cuentas, periodo) {
  const findCuenta = (pred) => cuentas.find(c => c.activa !== false && pred(c));

  const cIVA         = findCuenta(c => c.tipo === "iva_credito" && !/específico|especifico/i.test(c.nombre));
  const cImpEspec    = findCuenta(c => c.tipo === "iva_credito" && /específico|especifico/i.test(c.nombre));
  const cPorPagar    = findCuenta(c => c.tipo === "pasivo_corriente" && /cuentas por pagar/i.test(c.nombre))
                    || findCuenta(c => c.tipo === "pasivo_corriente" && /pagar/i.test(c.nombre))
                    || findCuenta(c => c.tipo === "pasivo_corriente");
  const cCombustible = findCuenta(c => c.tipo === "costo" && /combustible/i.test(c.nombre))
                    || findCuenta(c => c.tipo === "costo" && /lubricante/i.test(c.nombre));

  // Resuelve la cuenta contable a partir de la CLASIFICACIÓN completa, no solo
  // del tipo. Antes era `findCuenta(c => c.tipo === tipo)`, un .find() que
  // devolvía siempre la PRIMERA cuenta de ese tipo del plan: todo lo que caía en
  // gasto_adm —peajes, seguros, software, notariales— terminaba en la misma
  // cuenta. Las etiquetas que produce clasificarProveedor() se calculaban y se
  // descartaban. CATEGORIAS ya traía el regex `cuentaMatch` para esto.
  const getCuentaGasto = (tipo) =>
    findCuenta(c => c.tipo === tipo && /generales|varios/i.test(c.nombre))
    || findCuenta(c => c.tipo === tipo)
    || findCuenta(c => c.tipo === "gasto_adm");

  const resolverCuenta = (clasif) => {
    const cat = CATEGORIAS.find(c => c.label === clasif.label);
    if (cat?.cuentaMatch) {
      const exacta = findCuenta(c => c.tipo === clasif.tipo && cat.cuentaMatch.test(c.nombre))
                  || findCuenta(c => cat.cuentaMatch.test(c.nombre));
      if (exacta) return { cuenta: exacta, exacta: true };
    }
    return { cuenta: getCuentaGasto(clasif.tipo), exacta: false };
  };

  const errores = [];
  if (!cIVA)      errores.push("Falta cuenta de IVA Crédito Fiscal en el Plan de Cuentas.");
  if (!cPorPagar) errores.push("Falta cuenta de Cuentas por Pagar en el Plan de Cuentas.");
  if (!cImpEspec) errores.push("Falta cuenta 'Imp. Específico Combustible (Recuperable)' — agrégala en el Plan de Cuentas.");
  if (errores.length) return { asientos: [], errores };

  // Agrupar por proveedor usando campos normalizados (_rut, _razonSocial, etc.)
  // Excluir NC (tipo 61) — se procesan en bloque separado más abajo
  const mapa = {};
  filasNorm.filter(f => !f["_esNotaCredito"]).forEach(f => {
    const rut = f["_rut"] || "SIN_RUT";
    if (!mapa[rut]) {
      mapa[rut] = { razonSocial: f["_razonSocial"] || rut, rut, facturas: [] };
    }
    mapa[rut].facturas.push(f);
  });

  // Segunda pasada: clasificar — el RCV ya detectó combustible vía _esCombustibleSII
  Object.values(mapa).forEach(prov => {
    const clasif   = clasificarProveedor(prov.razonSocial);
    // Para RCV SII: confiar en _esCombustibleSII de la primera factura del proveedor
    // Para iConstruct: usa la detección matemática ya aplicada en normalizarIConstruct
    const esComb   = prov.facturas.some(f => f["_esCombustibleSII"]);
    const cGasto   = esComb
      ? (cCombustible || getCuentaGasto("costo"))
      : resolverCuenta(clasif).cuenta;
    prov.clasificacion     = clasif;
    prov.esCombustible     = esComb;
    prov.cuentaGastoId     = cGasto?.id || "";
    prov.cuentaGastoNombre = cGasto?.nombre || "Sin cuenta";
  });

  const asientos = Object.values(mapa).map(prov => {
    let totalNeto = 0, totalIVA = 0, totalExento = 0, totalTotal = 0;
    let totalImpEspec = 0;   // ← impuesto específico Ley 18.502
    const folios = [];
    let fechaRef = null;

    prov.facturas.forEach(f => {
      // Usar campos normalizados (_*) — válidos para RCV SII e iConstruct
      const neto    = f["_neto"]    || 0;
      const iva     = f["_iva"]     || 0;
      const exento  = f["_exento"]  || 0;
      const total   = f["_total"]   || 0;
      const impEsp  = f["_impEspec"]|| 0;

      if (f["_esExento"]) {
        // Factura exenta (Tipo 34): todo va a exento
        totalExento += exento || total;
      } else {
        // Factura afecta (Tipo 33): puede tener neto+IVA Y también monto exento
        totalNeto   += neto;
        totalNeto   += f["_impTabaco"] || 0; // impuestos no recuperables (otros códigos, IVA no rec.) → mayor gasto
        totalIVA    += iva;
        totalExento += exento;   // ← Fix: exento de facturas mixtas (peajes, autopistas, etc.)
        if (prov.esCombustible && impEsp > 0) totalImpEspec += impEsp;
      }
      totalTotal += total;
      if (f["_folio"] && total > 0) folios.push(f["_folio"]); // solo folios con total real
      if (!fechaRef && f["_fecha"] && total > 0) fechaRef = f["_fecha"];
    });

    const lineas = [];

    // ── Combustible: 3 líneas de debe ──────────────────────────────────────
    if (prov.esCombustible) {
      // 1. Neto combustible → Combustible y Lubricantes
      if (totalNeto > 0) lineas.push({
        cuentaId:     prov.cuentaGastoId,
        cuentaNombre: prov.cuentaGastoNombre,
        debe: totalNeto, haber: 0,
        descripcion:  "Neto combustible (base imponible)",
      });
      // 2. Imp. específico Ley 18.502 → recuperable como CF adicional
      if (totalImpEspec > 0) lineas.push({
        cuentaId:     cImpEspec.id,
        cuentaNombre: cImpEspec.nombre,
        debe: totalImpEspec, haber: 0,
        descripcion:  "Imp. específico combustible — Ley 18.502 (recuperable F29 línea 24)",
      });
      // 3. IVA 19% sobre el neto
      if (totalIVA > 0) lineas.push({
        cuentaId:     cIVA.id,
        cuentaNombre: cIVA.nombre,
        debe: totalIVA, haber: 0,
        descripcion:  "IVA Crédito Fiscal 19%",
      });
    } else {
      // ── Resto de proveedores: lógica estándar ───────────────────────────
      if (totalNeto > 0) lineas.push({
        cuentaId:     prov.cuentaGastoId,
        cuentaNombre: prov.cuentaGastoNombre,
        debe: totalNeto, haber: 0,
        descripcion:  `Neto afecto — ${prov.clasificacion.label}`,
      });
      if (totalIVA > 0) lineas.push({
        cuentaId:     cIVA.id,
        cuentaNombre: cIVA.nombre,
        debe: totalIVA, haber: 0,
        descripcion:  "IVA Crédito Fiscal 19%",
      });
      if (totalExento > 0) lineas.push({
        cuentaId:     prov.cuentaGastoId,
        cuentaNombre: prov.cuentaGastoNombre,
        debe: totalExento, haber: 0,
        descripcion:  `Neto exento — ${prov.clasificacion.label}`,
      });
    }

    // Haber: Cuentas por Pagar (siempre al total)
    lineas.push({
      cuentaId:     cPorPagar.id,
      cuentaNombre: cPorPagar.nombre,
      debe: 0, haber: totalTotal,
      descripcion:  `${prov.razonSocial} · RUT ${prov.rut}`,
    });

    // Ajuste de centavos por redondeo
    const sd = lineas.reduce((s, l) => s + (l.debe  || 0), 0);
    const sh = lineas.reduce((s, l) => s + (l.haber || 0), 0);
    if (Math.abs(sd - sh) > 0 && Math.abs(sd - sh) < 10) lineas[0].debe += sh - sd;

    const foliosTxt = folios.length <= 3
      ? folios.join(", ")
      : `${folios.slice(0,3).join(", ")} +${folios.length-3}`;
    const nDocs = prov.facturas.length;

    return {
      fecha:          fechaRef || `${periodo}-01`,
      glosa:          `${prov.razonSocial} · ${nDocs} doc${nDocs>1?"s":""} · F°${foliosTxt}`,
      tipo:           "automatico",
      lineas,
      periodo,
      totalDebe:      lineas.reduce((s,l) => s + (l.debe||0), 0),
      origen:         "iconstruye",
      importHash:     calcularImportHash(periodo, prov.rut, folios),
      _rut:           prov.rut,
      _razonSocial:   repararMojibake(prov.razonSocial),
      _clasificacion: prov.esCombustible ? "Combustible (Ley 18.502)" : prov.clasificacion.label,
      _esCombustible: prov.esCombustible,
      _nDocs:         nDocs,
      _totalTotal:    totalTotal,
      _totalNeto:     totalNeto,
      _totalIVA:      totalIVA,
      _totalImpEspec: totalImpEspec,
      _totalExento:   totalExento,
      _facturas:      prov.facturas,
    };
  });

  // ── Notas de Crédito (tipo 61) — asientos inversos ────────────────────────
  // Asiento NC: DEBE Cuentas por Pagar / HABER Gasto + HABER IVA CF
  const filasNC = filasNorm.filter(f => f["_esNotaCredito"]);

  // Agrupar NC por proveedor
  const mapaNC = {};
  filasNC.forEach(f => {
    const rut = f["_rut"] || "SIN_RUT";
    if (!mapaNC[rut]) mapaNC[rut] = { razonSocial: f["_razonSocial"], rut, ncs: [] };
    mapaNC[rut].ncs.push(f);
  });

  const asientosNC = Object.values(mapaNC).map(prov => {
    let totalNeto=0, totalIVA=0, totalTotal=0;
    const folios=[]; let fechaRef=null;

    prov.ncs.forEach(f => {
      totalNeto  += f["_neto"]  || 0;
      totalIVA   += f["_iva"]   || 0;
      totalTotal += f["_total"] || 0;
      if (f["_folio"]) folios.push(`NC°${f["_folio"]}`);
      if (!fechaRef && f["_fecha"]) fechaRef = f["_fecha"];
    });

    const clasif   = clasificarProveedor(prov.razonSocial);
    // Misma resolución por etiqueta que las facturas: la NC tiene que anular la
    // MISMA cuenta que cargó la compra, no la primera del tipo.
    const cGasto   = resolverCuenta(clasif).cuenta;
    const foliosTxt = folios.length <= 3 ? folios.join(", ") : `${folios.slice(0,3).join(", ")} +${folios.length-3}`;
    const nDocs = prov.ncs.length;

    const lineas = [];
    // DEBE: Cuentas por Pagar (reduce la deuda)
    if (totalTotal > 0) lineas.push({
      cuentaId:     cPorPagar?.id || "", cuentaNombre: cPorPagar?.nombre || "",
      debe: totalTotal, haber: 0,
      descripcion:  `${prov.razonSocial} · NC recibida`,
    });
    // HABER: Gasto (anula el gasto original)
    if (totalNeto > 0) lineas.push({
      cuentaId:     cGasto?.id || "", cuentaNombre: cGasto?.nombre || "",
      debe: 0, haber: totalNeto,
      descripcion:  `Anulación gasto — ${clasif.label}`,
    });
    // HABER: IVA Crédito Fiscal (reduce el CF)
    if (totalIVA > 0) lineas.push({
      cuentaId:     cIVA?.id || "", cuentaNombre: cIVA?.nombre || "",
      debe: 0, haber: totalIVA,
      descripcion:  "Reverso IVA Crédito Fiscal",
    });

    // Ajuste centavos
    const sd = lineas.reduce((s,l)=>s+(l.debe||0),0);
    const sh = lineas.reduce((s,l)=>s+(l.haber||0),0);
    // Ajuste de redondeo: en pesos chilenos una diferencia real es de $1-2 por
    // el cálculo del IVA. Sobre eso ya no es redondeo, es un dato mal leído, así
    // que no se tapa. Antes se empujaban hasta $9 a la primera línea sin dejar rastro.
    if (Math.abs(sd-sh) > 0 && Math.abs(sd-sh) <= 2) lineas[0].debe += sh - sd;

    return {
      fecha:         fechaRef || `${periodo}-01`,
      glosa:         `NC — ${prov.razonSocial} · ${nDocs} doc${nDocs>1?"s":""} · ${foliosTxt}`,
      tipo:          "automatico",
      lineas,
      periodo,
      totalDebe:     lineas.reduce((s,l)=>s+(l.debe||0),0),
      origen:        "iconstruye",
      importHash:    calcularImportHash(periodo, `NC-${prov.rut}`, folios),
      _rut:          prov.rut,
      _razonSocial:  repararMojibake(prov.razonSocial),
      _clasificacion:"Nota de Crédito",
      _esCombustible:false,
      _nDocs:        nDocs,
      _totalTotal:   totalTotal,
      _totalNeto:    totalNeto,
      _totalIVA:     totalIVA,
      _totalImpEspec:0,
      _totalExento:  0,
      _facturas:     prov.ncs,
      _esNC:         true,
    };
  });

  return { asientos: [...asientos, ...asientosNC], errores: [] };
}

// ─── Componentes UI ───────────────────────────────────────────────────────────
// Pasos del asistente escritos en una línea, como un índice: el paso en curso
// resaltado y los ya hechos con visto bueno.
function Stepper({ step }) {
  const steps = ["Archivo", "Revisar", "Confirmar"];
  return (
    <ol className="m-0 p-0 list-none flex flex-wrap items-center gap-x-3 gap-y-1 text-[17px]">
      {steps.map((s, i) => {
        const active = step === i;
        const done   = step > i;
        return (
          <React.Fragment key={i}>
            <li aria-current={active ? "step" : undefined}
              className={`flex items-center gap-1.5 ${active ? "text-cuaderno-tinta" : done ? "text-cuaderno-verde" : "text-cuaderno-grafito"}`}>
              {done ? <VistoBueno tamano={15} titulo="Hecho" /> : <span>{i+1}.</span>}
              {active ? <Resaltado color="durazno">{s}</Resaltado> : <span>{s}</span>}
            </li>
            {i < steps.length-1 && <li aria-hidden="true" className="text-cuaderno-columna">—</li>}
          </React.Fragment>
        );
      })}
    </ol>
  );
}

// ─── Categorías disponibles para reclasificar ────────────────────────────────
// Mapeo de categoría → nombre de cuenta en el plan de cuentas
const CATEGORIAS = [
  { label: "Combustible (Ley 18.502)",  esCombustible: true,  tipo: "costo",     icon: "⛽", cuentaMatch: /combustible/i },
  { label: "Subcontratos",              esCombustible: false, tipo: "costo",     icon: "🏗️", cuentaMatch: /subcontrato/i },
  { label: "Materiales y Suministros",  esCombustible: false, tipo: "costo",     icon: "🔧", cuentaMatch: /materiales/i  },
  { label: "Mantención y Reparación",   esCombustible: false, tipo: "costo",     icon: "🛠️", cuentaMatch: /mantenci/i    },
  { label: "Arriendo Maquinaria",       esCombustible: false, tipo: "costo",     icon: "🚜", cuentaMatch: /arriendo.*maq|maquinaria/i },
  { label: "Fletes y Transportes",      esCombustible: false, tipo: "costo",     icon: "🚛", cuentaMatch: /flete|transport/i },
  { label: "Seguridad Industrial",      esCombustible: false, tipo: "costo",     icon: "🦺", cuentaMatch: /seguridad.*ind|industrial.*seg/i },
  { label: "Servicios Básicos Obra",    esCombustible: false, tipo: "costo",     icon: "🔌", cuentaMatch: /básicos.*obra|obra.*básic/i },
  { label: "Pasajes y Traslados",       esCombustible: false, tipo: "gasto_adm", icon: "✈️", cuentaMatch: /pasaje/i      },
  { label: "Peajes y Movilización",     esCombustible: false, tipo: "gasto_adm", icon: "🛣️", cuentaMatch: /peaje|moviliz/i },
  { label: "Viáticos",                  esCombustible: false, tipo: "gasto_adm", icon: "🧳", cuentaMatch: /viátic/i      },
  { label: "Telecomunicaciones",        esCombustible: false, tipo: "gasto_adm", icon: "📡", cuentaMatch: /telecom/i     },
  { label: "Arriendos Oficina",         esCombustible: false, tipo: "gasto_adm", icon: "🏢", cuentaMatch: /arriendo.*ofic|ofic.*arriendo/i },
  { label: "Honorarios Profesionales",  esCombustible: false, tipo: "gasto_adm", icon: "⚖️", cuentaMatch: /honorario/i   },
  { label: "Seguridad Oficina",         esCombustible: false, tipo: "gasto_adm", icon: "🛡️", cuentaMatch: /seguridad.*ofic|ofic.*segur/i },
  { label: "Suscripciones y Software",  esCombustible: false, tipo: "gasto_adm", icon: "💻", cuentaMatch: /suscripci|software/i },
  { label: "Seguros",                   esCombustible: false, tipo: "gasto_adm", icon: "📋", cuentaMatch: /seguro/i      },
  { label: "Gastos Bancarios",          esCombustible: false, tipo: "gasto_adm", icon: "🏦", cuentaMatch: /bancario|banco/i },
  { label: "Gastos Varios",             esCombustible: false, tipo: "gasto_adm", icon: "🧾", cuentaMatch: /varios/i      },
  { label: "Gastos Financieros",        esCombustible: false, tipo: "gasto_fin", icon: "💰", cuentaMatch: /interés|interes|comisión/i },
];

// Reconstruye las líneas del asiento cuando cambia la categoría
function reconstruirLineas(asiento, nuevaCateg, cuentas) {
  const findC = (pred) => cuentas.find(c => c.activa !== false && pred(c));
  const cIVA      = findC(c => c.tipo === "iva_credito" && !/específico|especifico/i.test(c.nombre));
  const cImpEspec = findC(c => c.tipo === "iva_credito" && /específico|especifico/i.test(c.nombre));
  const cPorPagar = findC(c => c.tipo === "pasivo_corriente" && /pagar/i.test(c.nombre))
                 || findC(c => c.tipo === "pasivo_corriente");
  const cGasto    = nuevaCateg.esCombustible
    ? (findC(c => c.tipo === "costo" && /combustible/i.test(c.nombre)) || findC(c => c.tipo === "costo"))
    : nuevaCateg.cuentaMatch
    ? (findC(c => c.tipo === nuevaCateg.tipo && nuevaCateg.cuentaMatch.test(c.nombre)) || findC(c => c.tipo === nuevaCateg.tipo) || findC(c => c.tipo === "gasto_adm"))
    : (findC(c => c.tipo === nuevaCateg.tipo) || findC(c => c.tipo === "gasto_adm"));

  const { _totalNeto, _totalIVA, _totalExento, _totalImpEspec, _totalTotal, _rut, _razonSocial } = asiento;
  const lineas = [];

  if (nuevaCateg.esCombustible) {
    if (_totalNeto > 0)     lineas.push({ cuentaId: cGasto?.id||"", cuentaNombre: cGasto?.nombre||"", debe: _totalNeto,     haber: 0, descripcion: "Neto combustible (base imponible)" });
    if (_totalImpEspec > 0) lineas.push({ cuentaId: cImpEspec?.id||"", cuentaNombre: cImpEspec?.nombre||"", debe: _totalImpEspec, haber: 0, descripcion: "Imp. específico combustible — Ley 18.502 (recuperable F29 línea 24)" });
    if (_totalIVA > 0)      lineas.push({ cuentaId: cIVA?.id||"", cuentaNombre: cIVA?.nombre||"", debe: _totalIVA,      haber: 0, descripcion: "IVA Crédito Fiscal 19%" });
  } else {
    if (_totalNeto > 0)    lineas.push({ cuentaId: cGasto?.id||"", cuentaNombre: cGasto?.nombre||"", debe: _totalNeto,   haber: 0, descripcion: `Neto afecto — ${nuevaCateg.label}` });
    if (_totalIVA > 0)     lineas.push({ cuentaId: cIVA?.id||"", cuentaNombre: cIVA?.nombre||"", debe: _totalIVA,    haber: 0, descripcion: "IVA Crédito Fiscal 19%" });
    if (_totalExento > 0)  lineas.push({ cuentaId: cGasto?.id||"", cuentaNombre: cGasto?.nombre||"", debe: _totalExento, haber: 0, descripcion: `Neto exento — ${nuevaCateg.label}` });
  }
  lineas.push({ cuentaId: cPorPagar?.id||"", cuentaNombre: cPorPagar?.nombre||"", debe: 0, haber: _totalTotal, descripcion: `${_razonSocial} · RUT ${_rut}` });

  // Ajuste de centavos
  const sd = lineas.reduce((s,l)=>s+(l.debe||0),0);
  const sh = lineas.reduce((s,l)=>s+(l.haber||0),0);
  // Ajuste de redondeo: en pesos chilenos una diferencia real es de $1-2 por
    // el cálculo del IVA. Sobre eso ya no es redondeo, es un dato mal leído, así
    // que no se tapa. Antes se empujaban hasta $9 a la primera línea sin dejar rastro.
    if (Math.abs(sd-sh) > 0 && Math.abs(sd-sh) <= 2) lineas[0].debe += sh - sd;

  return lineas;
}

// ─── Tarjeta de proveedor editable ───────────────────────────────────────────
function ProveedorCard({ asiento, idx, cuentas, onChange, isDuplicado = false }) {
  const [tab, setTab]           = useState("asiento");  // "asiento" | "facturas" | "categoria"
  const [expanded, setExpanded] = useState(false);

  const updateLinea = (li, field, val) => {
    const nuevasLineas = asiento.lineas.map((l, i) => {
      if (i !== li) return l;
      const updated = { ...l, [field]: (field === "debe" || field === "haber") ? (parseFloat(val)||0) : val };
      if (field === "cuentaId") updated.cuentaNombre = cuentas.find(x => x.id === val)?.nombre || "";
      return updated;
    });
    onChange(idx, {
      ...asiento, lineas: nuevasLineas,
      totalDebe: nuevasLineas.reduce((s,l)=>s+(l.debe||0),0),
      // Cambiar la cuenta a mano también es una decisión que vale la pena aprender
      _reclasificado: field === "cuentaId" ? true : asiento._reclasificado,
    });
  };

  const handleCategoria = (categ) => {
    const nuevasLineas = reconstruirLineas(asiento, categ, cuentas);
    onChange(idx, {
      ...asiento,
      lineas:          nuevasLineas,
      totalDebe:       nuevasLineas.reduce((s,l)=>s+(l.debe||0),0),
      _clasificacion:  categ.label,
      _esCombustible:  categ.esCombustible,
      _reclasificado:  true,   // decisión explícita del usuario → se aprende
    });
    setTab("asiento");
  };

  const sumDebe  = asiento.lineas.reduce((s,l)=>s+(l.debe||0),0);
  const sumHaber = asiento.lineas.reduce((s,l)=>s+(l.haber||0),0);
  const cuadrado = Math.abs(sumDebe - sumHaber) < 1;

  // Facturas del proveedor para el panel de detalle
  const facturas = asiento._facturas || [];

  // Etiqueta de la categoría: resaltador pastel según el tipo de documento
  const colorCategoria = asiento._esNC ? "rosa" : asiento._esVenta ? "lavanda" : asiento._esCombustible ? "durazno" : "menta";

  const pestanas = [
    { id:"asiento",   label:"Asiento contable" },
    { id:"facturas",  label:`Documentos (${facturas.length})` },
    ...(!asiento._esNC ? [{ id:"categoria", label:"Cambiar categoría" }] : []),
  ];

  return (
    <div className={`relative border-b border-cuaderno-renglon ${isDuplicado ? "opacity-50" : ""}`}>

      {/* Overlay duplicado */}
      {isDuplicado && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-cuaderno-tarjeta/60">
          <Resaltado color="lavanda" className="text-[16px]">Ya importado — se omitirá</Resaltado>
        </div>
      )}

      {/* ── Cabecera (siempre visible) ── */}
      <div className="flex items-center gap-3 px-1 py-2.5">
        <div className="flex-1 min-w-0">
          <p className="m-0 text-[18px] leading-snug text-cuaderno-tinta truncate">{casoTitulo(asiento._razonSocial)}</p>
          <div className="flex items-center flex-wrap gap-x-2 gap-y-1 text-[14px] text-cuaderno-grafito">
            <span>{asiento._rut}</span>
            <span aria-hidden="true">·</span>
            {/* Categoría — NC no permite cambio */}
            {asiento._esNC ? (
              <Resaltado color={colorCategoria}>{asiento._esVenta ? "NC emitida" : "Nota de crédito"}</Resaltado>
            ) : asiento._esVenta ? (
              <Resaltado color={colorCategoria}>{asiento._clasificacion}</Resaltado>
            ) : (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setExpanded(true); setTab("categoria"); }}
                className="inline-flex items-center gap-1 text-cuaderno-tinta hover:underline underline-offset-[3px] focus:outline-none focus-visible:ring-2 focus-visible:ring-cuaderno-tinta/40 rounded-sm"
                title="Clic para cambiar categoría"
              >
                <Resaltado color={colorCategoria}>{asiento._clasificacion}</Resaltado>
                <IconoLapiz tamano={13} className="text-cuaderno-grafito" />
              </button>
            )}
            <span aria-hidden="true">·</span>
            <span>{asiento._nDocs} doc{asiento._nDocs>1?"s":""}</span>
          </div>
        </div>

        <div className="text-right flex-shrink-0">
          <p className="m-0 text-[18px]"><Cifra valor={asiento._totalTotal} escala="pesos" vacio="$0" /></p>
          {!cuadrado && <p className="m-0 text-[14px] text-cuaderno-roja">Descuadrado</p>}
        </div>

        {/* Botón expand */}
        <Boton variante="icono" className="w-10 h-10 border-cuaderno-columna"
          aria-label={expanded ? "Ocultar detalle" : "Ver detalle"} aria-expanded={expanded}
          onClick={() => setExpanded(!expanded)}>
          <IconoBajar className={`transition-transform ${expanded ? "rotate-180" : ""}`} />
        </Boton>
      </div>

      {/* ── Panel expandible ── */}
      {expanded && (
        <div className="pb-4 pl-3 ml-1 border-l-[1.5px] border-cuaderno-margen space-y-3">
          <Pestanas opciones={pestanas} valor={tab} onCambiar={setTab} className="[&>button]:text-[17px] [&>button]:min-h-[40px]" />

          {/* ── Tab: Asiento contable ── */}
          {tab === "asiento" && (
            <div className="space-y-2">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="shadow-[inset_0_-1.5px_0_rgb(var(--cuaderno-tinta))]">
                    <th className="font-normal text-[15px] text-cuaderno-grafito text-left py-1 pr-2">Cuenta</th>
                    <th className="font-normal text-[15px] text-cuaderno-grafito text-right py-1 px-2 w-[22%]">Debe</th>
                    <th className="font-normal text-[15px] text-cuaderno-grafito text-right py-1 pl-2 w-[22%]">Haber</th>
                  </tr>
                </thead>
                <tbody>
                  {asiento.lineas.map((linea, li) => (
                    <tr key={li} className="border-b border-cuaderno-renglon align-top">
                      <td className="py-1.5 pr-2">
                        <Campo as="select" aria-label="Cuenta" value={linea.cuentaId} onChange={e => updateLinea(li,"cuentaId",e.target.value)}>
                          <option value="">— Seleccionar —</option>
                          {cuentas.filter(c=>c.activa!==false).map(c=>(
                            <option key={c.id} value={c.id}>{c.codigo} {c.nombre}</option>
                          ))}
                        </Campo>
                        <input value={linea.descripcion||""} onChange={e=>updateLinea(li,"descripcion",e.target.value)}
                          aria-label="Descripción"
                          className="w-full mt-0.5 px-1 bg-transparent border-0 border-b border-dashed border-cuaderno-columna text-[14px] text-cuaderno-grafito focus:outline-none focus:border-cuaderno-tinta"
                          placeholder="Descripción..." />
                      </td>
                      <td className="py-1.5 px-2">
                        <Campo type="number" aria-label="Debe" value={linea.debe||""} onChange={e=>updateLinea(li,"debe",e.target.value)}
                          className="[&>input]:text-right" placeholder="0" />
                      </td>
                      <td className="py-1.5 pl-2">
                        <Campo type="number" aria-label="Haber" value={linea.haber||""} onChange={e=>updateLinea(li,"haber",e.target.value)}
                          className="[&>input]:text-right" placeholder="0" />
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="text-[17px]">
                    <td className="pt-2 pr-2">
                      {cuadrado
                        ? <span className="inline-flex items-center gap-1.5 text-cuaderno-verde"><VistoBueno titulo="" /> Cuadrado</span>
                        : <span className="text-cuaderno-roja">Diferencia <Cifra valor={Math.abs(sumDebe-sumHaber)} escala="pesos" color="roja" /></span>}
                    </td>
                    <td className="pt-2 px-2 text-right"><Cifra valor={sumDebe} escala="pesos" raya="total" vacio="$0" /></td>
                    <td className="pt-2 pl-2 text-right"><Cifra valor={sumHaber} escala="pesos" raya="total" vacio="$0" /></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          {/* ── Tab: Documentos del proveedor ── */}
          {tab === "facturas" && (
            <div>
              {facturas.length === 0 ? (
                <p className="m-0 py-4 text-center font-ligada text-[17px] text-cuaderno-grafito">Sin facturas</p>
              ) : (
                <ul className="m-0 p-0 list-none max-h-64 overflow-y-auto">
                  {facturas.map((f, fi) => {
                    const total   = parseFloat(String(f["Monto Total"]||"0").replace(/[^0-9.-]/g,""))||0;
                    const refs    = f["Referencias"] || "";
                    const tipo    = f["Tipo"] || "";
                    const folio   = f["Folio"] || "";
                    const fecha   = f["Fecha Emisión"] || f["Fecha Emisión"] || "";
                    const centro  = f["Centro de Gestión"] || "";
                    const rendic  = f["Rendición"] || "";
                    // Palabras clave para ayudar a identificar el gasto
                    const pistas  = [centro, rendic, refs].filter(Boolean).join(" · ").slice(0,120);
                    return (
                      <li key={fi} className="py-2 pr-1 flex items-start gap-3 border-b border-cuaderno-renglon">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center flex-wrap gap-x-2 text-[16px]">
                            <span className="text-cuaderno-tinta">F°{folio}</span>
                            <span aria-hidden="true" className="text-cuaderno-columna">·</span>
                            <span className="text-cuaderno-grafito">{fecha}</span>
                            {tipo.toLowerCase().includes("exent") && (
                              <Resaltado color="lavanda" className="text-[14px]">Exenta</Resaltado>
                            )}
                          </div>
                          {pistas && (
                            <p className="m-0 text-[14px] text-cuaderno-grafito truncate" title={pistas}>
                              {pistas}
                            </p>
                          )}
                          {refs && refs.toLowerCase().includes("guía") && (
                            <p className="m-0 text-[14px] text-cuaderno-grafito">
                              Con guía de despacho
                            </p>
                          )}
                        </div>
                        <p className="m-0 text-[16px] flex-shrink-0"><Cifra valor={total} escala="pesos" vacio="$0" /></p>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}

          {/* ── Tab: Cambiar categoría ── */}
          {tab === "categoria" && (
            <div>
              <p className="m-0 mb-2 text-[15px] text-cuaderno-grafito">
                Selecciona la categoría correcta — se recalcularán las cuentas automáticamente
              </p>
              <div role="radiogroup" aria-label="Categoría" className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {CATEGORIAS.map(categ => {
                  const activa = categ.label === asiento._clasificacion;
                  return (
                    <button
                      key={categ.label}
                      type="button"
                      role="radio"
                      aria-checked={activa}
                      onClick={() => handleCategoria(categ)}
                      className={`flex items-center gap-2 min-h-[48px] px-3 py-1.5 rounded-md border-[1.5px] text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-cuaderno-tinta/40
                        ${activa
                          ? "border-cuaderno-tinta bg-cuaderno-hoja text-cuaderno-tinta"
                          : "border-cuaderno-columna/70 text-cuaderno-grafito hover:border-cuaderno-tinta/60 hover:text-cuaderno-tinta"}`}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[16px]">
                          {activa ? <Resaltado color="menta">{categ.label}</Resaltado> : categ.label}
                        </span>
                        <span className="block truncate text-[13px] text-cuaderno-grafito">
                          {categ.esCombustible ? "Con imp. específico Ley 18.502" :
                           categ.tipo === "costo" ? "Costo operacional" :
                           categ.tipo === "gasto_fin" ? "Gasto financiero" : "Gasto administración"}
                        </span>
                      </span>
                      {activa && <VistoBueno titulo="Elegida" tamano={16} />}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Modal principal ──────────────────────────────────────────────────────────
export default function ModalImportIConstruct({ isOpen, onClose, cuentas, reglasGasto = {}, guardarReglaGasto, guardarAsiento, periodoActivo, onImportDone, buscarHashesExistentes }) {
  const inputRef   = useRef(null);
  const [step, setStep]              = useState(0);
  const [filas, setFilas]            = useState([]);
  const [formato, setFormato]        = useState("desconocido");
  const [asientos, setAsientos]      = useState([]);
  const [duplicados, setDuplicados]  = useState(new Set()); // hashes ya importados
  const [saltados, setSaltados]      = useState(0);
  const [errores, setErrores]     = useState([]);
  const [progreso, setProgreso]   = useState(0);
  const [importados, setImportados] = useState(0);
  const [periodo, setPeriodo]     = useState(periodoActivo);
  const [importing, setImporting] = useState(false);

  const reset = () => {
    setStep(0); setFilas([]); setAsientos([]); setErrores([]);
    setProgreso(0); setImportados(0); setImporting(false);
    setFormato("desconocido"); setDuplicados(new Set()); setSaltados(0);
    setPeriodo(periodoActivo);
  };

  const handleClose = () => { reset(); onClose(); };

  // Leer archivo — soporta XLSX (iConstruct) y CSV (RCV SII)
  const handleFile = useCallback((file) => {
    if (!file) return;
    const esCSV = file.name.toLowerCase().endsWith(".csv");

    const procesar = async (raw) => {
      const fmt_ = detectarFormato(raw);
      let validas;
      if (fmt_ === "rcv_sii") {
        validas = raw.filter(r => [33,34,55,56,61].includes(parseInt(r["Tipo Doc"])||0));
      } else if (fmt_ === "rcv_venta") {
        validas = raw.filter(r => [33,34,56,61].includes(parseInt(r["Tipo Doc"])||0));
      } else {
        validas = raw.filter(r => String(r["Tipo"]||"").toLowerCase().includes("factura"));
      }
      if (!validas.length) { setErrores([`No se encontraron facturas (formato: ${fmt_}).`]); return; }
      setFilas(validas);
      setFormato(fmt_);
      const res = generarAsientos(validas, cuentas, periodo);
      if (res.errores.length) { setErrores(res.errores); return; }
      // Usar el período detectado automáticamente desde las fechas del archivo
      const periodoReal = res.periodoDetectado || periodo;
      if (periodoReal !== periodo) setPeriodo(periodoReal);
      // Consultar hashes ya importados en Firestore para ese período
      const hashsExistentes = buscarHashesExistentes
        ? await buscarHashesExistentes(periodoReal)
        : new Set();
      setDuplicados(hashsExistentes);
      setAsientos(res.asientos.map(a => aplicarReglaImport(a, reglasGasto)));
      setErrores([]);
      setStep(1);
    };

    const leerCSV = async () => {
      // La codificación se DETECTA, no se asume. Antes era readAsText(file,"latin1")
      // y el RCV del SII viene en UTF-8: cada byte de un acento se leía suelto y
      // "ÓPTICA" llegaba como "Ã“PTICA". Esos nombres quedaron guardados en las
      // reglas de gasto y en las glosas de los asientos ya importados.
      try {
        const texto = await leerTextoDetectando(file);
        const lineas = texto.split(/\r?\n/);
        if (lineas.length > 0 && !lineas[0].endsWith(";_extra")) {
          lineas[0] = lineas[0] + ";_extra";
        }
        // raw: true = cada celda se lee como texto. Sin esto XLSX interpreta las
        // fechas dd/mm/aaaa como mm/dd ("01/02/2026" quedaba 2 de enero) y las
        // convierte en número, y los documentos caían en otro período.
        const wb  = XLSX.read(lineas.join("\n"), { type: "string", raw: true, FS: ";" });
        const ws  = wb.Sheets[wb.SheetNames[0]];
        await procesar(XLSX.utils.sheet_to_json(ws, { defval: "" }));
      } catch (err) { setErrores([`Error CSV: ${err.message}`]); }
    };

    const reader = new FileReader();
    if (esCSV) {
      leerCSV();
    } else {
      reader.onload = (e) => {
        try {
          const wb  = XLSX.read(e.target.result, { type: "array" });
          const ws  = wb.Sheets[wb.SheetNames[0]];
          procesar(XLSX.utils.sheet_to_json(ws, { defval: "" })).catch(err => setErrores([`Error: ${err.message}`]));
        } catch (err) { setErrores([`Error Excel: ${err.message}`]); }
      };
      reader.readAsArrayBuffer(file);
    }
  }, [cuentas, periodo, reglasGasto]);

  const handleUpdateAsiento = (idx, updated) => {
    setAsientos(prev => prev.map((a, i) => i === idx ? updated : a));
  };

  // Importar
  const handleImportar = async () => {
    const descuadrados = asientos.filter(a => {
      const sd = a.lineas.reduce((s,l)=>s+(l.debe||0),0);
      const sh = a.lineas.reduce((s,l)=>s+(l.haber||0),0);
      return Math.abs(sd-sh) >= 1 && !duplicados.has(a.importHash);
    });
    if (descuadrados.length) {
      if (!window.confirm(`Hay ${descuadrados.length} asiento(s) descuadrado(s). ¿Deseas importar de todas formas?`)) return;
    }
    setImporting(true);
    setStep(2);
    let ok = 0, saltados = 0;
    for (let i = 0; i < asientos.length; i++) {
      const a = asientos[i];
      // Saltar duplicados
      if (a.importHash && duplicados.has(a.importHash)) {
        saltados++;
        setProgreso(Math.round(((i+1)/asientos.length)*100));
        continue;
      }
      const asientoLimpio = Object.fromEntries(
        Object.entries(a).filter(([k]) => !k.startsWith("_"))
      );
      await guardarAsiento(asientoLimpio);

      // Aprender SOLO si el usuario reclasificó este asiento a mano.
      //
      // Antes esto corría para todos los asientos, sin condición: el resultado
      // del regex genérico se persistía como si fuera una decisión del usuario.
      // Como las reglas aprendidas tienen prioridad sobre el regex, la
      // clasificación por defecto quedaba congelada y se reforzaba en cada
      // importación. Lo que sale del regex es una sugerencia, no un aprendizaje.
      if (a._rut && a._reclasificado) {
        const gl = a.lineas.find(l => parseFloat(l.debe) > 0 && !/(iva|impuesto)/i.test(l.cuentaNombre || ""));
        if (gl && guardarReglaGasto) {
          // La etiqueta se deriva de la CUENTA elegida, no de la clasificación
          // previa: si no, quedan cuenta nueva con etiqueta vieja.
          const cat = CATEGORIAS.find(c => c.cuentaMatch?.test(gl.cuentaNombre || ""))
                   || CATEGORIAS.find(c => c.label === a._clasificacion)
                   || { label: gl.cuentaNombre || "Gasto", icon: "🏷" };
          await guardarReglaGasto(a._rut, a._razonSocial, {
            cuentaId: gl.cuentaId,
            cuentaNombre: gl.cuentaNombre,
            categoriaLabel: cat.label,
            categoriaIcon: cat.icon || "🏷",
            origen: "usuario",
          });
        }
      }

      ok++;
      setProgreso(Math.round(((i+1)/asientos.length)*100));
      setImportados(ok);
    }
    setSaltados(saltados);
    setImporting(false);
    if (onImportDone) onImportDone(periodo);
  };

  // Stats
  const stats = useMemo(() => ({
    docs:      filas.length,
    proveedores: asientos.length,
    total:     asientos.reduce((s,a)=>s+a._totalTotal,0),
    totalIVA:  asientos.reduce((s,a)=>s+a._totalIVA,0),
    totalNeto: asientos.reduce((s,a)=>s+a._totalNeto,0),
    descuadrados: asientos.filter(a=>{
      const sd=a.lineas.reduce((s,l)=>s+(l.debe||0),0);
      const sh=a.lineas.reduce((s,l)=>s+(l.haber||0),0);
      return Math.abs(sd-sh)>=1 && !duplicados.has(a.importHash);
    }).length,
    nDuplicados: asientos.filter(a => a.importHash && duplicados.has(a.importHash)).length,
    nNuevos:     asientos.filter(a => !a.importHash || !duplicados.has(a.importHash)).length,
  }), [filas, asientos, duplicados]);

  if (!isOpen) return null;

  return (
    <ModalCuaderno
      titulo="Importar desde iConstruct"
      subtitulo="Centralización automática de facturas de proveedores"
      onClose={handleClose}
      ancho="max-w-3xl"
      cerrarAlClicFuera={false}
      pie={
        step === 1 ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Boton variante="texto" onClick={() => { reset(); }}>
              <IconoAnterior /> Cambiar archivo
            </Boton>
            <Boton variante="primario" onClick={handleImportar}>
              Importar {stats.nNuevos} asiento{stats.nNuevos!==1?"s":""}{stats.nDuplicados>0?` (+${stats.nDuplicados} omitidos)`:""}
            </Boton>
          </div>
        ) : step === 2 && progreso >= 100 ? (
          <div className="flex justify-end">
            <Boton variante="primario" onClick={handleClose}>
              Ver en Libro Diario <IconoSiguiente />
            </Boton>
          </div>
        ) : null
      }>

      <Stepper step={step < 2 ? step : (progreso < 100 ? 2 : 2)} />

      {/* ── STEP 0: Subir archivo ── */}
      {step === 0 && (
        <>
          {/* Período */}
          <Campo type="month" etiqueta="Período a contabilizar" value={periodo}
            onChange={e => setPeriodo(e.target.value)}
            className="max-w-xs"
            ayuda="Se detecta automáticamente desde las fechas del archivo. Puedes ajustarlo manualmente." />

          {/* Drop zone */}
          <div
            role="button"
            tabIndex={0}
            onClick={() => inputRef.current?.click()}
            onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); inputRef.current?.click(); } }}
            onDragOver={e => e.preventDefault()}
            onDrop={e => { e.preventDefault(); handleFile(e.dataTransfer.files[0]); }}
            className="cursor-pointer rounded-md border-[1.5px] border-dashed border-cuaderno-columna bg-cuaderno-hoja hover:border-cuaderno-tinta transition-colors p-8 text-center focus:outline-none focus-visible:ring-2 focus-visible:ring-cuaderno-tinta/40"
          >
            <IconoSubir tamano={28} className="mx-auto mb-3 text-cuaderno-grafito" />
            <p className="m-0 font-ligada text-[19px] text-cuaderno-tinta">Arrastra el archivo Excel aquí</p>
            <p className="m-0 mt-1 text-[16px] text-cuaderno-grafito">
              o <span className="text-cuaderno-tinta underline underline-offset-[3px] decoration-cuaderno-columna">haz clic para seleccionar</span>
            </p>
            <ul className="m-0 mt-4 p-0 list-none space-y-1 text-[15px] text-cuaderno-grafito">
              <li><Resaltado color="lavanda">RCV SII</Resaltado> — CSV del Registro de Compras</li>
              <li><Resaltado color="menta">iConstruct</Resaltado> — Documentos.xlsx</li>
            </ul>
            <input ref={inputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden"
              onChange={e => handleFile(e.target.files[0])} />
          </div>

          {/* Resumen del proceso */}
          <ol className="m-0 p-0 list-none grid grid-cols-1 sm:grid-cols-3 gap-x-5 gap-y-2">
            {[
              { title: "Lectura", desc: "Lee todas las facturas del archivo" },
              { title: "Clasificación", desc: "Asigna cuenta de gasto por tipo de proveedor" },
              { title: "Revisión manual", desc: "Edita cuenta o montos antes de importar" },
            ].map((item, i) => (
              <li key={item.title} className="border-t border-cuaderno-renglon pt-2">
                <p className="m-0 text-[17px] text-cuaderno-tinta">{i+1}. {item.title}</p>
                <p className="m-0 text-[14px] text-cuaderno-grafito">{item.desc}</p>
              </li>
            ))}
          </ol>

          {errores.length > 0 && (
            <div className="space-y-1">
              {errores.map((e,i) => (
                <Nota key={i} etiqueta="Error:">{e}</Nota>
              ))}
            </div>
          )}
        </>
      )}

      {/* ── STEP 1: Revisión y edición ── */}
      {step === 1 && (
        <>
          {/* Resumen */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8">
            <LineaGuia etiqueta="Documentos">{stats.docs}</LineaGuia>
            <LineaGuia etiqueta="Proveedores">{stats.proveedores}</LineaGuia>
            <LineaGuia etiqueta="Neto + exento"><Cifra valor={stats.totalNeto} escala="pesos" vacio="$0" /></LineaGuia>
            <LineaGuia etiqueta="IVA CF"><Cifra valor={stats.totalIVA} escala="pesos" vacio="$0" /></LineaGuia>
          </div>

          {/* Período detectado + formato */}
          <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
            <Campo type="month" etiqueta="Período detectado" value={periodo}
              onChange={e => setPeriodo(e.target.value)}
              className="max-w-[14rem]"
              ayuda="Derivado automáticamente de las fechas de los documentos" />
            <div className="min-w-0 flex-1 text-[16px]">
              <Resaltado color={formato === "rcv_venta" ? "lavanda" : "menta"}>
                {formato === "rcv_sii"   ? "RCV SII — Registro de Compras" :
                 formato === "rcv_venta" ? "RCV SII — Registro de Ventas" :
                                          "iConstruct — Documentos.xlsx"}
              </Resaltado>
              {formato === "rcv_sii" && (
                <p className="m-0 mt-1 text-[14px] text-cuaderno-grafito">Impuesto específico combustible leído directamente del SII</p>
              )}
              {formato === "rcv_venta" && (
                <p className="m-0 mt-1 text-[14px] text-cuaderno-grafito">Genera asientos de venta: Cuentas por Cobrar / Ingresos + IVA Débito</p>
              )}
            </div>
          </div>

          {/* Alerta duplicados */}
          {stats.nDuplicados > 0 && (
            <Nota etiqueta="Ojo:" tono="grafito">
              {stats.nDuplicados} asiento{stats.nDuplicados>1?"s ya estaban":"  ya estaba"} importado{stats.nDuplicados>1?"s":""} — se omitirán automáticamente.
              {" "}Se importarán {stats.nNuevos} asiento{stats.nNuevos!==1?"s":""} nuevo{stats.nNuevos!==1?"s":""}.
            </Nota>
          )}
          {stats.nDuplicados === 0 && stats.proveedores > 0 && (
            <p className="m-0 flex items-center gap-2 text-[17px] text-cuaderno-grafito">
              <VistoBueno titulo="" /> Sin duplicados — todos los {stats.proveedores} asientos son nuevos
            </p>
          )}

          {/* Alerta descuadres */}
          {stats.descuadrados > 0 && (
            <Nota etiqueta="Ojo:">
              {stats.descuadrados} asiento{stats.descuadrados>1?"s":""} con diferencia de cuadre —
              expándelos para corregir manualmente.
            </Nota>
          )}

          {/* Info edición */}
          <p className="m-0 text-[15px] text-cuaderno-grafito">
            Haz clic en cada proveedor para ver y editar las líneas del asiento antes de importar
          </p>

          {/* Lista de asientos editables */}
          <div className="border-t-[1.5px] border-cuaderno-tinta">
            {asientos.map((a, i) => (
              <ProveedorCard
                key={i}
                idx={i}
                asiento={a}
                cuentas={cuentas}
                onChange={handleUpdateAsiento}
                isDuplicado={!!(a.importHash && duplicados.has(a.importHash))}
              />
            ))}
          </div>
        </>
      )}

      {/* ── STEP 2: Importando / Listo ── */}
      {step === 2 && (
        <div className="py-4 text-center space-y-4">
          {progreso < 100 ? (
            <>
              <div role="status">
                <p className="m-0 font-ligada text-[20px] text-cuaderno-tinta">Importando asientos...</p>
                <p className="m-0 mt-1 text-[16px] text-cuaderno-grafito">{importados} de {asientos.length} proveedores</p>
              </div>
              <div className="mx-auto w-full max-w-xs">
                <div className="w-full h-1.5 rounded-full bg-cuaderno-renglon overflow-hidden"
                  role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progreso}>
                  <div className="h-full bg-cuaderno-tinta transition-all duration-500" style={{ width:`${progreso}%` }}/>
                </div>
                <p className="m-0 mt-2 text-[22px] text-cuaderno-tinta">{progreso}%</p>
              </div>
            </>
          ) : (
            <>
              <div>
                <Titulo as="h3" tamano="md" className="flex items-center justify-center gap-2">
                  <VistoBueno tamano={20} titulo="" /> Importación completada
                </Titulo>
                <p className="m-0 mt-1 text-[16px] text-cuaderno-grafito">
                  {importados} asiento{importados!==1?"s":""} nuevo{importados!==1?"s":""} en <span className="text-cuaderno-tinta">{periodo}</span>
                  {saltados > 0 && <span> · {saltados} duplicado{saltados!==1?"s":""} omitido{saltados!==1?"s":""}</span>}
                </p>
              </div>
              <div className="max-w-sm mx-auto text-left">
                <LineaGuia etiqueta="Importados">{importados}</LineaGuia>
                <LineaGuia etiqueta="Omitidos">{saltados}</LineaGuia>
                <LineaGuia etiqueta="Total CxP"><Cifra valor={stats.total} escala="pesos" raya="total" vacio="$0" /></LineaGuia>
              </div>
            </>
          )}
        </div>
      )}
    </ModalCuaderno>
  );
}
