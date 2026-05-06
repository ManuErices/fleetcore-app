import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, query, orderBy, where, serverTimestamp } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useEmpresa } from "../../lib/useEmpresa";

const ContabilidadContext = createContext(null);

// ─── Utilidades globales ──────────────────────────────────────────────────────
export function fmt(n, decimals = 0) {
  if (!n && n !== 0) return "$0";
  const v = Math.round(Math.abs(n));
  return (n < 0 ? "-$" : "$") + v.toLocaleString("es-CL");
}
export function fmtM(n) {
  if (!n && n !== 0) return "$0";
  if (Math.abs(n) >= 1_000_000_000) return (n / 1_000_000_000).toFixed(1).replace(".", ",") + "B";
  if (Math.abs(n) >= 1_000_000)     return (n < 0 ? "-$" : "$") + (Math.abs(n) / 1_000_000).toFixed(1).replace(".", ",") + "M";
  if (Math.abs(n) >= 1_000)         return (n < 0 ? "-$" : "$") + (Math.abs(n) / 1_000).toFixed(0) + "K";
  return fmt(n);
}
export function mesKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
export const MESES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
export const MESES_S = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];

// ─── Tipos de cuenta IFRS/SII ─────────────────────────────────────────────────
export const TIPOS_CUENTA = [
  { id: "activo_corriente",      label: "Activo Corriente",         grupo: "ACTIVO",   signo:  1, orden: 1  },
  { id: "activo_no_corriente",   label: "Activo No Corriente",      grupo: "ACTIVO",   signo:  1, orden: 2  },
  { id: "pasivo_corriente",      label: "Pasivo Corriente",         grupo: "PASIVO",   signo: -1, orden: 3  },
  { id: "pasivo_no_corriente",   label: "Pasivo No Corriente",      grupo: "PASIVO",   signo: -1, orden: 4  },
  { id: "patrimonio",            label: "Patrimonio",               grupo: "PATRIMONIO",signo:-1, orden: 5  },
  { id: "ingreso",               label: "Ingresos",                 grupo: "RESULTADO",signo: -1, orden: 6  },
  { id: "costo",                 label: "Costo de Ventas",          grupo: "RESULTADO",signo:  1, orden: 7  },
  { id: "gasto_adm",             label: "Gastos Administración",    grupo: "RESULTADO",signo:  1, orden: 8  },
  { id: "gasto_fin",             label: "Gastos Financieros",       grupo: "RESULTADO",signo:  1, orden: 9  },
  { id: "otro_resultado",        label: "Otros Resultados",         grupo: "RESULTADO",signo:  1, orden: 10 },
  { id: "iva_credito",           label: "IVA Crédito Fiscal",       grupo: "TRIBUTARIO",signo: 1, orden: 11 },
  { id: "iva_debito",            label: "IVA Débito Fiscal",        grupo: "TRIBUTARIO",signo:-1, orden: 12 },
  { id: "ppm",                   label: "PPM",                      grupo: "TRIBUTARIO",signo: 1, orden: 13 },
  { id: "impuesto_diferido",     label: "Impuesto Diferido",        grupo: "TRIBUTARIO",signo: 1, orden: 14 },
];
export const TIPOS_MAP = Object.fromEntries(TIPOS_CUENTA.map(t => [t.id, t]));

