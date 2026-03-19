// ============================================================
// FLEETCORE — FIREBASE FUNCTIONS v7+
// functions/index.js
// ============================================================

const { onRequest } = require('firebase-functions/v2/https');
const admin         = require('firebase-admin');
const cors          = require('cors')({ origin: true });
const { MercadoPagoConfig, PreApproval } = require('mercadopago');

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

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
