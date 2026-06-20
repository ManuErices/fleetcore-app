import React, { useState, useRef, useCallback, useMemo } from "react";
import * as XLSX from "xlsx";
import { fmt, normalizaRut } from "./ContabilidadContext";

// Función para corregir dobles codificaciones UTF-8 en strings Latin1
function fixEncoding(str) {
  if (!str) return "";
  try {
    return decodeURIComponent(escape(str));
  } catch (e) {
    return str;
  }
}

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
function aplicarReglaImport(asiento, reglasGasto) {
  if (!reglasGasto || asiento.origen !== "iconstruye") return asiento;
  if (String(asiento.glosa || "").startsWith("NC")) return asiento; // no tocar notas de crédito
  const regla = reglasGasto[normalizaRut(asiento._rut)];
  if (!regla || !regla.cuentaId) return asiento;
  const lineas = (asiento.lineas || []).map(l =>
    (parseFloat(l.debe) > 0 && !/(iva|impuesto)/i.test(l.cuentaNombre || ""))
      ? { ...l, cuentaId: regla.cuentaId, cuentaNombre: regla.cuentaNombre,
          descripcion: `${regla.categoriaIcon || "🏷"} ${regla.categoriaLabel} — auto (aprendido)` }
      : l
  );
  return {
    ...asiento, lineas,
    _clasificacion: regla.categoriaLabel || asiento._clasificacion,
    _aprendido: true,
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
    "_razonSocial":   fixEncoding(String(fila["Razon Social"] || "").trim()),
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

  // ── Impuesto Específico Combustible (Ley 18.502) ──────────────────────────
  // El SII lo registra en "Valor Otro Impuesto" cuando corresponde a combustible.
  // Regla definitiva confirmada con datos reales del RCV:
  //   Neto + IVA + Valor Otro Impuesto = Total (cuadre perfecto)
  // La detección no depende del código ni de IVA vacío:
  //   simplemente Valor Otro Impuesto > 0 indica imp. específico.
  const valorOtroImp = n(fila["Valor Otro Impuesto"]);
  const codOtroImp   = parseInt(String(fila["Codigo Otro Impuesto"] || "0").split(".")[0]) || 0;
  // Clasificar el tipo de impuesto adicional:
  // - Tabaco/alcohol (código 27, 271, 272, 273): NO recuperable → se suma al gasto
  // - Combustible (código 24, 28, o sin código con Neto > 0): recuperable → imp. específico
  const esCodTabaco  = [27, 271, 272, 273].includes(codOtroImp);
  const tieneNeto    = neto > 0;
  // Impuesto específico combustible: Valor Otro Impuesto > 0, tiene neto, no es tabaco
  const impEspec     = (valorOtroImp > 0 && tieneNeto && !esCodTabaco) ? valorOtroImp : 0;
  // Impuesto tabaco/alcohol: no recuperable, se incorpora al neto como mayor gasto
  // (ya está incluido en Monto Total, hay que reflejarlo en el debe para cuadrar)
  const impTabaco    = esCodTabaco ? valorOtroImp : 0;
  const esComb       = impEspec > 0;

  return {
    "_rut":              String(fila["RUT Proveedor"] || "").trim(),
    "_razonSocial":      fixEncoding(String(fila["Razon Social"]  || "").trim()),
    "_folio":            String(fila["Folio"]         || ""),
    "_fecha":            parseFechaRCV(fila["Fecha Docto"]) || parseFechaRCV(fila["Fecha Recepcion"]),
    "_tipoDoc":          tipoDoc,
    "_neto":             neto,
    "_iva":              ivaRec,
    "_exento":           exento,
    "_impEspec":         impEspec,
    "_impTabaco":        impTabaco,
    "_total":            total || (neto + ivaRec + impEspec + exento),
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
    "_razonSocial": fixEncoding(String(fila["Razón Social Emisor"] || "").trim()),
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
    if (Math.abs(sd-sh) > 0 && Math.abs(sd-sh) < 10) lineas[0].debe += sh - sd;

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
      _razonSocial:  cliente.razonSocial,
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
      _razonSocial:  cliente.razonSocial,
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

  const getCuentaGasto = (tipo) =>
    findCuenta(c => c.tipo === tipo) || findCuenta(c => c.tipo === "gasto_adm");

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
      : getCuentaGasto(clasif.tipo);
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
        totalNeto   += f["_impTabaco"] || 0; // imp. tabaco/alcohol: no recuperable → mayor gasto
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
      _razonSocial:   prov.razonSocial,
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
    const cGasto   = cuentas.find(c => c.activa !== false && c.tipo === clasif.tipo)
                  || cuentas.find(c => c.activa !== false && c.tipo === "gasto_adm");
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
    if (Math.abs(sd-sh) > 0 && Math.abs(sd-sh) < 10) lineas[0].debe += sh - sd;

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
      _razonSocial:  prov.razonSocial,
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
function StepDot({ n, label, active, done }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-black transition-all
        ${done  ? "bg-emerald-500 text-white shadow-lg shadow-emerald-200"
        : active ? "bg-slate-900 text-white shadow-lg shadow-slate-300"
                 : "bg-slate-100 text-slate-400"}`}>
        {done ? <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7"/></svg> : n}
      </div>
      <span className={`text-[10px] font-bold uppercase tracking-wider whitespace-nowrap
        ${active ? "text-slate-900" : done ? "text-emerald-600" : "text-slate-400"}`}>{label}</span>
    </div>
  );
}

function Stepper({ step }) {
  const steps = ["Archivo", "Revisar", "Confirmar"];
  return (
    <div className="flex items-center gap-0 justify-center px-4 py-3">
      {steps.map((s, i) => (
        <React.Fragment key={i}>
          <StepDot n={i+1} label={s} active={step===i} done={step>i} />
          {i < steps.length-1 && (
            <div className={`flex-1 h-px mx-2 transition-all ${step>i ? "bg-emerald-400" : "bg-slate-200"}`} />
          )}
        </React.Fragment>
      ))}
    </div>
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
  if (Math.abs(sd-sh) > 0 && Math.abs(sd-sh) < 10) lineas[0].debe += sh - sd;

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
    onChange(idx, { ...asiento, lineas: nuevasLineas, totalDebe: nuevasLineas.reduce((s,l)=>s+(l.debe||0),0) });
  };

  const handleCategoria = (categ) => {
    const nuevasLineas = reconstruirLineas(asiento, categ, cuentas);
    onChange(idx, {
      ...asiento,
      lineas:          nuevasLineas,
      totalDebe:       nuevasLineas.reduce((s,l)=>s+(l.debe||0),0),
      _clasificacion:  categ.label,
      _esCombustible:  categ.esCombustible,
    });
    setTab("asiento");
  };

  const sumDebe  = asiento.lineas.reduce((s,l)=>s+(l.debe||0),0);
  const sumHaber = asiento.lineas.reduce((s,l)=>s+(l.haber||0),0);
  const cuadrado = Math.abs(sumDebe - sumHaber) < 1;

  // Facturas del proveedor para el panel de detalle
  const facturas = asiento._facturas || [];

  const badgeStyle = asiento._esNC
    ? { background:"#fce7f3", color:"#9d174d" }
    : asiento._esVenta
    ? { background:"#dbeafe", color:"#1e40af" }
    : asiento._esCombustible
    ? { background:"#fef3c7", color:"#92400e" }
    : { background:"#eef2ff", color:"#4338ca" };

  return (
    <div className={`rounded-2xl border-2 transition-all overflow-hidden relative
      ${isDuplicado ? "border-slate-200 opacity-50" :
        asiento._esNC ? "border-pink-200 bg-pink-50/10" : cuadrado ? "border-slate-200 hover:border-slate-300" : "border-amber-300 bg-amber-50/20"}`}>

      {/* Overlay duplicado */}
      {isDuplicado && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/60 rounded-2xl">
          <span className="text-xs font-black text-slate-500 bg-slate-100 px-3 py-1.5 rounded-full flex items-center gap-1.5">
            🔁 Ya importado — se omitirá
          </span>
        </div>
      )}

      {/* ── Cabecera (siempre visible) ── */}
      <div className="flex items-center gap-3 px-4 py-3">
        <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${asiento._esNC ? "bg-pink-400" : cuadrado ? "bg-emerald-400" : "bg-amber-400 animate-pulse"}`} />

        <div className="flex-1 min-w-0">
          <p className="text-sm font-black text-slate-800 truncate">{asiento._razonSocial}</p>
          <div className="flex items-center flex-wrap gap-1.5 mt-0.5">
            <span className="text-[10px] text-slate-400 font-mono">{asiento._rut}</span>
            <span className="text-[10px] text-slate-300">·</span>
            {/* Badge categoría — NC no permite cambio */}
            {asiento._esNC ? (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={badgeStyle}>
                {asiento._esVenta ? "🔴 NC Emitida" : "🔴 Nota de Crédito"}
              </span>
            ) : asiento._esVenta ? (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={badgeStyle}>
                🔵 {asiento._clasificacion}
              </span>
            ) : (
            <button
              onClick={(e) => { e.stopPropagation(); setExpanded(true); setTab("categoria"); }}
              className="text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 transition-all hover:opacity-80 border border-transparent hover:border-current"
              style={badgeStyle}
              title="Clic para cambiar categoría"
            >
              {asiento._esCombustible ? "⛽ " : ""}{asiento._clasificacion}
              <svg className="w-2.5 h-2.5 opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/>
              </svg>
            </button>
            )}
            <span className="text-[10px] text-slate-300">·</span>
            <span className="text-[10px] text-slate-400">{asiento._nDocs} doc{asiento._nDocs>1?"s":""}</span>
          </div>
        </div>

        <div className="text-right flex-shrink-0 mr-1">
          <p className="text-sm font-black text-slate-800 tabular-nums">{fmt(asiento._totalTotal)}</p>
          {!cuadrado && <p className="text-[10px] text-amber-600 font-bold">⚠ Descuadrado</p>}
        </div>

        {/* Botón expand */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-slate-100 transition-colors flex-shrink-0"
        >
          <svg className={`w-4 h-4 text-slate-400 transition-transform ${expanded?"rotate-180":""}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"/>
          </svg>
        </button>
      </div>

      {/* ── Panel expandible ── */}
      {expanded && (
        <div className="border-t border-slate-100">
          {/* Tabs */}
          <div className="flex border-b border-slate-100 bg-slate-50/50">
            {[
              { id:"asiento",   label:"Asiento contable", icon:"📒" },
              { id:"facturas",  label:`Documentos (${facturas.length})`, icon:"🧾" },
              ...(!asiento._esNC ? [{ id:"categoria", label:"Cambiar categoría", icon:"🏷️" }] : []),
            ].map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`flex-1 py-2 text-[11px] font-bold flex items-center justify-center gap-1.5 transition-all border-b-2
                  ${tab===t.id ? "border-indigo-500 text-indigo-700 bg-white" : "border-transparent text-slate-400 hover:text-slate-600"}`}>
                <span>{t.icon}</span>{t.label}
              </button>
            ))}
          </div>

          {/* ── Tab: Asiento contable ── */}
          {tab === "asiento" && (
            <div className="px-4 pb-4 pt-3 space-y-2 bg-white">
              <div className="grid grid-cols-12 gap-1 text-[10px] font-black text-slate-400 uppercase tracking-wider pb-1 border-b border-slate-100">
                <div className="col-span-5">Cuenta</div>
                <div className="col-span-3 text-right">Debe</div>
                <div className="col-span-3 text-right">Haber</div>
                <div className="col-span-1"/>
              </div>
              {asiento.lineas.map((linea, li) => (
                <div key={li} className="grid grid-cols-12 gap-1 items-center">
                  <div className="col-span-5">
                    <select value={linea.cuentaId} onChange={e => updateLinea(li,"cuentaId",e.target.value)}
                      className="w-full text-xs px-2 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-400 bg-white font-medium text-slate-700">
                      <option value="">— Seleccionar —</option>
                      {cuentas.filter(c=>c.activa!==false).map(c=>(
                        <option key={c.id} value={c.id}>{c.codigo} {c.nombre}</option>
                      ))}
                    </select>
                    <input value={linea.descripcion||""} onChange={e=>updateLinea(li,"descripcion",e.target.value)}
                      className="w-full text-[10px] px-2 py-1 mt-0.5 border border-slate-100 rounded-lg focus:outline-none text-slate-400 bg-slate-50"
                      placeholder="Descripción..." />
                  </div>
                  <div className="col-span-3">
                    <input type="number" value={linea.debe||""} onChange={e=>updateLinea(li,"debe",e.target.value)}
                      className="w-full text-xs px-2 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:border-emerald-400 text-right font-mono bg-white"
                      placeholder="0"/>
                  </div>
                  <div className="col-span-3">
                    <input type="number" value={linea.haber||""} onChange={e=>updateLinea(li,"haber",e.target.value)}
                      className="w-full text-xs px-2 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:border-red-400 text-right font-mono bg-white"
                      placeholder="0"/>
                  </div>
                  <div className="col-span-1"/>
                </div>
              ))}
              <div className={`flex justify-between pt-2 border-t border-slate-100 text-xs font-black
                ${cuadrado ? "text-emerald-700" : "text-amber-700"}`}>
                <span>Debe: {fmt(sumDebe)}</span>
                <span>{cuadrado ? "✓ Cuadrado" : `⚠ Diferencia ${fmt(Math.abs(sumDebe-sumHaber))}`}</span>
                <span>Haber: {fmt(sumHaber)}</span>
              </div>
            </div>
          )}

          {/* ── Tab: Documentos del proveedor ── */}
          {tab === "facturas" && (
            <div className="bg-white">
              {facturas.length === 0 ? (
                <p className="text-center text-slate-400 text-xs py-6">Sin facturas</p>
              ) : (
                <div className="divide-y divide-slate-50 max-h-64 overflow-y-auto">
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
                      <div key={fi} className="px-4 py-2.5 flex items-start gap-3 hover:bg-slate-50/50 transition-colors">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-black text-slate-500 font-mono">F°{folio}</span>
                            <span className="text-[10px] text-slate-300">·</span>
                            <span className="text-[10px] text-slate-400">{fecha}</span>
                            {tipo.toLowerCase().includes("exent") && (
                              <span className="text-[9px] bg-slate-100 text-slate-500 px-1.5 rounded-full font-bold">Exenta</span>
                            )}
                          </div>
                          {pistas && (
                            <p className="text-[10px] text-slate-400 mt-0.5 truncate" title={pistas}>
                              {pistas}
                            </p>
                          )}
                          {refs && refs.toLowerCase().includes("guía") && (
                            <p className="text-[10px] text-amber-600 font-semibold mt-0.5">
                              🚛 Con guía de despacho
                            </p>
                          )}
                        </div>
                        <p className="text-xs font-black text-slate-700 tabular-nums flex-shrink-0">{fmt(total)}</p>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ── Tab: Cambiar categoría ── */}
          {tab === "categoria" && (
            <div className="bg-white px-4 pb-4 pt-3">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-3">
                Selecciona la categoría correcta — se recalcularán las cuentas automáticamente
              </p>
              <div className="grid grid-cols-2 gap-2">
                {CATEGORIAS.map(categ => {
                  const activa = categ.label === asiento._clasificacion;
                  return (
                    <button
                      key={categ.label}
                      onClick={() => handleCategoria(categ)}
                      className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-left text-xs font-bold transition-all border-2
                        ${activa
                          ? "border-indigo-500 bg-indigo-50 text-indigo-800"
                          : "border-slate-100 hover:border-slate-300 text-slate-600 hover:bg-slate-50"}`}
                    >
                      <span className="text-base flex-shrink-0">{categ.icon}</span>
                      <div className="min-w-0">
                        <p className="truncate">{categ.label}</p>
                        <p className="text-[9px] font-normal opacity-60 truncate">
                          {categ.esCombustible ? "Con imp. específico Ley 18.502" :
                           categ.tipo === "costo" ? "Costo operacional" :
                           categ.tipo === "gasto_fin" ? "Gasto financiero" : "Gasto administración"}
                        </p>
                      </div>
                      {activa && (
                        <svg className="w-4 h-4 text-indigo-500 flex-shrink-0 ml-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7"/>
                        </svg>
                      )}
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

    const reader = new FileReader();
    if (esCSV) {
      reader.onload = (e) => {
        try {
          // El CSV del SII tiene un campo extra al final de cada fila (;) que
          // desplaza las columnas si el header no lo contempla. Se agrega _extra.
          const texto = e.target.result;
          const lineas = texto.split(/\r?\n/);
          if (lineas.length > 0 && !lineas[0].endsWith(";_extra")) {
            lineas[0] = lineas[0] + ";_extra";
          }
          const textoCorregido = lineas.join("\n");
          const wb  = XLSX.read(textoCorregido, { type: "string", raw: false, FS: ";" });
          const ws  = wb.Sheets[wb.SheetNames[0]];
          procesar(XLSX.utils.sheet_to_json(ws, { defval: "" })).catch(err => setErrores([`Error: ${err.message}`]));
        } catch (err) { setErrores([`Error CSV: ${err.message}`]); }
      };
      reader.readAsText(file, "latin1");
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

      // Auto-aprender la regla si el usuario la modificó o para futuros registros
      if (a._rut) {
        const gl = a.lineas.find(l => parseFloat(l.debe) > 0 && !/(iva|impuesto)/i.test(l.cuentaNombre || ""));
        if (gl && guardarReglaGasto) {
          const cat = CATEGORIAS.find(c => c.label === a._clasificacion)
                   || { label: a._clasificacion || gl.cuentaNombre, icon: "🏷" };
          await guardarReglaGasto(a._rut, a._razonSocial, {
            cuentaId: gl.cuentaId,
            cuentaNombre: gl.cuentaNombre,
            categoriaLabel: cat.label,
            categoriaIcon: cat.icon || "🏷",
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto"
      style={{ background: "rgba(2,6,23,0.75)", backdropFilter: "blur(6px)" }}>
      <div className="w-full max-w-2xl my-auto" style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}>

        {/* Card principal */}
        <div className="bg-white rounded-3xl overflow-hidden shadow-2xl"
          style={{ boxShadow: "0 32px 80px -12px rgba(0,0,0,0.35)" }}>

          {/* Header con gradiente sutil */}
          <div className="relative overflow-hidden" style={{
            background: "linear-gradient(135deg, #0f172a 0%, #1e3a5f 60%, #1d4ed8 100%)"
          }}>
            <div className="absolute inset-0 opacity-20"
              style={{ backgroundImage: "radial-gradient(circle at 80% 20%, #60a5fa 0%, transparent 50%)" }} />
            <div className="relative px-6 pt-6 pb-5">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl flex items-center justify-center text-xl"
                    style={{ background: "rgba(255,255,255,0.12)" }}>🏗️</div>
                  <div>
                    <h2 className="text-white font-black text-lg tracking-tight">Importar desde iConstruct</h2>
                    <p className="text-blue-300 text-xs mt-0.5">Centralización automática de facturas de proveedores</p>
                  </div>
                </div>
                <button onClick={handleClose}
                  className="w-8 h-8 rounded-xl flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 transition-all">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
                  </svg>
                </button>
              </div>
              <div className="mt-5">
                <Stepper step={step < 2 ? step : (progreso < 100 ? 2 : 2)} />
              </div>
            </div>
          </div>

          {/* Body */}
          <div className="p-6 space-y-5 max-h-[65vh] overflow-y-auto">

            {/* ── STEP 0: Subir archivo ── */}
            {step === 0 && (
              <>
                {/* Período */}
                <div className="flex items-center gap-3 p-4 bg-slate-50 rounded-2xl">
                  <div className="w-8 h-8 rounded-xl bg-slate-200 flex items-center justify-center text-slate-600 text-sm">📅</div>
                  <div className="flex-1">
                    <p className="text-xs font-black text-slate-700">Período a contabilizar</p>
                    <p className="text-[10px] text-slate-400">Se detecta automáticamente desde las fechas del archivo. Puedes ajustarlo manualmente.</p>
                  </div>
                  <input type="month" value={periodo}
                    onChange={e => setPeriodo(e.target.value)}
                    className="px-3 py-2 text-sm font-bold border-2 border-slate-200 rounded-xl focus:outline-none focus:border-blue-500 bg-white"
                  />
                </div>

                {/* Drop zone */}
                <div
                  onClick={() => inputRef.current?.click()}
                  onDragOver={e => e.preventDefault()}
                  onDrop={e => { e.preventDefault(); handleFile(e.dataTransfer.files[0]); }}
                  className="group cursor-pointer rounded-2xl border-2 border-dashed transition-all p-10 text-center"
                  style={{ borderColor: "#c7d2fe", background: "linear-gradient(135deg, #eef2ff 0%, #f8fafc 100%)" }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = "#6366f1"}
                  onMouseLeave={e => e.currentTarget.style.borderColor = "#c7d2fe"}
                >
                  <div className="text-5xl mb-4">📊</div>
                  <p className="font-black text-slate-800 text-base">Arrastra el archivo Excel aquí</p>
                  <p className="text-slate-400 text-sm mt-1">o <span className="text-indigo-600 font-bold underline underline-offset-2">haz clic para seleccionar</span></p>
                  <div className="mt-4 space-y-2">
                    <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-indigo-100 rounded-full">
                      <span className="text-[10px] font-black text-indigo-700 uppercase tracking-wider">📋 RCV SII — CSV del Registro de Compras</span>
                    </div>
                    <div className="block">
                      <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-slate-100 rounded-full">
                        <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider">📊 iConstruct — Documentos.xlsx</span>
                      </div>
                    </div>
                  </div>
                  <input ref={inputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden"
                    onChange={e => handleFile(e.target.files[0])} />
                </div>

                {/* Resumen del proceso */}
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { icon: "🔍", title: "Lectura", desc: "Lee todas las facturas del archivo" },
                    { icon: "🧠", title: "Clasificación", desc: "Asigna cuenta de gasto por tipo de proveedor" },
                    { icon: "✏️", title: "Revisión manual", desc: "Edita cuenta o montos antes de importar" },
                  ].map(item => (
                    <div key={item.title} className="p-3 rounded-xl bg-slate-50 text-center">
                      <div className="text-2xl mb-1">{item.icon}</div>
                      <p className="text-xs font-black text-slate-700">{item.title}</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">{item.desc}</p>
                    </div>
                  ))}
                </div>

                {errores.length > 0 && (
                  <div className="p-4 bg-red-50 rounded-2xl border border-red-100">
                    {errores.map((e,i) => (
                      <p key={i} className="text-xs text-red-700 font-semibold flex items-center gap-2">
                        <span>⚠</span>{e}
                      </p>
                    ))}
                  </div>
                )}
              </>
            )}

            {/* ── STEP 1: Revisión y edición ── */}
            {step === 1 && (
              <>
                {/* KPIs */}
                <div className="grid grid-cols-4 gap-2">
                  {[
                    { label: "Documentos",   val: stats.docs,            color: "#1e40af", bg: "#eff6ff" },
                    { label: "Proveedores",  val: stats.proveedores,     color: "#7c3aed", bg: "#f5f3ff" },
                    { label: "Neto + Exento",val: fmt(stats.totalNeto),  color: "#065f46", bg: "#ecfdf5" },
                    { label: "IVA CF",       val: fmt(stats.totalIVA),   color: "#b45309", bg: "#fffbeb" },
                  ].map(k => (
                    <div key={k.label} className="rounded-2xl p-3 text-center"
                      style={{ background: k.bg }}>
                      <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: k.color, opacity: 0.7 }}>{k.label}</p>
                      <p className="text-sm font-black mt-0.5 tabular-nums" style={{ color: k.color }}>{k.val}</p>
                    </div>
                  ))}
                </div>

                {/* Badge período detectado + formato */}
                <div className="flex items-center gap-2 flex-wrap p-3 bg-blue-50 border border-blue-200 rounded-2xl">
                  <span className="text-lg">📅</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-black text-blue-800">
                      Período detectado: <span className="text-blue-600">{periodo}</span>
                    </p>
                    <p className="text-[10px] text-blue-500 mt-0.5">
                      Derivado automáticamente de las fechas de los documentos
                    </p>
                  </div>
                  <input type="month" value={periodo}
                    onChange={e => setPeriodo(e.target.value)}
                    className="px-2 py-1 text-xs font-bold border border-blue-300 rounded-lg focus:outline-none focus:border-blue-500 bg-white text-blue-700 flex-shrink-0"
                  />
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-[10px] font-black px-2.5 py-1 rounded-full
                    ${formato === "rcv_sii"   ? "bg-emerald-100 text-emerald-700" :
                      formato === "rcv_venta" ? "bg-blue-100 text-blue-700" :
                                                "bg-indigo-100 text-indigo-700"}`}>
                    {formato === "rcv_sii"   ? "✓ RCV SII — Registro de Compras" :
                     formato === "rcv_venta" ? "✓ RCV SII — Registro de Ventas" :
                                              "✓ iConstruct — Documentos.xlsx"}
                  </span>
                  {formato === "rcv_sii" && (
                    <span className="text-[10px] text-slate-400">Impuesto específico combustible leído directamente del SII</span>
                  )}
                  {formato === "rcv_venta" && (
                    <span className="text-[10px] text-slate-400">Genera asientos de venta: Cuentas por Cobrar / Ingresos + IVA Débito</span>
                  )}
                </div>

                {/* Alerta duplicados */}
                {stats.nDuplicados > 0 && (
                  <div className="flex items-center gap-3 p-3 bg-slate-100 border border-slate-300 rounded-2xl">
                    <span className="text-xl">🔁</span>
                    <div className="flex-1">
                      <p className="text-xs text-slate-700 font-black">
                        {stats.nDuplicados} asiento{stats.nDuplicados>1?"s ya estaban":"  ya estaba"} importado{stats.nDuplicados>1?"s":""} — se omitirán automáticamente
                      </p>
                      <p className="text-[10px] text-slate-500 mt-0.5">
                        Se importarán {stats.nNuevos} asiento{stats.nNuevos!==1?"s":""} nuevo{stats.nNuevos!==1?"s":""}
                      </p>
                    </div>
                  </div>
                )}
                {stats.nDuplicados === 0 && stats.proveedores > 0 && (
                  <div className="flex items-center gap-2 p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl">
                    <span className="text-sm">✅</span>
                    <p className="text-[11px] text-emerald-700 font-semibold">Sin duplicados — todos los {stats.proveedores} asientos son nuevos</p>
                  </div>
                )}

                {/* Alerta descuadres */}
                {stats.descuadrados > 0 && (
                  <div className="flex items-center gap-3 p-3 bg-amber-50 border border-amber-200 rounded-2xl">
                    <span className="text-xl">⚠️</span>
                    <p className="text-xs text-amber-800 font-semibold">
                      {stats.descuadrados} asiento{stats.descuadrados>1?"s":""} con diferencia de cuadre —
                      expándelos para corregir manualmente.
                    </p>
                  </div>
                )}

                {/* Info edición */}
                <div className="flex items-center gap-2 text-[10px] text-slate-400">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                  </svg>
                  <span>Haz clic en cada proveedor para ver y editar las líneas del asiento antes de importar</span>
                </div>

                {/* Lista de asientos editables */}
                <div className="space-y-2">
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
              <div className="py-8 text-center space-y-5">
                {progreso < 100 ? (
                  <>
                    <div className="w-16 h-16 rounded-3xl mx-auto flex items-center justify-center text-3xl"
                      style={{ background: "linear-gradient(135deg, #1e3a5f, #1d4ed8)" }}>
                      🏗️
                    </div>
                    <div>
                      <p className="font-black text-slate-800 text-lg">Importando asientos...</p>
                      <p className="text-slate-400 text-sm mt-1">{importados} de {asientos.length} proveedores</p>
                    </div>
                    <div className="mx-auto w-full max-w-xs">
                      <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
                        <div className="h-2.5 rounded-full transition-all duration-500"
                          style={{ width:`${progreso}%`, background:"linear-gradient(90deg,#3b82f6,#6366f1)" }}/>
                      </div>
                      <p className="text-indigo-600 font-black text-2xl mt-3">{progreso}%</p>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="w-16 h-16 rounded-3xl mx-auto flex items-center justify-center text-3xl bg-emerald-100">
                      ✅
                    </div>
                    <div>
                      <p className="font-black text-slate-800 text-xl">¡Importación completada!</p>
                      <p className="text-slate-500 text-sm mt-1">
                        {importados} asiento{importados!==1?"s":""} nuevo{importados!==1?"s":""} en <strong>{periodo}</strong>
                        {saltados > 0 && <span className="text-slate-400"> · {saltados} duplicado{saltados!==1?"s":""} omitido{saltados!==1?"s":""}</span>}
                      </p>
                    </div>
                    <div className="grid grid-cols-3 gap-3 max-w-sm mx-auto">
                      {[
                        { label:"Importados",  val:importados,       color:"#1e40af" },
                        { label:"Omitidos",    val:saltados,         color:"#64748b" },
                        { label:"Total CxP",   val:fmt(stats.total), color:"#065f46" },
                      ].map(k=>(
                        <div key={k.label} className="bg-slate-50 rounded-xl p-3 text-center">
                          <p className="text-[10px] font-bold text-slate-400 uppercase">{k.label}</p>
                          <p className="text-sm font-black mt-0.5 tabular-nums" style={{color:k.color}}>{k.val}</p>
                        </div>
                      ))}
                    </div>
                    <button onClick={handleClose}
                      className="px-8 py-3 rounded-2xl text-white text-sm font-black shadow-lg transition-all hover:shadow-xl"
                      style={{ background:"linear-gradient(135deg,#1e3a5f,#1d4ed8)" }}>
                      Ver en Libro Diario →
                    </button>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Footer con botones */}
          {step === 1 && (
            <div className="px-6 pb-6 pt-2 flex gap-3 border-t border-slate-100">
              <button onClick={() => { reset(); }}
                className="flex-1 py-3 rounded-2xl border-2 border-slate-200 text-sm font-bold text-slate-600 hover:bg-slate-50 transition-all">
                ← Cambiar archivo
              </button>
              <button
                onClick={handleImportar}
                className="flex-1 py-3 rounded-2xl text-white text-sm font-black shadow-lg transition-all hover:shadow-xl"
                style={{ background:"linear-gradient(135deg,#0f172a,#1d4ed8)" }}
              >
                Importar {stats.nNuevos} asiento{stats.nNuevos!==1?"s":""}{stats.nDuplicados>0?` (+${stats.nDuplicados} omitidos)`:""} →
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
