// ============================================================
// FLEETCORE — FIREBASE FUNCTIONS v7+
// functions/index.js
// ============================================================

const { onRequest } = require('firebase-functions/v2/https');
const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { defineSecret } = require('firebase-functions/params');
const admin         = require('firebase-admin');
const cors          = require('cors')({ origin: true });
const { MercadoPagoConfig, PreApproval } = require('mercadopago');
const { sendEmail } = require('./ses');
const { sendWhatsapp } = require('./twilio');
const {
  entradaCombustible, voucherEntrega, genericNotification,
  whatsappEntrada, whatsappEntrega, whatsappTest,
} = require('./email-templates');

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

// ── SES Secrets ───────────────────────────────────────────────
// Configurar con: firebase functions:secrets:set AWS_SES_ACCESS_KEY_ID
//                 firebase functions:secrets:set AWS_SES_SECRET_ACCESS_KEY
//                 firebase functions:secrets:set AWS_SES_REGION
//                 firebase functions:secrets:set AWS_SES_SENDER
// Para desarrollo local: agregar las 4 variables a functions/.env
const AWS_SES_ACCESS_KEY_ID     = defineSecret('AWS_SES_ACCESS_KEY_ID');
const AWS_SES_SECRET_ACCESS_KEY = defineSecret('AWS_SES_SECRET_ACCESS_KEY');
const AWS_SES_REGION            = defineSecret('AWS_SES_REGION');
const AWS_SES_SENDER            = defineSecret('AWS_SES_SENDER');
const SES_SECRETS = [AWS_SES_ACCESS_KEY_ID, AWS_SES_SECRET_ACCESS_KEY, AWS_SES_REGION, AWS_SES_SENDER];

// ── Twilio Secrets ────────────────────────────────────────────
// Configurar con: firebase functions:secrets:set TWILIO_ACCOUNT_SID
//                 firebase functions:secrets:set TWILIO_AUTH_TOKEN
//                 firebase functions:secrets:set TWILIO_WHATSAPP_FROM
// Para desarrollo local: agregar las 3 variables a functions/.env
//
// Nota: Twilio NO está en la lista de secrets del trigger principal para
// permitir que el deploy funcione antes de que Twilio esté configurado.
// La función verifica en runtime si las credenciales existen antes de
// intentar enviar WhatsApp; si faltan, simplemente se omite.
const TWILIO_ACCOUNT_SID    = defineSecret('TWILIO_ACCOUNT_SID');
const TWILIO_AUTH_TOKEN     = defineSecret('TWILIO_AUTH_TOKEN');
const TWILIO_WHATSAPP_FROM  = defineSecret('TWILIO_WHATSAPP_FROM');
const TWILIO_SECRETS = [TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM];

// ── Config MercadoPago — lee desde process.env ────────────────
// Variables se definen en .env (local) o con:
// firebase functions:secrets:set MP_ACCESS_TOKEN_SANDBOX
function getMPClient() {
  const isProd = process.env.MP_ENV === 'production';
  const token  = isProd
    ? process.env.MP_ACCESS_TOKEN_PROD
    : process.env.MP_ACCESS_TOKEN_SANDBOX;
  if (!token) throw new Error('MP access token no configurado. Revisa las variables de entorno.');
  return new MercadoPagoConfig({ accessToken: token });
}

// ============================================================
// POST /createSubscription
// ============================================================
exports.createSubscription = onRequest((req, res) => {
  cors(req, res, async () => {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    try {
      const { planId, userId, userEmail, modules, total } = req.body;

      if (!userId || !userEmail || !planId || !total) {
        return res.status(400).json({ error: 'Faltan campos requeridos' });
      }

      const client      = getMPClient();
      const preApproval = new PreApproval(client);
      const appUrl      = process.env.APP_URL || 'https://fleetcore.web.app';

      const result = await preApproval.create({
        body: {
          reason:             `FleetCore — ${(modules || []).join(', ')}`,
          external_reference: `${userId}|${planId}`,
          payer_email:        userEmail,
          auto_recurring: {
            frequency:          1,
            frequency_type:     'months',
            transaction_amount: total,
            currency_id:        'CLP',
          },
          back_url: `${appUrl}/payment-result`,
          status:   'pending',
        },
      });

      await db.collection('subscription_intents').doc(userId).set({
        userId, userEmail, planId, modules, total,
        mpPreapprovalId: result.id,
        initPoint:       result.init_point,
        status:          'pending',
        createdAt:       admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });

      return res.status(200).json({
        success:       true,
        initPoint:     result.init_point,
        preapprovalId: result.id,
      });

    } catch (err) {
      console.error('createSubscription error:', err.message);
      return res.status(500).json({ error: err.message });
    }
  });
});

