/**
 * nominaBanco.js — src/pages/rrhh/nominaBanco.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Generación de la nómina de transferencias y su registro histórico.
 *
 * Reemplaza al CSV genérico anterior, que ningún portal bancario aceptaba tal
 * cual. El formato es el "Pago Fácil" del Banco de Chile: un XLSX con la hoja
 * `Nomina` y once columnas de largo y tipo fijos.
 *
 * Dos decisiones de diseño que conviene tener presentes:
 *
 *   · Descargar la nómina ES el acto de pago. Al generarla se marcan las
 *     liquidaciones (o los anticipos) como pagados y se deja el documento en
 *     `nominas_pago`. Sin ese registro no hay forma de saber cuánto se pagó, y
 *     sin eso no se puede calcular el diferencial de una reliquidación.
 *
 *   · La escritura va en un solo `writeBatch`. Si falla, no se descarga nada:
 *     una nómina descargada sin su registro dejaría plata pagada e invisible
 *     para el sistema.
 */

import * as XLSX from 'xlsx';
import { db } from '../../lib/firebase';
import {
  collection, doc, writeBatch, serverTimestamp,
} from 'firebase/firestore';
import { codigoBanco, codigoTipoCuenta, nombreBanco, MESES } from './shared';

// ─── Normalización exigida por el formato ─────────────────────────────────────

