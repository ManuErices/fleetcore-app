import React, { useState, useEffect, useMemo } from "react";
import { collection, query, getDocs, orderBy, addDoc, doc, getDoc, deleteDoc, updateDoc } from "firebase/firestore";
import { db, auth } from "../lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import CombustibleDetalleModal from "../components/CombustibleDetalleModal";
import CombustibleModal from "../components/CombustibleModal";

export default function ReporteCombustible() {
  const [reportes, setReportes] = useState([]);
  const [projects, setProjects] = useState([]);
  const [machines, setMachines] = useState([]);
  const [empleados, setEmpleados] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCombustibleModal, setShowCombustibleModal] = useState(false);
  const [userRole, setUserRole] = useState('operador');
  const [currentUser, setCurrentUser] = useState(null);
  const [reportesSeleccionados, setReportesSeleccionados] = useState([]);
  const [reporteDetalle, setReporteDetalle] = useState(null);
  
  // Filtros
  const [filtros, setFiltros] = useState({
    fechaInicio: '',
    fechaFin: '',
    proyecto: '',
    maquina: '',
    surtidor: ''
  });

  // Listas únicas
  const [surtidores, setSurtidores] = useState([]);

  // Obtener rol del usuario
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setCurrentUser(user);
        try {
          const userDocRef = doc(db, 'users', user.uid);
          const userDoc = await getDoc(userDocRef);
          
          if (userDoc.exists()) {
            const userData = userDoc.data();
            setUserRole(userData.role || 'operador');
          } else {
            setUserRole('operador');
          }
        } catch (error) {
          console.error("Error obteniendo rol del usuario:", error);
          setUserRole('operador');
        }
      } else {
        setCurrentUser(null);
        setUserRole('operador');
      }
    });

    return () => unsubscribe();
  }, []);

  // Cargar datos
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

        // Cargar empleados
        const empleadosRef = collection(db, 'employees');
        const empleadosSnap = await getDocs(empleadosRef);
        const empleadosData = empleadosSnap.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setEmpleados(empleadosData);
      } catch (error) {
        console.error("Error cargando datos base:", error);
      }
    };

    cargarDatos();
  }, []);

  // Cargar reportes
  useEffect(() => {
    const cargarReportes = async () => {
      setLoading(true);
      try {
        const reportesRef = collection(db, 'reportes_combustible');
        const q = query(reportesRef, orderBy('fechaCreacion', 'desc'));
        const reportesSnap = await getDocs(q);
        const reportesData = reportesSnap.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setReportes(reportesData);

        // Extraer surtidores únicos
        const surtidoresUnicos = [...new Set(reportesData.map(r => r.repartidorId).filter(Boolean))];
        setSurtidores(surtidoresUnicos);
        
        setLoading(false);
      } catch (error) {
        console.error("Error cargando reportes:", error);
        setLoading(false);
      }
    };

    cargarReportes();
  }, [userRole]);

  // Función para recargar reportes después de crear uno nuevo
  const handleRecargarReportes = async () => {
    try {
      const reportesRef = collection(db, 'reportes_combustible');
      const q = query(reportesRef, orderBy('fechaCreacion', 'desc'));
      const reportesSnap = await getDocs(q);
      const reportesData = reportesSnap.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setReportes(reportesData);

      // Extraer surtidores únicos
      const surtidoresUnicos = [...new Set(reportesData.map(r => r.repartidorId).filter(Boolean))];
      setSurtidores(surtidoresUnicos);
    } catch (error) {
      console.error("Error recargando reportes:", error);
    }
  };


  // Filtrar reportes
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
      // Para ENTREGA: filtrar por machineId en datosEntrega
      resultado = resultado.filter(r => {
        if (r.tipo === 'entrega' && r.datosEntrega) {
          return r.datosEntrega.machineId === filtros.maquina;
        }
        return false;
      });
    }

    if (filtros.surtidor) {
      resultado = resultado.filter(r => r.repartidorId === filtros.surtidor);
    }

    // Enriquecer con datos
    return resultado.map(r => {
      const project = projects.find(p => p.id === r.projectId);
      const repartidor = empleados.find(e => e.id === r.repartidorId);
      
      let machine = null;
      let operador = null;
      let cantidad = 0;
      
      if (r.tipo === 'entrada' && r.datosEntrada) {
        cantidad = r.datosEntrada.cantidad || 0;
      } else if (r.tipo === 'entrega' && r.datosEntrega) {
        machine = machines.find(m => m.id === r.datosEntrega.machineId);
        operador = empleados.find(e => e.id === r.datosEntrega.operadorId);
        cantidad = r.datosEntrega.cantidadLitros || 0;
      }
      
      return {
        ...r,
        projectName: project?.name || r.projectId || '',
        machinePatente: machine?.patente || '',
        machineName: machine?.name || '',
        repartidorNombre: repartidor?.nombre || '',
        repartidorRut: repartidor?.rut || '',
        operadorNombre: operador?.nombre || '',
        operadorRut: operador?.rut || '',
        cantidad: cantidad,
        tipo: r.tipo || 'entrada'
      };
    });
  }, [filtros, reportes, projects, machines, empleados]);

  const handleEliminar = async (id) => {
    if (!window.confirm("¿Estás seguro de eliminar este reporte?")) return;

    try {
      setLoading(true);
      await deleteDoc(doc(db, 'reportes_combustible', id));
      
      // Recargar usando la función
      await handleRecargarReportes();
      
      alert("Reporte eliminado");
      setLoading(false);
    } catch (error) {
      console.error("Error eliminando:", error);
      alert("Error al eliminar");
      setLoading(false);
    }
  };

  const toggleReporteSeleccionado = (id) => {
    setReportesSeleccionados(prev => 
      prev.includes(id) ? prev.filter(r => r !== id) : [...prev, id]
    );
  };

  const toggleSeleccionarTodos = () => {
    if (reportesSeleccionados.length === reportesFiltrados.length) {
      setReportesSeleccionados([]);
    } else {
      setReportesSeleccionados(reportesFiltrados.map(r => r.id));
    }
  };

  const todosSeleccionados = reportesFiltrados.length > 0 && reportesSeleccionados.length === reportesFiltrados.length;

  const descargarExcel = () => {
    if (reportesFiltrados.length === 0) {
      alert("No hay reportes para exportar");
      return;
    }

    const datosExcel = reportesFiltrados.map(r => ({
      'Código Obra': r.projectId,
      'Obra': r.projectName,
      'Fecha': r.fecha,
      'N° Reporte': r.numeroReporte,
      'Cod/Patente': r.machinePatente,
      'Máquina': r.machineName,
      'Surtidor': r.surtidorNombre,
      'RUT Surtidor': r.surtidorRut,
      'Operador': r.operadorNombre,
      'RUT Operador': r.operadorRut,
      'Horómetro/Odómetro': r.horometroOdometro,
      'Combustible (lts)': r.cantidadLitros,
      'Empresa': r.empresa || '',
      'Observaciones': r.observaciones || ''
    }));

    const ws = XLSX.utils.json_to_sheet(datosExcel);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Reportes Combustible');
    
    XLSX.writeFile(wb, `Reportes_Combustible_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const descargarPDF = () => {
    if (reportesFiltrados.length === 0) {
      alert("No hay reportes para exportar");
      return;
    }

    const doc = new jsPDF('landscape');
    
    // Header
    doc.setFillColor(249, 115, 22); // Orange-500
    doc.rect(0, 0, 297, 25, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(18);
    doc.setFont(undefined, 'bold');
    doc.text('REPORTES DE COMBUSTIBLE', 148.5, 15, { align: 'center' });
    
    // Tabla
    const tableData = reportesFiltrados.map(r => [
      r.fecha,
      r.numeroReporte,
      r.projectName,
      r.machinePatente,
      r.surtidorNombre,
      r.operadorNombre,
      r.horometroOdometro,
      r.cantidadLitros
    ]);

    doc.autoTable({
      head: [['Fecha', 'N° Reporte', 'Obra', 'Máquina', 'Surtidor', 'Operador', 'Horómetro', 'Litros']],
      body: tableData,
      startY: 30,
      theme: 'grid',
      headStyles: {
        fillColor: [249, 115, 22],
        textColor: 255,
        fontSize: 9,
        fontStyle: 'bold'
      },
      bodyStyles: {
        fontSize: 8
      },
      alternateRowStyles: {
        fillColor: [255, 247, 237]
      }
    });

    doc.save(`Reportes_Combustible_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 to-amber-50 p-4 sm:p-6 lg:p-8">
      {/* Header */}
      <div className="max-w-7xl mx-auto mb-8">
        <div className="bg-gradient-to-r from-orange-600 via-orange-700 to-amber-700 rounded-2xl shadow-2xl p-8 relative overflow-hidden">
          <div className="absolute inset-0 bg-grid opacity-10"></div>
          <div className="relative z-10">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center">
                  <svg className="w-9 h-9 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.879 16.121A3 3 0 1012.015 11L11 14H9c0 .768.293 1.536.879 2.121z" />
                  </svg>
                </div>
                <div>
                  <h1 className="text-3xl font-black text-white tracking-tight">Reportes de Combustible</h1>
                  <p className="text-orange-100 text-sm mt-1">Control y gestión de entregas de combustible</p>
                </div>
              </div>
              <button
                onClick={() => setShowCombustibleModal(true)}
                className="px-6 py-3 bg-white hover:bg-orange-50 text-orange-700 font-bold rounded-xl transition-all shadow-lg hover:shadow-xl flex items-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.879 16.121A3 3 0 1012.015 11L11 14H9c0 .768.293 1.536.879 2.121z" />
                </svg>
                Reporte Combustible
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Filtros */}
      <div className="max-w-7xl mx-auto mb-6">
        <div className="bg-white rounded-xl shadow-md p-6 border-2 border-orange-100">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">Fecha Inicio</label>
              <input
                type="date"
                value={filtros.fechaInicio}
                onChange={(e) => setFiltros({...filtros, fechaInicio: e.target.value})}
                className="w-full px-4 py-2 border-2 border-orange-200 rounded-lg focus:outline-none focus:border-orange-500"
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">Fecha Fin</label>
              <input
                type="date"
                value={filtros.fechaFin}
                onChange={(e) => setFiltros({...filtros, fechaFin: e.target.value})}
                className="w-full px-4 py-2 border-2 border-orange-200 rounded-lg focus:outline-none focus:border-orange-500"
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">Proyecto</label>
              <select
                value={filtros.proyecto}
                onChange={(e) => setFiltros({...filtros, proyecto: e.target.value})}
                className="w-full px-4 py-2 border-2 border-orange-200 rounded-lg focus:outline-none focus:border-orange-500"
              >
                <option value="">Todos</option>
                {projects.map(p => (
                  <option key={p.id} value={p.id}>{p.name || p.id}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">Máquina</label>
              <select
                value={filtros.maquina}
                onChange={(e) => setFiltros({...filtros, maquina: e.target.value})}
                className="w-full px-4 py-2 border-2 border-orange-200 rounded-lg focus:outline-none focus:border-orange-500"
              >
                <option value="">Todas</option>
                {machines.map(m => (
                  <option key={m.id} value={m.id}>{m.patente || m.code}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">Surtidor</label>
              <select
                value={filtros.surtidor}
                onChange={(e) => setFiltros({...filtros, surtidor: e.target.value})}
                className="w-full px-4 py-2 border-2 border-orange-200 rounded-lg focus:outline-none focus:border-orange-500"
              >
                <option value="">Todos</option>
                {surtidores.map(sId => {
                  const surt = empleados.find(e => e.id === sId);
                  return <option key={sId} value={sId}>{surt?.nombre || sId}</option>;
                })}
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Botones de Acción */}
      <div className="max-w-7xl mx-auto mb-6">
        <div className="bg-white rounded-xl shadow-md p-4 border-2 border-orange-100">
          <div className="flex flex-wrap gap-3">
            <button
              onClick={descargarExcel}
              disabled={reportesFiltrados.length === 0}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-semibold text-sm disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg hover:shadow-xl flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Excel
            </button>
            <button
              onClick={descargarPDF}
              disabled={reportesFiltrados.length === 0}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-rose-600 to-pink-600 hover:from-rose-500 hover:to-pink-500 text-white font-semibold text-sm disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg hover:shadow-xl flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              PDF
            </button>
            <div className="flex-1"></div>
            <div className="text-sm text-slate-600 flex items-center gap-2">
              <span className="font-semibold">Total registros:</span>
              <span className="px-3 py-1 bg-orange-100 text-orange-700 rounded-full font-bold">
                {reportesFiltrados.length}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Tabla */}
      <div className="max-w-7xl mx-auto">
        <div className="bg-white rounded-2xl shadow-lg overflow-hidden border-2 border-orange-100">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gradient-to-r from-orange-600 via-orange-700 to-amber-700 text-white">
                <tr>
                  <th className="px-3 py-4 text-center text-xs font-bold uppercase tracking-wider w-12">
                    <input
                      type="checkbox"
                      checked={todosSeleccionados}
                      onChange={toggleSeleccionarTodos}
                      className="w-4 h-4 rounded border-white/30 text-orange-600 focus:ring-2 focus:ring-white/50 cursor-pointer"
                    />
                  </th>
                  <th className="px-3 py-4 text-left text-xs font-bold uppercase tracking-wider">Tipo</th>
                  <th className="px-3 py-4 text-left text-xs font-bold uppercase tracking-wider">Fecha</th>
                  <th className="px-3 py-4 text-left text-xs font-bold uppercase tracking-wider">N° Reporte</th>
                  <th className="px-3 py-4 text-left text-xs font-bold uppercase tracking-wider">Obra</th>
                  <th className="px-3 py-4 text-left text-xs font-bold uppercase tracking-wider">Máquina</th>
                  <th className="px-3 py-4 text-left text-xs font-bold uppercase tracking-wider">Repartidor</th>
                  <th className="px-3 py-4 text-left text-xs font-bold uppercase tracking-wider">Operador</th>
                  <th className="px-3 py-4 text-center text-xs font-bold uppercase tracking-wider">Horómetro</th>
                  <th className="px-3 py-4 text-center text-xs font-bold uppercase tracking-wider">Litros</th>
                  <th className="px-3 py-4 text-center text-xs font-bold uppercase tracking-wider">Firmado</th>
                  <th className="px-3 py-4 text-center text-xs font-bold uppercase tracking-wider">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-orange-100">
                {loading ? (
                  <tr>
                    <td colSpan="11" className="px-4 py-12 text-center text-slate-500">
                      Cargando...
                    </td>
                  </tr>
                ) : reportesFiltrados.length === 0 ? (
                  <tr>
                    <td colSpan="11" className="px-4 py-12 text-center text-slate-500">
                      <div className="flex flex-col items-center gap-3">
                        <svg className="w-16 h-16 text-orange-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        <p className="font-semibold">No se encontraron reportes</p>
                        <p className="text-sm">Ajusta los filtros o crea un nuevo reporte</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  reportesFiltrados.map((reporte, index) => (
                    <tr key={reporte.id} className={`hover:bg-orange-50 transition-colors ${index % 2 === 0 ? 'bg-white' : 'bg-orange-50/30'}`}>
                      <td className="px-3 py-3 text-center">
                        <input
                          type="checkbox"
                          checked={reportesSeleccionados.includes(reporte.id)}
                          onChange={() => toggleReporteSeleccionado(reporte.id)}
                          className="w-4 h-4 rounded border-orange-300 text-orange-600 focus:ring-2 focus:ring-orange-500 cursor-pointer"
                        />
                      </td>
                      <td className="px-3 py-3 text-sm text-center">
                        <span className={`px-2 py-1 rounded-full text-xs font-bold ${
                          reporte.tipo === 'entrada' 
                            ? 'bg-green-100 text-green-700' 
                            : 'bg-blue-100 text-blue-700'
                        }`}>
                          {reporte.tipo === 'entrada' ? '⬇️ ENTRADA' : '➡️ ENTREGA'}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-sm font-semibold text-slate-900">
                        {reporte.fecha ? new Date(reporte.fecha + 'T00:00:00').toLocaleDateString('es-CL') : '-'}
                      </td>
                      <td 
                        onClick={() => setReporteDetalle(reporte)}
                        className="px-3 py-3 text-sm font-bold text-orange-600 hover:text-orange-800 hover:bg-orange-50 cursor-pointer transition-all"
                        title="Click para ver detalle"
                      >
                        <div className="flex items-center gap-2">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                          {reporte.numeroReporte}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-sm text-slate-700">
                        {reporte.projectName}
                      </td>
                      <td className="px-3 py-3 text-sm text-slate-700">
                        {reporte.machinePatente ? `${reporte.machinePatente} - ${reporte.machineName}` : (reporte.tipo === 'entrada' ? 'N/A' : '-')}
                      </td>
                      <td className="px-3 py-3 text-sm text-slate-700">
                        {reporte.repartidorNombre || '-'}
                      </td>
                      <td className="px-3 py-3 text-sm text-slate-700">
                        {reporte.operadorNombre || (reporte.tipo === 'entrada' ? 'N/A' : '-')}
                      </td>
                      <td className="px-3 py-3 text-sm text-center text-slate-700">
                        {reporte.tipo === 'entrega' && reporte.datosEntrega?.horometroOdometro 
                          ? reporte.datosEntrega.horometroOdometro 
                          : '-'}
                      </td>
                      <td className="px-3 py-3 text-sm text-center font-bold text-orange-600">
                        {reporte.cantidad} L
                      </td>
                      <td className="px-3 py-3 text-center">
                        {(reporte.firmaRepartidor || reporte.firmaReceptor) ? (
                          <div className="flex items-center justify-center">
                            <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center">
                              <svg className="w-5 h-5 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                              </svg>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center justify-center">
                            <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center">
                              <svg className="w-5 h-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </div>
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-3 text-center">
                        {userRole === 'administrador' && !reporte.firmado && (
                          <button
                            onClick={() => handleEliminar(reporte.id)}
                            className="px-3 py-1 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors text-xs font-semibold flex items-center gap-1 mx-auto"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                            Eliminar
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Modal de Combustible */}
      <CombustibleModal 
        isOpen={showCombustibleModal}
        onClose={() => {
          setShowCombustibleModal(false);
          handleRecargarReportes(); // Recargar reportes al cerrar
        }}
        projects={projects}
        machines={machines}
        empleados={empleados}
      />

      {/* Modal de Detalle del Reporte de Combustible */}
      {reporteDetalle && (
        <CombustibleDetalleModal
          reporte={reporteDetalle}
          onClose={() => setReporteDetalle(null)}
          projectName={projects.find(p => p.id === reporteDetalle.projectId)?.name}
          machineInfo={machines.find(m => m.id === reporteDetalle.machineId)}
          surtidorInfo={empleados.find(e => e.id === reporteDetalle.surtidorId)}
          operadorInfo={empleados.find(e => e.id === reporteDetalle.operadorId)}
          userRole={userRole}
          onSave={async (editedData) => {
            try {
              // Guardar los cambios en Firebase
              const reporteRef = doc(db, 'control_combustible', reporteDetalle.id);
              await updateDoc(reporteRef, editedData);
              console.log('Reporte actualizado:', editedData);
              
              // Recargar reportes
              const reportesRef = collection(db, 'control_combustible');
              const q = query(reportesRef, orderBy('fecha', 'desc'));
              const reportesSnap = await getDocs(q);
              const reportesData = reportesSnap.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
              }));
              setReportes(reportesData);
              
              // Actualizar el reporte en detalle
              setReporteDetalle({
                ...reporteDetalle,
                ...editedData
              });

              alert("✓ Cambios guardados exitosamente");
            } catch (error) {
              console.error("Error guardando cambios:", error);
              alert("Error al guardar los cambios. Por favor intente nuevamente.");
            }
          }}
          onSign={async (signatureData, pin) => {
            try {
              // Validar el PIN del administrador contra Firebase
              if (!currentUser) {
                alert("Error: No hay usuario autenticado");
                return;
              }

              // Obtener el documento del usuario actual
              const userRef = doc(db, 'users', currentUser.uid);
              const userDoc = await getDoc(userRef);
              
              if (!userDoc.exists()) {
                alert("Error: No se encontró información del usuario");
                return;
              }

              const userData = userDoc.data();
              const storedPin = userData.pin;

              // Validar el PIN
              if (!storedPin) {
                alert("Error: El usuario no tiene un PIN configurado. Por favor contacte al administrador del sistema.");
                return;
              }

              if (storedPin !== pin) {
                alert("PIN incorrecto. Por favor verifique e intente nuevamente.");
                return;
              }

              // PIN correcto, proceder con la firma
              const reporteRef = doc(db, 'control_combustible', reporteDetalle.id);
              await updateDoc(reporteRef, {
                firmado: true,
                firmaAdmin: {
                  nombre: signatureData.adminName,
                  timestamp: signatureData.timestamp,
                  userId: currentUser.uid
                }
              });
              
              console.log('Reporte firmado exitosamente');
              
              // Recargar reportes
              const reportesRef = collection(db, 'control_combustible');
              const q = query(reportesRef, orderBy('fecha', 'desc'));
              const reportesSnap = await getDocs(q);
              const reportesData = reportesSnap.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
              }));
              setReportes(reportesData);
              
              // Actualizar el reporte en detalle
              setReporteDetalle({
                ...reporteDetalle,
                firmado: true,
                firmaAdmin: {
                  nombre: signatureData.adminName,
                  timestamp: signatureData.timestamp,
                  userId: currentUser.uid
                }
              });
              
              alert("✓ Reporte firmado y validado exitosamente");
            } catch (error) {
              console.error("Error firmando reporte:", error);
              alert("Error al firmar el reporte. Por favor intente nuevamente.");
            }
          }}
        />
      )}
    </div>
  );
}
