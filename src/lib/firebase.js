import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyByzRUHnLrxAaZOS9Dap1Kl0ZH5STWWzKE",
  authDomain: "mpf-maquinaria.firebaseapp.com",
  projectId: "mpf-maquinaria",
  storageBucket: "mpf-maquinaria.firebasestorage.app",
  messagingSenderId: "643600511459",
  appId: "1:643600511459:web:2ebcbd251b5cdb65aa70d6"
};

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
export const storage = getStorage(app);

export default app;
