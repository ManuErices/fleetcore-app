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

function foliosCol(empresaId) {
  return collection(db, 'empresas', empresaId, 'folios')
}

function folioDoc(empresaId, folioId) {
  return doc(db, 'empresas', empresaId, 'folios', folioId)
}

async function todosLosFolios(empresaId) {
  try {
    const snap = await getDocsFromServer(foliosCol(empresaId))
    return snap.docs.map(d => ({ id: d.id, ...d.data() }))
  } catch(e) {
    const snap = await getDocs(foliosCol(empresaId))
    return snap.docs.map(d => ({ id: d.id, ...d.data() }))
  }
}

export async function getSiguienteNumero(libro, empresaId) {
  const todos = await todosLosFolios(empresaId)
  const del_libro = todos.filter(f => f.libro === libro)
  if (del_libro.length === 0) return 1
  const max = Math.max(...del_libro.map(f => f.numero || 0))
  return max + 1
}

export async function crearFolio({ libro, tipo, asunto, contenido, usuario, nombre, rol, empresaId }) {
  const numero = await getSiguienteNumero(libro, empresaId)
  const prefix = LIBROS[libro].prefix
  const codigo = `${prefix}-${String(numero).padStart(3, '0')}`

  const ref = await addDoc(foliosCol(empresaId), {
    libro, tipo, asunto, contenido,
    numero, codigo,
    empresaId,
    creadoPor:     { usuario, nombre, rol },
    estado:        'borrador',
    firma_emisor:  null,
    respuesta:     null,
    creadoEn:      serverTimestamp(),
    updatedAt:     serverTimestamp(),
  })
  return { id: ref.id, codigo }
}

export async function firmarEmision(folioId, firmante, empresaId) {
  await updateDoc(folioDoc(empresaId, folioId), {
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

export async function responderFolio(folioId, { contenido, usuario, nombre, rol }, empresaId) {
  await updateDoc(folioDoc(empresaId, folioId), {
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

export async function firmarRespuesta(folioId, firmante, empresaId) {
  const snap      = await getDoc(folioDoc(empresaId, folioId))
  const respuesta = snap.data()?.respuesta || {}
  await updateDoc(folioDoc(empresaId, folioId), {
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

export async function obtenerFolios(libro, empresaId, n = 100) {
  const todos = await todosLosFolios(empresaId)
  return todos
    .filter(f => f.libro === libro)
    .sort((a, b) => (b.numero || 0) - (a.numero || 0))
    .slice(0, n)
}

export async function getFolio(folioId, empresaId) {
  const snap = await getDoc(folioDoc(empresaId, folioId))
  if (!snap.exists()) return null
  return { id: snap.id, ...snap.data() }
}
