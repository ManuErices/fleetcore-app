import React, { useEffect, useState, useMemo } from "react";
import { 
  listActiveProjects, 
  listFuelLogsByRange,
  listEmployeeMonthlyData,
  listPurchaseOrders,
  listMachines
} from "../lib/db";
import { collection, query, where, getDocs } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useFuelPrices } from "../lib/fuelPriceService";

// Utilidades de fecha (igual que MonthlyCalendar)
function isoToday() {
  const d = new Date();
  return d.toISOString().split('T')[0];
}

function addDays(dateStr, days) {
  const date = new Date(dateStr + 'T00:00:00');
  date.setDate(date.getDate() + days);
  return date.toISOString().split('T')[0];
}

function getDaysDiff(start, end) {
  const startDate = new Date(start + 'T00:00:00');
  const endDate = new Date(end + 'T00:00:00');
  return Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1;
}

export default function Consolidado() {
  const [projects, setProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  // Hook para obtener precios de combustible en tiempo real
  const { prices: fuelPrices } = useFuelPrices(true);

  // Filtros de fecha - Rango flexible
  const currentDate = new Date();
  const [dateFrom, setDateFrom] = useState(addDays(isoToday(), -29)); // Últimos 30 días por defecto
  const [dateTo, setDateTo] = useState(isoToday());
  const [error, setError] = useState(null);

  // Calcular días en rango
  const daysInRange = useMemo(() => getDaysDiff(dateFrom, dateTo), [dateFrom, dateTo]);

  // Datos crudos de cada módulo
  const [fuelLogs, setFuelLogs] = useState([]);
  const [employeeData, setEmployeeData] = useState([]);
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [rendiciones, setRendiciones] = useState([]);
  const [subcontratos, setSubcontratos] = useState([]);
  const [machines, setMachines] = useState([]);

  // Estado para expandir/colapsar secciones
  const [expandedSections, setExpandedSections] = useState({
    operacionales: true,
    indirectos: true,
    resumen: true
  });

  useEffect(() => {
    (async () => {
      try {
        const p = await listActiveProjects();
        setProjects(p);
        if (p.length > 0) setSelectedProject(p[0].id);
      } catch (err) {
        console.error("Error cargando proyectos:", err);
      }
    })();
  }, []);

  useEffect(() => {
    if (!selectedProject) return;
    loadAllData();
  }, [selectedProject, dateFrom, dateTo]);

  const loadAllData = async () => {
    // Validaciones
    const daysDiff = getDaysDiff(dateFrom, dateTo);
    if (daysDiff > 365) {
      setError("El rango máximo es de 365 días (1 año)");
      return;
    }
    if (dateFrom > dateTo) {
      setError("La fecha inicial debe ser menor a la final");
      return;
    }

    setIsLoading(true);
    setError(null);
    
    try {
      // Obtener año y mes para employeeMonthlyData (que usa year/month)
      const fromDate = new Date(dateFrom + 'T00:00:00');
      const employeeYear = fromDate.getFullYear();
      const employeeMonth = fromDate.getMonth() + 1;

      console.log(`📊 Cargando datos consolidados: ${dateFrom} a ${dateTo}`);

      // Cargar datos base en paralelo (sin logs de flota)
      const [fuel, employees, orders, machineList] = await Promise.all([
        listFuelLogsByRange(selectedProject, dateFrom, dateTo),
        listEmployeeMonthlyData(selectedProject, employeeYear, employeeMonth),
        listPurchaseOrders(selectedProject),
        listMachines(selectedProject)
      ]);

      // Cargar rendiciones y filtrar por fechaEmision
      const rendicionesSnap = await getDocs(
        query(collection(db, 'rendiciones'), where("projectId", "==", selectedProject))
      );
      const allRendiciones = rendicionesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      const rend = allRendiciones.filter(r => {
        if (!r.fechaEmision) return false;
        return r.fechaEmision >= dateFrom && r.fechaEmision <= dateTo;
      });

      // Cargar subcontratos y filtrar por fechaEP
      const subcontratosSnap = await getDocs(
        query(collection(db, 'subcontratos'), where("projectId", "==", selectedProject))
      );
      const allSubcontratos = subcontratosSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      const subcont = allSubcontratos.filter(s => {
        if (!s.fechaEP) return false;
        return s.fechaEP >= dateFrom && s.fechaEP <= dateTo;
      });

      console.log(`📋 Filtrado rendiciones: ${rend.length} de ${allRendiciones.length}`);
      console.log(`📋 Filtrado subcontratos: ${subcont.length} de ${allSubcontratos.length}`);

      // Filtrar OCs por rango
      const filteredOrders = orders.filter(order => {
        if (!order.fecha) return false;
        return order.fecha >= dateFrom && order.fecha <= dateTo;
      });

      setFuelLogs(fuel);
      setEmployeeData(employees);
      setPurchaseOrders(filteredOrders);
      setRendiciones(rend);
      setSubcontratos(subcont);
      setMachines(machineList);

      console.log('✅ Datos cargados:', {
        fuel: fuel.length,
        employees: employees.length,
        orders: filteredOrders.length,
        rendiciones: rend.length,
        subcontratos: subcont.length,
        machines: machineList.length
      });
    } catch (err) {
      console.error("Error cargando datos:", err);
      setError("Error al cargar los datos");
    } finally {
      setIsLoading(false);
    }
  };

  const machineMap = useMemo(() => {
    const map = {};
    machines.forEach(m => map[m.id] = m);
    return map;
  }, [machines]);

  // ============================================
  // COSTOS OPERACIONALES DIRECTOS
  // ============================================

  // 1. COMBUSTIBLE
  const costosCombustible = useMemo(() => {
    let totalLitros = 0;
    let totalCosto = 0;

    // Obtener precio del diésel (por defecto 950 si no está disponible)
    const precioDiesel = fuelPrices?.diesel || 950;

    fuelLogs.forEach(log => {
      const litros = Number(log.liters) || 0;
      totalLitros += litros;
      
      // Calcular costo usando el precio en tiempo real
      totalCosto += litros * precioDiesel;
    });

    return {
      totalLitros: Math.round(totalLitros * 100) / 100,
      totalCosto: Math.round(totalCosto),
      recargas: fuelLogs.length,
      precioDieselActual: precioDiesel
    };
  }, [fuelLogs, fuelPrices]);

  // 3. REMUNERACIONES
  const costosRemuneraciones = useMemo(() => {
    let totalHaberes = 0;
    let totalDescuentos = 0;
    let totalLiquido = 0;
    let totalCostoEmpresa = 0;  // Costo real para la empresa
    let totalAportes = 0;

    employeeData.forEach(emp => {
      totalHaberes += Number(emp.totalHaberes) || 0;
      totalDescuentos += Number(emp.totalDescuentos) || 0;
      totalLiquido += Number(emp.sueldoLiquido) || 0;  // ← CORREGIDO
      totalCostoEmpresa += Number(emp.totalCosto) || 0;
      totalAportes += Number(emp.aporteEmpresa) || 0;
    });

    return {
      totalHaberes: Math.round(totalHaberes),
      totalDescuentos: Math.round(totalDescuentos),
      totalLiquido: Math.round(totalLiquido),
      totalCostoEmpresa: Math.round(totalCostoEmpresa),
      totalAportes: Math.round(totalAportes),
      empleados: employeeData.length
    };
  }, [employeeData]);

  // 4. SUBCONTRATOS
  const costosSubcontratos = useMemo(() => {
    let totalPagado = 0;
    let totalSaldo = 0;
    const contratistas = new Set();

    subcontratos.forEach(s => {
      totalPagado += Number(s.totalPagoNeto) || 0;
      totalSaldo += Number(s.saldoPorPagarSC) || 0;
      if (s.razonSocialSubcontratista) {
        contratistas.add(s.razonSocialSubcontratista);
      }
    });

    return {
      totalPagado: Math.round(totalPagado),
      totalSaldo: Math.round(totalSaldo),
      cantidadEP: subcontratos.length,
      cantidadContratistas: contratistas.size
    };
  }, [subcontratos]);

  // ============================================
  // COSTOS INDIRECTOS
  // ============================================

  // 5. ÓRDENES DE COMPRA
  const costosOrdenes = useMemo(() => {
    let totalMonto = 0;
    let montoRecibido = 0;
    let montoFacturado = 0;

    purchaseOrders.forEach(order => {
      totalMonto += Number(order.totalMonto) || 0;
      montoRecibido += Number(order.totalMontoRecibido) || 0;
      montoFacturado += Number(order.totalFacturado) || 0;
    });

    return {
      totalMonto: Math.round(totalMonto),
      montoRecibido: Math.round(montoRecibido),
      montoFacturado: Math.round(montoFacturado),
      ordenes: purchaseOrders.length
    };
  }, [purchaseOrders]);

  // 6. RENDICIONES
  const costosRendiciones = useMemo(() => {
    let totalAprobado = 0;
    const rendicionesPorTipo = {};

    rendiciones.forEach(r => {
      const monto = Number(r.montoAprobado) || 0;
      totalAprobado += monto;
      
      const tipo = r.categoria || 'Sin categoría';
      if (!rendicionesPorTipo[tipo]) {
        rendicionesPorTipo[tipo] = 0;
      }
      rendicionesPorTipo[tipo] += monto;
    });

    return {
      totalAprobado: Math.round(totalAprobado),
      cantidad: rendiciones.length,
      porTipo: rendicionesPorTipo
    };
  }, [rendiciones]);

  // ============================================
  // CONSOLIDADO TOTAL
  // ============================================
  const consolidadoTotal = useMemo(() => {
    // COSTOS OPERACIONALES DIRECTOS (sin flota)
    const costosOperacionalesDirectos = 
      costosCombustible.totalCosto +
      costosRemuneraciones.totalCostoEmpresa +
      costosSubcontratos.totalPagado;

    // COSTOS INDIRECTOS
    const costosIndirectos = 
      costosOrdenes.montoFacturado +
      costosRendiciones.totalAprobado;

    // TOTAL COSTOS
    const totalCostos = costosOperacionalesDirectos + costosIndirectos;

    // INGRESOS (sin flota)
    const totalIngresos = 0;

    // MARGEN
    const margenBruto = totalIngresos - totalCostos;
    const margenPorcentaje = 0;

    return {
      costosOperacionalesDirectos: Math.round(costosOperacionalesDirectos),
      costosIndirectos: Math.round(costosIndirectos),
      totalCostos: Math.round(totalCostos),
      totalIngresos: Math.round(totalIngresos),
      margenBruto: Math.round(margenBruto),
      margenPorcentaje,
      
      // Desglose de costos operacionales (sin flota)
      desgloseCostosOperacionales: {
        combustible: costosCombustible.totalCosto,
        remuneraciones: costosRemuneraciones.totalCostoEmpresa,
        subcontratos: costosSubcontratos.totalPagado
      },
      
      // Desglose de costos indirectos
      desgloseCostosIndirectos: {
        ordenesCompra: costosOrdenes.montoFacturado,
        rendiciones: costosRendiciones.totalAprobado
      }
    };
  }, [costosCombustible, costosRemuneraciones, costosSubcontratos, costosOrdenes, costosRendiciones]);

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('es-CL', {
      style: 'currency',
      currency: 'CLP',
      minimumFractionDigits: 0
    }).format(value || 0);
  };

  const formatPercent = (value) => {
    return `${value.toFixed(1)}%`;
  };

  // Handlers para cambios rápidos de fecha
  const setPreset = (days) => {
    setDateTo(isoToday());
    setDateFrom(addDays(isoToday(), -(days - 1)));
  };

  const setWeek = () => {
    const today = new Date();
    const dayOfWeek = today.getDay();
    const monday = addDays(isoToday(), -(dayOfWeek === 0 ? 6 : dayOfWeek - 1));
    setDateFrom(monday);
    setDateTo(addDays(monday, 6));
  };

  const setMonth = () => {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const lastDay = new Date(year, today.getMonth() + 1, 0).getDate();
    setDateFrom(`${year}-${month}-01`);
    setDateTo(`${year}-${month}-${String(lastDay).padStart(2, '0')}`);
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleDateString('es-CL', { 
      year: 'numeric', 
      month: '2-digit', 
      day: '2-digit' 
    });
  };

  const getMonthName = (month) => {
    const months = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
                   'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    return months[month - 1];
  };

  const toggleSection = (section) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="glass-card rounded-2xl p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-600 to-blue-600 flex items-center justify-center shadow-lg">
              <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
            </div>
            <div>
              <h1 className="text-3xl font-black text-slate-900 tracking-tight">
                💰 Consolidado Total
              </h1>
              <p className="text-slate-600 mt-1 text-sm">
                Reporte ejecutivo integral con rango flexible
              </p>
            </div>
          </div>

          <select
            value={selectedProject}
            onChange={(e) => setSelectedProject(e.target.value)}
            className="input-modern"
            disabled={isLoading}
          >
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>

        {/* Filtros de fecha */}
        <div className="mt-6 pt-6 border-t border-slate-200">
          <div className="flex flex-col lg:flex-row gap-4">
            {/* Inputs */}
            <div className="flex-1 grid sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Desde
                </label>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="input-modern"
                  disabled={isLoading}
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Hasta
                </label>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="input-modern"
                  disabled={isLoading}
                />
              </div>
            </div>

            {/* Botones rápidos */}
            <div className="flex gap-2 lg:items-end">
              <button
                onClick={() => setPreset(7)}
                className="px-4 py-2 text-sm font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-xl transition-all disabled:opacity-50"
                disabled={isLoading}
              >
                7 días
              </button>
              <button
                onClick={setWeek}
                className="px-4 py-2 text-sm font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-xl transition-all disabled:opacity-50"
                disabled={isLoading}
              >
                Semana
              </button>
              <button
                onClick={setMonth}
                className="px-4 py-2 text-sm font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-xl transition-all disabled:opacity-50"
                disabled={isLoading}
              >
                Mes
              </button>
            </div>
          </div>

          {/* Info del rango */}
          <div className="mt-4 flex items-center gap-4 text-sm">
            <div className="flex items-center gap-2 text-slate-600">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <span className="font-medium">{daysInRange} días en el rango</span>
            </div>
            <div className="flex items-center gap-2 text-indigo-700">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="font-bold">Del {formatDate(dateFrom)} al {formatDate(dateTo)}</span>
            </div>
          </div>

          {/* Mensajes de error */}
          {error && (
            <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-xl">
              <div className="flex items-center gap-2 text-red-700 text-sm font-medium">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" />
                </svg>
                {error}
              </div>
            </div>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="glass-card rounded-2xl p-12">
          <div className="flex flex-col items-center justify-center gap-4">
            <div className="spinner w-12 h-12 border-indigo-600" />
            <p className="text-slate-600 font-semibold">Cargando datos consolidados...</p>
          </div>
        </div>
      ) : (
        <>
          {/* ============================================ */}
          {/* RESUMEN EJECUTIVO - 4 CARDS PRINCIPALES */}
          {/* ============================================ */}
          <div className="grid lg:grid-cols-4 gap-6">
            <ExecutiveCard
              label="Total Costos"
              value={formatCurrency(consolidadoTotal.totalCostos)}
              icon="💸"
              color="from-red-500 to-rose-500"
              trend="down"
            />
            <ExecutiveCard
              label="Total Ingresos"
              value={formatCurrency(consolidadoTotal.totalIngresos)}
              icon="💰"
              color="from-emerald-500 to-teal-500"
              trend="up"
            />
            <ExecutiveCard
              label="Margen Bruto"
              value={formatCurrency(consolidadoTotal.margenBruto)}
              icon="📊"
              color={consolidadoTotal.margenBruto >= 0 ? "from-violet-500 to-purple-500" : "from-orange-500 to-amber-500"}
              subtitle={formatPercent(consolidadoTotal.margenPorcentaje)}
            />
            <ExecutiveCard
              label="Rentabilidad"
              value={formatPercent(consolidadoTotal.margenPorcentaje)}
              icon="🎯"
              color={consolidadoTotal.margenPorcentaje >= 20 ? "from-blue-500 to-cyan-500" : "from-amber-500 to-orange-500"}
              subtitle={consolidadoTotal.margenPorcentaje >= 20 ? "Excelente" : "Revisar"}
            />
          </div>

          {/* ============================================ */}
          {/* SECCIÓN 1: COSTOS OPERACIONALES DIRECTOS */}
          {/* ============================================ */}
          <div className="glass-card rounded-2xl overflow-hidden">
            <button
              onClick={() => toggleSection('operacionales')}
              className="w-full p-6 bg-gradient-to-r from-blue-50 to-cyan-50 border-b border-blue-100 hover:from-blue-100 hover:to-cyan-100 transition-colors"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-600 to-cyan-600 flex items-center justify-center">
                    <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                  </div>
                  <div className="text-left">
                    <h3 className="text-lg font-bold text-slate-900">Costos Operacionales Directos</h3>
                    <p className="text-sm text-slate-600">Gastos relacionados directamente con la operación</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <div className="text-2xl font-black text-blue-900">
                      {formatCurrency(consolidadoTotal.costosOperacionalesDirectos)}
                    </div>
                    <div className="text-xs text-slate-500">
                      {((consolidadoTotal.costosOperacionalesDirectos / consolidadoTotal.totalCostos) * 100).toFixed(1)}% del total
                    </div>
                  </div>
                  <svg 
                    className={`w-6 h-6 text-slate-400 transition-transform ${expandedSections.operacionales ? 'rotate-180' : ''}`}
                    fill="none" 
                    viewBox="0 0 24 24" 
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>
            </button>

            {expandedSections.operacionales && (
              <div className="p-6">
                <div className="grid md:grid-cols-2 gap-6">
                  {/* Combustible */}
                  <CostDetailCard
                    title="Combustible"
                    icon="⛽"
                    total={costosCombustible.totalCosto}
                    items={[
                      { label: 'Total Litros', value: `${costosCombustible.totalLitros} L`, isText: true },
                      { label: 'Precio Diésel Actual', value: `$${costosCombustible.precioDieselActual}/L`, isText: true, highlight: true },
                      { label: 'Recargas', value: `${costosCombustible.recargas}`, isText: true },
                      { label: 'Costo Total', value: costosCombustible.totalCosto, highlight: true }
                    ]}
                    subtitle={`${costosCombustible.totalLitros} L × $${costosCombustible.precioDieselActual}/L`}
                  />

                  {/* Remuneraciones */}
                  <CostDetailCard
                    title="Remuneraciones"
                    icon="👥"
                    total={costosRemuneraciones.totalCostoEmpresa}
                    items={[
                      { label: 'Líquido a Pagar', value: costosRemuneraciones.totalLiquido },
                      { label: 'Aportes Empresa', value: costosRemuneraciones.totalAportes, warning: true },
                      { label: 'Costo Total Empresa', value: costosRemuneraciones.totalCostoEmpresa, highlight: true },
                      { label: 'Empleados', value: `${costosRemuneraciones.empleados}`, isText: true }
                    ]}
                    subtitle={`Líquido + Aportes = Costo Total`}
                  />

                  {/* Subcontratos */}
                  <CostDetailCard
                    title="Subcontratos"
                    icon="🤝"
                    total={costosSubcontratos.totalPagado}
                    items={[
                      { label: 'Total Pagado', value: costosSubcontratos.totalPagado, highlight: true },
                      { label: 'Saldo por Pagar', value: costosSubcontratos.totalSaldo, warning: true },
                      { label: 'Estados de Pago', value: `${costosSubcontratos.cantidadEP}`, isText: true },
                      { label: 'Contratistas', value: `${costosSubcontratos.cantidadContratistas}`, isText: true }
                    ]}
                  />
                </div>
              </div>
            )}
          </div>

          {/* ============================================ */}
          {/* SECCIÓN 2: COSTOS INDIRECTOS */}
          {/* ============================================ */}
          <div className="glass-card rounded-2xl overflow-hidden">
            <button
              onClick={() => toggleSection('indirectos')}
              className="w-full p-6 bg-gradient-to-r from-violet-50 to-purple-50 border-b border-violet-100 hover:from-violet-100 hover:to-purple-100 transition-colors"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-violet-600 to-purple-600 flex items-center justify-center">
                    <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <div className="text-left">
                    <h3 className="text-lg font-bold text-slate-900">Costos Indirectos</h3>
                    <p className="text-sm text-slate-600">Gastos administrativos y de soporte</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <div className="text-2xl font-black text-violet-900">
                      {formatCurrency(consolidadoTotal.costosIndirectos)}
                    </div>
                    <div className="text-xs text-slate-500">
                      {((consolidadoTotal.costosIndirectos / consolidadoTotal.totalCostos) * 100).toFixed(1)}% del total
                    </div>
                  </div>
                  <svg 
                    className={`w-6 h-6 text-slate-400 transition-transform ${expandedSections.indirectos ? 'rotate-180' : ''}`}
                    fill="none" 
                    viewBox="0 0 24 24" 
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>
            </button>

            {expandedSections.indirectos && (
              <div className="p-6">
                <div className="grid md:grid-cols-2 gap-6">
                  {/* Órdenes de Compra */}
                  <CostDetailCard
                    title="Órdenes de Compra"
                    icon="📋"
                    total={costosOrdenes.montoFacturado}
                    items={[
                      { label: 'Monto Total', value: costosOrdenes.totalMonto },
                      { label: 'Recibido', value: costosOrdenes.montoRecibido },
                      { label: 'Facturado', value: costosOrdenes.montoFacturado, highlight: true },
                      { label: 'Órdenes', value: `${costosOrdenes.ordenes}`, isText: true }
                    ]}
                  />

                  {/* Rendiciones */}
                  <CostDetailCard
                    title="Rendiciones"
                    icon="💳"
                    total={costosRendiciones.totalAprobado}
                    items={[
                      { label: 'Total Aprobado', value: costosRendiciones.totalAprobado, highlight: true },
                      { label: 'Cantidad Gastos', value: `${costosRendiciones.cantidad}`, isText: true },
                      ...Object.entries(costosRendiciones.porTipo).slice(0, 2).map(([tipo, monto]) => ({
                        label: tipo,
                        value: monto,
                        small: true
                      }))
                    ]}
                  />
                </div>
              </div>
            )}
          </div>

          {/* ============================================ */}
          {/* SECCIÓN 3: RESUMEN FINANCIERO */}
          {/* ============================================ */}
          <div className="glass-card rounded-2xl overflow-hidden">
            <div className="p-6 bg-gradient-to-r from-slate-50 to-slate-100 border-b border-slate-200">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-slate-700 to-slate-900 flex items-center justify-center">
                  <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900">Resumen Financiero</h3>
                  <p className="text-sm text-slate-600">Estado de resultados del período</p>
                </div>
              </div>
            </div>

            <div className="p-6">
              <div className="space-y-4">
                <FinancialRow
                  label="Ingresos Totales"
                  value={consolidadoTotal.totalIngresos}
                  isHeader
                  positive
                />
                <div className="border-t border-slate-200 pt-4">
                  <FinancialRow
                    label="Costos Operacionales Directos"
                    value={consolidadoTotal.costosOperacionalesDirectos}
                    indent
                  />
                  <FinancialRow
                    label="Costos Indirectos"
                    value={consolidadoTotal.costosIndirectos}
                    indent
                  />
                </div>
                <FinancialRow
                  label="Total Costos"
                  value={consolidadoTotal.totalCostos}
                  isHeader
                  negative
                />
                <div className="border-t-2 border-slate-300 pt-4">
                  <FinancialRow
                    label="Margen Bruto"
                    value={consolidadoTotal.margenBruto}
                    isTotal
                    positive={consolidadoTotal.margenBruto >= 0}
                    percentage={consolidadoTotal.margenPorcentaje}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Gráfico de Distribución de Costos */}
          <div className="grid md:grid-cols-2 gap-6">
            <CostDistributionCard
              title="Distribución Costos Operacionales"
              data={[
                { label: 'Combustible', value: costosCombustible.totalCosto, color: 'bg-cyan-500' },
                { label: 'Remuneraciones', value: costosRemuneraciones.totalCostoEmpresa, color: 'bg-emerald-500' },
                { label: 'Subcontratos', value: costosSubcontratos.totalPagado, color: 'bg-teal-500' }
              ]}
              total={consolidadoTotal.costosOperacionalesDirectos}
            />

            <CostDistributionCard
              title="Distribución Costos Indirectos"
              data={[
                { label: 'Órdenes de Compra', value: costosOrdenes.montoFacturado, color: 'bg-violet-500' },
                { label: 'Rendiciones', value: costosRendiciones.totalAprobado, color: 'bg-purple-500' }
              ]}
              total={consolidadoTotal.costosIndirectos}
            />
          </div>
        </>
      )}
    </div>
  );
}

