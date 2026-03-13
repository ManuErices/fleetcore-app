// ============================================================
// FLEETCORE — WEBHOOK MERCADOPAGO
// api/webhooks/mercadopago.js  (Vercel Serverless Function)
//
// Este endpoint recibe notificaciones de MercadoPago cuando:
//   - Una suscripción es autorizada
//   - Una suscripción es cancelada o pausada
//   - Un pago recurrente es procesado
//
// IMPORTANTE: Configurar en el panel de MercadoPago:
//   Webhook URL: https://tuapp.vercel.app/api/webhooks/mercadopago
//   Eventos: subscription_preapproval, subscription_authorized_payment
// ============================================================

import { MercadoPagoConfig, PreApproval } from 'mercadopago';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import crypto from 'crypto';

// ── Firebase Admin ────────────────────────────────────────────
function getFirebaseAdmin() {
  if (!getApps().length) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    initializeApp({ credential: cert(serviceAccount) });
  }
  return getFirestore();
}

// ── Verificar firma HMAC de MercadoPago ──────────────────────
// MercadoPago envía x-signature y x-request-id en los headers
function verifyMPSignature(req) {
  const secret    = process.env.MP_WEBHOOK_SECRET;
  if (!secret) return true; // Skip en desarrollo sin secret configurado

  const xSignature  = req.headers['x-signature'];
  const xRequestId  = req.headers['x-request-id'];
  if (!xSignature || !xRequestId) return false;

  // Extraer ts y hash del header x-signature
  const parts = {};
  xSignature.split(',').forEach(part => {
    const [key, value] = part.trim().split('=');
    parts[key] = value;
  });

  const ts   = parts['ts'];
  const hash = parts['v1'];
  if (!ts || !hash) return false;

  // Construir el manifest para verificar
  const dataId  = req.query?.['data.id'] || req.body?.data?.id || '';
  const manifest = `id:${dataId};request-id:${xRequestId};ts:${ts};`;

  const expected = crypto
    .createHmac('sha256', secret)
    .update(manifest)
    .digest('hex');

  return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(expected));
}

// ── Mapeo de estado MP → estado interno ──────────────────────
const STATUS_MAP = {
  authorized:  'authorized',   // Suscripción activa y pagando
  pending:     'pending',      // Esperando primer pago
  paused:      'paused',       // Pausada por el usuario
  cancelled:   'cancelled',    // Cancelada
  expired:     'cancelled',    // Expirada
};

// ── Handler principal ─────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  // Verificar firma de MercadoPago
  if (!verifyMPSignature(req)) {
    console.warn('⚠️ Firma de webhook inválida');
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { type, data } = req.body;
  console.log('📨 Webhook MP recibido:', type, data?.id);

  try {
    const db = getFirebaseAdmin();

    // ── Suscripción actualizada ───────────────────────────
    if (type === 'subscription_preapproval') {
      const client      = new MercadoPagoConfig({ accessToken: process.env.MP_ENV === 'production' ? process.env.MP_ACCESS_TOKEN_PRODUCTION : process.env.MP_ACCESS_TOKEN_SANDBOX });
      const preApproval = new PreApproval(client);
      const mpSub       = await preApproval.get({ id: data.id });

      const externalRef = mpSub.external_reference; // formato: "userId|planId|billingCycle"
      if (!externalRef) {
        console.warn('⚠️ external_reference vacío en preapproval', data.id);
        return res.status(200).json({ received: true });
      }

      const [userId, planId, billingCycle] = externalRef.split('|');
      const internalStatus = STATUS_MAP[mpSub.status] || 'pending';

      // Calcular próximo vencimiento
      let expiresAt = null;
      if (mpSub.next_payment_date) {
        expiresAt = mpSub.next_payment_date;
      }

      // Actualizar /subscriptions/{userId}
      await db.collection('subscriptions').doc(userId).set({
        userId,
        planId,
        billingCycle,
        status:           internalStatus,
        mpPreapprovalId:  mpSub.id,
        mpStatus:         mpSub.status,
        expiresAt,
        updatedAt:        new Date().toISOString(),
        // Preservar createdAt si ya existe
      }, { merge: true });

      // Si es primera autorización, setear createdAt
      if (internalStatus === 'authorized') {
        await db.collection('subscriptions').doc(userId).update({
          createdAt: FieldValue.serverTimestamp(),
        });
      }

      // Registro en historial de pagos
      await db.collection('payment_history').add({
        userId,
        planId,
        billingCycle,
        mpPreapprovalId: mpSub.id,
        mpStatus:        mpSub.status,
        internalStatus,
        amount:          mpSub.auto_recurring?.transaction_amount,
        currency:        mpSub.auto_recurring?.currency_id,
        eventType:       'subscription_updated',
        timestamp:       new Date().toISOString(),
      });

      console.log(`✅ Suscripción actualizada: ${userId} → ${planId} (${internalStatus})`);
    }

    // ── Pago recurrente procesado ─────────────────────────
    if (type === 'subscription_authorized_payment') {
      await db.collection('payment_history').add({
        mpPaymentId:   data.id,
        eventType:     'recurring_payment',
        status:        'processed',
        timestamp:     new Date().toISOString(),
      });
      console.log('💰 Pago recurrente procesado:', data.id);
    }

    return res.status(200).json({ received: true });

  } catch (err) {
    console.error('❌ Error procesando webhook MP:', err);
    // Devolver 200 igual para que MP no reintente indefinidamente
    return res.status(200).json({ received: true, error: err.message });
  }
}

// Desactivar bodyParser de Vercel para poder verificar el body raw
export const config = {
  api: { bodyParser: { sizeLimit: '1mb' } },
};
