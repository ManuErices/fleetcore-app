import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useEmpresa } from "../../lib/useEmpresa";
import { obtenerIndicadores, aPesos } from "../../lib/finanzas/monedas.js";

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
// categoria: "activo_doc" | "costo_fijo" | "proveedor" | "activo_sin_datos" | "ingreso_faltante" | "deuda_vencida"

export function FinanzasProvider({ children }) {
  const { empresaId, empresa } = useEmpresa();
  const [proyectos, setProyectos]       = useState([]);
  const [proyectoId, setProyectoId]     = useState("todos");
  const [loadingProyectos, setLoading]  = useState(true);
  const [alertas, setAlertas]           = useState([]);
  const [loadingAlertas, setLoadingAlertas] = useState(true);
  const [drawerOpen, setDrawerOpen]     = useState(false);

  // Cargar proyectos
  useEffect(() => {
    if (!empresaId) return;
    getDocs(collection(db, "empresas", empresaId, "projects"))
      .then(snap => setProyectos(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [empresaId]);

  // Calcular alertas globales
  const recalcularAlertas = useCallback(async () => {
    if (!empresaId) { setLoadingAlertas(false); return; }
    setLoadingAlertas(true);
    const resultado = [];

    // Valor del día de la UF y el dólar, para mostrar montos en pesos.
    let indicadores = null;
    try { indicadores = await obtenerIndicadores(empresaId); } catch (e) {}
    const montoTexto = (monto, moneda) => {
      const m = parseFloat(monto) || 0;
      if (!moneda || moneda === "CLP") return `$${Math.round(m).toLocaleString("es-CL")}`;
      const pesos = aPesos(m, moneda, indicadores);
      const original = `${moneda} ${m.toLocaleString("es-CL", { maximumFractionDigits: 2 })}`;
      return pesos === null ? original : `${original} (unos $${Math.round(pesos).toLocaleString("es-CL")})`;
    };

    // Máquinas de la flota: las usan las alertas de costos vehiculares y de activos.
    let maquinas = [];
    try {
      const snapM = await getDocs(collection(db, "empresas", empresaId, "machines"));
      maquinas = snapM.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch (e) {}

    // ── 1. Costos fijos con día de pago próximo (7 días) ──────────────────
    let costos = [];
    try {
      const snap = await getDocs(collection(db, "empresas", empresaId, "costos_fijos"));
      costos = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      const hoy = new Date();
      costos.forEach(c => {
        if (c.activo === false || !c.diaPago) return;
        const diaPago = parseInt(c.diaPago);
        // Calcular próxima fecha de pago (este mes o el siguiente)
        let fechaPago = new Date(hoy.getFullYear(), hoy.getMonth(), diaPago);
        if (fechaPago < hoy) fechaPago = new Date(hoy.getFullYear(), hoy.getMonth() + 1, diaPago);
        const dias = Math.ceil((fechaPago - hoy) / 86400000);
        if (dias <= 7) {
          const monto = parseFloat(c.monto) || 0;
          resultado.push({
            id: `costo_fijo_${c.id}`,
            tipo: dias <= 3 ? "danger" : "warning",
            categoria: "costo_fijo",
            titulo: `Pago próximo: ${c.nombre}`,
            descripcion: `Vence el día ${diaPago}, ${montoTexto(monto, c.moneda)}`,
            dias,
            accion: "Costos",
            // En pesos, para que ningún total sume UF como si fueran pesos.
            monto: aPesos(monto, c.moneda, indicadores) ?? undefined,
          });
        }
      });
    } catch (e) {}

    // ── 2. Documentos de costos fijos (faltantes, por vencer en 30 días, vencidos) ──
    // Permiso de circulación, revisión técnica y SOAP son de vehículos: solo se
    // piden a los créditos automotrices y a los leasing de un activo con
    // patente. El contrato se pide a créditos, leasing y arriendos. Si alguien
    // anotó una fecha de vencimiento en cualquier documento, se avisa igual.
    try {
      const DOCS_COSTO = [
        { key: "vencPermisoCirculacion", label: "Permiso Circulación", vehicular: true  },
        { key: "vencSeguro",             label: "Contrato",            vehicular: false },
        { key: "vencRevisionTecnica",    label: "Rev. Técnica",        vehicular: true  },
        { key: "vencSoapCivil",          label: "SOAP / Civil",        vehicular: true  },
      ];
      const CON_CONTRATO = new Set(["credito", "leasing", "arriendo", "otro"]);
      costos.forEach(c => {
        if (c.activo === false) return;
        const nombre = c.nombre || "Crédito";
        const urls = c.archivosDoc || {};
        const activo = c.activoVinculadoId && maquinas.find(m => m.id === c.activoVinculadoId);
        const esVehicular = c.categoria === "otro" || (c.categoria === "leasing" && !!activo?.patente);
        DOCS_COSTO.forEach(({ key, label, vehicular }) => {
          const aplica = vehicular ? esVehicular : CON_CONTRATO.has(c.categoria);
          const dias = diasHasta(c[key]); // fecha de vencimiento vive en la raíz (c[key])

          if (aplica && !urls[key]) {
            resultado.push({
              id: `costo_doc_falta_${c.id}_${key}`,
              tipo: "info",
              categoria: "costo_doc",
              titulo: `Documento faltante: ${label}`,
              descripcion: `${nombre}, sin archivo cargado`,
              dias: null,
              accion: "Costos",
            });
          }
          if (dias !== null) {
            if (dias < 0) {
              resultado.push({
                id: `costo_doc_venc_${c.id}_${key}`,
                tipo: "danger",
                categoria: "costo_doc",
                titulo: `${label} vencido`,
                descripcion: `${nombre}, vencido hace ${Math.abs(dias)} día${Math.abs(dias) !== 1 ? "s" : ""}`,
                dias,
                accion: "Costos",
              });
            } else if (dias <= 30) {
              resultado.push({
                id: `costo_doc_venc_${c.id}_${key}`,
                tipo: dias <= 7 ? "danger" : "warning",
                categoria: "costo_doc",
                titulo: `${label} por vencer`,
                descripcion: `${nombre}, vence en ${dias} día${dias !== 1 ? "s" : ""}`,
                dias,
                accion: "Costos",
              });
            }
          }
        });
      });
    } catch (e) {}

    // ── 3. Proveedores con pagos pendientes/vencidos ───────────────────────
    // Los registros manuales guardan "estado" y "fecha" (antes se leía
    // estadoPago y fechaVencimiento, que no existen, y la alerta nunca salía).
    try {
      const snap = await getDocs(collection(db, "empresas", empresaId, "finanzas_proveedores"));
      snap.docs.forEach(d => {
        const p = d.data();
        const estado = p.estado || p.estadoPago;
        if (!["Pendiente", "Vencido", "Parcial"].includes(estado)) return;
        const fecha = p.fechaVencimiento || p.fecha;
        const dias = diasHasta(fecha);
        const tipo = estado === "Vencido" || (dias !== null && dias < 0) ? "danger"
                   : dias !== null && dias <= 7 ? "warning" : "info";
        const monto = parseFloat(p.monto) || 0;
        resultado.push({
          id: `proveedor_${d.id}`,
          tipo,
          categoria: "proveedor",
          titulo: `Pago ${estado.toLowerCase()}: ${p.razonSocial || p.nombre || "Proveedor"}`,
          descripcion: fecha ? `Fecha ${fecha}, ${montoTexto(monto, p.moneda)}` : montoTexto(monto, p.moneda),
          dias,
          accion: "Proveedores",
          monto: aPesos(monto, p.moneda, indicadores) ?? undefined,
        });
      });
    } catch (e) {}

    // ── 4. Activos de la flota: documentos y datos de valor ───────────────
    // Activos guarda todo en la ficha de la máquina (machines). Antes estas
    // alertas leían finanzas_activos, que ya no se usa.
    try {
      const DOCS_ACTIVO = [
        { key: "vencPermisoCirculacion", label: "Permiso Circulación" },
        { key: "vencSeguro",             label: "Seguro"              },
        { key: "vencRevisionTecnica",    label: "Rev. Técnica"        },
        { key: "vencSoapCivil",          label: "SOAP / Civil"        },
      ];
      // Si la máquina indica a qué empresa pertenece, se compara con la empresa activa.
      const normal = (x) => String(x || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
      const nombreEmpresa = normal(empresa?.nombre || empresa?.razonSocial).replace(/spa$|ltda$|sa$/, "");
      maquinas.forEach(m => {
        if (m.active === false || m.activo === false) return;
        if (m.empresa && nombreEmpresa && !normal(m.empresa).startsWith(nombreEmpresa.slice(0, 12))) return;
        const nombre = m.nombre || m.name || m.patente || m.code || m.id;
        DOCS_ACTIVO.forEach(({ key, label }) => {
          const dias = diasHasta(m[key]);
          if (dias === null || dias > 30) return;
          resultado.push({
            id: `activo_doc_${m.id}_${key}`,
            tipo: dias < 0 || dias <= 7 ? "danger" : "warning",
            categoria: "activo_doc",
            titulo: dias < 0 ? `${label} vencido` : `${label} por vencer`,
            descripcion: dias < 0 ? `${nombre}, vencido hace ${Math.abs(dias)} día${Math.abs(dias) !== 1 ? "s" : ""}` : `${nombre}, vence en ${dias} día${dias !== 1 ? "s" : ""}`,
            dias,
            accion: "Activos",
          });
        });
        if (!m.valorCompra && !DOCS_ACTIVO.some(({ key }) => m[key])) {
          resultado.push({
            id: `activo_sin_datos_${m.id}`,
            tipo: "info",
            categoria: "activo_sin_datos",
            titulo: "Activo sin datos financieros",
            descripcion: `${nombre}, sin valor de compra ni documentos`,
            dias: null,
            accion: "Activos",
          });
        }
      });
    } catch (e) {}

    // ── 5. Cartolas sin subir hace más de 7 días ───────────────────────────
    // (Reemplaza "meses sin ingresos": leía finanzas_ingresos, que nunca se
    // llenó, y salía todos los meses. Los ingresos viven en el flujo.)
    try {
      const snap = await getDocs(collection(db, "empresas", empresaId, "banco_cuentas"));
      const nombresBanco = { bancochile: "Banco de Chile", bice: "BICE" };
      snap.docs.forEach(d => {
        const b = d.data();
        const dias = diasHasta(b.saldoAl);
        if (dias === null || dias >= -7) return;
        resultado.push({
          id: `banco_cartola_${d.id}`,
          tipo: dias < -14 ? "warning" : "info",
          categoria: "banco_cartola",
          titulo: `Sube la cartola de ${nombresBanco[b.banco] || b.banco}`,
          descripcion: `El último saldo es de hace ${Math.abs(dias)} días: la proyección de caja parte de ese saldo`,
          dias: null,
          accion: "Bancos",
        });
      });
    } catch (e) {}

    // ── 6. Deuda de proveedores/factoring/financieras vencida ──────────────
    try {
      const snapDeuda = await getDocs(collection(db, "empresas", empresaId, "deuda_proveedores"));
      const porAcreedor = {};
      snapDeuda.docs.forEach(d => {
        const doc = d.data();
        if (doc.estado !== "vencido") return;
        const key = doc.proveedorNombre || "Acreedor";
        if (!porAcreedor[key]) porAcreedor[key] = { saldo: 0, maxMora: 0, docs: 0 };
        porAcreedor[key].saldo += doc.saldoPendiente || 0;
        porAcreedor[key].docs += 1;
        if ((doc.diasMora || 0) > porAcreedor[key].maxMora) porAcreedor[key].maxMora = doc.diasMora;
      });
      Object.entries(porAcreedor).forEach(([nombre, info]) => {
        resultado.push({
          id: `deuda_vencida_${nombre.replace(/\s+/g, "_")}`,
          tipo: info.maxMora > 90 ? "danger" : "warning",
          categoria: "deuda_vencida",
          titulo: `Deuda vencida: ${nombre}`,
          descripcion: `${info.docs} documento${info.docs !== 1 ? "s" : ""} — $${Math.round(info.saldo).toLocaleString("es-CL")} — ${info.maxMora} días de mora`,
          dias: info.maxMora,
          accion: "Deuda",
          monto: info.saldo,
        });
      });
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
  }, [empresaId]);

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
// variante "cuaderno": renglón subrayado del diseño de Finanzas. Las pantallas
// que aún no se migran siguen usando la versión de siempre, sin la prop.
export function ProyectoSelector({ className = "", variante = "default" }) {
  const { proyectos, proyectoId, setProyectoId, loadingProyectos } = useFinanzas();

  if (variante === "cuaderno") {
    return (
      <div className={`flex items-end gap-1.5 ${className}`}>
        <label className="flex flex-col gap-0.5 text-sm text-cuaderno-grafito">
          Proyecto
          <select
            value={proyectoId}
            onChange={e => setProyectoId(e.target.value)}
            disabled={loadingProyectos}
            className="min-h-[40px] min-w-[190px] border-0 border-b-[1.5px] border-cuaderno-tinta/70 focus:border-cuaderno-tinta bg-transparent px-1 text-[18px] text-cuaderno-tinta focus:outline-none disabled:opacity-50 cursor-pointer"
          >
            <option value="todos">Todos los proyectos</option>
            {proyectos.map(p => (
              <option key={p.id} value={p.id}>{p.name || p.nombre}</option>
            ))}
          </select>
        </label>
        {proyectoId !== "todos" && (
          <button
            onClick={() => setProyectoId("todos")}
            className="min-h-[40px] px-1 text-[15px] text-cuaderno-grafito underline underline-offset-[3px] decoration-cuaderno-columna hover:text-cuaderno-tinta"
          >
            quitar filtro
          </button>
        )}
      </div>
    );
  }

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

// ─── Botón de avisos (pie de la barra lateral) ───────────────────────────────
// Diseño cuaderno: campana a trazo fino y el contador encerrado a lápiz, rojo si
// hay algo urgente.
export function NotificacionesBtn({ className = "" }) {
  const { totalAlertas, alertasCriticas, setDrawerOpen } = useFinanzas();
  return (
    <button
      onClick={() => setDrawerOpen(true)}
      className={`relative min-h-[40px] pl-2 pr-1 rounded-md flex items-center gap-2 font-manuscrita text-[16px] text-cuaderno-tinta hover:bg-cuaderno-hoja/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-cuaderno-tinta/40 ${className}`}
      title="Avisos"
      aria-label={totalAlertas > 0 ? `Avisos: ${totalAlertas} pendientes` : "Avisos"}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
      </svg>
      {totalAlertas > 0 && (
        <span className={`inline-flex items-center justify-center min-w-[1.6rem] px-1 rounded-full border-[1.5px] text-[13px] leading-5 ${
          alertasCriticas > 0 ? "border-cuaderno-roja text-cuaderno-roja" : "border-cuaderno-grafito text-cuaderno-grafito"}`}>
          {totalAlertas > 9 ? "9+" : totalAlertas}
        </span>
      )}
    </button>
  );
}
