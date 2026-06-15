/**
 * InviteAccept.jsx — Aceptar invitación a empresa
 *
 * Flujo:
 *   1. Usuario llega a /invite/:token (sin sesión o con sesión)
 *   2. Se lee /invitaciones/{token} — valida que no esté usado ni expirado
 *   3. Si no tiene cuenta → muestra form de registro (email + contraseña)
 *   4. Si ya tiene cuenta → asigna la empresa directamente
 *   5. Al completar: escribe /users/{uid} con empresaId + role + modulos, marca invitación como usada
 */

import React, { useState, useEffect } from "react";
import { db, auth } from "../lib/firebase";
import {
  doc, setDoc, serverTimestamp, getDocFromServer, collection,
} from "firebase/firestore";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  onAuthStateChanged,
} from "firebase/auth";
import { hashPin } from "./documentos/lib/firmas.js";

function mapRole(mainRole) {
  if (mainRole === 'superadmin') return 'admin'
  if (mainRole === 'admin_contrato') return 'supervisor'
  if (mainRole === 'revisor_admin') return 'supervisor'
  if (mainRole === 'revisor') return 'mandante'
  if (mainRole === 'mandante_admin') return 'mandante'
  if (mainRole === 'mandante') return 'mandante'
  if (mainRole === 'operador') return 'operador'
  return 'supervisor'
}


const ROLES_LABEL = {
  admin_contrato:  "Administrador",
  administrativo:  "Administrativo",
  operador:        "Operador",
  mandante:        "Mandante",
  trabajador:      "Trabajador",
};

const MODULOS_LABEL = {
  fleetcore:    "Oficina Técnica",
  reportes:     "Reportes",
  rrhh:         "RRHH",
  finanzas:     "Finanzas",
  contabilidad: "Contabilidad",
  workfleet:    "WorkFleet",
};

