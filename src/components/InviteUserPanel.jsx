/**
 * InviteUserPanel.jsx — Gestión de invitaciones
 *
 * Usado por admin_contrato y superadmin para invitar usuarios a su empresa.
 * Se puede renderizar como modal o sección embebida.
 *
 * Props:
 *   empresaId  — ID de la empresa
 *   onClose    — fn para cerrar (si es modal)
 */

import React, { useState, useEffect, useCallback } from "react";
import { usePlan } from "../hooks/usePlan";
import {
  USER_MODULOS,
  ROLES as SYSTEM_ROLES,
  ROLE_LABELS,
  roleNeedsModulos,
  normalizeModulos,
  assignableRoles,
} from "../lib/plans";
import { db, auth } from "../lib/firebase";
import {
  collection, addDoc, getDocs, getDoc, updateDoc, doc,
  serverTimestamp, query, where,
} from "firebase/firestore";

// ── Derivado de la fuente única en lib/plans.js — no editar acá ──
// Un admin_contrato no puede invitar superadmins ni otros admin_contrato.
const ROLES = assignableRoles("admin_contrato");

const ROLES_REVISOR = SYSTEM_ROLES.filter(r => r.value === "revisor");

const MODULOS_ADMIN = USER_MODULOS;

const EXPIRACION_DIAS = [1, 3, 7, 30];

