import React, { useEffect, useState, useMemo } from "react";
import { 
  listActiveProjects, 
  listMachines, 
  listLogsByRange,
  listFuelLogsByRange 
} from "../lib/db";
import { generatePaymentStatusPDF } from "../lib/pdfGenerator";

// Obtener el primer y último día del mes
function getMonthRange(year, month) {
  const firstDay = new Date(year, month - 1, 1);
  const lastDay = new Date(year, month, 0);
  
  const yyyy1 = firstDay.getFullYear();
  const mm1 = String(firstDay.getMonth() + 1).padStart(2, "0");
  const dd1 = String(firstDay.getDate()).padStart(2, "0");
  
  const yyyy2 = lastDay.getFullYear();
  const mm2 = String(lastDay.getMonth() + 1).padStart(2, "0");
  const dd2 = String(lastDay.getDate()).padStart(2, "0");
  
  return {
    from: `${yyyy1}-${mm1}-${dd1}`,
    to: `${yyyy2}-${mm2}-${dd2}`
  };
}

export default function PaymentStatus() {
  const [projects, setProjects] = useState([]);
  const [projectId, setProjectId] = useState("");
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  
  const [machines, setMachines] = useState([]);
  const [logs, setLogs] = useState([]);
  const [fuelLogs, setFuelLogs] = useState([]);
  const [loading, setLoading] = useState(false);

  // Items manuales
  const [mobilizationItems, setMobilizationItems] = useState([]);
  const [demobilizationItems, setDemobilizationItems] = useState([]);
  const [reimbursableItems, setReimbursableItems] = useState([]);

  // Estados para agregar items
  const [showMobilizationForm, setShowMobilizationForm] = useState(false);
  const [showDemobilizationForm, setShowDemobilizationForm] = useState(false);
  const [showReimbursableForm, setShowReimbursableForm] = useState(false);

  useEffect(() => {
    (async () => {
      const p = await listActiveProjects();
      setProjects(p);
      if (p[0]) setProjectId(p[0].id);
    })();
  }, []);

  useEffect(() => {
    if (!projectId) return;
    loadData();
  }, [projectId, year, month]);

  const loadData = async () => {
    setLoading(true);
    try {
      const range = getMonthRange(year, month);
      
      const [m, l, f] = await Promise.all([
        listMachines(projectId),
        listLogsByRange(projectId, range.from, range.to),
        listFuelLogsByRange(projectId, range.from, range.to)
      ]);

      setMachines(m);
      setLogs(l);
      setFuelLogs(f);
    } catch (error) {
      console.error("Error cargando datos:", error);
      alert("Error al cargar datos");
    } finally {
      setLoading(false);
    }
  };

  // Calcular datos de maquinaria permanente (por hora)
  const hourlyMachines = useMemo(() => {
    const hourlyOnly = machines.filter(m => 
      m.active !== false && m.billingType === "hourly"
    );

    return hourlyOnly.map(machine => {
      const machineLogs = logs.filter(l => l.machineId === machine.id);
      
      let productiveHours = 0;
      let standbyHours = 0;

      machineLogs.forEach(log => {
        productiveHours += Number(log.productiveHours) || 0;
        standbyHours += Number(log.standbyHours) || 0;
      });

      const productiveCost = productiveHours * (Number(machine.clientRateProductive) || 0);
      const standbyCost = standbyHours * (Number(machine.clientRateStandby) || 0);

      return {
        ...machine,
        productiveHours,
        standbyHours,
        productiveCost,
        standbyCost,
        totalCost: productiveCost + standbyCost
      };
    });
  }, [machines, logs]);

  // Calcular equipos con precios fijos (diario/mensual)
  const fixedPriceMachines = useMemo(() => {
    const fixed = machines.filter(m => 
      m.active !== false && (m.billingType === "daily" || m.billingType === "monthly")
    );

    return fixed.map(machine => {
      const machineLogs = logs.filter(l => l.machineId === machine.id);
      
      let totalCost = 0;
      let quantity = 0;

      if (machine.billingType === "daily") {
        const daysWorked = new Set(machineLogs.filter(l => l.productiveHours > 0).map(l => l.date)).size;
        quantity = daysWorked;
        totalCost = daysWorked * (Number(machine.clientRatePerDay) || 0);
      } else if (machine.billingType === "monthly") {
        const daysInMonth = new Date(year, month, 0).getDate();
        const hasActivity = machineLogs.some(l => l.productiveHours > 0);
        if (hasActivity) {
          quantity = daysInMonth;
          totalCost = Number(machine.clientRateMonthly) || 0;
        }
      }

      return {
        ...machine,
        quantity,
        unitPrice: machine.billingType === "daily" ? machine.clientRatePerDay : machine.clientRateMonthly,
        totalCost
      };
    });
  }, [machines, logs, year, month]);

  // Calcular totales de combustible por mes
  const fuelTotalsByMonth = useMemo(() => {
    const byMonth = {};
    
    fuelLogs.forEach(fuel => {
      const date = new Date(fuel.date + 'T00:00:00');
      const fuelYear = date.getFullYear();
      const fuelMonth = date.getMonth() + 1;
      const key = `${fuelYear}-${String(fuelMonth).padStart(2, '0')}`;
      
      if (!byMonth[key]) {
        byMonth[key] = 0;
      }
      
      byMonth[key] += Number(fuel.totalCost) || 0;
    });

    return byMonth;
  }, [fuelLogs]);

  // Calcular gran total
  const grandTotal = useMemo(() => {
    const hourlyTotal = hourlyMachines.reduce((sum, m) => sum + m.totalCost, 0);
    const fixedTotal = fixedPriceMachines.reduce((sum, m) => sum + m.totalCost, 0);
    const mobilizationTotal = mobilizationItems.reduce((sum, item) => sum + item.cost, 0);
    const demobilizationTotal = demobilizationItems.reduce((sum, item) => sum + item.cost, 0);
    const reimbursableTotal = reimbursableItems.reduce((sum, item) => sum + item.cost, 0);
    
    const currentMonthKey = `${year}-${String(month).padStart(2, '0')}`;
    const fuelDiscount = -(fuelTotalsByMonth[currentMonthKey] || 0);

    const subtotal = hourlyTotal + fixedTotal + mobilizationTotal + demobilizationTotal + reimbursableTotal + fuelDiscount;
    const iva = subtotal * 0.19;
    const total = subtotal + iva;

    return {
      hourlyTotal,
      fixedTotal,
      mobilizationTotal,
      demobilizationTotal,
      reimbursableTotal,
      fuelDiscount,
      subtotal,
      iva,
      total
    };
  }, [hourlyMachines, fixedPriceMachines, mobilizationItems, demobilizationItems, reimbursableItems, fuelTotalsByMonth, year, month]);

  const monthNames = [
    "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
  ];

  const addMobilizationItem = (description, cost) => {
    setMobilizationItems([...mobilizationItems, { description, cost: Number(cost) }]);
    setShowMobilizationForm(false);
  };

  const addDemobilizationItem = (description, cost) => {
    setDemobilizationItems([...demobilizationItems, { description, cost: Number(cost) }]);
    setShowDemobilizationForm(false);
  };

  const addReimbursableItem = (description, cost) => {
    setReimbursableItems([...reimbursableItems, { description, cost: Number(cost) }]);
    setShowReimbursableForm(false);
  };

  const handleExportPDF = async () => {
    try {
      const currentProject = projects.find(p => p.id === projectId);
      
      if (!currentProject) {
        alert('Por favor selecciona un proyecto');
        return;
      }

      const monthKey = `${year}-${String(month).padStart(2, '0')}`;
      const fuelDiscount = -(fuelTotalsByMonth[monthKey] || 0);

      await generatePaymentStatusPDF({
        project: currentProject,
        year,
        month,
        hourlyMachines,
        fixedPriceMachines,
        mobilizationItems,
        demobilizationItems,
        reimbursableItems,
        grandTotal,
        fuelDiscount
      });
    } catch (error) {
      console.error('Error generando PDF:', error);
      alert('Error al generar el PDF: ' + error.message);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header - AZUL FLEETCORE */}
      <div className="glass-card rounded-2xl p-6 animate-fadeInUp">
        <div className="flex flex-col lg:flex-row lg:items-end gap-4 lg:justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-900 to-blue-700 flex items-center justify-center shadow-lg">
                <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <div>
                <h1 className="text-3xl font-black text-slate-900 tracking-tight">
                  Estado de Pago
                </h1>
                <p className="text-slate-600 mt-1 text-sm">
                  Resumen mensual de costos y facturación
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <button
              onClick={() => handleExportPDF()}
              className="px-6 py-3 rounded-xl font-semibold text-white bg-gradient-to-r from-red-600 to-pink-600 hover:from-red-500 hover:to-pink-500 shadow-lg hover:shadow-xl transition-all flex items-center justify-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
              Exportar PDF
            </button>

            <select 
              value={projectId} 
              onChange={(e) => setProjectId(e.target.value)} 
              className="input-modern"
            >
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>

            <select 
              value={month} 
              onChange={(e) => setMonth(Number(e.target.value))} 
              className="input-modern"
            >
              {monthNames.map((name, idx) => (
                <option key={idx + 1} value={idx + 1}>{name}</option>
              ))}
            </select>

            <select 
              value={year} 
              onChange={(e) => setYear(Number(e.target.value))} 
              className="input-modern"
            >
              {[2024, 2025, 2026].map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Stats rápidas - AZUL FLEETCORE */}
        <div className="mt-6 pt-6 border-t border-slate-200 grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatBadge 
            label="Total Neto" 
            value={`$${grandTotal.subtotal.toLocaleString('es-CL')}`} 
            color="blue" 
          />
          <StatBadge 
            label="IVA 19%" 
            value={`$${grandTotal.iva.toLocaleString('es-CL')}`} 
            color="orange" 
          />
          <StatBadge 
            label="Total Bruto" 
            value={`$${grandTotal.total.toLocaleString('es-CL')}`} 
            color="emerald" 
          />
          <StatBadge 
            label="Equipos" 
            value={machines.filter(m => m.active !== false).length} 
            color="slate" 
          />
        </div>
      </div>

      {loading && (
        <div className="glass-card rounded-2xl p-16 text-center">
          <div className="spinner w-8 h-8 border-blue-600 mx-auto" />
          <p className="text-slate-600 mt-4">Cargando datos...</p>
        </div>
      )}

      {!loading && (
        <>
          {/* 1. MAQUINARIA PERMANENTE - AZUL */}
          <SectionCard 
            title="1. Maquinaria Permanente (180 hrs mínimas)"
            subtitle={`${hourlyMachines.length} equipos con cobro por hora`}
            total={grandTotal.hourlyTotal}
            color="blue"
          >
            <table className="w-full">
              <thead className="bg-slate-50">
                <tr>
                  <th className="text-left px-6 py-4 text-xs font-bold text-slate-600 uppercase">Equipo</th>
                  <th className="text-center px-4 py-4 text-xs font-bold text-slate-600 uppercase">Hrs Productivas</th>
                  <th className="text-right px-4 py-4 text-xs font-bold text-slate-600 uppercase">Tarifa Productiva</th>
                  <th className="text-right px-4 py-4 text-xs font-bold text-slate-600 uppercase">Subtotal Productivo</th>
                  <th className="text-center px-4 py-4 text-xs font-bold text-slate-600 uppercase">Hrs Standby</th>
                  <th className="text-right px-4 py-4 text-xs font-bold text-slate-600 uppercase">Tarifa Standby</th>
                  <th className="text-right px-4 py-4 text-xs font-bold text-slate-600 uppercase">Subtotal Standby</th>
                  <th className="text-right px-6 py-4 text-xs font-bold text-slate-600 uppercase">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {hourlyMachines.map((machine, idx) => (
                  <tr key={machine.id || idx} className="hover:bg-slate-50">
                    <td className="px-6 py-4">
                      <div className="text-sm font-medium text-slate-900">{machine.name}</div>
                      <div className="text-xs text-slate-500">{machine.code}</div>
                    </td>
                    <td className="px-4 py-4 text-center">
                      <span className="text-sm font-semibold text-slate-900">{machine.productiveHours.toFixed(1)}</span>
                    </td>
                    <td className="px-4 py-4 text-right">
                      <span className="text-sm text-slate-600">${(machine.clientRateProductive || 0).toLocaleString('es-CL')}</span>
                    </td>
                    <td className="px-4 py-4 text-right">
                      <span className="text-sm font-semibold text-emerald-600">${machine.productiveCost.toLocaleString('es-CL')}</span>
                    </td>
                    <td className="px-4 py-4 text-center">
                      <span className="text-sm font-semibold text-slate-900">{machine.standbyHours.toFixed(1)}</span>
                    </td>
                    <td className="px-4 py-4 text-right">
                      <span className="text-sm text-slate-600">${(machine.clientRateStandby || 0).toLocaleString('es-CL')}</span>
                    </td>
                    <td className="px-4 py-4 text-right">
                      <span className="text-sm font-semibold text-amber-600">${machine.standbyCost.toLocaleString('es-CL')}</span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <span className="text-sm font-bold text-blue-700">${machine.totalCost.toLocaleString('es-CL')}</span>
                    </td>
                  </tr>
                ))}
                {hourlyMachines.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-6 py-8 text-center text-slate-500">
                      No hay equipos con cobro por hora
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </SectionCard>

          {/* 2. PRECIOS UNITARIOS - VERDE */}
          <SectionCard 
            title="2. Precios Unitarios Mensuales"
            subtitle={`${fixedPriceMachines.length} equipos con cobro fijo`}
            total={grandTotal.fixedTotal}
            color="emerald"
          >
            <table className="w-full">
              <thead className="bg-slate-50">
                <tr>
                  <th className="text-left px-6 py-4 text-xs font-bold text-slate-600 uppercase">Descripción</th>
                  <th className="text-center px-4 py-4 text-xs font-bold text-slate-600 uppercase">Unidad</th>
                  <th className="text-right px-4 py-4 text-xs font-bold text-slate-600 uppercase">Valor Unitario</th>
                  <th className="text-center px-4 py-4 text-xs font-bold text-slate-600 uppercase">Cantidad</th>
                  <th className="text-right px-6 py-4 text-xs font-bold text-slate-600 uppercase">Valor Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {fixedPriceMachines.map((machine, idx) => (
                  <tr key={machine.id || idx} className="hover:bg-slate-50">
                    <td className="px-6 py-4">
                      <div className="text-sm font-medium text-slate-900">{machine.name}</div>
                      <div className="text-xs text-slate-500">{machine.code}</div>
                    </td>
                    <td className="px-4 py-4 text-center">
                      <span className="text-sm text-slate-600">
                        {machine.billingType === "daily" ? "Día" : "Mes"}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-right">
                      <span className="text-sm text-slate-600">${(machine.unitPrice || 0).toLocaleString('es-CL')}</span>
                    </td>
                    <td className="px-4 py-4 text-center">
                      <span className="text-sm font-semibold text-slate-900">{machine.quantity}</span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <span className="text-sm font-bold text-emerald-700">${machine.totalCost.toLocaleString('es-CL')}</span>
                    </td>
                  </tr>
                ))}
                {fixedPriceMachines.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 text-center text-slate-500">
                      No hay equipos con precio fijo
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </SectionCard>

          {/* 3. MOVILIZACIÓN - NARANJA */}
          <ManualItemsSection
            title="3. Movilización"
            items={mobilizationItems}
            total={grandTotal.mobilizationTotal}
            showForm={showMobilizationForm}
            setShowForm={setShowMobilizationForm}
            onAdd={addMobilizationItem}
            onRemove={(idx) => setMobilizationItems(mobilizationItems.filter((_, i) => i !== idx))}
            color="orange"
          />

          {/* 4. DESMOVILIZACIÓN - PÚRPURA */}
          <ManualItemsSection
            title="4. Desmovilización"
            items={demobilizationItems}
            total={grandTotal.demobilizationTotal}
            showForm={showDemobilizationForm}
            setShowForm={setShowDemobilizationForm}
            onAdd={addDemobilizationItem}
            onRemove={(idx) => setDemobilizationItems(demobilizationItems.filter((_, i) => i !== idx))}
            color="violet"
          />

          {/* 5. REEMBOLSABLES - ÁMBAR */}
          <ManualItemsSection
            title="5. Gastos Reembolsables"
            items={reimbursableItems}
            total={grandTotal.reimbursableTotal}
            showForm={showReimbursableForm}
            setShowForm={setShowReimbursableForm}
            onAdd={addReimbursableItem}
            onRemove={(idx) => setReimbursableItems(reimbursableItems.filter((_, i) => i !== idx))}
            color="amber"
          />

          {/* 6. DESCUENTO COMBUSTIBLE - ROJO */}
          <SectionCard 
            title="6. Descuento por Combustible"
            subtitle={`Descuento del mes seleccionado`}
            total={grandTotal.fuelDiscount}
            color="red"
            isDiscount
          >
            <div className="px-6 py-8">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-slate-700">
                  Combustible cargado en {monthNames[month - 1]} {year}
                </span>
                <span className="text-lg font-bold text-red-600">
                  -${Math.abs(grandTotal.fuelDiscount).toLocaleString('es-CL')}
                </span>
              </div>
            </div>
          </SectionCard>

          {/* GRAN TOTAL - AZUL FLEETCORE */}
          <div className="glass-card rounded-2xl overflow-hidden border-2 border-blue-200">
            <div className="p-8 bg-gradient-to-r from-blue-50 to-sky-50">
              <div className="space-y-4">
                <div className="flex items-center justify-between text-lg">
                  <span className="font-semibold text-slate-700">Subtotal Neto</span>
                  <span className="font-bold text-slate-900">${grandTotal.subtotal.toLocaleString('es-CL')}</span>
                </div>
                <div className="flex items-center justify-between text-lg">
                  <span className="font-semibold text-slate-700">IVA (19%)</span>
                  <span className="font-bold text-slate-900">${grandTotal.iva.toLocaleString('es-CL')}</span>
                </div>
                <div className="h-px bg-blue-200" />
                <div className="flex items-center justify-between">
                  <span className="text-2xl font-black text-blue-900">TOTAL BRUTO</span>
                  <span className="text-3xl font-black text-blue-700">${grandTotal.total.toLocaleString('es-CL')}</span>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// COMPONENTES AUXILIARES CON BRANDING FLEETCORE

function StatBadge({ label, value, color }) {
  const colors = {
    blue: 'from-blue-900 to-blue-700',
    orange: 'from-orange-600 to-red-600',
    emerald: 'from-emerald-600 to-teal-600',
    slate: 'from-slate-600 to-slate-800'
  };

  return (
    <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-slate-50">
      <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${colors[color]} flex items-center justify-center shadow-md flex-shrink-0`}>
        <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </div>
      <div className="min-w-0">
        <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{label}</div>
        <div className="text-lg font-black text-slate-900 truncate">{value}</div>
      </div>
    </div>
  );
}

function SectionCard({ title, subtitle, total, children, color = "blue", isDiscount = false }) {
  const colors = {
    blue: { bg: 'from-blue-50 to-sky-50', border: 'border-blue-200', text: 'text-blue-900', icon: 'from-blue-900 to-blue-700' },
    emerald: { bg: 'from-emerald-50 to-teal-50', border: 'border-emerald-200', text: 'text-emerald-900', icon: 'from-emerald-600 to-teal-600' },
    orange: { bg: 'from-orange-50 to-red-50', border: 'border-orange-200', text: 'text-orange-900', icon: 'from-orange-600 to-red-600' },
    violet: { bg: 'from-violet-50 to-purple-50', border: 'border-violet-200', text: 'text-violet-900', icon: 'from-violet-600 to-purple-600' },
    amber: { bg: 'from-amber-50 to-yellow-50', border: 'border-amber-200', text: 'text-amber-900', icon: 'from-amber-600 to-yellow-600' },
    red: { bg: 'from-red-50 to-pink-50', border: 'border-red-200', text: 'text-red-900', icon: 'from-red-600 to-pink-600' }
  };

  const colorScheme = colors[color];

  return (
    <div className="glass-card rounded-2xl overflow-hidden">
      <div className={`px-6 py-4 bg-gradient-to-r ${colorScheme.bg} border-b ${colorScheme.border}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${colorScheme.icon} flex items-center justify-center shadow-lg`}>
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div>
              <h3 className={`text-lg font-bold ${colorScheme.text}`}>{title}</h3>
              {subtitle && <p className={`text-sm ${colorScheme.text} opacity-75 mt-0.5`}>{subtitle}</p>}
            </div>
          </div>
          <div className={`text-2xl font-black ${colorScheme.text}`}>
            {isDiscount && total < 0 ? '-' : ''}${Math.abs(total).toLocaleString('es-CL')}
          </div>
        </div>
      </div>
      <div className="overflow-x-auto">
        {children}
      </div>
    </div>
  );
}

function ManualItemsSection({ title, items, total, showForm, setShowForm, onAdd, onRemove, color }) {
  const [description, setDescription] = useState("");
  const [cost, setCost] = useState("");

  const handleSubmit = () => {
    if (description && cost) {
      onAdd(description, cost);
      setDescription("");
      setCost("");
    }
  };

  return (
    <SectionCard title={title} total={total} color={color}>
      <table className="w-full">
        <thead className="bg-slate-50">
          <tr>
            <th className="text-left px-6 py-4 text-xs font-bold text-slate-600 uppercase">Descripción</th>
            <th className="text-right px-6 py-4 text-xs font-bold text-slate-600 uppercase">Monto</th>
            <th className="text-right px-6 py-4 text-xs font-bold text-slate-600 uppercase">Acciones</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {items.map((item, idx) => (
            <tr key={idx} className="hover:bg-slate-50">
              <td className="px-6 py-4">
                <span className="text-sm font-medium text-slate-900">{item.description}</span>
              </td>
              <td className="px-6 py-4 text-right">
                <span className="text-sm font-bold text-slate-900">${item.cost.toLocaleString('es-CL')}</span>
              </td>
              <td className="px-6 py-4 text-right">
                <button
                  onClick={() => onRemove(idx)}
                  className="text-red-600 hover:text-red-800 font-semibold text-sm"
                >
                  Eliminar
                </button>
              </td>
            </tr>
          ))}
          {showForm && (
            <tr className="bg-blue-50">
              <td className="px-6 py-4">
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Descripción del item"
                  className="input-modern w-full"
                />
              </td>
              <td className="px-6 py-4">
                <input
                  type="number"
                  value={cost}
                  onChange={(e) => setCost(e.target.value)}
                  placeholder="Monto"
                  className="input-modern w-full text-right"
                />
              </td>
              <td className="px-6 py-4 text-right">
                <div className="flex items-center gap-2 justify-end">
                  <button onClick={handleSubmit} className="text-blue-600 hover:text-blue-800 font-semibold text-sm">
                    Agregar
                  </button>
                  <button onClick={() => setShowForm(false)} className="text-slate-600 hover:text-slate-800 font-semibold text-sm">
                    Cancelar
                  </button>
                </div>
              </td>
            </tr>
          )}
          {!showForm && (
            <tr>
              <td colSpan={3} className="px-6 py-4">
                <button
                  onClick={() => setShowForm(true)}
                  className="w-full px-4 py-3 rounded-xl border-2 border-dashed border-slate-300 text-slate-600 hover:border-blue-500 hover:text-blue-600 hover:bg-blue-50 transition-all font-semibold text-sm"
                >
                  + Agregar Item
                </button>
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </SectionCard>
  );
}
