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
const { WebpayPlus } = require('transbank-sdk');
const axios = require('axios');
const { sendEmail } = require('./ses');
const { sendWhatsapp } = require('./twilio');
const {
  entradaCombustible, voucherEntrega, genericNotification,
  whatsappEntrada, whatsappEntrega, whatsappTest,
  invitacionUsuario,
} = require('./email-templates');

const { MigaduClient } = require('./migadu');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const crypto = require('crypto');
const dns = require('dns').promises;
const { FieldValue } = require('firebase-admin/firestore');

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

// ── Migadu & Gemini Secrets ───────────────────────────────────
const MIGADU_API_USER = defineSecret('MIGADU_API_USER');
const MIGADU_API_KEY  = defineSecret('MIGADU_API_KEY');
const MIGADU_VERIFICATION_TOKEN = defineSecret('MIGADU_VERIFICATION_TOKEN');
const GEMINI_API_KEY  = defineSecret('GEMINI_API_KEY');

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
        createdAt:       FieldValue.serverTimestamp(),
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
          updatedAt:       FieldValue.serverTimestamp(),
        }, { merge: true });

        if (type === 'subscription_authorized_payment') {
          await db.collection('payment_history').add({
            userId, planId,
            mpId:      data.id,
            eventType: type,
            timestamp: FieldValue.serverTimestamp(),
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
// POST /createWebpaySubscription
// ============================================================
exports.createWebpaySubscription = onRequest((req, res) => {
  cors(req, res, async () => {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    try {
      const { planId, userId, userEmail, priceUf, modules } = req.body;

      if (!userId || !userEmail || !planId || priceUf === undefined) {
        return res.status(400).json({ error: 'Faltan campos requeridos' });
      }

      // 1. Obtener valor UF del día
      let ufRate = 38300;
      try {
        const ufRes = await axios.get('https://mindicador.cl/api/uf');
        if (ufRes.data && ufRes.data.serie && ufRes.data.serie[0]) {
          ufRate = Math.round(ufRes.data.serie[0].valor);
        }
      } catch (ufErr) {
        console.warn('Error fetching UF:', ufErr.message);
      }

      const totalClp = Math.round(priceUf * 1.19 * ufRate);

      // 2. Configurar Transbank
      const tx = new WebpayPlus.Transaction();
      const buyOrder = "FC-" + Math.floor(Math.random() * 1000000);
      const sessionId = userId;

      const projectId = admin.apps[0].options.projectId;
      const region = 'us-central1';
      const returnUrl = `https://${region}-${projectId}.cloudfunctions.net/webpayConfirm`;

      // 3. Crear la transacción
      const result = await tx.create(buyOrder, sessionId, totalClp, returnUrl);

      // 4. Guardar intent de pago
      await db.collection('subscription_intents').doc(userId).set({
        userId,
        userEmail,
        planId,
        modules: modules || planId.split(','),
        total: totalClp,
        token: result.token,
        gateway: 'webpay',
        status: 'pending',
        createdAt: FieldValue.serverTimestamp(),
      }, { merge: true });

      return res.status(200).json({
        success: true,
        url: result.url,
        token: result.token,
      });

    } catch (err) {
      console.error('createWebpaySubscription error:', err.message);
      return res.status(500).json({ error: err.message });
    }
  });
});

// ============================================================
// POST/GET /webpayConfirm
// ============================================================
exports.webpayConfirm = onRequest((req, res) => {
  cors(req, res, async () => {
    const token = req.query.token_ws || req.body?.token_ws;
    const tbkToken = req.query.TBK_TOKEN || req.body?.TBK_TOKEN;

    const appUrl = process.env.APP_URL || 'https://fleetcore.web.app';

    if (!token && !tbkToken) {
      return res.redirect(`${appUrl}/payment-result?status=failure&reason=no_token`);
    }

    try {
      const tx = new WebpayPlus.Transaction();

      if (tbkToken && !token) {
        const intentsSnap = await db.collection('subscription_intents')
          .where('token', '==', tbkToken)
          .limit(1)
          .get();

        if (!intentsSnap.empty) {
          const intentDoc = intentsSnap.docs[0];
          await intentDoc.ref.set({ status: 'aborted', updatedAt: FieldValue.serverTimestamp() }, { merge: true });
        }
        return res.redirect(`${appUrl}/payment-result?status=failure&reason=user_abort`);
      }

      const result = await tx.commit(token);

      const intentsSnap = await db.collection('subscription_intents')
        .where('token', '==', token)
        .limit(1)
        .get();

      if (intentsSnap.empty) {
        console.error('No se encontró intent para el token:', token);
        return res.redirect(`${appUrl}/payment-result?status=failure&reason=intent_not_found`);
      }

      const intentDoc = intentsSnap.docs[0];
      const { userId, planId, modules, total } = intentDoc.data();

      if (result.response_code === 0) {
        await intentDoc.ref.set({
          status: 'success',
          vci: result.vci,
          buyOrder: result.buy_order,
          paymentTypeCode: result.payment_type_code,
          cardNumber: result.card_detail?.card_number || '',
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });

        await db.collection('subscriptions').doc(userId).set({
          userId,
          planId,
          modules,
          gateway: 'webpay',
          status: 'authorized',
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });

        await db.collection('payment_history').add({
          userId,
          planId,
          buyOrder: result.buy_order,
          gateway: 'webpay',
          total,
          timestamp: FieldValue.serverTimestamp(),
        });

        return res.redirect(`${appUrl}/payment-result?status=success`);
      } else {
        await intentDoc.ref.set({
          status: 'rejected',
          responseCode: result.response_code,
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });

        return res.redirect(`${appUrl}/payment-result?status=failure&reason=rejected&code=${result.response_code}`);
      }

    } catch (err) {
      console.error('webpayConfirm error:', err.message);
      return res.redirect(`${appUrl}/payment-result?status=failure&reason=${encodeURIComponent(err.message)}`);
    }
  });
});

// ============================================================
// Funciones existentes — CNE, tipo de cambio
// ============================================================

const { onRequest: onReq } = require('firebase-functions/v2/https');
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
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
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

  // Siempre incluir al remitente para registro/auditoría (antes del check de enabled)
  try {
    const senderRaw = process.env.AWS_SES_SENDER || '';
    const match = senderRaw.match(/<(.+)>|(\S+@\S+)/);
    const senderEmail = match ? (match[1] || match[2]) : null;
    if (senderEmail) emails.add(senderEmail.toLowerCase());
    else console.warn('getNotifTargets: AWS_SES_SENDER vacío o inválido');
  } catch (e) {
    console.warn('Error al extraer senderEmail para auditoría:', e.message);
  }

  if (!enabled) {
    console.log({ event: 'notif_disabled', empresaId, auditEmail: Array.from(emails) });
    return { emails: Array.from(emails), whatsapps: [] };
  }

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

      // DIAGNOSTICO: Ver destinatarios finales
      console.log('[DIAGNOSTICO SES] Intentando enviar email...', {
        empresaId,
        reporteId,
        allTo,
        sender: process.env.AWS_SES_SENDER,
        region: process.env.AWS_SES_REGION
      });

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
        notifSentAt: FieldValue.serverTimestamp(),
        notifTo: allTo,
        notifWhatsapps: whatsapps,
      };
      if (emailRes.status === 'fulfilled') {
        console.log('[DIAGNOSTICO SES] Resultado Email:', emailRes.value);
        update.notifMessageId = emailRes.value.messageId || null;
      } else {
        console.error('[DIAGNOSTICO SES] ERROR Email:', emailRes.reason?.message || emailRes.reason);
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
        notifErrorAt: FieldValue.serverTimestamp(),
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

// ============================================================
// TRIGGER — Email al crear invitación de usuario
// ============================================================
exports.onInvitacionCreada = onDocumentCreated(
  { document: 'invitaciones/{invitationId}', secrets: SES_SECRETS },
  async (event) => {
    const { invitationId } = event.params;
    const snap = event.data;
    if (!snap) return;
    const inv = snap.data() || {};

    const emailDestino = inv.emailDestino;
    if (!emailDestino) return;

    try {
      const empresaNombre = await getEmpresaNombre(inv.empresaId);
      const appUrl = process.env.APP_URL || 'https://fleetcore.web.app';
      const link = `${appUrl}/invite/${invitationId}`;

      const { subject, html } = invitacionUsuario({
        emailDestino,
        rol: inv.rol,
        link,
        empresaNombre,
        diasExpira: inv.diasExpira || 7,
      });

      await sendEmail({ to: emailDestino, subject, html });
      await snap.ref.set({ emailEnviado: true, emailEnviadoAt: FieldValue.serverTimestamp() }, { merge: true });
      console.log({ event: 'invite_email_ok', invitationId, emailDestino });
    } catch (err) {
      console.error({ event: 'invite_email_err', invitationId, message: err.message });
      await snap.ref.set({ emailError: err.message }, { merge: true });
    }
  }
);

// ============================================================
// EMAIL PORTAL — DOMAINS & MAILBOXES (MIGADU)
// ============================================================

// Helper to check user permission
async function checkUserPermission(userId, empresaId) {
  if (!userId || !empresaId) return false;
  const userDoc = await db.collection('users').doc(userId).get();
  if (!userDoc.exists) return false;
  const userData = userDoc.data();
  return userData.empresaId === empresaId || userData.role === 'superadmin';
}

// ── emailRegisterDomain ───────────────────────────────────────
exports.emailRegisterDomain = onRequest({ secrets: [MIGADU_API_USER, MIGADU_API_KEY, MIGADU_VERIFICATION_TOKEN] }, (req, res) => {
  cors(req, res, async () => {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    try {
      const { domainName, empresaId, userId } = req.body;
      if (!domainName || !empresaId || !userId) {
        return res.status(400).json({ error: 'Faltan campos requeridos: domainName, empresaId, userId' });
      }

      // Check permission
      const authorized = await checkUserPermission(userId, empresaId);
      if (!authorized) {
        return res.status(403).json({ error: 'Usuario no autorizado' });
      }

      // Validate domain format
      const domainRegex = /^[a-z0-9]+([\-\.]{1}[a-z0-9]+)*\.[a-z]{2,5}$/i;
      if (!domainRegex.test(domainName)) {
        return res.status(400).json({ error: 'Formato de dominio inválido' });
      }

      const lowerDomain = domainName.toLowerCase();
      const domainRef = db.collection('domains').doc(lowerDomain);
      const domainDoc = await domainRef.get();

      if (domainDoc.exists) {
        return res.status(409).json({ error: 'El dominio ya está registrado en FleetCore' });
      }

      const verificationToken = "hosted-email-verify=" + (process.env.MIGADU_VERIFICATION_TOKEN || "yagnt7wy");

      // Register in Migadu
      const apiUser = process.env.MIGADU_API_USER;
      const apiKey = process.env.MIGADU_API_KEY;
      const migadu = new MigaduClient(apiUser, apiKey);

      try {
        await migadu.createDomain(lowerDomain);
      } catch (migaduError) {
        // Si falló la creación, verifiquemos si es porque ya existe en la cuenta de Migadu
        try {
          await migadu.getDomainDetails(lowerDomain);
          console.log(`El dominio ${lowerDomain} ya existe en Migadu. Procediendo con el registro local.`);
        } catch (checkError) {
          const detail = migaduError.response?.data?.message || migaduError.response?.data || migaduError.message;
          console.error('Migadu createDomain error:', detail);
          return res.status(502).json({ error: `Error de Migadu: ${detail}` });
        }
      }

      // Save to Firestore
      await domainRef.set({
        domainName: lowerDomain,
        empresaId,
        verificationToken,
        isVerified: false,
        createdAt: FieldValue.serverTimestamp(),
      });

      const dnsRecords = {
        verification: {
          type: "TXT",
          host: "@",
          value: verificationToken,
          ttl: 3600
        },
        mx: [
          { type: "MX", host: "@", value: "aspmx1.migadu.com.", priority: 10, ttl: 3600 },
          { type: "MX", host: "@", value: "aspmx2.migadu.com.", priority: 20, ttl: 3600 }
        ],
        spf: {
          type: "TXT",
          host: "@",
          value: "v=spf1 include:spf.migadu.com ~all",
          ttl: 3600
        },
        dkim: [
          { type: "CNAME", host: "key1._domainkey", value: `key1.${lowerDomain}._domainkey.migadu.com.`, ttl: 3600 },
          { type: "CNAME", host: "key2._domainkey", value: `key2.${lowerDomain}._domainkey.migadu.com.`, ttl: 3600 },
          { type: "CNAME", host: "key3._domainkey", value: `key3.${lowerDomain}._domainkey.migadu.com.`, ttl: 3600 }
        ]
      };

      return res.status(200).json({
        success: true,
        message: 'Dominio registrado. Configure sus registros DNS.',
        verificationToken,
        dnsRecords
      });

    } catch (err) {
      console.error('emailRegisterDomain error:', err.message);
      return res.status(500).json({ error: err.message });
    }
  });
});

// ── emailVerifyDomain ─────────────────────────────────────────
exports.emailVerifyDomain = onRequest({ secrets: [MIGADU_API_USER, MIGADU_API_KEY] }, (req, res) => {
  cors(req, res, async () => {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    try {
      const { domainName, userId } = req.body;
      if (!domainName || !userId) {
        return res.status(400).json({ error: 'Faltan campos requeridos: domainName, userId' });
      }

      const lowerDomain = domainName.toLowerCase();
      const domainRef = db.collection('domains').doc(lowerDomain);
      const domainDoc = await domainRef.get();

      if (!domainDoc.exists) {
        return res.status(404).json({ error: 'Dominio no encontrado' });
      }

      const domainData = domainDoc.data();

      // Check permission
      const authorized = await checkUserPermission(userId, domainData.empresaId);
      if (!authorized) {
        return res.status(403).json({ error: 'Usuario no autorizado' });
      }

      if (domainData.isVerified) {
        return res.status(200).json({ success: true, message: 'El dominio ya está verificado.', isVerified: true });
      }

      // Verify with Migadu API as the ultimate source of truth
      const apiUser = process.env.MIGADU_API_USER;
      const apiKey = process.env.MIGADU_API_KEY;
      const migadu = new MigaduClient(apiUser, apiKey);

      let details;
      try {
        details = await migadu.getDomainDetails(lowerDomain);
      } catch (migaduErr) {
        const detail = migaduErr.response?.data?.message || migaduErr.response?.data || migaduErr.message;
        console.error("Failed fetching Migadu status during verification:", detail);
        return res.status(502).json({ error: `Error de Migadu al obtener detalles: ${detail}` });
      }

      const isMigaduVerified = details.state === "active" || details.state === "verified";

      if (!isMigaduVerified) {
        // Run local DNS lookup for diagnostic information to help the user troubleshoot
        let localTxtPresent = false;
        let localMxPresent = false;

        try {
          const txtRecords = await dns.resolveTxt(lowerDomain);
          const flattenedTxt = txtRecords.flat();
          localTxtPresent = flattenedTxt.includes(domainData.verificationToken);
        } catch (e) {
          console.warn(`Local TXT check failed for ${lowerDomain}:`, e.message);
        }

        try {
          const mxRecords = await dns.resolveMx(lowerDomain);
          localMxPresent = mxRecords.some(
            record => record.exchange.toLowerCase().includes("migadu.com")
          );
        } catch (e) {
          console.warn(`Local MX check failed for ${lowerDomain}:`, e.message);
        }

        let errorMsg = `El dominio aún no está verificado en los servidores de Migadu (Estado actual: ${details.state}).`;
        if (!localTxtPresent) {
          errorMsg += `\n- No se detectó el registro TXT requerido (${domainData.verificationToken}) en tu dominio. Por favor, asegúrate de haberlo agregado en tu proveedor DNS (Vercel) tal como se muestra en la tabla y que no contenga espacios ni caracteres adicionales.`;
        }
        if (!localMxPresent) {
          errorMsg += `\n- No se detectaron los registros MX apuntando a Migadu. Por favor, revisa la configuración de los servidores de correo (aspmx1.migadu.com y aspmx2.migadu.com).`;
        }
        if (localTxtPresent && localMxPresent) {
          errorMsg += `\n- Los registros DNS parecen estar correctos en tu proveedor, pero Migadu aún no los ha detectado o actualizado. Por favor, espera de 5 a 10 minutos para la propagación de DNS e intenta de nuevo.`;
        }

        return res.status(400).json({
          success: false,
          error: errorMsg,
          state: details.state,
          localTxtPresent,
          localMxPresent
        });
      }

      // Update in Firestore
      await domainRef.update({ isVerified: true });

      return res.status(200).json({
        success: true,
        message: "¡Dominio verificado y activo!",
        isVerified: true
      });

    } catch (err) {
      console.error('emailVerifyDomain error:', err.message);
      return res.status(500).json({ error: err.message });
    }
  });
});

// ── emailCreateMailbox ────────────────────────────────────────
exports.emailCreateMailbox = onRequest({ secrets: [MIGADU_API_USER, MIGADU_API_KEY] }, (req, res) => {
  cors(req, res, async () => {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    try {
      const { domainName, localPart, password, quotaMb, userId } = req.body;
      if (!domainName || !localPart || !userId) {
        return res.status(400).json({ error: 'Faltan campos requeridos: domainName, localPart, userId' });
      }

      const lowerDomain = domainName.toLowerCase();
      const cleanLocalPart = localPart.toLowerCase();

      // Check format
      const localPartRegex = /^[a-z0-9._%+-]+$/i;
      if (!localPartRegex.test(cleanLocalPart)) {
        return res.status(400).json({ error: 'Formato de nombre de casilla inválido' });
      }

      const domainRef = db.collection('domains').doc(lowerDomain);
      const domainDoc = await domainRef.get();

      if (!domainDoc.exists) {
        return res.status(404).json({ error: 'Dominio no encontrado' });
      }

      const domainData = domainDoc.data();

      // Check permission
      const authorized = await checkUserPermission(userId, domainData.empresaId);
      if (!authorized) {
        return res.status(403).json({ error: 'Usuario no autorizado' });
      }

      if (!domainData.isVerified) {
        return res.status(400).json({ error: 'El dominio debe estar verificado antes de crear casillas' });
      }

      const mailboxId = `${cleanLocalPart}_${lowerDomain}`;
      const mailboxRef = db.collection('mailboxes').doc(mailboxId);
      const mailboxDoc = await mailboxRef.get();

      if (mailboxDoc.exists) {
        return res.status(409).json({ error: 'La casilla de correo ya está registrada' });
      }

      // Create in Migadu
      const apiUser = process.env.MIGADU_API_USER;
      const apiKey = process.env.MIGADU_API_KEY;
      const migadu = new MigaduClient(apiUser, apiKey);

      try {
        await migadu.createMailbox(lowerDomain, cleanLocalPart, password, quotaMb || 1024);
      } catch (migaduError) {
        const detail = migaduError.response?.data?.message || migaduError.response?.data || migaduError.message;
        console.error('Migadu createMailbox error:', detail);
        return res.status(502).json({ error: `Error de Migadu: ${detail}` });
      }

      // Save to Firestore
      const mailboxData = {
        domainName: lowerDomain,
        empresaId: domainData.empresaId,
        localPart: cleanLocalPart,
        emailAddress: `${cleanLocalPart}@${lowerDomain}`,
        storageQuotaMb: quotaMb || 1024,
        createdAt: FieldValue.serverTimestamp()
      };

      await mailboxRef.set(mailboxData);

      return res.status(200).json({
        success: true,
        message: 'Casilla de correo creada exitosamente',
        mailbox: mailboxData
      });

    } catch (err) {
      console.error('emailCreateMailbox error:', err.message);
      return res.status(500).json({ error: err.message });
    }
  });
});

// ── emailDeleteMailbox ────────────────────────────────────────
exports.emailDeleteMailbox = onRequest({ secrets: [MIGADU_API_USER, MIGADU_API_KEY] }, (req, res) => {
  cors(req, res, async () => {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    try {
      const { domainName, localPart, userId } = req.body;
      if (!domainName || !localPart || !userId) {
        return res.status(400).json({ error: 'Faltan campos requeridos: domainName, localPart, userId' });
      }

      const lowerDomain = domainName.toLowerCase();
      const cleanLocalPart = localPart.toLowerCase();
      const mailboxId = `${cleanLocalPart}_${lowerDomain}`;

      const mailboxRef = db.collection('mailboxes').doc(mailboxId);
      const mailboxDoc = await mailboxRef.get();

      if (!mailboxDoc.exists) {
        return res.status(404).json({ error: 'Casilla de correo no encontrada' });
      }

      const mailboxData = mailboxDoc.data();

      // Check permission
      const authorized = await checkUserPermission(userId, mailboxData.empresaId);
      if (!authorized) {
        return res.status(403).json({ error: 'Usuario no autorizado' });
      }

      // Delete in Migadu
      const apiUser = process.env.MIGADU_API_USER;
      const apiKey = process.env.MIGADU_API_KEY;
      const migadu = new MigaduClient(apiUser, apiKey);

      try {
        await migadu.deleteMailbox(lowerDomain, cleanLocalPart);
      } catch (migaduError) {
        const detail = migaduError.response?.data?.message || migaduError.response?.data || migaduError.message;
        console.error('Migadu deleteMailbox error:', detail);
        if (migaduError.response && migaduError.response.status === 404) {
          // If already deleted, that's fine
        } else if (!String(detail).includes("404")) {
          return res.status(502).json({ error: `Error de Migadu: ${detail}` });
        }
      }

      // Delete from Firestore
      await mailboxRef.delete();

      return res.status(200).json({
        success: true,
        message: 'Casilla de correo eliminada exitosamente'
      });

    } catch (err) {
      console.error('emailDeleteMailbox error:', err.message);
      return res.status(500).json({ error: err.message });
    }
  });
});

// ── emailCopilot ──────────────────────────────────────────────
exports.emailCopilot = onRequest({ secrets: [GEMINI_API_KEY] }, (req, res) => {
  cors(req, res, async () => {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    try {
      const { prompt, emailThread, type, userId } = req.body;
      if (!userId) {
        return res.status(400).json({ error: 'userId es requerido' });
      }

      if (!prompt && !emailThread) {
        return res.status(400).json({ error: 'Se requiere prompt o emailThread' });
      }

      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return res.status(500).json({ error: 'Falta la API Key de Gemini (GEMINI_API_KEY)' });
      }

      const ai = new GoogleGenerativeAI(apiKey);
      const model = ai.getGenerativeModel({ model: "gemini-1.5-flash" });

      let apiPrompt = "";

      if (type === "summarize") {
        apiPrompt = `
          Actúa como un asistente ejecutivo altamente analítico. 
          Lee el siguiente hilo de correos y redacta un resumen ejecutivo corto (máximo 4 viñetas) y determina cuál es la acción requerida (Action Items):
          
          --- HILO DE CORREOS ---
          ${emailThread}
          -----------------------
        `;
      } else {
        apiPrompt = `
          Actúa como un asistente de redacción corporativo profesional.
          Redacta una propuesta de respuesta de correo electrónico basada en las siguientes instrucciones y/o contexto:
          
          Instrucciones del usuario: "${prompt || "Redactar una respuesta adecuada"}"
          ${emailThread ? `Contexto del hilo previo:\n${emailThread}` : ""}
          
          Requisitos del borrador:
          1. Mantén un tono formal, claro y cortés.
          2. Añade marcadores de posición limpios entre corchetes para los datos variables (ej: [Nombre del Remitente], [Fecha]).
          3. No inventes información fáctica externa al contexto; usa variables genéricas.
          4. Devuelve únicamente el correo redactado listo para usar.
        `;
      }

      const result = await model.generateContent(apiPrompt);
      const responseText = result.response.text();

      return res.status(200).json({
        success: true,
        content: responseText
      });

    } catch (err) {
      console.error('emailCopilot error:', err.message);
      return res.status(500).json({ error: err.message });
    }
  });
});

// ── emailDeleteDomain ─────────────────────────────────────────
exports.emailDeleteDomain = onRequest({ secrets: [MIGADU_API_USER, MIGADU_API_KEY] }, (req, res) => {
  cors(req, res, async () => {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    try {
      const { domainName, userId } = req.body;
      if (!domainName || !userId) {
        return res.status(400).json({ error: 'Faltan campos requeridos: domainName, userId' });
      }

      const lowerDomain = domainName.toLowerCase();
      const domainRef = db.collection('domains').doc(lowerDomain);
      const domainDoc = await domainRef.get();

      if (!domainDoc.exists) {
        return res.status(404).json({ error: 'Dominio no encontrado' });
      }

      const domainData = domainDoc.data();

      // Check permission
      const authorized = await checkUserPermission(userId, domainData.empresaId);
      if (!authorized) {
        return res.status(403).json({ error: 'Usuario no autorizado' });
      }

      // Delete in Migadu
      const apiUser = process.env.MIGADU_API_USER;
      const apiKey = process.env.MIGADU_API_KEY;
      const migadu = new MigaduClient(apiUser, apiKey);

      try {
        await migadu.deleteDomain(lowerDomain);
      } catch (migaduError) {
        const detail = migaduError.response?.data?.message || migaduError.response?.data || migaduError.message;
        console.error('Migadu deleteDomain error:', detail);
        if (migaduError.response && migaduError.response.status === 404) {
          // If already deleted, that's fine
        } else if (!String(detail).includes("404")) {
          return res.status(502).json({ error: `Error de Migadu: ${detail}` });
        }
      }

      // Delete associated mailboxes in Firestore
      const mailboxesSnap = await db.collection('mailboxes')
        .where('domainName', '==', lowerDomain)
        .get();

      const batch = db.batch();
      mailboxesSnap.forEach(doc => {
        batch.delete(doc.ref);
      });

      // Delete domain document
      batch.delete(domainRef);
      await batch.commit();

      return res.status(200).json({
        success: true,
        message: 'Dominio y casillas asociadas eliminadas exitosamente'
      });

    } catch (err) {
      console.error('emailDeleteDomain error:', err.message);
      return res.status(500).json({ error: err.message });
    }
  });
});

exports.deleteAuthUser = onRequest((req, res) => {
  cors(req, res, async () => {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    try {
      const { targetUid, callerUid, empresaId } = req.body;
      if (!targetUid || !callerUid || !empresaId) {
        return res.status(400).json({ error: 'Faltan campos requeridos: targetUid, callerUid, empresaId' });
      }

      // Verificar permisos del caller
      const callerDoc = await db.collection('users').doc(callerUid).get();
      if (!callerDoc.exists) return res.status(403).json({ error: 'Usuario no autorizado' });
      const callerData = callerDoc.data();
      const isSuper = callerData.role === 'superadmin';
      const isAdmin = callerData.role === 'admin_contrato' && callerData.empresaId === empresaId;
      if (!isSuper && !isAdmin) return res.status(403).json({ error: 'Sin permisos para eliminar usuarios' });

      // No permitir auto-eliminación
      if (targetUid === callerUid) return res.status(400).json({ error: 'No puedes eliminarte a ti mismo' });

      await admin.auth().deleteUser(targetUid);

      return res.status(200).json({ success: true });
    } catch (err) {
      // Si el usuario ya no existe en Auth, igual consideramos éxito
      if (err.code === 'auth/user-not-found') {
        return res.status(200).json({ success: true, note: 'Usuario ya no existía en Auth' });
      }
      console.error('deleteAuthUser error:', err.message);
      return res.status(500).json({ error: err.message });
    }
  });
});