function fmtDate(ts) {
  if (!ts) return "—";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString("es-CL", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function getBaseUrl() {
  return window.location.origin;
}

// Mismo endpoint que usa el resto del sistema para llamar Cloud Functions
const FUNCTIONS_URL = import.meta.env.VITE_FUNCTIONS_URL
  || 'https://southamerica-west1-mpf-maquinaria.cloudfunctions.net';

export default function InviteUserPanel({ empresaId, onClose, soloRevisores = false, currentUserRole = "" }) {
  const { canAccess } = usePlan();
  const [invitaciones, setInvitaciones] = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [creating,     setCreating]     = useState(false);
  const [copied,       setCopied]       = useState(null);
  const [showForm,     setShowForm]     = useState(false);
  const [loggedInUserRole, setLoggedInUserRole] = useState(currentUserRole || "");

  useEffect(() => {
    if (currentUserRole) {
      setLoggedInUserRole(currentUserRole);
      return;
    }
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) return;
      try {
        const uDoc = await getDoc(doc(db, "users", u.uid));
        if (uDoc.exists()) {
          setLoggedInUserRole(uDoc.data().role || "");
        }
      } catch (err) {
        console.error("Error fetching logged in user role:", err);
      }
    });
    return unsub;
  }, [currentUserRole]);

  const rolesDisponibles = soloRevisores ? ROLES_REVISOR : ROLES;

  const getFilteredRoles = () => {
    let list = rolesDisponibles;
    if (loggedInUserRole === 'admin_contrato') {
      list = list.filter(r => r.value !== 'superadmin' && r.value !== 'admin_contrato');
      list = list.map(r => {
        if (r.value === 'administrativo') {
          return { ...r, label: "Editor", desc: "Acceso de edición a los módulos asignados" };
        }
        if (r.value === 'mandante') {
          return { ...r, label: "Solo Visualización", desc: "Acceso de solo lectura al Reporte WorkFleet" };
        }
        return r;
      });
    }
    return list;
  };

  const [form, setForm] = useState({
    emailDestino: "",
    rol:          soloRevisores ? "revisor" : "administrativo",
    diasExpira:   7,
    modulos:      [],
  });

  // ── Vincular a alguien que ya existe en otra empresa ────────
  // Cuando la misma persona trabaja en dos empresas no hace falta crearle
  // una segunda cuenta: se agrega esta empresa a las suyas y podrá cambiar
  // entre ellas desde el menú de usuario.
  const [emailBuscar,   setEmailBuscar]   = useState("");
  const [buscando,      setBuscando]      = useState(false);
  const [resultado,     setResultado]     = useState(null); // null | {existe:false} | {existe:true,...}
  const [vinculando,    setVinculando]    = useState(false);
  const [errorVincular, setErrorVincular] = useState("");
  const [okVincular,    setOkVincular]    = useState("");

  const llamarFuncion = async (nombre, payload) => {
    const r = await fetch(`${FUNCTIONS_URL}/${nombre}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, callerUid: auth.currentUser?.uid }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data?.error || 'Error en el servidor');
    return data;
  };

  const buscarUsuario = async () => {
    const email = emailBuscar.trim().toLowerCase();
    if (!email) return;
    setBuscando(true);
    setResultado(null);
    setErrorVincular("");
    setOkVincular("");
    try {
      const data = await llamarFuncion('buscarUsuarioPorEmail', { email });
      setResultado(data);
    } catch (e) {
      setErrorVincular(e.message);
    }
    setBuscando(false);
  };

  const vincular = async () => {
    if (!resultado?.uid) return;
    setVinculando(true);
    setErrorVincular("");
    try {
      const data = await llamarFuncion('vincularUsuarioAEmpresa', {
        uid: resultado.uid,
        empresaId,
        accion: 'vincular',
      });
      setOkVincular(data?.yaEstaba
        ? 'Esta persona ya pertenecía a la empresa.'
        : 'Listo. Ya puede cambiarse a esta empresa desde su menú de usuario.');
      setResultado(null);
      setEmailBuscar("");
    } catch (e) {
      setErrorVincular(e.message);
    }
    setVinculando(false);
  };

  const yaEnEstaEmpresa = !!resultado?.empresas?.some(e => e.id === empresaId);

  const cargar = useCallback(async () => {
    if (!empresaId) return;
    setLoading(true);
    try {
      // ✅ FIX: sin orderBy para evitar requerir índice compuesto — ordenar en cliente
      const snap = await getDocs(query(
        collection(db, "invitaciones"),
        where("empresaId", "==", empresaId)
      ));
      const lista = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      // Ordenar por creadaEn descendente en el cliente
      lista.sort((a, b) => {
        const ta = a.creadaEn?.seconds || 0;
        const tb = b.creadaEn?.seconds || 0;
        return tb - ta;
      });
      setInvitaciones(lista);
    } catch (e) {
      console.error('Error cargando invitaciones:', e);
      setInvitaciones([]);
    } finally {
      setLoading(false);
    }
  }, [empresaId]);

  useEffect(() => { cargar(); }, [cargar]);

  const crearInvitacion = async () => {
    if (!form.rol) return;
    setCreating(true);
    try {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + form.diasExpira);

      // Leer nombre de empresa para incluirlo en la invitación (InviteAccept no puede leer el doc directamente)
      let empresaNombre = '';
      try {
        const empSnap = await getDoc(doc(db, 'empresas', empresaId));
        if (empSnap.exists()) empresaNombre = empSnap.data().nombre || '';
      } catch {}

      const ref = await addDoc(collection(db, "invitaciones"), {
        empresaId,
        empresaNombre,
        rol:          form.rol,
        modulos:      roleNeedsModulos(form.rol) ? normalizeModulos(form.modulos) : [],
        emailDestino: form.emailDestino.trim() || null,
        diasExpira:   form.diasExpira,
        usada:        false,
        creadaEn:     serverTimestamp(),
        expiresAt,
      });

      await cargar();
      setShowForm(false);
      setForm({ emailDestino: "", rol: "administrativo", diasExpira: 7, modulos: [] });

      // Auto-copiar el link
      const link = `${getBaseUrl()}/invite/${ref.id}`;
      navigator.clipboard.writeText(link).catch(() => {});
      setCopied(ref.id);
      setTimeout(() => setCopied(null), 3000);
    } catch (e) {
      alert("Error al crear invitación: " + e.message);
    }
    setCreating(false);
  };

  const revocar = async (inv) => {
    if (!window.confirm("¿Revocar esta invitación?")) return;
    try {
      await updateDoc(doc(db, "invitaciones", inv.id), { usada: true, revocarEn: serverTimestamp() });
      cargar();
    } catch (e) { alert("Error: " + e.message); }
  };

  const copiarLink = (id) => {
    const link = `${getBaseUrl()}/invite/${id}`;
    navigator.clipboard.writeText(link).then(() => {
      setCopied(id);
      setTimeout(() => setCopied(null), 2500);
    });
  };

  const getStatus = (inv) => {
    if (inv.usada) return { label: inv.usadaPor ? "Aceptada" : "Revocada", cls: "bg-slate-100 text-slate-500 border-slate-200" };
    if (inv.expiresAt && inv.expiresAt.toDate() < new Date()) return { label: "Expirada", cls: "bg-red-50 text-red-600 border-red-200" };
    return { label: "Activa", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" };
  };

  const rolLabel = (rol) => ROLE_LABELS[rol] || rol;

  const activas = invitaciones.filter(i => !i.usada && (!i.expiresAt || i.expiresAt.toDate() > new Date()));

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-start justify-center p-4 pt-8 overflow-y-auto">
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl mb-10">

        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between"
          style={{ background: "linear-gradient(135deg, #065f46 0%, #047857 100%)", borderRadius: "16px 16px 0 0" }}>
          <div>
            <h2 className="text-base font-black text-white">{soloRevisores ? 'Invitar revisores' : 'Invitar usuarios'}</h2>
            <p className="text-xs text-emerald-200 mt-0.5">{activas.length} invitación{activas.length !== 1 ? "es" : ""} activa{activas.length !== 1 ? "s" : ""}</p>
          </div>
          <button onClick={onClose}
            className="w-8 h-8 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-all">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6 space-y-5">

          {/* ── Vincular usuario existente ──
              Va antes de la invitación porque es el camino correcto cuando
              la persona ya tiene cuenta: invitarla de nuevo le crearía un
              segundo usuario, que es justo lo que queremos evitar. */}
          {!showForm && !soloRevisores && (
            <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-4 space-y-3">
              <div>
                <p className="text-xs font-black text-blue-900 uppercase tracking-wider">
                  ¿La persona ya trabaja en otra empresa?
                </p>
                <p className="text-[11px] text-blue-700 mt-0.5 leading-relaxed">
                  Búscala por correo y vincúlala a esta empresa. Conserva su misma
                  cuenta y podrá alternar entre empresas desde su menú de usuario.
                </p>
              </div>

              <div className="flex gap-2">
                <input
                  type="email"
                  value={emailBuscar}
                  onChange={e => { setEmailBuscar(e.target.value); setResultado(null); setOkVincular(""); }}
                  onKeyDown={e => e.key === 'Enter' && buscarUsuario()}
                  placeholder="correo@empresa.cl"
                  className="flex-1 px-3 py-2 rounded-xl border border-blue-200 bg-white text-sm focus:outline-none focus:border-blue-400"
                />
                <button
                  onClick={buscarUsuario}
                  disabled={buscando || !emailBuscar.trim()}
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold text-sm transition-all"
                >
                  {buscando ? 'Buscando…' : 'Buscar'}
                </button>
              </div>

              {resultado?.existe === false && (
                <p className="text-[11px] font-semibold text-slate-500">
                  No hay ninguna cuenta con ese correo. Usa la invitación de abajo para crearla.
                </p>
              )}

              {resultado?.existe && (
                <div className="rounded-xl bg-white border border-blue-200 p-3 space-y-2">
                  <div>
                    <p className="text-sm font-black text-slate-800">{resultado.nombre || resultado.email}</p>
                    <p className="text-[11px] text-slate-500">
                      {resultado.email}{resultado.rut ? ` · ${resultado.rut}` : ''}
                      {resultado.role ? ` · ${rolLabel(resultado.role)}` : ''}
                    </p>
                  </div>

                  <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                      Empresas actuales
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {resultado.empresas?.map(e => (
                        <span key={e.id}
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${
                            e.id === empresaId
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : 'bg-slate-50 text-slate-600 border-slate-200'
                          }`}>
                          {e.nombre}
                        </span>
                      ))}
                    </div>
                  </div>

                  {yaEnEstaEmpresa ? (
                    <p className="text-[11px] font-semibold text-emerald-700">
                      Ya pertenece a esta empresa. No hay nada que hacer.
                    </p>
                  ) : (
                    <>
                      <p className="text-[11px] text-slate-500 leading-relaxed">
                        Mantendrá su rol actual
                        {resultado.role ? ` (${rolLabel(resultado.role)})` : ''}, que es el mismo
                        en todas sus empresas.
                      </p>
                      <button
                        onClick={vincular}
                        disabled={vinculando}
                        className="w-full py-2 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold text-sm transition-all"
                      >
                        {vinculando ? 'Vinculando…' : 'Vincular a esta empresa'}
                      </button>
                    </>
                  )}
                </div>
              )}

              {okVincular && (
                <p className="text-[11px] font-bold text-emerald-700">{okVincular}</p>
              )}
              {errorVincular && (
                <p className="text-[11px] font-bold text-red-600">{errorVincular}</p>
              )}
            </div>
          )}

          {/* Botón nueva invitación */}
          {!showForm && (
            <button onClick={() => setShowForm(true)}
              className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-sm transition-all flex items-center justify-center gap-2">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Nueva invitación
            </button>
          )}

          {/* Formulario */}
          {showForm && (
            <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 space-y-4">
              <h3 className="text-sm font-black text-slate-700">Nueva invitación</h3>

              {/* Email opcional */}
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                  Email del invitado <span className="font-normal text-slate-400">(opcional)</span>
                </label>
                <input
                  type="email"
                  value={form.emailDestino}
                  onChange={e => setForm(f => ({ ...f, emailDestino: e.target.value }))}
                  placeholder="usuario@empresa.cl"
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-emerald-400 bg-white"
                />
                <p className="text-[10px] text-slate-400 mt-1">Si lo dejas vacío, el link sirve para cualquiera</p>
              </div>

              {/* Rol */}
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                  Rol que tendrá *
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {getFilteredRoles().map(r => (
                    <button key={r.value}
                      onClick={() => setForm(f => ({ ...f, rol: r.value, modulos: [] }))}
                      className={`p-3 rounded-xl text-left border-2 transition-all ${form.rol === r.value ? "border-emerald-500 bg-emerald-50" : "border-slate-200 bg-white hover:border-slate-300"}`}>
                      <div className={`text-xs font-black ${form.rol === r.value ? "text-emerald-700" : "text-slate-700"}`}>{r.label}</div>
                      <div className="text-[10px] text-slate-400 mt-0.5">{r.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Módulos (para administrativo y operador) */}
              {roleNeedsModulos(form.rol) && (
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                    Módulos que podrá acceder
                  </label>
                  <p className="text-[10px] text-slate-400 mb-2">WorkFleet Móvil siempre incluido</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {MODULOS_ADMIN.map(m => {
                      const active = form.modulos.includes(m.value);
                      const isContracted = canAccess(m.value);
                      return (
                        <button key={m.value}
                          type="button"
                          disabled={!isContracted}
                          onClick={() => setForm(f => ({
                            ...f,
                            modulos: active
                              ? f.modulos.filter(x => x !== m.value)
                              : [...f.modulos, m.value],
                          }))}
                          className={`p-3 rounded-xl text-left border-2 transition-all ${
                            !isContracted 
                              ? "border-slate-100 bg-slate-50 opacity-50 cursor-not-allowed" 
                              : active 
                                ? "border-blue-500 bg-blue-50" 
                                : "border-slate-200 bg-white hover:border-slate-300"
                          }`}>
                          <div className="flex items-center gap-2">
                            <div className={`w-4 h-4 rounded flex-shrink-0 border-2 flex items-center justify-center ${
                              !isContracted
                                ? "border-slate-200 bg-slate-100"
                                : active 
                                  ? "bg-blue-600 border-blue-600" 
                                  : "border-slate-300"
                            }`}>
                              {active && <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                            </div>
                            <div>
                              <div className="flex items-center gap-1.5">
                                <span className={`text-xs font-black ${!isContracted ? "text-slate-400" : active ? "text-blue-700" : "text-slate-700"}`}>{m.label}</span>
                                {!isContracted && (
                                  <span className="text-[8px] bg-red-100 text-red-600 px-1 py-0.5 rounded font-black border border-red-200 uppercase tracking-wide">
                                    No Contratado
                                  </span>
                                )}
                              </div>
                              <div className="text-[10px] text-slate-400">{m.desc}</div>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Expiración */}
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                  Expira en
                </label>
                <div className="flex gap-2">
                  {EXPIRACION_DIAS.map(d => (
                    <button key={d}
                      onClick={() => setForm(f => ({ ...f, diasExpira: d }))}
                      className={`px-3 py-2 rounded-lg text-xs font-bold transition-all ${form.diasExpira === d ? "bg-emerald-600 text-white" : "bg-white border border-slate-200 text-slate-600 hover:border-emerald-300"}`}>
                      {d === 1 ? "1 día" : `${d} días`}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex gap-2 pt-1">
                <button onClick={() => setShowForm(false)}
                  className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm font-bold text-slate-600 hover:bg-slate-50 transition-all">
                  Cancelar
                </button>
                <button onClick={crearInvitacion} disabled={creating}
                  className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-black transition-all disabled:opacity-50">
                  {creating ? "Creando..." : "Crear y copiar link"}
                </button>
              </div>
            </div>
          )}

          {/* Lista de invitaciones */}
          <div>
            <h3 className="text-xs font-black text-slate-500 uppercase tracking-wider mb-3">
              Historial de invitaciones
            </h3>

            {loading ? (
              <div className="text-center py-8 text-slate-400 text-sm">Cargando...</div>
            ) : invitaciones.length === 0 ? (
              <div className="text-center py-8 text-slate-400 text-sm">No hay invitaciones aún</div>
            ) : (
              <div className="space-y-2">
                {invitaciones.map(inv => {
                  const status = getStatus(inv);
                  const link = `${getBaseUrl()}/invite/${inv.id}`;
                  const isActive = status.label === "Activa";

                  return (
                    <div key={inv.id} className="border border-slate-200 rounded-xl p-3 flex items-start gap-3 hover:border-slate-300 transition-all">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-bold text-slate-800">{rolLabel(inv.rol)}</span>
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-black border ${status.cls}`}>
                            {status.label}
                          </span>
                          {inv.emailDestino && (
                            <span className="text-xs text-slate-400">{inv.emailDestino}</span>
                          )}
                        </div>
                        <div className="text-[10px] text-slate-400 mt-1 space-x-3">
                          <span>Creada: {fmtDate(inv.creadaEn)}</span>
                          {inv.expiresAt && <span>· Expira: {fmtDate(inv.expiresAt)}</span>}
                          {inv.usadaPor && <span>· Usada por: {inv.usadaPor.slice(0,8)}...</span>}
                        </div>
                        {isActive && (
                          <div className="mt-2 flex items-center gap-2">
                            <code className="text-[10px] bg-slate-100 px-2 py-1 rounded-lg text-slate-500 truncate max-w-48">
                              {link}
                            </code>
                          </div>
                        )}
                      </div>

                      {isActive && (
                        <div className="flex flex-col gap-1.5 flex-shrink-0">
                          <button onClick={() => copiarLink(inv.id)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${copied === inv.id ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 hover:bg-slate-200 text-slate-600"}`}>
                            {copied === inv.id ? "✓ Copiado" : "Copiar"}
                          </button>
                          <button onClick={() => revocar(inv)}
                            className="px-3 py-1.5 rounded-lg text-xs font-bold bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 transition-all">
                            Revocar
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
