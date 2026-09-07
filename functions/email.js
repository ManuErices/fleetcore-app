// ============================================================
// FLEETCORE — EMAIL UTILITY (Resend)
// functions/email.js
//
// Wrapper sobre Resend para envío de emails desde Cloud Functions.
// - Lee credenciales de Firebase Secrets / process.env (RESEND_API_KEY, RESEND_FROM).
// - Valida y deduplica destinatarios.
// - Retry con backoff exponencial (3 intentos) ante 5xx/throttling (429).
// - Logging estructurado para Cloud Logging.
//
// NIVEL 1: se envía siempre desde un dominio propio verificado (RESEND_FROM).
// El remitente NO cambia por empresa; lo editable por el admin del cliente es
// el Reply-To (parámetro `replyTo`), que no requiere DNS.
// ============================================================

const { Resend } = require('resend');

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

let _resend = null;
function getResend() {
  if (_resend) return _resend;
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error('Resend no configurado: falta RESEND_API_KEY');
  }
  _resend = new Resend(apiKey);
  return _resend;
}

function normalizeRecipients(input) {
  if (!input) return [];
  const arr = Array.isArray(input) ? input : [input];
  const seen = new Set();
  const out = [];
  for (const raw of arr) {
    if (!raw) continue;
    const email = String(raw).trim().toLowerCase();
    if (!EMAIL_REGEX.test(email)) continue;
    if (seen.has(email)) continue;
    seen.add(email);
    out.push(email);
  }
  return out;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function sendEmail({ to, cc, bcc, subject, html, text, replyTo, from }) {
  const toAddresses = normalizeRecipients(to);
  const ccAddresses = normalizeRecipients(cc);
  const bccAddresses = normalizeRecipients(bcc);

  if (toAddresses.length === 0 && ccAddresses.length === 0 && bccAddresses.length === 0) {
    console.log({ event: 'email_skip', reason: 'no_recipients', subject });
    return { skipped: true, reason: 'no_recipients' };
  }
  if (!subject) throw new Error('sendEmail: subject requerido');
  if (!html && !text) throw new Error('sendEmail: html o text requerido');

  const sender = from || process.env.RESEND_FROM;
  if (!sender) throw new Error('sendEmail: RESEND_FROM no configurado');

  const replyToAddresses = normalizeRecipients(replyTo);

  const payload = {
    from: sender,
    to: toAddresses,
    ...(ccAddresses.length ? { cc: ccAddresses } : {}),
    ...(bccAddresses.length ? { bcc: bccAddresses } : {}),
    subject,
    ...(html ? { html } : {}),
    ...(text ? { text } : {}),
    ...(replyToAddresses.length ? { replyTo: replyToAddresses } : {}),
  };

  const resend = getResend();
  const delays = [0, 500, 1500];
  let lastErr = null;
  for (let i = 0; i < delays.length; i++) {
    if (delays[i] > 0) await sleep(delays[i]);
    try {
      const { data, error } = await resend.emails.send(payload);
      if (error) {
        // Resend devuelve el error en el body, no lanza excepción.
        const status = error.statusCode || 0;
        const retriable = status >= 500 || status === 429;
        console.warn({ event: 'email_send_err', attempt: i + 1, retriable, name: error.name, message: error.message });
        lastErr = new Error(error.message || 'resend_error');
        lastErr.statusCode = status;
        if (!retriable) break;
        continue;
      }
      console.log({ event: 'email_send_ok', messageId: data?.id, to: toAddresses, subject, attempt: i + 1 });
      return { messageId: data?.id, to: toAddresses };
    } catch (err) {
      // Errores de red / SDK (timeouts, etc.)
      lastErr = err;
      const status = err.statusCode || 0;
      const retriable = status >= 500 || status === 429 || status === 0;
      console.warn({ event: 'email_send_err', attempt: i + 1, retriable, code: err.code, message: err.message });
      if (!retriable) break;
    }
  }
  throw lastErr || new Error('email_send_failed');
}

module.exports = { sendEmail, normalizeRecipients };
