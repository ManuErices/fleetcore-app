/**
 * herramientasFinanzas.js — Herramientas del agente sobre el flujo de caja.
 *
 * Reutilizan la misma lógica de "La semana" (src/lib/finanzas/caja.js), así
 * que lo que el agente dice de la caja coincide con lo que muestra la
 * pantalla: mismo saldo de partida, mismas recurrentes, mismo colchón.
 *
 * Convención del flujo (FinanzasFlujoCaja): un monto por cuenta y semana en
 * flujo_pagos/{cuentaId}-{lunes}, ingresos positivos y egresos negativos.
 */

import {
  collection, doc, getDoc, getDocs, setDoc, deleteDoc, addDoc,
} from 'firebase/firestore';
import { db } from '../firebase';
import { cargarDatosCaja } from '../finanzas/cajaDatos';
import {
  proyectar, simularPago, proponerMovimientos, partidasSinCerrar, lunesDe, claveDia, prioridadDe, PRIORIDADES,
} from '../finanzas/caja';
import {
  ESTADOS_PROPUESTA, esEditable, datosConPropuesta, listarCambios, compararProyecciones,
} from '../finanzas/propuestas';
import {
  listarPropuestas, cargarPropuesta, crearPropuesta, proponerPartida, proponerMovimiento as proponerMovimientoEnPropuesta,
  agregarCuentaNueva, proponerColchon, cambiarEstado, aplicarPropuesta,
} from '../finanzas/propuestasDatos';

const MAX_PARTIDAS_LOTE = 60;
const MAX_CUENTAS_LOTE = 30;

const ahora = () => new Date().toISOString();
const ref = (empresaId, col, id) => doc(db, 'empresas', empresaId, col, id);

const normalizar = (s) => String(s ?? '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Cualquier fecha AAAA-MM-DD → el lunes de su semana, en AAAA-MM-DD. */
export function lunesDeTexto(fecha) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha || '')) throw new Error(`Fecha inválida: "${fecha}". Usa AAAA-MM-DD.`);
  const [a, m, d] = fecha.split('-').map(Number);
  return claveDia(lunesDe(new Date(a, m - 1, d)));
}

