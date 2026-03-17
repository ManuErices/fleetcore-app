/**
 * SuperAdminPanel.jsx — Panel de control global FleetCore
 * Overlay fullscreen accesible solo para role: "superadmin"
 * 
 * Secciones:
 *   1. Dashboard — MRR, empresas activas, trial, churn
 *   2. Empresas   — lista, activar/suspender, cambiar plan, ver usuarios
 *   3. Usuarios   — todos los usuarios del sistema, cambiar rol
 *   4. Pagos      — historial de subscriptions
 */

import React, { useState, useEffect, useCallback } from "react";
import { db } from "../lib/firebase";
import {
  collection, getDocs, doc, updateDoc, setDoc,
  serverTimestamp, query, orderBy, where,
} from "firebase/firestore";

// ─── Constantes ───────────────────────────────────────────────
const MODULES = {
  fleetcore: { name: "Oficina Técnica", price: 500000, color: "#f97316" },
  workfleet: { name: "WorkFleet",       price: 700000, color: "#3b82f6" },
  rrhh:      { name: "RRHH",            price: 350000, color: "#10b981" },
  finanzas:  { name: "Finanzas",        price: 400000, color: "#8b5cf6" },
};

const ESTADOS = {
  trial:      { label: "Trial",     cls: "bg-amber-100 text-amber-700 border-amber-200"   },
  activo:     { label: "Activo",    cls: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  pendiente:  { label: "Pendiente", cls: "bg-slate-100 text-slate-600 border-slate-200"   },
  suspendido: { label: "Suspendido",cls: "bg-red-100 text-red-600 border-red-200"         },
};

const ROLES = ["superadmin", "admin_contrato", "administrativo", "operador", "mandante", "trabajador"];

const fmt = (n) => new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", minimumFractionDigits: 0 }).format(n || 0);
const fmtDate = (ts) => {
  if (!ts) return "—";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString("es-CL", { day: "2-digit", month: "short", year: "numeric" });
};

// ─── Helpers UI ───────────────────────────────────────────────
function Badge({ estado }) {
  const e = ESTADOS[estado] || ESTADOS.pendiente;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black border ${e.cls}`}>
      {e.label}
    </span>
  );
}

function KpiCard({ label, value, sub, color = "#6366f1", icon }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white text-lg"
          style={{ background: color }}>
          {icon}
        </div>
      </div>
      <div className="text-2xl font-black text-slate-900 mb-0.5">{value}</div>
      <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">{label}</div>
      {sub && <div className="text-xs text-slate-400 mt-1">{sub}</div>}
    </div>
  );
}

function SectionHeader({ title, subtitle, action }) {
  return (
    <div className="flex items-center justify-between mb-5">
      <div>
        <h2 className="text-lg font-black text-slate-900">{title}</h2>
        {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

// ─── Sección: Dashboard de métricas ───────────────────────────
function DashboardSection({ empresas, usuarios, subscriptions }) {
  const activas    = empresas.filter(e => e.estado === "activo");
  const trials     = empresas.filter(e => e.estado === "trial");
  const pendientes = empresas.filter(e => e.estado === "pendiente");
  const suspendidas = empresas.filter(e => e.estado === "suspendido");

  // MRR: suma de precios de módulos de empresas activas
  const mrr = activas.reduce((sum, emp) => {
    const sub = subscriptions.find(s => s.empresaId === emp.id);
    if (!sub || !sub.planId) return sum;
    const mods = sub.planId.split(",").filter(Boolean);
    return sum + mods.reduce((s, m) => s + (MODULES[m]?.price || 0), 0);
  }, 0);

  // ARR
  const arr = mrr * 12;

  // Módulos más usados
  const moduloCount = {};
  subscriptions.forEach(s => {
    if (!s.planId) return;
    s.planId.split(",").filter(Boolean).forEach(m => {
      moduloCount[m] = (moduloCount[m] || 0) + 1;
    });
  });

  // Empresas creadas este mes
  const thisMonth = new Date();
  thisMonth.setDate(1); thisMonth.setHours(0,0,0,0);
  const nuevasEsteMes = empresas.filter(e => {
    if (!e.creadoEn) return false;
    const d = e.creadoEn.toDate ? e.creadoEn.toDate() : new Date(e.creadoEn);
    return d >= thisMonth;
  }).length;

  return (
    <div className="space-y-6">
      {/* KPIs principales */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="MRR" value={fmt(mrr)} sub="Ingresos mensuales recurrentes" color="#6366f1" icon="💰" />
        <KpiCard label="ARR" value={fmt(arr)} sub="Proyección anual" color="#8b5cf6" icon="📈" />
        <KpiCard label="Empresas activas" value={activas.length} sub={`+${nuevasEsteMes} este mes`} color="#10b981" icon="🏢" />
        <KpiCard label="En trial" value={trials.length} sub={`${pendientes.length} pendientes de activar`} color="#f59e0b" icon="⏳" />
      </div>

      {/* Fila 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* Distribución por estado */}
        <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
          <h3 className="text-sm font-black text-slate-700 mb-4">Estado de empresas</h3>
          <div className="space-y-3">
            {[
              { label: "Activas",     count: activas.length,     color: "#10b981", pct: empresas.length ? (activas.length / empresas.length * 100) : 0 },
              { label: "Trial",       count: trials.length,      color: "#f59e0b", pct: empresas.length ? (trials.length / empresas.length * 100) : 0 },
              { label: "Pendientes",  count: pendientes.length,  color: "#94a3b8", pct: empresas.length ? (pendientes.length / empresas.length * 100) : 0 },
              { label: "Suspendidas", count: suspendidas.length, color: "#ef4444", pct: empresas.length ? (suspendidas.length / empresas.length * 100) : 0 },
            ].map(({ label, count, color, pct }) => (
              <div key={label}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="font-semibold text-slate-600">{label}</span>
                  <span className="font-black text-slate-800">{count}</span>
                </div>
                <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${pct}%`, background: color }} />
                </div>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-slate-300 mt-3 text-right">{empresas.length} total</p>
        </div>

        {/* Módulos más usados */}
        <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
          <h3 className="text-sm font-black text-slate-700 mb-4">Módulos contratados</h3>
          {Object.keys(MODULES).length === 0 || Object.keys(moduloCount).length === 0 ? (
            <p className="text-xs text-slate-400 py-4 text-center">Sin datos aún</p>
          ) : (
            <div className="space-y-3">
              {Object.entries(MODULES).map(([id, mod]) => (
                <div key={id} className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: mod.color }} />
                  <span className="text-xs font-semibold text-slate-600 flex-1">{mod.name}</span>
                  <span className="text-xs font-black text-slate-800">{moduloCount[id] || 0}</span>
                  <span className="text-[10px] text-slate-400">{fmt(mod.price)}/mes</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Usuarios por rol */}
        <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
          <h3 className="text-sm font-black text-slate-700 mb-4">Usuarios por rol</h3>
          <div className="space-y-2">
            {ROLES.map(rol => {
              const count = usuarios.filter(u => u.role === rol).length;
              if (count === 0) return null;
              return (
                <div key={rol} className="flex items-center justify-between">
                  <span className="text-xs text-slate-600 capitalize">{rol.replace("_", " ")}</span>
                  <span className="text-xs font-black text-slate-800 bg-slate-100 px-2 py-0.5 rounded-full">{count}</span>
                </div>
              );
            })}
            {usuarios.length === 0 && <p className="text-xs text-slate-400 text-center py-2">Sin datos</p>}
          </div>
          <p className="text-[10px] text-slate-300 mt-3 text-right">{usuarios.length} usuarios totales</p>
        </div>
      </div>
    </div>
  );
}

