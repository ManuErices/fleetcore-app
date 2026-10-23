// ============================================================
// FLEETCORE — API: MEJORAS DE LA PLATAFORMA (autodesarrollo)
// api/mejoras/index.js  (Vercel Serverless Function)
//
// POST /api/mejoras
// Headers: Authorization: Bearer <idToken de Firebase>
// Body:    { accion, ...datos }
//
// Cada mejora es un issue de GitHub con la etiqueta "mejora". El ciclo:
//
//   propuesta ──(aprobador: aprobar)──▶ aprobada ──▶ GitHub Action escribe
//   el código en la rama mejora-N y abre un PR ──▶ Vercel publica una vista
//   previa ──(persona con acceso al repo revisa y hace merge en GitHub)──▶
//   producción.
//
// Nada llega a producción sin dos decisiones humanas: aprobar el pedido y
// revisar el código en GitHub. Este endpoint, a propósito, NO hace merge:
// el paso a producción queda fuera del alcance del agente.
//
// Quién puede qué:
//   · Proponer y consultar: cualquier usuario que opere la plataforma
//     (todos menos trabajador y mandante).
//   · Aprobar y rechazar: superadmin, o un uid listado en
//     plataforma/mejoras.aprobadores (documento que solo un superadmin
//     puede editar). El código es uno solo para todas las empresas, así
//     que un admin_contrato de un cliente no aprueba cambios por defecto.
//
// SETUP — variables de entorno en Vercel:
//   GITHUB_TOKEN_MEJORAS=github_pat_...   (obligatoria: token fine-grained del
//                                          repo con Issues en lectura/escritura
//                                          y Pull requests en solo lectura)
//   GITHUB_REPO=ManuErices/fleetcore-app  (opcional)
// ============================================================

import { tokenDe, validarToken, leerDocumento } from '../_comun/sesion.js';

const REPO = process.env.GITHUB_REPO || 'ManuErices/fleetcore-app';
const ROLES_SIN_ACCESO = ['trabajador', 'mandante'];

const MODULOS = [
  'combustible', 'maquinaria', 'oficina-tecnica', 'operadores', 'rrhh',
  'reportes', 'finanzas', 'contabilidad', 'documentos', 'agente', 'general',
];

class ErrorPublico extends Error {
  constructor(status, mensaje) { super(mensaje); this.status = status; }
}

