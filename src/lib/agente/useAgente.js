/**
 * useAgente.js — Conversación con el agente IA y ejecución de sus herramientas.
 *
 * El ciclo de cada mensaje:
 *   1. Se manda la conversación a /api/agente/chat.
 *   2. Si Claude pide herramientas, se ejecutan aquí (pidiendo confirmación
 *      al usuario para las que modifican datos) y se devuelven los
 *      resultados en un solo mensaje.
 *   3. Se repite hasta que Claude responde sin pedir herramientas.
 *
 * Reglas que la API exige y que este archivo cuida:
 *   - El historial solo crece: las respuestas se guardan completas (con sus
 *     bloques de razonamiento) y nunca se editan.
 *   - Todo tool_use recibe su tool_result antes del siguiente turno.
 *   - El contexto (fecha, rol, pantalla) se fija al empezar la conversación;
 *     cambiarlo a mitad invalidaría el razonamiento guardado.
 *
 * La conversación se guarda en sessionStorage porque cambiar de app
 * (FleetCore → RRHH) desmonta el widget. Por la misma razón, navegar_a no
 * navega en el acto: deja la ruta pendiente y se navega al terminar el ciclo.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { auth } from '../firebase';
import { ACCIONES_QUE_MODIFICAN, NOMBRES_HERRAMIENTAS, describirAccion, ejecutarHerramienta } from './herramientas';
import { cargarMemoria } from './herramientasEquipo';

const ENDPOINT = '/api/agente/chat';
// Armar un flujo de caja completo toma varias vueltas (listar, crear, cargar, proyectar).
const MAX_PASOS = 25;

const ETIQUETAS = {
  listar_obras: 'Revisando obras',
  buscar_maquinas: 'Buscando máquinas',
  buscar_trabajadores: 'Buscando trabajadores',
  resumen_combustible: 'Calculando combustible',
  resumen_reportes_diarios: 'Revisando reportes diarios',
  navegar_a: 'Abriendo pantalla',
  crear_obra: 'Creando obra',
  actualizar_maquina: 'Actualizando máquina',
  resumen_del_dia: 'Revisando el día',
  consultar_datos: 'Consultando datos',
  recordar: 'Guardando en la memoria del equipo',
  olvidar: 'Borrando de la memoria',
  proyectar_caja: 'Proyectando la caja',
  detalle_semana_caja: 'Revisando la semana',
  simular_pago: 'Simulando el pago',
  listar_cuentas_flujo: 'Revisando cuentas del flujo',
  crear_cuentas_flujo: 'Creando cuentas',
  cargar_partidas_flujo: 'Cargando montos en el flujo',
  mover_pago_flujo: 'Moviendo pago',
  marcar_pagado: 'Marcando pago',
  listar_mejoras: 'Revisando mejoras',
  estado_mejora: 'Revisando el avance',
  proponer_mejora: 'Registrando la mejora',
  aprobar_mejora: 'Aprobando la mejora',
  rechazar_mejora: 'Rechazando la mejora',
  deuda_proveedores: 'Revisando deuda',
};

const hoyLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

function leerGuardado(clave) {
  try {
    const crudo = sessionStorage.getItem(clave);
    return crudo ? JSON.parse(crudo) : null;
  } catch {
    return null;
  }
}

function guardar(clave, estado) {
  try {
    sessionStorage.setItem(clave, JSON.stringify(estado));
  } catch { /* modo privado o cuota llena: la conversación vive solo en memoria */ }
}

async function pedirTurno(messages, contexto) {
  const usuario = auth.currentUser;
  if (!usuario) throw new Error('Tu sesión expiró. Vuelve a entrar.');
  const idToken = await usuario.getIdToken();

  const r = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({ messages, contexto }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const err = new Error(data.error || `El asistente respondió con error ${r.status}.`);
    err.codigo = data.codigo;
    throw err;
  }
  return data;
}

const textoDe = (content) => content
  .filter(b => b.type === 'text')
  .map(b => b.text)
  .join('\n')
  .trim();

/**
 * @param {object} opciones
 * @param {string} opciones.empresaId
 * @param {string} opciones.empresaNombre
 * @param {string} opciones.rol
 * @param {(ruta: string) => void} opciones.navigate
 * @param {string} opciones.pantalla   ruta actual, solo como contexto
 * @param {(texto: string) => void} [opciones.alResponder]  p. ej. leer en voz alta
 */