// ─── Sección: Gestión de empresas ─────────────────────────────
function EmpresasSection({ empresas, subscriptions, onRefresh }) {
  const [filtro,   setFiltro]   = useState("todas");
  const [busqueda, setBusqueda] = useState("");
  const [saving,   setSaving]   = useState(null);
  const [expanded, setExpanded] = useState(null);
  const [editSub,  setEditSub]  = useState(null); // empresaId siendo editado en plan

  const filtradas = empresas
    .filter(e => filtro === "todas" || e.estado === filtro)
    .filter(e => !busqueda || e.nombre?.toLowerCase().includes(busqueda.toLowerCase()) ||
      e.rut?.includes(busqueda) || e.adminEmail?.toLowerCase().includes(busqueda.toLowerCase()));

  const getSub = (emp) => subscriptions.find(s => s.empresaId === emp.id);

  const setEstado = async (emp, estado) => {
    if (!window.confirm(`¿${estado === "activo" ? "Activar" : "Suspender"} "${emp.nombre}"?`)) return;
    setSaving(emp.id);
    try {
      await updateDoc(doc(db, "empresas", emp.id), {
        estado, updatedAt: serverTimestamp(),
        ...(estado === "activo" ? { activadoEn: serverTimestamp() } : {}),
      });
      onRefresh();
    } catch (e) { alert("Error: " + e.message); }
    setSaving(null);
  };

  const setModulos = async (emp, modulos, status = "authorized") => {
    setSaving(emp.id);
    try {
      const sub = getSub(emp);
      const planId = modulos.join(",");
      if (sub) {
        await updateDoc(doc(db, "subscriptions", sub.id), { planId, status, updatedAt: serverTimestamp() });
      } else {
        // Crear subscription si no existe
        await setDoc(doc(db, "subscriptions", emp.adminUid || emp.id), {
          planId, status, empresaId: emp.id, creadoEn: serverTimestamp(),
        });
      }
      onRefresh();
    } catch (e) { alert("Error: " + e.message); }
    setSaving(null);
    setEditSub(null);
  };

  return (
    <div>
      <SectionHeader
        title="Empresas registradas"
        subtitle={`${empresas.length} empresas en el sistema`}
      />

      {/* Filtros y búsqueda */}
      <div className="flex flex-wrap gap-3 mb-4">
        <input
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
          placeholder="Buscar empresa, RUT o email..."
          className="flex-1 min-w-48 px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-indigo-400 bg-white"
        />
        <div className="flex gap-1.5">
          {["todas","activo","trial","pendiente","suspendido"].map(f => (
            <button key={f} onClick={() => setFiltro(f)}
              className={`px-3 py-2 rounded-xl text-xs font-bold transition-all ${filtro === f ? "bg-indigo-600 text-white" : "bg-white border border-slate-200 text-slate-600 hover:border-indigo-300"}`}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
              <span className="ml-1 opacity-60">({f === "todas" ? empresas.length : empresas.filter(e => e.estado === f).length})</span>
            </button>
          ))}
        </div>
      </div>

      {/* Lista */}
      <div className="space-y-3">
        {filtradas.length === 0 && (
          <div className="text-center py-12 text-slate-400 bg-white rounded-2xl border border-slate-100">Sin empresas</div>
        )}
        {filtradas.map(emp => {
          const sub = getSub(emp);
          const modActivos = sub?.planId ? sub.planId.split(",").filter(Boolean) : [];
          const mrr = modActivos.reduce((s, m) => s + (MODULES[m]?.price || 0), 0);
          const isExpanded = expanded === emp.id;

          return (
            <div key={emp.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              {/* Header empresa */}
              <div className="p-4 flex items-start gap-4">
                {/* Avatar */}
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-600 to-purple-600 flex items-center justify-center text-white font-black text-sm flex-shrink-0">
                  {emp.nombre?.[0]?.toUpperCase() || "E"}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-black text-slate-900">{emp.nombre}</span>
                    <Badge estado={emp.estado} />
                    {sub?.status === "authorized" && (
                      <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-black bg-indigo-50 text-indigo-700 border border-indigo-200">
                        Autorizado
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-slate-400 flex-wrap">
                    {emp.rut && <span>RUT {emp.rut}</span>}
                    {emp.adminEmail && <span>{emp.adminEmail}</span>}
                    {emp.industria && <span>· {emp.industria}</span>}
                    <span>· Creada {fmtDate(emp.creadoEn)}</span>
                  </div>
                  {/* Módulos activos */}
                  {modActivos.length > 0 && (
                    <div className="flex gap-1.5 mt-2 flex-wrap">
                      {modActivos.map(m => (
                        <span key={m} className="px-2 py-0.5 rounded-lg text-[10px] font-bold"
                          style={{ background: MODULES[m]?.color + "20", color: MODULES[m]?.color }}>
                          {MODULES[m]?.name || m}
                        </span>
                      ))}
                      <span className="text-[10px] font-bold text-slate-400 self-center">{fmt(mrr)}/mes</span>
                    </div>
                  )}
                </div>

                {/* Acciones rápidas */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  {emp.estado === "pendiente" && (
                    <button onClick={() => setEstado(emp, "activo")} disabled={saving === emp.id}
                      className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black rounded-lg transition-all disabled:opacity-50">
                      {saving === emp.id ? "..." : "✓ Activar"}
                    </button>
                  )}
                  {emp.estado === "activo" && (
                    <button onClick={() => setEstado(emp, "suspendido")} disabled={saving === emp.id}
                      className="px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 text-xs font-black rounded-lg border border-red-200 transition-all disabled:opacity-50">
                      Suspender
                    </button>
                  )}
                  {emp.estado === "suspendido" && (
                    <button onClick={() => setEstado(emp, "activo")} disabled={saving === emp.id}
                      className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-black rounded-lg border border-emerald-200 transition-all disabled:opacity-50">
                      Reactivar
                    </button>
                  )}
                  <button onClick={() => setExpanded(isExpanded ? null : emp.id)}
                    className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center transition-all">
                    <svg className={`w-4 h-4 text-slate-500 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                      fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Panel expandible */}
              {isExpanded && (
                <div className="border-t border-slate-100 p-4 bg-slate-50">
                  <h4 className="text-xs font-black text-slate-600 uppercase tracking-wider mb-3">Módulos y plan</h4>

                  {/* Toggle de módulos */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
                    {Object.entries(MODULES).map(([id, mod]) => {
                      const active = modActivos.includes(id);
                      return (
                        <button key={id}
                          onClick={() => {
                            const nuevo = active
                              ? modActivos.filter(m => m !== id)
                              : [...modActivos, id];
                            setModulos(emp, nuevo, sub?.status || "authorized");
                          }}
                          disabled={saving === emp.id}
                          className={`p-3 rounded-xl text-xs font-bold border-2 transition-all text-left ${active
                            ? "border-current text-white"
                            : "border-slate-200 text-slate-400 bg-white hover:border-slate-300"}`}
                          style={active ? { background: mod.color, borderColor: mod.color } : {}}>
                          <div>{mod.name}</div>
                          <div className={`text-[10px] mt-0.5 ${active ? "opacity-70" : "opacity-50"}`}>{fmt(mod.price)}/mes</div>
                        </button>
                      );
                    })}
                  </div>

                  {/* Status del plan */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-slate-500 font-medium">Estado plan:</span>
                    {["trial", "authorized", "cancelled"].map(s => (
                      <button key={s}
                        onClick={() => setModulos(emp, modActivos, s)}
                        disabled={saving === emp.id}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all ${sub?.status === s ? "bg-indigo-600 text-white" : "bg-white border border-slate-200 text-slate-500 hover:border-indigo-300"}`}>
                        {s}
                      </button>
                    ))}
                    {modActivos.length > 0 && (
                      <span className="ml-auto text-xs font-black text-indigo-700">{fmt(mrr)}/mes</span>
                    )}
                  </div>

                  {/* Info técnica */}
                  <p className="text-[10px] text-slate-300 mt-3">ID: {emp.id} · Admin UID: {emp.adminUid}</p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Sección: Usuarios ────────────────────────────────────────
function UsuariosSection({ usuarios, empresas, onRefresh }) {
  const [busqueda, setBusqueda] = useState("");
  const [saving, setSaving] = useState(null);

  const getEmpresa = (uid) => {
    const u = usuarios.find(u => u.id === uid);
    return empresas.find(e => e.id === u?.empresaId);
  };

  const filtrados = usuarios.filter(u =>
    !busqueda ||
    u.email?.toLowerCase().includes(busqueda.toLowerCase()) ||
    u.role?.includes(busqueda) ||
    u.empresaId?.includes(busqueda)
  );

  const cambiarRol = async (uid, role) => {
    setSaving(uid);
    try {
      await updateDoc(doc(db, "users", uid), { role, updatedAt: serverTimestamp() });
      onRefresh();
    } catch (e) { alert("Error: " + e.message); }
    setSaving(null);
  };

  return (
    <div>
      <SectionHeader
        title="Usuarios del sistema"
        subtitle={`${usuarios.length} usuarios registrados`}
      />

      <input
        value={busqueda}
        onChange={e => setBusqueda(e.target.value)}
        placeholder="Buscar por email, rol o empresaId..."
        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-indigo-400 bg-white mb-4"
      />

      <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-100">
            <tr>
              <th className="text-left px-4 py-3 text-xs font-black text-slate-500 uppercase tracking-wider">Usuario</th>
              <th className="text-left px-4 py-3 text-xs font-black text-slate-500 uppercase tracking-wider">Empresa</th>
              <th className="text-left px-4 py-3 text-xs font-black text-slate-500 uppercase tracking-wider">Rol</th>
              <th className="text-left px-4 py-3 text-xs font-black text-slate-500 uppercase tracking-wider">Creado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {filtrados.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-400 text-xs">Sin usuarios</td></tr>
            )}
            {filtrados.map(u => {
              const emp = getEmpresa(u.id);
              return (
                <tr key={u.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-white text-xs font-black flex-shrink-0">
                        {u.email?.[0]?.toUpperCase() || "U"}
                      </div>
                      <div>
                        <div className="font-semibold text-slate-800 text-xs">{u.email}</div>
                        <div className="text-[10px] text-slate-400">{u.id.slice(0, 8)}...</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-xs text-slate-700 font-medium">{emp?.nombre || "—"}</div>
                    <div className="text-[10px] text-slate-400">{u.empresaId?.slice(0, 8) || "sin empresa"}</div>
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={u.role || ""}
                      onChange={e => cambiarRol(u.id, e.target.value)}
                      disabled={saving === u.id}
                      className="text-xs border border-slate-200 rounded-lg px-2 py-1 focus:outline-none focus:border-indigo-400 bg-white disabled:opacity-50"
                    >
                      <option value="">Sin rol</option>
                      {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs text-slate-400">{fmtDate(u.createdAt || u.updatedAt)}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Sección: Pagos / Subscriptions ───────────────────────────
function PagosSection({ subscriptions, empresas }) {
  const fmt2 = (n) => new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", minimumFractionDigits: 0 }).format(n || 0);
  const getEmp = (sub) => empresas.find(e => e.id === sub.empresaId);

  const conPlan = subscriptions.filter(s => s.planId && s.planId.trim() !== "");

  return (
    <div>
      <SectionHeader
        title="Subscripciones"
        subtitle={`${conPlan.length} empresas con plan activo`}
      />

      <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-100">
            <tr>
              <th className="text-left px-4 py-3 text-xs font-black text-slate-500 uppercase tracking-wider">Empresa</th>
              <th className="text-left px-4 py-3 text-xs font-black text-slate-500 uppercase tracking-wider">Módulos</th>
              <th className="text-left px-4 py-3 text-xs font-black text-slate-500 uppercase tracking-wider">Estado</th>
              <th className="text-right px-4 py-3 text-xs font-black text-slate-500 uppercase tracking-wider">MRR</th>
              <th className="text-left px-4 py-3 text-xs font-black text-slate-500 uppercase tracking-wider">Desde</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {subscriptions.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400 text-xs">Sin subscripciones</td></tr>
            )}
            {subscriptions.map(sub => {
              const emp = getEmp(sub);
              const mods = sub.planId ? sub.planId.split(",").filter(Boolean) : [];
              const mrr = mods.reduce((s, m) => s + (MODULES[m]?.price || 0), 0);
              return (
                <tr key={sub.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3">
                    <div className="font-semibold text-slate-800 text-xs">{emp?.nombre || "Empresa desconocida"}</div>
                    <div className="text-[10px] text-slate-400">{emp?.adminEmail || sub.empresaId?.slice(0, 12)}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1 flex-wrap">
                      {mods.length === 0
                        ? <span className="text-[10px] text-slate-400">Sin módulos</span>
                        : mods.map(m => (
                          <span key={m} className="px-1.5 py-0.5 rounded text-[10px] font-bold"
                            style={{ background: (MODULES[m]?.color || "#94a3b8") + "20", color: MODULES[m]?.color || "#94a3b8" }}>
                            {MODULES[m]?.name || m}
                          </span>
                        ))
                      }
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-black border ${
                      sub.status === "authorized" ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                      sub.status === "trial"      ? "bg-amber-50 text-amber-700 border-amber-200" :
                      sub.status === "cancelled"  ? "bg-red-50 text-red-600 border-red-200" :
                      "bg-slate-100 text-slate-500 border-slate-200"
                    }`}>
                      {sub.status || "trial"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className={`text-sm font-black ${mrr > 0 ? "text-indigo-700" : "text-slate-400"}`}>
                      {mrr > 0 ? fmt2(mrr) : "—"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs text-slate-400">{fmtDate(sub.creadoEn)}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Panel principal ───────────────────────────────────────────
export default function SuperAdminPanel({ onClose }) {
  const [activeTab, setActiveTab] = useState("dashboard");
  const [empresas,       setEmpresas]       = useState([]);
  const [usuarios,       setUsuarios]       = useState([]);
  const [subscriptions,  setSubscriptions]  = useState([]);
  const [loading,        setLoading]        = useState(true);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const [empSnap, usrSnap, subSnap] = await Promise.all([
        getDocs(query(collection(db, "empresas"), orderBy("creadoEn", "desc"))),
        getDocs(collection(db, "users")),
        getDocs(collection(db, "subscriptions")),
      ]);
      setEmpresas(empSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setUsuarios(usrSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setSubscriptions(subSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) { console.error(e); }
    setLoading(false);
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  // Cerrar con Escape
  useEffect(() => {
    const fn = e => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", fn);
    return () => document.removeEventListener("keydown", fn);
  }, [onClose]);

  const TABS = [
    { id: "dashboard", label: "Dashboard",  icon: "📊" },
    { id: "empresas",  label: "Empresas",   icon: "🏢", badge: empresas.filter(e => e.estado === "pendiente").length },
    { id: "usuarios",  label: "Usuarios",   icon: "👥" },
    { id: "pagos",     label: "Pagos",      icon: "💳" },
  ];

  return (
    <>
      {/* Overlay */}
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50" onClick={onClose} />

      {/* Panel */}
      <div className="fixed inset-3 sm:inset-6 z-50 bg-slate-50 rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        style={{ maxHeight: "calc(100vh - 48px)" }}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-gradient-to-r from-slate-900 to-indigo-900 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center text-lg">🛡️</div>
            <div>
              <h1 className="text-white font-black text-base leading-tight">Super Admin</h1>
              <p className="text-indigo-200 text-xs">Panel de control global · FleetCore</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={cargar} disabled={loading}
              className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center transition-all"
              title="Actualizar">
              <svg className={`w-4 h-4 text-white ${loading ? "animate-spin" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
            <button onClick={onClose}
              className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-all">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-6 py-3 bg-white border-b border-slate-200 flex-shrink-0">
          {TABS.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`relative flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all ${
                activeTab === tab.id
                  ? "bg-indigo-600 text-white shadow-md shadow-indigo-200"
                  : "text-slate-500 hover:bg-slate-100 hover:text-slate-700"
              }`}>
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
              {tab.badge > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[10px] font-black rounded-full flex items-center justify-center">
                  {tab.badge}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Contenido */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-64 gap-3">
              <div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
              <p className="text-xs text-slate-400">Cargando datos...</p>
            </div>
          ) : (
            <>
              {activeTab === "dashboard" && <DashboardSection empresas={empresas} usuarios={usuarios} subscriptions={subscriptions} />}
              {activeTab === "empresas"  && <EmpresasSection  empresas={empresas} subscriptions={subscriptions} onRefresh={cargar} />}
              {activeTab === "usuarios"  && <UsuariosSection  usuarios={usuarios} empresas={empresas} onRefresh={cargar} />}
              {activeTab === "pagos"     && <PagosSection     subscriptions={subscriptions} empresas={empresas} />}
            </>
          )}
        </div>
      </div>
    </>
  );
}