// ============================================================
// POST /webhookMercadoPago
// ============================================================
exports.webhookMercadoPago = onRequest((req, res) => {
  cors(req, res, async () => {
    if (req.method !== 'POST') return res.status(405).end();

    try {
      const { type, data } = req.body;

      if (type === 'subscription_preapproval' || type === 'subscription_authorized_payment') {
        const client      = getMPClient();
        const preApproval = new PreApproval(client);
        const sub         = await preApproval.get({ id: data.id });

        const [userId, planId] = (sub.external_reference || '').split('|');
        if (!userId) return res.status(200).end();

        const statusMap = {
          authorized: 'authorized',
          paused:     'paused',
          cancelled:  'cancelled',
          expired:    'cancelled',
        };

        await db.collection('subscriptions').doc(userId).set({
          userId, planId,
          mpPreapprovalId: sub.id,
          status:          statusMap[sub.status] || sub.status,
          updatedAt:       admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });

        if (type === 'subscription_authorized_payment') {
          await db.collection('payment_history').add({
            userId, planId,
            mpId:      data.id,
            eventType: type,
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
          });
        }
      }

      return res.status(200).end();
    } catch (err) {
      console.error('webhook error:', err);
      return res.status(500).end();
    }
  });
});

// ============================================================
// Funciones existentes — CNE, tipo de cambio
// ============================================================

const { onRequest: onReq } = require('firebase-functions/v2/https');
const axios   = require('axios');
const cheerio = require('cheerio');

exports.getFuelPrices = onReq(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
  try {
    const response   = await axios.get('https://www.bencinaenlinea.cl');
    const $          = cheerio.load(response.data);
    const prices     = {
      diesel:     Math.round(parseFloat($('.precio-diesel').first().text()) || 950),
      gasoline93: Math.round(parseFloat($('.precio-93').first().text())    || 1100),
      gasoline95: Math.round(parseFloat($('.precio-95').first().text())    || 1150),
      gasoline97: Math.round(parseFloat($('.precio-97').first().text())    || 1200),
      source:      'cne-scraping',
      lastUpdated: new Date().toISOString(),
    };
    await admin.firestore().collection('settings').doc('currentFuelPrice').set(prices);
    res.json(prices);
  } catch (error) {
    res.json({ diesel: 950, gasoline93: 1100, gasoline95: 1150, gasoline97: 1200, source: 'fallback', error: error.message });
  }
});

exports.getExchangeRate = onReq(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  try {
    const response = await axios.get('https://api.exchangerate-api.com/v4/latest/USD');
    res.json({ usdToClp: response.data.rates.CLP, lastUpdated: new Date().toISOString() });
  } catch (error) {
    res.json({ usdToClp: 950, lastUpdated: new Date().toISOString(), error: error.message });
  }
});

exports.getInternationalOilPrice = onReq(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  try {
    const { data }   = await axios.get('https://api.exchangerate-api.com/v4/latest/USD');
    const usdToClp   = data.rates.CLP;
    const wtiPrice   = 75;
    const diesel     = Math.round((wtiPrice / 159) * usdToClp * 2.0);
    res.json({ diesel, gasoline93: Math.round(diesel * 1.15), gasoline95: Math.round(diesel * 1.20), gasoline97: Math.round(diesel * 1.25), wtiPrice, usdToClp, source: 'international-estimate', lastUpdated: new Date().toISOString() });
  } catch (error) {
    res.json({ diesel: 950, gasoline93: 1100, gasoline95: 1150, gasoline97: 1200, source: 'fallback', error: error.message });
  }
});

