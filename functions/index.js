// ============================================================
// FLEETCORE — FIREBASE FUNCTIONS
// functions/index.js
// ============================================================

const functions  = require('firebase-functions');
const admin      = require('firebase-admin');
const cors       = require('cors')({ origin: true });
const { MercadoPagoConfig, PreApproval } = require('mercadopago');

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

// ── Config MercadoPago ────────────────────────────────────────
function getMPClient() {
  const isProd = functions.config().mp?.env === 'production';
  const token  = isProd
    ? functions.config().mp?.access_token_prod
    : functions.config().mp?.access_token_sandbox;
  if (!token) throw new Error('MP access token no configurado');
  return new MercadoPagoConfig({ accessToken: token });
}

// ============================================================
// POST /createSubscription
// Body: { planId, userId, userEmail, userName, modules, total }
// ============================================================
exports.createSubscription = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    try {
      const { planId, userId, userEmail, modules, total } = req.body;

      if (!userId || !userEmail || !planId || !total) {
        return res.status(400).json({ error: 'Faltan campos requeridos' });
      }

      const client      = getMPClient();
      const preApproval = new PreApproval(client);
      const appUrl      = functions.config().app?.url || 'https://fleetcore.web.app';

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
      console.error('createSubscription error:', err);
      return res.status(500).json({ error: err.message });
    }
  });
});

// ============================================================
// POST /webhookMercadoPago
// ============================================================
exports.webhookMercadoPago = functions.https.onRequest((req, res) => {
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
// Funciones existentes — CNE, tipo de cambio, etc.
// ============================================================

const axios   = require('axios');
const cheerio = require('cheerio');

exports.getFuelPrices = functions.https.onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') { res.set('Access-Control-Allow-Methods', 'GET'); res.status(204).send(''); return; }
  try {
    const response    = await axios.get('https://www.bencinaenlinea.cl');
    const $           = cheerio.load(response.data);
    const diesel      = parseFloat($('.precio-diesel').first().text()) || 950;
    const gasoline93  = parseFloat($('.precio-93').first().text())    || 1100;
    const gasoline95  = parseFloat($('.precio-95').first().text())    || 1150;
    const gasoline97  = parseFloat($('.precio-97').first().text())    || 1200;
    const prices      = { diesel: Math.round(diesel), gasoline93: Math.round(gasoline93), gasoline95: Math.round(gasoline95), gasoline97: Math.round(gasoline97), source: 'cne-scraping', lastUpdated: new Date().toISOString() };
    await admin.firestore().collection('settings').doc('currentFuelPrice').set(prices);
    res.json(prices);
  } catch (error) {
    res.json({ diesel: 950, gasoline93: 1100, gasoline95: 1150, gasoline97: 1200, source: 'fallback', lastUpdated: new Date().toISOString(), error: error.message });
  }
});

exports.getExchangeRate = functions.https.onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  try {
    const response = await axios.get('https://api.exchangerate-api.com/v4/latest/USD');
    res.json({ usdToClp: response.data.rates.CLP, lastUpdated: new Date().toISOString() });
  } catch (error) {
    res.json({ usdToClp: 950, lastUpdated: new Date().toISOString(), error: error.message });
  }
});

exports.getInternationalOilPrice = functions.https.onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  try {
    const exchangeResponse = await axios.get('https://api.exchangerate-api.com/v4/latest/USD');
    const usdToClp         = exchangeResponse.data.rates.CLP;
    const wtiPrice         = 75;
    const dieselPrice      = Math.round((wtiPrice / 159) * usdToClp * 2.0);
    res.json({ diesel: dieselPrice, gasoline93: Math.round(dieselPrice * 1.15), gasoline95: Math.round(dieselPrice * 1.20), gasoline97: Math.round(dieselPrice * 1.25), wtiPrice, usdToClp, source: 'international-estimate', lastUpdated: new Date().toISOString() });
  } catch (error) {
    res.json({ diesel: 950, gasoline93: 1100, gasoline95: 1150, gasoline97: 1200, source: 'fallback', error: error.message });
  }
});