async function leerCuentas(empresaId) {
  const snap = await getDocs(collection(db, 'empresas', empresaId, 'flujo_cuentas'));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

const resumenSemana = (f) => ({
  semana: f.etiqueta,
  lunes: f.key,
  rango: f.rango,
  ingresos: Math.round(f.ingresos),
  egresos: Math.round(f.egresos),
  saldo_al_cerrar: Math.round(f.saldoFin),
  bajo_colchon: f.bajoColchon,
});

async function proyeccion(empresaId) {
  const hoy = new Date();
  const datos = await cargarDatosCaja(empresaId, hoy);
  const proy = proyectar({ ...datos, hoy });
  return { datos, proy, hoy };
}

function semanaPorNumero(proy, numero) {
  const n = Number(numero) || 1;
  const f = proy.semanas[n - 1];
  if (!f) throw new Error(`La proyección tiene ${proy.semanas.length} semanas; pide entre 1 y ${proy.semanas.length}.`);
  return f;
}

const esAdmin = (rol) => rol === 'superadmin' || rol === 'admin_contrato';

async function compararPropuesta(empresaId, id) {
  const hoy = new Date();
  const [datos, propuesta] = await Promise.all([cargarDatosCaja(empresaId, hoy), cargarPropuesta(empresaId, id)]);
  const original = proyectar({ ...datos, hoy });
  const conPropuesta = proyectar({ ...datosConPropuesta(datos, propuesta), hoy });
  return { datos, propuesta, cmp: compararProyecciones(original, conPropuesta) };
}

export const EJECUTORES_FINANZAS = {
  // ── Propuestas: cambios que no tocan el flujo hasta aprobarse ──
  async listar_propuestas_flujo(_input, { empresaId }) {
    const lista = await listarPropuestas(empresaId);
    return {
      propuestas: lista.slice(0, 30).map(p => ({
        id: p.id, nombre: p.nombre, estado: ESTADOS_PROPUESTA[p.estado]?.label || p.estado,
        cambios: Object.keys(p.cambios?.pagos || {}).length, creada_por: p.creadaPor, actualizada: String(p.actualizadaEn || '').slice(0, 10),
      })),
    };
  },

  async crear_propuesta_flujo({ nombre, motivo }, { empresaId }) {
    const id = await crearPropuesta(empresaId, { nombre, motivo });
    return { ok: true, propuesta_id: id, nota: 'Borrador creado. El flujo original no cambia hasta que un administrador apruebe.' };
  },

  async editar_propuesta_flujo({ propuesta_id, cuentas_nuevas = [], partidas = [], movimientos = [], colchon }, { empresaId }) {
    const hoy = new Date();
    const datos = await cargarDatosCaja(empresaId, hoy);
    let propuesta = await cargarPropuesta(empresaId, propuesta_id);
    if (!esEditable(propuesta)) throw new Error('Esa propuesta ya está cerrada; crea una nueva.');
    const recargar = async () => { propuesta = await cargarPropuesta(empresaId, propuesta_id); };

    const refs = {};
    for (const c of cuentas_nuevas) {
      refs[c.ref || c.nombre] = await agregarCuentaNueva(empresaId, propuesta, {
        nombre: c.nombre, categoria: c.categoria, subcategoria: c.subcategoria, obra: c.obra,
        montoRecurrente: c.monto_recurrente, frecuencia: c.frecuencia,
      });
      await recargar();
    }
    const hechas = [];
    for (const p of partidas) {
      const cuentaId = p.cuenta_id || refs[p.ref_cuenta_nueva];
      if (!cuentaId) throw new Error(`Falta la cuenta de la partida "${p.etiqueta || ''}".`);
      const r = await proponerPartida(empresaId, propuesta, datos, { cuentaId, lunes: lunesDeTexto(p.semana), monto: p.monto, modo: p.modo });
      hechas.push({ cuenta: p.etiqueta || cuentaId, semana: r.key.slice(-10), original: r.original, propuesto: r.valor });
      await recargar();
    }
    for (const m of movimientos) {
      const r = await proponerMovimientoEnPropuesta(empresaId, propuesta, datos, { cuentaId: m.cuenta_id, desde: lunesDeTexto(m.desde), hasta: lunesDeTexto(m.hasta) });
      hechas.push({ cuenta: m.etiqueta || m.cuenta_id, movido: `${r.desde} → ${r.hasta}`, monto: r.monto });
      await recargar();
    }
    if (typeof colchon === 'number') await proponerColchon(empresaId, propuesta, colchon);

    const { cmp } = await compararPropuesta(empresaId, propuesta_id);
    return {
      ok: true, cambios_anotados: hechas, cuentas_nuevas: Object.keys(refs),
      efecto: {
        semana_mas_baja: { original: Math.round(cmp.minimoOriginal), propuesta: Math.round(cmp.minimoPropuesta) },
        semanas_bajo_colchon: { original: cmp.semanasBajoOriginal, propuesta: cmp.semanasBajoPropuesta },
      },
    };
  },

  async comparar_propuesta_flujo({ propuesta_id }, { empresaId }) {
    const { datos, propuesta, cmp } = await compararPropuesta(empresaId, propuesta_id);
    const cambios = listarCambios(datos, propuesta);
    return {
      nombre: propuesta.nombre,
      estado: ESTADOS_PROPUESTA[propuesta.estado]?.label || propuesta.estado,
      motivo: propuesta.motivo || '',
      resumen: {
        semana_mas_baja: { original: Math.round(cmp.minimoOriginal), propuesta: Math.round(cmp.minimoPropuesta) },
        falta_para_colchon: { original: Math.round(cmp.deficitOriginal), propuesta: Math.round(cmp.deficitPropuesta) },
        disponible_sobre_colchon: { original: Math.round(cmp.disponibleOriginal), propuesta: Math.round(cmp.disponiblePropuesta) },
        semanas_bajo_colchon: { original: cmp.semanasBajoOriginal, propuesta: cmp.semanasBajoPropuesta },
        caja_en_13_semanas: { original: Math.round(cmp.cierreOriginal), propuesta: Math.round(cmp.cierrePropuesta) },
      },
      colchon_propuesto: propuesta.cambios?.colchon ?? null,
      cambios: cambios.slice(0, 40).map(c => ({
        cuenta: c.cuenta, nueva: c.cuentaNueva, semana: c.semana, original: c.original, propuesto: c.propuesto, conflicto: c.conflicto,
      })),
      conflictos: cambios.filter(c => c.conflicto).length,
      semanas: cmp.semanas.map(x => ({ semana: x.etiqueta, original: Math.round(x.original), propuesta: Math.round(x.propuesta) })),
    };
  },

  async enviar_propuesta_a_revision({ propuesta_id }, { empresaId }) {
    const propuesta = await cargarPropuesta(empresaId, propuesta_id);
    if (propuesta.estado !== 'borrador') throw new Error('Solo un borrador se envía a revisión.');
    await cambiarEstado(empresaId, propuesta, 'en_revision');
    return { ok: true, nota: 'Queda esperando la aprobación de un administrador.' };
  },

  async aprobar_propuesta_flujo({ propuesta_id, comentario = '' }, { empresaId, rol }) {
    if (!esAdmin(rol)) throw new Error('Solo un administrador puede aprobar propuestas del flujo de caja.');
    const propuesta = await cargarPropuesta(empresaId, propuesta_id);
    const r = await aplicarPropuesta(empresaId, propuesta, comentario);
    return { ok: true, aplicada: r };
  },

  async rechazar_propuesta_flujo({ propuesta_id, comentario = '' }, { empresaId, rol }) {
    if (!esAdmin(rol)) throw new Error('Solo un administrador puede rechazar propuestas del flujo de caja.');
    const propuesta = await cargarPropuesta(empresaId, propuesta_id);
    await cambiarEstado(empresaId, propuesta, 'rechazada', comentario);
    return { ok: true };
  },

  // ── Flujo original ──
  async proyectar_caja(_input, { empresaId }) {
    const { datos, proy, hoy } = await proyeccion(empresaId);
    const mov = proponerMovimientos(proy);
    const sinCerrar = partidasSinCerrar({ ...datos, hoy });
    return {
      saldo_inicial: Math.round(proy.saldoInicial),
      fuente_saldo: datos.fuenteSaldo === 'bancos'
        ? 'cartolas bancarias importadas'
        : datos.fuenteSaldo === 'manual' ? 'saldo anotado a mano en el flujo' : 'sin saldo registrado (parte de $0)',
      colchon: proy.colchon,
      semana_mas_baja: proy.semanaMinima && resumenSemana(proy.semanaMinima),
      disponible_sobre_colchon: Math.round(proy.disponible),
      deficit_bajo_colchon: Math.round(proy.deficit),
      semanas: proy.semanas.map(resumenSemana),
      propuesta_para_cubrir_deficit: mov && {
        primera_semana_bajo_colchon: mov.semana.etiqueta,
        falta: Math.round(mov.falta),
        mover_pagos_conversables_a: mov.destino ? `${mov.destino.etiqueta} (${mov.destino.rango})` : null,
        pagos_sugeridos: mov.elegidos.map(p => ({
          cuenta_id: p.cuenta.id, cuenta: p.cuenta.nombre, monto: Math.round(-p.pendiente), semana: p.semana.etiqueta,
        })),
        alcanza_moviendo: mov.alcanza,
      },
      partidas_pasadas_sin_cerrar: {
        cantidad: sinCerrar.length,
        ejemplos: sinCerrar.slice(0, 8).map(p => ({ cuenta: p.cuenta.nombre, semana: p.semana, monto: p.monto })),
      },
    };
  },

  async detalle_semana_caja({ semana = 1 }, { empresaId }) {
    const { proy } = await proyeccion(empresaId);
    const f = semanaPorNumero(proy, semana);
    return {
      ...resumenSemana(f),
      saldo_al_empezar: Math.round(f.saldoInicio),
      partidas: f.partidas
        .sort((a, b) => Math.abs(b.monto) - Math.abs(a.monto))
        .map(p => ({
          cuenta_id: p.cuenta.id,
          cuenta: p.cuenta.nombre,
          tipo: p.esIngreso ? 'ingreso' : 'egreso',
          subcategoria: p.cuenta.subcategoria || '',
          prioridad: PRIORIDADES[p.prioridad]?.label || p.prioridad,
          monto: p.monto,
          pendiente: p.pendiente,
          pagado: p.pagado,
          automatica_por_recurrencia: p.recurrente,
        })),
    };
  },

  async simular_pago({ monto, semana = 1 }, { empresaId }) {
    const n = Math.abs(Number(monto) || 0);
    if (!n) throw new Error('Indica un monto mayor que cero.');
    const { proy } = await proyeccion(empresaId);
    semanaPorNumero(proy, semana);
    const r = simularPago(proy, n, Number(semana) - 1);
    return {
      monto: n,
      semana_del_pago: Number(semana),
      alcanza_sin_bajar_del_colchon: r.alcanza,
      saldo_minimo_que_quedaria: Math.round(r.quedaMin),
      semana_que_queda_mas_baja: r.semanaQueBaja && `${r.semanaQueBaja.etiqueta} (${r.semanaQueBaja.rango})`,
      se_podria_pagar_desde: r.desde ? `${r.desde.etiqueta} (${r.desde.rango})` : null,
      aviso: r.yaBajoAntes ? `${r.yaBajoAntes.etiqueta} ya está bajo el colchón, con o sin este pago.` : null,
      colchon: proy.colchon,
    };
  },

  async listar_cuentas_flujo({ texto, categoria }, { empresaId }) {
    const buscado = normalizar(texto);
    const cuentas = (await leerCuentas(empresaId))
      .filter(c => !categoria || c.categoria === categoria)
      .filter(c => !buscado || [c.nombre, c.subcategoria, c.detalle, c.proyectoId, c.cliente]
        .some(v => normalizar(v).includes(buscado)))
      .sort((a, b) => String(a.nombre).localeCompare(String(b.nombre), 'es'))
      .map(c => ({
        id: c.id,
        nombre: c.nombre,
        categoria: c.categoria,
        subcategoria: c.subcategoria || '',
        obra: c.proyectoId || '',
        recurrente: c.recurrente ? `${c.frecuenciaRecurrente || 'mensual'} por ${c.montoRecurrente}` : null,
        prioridad: PRIORIDADES[prioridadDe(c)]?.label,
      }));
    return { total: cuentas.length, cuentas: cuentas.slice(0, 80) };
  },

  async crear_cuentas_flujo({ cuentas = [] }, { empresaId }) {
    if (!cuentas.length) throw new Error('No hay cuentas para crear.');
    if (cuentas.length > MAX_CUENTAS_LOTE) throw new Error(`Máximo ${MAX_CUENTAS_LOTE} cuentas por vez.`);
    const existentes = await leerCuentas(empresaId);
    const nombres = new Set(existentes.map(c => `${c.categoria}|${normalizar(c.nombre).trim()}`));

    const creadas = [];
    const omitidas = [];
    for (const c of cuentas) {
      const nombre = String(c.nombre || '').trim();
      const categoria = c.categoria === 'INGRESOS' ? 'INGRESOS' : 'EGRESOS';
      if (!nombre) continue;
      if (nombres.has(`${categoria}|${normalizar(nombre)}`)) { omitidas.push(nombre); continue; }
      const datos = {
        categoria,
        nombre,
        subcategoria: String(c.subcategoria || (categoria === 'INGRESOS' ? 'VENTAS' : 'OPERACIONAL')).trim().toUpperCase(),
        detalle: c.detalle || '',
        proyectoId: c.obra || '',
        cliente: c.cliente || '',
        presupuestoMensual: '',
        recurrente: !!c.monto_recurrente,
        frecuenciaRecurrente: c.frecuencia || 'mensual',
        montoRecurrente: c.monto_recurrente ? String(Math.abs(Math.round(c.monto_recurrente))) : '',
        proveedorId: '',
        creadoEn: ahora(),
        creadoPorAgente: true,
      };
      const r = await addDoc(collection(db, 'empresas', empresaId, 'flujo_cuentas'), datos);
      nombres.add(`${categoria}|${normalizar(nombre)}`);
      creadas.push({ id: r.id, nombre, categoria });
    }
    return { creadas, omitidas_por_existir: omitidas };
  },

  async cargar_partidas_flujo({ partidas = [], modo = 'reemplazar' }, { empresaId }) {
    if (!partidas.length) throw new Error('No hay partidas para cargar.');
    if (partidas.length > MAX_PARTIDAS_LOTE) throw new Error(`Máximo ${MAX_PARTIDAS_LOTE} partidas por vez.`);
    const cuentas = new Map((await leerCuentas(empresaId)).map(c => [c.id, c]));

    const resultado = [];
    for (const p of partidas) {
      const cuenta = cuentas.get(p.cuenta_id);
      if (!cuenta) throw new Error(`No existe la cuenta ${p.cuenta_id}. Usa listar_cuentas_flujo.`);
      const lunes = lunesDeTexto(p.semana);
      const key = `${cuenta.id}-${lunes}`;
      const signo = cuenta.categoria === 'INGRESOS' ? 1 : -1;
      let valor = signo * Math.abs(Math.round(Number(p.monto) || 0));
      if (modo === 'sumar') {
        const actual = await getDoc(ref(empresaId, 'flujo_pagos', key));
        valor += actual.exists() ? (actual.data().valor || 0) : 0;
      }
      await setDoc(ref(empresaId, 'flujo_pagos', key), { valor, updatedAt: ahora() });
      resultado.push({ cuenta: cuenta.nombre, semana_lunes: lunes, valor });
    }
    return { ok: true, cargadas: resultado.length, partidas: resultado };
  },

  async mover_pago_flujo({ cuenta_id, desde, hasta }, { empresaId }) {
    const origen = `${cuenta_id}-${lunesDeTexto(desde)}`;
    const destino = `${cuenta_id}-${lunesDeTexto(hasta)}`;
    if (origen === destino) throw new Error('Las dos fechas caen en la misma semana.');
    const snap = await getDoc(ref(empresaId, 'flujo_pagos', origen));
    const valor = snap.exists() ? snap.data().valor : 0;
    if (!valor) throw new Error('Esa cuenta no tiene un monto anotado a mano en la semana de origen (las recurrentes automáticas no se mueven).');
    const previo = await getDoc(ref(empresaId, 'flujo_pagos', destino));
    const valorDestino = valor + (previo.exists() ? (previo.data().valor || 0) : 0);

    const [nota, pagado] = await Promise.all([
      getDoc(ref(empresaId, 'flujo_notas', origen)),
      getDoc(ref(empresaId, 'flujo_pagados', origen)),
    ]);
    await Promise.all([
      setDoc(ref(empresaId, 'flujo_pagos', destino), { valor: valorDestino, updatedAt: ahora() }),
      setDoc(ref(empresaId, 'flujo_pagos', origen), { valor: 0, updatedAt: ahora() }),
      ...(nota.exists() ? [setDoc(ref(empresaId, 'flujo_notas', destino), nota.data()), deleteDoc(ref(empresaId, 'flujo_notas', origen))] : []),
      ...(pagado.exists() ? [setDoc(ref(empresaId, 'flujo_pagados', destino), pagado.data()), deleteDoc(ref(empresaId, 'flujo_pagados', origen))] : []),
    ]);
    return { ok: true, monto: valor, nueva_semana: destino.slice(-10), total_en_destino: valorDestino };
  },

  async marcar_pagado({ cuenta_id, semana, pagado = true }, { empresaId }) {
    const key = `${cuenta_id}-${lunesDeTexto(semana)}`;
    if (pagado) await setDoc(ref(empresaId, 'flujo_pagados', key), { paidAt: ahora() });
    else await deleteDoc(ref(empresaId, 'flujo_pagados', key));
    return { ok: true, partida: key, pagado };
  },

  async deuda_proveedores({ solo_vencida = false }, { empresaId }) {
    const snap = await getDocs(collection(db, 'empresas', empresaId, 'deuda_proveedores'));
    const porAcreedor = new Map();
    snap.docs.forEach(d => {
      const x = d.data();
      if (!(x.saldoPendiente > 0)) return;
      if (solo_vencida && x.estado !== 'vencido') return;
      const nombre = x.proveedorNombre || 'Acreedor';
      const a = porAcreedor.get(nombre) || { acreedor: nombre, tipo: x.tipoDeuda || 'proveedor', documentos: 0, saldo: 0, vencido: 0, max_dias_mora: 0, proximo_vencimiento: null };
      a.documentos++;
      a.saldo += x.saldoPendiente;
      if (x.estado === 'vencido') a.vencido += x.saldoPendiente;
      a.max_dias_mora = Math.max(a.max_dias_mora, x.diasMora || 0);
      if (x.estado !== 'vencido' && x.fechaVencimiento && (!a.proximo_vencimiento || x.fechaVencimiento < a.proximo_vencimiento)) {
        a.proximo_vencimiento = x.fechaVencimiento;
      }
      porAcreedor.set(nombre, a);
    });
    const lista = [...porAcreedor.values()].sort((a, b) => b.saldo - a.saldo);
    return {
      total_pendiente: Math.round(lista.reduce((s, a) => s + a.saldo, 0)),
      total_vencido: Math.round(lista.reduce((s, a) => s + a.vencido, 0)),
      acreedores: lista.slice(0, 40).map(a => ({ ...a, saldo: Math.round(a.saldo), vencido: Math.round(a.vencido) })),
    };
  },
};

/** Texto para la tarjeta de confirmación de las acciones de finanzas. */
export function describirAccionFinanzas(nombre, input = {}) {
  const pesos = (n) => `$${Math.abs(Math.round(Number(n) || 0)).toLocaleString('es-CL')}`;
  if (nombre === 'crear_cuentas_flujo') {
    const lista = (input.cuentas || []).map(c =>
      `• ${c.nombre} (${c.categoria === 'INGRESOS' ? 'ingreso' : 'egreso'}${c.monto_recurrente ? `, ${c.frecuencia || 'mensual'} ${pesos(c.monto_recurrente)}` : ''})`);
    return `Crear ${lista.length} cuenta(s) en el flujo de caja:\n${lista.join('\n')}`;
  }
  if (nombre === 'cargar_partidas_flujo') {
    const partidas = input.partidas || [];
    const total = partidas.reduce((s, p) => s + Math.abs(Number(p.monto) || 0), 0);
    const muestra = partidas.slice(0, 8).map(p => `• ${p.etiqueta || p.cuenta_id}: ${pesos(p.monto)} semana del ${p.semana}`);
    const resto = partidas.length > 8 ? `\n…y ${partidas.length - 8} más` : '';
    return `${input.modo === 'sumar' ? 'Sumar' : 'Anotar'} ${partidas.length} monto(s) en el flujo de caja (total ${pesos(total)}):\n${muestra.join('\n')}${resto}`;
  }
  if (nombre === 'mover_pago_flujo') {
    return `Mover el pago de "${input.etiqueta || input.cuenta_id}" de la semana del ${input.desde} a la del ${input.hasta}.`;
  }
  if (nombre === 'aprobar_propuesta_flujo') {
    return `Aprobar la propuesta "${input.nombre || input.propuesta_id}" y escribir todos sus cambios en el flujo de caja original.`;
  }
  if (nombre === 'rechazar_propuesta_flujo') {
    return `Rechazar la propuesta "${input.nombre || input.propuesta_id}". El flujo no cambia.`;
  }
  if (nombre === 'marcar_pagado') {
    return `${input.pagado === false ? 'Desmarcar como pagado' : 'Marcar como pagado'} "${input.etiqueta || input.cuenta_id}" en la semana del ${input.semana}.`;
  }
  return null;
}
