import { useState, useEffect } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { auth, db } from "./firebase";
import { onAuthStateChanged } from "firebase/auth";

// ============================================================
// useUserRole — lee en tiempo real el rol (y empresaId) del
// usuario autenticado desde users/{uid} (raíz de Firestore).
//
// Mismo documento que usa App.jsx/AppSelector.jsx/Firestore Rules
// como fuente de verdad de permisos.
// ============================================================
export function useUserRole() {
  const [role, setRole] = useState(null);
  const [empresaId, setEmpresaId] = useState(null);
  const [uid, setUid] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsubDoc = null;

    const unsubAuth = onAuthStateChanged(auth, (currentUser) => {
      if (unsubDoc) {
        unsubDoc();
        unsubDoc = null;
      }

      if (!currentUser) {
        setRole(null);
        setEmpresaId(null);
        setUid(null);
        setLoading(false);
        return;
      }

      setUid(currentUser.uid);

      unsubDoc = onSnapshot(
        doc(db, "users", currentUser.uid),
        (snap) => {
          if (snap.exists()) {
            const data = snap.data();
            setRole(data.role || null);
            setEmpresaId(data.empresaId || null);
          } else {
            setRole(null);
            setEmpresaId(null);
          }
          setLoading(false);
        },
        (err) => {
          console.error("useUserRole: error escuchando users/{uid}:", err);
          setRole(null);
          setEmpresaId(null);
          setLoading(false);
        }
      );
    });

    return () => {
      unsubAuth();
      if (unsubDoc) unsubDoc();
    };
  }, []);

  return { role, uid, empresaId, loading };
}