// ============================================================
// POST /createUser
// Crea un usuario en Firebase Auth y su doc en /users/{uid}
// Solo puede ser llamado por superadmin o admin_contrato
// ============================================================
exports.createUser = onRequest((req, res) => {
  cors(req, res, async () => {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    try {
      const { email, password, nombre, rut, role, empresaId, modulos, cargo, callerUid, savePassword } = req.body;

      if (!email || !password || !role || !empresaId || !callerUid) {
        return res.status(400).json({ error: 'Faltan campos requeridos: email, password, role, empresaId, callerUid' });
      }

      // Verificar que quien llama tiene permiso (superadmin o admin_contrato de esa empresa)
      const callerDoc = await db.collection('users').doc(callerUid).get();
      if (!callerDoc.exists) return res.status(403).json({ error: 'Usuario no autorizado' });
      const callerData = callerDoc.data();
      const isSuper = callerData.role === 'superadmin';
      const isAdmin = callerData.role === 'admin_contrato' && callerData.empresaId === empresaId;
      if (!isSuper && !isAdmin) return res.status(403).json({ error: 'Sin permisos para crear usuarios' });

      // Crear usuario en Firebase Auth
      const userRecord = await admin.auth().createUser({
        email,
        password,
        displayName: nombre || email.split('@')[0],
      });

      // Crear documento en /users/{uid}
      const userData = {
        email,
        nombre:    nombre || '',
        rut:       rut    || '',
        role,
        empresaId,
        modulos:   modulos || [],
        cargo:     cargo   || '',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };
      // Guardar contraseña para generación de QR de acceso rápido
      if (savePassword && password) userData.password = password;
      await db.collection('users').doc(userRecord.uid).set(userData);

      return res.status(200).json({ success: true, uid: userRecord.uid });

    } catch (err) {
      console.error('createUser error:', err.message);
      // Traducir errores comunes de Auth
      if (err.code === 'auth/email-already-exists') {
        return res.status(400).json({ error: 'Este email ya tiene una cuenta registrada' });
      }
      if (err.code === 'auth/invalid-email') {
        return res.status(400).json({ error: 'Email inválido' });
      }
      if (err.code === 'auth/weak-password') {
        return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
      }
      return res.status(500).json({ error: err.message });
    }
  });
});

// ============================================================
// EMAIL — utilidades internas
// ============================================================

// Resuelve el label legible de una referencia (machine, empresa, etc).
// Recibe la subcolección y el id; devuelve un string descriptivo o ''.
async function lookupLabel(empresaId, subcoleccion, docId, fields = ['nombre', 'name', 'patente']) {
  if (!docId) return '';
  try {
    const snap = await db.collection('empresas').doc(empresaId).collection(subcoleccion).doc(docId).get();
    if (!snap.exists) return '';
    const data = snap.data() || {};
    const parts = [];
    for (const f of fields) if (data[f]) parts.push(data[f]);
    if (data.rut) parts.push(`(${data.rut})`);
    return parts.join(' ').trim();
  } catch (e) {
    console.warn({ event: 'lookup_err', subcoleccion, docId, message: e.message });
    return '';
  }
}

// Busca el email de un trabajador/usuario.
async function lookupEmail(empresaId, trabajadorOrUserId) {
  if (!trabajadorOrUserId) return null;
  try {
    // Primero en /users
    const u = await db.collection('users').doc(trabajadorOrUserId).get();
    if (u.exists && u.data().email) return u.data().email;
    // Luego en trabajadores de la empresa
    const t = await db.collection('empresas').doc(empresaId).collection('trabajadores').doc(trabajadorOrUserId).get();
    if (t.exists && t.data().email) return t.data().email;
  } catch (e) {
    console.warn({ event: 'email_lookup_err', id: trabajadorOrUserId, message: e.message });
  }
  return null;
}

// Lee la config de notificaciones de la empresa y devuelve los destinatarios
// (emails y whatsapps) que aplican al evento.
async function getNotifTargets(empresaId, eventoTipo) {
  const emails = new Set();
  const whatsapps = new Set();
  let enabled = true;
  try {
    const cfg = await db.collection('empresas').doc(empresaId).collection('notifConfig').doc('destinatarios').get();
    if (cfg.exists) {
      const data = cfg.data() || {};
      if (data.enabled === false) enabled = false;
      for (const item of (data.emails || [])) {
        const ev = item.eventos || ['entrada', 'entrega'];
        if (ev.includes(eventoTipo) && item.email) emails.add(String(item.email).toLowerCase());
      }
      for (const item of (data.whatsapps || [])) {
        const ev = item.eventos || ['entrada', 'entrega'];
        if (ev.includes(eventoTipo) && item.numero) whatsapps.add(String(item.numero).trim());
      }
    }
  } catch (e) {
    console.warn({ event: 'notifcfg_err', empresaId, message: e.message });
  }
  if (!enabled) return { emails: [], whatsapps: [] };
  // Siempre incluir para debug
  emails.add('felipesalazar3015@gmail.com');

  // Asegurar admin_contrato de la empresa
  try {
    const q = await db.collection('users').where('empresaId', '==', empresaId).where('role', '==', 'admin_contrato').get();
    q.forEach(d => { if (d.data().email) emails.add(String(d.data().email).toLowerCase()); });
  } catch (e) {
    console.warn({ event: 'admin_lookup_err', empresaId, message: e.message });
  }

  return { emails: Array.from(emails), whatsapps: Array.from(whatsapps) };
}

