import React, { useState, useEffect } from "react";
import { db, auth } from "../lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import CombustibleForm from './CombustibleForm';

export default function CombustiblePage({ onClose }) {
  const [empresaId, setEmpresaId] = useState(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          const userDoc = await getDoc(doc(db, 'users', user.uid));
          if (userDoc.exists()) {
            const userData = userDoc.data();
            setEmpresaId(userData.empresaId || null);
          }
        } catch (err) {
          console.error('Error obteniendo empresaId del usuario:', err);
        }
      }
    });
    return () => unsubscribe();
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 py-2 sm:py-4 px-0 sm:px-4">
      {empresaId && <CombustibleForm empresaId={empresaId} onClose={onClose} />}
    </div>
  );
}
