// src/lib/firebase.js
import { initializeApp } from 'firebase/app'
import { getFirestore } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: "AIzaSyDb27Z7ugoQWoi1OCDx9pSa1MspGyaFu2k",
  authDomain: "mpf-docs.firebaseapp.com",
  projectId: "mpf-docs",
  storageBucket: "mpf-docs.firebasestorage.app",
  messagingSenderId: "89438860454",
  appId: "1:89438860454:web:eac54b2404659fa9deb067"
}

const app = initializeApp(firebaseConfig)

// Nota: getFirestore no recibe la región como parámetro
// La región se define al crear la base de datos en Firebase Console
// El SDK se conecta automáticamente a la región correcta via projectId
export const db = getFirestore(app)
