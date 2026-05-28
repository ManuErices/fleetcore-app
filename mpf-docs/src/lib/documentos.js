// src/lib/documentos.js
import { db } from './firebase.js'
import {
  collection, addDoc, getDocs, query,
  orderBy, serverTimestamp, limit, getDocsFromServer
} from 'firebase/firestore'

const COL = 'documentos'

export async function guardarDocumento({ tipo, titulo, contenido, usuario, nombre, fecha, sector, extraFields, layoutPngB64 }) {
  const ref = await addDoc(collection(db, COL), {
    tipo,
    titulo,
    contenido,
    usuario,
    nombre,
    fecha:        fecha || '',
    sector:       sector || '',
    extraFields:  extraFields || {},
    layoutPngB64: layoutPngB64 || '',  // guarda el PNG del layout
    firmas:       {},
    creadoEn:     serverTimestamp(),
  })
  return ref.id
}

export async function obtenerDocumentos(n = 50) {
  try {
    const q = query(collection(db, COL), orderBy('creadoEn', 'desc'), limit(n))
    const snap = await getDocsFromServer(q)
    return snap.docs.map(d => ({ id: d.id, ...d.data() }))
  } catch(e) {
    console.warn('orderBy failed, trying without:', e.message)
    try {
      const snap = await getDocsFromServer(query(collection(db, COL), limit(n)))
      return snap.docs.map(d => ({ id: d.id, ...d.data() }))
    } catch(e2) {
      throw e2
    }
  }
}
