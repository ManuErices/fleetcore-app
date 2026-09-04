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
// POR QUÉ NO USA firebase-admin
// La versión anterior validaba el token con verifyIdToken(), que exige la
// cuenta de servicio en FIREBASE_SERVICE_ACCOUNT. Eso agrega tres formas
// silenciosas de fallar: JSON mal pegado, clave de otro proyecto, o variable
// ausente en el entorno donde corre. Todas devuelven el mismo 401 sin pista.
//
// Aquí el token se valida contra Identity Toolkit, el mismo servicio que
// emitió el token. Solo necesita la API key web — la que ya está en
// src/lib/firebase.js y que es pública por diseño, porque no da acceso a
// nada por sí sola. Menos piezas, menos formas de romperse.
//
// SETUP — variables de entorno en Vercel:
//   ANTHROPIC_API_KEY=sk-ant-xxxx            (obligatoria)
//   ANTHROPIC_MODEL=claude-sonnet-5          (opcional)
//   FIREBASE_API_KEY=AIza...                 (opcional, ver abajo)
//   APP_URL=https://fleetcore.cl             (opcional, para CORS)
// ============================================================

const MEDIA_PERMITIDOS = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];

// Vercel corta los cuerpos sobre ~4.5 MB y base64 infla un tercio.
const MAX_BYTES = 3 * 1024 * 1024;

// Misma key que usa el navegador. Se deja por defecto para que el endpoint
// funcione sin configurar nada más; la variable de entorno permite rotarla
// sin tocar el código.
const FIREBASE_API_KEY = process.env.FIREBASE_API_KEY
  || 'AIzaSyByzRUHnLrxAaZOS9Dap1Kl0ZH5STWWzKE';

// Valida el idToken contra el propio Firebase. Devuelve el uid, o null.
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
    const detalle = await r.text();
    console.error('Token rechazado por Identity Toolkit:', r.status, detalle);
    return null;
  }

  const data = await r.json();
  return data?.users?.[0]?.localId || null;
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
    // Marca de versión: sirve para saber desde fuera qué código está corriendo.
    console.log('extraer-estatutos v2 (identity-toolkit)');

    // ── Autenticación ──────────────────────────────────────
    // Sin esto el endpoint queda abierto y cualquiera puede consumir
    // la cuota de la API a tu costo.
    const header = req.headers.authorization || '';
    const idToken = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!idToken) {
      return res.status(401).json({ error: 'v2: la petición llegó sin token de sesión' });
    }

    const uid = await validarToken(idToken);
    if (!uid) {
      return res.status(401).json({
        error: 'v2: Firebase rechazó el token. Cierra sesión y vuelve a entrar.',
      });
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(500).json({
        error: 'Falta configurar ANTHROPIC_API_KEY en Vercel. Recuerda redeployar después de agregarla.',
      });
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
      // El detalle sí importa para depurar: una key inválida y un modelo mal
      // escrito fallan igual desde el navegador si no se distinguen.
      const motivo = respuesta.status === 401 ? ' (ANTHROPIC_API_KEY inválida)'
        : respuesta.status === 404 ? ' (nombre de modelo inexistente)'
        : respuesta.status === 429 ? ' (límite de uso alcanzado)'
        : '';
      return res.status(502).json({
        error: `No se pudo leer el documento${motivo}. Inténtalo de nuevo o llena los datos a mano.`,
      });
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
    return res.status(500).json({ error: `Error inesperado: ${err.message}` });
  }
}

// El cuerpo llega en base64 y puede pesar varios MB: el límite por defecto
// de Vercel (1 MB) lo rechazaría antes de llegar al handler.
export const config = {
  api: {
    bodyParser: { sizeLimit: '5mb' },
  },
};