export default function InviteAccept({ token, onAccepted }) {
  const [step,        setStep]        = useState("loading");
  const [invData,     setInvData]     = useState(null);
  const [empresa,     setEmpresa]     = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [form,        setForm]        = useState({ nombre: "", rut: "", email: "", password: "", confirm: "", pin: "", confirmPin: "" });
  const [error,       setError]       = useState("");
  const [saving,      setSaving]      = useState(false);
  const [mode,        setMode]        = useState("register");

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, u => setCurrentUser(u));
    return unsub;
  }, []);

  useEffect(() => {
    if (!token) { setStep("invalid"); return; }
    (async () => {
      try {
        const snap = await getDocFromServer(doc(db, "invitaciones", token));
        if (!snap.exists()) { setStep("invalid"); return; }

        const data = snap.data();
        if (data.usada) { setStep("used"); return; }
        if (data.expiresAt && data.expiresAt.toDate() < new Date()) {
          setStep("expired"); return;
        }

        setInvData(data);
        // empresaNombre se guarda en el doc de invitación para evitar leer empresas/{id} sin auth
        setEmpresa({ id: data.empresaId, nombre: data.empresaNombre || '' });
        if (data.emailDestino) setForm(f => ({ ...f, email: data.emailDestino }));
        setStep("register");
      } catch (e) {
        console.error("Error cargando invitación:", e);
        setStep("error");
      }
    })();
  }, [token]);

  const aceptarInvitacion = async (uid, emailOverride) => {
    setStep("accepting");
    try {
      const email = emailOverride || form.email || currentUser?.email || "";

      // Crear/actualizar doc de usuario
      const userUpdate = {
        empresaId: invData.empresaId,
        role:      invData.rol,
        modulos:   invData.modulos || [],
        email,
        nombre:    form.nombre || "",
        rut:       form.rut || "",
        updatedAt: serverTimestamp(),
      };
      if (form.pin) {
        userUpdate.pinHash = await hashPin(form.pin);
      }

      await setDoc(doc(db, "users", uid), userUpdate, { merge: true });

      // Si el rol es 'trabajador', crear su registro en RRHH y el vínculo del portal
      // para que pueda acceder a /trabajador con sus credenciales reales
      if (invData.rol === 'trabajador') {
        const nombreParts = (form.nombre || "").trim().split(/\s+/);
        const trabajadorRef = doc(collection(db, "empresas", invData.empresaId, "trabajadores"));
        await setDoc(trabajadorRef, {
          nombre: nombreParts[0] || "",
          apellidoPaterno: nombreParts.slice(1).join(" ") || "",
          rut: form.rut || "",
          email,
          portalUid: uid,
          portalEmail: email,
          estado: "activo",
          createdAt: serverTimestamp(),
        });
        await setDoc(doc(db, "empresas", invData.empresaId, "trabajadores_portal", uid), {
          trabajadorDocId: trabajadorRef.id,
          rut: form.rut || "",
          email,
        });
      }

      // Marcar invitación como usada — setDoc con merge evita problemas de cache offline
      await setDoc(doc(db, "invitaciones", token), {
        usada:    true,
        usadaPor: uid,
        usadaEn:  serverTimestamp(),
      }, { merge: true });

      // Si se definió un PIN de firma, guardarlo en la base de datos de firmas y documentos
      if (form.pin) {
        const u = email.split('@')[0].toLowerCase().trim();
        const pinHash = await hashPin(form.pin);

        // 1. Guardar en 'pins' para firmas
        await setDoc(doc(db, "pins", u), {
          hash: pinHash,
          createdAt: new Date().toISOString(),
        });

        // 2. Guardar en 'usuarios' para documentos
        const docRole = mapRole(invData.rol);
        const empresaNombre = empresa?.nombre || "MPF Ingeniería Civil SpA";
        await setDoc(doc(db, "usuarios", u), {
          username: u,
          nombre: (form.nombre || "").trim(),
          rut: (form.rut || "").trim(),
          cargo: "",
          empresa: empresaNombre,
          rol: docRole,
          pinHash,
          creadoEn: serverTimestamp(),
        });
      }

      setStep("done");
      setTimeout(() => {
        if (onAccepted) {
          onAccepted();
        } else {
          window.location.href = "/";
        }
      }, 2500);
    } catch (e) {
      console.error("Error aceptando invitación:", e);
      setError("Error al procesar la invitación: " + e.message);
      setStep("register");
    }
  };

  const handleChange = e => {
    let val = e.target.value;
    if (e.target.name === "pin" || e.target.name === "confirmPin") {
      val = val.replace(/\D/g, "").slice(0, 4);
    }
    setForm(f => ({ ...f, [e.target.name]: val }));
    setError("");
  };

  const handleRegister = async () => {
    if (!form.nombre.trim()) { setError("Ingresa tu nombre completo"); return; }
    if (!form.email.trim())  { setError("Ingresa tu email"); return; }
    if (form.password.length < 6) { setError("La contraseña debe tener al menos 6 caracteres"); return; }
    if (form.password !== form.confirm) { setError("Las contraseñas no coinciden"); return; }
    if (!form.pin || form.pin.length < 4) { setError("El PIN de firma es obligatorio y debe tener 4 dígitos"); return; }
    if (form.pin !== form.confirmPin) { setError("Los PINs de firma no coinciden"); return; }

    setSaving(true);
    try {
      const cred = await createUserWithEmailAndPassword(auth, form.email.trim(), form.password);
      await aceptarInvitacion(cred.user.uid, form.email.trim());
    } catch (e) {
      if (e.code === "auth/email-already-in-use") {
        setError("Este email ya tiene cuenta. Inicia sesión para aceptar la invitación.");
        setMode("login");
      } else {
        setError(e.message);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleLogin = async () => {
    if (!form.email.trim() || !form.password) { setError("Ingresa email y contraseña"); return; }
    setSaving(true);
    try {
      const cred = await signInWithEmailAndPassword(auth, form.email.trim(), form.password);
      await aceptarInvitacion(cred.user.uid, form.email.trim());
    } catch (e) {
      setError("Email o contraseña incorrectos");
    } finally {
      setSaving(false);
    }
  };

  const handleAcceptWithCurrentUser = async () => {
    setSaving(true);
    try {
      await aceptarInvitacion(currentUser.uid, currentUser.email);
    } finally {
      setSaving(false);
    }
  };

  // ── Pantallas de estado ──────────────────────────────────────

  if (step === "loading") return (
    <Screen>
      <Loading text="Verificando invitación..." />
    </Screen>
  );

  if (step === "accepting") return (
    <Screen>
      <Loading text="Configurando tu cuenta..." />
    </Screen>
  );

  if (step === "invalid") return (
    <Screen>
      <StatusCard
        icon={<IconX />}
        iconBg="bg-red-500/20 border-red-400/50"
        iconColor="text-red-400"
        title="Invitación inválida"
        desc="Este link no existe o fue eliminado."
      />
    </Screen>
  );

  if (step === "expired") return (
    <Screen>
      <StatusCard
        icon={<IconClock />}
        iconBg="bg-amber-500/20 border-amber-400/50"
        iconColor="text-amber-400"
        title="Invitación expirada"
        desc="Este link ya no es válido. Solicita una nueva invitación al administrador."
      />
    </Screen>
  );

  if (step === "used") return (
    <Screen>
      <StatusCard
        icon={<IconCheck />}
        iconBg="bg-blue-500/20 border-blue-400/50"
        iconColor="text-blue-400"
        title="Invitación ya usada"
        desc="Este link ya fue utilizado. Si es tuyo, inicia sesión normalmente."
        link="/"
        linkLabel="Ir al inicio"
      />
    </Screen>
  );

  if (step === "error") return (
    <Screen>
      <StatusCard
        icon={<IconWarn />}
        iconBg="bg-red-500/20 border-red-400/50"
        iconColor="text-red-400"
        title="Error inesperado"
        desc="Algo salió mal. Intenta nuevamente o contacta al soporte."
        link={`/invite/${token}`}
        linkLabel="Reintentar"
      />
    </Screen>
  );

  if (step === "done") return (
    <Screen>
      <div className="text-center">
        <div className="w-20 h-20 rounded-full bg-emerald-500/20 border-2 border-emerald-400/60 flex items-center justify-center mx-auto mb-5 shadow-lg shadow-emerald-500/20">
          <IconCheck className="w-10 h-10 text-emerald-400" />
        </div>
        <h2 className="text-2xl font-black text-white mb-2">¡Bienvenido a {empresa?.nombre || 'la empresa'}!</h2>
        <p className="text-white/50 text-sm">Redirigiendo a tu espacio de trabajo...</p>
      </div>
    </Screen>
  );

  // ── Pantalla principal: aceptar invitación ─────────────────
  const modulos = invData?.modulos || [];

  return (
    <Screen>
      <div className="w-full max-w-md">

        {/* Badge empresa */}
        <div className="text-center mb-7">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-indigo-500/20 border border-indigo-400/30 rounded-2xl mb-5">
            <span className="text-indigo-300 text-xs font-bold tracking-wide uppercase">Invitación</span>
          </div>
          <h1 className="text-3xl font-black text-white mb-1 leading-tight">
            {empresa?.nombre || 'FleetCore'}
          </h1>
          <div className="flex items-center justify-center gap-2 mt-2 flex-wrap">
            <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-black border ${roleBadgeCls(invData?.rol)}`}>
              {ROLES_LABEL[invData?.rol] || invData?.rol}
            </span>
            {modulos.length > 0 && modulos.map(m => (
              <span key={m} className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/20 border border-blue-400/30 text-blue-300">
                {MODULOS_LABEL[m] || m}
              </span>
            ))}
          </div>
        </div>

        {/* Card */}
        <div className="bg-slate-800/80 backdrop-blur-xl border border-slate-600/40 rounded-2xl p-6 shadow-2xl space-y-4">

          {/* Ya tiene sesión */}
          {currentUser && step === "register" && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-3 bg-indigo-500/20 border border-indigo-400/40 rounded-xl">
                <div className="w-8 h-8 rounded-lg bg-indigo-500/50 flex items-center justify-center flex-shrink-0">
                  <span className="text-white text-sm font-bold">{currentUser.email?.[0]?.toUpperCase()}</span>
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] text-indigo-300 uppercase tracking-wider font-bold">Sesión activa</p>
                  <p className="text-sm text-white font-semibold truncate">{currentUser.email}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Nombre completo">
                  <input name="nombre" value={form.nombre} onChange={handleChange}
                    placeholder="Juan Pérez"
                    className={inputCls} />
                </Field>
                <Field label="RUT">
                  <input name="rut" value={form.rut} onChange={handleChange}
                    placeholder="12.345.678-9"
                    className={inputCls} />
                </Field>
              </div>
              {error && <ErrorBanner msg={error} />}
              <button
                onClick={handleAcceptWithCurrentUser}
                disabled={saving}
                className="w-full py-3.5 rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white font-black text-sm transition-all disabled:opacity-50 shadow-lg shadow-indigo-500/20"
              >
                {saving ? "Procesando..." : "✓ Aceptar invitación"}
              </button>
              <button
                onClick={() => { auth.signOut(); }}
                className="w-full py-2 text-xs text-white/30 hover:text-white/60 transition-colors"
              >
                Usar otra cuenta
              </button>
            </div>
          )}

          {/* Sin sesión */}
          {!currentUser && (
            <>
              {/* Tabs */}
              <div className="flex gap-1 p-1 bg-slate-700/60 rounded-xl border border-slate-600/40">
                {["register", "login"].map(m => (
                  <button key={m} onClick={() => { setMode(m); setError(""); }}
                    className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${mode === m ? "bg-indigo-600 text-white shadow-sm" : "text-slate-400 hover:text-slate-200"}`}>
                    {m === "register" ? "Crear cuenta" : "Ya tengo cuenta"}
                  </button>
                ))}
              </div>

              {mode === "register" && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Nombre completo *">
                      <input name="nombre" value={form.nombre} onChange={handleChange}
                        placeholder="Juan Pérez"
                        className={inputCls} />
                    </Field>
                    <Field label="RUT *">
                      <input name="rut" value={form.rut} onChange={handleChange}
                        placeholder="12.345.678-9"
                        className={inputCls} />
                    </Field>
                  </div>
                  <Field label="Email *">
                    <input name="email" type="email" value={form.email} onChange={handleChange}
                      placeholder="tu@empresa.cl"
                      disabled={!!invData?.emailDestino}
                      className={inputCls + (invData?.emailDestino ? " opacity-60" : "")} />
                  </Field>
                  <Field label="Contraseña *">
                    <input name="password" type="password" value={form.password} onChange={handleChange}
                      placeholder="Mínimo 6 caracteres"
                      className={inputCls} />
                  </Field>
                  <Field label="Confirmar contraseña *">
                    <input name="confirm" type="password" value={form.confirm} onChange={handleChange}
                      placeholder="Repite la contraseña"
                      className={inputCls} />
                  </Field>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="PIN de Firma (4 dígitos) *">
                      <input name="pin" type="password" inputMode="numeric" maxLength={4} value={form.pin} onChange={handleChange}
                        placeholder="••••"
                        className={inputCls} />
                    </Field>
                    <Field label="Confirmar PIN *">
                      <input name="confirmPin" type="password" inputMode="numeric" maxLength={4} value={form.confirmPin} onChange={handleChange}
                        placeholder="••••"
                        className={inputCls} />
                    </Field>
                  </div>
                  {error && <ErrorBanner msg={error} />}
                  <button onClick={handleRegister} disabled={saving}
                    className="w-full py-3.5 rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white font-black text-sm transition-all disabled:opacity-50 shadow-lg shadow-indigo-500/20">
                    {saving ? "Creando cuenta..." : "Crear cuenta y unirme →"}
                  </button>
                </>
              )}

              {mode === "login" && (
                <>
                  <Field label="Email">
                    <input name="email" type="email" value={form.email} onChange={handleChange}
                      placeholder="tu@email.cl"
                      className={inputCls} />
                  </Field>
                  <Field label="Contraseña">
                    <input name="password" type="password" value={form.password} onChange={handleChange}
                      placeholder="Tu contraseña"
                      className={inputCls} />
                  </Field>
                  {error && <ErrorBanner msg={error} />}
                  <button onClick={handleLogin} disabled={saving}
                    className="w-full py-3.5 rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white font-black text-sm transition-all disabled:opacity-50 shadow-lg shadow-indigo-500/20">
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

// ── Helpers ────────────────────────────────────────────────────

function roleBadgeCls(rol) {
  const map = {
    admin_contrato: "bg-purple-500/20 border-purple-400/30 text-purple-300",
    administrativo: "bg-blue-500/20 border-blue-400/30 text-blue-300",
    operador:       "bg-cyan-500/20 border-cyan-400/30 text-cyan-300",
    mandante:       "bg-amber-500/20 border-amber-400/30 text-amber-300",
    trabajador:     "bg-emerald-500/20 border-emerald-400/30 text-emerald-300",
  };
  return map[rol] || "bg-white/10 border-white/20 text-white/70";
}

const inputCls = "w-full px-4 py-3 rounded-xl bg-white border border-slate-200 text-slate-800 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 text-sm transition-all";

// ── Componentes UI ─────────────────────────────────────────────

function Screen({ children }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-indigo-950/40 to-slate-900 flex items-center justify-center px-4 py-8 relative overflow-hidden">
      <div className="absolute top-0 right-0 w-[700px] h-[700px] bg-indigo-500/15 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-blue-500/15 rounded-full blur-3xl pointer-events-none" />
      <div className="relative z-10">
        {children}
      </div>
    </div>
  );
}

function Loading({ text }) {
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="w-10 h-10 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
      <p className="text-white/50 text-sm">{text}</p>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label className="block text-[11px] font-bold text-slate-300 uppercase tracking-widest mb-1.5">{label}</label>
      {children}
    </div>
  );
}

