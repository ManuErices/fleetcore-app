import React, { useEffect, useState, useMemo } from "react";
import { useEmpresa } from "../../lib/useEmpresa";
import { useFuelPrices } from "../../lib/fuelPriceService";
import { claveEgresoPorCodigo } from "../../lib/planCuentas";
import {
  listActiveProjects,
  listEmployees,
  listEmployeeMonthlyData,
  listEmployeeMonthlyDataByYear,
  listFuelLogsByRange,
  listPurchaseOrders,
  listSubcontratosByProject,
  listRendicionesByProject,
  listCombustibleRegistros,
  listCombustiblePrecioMensualByYear,
  getEstadoPagoIngresos,
  listEstadoPagoIngresosByYear,
  upsertEstadoPagoIngresos
} from "../../lib/db";

const MONTHS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
];
const MONTHS_SHORT = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

const MES_NOMBRE_A_NUMERO = MONTHS.reduce((map, nombre, i) => { map[nombre] = i + 1; return map; }, {});

// Parsea el campo "Mes Asociado" de Subcontratos (texto tipo "Mayo 2026") a { year, month }
function parseMesAsociado(mesAsociado) {
  if (!mesAsociado) return null;
  const partes = String(mesAsociado).trim().split(" ");
  if (partes.length !== 2) return null;
  const mes = MES_NOMBRE_A_NUMERO[partes[0]];
  const year = parseInt(partes[1], 10);
  if (!mes || !year) return null;
  return { year, month: mes };
}

const EMPTY_INGRESOS = { estadosPago: 0, retenciones: 0, reajuste: 0, multas: 0, reajustePolinomico: 0 };

function fmt(n) {
  const v = Math.round(Number(n) || 0);
  const sign = v < 0 ? "-" : "";
  return `${sign}$${Math.abs(v).toLocaleString("es-CL")}`;
}

// Suma un array de {clave, monto} en un mapa agrupado por clave.
// Se ordena por el código de cuenta contable al inicio de la clave (2.1, 2.2, 2.3...),
// para que coincida con el plan de cuentas; las claves sin código van al final.
function agrupar(items) {
  const map = {};
  items.forEach(({ clave, monto }) => {
    const k = clave || "Sin especificar";
    map[k] = (map[k] || 0) + (monto || 0);
  });

  // Extrae el código "x.y" al inicio de la clave y lo devuelve como número comparable (ej. "2.10" → 2.10)
  const codigoOrden = (clave) => {
    const m = String(clave).trim().match(/^(\d+)\.(\d+)/);
    if (!m) return Infinity; // sin código → al final
    return parseInt(m[1], 10) * 1000 + parseInt(m[2], 10); // 2.7 → 2007, 2.10 → 2010 (ordena bien 2.10 después de 2.9)
  };

  return Object.entries(map)
    .map(([clave, monto]) => ({ clave, monto }))
    .sort((a, b) => {
      const ca = codigoOrden(a.clave), cb = codigoOrden(b.clave);
      if (ca !== cb) return ca - cb;
      // Mismo código (o ambos sin código): desempata por monto mayor primero
      return b.monto - a.monto;
    });
}

// La empresa usa un plan de cuentas numerado donde el primer dígito indica la categoría
// (1.x Mano de Obra, 2.x Maquinaria y Equipos, 3.x Materiales, 4.x Combustible, 5.x Gastos Generales).
// Ver lib/planCuentas.js — fuente única de verdad, compartida con OC, Subcontratos y Rendiciones.
const categoriaPorCodigo = claveEgresoPorCodigo;

// Intenta extraer un código tipo "3.2" al inicio de un texto libre, ej. "3.2 MATERIALES OBRAS CIVILES" → "3.2"
function extraerCodigoDeTexto(texto) {
  const match = String(texto || "").trim().match(/^(\d+(\.\d+)?)\s/);
  return match ? match[1] : null;
}

// Respaldo por palabras clave, para cuando un gasto no trae ningún código numérico identificable
// (ej. líneas de OC o Rendiciones anotadas solo con el nombre de la cuenta, sin su código)
function categoriaPorTexto(texto) {
  const t = String(texto || "").toLowerCase();
  if (/combustible|petr[oó]leo|di[eé]sel|bencina|gasolina/.test(t)) return "combustible";
  if (/mantenci[oó]n.*(veh[ií]culo|maquinaria)|maquinaria|arriendo.*(equipo|m[aá]quina)|herramientas y equipos/.test(t)) return "maquinariaYEquipos";
  if (/material|insumo|repuesto|ferreter[ií]a|hormig[oó]n/.test(t)) return "materiales";
  if (/mano de obra|remuneraci[oó]n|sueldo/.test(t)) return "manoDeObra";
  return "gastosGenerales"; // viáticos, alimentación, alojamiento, gastos administrativos, movilización, EPP, etc.
}

// Clasifica un gasto (rendición u OC): primero por su código de cuenta si lo trae, si no por palabras clave
function clasificar(codigo, texto) {
  return categoriaPorCodigo(codigo) || categoriaPorCodigo(extraerCodigoDeTexto(texto)) || categoriaPorTexto(texto);
}