export function useAgente({ empresaId, empresaNombre, rol, navigate, pantalla, alResponder }) {
  const clave = `agenteIA:${auth.currentUser?.uid || 'anon'}:${empresaId || 'sin-empresa'}`;

  const [vista, setVista] = useState([]);           // burbujas que ve el usuario
  const [trabajando, setTrabajando] = useState(false);
  const [estado, setEstado] = useState('');         // "Buscando máquinas…"
  const [confirmacion, setConfirmacion] = useState(null);
  const [desactualizado, setDesactualizado] = useState(false); // el servidor tiene herramientas que esta app no

  const historialRef = useRef([]);   // mensajes tal como los recibe la API
  const vistaRef = useRef([]);
  const contextoRef = useRef(null);
  const ocupadoRef = useRef(false);
  const resolverRef = useRef(null);

  // Restaurar al montar / al cambiar de empresa
  useEffect(() => {
    let guardado = leerGuardado(clave);
    // Una conversación empezada con otra versión de la app usa otro catálogo
    // de herramientas: no se puede continuar, se empieza una nueva.
    if (guardado && guardado.contexto
      && (guardado.contexto.herramientas || []).join() !== NOMBRES_HERRAMIENTAS.join()) {
      guardado = null;
      try { sessionStorage.removeItem(clave); } catch { /* sin almacenamiento */ }
    }
    historialRef.current = guardado?.historial || [];
    // Si el widget se desmontó esperando una confirmación, la conversación
    // quedó con llamadas sin resultado; se cierran para que siga siendo válida.
    const ultimo = historialRef.current[historialRef.current.length - 1];
    const pendientes = ultimo?.role === 'assistant' && Array.isArray(ultimo.content)
      ? ultimo.content.filter(b => b.type === 'tool_use') : [];
    if (pendientes.length) {
      historialRef.current.push({
        role: 'user',
        content: pendientes.map(l => ({ type: 'tool_result', tool_use_id: l.id, is_error: true, content: 'Se interrumpió antes de ejecutarse.' })),
      });
    }
    contextoRef.current = guardado?.contexto || null;
    vistaRef.current = guardado?.vista || [];
    setVista(vistaRef.current);
  }, [clave]);

  const persistir = useCallback(() => {
    guardar(clave, { historial: historialRef.current, contexto: contextoRef.current, vista: vistaRef.current });
  }, [clave]);

  const mostrar = useCallback((burbuja) => {
    vistaRef.current = [...vistaRef.current, burbuja];
    setVista(vistaRef.current);
    persistir();
  }, [persistir]);

  const pedirConfirmacion = (nombre, input) => new Promise(resolve => {
    resolverRef.current = resolve;
    setConfirmacion({ descripcion: describirAccion(nombre, input) });
  });

  const responderConfirmacion = useCallback((aprobada) => {
    resolverRef.current?.(aprobada);
    resolverRef.current = null;
    setConfirmacion(null);
  }, []);

  const enviar = useCallback(async (texto) => {
    const limpio = String(texto || '').trim();
    if (!limpio || ocupadoRef.current) return;
    ocupadoRef.current = true;
    setTrabajando(true);

    if (!contextoRef.current) {
      const u = auth.currentUser;
      setEstado('Preparando…');
      const memoria = await cargarMemoria(empresaId);
      contextoRef.current = {
        herramientas: NOMBRES_HERRAMIENTAS,
        memoria,
        fechaHoy: hoyLocal(),
        empresaNombre: empresaNombre || '',
        usuarioNombre: u?.displayName || u?.email || '',
        rol: rol || '',
        pantalla: pantalla || '',
      };
    }

    const historial = historialRef.current;
    historial.push({ role: 'user', content: limpio });
    mostrar({ de: 'usuario', texto: limpio });

    let rutaPendiente = null;
    let ultimaRespuesta = '';

    try {
      for (let paso = 0; ; paso++) {
        if (paso >= MAX_PASOS) {
          mostrar({ de: 'error', texto: 'La tarea requería demasiados pasos y la detuve. Prueba dividiéndola en partes.' });
          break;
        }

        setEstado('Pensando…');
        let respuesta;
        try {
          respuesta = await pedirTurno(historial, contextoRef.current);
        } catch (err) {
          // Si falló el primer turno, el mensaje no llegó: se saca del
          // historial para que reintentarlo no lo duplique.
          if (paso === 0 && historial[historial.length - 1]?.content === limpio) historial.pop();
          throw err;
        }

        if (respuesta.stop_reason === 'refusal') {
          if (paso === 0 && historial[historial.length - 1]?.content === limpio) historial.pop();
          mostrar({ de: 'error', texto: 'El asistente no pudo procesar esta solicitud. Prueba reformulándola.' });
          break;
        }

        if (respuesta.desactualizado) setDesactualizado(true);

        const content = respuesta.content || [];
        historial.push({ role: 'assistant', content });

        const texto = textoDe(content);
        if (texto) {
          ultimaRespuesta = texto;
          mostrar({ de: 'agente', texto });
        }

        const llamadas = content.filter(b => b.type === 'tool_use');
        if (!llamadas.length) break;

        const resultados = [];
        if (respuesta.stop_reason !== 'tool_use') {
          // Respuesta cortada a mitad de una llamada: se cierra igual para
          // que el historial siga siendo válido.
          llamadas.forEach(l => resultados.push({
            type: 'tool_result', tool_use_id: l.id, is_error: true, content: 'La respuesta se cortó antes de terminar la llamada.',
          }));
          historial.push({ role: 'user', content: resultados });
          break;
        }

        for (const llamada of llamadas) {
          setEstado(`${ETIQUETAS[llamada.name] || llamada.name}…`);

          if (ACCIONES_QUE_MODIFICAN.has(llamada.name)) {
            const aprobada = await pedirConfirmacion(llamada.name, llamada.input);
            if (!aprobada) {
              mostrar({ de: 'accion', texto: `Cancelado: ${describirAccion(llamada.name, llamada.input).split('\n')[0]}` });
              resultados.push({ type: 'tool_result', tool_use_id: llamada.id, is_error: true, content: 'El usuario rechazó la acción.' });
              continue;
            }
          }

          try {
            const salida = await ejecutarHerramienta(llamada.name, llamada.input, {
              empresaId, empresaNombre, rol, navigate: (ruta) => { rutaPendiente = ruta; },
            });
            if (ACCIONES_QUE_MODIFICAN.has(llamada.name)) {
              mostrar({ de: 'accion', texto: `Hecho: ${describirAccion(llamada.name, llamada.input).split('\n')[0]}` });
            } else if (llamada.name === 'recordar') {
              mostrar({ de: 'accion', texto: `Anotado en la memoria del equipo: "${llamada.input?.texto}"` });
            }
            resultados.push({ type: 'tool_result', tool_use_id: llamada.id, content: JSON.stringify(salida) });
          } catch (err) {
            resultados.push({ type: 'tool_result', tool_use_id: llamada.id, is_error: true, content: err?.message || 'Error desconocido.' });
          }
        }

        // Todos los resultados del turno van juntos en un solo mensaje.
        historial.push({ role: 'user', content: resultados });
      }

      if (ultimaRespuesta) alResponder?.(ultimaRespuesta);
    } catch (err) {
      if (err?.codigo === 'conversacion_invalida') {
        // La API rechazó el historial: no hay forma de seguirlo. Se empieza
        // de cero dejando visible lo conversado hasta aquí.
        historialRef.current = [];
        contextoRef.current = null;
        mostrar({ de: 'error', texto: 'Tuve que reiniciar la conversación. Repíteme lo último que me pediste.' });
      } else {
        mostrar({ de: 'error', texto: err?.message || 'No se pudo contactar al asistente.' });
      }
    } finally {
      persistir();
      setEstado('');
      setTrabajando(false);
      ocupadoRef.current = false;
      if (rutaPendiente) navigate(rutaPendiente);
    }
  }, [empresaId, empresaNombre, rol, pantalla, navigate, alResponder, mostrar, persistir]);

  const reiniciar = useCallback(() => {
    if (ocupadoRef.current) return;
    historialRef.current = [];
    contextoRef.current = null;
    vistaRef.current = [];
    setVista([]);
    try { sessionStorage.removeItem(clave); } catch { /* sin almacenamiento */ }
  }, [clave]);

  return { vista, trabajando, estado, confirmacion, desactualizado, responderConfirmacion, enviar, reiniciar };
}
