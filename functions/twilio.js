// ============================================================
// FLEETCORE — TWILIO WHATSAPP UTILITY
// functions/twilio.js
//
// Wrapper sobre Twilio Node SDK para envío de WhatsApp.
// - Lee credenciales de Firebase Secrets / process.env.
// - Valida y deduplica números (formato E.164).
// - Retry con backoff exponencial ante 5xx/throttling.
// - Logging estructurado.
//
// Modo sandbox (default Twilio): cada destinatario debe haber enviado
// "join <código>" al número TWILIO_WHATSAPP_FROM antes.
// Modo producción: TWILIO_WHATSAPP_FROM debe ser un número aprobado
// y los mensajes "notification" deben usar templates HSM aprobados.
// ============================================================

let _client = null;
function getClient() {
  if (_client) return _client;
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) {
    throw new Error('Twilio no configurado: faltan TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN');
  }
  // Lazy require: solo carga el SDK cuando realmente se necesita
  const twilio = require('twilio');
  _client = twilio(sid, token);
  return _client;
}

// Acepta '+56912345678', '56912345678', '912345678' (asumiendo CL),
// 'whatsapp:+56...'. Devuelve 'whatsapp:+E164' o null si inválido.
function normalizeWhatsapp(raw, defaultCountry = '56') {
  if (!raw) return null;
  let s = String(raw).trim();
  if (s.startsWith('whatsapp:')) s = s.slice(9);
  s = s.replace(/[\s\-().]/g, '');
  if (s.startsWith('00')) s = '+' + s.slice(2);
  if (!s.startsWith('+')) {
    // Si arranca con el código país sin +
    if (/^\d{11,15}$/.test(s)) s = '+' + s;
    // Caso CL nacional 9 dígitos (móvil "9XXXXXXXX")
    else if (/^9\d{8}$/.test(s)) s = '+' + defaultCountry + s;
    else return null;
  }
  if (!/^\+\d{8,15}$/.test(s)) return null;
  return 'whatsapp:' + s;
}

function normalizeRecipients(input, defaultCountry) {
  if (!input) return [];
  const arr = Array.isArray(input) ? input : [input];
  const seen = new Set();
  const out = [];
  for (const raw of arr) {
    const w = normalizeWhatsapp(raw, defaultCountry);
    if (!w) continue;
    if (seen.has(w)) continue;
    seen.add(w);
    out.push(w);
  }
  return out;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/**
 * Envía un WhatsApp por destinatario (Twilio no acepta múltiples to en una
 * sola llamada). Retorna { sent: [...], errors: [...] }.
 *
 * @param {Object} args
 * @param {string|string[]} args.to  Números (cualquier formato; se normaliza a whatsapp:+E164)
 * @param {string} args.body         Cuerpo del mensaje (texto, hasta 1600 chars)
 * @param {string} [args.contentSid] Para producción: SID de Content (template HSM)
 * @param {Object} [args.contentVariables] Variables para template HSM
 * @param {string} [args.from]       Override sender (default TWILIO_WHATSAPP_FROM)
 */
async function sendWhatsapp({ to, body, contentSid, contentVariables, from }) {
  const recipients = normalizeRecipients(to);
  if (recipients.length === 0) {
    console.log({ event: 'twilio_skip', reason: 'no_recipients' });
    return { sent: [], errors: [], skipped: true };
  }
  if (!body && !contentSid) throw new Error('sendWhatsapp: body o contentSid requerido');

  const sender = from || process.env.TWILIO_WHATSAPP_FROM;
  if (!sender) throw new Error('sendWhatsapp: TWILIO_WHATSAPP_FROM no configurado');
  const fromAddr = sender.startsWith('whatsapp:') ? sender : 'whatsapp:' + sender;

  const client = getClient();
  const delays = [0, 500, 1500];
  const sent = [];
  const errors = [];

  for (const dest of recipients) {
    const params = { from: fromAddr, to: dest };
    if (contentSid) {
      params.contentSid = contentSid;
      if (contentVariables) params.contentVariables = JSON.stringify(contentVariables);
    } else {
      params.body = body;
    }

    let lastErr = null;
    for (let i = 0; i < delays.length; i++) {
      if (delays[i] > 0) await sleep(delays[i]);
      try {
        const msg = await client.messages.create(params);
        console.log({ event: 'twilio_send_ok', sid: msg.sid, to: dest, attempt: i + 1, status: msg.status });
        sent.push({ to: dest, sid: msg.sid, status: msg.status });
        lastErr = null;
        break;
      } catch (err) {
        lastErr = err;
        const status = err.status || err.statusCode || 0;
        const retriable = status >= 500 || err.code === 20429; // 20429 = Twilio rate limit
        console.warn({ event: 'twilio_send_err', attempt: i + 1, retriable, code: err.code, status, message: err.message, to: dest });
        if (!retriable) break;
      }
    }
    if (lastErr) errors.push({ to: dest, code: lastErr.code, message: lastErr.message });
  }

  return { sent, errors };
}

module.exports = { sendWhatsapp, normalizeWhatsapp, normalizeRecipients };