// Calcula los 5 costos de Egresos (Mano de Obra, Maquinaria y Equipos, Materiales, Combustible, Gastos Generales)
// para UN mes específico, junto con el desglose por cuenta de costo / origen de cada categoría.
// Las Rendiciones y líneas de OC se distribuyen automáticamente en la categoría que les corresponda.
function calcEgresosMes(year, month, employees, payrollYearData, purchaseOrders, fuelLogs, subcontratos, rendiciones, precioDiesel, combustibleRegistros, combustiblePrecios) {
  const employeeTipoManoObraMap = {};
  const employeeNombreMap = {};
  employees.forEach(e => {
    // Fallback al campo "tipo" legado para empleados que aún no tienen tipoManoObra asignado
    employeeTipoManoObraMap[e.id] = e.tipoManoObra || (e.tipo === "OPERADOR" ? "DIRECTO" : "INDIRECTO");
    employeeNombreMap[e.id] = e.nombre;
  });

  const monthPrefix = `${year}-${String(month).padStart(2, "0")}`;

  // Ítems crudos {clave, monto} por categoría, antes de agrupar
  const items = { manoDeObra: [], maquinariaYEquipos: [], materiales: [], combustible: [], gastosGenerales: [] };

  // ── Payroll: TODO el personal es cuenta "1.x Mano de Obra" (Directo 1.1 / Indirecto 1.2) ──
  payrollYearData.filter(l => l.month === month && (l.year === undefined || l.year === year)).forEach(l => {
    const totalCosto = Number(l.totalCosto) || 0;
    const pct = l.porcentajeIncidencia != null ? l.porcentajeIncidencia : 100;
    const costoObra = totalCosto * (pct / 100);
    const esDirecto = employeeTipoManoObraMap[l.employeeId] === "DIRECTO";
    const prefijo = esDirecto ? "1.1 MANO DE OBRA DIRECTO" : "1.2 MANO DE OBRA INDIRECTO";
    const clave = `${prefijo} — ${l.centroCosto || employeeNombreMap[l.employeeId] || "Sin centro de costo"}`;
    items.manoDeObra.push({ clave, monto: costoObra });
  });

  // ── Órdenes de Compra: cada línea se clasifica según su Cuenta de Costo (no todas son Materiales) ──
  const ocsMes = purchaseOrders.filter(oc => oc.fecha && oc.fecha.startsWith(monthPrefix));
  let ocTuvoItemsDetallados = false;
  ocsMes.forEach(oc => {
    (oc.items || []).forEach(item => {
      ocTuvoItemsDetallados = true;
      const texto = item.cuentasCosto || "";
      const bucket = clasificar(item.codigoCC, texto);
      items[bucket].push({ clave: texto || item.codigoCC || "Sin cuenta de costo", monto: Number(item.subTotal) || 0 });
    });
  });
  if (!ocTuvoItemsDetallados) {
    // Fallback si la OC no trae items detallados — sin cuenta de costo por línea, se deja en Materiales
    ocsMes.forEach(oc => items.materiales.push({ clave: oc.proveedor || "Sin proveedor", monto: Number(oc.totalMonto) || 0 }));
  }

  // ── Combustible (4.1): litros del camión aljibe × precio fijado para ese mes ──
  const registrosMes = combustibleRegistros.filter(r => r.fecha && r.fecha.startsWith(monthPrefix));
  if (registrosMes.length > 0) {
    const precioMes = combustiblePrecios.find(p => p.month === month)?.precioLitro || 0;
    registrosMes.forEach(r => {
      items.combustible.push({
        clave: "4.1 DIÉSEL",
        monto: (Number(r.litros) || 0) * precioMes
      });
    });
  } else {
    // Respaldo: si no se ha importado combustible por el módulo nuevo ese mes,
    // se usa el registro antiguo (fuelLogs) valorizado al precio "en vivo" del diésel
    fuelLogs.filter(f => f.date && f.date.startsWith(monthPrefix)).forEach(f => {
      items.combustible.push({ clave: "4.1 DIÉSEL", monto: (Number(f.liters) || 0) * precioDiesel });
    });
  }

  // ── Subcontratos: Maquinaria y Equipos (Maquinaria Directa / Indirecta) ──
  // Se ubica por "Mes Asociado" (mes real de ejecución), no por Fecha EP —
  // un EP puede emitirse el mes siguiente al trabajo que factura.
  // Si un ítem no tiene Mes Asociado asignado, se usa la Fecha EP como respaldo.
  subcontratos
    .filter(s => {
      const asociado = parseMesAsociado(s.mesAsociadoManual);
      if (asociado) return asociado.year === year && asociado.month === month;
      return s.fechaEP && s.fechaEP.startsWith(monthPrefix); // respaldo si no tiene Mes Asociado
    })
    .filter(s => /maquinaria/i.test(s.descripcionCuentaCosto || ""))
    .forEach(s => {
      items.maquinariaYEquipos.push({ clave: `${s.codigoCuentaCosto || ""} ${s.descripcionCuentaCosto || ""}`.trim(), monto: Number(s.totalPagoNeto) || 0 });
    });

  // ── Rendiciones: se reparten en la categoría que corresponda según su Cuenta Contable ──
  rendiciones.filter(r => r.fechaEmision && r.fechaEmision.startsWith(monthPrefix)).forEach(r => {
    const codigo = r.codigoCuentaContable || "";
    const nombre = r.cuentaContable || r.categoria || "Sin categoría";
    const textoClasificacion = `${r.categoria || ""} ${r.subcategoria || ""} ${nombre}`;
    const bucket = clasificar(codigo, textoClasificacion);
    // Mismo formato "x.y NOMBRE" que usa toda la empresa para sus cuentas contables/de costo
    const clave = codigo ? `${codigo} ${nombre}` : nombre;
    items[bucket].push({ clave, monto: Number(r.montoAprobado) || 0 });
  });

  const manoDeObraDetalle = agrupar(items.manoDeObra);
  const maquinariaDetalle = agrupar(items.maquinariaYEquipos);
  const materialesDetalle = agrupar(items.materiales);
  const combustibleDetalle = agrupar(items.combustible);
  const gastosGeneralesDetalle = agrupar(items.gastosGenerales);

  const manoDeObra = manoDeObraDetalle.reduce((s, i) => s + i.monto, 0);
  const maquinariaYEquipos = maquinariaDetalle.reduce((s, i) => s + i.monto, 0);
  const materiales = materialesDetalle.reduce((s, i) => s + i.monto, 0);
  const combustible = combustibleDetalle.reduce((s, i) => s + i.monto, 0);
  const gastosGenerales = gastosGeneralesDetalle.reduce((s, i) => s + i.monto, 0);

  return {
    manoDeObra, manoDeObraDetalle,
    maquinariaYEquipos, maquinariaDetalle,
    materiales, materialesDetalle,
    combustible, combustibleDetalle,
    gastosGenerales, gastosGeneralesDetalle,
    total: manoDeObra + maquinariaYEquipos + materiales + combustible + gastosGenerales
  };
}

function sumIngresos(i) {
  if (!i) return 0;
  return (Number(i.estadosPago) || 0) + (Number(i.retenciones) || 0) + (Number(i.reajuste) || 0) +
         (Number(i.multas) || 0) + (Number(i.reajustePolinomico) || 0);
}

