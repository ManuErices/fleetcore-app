// ============================================================
// FLEETCORE — SES UTILITY (AWS SDK v2)
// functions/ses.js
//
// Wrapper sobre AWS SES v2 para envío de emails desde Cloud Functions.
// - Lee credenciales de Firebase Secrets / process.env.
// - Valida y deduplica destinatarios.
// - Retry con backoff exponencial (3 intentos) ante 5xx/throttling.
// - Logging estructurado para Cloud Logging.
// ============================================================

const AWS = require('aws-sdk');

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

let _ses = null;
function getSES() {
  if (_ses) return _ses;
  const region = process.env.AWS_SES_REGION;
  const accessKeyId = process.env.AWS_SES_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SES_SECRET_ACCESS_KEY;
  if (!region || !accessKeyId || !secretAccessKey) {
    throw new Error('SES no configurado: faltan AWS_SES_REGION/AWS_SES_ACCESS_KEY_ID/AWS_SES_SECRET_ACCESS_KEY');
  }
  _ses = new AWS.SES({ region, accessKeyId, secretAccessKey, apiVersion: '2010-12-01' });
  return _ses;
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
    console.log({ event: 'ses_skip', reason: 'no_recipients', subject });
    return { skipped: true, reason: 'no_recipients' };
  }
  if (!subject) throw new Error('sendEmail: subject requerido');
  if (!html && !text) throw new Error('sendEmail: html o text requerido');

  const sender = from || process.env.AWS_SES_SENDER;
  if (!sender) throw new Error('sendEmail: AWS_SES_SENDER no configurado');

  const params = {
    Source: sender,
    Destination: { ToAddresses: toAddresses, CcAddresses: ccAddresses, BccAddresses: bccAddresses },
    Message: {
      Subject: { Data: subject, Charset: 'UTF-8' },
      Body: {
        ...(html ? { Html: { Data: html, Charset: 'UTF-8' } } : {}),
        ...(text ? { Text: { Data: text, Charset: 'UTF-8' } } : {}),
      },
    },
    ...(replyTo ? { ReplyToAddresses: normalizeRecipients(replyTo) } : {}),
  };

  const ses = getSES();
  const delays = [0, 500, 1500];
  let lastErr = null;
  for (let i = 0; i < delays.length; i++) {
    if (delays[i] > 0) await sleep(delays[i]);
    try {
      const res = await ses.sendEmail(params).promise();
      console.log({ event: 'ses_send_ok', messageId: res.MessageId, to: toAddresses, subject, attempt: i + 1 });
      return { messageId: res.MessageId, to: toAddresses };
    } catch (err) {
      lastErr = err;
      const status = err.statusCode || err?.$metadata?.httpStatusCode || 0;
      const retriable = status >= 500 || err.code === 'Throttling' || err.code === 'ThrottlingException' || err.retryable === true;
      console.warn({ event: 'ses_send_err', attempt: i + 1, retriable, code: err.code, message: err.message });
      if (!retriable) break;
    }
  }
  throw lastErr || new Error('ses_send_failed');
}

module.exports = { sendEmail, normalizeRecipients };
