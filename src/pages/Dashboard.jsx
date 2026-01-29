import React, { useEffect, useState, useMemo } from "react";
import { listActiveProjects, listLogsByRange, listFuelLogsByRange, listEmployeeMonthlyData, listMachines } from "../lib/db";
import { collection, query, where, getDocs } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useFuelPrices } from "../lib/fuelPriceService";

// Utilidades de fecha
function isoToday() {
  const d = new Date();
  return d.toISOString().split('T')[0];
}

function addDays(dateStr, days) {
  const date = new Date(dateStr + 'T00:00:00');
  date.setDate(date.getDate() + days);
  return date.toISOString().split('T')[0];
}

function getMonthStart() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}-01`;
}

export default function DashboardExecutive() {
  const [projects, setProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  
  // Rango: mes actual
  const [dateFrom] = useState(getMonthStart());
  const [dateTo] = useState(isoToday());
  
  // Datos
  const [dailyLogs, setDailyLogs] = useState([]);
  const [fuelLogs, setFuelLogs] = useState([]);
  const [employeeData, setEmployeeData] = useState([]);
  const [machines, setMachines] = useState([]);
  const [rendiciones, setRendiciones] = useState([]);
  const [subcontratos, setSubcontratos] = useState([]);
  const [ocs, setOcs] = useState([]);

  const { prices: fuelPrices } = useFuelPrices(true);

  useEffect(() => {
    (async () => {
      const p = await listActiveProjects();
      setProjects(p);
      if (p.length > 0) setSelectedProject(p[0].id);
    })();
  }, []);

  useEffect(() => {
    if (!selectedProject) return;
    loadData();
  }, [selectedProject, dateFrom, dateTo]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const fromDate = new Date(dateFrom);
      const year = fromDate.getFullYear();
      const month = fromDate.getMonth() + 1;

      const [logs, fuel, employees, machineList] = await Promise.all([
        listLogsByRange(selectedProject, dateFrom, dateTo),
        listFuelLogsByRange(selectedProject, dateFrom, dateTo),
        listEmployeeMonthlyData(selectedProject, year, month),
        listMachines(selectedProject)
      ]);

      // Rendiciones
      const rendSnap = await getDocs(query(collection(db, 'rendiciones'), where("projectId", "==", selectedProject)));
      const allRend = rendSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      const filtRend = allRend.filter(r => r.fechaEmision >= dateFrom && r.fechaEmision <= dateTo);

      // Subcontratos
      const subSnap = await getDocs(query(collection(db, 'subcontratos'), where("projectId", "==", selectedProject)));
      const allSub = subSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      const filtSub = allSub.filter(s => s.fechaEP >= dateFrom && s.fechaEP <= dateTo);

      // OCs
      const ocSnap = await getDocs(query(collection(db, 'ordenes_compra'), where("projectId", "==", selectedProject)));
      const allOc = ocSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      const filtOc = allOc.filter(o => o.fecha >= dateFrom && o.fecha <= dateTo);

      setDailyLogs(logs);
      setFuelLogs(fuel);
      setEmployeeData(employees);
      setMachines(machineList);
      setRendiciones(filtRend);
      setSubcontratos(filtSub);
      setOcs(filtOc);
    } catch (err) {
      console.error("Error cargando datos:", err);
    } finally {
      setIsLoading(false);
    }
  };

  // ============================================
  // CÁLCULOS DE KPIs
  // ============================================

  const kpis = useMemo(() => {
    const machineMap = {};
    machines.forEach(m => machineMap[m.id] = m);

    // 1. FLOTA
    let totalHorasProductivas = 0;
    let totalKilometraje = 0;
    let diasTrabajados = new Set();
    
    dailyLogs.forEach(log => {
      totalHorasProductivas += Number(log.productiveHours) || 0;
      totalKilometraje += Number(log.kilometraje) || 0;
      diasTrabajados.add(log.date);
    });

    const promedioHorasDia = diasTrabajados.size > 0 ? totalHorasProductivas / diasTrabajados.size : 0;

    // 2. COMBUSTIBLE
    let totalLitros = 0;
    let totalCostoCombustible = 0;
    
    fuelLogs.forEach(log => {
      const litros = Number(log.liters) || 0;
      totalLitros += litros;
      const precio = fuelPrices?.diesel || 950;
      totalCostoCombustible += litros * precio;
    });

    const consumoPromedioDia = diasTrabajados.size > 0 ? totalLitros / diasTrabajados.size : 0;
    const eficienciaKmLitro = totalLitros > 0 ? totalKilometraje / totalLitros : 0;

    // 3. PERSONAL
    const totalEmpleados = employeeData.length;
    const totalSueldoLiquido = employeeData.reduce((sum, emp) => sum + (Number(emp.sueldoLiquido) || 0), 0);
    const totalCostoEmpresa = employeeData.reduce((sum, emp) => sum + (Number(emp.totalCosto) || 0), 0);

    // 4. RENDICIONES
    const totalRendiciones = rendiciones.reduce((sum, r) => sum + (Number(r.monto) || 0), 0);
    const promedioRendicion = rendiciones.length > 0 ? totalRendiciones / rendiciones.length : 0;

    // 5. SUBCONTRATOS
    const totalSubcontratos = subcontratos.reduce((sum, s) => sum + (Number(s.montoPagado) || 0), 0);

    // 6. ÓRDENES DE COMPRA
    const totalOC = ocs.reduce((sum, o) => sum + (Number(o.monto) || 0), 0);
    const totalFacturado = ocs.reduce((sum, o) => sum + (Number(o.facturado) || 0), 0);

    // 7. TOTALES
    const totalCostos = totalCostoCombustible + totalCostoEmpresa + totalRendiciones + totalSubcontratos + totalOC;
    const costoPorHora = totalHorasProductivas > 0 ? totalCostos / totalHorasProductivas : 0;
    const costoPorKm = totalKilometraje > 0 ? totalCostos / totalKilometraje : 0;

    return {
      // Flota
      horasProductivas: Math.round(totalHorasProductivas),
      kilometraje: Math.round(totalKilometraje),
      diasTrabajados: diasTrabajados.size,
      promedioHorasDia: Math.round(promedioHorasDia * 10) / 10,
      equiposActivos: machines.length,

      // Combustible
      totalLitros: Math.round(totalLitros),
      costoCombustible: Math.round(totalCostoCombustible),
      consumoPromedioDia: Math.round(consumoPromedioDia * 10) / 10,
      eficienciaKmLitro: Math.round(eficienciaKmLitro * 100) / 100,
      recargas: fuelLogs.length,

      // Personal
      totalEmpleados,
      sueldoLiquido: Math.round(totalSueldoLiquido),
      costoEmpresa: Math.round(totalCostoEmpresa),
      promedioSueldo: totalEmpleados > 0 ? Math.round(totalSueldoLiquido / totalEmpleados) : 0,

      // Rendiciones
      totalRendiciones: Math.round(totalRendiciones),
      cantidadRendiciones: rendiciones.length,
      promedioRendicion: Math.round(promedioRendicion),

      // Subcontratos
      totalSubcontratos: Math.round(totalSubcontratos),
      cantidadSubcontratos: subcontratos.length,

      // OC
      totalOC: Math.round(totalOC),
      totalFacturado: Math.round(totalFacturado),
      saldoPorRecibir: Math.round(totalOC - totalFacturado),
      cantidadOC: ocs.length,

      // Totales
      totalCostos: Math.round(totalCostos),
      costoPorHora: Math.round(costoPorHora),
      costoPorKm: Math.round(costoPorKm)
    };
  }, [dailyLogs, fuelLogs, employeeData, machines, rendiciones, subcontratos, ocs, fuelPrices]);

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('es-CL', {
      style: 'currency',
      currency: 'CLP',
      minimumFractionDigits: 0
    }).format(value || 0);
  };

  const formatNumber = (value) => {
    return new Intl.NumberFormat('es-CL').format(value || 0);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="spinner w-12 h-12 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="glass-card rounded-2xl p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center shadow-lg">
              <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <div>
              <h1 className="text-3xl font-black text-slate-900 tracking-tight">
                Dashboard Ejecutivo
              </h1>
              <p className="text-slate-600 mt-1 text-sm">
                Análisis y KPIs del mes actual
              </p>
            </div>
          </div>

          <select
            value={selectedProject}
            onChange={(e) => setSelectedProject(e.target.value)}
            className="input-modern"
          >
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
      </div>

      {/* KPIs Principales - 4 Cards */}
      <div className="grid lg:grid-cols-4 gap-6">
        <KPICard
          label="Total Costos"
          value={formatCurrency(kpis.totalCostos)}
          icon="💰"
          color="from-red-500 to-rose-600"
          subtitle={`${kpis.diasTrabajados} días trabajados`}
        />
        <KPICard
          label="Horas Productivas"
          value={formatNumber(kpis.horasProductivas)}
          icon="⏱️"
          color="from-blue-500 to-cyan-600"
          subtitle={`${kpis.promedioHorasDia} hrs/día promedio`}
        />
        <KPICard
          label="Costo por Hora"
          value={formatCurrency(kpis.costoPorHora)}
          icon="📊"
          color="from-violet-500 to-purple-600"
          subtitle="Eficiencia operacional"
        />
        <KPICard
          label="Personal Activo"
          value={kpis.totalEmpleados}
          icon="👷"
          color="from-emerald-500 to-teal-600"
          subtitle={formatCurrency(kpis.promedioSueldo) + " promedio"}
        />
      </div>

      {/* Análisis Operacional */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Eficiencia de Flota */}
        <AnalysisCard
          title="Eficiencia de Flota"
          icon="🚜"
          items={[
            { label: 'Kilometraje Total', value: formatNumber(kpis.kilometraje) + ' km' },
            { label: 'Consumo Combustible', value: formatNumber(kpis.totalLitros) + ' L' },
            { label: 'Eficiencia', value: kpis.eficienciaKmLitro.toFixed(2) + ' km/L', highlight: true },
            { label: 'Costo por Km', value: formatCurrency(kpis.costoPorKm) }
          ]}
        />

        {/* Combustible */}
        <AnalysisCard
          title="Análisis Combustible"
          icon="⛽"
          items={[
            { label: 'Total Litros', value: formatNumber(kpis.totalLitros) + ' L' },
            { label: 'Costo Total', value: formatCurrency(kpis.costoCombustible), highlight: true },
            { label: 'Recargas', value: kpis.recargas + ' recargas' },
            { label: 'Promedio Diario', value: kpis.consumoPromedioDia.toFixed(1) + ' L/día' }
          ]}
        />
      </div>

      {/* Desglose de Costos */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Personal */}
        <CostCard
          title="Personal"
          icon="👷"
          total={kpis.costoEmpresa}
          percentage={(kpis.costoEmpresa / kpis.totalCostos * 100).toFixed(1)}
          color="emerald"
          items={[
            { label: 'Empleados', value: kpis.totalEmpleados },
            { label: 'Líquido', value: formatCurrency(kpis.sueldoLiquido) }
          ]}
        />

        {/* Combustible */}
        <CostCard
          title="Combustible"
          icon="⛽"
          total={kpis.costoCombustible}
          percentage={(kpis.costoCombustible / kpis.totalCostos * 100).toFixed(1)}
          color="cyan"
          items={[
            { label: 'Litros', value: formatNumber(kpis.totalLitros) + ' L' },
            { label: 'Recargas', value: kpis.recargas }
          ]}
        />

        {/* Subcontratos */}
        <CostCard
          title="Subcontratos"
          icon="🤝"
          total={kpis.totalSubcontratos}
          percentage={(kpis.totalSubcontratos / kpis.totalCostos * 100).toFixed(1)}
          color="teal"
          items={[
            { label: 'Estados de Pago', value: kpis.cantidadSubcontratos },
            { label: 'Promedio', value: kpis.cantidadSubcontratos > 0 ? formatCurrency(kpis.totalSubcontratos / kpis.cantidadSubcontratos) : '$0' }
          ]}
        />
      </div>

      {/* Órdenes y Rendiciones */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* OC */}
        <AnalysisCard
          title="Órdenes de Compra"
          icon="📦"
          items={[
            { label: 'Total OCs', value: kpis.cantidadOC + ' órdenes' },
            { label: 'Monto Total', value: formatCurrency(kpis.totalOC) },
            { label: 'Facturado', value: formatCurrency(kpis.totalFacturado) },
            { label: 'Saldo por Recibir', value: formatCurrency(kpis.saldoPorRecibir), highlight: true }
          ]}
        />

        {/* Rendiciones */}
        <AnalysisCard
          title="Rendiciones"
          icon="💳"
          items={[
            { label: 'Total Rendiciones', value: kpis.cantidadRendiciones + ' rendiciones' },
            { label: 'Monto Total', value: formatCurrency(kpis.totalRendiciones), highlight: true },
            { label: 'Promedio', value: formatCurrency(kpis.promedioRendicion) },
            { label: '% del Total', value: ((kpis.totalRendiciones / kpis.totalCostos) * 100).toFixed(1) + '%' }
          ]}
        />
      </div>
    </div>
  );
}

// ============================================
// COMPONENTES
// ============================================

function KPICard({ label, value, icon, color, subtitle }) {
  return (
    <div className="glass-card rounded-xl p-6 hover:shadow-lg transition-shadow">
      <div className="flex items-start justify-between mb-4">
        <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${color} flex items-center justify-center shadow-lg text-2xl`}>
          {icon}
        </div>
      </div>
      <div className="text-3xl font-black text-slate-900 mb-1">{value}</div>
      <div className="text-sm font-semibold text-slate-600">{label}</div>
      {subtitle && <div className="text-xs text-slate-500 mt-2">{subtitle}</div>}
    </div>
  );
}

