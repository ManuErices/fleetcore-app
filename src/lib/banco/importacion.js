/**
 * src/lib/banco/importacion.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Lleva a Firestore lo que leen cartolas.js y certificados.js, y lo conecta con
 * las cuentas del flujo de caja.
 *
 * Colecciones (todas bajo empresas/{empresaId}):
 *  · banco_cuentas/{id}        una por cuenta bancaria: banco, número, saldos y
 *                              fecha del último saldo conocido.
 *  · banco_movimientos/{id}    un documento por movimiento. El id sale de la
 *                              clave del movimiento, así reimportar una cartola
 *                              solapada no duplica nada.
 *                              Campos clave: fecha, semana (lunes, igual que el
 *                              flujo), cargo, abono, tipo, cuentaFlujoId ("" si
 *                              falta asignar), excluir (traspasos internos y
 *                              nóminas ya abiertas no cuentan como real).
 *  · banco_reglas/{id}         lo que se aprende al asignar a mano: "lo que
 *                              diga X va a la cuenta Y".
 *  · banco_importaciones/{id}  registro de cada archivo subido.
 *
 * Las nóminas del Banco de Chile llegan a la cartola como una sola línea. Al
 * subir su certificado, esa línea queda excluida y cada pago del certificado
 * entra como movimiento propio, para asignarlo a su cuenta.
 */
import {
  collection, doc, getDocs, query, where, writeBatch, updateDoc,
} from "firebase/firestore";
import { db } from "../firebase";
import { clasificar, normalizar } from "./cartolas.js";

// ─── Utilidades ───────────────────────────────────────────────────────────────
const col = (empresaId, nombre) => collection(db, "empresas", empresaId, nombre);
const ref = (empresaId, nombre, id) => doc(db, "empresas", empresaId, nombre, id);
const soloDigitos = (rut) => String(rut || "").replace(/[^0-9kK]/g, "").toUpperCase();

/** Lunes de la semana de una fecha ISO, como yyyy-mm-dd (la llave del flujo). */
export function semanaDe(fechaISO) {
  const [a, m, d] = fechaISO.split("-").map(Number);
  const f = new Date(a, m - 1, d);
  const dow = f.getDay();
  f.setDate(f.getDate() + (dow === 0 ? -6 : 1 - dow));
  return `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, "0")}-${String(f.getDate()).padStart(2, "0")}`;
}

