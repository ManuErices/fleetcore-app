import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, setDoc, query, orderBy, where, serverTimestamp } from "firebase/firestore";
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
// Normaliza un RUT para usarlo como clave estable (id de documento / lookup de reglas)
export function normalizaRut(rut) {
  return String(rut || "").replace(/[.\s]/g, "").toUpperCase();
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
  // ── ACTIVO CORRIENTE ─────────────────────────────────────────────────────────
  { codigo: "1-01-001", nombre: "Caja",                                  tipo: "activo_corriente"    },
  { codigo: "1-01-002", nombre: "Banco",                                  tipo: "activo_corriente"    },
  { codigo: "1-01-003", nombre: "Cuentas por Cobrar",                     tipo: "activo_corriente"    },
  { codigo: "1-01-004", nombre: "Deudores por Venta",                     tipo: "activo_corriente"    },
  { codigo: "1-01-005", nombre: "Retenciones por Facturar",               tipo: "activo_corriente"    },
  { codigo: "1-01-006", nombre: "Obras Ejecutadas por Cobrar",            tipo: "activo_corriente"    },
  { codigo: "1-01-007", nombre: "Boletas en Garantía",                    tipo: "activo_corriente"    },
  { codigo: "1-01-008", nombre: "Fondos por Rendir",                      tipo: "activo_corriente"    },
  { codigo: "1-01-009", nombre: "Anticipo a Proveedores",                 tipo: "activo_corriente"    },
  { codigo: "1-01-010", nombre: "Existencias / Bodega",                   tipo: "activo_corriente"    },
  { codigo: "1-01-011", nombre: "Seguros Pagados por Anticipado",         tipo: "activo_corriente"    },
  // ── ACTIVO TRIBUTARIO ────────────────────────────────────────────────────────
  { codigo: "1-02-001", nombre: "IVA Crédito Fiscal",                     tipo: "iva_credito"         },
  { codigo: "1-02-002", nombre: "PPM",                                    tipo: "ppm"                 },
  { codigo: "1-02-003", nombre: "Impuesto Diferido Activo",               tipo: "impuesto_diferido"   },
  { codigo: "1-02-004", nombre: "Imp. Específico Combustible (Recuperable)", tipo: "iva_credito"      },
  // ── ACTIVO NO CORRIENTE ──────────────────────────────────────────────────────
  { codigo: "1-03-001", nombre: "Maquinaria y Equipos",                   tipo: "activo_no_corriente" },
  { codigo: "1-03-002", nombre: "Vehículos",                              tipo: "activo_no_corriente" },
  { codigo: "1-03-003", nombre: "Herramientas y Equipos Menores",         tipo: "activo_no_corriente" },
  { codigo: "1-03-004", nombre: "Equipos Computacionales",                tipo: "activo_no_corriente" },
  { codigo: "1-03-005", nombre: "Mobiliario y Equipos de Oficina",        tipo: "activo_no_corriente" },
  { codigo: "1-03-006", nombre: "Depreciación Acumulada",                 tipo: "activo_no_corriente" },
  { codigo: "1-03-007", nombre: "Activos en Leasing",                     tipo: "activo_no_corriente" },
  // ── PASIVO CORRIENTE ─────────────────────────────────────────────────────────
  { codigo: "2-01-001", nombre: "Cuentas por Pagar",                      tipo: "pasivo_corriente"    },
  { codigo: "2-01-002", nombre: "IVA Débito Fiscal",                      tipo: "iva_debito"          },
  { codigo: "2-01-003", nombre: "Remuneraciones por Pagar",               tipo: "pasivo_corriente"    },
  { codigo: "2-01-004", nombre: "Honorarios por Pagar",                   tipo: "pasivo_corriente"    },
  { codigo: "2-01-005", nombre: "Retenciones de Garantía por Pagar",      tipo: "pasivo_corriente"    },
  { codigo: "2-01-006", nombre: "Anticipo de Clientes",                   tipo: "pasivo_corriente"    },
  { codigo: "2-01-007", nombre: "Impuesto a la Renta por Pagar",          tipo: "pasivo_corriente"    },
  { codigo: "2-01-008", nombre: "Dividendos por Pagar",                   tipo: "pasivo_corriente"    },
  { codigo: "2-01-009", nombre: "Cuotas Leasing Corto Plazo",             tipo: "pasivo_corriente"    },
  { codigo: "2-01-010", nombre: "Línea de Crédito Bancaria",              tipo: "pasivo_corriente"    },
  // ── PASIVO NO CORRIENTE ──────────────────────────────────────────────────────
  { codigo: "2-02-001", nombre: "Leasing por Pagar L/P",                  tipo: "pasivo_no_corriente" },
  { codigo: "2-02-002", nombre: "Créditos Bancarios L/P",                 tipo: "pasivo_no_corriente" },
  { codigo: "2-02-003", nombre: "Impuesto Diferido Pasivo",               tipo: "pasivo_no_corriente" },
  // ── PATRIMONIO ───────────────────────────────────────────────────────────────
  { codigo: "3-01-001", nombre: "Capital",                                tipo: "patrimonio"          },
  { codigo: "3-01-002", nombre: "Utilidades Retenidas",                   tipo: "patrimonio"          },
  { codigo: "3-01-003", nombre: "Resultado del Ejercicio",                tipo: "patrimonio"          },
  // ── INGRESOS ─────────────────────────────────────────────────────────────────
  { codigo: "4-01-001", nombre: "Ingresos por Contratos de Obras",        tipo: "ingreso"             },
  { codigo: "4-01-002", nombre: "Ingresos por Servicios de Ingeniería",   tipo: "ingreso"             },
  { codigo: "4-01-003", nombre: "Ingresos por Arriendo de Equipos",       tipo: "ingreso"             },
  { codigo: "4-01-004", nombre: "Otros Ingresos Operacionales",           tipo: "ingreso"             },
  // ── COSTOS DE OBRA ───────────────────────────────────────────────────────────
  { codigo: "5-01-001", nombre: "Costo Mano de Obra Directa",             tipo: "costo"               },
  { codigo: "5-01-002", nombre: "Subcontratos",                           tipo: "costo"               },
  { codigo: "5-01-003", nombre: "Materiales y Suministros",               tipo: "costo"               },
  { codigo: "5-01-004", nombre: "Combustible y Lubricantes",              tipo: "costo"               },
  { codigo: "5-01-005", nombre: "Mantención y Reparación Equipos",        tipo: "costo"               },
  { codigo: "5-01-006", nombre: "Arriendo de Maquinaria y Equipos",       tipo: "costo"               },
  { codigo: "5-01-007", nombre: "Fletes y Transportes de Obra",           tipo: "costo"               },
  { codigo: "5-01-008", nombre: "Herramientas y Consumibles",             tipo: "costo"               },
  { codigo: "5-01-009", nombre: "Seguridad Industrial Obra",              tipo: "costo"               },
  { codigo: "5-01-010", nombre: "Topografía y Ensayos",                   tipo: "costo"               },
  { codigo: "5-01-011", nombre: "Servicios Básicos Obra",                 tipo: "costo"               },
  // ── GASTOS ADMINISTRACIÓN ────────────────────────────────────────────────────
  { codigo: "6-01-001", nombre: "Remuneraciones Administración",          tipo: "gasto_adm"           },
  { codigo: "6-01-002", nombre: "Honorarios Profesionales",               tipo: "gasto_adm"           },
  { codigo: "6-01-003", nombre: "Arriendos Oficina",                      tipo: "gasto_adm"           },
  { codigo: "6-01-004", nombre: "Servicios Básicos Oficina",              tipo: "gasto_adm"           },
  { codigo: "6-01-005", nombre: "Telecomunicaciones",                     tipo: "gasto_adm"           },
  { codigo: "6-01-006", nombre: "Pasajes y Traslados",                    tipo: "gasto_adm"           },
  { codigo: "6-01-007", nombre: "Peajes y Movilización",                  tipo: "gasto_adm"           },
  { codigo: "6-01-008", nombre: "Viáticos",                               tipo: "gasto_adm"           },
  { codigo: "6-01-009", nombre: "Seguro Vehículos y Equipos",             tipo: "gasto_adm"           },
  { codigo: "6-01-010", nombre: "Seguro de Responsabilidad Civil",        tipo: "gasto_adm"           },
  { codigo: "6-01-011", nombre: "Servicios de Seguridad Oficina",         tipo: "gasto_adm"           },
  { codigo: "6-01-012", nombre: "Gastos Notariales y Legales",            tipo: "gasto_adm"           },
  { codigo: "6-01-013", nombre: "Suscripciones y Software",               tipo: "gasto_adm"           },
  { codigo: "6-01-014", nombre: "Materiales de Oficina",                  tipo: "gasto_adm"           },
  { codigo: "6-01-015", nombre: "Gastos de Representación",               tipo: "gasto_adm"           },
  { codigo: "6-01-016", nombre: "Capacitación y Perfeccionamiento",       tipo: "gasto_adm"           },
  { codigo: "6-01-017", nombre: "Gastos Bancarios",                       tipo: "gasto_adm"           },
  { codigo: "6-01-018", nombre: "Publicidad y Marketing",                 tipo: "gasto_adm"           },
  { codigo: "6-01-019", nombre: "Gastos Varios Administración",           tipo: "gasto_adm"           },
  // ── GASTOS FINANCIEROS ───────────────────────────────────────────────────────
  { codigo: "6-02-001", nombre: "Intereses Leasing",                      tipo: "gasto_fin"           },
  { codigo: "6-02-002", nombre: "Intereses Bancarios",                    tipo: "gasto_fin"           },
  { codigo: "6-02-003", nombre: "Comisiones Bancarias",                   tipo: "gasto_fin"           },
  { codigo: "6-02-004", nombre: "Diferencias de Cambio",                  tipo: "gasto_fin"           },
  // ── OTROS RESULTADOS ─────────────────────────────────────────────────────────
  { codigo: "6-03-001", nombre: "Depreciación del Período",               tipo: "otro_resultado"      },
  { codigo: "6-03-002", nombre: "Pérdida por Baja de Activos",            tipo: "otro_resultado"      },
  { codigo: "6-03-003", nombre: "Multas y Sanciones",                     tipo: "otro_resultado"      },
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
  // Reglas de clasificación aprendidas: { [rutNormalizado]: { rut, razonSocial, cuentaId, cuentaNombre, categoriaLabel, categoriaIcon } }
  const [reglasGasto, setReglasGasto] = useState({});

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
        // Primera vez: inicializar con plan base completo
        const batch = CUENTAS_BASE.map(c =>
          addDoc(collection(db, "empresas", empresaId, "chart_of_accounts"), {
            ...c, activa: true, creadaEn: serverTimestamp()
          })
        );
        await Promise.all(batch);
        const snap2 = await getDocs(query(
          collection(db, "empresas", empresaId, "chart_of_accounts"),
          orderBy("codigo")
        ));
        setCuentas(snap2.docs.map(d => ({ id: d.id, ...d.data() })));
      } else {
        const existentes = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        // Migración: agregar cuentas nuevas del plan base que no existan por código
        const codigosExistentes = new Set(existentes.map(c => c.codigo));
        const faltantes = CUENTAS_BASE.filter(c => !codigosExistentes.has(c.codigo));
        if (faltantes.length > 0) {
          await Promise.all(faltantes.map(c =>
            addDoc(collection(db, "empresas", empresaId, "chart_of_accounts"), {
              ...c, activa: true, creadaEn: serverTimestamp()
            })
          ));
          const snap3 = await getDocs(query(
            collection(db, "empresas", empresaId, "chart_of_accounts"),
            orderBy("codigo")
          ));
          setCuentas(snap3.docs.map(d => ({ id: d.id, ...d.data() })));
        } else {
          setCuentas(existentes);
        }
      }
    } catch (e) { console.error(e); }
    setLoadingC(false);
  }, [empresaId]);

  // Cargar asientos del período activo
  const cargarAsientos = useCallback(async () => {
    if (!empresaId) { setLoadingA(false); return; }
    setLoadingA(true);
    try {
      // Sin orderBy para evitar requerir índice compuesto en Firestore.
      // El ordenamiento se hace en el cliente.
      const snap = await getDocs(query(
        collection(db, "empresas", empresaId, "journal_entries"),
        where("periodo", "==", periodoActivo)
      ));
      const docs = snap.docs
        .map(d => {
          const data = d.data();
          // Limpiar campos internos (_*) que hayan quedado guardados en versiones anteriores
          const limpio = Object.fromEntries(
            Object.entries(data).filter(([k]) => !k.startsWith("_"))
          );
          return { id: d.id, ...limpio };
        })
        .sort((a, b) => (b.fecha || "").localeCompare(a.fecha || ""));
      setAsientos(docs);
    } catch (e) { console.error(e); }
    setLoadingA(false);
  }, [empresaId, periodoActivo]);

  // Cargar períodos disponibles:
  // Detecta automáticamente todos los meses que tienen asientos en Firestore,
  // más los últimos 24 meses para permitir navegación libre.
  const cargarPeriodos = useCallback(async () => {
    if (!empresaId) return;
    try {
      // 1. Obtener períodos únicos que ya tienen asientos
      const snapAll = await getDocs(
        collection(db, "empresas", empresaId, "journal_entries")
      );
      const periodosConAsientos = new Set();
      snapAll.docs.forEach(d => {
        const p = d.data().periodo;
        if (p) periodosConAsientos.add(p);
      });

      // 2. Generar los últimos 24 meses como navegación libre
      const hoy = new Date();
      const lista = new Map();
      for (let i = 0; i < 24; i++) {
        const d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1);
        const key = mesKey(d);
        lista.set(key, { id: key, mes: d.getMonth(), anio: d.getFullYear(), cerrado: false, tieneAsientos: periodosConAsientos.has(key) });
      }

      // 3. Agregar períodos con asientos que sean más antiguos (> 24 meses atrás)
      periodosConAsientos.forEach(p => {
        if (!lista.has(p)) {
          const [anio, mes] = p.split("-").map(Number);
          lista.set(p, { id: p, mes: mes - 1, anio, cerrado: false, tieneAsientos: true });
        }
      });

      // Ordenar descendente (más reciente primero)
      const sorted = Array.from(lista.values()).sort((a, b) => b.id.localeCompare(a.id));
      setPeriodos(sorted);
    } catch (e) { console.error("cargarPeriodos error:", e); }
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
    cargarPeriodos(); // Actualizar indicadores de meses con datos
  };

  const eliminarAsiento = async (id) => {
    await deleteDoc(doc(db, "empresas", empresaId, "journal_entries", id));
    cargarAsientos();
  };

  // Buscar qué importHash ya existen en Firestore para un período dado
  // Permite detectar duplicados antes de importar
  const buscarHashesExistentes = async (periodo_) => {
    if (!empresaId) return new Set();
    try {
      const snap = await getDocs(query(
        collection(db, "empresas", empresaId, "journal_entries"),
        where("periodo", "==", periodo_),
        where("origen", "==", "iconstruye")
      ));
      const hashes = new Set();
      snap.docs.forEach(d => {
        const h = d.data().importHash;
        if (h) hashes.add(h);
      });
      return hashes;
    } catch (e) { console.error("buscarHashesExistentes:", e); return new Set(); }
  };

  // ── Reglas de clasificación de gasto por proveedor ─────────────────────────
  // Se aprenden cada vez que el usuario reclasifica un asiento y se aplican
  // automáticamente al importar (mismo proveedor → misma categoría/cuenta).
  const cargarReglas = useCallback(async () => {
    if (!empresaId) return;
    try {
      const snap = await getDocs(collection(db, "empresas", empresaId, "reglas_gasto"));
      const mapa = {};
      snap.docs.forEach(d => { mapa[d.id] = { id: d.id, ...d.data() }; });
      setReglasGasto(mapa);
    } catch (e) { console.error("cargarReglas:", e); }
  }, [empresaId]);
  useEffect(() => { cargarReglas(); }, [cargarReglas]); // ← después de la definición, sin TDZ

  // Guarda/actualiza la regla aprendida para un proveedor (id de doc = RUT normalizado)
  const guardarReglaGasto = async (rut, razonSocial, regla) => {
    if (!empresaId) return;
    const key = normalizaRut(rut);
    if (!key || key === "SIN_RUT") return;
    const data = {
      rut, razonSocial: razonSocial || "",
      cuentaId:       regla.cuentaId || "",
      cuentaNombre:   regla.cuentaNombre || "",
      categoriaLabel: regla.categoriaLabel || "",
      categoriaIcon:  regla.categoriaIcon || "",
      updatedAt: serverTimestamp(),
    };
    try {
      await setDoc(doc(db, "empresas", empresaId, "reglas_gasto", key), data, { merge: true });
      // Actualizar en memoria inmediatamente (sin esperar recarga)
      setReglasGasto(prev => ({ ...prev, [key]: { id: key, ...data } }));
    } catch (e) { console.error("guardarReglaGasto:", e); }
  };

  const eliminarReglaGasto = async (rut) => {
    if (!empresaId) return;
    const key = normalizaRut(rut);
    try {
      await deleteDoc(doc(db, "empresas", empresaId, "reglas_gasto", key));
      setReglasGasto(prev => { const n = { ...prev }; delete n[key]; return n; });
    } catch (e) { console.error("eliminarReglaGasto:", e); }
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
      guardarAsiento, eliminarAsiento, guardarCuenta, buscarHashesExistentes,
      reglasGasto, cargarReglas, guardarReglaGasto, eliminarReglaGasto,
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

  // Índice actual para navegar con flechas
  const idx     = periodos.findIndex(p => p.id === periodoActivo);
  const canPrev = idx < periodos.length - 1;  // períodos más antiguos (mayor índice = más antiguo)
  const canNext = idx > 0;                     // períodos más recientes

  const navegar = (dir) => {
    const newIdx = idx + dir;
    if (newIdx >= 0 && newIdx < periodos.length) {
      setPeriodoActivo(periodos[newIdx].id);
    }
  };

  const periodoActual = periodos.find(p => p.id === periodoActivo);
  const tieneAsientos = periodoActual?.tieneAsientos;

  return (
    <div className={`flex items-center gap-1 ${className}`}>
      {/* Flecha izquierda → mes anterior */}
      <button
        onClick={() => navegar(1)}
        disabled={!canPrev}
        className="w-7 h-8 flex items-center justify-center rounded-lg border-2 border-purple-200 bg-purple-50 text-purple-500 hover:bg-purple-100 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
        title="Mes anterior"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7"/>
        </svg>
      </button>

      {/* Selector desplegable */}
      <div className="relative">
        <select
          value={periodoActivo}
          onChange={e => setPeriodoActivo(e.target.value)}
          className="pl-3 pr-7 py-2 border-2 border-purple-200 bg-purple-50 text-purple-800 rounded-xl focus:outline-none focus:border-purple-500 text-xs font-bold appearance-none cursor-pointer min-w-36"
        >
          {periodos.map(p => {
            const [anio, mes] = p.id.split("-");
            const label = `${MESES[parseInt(mes) - 1]} ${anio}`;
            return (
              <option key={p.id} value={p.id}>
                {p.tieneAsientos ? "✓ " : ""}{label}
              </option>
            );
          })}
        </select>
        <svg className="w-3 h-3 text-purple-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7"/>
        </svg>
      </div>

      {/* Flecha derecha → mes siguiente */}
      <button
        onClick={() => navegar(-1)}
        disabled={!canNext}
        className="w-7 h-8 flex items-center justify-center rounded-lg border-2 border-purple-200 bg-purple-50 text-purple-500 hover:bg-purple-100 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
        title="Mes siguiente"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7"/>
        </svg>
      </button>

      {/* Indicador de asientos */}
      {tieneAsientos && (
        <span className="text-[10px] font-black text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-1 rounded-lg whitespace-nowrap">
          ✓ con datos
        </span>
      )}
    </div>
  );
}