function AnalysisCard({ title, icon, items }) {
  return (
    <div className="glass-card rounded-xl p-6">
      <div className="flex items-center gap-3 mb-6">
        <span className="text-2xl">{icon}</span>
        <h3 className="text-lg font-bold text-slate-900">{title}</h3>
      </div>
      <div className="space-y-4">
        {items.map((item, idx) => (
          <div key={idx} className="flex items-center justify-between">
            <span className="text-sm text-slate-600">{item.label}</span>
            <span className={`text-sm font-bold ${item.highlight ? 'text-blue-700' : 'text-slate-900'}`}>
              {item.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function CostCard({ title, icon, total, percentage, color, items }) {
  return (
    <div className="glass-card rounded-xl p-6">
      <div className="flex items-center gap-3 mb-4">
        <span className="text-2xl">{icon}</span>
        <h3 className="text-lg font-bold text-slate-900">{title}</h3>
      </div>
      
      <div className="mb-4">
        <div className="text-2xl font-black text-slate-900 mb-1">
          {new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', minimumFractionDigits: 0 }).format(total)}
        </div>
        <div className={`text-sm font-bold text-${color}-600`}>
          {percentage}% del total
        </div>
      </div>

      <div className="space-y-2">
        {items.map((item, idx) => (
          <div key={idx} className="flex items-center justify-between text-sm">
            <span className="text-slate-600">{item.label}</span>
            <span className="font-semibold text-slate-900">{item.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
