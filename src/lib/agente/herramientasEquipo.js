/**
 * herramientasEquipo.js — Herramientas transversales del agente:
 *   · resumen_del_dia: lo que cada persona debería mirar hoy.
 *   · consultar_datos: lectura general de colecciones permitidas, para
 *     preguntas que ninguna herramienta específica cubre.
 *   · recordar / olvidar: memoria compartida del equipo (agente_memoria),
 *     que el agente recibe al empezar cada conversación.
 *
 * Todo pasa por el Firestore del usuario: si su rol no puede leer una
 * colección, la sección correspondiente vuelve como "sin acceso".
 */

import {
  collection, doc, getDocs, addDoc, deleteDoc, query, where, orderBy, limit,
} from 'firebase/firestore';
import { db, auth } from '../firebase';
import { cargarDatosCaja } from '../finanzas/cajaDatos';
import { proyectar, partidasSinCerrar } from '../finanzas/caja';

const MAX_MEMORIA = 40;

const hoyISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const sumarDias = (iso, n) => {
  const [a, m, d] = iso.split('-').map(Number);
  const f = new Date(a, m - 1, d + n);
  return `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}-${String(f.getDate()).padStart(2, '0')}`;
};

// Colecciones que consultar_datos puede leer, con su campo de fecha si tiene.
// Quedan fuera las de remuneraciones y contratos: datos personales que se
// consultan en RRHH, no por chat.
export const COLECCIONES_CONSULTABLES = {
  projects: null,
  machines: null,
  reportes_combustible: 'fecha',
  reportes_detallados: 'fecha',
  deuda_proveedores: 'fechaVencimiento',
  finanzas_proveedores: null,
  finanzas_activos: null,
  flujo_cuentas: null,
  subcontratos: null,
  rendiciones: 'fecha',
  solicitudes_pasajes: 'fecha',
  purchaseOrders: 'fecha',
  workOrders: null,
  maintenancePlans: null,
  centros_costo: null,
  guias_despacho: 'fecha',
  equipos_surtidores: null,
  estaciones_combustible: null,
  empresas_combustible: null,
  ausencias: 'fechaInicio',
  vacaciones: 'fechaInicio',
  licencias: 'fechaInicio',
};

const CAMPOS_PESADOS = /firma|foto|imagen|image|base64|signature|thumbnail|pdf/i;

/** Deja un documento en un tamaño razonable para mandarlo al modelo. */
function aligerar(valor, profundidad = 0) {
  if (valor == null) return valor;
  if (typeof valor === 'string') {
    if (valor.startsWith('data:')) return '[archivo]';
    return valor.length > 300 ? `${valor.slice(0, 300)}…` : valor;
  }
  if (typeof valor !== 'object') return valor;
  if (typeof valor.toDate === 'function') return valor.toDate().toISOString();
  if (profundidad > 2) return '[…]';
  if (Array.isArray(valor)) {
    const recorte = valor.slice(0, 10).map(v => aligerar(v, profundidad + 1));
    return valor.length > 10 ? [...recorte, `…y ${valor.length - 10} más`] : recorte;
  }
  const out = {};
  for (const [k, v] of Object.entries(valor)) {
    if (CAMPOS_PESADOS.test(k)) continue;
    out[k] = aligerar(v, profundidad + 1);
  }
  return out;
}

