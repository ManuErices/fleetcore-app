// src/lib/documentos.js
import { db } from './firebase.js'
import {
  collection, addDoc, getDocs, query, doc, arrayUnion, updateDoc,
  orderBy, serverTimestamp, limit, getDocsFromServer
} from 'firebase/firestore'

function docCol(empresaId) {
  const targetEmpresa = (empresaId && empresaId !== 'Río Tinto Mining') ? empresaId : 'MPF Ingeniería Civil SpA'
  return collection(db, 'empresas', targetEmpresa, 'documentos')
}

export async function guardarDocumento({ tipo, titulo, contenido, usuario, nombre, fecha, sector, extraFields, layoutPngB64, empresaId }) {
  const ref = await addDoc(docCol(empresaId), {
    tipo,
    titulo,
    contenido,
    usuario,
    nombre,
    empresaId,
    fecha:        fecha || '',
    sector:       sector || '',
    extraFields:  extraFields || {},
    layoutPngB64: layoutPngB64 || '',
    firmas:       {},
    observaciones: [],
    creadoEn:     serverTimestamp(),
  })
  return ref.id
}

export async function agregarObservacionDocumento(docId, empresaId, texto, session) {
  const targetEmpresa = (empresaId && empresaId !== 'Río Tinto Mining') ? empresaId : 'MPF Ingeniería Civil SpA'
  const ref = doc(db, 'empresas', targetEmpresa, 'documentos', docId)

  const observacion = {
    texto,
    autor: session.nombre,
    cargo: session.cargo || '',
    usuario: session.usuario,
    empresa: session.empresa,
    rol: session.rol,
    fecha: new Date().toLocaleDateString('es-CL'),
    hora:  new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }),
    timestamp: new Date().toISOString(),
  }

  await updateDoc(ref, {
    observaciones: arrayUnion(observacion),
    estadoDocumento: 'con_observaciones',
    updatedAt: serverTimestamp(),
  })

  return observacion
}

export async function actualizarDocumento(docId, empresaId, camposActualizados, session) {
  const targetEmpresa = (empresaId && empresaId !== 'Río Tinto Mining') ? empresaId : 'MPF Ingeniería Civil SpA'
  const docRef = doc(db, 'empresas', targetEmpresa, 'documentos', docId)

  const observacionSistema = {
    texto: `✏️ Documento modificado para subsanar observaciones.`,
    autor: session.nombre,
    cargo: session.cargo || '',
    usuario: session.usuario,
    empresa: session.empresa,
    rol: session.rol,
    fecha: new Date().toLocaleDateString('es-CL'),
    hora:  new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }),
    timestamp: new Date().toISOString(),
  }

  await updateDoc(docRef, {
    ...camposActualizados,
    estadoDocumento: 'emitido',
    observaciones: arrayUnion(observacionSistema),
    updatedAt: serverTimestamp(),
  })

  return observacionSistema
}

export async function obtenerDocumentos(empresaId, n = 50) {
  try {
    const q = query(docCol(empresaId), orderBy('creadoEn', 'desc'), limit(n))
    const snap = await getDocsFromServer(q)
    return snap.docs.map(d => ({ id: d.id, ...d.data() }))
  } catch(e) {
    console.warn('orderBy failed, trying without:', e.message)
    try {
      const snap = await getDocsFromServer(query(docCol(empresaId), limit(n)))
      return snap.docs.map(d => ({ id: d.id, ...d.data() }))
    } catch(e2) {
      throw e2
    }
  }
}
