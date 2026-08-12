/**
 * EmpresaSetup.jsx — Onboarding de empresa nueva
 *
 * Se muestra cuando un usuario autenticado no tiene empresaId asignado.
 * Crea el documento en /empresas/{id} y actualiza /users/{uid} con el empresaId.
 *
 * Flujo:
 *   1. Usuario llena nombre de empresa + RUT + teléfono (opcionales)
 *   2. Se crea /empresas/{auto-id} con estado "trial"
 *   3. Se actualiza /users/{uid} con empresaId + role: "admin_contrato"
 *   4. Se crea /subscriptions/{uid} con planId: "" y status: "trial"
 *   5. onComplete() → App recarga EmpresaProvider → usuario entra normal
 */

import React, { useState, useEffect } from "react";
import { db, auth } from "../lib/firebase";
import { collection, addDoc, doc, setDoc, getDoc, query, where, getDocs, serverTimestamp, collectionGroup } from "firebase/firestore";
import { signOut } from "firebase/auth";
import PhoneInput from "../components/ui/PhoneInput";

export default function EmpresaSetup({ user, onComplete, onLogout }) {
  const [step, setStep]       = useState(1); // 1: form, 2: creando, 3: listo
  const [error, setError]     = useState("");
  const [form, setForm]       = useState({
    nombre:    "",
    rut:       "",
    telefono:  "",
    industria: "",
  });

  // ── Auto-vincular empresa pre-creada por superadmin ──────────
  useEffect(() => {
    let active = true;
    const checkExistingEmpresa = async () => {
      if (!user?.email) return;
      try {
        // Verificar si el usuario fue eliminado por un admin (tombstone)
        const userSnap = await getDoc(doc(db, 'users', user.uid));
        if (!active) return;
        if (userSnap.exists() && userSnap.data().deleted) {
          await signOut(auth);
          return;
        }

        // 1. Auto-vincular si es un operario registrado por email en la ficha de trabajadores
        const qTrabajador = query(
          collectionGroup(db, "trabajadores"),
          where("email", "==", user.email)
        );
        const querySnapshotTrabajador = await getDocs(qTrabajador);
        if (!active) return;

        if (!querySnapshotTrabajador.empty) {
          const trabajadorDoc = querySnapshotTrabajador.docs[0];
          const empresaId = trabajadorDoc.ref.parent.parent.id;
          const trabajadorData = trabajadorDoc.data();

          setStep(2);

          // Vincular en el documento del usuario
          await setDoc(doc(db, "users", user.uid), {
            empresaId: empresaId,
            role:      "operador",
            email:     user.email,
            nombre:    trabajadorData.nombre || user.displayName || '',
            cargo:     trabajadorData.cargo || '',
            esSurtidor: trabajadorData.esSurtidor || false,
            accesoMaquinaria: trabajadorData.accesoMaquinaria !== false,
            updatedAt: serverTimestamp(),
          }, { merge: true });

          // Vincular en la subcolección de usuarios de la empresa
          await setDoc(doc(db, "empresas", empresaId, "users", user.uid), {
            empresaId: empresaId,
            role:      "operador",
            email:     user.email,
            nombre:    trabajadorData.nombre || user.displayName || '',
            cargo:     trabajadorData.cargo || '',
            esSurtidor: trabajadorData.esSurtidor || false,
            accesoMaquinaria: trabajadorData.accesoMaquinaria !== false,
            createdAt: serverTimestamp(),
          }, { merge: true });

          // Vincular el portalUid en la ficha del trabajador
          await setDoc(trabajadorDoc.ref, {
            portalUid: user.uid,
          }, { merge: true });

          if (active) {
            setStep(3);
            setTimeout(() => {
              if (active) onComplete();
            }, 1500);
          }
          return;
        }

        // 2. Vincular si es el administrador principal de la empresa
        const q = query(
          collection(db, "empresas"),
          where("adminEmail", "==", user.email)
        );
        const querySnapshot = await getDocs(q);
        if (!active) return;
        
        if (!querySnapshot.empty) {
          const empresaDoc = querySnapshot.docs[0];
          const empresaId = empresaDoc.id;

          setStep(2);

          // 1. Vincular en el documento del usuario
          await setDoc(doc(db, "users", user.uid), {
            empresaId: empresaId,
            role:      "admin_contrato",
            email:     user.email,
            updatedAt: serverTimestamp(),
          }, { merge: true });

          // 2. Vincular en el documento de la empresa (actualizar adminUid)
          await setDoc(doc(db, "empresas", empresaId), {
            adminUid: user.uid,
          }, { merge: true });

          // 3. Asegurar que exista el documento de suscripción
          const subRef = doc(db, "subscriptions", empresaId);
          const subSnap = await getDoc(subRef);
          if (!subSnap.exists()) {
            await setDoc(subRef, {
              planId:    "",
              status:    "trial",
              trialUntil: null,
              empresaId: empresaId,
              creadoEn:  serverTimestamp(),
            });
          }

          if (active) {
            setStep(3);
            setTimeout(() => {
              if (active) onComplete();
            }, 1500);
          }
        }
      } catch (err) {
        console.error("Error checking existing empresa:", err);
      }
    };

    checkExistingEmpresa();
    return () => { active = false; };
  }, [user, onComplete]);

  // ── Helpers de formato ──────────────────────────────────────
  const formatRut = (value) => {
    // Solo números y k/K, sin puntos ni guión aún
    let clean = value.replace(/[^0-9kK]/g, "");
    if (clean.length === 0) return "";
    // Separar dígito verificador
    const dv = clean.slice(-1).toUpperCase();
    const body = clean.slice(0, -1);
    if (body.length === 0) return dv;
    // Agregar puntos cada 3 dígitos
    const bodyFormatted = body.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    return `${bodyFormatted}-${dv}`;
  };

  const handleRutChange = (e) => {
    const formatted = formatRut(e.target.value);
    setForm({ ...form, rut: formatted });
    setError("");
  };

  const INDUSTRIAS = [
    "Construcción",
    "Minería",
    "Transporte y Logística",
    "Agricultura",
    "Forestal",
    "Energía",
    "Ingeniería Civil",
    "Otro",
  ];

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
    setError("");
  };

  const handleSubmit = async () => {
    if (!form.nombre.trim()) {
      setError("El nombre de la empresa es obligatorio.");
      return;
    }

    setStep(2);
    setError("");

    try {
      // 1. Crear documento de empresa
      const empresaRef = await addDoc(collection(db, "empresas"), {
        nombre:    form.nombre.trim(),
        rut:       form.rut.trim(),
        telefono:  form.telefono.trim(),
        industria: form.industria,
        estado:    "trial",
        plan:      "trial",
        adminUid:  user.uid,
        adminEmail: user.email,
        creadoEn:  serverTimestamp(),
      });

      // 2. Crear/actualizar usuario con empresaId y rol (setDoc merge por si no existe aún)
      await setDoc(doc(db, "users", user.uid), {
        empresaId: empresaRef.id,
        role:      "admin_contrato",
        email:     user.email,
        updatedAt: serverTimestamp(),
      }, { merge: true });

      // 3. Crear documento de suscripción trial
      await setDoc(doc(db, "subscriptions", empresaRef.id), {
        planId:    "",
        status:    "trial",
        trialUntil: null,
        empresaId: empresaRef.id,
        creadoEn:  serverTimestamp(),
      });

      setStep(3);

      // Esperar 1.5s para que el usuario vea el mensaje de éxito
      setTimeout(() => onComplete(), 1500);

    } catch (err) {
      console.error("Error creando empresa:", err);
      setError("Error al crear la empresa: " + err.message);
      setStep(1);
    }
  };

  // ── Paso 3: éxito ──────────────────────────────────────────
  if (step === 3) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center p-4">
        <div className="text-center animate-fadeInUp">
          <div className="w-20 h-20 rounded-full bg-emerald-500/20 border-2 border-emerald-400 flex items-center justify-center mx-auto mb-4">
            <svg className="w-10 h-10 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-2xl font-black text-white mb-2">¡Empresa creada!</h2>
          <p className="text-blue-200 text-sm">Redirigiendo a tu espacio de trabajo...</p>
        </div>
      </div>
    );
  }

  // ── Paso 2: creando ────────────────────────────────────────
  if (step === 2) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center p-4">
        <div className="text-center">
          <div className="w-12 h-12 border-2 border-blue-400 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-white font-semibold">Creando tu empresa...</p>
        </div>
      </div>
    );
  }

  // ── Paso 1: formulario ─────────────────────────────────────
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center px-4 py-8 relative overflow-hidden">
      <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-[600px] h-[600px] bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="relative w-full max-w-lg">

        {/* Header */}
        <div className="text-center mb-8">
          <img src="/favicon.svg" alt="FleetCore" className="h-14 w-auto mx-auto mb-4 object-contain" />
          <h1 className="text-3xl font-black text-white mb-2">Configura tu empresa</h1>
          <p className="text-blue-200 text-sm">
            Hola <span className="font-bold text-white">{user?.email?.split("@")[0]}</span>,
            {" "}completa estos datos para empezar.
          </p>
        </div>

        {/* Card */}
        <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl p-6 sm:p-8 space-y-5">

          {/* Nombre empresa */}
          <div>
            <label className="block text-xs font-bold text-blue-200 uppercase tracking-widest mb-1.5">
              Nombre de la empresa <span className="text-red-400">*</span>
            </label>
            <input
              name="nombre"
              value={form.nombre}
              onChange={handleChange}
              placeholder="Ej: Constructora MPF SpA"
              className="w-full px-4 py-3 rounded-xl bg-white/10 border border-white/20 text-white placeholder-white/40 focus:outline-none focus:border-blue-400 focus:bg-white/15 transition-all text-sm font-medium"
            />
          </div>

          {/* RUT */}
          <div>
            <label className="block text-xs font-bold text-blue-200 uppercase tracking-widest mb-1.5">
              RUT empresa <span className="text-white/40 font-normal">(opcional)</span>
            </label>
            <input
              name="rut"
              value={form.rut}
              onChange={handleRutChange}
              placeholder="Ej: 76.123.456-7"
              className="w-full px-4 py-3 rounded-xl bg-white/10 border border-white/20 text-white placeholder-white/40 focus:outline-none focus:border-blue-400 focus:bg-white/15 transition-all text-sm font-medium"
            />
          </div>

          {/* Industria */}
          <div>
            <label className="block text-xs font-bold text-blue-200 uppercase tracking-widest mb-1.5">
              Industria <span className="text-white/40 font-normal">(opcional)</span>
            </label>
            <select
              name="industria"
              value={form.industria}
              onChange={handleChange}
              className="w-full px-4 py-3 rounded-xl bg-white/10 border border-white/20 text-white focus:outline-none focus:border-blue-400 transition-all text-sm font-medium appearance-none"
              style={{ colorScheme: "dark" }}
            >
              <option value="">Seleccionar...</option>
              {INDUSTRIAS.map(i => (
                <option key={i} value={i}>{i}</option>
              ))}
            </select>
          </div>

          {/* Teléfono */}
          <PhoneInput
            value={form.telefono}
            onChange={val => setForm({ ...form, telefono: val })}
            label="Teléfono (opcional)"
            variant="glass"
          />

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-500/20 border border-red-400/30 rounded-xl">
              <svg className="w-4 h-4 text-red-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <p className="text-red-300 text-xs font-medium">{error}</p>
            </div>
          )}

          {/* Trial badge */}
          <div className="flex items-center gap-2 p-3 bg-amber-500/10 border border-amber-400/20 rounded-xl">
            <svg className="w-4 h-4 text-amber-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            <p className="text-amber-200 text-xs">
              Tu cuenta se creará en modo <span className="font-bold text-amber-300">Trial</span> con acceso a todos los módulos.
            </p>
          </div>

          {/* Botón */}
          <button
            onClick={handleSubmit}
            disabled={!form.nombre.trim()}
            className="w-full py-3.5 rounded-xl bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-black text-sm transition-all shadow-lg shadow-blue-900/50 active:scale-[0.98]"
          >
            Crear empresa y comenzar →
          </button>

          {/* Logout */}
          <button
            onClick={onLogout}
            className="w-full py-2 text-xs text-white/40 hover:text-white/70 transition-colors"
          >
            Cerrar sesión
          </button>
        </div>
      </div>
    </div>
  );
}