// ─── Plan de cuentas base (precargado) ────────────────────────────────────────
export const CUENTAS_BASE = [
  { codigo: "1-01-001", nombre: "Caja",                          tipo: "activo_corriente"    },
  { codigo: "1-01-002", nombre: "Banco",                         tipo: "activo_corriente"    },
  { codigo: "1-01-003", nombre: "Cuentas por Cobrar",            tipo: "activo_corriente"    },
  { codigo: "1-01-004", nombre: "IVA Crédito Fiscal",            tipo: "iva_credito"         },
  { codigo: "1-01-005", nombre: "PPM",                           tipo: "ppm"                 },
  { codigo: "1-01-006", nombre: "Impuesto Diferido Activo",      tipo: "impuesto_diferido"   },
  { codigo: "1-02-001", nombre: "Activo Fijo (Maquinaria)",      tipo: "activo_no_corriente" },
  { codigo: "1-02-002", nombre: "Depreciación Acumulada",        tipo: "activo_no_corriente" },
  { codigo: "2-01-001", nombre: "Cuentas por Pagar",             tipo: "pasivo_corriente"    },
  { codigo: "2-01-002", nombre: "IVA Débito Fiscal",             tipo: "iva_debito"          },
  { codigo: "2-01-003", nombre: "Remuneraciones por Pagar",      tipo: "pasivo_corriente"    },
  { codigo: "2-02-001", nombre: "Leasing por Pagar L/P",         tipo: "pasivo_no_corriente" },
  { codigo: "2-02-002", nombre: "Créditos Bancarios L/P",        tipo: "pasivo_no_corriente" },
  { codigo: "3-01-001", nombre: "Capital",                       tipo: "patrimonio"          },
  { codigo: "3-01-002", nombre: "Utilidades Retenidas",          tipo: "patrimonio"          },
  { codigo: "3-01-003", nombre: "Resultado del Ejercicio",       tipo: "patrimonio"          },
  { codigo: "4-01-001", nombre: "Ingresos por Contratos",        tipo: "ingreso"             },
  { codigo: "4-01-002", nombre: "Ingresos por Servicios",        tipo: "ingreso"             },
  { codigo: "5-01-001", nombre: "Costo Mano de Obra",            tipo: "costo"               },
  { codigo: "5-01-002", nombre: "Materiales y Suministros",      tipo: "costo"               },
  { codigo: "6-01-001", nombre: "Remuneraciones Administración", tipo: "gasto_adm"           },
  { codigo: "6-01-002", nombre: "Arriendos",                     tipo: "gasto_adm"           },
  { codigo: "6-01-003", nombre: "Gastos Generales",              tipo: "gasto_adm"           },
  { codigo: "6-02-001", nombre: "Intereses Leasing",             tipo: "gasto_fin"           },
  { codigo: "6-02-002", nombre: "Intereses Bancarios",           tipo: "gasto_fin"           },
  { codigo: "6-03-001", nombre: "Depreciación del Período",      tipo: "otro_resultado"      },
];

