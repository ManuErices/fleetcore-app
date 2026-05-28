import { initializeApp, getApps } from 'firebase/app'
import { getFirestore } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: "AIzaSyDb27Z7ugoQWoi1OCDx9pSa1MspGyaFu2k",
  authDomain: "mpf-docs.firebaseapp.com",
  projectId: "mpf-docs",
  storageBucket: "mpf-docs.firebasestorage.app",
  messagingSenderId: "89438860454",
  appId: "1:89438860454:web:eac54b2404659fa9deb067"
}

const APP_NAME = 'mpf-docs'
const app = getApps().find(a => a.name === APP_NAME) || initializeApp(firebaseConfig, APP_NAME)

export const db = getFirestore(app)
