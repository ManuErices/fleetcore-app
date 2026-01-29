import React, { useEffect, useState, useMemo } from "react";
import { listActiveProjects, saveRendiciones, deleteAllRendiciones } from "../lib/db";
import { collection, query, where, getDocs, writeBatch, doc, serverTimestamp } from "firebase/firestore";
import { db } from "../lib/firebase";
import * as XLSX from 'xlsx';

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

export default function Rendiciones() {
  const [projects, setProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  // Filtros de fecha - Rango flexible
  const [dateFrom, setDateFrom] = useState(addDays(isoToday(), -29)); // Últimos 30 días
  const [dateTo, setDateTo] = useState(isoToday());
  const [error, setError] = useState(null);

  // Datos
  const [rendiciones, setRendiciones] = useState([]);
  
  // Filtros adicionales
  const [searchTerm, setSearchTerm] = useState("");
  const [filterCuentaContable, setFilterCuentaContable] = useState("all");

  // Importador
  const [showImporter, setShowImporter] = useState(false);

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
      // Cargar TODAS las rendiciones del proyecto
      const q = query(
        collection(db, 'rendiciones'),
        where("projectId", "==", selectedProject)
      );
      const snap = await getDocs(q);
      const allData = snap.docs.map((d) => ({
        id: d.id,
        ...d.data()
      }));
      
      console.log(`📋 Total rendiciones en Firebase: ${allData.length}`);
      
      // Mostrar algunas fechas para debug
      const sampleDates = allData.slice(0, 5).map(r => ({
        num: r.numeroRendicionAsociada,
        fecha: r.fechaEmision,
        tipo: typeof r.fechaEmision
      }));
      console.log('📅 Muestra de fechas:', sampleDates);
      
      // Filtrar por rango de fechas
      const filteredData = allData.filter(item => {
        if (!item.fechaEmision) {
          console.log(`⚠️ Rendición sin fechaEmision: ${item.numeroRendicionAsociada}`);
          return false;
        }
        return item.fechaEmision >= dateFrom && item.fechaEmision <= dateTo;
      });
      
      // Contar rendiciones sin fecha
      const sinFecha = allData.filter(r => !r.fechaEmision).length;
      if (sinFecha > 0) {
        console.log(`⚠️ ${sinFecha} rendiciones sin fechaEmision (no se mostrarán)`);
      }
      
      // Mostrar tipos de documentos para debug
      const tiposDocumento = {};
      filteredData.forEach(r => {
        const tipo = r.tipoDocumento || 'Sin tipo';
        tiposDocumento[tipo] = (tiposDocumento[tipo] || 0) + 1;
      });
      console.log('📄 Tipos de documentos encontrados:', tiposDocumento);
      
      setRendiciones(filteredData);
      console.log(`📋 Cargadas ${filteredData.length} rendiciones entre ${dateFrom} y ${dateTo} (de ${allData.length} totales)`);
    } catch (err) {
      console.error("Error cargando rendiciones:", err);
      setError("Error al cargar las rendiciones");
    } finally {
      setIsLoading(false);
    }
  };

  const getCuentaContableCompleta = (item) => {
    const codigo = item.codigoCuentaContable || '';
    const nombre = item.cuentaContable || '';
    if (codigo && nombre) {
      return `${codigo} ${nombre}`;
    }
    return nombre || codigo || '';
  };

  // Agrupar por N° Rendición Asociada
  const rendicionesAgrupadas = useMemo(() => {
    const grupos = {};
    
    rendiciones.forEach(r => {
      const numeroRendicion = r.numeroRendicionAsociada || 'SIN-RENDICION';
      
      if (!grupos[numeroRendicion]) {
        grupos[numeroRendicion] = {
          numeroRendicion,
          nombreRendicion: r.nombreRendicionAsociada || 'Sin nombre',
          items: [],
          totalMonto: 0,
          propietario: r.propietario || '',
          fechaEmision: r.fechaEmision || '',
        };
      }
      
      grupos[numeroRendicion].items.push(r);
      grupos[numeroRendicion].totalMonto += Number(r.montoAprobado) || 0;
    });

    // Convertir a array y ordenar por fecha
    const gruposArray = Object.values(grupos);
    gruposArray.sort((a, b) => {
      if (!a.fechaEmision) return 1;
      if (!b.fechaEmision) return -1;
      return b.fechaEmision.localeCompare(a.fechaEmision);
    });

    return gruposArray;
  }, [rendiciones]);

  // Filtrar grupos
  const gruposFiltrados = useMemo(() => {
    return rendicionesAgrupadas.filter(grupo => {
      // Filtro por búsqueda
      if (searchTerm) {
        const searchLower = searchTerm.toLowerCase();
        const matchesGroup = 
          grupo.numeroRendicion?.toLowerCase().includes(searchLower) ||
          grupo.nombreRendicion?.toLowerCase().includes(searchLower) ||
          grupo.propietario?.toLowerCase().includes(searchLower);
        
        const matchesItem = grupo.items.some(item =>
          item.nombreGasto?.toLowerCase().includes(searchLower) ||
          item.proveedor?.toLowerCase().includes(searchLower) ||
          getCuentaContableCompleta(item).toLowerCase().includes(searchLower)
        );

        if (!matchesGroup && !matchesItem) return false;
      }

      // Filtro por cuenta contable
      if (filterCuentaContable !== "all") {
        const hasCuenta = grupo.items.some(item => 
          getCuentaContableCompleta(item) === filterCuentaContable
        );
        if (!hasCuenta) return false;
      }

      return true;
    });
  }, [rendicionesAgrupadas, searchTerm, filterCuentaContable]);

  // Estadísticas
  const stats = useMemo(() => {
    const total = gruposFiltrados.reduce((sum, g) => sum + g.totalMonto, 0);
    const cantidadRendiciones = gruposFiltrados.length;
    const cantidadGastos = gruposFiltrados.reduce((sum, g) => sum + g.items.length, 0);
    
    const porCuentaContable = {};
    gruposFiltrados.forEach(grupo => {
      grupo.items.forEach(item => {
        const cuenta = getCuentaContableCompleta(item) || 'Sin cuenta contable';
        if (!porCuentaContable[cuenta]) porCuentaContable[cuenta] = 0;
        porCuentaContable[cuenta] += Number(item.montoAprobado) || 0;
      });
    });

    return {
      total: Math.round(total),
      cantidadRendiciones,
      cantidadGastos,
      porCuentaContable
    };
  }, [gruposFiltrados]);

  // Lista única de cuentas contables para el filtro
  const cuentasContables = useMemo(() => {
    const cuentas = new Set();
    rendiciones.forEach(r => {
      const cuenta = getCuentaContableCompleta(r);
      if (cuenta) cuentas.add(cuenta);
    });
    return Array.from(cuentas).sort();
  }, [rendiciones]);

  const categorias = useMemo(() => {
    const cats = new Set(rendiciones.map(r => r.categoria).filter(Boolean));
    return Array.from(cats);
  }, [rendiciones]);

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      setIsLoading(true);
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      // IMPORTANTE: raw: true para mantener tipos de datos (fechas, números, tildes)
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { raw: true });

      // Helper para convertir fechas de Excel
      const formatExcelDate = (value) => {
        if (!value) return '';
        
        // Si es un objeto Date
        if (value instanceof Date) {
          return value.toISOString().split('T')[0];
        }
        
        // Si es un número (serial de Excel)
        if (typeof value === 'number') {
          const excelEpoch = new Date(1899, 11, 30);
          const date = new Date(excelEpoch.getTime() + value * 86400000);
          return date.toISOString().split('T')[0];
        }
        
        // Si es string, intentar diferentes formatos
        if (typeof value === 'string') {
          // Formato DD-MM-YYYY (ej: "30-12-2025")
          const ddmmyyyyMatch = value.match(/^(\d{1,2})-(\d{1,2})-(\d{4})/);
          if (ddmmyyyyMatch) {
            const [, day, month, year] = ddmmyyyyMatch;
            return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
          }
          
          // Formato DD/MM/YYYY (ej: "30/12/2025")
          const ddmmyyyySlashMatch = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
          if (ddmmyyyySlashMatch) {
            const [, day, month, year] = ddmmyyyySlashMatch;
            return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
          }
          
          // Intentar parsear como fecha estándar
          const parsed = new Date(value);
          if (!isNaN(parsed.getTime())) {
            return parsed.toISOString().split('T')[0];
          }
        }
        
        return String(value);
      };

      // Mapear datos del Excel
      const rendicionesImportadas = jsonData.map(row => {
        // Buscar la columna de fecha con diferentes variaciones
        const fechaEmisionRaw = 
          row['Fecha de Emisión'] || 
          row['Fecha de Emision'] || 
          row['Fecha Emisión'] || 
          row['Fecha Emision'] ||
          row['fecha de emisión'] ||
          row['FECHA DE EMISIÓN'] ||
          '';
        
        const fechaAprobacionRaw = 
          row['Fecha de Aprobación'] || 
          row['Fecha de Aprobacion'] ||
          row['Fecha Aprobación'] ||
          row['Fecha Aprobacion'] ||
          '';
        
        return {
          propietario: String(row['Propietario del Gasto'] || ''),
          nombreGasto: String(row['Nombre del Gasto'] || ''),
          estadoGasto: String(row['Estado del Gasto'] || ''),
          tipoDocumento: String(row['Tipo de Documento'] || ''),
          numeroDocumento: String(row['Numero de Documento'] || ''),
          fechaEmision: formatExcelDate(fechaEmisionRaw),
          fechaAprobacion: formatExcelDate(fechaAprobacionRaw),
          rutProveedor: String(row['Rut Proveedor'] || ''),
          proveedor: String(row['Nombre Proveedor'] || ''),
          montoSolicitado: Number(row['Monto Solicitado']) || 0,
          montoAprobado: Number(row['Monto Aprobado']) || 0,
          codigoUnidadRendicion: String(row['Código Unidad de Rendición'] || ''),
          unidadRendicion: String(row['Nombre Unidad de Rendición'] || ''),
          categoria: String(row['Categoría'] || ''),
          subcategoria: String(row['Subcategoría'] || ''),
          rutUsuario: String(row['Rut Usuario'] || ''),
          codigoCuentaContable: String(row['Código Cuenta Contable'] || ''),
          cuentaContable: String(row['Cuenta Contable'] || ''),
          numeroRendicionAsociada: String(row['N° Rendición Asociada'] || ''),
          nombreRendicionAsociada: String(row['Nombre Rendición Asociada'] || ''),
          estadoRendicionAsociada: String(row['Estado Rendición Asociada'] || ''),
          estadoDTE: String(row['Estado DTE'] || ''),
          projectId: selectedProject
          // NO guardamos year/month porque vamos a filtrar por fechaEmision
          // NO importamos 'Fondo' - usamos 'Propietario del Gasto' en su lugar
        };
      });
      
      // Log para debug
      console.log('📅 Primera rendición importada:', {
        nombreGasto: rendicionesImportadas[0]?.nombreGasto,
        propietario: rendicionesImportadas[0]?.propietario,
        fechaEmision: rendicionesImportadas[0]?.fechaEmision,
        tipo: typeof rendicionesImportadas[0]?.fechaEmision
      });

      // Guardar en Firebase (sin eliminar datos previos)
      // Solo agregar las nuevas rendiciones
      const batch = writeBatch(db);
      rendicionesImportadas.forEach(rendicion => {
        const docRef = doc(collection(db, 'rendiciones'));
        batch.set(docRef, {
          ...rendicion,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      });
      await batch.commit();
      
      // Recargar
      await loadData();
      setShowImporter(false);
      alert(`✅ ${rendicionesImportadas.length} rendiciones importadas correctamente`);
    } catch (error) {
      console.error("Error importando Excel:", error);
      alert("❌ Error al importar el archivo: " + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteAll = async () => {
    if (!confirm(`¿Estás seguro de eliminar todas las ${rendiciones.length} rendiciones del rango seleccionado?`)) {
      return;
    }

    try {
      setIsLoading(true);
      // Eliminar solo las rendiciones del rango actual
      const batch = writeBatch(db);
      rendiciones.forEach(r => {
        if (r.id) {
          batch.delete(doc(db, 'rendiciones', r.id));
        }
      });
      await batch.commit();
      await loadData();
      alert("✅ Rendiciones eliminadas correctamente");
    } catch (error) {
      console.error("Error eliminando rendiciones:", error);
      alert("❌ Error al eliminar: " + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleGroup = (numeroRendicion) => {
    const newExpanded = new Set(expandedGroups);
    if (newExpanded.has(numeroRendicion)) {
      newExpanded.delete(numeroRendicion);
    } else {
      newExpanded.add(numeroRendicion);
    }
    setExpandedGroups(newExpanded);
  };

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('es-CL', {
      style: 'currency',
      currency: 'CLP',
      minimumFractionDigits: 0
    }).format(value || 0);
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="glass-card rounded-2xl p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-600 to-pink-600 flex items-center justify-center shadow-lg">
              <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
              </svg>
            </div>
            <div>
              <h1 className="text-3xl font-black text-slate-900 tracking-tight">
                Rendiciones
              </h1>
              <p className="text-slate-600 mt-1 text-sm">
                Gestión de gastos y reembolsos con rango flexible
              </p>
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
              className="input-modern"
              disabled={isLoading}
            >
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
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

            {/* Botones rápidos */}
            <div className="flex gap-2 lg:items-end">
              <button
                onClick={() => setPreset(7)}
                className="px-4 py-2 text-sm font-semibold text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200 rounded-xl transition-all disabled:opacity-50"
                disabled={isLoading}
              >
                7 días
              </button>
              <button
                onClick={setWeek}
                className="px-4 py-2 text-sm font-semibold text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200 rounded-xl transition-all disabled:opacity-50"
                disabled={isLoading}
              >
                Semana
              </button>
              <button
                onClick={setMonth}
                className="px-4 py-2 text-sm font-semibold text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200 rounded-xl transition-all disabled:opacity-50"
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
            <div className="flex items-center gap-2 text-purple-700">
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

        {/* Importador */}
        {showImporter && (
          <div className="mt-6 p-6 bg-gradient-to-r from-purple-50 to-pink-50 rounded-xl border-2 border-purple-200">
            <h3 className="text-lg font-bold text-slate-900 mb-4">Importar Rendiciones desde Excel</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Selecciona el archivo Excel
                </label>
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={handleFileUpload}
                  className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-purple-600 file:text-white hover:file:bg-purple-700 cursor-pointer"
                />
              </div>

              <div className="text-sm text-slate-600">
                <p className="font-semibold mb-2">📋 Columnas esperadas:</p>
                <ul className="list-disc list-inside space-y-1 text-xs">
                  <li><strong>Propietario del Gasto</strong></li>
                  <li><strong>Nombre del Gasto</strong></li>
                  <li><strong>Fecha de Emisión</strong></li>
                  <li><strong>Monto Aprobado</strong></li>
                  <li><strong>Nombre Proveedor</strong></li>
                  <li><strong>N° Rendición Asociada</strong></li>
                  <li>Y más... (27 columnas en total)</li>
                </ul>
              </div>

              {rendiciones.length > 0 && (
                <div className="pt-4 border-t border-purple-200">
                  <button
                    onClick={handleDeleteAll}
                    className="text-sm text-red-600 hover:text-red-700 font-semibold"
                  >
                    🗑️ Eliminar todas las rendiciones del mes
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="grid lg:grid-cols-4 gap-6">
        <StatCard
          label="Total Gastos"
          value={formatCurrency(stats.total)}
          icon="💰"
          color="from-purple-500 to-pink-500"
        />
        <StatCard
          label="N° Rendiciones"
          value={stats.cantidadRendiciones}
          icon="📋"
          color="from-blue-500 to-cyan-500"
        />
        <StatCard
          label="Total Gastos"
          value={stats.cantidadGastos}
          icon="🧾"
          color="from-emerald-500 to-teal-500"
        />
        <StatCard
          label="Promedio/Rend."
          value={stats.cantidadRendiciones > 0 ? formatCurrency(stats.total / stats.cantidadRendiciones) : '$0'}
          icon="📊"
          color="from-amber-500 to-orange-500"
        />
      </div>

      {/* Filtros */}
      <div className="glass-card rounded-2xl p-6">
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">
              Buscar
            </label>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por N° rendición, propietario, gasto, cuenta contable..."
              className="input-modern w-full"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">
              Cuenta Contable
            </label>
            <select
              value={filterCuentaContable}
              onChange={(e) => setFilterCuentaContable(e.target.value)}
              className="input-modern w-full"
            >
              <option value="all">Todas las cuentas</option>
              {cuentasContables.map(cuenta => (
                <option key={cuenta} value={cuenta}>{cuenta}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Resumen por Cuenta Contable */}
      {Object.keys(stats.porCuentaContable).length > 0 && (
        <div className="glass-card rounded-2xl p-6">
          <h3 className="text-lg font-bold text-slate-900 mb-4">Resumen por Cuenta Contable</h3>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Object.entries(stats.porCuentaContable)
              .sort(([, a], [, b]) => b - a)
              .map(([cuenta, monto]) => (
                <div key={cuenta} className="flex items-center justify-between p-3 bg-purple-50 rounded-lg">
                  <span className="text-sm font-semibold text-slate-700">{cuenta}</span>
                  <span className="text-sm font-bold text-purple-600">{formatCurrency(monto)}</span>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Tabla de Rendiciones Agrupadas */}
      <div className="glass-card rounded-2xl overflow-hidden">
        {isLoading ? (
          <div className="p-12">
            <div className="flex flex-col items-center justify-center gap-4">
              <div className="spinner w-12 h-12 border-purple-600" />
              <p className="text-slate-600 font-semibold">Cargando rendiciones...</p>
            </div>
          </div>
        ) : gruposFiltrados.length === 0 ? (
          <div className="p-12 text-center">
            <div className="text-6xl mb-4">📋</div>
            <p className="text-lg font-semibold text-slate-900 mb-2">
              No hay rendiciones
            </p>
            <p className="text-slate-600">
              Importa un archivo Excel para comenzar
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gradient-to-r from-purple-600 to-pink-600 text-white">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-bold uppercase w-12"></th>
                  <th className="px-4 py-3 text-left text-xs font-bold uppercase">Fecha</th>
                  <th className="px-4 py-3 text-left text-xs font-bold uppercase">N° Rendición</th>
                  <th className="px-4 py-3 text-left text-xs font-bold uppercase">Propietario</th>
                  <th className="px-4 py-3 text-left text-xs font-bold uppercase">Nombre Gasto / Proveedor</th>
                  <th className="px-4 py-3 text-left text-xs font-bold uppercase">Cuenta Contable</th>
                  <th className="px-4 py-3 text-right text-xs font-bold uppercase">Monto</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {gruposFiltrados.map((grupo) => {
                  const isExpanded = expandedGroups.has(grupo.numeroRendicion);
                  
                  return (
                    <React.Fragment key={grupo.numeroRendicion}>
                      {/* Fila de Grupo (Resumen) */}
                      <tr className="bg-purple-50 hover:bg-purple-100 transition-colors cursor-pointer font-semibold">
                        <td className="px-4 py-4" onClick={() => toggleGroup(grupo.numeroRendicion)}>
                          <button className="p-1 hover:bg-purple-200 rounded transition-colors">
                            {isExpanded ? (
                              <svg className="w-5 h-5 text-purple-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                              </svg>
                            ) : (
                              <svg className="w-5 h-5 text-purple-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                              </svg>
                            )}
                          </button>
                        </td>
                        <td className="px-4 py-4 text-sm text-slate-700">{grupo.fechaEmision}</td>
                        <td className="px-4 py-4 text-sm font-bold text-purple-900">{grupo.numeroRendicion}</td>
                        <td className="px-4 py-4 text-sm text-slate-900">{grupo.propietario}</td>
                        <td className="px-4 py-4 text-sm text-slate-700">
                          {grupo.nombreRendicion}
                          <div className="text-xs text-slate-500 mt-1">
                            {grupo.items.length} {grupo.items.length === 1 ? 'gasto' : 'gastos'}
                          </div>
                        </td>
                        <td className="px-4 py-4 text-sm text-slate-600">
                          {grupo.items.length > 1 ? 'Múltiples' : getCuentaContableCompleta(grupo.items[0])}
                        </td>
                        <td className="px-4 py-4 text-sm font-black text-right text-purple-900">
                          {formatCurrency(grupo.totalMonto)}
                        </td>
                      </tr>

                      {/* Filas de Detalle (expandibles) */}
                      {isExpanded && grupo.items.map((item, idx) => (
                        <tr key={idx} className="bg-white hover:bg-slate-50 transition-colors">
                          <td className="px-4 py-3"></td>
                          <td className="px-4 py-3 text-xs text-slate-500">{item.fechaEmision}</td>
                          <td className="px-4 py-3 text-xs text-slate-400">↳ Detalle</td>
                          <td className="px-4 py-3 text-sm text-slate-700">{item.propietario}</td>
                          <td className="px-4 py-3">
                            <div className="text-sm font-semibold text-slate-900">{item.nombreGasto}</div>
                            <div className="text-xs text-slate-500">{item.proveedor}</div>
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-600">
                            {getCuentaContableCompleta(item)}
                          </td>
                          <td className="px-4 py-3 text-sm font-bold text-right text-slate-900">
                            {formatCurrency(item.montoAprobado)}
                          </td>
                        </tr>
                      ))}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, icon, color }) {
  return (
    <div className="glass-card rounded-xl p-6 hover:shadow-xl transition-shadow">
      <div className="flex items-center gap-4">
        <div className={`w-12 h-12 rounded-lg bg-gradient-to-br ${color} flex items-center justify-center text-2xl shadow-lg`}>
          {icon}
        </div>
        <div>
          <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">{label}</p>
          <p className="text-2xl font-black text-slate-900">{value}</p>
        </div>
      </div>
    </div>
  );
}
