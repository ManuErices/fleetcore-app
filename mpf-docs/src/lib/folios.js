// src/lib/folios.js
import { db } from './firebase.js'
import {
  collection, addDoc, doc, updateDoc,
  getDocs, serverTimestamp,
  getDocsFromServer, getDoc
} from 'firebase/firestore'

export const LIBROS = {
  comunicaciones: { label: 'Libro de Comunicaciones',        prefix: 'LC', color: '#1B5E8A' },
  prevencion:     { label: 'Libro de Prevención de Riesgos', prefix: 'PR', color: '#DC2626' },
}

export const TIPOS_FOLIO = {
  comunicaciones: [
    { key: 'comunicacion',   label: 'Comunicación general'    },
    { key: 'instruccion',    label: 'Solicitud de instrucción' },
    { key: 'respuesta',      label: 'Respuesta a instrucción'  },
    { key: 'materiales',     label: 'Solicitud de materiales'  },
    { key: 'no_conformidad', label: 'No conformidad'           },
  ],
  prevencion: [
    { key: 'observacion',    label: 'Observación de seguridad' },
    { key: 'no_conformidad', label: 'No conformidad'           },
    { key: 'comunicacion',   label: 'Comunicación general'     },
  ],
}

export const ESTADOS = {
  borrador:   { label: 'Borrador',   color: '#64748b', bg: '#f1f5f9' },
  emitido:    { label: 'Emitido',    color: '#1B5E8A', bg: '#dbeafe' },
  respondido: { label: 'Respondido', color: '#15803d', bg: '#dcfce7' },
  cerrado:    { label: 'Cerrado',    color: '#374151', bg: '#e5e7eb' },
}

// ── Trae todos los folios y filtra en cliente (sin índices) ───
async function todosLosFolios() {
  try {
    const snap = await getDocsFromServer(collection(db, 'folios'))
    return snap.docs.map(d => ({ id: d.id, ...d.data() }))
  } catch(e) {
    // fallback con getDocs (caché)
    const snap = await getDocs(collection(db, 'folios'))
    return snap.docs.map(d => ({ id: d.id, ...d.data() }))
  }
}

// ── Número siguiente para el libro ────────────────────────────
export async function getSiguienteNumero(libro) {
  const todos = await todosLosFolios()
  const del_libro = todos.filter(f => f.libro === libro)
  if (del_libro.length === 0) return 1
  const max = Math.max(...del_libro.map(f => f.numero || 0))
  return max + 1
}

// ── Crear folio ───────────────────────────────────────────────
export async function crearFolio({ libro, tipo, asunto, contenido, usuario, nombre, rol }) {
  const numero = await getSiguienteNumero(libro)
  const prefix = LIBROS[libro].prefix
  const codigo = `${prefix}-${String(numero).padStart(3, '0')}`

  const ref = await addDoc(collection(db, 'folios'), {
    libro, tipo, asunto, contenido,
    numero, codigo,
    creadoPor:     { usuario, nombre, rol },
    estado:        'borrador',
    firma_emisor:  null,
    respuesta:     null,
    creadoEn:      serverTimestamp(),
    updatedAt:     serverTimestamp(),
  })
  return { id: ref.id, codigo }
}

// ── Firmar emisión ────────────────────────────────────────────
export async function firmarEmision(folioId, firmante) {
  await updateDoc(doc(db, 'folios', folioId), {
    estado: 'emitido',
    firma_emisor: {
      ...firmante,
      fecha:     new Date().toLocaleDateString('es-CL'),
      hora:      new Date().toLocaleTimeString('es-CL', { hour:'2-digit', minute:'2-digit' }),
      timestamp: new Date().toISOString(),
    },
    updatedAt: serverTimestamp(),
  })
}

// ── Responder folio ───────────────────────────────────────────
export async function responderFolio(folioId, { contenido, usuario, nombre, rol }) {
  await updateDoc(doc(db, 'folios', folioId), {
    estado: 'respondido',
    respuesta: {
      contenido,
      respondidoPor: { usuario, nombre, rol },
      fecha:         new Date().toLocaleDateString('es-CL'),
      hora:          new Date().toLocaleTimeString('es-CL', { hour:'2-digit', minute:'2-digit' }),
      timestamp:     new Date().toISOString(),
      firma:         null,
    },
    updatedAt: serverTimestamp(),
  })
}

// ── Firmar respuesta / tomar conocimiento ─────────────────────
export async function firmarRespuesta(folioId, firmante) {
  const snap     = await getDoc(doc(db, 'folios', folioId))
  const respuesta = snap.data()?.respuesta || {}
  await updateDoc(doc(db, 'folios', folioId), {
    estado: 'cerrado',
    respuesta: {
      ...respuesta,
      firma: {
        ...firmante,
        fecha:     new Date().toLocaleDateString('es-CL'),
        hora:      new Date().toLocaleTimeString('es-CL', { hour:'2-digit', minute:'2-digit' }),
        timestamp: new Date().toISOString(),
      },
    },
    updatedAt: serverTimestamp(),
  })
}

// ── Obtener folios de un libro (filter + sort en cliente) ─────
export async function obtenerFolios(libro, n = 100) {
  const todos = await todosLosFolios()
  return todos
    .filter(f => f.libro === libro)
    .sort((a, b) => (b.numero || 0) - (a.numero || 0))
    .slice(0, n)
}

// ── Obtener un folio por ID ───────────────────────────────────
export async function getFolio(folioId) {
  const snap = await getDoc(doc(db, 'folios', folioId))
  if (!snap.exists()) return null
  return { id: snap.id, ...snap.data() }
}