async function getEmpresaNombre(empresaId) {
  try {
    const e = await db.collection('empresas').doc(empresaId).get();
    return e.exists ? (e.data().nombre || e.data().name || empresaId) : empresaId;
  } catch { return empresaId; }
}

// ============================================================
// TRIGGER — Email al crear reporte de combustible
// ============================================================
exports.onReporteCombustibleCreated = onDocumentCreated(
  { document: 'empresas/{empresaId}/reportes_combustible/{reporteId}', secrets: SES_SECRETS },
  async (event) => {
    const { empresaId, reporteId } = event.params;
    const snap = event.data;
    if (!snap) return;
    const reporte = snap.data() || {};

    // Idempotencia
    if (reporte.notifSent) return;

    try {
      const empresaNombre = await getEmpresaNombre(empresaId);
      const tipo = reporte.tipo;
      const { emails, whatsapps } = await getNotifTargets(empresaId, tipo);

      // El formulario guarda los campos de control (equipoSurtidorId, repartidorId, projectId)
      // en el TOP LEVEL del documento (spread `...datosControl`), no como subobjeto.
      // Soportamos ambos para robustez.
      const ctrl = reporte.datosControl || reporte;

      // Sumar email del operador receptor / repartidor si existen
      const dataMov = tipo === 'entrada' ? (reporte.datosEntrada || {}) : (reporte.datosEntrega || {});
      const operadorEmail = await lookupEmail(empresaId, dataMov.operadorId || ctrl.repartidorId);
      const extraEmail = dataMov.extraEmail;
      const allTo = [...emails, operadorEmail, extraEmail].filter(Boolean);

      // Resolver labels
      const equipoSurtidorLabel = await lookupLabel(empresaId, 'equipos_surtidores', ctrl.equipoSurtidorId, ['nombre', 'patente']);
      const machineLabel        = await lookupLabel(empresaId, 'machines', dataMov.machineId, ['name', 'nombre', 'code', 'patente']);
      const operadorLabel       = await lookupLabel(empresaId, 'trabajadores', dataMov.operadorId, ['nombre', 'apellido', 'name']);

      let template;
      let waBody;
      if (tipo === 'entrada') {
        const origenSubcol = reporte.datosEntrada?.tipoOrigen === 'estacion' ? 'estaciones_combustible' : 'empresas_combustible';
        const origenLabel = await lookupLabel(empresaId, origenSubcol, reporte.datosEntrada?.origen, ['nombre', 'marca']);
        template = entradaCombustible({ reporte, empresaNombre, origenLabel, equipoSurtidorLabel, machineLabel, operadorLabel });
        waBody   = whatsappEntrada({ reporte, empresaNombre, origenLabel, machineLabel });
      } else if (tipo === 'entrega') {
        const empresaReceptora = await lookupLabel(empresaId, 'empresas_combustible', reporte.datosEntrega?.empresa, ['nombre']);
        template = voucherEntrega({ reporte, empresaNombre, empresaReceptora, equipoSurtidorLabel, machineLabel, operadorLabel });
        waBody   = whatsappEntrega({ reporte, empresaNombre, machineLabel, operadorLabel });
      } else {
        console.log({ event: 'notif_skip', reason: 'tipo_desconocido', tipo, reporteId });
        return;
      }

      // WhatsApp es opcional: solo intentar si Twilio está configurado.
      // Si las credenciales son placeholder o faltan, omitimos sin tumbar el email.
      const twilioConfigured = whatsapps.length > 0
        && process.env.TWILIO_ACCOUNT_SID
        && !String(process.env.TWILIO_ACCOUNT_SID).startsWith('PLACEHOLDER')
        && process.env.TWILIO_AUTH_TOKEN
        && !String(process.env.TWILIO_AUTH_TOKEN).startsWith('PLACEHOLDER');

      // Email + WhatsApp en paralelo, sin que uno tumbe al otro
      const [emailRes, waRes] = await Promise.allSettled([
        allTo.length > 0
          ? sendEmail({ to: allTo, subject: template.subject, html: template.html, text: template.text, replyTo: process.env.AWS_SES_REPLY_TO })
          : Promise.resolve({ skipped: true, reason: 'no_recipients' }),
        twilioConfigured
          ? sendWhatsapp({ to: whatsapps, body: waBody })
          : Promise.resolve({ skipped: true, reason: 'twilio_not_configured' }),
      ]);

      const update = {
        notifSent: true,
        notifSentAt: admin.firestore.FieldValue.serverTimestamp(),
        notifTo: allTo,
        notifWhatsapps: whatsapps,
      };
      if (emailRes.status === 'fulfilled') {
        update.notifMessageId = emailRes.value.messageId || null;
      } else {
        update.notifEmailError = emailRes.reason?.message || String(emailRes.reason);
      }
      if (waRes.status === 'fulfilled') {
        update.notifWhatsappResult = waRes.value;
      } else {
        update.notifWhatsappError = waRes.reason?.message || String(waRes.reason);
      }

      await snap.ref.set(update, { merge: true });
      console.log({ event: 'notif_ok', reporteId, empresaId, tipo, emails: allTo.length, whatsapps: whatsapps.length });
    } catch (err) {
      console.error({ event: 'notif_err', reporteId, empresaId, message: err.message, stack: err.stack });
      await snap.ref.set({
        notifError: err.message,
        notifErrorAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
    }
  }
);

// ============================================================
// POST/GET /testEmail
// Endpoint para probar la integración SES manualmente.
// Uso: GET https://<region>-<projectId>.cloudfunctions.net/testEmail?to=tu@email&subject=hola
// ============================================================
exports.testEmail = onRequest({ secrets: SES_SECRETS }, (req, res) => {
  cors(req, res, async () => {
    try {
      const to = req.query.to || req.body?.to;
      if (!to) return res.status(400).json({ error: 'Falta query/body "to"' });
      const subject = req.query.subject || req.body?.subject || 'FleetCore — email de prueba';
      const tpl = genericNotification({
        title: subject,
        heading: '✅ Integración SES OK',
        body: `Este es un email de prueba enviado desde FleetCore Cloud Functions a las <strong>${new Date().toISOString()}</strong>.<br><br>Si recibís este correo, la integración con AWS SES está funcionando correctamente.`,
        ctaUrl: process.env.APP_URL || 'https://fleetcore.cl',
        ctaLabel: 'Ir a FleetCore',
      });
      const result = await sendEmail({ to, subject: tpl.subject, html: tpl.html, text: tpl.text });
      return res.status(200).json({ success: true, ...result });
    } catch (err) {
      console.error('testEmail error:', err.message);
      return res.status(500).json({ error: err.message });
    }
  });
});

// ============================================================
// POST/GET /testWhatsapp
// Endpoint para probar la integración Twilio manualmente.
// Uso: GET https://<region>-<projectId>.cloudfunctions.net/testWhatsapp?to=+56912345678
// ⚠️ Si TWILIO_WHATSAPP_FROM apunta al sandbox de Twilio,
//    el destinatario debe haber enviado "join <código>" antes.
// ============================================================
// Nota: si Twilio aún no está configurado en Secret Manager, este endpoint
// fallará en runtime con "Twilio no configurado". El deploy NO falla porque
// no listamos TWILIO_SECRETS en la opción `secrets:` (firebase solo valida
// los secrets que efectivamente referenciás). Cuando Twilio esté listo,
// reemplazá la línea siguiente por: onRequest({ secrets: TWILIO_SECRETS }, …)
exports.testWhatsapp = onRequest({}, (req, res) => {
  cors(req, res, async () => {
    try {
      const to = req.query.to || req.body?.to;
      if (!to) return res.status(400).json({ error: 'Falta query/body "to" (formato +56912345678)' });
      const message = req.query.message || req.body?.message || `Test desde FleetCore — ${new Date().toISOString()}`;
      const body = whatsappTest({ message });
      const result = await sendWhatsapp({ to, body });
      return res.status(200).json({ success: true, ...result });
    } catch (err) {
      console.error('testWhatsapp error:', err.message);
      return res.status(500).json({ error: err.message });
    }
  });
});
