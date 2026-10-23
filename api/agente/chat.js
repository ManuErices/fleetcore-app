// ============================================================
// FLEETCORE — API: AGENTE IA
// api/agente/chat.js  (Vercel Serverless Function)
//
// POST /api/agente/chat
// Headers: Authorization: Bearer <idToken de Firebase>
// Body:    { messages, contexto }
//
// Un turno del agente. El navegador guarda la conversación, ejecuta las
// herramientas que Claude pide (con su propio acceso a Firestore) y vuelve
// a llamar a este endpoint con los resultados hasta que Claude termina.
// Este endpoint no toca la base de datos: solo protege la API key y fija
// las instrucciones y el catálogo de herramientas.
//
// SETUP — variables de entorno en Vercel:
//   ANTHROPIC_API_KEY=sk-ant-xxxx            (obligatoria, la misma de estatutos)
//   ANTHROPIC_AGENTE_MODEL=claude-opus-5-5   (opcional)
//   ANTHROPIC_AGENTE_EFFORT=low              (opcional: low | medium | high)
//   FIREBASE_API_KEY=AIza...                 (opcional)
//   APP_URL=https://fleetcore.cl             (opcional, para CORS)
// ============================================================

import Anthropic from '@anthropic-ai/sdk';
import { INSTRUCCIONES, HERRAMIENTAS } from './_herramientas.js';

// Tope para que nadie use el endpoint como proxy gratis de la API.
const MAX_BYTES = 400 * 1024;
const MAX_MENSAJES = 120;

const FIREBASE_API_KEY = process.env.FIREBASE_API_KEY
  || 'AIzaSyByzRUHnLrxAaZOS9Dap1Kl0ZH5STWWzKE';

// Mismo método que extraer-estatutos: valida el idToken contra Identity
// Toolkit, sin cuenta de servicio.
async function validarToken(idToken) {
  const r = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken }),
    }
  );
  if (!r.ok) {
    console.error('Token rechazado por Identity Toolkit:', r.status, await r.text());
    return null;
  }
  const data = await r.json();
  return data?.users?.[0]?.localId || null;
}

// El contexto viene del navegador: sirve para orientar al agente (fecha,
// rol, pantalla), no para autorizar nada. Los permisos los imponen las
// reglas de Firestore cuando el navegador ejecuta cada herramienta.
function textoContexto(contexto = {}) {
  const limpiar = (v) => String(v ?? '').slice(0, 200);
  return [
    `Fecha de hoy: ${limpiar(contexto.fechaHoy)}`,
    `Empresa: ${limpiar(contexto.empresaNombre)}`,
    `Usuario: ${limpiar(contexto.usuarioNombre)} (rol: ${limpiar(contexto.rol)})`,
    `Pantalla actual: ${limpiar(contexto.pantalla)}`,
  ].join('\n');
}

const client = new Anthropic();

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', process.env.APP_URL || '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const header = req.headers.authorization || '';
    const idToken = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!idToken) return res.status(401).json({ error: 'Falta el token de sesión.' });

    const uid = await validarToken(idToken);
    if (!uid) return res.status(401).json({ error: 'Sesión inválida. Cierra sesión y vuelve a entrar.' });

    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(500).json({
        error: 'Falta configurar ANTHROPIC_API_KEY en Vercel. Recuerda redeployar después de agregarla.',
      });
    }

    const { messages, contexto } = req.body || {};
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'La conversación llegó vacía.' });
    }
    if (messages.length > MAX_MENSAJES || JSON.stringify(messages).length > MAX_BYTES) {
      return res.status(413).json({ error: 'La conversación es demasiado larga. Empieza una nueva.' });
    }

    const respuesta = await client.beta.messages.create({
      model: process.env.ANTHROPIC_AGENTE_MODEL || 'claude-opus-5-5',
      max_tokens: 16000,
      // "low" mantiene la latencia baja para conversar por voz; súbelo con
      // ANTHROPIC_AGENTE_EFFORT si ves que el agente se equivoca de herramienta.
      output_config: { effort: process.env.ANTHROPIC_AGENTE_EFFORT || 'low' },
      // Si un filtro de seguridad rechaza el turno, la API lo reintenta sola
      // con el modelo de respaldo recomendado.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      tools: HERRAMIENTAS,
      // Instrucciones fijas (cacheadas) primero, contexto de la sesión después.
      system: [
        { type: 'text', text: INSTRUCCIONES, cache_control: { type: 'ephemeral' } },
        { type: 'text', text: textoContexto(contexto) },
      ],
      messages,
    });

    // Se devuelve el contenido completo (incluidos los bloques de
    // razonamiento): el navegador debe reenviarlo tal cual en el siguiente
    // turno o la API rechaza la conversación.
    return res.status(200).json({
      content: respuesta.content,
      stop_reason: respuesta.stop_reason,
    });
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) {
      return res.status(429).json({ error: 'El asistente está con mucha demanda. Intenta en unos segundos.' });
    }
    if (error instanceof Anthropic.AuthenticationError) {
      console.error('ANTHROPIC_API_KEY inválida');
      return res.status(500).json({ error: 'La API key de Anthropic es inválida.' });
    }
    if (error instanceof Anthropic.BadRequestError) {
      console.error('Petición rechazada por Anthropic:', error.message);
      return res.status(400).json({ error: 'La conversación quedó en un estado inválido. Empieza una nueva.' });
    }
    if (error instanceof Anthropic.APIError) {
      console.error(`Error de la API de Anthropic ${error.status}:`, error.message);
      return res.status(502).json({ error: 'El asistente no respondió. Intenta de nuevo.' });
    }
    console.error('Error en agente/chat:', error);
    return res.status(500).json({ error: 'Error interno del asistente.' });
  }
}
