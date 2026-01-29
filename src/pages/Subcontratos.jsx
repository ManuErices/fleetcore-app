import React, { useEffect, useState, useMemo } from "react";
import { listActiveProjects, saveSubcontratos, deleteAllSubcontratos } from "../lib/db";
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

export default function Subcontratos() {
  const [projects, setProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  // Filtros de fecha - Rango flexible
  const [dateFrom, setDateFrom] = useState(addDays(isoToday(), -29)); // Últimos 30 días
  const [dateTo, setDateTo] = useState(isoToday());
  const [error, setError] = useState(null);

  // Datos
  const [subcontratos, setSubcontratos] = useState([]);
  
  // Filtros adicionales
  const [searchTerm, setSearchTerm] = useState("");
  const [filterCuentaCosto, setFilterCuentaCosto] = useState("all");

  // Importador
  const [showImporter, setShowImporter] = useState(false);

  // Estado de expansión de grupos
  const [expandedGroups, setExpandedGroups] = useState(new Set());
  
  // Estado para edición de mes asociado
  const [editingMesAsociado, setEditingMesAsociado] = useState(null); // { itemId, mes, año }
  const [savingMesAsociado, setSavingMesAsociado] = useState(false);

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
      // Cargar TODOS los subcontratos del proyecto
      const q = query(
        collection(db, 'subcontratos'),
        where("projectId", "==", selectedProject)
      );
      const snap = await getDocs(q);
      const allData = snap.docs.map((d) => ({
        id: d.id,
        ...d.data()
      }));
      
      // Filtrar por rango de fechas basado en fechaEP para mostrar
      const filteredData = allData.filter(item => {
        if (!item.fechaEP) return false;
        return item.fechaEP >= dateFrom && item.fechaEP <= dateTo;
      });
      
      setSubcontratos(filteredData);
      console.log(`📦 Cargados ${filteredData.length} subcontratos entre ${dateFrom} y ${dateTo} (de ${allData.length} totales)`);
    } catch (err) {
      console.error("Error cargando subcontratos:", err);
      setError("Error al cargar los subcontratos");
    } finally {
      setIsLoading(false);
    }
  };

  const getCuentaCostoCompleta = (item) => {
    const codigo = item.codigoCuentaCosto || '';
    const nombre = item.descripcionCuentaCosto || '';
    if (codigo && nombre) {
      return `${codigo} ${nombre}`;
    }
    return nombre || codigo || '';
  };

  // Agrupar por Número SC
  const subcontratosAgrupados = useMemo(() => {
    const grupos = {};
    
    // Agrupar subcontratos
    subcontratos.forEach(s => {
      const numeroSC = s.numeroSC || 'SIN-SC';
      
      if (!grupos[numeroSC]) {
        grupos[numeroSC] = {
          numeroSC,
          nombreSC: s.nombreSC || '',
          razonSocialSubcontratista: s.razonSocialSubcontratista || '',
          rutSubcontratista: s.rutSubcontratista || '',
          items: [],
          totalPagado: 0,
          saldoPorPagar: 0,
          fechaEP: s.fechaEP || '',
        };
      }
      
      grupos[numeroSC].items.push(s);
      grupos[numeroSC].totalPagado += Number(s.totalPagoNeto) || 0;
      grupos[numeroSC].saldoPorPagar = Number(s.saldoPorPagarSC) || 0;
    });

    // Convertir a array y ordenar por total pagado
    const gruposArray = Object.values(grupos);
    gruposArray.sort((a, b) => b.totalPagado - a.totalPagado);

    // Ordenar items por N° EP y marcar duplicados
    gruposArray.forEach(grupo => {
      grupo.items.sort((a, b) => {
        const epA = a.numeroEP || '';
        const epB = b.numeroEP || '';
        
        const partsA = epA.split(/[-_]/);
        const partsB = epB.split(/[-_]/);
        
        for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
          const partA = partsA[i] || '';
          const partB = partsB[i] || '';
          
          const numA = parseInt(partA);
          const numB = parseInt(partB);
          
          if (!isNaN(numA) && !isNaN(numB)) {
            if (numA !== numB) return numA - numB;
          } else {
            if (partA !== partB) return partA.localeCompare(partB);
          }
        }
        
        if (!a.fechaEP) return 1;
        if (!b.fechaEP) return -1;
        return a.fechaEP.localeCompare(b.fechaEP);
      });
      
      // Detectar EPs duplicados
      const conteoEPs = {};
      grupo.items.forEach(item => {
        const ep = item.numeroEP || '';
        conteoEPs[ep] = (conteoEPs[ep] || 0) + 1;
      });
      
      grupo.items.forEach(item => {
        const ep = item.numeroEP || '';
        item.esLineaDuplicada = conteoEPs[ep] > 1;
        // El mes asociado viene solo de la edición manual
        item.mesAsociado = item.mesAsociadoManual || '';
      });
    });

    return gruposArray;
  }, [subcontratos]);

  // Filtrar grupos
  const gruposFiltrados = useMemo(() => {
    return subcontratosAgrupados.filter(grupo => {
      // Filtro por búsqueda
      if (searchTerm) {
        const searchLower = searchTerm.toLowerCase();
        const matchesGroup = 
          grupo.numeroSC?.toLowerCase().includes(searchLower) ||
          grupo.nombreSC?.toLowerCase().includes(searchLower) ||
          grupo.razonSocialSubcontratista?.toLowerCase().includes(searchLower) ||
          grupo.rutSubcontratista?.toLowerCase().includes(searchLower);
        
        const matchesItem = grupo.items.some(item =>
          item.descripcionLinea?.toLowerCase().includes(searchLower) ||
          item.numeroEP?.toLowerCase().includes(searchLower) ||
          item.numeroFactura?.toLowerCase().includes(searchLower) ||
          getCuentaCostoCompleta(item).toLowerCase().includes(searchLower)
        );

        if (!matchesGroup && !matchesItem) return false;
      }

      // Filtro por cuenta de costo
      if (filterCuentaCosto !== "all") {
        const hasCuenta = grupo.items.some(item => 
          getCuentaCostoCompleta(item) === filterCuentaCosto
        );
        if (!hasCuenta) return false;
      }

      return true;
    });
  }, [subcontratosAgrupados, searchTerm, filterCuentaCosto]);

  // Estadísticas
  const stats = useMemo(() => {
    const totalPagado = gruposFiltrados.reduce((sum, g) => sum + g.totalPagado, 0);
    const totalSaldo = gruposFiltrados.reduce((sum, g) => sum + g.saldoPorPagar, 0);
    const cantidadSC = gruposFiltrados.length;
    const cantidadEP = gruposFiltrados.reduce((sum, g) => sum + g.items.length, 0);
    
    const porCuentaCosto = {};
    gruposFiltrados.forEach(grupo => {
      grupo.items.forEach(item => {
        const cuenta = getCuentaCostoCompleta(item) || 'Sin cuenta';
        if (!porCuentaCosto[cuenta]) porCuentaCosto[cuenta] = 0;
        porCuentaCosto[cuenta] += Number(item.totalPagoNeto) || 0;
      });
    });

    return {
      totalPagado: Math.round(totalPagado),
      totalSaldo: Math.round(totalSaldo),
      cantidadSC,
      cantidadEP,
      porCuentaCosto
    };
  }, [gruposFiltrados]);

  const cuentasCosto = useMemo(() => {
    const cuentas = new Set();
    subcontratos.forEach(s => {
      const cuenta = getCuentaCostoCompleta(s);
      if (cuenta) cuentas.add(cuenta);
    });
    return Array.from(cuentas).sort();
  }, [subcontratos]);

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
        
        // Si es string, intentar parsearlo
        if (typeof value === 'string') {
          const parsed = new Date(value);
          if (!isNaN(parsed.getTime())) {
            return parsed.toISOString().split('T')[0];
          }
        }
        
        return String(value);
      };

      // Mapear datos del Excel
      const subcontratosImportados = jsonData.map(row => ({
        centroGestion: String(row['Centro Gestión'] || ''),
        codigoCuentaCosto: String(row['Codigo Cuenta Costo'] || ''),
        descripcionCuentaCosto: String(row['Descripción Cuenta Costo'] || ''),
        numeroSC: String(row['Número SC'] || ''),
        monedaSC: String(row['Moneda SC'] || ''),
        tasaCambioSC: Number(row['Tasa Cambio SC']) || 0,
        nombreSC: String(row['Nombre SC'] || ''),
        rutSubcontratista: String(row['<translate>lblRUT</translate> Subcontratita'] || ''),
        razonSocialSubcontratista: String(row['Razón Social Subcontratita'] || ''),
        numeroLineaSC: String(row['N° Linea SC'] || ''),
        descripcionLinea: String(row['Descripción Linea'] || ''),
        cantidadOriginal: Number(row['Cantidad Original']) || 0,
        cantidadCorregida: Number(row['Cantidad Corregida']) || 0,
        precioUnitario: Number(row['Precio Unitario']) || 0,
        precioTotal: Number(row['Precio Total']) || 0,
        numeroEP: String(row['Número EP'] || ''),
        tipoEP: String(row['Tipo EP'] || ''),
        fechaEP: formatExcelDate(row['Fecha EP']),
        cantidadEP: Number(row['Cantidad EP']) || 0,
        tasaCambioEP: Number(row['Tasa Cambio EP']) || 0,
        montoEP: Number(row['Monto EP']) || 0,
        devolucionAnticipo: Number(row['Devolución Anticipo']) || 0,
        saldoAnticipoDevolver: Number(row['Saldo Anticipo por Devolver']) || 0,
        saldoRetencion: Number(row['Saldo Retención']) || 0,
        retenciones: Number(row['Retenciones']) || 0,
        descuentoSinIva: Number(row['Descuento Sin Iva']) || 0,
        totalPagoNeto: Number(row['Total Pago Neto']) || 0,
        saldoPorPagarSC: Number(row['Saldo por Pagar SC']) || 0,
        estadoDocumento: String(row['Estado Documento'] || ''),
        asociadoFactura: String(row['Asociado a Factura'] || ''),
        montoAsociadoFactura: Number(row['Monto Asociado a Factura']) || 0,
        numeroFactura: String(row['N° de Factura'] || ''),
        projectId: selectedProject
        // NO guardamos year/month porque vamos a filtrar por fechaEP
      }));

      // Guardar en Firebase (sin eliminar datos previos)
      // Solo agregar los nuevos subcontratos
      const batch = writeBatch(db);
      subcontratosImportados.forEach(subcontrato => {
        const docRef = doc(collection(db, 'subcontratos'));
        batch.set(docRef, {
          ...subcontrato,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      });
      await batch.commit();
      
      // Recargar
      await loadData();
      setShowImporter(false);
      alert(`✅ ${subcontratosImportados.length} registros de subcontratos importados correctamente`);
    } catch (error) {
      console.error("Error importando Excel:", error);
      alert("❌ Error al importar el archivo: " + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteAll = async () => {
    if (!confirm(`¿Estás seguro de eliminar todos los ${subcontratos.length} subcontratos del rango seleccionado?`)) {
      return;
    }

    try {
      setIsLoading(true);
      // Eliminar solo los subcontratos del rango actual
      const batch = writeBatch(db);
      subcontratos.forEach(s => {
        if (s.id) {
          batch.delete(doc(db, 'subcontratos', s.id));
        }
      });
      await batch.commit();
      await loadData();
      alert("✅ Subcontratos eliminados correctamente");
    } catch (error) {
      console.error("Error eliminando subcontratos:", error);
      alert("❌ Error al eliminar: " + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleGroup = (numeroSC) => {
    const newExpanded = new Set(expandedGroups);
    if (newExpanded.has(numeroSC)) {
      newExpanded.delete(numeroSC);
    } else {
      newExpanded.add(numeroSC);
    }
    setExpandedGroups(newExpanded);
  };

  // Funciones para editar mes asociado manualmente
  const meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 
                 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  
  const handleSaveMesAsociado = async (itemId, mes, año) => {
    if (!mes || !año) {
      alert('Selecciona un mes y un año');
      return;
    }

    const mesAsociado = `${mes} ${año}`;
    
    setSavingMesAsociado(true);
    try {
      const docRef = doc(db, 'subcontratos', itemId);
      const { updateDoc } = await import('firebase/firestore');
      
      await updateDoc(docRef, {
        mesAsociadoManual: mesAsociado,
        mesAsociadoManualModificado: new Date().toISOString()
      });
      
      // Recargar datos
      await loadData();
      setEditingMesAsociado(null);
      
      console.log(`✅ Mes asociado guardado: ${mesAsociado}`);
    } catch (err) {
      console.error('Error guardando mes asociado:', err);
      alert('Error al guardar el mes asociado');
    } finally {
      setSavingMesAsociado(false);
    }
  };
  
  const parseMesAsociado = (mesAsociado) => {
    if (!mesAsociado) return { mes: '', año: new Date().getFullYear() };
    
    const partes = mesAsociado.split(' ');
    const mes = partes[0] || '';
    const año = parseInt(partes[1]) || new Date().getFullYear();
    
    return { mes, año };
  };

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('es-CL', {
      style: 'currency',
      currency: 'CLP',
      minimumFractionDigits: 0
    }).format(value || 0);
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="glass-card rounded-2xl p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-teal-600 to-cyan-600 flex items-center justify-center shadow-lg">
              <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
            <div>
              <h1 className="text-3xl font-black text-slate-900 tracking-tight">
                Subcontratos
              </h1>
              <p className="text-slate-600 mt-1 text-sm">
                Estados de Pago (EP) con rango flexible
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
                className="px-4 py-2 text-sm font-semibold text-teal-700 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-xl transition-all disabled:opacity-50"
                disabled={isLoading}
              >
                7 días
              </button>
              <button
                onClick={setWeek}
                className="px-4 py-2 text-sm font-semibold text-teal-700 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-xl transition-all disabled:opacity-50"
                disabled={isLoading}
              >
                Semana
              </button>
              <button
                onClick={setMonth}
                className="px-4 py-2 text-sm font-semibold text-teal-700 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-xl transition-all disabled:opacity-50"
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
            <div className="flex items-center gap-2 text-teal-700">
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
          <div className="mt-6 p-6 bg-gradient-to-r from-teal-50 to-cyan-50 rounded-xl border-2 border-teal-200">
            <h3 className="text-lg font-bold text-slate-900 mb-4">Importar Subcontratos desde Excel</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Selecciona el archivo Excel
                </label>
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={handleFileUpload}
                  className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-teal-600 file:text-white hover:file:bg-teal-700 cursor-pointer"
                />
              </div>

              <div className="text-sm text-slate-600">
                <p className="font-semibold mb-2">📋 Columnas esperadas (32 columnas):</p>
                <ul className="list-disc list-inside space-y-1 text-xs">
                  <li><strong>Número SC</strong> - Número del subcontrato</li>
                  <li><strong>Nombre SC</strong> - Nombre/descripción del SC</li>
                  <li><strong>Razón Social Subcontratista</strong></li>
                  <li><strong>Número EP</strong> - Número de estado de pago</li>
                  <li><strong>Total Pago Neto</strong> - Monto del pago</li>
                  <li><strong>Cuenta de Costo</strong> - Código y descripción</li>
                  <li>Y 26 columnas más...</li>
                </ul>
              </div>

              {subcontratos.length > 0 && (
                <div className="pt-4 border-t border-teal-200">
                  <button
                    onClick={handleDeleteAll}
                    className="text-sm text-red-600 hover:text-red-700 font-semibold"
                  >
                    🗑️ Eliminar subcontratos del rango seleccionado ({subcontratos.length})
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="grid lg:grid-cols-3 gap-6">
        <StatCard
          label="Total Pago Neto"
          value={formatCurrency(stats.totalPagado)}
          icon="💰"
          color="from-teal-500 to-cyan-500"
        />
        <StatCard
          label="N° Subcontratos"
          value={stats.cantidadSC}
          icon="📋"
          color="from-blue-500 to-cyan-500"
        />
        <StatCard
          label="Estados de Pago"
          value={stats.cantidadEP}
          icon="🧾"
          color="from-emerald-500 to-teal-500"
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
              placeholder="Buscar por N° SC, subcontratista, EP, cuenta..."
              className="input-modern w-full"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">
              Cuenta de Costo
            </label>
            <select
              value={filterCuentaCosto}
              onChange={(e) => setFilterCuentaCosto(e.target.value)}
              className="input-modern w-full"
            >
              <option value="all">Todas las cuentas</option>
              {cuentasCosto.map(cuenta => (
                <option key={cuenta} value={cuenta}>{cuenta}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Resumen por Cuenta de Costo */}
      {Object.keys(stats.porCuentaCosto).length > 0 && (
        <div className="glass-card rounded-2xl p-6">
          <h3 className="text-lg font-bold text-slate-900 mb-4">Resumen por Cuenta de Costo</h3>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Object.entries(stats.porCuentaCosto)
              .sort(([, a], [, b]) => b - a)
              .map(([cuenta, monto]) => (
                <div key={cuenta} className="flex items-center justify-between p-3 bg-teal-50 rounded-lg">
                  <span className="text-sm font-semibold text-slate-700">{cuenta}</span>
                  <span className="text-sm font-bold text-teal-600">{formatCurrency(monto)}</span>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Tabla de Subcontratos Agrupados */}
      <div className="glass-card rounded-2xl overflow-hidden">
        {isLoading ? (
          <div className="p-12">
            <div className="flex flex-col items-center justify-center gap-4">
              <div className="spinner w-12 h-12 border-teal-600" />
              <p className="text-slate-600 font-semibold">Cargando subcontratos...</p>
            </div>
          </div>
        ) : gruposFiltrados.length === 0 ? (
          <div className="p-12 text-center">
            <div className="text-6xl mb-4">👥</div>
            <p className="text-lg font-semibold text-slate-900 mb-2">
              No hay subcontratos
            </p>
            <p className="text-slate-600">
              Importa un archivo Excel para comenzar
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gradient-to-r from-teal-600 to-cyan-600 text-white">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-bold uppercase w-12"></th>
                  <th className="px-4 py-3 text-left text-xs font-bold uppercase">N° SC</th>
                  <th className="px-4 py-3 text-left text-xs font-bold uppercase">Nombre SC</th>
                  <th className="px-4 py-3 text-left text-xs font-bold uppercase">Subcontratista</th>
                  <th className="px-4 py-3 text-left text-xs font-bold uppercase">N° EP / Descripción</th>
                  <th className="px-4 py-3 text-left text-xs font-bold uppercase">Cuenta de Costo</th>
                  <th className="px-4 py-3 text-left text-xs font-bold uppercase">Mes Asociado</th>
                  <th className="px-4 py-3 text-left text-xs font-bold uppercase">Fecha EP</th>
                  <th className="px-4 py-3 text-right text-xs font-bold uppercase">Pago Neto</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {gruposFiltrados.map((grupo) => {
                  const isExpanded = expandedGroups.has(grupo.numeroSC);
                  
                  return (
                    <React.Fragment key={grupo.numeroSC}>
                      {/* Fila de Grupo (Resumen) */}
                      <tr className="bg-teal-50 hover:bg-teal-100 transition-colors cursor-pointer font-semibold">
                        <td className="px-4 py-4" onClick={() => toggleGroup(grupo.numeroSC)}>
                          <button className="p-1 hover:bg-teal-200 rounded transition-colors">
                            {isExpanded ? (
                              <svg className="w-5 h-5 text-teal-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                              </svg>
                            ) : (
                              <svg className="w-5 h-5 text-teal-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                              </svg>
                            )}
                          </button>
                        </td>
                        <td className="px-4 py-4">
                          <div className="text-sm font-bold text-teal-900">{grupo.numeroSC}</div>
                        </td>
                        <td className="px-4 py-4">
                          <div className="text-sm font-semibold text-slate-900">{grupo.nombreSC}</div>
                          <div className="text-xs text-slate-500">{grupo.items.length} {grupo.items.length === 1 ? 'EP' : 'EPs'}</div>
                        </td>
                        <td className="px-4 py-4">
                          <div className="text-sm font-semibold text-slate-900">{grupo.razonSocialSubcontratista}</div>
                          <div className="text-xs text-slate-500">{grupo.rutSubcontratista}</div>
                        </td>
                        <td className="px-4 py-4 text-sm text-slate-600">
                          Múltiples
                        </td>
                        <td className="px-4 py-4 text-sm text-slate-600">
                          {grupo.items.length > 1 ? 'Múltiples' : getCuentaCostoCompleta(grupo.items[0])}
                        </td>
                        <td className="px-4 py-4">
                          {grupo.items.length === 1 ? (
                            <div className="text-sm font-semibold text-slate-900">{grupo.items[0].mesAsociado}</div>
                          ) : (
                            <div className="text-sm text-slate-600">
                              {grupo.items[0].mesAsociado}
                              <span className="text-xs text-slate-400 ml-1">→ {grupo.items[grupo.items.length - 1].mesAsociado}</span>
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-4 text-sm text-slate-700">{grupo.fechaEP}</td>
                        <td className="px-4 py-4 text-sm font-black text-right text-teal-900">
                          {formatCurrency(grupo.totalPagado)}
                        </td>
                      </tr>

                      {/* Filas de Detalle (expandibles) */}
                      {isExpanded && grupo.items.map((item, idx) => (
                        <tr key={idx} className="bg-white hover:bg-slate-50 transition-colors">
                          <td className="px-4 py-3"></td>
                          <td className="px-4 py-3 text-xs text-slate-400">↳ Línea {item.numeroLineaSC}</td>
                          <td className="px-4 py-3 text-xs text-slate-500">
                            {item.nombreSC}
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-500">
                            {item.razonSocialSubcontratista}
                          </td>
                          <td className="px-4 py-3">
                            <div className="text-sm font-semibold text-slate-900">{item.numeroEP}</div>
                            <div className="text-xs text-slate-500">{item.descripcionLinea}</div>
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-600">
                            {getCuentaCostoCompleta(item)}
                          </td>
                          <td className="px-4 py-3">
                            {editingMesAsociado?.itemId === item.id ? (
                              // Modo edición con selectores
                              <div className="flex items-center gap-2">
                                <select
                                  value={editingMesAsociado.mes}
                                  onChange={(e) => setEditingMesAsociado({
                                    ...editingMesAsociado,
                                    mes: e.target.value
                                  })}
                                  className="px-2 py-1 text-xs border-2 border-purple-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                                  disabled={savingMesAsociado}
                                  autoFocus
                                >
                                  <option value="">Mes...</option>
                                  {meses.map(m => (
                                    <option key={m} value={m}>{m}</option>
                                  ))}
                                </select>
                                
                                <select
                                  value={editingMesAsociado.año}
                                  onChange={(e) => setEditingMesAsociado({
                                    ...editingMesAsociado,
                                    año: e.target.value
                                  })}
                                  className="px-2 py-1 text-xs border-2 border-purple-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 w-20"
                                  disabled={savingMesAsociado}
                                >
                                  {Array.from({ length: 10 }, (_, i) => {
                                    const año = new Date().getFullYear() - 2 + i;
                                    return <option key={año} value={año}>{año}</option>;
                                  })}
                                </select>
                                
                                <button
                                  onClick={() => handleSaveMesAsociado(item.id, editingMesAsociado.mes, editingMesAsociado.año)}
                                  disabled={savingMesAsociado || !editingMesAsociado.mes}
                                  className="p-1 bg-purple-600 text-white rounded hover:bg-purple-700 disabled:opacity-50"
                                  title="Guardar"
                                >
                                  {savingMesAsociado ? (
                                    <div className="spinner w-3 h-3 border-white" />
                                  ) : (
                                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                    </svg>
                                  )}
                                </button>
                                <button
                                  onClick={() => setEditingMesAsociado(null)}
                                  disabled={savingMesAsociado}
                                  className="p-1 bg-slate-300 text-slate-700 rounded hover:bg-slate-400 disabled:opacity-50"
                                  title="Cancelar"
                                >
                                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                  </svg>
                                </button>
                              </div>
                            ) : (
                              // Modo visualización
                              <div 
                                className={`inline-flex items-center gap-2 px-2 py-1 rounded-lg cursor-pointer transition-colors group ${
                                  item.mesAsociado 
                                    ? 'bg-gradient-to-r from-purple-50 to-pink-50 border border-purple-200 hover:from-purple-100 hover:to-pink-100' 
                                    : 'bg-slate-100 border border-slate-300 hover:bg-slate-200'
                                }`}
                                onClick={() => {
                                  const { mes, año } = parseMesAsociado(item.mesAsociado);
                                  setEditingMesAsociado({
                                    itemId: item.id,
                                    mes: mes,
                                    año: año
                                  });
                                }}
                                title="Clic para editar"
                              >
                                {item.mesAsociado ? (
                                  <>
                                    <span className="text-xs font-bold text-purple-700">
                                      {item.mesAsociado}
                                    </span>
                                    {item.esLineaDuplicada && (
                                      <span className="text-xs text-purple-500" title="Este EP tiene múltiples líneas">📋</span>
                                    )}
                                    <span className="opacity-0 group-hover:opacity-100 transition-opacity text-xs text-purple-400">
                                      ✏️
                                    </span>
                                  </>
                                ) : (
                                  <>
                                    <span className="text-xs text-slate-500 italic">
                                      Sin asignar
                                    </span>
                                    <span className="opacity-0 group-hover:opacity-100 transition-opacity text-xs text-slate-400">
                                      ➕
                                    </span>
                                  </>
                                )}
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <div className="text-xs text-slate-600">{item.fechaEP}</div>
                            <div className="text-xs text-slate-400">{item.tipoEP}</div>
                          </td>
                          <td className="px-4 py-3 text-sm font-bold text-right text-slate-900">
                            {formatCurrency(item.totalPagoNeto)}
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