export default function PaymentStatus() {
  const { empresaId } = useEmpresa();
  const { prices: fuelPrices } = useFuelPrices(true);
  const [projects, setProjects] = useState([]);
  const [projectId, setProjectId] = useState("");
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [view, setView] = useState("resumen"); // 'resumen' | 'detalle'
  const [loading, setLoading] = useState(false);

  // Datos base para calcular egresos
  const [employees, setEmployees] = useState([]);
  const [payrollYearData, setPayrollYearData] = useState([]);
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [fuelLogs, setFuelLogs] = useState([]);
  const [subcontratos, setSubcontratos] = useState([]);
  const [rendiciones, setRendiciones] = useState([]);
  const [combustibleRegistros, setCombustibleRegistros] = useState([]);
  const [combustiblePrecios, setCombustiblePrecios] = useState([]); // precios mensuales fijados a mano

  // Ingresos manuales
  const [ingresosMes, setIngresosMes] = useState(null); // doc actual del mes (con id) o null
  const [ingresosForm, setIngresosForm] = useState(EMPTY_INGRESOS);
  const [ingresosYear, setIngresosYear] = useState([]); // todos los docs de ingresos del año
  const [savingIngresos, setSavingIngresos] = useState(false);

  useEffect(() => {
    if (!empresaId) return;
    (async () => {
      const p = await listActiveProjects(empresaId);
      setProjects(p);
      if (p[0] && !projectId) setProjectId(p[0].id);
    })();
  }, [empresaId]);

  useEffect(() => {
    if (!empresaId || !projectId) return;
    loadAll();
  }, [empresaId, projectId, year]);

  useEffect(() => {
    if (!empresaId || !projectId) return;
    loadIngresosMes();
  }, [empresaId, projectId, year, month]);

  const loadAll = async () => {
    setLoading(true);
    try {
      const yearStart = `${year}-01-01`;
      const yearEnd = `${year}-12-31`;
      const [emp, payroll, ocs, fuel, ingYear, subs, rends, combustibleRegs, combustiblePreciosYear] = await Promise.all([
        listEmployees(empresaId, projectId),
        listEmployeeMonthlyDataByYear(empresaId, projectId, year),
        listPurchaseOrders(empresaId, projectId),
        listFuelLogsByRange(empresaId, projectId, yearStart, yearEnd),
        listEstadoPagoIngresosByYear(empresaId, projectId, year),
        listSubcontratosByProject(empresaId, projectId),
        listRendicionesByProject(empresaId, projectId),
        listCombustibleRegistros(empresaId, projectId),
        listCombustiblePrecioMensualByYear(empresaId, projectId, year)
      ]);
      setEmployees(emp);
      setPayrollYearData(payroll);
      setPurchaseOrders(ocs);
      setFuelLogs(fuel);
      setIngresosYear(ingYear);
      setSubcontratos(subs);
      setRendiciones(rends);
      setCombustibleRegistros(combustibleRegs);
      setCombustiblePrecios(combustiblePreciosYear);
    } catch (err) {
      console.error("Error cargando Estado de Pago:", err);
    } finally {
      setLoading(false);
    }
  };

  const loadIngresosMes = async () => {
    try {
      const doc = await getEstadoPagoIngresos(empresaId, projectId, year, month);
      setIngresosMes(doc);
      setIngresosForm(doc ? {
        estadosPago: doc.estadosPago || 0,
        retenciones: doc.retenciones || 0,
        reajuste: doc.reajuste || 0,
        multas: doc.multas || 0,
        reajustePolinomico: doc.reajustePolinomico || 0
      } : EMPTY_INGRESOS);
    } catch (err) {
      console.error("Error cargando ingresos del mes:", err);
    }
  };

  const handleSaveIngresos = async () => {
    setSavingIngresos(true);
    try {
      const id = await upsertEstadoPagoIngresos(empresaId, {
        id: ingresosMes?.id,
        projectId, year, month,
        ...ingresosForm
      });
      await loadIngresosMes();
      await loadAll(); // refresca la matriz de detalle también
    } catch (err) {
      console.error("Error guardando ingresos:", err);
      alert("Error al guardar los ingresos");
    } finally {
      setSavingIngresos(false);
    }
  };

  // Egresos del mes actualmente seleccionado
  const precioDiesel = fuelPrices?.diesel || 950;
  const egresosMes = useMemo(() => {
    if (!payrollYearData) return null;
    return calcEgresosMes(year, month, employees, payrollYearData, purchaseOrders, fuelLogs, subcontratos, rendiciones, precioDiesel, combustibleRegistros, combustiblePrecios);
  }, [year, month, employees, payrollYearData, purchaseOrders, fuelLogs, subcontratos, rendiciones, precioDiesel, combustibleRegistros, combustiblePrecios]);

  // Egresos de los 12 meses del año (para la vista Detalle)
  const egresosPorMes = useMemo(() => {
    return Array.from({ length: 12 }, (_, i) => calcEgresosMes(year, i + 1, employees, payrollYearData, purchaseOrders, fuelLogs, subcontratos, rendiciones, precioDiesel, combustibleRegistros, combustiblePrecios));
  }, [year, employees, payrollYearData, purchaseOrders, fuelLogs, subcontratos, rendiciones, precioDiesel, combustibleRegistros, combustiblePrecios]);

  // Ingresos de los 12 meses del año, indexados por mes (1-12)
  const ingresosPorMes = useMemo(() => {
    const arr = Array.from({ length: 12 }, () => null);
    ingresosYear.forEach(doc => { arr[doc.month - 1] = doc; });
    return arr;
  }, [ingresosYear]);

  // Balance mensual y acumulado (dentro del año seleccionado)
  const balancePorMes = useMemo(() => {
    let acumulado = 0;
    return egresosPorMes.map((egreso, i) => {
      const ingresoTotal = sumIngresos(ingresosPorMes[i]);
      const balanceMensual = ingresoTotal - egreso.total;
      acumulado += balanceMensual;
      return { ingresoTotal, egresoTotal: egreso.total, balanceMensual, acumulado };
    });
  }, [egresosPorMes, ingresosPorMes]);

  // El balance mostrado deriva SIEMPRE de los ingresos ya guardados (ingresosPorMes),
  // igual que la vista de Detalle, para que ambas vistas sean 100% concordantes.
  // El formulario en edición (ingresosForm) solo afecta lo que se va a guardar, no el balance mostrado.
  // ── Verificación de consistencia ──
  // Compara el total anual de Remuneraciones que aparece repartido por mes en el Estado de Pago
  // contra el total crudo. Si no coinciden, hay liquidaciones con un campo "mes" inválido
  // que no se están reflejando en ningún mes de la matriz.
  const consistencia = useMemo(() => {
    const totalPayrollEnEP = egresosPorMes.reduce((s, e) => s + e.manoDeObra + e.gastosGenerales, 0);
    const crudoPayroll = payrollYearData.reduce((s, l) => {
      const pct = l.porcentajeIncidencia != null ? l.porcentajeIncidencia : 100;
      return s + (Number(l.totalCosto) || 0) * (pct / 100);
    }, 0);
    const alertas = [];
    if (Math.abs(crudoPayroll - totalPayrollEnEP) > 1) {
      alertas.push(`Remuneraciones: ${fmt(crudoPayroll - totalPayrollEnEP)} del año no se reflejan en ningún mes (revisa el campo "mes" de las liquidaciones).`);
    }
    return alertas;
  }, [egresosPorMes, payrollYearData]);

  const ingresoMesGuardado = balancePorMes[month - 1]?.ingresoTotal || 0;
  const ingresoMesTotal = ingresoMesGuardado;
  const balanceMesActual = balancePorMes[month - 1]?.balanceMensual || 0;
  const balanceAcumuladoHastaMes = balancePorMes[month - 1]?.acumulado || 0;
  // Indica si el formulario tiene cambios sin guardar respecto a lo almacenado
  const ingresoFormTotal = sumIngresos(ingresosForm);
  const hayCambiosSinGuardar = Math.round(ingresoFormTotal) !== Math.round(ingresoMesGuardado);

  const projectName = projects.find(p => p.id === projectId)?.name || "";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="glass-card rounded-2xl p-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-900 to-blue-700 flex items-center justify-center shadow-lg">
              <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3v-6m-3 6v-9m-2 9h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <div>
              <h1 className="text-3xl font-black text-slate-900 tracking-tight">Estado de Pago</h1>
              <p className="text-slate-600 mt-1 text-sm">Balance financiero consolidado — Egresos vs. Ingresos por obra</p>
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className="input-modern">
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <select value={month} onChange={(e) => setMonth(parseInt(e.target.value))} className="input-modern">
              {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
            </select>
            <select value={year} onChange={(e) => setYear(parseInt(e.target.value))} className="input-modern">
              {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        </div>

        <div className="flex gap-2 mt-6 border-t border-slate-100 pt-4">
          <button
            onClick={() => setView("resumen")}
            className={`px-5 py-2 rounded-xl text-sm font-bold transition-all ${view === "resumen" ? "bg-blue-900 text-white shadow-md" : "text-slate-600 hover:bg-slate-100"}`}
          >
            Resumen del mes
          </button>
          <button
            onClick={() => setView("detalle")}
            className={`px-5 py-2 rounded-xl text-sm font-bold transition-all ${view === "detalle" ? "bg-blue-900 text-white shadow-md" : "text-slate-600 hover:bg-slate-100"}`}
          >
            Detalle anual (12 meses)
          </button>
          <button
            onClick={() => setView("analisis")}
            className={`px-5 py-2 rounded-xl text-sm font-bold transition-all ${view === "analisis" ? "bg-blue-900 text-white shadow-md" : "text-slate-600 hover:bg-slate-100"}`}
          >
            📊 Análisis
          </button>
        </div>
      </div>

      {consistencia.length > 0 && (
        <div className="glass-card rounded-2xl p-4 border-2 border-amber-200 bg-amber-50">
          <div className="flex items-start gap-3">
            <span className="text-lg">⚠️</span>
            <div>
              <div className="text-sm font-bold text-amber-800 mb-1">Advertencia de consistencia</div>
              {consistencia.map((a, i) => (
                <div key={i} className="text-sm text-amber-700">{a}</div>
              ))}
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="glass-card rounded-2xl p-16 text-center text-slate-400">Cargando datos...</div>
      ) : view === "resumen" ? (
        <ResumenView
          projectName={projectName}
          year={year}
          month={month}
          egresosMes={egresosMes}
          ingresosForm={ingresosForm}
          setIngresosForm={setIngresosForm}
          ingresoMesTotal={ingresoMesTotal}
          balanceMesActual={balanceMesActual}
          balanceAcumuladoHastaMes={balanceAcumuladoHastaMes}
          onSaveIngresos={handleSaveIngresos}
          savingIngresos={savingIngresos}
          hayCambiosSinGuardar={hayCambiosSinGuardar}
        />
      ) : view === "detalle" ? (
        <DetalleView
          year={year}
          egresosPorMes={egresosPorMes}
          ingresosPorMes={ingresosPorMes}
          balancePorMes={balancePorMes}
        />
      ) : (
        <AnalisisView
          year={year}
          projectName={projectName}
          egresosPorMes={egresosPorMes}
          ingresosPorMes={ingresosPorMes}
          balancePorMes={balancePorMes}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// VISTA RESUMEN (mes actual + acumulado)
// ─────────────────────────────────────────────
function ResumenView({ projectName, year, month, egresosMes, ingresosForm, setIngresosForm, ingresoMesTotal, balanceMesActual, balanceAcumuladoHastaMes, onSaveIngresos, savingIngresos, hayCambiosSinGuardar }) {
  if (!egresosMes) return null;

  return (
    <>
      {/* Tarjetas resumen */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Egresos" value={fmt(egresosMes.total)} color="from-red-600 to-orange-600" />
        <StatCard label="Total Ingresos" value={fmt(ingresoMesTotal)} color="from-emerald-600 to-teal-600" />
        <StatCard label={`Balance ${MONTHS[month - 1]}`} value={fmt(balanceMesActual)} color={balanceMesActual >= 0 ? "from-blue-900 to-blue-700" : "from-red-700 to-red-900"} />
        <StatCard label={`Acumulado ${year} (Ene-${MONTHS_SHORT[month - 1]})`} value={fmt(balanceAcumuladoHastaMes)} color={balanceAcumuladoHastaMes >= 0 ? "from-blue-900 to-blue-700" : "from-red-700 to-red-900"} />
      </div>

      {/* EGRESOS */}
      <div className="glass-card rounded-2xl overflow-hidden">
        <div className="px-6 py-4 bg-gradient-to-r from-red-50 to-orange-50 border-b border-red-200 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-red-900">Egresos — {MONTHS[month - 1]} {year}</h3>
            <p className="text-sm text-red-700 mt-0.5">Costos reales de la obra "{projectName}", calculados automáticamente</p>
          </div>
          <div className="text-2xl font-black text-red-800">{fmt(egresosMes.total)}</div>
        </div>
        <table className="w-full">
          <tbody className="divide-y divide-slate-100">
            <EgresoRow label="Mano de Obra" value={egresosMes.manoDeObra} sub="Personal Directo (1.1) e Indirecto (1.2) — Remuneraciones + Rendiciones" detalle={egresosMes.manoDeObraDetalle} detalleLabel="Cuenta / Centro de Costo" />
            <EgresoRow label="Maquinaria y Equipos" value={egresosMes.maquinariaYEquipos} sub="Subcontratos (Maquinaria) + Rendiciones" detalle={egresosMes.maquinariaDetalle} detalleLabel="Cuenta de Costo" />
            <EgresoRow label="Materiales" value={egresosMes.materiales} sub="Órdenes de Compra + Rendiciones" detalle={egresosMes.materialesDetalle} detalleLabel="Cuenta de Costo" />
            <EgresoRow label="Combustible" value={egresosMes.combustible} sub="Recargas de combustible + Rendiciones" detalle={egresosMes.combustibleDetalle} detalleLabel="Equipo" />
            <EgresoRow label="Gastos Generales" value={egresosMes.gastosGenerales} sub="Rendiciones y otros gastos operativos (viáticos, alimentación, etc.)" detalle={egresosMes.gastosGeneralesDetalle} detalleLabel="Centro de Costo" />
          </tbody>
        </table>
      </div>

      {/* INGRESOS */}
      <div className="glass-card rounded-2xl overflow-hidden">
        <div className="px-6 py-4 bg-gradient-to-r from-emerald-50 to-teal-50 border-b border-emerald-200 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-emerald-900">Ingresos — {MONTHS[month - 1]} {year}</h3>
            <p className="text-sm text-emerald-700 mt-0.5">Ingreso manual — edita y guarda los montos del mes</p>
          </div>
          <div className="text-2xl font-black text-emerald-800">{fmt(ingresoMesTotal)}</div>
        </div>
        <div className="p-6 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <IngresoField label="Estados de Pago" value={ingresosForm.estadosPago} onChange={(v) => setIngresosForm({ ...ingresosForm, estadosPago: v })} />
          <IngresoField label="Retenciones" value={ingresosForm.retenciones} onChange={(v) => setIngresosForm({ ...ingresosForm, retenciones: v })} />
          <IngresoField label="Reajuste" value={ingresosForm.reajuste} onChange={(v) => setIngresosForm({ ...ingresosForm, reajuste: v })} />
          <IngresoField label="Multas" value={ingresosForm.multas} onChange={(v) => setIngresosForm({ ...ingresosForm, multas: v })} />
          <IngresoField label="Reajuste Polinómico" value={ingresosForm.reajustePolinomico} onChange={(v) => setIngresosForm({ ...ingresosForm, reajustePolinomico: v })} />
        </div>
        <div className="px-6 pb-6 flex items-center gap-3">
          <button
            onClick={onSaveIngresos}
            disabled={savingIngresos || !hayCambiosSinGuardar}
            className="px-6 py-3 rounded-xl font-bold text-sm text-white bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 shadow-lg transition-all disabled:opacity-50"
          >
            {savingIngresos ? "Guardando..." : "Guardar Ingresos del mes"}
          </button>
          {hayCambiosSinGuardar && !savingIngresos && (
            <span className="text-sm font-semibold text-amber-600">
              ⚠️ Tienes cambios sin guardar — el balance de abajo refleja los valores guardados, no los editados.
            </span>
          )}
        </div>
      </div>

      {/* BALANCE */}
      <div className={`glass-card rounded-2xl overflow-hidden border-2 ${balanceMesActual >= 0 ? "border-blue-200" : "border-red-200"}`}>
        <div className={`p-8 bg-gradient-to-r ${balanceMesActual >= 0 ? "from-blue-50 to-sky-50" : "from-red-50 to-orange-50"}`}>
          <div className="space-y-3">
            <div className="flex items-center justify-between text-lg">
              <span className="font-semibold text-slate-700">Ingresos {MONTHS[month - 1]}</span>
              <span className="font-bold text-emerald-700">{fmt(ingresoMesTotal)}</span>
            </div>
            <div className="flex items-center justify-between text-lg">
              <span className="font-semibold text-slate-700">Egresos {MONTHS[month - 1]}</span>
              <span className="font-bold text-red-700">-{fmt(egresosMes.total)}</span>
            </div>
            <div className={`h-px ${balanceMesActual >= 0 ? "bg-blue-200" : "bg-red-200"}`} />
            <div className="flex items-center justify-between">
              <span className={`text-2xl font-black ${balanceMesActual >= 0 ? "text-blue-900" : "text-red-900"}`}>BALANCE MENSUAL</span>
              <span className={`text-3xl font-black ${balanceMesActual >= 0 ? "text-blue-700" : "text-red-700"}`}>{fmt(balanceMesActual)}</span>
            </div>
            <div className="flex items-center justify-between pt-2">
              <span className="text-sm font-semibold text-slate-500">Balance acumulado {year} (Enero a {MONTHS[month - 1]})</span>
              <span className={`text-sm font-black ${balanceAcumuladoHastaMes >= 0 ? "text-blue-700" : "text-red-700"}`}>{fmt(balanceAcumuladoHastaMes)}</span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function StatCard({ label, value, color }) {
  return (
    <div className="glass-card rounded-2xl p-5">
      <div className={`inline-block px-2 py-1 rounded-lg bg-gradient-to-br ${color} text-white text-[10px] font-bold uppercase tracking-wider mb-2`}>
        {label}
      </div>
      <div className="text-2xl font-black text-slate-900">{value}</div>
    </div>
  );
}

function EgresoRow({ label, value, sub, pending, detalle = [], detalleLabel = "Detalle" }) {
  const [expanded, setExpanded] = useState(false);
  const hasDetalle = detalle && detalle.length > 0;

  return (
    <>
      <tr className={`hover:bg-slate-50 ${hasDetalle ? "cursor-pointer" : ""}`} onClick={() => hasDetalle && setExpanded(!expanded)}>
        <td className="px-6 py-4">
          <div className="flex items-center gap-2">
            {hasDetalle && (
              <svg className={`w-4 h-4 text-slate-400 transition-transform flex-shrink-0 ${expanded ? "rotate-90" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            )}
            <div>
              <div className="text-sm font-semibold text-slate-900">{label}</div>
              <div className={`text-xs mt-0.5 ${pending ? "text-amber-600" : "text-slate-400"}`}>{sub}</div>
            </div>
          </div>
        </td>
        <td className="px-6 py-4 text-right">
          <span className={`text-sm font-bold ${pending ? "text-slate-300" : "text-red-700"}`}>{fmt(value)}</span>
        </td>
      </tr>
      {hasDetalle && expanded && (
        <tr className="bg-slate-50">
          <td colSpan={2} className="px-6 py-3">
            <div className="ml-6 rounded-xl border border-slate-200 overflow-hidden bg-white">
              <table className="w-full">
                <thead className="bg-slate-100">
                  <tr>
                    <th className="text-left px-4 py-2 text-xs font-bold text-slate-500 uppercase">{detalleLabel}</th>
                    <th className="text-right px-4 py-2 text-xs font-bold text-slate-500 uppercase">Monto</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {detalle.map((d, i) => (
                    <tr key={i}>
                      <td className="px-4 py-2 text-sm text-slate-700">{d.clave}</td>
                      <td className="px-4 py-2 text-right text-sm font-semibold text-slate-700">{fmt(d.monto)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function IngresoField({ label, value, onChange }) {
  return (
    <div>
      <label className="block text-xs font-bold text-slate-600 uppercase tracking-wide mb-2">{label}</label>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="input-modern w-full text-right"
        placeholder="0"
      />
    </div>
  );
}

// ─────────────────────────────────────────────
// VISTA DETALLE (matriz de 12 meses, como la Carátula)
// ─────────────────────────────────────────────
function DetalleView({ year, egresosPorMes, ingresosPorMes, balancePorMes }) {
  const totalAnioEgresos = egresosPorMes.reduce((s, e) => s + e.total, 0);
  const totalAnioIngresos = ingresosPorMes.reduce((s, i) => s + sumIngresos(i), 0);

  const rows = [
    { label: "EGRESOS", isHeader: true },
    { label: "Mano de Obra", get: (e) => e.manoDeObra, isEgreso: true },
    { label: "Maquinaria y Equipos", get: (e) => e.maquinariaYEquipos, isEgreso: true },
    { label: "Materiales", get: (e) => e.materiales, isEgreso: true },
    { label: "Combustible", get: (e) => e.combustible, isEgreso: true },
    { label: "Gastos Generales", get: (e) => e.gastosGenerales, isEgreso: true },
    { label: "Total Egresos", get: (e) => e.total, isTotal: true, isEgreso: true },
  ];

  return (
    <div className="glass-card rounded-2xl overflow-hidden">
      <div className="px-6 py-4 bg-gradient-to-r from-slate-800 to-slate-900">
        <h3 className="text-lg font-bold text-white">Detalle Anual {year}</h3>
        <p className="text-sm text-slate-300 mt-0.5">Balance financiero mes a mes</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="text-left px-4 py-3 text-xs font-bold text-slate-600 uppercase sticky left-0 bg-slate-50">Descripción</th>
              {MONTHS_SHORT.map(m => <th key={m} className="text-right px-3 py-3 text-xs font-bold text-slate-600 uppercase whitespace-nowrap">{m}</th>)}
              <th className="text-right px-4 py-3 text-xs font-bold text-slate-900 uppercase bg-slate-100">Total Año</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row, idx) => {
              if (row.isHeader) {
                return (
                  <tr key={idx} className="bg-red-50">
                    <td colSpan={14} className="px-4 py-2 text-xs font-black text-red-800 uppercase tracking-wider sticky left-0 bg-red-50">{row.label}</td>
                  </tr>
                );
              }
              const rowTotal = egresosPorMes.reduce((s, e) => s + row.get(e), 0);
              return (
                <tr key={idx} className={row.isTotal ? "bg-red-50 font-bold" : "hover:bg-slate-50"}>
                  <td className={`px-4 py-2.5 sticky left-0 ${row.isTotal ? "bg-red-50" : "bg-white"} text-slate-700`}>
                    {row.label}
                  </td>
                  {egresosPorMes.map((e, i) => (
                    <td key={i} className={`px-3 py-2.5 text-right whitespace-nowrap ${row.isTotal ? "text-red-800" : "text-slate-600"}`}>
                      {fmt(row.get(e))}
                    </td>
                  ))}
                  <td className={`px-4 py-2.5 text-right font-bold whitespace-nowrap bg-slate-50 ${row.isTotal ? "text-red-900" : "text-slate-800"}`}>
                    {fmt(rowTotal)}
                  </td>
                </tr>
              );
            })}

            {/* INGRESOS */}
            <tr className="bg-emerald-50">
              <td colSpan={14} className="px-4 py-2 text-xs font-black text-emerald-800 uppercase tracking-wider sticky left-0 bg-emerald-50">INGRESOS</td>
            </tr>
            {[
              { label: "Estados de Pago", key: "estadosPago" },
              { label: "Retenciones", key: "retenciones" },
              { label: "Reajuste", key: "reajuste" },
              { label: "Multas", key: "multas" },
              { label: "Reajuste Polinómico", key: "reajustePolinomico" },
            ].map((row) => {
              const rowTotal = ingresosPorMes.reduce((s, i) => s + (Number(i?.[row.key]) || 0), 0);
              return (
                <tr key={row.key} className="hover:bg-slate-50">
                  <td className="px-4 py-2.5 sticky left-0 bg-white text-slate-700">{row.label}</td>
                  {ingresosPorMes.map((i, idx2) => (
                    <td key={idx2} className="px-3 py-2.5 text-right whitespace-nowrap text-slate-600">
                      {fmt(i?.[row.key] || 0)}
                    </td>
                  ))}
                  <td className="px-4 py-2.5 text-right font-bold whitespace-nowrap bg-slate-50 text-slate-800">{fmt(rowTotal)}</td>
                </tr>
              );
            })}
            <tr className="bg-emerald-50 font-bold">
              <td className="px-4 py-2.5 sticky left-0 bg-emerald-50 text-emerald-900">Total Ingresos</td>
              {ingresosPorMes.map((i, idx2) => (
                <td key={idx2} className="px-3 py-2.5 text-right whitespace-nowrap text-emerald-800">{fmt(sumIngresos(i))}</td>
              ))}
              <td className="px-4 py-2.5 text-right font-bold whitespace-nowrap bg-slate-50 text-emerald-900">{fmt(totalAnioIngresos)}</td>
            </tr>

            {/* BALANCE */}
            <tr className="bg-blue-50">
              <td colSpan={14} className="px-4 py-2 text-xs font-black text-blue-900 uppercase tracking-wider sticky left-0 bg-blue-50">BALANCE</td>
            </tr>
            <tr className="font-bold">
              <td className="px-4 py-2.5 sticky left-0 bg-white text-blue-900">Balance Mensual</td>
              {balancePorMes.map((b, idx2) => (
                <td key={idx2} className={`px-3 py-2.5 text-right whitespace-nowrap ${b.balanceMensual >= 0 ? "text-blue-700" : "text-red-700"}`}>
                  {fmt(b.balanceMensual)}
                </td>
              ))}
              <td className={`px-4 py-2.5 text-right font-bold whitespace-nowrap bg-slate-50 ${totalAnioIngresos - totalAnioEgresos >= 0 ? "text-blue-900" : "text-red-900"}`}>
                {fmt(totalAnioIngresos - totalAnioEgresos)}
              </td>
            </tr>
            <tr className="font-bold bg-slate-50">
              <td className="px-4 py-2.5 sticky left-0 bg-slate-50 text-slate-900">Balance Acumulado</td>
              {balancePorMes.map((b, idx2) => (
                <td key={idx2} className={`px-3 py-2.5 text-right whitespace-nowrap ${b.acumulado >= 0 ? "text-blue-700" : "text-red-700"}`}>
                  {fmt(b.acumulado)}
                </td>
              ))}
              <td className="px-4 py-2.5 text-right"></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// VISTA ANÁLISIS (gráficos y comparaciones — SVG puro, sin dependencias)
// ─────────────────────────────────────────────

const MESES_CORTOS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
const COLORES_CAT = {
  manoDeObra: "#2563eb",       // azul
  maquinariaYEquipos: "#f97316", // naranja
  materiales: "#8b5cf6",        // violeta
  combustible: "#eab308",       // amarillo
  gastosGenerales: "#ef4444"    // rojo
};
const NOMBRES_CAT = {
  manoDeObra: "Mano de Obra",
  maquinariaYEquipos: "Maquinaria y Equipos",
  materiales: "Materiales",
  combustible: "Combustible",
  gastosGenerales: "Gastos Generales"
};

function fmtCorto(n) {
  const v = Math.abs(Number(n) || 0);
  if (v >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${Math.round(n)}`;
}

function AnalisisView({ year, projectName, egresosPorMes, ingresosPorMes, balancePorMes }) {
  // Solo meses con actividad (egreso o ingreso > 0)
  const mesesActivos = egresosPorMes
    .map((e, i) => ({ mes: i, egreso: e.total, ingreso: sumIngresos(ingresosPorMes[i]), balance: balancePorMes[i] }))
    .filter(m => m.egreso > 0 || m.ingreso > 0);

  const totalEgresosAnio = egresosPorMes.reduce((s, e) => s + e.total, 0);
  const totalIngresosAnio = ingresosPorMes.reduce((s, i) => s + sumIngresos(i), 0);
  const balanceAnio = totalIngresosAnio - totalEgresosAnio;

  // Totales por categoría (todo el año)
  const totalesCat = {
    manoDeObra: egresosPorMes.reduce((s, e) => s + e.manoDeObra, 0),
    maquinariaYEquipos: egresosPorMes.reduce((s, e) => s + e.maquinariaYEquipos, 0),
    materiales: egresosPorMes.reduce((s, e) => s + e.materiales, 0),
    combustible: egresosPorMes.reduce((s, e) => s + e.combustible, 0),
    gastosGenerales: egresosPorMes.reduce((s, e) => s + e.gastosGenerales, 0)
  };
  const categoriasOrdenadas = Object.entries(totalesCat)
    .map(([key, monto]) => ({ key, monto, nombre: NOMBRES_CAT[key], color: COLORES_CAT[key] }))
    .sort((a, b) => b.monto - a.monto);

  // Mes con mayor egreso, promedio mensual
  const mesMayorEgreso = mesesActivos.length ? mesesActivos.reduce((a, b) => a.egreso > b.egreso ? a : b) : null;
  const promedioEgresoMensual = mesesActivos.length ? totalEgresosAnio / mesesActivos.length : 0;
  const margenPct = totalEgresosAnio > 0 ? (balanceAnio / totalEgresosAnio) * 100 : 0;

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label={`Total Egresos ${year}`} value={fmt(totalEgresosAnio)} color="from-red-600 to-orange-600" />
        <KpiCard label={`Total Ingresos ${year}`} value={fmt(totalIngresosAnio)} color="from-emerald-600 to-teal-600" />
        <KpiCard label="Balance del año" value={fmt(balanceAnio)} color={balanceAnio >= 0 ? "from-blue-900 to-blue-700" : "from-red-700 to-red-900"} />
        <KpiCard label="Margen (Balance/Egresos)" value={`${margenPct.toFixed(1)}%`} color={margenPct >= 0 ? "from-blue-900 to-blue-700" : "from-red-700 to-red-900"} />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Meses con actividad" value={String(mesesActivos.length)} color="from-slate-700 to-slate-900" small />
        <KpiCard label="Egreso promedio/mes" value={fmt(promedioEgresoMensual)} color="from-slate-700 to-slate-900" small />
        <KpiCard label="Mes de mayor egreso" value={mesMayorEgreso ? `${MESES_CORTOS[mesMayorEgreso.mes]} (${fmtCorto(mesMayorEgreso.egreso)})` : "—"} color="from-slate-700 to-slate-900" small />
        <KpiCard label="Categoría más costosa" value={categoriasOrdenadas[0]?.monto > 0 ? categoriasOrdenadas[0].nombre : "—"} color="from-slate-700 to-slate-900" small />
      </div>

      {/* Ingresos vs Egresos por mes (barras agrupadas) */}
      <div className="glass-card rounded-2xl p-6">
        <h3 className="text-lg font-bold text-slate-900 mb-1">Ingresos vs. Egresos por mes</h3>
        <p className="text-sm text-slate-500 mb-6">Comparación mensual — {year}</p>
        <BarrasIngresoEgreso data={mesesActivos} />
      </div>

      {/* Composición de egresos por categoría (barras apiladas) */}
      <div className="glass-card rounded-2xl p-6">
        <h3 className="text-lg font-bold text-slate-900 mb-1">Composición de Egresos por mes</h3>
        <p className="text-sm text-slate-500 mb-6">Apilado por categoría</p>
        <BarrasApiladas egresosPorMes={egresosPorMes} mesesActivos={mesesActivos} />
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Distribución en dona */}
        <div className="glass-card rounded-2xl p-6">
          <h3 className="text-lg font-bold text-slate-900 mb-1">Distribución de Egresos</h3>
          <p className="text-sm text-slate-500 mb-6">Participación de cada categoría en el total anual</p>
          <Dona categorias={categoriasOrdenadas} total={totalEgresosAnio} />
        </div>

        {/* Balance acumulado (línea) */}
        <div className="glass-card rounded-2xl p-6">
          <h3 className="text-lg font-bold text-slate-900 mb-1">Balance Acumulado</h3>
          <p className="text-sm text-slate-500 mb-6">Evolución del balance a lo largo del año</p>
          <LineaAcumulado balancePorMes={balancePorMes} mesesActivos={mesesActivos} />
        </div>
      </div>
    </div>
  );
}

function KpiCard({ label, value, color, small }) {
  return (
    <div className="glass-card rounded-2xl p-5">
      <div className={`inline-block px-2 py-1 rounded-lg bg-gradient-to-br ${color} text-white text-[10px] font-bold uppercase tracking-wider mb-2`}>{label}</div>
      <div className={`${small ? "text-lg" : "text-2xl"} font-black text-slate-900 leading-tight`}>{value}</div>
    </div>
  );
}

// Barras agrupadas Ingreso (verde) vs Egreso (rojo)
function BarrasIngresoEgreso({ data }) {
  if (data.length === 0) return <EmptyChart />;
  const max = Math.max(...data.map(d => Math.max(d.egreso, d.ingreso)), 1);
  const W = 760, H = 280, padB = 30, padL = 10, padT = 10;
  const chartH = H - padB - padT;
  const groupW = (W - padL) / data.length;
  const barW = Math.min(24, groupW / 3);

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ minWidth: 500 }}>
        {[0, 0.25, 0.5, 0.75, 1].map(f => (
          <g key={f}>
            <line x1={padL} y1={padT + chartH * (1 - f)} x2={W} y2={padT + chartH * (1 - f)} stroke="#e2e8f0" strokeWidth="1" />
            <text x={padL} y={padT + chartH * (1 - f) - 3} fontSize="9" fill="#94a3b8">{fmtCorto(max * f)}</text>
          </g>
        ))}
        {data.map((d, i) => {
          const cx = padL + groupW * i + groupW / 2;
          const hE = (d.egreso / max) * chartH;
          const hI = (d.ingreso / max) * chartH;
          return (
            <g key={i}>
              <rect x={cx - barW - 2} y={padT + chartH - hI} width={barW} height={hI} rx="3" fill="#10b981" />
              <rect x={cx + 2} y={padT + chartH - hE} width={barW} height={hE} rx="3" fill="#ef4444" />
              <text x={cx} y={H - 10} fontSize="10" fill="#64748b" textAnchor="middle">{MESES_CORTOS[d.mes]}</text>
            </g>
          );
        })}
      </svg>
      <div className="flex items-center justify-center gap-6 mt-2 text-xs">
        <span className="flex items-center gap-2"><span className="w-3 h-3 rounded bg-emerald-500" /> Ingresos</span>
        <span className="flex items-center gap-2"><span className="w-3 h-3 rounded bg-red-500" /> Egresos</span>
      </div>
    </div>
  );
}

// Barras apiladas por categoría
function BarrasApiladas({ egresosPorMes, mesesActivos }) {
  if (mesesActivos.length === 0) return <EmptyChart />;
  const cats = ["manoDeObra", "maquinariaYEquipos", "materiales", "combustible", "gastosGenerales"];
  const max = Math.max(...mesesActivos.map(m => egresosPorMes[m.mes].total), 1);
  const W = 760, H = 280, padB = 30, padL = 10, padT = 10;
  const chartH = H - padB - padT;
  const groupW = (W - padL) / mesesActivos.length;
  const barW = Math.min(38, groupW * 0.6);

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ minWidth: 500 }}>
        {[0, 0.5, 1].map(f => (
          <g key={f}>
            <line x1={padL} y1={padT + chartH * (1 - f)} x2={W} y2={padT + chartH * (1 - f)} stroke="#e2e8f0" strokeWidth="1" />
            <text x={padL} y={padT + chartH * (1 - f) - 3} fontSize="9" fill="#94a3b8">{fmtCorto(max * f)}</text>
          </g>
        ))}
        {mesesActivos.map((m, i) => {
          const cx = padL + groupW * i + groupW / 2;
          const e = egresosPorMes[m.mes];
          let yAcum = padT + chartH;
          return (
            <g key={i}>
              {cats.map(cat => {
                const val = e[cat] || 0;
                const h = (val / max) * chartH;
                yAcum -= h;
                return <rect key={cat} x={cx - barW / 2} y={yAcum} width={barW} height={h} fill={COLORES_CAT[cat]} />;
              })}
              <text x={cx} y={H - 10} fontSize="10" fill="#64748b" textAnchor="middle">{MESES_CORTOS[m.mes]}</text>
            </g>
          );
        })}
      </svg>
      <div className="flex items-center justify-center flex-wrap gap-4 mt-3 text-xs">
        {cats.map(cat => (
          <span key={cat} className="flex items-center gap-1.5"><span className="w-3 h-3 rounded" style={{ background: COLORES_CAT[cat] }} /> {NOMBRES_CAT[cat]}</span>
        ))}
      </div>
    </div>
  );
}

// Dona de distribución
function Dona({ categorias, total }) {
  const conValor = categorias.filter(c => c.monto > 0);
  if (total === 0 || conValor.length === 0) return <EmptyChart />;
  const R = 80, r = 50, cx = 110, cy = 110;
  let anguloAcum = -90;

  const arcos = conValor.map(c => {
    const frac = c.monto / total;
    const a0 = anguloAcum;
    const a1 = anguloAcum + frac * 360;
    anguloAcum = a1;
    const rad = (deg) => (deg * Math.PI) / 180;
    const x0 = cx + R * Math.cos(rad(a0)), y0 = cy + R * Math.sin(rad(a0));
    const x1 = cx + R * Math.cos(rad(a1)), y1 = cy + R * Math.sin(rad(a1));
    const xi1 = cx + r * Math.cos(rad(a1)), yi1 = cy + r * Math.sin(rad(a1));
    const xi0 = cx + r * Math.cos(rad(a0)), yi0 = cy + r * Math.sin(rad(a0));
    const large = frac > 0.5 ? 1 : 0;
    return { c, frac, d: `M ${x0} ${y0} A ${R} ${R} 0 ${large} 1 ${x1} ${y1} L ${xi1} ${yi1} A ${r} ${r} 0 ${large} 0 ${xi0} ${yi0} Z` };
  });

  return (
    <div className="flex flex-col sm:flex-row items-center gap-6">
      <svg viewBox="0 0 220 220" className="w-52 h-52 flex-shrink-0">
        {arcos.map((a, i) => <path key={i} d={a.d} fill={a.c.color} />)}
        <text x={cx} y={cy - 4} fontSize="11" fill="#64748b" textAnchor="middle">Total</text>
        <text x={cx} y={cy + 12} fontSize="13" fontWeight="bold" fill="#0f172a" textAnchor="middle">{fmtCorto(total)}</text>
      </svg>
      <div className="flex-1 space-y-2 w-full">
        {conValor.map(c => (
          <div key={c.key} className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-2">
              <span className="w-3 h-3 rounded" style={{ background: c.color }} />
              <span className="text-slate-700">{c.nombre}</span>
            </span>
            <span className="font-semibold text-slate-900">{((c.monto / total) * 100).toFixed(1)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Línea de balance acumulado
function LineaAcumulado({ balancePorMes, mesesActivos }) {
  if (mesesActivos.length === 0) return <EmptyChart />;
  const puntos = mesesActivos.map(m => ({ mes: m.mes, acum: balancePorMes[m.mes].acumulado }));
  const valores = puntos.map(p => p.acum);
  const max = Math.max(...valores, 0);
  const min = Math.min(...valores, 0);
  const rango = max - min || 1;
  const W = 400, H = 240, padB = 30, padL = 40, padT = 15;
  const chartH = H - padB - padT, chartW = W - padL - 10;
  const x = (i) => padL + (chartW / Math.max(puntos.length - 1, 1)) * i;
  const y = (v) => padT + chartH * (1 - (v - min) / rango);
  const yCero = y(0);

  const linePath = puntos.map((p, i) => `${i === 0 ? "M" : "L"} ${x(i)} ${y(p.acum)}`).join(" ");
  const areaPath = `${linePath} L ${x(puntos.length - 1)} ${yCero} L ${x(0)} ${yCero} Z`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
      <line x1={padL} y1={yCero} x2={W - 10} y2={yCero} stroke="#cbd5e1" strokeWidth="1" strokeDasharray="4" />
      <text x={padL - 5} y={yCero + 3} fontSize="9" fill="#94a3b8" textAnchor="end">$0</text>
      <path d={areaPath} fill="url(#gradAcum)" opacity="0.15" />
      <defs>
        <linearGradient id="gradAcum" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#2563eb" />
          <stop offset="100%" stopColor="#2563eb" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={linePath} fill="none" stroke="#2563eb" strokeWidth="2.5" strokeLinejoin="round" />
      {puntos.map((p, i) => (
        <g key={i}>
          <circle cx={x(i)} cy={y(p.acum)} r="4" fill={p.acum >= 0 ? "#2563eb" : "#ef4444"} />
          <text x={x(i)} y={H - 10} fontSize="10" fill="#64748b" textAnchor="middle">{MESES_CORTOS[p.mes]}</text>
        </g>
      ))}
    </svg>
  );
}

function EmptyChart() {
  return (
    <div className="py-16 text-center text-slate-400 text-sm">
      No hay datos suficientes para graficar. Importa información de al menos un mes.
    </div>
  );
}
