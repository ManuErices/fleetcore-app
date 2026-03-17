/**
 * InviteAccept.jsx — Aceptar invitación a empresa
 *
 * Flujo:
 *   1. Usuario llega a /invite/:token (sin sesión o con sesión)
 *   2. Se lee /invitaciones/{token} — valida que no esté usado ni expirado
 *   3. Si no tiene cuenta → muestra form de registro (email + contraseña)
 *   4. Si ya tiene cuenta → asigna la empresa directamente
 *   5. Al completar: escribe /users/{uid} con empresaId + role, marca invitación como usada
 */

import React, { useState, useEffect } from "react";
import { db, auth } from "../lib/firebase";
import {
  doc, getDoc, updateDoc, setDoc, serverTimestamp,
} from "firebase/firestore";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  onAuthStateChanged,
} from "firebase/auth";

const ROLES_LABEL = {
  admin_contrato:  "Administrador",
  administrativo:  "Administrativo",
  operador:        "Operador",
  mandante:        "Mandante",
  trabajador:      "Trabajador",
};

export default function InviteAccept({ token }) {
  const [step,      setStep]      = useState("loading"); // loading | invalid | expired | used | register | login | accepting | done | error
  const [invData,   setInvData]   = useState(null);
  const [empresa,   setEmpresa]   = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [form,      setForm]      = useState({ nombre: "", email: "", password: "", confirm: "" });
  const [error,     setError]     = useState("");
  const [saving,    setSaving]    = useState(false);
  const [mode,      setMode]      = useState("register"); // register | login

  // Escuchar sesión activa
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, u => setCurrentUser(u));
    return unsub;
  }, []);

  // Cargar y validar invitación
  useEffect(() => {
    if (!token) { setStep("invalid"); return; }
    (async () => {
      try {
        const snap = await getDoc(doc(db, "invitaciones", token));
        if (!snap.exists()) { setStep("invalid"); return; }

        const data = snap.data();

        if (data.usada) { setStep("used"); return; }
        if (data.expiresAt && data.expiresAt.toDate() < new Date()) {
          setStep("expired"); return;
        }

        // Cargar datos de empresa
        const empSnap = await getDoc(doc(db, "empresas", data.empresaId));
        if (!empSnap.exists()) { setStep("invalid"); return; }

        setInvData(data);
        setEmpresa({ id: data.empresaId, ...empSnap.data() });
        // Pre-fill email if specified in invite
        if (data.emailDestino) setForm(f => ({ ...f, email: data.emailDestino }));
        setStep("register");
      } catch (e) {
        console.error(e);
        setStep("error");
      }
    })();
  }, [token]);

  const handleChange = e => {
    setForm(f => ({ ...f, [e.target.name]: e.target.value }));
    setError("");
  };

  const aceptarInvitacion = async (uid) => {
    setStep("accepting");
    try {
      // Crear/actualizar doc de usuario
      await setDoc(doc(db, "users", uid), {
        empresaId:    invData.empresaId,
        role:         invData.rol,
        email:        form.email || currentUser?.email,
        nombre:       form.nombre || "",
        updatedAt:    serverTimestamp(),
      }, { merge: true });

      // Marcar invitación como usada
      await updateDoc(doc(db, "invitaciones", token), {
        usada:     true,
        usadaPor:  uid,
        usadaEn:   serverTimestamp(),
      });

      setStep("done");
      // Redirigir al AppSelector después de 2s
      setTimeout(() => { window.location.href = "/"; }, 2000);
    } catch (e) {
      console.error(e);
      setError("Error al procesar la invitación: " + e.message);
      setStep("register");
    }
  };

  const handleRegister = async () => {
    if (!form.nombre.trim()) { setError("Ingresa tu nombre completo"); return; }
    if (!form.email.trim())  { setError("Ingresa tu email"); return; }
    if (form.password.length < 6) { setError("La contraseña debe tener al menos 6 caracteres"); return; }
    if (form.password !== form.confirm) { setError("Las contraseñas no coinciden"); return; }

    setSaving(true);
    try {
      const cred = await createUserWithEmailAndPassword(auth, form.email, form.password);
      await aceptarInvitacion(cred.user.uid);
    } catch (e) {
      if (e.code === "auth/email-already-in-use") {
        setError("Este email ya tiene cuenta. Inicia sesión para aceptar la invitación.");
        setMode("login");
      } else {
        setError(e.message);
      }
      setSaving(false);
    }
  };

  const handleLogin = async () => {
    if (!form.email.trim() || !form.password) { setError("Ingresa email y contraseña"); return; }
    setSaving(true);
    try {
      const cred = await signInWithEmailAndPassword(auth, form.email, form.password);
      await aceptarInvitacion(cred.user.uid);
    } catch (e) {
      setError("Email o contraseña incorrectos");
      setSaving(false);
    }
  };

  const handleAcceptWithCurrentUser = async () => {
    setSaving(true);
    await aceptarInvitacion(currentUser.uid);
    setSaving(false);
  };

  // ── Estados de pantalla ────────────────────────────────────

  if (step === "loading") return <Screen><Spinner /><p className="text-white/60 text-sm mt-3">Verificando invitación...</p></Screen>;
  if (step === "invalid") return <Screen><StatusCard icon="❌" title="Invitación inválida" desc="Este link no existe o fue eliminado." /></Screen>;
  if (step === "expired") return <Screen><StatusCard icon="⏰" title="Invitación expirada" desc="Este link ya no es válido. Pide una nueva invitación al administrador." /></Screen>;
  if (step === "used")    return <Screen><StatusCard icon="✓" title="Invitación ya usada" desc="Este link ya fue utilizado. Si es tuyo, inicia sesión normalmente." link="/" linkLabel="Ir al inicio" /></Screen>;
  if (step === "accepting") return <Screen><Spinner /><p className="text-white/60 text-sm mt-3">Configurando tu cuenta...</p></Screen>;
  if (step === "error")   return <Screen><StatusCard icon="⚠️" title="Error inesperado" desc="Algo salió mal. Intenta nuevamente o contacta al soporte." /></Screen>;

  if (step === "done") return (
    <Screen>
      <div className="text-center">
        <div className="w-20 h-20 rounded-full bg-emerald-500/20 border-2 border-emerald-400 flex items-center justify-center mx-auto mb-4">
          <svg className="w-10 h-10 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="text-2xl font-black text-white mb-2">¡Bienvenido a {empresa?.nombre}!</h2>
        <p className="text-white/60 text-sm">Redirigiendo a tu espacio de trabajo...</p>
      </div>
    </Screen>
  );

  // ── Pantalla principal: aceptar invitación ─────────────────
  return (
    <Screen>
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <img src="/favicon.svg" alt="FleetCore" className="h-12 w-auto mx-auto mb-4 object-contain" />
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-500/20 border border-emerald-400/30 rounded-2xl mb-4">
            <span className="text-emerald-400 text-sm">🎉</span>
            <span className="text-emerald-300 text-xs font-bold">Fuiste invitado a unirte</span>
          </div>
          <h1 className="text-2xl font-black text-white mb-1">{empresa?.nombre}</h1>
          <p className="text-white/50 text-sm">
            Rol asignado: <span className="text-white/80 font-semibold">{ROLES_LABEL[invData?.rol] || invData?.rol}</span>
          </p>
        </div>

        {/* Card */}
        <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl p-6 space-y-4">

          {/* Si ya tiene sesión iniciada */}
          {currentUser && step === "register" && (
            <div className="space-y-4">
              <div className="p-3 bg-blue-500/20 border border-blue-400/30 rounded-xl">
                <p className="text-blue-200 text-xs">
                  Estás conectado como <span className="font-bold text-white">{currentUser.email}</span>
                </p>
              </div>
              <p className="text-white/70 text-sm text-center">¿Aceptar la invitación con esta cuenta?</p>
              <button
                onClick={handleAcceptWithCurrentUser}
                disabled={saving}
                className="w-full py-3.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-black text-sm transition-all disabled:opacity-50"
              >
                {saving ? "Procesando..." : "✓ Aceptar invitación"}
              </button>
              <button
                onClick={() => { auth.signOut(); }}
                className="w-full py-2 text-xs text-white/40 hover:text-white/70 transition-colors"
              >
                Usar otra cuenta
              </button>
            </div>
          )}

          {/* Sin sesión — tabs register/login */}
          {!currentUser && (
            <>
              {/* Tabs */}
              <div className="flex gap-1 p-1 bg-white/5 rounded-xl">
                {["register", "login"].map(m => (
                  <button key={m} onClick={() => { setMode(m); setError(""); }}
                    className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${mode === m ? "bg-white/20 text-white" : "text-white/40 hover:text-white/60"}`}>
                    {m === "register" ? "Crear cuenta" : "Ya tengo cuenta"}
                  </button>
                ))}
              </div>

              {mode === "register" && (
                <>
                  <Field label="Nombre completo *">
                    <input name="nombre" value={form.nombre} onChange={handleChange}
                      placeholder="Juan Pérez"
                      className="w-full px-4 py-3 rounded-xl bg-white/10 border border-white/20 text-white placeholder-white/30 focus:outline-none focus:border-emerald-400 text-sm" />
                  </Field>
                  <Field label="Email *">
                    <input name="email" type="email" value={form.email} onChange={handleChange}
                      placeholder="tu@empresa.cl"
                      disabled={!!invData?.emailDestino}
                      className="w-full px-4 py-3 rounded-xl bg-white/10 border border-white/20 text-white placeholder-white/30 focus:outline-none focus:border-emerald-400 text-sm disabled:opacity-60" />
                  </Field>
                  <Field label="Contraseña *">
                    <input name="password" type="password" value={form.password} onChange={handleChange}
                      placeholder="Mínimo 6 caracteres"
                      className="w-full px-4 py-3 rounded-xl bg-white/10 border border-white/20 text-white placeholder-white/30 focus:outline-none focus:border-emerald-400 text-sm" />
                  </Field>
                  <Field label="Confirmar contraseña *">
                    <input name="confirm" type="password" value={form.confirm} onChange={handleChange}
                      placeholder="Repite la contraseña"
                      className="w-full px-4 py-3 rounded-xl bg-white/10 border border-white/20 text-white placeholder-white/30 focus:outline-none focus:border-emerald-400 text-sm" />
                  </Field>
                  {error && <p className="text-red-300 text-xs bg-red-500/10 border border-red-400/20 rounded-xl px-3 py-2">{error}</p>}
                  <button onClick={handleRegister} disabled={saving}
                    className="w-full py-3.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-black text-sm transition-all disabled:opacity-50">
                    {saving ? "Creando cuenta..." : "Crear cuenta y unirme →"}
                  </button>
                </>
              )}

              {mode === "login" && (
                <>
                  <Field label="Email">
                    <input name="email" type="email" value={form.email} onChange={handleChange}
                      placeholder="tu@email.cl"
                      className="w-full px-4 py-3 rounded-xl bg-white/10 border border-white/20 text-white placeholder-white/30 focus:outline-none focus:border-emerald-400 text-sm" />
                  </Field>
                  <Field label="Contraseña">
                    <input name="password" type="password" value={form.password} onChange={handleChange}
                      placeholder="Tu contraseña"
                      className="w-full px-4 py-3 rounded-xl bg-white/10 border border-white/20 text-white placeholder-white/30 focus:outline-none focus:border-emerald-400 text-sm" />
                  </Field>
                  {error && <p className="text-red-300 text-xs bg-red-500/10 border border-red-400/20 rounded-xl px-3 py-2">{error}</p>}
                  <button onClick={handleLogin} disabled={saving}
                    className="w-full py-3.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-black text-sm transition-all disabled:opacity-50">
                    {saving ? "Iniciando sesión..." : "Iniciar sesión y unirme →"}
                  </button>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </Screen>
  );
}

// ── Helpers UI ─────────────────────────────────────────────────
function Screen({ children }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-emerald-900/20 to-slate-900 flex items-center justify-center px-4 py-8">
      <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />
      {children}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label className="block text-[11px] font-bold text-white/50 uppercase tracking-widest mb-1.5">{label}</label>
      {children}
    </div>
  );
}

function Spinner() {
  return <div className="w-10 h-10 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin mx-auto" />;
}

function StatusCard({ icon, title, desc, link, linkLabel }) {
  return (
    <div className="text-center max-w-sm">
      <div className="text-5xl mb-4">{icon}</div>
      <h2 className="text-xl font-black text-white mb-2">{title}</h2>
      <p className="text-white/50 text-sm mb-4">{desc}</p>
      {link && (
        <a href={link} className="inline-flex px-4 py-2 bg-white/10 hover:bg-white/20 text-white text-sm font-bold rounded-xl transition-all">
          {linkLabel}
        </a>
      )}
    </div>
  );
}