// ─── Provider ─────────────────────────────────────────────────────────────────
export function ContabilidadProvider({ children }) {
  const { empresaId } = useEmpresa();
  const [cuentas, setCuentas]         = useState([]);
  const [asientos, setAsientos]       = useState([]);
  const [periodos, setPeriodos]       = useState([]);
  const [loadingCuentas, setLoadingC] = useState(true);
  const [loadingAsientos, setLoadingA]= useState(true);
  const [periodoActivo, setPeriodoActivo] = useState(mesKey());

  // Cargar plan de cuentas
  const cargarCuentas = useCallback(async () => {
    if (!empresaId) { setLoadingC(false); return; }
    setLoadingC(true);
    try {
      const snap = await getDocs(query(
        collection(db, "empresas", empresaId, "chart_of_accounts"),
        orderBy("codigo")
      ));
      if (snap.empty) {
        // Primera vez: inicializar con plan base
        const batch = CUENTAS_BASE.map(c =>
          addDoc(collection(db, "empresas", empresaId, "chart_of_accounts"), {
            ...c, activa: true, creadaEn: serverTimestamp()
          })
        );
        await Promise.all(batch);
        // Recargar
        const snap2 = await getDocs(query(
          collection(db, "empresas", empresaId, "chart_of_accounts"),
          orderBy("codigo")
        ));
        setCuentas(snap2.docs.map(d => ({ id: d.id, ...d.data() })));
      } else {
        setCuentas(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      }
    } catch (e) { console.error(e); }
    setLoadingC(false);
  }, [empresaId]);

  // Cargar asientos del período activo
  const cargarAsientos = useCallback(async () => {
    if (!empresaId) { setLoadingA(false); return; }
    setLoadingA(true);
    try {
      const snap = await getDocs(query(
        collection(db, "empresas", empresaId, "journal_entries"),
        where("periodo", "==", periodoActivo),
        orderBy("fecha", "desc")
      ));
      setAsientos(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) { console.error(e); }
    setLoadingA(false);
  }, [empresaId, periodoActivo]);

  // Cargar períodos disponibles
  const cargarPeriodos = useCallback(async () => {
    if (!empresaId) return;
    try {
      const snap = await getDocs(collection(db, "empresas", empresaId, "periods"));
      const lista = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      // Siempre incluir el mes actual
      const actual = mesKey();
      if (!lista.find(p => p.id === actual)) {
        const d = new Date();
        lista.push({ id: actual, mes: d.getMonth(), anio: d.getFullYear(), cerrado: false });
      }
      lista.sort((a, b) => b.id.localeCompare(a.id));
      setPeriodos(lista);
    } catch (e) {}
  }, [empresaId]);

  useEffect(() => { cargarCuentas(); }, [cargarCuentas]);
  useEffect(() => { cargarAsientos(); }, [cargarAsientos]);
  useEffect(() => { cargarPeriodos(); }, [cargarPeriodos]);

  // ── Saldos calculados por cuenta ──────────────────────────────────────────
  const saldos = useCallback((periodo = null) => {
    const fuente = periodo
      ? asientos.filter(a => a.periodo === periodo)
      : asientos;
    const mapa = {};
    fuente.forEach(asiento => {
      (asiento.lineas || []).forEach(l => {
        if (!mapa[l.cuentaId]) mapa[l.cuentaId] = { debe: 0, haber: 0 };
        mapa[l.cuentaId].debe  += parseFloat(l.debe  || 0);
        mapa[l.cuentaId].haber += parseFloat(l.haber || 0);
      });
    });
    return mapa;
  }, [asientos]);

  // Saldo neto de una cuenta (positivo = deudora, negativo = acreedora)
  const saldoCuenta = useCallback((cuentaId, periodo = null) => {
    const s = saldos(periodo)[cuentaId] || { debe: 0, haber: 0 };
    return s.debe - s.haber;
  }, [saldos]);

  // Guardar asiento
  const guardarAsiento = async (data) => {
    if (!empresaId) return;
    if (data.id) {
      await updateDoc(doc(db, "empresas", empresaId, "journal_entries", data.id), {
        ...data, updatedAt: serverTimestamp()
      });
    } else {
      await addDoc(collection(db, "empresas", empresaId, "journal_entries"), {
        ...data, creadoEn: serverTimestamp()
      });
    }
    cargarAsientos();
  };

  const eliminarAsiento = async (id) => {
    await deleteDoc(doc(db, "empresas", empresaId, "journal_entries", id));
    cargarAsientos();
  };

  // Guardar cuenta
  const guardarCuenta = async (data) => {
    if (!empresaId) return;
    if (data.id) {
      const { id, ...rest } = data;
      await updateDoc(doc(db, "empresas", empresaId, "chart_of_accounts", id), rest);
    } else {
      await addDoc(collection(db, "empresas", empresaId, "chart_of_accounts"), {
        ...data, activa: true, creadaEn: serverTimestamp()
      });
    }
    cargarCuentas();
  };

  return (
    <ContabilidadContext.Provider value={{
      cuentas, asientos, periodos, periodoActivo, setPeriodoActivo,
      loadingCuentas, loadingAsientos,
      cargarCuentas, cargarAsientos, cargarPeriodos,
      saldos, saldoCuenta,
      guardarAsiento, eliminarAsiento, guardarCuenta,
    }}>
      {children}
    </ContabilidadContext.Provider>
  );
}

export function useContabilidad() {
  const ctx = useContext(ContabilidadContext);
  if (!ctx) throw new Error("useContabilidad debe usarse dentro de ContabilidadProvider");
  return ctx;
}

// ─── Selector de período reutilizable ────────────────────────────────────────
export function PeriodoSelector({ className = "" }) {
  const { periodos, periodoActivo, setPeriodoActivo } = useContabilidad();
  return (
    <div className={`relative ${className}`}>
      <svg className="w-3.5 h-3.5 text-purple-500 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
      <select
        value={periodoActivo}
        onChange={e => setPeriodoActivo(e.target.value)}
        className="pl-7 pr-8 py-2 border-2 border-purple-200 bg-purple-50 text-purple-800 rounded-xl focus:outline-none focus:border-purple-500 text-xs font-bold appearance-none cursor-pointer min-w-36"
      >
        {periodos.map(p => {
          const [anio, mes] = p.id.split("-");
          return (
            <option key={p.id} value={p.id}>
              {MESES[parseInt(mes) - 1]} {anio}
            </option>
          );
        })}
      </select>
      <svg className="w-3 h-3 text-purple-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
      </svg>
    </div>
  );
}