// ============================================
// COMPONENTES AUXILIARES
// ============================================

function ExecutiveCard({ label, value, icon, color, trend, subtitle }) {
  return (
    <div className="glass-card rounded-xl p-6 hover:shadow-xl transition-all">
      <div className="flex items-center justify-between mb-4">
        <div className={`w-12 h-12 rounded-lg bg-gradient-to-br ${color} flex items-center justify-center text-2xl shadow-lg`}>
          {icon}
        </div>
        {trend && (
          <div className={`px-2 py-1 rounded-full text-xs font-bold ${
            trend === 'up' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
          }`}>
            {trend === 'up' ? '↑' : '↓'}
          </div>
        )}
      </div>
      <div className="text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">
        {label}
      </div>
      <div className="text-2xl font-black text-slate-900">
        {value}
      </div>
      {subtitle && (
        <div className="text-sm text-slate-500 mt-1">
          {subtitle}
        </div>
      )}
    </div>
  );
}

function CostDetailCard({ title, icon, total, items, subtitle }) {
  return (
    <div className="bg-slate-50 rounded-xl p-5 border border-slate-200">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-2xl">{icon}</span>
        <div className="flex-1">
          <h4 className="font-bold text-slate-900">{title}</h4>
          {subtitle && <div className="text-xs text-slate-500 mt-0.5">{subtitle}</div>}
        </div>
      </div>
      <div className="space-y-2">
        {items.map((item, idx) => (
          <div key={idx} className="flex items-center justify-between">
            <span className={`text-sm ${item.small ? 'text-xs' : ''} ${
              item.highlight ? 'font-bold text-slate-900' : 'text-slate-600'
            }`}>
              {item.label}
            </span>
            <span className={`text-sm font-bold ${
              item.highlight ? 'text-blue-600' :
              item.success ? 'text-emerald-600' :
              item.danger ? 'text-red-600' :
              item.warning ? 'text-amber-600' :
              'text-slate-900'
            }`}>
              {item.isText ? item.value : new Intl.NumberFormat('es-CL', {
                style: 'currency',
                currency: 'CLP',
                minimumFractionDigits: 0
              }).format(item.value)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function FinancialRow({ label, value, isHeader, isTotal, indent, positive, negative, percentage }) {
  return (
    <div className={`flex items-center justify-between ${isTotal ? 'bg-slate-100 -mx-6 px-6 py-3 rounded-lg' : ''}`}>
      <span className={`${
        isTotal ? 'text-lg font-black' :
        isHeader ? 'text-base font-bold' :
        'text-sm'
      } ${indent ? 'pl-8' : ''} ${
        positive ? 'text-emerald-900' :
        negative ? 'text-red-900' :
        'text-slate-900'
      }`}>
        {label}
      </span>
      <div className="flex items-center gap-3">
        <span className={`${
          isTotal ? 'text-2xl font-black' :
          isHeader ? 'text-xl font-bold' :
          'text-base font-semibold'
        } ${
          positive ? 'text-emerald-600' :
          negative ? 'text-red-600' :
          'text-slate-900'
        }`}>
          {new Intl.NumberFormat('es-CL', {
            style: 'currency',
            currency: 'CLP',
            minimumFractionDigits: 0
          }).format(value)}
        </span>
        {percentage !== undefined && (
          <span className={`text-sm font-bold px-2 py-1 rounded ${
            percentage >= 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
          }`}>
            {percentage.toFixed(1)}%
          </span>
        )}
      </div>
    </div>
  );
}

function CostDistributionCard({ title, data, total }) {
  return (
    <div className="glass-card rounded-xl p-6">
      <h4 className="font-bold text-slate-900 mb-4">{title}</h4>
      <div className="space-y-3">
        {data.map((item, idx) => {
          const percentage = total > 0 ? (item.value / total) * 100 : 0;
          return (
            <div key={idx}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-semibold text-slate-700">{item.label}</span>
                <span className="text-sm font-bold text-slate-900">
                  {percentage.toFixed(1)}%
                </span>
              </div>
              <div className="w-full bg-slate-200 rounded-full h-2.5">
                <div
                  className={`${item.color} h-2.5 rounded-full transition-all`}
                  style={{ width: `${percentage}%` }}
                />
              </div>
              <div className="text-xs text-slate-500 mt-1">
                {new Intl.NumberFormat('es-CL', {
                  style: 'currency',
                  currency: 'CLP',
                  minimumFractionDigits: 0
                }).format(item.value)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
