import React, { useState, useEffect, useMemo } from "react";
import { collection, query, where, getDocs, orderBy, doc, getDoc } from "firebase/firestore";
import { db } from "../lib/firebase";
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import ReporteDetalleModal from "../components/ReporteDetalleModal";

export default function ReporteWorkFleet() {
  const [reportes, setReportes] = useState([]);
  const [projects, setProjects] = useState([]);
  const [machines, setMachines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showPreview, setShowPreview] = useState(false);
  const [reporteDetalle, setReporteDetalle] = useState(null); // Nuevo estado para detalle
  
  // Filtros
  const [filtros, setFiltros] = useState({
    fechaInicio: '',
    fechaFin: '',
    proyecto: '',
    maquina: '',
    operador: ''
  });

  // Listas únicas para selectores
  const [operadores, setOperadores] = useState([]);

  // Cargar projects y machines
  useEffect(() => {
    const cargarDatos = async () => {
      try {
        // Cargar proyectos
        const projectsRef = collection(db, 'projects');
        const projectsSnap = await getDocs(projectsRef);
        const projectsData = projectsSnap.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setProjects(projectsData);

        // Cargar máquinas
        const machinesRef = collection(db, 'machines');
        const machinesSnap = await getDocs(machinesRef);
        const machinesData = machinesSnap.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setMachines(machinesData);
      } catch (error) {
        console.error("Error cargando datos base:", error);
      }
    };

    cargarDatos();
  }, []);

  // Cargar reportes desde Firebase
  useEffect(() => {
    const cargarReportes = async () => {
      setLoading(true);
      try {
        const reportesRef = collection(db, 'reportes_detallados');
        const q = query(reportesRef, orderBy('fecha', 'desc'));
        const querySnapshot = await getDocs(q);
        
        const reportesData = querySnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        
        setReportes(reportesData);
        
        // Extraer operadores únicos
        const operadoresUnicos = [...new Set(reportesData.map(r => r.operador))].filter(Boolean);
        setOperadores(operadoresUnicos);
        
        setLoading(false);
      } catch (error) {
        console.error("Error cargando reportes:", error);
        setLoading(false);
      }
    };

    cargarReportes();
  }, []);

  // Aplicar filtros y enriquecer datos
  const reportesFiltrados = useMemo(() => {
    let resultado = [...reportes];

    if (filtros.fechaInicio) {
      resultado = resultado.filter(r => r.fecha >= filtros.fechaInicio);
    }

    if (filtros.fechaFin) {
      resultado = resultado.filter(r => r.fecha <= filtros.fechaFin);
    }

    if (filtros.proyecto) {
      resultado = resultado.filter(r => r.projectId === filtros.proyecto);
    }

    if (filtros.maquina) {
      resultado = resultado.filter(r => r.machineId === filtros.maquina);
    }

    if (filtros.operador) {
      resultado = resultado.filter(r => r.operador === filtros.operador);
    }

    // Enriquecer con datos de projects y machines
    return resultado.map(r => {
      const project = projects.find(p => p.id === r.projectId);
      const machine = machines.find(m => m.id === r.machineId);
      
      return {
        ...r,
        projectName: project?.name || r.projectId || '',
        machinePatente: machine?.patente || '',
        machineCode: machine?.code || '',
        machineName: machine?.name || ''
      };
    });
  }, [filtros, reportes, projects, machines]);

  const handleFiltroChange = (campo, valor) => {
    setFiltros(prev => ({
      ...prev,
      [campo]: valor
    }));
  };

  const limpiarFiltros = () => {
    setFiltros({
      fechaInicio: '',
      fechaFin: '',
      proyecto: '',
      maquina: '',
      operador: ''
    });
  };

  // Descargar como Excel
  const descargarExcel = () => {
    const datosExcel = reportesFiltrados.map(r => {
      const horasTrabajadas = r.horometroFinal && r.horometroInicial 
        ? (parseFloat(r.horometroFinal) - parseFloat(r.horometroInicial)).toFixed(2)
        : '0';
      
      const kmRecorridos = r.kilometrajeFinal && r.kilometrajeInicial
        ? (parseFloat(r.kilometrajeFinal) - parseFloat(r.kilometrajeInicial)).toFixed(2)
        : '0';

      return {
        'Cod. Obra': r.projectId || '',
        'Obra': r.projectName,
        'Fecha': r.fecha,
        'Cod./ Patente': r.machinePatente || r.machineId,
        'Máquina': r.machineName || r.machineId,
        'N° de Reporte': r.numeroReporte,
        'Nombre Operador': r.operador,
        'Rut Operador': r.rut,
        'Horas Inicial': r.horometroInicial || '0',
        'Horas Final': r.horometroFinal || '0',
        'Horas Trabaj.': horasTrabajadas,
        'Kilometraje Inicial': r.kilometrajeInicial || '0',
        'Kilometraje Final': r.kilometrajeFinal || '0',
        'Kilometraje Recorr.': kmRecorridos,
        'Combust.': r.cargaCombustible || '0'
      };
    });

    const ws = XLSX.utils.json_to_sheet(datosExcel);
    
    // Ajustar ancho de columnas
    const columnWidths = [
      { wch: 12 }, // Cod. Obra
      { wch: 20 }, // Obra
      { wch: 12 }, // Fecha
      { wch: 15 }, // Cod./Patente
      { wch: 20 }, // Máquina
      { wch: 15 }, // N° Reporte
      { wch: 25 }, // Nombre Operador
      { wch: 15 }, // Rut Operador
      { wch: 10 }, // Horas Inicial
      { wch: 10 }, // Horas Final
      { wch: 10 }, // Horas Trabaj.
      { wch: 12 }, // Km Inicial
      { wch: 12 }, // Km Final
      { wch: 12 }, // Km Recorr.
      { wch: 10 }  // Combust.
    ];
    ws['!cols'] = columnWidths;

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Reportes WorkFleet');
    XLSX.writeFile(wb, `Reportes_WorkFleet_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  // Descargar como PDF
  const descargarPDF = () => {
    const doc = new jsPDF('landscape');
    
    doc.setFontSize(18);
    doc.text('Reportes WorkFleet', 14, 15);
    
    doc.setFontSize(10);
    doc.text(`Generado: ${new Date().toLocaleDateString()}`, 14, 22);
    doc.text(`Total de reportes: ${reportesFiltrados.length}`, 14, 27);

    const tableData = reportesFiltrados.map(r => {
      const horasTrabajadas = r.horometroFinal && r.horometroInicial 
        ? (parseFloat(r.horometroFinal) - parseFloat(r.horometroInicial)).toFixed(2)
        : '0';
      
      const kmRecorridos = r.kilometrajeFinal && r.kilometrajeInicial
        ? (parseFloat(r.kilometrajeFinal) - parseFloat(r.kilometrajeInicial)).toFixed(2)
        : '0';

      return [
        r.projectName || '',
        r.fecha,
        r.machinePatente || '',
        r.numeroReporte,
        r.operador,
        r.rut,
        r.horometroInicial || '0',
        r.horometroFinal || '0',
        horasTrabajadas,
        r.kilometrajeInicial || '0',
        r.kilometrajeFinal || '0',
        kmRecorridos,
        r.cargaCombustible || '0'
      ];
    });

    doc.autoTable({
      head: [[
        'Obra',
        'Fecha',
        'Patente',
        'N° Rep.',
        'Operador',
        'RUT',
        'H.Ini',
        'H.Fin',
        'H.Trab',
        'Km.Ini',
        'Km.Fin',
        'Km.Rec',
        'Comb.'
      ]],
      body: tableData,
      startY: 35,
      styles: { fontSize: 7 },
      headStyles: { fillColor: [124, 58, 237], fontSize: 7 },
      columnStyles: {
        0: { cellWidth: 25 },
        1: { cellWidth: 20 },
        2: { cellWidth: 18 },
        3: { cellWidth: 20 },
        4: { cellWidth: 30 },
        5: { cellWidth: 22 },
        6: { cellWidth: 13 },
        7: { cellWidth: 13 },
        8: { cellWidth: 13 },
        9: { cellWidth: 13 },
        10: { cellWidth: 13 },
        11: { cellWidth: 13 },
        12: { cellWidth: 13 }
      }
    });

    doc.save(`Reportes_WorkFleet_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-purple-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-600 font-semibold">Cargando reportes...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6 p-4 sm:p-6">
      {/* Header - Estilo moderno con colores teal/cyan */}
      <div className="glass-card rounded-xl sm:rounded-2xl p-4 sm:p-6 animate-fadeInUp">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg sm:rounded-xl bg-gradient-to-br from-teal-600 to-cyan-600 flex items-center justify-center shadow-lg flex-shrink-0">
              <svg className="w-5 h-5 sm:w-6 sm:h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl lg:text-3xl font-black text-slate-900 tracking-tight">
                Reportes WorkFleet
              </h1>
              <p className="text-slate-600 mt-0.5 sm:mt-1 text-xs sm:text-sm">
                Visualiza y exporta reportes detallados
              </p>
            </div>
          </div>
        </div>

        {/* Filtros */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wider">Filtros</h2>
            <button
              onClick={limpiarFiltros}
              className="text-sm text-teal-600 hover:text-teal-800 font-semibold transition-colors"
            >
              Limpiar filtros
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
            {/* Fecha Inicio */}
            <div>
              <label className="block text-xs sm:text-sm font-semibold text-slate-700 mb-2">
                Fecha Inicial
              </label>
              <input
                type="date"
                value={filtros.fechaInicio}
                onChange={(e) => handleFiltroChange('fechaInicio', e.target.value)}
                className="input-modern text-sm sm:text-base"
              />
            </div>

            {/* Fecha Fin */}
            <div>
              <label className="block text-xs sm:text-sm font-semibold text-slate-700 mb-2">
                Fecha Final
              </label>
              <input
                type="date"
                value={filtros.fechaFin}
                onChange={(e) => handleFiltroChange('fechaFin', e.target.value)}
                className="input-modern text-sm sm:text-base"
              />
            </div>

            {/* Proyecto/Obra */}
            <div>
              <label className="block text-xs sm:text-sm font-semibold text-slate-700 mb-2">
                Obra
              </label>
              <select
                value={filtros.proyecto}
                onChange={(e) => handleFiltroChange('proyecto', e.target.value)}
                className="input-modern text-sm sm:text-base"
              >
                <option value="">Todas las obras</option>
                {projects.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>

            {/* Máquina */}
            <div>
              <label className="block text-xs sm:text-sm font-semibold text-slate-700 mb-2">
                Máquina
              </label>
              <select
                value={filtros.maquina}
                onChange={(e) => handleFiltroChange('maquina', e.target.value)}
                className="input-modern text-sm sm:text-base"
              >
                <option value="">Todas las máquinas</option>
                {machines.map(m => (
                  <option key={m.id} value={m.id}>{m.code || m.patente || m.name}</option>
                ))}
              </select>
            </div>

            {/* Operador */}
            <div>
              <label className="block text-xs sm:text-sm font-semibold text-slate-700 mb-2">
                Operador
              </label>
              <select
                value={filtros.operador}
                onChange={(e) => handleFiltroChange('operador', e.target.value)}
                className="input-modern text-sm sm:text-base"
              >
                <option value="">Todos los operadores</option>
                {operadores.map(o => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Resumen y botones de acción */}
          <div className="pt-4 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <div className="px-3 py-1.5 bg-teal-100 text-teal-700 rounded-lg">
                <span className="text-sm font-bold">{reportesFiltrados.length}</span>
                <span className="text-xs ml-1">reportes</span>
              </div>
              {filtros.fechaInicio && (
                <div className="text-xs text-slate-600">
                  desde <span className="font-semibold">{filtros.fechaInicio}</span>
                </div>
              )}
              {filtros.fechaFin && (
                <div className="text-xs text-slate-600">
                  hasta <span className="font-semibold">{filtros.fechaFin}</span>
                </div>
              )}
            </div>
            
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setShowPreview(true)}
                disabled={reportesFiltrados.length === 0}
                className="px-3 sm:px-4 py-2 rounded-lg sm:rounded-xl bg-slate-600 hover:bg-slate-700 text-white font-semibold text-sm disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg hover:shadow-xl flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
                Previsualizar
              </button>
              <button
                onClick={descargarExcel}
                disabled={reportesFiltrados.length === 0}
                className="px-3 sm:px-4 py-2 rounded-lg sm:rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-semibold text-sm disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg hover:shadow-xl flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Excel
              </button>
              <button
                onClick={descargarPDF}
                disabled={reportesFiltrados.length === 0}
                className="px-3 sm:px-4 py-2 rounded-lg sm:rounded-xl bg-gradient-to-r from-rose-600 to-pink-600 hover:from-rose-500 hover:to-pink-500 text-white font-semibold text-sm disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg hover:shadow-xl flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                </svg>
                PDF
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Tabla de reportes - Estilo profesional con colores teal */}
      <div className="glass-card rounded-xl sm:rounded-2xl overflow-hidden animate-fadeInUp">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gradient-to-r from-teal-600 via-cyan-600 to-teal-600 text-white">
              <tr>
                <th className="px-3 py-4 text-left text-xs font-bold uppercase tracking-wider">N° Reporte</th>
                <th className="px-3 py-4 text-left text-xs font-bold uppercase tracking-wider">Obra</th>
                <th className="px-3 py-4 text-left text-xs font-bold uppercase tracking-wider">Fecha</th>
                <th className="px-3 py-4 text-left text-xs font-bold uppercase tracking-wider">Patente</th>
                <th className="px-3 py-4 text-left text-xs font-bold uppercase tracking-wider">Operador</th>
                <th className="px-3 py-4 text-left text-xs font-bold uppercase tracking-wider">RUT</th>
                <th className="px-2 py-4 text-center text-xs font-bold uppercase tracking-wider" colSpan="3">Horas</th>
                <th className="px-2 py-4 text-center text-xs font-bold uppercase tracking-wider" colSpan="3">Kilometraje</th>
                <th className="px-3 py-4 text-left text-xs font-bold uppercase tracking-wider">Comb.</th>
              </tr>
              <tr className="bg-teal-700">
                <th colSpan="6"></th>
                <th className="px-1 py-2 text-xs font-semibold">Ini</th>
                <th className="px-1 py-2 text-xs font-semibold">Fin</th>
                <th className="px-1 py-2 text-xs font-semibold">Trab.</th>
                <th className="px-1 py-2 text-xs font-semibold">Ini</th>
                <th className="px-1 py-2 text-xs font-semibold">Fin</th>
                <th className="px-1 py-2 text-xs font-semibold">Rec.</th>
                <th></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {reportesFiltrados.length === 0 ? (
                <tr>
                  <td colSpan="13" className="px-6 py-12 text-center text-slate-500">
                    <div className="flex flex-col items-center gap-3">
                      <svg className="w-16 h-16 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      <p className="font-semibold">No se encontraron reportes</p>
                      <p className="text-sm">Ajusta los filtros para ver resultados</p>
                    </div>
                  </td>
                </tr>
              ) : (
                reportesFiltrados.map((reporte, index) => {
                  const horasTrabajadas = reporte.horometroFinal && reporte.horometroInicial 
                    ? (parseFloat(reporte.horometroFinal) - parseFloat(reporte.horometroInicial)).toFixed(2)
                    : '0';
                  
                  const kmRecorridos = reporte.kilometrajeFinal && reporte.kilometrajeInicial
                    ? (parseFloat(reporte.kilometrajeFinal) - parseFloat(reporte.kilometrajeInicial)).toFixed(2)
                    : '0';

                  return (
                    <tr key={reporte.id} className={`hover:bg-teal-50 transition-colors ${index % 2 === 0 ? 'bg-white' : 'bg-slate-50'}`}>
                      <td className="px-3 py-3 text-sm">
                        <button
                          onClick={() => setReporteDetalle(reporte)}
                          className="font-black text-teal-600 hover:text-teal-800 hover:underline transition-colors"
                        >
                          {reporte.numeroReporte}
                        </button>
                      </td>
                      <td className="px-3 py-3 text-sm text-slate-900">{reporte.projectName || '-'}</td>
                      <td className="px-3 py-3 text-sm text-slate-900">{reporte.fecha}</td>
                      <td className="px-3 py-3 text-sm font-semibold text-cyan-600">{reporte.machinePatente || '-'}</td>
                      <td className="px-3 py-3 text-sm text-slate-900">{reporte.operador}</td>
                      <td className="px-3 py-3 text-sm text-slate-600">{reporte.rut}</td>
                      <td className="px-1 py-3 text-sm text-slate-900 text-center">{reporte.horometroInicial || '0'}</td>
                      <td className="px-1 py-3 text-sm text-slate-900 text-center">{reporte.horometroFinal || '0'}</td>
                      <td className="px-1 py-3 text-sm font-bold text-emerald-600 text-center">{horasTrabajadas}</td>
                      <td className="px-1 py-3 text-sm text-slate-900 text-center">{reporte.kilometrajeInicial || '0'}</td>
                      <td className="px-1 py-3 text-sm text-slate-900 text-center">{reporte.kilometrajeFinal || '0'}</td>
                      <td className="px-1 py-3 text-sm font-bold text-emerald-600 text-center">{kmRecorridos}</td>
                      <td className="px-3 py-3 text-sm text-slate-900">{reporte.cargaCombustible || '0'}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal de Detalle del Reporte */}
      {reporteDetalle && (
        <ReporteDetalleModal
          reporte={reporteDetalle}
          onClose={() => setReporteDetalle(null)}
          projectName={projects.find(p => p.id === reporteDetalle.projectId)?.name}
          machineInfo={machines.find(m => m.id === reporteDetalle.machineId)}
        />
      )}

      {/* Modal de Previsualización */}
      {showPreview && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-6xl w-full max-h-[90vh] overflow-hidden animate-fadeIn">
            <div className="bg-gradient-to-r from-purple-600 to-indigo-600 text-white p-6 flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-black">Previsualización de Reportes</h2>
                <p className="text-purple-100 text-sm mt-1">{reportesFiltrados.length} reportes seleccionados</p>
              </div>
              <button
                onClick={() => setShowPreview(false)}
                className="w-10 h-10 rounded-full hover:bg-white/20 flex items-center justify-center transition-colors"
              >
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-6 overflow-y-auto max-h-[calc(90vh-200px)]">
              <div className="space-y-3">
                {reportesFiltrados.map((reporte) => (
                  <div key={reporte.id} className="border border-slate-200 rounded-xl p-4 hover:bg-slate-50 transition-colors">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div>
                        <p className="text-xs text-slate-500 font-semibold">Fecha</p>
                        <p className="text-sm font-bold">{reporte.fecha}</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500 font-semibold">N° Reporte</p>
                        <p className="text-sm font-bold text-purple-600">{reporte.numeroReporte}</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500 font-semibold">Operador</p>
                        <p className="text-sm">{reporte.operador}</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500 font-semibold">Máquina</p>
                        <p className="text-sm font-semibold">{reporte.machinePatente || reporte.machineId}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="border-t border-slate-200 p-6 flex justify-end gap-3 bg-slate-50">
              <button
                onClick={() => setShowPreview(false)}
                className="px-6 py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold rounded-xl transition-all"
              >
                Cerrar
              </button>
              <button
                onClick={() => {
                  descargarExcel();
                  setShowPreview(false);
                }}
                className="px-6 py-2.5 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white font-semibold rounded-xl transition-all shadow-lg"
              >
                📊 Descargar Excel
              </button>
              <button
                onClick={() => {
                  descargarPDF();
                  setShowPreview(false);
                }}
                className="px-6 py-2.5 bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white font-semibold rounded-xl transition-all shadow-lg"
              >
                📄 Descargar PDF
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
