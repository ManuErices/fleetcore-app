/**
 * herramientasMejoras.js — El agente propone y gestiona mejoras al código.
 *
 * Todo pasa por /api/mejoras, que guarda cada mejora como issue de GitHub y
 * decide en el servidor quién puede aprobar. El paso a producción no pasa
 * por aquí: se hace revisando y aprobando el PR en GitHub. Aquí solo se llama
 * al endpoint con la sesión del usuario.
 */

import { auth } from '../firebase';

async function llamar(accion, datos = {}, contexto) {
  const usuario = auth.currentUser;
  if (!usuario) throw new Error('La sesión expiró.');
  const r = await fetch('/api/mejoras', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await usuario.getIdToken()}` },
    body: JSON.stringify({ accion, contexto, ...datos }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || `El servicio de mejoras respondió ${r.status}.`);
  return data;
}

export const EJECUTORES_MEJORAS = {
  listar_mejoras: ({ estado }) => llamar('listar', { estado }),
  estado_mejora: ({ numero }) => llamar('estado', { numero }),
  proponer_mejora: ({ titulo, descripcion, modulo }, { empresaNombre }) =>
    llamar('proponer', { titulo, descripcion, modulo }, { empresaNombre }),
  aprobar_mejora: ({ numero, indicaciones }) => llamar('aprobar', { numero, indicaciones }),
  rechazar_mejora: ({ numero, motivo }) => llamar('rechazar', { numero, motivo }),
};

export function describirAccionMejoras(nombre, input = {}) {
  if (nombre === 'proponer_mejora') {
    return `Registrar la mejora "${input.titulo}" (módulo ${input.modulo || 'general'}) para que un aprobador la revise.`;
  }
  if (nombre === 'aprobar_mejora') {
    return `Aprobar la mejora #${input.numero}${input.titulo ? ` "${input.titulo}"` : ''}: el agente de desarrollo escribirá el código y dejará una vista previa para revisar.${input.indicaciones ? `\nIndicaciones: ${input.indicaciones}` : ''}`;
  }
  if (nombre === 'rechazar_mejora') {
    return `Rechazar y cerrar la mejora #${input.numero}${input.titulo ? ` "${input.titulo}"` : ''}.`;
  }
  return null;
}
