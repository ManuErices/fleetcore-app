// ============================================================
// FLEETCORE — CONFIGURACIÓN DE LÍMITES DE REPORTES
// src/lib/reportesConfig.js
//
// Centraliza los límites de validación de los reportes de
// maquinaria (horómetro, kilometraje y carga de combustible).
//
// Dos niveles de control:
//   • ADVERTENCIA → se muestra en amarillo, NO bloquea el guardado
//   • MÁXIMO      → bloquea el guardado (valor físicamente imposible)
//
// Los valores por defecto se pueden sobrescribir por empresa
// creando el documento Firestore:
//     empresas/{empresaId}/configuracion/reportes
// con cualquiera de las claves de LIMITES_DEFAULT.
// Así se cambian los límites sin volver a desplegar.
// ============================================================

import { doc, getDoc } from 'firebase/firestore';
import { db } from './firebase';

export const LIMITES_DEFAULT = {
  // ── Horómetro ────────────────────────────────────────────
  horasAdvertencia: 12,   // sobre esto avisa (jornada larga)
  horasMaximo:      12,   // sobre esto bloquea (imposible en 1 día)

  // ── Kilometraje ──────────────────────────────────────────
  kmAdvertencia:    800,
  kmMaximo:         800,

  // ── Carga de combustible ─────────────────────────────────
  litrosAdvertencia: 700,
  litrosMaximo:      700, // camiones/estanques grandes

  // ── Jornada (para el timeline del Paso 2) ────────────────
  jornadaInicio: '07:00',
  jornadaFin:    '19:00',
};

// Cache en memoria por empresa para no golpear Firestore en cada render
const _cache = new Map();

/**
 * Devuelve los límites vigentes para una empresa.
 * Si no existe el documento de configuración, devuelve los defaults.
 */
export async function getLimitesReporte(empresaId) {
  if (!empresaId) return { ...LIMITES_DEFAULT };
  if (_cache.has(empresaId)) return _cache.get(empresaId);

  let limites = { ...LIMITES_DEFAULT };
  try {
    const snap = await getDoc(doc(db, 'empresas', empresaId, 'configuracion', 'reportes'));
    if (snap.exists()) {
      const data = snap.data() || {};
      // Solo sobrescribir claves conocidas y numéricas válidas
      Object.keys(LIMITES_DEFAULT).forEach((k) => {
        const v = data[k];
        if (v === undefined || v === null || v === '') return;
        if (typeof LIMITES_DEFAULT[k] === 'number') {
          const n = parseFloat(v);
          if (!Number.isNaN(n) && n > 0) limites[k] = n;
        } else {
          limites[k] = String(v);
        }
      });
    }
  } catch (e) {
    console.warn('No se pudo leer configuracion/reportes, usando defaults:', e?.message);
  }

  _cache.set(empresaId, limites);
  return limites;
}

/** Limpia el cache (llamar tras editar la configuración) */
export function invalidarCacheLimites(empresaId) {
  if (empresaId) _cache.delete(empresaId);
  else _cache.clear();
}

// ── Validadores puros ───────────────────────────────────────
// Cada uno devuelve { error: string|'', warning: string|'' }

const vacio = () => ({ error: '', warning: '' });

export function validarHorometro(inicial, final, limites = LIMITES_DEFAULT) {
  if (inicial === '' || final === '' || inicial == null || final == null) return vacio();
  const ini = parseFloat(inicial);
  const fin = parseFloat(final);
  if (Number.isNaN(ini) || Number.isNaN(fin)) return vacio();

  if (ini > fin) {
    return { error: 'El Horómetro Inicial no puede ser mayor que el Final', warning: '' };
  }
  const dif = fin - ini;
  if (dif > limites.horasMaximo) {
    return { error: `La diferencia de horómetro (${dif.toFixed(1)} h) supera el máximo permitido de ${limites.horasMaximo} h`, warning: '' };
  }
  if (dif > limites.horasAdvertencia) {
    return { error: '', warning: `Jornada de ${dif.toFixed(1)} h — supera las ${limites.horasAdvertencia} h habituales. Verifica antes de continuar.` };
  }
  return vacio();
}

export function validarKilometraje(inicial, final, limites = LIMITES_DEFAULT) {
  if (inicial === '' || final === '' || inicial == null || final == null) return vacio();
  const ini = parseFloat(inicial);
  const fin = parseFloat(final);
  if (Number.isNaN(ini) || Number.isNaN(fin)) return vacio();

  if (ini > fin) {
    return { error: 'El Kilometraje Inicial no puede ser mayor que el Final', warning: '' };
  }
  const dif = fin - ini;
  if (dif > limites.kmMaximo) {
    return { error: `El recorrido (${dif.toFixed(0)} km) supera el máximo permitido de ${limites.kmMaximo} km`, warning: '' };
  }
  if (dif > limites.kmAdvertencia) {
    return { error: '', warning: `Recorrido de ${dif.toFixed(0)} km — supera los ${limites.kmAdvertencia} km habituales. Verifica antes de continuar.` };
  }
  return vacio();
}

export function validarCombustible(litros, limites = LIMITES_DEFAULT) {
  if (litros === '' || litros == null) return vacio();
  const n = parseFloat(litros);
  if (Number.isNaN(n)) return vacio();

  if (n < 0) return { error: 'La carga de combustible no puede ser negativa', warning: '' };
  if (n > limites.litrosMaximo) {
    return { error: `La carga (${n} L) supera el máximo permitido de ${limites.litrosMaximo} L`, warning: '' };
  }
  if (n > limites.litrosAdvertencia) {
    return { error: '', warning: `Carga de ${n} L — supera los ${limites.litrosAdvertencia} L habituales. Verifica antes de continuar.` };
  }
  return vacio();
}
