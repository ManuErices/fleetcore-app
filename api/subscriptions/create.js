// ============================================================
// FLEETCORE — API: CREAR SUSCRIPCIÓN MERCADOPAGO
// api/subscriptions/create.js  (Vercel Serverless Function)
//
// POST /api/subscriptions/create
// Body: { planId, billingCycle, userEmail, userId, userName }
//
// SETUP:
// 1. Instalar: npm install mercadopago firebase-admin
// 2. Variables de entorno en Vercel:
//    MP_ACCESS_TOKEN_SANDBOX=TEST-xxxx
//    MP_ACCESS_TOKEN_PRODUCTION=APP_USR-xxxx
//    MP_ENV=sandbox  (cambiar a 'production' al lanzar)
//    FIREBASE_SERVICE_ACCOUNT={"type":"service_account",...}
//    APP_URL=https://tuapp.vercel.app
// ============================================================

import { MercadoPagoConfig, PreApproval } from 'mercadopago';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// ── Firebase Admin init (singleton) ──────────────────────────
function getFirebaseAdmin() {
  if (!getApps().length) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    initializeApp({ credential: cert(serviceAccount) });
  }
  return getFirestore();
}

// ── MercadoPago config ────────────────────────────────────────
const MP_TOKEN = process.env.MP_ENV === 'production'
  ? process.env.MP_ACCESS_TOKEN_PRODUCTION
  : process.env.MP_ACCESS_TOKEN_SANDBOX;

const PLAN_IDS = {
  starter:    process.env.MP_ENV === 'production' ? process.env.MP_PLAN_STARTER_PROD    : process.env.MP_PLAN_STARTER_SANDBOX,
  pro:        process.env.MP_ENV === 'production' ? process.env.MP_PLAN_PRO_PROD        : process.env.MP_PLAN_PRO_SANDBOX,
  enterprise: process.env.MP_ENV === 'production' ? process.env.MP_PLAN_ENTERPRISE_PROD : process.env.MP_PLAN_ENTERPRISE_SANDBOX,
};

// ── Handler principal ─────────────────────────────────────────
export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', process.env.APP_URL || '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { planId, billingCycle = 'monthly', userId, userEmail, userName } = req.body;

    // Validaciones
    if (!planId || !userId || !userEmail) {
      return res.status(400).json({ error: 'planId, userId y userEmail son requeridos' });
    }
    if (!['starter', 'pro', 'enterprise'].includes(planId)) {
      return res.status(400).json({ error: 'Plan inválido' });
    }

    const mpPlanId = PLAN_IDS[planId];
    if (!mpPlanId) {
      return res.status(500).json({ error: 'Plan ID de MercadoPago no configurado' });
    }

    // ── Crear Preapproval en MercadoPago ──────────────────
    const client = new MercadoPagoConfig({ accessToken: MP_TOKEN });
    const preapproval = new PreApproval(client);

    const preapprovalData = await preapproval.create({
      body: {
        preapproval_plan_id: mpPlanId,
        payer_email:         userEmail,
        back_url:            `${process.env.APP_URL}/payment-result`,
        external_reference:  `${userId}|${planId}|${billingCycle}`,

        // Metadatos para rastreo
        reason: `FleetCore ${planId.charAt(0).toUpperCase() + planId.slice(1)} — ${billingCycle === 'yearly' ? 'Anual' : 'Mensual'}`,
      }
    });

    // ── Guardar intent en Firestore ───────────────────────
    const db = getFirebaseAdmin();
    await db.collection('subscription_intents').doc(userId).set({
      userId,
      userEmail,
      userName:    userName || '',
      planId,
      billingCycle,
      mpPreapprovalId: preapprovalData.id,
      status:      'pending',
      initPoint:   preapprovalData.init_point,
      createdAt:   new Date().toISOString(),
    });

    return res.status(200).json({
      success:    true,
      initPoint:  preapprovalData.init_point,  // URL a la que redirigir al usuario
      preapprovalId: preapprovalData.id,
    });

  } catch (err) {
    console.error('Error creando suscripción MP:', err);
    return res.status(500).json({ error: 'Error interno al crear la suscripción', detail: err.message });
  }
}
