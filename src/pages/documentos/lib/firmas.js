// src/lib/firmas.js
import { db } from './firebase.js'
import { doc, getDoc, setDoc, serverTimestamp, updateDoc } from 'firebase/firestore'

export const ROLES_FIRMA = {
  realizado:    { label: 'Realizado por',                         roles: ['supervisor', 'operador', 'admin'] },
  aprobado:     { label: 'Aprobado por',                          roles: ['supervisor', 'admin'] },
  conocimiento: { label: 'Toma de conocimiento / Validación (V)', roles: ['admin', 'supervisor'] },
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
export async function tienePin(usuario) {
  const snap = await getDoc(doc(db, 'pins', usuario))
  return snap.exists()
}

export async function crearPin(usuario, pin) {
  if (pin.length < 4) throw new Error('El PIN debe tener al menos 4 dígitos')
  const hash = await hashPin(pin)
  await setDoc(doc(db, 'pins', usuario), { hash, createdAt: serverTimestamp() })
}

export async function verificarPin(usuario, pin) {
  const snap = await getDoc(doc(db, 'pins', usuario))
  if (!snap.exists()) return false
  const hash = await hashPin(pin)
  return hash === snap.data().hash
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
    throw new Error('Tu perfil no tiene permiso para firmar este rol')
  }
  const empresaId = session?.empresaId
  const firmas = await getFirmas(docId, empresaId)
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
