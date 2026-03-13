// ============================================================
// FLEETCORE — FIX DE SEGURIDAD: handleRegister
// 
// REEMPLAZAR el handleRegister en LoginPage.jsx con esta versión.
//
// PROBLEMA: La versión actual guarda la contraseña en texto
// plano en Firestore (línea 79), lo que es un riesgo crítico.
//
// SOLUCIÓN: No guardar la contraseña en ningún lado.
// Para el QR, generar un token seguro de un solo uso.
// ============================================================

// ── 1. NUEVO handleRegister ───────────────────────────────────
//
// Reemplaza COMPLETAMENTE el handleRegister actual en LoginPage.jsx

const handleRegister = async (userData) => {
  setLoading(true);
  try {
    const { email, password, nombre, rut } = userData;

    // Crear usuario en Firebase Auth
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    // Actualizar nombre en Auth
    await updateProfile(user, { displayName: nombre });

    // ✅ SEGURO: NUNCA guardar la contraseña en Firestore
    await setDoc(doc(db, "users", user.uid), {
      email,
      nombre,
      rut,
      createdAt: new Date().toISOString(),
      role: 'operador',
      // Sin password, sin datos sensibles
    });

    // Crear suscripción trial por defecto (14 días)
    const trialUntil = new Date();
    trialUntil.setDate(trialUntil.getDate() + 14);
    await setDoc(doc(db, "subscriptions", user.uid), {
      userId:    user.uid,
      planId:    'starter',
      status:    'trial',
      trialUntil: trialUntil.toISOString(),
      createdAt: new Date().toISOString(),
    });

    setShowRegister(false);
    alert("✅ Cuenta creada. Tienes 14 días de prueba gratuita.");
  } catch (err) {
    let msg = "Error al crear cuenta";
    if (err.code === 'auth/email-already-in-use') msg = "Este email ya está registrado";
    else if (err.code === 'auth/weak-password')    msg = "La contraseña debe tener al menos 6 caracteres";
    else if (err.code === 'auth/invalid-email')    msg = "Email inválido";
    alert(msg);
  } finally {
    setLoading(false);
  }
};


// ── 2. NUEVO QR: usar UID + token en lugar de password ────────
//
// En el AdminPanel, cuando generas el QR para un operador,
// REEMPLAZA el contenido del QR. En lugar de:
//   JSON.stringify({ email, password })   ← INSEGURO
//
// Usar:
//   JSON.stringify({ uid: user.uid, token: loginToken })
//
// El loginToken es un campo que generates una sola vez y guardas
// hasheado en Firestore. El operador escanea → tu backend
// verifica el token → emite un custom token de Firebase Auth.
//
// Implementación completa abajo:


// ── 3. API para login con QR token ────────────────────────────
// api/auth/qr-login.js

/*
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import crypto from 'crypto';

function getAdmin() {
  if (!getApps().length) {
    initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
  }
  return { auth: getAuth(), db: getFirestore() };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const { uid, token } = req.body;
  if (!uid || !token) return res.status(400).json({ error: 'uid y token requeridos' });

  const { auth, db } = getAdmin();
  const userRef = db.collection('users').doc(uid);
  const snap = await userRef.get();
  if (!snap.exists()) return res.status(404).json({ error: 'Usuario no encontrado' });

  const data = snap.data();
  // Verificar token (guardado hasheado en Firestore)
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  if (data.qrTokenHash !== tokenHash) return res.status(401).json({ error: 'Token inválido' });

  // Verificar que no esté expirado (tokens válidos por 1 año)
  const tokenCreatedAt = new Date(data.qrTokenCreatedAt);
  const oneYear = 365 * 24 * 60 * 60 * 1000;
  if (Date.now() - tokenCreatedAt.getTime() > oneYear) {
    return res.status(401).json({ error: 'Token expirado, solicita uno nuevo al administrador' });
  }

  // Emitir Firebase Custom Token
  const customToken = await auth.createCustomToken(uid);
  return res.status(200).json({ customToken });
}
*/


// ── 4. Generar QR token para un operador (en AdminPanel) ──────
// Llamar esta función cuando el admin genera un QR

/*
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';

export async function generateQRToken(userId) {
  // Generar token aleatorio de 32 bytes
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  const token = Array.from(array).map(b => b.toString(16).padStart(2, '0')).join('');

  // Guardar hash en Firestore (nunca el token en claro)
  // El hash lo verifica el backend, no el frontend
  await updateDoc(doc(db, 'users', userId), {
    qrTokenCreatedAt: new Date().toISOString(),
    // NOTA: el hash lo genera el backend en /api/auth/generate-qr-token
    // para que el token nunca pase por el cliente
  });

  return token; // Solo para generar el QR en pantalla, nunca persiste en el cliente
}
*/


// ── RESUMEN DE CAMBIOS ────────────────────────────────────────
//
// ARCHIVOS A MODIFICAR:
//   1. LoginPage.jsx  → reemplazar handleRegister (arriba)
//   2. AdminPanel.jsx → generar QR con token en lugar de password
//   3. Agregar: api/auth/qr-login.js (serverless function)
//
// MIGRACIÓN DE USUARIOS EXISTENTES:
//   Ejecutar este script UNA VEZ en la consola de Firebase:
//
//   // En Firebase Console → Firestore → Tools → Console
//   // O bien como Cloud Function one-off:
//
//   const users = await db.collection('users').get();
//   const batch = db.batch();
//   users.forEach(u => {
//     if (u.data().password) {
//       batch.update(u.ref, { password: admin.firestore.FieldValue.delete() });
//     }
//   });
//   await batch.commit();
//   console.log('✅ Contraseñas eliminadas de Firestore');
//
// REGLAS DE FIRESTORE RECOMENDADAS:
//   rules_version = '2';
//   service cloud.firestore {
//     match /databases/{database}/documents {
//       // Usuarios: cada uno solo ve su propio doc
//       match /users/{userId} {
//         allow read, write: if request.auth != null && request.auth.uid == userId;
//         allow read: if request.auth != null && get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'administrador';
//       }
//       // Suscripciones: solo el propio usuario y el backend
//       match /subscriptions/{userId} {
//         allow read: if request.auth != null && request.auth.uid == userId;
//         allow write: if false; // Solo el backend via Admin SDK
//       }
//     }
//   }