/** Hash estable (cyrb53, dos semillas) para usar la clave como id de documento. */
function hash(texto) {
  const uno = (str, seed) => {
    let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
    for (let i = 0; i < str.length; i++) {
      const ch = str.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
  };
  return uno(texto, 1) + uno(texto, 7);
}
export const idMovimiento = (clave) => "m_" + hash(clave);
export const idCuentaBanco = (banco, numero) => `${banco}_${String(numero || "").replace(/\D/g, "")}`;

// Tipos que no son ingreso ni egreso del flujo, o que se reemplazan por su detalle.
const TIPOS_EXCLUIDOS = new Set(["traspaso_interno"]);

// ─── Contexto: cuentas del flujo, proveedores y reglas aprendidas ────────────
export async function cargarContexto(empresaId) {
  const [snapC, snapP, snapR, snapB] = await Promise.all([
    getDocs(col(empresaId, "flujo_cuentas")),
    getDocs(col(empresaId, "proveedores")),
    getDocs(col(empresaId, "banco_reglas")),
    getDocs(col(empresaId, "banco_cuentas")),
  ]);
  return {
    cuentas: snapC.docs.map(d => ({ id: d.id, ...d.data() })),
    proveedores: snapP.docs.map(d => ({ id: d.id, ...d.data() })),
    reglas: snapR.docs.map(d => ({ id: d.id, ...d.data() })),
    bancos: snapB.docs.map(d => ({ id: d.id, ...d.data() })),
  };
}

/**
 * Patrón con que se recuerda a quién corresponde un movimiento: el RUT de la
 * contraparte si lo hay, si no su nombre, y si no la descripción sin números
 * (para "Pago Fácil Bch: 0778212110" queda el convenio, que sí identifica).
 */
export function patronDe(mov) {
  const cp = mov.contraparte;
  if (cp?.rut) return { tipo: "rut", valor: soloDigitos(cp.rut), etiqueta: cp.nombre || cp.rut };
  if (cp?.nombre) return { tipo: "nombre", valor: normalizar(cp.nombre), etiqueta: cp.nombre };
  const d = normalizar(mov.descripcion);
  const conConvenio = d.match(/^(pago facil bch \d+|pago en [a-z]+ cl|pago [a-z ]+)/);
  const valor = conConvenio ? conConvenio[1] : d.replace(/\d+/g, "").replace(/\s+/g, " ").trim().slice(0, 48);
  return { tipo: "descripcion", valor, etiqueta: mov.descripcion };
}

/**
 * Sugiere la cuenta del flujo para un movimiento, en este orden:
 *  1. una regla aprendida con el mismo patrón;
 *  2. el RUT de la contraparte coincide con un proveedor vinculado a una cuenta;
 *  3. el nombre de la contraparte coincide con el nombre de una cuenta o de su
 *     proveedor.
 * Devuelve { cuentaFlujoId, motivo } o null.
 */
export function sugerirCuenta(mov, ctx) {
  const p = patronDe(mov);
  const regla = ctx.reglas.find(r => r.patronTipo === p.tipo && r.patron === p.valor);
  if (regla?.excluir) return { cuentaFlujoId: "", motivo: "regla", excluir: true };
  if (regla?.cuentaFlujoId) return { cuentaFlujoId: regla.cuentaFlujoId, motivo: "regla" };

  const cp = mov.contraparte;
  if (cp?.rut) {
    const prov = ctx.proveedores.find(pr => soloDigitos(pr.rutNormalizado || pr.rut) === soloDigitos(cp.rut));
    const cuenta = prov && ctx.cuentas.find(c => c.proveedorId === prov.id);
    if (cuenta) return { cuentaFlujoId: cuenta.id, motivo: "rut" };
  }
  if (cp?.nombre) {
    const n = normalizar(cp.nombre);
    const cuenta = ctx.cuentas.find(c => {
      const prov = c.proveedorId && ctx.proveedores.find(pr => pr.id === c.proveedorId);
      const nombres = [c.nombre, prov?.razonSocial].filter(Boolean).map(normalizar);
      return nombres.some(x => x.length >= 4 && (n.startsWith(x) || x.startsWith(n)));
    });
    if (cuenta) return { cuentaFlujoId: cuenta.id, motivo: "nombre" };
  }
  return null;
}

// ─── Preparar una cartola antes de guardar ────────────────────────────────────
/** Ids de movimientos ya guardados para esta cuenta en el período de la cartola. */
// Solo rango de fecha en la consulta: igualdad + rango en campos distintos
// exigiría un índice compuesto en Firestore. La cuenta se filtra aquí.
async function idsExistentes(empresaId, cuentaBancoId, desde, hasta) {
  const snap = await getDocs(query(col(empresaId, "banco_movimientos"),
    where("fecha", ">=", desde),
    where("fecha", "<=", hasta)));
  return new Set(snap.docs.filter(d => d.data().cuentaBancoId === cuentaBancoId).map(d => d.id));
}

/**
 * Deja la cartola lista para mostrar y guardar: cada movimiento con su id,
 * tipo, semana, cuenta sugerida y si ya estaba importado.
 */
export async function prepararCartola(empresaId, cartola, ctx, empresa) {
  const cuentaBancoId = idCuentaBanco(cartola.banco, cartola.cuenta);
  const existentes = await idsExistentes(empresaId, cuentaBancoId, cartola.desde, cartola.hasta);
  const filas = cartola.movimientos.map(m => {
    const id = idMovimiento(m.clave);
    const tipo = clasificar(m, { empresa });
    const sugerencia = TIPOS_EXCLUIDOS.has(tipo) ? null : sugerirCuenta(m, ctx);
    return { ...m, id, tipo, semana: semanaDe(m.fecha), sugerencia, yaImportado: existentes.has(id) };
  });
  return {
    cuentaBancoId,
    filas,
    nuevos: filas.filter(f => !f.yaImportado).length,
    repetidos: filas.filter(f => f.yaImportado).length,
  };
}

// ─── Guardar ──────────────────────────────────────────────────────────────────
async function escribirEnLotes(operaciones) {
  // Firestore admite 500 escrituras por lote; dejamos margen.
  for (let i = 0; i < operaciones.length; i += 400) {
    const lote = writeBatch(db);
    for (const op of operaciones.slice(i, i + 400)) op(lote);
    await lote.commit();
  }
}

/**
 * Guarda los movimientos nuevos de una cartola, actualiza el saldo de la cuenta
 * bancaria y deja registro de la importación. Las sugerencias de cuenta se
 * guardan como asignación (se pueden corregir después).
 */
export async function guardarCartola(empresaId, cartola, preparada, { archivo, usuario }) {
  const ahora = new Date().toISOString();
  const importacionId = "i_" + hash(`${preparada.cuentaBancoId}|${cartola.desde}|${cartola.hasta}|${ahora}`);
  const ops = [];

  for (const f of preparada.filas) {
    if (f.yaImportado) continue;
    ops.push(lote => lote.set(ref(empresaId, "banco_movimientos", f.id), {
      cuentaBancoId: preparada.cuentaBancoId, banco: cartola.banco,
      fecha: f.fecha, semana: f.semana,
      descripcion: f.descripcion, cargo: f.cargo, abono: f.abono, saldo: f.saldo ?? null,
      contraparte: f.contraparte || null,
      tipo: f.tipo,
      cuentaFlujoId: f.sugerencia?.cuentaFlujoId || "",
      asignadoPor: f.sugerencia?.motivo || "",
      excluir: TIPOS_EXCLUIDOS.has(f.tipo) || !!f.sugerencia?.excluir,
      origen: "cartola", importacionId, creadoEn: ahora,
    }));
  }

  if (cartola.saldo) {
    ops.push(lote => lote.set(ref(empresaId, "banco_cuentas", preparada.cuentaBancoId), {
      banco: cartola.banco, numero: cartola.cuenta, titular: cartola.titular || "",
      saldoDisponible: cartola.saldo.disponible, saldoContable: cartola.saldo.contable,
      lineaCredito: cartola.saldo.lineaCredito || 0,
      saldoAl: cartola.fechaCorte || cartola.hasta,
      saldoReconstruido: !!cartola.saldoReconstruido,
      actualizadoEn: ahora,
    }, { merge: true }));
  }

  ops.push(lote => lote.set(ref(empresaId, "banco_importaciones", importacionId), {
    tipo: "cartola", banco: cartola.banco, cuentaBancoId: preparada.cuentaBancoId,
    archivo: archivo || "", desde: cartola.desde, hasta: cartola.hasta,
    nuevos: preparada.nuevos, repetidos: preparada.repetidos,
    usuario: usuario || "", creadoEn: ahora,
  }));

  await escribirEnLotes(ops);
  return { importacionId, nuevos: preparada.nuevos };
}

// ─── Nóminas (certificado de pago) ────────────────────────────────────────────
/**
 * Busca en lo ya guardado la línea "Provision: Proveedores" de esta nómina:
 * mismo total y fecha igual o hasta 3 días después.
 */
export async function buscarLineaNomina(empresaId, certificado) {
  const desde = certificado.fechas[0];
  const hasta = new Date(desde); hasta.setDate(hasta.getDate() + 3);
  const hastaISO = hasta.toISOString().slice(0, 10);
  const snap = await getDocs(query(col(empresaId, "banco_movimientos"),
    where("fecha", ">=", desde),
    where("fecha", "<=", hastaISO)));
  const linea = snap.docs.map(d => ({ id: d.id, ...d.data() }))
    .find(m => m.tipo === "nomina_proveedores" && Math.round(m.cargo) === Math.round(certificado.totalEfectuado));
  return linea || null;
}

/**
 * Abre la nómina: la línea total queda excluida del real y cada pago entra como
 * movimiento propio, con su cuenta sugerida. Reimportar el mismo certificado no
 * duplica (los ids salen de la línea y del número de pago).
 */
export async function guardarNomina(empresaId, certificado, linea, ctx, { archivo, usuario }) {
  const ahora = new Date().toISOString();
  const ops = [];
  certificado.pagos.forEach((p, i) => {
    if (!/efectuad/i.test(p.estado)) return;               // un rechazo no salió del banco
    const mov = {
      fecha: linea.fecha, descripcion: `Nómina: ${p.nombre}`, cargo: p.monto, abono: 0,
      contraparte: { nombre: p.nombre, rut: p.rut, banco: p.banco, cuenta: p.cuenta, sentido: "sale" },
    };
    const sugerencia = sugerirCuenta(mov, ctx);
    ops.push(lote => lote.set(ref(empresaId, "banco_movimientos", `${linea.id}_${i + 1}`), {
      ...mov, cuentaBancoId: linea.cuentaBancoId, banco: linea.banco, semana: semanaDe(linea.fecha),
      saldo: null, tipo: "pago_tercero",
      cuentaFlujoId: sugerencia?.cuentaFlujoId || "", asignadoPor: sugerencia?.motivo || "",
      excluir: !!sugerencia?.excluir, origen: "nomina", lineaNominaId: linea.id, creadoEn: ahora,
    }));
  });
  ops.push(lote => lote.update(ref(empresaId, "banco_movimientos", linea.id), {
    excluir: true, nominaAbierta: true, nominaPagos: certificado.pagos.length,
  }));
  ops.push(lote => lote.set(ref(empresaId, "banco_importaciones", "i_" + hash(`${linea.id}|nomina`)), {
    tipo: "nomina", banco: linea.banco, cuentaBancoId: linea.cuentaBancoId, archivo: archivo || "",
    desde: linea.fecha, hasta: linea.fecha, nuevos: certificado.pagos.length, repetidos: 0,
    total: certificado.totalEfectuado, usuario: usuario || "", creadoEn: ahora,
  }));
  await escribirEnLotes(ops);
  return { pagos: certificado.pagos.length };
}

// ─── Asignar a cuentas del flujo ──────────────────────────────────────────────
/** Movimientos que todavía no tienen cuenta del flujo (y sí deberían tenerla). */
export async function cargarPorAsignar(empresaId) {
  const snap = await getDocs(query(col(empresaId, "banco_movimientos"),
    where("cuentaFlujoId", "==", ""),
    where("excluir", "==", false)));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
    .filter(m => m.tipo !== "nomina_proveedores" || !m.nominaAbierta)
    .sort((a, b) => b.fecha.localeCompare(a.fecha));
}

/** Agrupa por patrón, para asignar de una vez todo lo que es del mismo origen. */
export function agruparPorPatron(movimientos) {
  const grupos = new Map();
  for (const m of movimientos) {
    const p = patronDe(m);
    const clave = `${p.tipo}|${p.valor}`;
    if (!grupos.has(clave)) grupos.set(clave, { clave, patron: p, movimientos: [], total: 0, tipo: m.tipo });
    const g = grupos.get(clave);
    g.movimientos.push(m);
    g.total += (m.abono || 0) - (m.cargo || 0);
  }
  return [...grupos.values()].sort((a, b) => Math.abs(b.total) - Math.abs(a.total));
}

/**
 * Asigna un grupo de movimientos a una cuenta del flujo (o los marca como "no
 * va al flujo" con cuentaFlujoId = null). Con `recordar`, guarda la regla para
 * que la próxima cartola lo haga sola.
 */
export async function asignarGrupo(empresaId, grupo, cuentaFlujoId, { recordar = true, usuario = "" } = {}) {
  const ahora = new Date().toISOString();
  const ops = grupo.movimientos.map(m => lote => lote.update(ref(empresaId, "banco_movimientos", m.id),
    cuentaFlujoId === null
      ? { excluir: true, asignadoPor: "manual", asignadoEn: ahora }
      : { cuentaFlujoId, asignadoPor: "manual", asignadoEn: ahora }));
  if (recordar) {
    const p = grupo.patron;
    ops.push(lote => lote.set(ref(empresaId, "banco_reglas", "r_" + hash(`${p.tipo}|${p.valor}`)), {
      patronTipo: p.tipo, patron: p.valor, etiquetaPatron: p.etiqueta,
      cuentaFlujoId: cuentaFlujoId ?? "", excluir: cuentaFlujoId === null,
      usuario, creadoEn: ahora,
    }));
  }
  await escribirEnLotes(ops);
}

/** Corrige la cuenta de un solo movimiento. */
export async function asignarMovimiento(empresaId, movimientoId, cuentaFlujoId) {
  await updateDoc(ref(empresaId, "banco_movimientos", movimientoId), {
    cuentaFlujoId, asignadoPor: "manual", asignadoEn: new Date().toISOString(),
  });
}

// ─── Lo real, para el flujo ───────────────────────────────────────────────────
/**
 * Suma lo que realmente pasó en el banco por cuenta del flujo y semana, entre
 * dos lunes (inclusive). Devuelve { [`${cuentaFlujoId}-${semana}`]: monto }
 * con el mismo signo que el flujo: ingresos positivos, egresos negativos.
 */
export async function cargarReales(empresaId, desdeSemana, hastaSemana) {
  const snap = await getDocs(query(col(empresaId, "banco_movimientos"),
    where("semana", ">=", desdeSemana),
    where("semana", "<=", hastaSemana)));
  const reales = {};
  for (const d of snap.docs) {
    const m = d.data();
    if (m.excluir || !m.cuentaFlujoId) continue;
    const k = `${m.cuentaFlujoId}-${m.semana}`;
    reales[k] = (reales[k] || 0) + (m.abono || 0) - (m.cargo || 0);
  }
  return reales;
}

/** Saldos de todas las cuentas bancarias y su total. */
export async function cargarSaldosBancos(empresaId) {
  const snap = await getDocs(col(empresaId, "banco_cuentas"));
  const cuentas = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  const conSaldo = cuentas.filter(c => typeof c.saldoDisponible === "number");
  return {
    cuentas,
    total: conSaldo.reduce((s, c) => s + c.saldoDisponible, 0),
    alMasAntiguo: conSaldo.map(c => c.saldoAl).filter(Boolean).sort()[0] || null,
  };
}

/** Movimientos guardados entre dos fechas ISO (inclusive), para cruces puntuales. */
export async function cargarMovimientos(empresaId, desde, hasta) {
  const snap = await getDocs(query(col(empresaId, "banco_movimientos"),
    where("fecha", ">=", desde),
    where("fecha", "<=", hasta)));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}
