// src/lib/firmas.js
import { db, auth } from './firebase.js'
import { doc, getDoc, setDoc, serverTimestamp, updateDoc } from 'firebase/firestore'

export const ROLES_FIRMA = {
  realizado:    { label: 'Realizado por',                         roles: ['supervisor', 'operador', 'admin'] },
  aprobado:     { label: 'Aprobado por',                          roles: ['mandante'] },
  conocimiento: { label: 'Toma de conocimiento / Validación (V)', roles: ['mandante', 'admin', 'supervisor'] },
}

export const FLUJO = ['realizado', 'aprobado', 'conocimiento']

// ── Hash PIN — exportado para uso en auth.js ──────────────────
export async function hashPin(pin) {
  const encoder = new TextEncoder()
  const data = encoder.encode('mpf_salt_2026_' + pin)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

// ── PIN ───────────────────────────────────────────────────────
// El PIN se verifica en el servidor (Cloud Function verificarPinFirma): el
// hash ya no se puede leer desde la app.
const FUNCTIONS_URL = import.meta.env.VITE_FUNCTIONS_URL || 'https://southamerica-west1-mpf-maquinaria.cloudfunctions.net'
export async function llamarPin(accion, usuario, pin) {
  const r = await fetch(`${FUNCTIONS_URL}/verificarPinFirma`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accion, usuario, pin }),
  })
  if (!r.ok) throw new Error('No se pudo verificar el PIN (' + r.status + ')')
  return r.json()
}

export const MENSAJES_PIN = {
  incorrecto: 'PIN incorrecto',
  bloqueado:  'Demasiados intentos: el PIN quedó bloqueado 15 minutos',
  inactivo:   'Tu cuenta está inactiva o finiquitada',
  ajeno:      'Ese usuario de firma pertenece a otra cuenta',
  sin_pin:    'Este usuario aún no tiene PIN',
}

export async function tienePin(usuario) {
  try { return !!(await llamarPin('existe', usuario)).existe } catch { return false }
}

export async function crearPin(usuario, pin) {
  if (pin.length < 4) throw new Error('El PIN debe tener al menos 4 dígitos')
  const hash = await hashPin(pin)
  await setDoc(doc(db, 'pins', usuario), { hash, uid: auth.currentUser?.uid || null, createdAt: serverTimestamp() })
}

/** true si el PIN es correcto. El motivo de un rechazo queda en ultimoMotivoPin. */
export let ultimoMotivoPin = ''
export const motivoPin = () => ultimoMotivoPin || 'PIN incorrecto'
export async function verificarPin(usuario, pin) {
  try {
    const r = await llamarPin('verificar', usuario, pin)
    ultimoMotivoPin = r.ok ? '' : (MENSAJES_PIN[r.motivo] || 'PIN incorrecto')
    return !!r.ok
  } catch (e) {
    ultimoMotivoPin = e.message
    return false
  }
}

function docRef(empresaId, docId) {
  return doc(db, 'empresas', empresaId, 'documentos', docId)
}

// ── Firmas del documento ──────────────────────────────────────
export async function getFirmas(docId, empresaId) {
  const snap = await getDoc(docRef(empresaId, docId))
  if (!snap.exists()) return {}
  return snap.data().firmas || {}
}

export async function firmarDocumento(docId, rolKey, usuario, nombre, cargo) {
  const { getSession } = await import('./auth.js')
  const session = getSession()
  if (!ROLES_FIRMA[rolKey].roles.includes(session?.rol)) {
    throw new Error('Tu perfil no tiene permiso para firmar esta etapa')
  }
  const empresaId = session?.empresaId
  const snap = await getDoc(docRef(empresaId, docId))
  const docData = snap.exists() ? snap.data() : {}
  const firmas = docData.firmas || {}

  // Regla: El creador/emisor del informe no puede aprobar su propio documento
  const creadorUsuario = firmas?.realizado?.usuario || docData.usuario
  if (rolKey !== 'realizado' && session?.usuario === creadorUsuario) {
    throw new Error('El emisor del documento no puede firmar las aprobaciones de su propio informe')
  }

  const idx = FLUJO.indexOf(rolKey)
  if (idx > 0 && !firmas[FLUJO[idx - 1]]?.firmado) {
    throw new Error(`Primero debe firmar "${ROLES_FIRMA[FLUJO[idx-1]].label}"`)
  }
  if (firmas[rolKey]?.firmado) throw new Error('Este rol ya fue firmado')

  const _usuario = usuario || session?.usuario || ''
  const _nombre  = nombre  || session?.nombre  || ''
  const _cargo   = cargo   || session?.cargo   || ''

  const firma = {
    firmado: true, usuario: _usuario, nombre: _nombre, cargo: _cargo,
    fecha: new Date().toLocaleDateString('es-CL'),
    hora:  new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }),
    timestamp: new Date().toISOString(),
  }

  await updateDoc(docRef(empresaId, docId), {
    [`firmas.${rolKey}`]: firma,
    updatedAt: serverTimestamp(),
  })

  return firma
}

export async function rechazarDocumento(docId, rolKey, usuario, nombre, cargo, motivo) {
  const { getSession } = await import('./auth.js')
  const session = getSession()
  if (!ROLES_FIRMA[rolKey]?.roles.includes(session?.rol)) {
    throw new Error('Tu perfil no tiene permiso para rechazar este documento')
  }
  const empresaId = session?.empresaId
  const _usuario = usuario || session?.usuario || ''
  const _nombre  = nombre  || session?.nombre  || ''
  const _cargo   = cargo   || session?.cargo   || ''

  const rechazo = {
    firmado: false,
    rechazado: true,
    usuario: _usuario,
    nombre: _nombre,
    cargo: _cargo,
    motivo: motivo || 'Sin motivo especificado',
    fecha: new Date().toLocaleDateString('es-CL'),
    hora:  new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }),
    timestamp: new Date().toISOString(),
  }

  await updateDoc(docRef(empresaId, docId), {
    [`firmas.${rolKey}`]: rechazo,
    estadoDocumento: 'rechazado',
    updatedAt: serverTimestamp(),
  })

  return rechazo
}