/** ALFANUM sin acentos ni caracteres especiales, truncado al largo del campo. */
export function limpiar(texto, largo) {
  const s = String(texto || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')   // quita tildes y ñ→n
    .replace(/[^A-Za-z0-9 ]/g, ' ')                      // sin caracteres raros
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
  return largo ? s.slice(0, largo) : s;
}

/** RUT sin puntos ni guion, con el DV pegado. ALFANUM(10). */
export const rutPlano = (rut) =>
  String(rut || '').replace(/[.\-\s]/g, '').toUpperCase().slice(0, 10);

export const LARGOS = {
  rut: 10, nombre: 50, cuenta: 18, identificador: 20,
  descripcion: 30, mail: 100, glosa: 30,
};

// ─── Armado de líneas ─────────────────────────────────────────────────────────

/**
 * Convierte un pago en una línea de la nómina, o en un error si al trabajador
 * le faltan datos bancarios. Nunca devuelve una línea a medias: un registro
 * incompleto hace que el portal rechace el archivo entero.
 */
export function lineaDePago({ trabajador, monto, glosa, descripcion }) {
  const nombre = `${trabajador?.apellidoPaterno || ''} ${trabajador?.apellidoMaterno || ''} ${trabajador?.nombre || ''}`.trim();
  const cod    = codigoBanco(trabajador?.banco);
  const tipo   = codigoTipoCuenta(trabajador?.tipoCuenta);
  const cuenta = String(trabajador?.nroCuenta || '').replace(/\D/g, '');
  const rut    = rutPlano(trabajador?.rut);
  const total  = Math.max(0, Math.round(Number(monto) || 0));

  const faltan = [];
  if (!rut)          faltan.push('RUT');
  if (!cod)          faltan.push('banco');
  if (!cuenta)       faltan.push('N° de cuenta');
  if (!tipo)         faltan.push('tipo de cuenta');
  if (total <= 0)    faltan.push('monto');

  // El monto de una cuenta de otro banco admite un dígito menos que el de una
  // cuenta del propio Banco de Chile (NUM(10) contra NUM(11)).
  const topeMonto = cod === '001' ? 99999999999 : 9999999999;
  if (total > topeMonto) faltan.push('monto sobre el máximo del formato');

  if (faltan.length) {
    return { ok: false, trabajadorId: trabajador?.id, nombre, rut, faltan };
  }

  return {
    ok: true,
    trabajadorId: trabajador?.id,
    rut,
    nombre:       limpiar(nombre, LARGOS.nombre),
    cuenta:       cuenta.slice(0, LARGOS.cuenta),
    codBanco:     cod,
    banco:        nombreBanco(cod),
    monto:        total,
    tipoCuenta:   tipo,
    identificador: rut,
    descripcion:  limpiar(descripcion, LARGOS.descripcion),
    glosa:        limpiar(glosa, LARGOS.glosa),
    mail:         String(trabajador?.email || trabajador?.correo || '').trim().slice(0, LARGOS.mail),
  };
}

/** Separa las líneas listas de las que no se pueden emitir. */
export function prepararNomina(pagos) {
  const resultados = pagos.map(lineaDePago);
  return {
    lineas:  resultados.filter(r => r.ok),
    errores: resultados.filter(r => !r.ok),
    total:   resultados.filter(r => r.ok).reduce((s, l) => s + l.monto, 0),
  };
}

// ─── Archivo XLSX ─────────────────────────────────────────────────────────────

const CABECERAS = [
  'Rut Beneficiario *', 'Nombre Beneficiario*', 'Cuenta beneficiario*',
  'Cod Banco *', 'Monto*', 'Tipo de Cuenta*', 'Identificador ',
  'Descripcion del Pago', 'Mail destinatario',
  'Campo Libre 1  (Glosa 1)', 'Campo Libre 2 (Glosa 2)',
];

/**
 * Descarga el XLSX en el formato Pago Fácil.
 * El nombre del archivo solo admite letras, números y espacios.
 */
export function descargarNominaBancoChile(lineas, nombreArchivo) {
  const filas = lineas.map(l => ({
    [CABECERAS[0]]: l.rut,
    [CABECERAS[1]]: l.nombre,
    // Como texto: un número de cuenta con ceros a la izquierda los pierde
    // si Excel lo interpreta como número.
    [CABECERAS[2]]: String(l.cuenta),
    [CABECERAS[3]]: l.codBanco,
    [CABECERAS[4]]: l.monto,
    [CABECERAS[5]]: l.tipoCuenta,
    [CABECERAS[6]]: l.identificador || '',
    [CABECERAS[7]]: l.descripcion || '',
    [CABECERAS[8]]: l.mail || '',
    [CABECERAS[9]]: l.glosa || '',
    [CABECERAS[10]]: '',
  }));

  const ws = XLSX.utils.json_to_sheet(filas, { header: CABECERAS });
  ws['!cols'] = [
    { wch: 12 }, { wch: 34 }, { wch: 20 }, { wch: 10 }, { wch: 12 },
    { wch: 14 }, { wch: 18 }, { wch: 26 }, { wch: 26 }, { wch: 26 }, { wch: 26 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Nomina');

  const limpio = limpiar(nombreArchivo, 80).replace(/[^A-Z0-9 ]/g, ' ').trim() || 'Nomina';
  XLSX.writeFile(wb, `${limpio}.xlsx`);
}

// ─── Registro en Firestore ────────────────────────────────────────────────────

/**
 * Deja constancia de la nómina y marca lo pagado, en una sola transacción por
 * lotes.
 *
 * @param tipo         'sueldo' | 'anticipo'
 * @param marcarLiq    [{ id, montoPagado }] liquidaciones a marcar
 * @param marcarAnt    [ids] anticipos a marcar como pagados
 */
export async function registrarNomina(empresaId, {
  tipo, mes, anio, lineas, total, glosa,
  marcarLiq = [], marcarAnt = [],
}) {
  const batch    = writeBatch(db);
  const nominaRef = doc(collection(db, 'empresas', empresaId, 'nominas_pago'));
  const fechaISO  = new Date().toISOString();

  batch.set(nominaRef, {
    tipo, mes, anio,
    banco: 'Banco de Chile (Pago Fácil)',
    glosa: glosa || '',
    fecha: fechaISO,
    cantidad: lineas.length,
    total,
    // Se guardan las líneas emitidas, no una referencia: si mañana cambia la
    // cuenta bancaria del trabajador, el histórico debe seguir diciendo a qué
    // cuenta se transfirió ese día.
    lineas: lineas.map(l => ({
      trabajadorId: l.trabajadorId || '',
      rut: l.rut, nombre: l.nombre, cuenta: l.cuenta,
      codBanco: l.codBanco, banco: l.banco,
      tipoCuenta: l.tipoCuenta, monto: l.monto, glosa: l.glosa || '',
    })),
    createdAt: serverTimestamp(),
  });

  marcarLiq.forEach(({ id, montoPagado }) => {
    batch.update(doc(db, 'empresas', empresaId, 'remuneraciones', id), {
      estado: 'pagado',
      montoPagado: Math.round(Number(montoPagado) || 0),
      fechaPago: fechaISO,
      nominaId: nominaRef.id,
      updatedAt: serverTimestamp(),
    });
  });

  marcarAnt.forEach(id => {
    batch.update(doc(db, 'empresas', empresaId, 'anticipos', id), {
      estado: 'pagado',
      fechaPago: fechaISO,
      nominaId: nominaRef.id,
      updatedAt: serverTimestamp(),
    });
  });

  await batch.commit();
  return nominaRef.id;
}

export const nombreDeNomina = (tipo, mes, anio) =>
  `${tipo === 'anticipo' ? 'Anticipos' : 'Remuneraciones'} ${MESES[parseInt(mes) - 1] || mes} ${anio}`;
