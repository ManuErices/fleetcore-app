import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../../lib/firebase";

const FinanzasContext = createContext(null);

// ─── Utilidades ───────────────────────────────────────────────────────────────
function diasHasta(fechaStr) {
  if (!fechaStr) return null;
  try {
    const d = new Date(fechaStr.includes("T") ? fechaStr : fechaStr + "T12:00:00");
    if (isNaN(d)) return null;
    return Math.ceil((d - new Date()) / 86400000);
  } catch { return null; }
}
function mesKey(fecha) {
  if (!fecha) return null;
  try {
    const d = new Date(fecha.includes("T") ? fecha : fecha + "T12:00:00");
    if (isNaN(d)) return null;
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  } catch { return null; }
}

// ─── Tipos de alerta ──────────────────────────────────────────────────────────
// tipo: "danger" | "warning" | "info"
// categoria: "activo_doc" | "costo_fijo" | "proveedor" | "activo_sin_datos" | "ingreso_faltante"

export function FinanzasProvider({ children }) {
  const [proyectos, setProyectos]       = useState([]);
  const [proyectoId, setProyectoId]     = useState("todos");
  const [loadingProyectos, setLoading]  = useState(true);
  const [alertas, setAlertas]           = useState([]);
  const [loadingAlertas, setLoadingAlertas] = useState(true);
  const [drawerOpen, setDrawerOpen]     = useState(false);

  // Cargar proyectos
  useEffect(() => {
    getDocs(collection(db, "projects"))
      .then(snap => setProyectos(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Calcular alertas globales
  const recalcularAlertas = useCallback(async () => {
    setLoadingAlertas(true);
    const resultado = [];

    // ── 1. Documentos vencidos/por vencer en Activos (7 días) ─────────────
    try {
      const snapFA = await getDocs(collection(db, "finanzas_activos"));
      const snapM  = await getDocs(collection(db, "machines"));
      const nombresMaq = {};
      snapM.docs.forEach(d => { nombresMaq[d.id] = d.data().name || d.data().patente || d.id; });

      snapFA.docs.forEach(d => {
        const a = d.data();
        const nombre = a.nombre || nombresMaq[a.machineId] || "Activo";
        const docs = [
          { key: "vencPermisoCirculacion", label: "Permiso Circulación" },
          { key: "vencSeguro",             label: "Seguro"              },
          { key: "vencRevisionTecnica",    label: "Revisión Técnica"    },
          { key: "vencSoapCivil",          label: "SOAP"                },
        ];
        docs.forEach(({ key, label }) => {
          const dias = diasHasta(a[key]);
          if (dias === null) return;
          if (dias < 0) {
            resultado.push({
              id: `activo_doc_${d.id}_${key}`,
              tipo: "danger",
              categoria: "activo_doc",
              titulo: `${label} vencido`,
              descripcion: `${nombre} — vencido hace ${Math.abs(dias)} día${Math.abs(dias) !== 1 ? "s" : ""}`,
              dias,
              accion: "Activos",
              fecha: a[key],
            });
          } else if (dias <= 7) {
            resultado.push({
              id: `activo_doc_${d.id}_${key}`,
              tipo: dias <= 3 ? "danger" : "warning",
              categoria: "activo_doc",
              titulo: `${label} por vencer`,
              descripcion: `${nombre} — vence en ${dias} día${dias !== 1 ? "s" : ""}`,
              dias,
              accion: "Activos",
              fecha: a[key],
            });
          }
        });
      });
    } catch (e) {}

    // ── 2. Costos fijos con día de pago próximo (7 días) ──────────────────
    try {
      const snap = await getDocs(collection(db, "costos_fijos"));
      const hoy = new Date();
      snap.docs.forEach(d => {
        const c = d.data();
        if (c.activo === false || !c.diaPago) return;
        const diaPago = parseInt(c.diaPago);
        // Calcular próxima fecha de pago (este mes o el siguiente)
        let fechaPago = new Date(hoy.getFullYear(), hoy.getMonth(), diaPago);
        if (fechaPago < hoy) fechaPago = new Date(hoy.getFullYear(), hoy.getMonth() + 1, diaPago);
        const dias = Math.ceil((fechaPago - hoy) / 86400000);
        if (dias <= 7) {
          const monto = parseFloat(c.monto) || 0;
          resultado.push({
            id: `costo_fijo_${d.id}`,
            tipo: dias <= 3 ? "danger" : "warning",
            categoria: "costo_fijo",
            titulo: `Pago próximo: ${c.nombre}`,
            descripcion: `Vence el día ${diaPago} — $${Math.round(monto).toLocaleString("es-CL")}`,
            dias,
            accion: "Costos",
            monto,
          });
        }
      });
    } catch (e) {}

    // ── 3. Proveedores con pagos pendientes/vencidos ───────────────────────
    try {
      const snap = await getDocs(collection(db, "finanzas_proveedores"));
      snap.docs.forEach(d => {
        const p = d.data();
        if (!["Pendiente", "Vencido", "Parcial"].includes(p.estadoPago)) return;
        const dias = diasHasta(p.fechaVencimiento);
        const tipo = p.estadoPago === "Vencido" || (dias !== null && dias < 0) ? "danger"
                   : dias !== null && dias <= 7 ? "warning" : "info";
        resultado.push({
          id: `proveedor_${d.id}`,
          tipo,
          categoria: "proveedor",
          titulo: `Pago ${p.estadoPago.toLowerCase()}: ${p.razonSocial || p.nombre || "Proveedor"}`,
          descripcion: p.fechaVencimiento
            ? `Venc. ${p.fechaVencimiento} — $${Math.round(parseFloat(p.monto) || 0).toLocaleString("es-CL")}`
            : `$${Math.round(parseFloat(p.monto) || 0).toLocaleString("es-CL")}`,
          dias,
          accion: "Proveedores",
          monto: parseFloat(p.monto) || 0,
        });
      });
    } catch (e) {}

    // ── 4. Activos FleetCore sin datos financieros cargados ───────────────
    try {
      const snapM  = await getDocs(collection(db, "machines"));
      const snapFA = await getDocs(collection(db, "finanzas_activos"));
      const conDatos = new Set(snapFA.docs.map(d => d.data().machineId).filter(Boolean));
      snapM.docs.forEach(d => {
        const m = d.data();
        if (m.empresa !== "MPF Ingeniería Civil" || m.active === false) return;
        if (!conDatos.has(d.id)) {
          resultado.push({
            id: `activo_sin_datos_${d.id}`,
            tipo: "info",
            categoria: "activo_sin_datos",
            titulo: "Activo sin datos financieros",
            descripcion: `${m.name || m.patente || d.id} — sin valorización ni documentos`,
            dias: null,
            accion: "Activos",
          });
        }
      });
    } catch (e) {}

    // ── 5. Meses sin ingresos registrados (últimos 3 meses) ───────────────
    try {
      const snap = await getDocs(collection(db, "finanzas_ingresos"));
      const mesesConIngreso = new Set(snap.docs.map(d => mesKey(d.data().fecha)).filter(Boolean));
      const hoy = new Date();
      for (let i = 1; i <= 3; i++) {
        const d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        const label = d.toLocaleString("es-CL", { month: "long", year: "numeric" });
        if (!mesesConIngreso.has(key)) {
          resultado.push({
            id: `ingreso_faltante_${key}`,
            tipo: "info",
            categoria: "ingreso_faltante",
            titulo: "Sin ingresos registrados",
            descripcion: `No hay ingresos manuales en ${label}`,
            dias: null,
            accion: "Flujo de Caja",
          });
        }
      }
    } catch (e) {}

    // Ordenar: danger primero, luego warning, luego info; dentro de cada tipo por días
    const orden = { danger: 0, warning: 1, info: 2 };
    resultado.sort((a, b) => {
      const od = orden[a.tipo] - orden[b.tipo];
      if (od !== 0) return od;
      if (a.dias !== null && b.dias !== null) return a.dias - b.dias;
      return 0;
    });

    setAlertas(resultado);
    setLoadingAlertas(false);
  }, []);

  useEffect(() => { recalcularAlertas(); }, [recalcularAlertas]);

  const proyecto = proyectos.find(p => p.id === proyectoId) || null;
  const alertasCriticas = alertas.filter(a => a.tipo === "danger").length;
  const totalAlertas = alertas.length;

  return (
    <FinanzasContext.Provider value={{
      proyectos, proyectoId, setProyectoId, proyecto, loadingProyectos,
      alertas, loadingAlertas, recalcularAlertas, alertasCriticas, totalAlertas,
      drawerOpen, setDrawerOpen,
    }}>
      {children}
    </FinanzasContext.Provider>
  );
}

export function useFinanzas() {
  const ctx = useContext(FinanzasContext);
  if (!ctx) throw new Error("useFinanzas debe usarse dentro de FinanzasProvider");
  return ctx;
}

// ─── Selector de proyecto reutilizable ───────────────────────────────────────
export function ProyectoSelector({ className = "" }) {
  const { proyectos, proyectoId, setProyectoId, loadingProyectos } = useFinanzas();

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div className="relative">
        <svg className="w-3.5 h-3.5 text-purple-500 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7h18M3 12h18M3 17h18" />
        </svg>
        <select
          value={proyectoId}
          onChange={e => setProyectoId(e.target.value)}
          disabled={loadingProyectos}
          className="pl-7 pr-8 py-2 border-2 border-purple-200 bg-purple-50 text-purple-800 rounded-xl focus:outline-none focus:border-purple-500 text-xs font-bold appearance-none cursor-pointer disabled:opacity-50 min-w-36"
        >
          <option value="todos">Todos los proyectos</option>
          {proyectos.map(p => (
            <option key={p.id} value={p.id}>{p.name || p.nombre}</option>
          ))}
        </select>
        <svg className="w-3 h-3 text-purple-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
        </svg>
      </div>
      {proyectoId !== "todos" && (
        <button
          onClick={() => setProyectoId("todos")}
          className="w-6 h-6 rounded-lg bg-purple-100 hover:bg-purple-200 text-purple-600 flex items-center justify-center transition-all"
          title="Limpiar filtro"
        >
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  );
}

// ─── Botón campana reutilizable ───────────────────────────────────────────────
export function NotificacionesBtn({ className = "" }) {
  const { totalAlertas, alertasCriticas, setDrawerOpen } = useFinanzas();
  return (
    <button
      onClick={() => setDrawerOpen(true)}
      className={`relative w-9 h-9 rounded-xl flex items-center justify-center transition-all ${
        alertasCriticas > 0
          ? "bg-red-50 hover:bg-red-100 text-red-600"
          : totalAlertas > 0
          ? "bg-amber-50 hover:bg-amber-100 text-amber-600"
          : "bg-slate-100 hover:bg-slate-200 text-slate-500"
      } ${className}`}
      title="Centro de notificaciones"
    >
      <svg className="w-4.5 h-4.5" style={{width:"18px",height:"18px"}} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
      </svg>
      {totalAlertas > 0 && (
        <span className={`absolute -top-1 -right-1 min-w-4 h-4 px-0.5 rounded-full text-white text-[10px] font-black flex items-center justify-center ${
          alertasCriticas > 0 ? "bg-red-500" : "bg-amber-500"
        }`}>
          {totalAlertas > 9 ? "9+" : totalAlertas}
        </span>
      )}
    </button>
  );
}
