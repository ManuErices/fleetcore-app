// src/lib/auth.js
import { db, auth } from './firebase.js'
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore'
import { hashPin, llamarPin, MENSAJES_PIN } from './firmas.js'

export const ROLES_SISTEMA = {
  admin:      { label: 'Administrador',        color: '#6C63D4' },
  supervisor: { label: 'Supervisor',           color: '#1B5E8A' },
  operador:   { label: 'Operador',             color: '#15803d' },
  mandante:   { label: 'Mandante (Río Tinto)', color: '#DC2626' },
}

// Empresa fija según rol
export function empresaDeRol(rol) {
  return 'MPF Ingeniería Civil SpA'
}

const SESSION_KEY = 'mpf_session'

// ── Verificar si usuario existe ───────────────────────────────
export async function usuarioExiste(usuario) {
  const u = usuario.toLowerCase().trim()
  try {
    const snap = await getDoc(doc(db, 'usuarios', u))
    return snap.exists()
  } catch(e) {
    console.warn('Firestore error en usuarioExiste:', e.message)
    return false
  }
}

// ── Login (PIN hasheado) ───────────────────────────────────────
export async function login(usuario, pin) {
  const u = usuario.toLowerCase().trim()
  try {
    const snap = await getDoc(doc(db, 'usuarios', u))
    if (!snap.exists()) return { ok: false, error: 'Usuario no encontrado. Si es tu primera vez, crea tu perfil.' }

    const user = snap.data()
    if (user.estado === 'finiquitado' || user.estado === 'inactivo') {
      return { ok: false, error: 'Acceso denegado: tu relación laboral ha finalizado o tu cuenta está inactiva.' }
    }
    // El PIN se verifica en el servidor (el hash ya no se lee desde la app)
    const r = await llamarPin('login', u, pin)
    if (!r.ok) return { ok: false, error: r.motivo === 'inactivo'
      ? 'Acceso denegado: tu relación laboral ha finalizado o tu cuenta está inactiva.'
      : (MENSAJES_PIN[r.motivo] || 'PIN incorrecto') }

    const empresa = user.empresa || empresaDeRol(user.rol)
    const session = {
      usuario: u,
      nombre:  user.nombre  || '',
      rut:     user.rut     || '',
      cargo:   user.cargo   || '',
      empresa,
      rol:     user.rol     || 'supervisor',
    }
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session))
    return { ok: true, session }
  } catch(e) {
    return { ok: false, error: 'Error de conexión: ' + e.message }
  }
}

// ── Registro nuevo usuario ────────────────────────────────────
export async function registrar(usuario, nombre, rut, cargo, rol, pin) {
  const u = usuario.toLowerCase().trim()

  if (!u)              throw new Error('El nombre de usuario es requerido')
  if (!nombre?.trim()) throw new Error('El nombre completo es requerido')
  if (!rut?.trim())    throw new Error('El RUT es requerido')
  if (!cargo?.trim())  throw new Error('El cargo es requerido')
  if (!ROLES_SISTEMA[rol]) throw new Error('Rol inválido')
  if (!pin || pin.length < 4) throw new Error('El PIN debe tener al menos 4 dígitos')

  const existe = await usuarioExiste(u)
  if (existe) throw new Error('Ese nombre de usuario ya está en uso')

  const pinHash = await hashPin(pin)
  const empresa = empresaDeRol(rol)

  await setDoc(doc(db, 'usuarios', u), {
    username: u, uid: auth.currentUser?.uid || null, nombre: nombre.trim(), rut: rut.trim(),
    cargo: cargo.trim(), empresa, rol,   // el hash del PIN va solo en pins (no legible desde la app)
    creadoEn: serverTimestamp(),
  })

  // Guarda también en 'pins' para compatibilidad con el sistema de firmas
  await setDoc(doc(db, 'pins', u), {
    hash: pinHash,
    uid: auth.currentUser?.uid || null,   // dueño: solo él puede cambiarlo (reglas)
    createdAt: new Date().toISOString(),
  })

  const session = { usuario: u, nombre: nombre.trim(), rut: rut.trim(), cargo: cargo.trim(), empresa, rol }
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session))
  return { ok: true, session }
}

export function logout() { sessionStorage.removeItem(SESSION_KEY) }

export function getSession() {
  try { return JSON.parse(sessionStorage.getItem(SESSION_KEY)) }
  catch { return null }
}
