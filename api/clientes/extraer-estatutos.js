// ============================================================
// FLEETCORE — API: LEER CERTIFICADO DE ESTATUTOS
// api/clientes/extraer-estatutos.js  (Vercel Serverless Function)
//
// POST /api/clientes/extraer-estatutos
// Headers: Authorization: Bearer <idToken de Firebase>
// Body:    { archivoBase64, mediaType, nombreArchivo }
//
// Devuelve los datos de identificación que aparecen en el documento.
// Nunca inventa: lo que no está en el papel vuelve como null, para que
// la pantalla lo muestre vacío en vez de rellenarlo con algo plausible.
//
// SETUP — variables de entorno en Vercel:
//   ANTHROPIC_API_KEY=sk-ant-xxxx
//   ANTHROPIC_MODEL=claude-sonnet-5          (opcional)
//   FIREBASE_SERVICE_ACCOUNT={"type":"service_account",...}   (ya existe)
//   APP_URL=https://tuapp.vercel.app                          (ya existe)
// ============================================================

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

const MEDIA_PERMITIDOS = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];

// Vercel corta los cuerpos sobre ~4.5 MB y base64 infla un tercio.
// Un certificado de estatutos rara vez pasa de 1 MB.
const MAX_BYTES = 3 * 1024 * 1024;

function getFirebaseAuth() {
  if (!getApps().length) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    initializeApp({ credential: cert(serviceAccount) });
  }
  return getAuth();
}

const INSTRUCCIONES = `Eres un asistente que lee documentos societarios chilenos: certificados de estatutos, escrituras de constitución, certificados de vigencia y e-RUT del SII.

Extrae únicamente los datos que aparecen literalmente en el documento y devuelve SOLO un objeto JSON, sin texto antes ni después y sin bloques de código markdown.

Estructura exacta:
{
  "nombre": string|null,
  "rut": string|null,
  "giro": string|null,
  "representanteNombre": string|null,
  "representanteRut": string|null,
  "direccion": string|null,
  "comuna": string|null,
  "ciudad": string|null,
  "tipoDocumento": string|null,
  "notas": string|null
}

Reglas:
- "nombre" es la razón social completa, incluida la forma societaria (SpA, Ltda., S.A.).
- Los RUT en formato 12.345.678-9. Si el documento trae varios, "rut" es el de la sociedad y "representanteRut" el de la persona natural que la representa.
- Si el documento nombra a varios representantes o apoderados, usa el primero y menciona a los demás en "notas".
- "giro" es el objeto social resumido en una línea, no el párrafo completo.
- Un campo que no aparezca en el documento va como null. No deduzcas, no completes y no uses conocimiento externo: si no está escrito, es null.
- "tipoDocumento" describe qué documento es (por ejemplo "Certificado de estatutos" o "e-RUT").
- "notas" es para advertencias breves: documento ilegible, parcial, vencido, o datos ambiguos. Si no hay nada que advertir, null.`;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', process.env.APP_URL || '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    // ── Autenticación ──────────────────────────────────────
    // Sin esto el endpoint queda abierto y cualquiera puede consumir
    // la cuota de la API a tu costo.
    const header = req.headers.authorization || '';
    const idToken = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!idToken) return res.status(401).json({ error: 'Falta el token de sesión' });

    try {
      await getFirebaseAuth().verifyIdToken(idToken);
    } catch {
      return res.status(401).json({ error: 'Sesión inválida o expirada' });
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(500).json({ error: 'Falta configurar ANTHROPIC_API_KEY en el servidor' });
    }

    // ── Validación del archivo ─────────────────────────────
    const { archivoBase64, mediaType } = req.body || {};
    if (!archivoBase64) return res.status(400).json({ error: 'No se recibió el archivo' });
    if (!MEDIA_PERMITIDOS.includes(mediaType)) {
      return res.status(400).json({ error: 'Formato no permitido. Sube un PDF o una imagen.' });
    }

    const bytes = Math.floor((archivoBase64.length * 3) / 4);
    if (bytes > MAX_BYTES) {
      return res.status(413).json({
        error: `El archivo pesa ${(bytes / 1024 / 1024).toFixed(1)} MB y el máximo para lectura es 3 MB. Súbelo igual como respaldo y completa los datos a mano.`,
      });
    }

    const bloqueArchivo = mediaType === 'application/pdf'
      ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: archivoBase64 } }
      : { type: 'image', source: { type: 'base64', media_type: mediaType, data: archivoBase64 } };

    // ── Llamada al modelo ──────────────────────────────────
    const respuesta = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-5',
        max_tokens: 1024,
        system: INSTRUCCIONES,
        messages: [
          {
            role: 'user',
            content: [
              bloqueArchivo,
              { type: 'text', text: 'Extrae los datos de este documento y devuelve solo el JSON.' },
            ],
          },
        ],
      }),
    });

    if (!respuesta.ok) {
      const detalle = await respuesta.text();
      console.error('Error de la API de Anthropic:', respuesta.status, detalle);
      return res.status(502).json({ error: 'No se pudo leer el documento. Inténtalo de nuevo o llena los datos a mano.' });
    }

    const data = await respuesta.json();
    const texto = (data.content || [])
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim();

    // Por si el modelo devuelve el JSON envuelto en backticks
    const limpio = texto.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();

    let datos;
    try {
      datos = JSON.parse(limpio);
    } catch {
      console.error('Respuesta no parseable:', texto.slice(0, 500));
      return res.status(502).json({ error: 'El documento no se pudo interpretar. Completa los datos a mano.' });
    }

    // Solo se devuelven los campos esperados: nada que llegue de más
    // termina escribiéndose en Firestore por accidente.
    const campos = [
      'nombre', 'rut', 'giro', 'representanteNombre', 'representanteRut',
      'direccion', 'comuna', 'ciudad', 'tipoDocumento', 'notas',
    ];
    const limpios = {};
    for (const c of campos) {
      const v = datos[c];
      limpios[c] = typeof v === 'string' && v.trim() ? v.trim() : null;
    }

    // Qué campos vinieron del documento: la pantalla los marca para revisión.
    const extraidos = campos.filter(
      (c) => !['tipoDocumento', 'notas'].includes(c) && limpios[c]
    );

    return res.status(200).json({ ok: true, datos: limpios, extraidos });
  } catch (err) {
    console.error('extraer-estatutos:', err);
    return res.status(500).json({ error: 'Error inesperado al leer el documento' });
  }
}

// El cuerpo llega en base64 y puede pesar varios MB: el límite por defecto
// de Vercel (1 MB) lo rechazaría antes de llegar al handler.
export const config = {
  api: {
    bodyParser: { sizeLimit: '5mb' },
  },
};
