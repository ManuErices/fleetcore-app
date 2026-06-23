// src/lib/documentos.js
import { db } from './firebase.js'
import {
  collection, addDoc, getDocs, query,
  orderBy, serverTimestamp, limit, getDocsFromServer
} from 'firebase/firestore'

function docCol(empresaId) {
  return collection(db, 'empresas', empresaId, 'documentos')
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
    creadoEn:     serverTimestamp(),
  })
  return ref.id
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
