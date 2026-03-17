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
import { db } from "../lib/firebase";
import {
  collection, addDoc, getDocs, updateDoc, doc,
  serverTimestamp, query, orderBy, where,
} from "firebase/firestore";

const ROLES = [
  { value: "admin_contrato",  label: "Administrador",   desc: "Acceso completo a la empresa" },
  { value: "administrativo",  label: "Administrativo",  desc: "Acceso a módulos asignados" },
  { value: "operador",        label: "Operador",        desc: "Solo WorkFleet móvil" },
  { value: "mandante",        label: "Mandante",        desc: "Solo lectura de reportes" },
  { value: "trabajador",      label: "Trabajador",      desc: "Portal de trabajador" },
];

const EXPIRACION_DIAS = [1, 3, 7, 30];

function fmtDate(ts) {
  if (!ts) return "—";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString("es-CL", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function getBaseUrl() {
  return window.location.origin;
}

export default function InviteUserPanel({ empresaId, onClose }) {
  const [invitaciones, setInvitaciones] = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [creating,     setCreating]     = useState(false);
  const [copied,       setCopied]       = useState(null);
  const [showForm,     setShowForm]     = useState(false);
  const [form, setForm] = useState({
    emailDestino: "",
    rol:          "administrativo",
    diasExpira:   7,
  });

  const cargar = useCallback(async () => {
    if (!empresaId) return;
    setLoading(true);
    try {
      const snap = await getDocs(query(
        collection(db, "invitaciones"),
        where("empresaId", "==", empresaId),
        orderBy("creadaEn", "desc")
      ));
      setInvitaciones(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [empresaId]);

  useEffect(() => { cargar(); }, [cargar]);

  const crearInvitacion = async () => {
    if (!form.rol) return;
    setCreating(true);
    try {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + form.diasExpira);

      const ref = await addDoc(collection(db, "invitaciones"), {
        empresaId,
        rol:          form.rol,
        emailDestino: form.emailDestino.trim() || null,
        usada:        false,
        creadaEn:     serverTimestamp(),
        expiresAt,
      });

      await cargar();
      setShowForm(false);
      setForm({ emailDestino: "", rol: "administrativo", diasExpira: 7 });

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

  const rolLabel = (rol) => ROLES.find(r => r.value === rol)?.label || rol;

  const activas = invitaciones.filter(i => !i.usada && (!i.expiresAt || i.expiresAt.toDate() > new Date()));

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-start justify-center p-4 pt-8 overflow-y-auto">
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl mb-10">

        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between"
          style={{ background: "linear-gradient(135deg, #065f46 0%, #047857 100%)", borderRadius: "16px 16px 0 0" }}>
          <div>
            <h2 className="text-base font-black text-white">Invitar usuarios</h2>
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
                  {ROLES.map(r => (
                    <button key={r.value}
                      onClick={() => setForm(f => ({ ...f, rol: r.value }))}
                      className={`p-3 rounded-xl text-left border-2 transition-all ${form.rol === r.value ? "border-emerald-500 bg-emerald-50" : "border-slate-200 bg-white hover:border-slate-300"}`}>
                      <div className={`text-xs font-black ${form.rol === r.value ? "text-emerald-700" : "text-slate-700"}`}>{r.label}</div>
                      <div className="text-[10px] text-slate-400 mt-0.5">{r.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

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