const normalizar = (s) => String(s ?? '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

async function seccion(fn) {
  try {
    return await fn();
  } catch (err) {
    return { sin_acceso: err?.code === 'permission-denied' ? 'Tu rol no puede ver esto.' : (err?.message || 'No se pudo leer.') };
  }
}

const VENCIMIENTOS = {
  vencPermisoCirculacion: 'permiso de circulación',
  vencSeguro: 'seguro',
  vencRevisionTecnica: 'revisión técnica',
  vencSoapCivil: 'SOAP',
};

/** Memoria compartida del equipo, la más reciente primero. */
export async function cargarMemoria(empresaId) {
  try {
    const snap = await getDocs(query(
      collection(db, 'empresas', empresaId, 'agente_memoria'),
      orderBy('creadoEn', 'desc'),
      limit(MAX_MEMORIA),
    ));
    return snap.docs.map(d => ({ id: d.id, texto: d.data().texto, autor: d.data().autor || '' }));
  } catch {
    return []; // reglas aún no desplegadas o rol sin acceso: el agente funciona sin memoria
  }
}

export const EJECUTORES_EQUIPO = {
  async resumen_del_dia(_input, { empresaId }) {
    const hoy = hoyISO();
    const en30 = sumarDias(hoy, 30);

    const [documentos, combustible, reportes, caja, deuda] = await Promise.all([
      seccion(async () => {
        const snap = await getDocs(collection(db, 'empresas', empresaId, 'machines'));
        const alertas = [];
        snap.docs.forEach(d => {
          const m = d.data();
          if (m.deleted || m.active === false) return;
          for (const [campo, nombre] of Object.entries(VENCIMIENTOS)) {
            const f = String(m[campo] || '').slice(0, 10);
            if (!/^\d{4}-\d{2}-\d{2}$/.test(f) || f > en30) continue;
            alertas.push({ maquina: m.patente || m.code || m.name, documento: nombre, vence: f, vencido: f < hoy });
          }
        });
        alertas.sort((a, b) => a.vence.localeCompare(b.vence));
        return { vencidos: alertas.filter(a => a.vencido).length, proximos_30_dias: alertas.filter(a => !a.vencido).length, detalle: alertas.slice(0, 15) };
      }),
      seccion(async () => {
        const snap = await getDocs(query(collection(db, 'empresas', empresaId, 'reportes_combustible'), where('fecha', '==', hoy)));
        const docs = snap.docs.map(d => d.data()).filter(r => !r.deleted);
        const litros = docs.filter(r => r.tipo === 'entrega').reduce((s, r) => s + (Number(r.cantidadLitros) || 0), 0);
        return { reportes_hoy: docs.length, litros_entregados_hoy: Math.round(litros) };
      }),
      seccion(async () => {
        const [snapR, snapM] = await Promise.all([
          getDocs(query(collection(db, 'empresas', empresaId, 'reportes_detallados'), where('fecha', '==', hoy))),
          getDocs(collection(db, 'empresas', empresaId, 'machines')),
        ]);
        const conReporte = new Set(snapR.docs.map(d => d.data()).filter(r => !r.deleted).map(r => r.machineId));
        const activas = snapM.docs.filter(d => !d.data().deleted && d.data().active !== false);
        const sinReporte = activas.filter(d => !conReporte.has(d.id)).map(d => d.data().patente || d.data().code || d.data().name);
        return { reportes_diarios_hoy: conReporte.size, maquinas_activas: activas.length, maquinas_sin_reporte_hoy: sinReporte.slice(0, 20), total_sin_reporte: sinReporte.length };
      }),
      seccion(async () => {
        const datos = await cargarDatosCaja(empresaId, new Date());
        const proy = proyectar({ ...datos, hoy: new Date() });
        const s1 = proy.semanas[0];
        return {
          saldo_inicial: Math.round(proy.saldoInicial),
          egresos_pendientes_esta_semana: Math.round(-s1.egresos),
          ingresos_esperados_esta_semana: Math.round(s1.ingresos),
          semana_mas_baja: proy.semanaMinima && `${proy.semanaMinima.etiqueta} (${proy.semanaMinima.rango}) con $${Math.round(proy.minimo).toLocaleString('es-CL')}`,
          deficit_bajo_colchon: Math.round(proy.deficit),
          partidas_pasadas_sin_cerrar: partidasSinCerrar({ ...datos, hoy: new Date() }).length,
        };
      }),
      seccion(async () => {
        const snap = await getDocs(collection(db, 'empresas', empresaId, 'deuda_proveedores'));
        let vencida = 0;
        const acreedores = new Set();
        snap.docs.forEach(d => {
          const x = d.data();
          if (x.estado === 'vencido' && x.saldoPendiente > 0) { vencida += x.saldoPendiente; acreedores.add(x.proveedorNombre); }
        });
        return { deuda_vencida: Math.round(vencida), acreedores_con_deuda_vencida: acreedores.size };
      }),
    ]);

    return { fecha: hoy, documentos_maquinas: documentos, combustible, reportes_diarios: reportes, caja, deuda };
  },

  async consultar_datos({ coleccion, desde, hasta, texto, limite = 30 }, { empresaId }) {
    if (!(coleccion in COLECCIONES_CONSULTABLES)) {
      throw new Error(`No puedo consultar "${coleccion}". Colecciones disponibles: ${Object.keys(COLECCIONES_CONSULTABLES).join(', ')}.`);
    }
    const campoFecha = COLECCIONES_CONSULTABLES[coleccion];
    const col = collection(db, 'empresas', empresaId, coleccion);
    const filtros = [];
    if (campoFecha && desde) filtros.push(where(campoFecha, '>=', desde));
    if (campoFecha && hasta) filtros.push(where(campoFecha, '<=', hasta));
    const snap = await getDocs(filtros.length ? query(col, ...filtros) : col);

    const buscado = normalizar(texto);
    const docs = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(d => !d.deleted)
      .filter(d => !buscado || normalizar(JSON.stringify(aligerar(d))).includes(buscado));

    const tope = Math.min(Math.max(1, Number(limite) || 30), 100);
    return {
      coleccion,
      total: docs.length,
      mostrados: Math.min(tope, docs.length),
      documentos: docs.slice(0, tope).map(d => aligerar(d)),
    };
  },

  async recordar({ texto }, { empresaId }) {
    const limpio = String(texto || '').trim().slice(0, 500);
    if (!limpio) throw new Error('No hay nada que recordar.');
    const r = await addDoc(collection(db, 'empresas', empresaId, 'agente_memoria'), {
      texto: limpio,
      autor: auth.currentUser?.email || '',
      creadoEn: new Date().toISOString(),
    });
    return { ok: true, id: r.id, nota: 'Queda disponible desde la próxima conversación de cualquier persona del equipo.' };
  },

  async olvidar({ id }, { empresaId }) {
    await deleteDoc(doc(db, 'empresas', empresaId, 'agente_memoria', id));
    return { ok: true };
  },
};
