import React, { useEffect, useState, useMemo } from "react";
import { listActiveProjects, listPurchaseOrders, savePurchaseOrders } from "../lib/db";
import OCImporter from "../components/OCImporter";

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

export default function OC() {
  const [projects, setProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState("");
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showImporter, setShowImporter] = useState(false);
  
  // Filtros de fecha - Rango flexible (igual que MonthlyCalendar)
  const [dateFrom, setDateFrom] = useState(addDays(isoToday(), -29)); // Últimos 30 días
  const [dateTo, setDateTo] = useState(isoToday());
  const [error, setError] = useState(null);
  
  // Filtros adicionales
  const [searchTerm, setSearchTerm] = useState("");
  const [filterProveedor, setFilterProveedor] = useState("all");

  // Estado de expansión de grupos
  const [expandedGroups, setExpandedGroups] = useState(new Set());

  // Calcular días en rango
  const daysInRange = useMemo(() => getDaysDiff(dateFrom, dateTo), [dateFrom, dateTo]);

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
    loadData();
  }, [selectedProject, dateFrom, dateTo]);

  const loadData = async () => {
    // Validaciones (igual que MonthlyCalendar)
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
      const orders = await listPurchaseOrders(selectedProject);
      
      // Filtrar por rango de fechas
      const filteredOrders = orders.filter(order => {
        if (!order.fecha) return false;
        return order.fecha >= dateFrom && order.fecha <= dateTo;
      });
      
      setPurchaseOrders(filteredOrders);
      console.log(`📦 Cargadas ${filteredOrders.length} órdenes de compra entre ${dateFrom} y ${dateTo}`);
    } catch (err) {
      console.error("Error cargando órdenes:", err);
      setError("Error al cargar las órdenes de compra");
    } finally {
      setIsLoading(false);
    }
  };

  const handleImportComplete = async (importedOrders) => {
    try {
      setIsLoading(true);
      await savePurchaseOrders(importedOrders, selectedProject);
      await loadData();
      setShowImporter(false);
    } catch (error) {
      console.error("Error guardando órdenes:", error);
      alert("Error al guardar las órdenes de compra");
    } finally {
      setIsLoading(false);
    }
  };

  // Filtrar OCs por búsqueda y proveedor
  const filteredOrders = useMemo(() => {
    return purchaseOrders.filter(oc => {
      // Filtro por búsqueda
      if (searchTerm) {
        const search = searchTerm.toLowerCase();
        const matchesOC = oc.numeroOC?.toLowerCase().includes(search) ||
                          oc.nombreOC?.toLowerCase().includes(search) ||
                          oc.proveedor?.toLowerCase().includes(search);
        
        const matchesItems = oc.items?.some(item =>
          item.descripcion?.toLowerCase().includes(search) ||
          item.codMaestro?.toLowerCase().includes(search)
        );
        
        if (!matchesOC && !matchesItems) return false;
      }

      // Filtro por proveedor
      if (filterProveedor !== "all" && oc.proveedor !== filterProveedor) {
        return false;
      }

      return true;
    });
  }, [purchaseOrders, searchTerm, filterProveedor]);

  // Estadísticas
  const stats = useMemo(() => {
    const cantidadOCs = filteredOrders.length;
    const montoTotal = filteredOrders.reduce((sum, oc) => sum + (oc.totalMonto || 0), 0);
    const montoFacturado = filteredOrders.reduce((sum, oc) => sum + (oc.totalFacturado || 0), 0);
    const cantidadLineas = filteredOrders.reduce((sum, oc) => sum + (oc.items?.length || 0), 0);

    return {
      cantidadOCs,
      montoTotal,
      montoFacturado,
      saldoPorRecibir: montoTotal - montoFacturado,
      cantidadLineas
    };
  }, [filteredOrders]);

  // Lista de proveedores únicos para filtro
  const proveedores = useMemo(() => {
    const proveSet = new Set();
    purchaseOrders.forEach(oc => {
      if (oc.proveedor) proveSet.add(oc.proveedor);
    });
    return Array.from(proveSet).sort();
  }, [purchaseOrders]);

  const toggleGroup = (numeroOC) => {
    const newExpanded = new Set(expandedGroups);
    if (newExpanded.has(numeroOC)) {
      newExpanded.delete(numeroOC);
    } else {
      newExpanded.add(numeroOC);
    }
    setExpandedGroups(newExpanded);
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('es-CL', {
      style: 'currency',
      currency: 'CLP',
      minimumFractionDigits: 0
    }).format(amount);
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

  // Handlers para cambios rápidos de fecha (igual que MonthlyCalendar)
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

  return (
    <div className="space-y-6">
      {/* Header con controles - VIOLET FLEETCORE */}
      <div className="glass-card rounded-2xl p-6">
        <div className="flex flex-col lg:flex-row gap-4 lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-600 to-purple-600 flex items-center justify-center shadow-lg">
                <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <div>
                <h1 className="text-3xl font-black text-slate-900 tracking-tight">
                  Órdenes de Compra
                </h1>
                <p className="text-slate-600 mt-1 text-sm">
                  Gestión de OCs con rango flexible de fechas (máx. 365 días)
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowImporter(!showImporter)}
              className="btn-primary flex items-center gap-2"
              disabled={isLoading}
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              Importar Excel
            </button>

            <select
              value={selectedProject}
              onChange={(e) => setSelectedProject(e.target.value)}
              className="input-modern lg:w-64"
              disabled={isLoading}
            >
              <option value="">Seleccionar proyecto...</option>
              {projects.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
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

            {/* Botones rápidos - VIOLET FLEETCORE */}
            <div className="flex gap-2 lg:items-end">
              <button
                onClick={() => setPreset(7)}
                className="px-4 py-2 text-sm font-semibold text-violet-700 bg-violet-50 hover:bg-violet-100 border border-violet-200 rounded-xl transition-all disabled:opacity-50"
                disabled={isLoading}
              >
                7 días
              </button>
              <button
                onClick={setWeek}
                className="px-4 py-2 text-sm font-semibold text-violet-700 bg-violet-50 hover:bg-violet-100 border border-violet-200 rounded-xl transition-all disabled:opacity-50"
                disabled={isLoading}
              >
                Semana
              </button>
              <button
                onClick={setMonth}
                className="px-4 py-2 text-sm font-semibold text-violet-700 bg-violet-50 hover:bg-violet-100 border border-violet-200 rounded-xl transition-all disabled:opacity-50"
                disabled={isLoading}
              >
                Mes
              </button>
            </div>
          </div>

          {/* Info del rango - VIOLET FLEETCORE */}
          <div className="mt-4 flex items-center gap-4 text-sm">
            <div className="flex items-center gap-2 text-slate-600">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <span className="font-medium">{daysInRange} días en el rango</span>
            </div>
            <div className="flex items-center gap-2 text-violet-700">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="font-bold">Del {formatDate(dateFrom)} al {formatDate(dateTo)}</span>
            </div>
          </div>

          {/* Mensajes de estado */}
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

        {/* Importador */}
        {showImporter && (
          <div className="mt-6 pt-6 border-t border-slate-200">
            <OCImporter 
              projectId={selectedProject}
              projects={projects}
              onImportComplete={handleImportComplete}
            />
          </div>
        )}

        {/* Stats */}
        <div className="mt-6 pt-6 border-t border-slate-200">
          <div className="grid lg:grid-cols-4 gap-6">
            <StatCard
              label="Total Órdenes"
              value={stats.cantidadOCs}
              icon="📋"
              color="from-violet-500 to-purple-500"
            />
            <StatCard
              label="Monto Total"
              value={formatCurrency(stats.montoTotal)}
              icon="💰"
              color="from-blue-500 to-cyan-500"
            />
            <StatCard
              label="Monto Facturado"
              value={formatCurrency(stats.montoFacturado)}
              icon="✅"
              color="from-emerald-500 to-teal-500"
            />
            <StatCard
              label="Total Líneas"
              value={stats.cantidadLineas}
              icon="📝"
              color="from-amber-500 to-orange-500"
            />
          </div>
        </div>

        {/* Filtros adicionales */}
        <div className="mt-6 pt-6 border-t border-slate-200">
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                Buscar
              </label>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar por N° OC, nombre, proveedor..."
                className="input-modern"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                Proveedor
              </label>
              <select
                value={filterProveedor}
                onChange={(e) => setFilterProveedor(e.target.value)}
                className="input-modern"
              >
                <option value="all">Todos los proveedores</option>
                {proveedores.map(prov => (
                  <option key={prov} value={prov}>{prov}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Tabla de Órdenes */}
      <div className="glass-card rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gradient-to-r from-violet-50 to-purple-50">
              <tr>
                <th className="text-left px-4 py-4 text-xs font-bold text-slate-700 uppercase w-12"></th>
                <th className="text-left px-4 py-4 text-xs font-bold text-slate-700 uppercase">N° OC</th>
                <th className="text-left px-4 py-4 text-xs font-bold text-slate-700 uppercase">Nombre OC</th>
                <th className="text-left px-4 py-4 text-xs font-bold text-slate-700 uppercase">Proveedor</th>
                <th className="text-center px-4 py-4 text-xs font-bold text-slate-700 uppercase">Fecha</th>
                <th className="text-right px-4 py-4 text-xs font-bold text-slate-700 uppercase">Monto</th>
                <th className="text-right px-4 py-4 text-xs font-bold text-slate-700 uppercase">Facturado</th>
                <th className="text-right px-4 py-4 text-xs font-bold text-slate-700 uppercase">Saldo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center">
                    <div className="flex justify-center items-center gap-3">
                      <div className="spinner w-6 h-6" />
                      <span className="text-slate-600">Cargando órdenes de compra...</span>
                    </div>
                  </td>
                </tr>
              ) : filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center text-slate-500">
                    No se encontraron órdenes de compra
                  </td>
                </tr>
              ) : (
                filteredOrders.map((oc) => {
                  const isExpanded = expandedGroups.has(oc.numeroOC);
                  return (
                    <React.Fragment key={oc.numeroOC}>
                      {/* Fila principal de la OC */}
                      <tr className="hover:bg-violet-50/50 transition-colors">
                        <td className="px-4 py-3">
                          <button
                            onClick={() => toggleGroup(oc.numeroOC)}
                            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-violet-100 transition-colors text-violet-600"
                          >
                            {isExpanded ? '▼' : '▶'}
                          </button>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-sm font-bold text-slate-900">{oc.numeroOC}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-sm text-slate-700">{oc.nombreOC}</span>
                        </td>
                        <td className="px-4 py-3">
                          <div>
                            <div className="text-sm font-medium text-slate-900">{oc.proveedor}</div>
                            <div className="text-xs text-slate-500">{oc.rutProveedor}</div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className="text-sm text-slate-600">{formatDate(oc.fecha)}</span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className="text-sm font-semibold text-slate-900">{formatCurrency(oc.totalMonto)}</span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className="text-sm font-semibold text-emerald-600">{formatCurrency(oc.totalFacturado)}</span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className="text-sm font-semibold text-violet-600">{oc.totalSaldo}</span>
                        </td>
                      </tr>

                      {/* Filas expandidas de items */}
                      {isExpanded && oc.items?.map((item, idx) => (
                        <tr key={`${oc.numeroOC}-${idx}`} className="bg-slate-50">
                          <td className="px-4 py-2"></td>
                          <td className="px-4 py-2">
                            <span className="text-xs text-slate-500">↳ {item.codMaestro}</span>
                          </td>
                          <td className="px-4 py-2" colSpan={2}>
                            <div>
                              <div className="text-xs font-medium text-slate-700">{item.descripcion}</div>
                              {item.cuentasCosto && (
                                <div className="text-xs text-slate-500 mt-1">{item.cuentasCosto}</div>
                              )}
                              {item.glosa && (
                                <div className="text-xs text-slate-500 italic mt-1">{item.glosa}</div>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-2 text-center">
                            <span className="text-xs text-slate-600">
                              {item.cantidad} {item.unidad} × {formatCurrency(item.precioUnitario)}
                            </span>
                          </td>
                          <td className="px-4 py-2 text-right">
                            <span className="text-xs font-medium text-slate-700">{formatCurrency(item.subTotal)}</span>
                          </td>
                          <td className="px-4 py-2 text-right">
                            <span className="text-xs text-emerald-600">{formatCurrency(item.facturado)}</span>
                          </td>
                          <td className="px-4 py-2 text-right">
                            <div className="flex flex-col items-end gap-1">
                              <span className="text-xs text-violet-600">{item.saldoPorRecibir}</span>
                              <span className={`text-xs px-2 py-0.5 rounded-full ${
                                item.estadoLinea === 'Abierta' ? 'bg-emerald-100 text-emerald-700' :
                                item.estadoLinea === 'Cerrada' ? 'bg-slate-100 text-slate-700' :
                                'bg-amber-100 text-amber-700'
                              }`}>
                                {item.estadoLinea}
                              </span>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Footer con totales */}
        {!isLoading && filteredOrders.length > 0 && (
          <div className="bg-gradient-to-r from-violet-600 to-purple-600 text-white px-6 py-4">
            <div className="flex justify-between items-center">
              <div className="flex gap-8">
                <div>
                  <div className="text-xs text-violet-100">Total Órdenes</div>
                  <div className="text-xl font-bold">{stats.cantidadOCs}</div>
                </div>
                <div>
                  <div className="text-xs text-violet-100">Monto Total</div>
                  <div className="text-xl font-bold">{formatCurrency(stats.montoTotal)}</div>
                </div>
                <div>
                  <div className="text-xs text-violet-100">Facturado</div>
                  <div className="text-xl font-bold">{formatCurrency(stats.montoFacturado)}</div>
                </div>
                <div>
                  <div className="text-xs text-violet-100">Saldo Pendiente</div>
                  <div className="text-xl font-bold">{formatCurrency(stats.saldoPorRecibir)}</div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Componente StatCard
function StatCard({ label, value, icon, color }) {
  return (
    <div className="relative overflow-hidden rounded-xl bg-white border border-slate-200 p-6 hover:shadow-lg transition-shadow">
      <div className={`absolute top-0 right-0 w-24 h-24 bg-gradient-to-br ${color} opacity-10 rounded-full -mr-8 -mt-8`}></div>
      <div className="relative">
        <div className="flex items-center gap-3 mb-2">
          <span className="text-2xl">{icon}</span>
          <h3 className="text-sm font-bold text-slate-600 uppercase tracking-wide">{label}</h3>
        </div>
        <div className="text-2xl font-black text-slate-900">{value}</div>
      </div>
    </div>
  );
}
