/**
 * herramientas.js — Ejecutores de las herramientas del agente IA.
 *
 * Las descripciones que ve Claude están en api/agente/_herramientas.js; aquí
 * va lo que hace cada una, con el mismo nombre. Se ejecutan en el navegador
 * con el Firestore del usuario, así que las reglas de seguridad aplican igual
 * que si el usuario hiciera la acción a mano.
 *
 * Cada ejecutor devuelve un objeto plano que se envía a Claude como JSON.
 * Para errores esperables (sin permiso, id inexistente) se lanza un Error con
 * un mensaje en español: el agente lo recibe y se lo explica al usuario.
 */

import {
  collection, getDocs, getDoc, doc, query, where, addDoc, updateDoc, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../firebase';
import { fetchTrabajadores, nombreCompletoTrabajador } from '../trabajadores';
import { EJECUTORES_FINANZAS, describirAccionFinanzas } from './herramientasFinanzas';
import { EJECUTORES_EQUIPO } from './herramientasEquipo';

// Herramientas que escriben en la base: el usuario las confirma antes.
export const ACCIONES_QUE_MODIFICAN = new Set([
  'crear_obra', 'actualizar_maquina',
  'crear_cuentas_flujo', 'cargar_partidas_flujo', 'mover_pago_flujo', 'marcar_pagado',
]);

// Secciones internas de Finanzas (FinanzasApp no usa rutas por sección).
const SECCIONES_FINANZAS = ['semana', 'pagos', 'flujo', 'bancos', 'costos', 'activos', 'proveedores', 'deuda', 'obras', 'reportes'];

const MAX_FILAS = 50;

const RUTAS = {
  inicio: '/fleetcore',
  maquinas: '/fleetcore/machines',
  combustible: '/fleetcore/fuel',
  reporte_combustible: '/fleetcore/reporte-combustible',
  reporte_diario: '/fleetcore/reporte-detallado',
  bitacora: '/fleetcore/logs',
  calendario: '/fleetcore/calendar',
  remuneraciones: '/fleetcore/payroll',
  ordenes_compra: '/fleetcore/oc',
  rendiciones: '/fleetcore/rendiciones',
  pasajes: '/fleetcore/pasajes',
  subcontratos: '/fleetcore/subcontratos',
  precio_combustible: '/fleetcore/fuel-price',
  app_operadores: '/workfleet',
  rrhh: '/rrhh',
  reportes: '/reportes',
  finanzas: '/finanzas',
  contabilidad: '/contabilidad',
  documentos: '/documentos',
  selector_apps: '/',
};

const esAdmin = (rol) => rol === 'superadmin' || rol === 'admin_contrato';

const normalizar = (s) => String(s ?? '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[.\-\s]/g, '');

const numero = (v) => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};

const redondear = (n) => Math.round(n * 10) / 10;

function validarRango(desde, hasta) {
  const iso = /^\d{4}-\d{2}-\d{2}$/;
  if (!iso.test(desde || '') || !iso.test(hasta || '')) {
    throw new Error('Las fechas deben venir en formato AAAA-MM-DD.');
  }
  if (desde > hasta) throw new Error('La fecha "desde" es posterior a "hasta".');
}

async function leerColeccion(empresaId, nombre) {
  const snap = await getDocs(collection(db, 'empresas', empresaId, nombre));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// Mapa id → máquina, para poner nombres legibles en los resúmenes.
async function mapaMaquinas(empresaId) {
  const maquinas = await leerColeccion(empresaId, 'machines');
  return new Map(maquinas.map(m => [m.id, m]));
}

const etiquetaMaquina = (m, idRespaldo) => (m
  ? [m.patente || m.code, m.name || [m.marca, m.modelo].filter(Boolean).join(' ')].filter(Boolean).join(' — ')
  : idRespaldo || 'Sin máquina');

function recortar(lista) {
  return lista.length > MAX_FILAS
    ? { filas: lista.slice(0, MAX_FILAS), nota: `Se muestran ${MAX_FILAS} de ${lista.length}. Pide al usuario un filtro más específico.` }
    : { filas: lista };
}

// ─── Ejecutores ───────────────────────────────────────────────

const EJECUTORES = {
  async listar_obras({ incluir_inactivas = false }, { empresaId }) {
    const obras = (await leerColeccion(empresaId, 'projects'))
      .filter(o => !o.deleted && (incluir_inactivas || o.active !== false))
      .map(o => ({ id: o.id, nombre: o.name || o.nombre || '', codigo: o.codigo || '', activa: o.active !== false }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
    return { total: obras.length, ...recortar(obras) };
  },

  async buscar_maquinas({ texto, obra_id, solo_activas = true }, { empresaId }) {
    const [maquinas, obras] = await Promise.all([
      leerColeccion(empresaId, 'machines'),
      leerColeccion(empresaId, 'projects'),
    ]);
    const nombreObra = new Map(obras.map(o => [o.id, o.name || o.nombre || '']));
    const buscado = normalizar(texto);

    const resultado = maquinas
      .filter(m => !m.deleted)
      .filter(m => !solo_activas || m.active !== false)
      .filter(m => !obra_id || m.projectId === obra_id)
      .filter(m => !buscado || [m.patente, m.code, m.name, m.marca, m.modelo, m.type]
        .some(campo => normalizar(campo).includes(buscado)))
      .map(m => ({
        id: m.id,
        patente: m.patente || '',
        codigo: m.code || '',
        nombre: m.name || '',
        tipo: m.type || '',
        marca: m.marca || '',
        modelo: m.modelo || '',
        obra: m.projectId ? (nombreObra.get(m.projectId) || m.projectId) : null,
        activa: m.active !== false,
      }));
    return { total: resultado.length, ...recortar(resultado) };
  },

  async buscar_trabajadores({ texto }, { empresaId }) {
    const buscado = normalizar(texto);
    const resultado = (await fetchTrabajadores(empresaId))
      .filter(t => !t.deleted)
      .filter(t => [nombreCompletoTrabajador(t), t.rut, t.cargo]
        .some(campo => normalizar(campo).includes(buscado)))
      .map(t => ({
        id: t.id,
        nombre: nombreCompletoTrabajador(t),
        rut: t.rut || '',
        cargo: t.cargo || '',
        telefono: t.telefono || t.celular || '',
        email: t.email || t.correo || '',
      }));
    return { total: resultado.length, ...recortar(resultado) };
  },

  async resumen_combustible({ desde, hasta, obra_id, maquina_id }, { empresaId }) {
    validarRango(desde, hasta);
    const [snap, maquinas] = await Promise.all([
      getDocs(query(
        collection(db, 'empresas', empresaId, 'reportes_combustible'),
        where('fecha', '>=', desde),
        where('fecha', '<=', hasta),
      )),
      mapaMaquinas(empresaId),
    ]);

    let litrosEntregados = 0;
    let litrosIngresados = 0;
    let montoIngresos = 0;
    let reportes = 0;
    const porMaquina = new Map();

    snap.docs.forEach(d => {
      const r = d.data();
      if (r.deleted) return;
      if (obra_id && r.projectId !== obra_id) return;
      const maquinaId = r.tipo === 'entrega' ? r.datosEntrega?.machineId : r.datosEntrada?.machineId;
      if (maquina_id && maquinaId !== maquina_id) return;

      reportes++;
      if (r.tipo === 'entrega') {
        const litros = numero(r.cantidadLitros ?? r.datosEntrega?.cantidadLitros);
        litrosEntregados += litros;
        const clave = maquinaId || 'sin_maquina';
        const acum = porMaquina.get(clave) || { litros: 0, cargas: 0 };
        acum.litros += litros;
        acum.cargas++;
        porMaquina.set(clave, acum);
      } else {
        litrosIngresados += numero(r.cantidad ?? r.datosEntrada?.cantidad);
        montoIngresos += numero(r.totalMonto);
      }
    });

    const detalle = [...porMaquina.entries()]
      .map(([id, v]) => ({ maquina: etiquetaMaquina(maquinas.get(id), id), litros: redondear(v.litros), cargas: v.cargas }))
      .sort((a, b) => b.litros - a.litros);

    return {
      desde, hasta, reportes,
      litros_entregados_a_maquinas: redondear(litrosEntregados),
      litros_ingresados: redondear(litrosIngresados),
      monto_ingresos_clp: Math.round(montoIngresos),
      entregas_por_maquina: recortar(detalle),
    };
  },

  async resumen_reportes_diarios({ desde, hasta, obra_id, maquina_id }, { empresaId }) {
    validarRango(desde, hasta);
    const [snap, maquinas] = await Promise.all([
      getDocs(query(
        collection(db, 'empresas', empresaId, 'reportes_detallados'),
        where('fecha', '>=', desde),
        where('fecha', '<=', hasta),
      )),
      mapaMaquinas(empresaId),
    ]);

    const reportes = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(r => !r.deleted)
      .filter(r => !obra_id || r.projectId === obra_id)
      .filter(r => !maquina_id || r.machineId === maquina_id)
      .sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));

    const porMaquina = new Map();
    reportes.forEach(r => {
      const horas = Math.max(0, numero(r.horometroFinal) - numero(r.horometroInicial));
      const km = Math.max(0, numero(r.kilometrajeFinal) - numero(r.kilometrajeInicial));
      const acum = porMaquina.get(r.machineId) || { horas: 0, km: 0, reportes: 0 };
      acum.horas += horas;
      acum.km += km;
      acum.reportes++;
      porMaquina.set(r.machineId, acum);
    });

    return {
      desde, hasta, total_reportes: reportes.length,
      por_maquina: recortar([...porMaquina.entries()]
        .map(([id, v]) => ({ maquina: etiquetaMaquina(maquinas.get(id), id), horas: redondear(v.horas), km: redondear(v.km), reportes: v.reportes }))
        .sort((a, b) => b.horas - a.horas)),
      ultimos_reportes: reportes.slice(0, 15).map(r => ({
        fecha: r.fecha,
        numero: r.numeroReporte || '',
        maquina: etiquetaMaquina(maquinas.get(r.machineId), r.machinePatente || r.machineId),
        operador: r.operador || '',
        horometro: [r.horometroInicial, r.horometroFinal].filter(v => v !== '' && v != null).join(' → '),
        estado_maquina: r.estadoMaquina || '',
        observaciones: String(r.observaciones || '').slice(0, 200),
      })),
    };
  },

  async navegar_a({ destino, seccion_finanzas }, { navigate }) {
    const ruta = RUTAS[destino];
    if (!ruta) throw new Error(`No conozco la pantalla "${destino}".`);
    if (ruta.startsWith('/fleetcore')) localStorage.setItem('selectedApp', 'fleetcore');
    if (destino === 'finanzas' && SECCIONES_FINANZAS.includes(seccion_finanzas)) {
      // FinanzasApp la lee al montarse, o la recibe por evento si ya está abierta.
      try { sessionStorage.setItem('agenteIA:finanzasVista', seccion_finanzas); } catch { /* sin almacenamiento */ }
      setTimeout(() => window.dispatchEvent(new CustomEvent('agente:finanzas', { detail: seccion_finanzas })), 300);
    }
    navigate(ruta);
    return { ok: true, abierta: seccion_finanzas ? `${destino} / ${seccion_finanzas}` : destino };
  },

  async crear_obra({ nombre, codigo = '' }, { empresaId, rol }) {
    if (!esAdmin(rol)) throw new Error('Tu rol no permite crear obras.');
    const limpio = String(nombre || '').trim();
    if (!limpio) throw new Error('Falta el nombre de la obra.');
    const ref = await addDoc(collection(db, 'empresas', empresaId, 'projects'), {
      name: limpio,
      codigo: String(codigo).trim(),
      // active: true — sin este campo Oficina Técnica no ve el proyecto
      active: true,
      createdAt: serverTimestamp(),
      creadoPorAgente: true,
    });
    return { ok: true, obra_id: ref.id, nombre: limpio };
  },

  async actualizar_maquina({ maquina_id, activa, obra_id }, { empresaId, rol }) {
    if (!esAdmin(rol)) throw new Error('Tu rol no permite modificar máquinas.');
    const ref = doc(db, 'empresas', empresaId, 'machines', maquina_id);
    const actual = await getDoc(ref);
    if (!actual.exists()) throw new Error('No existe una máquina con ese id.');

    const cambios = {};
    if (typeof activa === 'boolean') cambios.active = activa;
    if (typeof obra_id === 'string') {
      if (obra_id) {
        const obra = await getDoc(doc(db, 'empresas', empresaId, 'projects', obra_id));
        if (!obra.exists()) throw new Error('No existe una obra con ese id.');
      }
      cambios.projectId = obra_id || null;
    }
    if (!Object.keys(cambios).length) throw new Error('No se indicó ningún cambio.');

    await updateDoc(ref, { ...cambios, updatedAt: serverTimestamp() });
    return { ok: true, maquina: etiquetaMaquina(actual.data(), maquina_id), cambios };
  },

  ...EJECUTORES_FINANZAS,
  ...EJECUTORES_EQUIPO,
};

// Se manda al servidor al empezar cada conversación: solo se ofrecen a Claude
// las herramientas que esta versión de la app sabe ejecutar.
export const NOMBRES_HERRAMIENTAS = Object.keys(EJECUTORES).sort();

/** Ejecuta una herramienta y devuelve su resultado listo para Claude. */
export async function ejecutarHerramienta(nombre, input, ctx) {
  const ejecutor = EJECUTORES[nombre];
  if (!ejecutor) throw new Error(`La versión de la app que tiene abierta el usuario no incluye "${nombre}". Pídele recargar la página.`);
  if (!ctx.empresaId) throw new Error('No hay una empresa activa.');
  try {
    return await ejecutor(input || {}, ctx);
  } catch (err) {
    if (err?.code === 'permission-denied') {
      throw new Error('Firestore rechazó la operación: tu rol no tiene permiso para esto.');
    }
    throw err;
  }
}

/** Texto corto para la tarjeta de confirmación de una acción. */
export function describirAccion(nombre, input = {}) {
  if (nombre === 'crear_obra') {
    return `Crear la obra "${input.nombre}"${input.codigo ? ` (código ${input.codigo})` : ''}.`;
  }
  if (nombre === 'actualizar_maquina') {
    const partes = [];
    if (typeof input.activa === 'boolean') partes.push(input.activa ? 'marcarla como activa' : 'marcarla como inactiva');
    if (typeof input.obra_id === 'string') partes.push(input.obra_id ? 'asignarla a otra obra' : 'dejarla sin obra');
    return `Modificar la máquina: ${partes.join(' y ') || 'sin cambios'}.`;
  }
  return describirAccionFinanzas(nombre, input) || `Ejecutar ${nombre}.`;
}
