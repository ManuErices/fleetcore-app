/**
 * src/lib/finanzas/cajaDatos.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Firestore para la pantalla "La semana". Lee los mismos datos del flujo de
 * caja y de Bancos; guarda solo tres cosas nuevas:
 *  · flujo_config/colchon          { valor }   colchón mínimo de caja.
 *  · flujo_cuentas/{id}.prioridad  "ineludible" | "operar" | "conversable".
 *  · finanzas_informes/{lunes}     { nota }    la nota del informe semanal.
 */
import { collection, doc, getDoc, getDocs, setDoc, updateDoc } from "firebase/firestore";
import { db } from "../firebase";
import { cargarReales, cargarSaldosBancos } from "../banco/importacion.js";
import { COLCHON_POR_DEFECTO, semanasDesde, lunesDe, claveDia } from "./caja.js";

const col = (empresaId, nombre) => collection(db, "empresas", empresaId, nombre);
const ref = (empresaId, nombre, id) => doc(db, "empresas", empresaId, nombre, id);

/**
 * Todo lo que necesita la proyección. El saldo de partida sale de las
 * cartolas (Bancos) si hay; si no, del saldo anotado a mano en el flujo.
 */
export async function cargarDatosCaja(empresaId, hoy = new Date()) {
  const semanas = semanasDesde(hoy);
  const desdeReales = new Date(lunesDe(hoy)); desdeReales.setDate(desdeReales.getDate() - 28);

  const [snapC, snapP, snapPaid, snapCfg] = await Promise.all([
    getDocs(col(empresaId, "flujo_cuentas")),
    getDocs(col(empresaId, "flujo_pagos")),
    getDocs(col(empresaId, "flujo_pagados")),
    getDocs(col(empresaId, "flujo_config")),
  ]);
  const cuentas = snapC.docs.map(d => ({ id: d.id, ...d.data() }));
  const pagos = {}; snapP.docs.forEach(d => { const v = d.data().valor; if (v) pagos[d.id] = v; });
  const pagados = {}; snapPaid.docs.forEach(d => { pagados[d.id] = true; });
  let saldoManual = 0, colchon = COLCHON_POR_DEFECTO;
  snapCfg.docs.forEach(d => {
    if (d.id === "saldo_banco") saldoManual = d.data().valor || 0;
    if (d.id === "colchon" && typeof d.data().valor === "number") colchon = d.data().valor;
  });

  // Lo del banco va aparte: si aún no hay cartolas, todo sigue con el saldo manual.
  let reales = {}, bancos = null;
  try {
    const [r, b] = await Promise.all([
      cargarReales(empresaId, claveDia(desdeReales), semanas[semanas.length - 1].key),
      cargarSaldosBancos(empresaId),
    ]);
    reales = r; bancos = b.cuentas.length ? b : null;
  } catch (e) { console.warn("Sin datos del banco:", e); }

  return {
    cuentas, pagos, pagados, reales, semanas, colchon, bancos, saldoManual,
    saldoInicial: bancos ? bancos.total : saldoManual,
    fuenteSaldo: bancos ? "bancos" : (saldoManual ? "manual" : "ninguna"),
  };
}

export async function guardarColchon(empresaId, valor) {
  await setDoc(ref(empresaId, "flujo_config", "colchon"), { valor, actualizadoEn: new Date().toISOString() });
}

export async function guardarPrioridad(empresaId, cuentaId, prioridad) {
  await updateDoc(ref(empresaId, "flujo_cuentas", cuentaId), { prioridad });
}

export async function cargarNotaInforme(empresaId, lunes) {
  const snap = await getDoc(ref(empresaId, "finanzas_informes", lunes));
  return snap.exists() ? (snap.data().nota || "") : "";
}

export async function guardarNotaInforme(empresaId, lunes, nota, usuario = "") {
  await setDoc(ref(empresaId, "finanzas_informes", lunes), { nota, usuario, actualizadoEn: new Date().toISOString() }, { merge: true });
}