async function github(ruta, { method = 'GET', body } = {}) {
  const r = await fetch(`https://api.github.com/repos/${REPO}${ruta}`, {
    method,
    headers: {
      Authorization: `Bearer ${process.env.GITHUB_TOKEN_MEJORAS}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (r.status === 204) return null;
  const data = await r.json().catch(() => null);
  if (!r.ok) {
    console.error(`GitHub ${method} ${ruta}:`, r.status, data?.message);
    throw new ErrorPublico(502, `GitHub respondió ${r.status}: ${data?.message || 'error'}`);
  }
  return data;
}

async function quienEs(idToken, sesion) {
  const usuario = await leerDocumento(idToken, `users/${sesion.uid}`);
  if (!usuario) throw new ErrorPublico(403, 'Tu usuario no existe en la plataforma.');
  let aprobadores = [];
  try {
    aprobadores = (await leerDocumento(idToken, 'plataforma/mejoras'))?.aprobadores || [];
  } catch { /* reglas sin desplegar: solo el superadmin aprueba */ }
  return {
    ...sesion,
    rol: usuario.role || '',
    nombre: usuario.nombre || usuario.displayName || sesion.email,
    puedeProponer: !ROLES_SIN_ACCESO.includes(usuario.role),
    puedeAprobar: usuario.role === 'superadmin' || aprobadores.includes(sesion.uid),
  };
}

const etiquetas = (issue) => (issue.labels || []).map(l => (typeof l === 'string' ? l : l.name));

function estadoDe(issue) {
  const e = etiquetas(issue);
  if (e.includes('rechazada')) return 'rechazada';
  if (e.includes('aprobada')) return 'aprobada';
  return issue.state === 'closed' ? 'cerrada' : 'propuesta';
}

const resumenIssue = (i) => ({
  numero: i.number,
  titulo: i.title,
  estado: estadoDe(i),
  modulo: (etiquetas(i).find(e => e.startsWith('modulo:')) || '').slice(7) || null,
  origen: etiquetas(i).includes('origen:revision-diaria') ? 'revisión diaria del agente' : 'pedido del equipo',
  creada: i.created_at?.slice(0, 10),
  url: i.html_url,
});

async function prDe(numero) {
  const owner = REPO.split('/')[0];
  const prs = await github(`/pulls?state=all&head=${owner}:mejora-${numero}`);
  return prs?.[0] || null;
}

async function vistaPrevia(sha) {
  const deps = await github(`/deployments?sha=${sha}&per_page=5`);
  for (const d of deps || []) {
    const estados = await github(`/deployments/${d.id}/statuses?per_page=1`);
    const ultimo = estados?.[0];
    if (ultimo?.state === 'success' && ultimo.environment_url) return ultimo.environment_url;
    if (ultimo) return `en preparación (${ultimo.state})`;
  }
  return null;
}

async function issueDeMejora(numero) {
  const n = Number(numero);
  if (!Number.isInteger(n) || n <= 0) throw new ErrorPublico(400, 'Número de mejora inválido.');
  const issue = await github(`/issues/${n}`);
  if (!etiquetas(issue).includes('mejora') || issue.pull_request) {
    throw new ErrorPublico(404, `El #${n} no es una mejora.`);
  }
  return issue;
}

const ACCIONES = {
  async listar({ estado }, yo) {
    if (!yo.puedeProponer) throw new ErrorPublico(403, 'Tu rol no puede ver las mejoras.');
    const issues = await github('/issues?labels=mejora&state=all&per_page=40&sort=updated');
    const lista = issues.filter(i => !i.pull_request).map(resumenIssue);
    return {
      puede_aprobar: yo.puedeAprobar,
      mejoras: estado ? lista.filter(m => m.estado === estado) : lista,
    };
  },

  async proponer({ titulo, descripcion, modulo }, yo, contexto) {
    if (!yo.puedeProponer) throw new ErrorPublico(403, 'Tu rol no puede proponer mejoras.');
    const t = String(titulo || '').trim().slice(0, 120);
    const d = String(descripcion || '').trim().slice(0, 6000);
    if (!t || !d) throw new ErrorPublico(400, 'La mejora necesita título y descripción.');
    const mod = MODULOS.includes(modulo) ? modulo : 'general';
    const issue = await github('/issues', {
      method: 'POST',
      body: {
        title: t,
        labels: ['mejora', 'propuesta', `modulo:${mod}`],
        body: [
          d,
          '',
          '---',
          `Solicitada por: ${yo.nombre} <${yo.email}> (rol: ${yo.rol})`,
          `Empresa: ${String(contexto?.empresaNombre || '').slice(0, 120)}`,
          `Módulo: ${mod}`,
          'Origen: asistente IA de FleetCore',
        ].join('\n'),
      },
    });
    return { ok: true, ...resumenIssue(issue), siguiente_paso: 'Un aprobador debe aprobarla para que el agente la desarrolle.' };
  },

  async aprobar({ numero, indicaciones }, yo) {
    if (!yo.puedeAprobar) throw new ErrorPublico(403, 'Solo un aprobador de mejoras puede aprobar.');
    const issue = await issueDeMejora(numero);
    if (issue.state === 'closed') throw new ErrorPublico(409, 'Esa mejora está cerrada.');
    if (estadoDe(issue) === 'aprobada') throw new ErrorPublico(409, 'Ya estaba aprobada.');
    await github(`/issues/${issue.number}/comments`, {
      method: 'POST',
      body: { body: `✅ Aprobada por ${yo.nombre} <${yo.email}>.${indicaciones ? `\n\nIndicaciones:\n${String(indicaciones).slice(0, 3000)}` : ''}` },
    });
    await github(`/issues/${issue.number}/labels/propuesta`, { method: 'DELETE' }).catch(() => null);
    // Esta etiqueta dispara .github/workflows/agente-mejora.yml
    await github(`/issues/${issue.number}/labels`, { method: 'POST', body: { labels: ['aprobada'] } });
    return { ok: true, numero: issue.number, siguiente_paso: 'El agente de desarrollo empieza ahora; en unos 10 a 30 minutos habrá una vista previa para revisar.' };
  },

  async rechazar({ numero, motivo }, yo) {
    if (!yo.puedeAprobar) throw new ErrorPublico(403, 'Solo un aprobador de mejoras puede rechazar.');
    const issue = await issueDeMejora(numero);
    await github(`/issues/${issue.number}/comments`, {
      method: 'POST',
      body: { body: `❌ Rechazada por ${yo.nombre} <${yo.email}>.${motivo ? `\n\nMotivo: ${String(motivo).slice(0, 2000)}` : ''}` },
    });
    await github(`/issues/${issue.number}/labels`, { method: 'POST', body: { labels: ['rechazada'] } });
    await github(`/issues/${issue.number}`, { method: 'PATCH', body: { state: 'closed', state_reason: 'not_planned' } });
    return { ok: true, numero: issue.number };
  },

  async estado({ numero }, yo) {
    if (!yo.puedeProponer) throw new ErrorPublico(403, 'Tu rol no puede ver las mejoras.');
    const issue = await issueDeMejora(numero);
    const pr = await prDe(issue.number);
    let desarrollo = null;
    if (pr) {
      desarrollo = {
        pr: pr.html_url,
        estado_pr: pr.merged_at ? 'publicada en producción' : pr.state === 'closed' ? 'cerrada sin publicar' : 'esperando revisión del código en GitHub',
        vista_previa: pr.merged_at ? null : await vistaPrevia(pr.head.sha),
        como_publicar: pr.merged_at || pr.state === 'closed' ? null : `Una persona con acceso al repositorio revisa el código y hace merge en ${pr.html_url}.`,
      };
    }
    return {
      ...resumenIssue(issue),
      descripcion: String(issue.body || '').slice(0, 1500),
      desarrollo,
      nota: !pr && estadoDe(issue) === 'aprobada' ? 'El agente de desarrollo está trabajando o aún no abre el PR.' : null,
    };
  },
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', process.env.APP_URL || '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const idToken = tokenDe(req);
    const sesion = await validarToken(idToken);
    if (!sesion) return res.status(401).json({ error: 'Sesión inválida. Cierra sesión y vuelve a entrar.' });
    if (!process.env.GITHUB_TOKEN_MEJORAS) {
      return res.status(500).json({ error: 'Falta configurar GITHUB_TOKEN_MEJORAS en Vercel.' });
    }

    const { accion, contexto, ...datos } = req.body || {};
    const ejecutar = ACCIONES[accion];
    if (!ejecutar) return res.status(400).json({ error: `Acción desconocida: ${accion}` });

    const yo = await quienEs(idToken, sesion);
    return res.status(200).json(await ejecutar(datos, yo, contexto));
  } catch (error) {
    if (error instanceof ErrorPublico) return res.status(error.status).json({ error: error.message });
    console.error('Error en mejoras:', error);
    return res.status(500).json({ error: 'Error interno al gestionar la mejora.' });
  }
}