function ErrorBanner({ msg }) {
  return (
    <div className="flex items-start gap-2 px-3 py-2.5 bg-red-500/10 border border-red-400/20 rounded-xl">
      <span className="text-red-400 text-sm mt-0.5 flex-shrink-0">!</span>
      <p className="text-red-300 text-xs">{msg}</p>
    </div>
  );
}

function StatusCard({ icon, iconBg, iconColor, title, desc, link, linkLabel }) {
  return (
    <div className="text-center max-w-sm">
      <div className={`w-16 h-16 rounded-2xl ${iconBg} border flex items-center justify-center mx-auto mb-4`}>
        <span className={iconColor}>{icon}</span>
      </div>
      <h2 className="text-xl font-black text-white mb-2">{title}</h2>
      <p className="text-white/40 text-sm mb-4">{desc}</p>
      {link && (
        <a href={link} className="inline-flex px-5 py-2.5 bg-white/10 hover:bg-white/15 border border-white/10 text-white text-sm font-bold rounded-xl transition-all">
          {linkLabel}
        </a>
      )}
    </div>
  );
}

function IconCheck({ className = "w-6 h-6" }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}

function IconX() {
  return (
    <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

function IconClock() {
  return (
    <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function IconWarn() {
  return (
    <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
    </svg>
  );
}
