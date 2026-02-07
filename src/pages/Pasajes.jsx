import React, { useState, useEffect } from "react";
import { collection, addDoc, getDocs, query, orderBy, deleteDoc, doc } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import { db, storage } from "../lib/firebase";
import { 
  Chart as ChartJS, 
  CategoryScale, 
  LinearScale, 
  PointElement, 
  LineElement, 
  BarElement,
  ArcElement,
  Title, 
  Tooltip, 
  Legend
} from 'chart.js';
import { Line, Bar } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend
);

export default function Pasajes() {
  const [pasajes, setPasajes] = useState([]);
  const [projects, setProjects] = useState([]);
  const [empleados, setEmpleados] = useState([]);
  const [proveedores, setProveedores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showProveedorModal, setShowProveedorModal] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState('');
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear().toString());
  const [filterProject, setFilterProject] = useState('');
  
  // Datos del nuevo proveedor
  const [nuevoProveedor, setNuevoProveedor] = useState({
    nombre: ''
  });
  
  // Datos del nuevo pasaje
  const [nuevoPasaje, setNuevoPasaje] = useState({
    projectId: '',
    fecha: new Date().toISOString().split('T')[0], // YYYY-MM-DD
    pasajeroId: '',
    monto: '',
    cantidad: '1',
    proveedorId: '',
    descripcion: '',
    archivo: null
  });

  // Cargar datos
  useEffect(() => {
    cargarDatos();
  }, []);

  const cargarDatos = async () => {
    setLoading(true);
    try {
      // Cargar proyectos
      const projectsRef = collection(db, 'projects');
      const projectsSnap = await getDocs(projectsRef);
      const projectsData = projectsSnap.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setProjects(projectsData);

      // Cargar empleados
      const empleadosRef = collection(db, 'employees');
      const empleadosSnap = await getDocs(empleadosRef);
      const empleadosData = empleadosSnap.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setEmpleados(empleadosData);

      // Cargar proveedores
      const proveedoresRef = collection(db, 'proveedores_pasajes');
      const proveedoresSnap = await getDocs(proveedoresRef);
      const proveedoresData = proveedoresSnap.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setProveedores(proveedoresData);

      // Cargar pasajes
      const pasajesRef = collection(db, 'pasajes');
      const q = query(pasajesRef, orderBy('fecha', 'desc'));
      const pasajesSnap = await getDocs(q);
      const pasajesData = pasajesSnap.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setPasajes(pasajesData);
      
      setLoading(false);
    } catch (error) {
      console.error("Error cargando datos:", error);
      setLoading(false);
    }
  };

  const handleSubmitProveedor = async (e) => {
    e.preventDefault();
    
    if (!nuevoProveedor.nombre) {
      alert("Por favor ingresa el nombre del proveedor");
      return;
    }

    try {
      setLoading(true);
      await addDoc(collection(db, 'proveedores_pasajes'), {
        nombre: nuevoProveedor.nombre,
        fechaCreacion: new Date().toISOString()
      });

      alert("Proveedor creado exitosamente");
      setShowProveedorModal(false);
      setNuevoProveedor({ nombre: '' });
      cargarDatos();
    } catch (error) {
      console.error("Error creando proveedor:", error);
      alert("Error al crear el proveedor");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!nuevoPasaje.projectId || !nuevoPasaje.fecha || !nuevoPasaje.monto || !nuevoPasaje.pasajeroId) {
      alert("Por favor completa los campos obligatorios");
      return;
    }

    try {
      setLoading(true);
      let archivoURL = null;
      let archivoNombre = '';

      // Subir archivo si existe
      if (nuevoPasaje.archivo) {
        try {
          const timestamp = Date.now();
          const fileName = `${timestamp}_${nuevoPasaje.archivo.name}`;
          const fecha = new Date(nuevoPasaje.fecha);
          const mes = (fecha.getMonth() + 1).toString().padStart(2, '0');
          const anio = fecha.getFullYear().toString();
          const filePath = `pasajes/${anio}/${mes}/${fileName}`;
          const archivoRef = ref(storage, filePath);
          
          const snapshot = await uploadBytes(archivoRef, nuevoPasaje.archivo);
          archivoURL = await getDownloadURL(snapshot.ref);
          archivoNombre = nuevoPasaje.archivo.name;
          
          console.log('Archivo subido exitosamente:', archivoURL);
        } catch (uploadError) {
          console.error("Error subiendo archivo:", uploadError);
          alert("Error al subir el archivo. El registro se guardará sin archivo adjunto.");
        }
      }

      // Guardar en Firestore
      const fecha = new Date(nuevoPasaje.fecha);
      await addDoc(collection(db, 'pasajes'), {
        projectId: nuevoPasaje.projectId,
        pasajeroId: nuevoPasaje.pasajeroId,
        fecha: nuevoPasaje.fecha,
        mes: (fecha.getMonth() + 1).toString().padStart(2, '0'),
        anio: fecha.getFullYear().toString(),
        dia: fecha.getDate().toString().padStart(2, '0'),
        monto: parseFloat(nuevoPasaje.monto),
        cantidad: parseInt(nuevoPasaje.cantidad) || 1,
        proveedorId: nuevoPasaje.proveedorId,
        descripcion: nuevoPasaje.descripcion,
        archivoURL: archivoURL,
        archivoNombre: archivoNombre,
        fechaCreacion: new Date().toISOString()
      });

      alert("Pasaje registrado exitosamente");
      setShowModal(false);
      setNuevoPasaje({
        projectId: '',
        fecha: new Date().toISOString().split('T')[0],
        pasajeroId: '',
        monto: '',
        cantidad: '1',
        proveedorId: '',
        descripcion: '',
        archivo: null
      });
      cargarDatos();
    } catch (error) {
      console.error("Error guardando pasaje:", error);
      alert("Error al guardar el pasaje: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleEliminar = async (id, archivoURL) => {
    if (!window.confirm("¿Estás seguro de eliminar este registro?")) return;

    try {
      setLoading(true);
      
      if (archivoURL) {
        try {
          const archivoRef = ref(storage, archivoURL);
          await deleteObject(archivoRef);
        } catch (deleteError) {
          console.error("Error eliminando archivo:", deleteError);
        }
      }

      await deleteDoc(doc(db, 'pasajes', id));
      
      alert("Registro eliminado");
      cargarDatos();
    } catch (error) {
      console.error("Error eliminando:", error);
      alert("Error al eliminar el registro");
    } finally {
      setLoading(false);
    }
  };

  // Funciones de análisis
  const pasajesFiltrados = pasajes.filter(p => {
    let matches = true;
    if (selectedYear) matches = matches && p.anio === selectedYear;
    if (selectedMonth) matches = matches && p.mes === selectedMonth;
    if (filterProject) matches = matches && p.projectId === filterProject;
    return matches;
  });

  const calcularTotalMes = (mes, anio) => {
    return pasajes
      .filter(p => p.mes === mes && p.anio === anio)
      .reduce((sum, p) => sum + p.monto, 0);
  };

  const calcularTotalProyecto = (projectId) => {
    return pasajes
      .filter(p => p.projectId === projectId)
      .reduce((sum, p) => sum + p.monto, 0);
  };

  const mesesDelAnio = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 
                        'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  
  const datosLineaChart = {
    labels: mesesDelAnio,
    datasets: [
      {
        label: selectedYear,
        data: mesesDelAnio.map((_, idx) => calcularTotalMes((idx + 1).toString().padStart(2, '0'), selectedYear)),
        borderColor: 'rgb(59, 130, 246)',
        backgroundColor: 'rgba(59, 130, 246, 0.5)',
        tension: 0.4,
        pointRadius: 5,
        pointHoverRadius: 7,
        pointBackgroundColor: 'rgb(59, 130, 246)',
        pointBorderColor: '#fff',
        pointBorderWidth: 2
      },
      {
        label: (parseInt(selectedYear) - 1).toString(),
        data: mesesDelAnio.map((_, idx) => calcularTotalMes((idx + 1).toString().padStart(2, '0'), (parseInt(selectedYear) - 1).toString())),
        borderColor: 'rgb(156, 163, 175)',
        backgroundColor: 'rgba(156, 163, 175, 0.5)',
        tension: 0.4,
        pointRadius: 4,
        pointHoverRadius: 6,
        borderDash: [5, 5],
        pointBackgroundColor: 'rgb(156, 163, 175)',
        pointBorderColor: '#fff',
        pointBorderWidth: 2
      }
    ]
  };

  const datosBarChart = {
    labels: projects.map(p => p.name || p.id),
    datasets: [{
      label: 'Gasto Total por Proyecto',
      data: projects.map(p => calcularTotalProyecto(p.id)),
      backgroundColor: [
        'rgba(59, 130, 246, 0.8)',
        'rgba(16, 185, 129, 0.8)',
        'rgba(249, 115, 22, 0.8)',
        'rgba(139, 92, 246, 0.8)',
        'rgba(236, 72, 153, 0.8)',
        'rgba(234, 179, 8, 0.8)',
      ],
      borderColor: [
        'rgb(59, 130, 246)',
        'rgb(16, 185, 129)',
        'rgb(249, 115, 22)',
        'rgb(139, 92, 246)',
        'rgb(236, 72, 153)',
        'rgb(234, 179, 8)',
      ],
      borderWidth: 2,
      borderRadius: 8
    }]
  };

  const totalGeneral = pasajes.reduce((sum, p) => sum + p.monto, 0);
  const totalAnioActual = pasajes.filter(p => p.anio === selectedYear).reduce((sum, p) => sum + p.monto, 0);
  const totalMesActual = calcularTotalMes(
    (new Date().getMonth() + 1).toString().padStart(2, '0'), 
    selectedYear
  );
  const promedioMensual = totalAnioActual / 12;
  const cantidadPasajesAnio = pasajes.filter(p => p.anio === selectedYear).length;

  const opcionesLineChart = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true,
        position: 'top',
        labels: {
          font: { size: 12, weight: 'bold' },
          usePointStyle: true,
          padding: 15
        }
      },
      title: {
        display: true,
        text: 'Evolución de Gastos en Pasajes',
        font: { size: 16, weight: 'bold' },
        padding: { bottom: 20 }
      },
      tooltip: {
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        padding: 12,
        titleFont: { size: 14, weight: 'bold' },
        bodyFont: { size: 13 },
        callbacks: {
          label: function(context) {
            return context.dataset.label + ': $' + context.parsed.y.toLocaleString('es-CL');
          }
        }
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: {
          callback: function(value) {
            return '$' + value.toLocaleString('es-CL');
          }
        },
        grid: {
          color: 'rgba(0, 0, 0, 0.05)'
        }
      },
      x: {
        grid: {
          display: false
        }
      }
    }
  };

  const opcionesBarChart = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false
      },
      title: {
        display: true,
        text: 'Gasto Total por Proyecto',
        font: { size: 16, weight: 'bold' },
        padding: { bottom: 20 }
      },
      tooltip: {
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        padding: 12,
        callbacks: {
          label: function(context) {
            return 'Total: $' + context.parsed.y.toLocaleString('es-CL');
          }
        }
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: {
          callback: function(value) {
            return '$' + value.toLocaleString('es-CL');
          }
        }
      }
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-4 sm:p-6 lg:p-8">
      {/* Header */}
      <div className="max-w-7xl mx-auto mb-8">
        <div className="bg-gradient-to-r from-blue-600 via-blue-700 to-indigo-700 rounded-2xl shadow-2xl p-8 relative overflow-hidden">
          <div className="absolute inset-0 bg-grid opacity-10"></div>
          <div className="relative z-10">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center">
                  <svg className="w-9 h-9 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                  </svg>
                </div>
                <div>
                  <h1 className="text-3xl font-black text-white tracking-tight">Control de Pasajes</h1>
                  <p className="text-blue-100 text-sm mt-1">Gestión y análisis de costos de transporte</p>
                </div>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowProveedorModal(true)}
                  className="px-4 py-3 bg-white/10 hover:bg-white/20 text-white font-bold rounded-xl transition-all backdrop-blur-sm flex items-center gap-2"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                  </svg>
                  Nuevo Proveedor
                </button>
                <button
                  onClick={() => setShowModal(true)}
                  className="px-6 py-3 bg-white hover:bg-blue-50 text-blue-700 font-bold rounded-xl transition-all shadow-lg hover:shadow-xl flex items-center gap-2"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Registrar Pasaje
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Métricas Dashboard */}
      <div className="max-w-7xl mx-auto mb-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* Total Año Actual */}
          <div className="bg-white rounded-2xl shadow-lg p-6 border-2 border-blue-100 hover:shadow-xl transition-shadow">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center">
                <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <span className="text-xs font-bold text-blue-600 bg-blue-50 px-3 py-1 rounded-full">{selectedYear}</span>
            </div>
            <p className="text-sm font-semibold text-slate-500 mb-1">Total Año</p>
            <p className="text-3xl font-black text-slate-900">${totalAnioActual.toLocaleString('es-CL')}</p>
            <p className="text-xs text-slate-500 mt-2">{cantidadPasajesAnio} registros</p>
          </div>

          {/* Total Mes Actual */}
          <div className="bg-white rounded-2xl shadow-lg p-6 border-2 border-green-100 hover:shadow-xl transition-shadow">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center">
                <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <span className="text-xs font-bold text-green-600 bg-green-50 px-3 py-1 rounded-full">Mes Actual</span>
            </div>
            <p className="text-sm font-semibold text-slate-500 mb-1">Gasto Mensual</p>
            <p className="text-3xl font-black text-slate-900">${totalMesActual.toLocaleString('es-CL')}</p>
            <p className="text-xs text-slate-500 mt-2">{mesesDelAnio[new Date().getMonth()]}</p>
          </div>

          {/* Promedio Mensual */}
          <div className="bg-white rounded-2xl shadow-lg p-6 border-2 border-purple-100 hover:shadow-xl transition-shadow">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 to-violet-600 flex items-center justify-center">
                <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <span className="text-xs font-bold text-purple-600 bg-purple-50 px-3 py-1 rounded-full">Promedio</span>
            </div>
            <p className="text-sm font-semibold text-slate-500 mb-1">Gasto Promedio</p>
            <p className="text-3xl font-black text-slate-900">${promedioMensual.toLocaleString('es-CL')}</p>
            <p className="text-xs text-slate-500 mt-2">por mes</p>
          </div>

          {/* Total General */}
          <div className="bg-white rounded-2xl shadow-lg p-6 border-2 border-orange-100 hover:shadow-xl transition-shadow">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center">
                <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                </svg>
              </div>
              <span className="text-xs font-bold text-orange-600 bg-orange-50 px-3 py-1 rounded-full">Global</span>
            </div>
            <p className="text-sm font-semibold text-slate-500 mb-1">Total Histórico</p>
            <p className="text-3xl font-black text-slate-900">${totalGeneral.toLocaleString('es-CL')}</p>
            <p className="text-xs text-slate-500 mt-2">{pasajes.length} pasajes totales</p>
          </div>
        </div>
      </div>

      {/* Gráficos */}
      <div className="max-w-7xl mx-auto mb-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Gráfico de Línea */}
          <div className="bg-white rounded-2xl shadow-lg p-6 border border-slate-200">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-black text-slate-900">Tendencia Mensual</h3>
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(e.target.value)}
                className="px-3 py-2 border-2 border-slate-300 rounded-lg text-sm font-semibold focus:outline-none focus:border-blue-500"
              >
                {[2024, 2025, 2026].map(year => (
                  <option key={year} value={year}>{year}</option>
                ))}
              </select>
            </div>
            <div style={{ height: '300px' }}>
              <Line data={datosLineaChart} options={opcionesLineChart} />
            </div>
          </div>

          {/* Gráfico de Barras */}
          <div className="bg-white rounded-2xl shadow-lg p-6 border border-slate-200">
            <h3 className="text-lg font-black text-slate-900 mb-4">Distribución por Proyecto</h3>
            <div style={{ height: '300px' }}>
              <Bar data={datosBarChart} options={opcionesBarChart} />
            </div>
          </div>
        </div>
      </div>

      {/* Filtros */}
      <div className="max-w-7xl mx-auto mb-6">
        <div className="bg-white rounded-xl shadow-md p-4 border border-slate-200">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">Mes</label>
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="w-full px-4 py-2 border-2 border-slate-300 rounded-lg focus:outline-none focus:border-blue-500"
              >
                <option value="">Todos los meses</option>
                {mesesDelAnio.map((mes, idx) => (
                  <option key={idx} value={(idx + 1).toString().padStart(2, '0')}>{mes}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">Año</label>
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(e.target.value)}
                className="w-full px-4 py-2 border-2 border-slate-300 rounded-lg focus:outline-none focus:border-blue-500"
              >
                {[2024, 2025, 2026].map(year => (
                  <option key={year} value={year}>{year}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">Proyecto</label>
              <select
                value={filterProject}
                onChange={(e) => setFilterProject(e.target.value)}
                className="w-full px-4 py-2 border-2 border-slate-300 rounded-lg focus:outline-none focus:border-blue-500"
              >
                <option value="">Todos los proyectos</option>
                {projects.map(p => (
                  <option key={p.id} value={p.id}>{p.name || p.id}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Tabla de Pasajes */}
      <div className="max-w-7xl mx-auto">
        <div className="bg-white rounded-2xl shadow-lg overflow-hidden border border-slate-200">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gradient-to-r from-slate-700 via-slate-800 to-slate-900 text-white">
                <tr>
                  <th className="px-4 py-4 text-left text-xs font-bold uppercase">Fecha</th>
                  <th className="px-4 py-4 text-left text-xs font-bold uppercase">Proyecto</th>
                  <th className="px-4 py-4 text-left text-xs font-bold uppercase">Pasajero</th>
                  <th className="px-4 py-4 text-right text-xs font-bold uppercase">Monto</th>
                  <th className="px-4 py-4 text-center text-xs font-bold uppercase">Cantidad</th>
                  <th className="px-4 py-4 text-left text-xs font-bold uppercase">Proveedor</th>
                  <th className="px-4 py-4 text-left text-xs font-bold uppercase">Descripción</th>
                  <th className="px-4 py-4 text-center text-xs font-bold uppercase">Respaldo</th>
                  <th className="px-4 py-4 text-center text-xs font-bold uppercase">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {loading ? (
                  <tr>
                    <td colSpan="9" className="px-4 py-12 text-center text-slate-500">
                      Cargando...
                    </td>
                  </tr>
                ) : pasajesFiltrados.length === 0 ? (
                  <tr>
                    <td colSpan="9" className="px-4 py-12 text-center text-slate-500">
                      <div className="flex flex-col items-center gap-3">
                        <svg className="w-16 h-16 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        <p className="font-semibold">No hay registros</p>
                        <p className="text-sm">Comienza registrando tu primer pasaje</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  pasajesFiltrados.map((pasaje, idx) => {
                    const project = projects.find(p => p.id === pasaje.projectId);
                    const empleado = empleados.find(e => e.id === pasaje.pasajeroId);
                    const proveedor = proveedores.find(p => p.id === pasaje.proveedorId);
                    
                    return (
                      <tr key={pasaje.id} className={`hover:bg-blue-50 transition-colors ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}`}>
                        <td className="px-4 py-3 text-sm font-semibold text-slate-900">
                          {new Date(pasaje.fecha + 'T00:00:00').toLocaleDateString('es-CL', {
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric'
                          })}
                        </td>
                        <td className="px-4 py-3 text-sm font-semibold text-slate-900">
                          {project?.name || pasaje.projectId}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-700">
                          {empleado?.nombre || '-'}
                        </td>
                        <td className="px-4 py-3 text-sm font-bold text-right text-blue-600">
                          ${pasaje.monto.toLocaleString('es-CL')}
                        </td>
                        <td className="px-4 py-3 text-sm text-center text-slate-700">
                          {pasaje.cantidad}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-700">
                          {proveedor?.nombre || '-'}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-600 max-w-xs truncate">
                          {pasaje.descripcion || '-'}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {pasaje.archivoURL ? (
                            <a
                              href={pasaje.archivoURL}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 px-3 py-1 bg-green-100 text-green-700 rounded-lg hover:bg-green-200 transition-colors text-xs font-semibold"
                            >
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                              </svg>
                              Ver
                            </a>
                          ) : (
                            <span className="text-xs text-slate-400">Sin archivo</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <button
                            onClick={() => handleEliminar(pasaje.id, pasaje.archivoURL)}
                            className="px-3 py-1 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors text-xs font-semibold"
                          >
                            Eliminar
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Modal de Nuevo Proveedor */}
      {showProveedorModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full">
            <div className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white p-6">
              <h2 className="text-2xl font-black">Nuevo Proveedor</h2>
              <p className="text-indigo-100 text-sm mt-1">Agregar proveedor de pasajes</p>
            </div>

            <form onSubmit={handleSubmitProveedor} className="p-6">
              <div className="mb-6">
                <label className="block text-sm font-bold text-slate-700 mb-2">
                  Nombre del Proveedor <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={nuevoProveedor.nombre}
                  onChange={(e) => setNuevoProveedor({...nuevoProveedor, nombre: e.target.value})}
                  className="w-full px-4 py-3 border-2 border-slate-300 rounded-lg focus:outline-none focus:border-indigo-500"
                  placeholder="Ej: Turbus, Pullman Bus, Tur Bus"
                />
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowProveedorModal(false);
                    setNuevoProveedor({ nombre: '' });
                  }}
                  className="flex-1 px-6 py-3 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold rounded-xl transition-all"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 px-6 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 disabled:from-slate-300 disabled:to-slate-400 text-white font-bold rounded-xl transition-all shadow-lg hover:shadow-xl disabled:cursor-not-allowed"
                >
                  {loading ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Nuevo Pasaje */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white p-6 sticky top-0 z-10">
              <h2 className="text-2xl font-black">Registrar Nuevo Pasaje</h2>
              <p className="text-blue-100 text-sm mt-1">Complete la información del gasto</p>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">
                    Proyecto <span className="text-red-500">*</span>
                  </label>
                  <select
                    required
                    value={nuevoPasaje.projectId}
                    onChange={(e) => setNuevoPasaje({...nuevoPasaje, projectId: e.target.value})}
                    className="w-full px-4 py-2 border-2 border-slate-300 rounded-lg focus:outline-none focus:border-blue-500"
                  >
                    <option value="">Seleccione un proyecto</option>
                    {projects.map(p => (
                      <option key={p.id} value={p.id}>{p.name || p.id}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">
                    Fecha <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={nuevoPasaje.fecha}
                    onChange={(e) => setNuevoPasaje({...nuevoPasaje, fecha: e.target.value})}
                    className="w-full px-4 py-2 border-2 border-slate-300 rounded-lg focus:outline-none focus:border-blue-500"
                    max={new Date().toISOString().split('T')[0]}
                  />
                </div>

                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">
                    Pasajero <span className="text-red-500">*</span>
                  </label>
                  <select
                    required
                    value={nuevoPasaje.pasajeroId}
                    onChange={(e) => setNuevoPasaje({...nuevoPasaje, pasajeroId: e.target.value})}
                    className="w-full px-4 py-2 border-2 border-slate-300 rounded-lg focus:outline-none focus:border-blue-500"
                  >
                    <option value="">Seleccione un pasajero</option>
                    {empleados.map(emp => (
                      <option key={emp.id} value={emp.id}>
                        {emp.nombre} {emp.rut ? `- ${emp.rut}` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">
                    Monto <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    required
                    min="0"
                    step="0.01"
                    value={nuevoPasaje.monto}
                    onChange={(e) => setNuevoPasaje({...nuevoPasaje, monto: e.target.value})}
                    className="w-full px-4 py-2 border-2 border-slate-300 rounded-lg focus:outline-none focus:border-blue-500"
                    placeholder="Ej: 15000"
                  />
                </div>

                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">
                    Cantidad de Pasajes
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={nuevoPasaje.cantidad}
                    onChange={(e) => setNuevoPasaje({...nuevoPasaje, cantidad: e.target.value})}
                    className="w-full px-4 py-2 border-2 border-slate-300 rounded-lg focus:outline-none focus:border-blue-500"
                    placeholder="Ej: 1"
                  />
                </div>

                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">
                    Proveedor
                  </label>
                  <select
                    value={nuevoPasaje.proveedorId}
                    onChange={(e) => setNuevoPasaje({...nuevoPasaje, proveedorId: e.target.value})}
                    className="w-full px-4 py-2 border-2 border-slate-300 rounded-lg focus:outline-none focus:border-blue-500"
                  >
                    <option value="">Seleccione un proveedor</option>
                    {proveedores.map(prov => (
                      <option key={prov.id} value={prov.id}>{prov.nombre}</option>
                    ))}
                  </select>
                  {proveedores.length === 0 && (
                    <p className="text-xs text-amber-600 mt-1">
                      No hay proveedores. Crea uno con el botón "Nuevo Proveedor"
                    </p>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">
                  Descripción
                </label>
                <textarea
                  value={nuevoPasaje.descripcion}
                  onChange={(e) => setNuevoPasaje({...nuevoPasaje, descripcion: e.target.value})}
                  className="w-full px-4 py-2 border-2 border-slate-300 rounded-lg focus:outline-none focus:border-blue-500 min-h-[80px]"
                  placeholder="Detalles adicionales..."
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">
                  Archivo de Respaldo (PDF, Imagen)
                </label>
                <input
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png"
                  onChange={(e) => setNuevoPasaje({...nuevoPasaje, archivo: e.target.files[0]})}
                  className="w-full px-4 py-2 border-2 border-slate-300 rounded-lg focus:outline-none focus:border-blue-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                />
                {nuevoPasaje.archivo && (
                  <p className="text-xs text-green-600 mt-2">✓ {nuevoPasaje.archivo.name}</p>
                )}
              </div>

              <div className="flex gap-3 pt-4 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => {
                    setShowModal(false);
                    setNuevoPasaje({
                      projectId: '',
                      fecha: new Date().toISOString().split('T')[0],
                      pasajeroId: '',
                      monto: '',
                      cantidad: '1',
                      proveedorId: '',
                      descripcion: '',
                      archivo: null
                    });
                  }}
                  className="flex-1 px-6 py-3 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold rounded-xl transition-all"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:from-slate-300 disabled:to-slate-400 text-white font-bold rounded-xl transition-all shadow-lg hover:shadow-xl disabled:cursor-not-allowed"
                >
                  {loading ? 'Guardando...' : 'Guardar Pasaje'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
