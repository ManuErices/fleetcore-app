import React, { useState, useEffect, useMemo } from "react";
import { collection, query, getDocs, orderBy, addDoc, doc, getDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { db, auth } from "../../lib/firebase";
import { useEmpresa } from "../../lib/useEmpresa";
import { onAuthStateChanged } from "firebase/auth";
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import CombustibleDetalleModal from "../combustible/CombustibleDetalleModal";
import CombustibleModal from "../combustible/CombustibleModal";
import CombustibleAnalytics from "../combustible/CombustibleAnalytics";
import CombustibleImporter from "../combustible/CombustibleImporter";
import { printThermalVoucher, getNextGuiaNumber } from "../../utils/voucherThermalGenerator";
import { useToast, ToastContainer } from "../../components/Toast";

function SurtidoresStatsPanel({ stats, selectedSurtidorId, onSelectSurtidor, fechaInicio, fechaFin }) {
  if (stats.length === 0) return null;

  const selectedStat = stats.find(s => s.id === selectedSurtidorId);

  return (
    <div className="w-full mb-6">
      <div className="bg-white rounded-2xl shadow-md border-2 border-orange-100 p-5">
        <div className="flex items-center justify-between mb-4 border-b border-orange-100 pb-2">
          <div className="flex items-center gap-2">
            <span className="text-lg">🚛</span>
            <h3 className="font-black text-slate-800 text-sm tracking-wide uppercase">
              Control de Stock y Mermas de Surtidores
            </h3>
          </div>
          <span className="text-slate-400 text-xs font-semibold">
            {fechaInicio || fechaFin ? 'Período: ' + (fechaInicio || 'Inicio') + ' al ' + (fechaFin || 'Fin') : 'Todo el historial'}
          </span>
        </div>

        {selectedStat ? (
          // Vista detallada de un surtidor
          <div className="bg-orange-50/30 rounded-xl border border-orange-100 p-4">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h4 className="text-base font-black text-orange-800 flex items-center gap-2">
                  {selectedStat.nombre}
                  <span className="px-2 py-0.5 bg-orange-100 text-orange-700 text-xs font-bold rounded-lg border border-orange-200">
                    {selectedStat.patente}
                  </span>
                </h4>
                <p className="text-xs text-slate-500 mt-0.5">
                  {selectedStat.tipo} {selectedStat.marca ? '· ' + selectedStat.marca : ''} {selectedStat.modelo ? '· ' + selectedStat.modelo : ''}
                </p>
              </div>
              <button
                onClick={() => onSelectSurtidor('')}
                className="px-3 py-1 bg-white hover:bg-orange-100 border border-orange-200 text-orange-700 font-bold rounded-lg text-xs transition-all shadow-sm"
              >
                ✕ Mostrar Todos
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Stock actual */}
              <div className="bg-white rounded-xl border border-orange-100 p-4 shadow-sm flex flex-col justify-between">
                <div>
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block mb-1">Stock Actual (Remanente)</span>
                  <div className="text-2xl font-black text-slate-800">
                    {selectedStat.stockActual.toLocaleString('es-CL')} L
                  </div>
                </div>
                <div className="text-[10px] text-slate-500 mt-2 font-medium">
                  Saldo histórico acumulado
                </div>
              </div>

              {/* Ingresos en período */}
              <div className="bg-white rounded-xl border border-orange-100 p-4 shadow-sm flex flex-col justify-between">
                <div>
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block mb-1">Cargado en Período</span>
                  <div className="text-2xl font-black text-amber-600">
                    {selectedStat.totalIngresadoPeriodo.toLocaleString('es-CL')} L
                  </div>
                </div>
                <div className="text-[10px] text-slate-500 mt-2 font-medium">
                  {selectedStat.totalEntradasCount} cargas registradas
                </div>
              </div>

              {/* Entregas en período */}
              <div className="bg-white rounded-xl border border-orange-100 p-4 shadow-sm flex flex-col justify-between">
                <div>
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block mb-1">Despachado en Período</span>
                  <div className="text-2xl font-black text-blue-600">
                    {selectedStat.totalEntregadoPeriodo.toLocaleString('es-CL')} L
                  </div>
                </div>
                <div className="text-[10px] text-slate-500 mt-2 font-medium">
                  {selectedStat.totalEntregasCount} despachos a máquinas
                </div>
              </div>

              {/* Mermas/Desviación */}
              <div className="bg-white rounded-xl border border-orange-100 p-4 shadow-sm flex flex-col justify-between">
                <div>
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block mb-1">Desviación / Merma</span>
                  <div className={`text-2xl font-black ${selectedStat.desviacionPct > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                    {selectedStat.diferenciaPeriodo.toLocaleString('es-CL')} L
                  </div>
                </div>
                <div className={`text-[10px] font-bold mt-2 ${selectedStat.desviacionPct > 0 ? 'text-red-500' : 'text-emerald-500'}`}>
                  {selectedStat.desviacionPct > 0 ? '⚠️ Merma de ' : '✓ Desviación de '}{Math.abs(selectedStat.desviacionPct).toFixed(1)}%
                </div>
              </div>
            </div>
          </div>
        ) : (
          // Grilla de todos los surtidores
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {stats.map(s => {
              const statusColor = s.stockActual < 100 ? 'text-red-600 bg-red-50' : 'text-emerald-700 bg-emerald-50';
              return (
                <div
                  key={s.id}
                  onClick={() => onSelectSurtidor(s.id)}
                  className="bg-slate-50/50 hover:bg-orange-50/40 rounded-xl border border-slate-200 hover:border-orange-300 p-4 cursor-pointer transition-all shadow-sm group"
                >
                  <div className="flex justify-between items-start mb-2">
                    <div className="min-w-0">
                      <h4 className="font-bold text-slate-800 text-sm truncate group-hover:text-orange-700">
                        {s.nombre}
                      </h4>
                      <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-slate-200 text-slate-600 mt-1 inline-block">
                        {s.patente}
                      </span>
                    </div>
                    <div className={`px-2.5 py-1 rounded-lg text-xs font-black ${statusColor} text-right`}>
                      Stock: {s.stockActual.toLocaleString('es-CL')} L
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-slate-200/60 text-[10px]">
                    <div>
                      <span className="text-slate-400 block font-semibold uppercase">Cargado:</span>
                      <span className="font-bold text-slate-700">{s.totalIngresadoPeriodo.toLocaleString('es-CL')} L</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block font-semibold uppercase">Despachado:</span>
                      <span className="font-bold text-slate-700">{s.totalEntregadoPeriodo.toLocaleString('es-CL')} L</span>
                    </div>
                  </div>

                  {s.totalIngresadoPeriodo > 0 && (
                    <div className="mt-2 text-[10px] font-bold text-right">
                      <span className={s.desviacionPct > 0 ? 'text-red-500' : 'text-emerald-500'}>
                        Merma: {s.desviacionPct.toFixed(1)}% ({s.diferenciaPeriodo.toLocaleString('es-CL')} L)
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default function ReporteCombustible() {
  const { empresaId, empresa: tenantInfo } = useEmpresa();
  const { toast, toasts, removeToast } = useToast();
  const [reportes, setReportes] = useState([]);
  const [projects, setProjects] = useState([]);
  const [machines, setMachines] = useState([]);
  const [empleados, setEmpleados] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCombustibleModal, setShowCombustibleModal] = useState(false);
  const [showImporter, setShowImporter] = useState(false);
  const [userRole, setUserRole] = useState('operador');
  const [currentUser, setCurrentUser] = useState(null);
  const [reportesSeleccionados, setReportesSeleccionados] = useState([]);
  const [paginaActual, setPaginaActual] = useState(1);
  const ITEMS_POR_PAGINA = 50;
  const [reporteDetalle, setReporteDetalle] = useState(null);
  const [empresas, setEmpresas] = useState([]);
  const [estaciones, setEstaciones] = useState([]);
  const [equiposSurtidores, setEquiposSurtidores] = useState([]);
  const [activeSubTab, setActiveSubTab] = useState('registro'); // 'registro', 'surtidores', 'analisis'
  const [showFiltrosPanel, setShowFiltrosPanel] = useState(false);

  // Configuración de columnas de la tabla
  const todasLasColumnas = [
    { id: 'tipo', label: 'Tipo' },
    { id: 'fecha', label: 'Fecha' },
    { id: 'codigo', label: 'N° Reporte' },
    { id: 'folio', label: 'Folio' },
    { id: 'proyecto', label: 'Proyecto' },
    { id: 'empresa', label: 'Empresa' },
    { id: 'surtidor', label: 'Surtidor' },
    { id: 'maquina', label: 'Máquina' },
    { id: 'repartidor', label: 'Repartidor' },
    { id: 'receptor', label: 'Receptor' },
    { id: 'creadoPor', label: 'Creado por' },
    { id: 'horometro', label: 'Horómetro' },
    { id: 'litros', label: 'Litros' },
    { id: 'firmado', label: 'Firmado' },
    { id: 'voucher', label: 'Voucher' },
    { id: 'acciones', label: 'Acciones' }
  ];

  const [columnasVisibles, setColumnasVisibles] = useState([
    'tipo',
    'fecha',
    'proyecto',
    'empresa',
    'surtidor',
    'receptor',
    'creadoPor',
    'litros',
    'acciones'
  ]);
  const [showColSelector, setShowColSelector] = useState(false);
  const [searchColQuery, setSearchColQuery] = useState('');


  // Filtros
  const [filtros, setFiltros] = useState({
    mes: '',
    fechaInicio: '',
    fechaFin: '',
    tipo: '',
    proyecto: '',
    maquina: '',
    surtidor: '',
    receptor: '',
    folio: ''
  });

  // Limpiar filtros activos si su columna correspondiente es ocultada
  useEffect(() => {
    setFiltros(prev => {
      let changed = false;
      const next = { ...prev };
      if (!columnasVisibles.includes('fecha')) {
        if (next.fechaInicio || next.fechaFin) {
          next.fechaInicio = '';
          next.fechaFin = '';
          changed = true;
        }
      }
      if (!columnasVisibles.includes('proyecto')) {
        if (next.proyecto) {
          next.proyecto = '';
          changed = true;
        }
      }
      if (!columnasVisibles.includes('surtidor')) {
        if (next.surtidor) {
          next.surtidor = '';
          changed = true;
        }
      }
      if (!columnasVisibles.includes('maquina')) {
        if (next.maquina) {
          next.maquina = '';
          changed = true;
        }
      }
      if (!columnasVisibles.includes('receptor')) {
        if (next.receptor) {
          next.receptor = '';
          changed = true;
        }
      }
      if (!columnasVisibles.includes('folio')) {
        if (next.folio) {
          next.folio = '';
          changed = true;
        }
      }
      if (!columnasVisibles.includes('tipo')) {
        if (next.tipo) {
          next.tipo = '';
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [columnasVisibles]);

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
        const projectsRef = collection(db, 'empresas', empresaId, 'projects');
        const projectsSnap = await getDocs(projectsRef);
        const projectsData = projectsSnap.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setProjects(projectsData);

        // Cargar máquinas
        const machinesRef = collection(db, 'empresas', empresaId, 'machines');
        const machinesSnap = await getDocs(machinesRef);
        const machinesData = machinesSnap.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setMachines(machinesData);

        // Cargar empleados
        const empleadosRef = collection(db, 'empresas', empresaId, 'trabajadores');
        const empleadosSnap = await getDocs(empleadosRef);
        const empleadosData = empleadosSnap.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setEmpleados(empleadosData);

        // Cargar empresas de combustible
        const empresasRef = collection(db, 'empresas', empresaId, 'empresas_combustible');
        const empresasSnap = await getDocs(empresasRef);
        const empresasData = empresasSnap.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setEmpresas(empresasData);

        // Cargar estaciones de combustible
        const estacionesRef = collection(db, 'empresas', empresaId, 'estaciones_combustible');
        const estacionesSnap = await getDocs(estacionesRef);
        const estacionesData = estacionesSnap.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setEstaciones(estacionesData);

        // Cargar equipos surtidores (camiones)
        const equiposRef = collection(db, 'empresas', empresaId, 'equipos_surtidores');
        const equiposSnap = await getDocs(equiposRef);
        setEquiposSurtidores(equiposSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      } catch (error) {
        console.error("Error cargando datos base:", error);
      }
    };

    if (empresaId) cargarDatos();
  }, [empresaId]);

  // Cargar reportes
  useEffect(() => {
    const cargarReportes = async () => {
      setLoading(true);
      try {
        const reportesRef = collection(db, 'empresas', empresaId, 'reportes_combustible');
        const q = query(reportesRef, orderBy('fechaCreacion', 'desc'));
        const reportesSnap = await getDocs(q);
        const reportesData = reportesSnap.docs
          .map(doc => ({ id: doc.id, ...doc.data() }))
          .filter(r => !r.deleted);

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

    if (empresaId) cargarReportes();
  }, [empresaId, userRole]);

  // Función para recargar reportes después de crear uno nuevo
  const handleRecargarReportes = async () => {
    try {
      const reportesRef = collection(db, 'empresas', empresaId, 'reportes_combustible');
      const q = query(reportesRef, orderBy('fechaCreacion', 'desc'));
      const reportesSnap = await getDocs(q);
      const reportesData = reportesSnap.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .filter(r => !r.deleted);
      setReportes(reportesData);

      const surtidoresUnicos = [...new Set(reportesData.map(r => r.repartidorId).filter(Boolean))];
      setSurtidores(surtidoresUnicos);
    } catch (error) {
      console.error("Error recargando reportes:", error);
    }
  };

  const writeAuditLog = (action, docId, docData) => {
    const entry = {
      action,
      docId,
      collection: 'reportes_combustible',
      userId: currentUser?.uid || '',
      userEmail: currentUser?.email || '',
      userRole,
      docData,
      timestamp: serverTimestamp(),
    };
    addDoc(collection(db, 'empresas', empresaId, 'audit_log'), entry).catch(err =>
      console.error('audit_log write failed:', err)
    );
  };


  // Filtrar reportes
  const reportesFiltrados = useMemo(() => {
    let resultado = [...reportes];

    if (filtros.mes) {
      resultado = resultado.filter(r => (r.fecha || '').startsWith(filtros.mes));
    }

    if (filtros.fechaInicio) {
      resultado = resultado.filter(r => r.fecha >= filtros.fechaInicio);
    }

    if (filtros.fechaFin) {
      resultado = resultado.filter(r => r.fecha <= filtros.fechaFin);
    }

    if (filtros.tipo) {
      resultado = resultado.filter(r => r.tipo === filtros.tipo);
    }

    if (filtros.proyecto) {
      resultado = resultado.filter(r => r.projectId === filtros.proyecto);
    }

    if (filtros.maquina) {
      const norm = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
      const words = norm(filtros.maquina).split(/\s+/).filter(Boolean);
      resultado = resultado.filter(r => {
        let m = null;
        if (r.tipo === 'entrada' && r.datosEntrada) {
          m = machines.find(ma => ma.id === r.datosEntrada.machineId)
            || equiposSurtidores.find(ma => ma.id === r.datosEntrada.machineId);
        } else if (r.tipo === 'entrega' && r.datosEntrega) {
          m = machines.find(ma => ma.id === r.datosEntrega.machineId);
        }
        if (!m) return false;

        const patent = m.patente || m.code || '';
        const name = m.nombre || m.name || '';
        const model = m.modelo || '';
        const brand = m.marca || '';
        const type = m.type || '';
        const label = [patent, name, model, brand, type].join(' ');
        const haystack = norm(label);

        return words.every(w => haystack.includes(w));
      });
    }

    if (filtros.surtidor) {
      resultado = resultado.filter(r => {
        if (r.tipo === 'entrega') {
          return r.datosControl?.equipoSurtidorId === filtros.surtidor;
        } else if (r.tipo === 'entrada') {
          return r.datosEntrada?.machineId === filtros.surtidor;
        }
        return false;
      });
    }

    if (filtros.receptor) {
      const norm = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
      const words = norm(filtros.receptor).split(/\s+/).filter(Boolean);
      resultado = resultado.filter(r => {
        const operadorId = r.datosEntrega?.operadorId || r.datosEntrada?.operadorId;
        const operador = operadorId ? empleados.find(e => e.id === operadorId) : null;
        const repartidor = empleados.find(e => e.id === r.repartidorId);
        const haystack = norm([
          r.datosEntrada?.receptorNombre,
          operador?.nombre,
          repartidor?.nombre,
          r.repartidorNombre,
          r.creadoPor,
        ].join(' '));
        return words.every(w => haystack.includes(w));
      });
    }

    if (filtros.folio) {
      resultado = resultado.filter(r =>
        String(r.folio || '').toLowerCase().includes(filtros.folio.toLowerCase())
      );
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
        machine = machines.find(m => m.id === r.datosEntrada.machineId)
          || equiposSurtidores.find(m => m.id === r.datosEntrada.machineId)
          || null;
        operador = empleados.find(e => e.id === r.datosEntrada.operadorId) || null;
      } else if (r.tipo === 'entrega' && r.datosEntrega) {
        machine = machines.find(m => m.id === r.datosEntrega.machineId);
        operador = empleados.find(e => e.id === r.datosEntrega.operadorId);
        cantidad = r.datosEntrega.cantidadLitros || 0;
      }

      let empresaNombre = '';
      if (r.tipo === 'entrega' && r.datosEntrega?.empresa) {
        const emp = empresas.find(e => e.id === r.datosEntrega.empresa);
        empresaNombre = emp?.nombre || r.datosEntrega.empresa;
      } else if (r.tipo === 'entrada' && r.datosEntrada?.origen) {
        const est = estaciones.find(e => e.id === r.datosEntrada.origen);
        const emp = empresas.find(e => e.id === r.datosEntrada.origen);
        if (est) {
          empresaNombre = (est.marca ? est.marca + ' - ' : '') + est.nombre + (est.ciudad ? ' (' + est.ciudad + ')' : '');
        } else {
          empresaNombre = emp?.nombre || r.datosEntrada.origen;
        }
      }

      let surtidorTruck = null;
      if (r.tipo === 'entrada' && r.datosEntrada?.destinoCarga === 'camion') {
        surtidorTruck = equiposSurtidores.find(m => m.id === r.datosEntrada.machineId);
      } else if (r.tipo === 'entrega' && r.datosControl?.equipoSurtidorId) {
        surtidorTruck = equiposSurtidores.find(m => m.id === r.datosControl.equipoSurtidorId);
      }

      const horometroOdometro = r.datosEntrega?.horometroOdometro
        || r.datosEntrada?.horometroOdometro
        || r.horometroOdometro
        || 0;

      return {
        ...r,
        projectName: project?.name || r.projectId || '',
        empresaNombre,
        machinePatente: machine?.patente || '',
        machineName: machine?.nombre || machine?.name
          || (machine?.type && machine?.marca ? `${machine.type} - ${machine.marca}` : machine?.modelo || ''),
        surtidorPatente: surtidorTruck?.patente || '',
        surtidorName: surtidorTruck?.nombre || surtidorTruck?.name || '',
        repartidorNombre: repartidor?.nombre || r.repartidorNombre || '',
        repartidorRut: repartidor?.rut || r.repartidorRut || '',
        operadorNombre: operador?.nombre || r.datosEntrada?.receptorNombre || r.operadorNombre || '',
        operadorRut: operador?.rut || r.operadorRut || '',
        receptorNombre: r.datosEntrada?.receptorNombre || '',
        cantidad: cantidad,
        horometroOdometro,
        tipo: r.tipo || 'entrada'
      };
    });
  }, [filtros, reportes, projects, machines, empleados, empresas, estaciones, equiposSurtidores]);

  const activeFiltersCount = useMemo(() => {
    return Object.values(filtros).filter(Boolean).length;
  }, [filtros]);

  const mesesDisponibles = useMemo(() => {
    const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    const set = new Set();
    reportes.forEach(r => { if (r.fecha?.length >= 7) set.add(r.fecha.substring(0, 7)); });
    return [...set].sort().reverse().map(val => {
      const [y, m] = val.split('-');
      return { val, label: `${MESES[parseInt(m, 10) - 1]} ${y}` };
    });
  }, [reportes]);

  const surtidoresStats = useMemo(() => {
    return equiposSurtidores.map(s => {
      // Entradas históricas (All-Time) para calcular el stock actual real
      const entradasHist = reportes.filter(r => r.tipo === 'entrada' && r.datosEntrada?.machineId === s.id);
      const totalIngresadoAllTime = entradasHist.reduce((sum, r) => sum + (parseFloat(r.datosEntrada?.cantidad) || 0), 0);

      // Entregas históricas (All-Time)
      const entregasHist = reportes.filter(r => r.tipo === 'entrega' && r.datosControl?.equipoSurtidorId === s.id);
      const totalEntregadoAllTime = entregasHist.reduce((sum, r) => sum + (parseFloat(r.datosEntrega?.cantidadLitros) || 0), 0);

      // Stock actual real (All-time balance)
      const stockActual = totalIngresadoAllTime - totalEntregadoAllTime;

      // --- Período Filtrado (según las fechas Desde/Hasta seleccionadas) ---
      const entradasPeriodo = entradasHist.filter(r => {
        if (filtros.fechaInicio && r.fecha < filtros.fechaInicio) return false;
        if (filtros.fechaFin && r.fecha > filtros.fechaFin) return false;
        return true;
      });
      const totalIngresadoPeriodo = entradasPeriodo.reduce((sum, r) => sum + (parseFloat(r.datosEntrada?.cantidad) || 0), 0);

      const entregasPeriodo = entregasHist.filter(r => {
        if (filtros.fechaInicio && r.fecha < filtros.fechaInicio) return false;
        if (filtros.fechaFin && r.fecha > filtros.fechaFin) return false;
        return true;
      });
      const totalEntregadoPeriodo = entregasPeriodo.reduce((sum, r) => sum + (parseFloat(r.datosEntrega?.cantidadLitros) || 0), 0);

      // Mermas/Desviación en el período
      // Diferencia = Lo que entró al camión - Lo que salió del camión
      const diferenciaPeriodo = totalIngresadoPeriodo - totalEntregadoPeriodo;
      const desviacionPct = totalIngresadoPeriodo > 0
        ? (diferenciaPeriodo / totalIngresadoPeriodo) * 100
        : 0;

      return {
        id: s.id,
        nombre: s.nombre || s.name || 'Sin nombre',
        patente: s.patente || s.code || 'Sin patente',
        marca: s.marca || '',
        modelo: s.modelo || '',
        tipo: s.tipo || '',
        stockActual,
        totalIngresadoPeriodo,
        totalEntregadoPeriodo,
        diferenciaPeriodo,
        desviacionPct,
        totalEntradasCount: entradasPeriodo.length,
        totalEntregasCount: entregasPeriodo.length
      };
    });
  }, [equiposSurtidores, reportes, filtros.fechaInicio, filtros.fechaFin]);

  const isAdmin = userRole === 'superadmin' || userRole === 'admin_contrato';

  const handleEliminar = async (id) => {
    if (!window.confirm("¿Eliminar este reporte? Quedará oculto pero no se borrará definitivamente.")) return;

    const reporte = reportes.find(r => r.id === id);
    try {
      setLoading(true);
      await updateDoc(doc(db, 'empresas', empresaId, 'reportes_combustible', id), {
        deleted: true,
        deletedAt: serverTimestamp(),
        deletedBy: { uid: currentUser?.uid || '', email: currentUser?.email || '', role: userRole },
      });
      writeAuditLog('delete', id, reporte);
      await handleRecargarReportes();
      toast({ type: 'success', message: 'Reporte eliminado exitosamente' });
      setLoading(false);
    } catch (error) {
      console.error("Error eliminando:", error);
      toast({ type: 'error', message: 'Error al eliminar el reporte' });
      setLoading(false);
    }
  };

  const handleEliminarSeleccionados = async () => {
    if (reportesSeleccionados.length === 0) return;
    if (!window.confirm(`¿Eliminar ${reportesSeleccionados.length} reporte(s) seleccionado(s)?`)) return;

    const reportesAEliminar = reportes.filter(r => reportesSeleccionados.includes(r.id));
    try {
      setLoading(true);
      await Promise.all(
        reportesAEliminar.map(r =>
          updateDoc(doc(db, 'empresas', empresaId, 'reportes_combustible', r.id), {
            deleted: true,
            deletedAt: serverTimestamp(),
            deletedBy: { uid: currentUser?.uid || '', email: currentUser?.email || '', role: userRole },
          })
        )
      );
      reportesAEliminar.forEach(r => writeAuditLog('delete', r.id, r));
      setReportesSeleccionados([]);
      await handleRecargarReportes();
      toast({ type: 'success', message: `${reportesAEliminar.length} reporte(s) eliminado(s)` });
      setLoading(false);
    } catch (error) {
      console.error("Error eliminando:", error);
      toast({ type: 'error', message: 'Error al eliminar reportes' });
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

  const handleReimprimirVoucher = async (reporte) => {
    const isEntrada = reporte.tipo === 'entrada';
    const project = projects.find(p => p.id === reporte.projectId);

    let finalEmpresaInfo, finalOperadorInfo, finalRepartidorInfo, finalMachineInfo, finalEquipoSurtidorInfo;

    // --- LOGICA PARA ENTRADA (RECEPCION) ---
    if (isEntrada) {
      // EMPRESA: Siempre es MPF (quien recibe internamente)
      finalEmpresaInfo = { nombre: 'MPF INGENIERIA CIVIL SPA', rut: '77.158.216-8' };

      // RECEPTOR: El trabajador que registró el movimiento (repartidorId)
      const trabajador = empleados.find(e => e.id === reporte.repartidorId) || {
        nombre: reporte.repartidorNombre || '',
        rut: reporte.repartidorRut || ''
      };
      finalOperadorInfo = { nombre: trabajador.nombre, rut: trabajador.rut };

      // SURTIDOR: La empresa proveedora (Estación o Tercero)
      finalRepartidorInfo = {
        nombre: reporte.empresaProveedora || reporte.datosEntrada?.origen || 'ESTACIÓN DE SERVICIO',
        rut: ''
      };

      // MAQUINA: El equipo que recibió el combustible
      const mId = reporte.datosEntrada?.machineId;
      const m = machines.find(ma => ma.id === mId) || equiposSurtidores.find(ma => ma.id === mId);
      finalMachineInfo = {
        patente: m?.patente || m?.code || '',
        code: m?.code || m?.patente || '',
        type: m?.type || m?.nombre || '',
        nombre: m?.name || m?.nombre || ''
      };
      finalEquipoSurtidorInfo = null;

    } else {
      // --- LOGICA PARA ENTREGA (SALIDA) ---
      const equipoId = reporte.datosControl?.equipoSurtidorId;
      const equipoSurtidor = equipoId ? (equiposSurtidores.find(m => m.id === equipoId) || machines.find(m => m.id === equipoId)) : null;

      const machineId = reporte.datosEntrega?.machineId;
      const operadorId = reporte.datosEntrega?.operadorId;

      const machineInfo = machines.find(m => m.id === machineId) || {
        patente: reporte.datosEntrega?.machinePatente || reporte.machinePatente || '',
        code: reporte.datosEntrega?.machineCode || '',
        type: reporte.datosEntrega?.machineType || '',
        nombre: reporte.datosEntrega?.machineName || reporte.machineName || '',
        name: reporte.datosEntrega?.machineName || reporte.machineName || ''
      };

      const operadorInfo = empleados.find(e => e.id === operadorId) || {
        nombre: reporte.datosEntrega?.operadorExterno?.nombre || reporte.operadorNombre || '',
        rut: reporte.datosEntrega?.operadorExterno?.rut || reporte.operadorRut || ''
      };

      const empresaIdLocal = reporte.datosEntrega?.empresa;
      const empresaInfoFirebase = empresas.find(e => e.id === empresaIdLocal);
      const empresaRut = empresaInfoFirebase?.rut || reporte.datosEntrega?.empresaRut || reporte.empresaRut || '';

      finalEmpresaInfo = empresaInfoFirebase
        ? { nombre: empresaInfoFirebase.nombre || '', rut: empresaRut }
        : empresaIdLocal ? { nombre: empresaIdLocal, rut: empresaRut } : null;

      finalOperadorInfo = {
        nombre: operadorInfo?.nombre || '',
        rut: operadorInfo?.rut || ''
      };

      finalRepartidorInfo = {
        nombre: reporte.repartidorNombre || '',
        rut: reporte.repartidorRut || ''
      };

      finalMachineInfo = {
        patente: machineInfo?.patente || '',
        code: machineInfo?.code || machineInfo?.patente || '',
        type: machineInfo?.type || machineInfo?.nombre || '',
        nombre: machineInfo?.name || machineInfo?.nombre || ''
      };

      finalEquipoSurtidorInfo = equipoSurtidor ? {
        nombre: equipoSurtidor.name || equipoSurtidor.nombre || '',
        patente: equipoSurtidor.patente || equipoSurtidor.code || '',
        tipo: equipoSurtidor.type || equipoSurtidor.tipo || ''
      } : null;
    }

    // ✅ Número de guía correlativo
    let numeroGuia = reporte.numeroGuia || null;
    if (!numeroGuia) {
      numeroGuia = await getNextGuiaNumber(empresaId);
      try {
        await updateDoc(doc(db, 'empresas', empresaId, 'reportes_combustible', reporte.id), { numeroGuia });
      } catch (_) { }
    }

    printThermalVoucher({
      reportData: {
        fecha: reporte.fecha || reporte.fechaCreacion?.split('T')[0] || '',
        cantidadLitros: reporte.datosEntrega?.cantidadLitros || reporte.datosEntrada?.cantidad || reporte.cantidadLitros || 0,
        numeroReporte: reporte.numeroReporte || '',
        firmaReceptor: reporte.firmaReceptor,
        firmaRepartidor: reporte.firmaRepartidor,
        horometroOdometro: reporte.datosEntrega?.horometroOdometro || reporte.datosEntrada?.horometroOdometro || ''
      },
      projectName: project?.nombre || project?.name || reporte.projectId || '',
      machineInfo: finalMachineInfo,
      operadorInfo: finalOperadorInfo,
      empresaInfo: finalEmpresaInfo,
      tenantInfo,
      repartidorInfo: finalRepartidorInfo,
      equipoSurtidorInfo: finalEquipoSurtidorInfo,
      numeroGuiaCorrelativo: numeroGuia
    });
  };

  const todosSeleccionados = reportesFiltrados.length > 0 && reportesSeleccionados.length === reportesFiltrados.length;

  const descargarExcel = () => {
    if (reportesFiltrados.length === 0) {
      toast({ type: 'warning', message: 'No hay reportes para exportar' });
      return;
    }

    const datosExcel = reportesFiltrados.map(r => {
      const row = {};
      if (columnasVisibles.includes('tipo')) row['Tipo'] = r.tipo === 'entrada' ? 'Entrada' : 'Salida';
      if (columnasVisibles.includes('fecha')) row['Fecha'] = r.fecha;
      if (columnasVisibles.includes('codigo')) row['N° Reporte'] = r.numeroReporte;
      if (columnasVisibles.includes('folio')) row['Folio'] = r.folio || '';
      if (columnasVisibles.includes('proyecto')) row['Proyecto'] = r.projectName || '';
      if (columnasVisibles.includes('empresa')) row['Empresa'] = r.empresaNombre || '';
      if (columnasVisibles.includes('surtidor')) row['Surtidor'] = r.surtidorPatente ? `${r.surtidorPatente} - ${r.surtidorName}` : '';
      if (columnasVisibles.includes('maquina')) row['Máquina'] = r.machinePatente ? `${r.machinePatente} - ${r.machineName}` : '';
      if (columnasVisibles.includes('repartidor')) row['Repartidor'] = r.repartidorNombre || '';
      if (columnasVisibles.includes('receptor')) row['Receptor'] = r.operadorNombre || '';
      if (columnasVisibles.includes('creadoPor')) row['Creado por'] = r.creadoPor || '';
      if (columnasVisibles.includes('horometro')) row['Horómetro'] = r.horometroOdometro || '';
      if (columnasVisibles.includes('litros')) row['Combustible (lts)'] = r.cantidad || 0;
      return row;
    });

    const ws = XLSX.utils.json_to_sheet(datosExcel);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Reportes Combustible');

    XLSX.writeFile(wb, `Reportes_Combustible_${new Date().toISOString().split('T')[0]}.xlsx`);
  };


  // PDF Detallado por reporte seleccionado
  const descargarPDFDetallado = () => {
    if (reportesSeleccionados.length === 0) {
      toast({ type: 'warning', message: 'Seleccione al menos un reporte' });
      return;
    }

    const doc = new jsPDF('p', 'mm', 'a4');
    const reportesAGenerar = reportesFiltrados.filter(r => reportesSeleccionados.includes(r.id));

    reportesAGenerar.forEach((reporte, index) => {
      if (index > 0) doc.addPage();

      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 20;
      const contentWidth = pageWidth - margin * 2;
      let yPos = margin;

      // ── HEADER ──────────────────────────────────────────────
      doc.setFillColor(194, 57, 43); // Granate/Naranja
      doc.rect(0, 0, pageWidth, 45, 'F');

      // Logo placeholder
      doc.setFillColor(255, 255, 255);
      doc.roundedRect(margin, 10, 35, 25, 2, 2, 'F');
      doc.setFontSize(7);
      doc.setTextColor(194, 57, 43);
      doc.setFont(undefined, 'bold');
      doc.text('MPF', margin + 12, 18);
      doc.setFontSize(5);
      doc.text('INGENIERÍA', margin + 9, 23);
      doc.text('CIVIL', margin + 13, 27);

      // Título
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(18);
      doc.setFont(undefined, 'bold');
      doc.text('CONTROL DE COMBUSTIBLE', margin + 45, 20);
      doc.setFontSize(10);
      doc.setFont(undefined, 'normal');
      const tipoLabel = reporte.tipo === 'entrada' ? 'ENTRADA AL ESTANQUE' : 'SALIDA A MÁQUINA';
      doc.text(tipoLabel, margin + 45, 27);
      doc.setFontSize(8);
      doc.text(`Fecha: ${reporte.fecha || reporte.fechaCreacion?.split('T')[0] || ''}`, margin + 45, 33);
      doc.text(`Proyecto: ${reporte.projectName || ''}`, margin + 45, 38);

      // Badge tipo
      const badgeColor = reporte.tipo === 'entrada' ? [234, 179, 8] : [249, 115, 22];
      doc.setFillColor(...badgeColor);
      doc.roundedRect(pageWidth - margin - 35, 12, 33, 10, 2, 2, 'F');
      doc.setFontSize(8);
      doc.setFont(undefined, 'bold');
      doc.setTextColor(255, 255, 255);
      doc.text(reporte.tipo === 'entrada' ? 'ENTRADA' : 'SALIDA', pageWidth - margin - 31, 18);

      yPos = 55;

      // ── INFORMACIÓN DEL SURTIDOR ───────────────────────────
      doc.setDrawColor(209, 213, 219);
      doc.setLineWidth(0.5);
      doc.line(margin, yPos, pageWidth - margin, yPos);
      yPos += 8;

      doc.setFontSize(11);
      doc.setFont(undefined, 'bold');
      doc.setTextColor(194, 57, 43);
      doc.text('INFORMACIÓN DEL CONTROL', margin, yPos);
      yPos += 7;

      const colWidth = contentWidth / 2;

      // Col izquierda - Surtidor
      doc.setFontSize(8);
      doc.setFont(undefined, 'bold');
      doc.setTextColor(107, 114, 128);
      doc.text('REPARTIDOR / SURTIDOR', margin, yPos);
      doc.setFont(undefined, 'normal');
      doc.setTextColor(55, 65, 81);
      doc.setFontSize(9);
      doc.text(`Nombre: ${reporte.repartidorNombre || 'N/A'}`, margin, yPos + 6);
      doc.text(`RUT: ${reporte.repartidorRut || 'N/A'}`, margin, yPos + 12);

      // Col derecha - Equipo surtidor
      doc.setFontSize(8);
      doc.setFont(undefined, 'bold');
      doc.setTextColor(107, 114, 128);
      doc.text('EQUIPO SURTIDOR', margin + colWidth, yPos);
      doc.setFont(undefined, 'normal');
      doc.setTextColor(55, 65, 81);
      doc.setFontSize(9);
      const equipoId = reporte.datosControl?.equipoSurtidorId;
      const equipoSurtidor = equipoId ? machines.find(m => m.id === equipoId) : null;
      doc.text(`Equipo: ${equipoSurtidor?.name || equipoSurtidor?.patente || 'No especificado'}`, margin + colWidth, yPos + 6);
      doc.text(`Obra: ${reporte.projectName || 'N/A'}`, margin + colWidth, yPos + 12);

      yPos += 22;

      // ── DETALLES ESPECÍFICOS ───────────────────────────────
      doc.setDrawColor(209, 213, 219);
      doc.line(margin, yPos, pageWidth - margin, yPos);
      yPos += 8;

      doc.setFontSize(11);
      doc.setFont(undefined, 'bold');
      doc.setTextColor(194, 57, 43);
      doc.text(reporte.tipo === 'entrada' ? 'DATOS DE ENTRADA' : 'DATOS DE ENTREGA', margin, yPos);
      yPos += 10;

      if (reporte.tipo === 'entrada' && reporte.datosEntrada) {
        const d = reporte.datosEntrada;
        // Caja cantidad litros
        doc.setFillColor(255, 247, 237);
        doc.roundedRect(margin, yPos, contentWidth, 30, 2, 2, 'F');
        doc.setDrawColor(249, 115, 22);
        doc.setLineWidth(0.5);
        doc.roundedRect(margin, yPos, contentWidth, 30, 2, 2, 'S');

        doc.setFontSize(24);
        doc.setFont(undefined, 'bold');
        doc.setTextColor(194, 65, 12);
        doc.text(`${d.cantidad || 0} L`, pageWidth / 2, yPos + 18, { align: 'center' });
        doc.setFontSize(8);
        doc.setFont(undefined, 'normal');
        doc.setTextColor(107, 114, 128);
        doc.text('LITROS INGRESADOS AL ESTANQUE', pageWidth / 2, yPos + 25, { align: 'center' });

        yPos += 38;

        // Datos adicionales entrada
        doc.setFontSize(9);
        doc.setFont(undefined, 'normal');
        doc.setTextColor(55, 65, 81);
        if (d.proveedor) doc.text(`Proveedor: ${d.proveedor}`, margin, yPos);
        if (d.nDocumento) doc.text(`N° Documento: ${d.nDocumento}`, margin + colWidth, yPos);
        if (d.proveedor || d.nDocumento) yPos += 8;
        if (d.observaciones) {
          doc.text(`Observaciones: ${d.observaciones}`, margin, yPos);
          yPos += 8;
        }

      } else if (reporte.tipo === 'entrega' && reporte.datosEntrega) {
        const d = reporte.datosEntrega;
        const machine = machines.find(m => m.id === d.machineId);
        const operador = empleados.find(e => e.id === d.operadorId);

        // Fila máquina + operador
        doc.setFontSize(8);
        doc.setFont(undefined, 'bold');
        doc.setTextColor(107, 114, 128);
        doc.text('MÁQUINA RECEPTORA', margin, yPos);
        doc.text('RECEPTOR', margin + colWidth, yPos);
        yPos += 5;

        doc.setFont(undefined, 'normal');
        doc.setTextColor(55, 65, 81);
        doc.setFontSize(9);
        doc.text(`Patente: ${machine?.patente || d.machineId || 'N/A'}`, margin, yPos);
        doc.text(`Nombre: ${machine?.name || 'N/A'}`, margin, yPos + 6);
        doc.text(`Horómetro: ${d.horometroOdometro || '0'} hrs`, margin, yPos + 12);
        doc.text(`Nombre: ${operador?.nombre || 'N/A'}`, margin + colWidth, yPos);
        doc.text(`RUT: ${operador?.rut || 'N/A'}`, margin + colWidth, yPos + 6);
        yPos += 20;

        // Caja litros
        doc.setFillColor(255, 247, 237);
        doc.roundedRect(margin, yPos, contentWidth, 30, 2, 2, 'F');
        doc.setDrawColor(249, 115, 22);
        doc.setLineWidth(0.5);
        doc.roundedRect(margin, yPos, contentWidth, 30, 2, 2, 'S');

        doc.setFontSize(24);
        doc.setFont(undefined, 'bold');
        doc.setTextColor(194, 65, 12);
        doc.text(`${d.cantidadLitros || 0} L`, pageWidth / 2, yPos + 18, { align: 'center' });
        doc.setFontSize(8);
        doc.setFont(undefined, 'normal');
        doc.setTextColor(107, 114, 128);
        doc.text('LITROS SALIDA A MÁQUINA', pageWidth / 2, yPos + 25, { align: 'center' });

        yPos += 38;
        if (d.observaciones) {
          doc.setFontSize(9);
          doc.setFont(undefined, 'normal');
          doc.setTextColor(55, 65, 81);
          doc.text(`Observaciones: ${d.observaciones}`, margin, yPos);
          yPos += 10;
        }
      }

      // ── FIRMA Y VALIDACIÓN ─────────────────────────────────
      if (reporte.firmado) {
        if (yPos > pageHeight - 40) { doc.addPage(); yPos = margin; }

        doc.setFillColor(236, 253, 245);
        doc.roundedRect(margin, yPos, contentWidth, 30, 2, 2, 'F');
        doc.setDrawColor(16, 185, 129);
        doc.setLineWidth(1);
        doc.roundedRect(margin, yPos, contentWidth, 30, 2, 2, 'S');

        doc.setFillColor(16, 185, 129);
        doc.circle(margin + 8, yPos + 10, 5, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(10);
        doc.setFont(undefined, 'bold');
        doc.text('✓', margin + 6, yPos + 12);

        doc.setFontSize(10);
        doc.setFont(undefined, 'bold');
        doc.setTextColor(16, 185, 129);
        doc.text('REPORTE VALIDADO', margin + 18, yPos + 8);

        doc.setFontSize(8);
        doc.setFont(undefined, 'normal');
        doc.setTextColor(55, 65, 81);
        if (reporte.firmaAdmin) {
          doc.text(`Validado por: ${reporte.firmaAdmin.nombre}`, margin + 18, yPos + 15);
          doc.text(`Fecha: ${new Date(reporte.firmaAdmin.timestamp).toLocaleString('es-CL')}`, margin + 18, yPos + 21);
        }
        doc.setFontSize(6);
        doc.setTextColor(107, 114, 128);
        doc.text('Documento validado digitalmente.', margin + 18, yPos + 27);
      }
    });

    doc.save(`Reportes_Combustible_Detallado_${new Date().toISOString().split('T')[0]}.pdf`);
    setReportesSeleccionados([]);
  };

  const descargarPDF = () => {
    if (reportesFiltrados.length === 0) {
      toast({ type: 'warning', message: 'No hay reportes para exportar' });
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

    const headersMap = {
      tipo: 'Tipo',
      fecha: 'Fecha',
      codigo: 'N° Reporte',
      folio: 'Folio',
      proyecto: 'Proyecto',
      empresa: 'Empresa',
      surtidor: 'Surtidor',
      maquina: 'Máquina',
      repartidor: 'Repartidor',
      receptor: 'Receptor',
      creadoPor: 'Creado por',
      horometro: 'Horómetro',
      litros: 'Litros',
      firmado: 'Firmado'
    };

    // Filter headers to only include visible ones
    const activeHeaderKeys = columnasVisibles.filter(k => headersMap[k]);
    const headers = activeHeaderKeys.map(k => headersMap[k]);

    // Format body data based on active headers
    const tableData = reportesFiltrados.map(r => {
      return activeHeaderKeys.map(k => {
        if (k === 'tipo') return r.tipo === 'entrada' ? 'Entrada' : 'Salida';
        if (k === 'fecha') return r.fecha ? new Date(r.fecha + 'T00:00:00').toLocaleDateString('es-CL') : '-';
        if (k === 'codigo') return r.codigo || '-';
        if (k === 'folio') return r.folio || '-';
        if (k === 'proyecto') return r.projectName || '-';
        if (k === 'empresa') return r.empresaNombre || '-';
        if (k === 'surtidor') return r.surtidorPatente ? `${r.surtidorPatente} - ${r.surtidorName}` : '-';
        if (k === 'maquina') return r.machinePatente ? `${r.machinePatente} - ${r.machineName}` : '-';
        if (k === 'repartidor') return r.repartidorNombre || '-';
        if (k === 'receptor') return r.operadorNombre || '-';
        if (k === 'creadoPor') return r.creadoPor || '-';
        if (k === 'horometro') return r.horometroOdometro ? Number(r.horometroOdometro).toLocaleString('es-CL') : '-';
        if (k === 'litros') return r.cantidad ? `${Number(r.cantidad).toLocaleString('es-CL')} L` : '0 L';
        if (k === 'firmado') return (r.firmaRepartidor || r.firmaReceptor) ? 'Sí' : 'No';
        return '-';
      });
    });

    autoTable(doc, {
      head: [headers],
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
    <>
      <ToastContainer toasts={toasts} onRemove={removeToast} />
      {/* Header minimalista inline */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-black text-slate-800 tracking-tight flex items-center gap-2">
            ⛽ Reportes de Combustible
          </h1>
          <p className="text-slate-500 text-sm mt-0.5">Control y gestión de ingresos y despachos de combustible</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowImporter(true)}
            className="px-4 py-2.5 bg-white border-2 border-slate-200 hover:border-orange-400 text-slate-600 hover:text-orange-600 font-bold rounded-xl transition-all flex items-center gap-2 text-sm"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            Importar Excel
          </button>
          <button
            onClick={() => setShowCombustibleModal(true)}
            className="px-5 py-2.5 bg-gradient-to-r from-orange-600 to-orange-700 hover:from-orange-500 hover:to-orange-600 text-white font-bold rounded-xl transition-all shadow-md hover:shadow-lg flex items-center justify-center gap-2 text-sm"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
            </svg>
            Crear Reporte
          </button>
        </div>
      </div>

      {/* Sub-tabs de Navegación */}
      <div className="flex border-b border-orange-200 gap-1 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
        <button
          onClick={() => setActiveSubTab("registro")}
          className={`flex items-center gap-2 px-6 py-2.5 font-black text-xs sm:text-sm transition-all border-b-4 -mb-[2px] ${activeSubTab === "registro"
            ? "border-orange-600 text-orange-600 font-extrabold"
            : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300"
            }`}
        >
          📋 Historial de Registros
        </button>
        <button
          onClick={() => setActiveSubTab("surtidores")}
          className={`flex items-center gap-2 px-6 py-2.5 font-black text-xs sm:text-sm transition-all border-b-4 -mb-[2px] ${activeSubTab === "surtidores"
            ? "border-orange-600 text-orange-600 font-extrabold"
            : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300"
            }`}
        >
          🚛 Stock y Mermas de Surtidores
        </button>
        <button
          onClick={() => setActiveSubTab("analisis")}
          className={`flex items-center gap-2 px-6 py-2.5 font-black text-xs sm:text-sm transition-all border-b-4 -mb-[2px] ${activeSubTab === "analisis"
            ? "border-orange-600 text-orange-600 font-extrabold"
            : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300"
            }`}
        >
          📊 Análisis Gráfico
        </button>
      </div>

      {/* Fila de acciones de exportación y Filtros Toggle */}
      {activeSubTab === "registro" && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mt-6 mb-4 animate-fadeIn">
          {/* Exportadores y Columnas */}
          <div className="flex flex-wrap items-center gap-2">
            {reportesSeleccionados.length > 0 && (
              <button
                onClick={handleEliminarSeleccionados}
                className="px-3 py-2 rounded-xl bg-gradient-to-r from-slate-600 to-slate-700 hover:from-red-600 hover:to-red-700 text-white font-semibold text-xs transition-all shadow flex items-center gap-1.5"
                title="Eliminar reportes seleccionados (no se borran definitivamente)"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8l1 12a2 2 0 002 2h8a2 2 0 002-2L19 8" />
                </svg>
                Eliminar ({reportesSeleccionados.length})
              </button>
            )}
            <button
              onClick={descargarPDFDetallado}
              disabled={reportesSeleccionados.length === 0}
              className="px-3 py-2 rounded-xl bg-gradient-to-r from-slate-700 to-slate-900 hover:from-slate-600 hover:to-slate-800 text-white font-semibold text-xs disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow flex items-center gap-1.5"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              PDF Detallado {reportesSeleccionados.length > 0 && `(${reportesSeleccionados.length})`}
            </button>
            <button
              onClick={descargarExcel}
              disabled={reportesFiltrados.length === 0}
              className="px-3 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-semibold text-xs disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow flex items-center gap-1.5"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Excel
            </button>
            <button
              onClick={descargarPDF}
              disabled={reportesFiltrados.length === 0}
              className="px-3 py-2 rounded-xl bg-gradient-to-r from-rose-600 to-pink-600 hover:from-rose-500 hover:to-pink-500 text-white font-semibold text-xs disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow flex items-center gap-1.5"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              PDF
            </button>

            {/* Selector de Columnas */}
            <div className="relative">
              <button
                onClick={() => setShowColSelector(!showColSelector)}
                className="px-3 py-2 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold text-xs transition-all shadow flex items-center gap-1.5"
              >
                <svg className="w-4 h-4 text-orange-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
                </svg>
                Columnas
              </button>

              {showColSelector && (
                <>
                  {/* Backdrop para cerrar */}
                  <div className="fixed inset-0 z-40" onClick={() => setShowColSelector(false)}></div>

                  {/* Popover */}
                  <div className="absolute left-0 mt-2 w-72 max-w-[calc(100vw-2rem)] bg-white rounded-2xl shadow-2xl border-2 border-orange-100 z-50 p-4 max-h-[450px] flex flex-col">
                    {/* Buscador */}
                    <div className="relative mb-3">
                      <input
                        type="text"
                        placeholder="Buscar columna..."
                        value={searchColQuery}
                        onChange={(e) => setSearchColQuery(e.target.value)}
                        className="w-full pl-8 pr-2.5 py-1.5 border border-orange-200 rounded-lg text-xs focus:outline-none focus:border-orange-500 bg-orange-50/20"
                      />
                      <svg className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>
                    </div>

                    {/* Lista desplegable de opciones */}
                    <div className="space-y-0.5 overflow-y-auto pr-1 flex-1 max-h-48">
                      {todasLasColumnas
                        .filter(col => col.label.toLowerCase().includes(searchColQuery.toLowerCase()))
                        .map(col => {
                          const isSelected = columnasVisibles.includes(col.id);
                          return (
                            <label
                              key={col.id}
                              className="flex items-center justify-between px-2.5 py-2 hover:bg-orange-50 rounded-lg cursor-pointer transition-colors text-xs font-semibold text-slate-700"
                            >
                              <span className="flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => {
                                    if (isSelected) {
                                      setColumnasVisibles(prev => prev.filter(c => c !== col.id));
                                    } else {
                                      // Insertar en orden original
                                      const order = todasLasColumnas.map(c => c.id);
                                      setColumnasVisibles(prev => {
                                        const next = [...prev, col.id];
                                        return next.sort((a, b) => order.indexOf(a) - order.indexOf(b));
                                      });
                                    }
                                  }}
                                  className="w-3.5 h-3.5 rounded border-orange-300 text-orange-600 focus:ring-orange-500 cursor-pointer"
                                />
                                {col.label}
                              </span>
                            </label>
                          );
                        })}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Botón Toggle de Filtros */}
          <button
            onClick={() => setShowFiltrosPanel(!showFiltrosPanel)}
            className={`px-4 py-2 rounded-xl border text-xs font-bold transition-all flex items-center gap-2 ${showFiltrosPanel
              ? "bg-orange-100 border-orange-300 text-orange-800"
              : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
              }`}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
            </svg>
            Filtros {activeFiltersCount > 0 && (
              <span className="ml-1 px-1.5 py-0.5 bg-orange-600 text-white text-[9px] rounded-full font-black">
                {activeFiltersCount}
              </span>
            )}
          </button>
        </div>
      )}

      {/* Panel de Filtros Colapsable */}
      {activeSubTab === "registro" && showFiltrosPanel && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 space-y-4 my-4 animate-slideDown">
          {/* Grid de Filtros */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
            {/* Mes */}
            <div className="col-span-1 animate-fadeIn">
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Mes</label>
              <select
                value={filtros.mes}
                onChange={(e) => { setFiltros(prev => ({ ...prev, mes: e.target.value, fechaInicio: '', fechaFin: '' })); setPaginaActual(1); }}
                className="w-full px-3 py-2 border border-orange-200 rounded-xl text-sm focus:outline-none focus:border-orange-500 bg-orange-50/20 transition-all"
              >
                <option value="">Todos los meses</option>
                {mesesDisponibles.map(m => (
                  <option key={m.val} value={m.val}>{m.label}</option>
                ))}
              </select>
            </div>

            {/* Fecha Desde */}
            {columnasVisibles.includes('fecha') && (
              <div className="col-span-1 animate-fadeIn">
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Desde</label>
                <input
                  type="date"
                  value={filtros.fechaInicio}
                  onChange={(e) => {
                    const val = e.target.value;
                    setFiltros(prev => {
                      const next = { ...prev, fechaInicio: val };
                      if (val && prev.fechaFin && val > prev.fechaFin) {
                        next.fechaFin = val;
                      }
                      return next;
                    });
                    setPaginaActual(1);
                  }}
                  className="w-full px-3 py-2 border border-orange-200 rounded-xl text-sm focus:outline-none focus:border-orange-500 bg-orange-50/20 transition-all"
                />
              </div>
            )}

            {/* Fecha Hasta */}
            {columnasVisibles.includes('fecha') && (
              <div className="col-span-1 animate-fadeIn">
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Hasta</label>
                <input
                  type="date"
                  value={filtros.fechaFin}
                  onChange={(e) => {
                    const val = e.target.value;
                    setFiltros(prev => {
                      const next = { ...prev, fechaFin: val };
                      if (val && prev.fechaInicio && val < prev.fechaInicio) {
                        next.fechaInicio = val;
                      }
                      return next;
                    });
                    setPaginaActual(1);
                  }}
                  className="w-full px-3 py-2 border border-orange-200 rounded-xl text-sm focus:outline-none focus:border-orange-500 bg-orange-50/20 transition-all"
                />
              </div>
            )}

            {/* Proyecto */}
            {columnasVisibles.includes('proyecto') && (
              <div className="col-span-1 animate-fadeIn">
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Proyecto</label>
                <select
                  value={filtros.proyecto}
                  onChange={(e) => { setFiltros({ ...filtros, proyecto: e.target.value }); setPaginaActual(1); }}
                  className="w-full px-3 py-2 border border-orange-200 rounded-xl text-sm focus:outline-none focus:border-orange-500 bg-orange-50/20 transition-all"
                >
                  <option value="">Todos</option>
                  {projects.map(p => (
                    <option key={p.id} value={p.id}>{p.name || p.id}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Surtidor */}
            {columnasVisibles.includes('surtidor') && (
              <div className="col-span-1 animate-fadeIn">
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Surtidor</label>
                <select
                  value={filtros.surtidor}
                  onChange={(e) => { setFiltros({ ...filtros, surtidor: e.target.value }); setPaginaActual(1); }}
                  className="w-full px-3 py-2 border border-orange-200 rounded-xl text-sm focus:outline-none focus:border-orange-500 bg-orange-50/20 transition-all"
                >
                  <option value="">Todos</option>
                  {equiposSurtidores.map(s => {
                    const label = [
                      s.patente || s.code,
                      s.nombre || s.name,
                      s.modelo,
                      s.marca
                    ].filter(Boolean).join(' - ');
                    return (
                      <option key={s.id} value={s.id}>{label}</option>
                    );
                  })}
                </select>
              </div>
            )}

            {/* Máquina */}
            {columnasVisibles.includes('maquina') && (
              <div className="col-span-1 animate-fadeIn">
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Máquina</label>
                <input
                  type="text"
                  placeholder="Patente, modelo, marca..."
                  value={filtros.maquina}
                  onChange={(e) => { setFiltros({ ...filtros, maquina: e.target.value }); setPaginaActual(1); }}
                  className="w-full px-3 py-2 border border-orange-200 rounded-xl text-sm focus:outline-none focus:border-orange-500 bg-orange-50/20 transition-all"
                />
              </div>
            )}

            {/* Receptor */}
            {columnasVisibles.includes('receptor') && (
              <div className="col-span-1 animate-fadeIn">
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Receptor</label>
                <input
                  type="text"
                  placeholder="Nombre o apellido..."
                  value={filtros.receptor}
                  onChange={(e) => { setFiltros({ ...filtros, receptor: e.target.value }); setPaginaActual(1); }}
                  className="w-full px-3 py-2 border border-orange-200 rounded-xl text-sm focus:outline-none focus:border-orange-500 bg-orange-50/20 transition-all"
                />
              </div>
            )}

            {/* Folio */}
            {columnasVisibles.includes('folio') && (
              <div className="col-span-1 animate-fadeIn">
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Folio</label>
                <input
                  type="text"
                  placeholder="Buscar folio..."
                  value={filtros.folio}
                  onChange={(e) => { setFiltros({ ...filtros, folio: e.target.value }); setPaginaActual(1); }}
                  className="w-full px-3 py-2 border border-orange-200 rounded-xl text-sm focus:outline-none focus:border-orange-500 bg-orange-50/20 transition-all"
                />
              </div>
            )}

            {/* Tipo */}
            {columnasVisibles.includes('tipo') && (
              <div className="col-span-1 animate-fadeIn">
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Tipo</label>
                <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-0.5 border border-slate-200">
                  {[{ val: '', label: 'Todos' }, { val: 'entrada', label: 'Entrada' }, { val: 'entrega', label: 'Salida' }].map(opt => (
                    <button key={opt.val}
                      onClick={() => { setFiltros({ ...filtros, tipo: opt.val }); setPaginaActual(1); }}
                      className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-black transition-all ${filtros.tipo === opt.val
                        ? opt.val === 'entrada' ? 'bg-blue-600 text-white shadow'
                          : opt.val === 'entrega' ? 'bg-orange-500 text-white shadow'
                            : 'bg-white text-slate-700 shadow'
                        : 'text-slate-500 hover:text-slate-700'
                        }`}>
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Fila de Badges Activos / Resumen (Siempre visible si hay filtros activos o resultados) */}
      {activeSubTab === "registro" && (
        <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-2xl bg-white border border-slate-200/85 shadow-sm text-xs mb-6">
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mr-1">Filtros Activos:</span>
            {activeFiltersCount === 0 ? (
              <span className="text-slate-400 italic text-xs">Ninguno</span>
            ) : (
              Object.entries(filtros).map(([key, val]) => {
                if (!val) return null;
                let label = '';
                if (key === 'mes') label = `Mes: ${mesesDisponibles.find(m => m.val === val)?.label || val}`;
                else if (key === 'fechaInicio') label = `Desde: ${val}`;
                else if (key === 'fechaFin') label = `Hasta: ${val}`;
                else if (key === 'proyecto') label = `Proyecto: ${projects.find(p => p.id === val)?.name || val}`;
                else if (key === 'surtidor') label = `Surtidor: ${equiposSurtidores.find(s => s.id === val)?.patente || val}`;
                else if (key === 'maquina') label = `Máquina: ${val}`;
                else if (key === 'receptor') label = `Receptor: ${val}`;
                else if (key === 'folio') label = `Folio: ${val}`;
                else if (key === 'tipo') label = `Tipo: ${val === 'entrada' ? 'Entrada' : 'Salida'}`;
                return (
                  <span key={key} className="px-2.5 py-1 bg-orange-50 text-orange-700 rounded-xl text-[10px] font-bold border border-orange-100 flex items-center gap-1.5 shadow-sm animate-fadeIn">
                    {label}
                    <button onClick={() => setFiltros(prev => ({ ...prev, [key]: '' }))} className="hover:text-red-600 font-black">✕</button>
                  </span>
                );
              })
            )}
          </div>
          <div className="flex items-center gap-4 ml-auto">
            <span className="text-xs font-semibold text-slate-500">
              Resultados: <span className="px-2.5 py-1 bg-orange-100 text-orange-700 rounded-lg font-black text-sm">{reportesFiltrados.length}</span>
            </span>
            {activeFiltersCount > 0 && (
              <button
                onClick={() => { setFiltros({ fechaInicio: '', fechaFin: '', tipo: '', proyecto: '', maquina: '', surtidor: '', receptor: '', folio: '' }); setPaginaActual(1); }}
                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-xs font-bold transition-all flex items-center gap-1"
              >
                ✕ Limpiar Filtros
              </button>
            )}
          </div>
        </div>
      )}

      {/* Panel de Surtidores */}
      {activeSubTab === "surtidores" && (
        <SurtidoresStatsPanel
          stats={surtidoresStats}
          selectedSurtidorId={filtros.surtidor}
          onSelectSurtidor={(id) => {
            setFiltros(prev => ({ ...prev, surtidor: id }));
            if (id) {
              setActiveSubTab("registro");
            }
          }}
          fechaInicio={filtros.fechaInicio}
          fechaFin={filtros.fechaFin}
        />
      )}

      {/* Scroll mensual */}
      {activeSubTab === "registro" && mesesDisponibles.length > 0 && (
        <div className="flex items-center gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
          <button
            onClick={() => { setFiltros(prev => ({ ...prev, mes: '' })); setPaginaActual(1); }}
            className={`flex-shrink-0 px-4 py-1.5 rounded-full text-xs font-black transition-all border ${!filtros.mes ? 'bg-orange-600 text-white border-orange-600 shadow' : 'bg-white text-slate-500 border-slate-200 hover:border-orange-300 hover:text-orange-600'}`}
          >
            Todos
          </button>
          {mesesDisponibles.map(m => (
            <button
              key={m.val}
              onClick={() => { setFiltros(prev => ({ ...prev, mes: m.val, fechaInicio: '', fechaFin: '' })); setPaginaActual(1); }}
              className={`flex-shrink-0 px-4 py-1.5 rounded-full text-xs font-black transition-all border ${filtros.mes === m.val ? 'bg-orange-600 text-white border-orange-600 shadow' : 'bg-white text-slate-500 border-slate-200 hover:border-orange-300 hover:text-orange-600'}`}
            >
              {m.label}
            </button>
          ))}
        </div>
      )}

      {/* Tabla */}
      {activeSubTab === "registro" && (
        <div className="w-full animate-fadeIn">
          <div className="bg-white rounded-2xl shadow-lg overflow-hidden border-2 border-orange-100">
            <div className="overflow-x-auto w-full">
              <table className="w-full text-left border-collapse" style={{ minWidth: '1200px', tableLayout: 'auto' }}>
                <thead className="bg-gradient-to-r from-orange-600 via-orange-700 to-amber-700 text-white">
                  <tr>
                    <th className="px-3 py-4 text-center text-xs font-bold uppercase tracking-wider w-12 whitespace-nowrap">
                      <input
                        type="checkbox"
                        checked={todosSeleccionados}
                        onChange={toggleSeleccionarTodos}
                        className="w-4 h-4 rounded border-white/30 text-orange-600 focus:ring-2 focus:ring-white/50 cursor-pointer"
                      />
                    </th>
                    {columnasVisibles.includes('tipo') && (
                      <th className="px-3 py-4 text-left text-xs font-bold uppercase tracking-wider whitespace-nowrap">Tipo</th>
                    )}
                    {columnasVisibles.includes('fecha') && (
                      <th className="px-3 py-4 text-left text-xs font-bold uppercase tracking-wider whitespace-nowrap">Fecha</th>
                    )}
                    {columnasVisibles.includes('codigo') && (
                      <th className="px-3 py-4 text-left text-xs font-bold uppercase tracking-wider whitespace-nowrap">N° Reporte</th>
                    )}
                    {columnasVisibles.includes('folio') && (
                      <th className="px-3 py-4 text-left text-xs font-bold uppercase tracking-wider whitespace-nowrap">Folio</th>
                    )}
                    {columnasVisibles.includes('proyecto') && (
                      <th className="px-3 py-4 text-left text-xs font-bold uppercase tracking-wider whitespace-nowrap">Proyecto</th>
                    )}
                    {columnasVisibles.includes('empresa') && (
                      <th className="px-3 py-4 text-left text-xs font-bold uppercase tracking-wider whitespace-nowrap">Empresa</th>
                    )}
                    {columnasVisibles.includes('surtidor') && (
                      <th className="px-3 py-4 text-left text-xs font-bold uppercase tracking-wider whitespace-nowrap">Surtidor</th>
                    )}
                    {columnasVisibles.includes('maquina') && (
                      <th className="px-3 py-4 text-left text-xs font-bold uppercase tracking-wider whitespace-nowrap">Máquina</th>
                    )}
                    {columnasVisibles.includes('repartidor') && (
                      <th className="px-3 py-4 text-left text-xs font-bold uppercase tracking-wider whitespace-nowrap">Repartidor</th>
                    )}
                    {columnasVisibles.includes('receptor') && (
                      <th className="px-3 py-4 text-left text-xs font-bold uppercase tracking-wider whitespace-nowrap">Receptor</th>
                    )}
                    {columnasVisibles.includes('creadoPor') && (
                      <th className="px-3 py-4 text-left text-xs font-bold uppercase tracking-wider whitespace-nowrap">Creado por</th>
                    )}
                    {columnasVisibles.includes('horometro') && (
                      <th className="px-3 py-4 text-center text-xs font-bold uppercase tracking-wider whitespace-nowrap">Horómetro</th>
                    )}
                    {columnasVisibles.includes('litros') && (
                      <th className="px-3 py-4 text-center text-xs font-bold uppercase tracking-wider whitespace-nowrap">Litros</th>
                    )}
                    {columnasVisibles.includes('firmado') && (
                      <th className="px-3 py-4 text-center text-xs font-bold uppercase tracking-wider whitespace-nowrap">Firmado</th>
                    )}
                    {columnasVisibles.includes('voucher') && (
                      <th className="px-3 py-4 text-center text-xs font-bold uppercase tracking-wider whitespace-nowrap">Ver</th>
                    )}
                    {columnasVisibles.includes('acciones') && (
                      <th className="px-3 py-4 text-center text-xs font-bold uppercase tracking-wider whitespace-nowrap">Acciones</th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-orange-100">
                  {loading ? (
                    <tr>
                      <td colSpan={columnasVisibles.length + 1} className="px-4 py-12 text-center text-slate-500">
                        Cargando...
                      </td>
                    </tr>
                  ) : reportesFiltrados.length === 0 ? (
                    <tr>
                      <td colSpan={columnasVisibles.length + 1} className="px-4 py-12 text-center text-slate-500">
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
                    reportesFiltrados.slice((paginaActual - 1) * ITEMS_POR_PAGINA, paginaActual * ITEMS_POR_PAGINA).map((reporte, index) => (
                      <tr
                        key={reporte.id}
                        onClick={() => setReporteDetalle(reporte)}
                        className={`hover:bg-orange-50 transition-colors cursor-pointer ${index % 2 === 0 ? 'bg-white' : 'bg-orange-50/30'}`}
                        title="Click para ver detalle"
                      >
                        <td className="px-3 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={reportesSeleccionados.includes(reporte.id)}
                            onChange={() => toggleReporteSeleccionado(reporte.id)}
                            className="w-4 h-4 rounded border-orange-300 text-orange-600 focus:ring-2 focus:ring-orange-500 cursor-pointer"
                          />
                        </td>
                        {columnasVisibles.includes('tipo') && (
                          <td className="px-3 py-3 text-sm text-center whitespace-nowrap">
                            <div className="flex flex-col items-center gap-1">
                              <span className={`px-2 py-1 rounded-full text-xs font-bold ${reporte.tipo === 'entrada'
                                ? 'bg-green-100 text-green-700'
                                : 'bg-blue-100 text-blue-700'
                                }`}>
                                {reporte.tipo === 'entrada' ? '⬇️ ENTRADA' : '➡️ SALIDA'}
                              </span>
                              {reporte.tipo === 'entrada' && reporte.datosEntrada?.destinoCarga && (
                                <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${reporte.datosEntrada.destinoCarga === 'camion'
                                  ? 'bg-amber-100 text-amber-700'
                                  : 'bg-indigo-100 text-indigo-700'
                                  }`}>
                                  {reporte.datosEntrada.destinoCarga === 'camion' ? '🚛 Camión' : '🛢️ Estanque'}
                                </span>
                              )}
                            </div>
                          </td>
                        )}
                        {columnasVisibles.includes('fecha') && (
                          <td className="px-3 py-3 text-sm font-semibold text-slate-900 whitespace-nowrap">
                            {reporte.fecha ? new Date(reporte.fecha + 'T00:00:00').toLocaleDateString('es-CL') : '-'}
                          </td>
                        )}
                        {columnasVisibles.includes('codigo') && (
                          <td className="px-3 py-3 text-sm font-bold text-slate-700 whitespace-nowrap">
                            <div className="flex items-center gap-2">
                              <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                              </svg>
                              {reporte.codigo || '-'}
                            </div>
                          </td>
                        )}
                        {columnasVisibles.includes('folio') && (
                          <td className="px-3 py-3 text-sm font-semibold text-slate-700 whitespace-nowrap">
                            {reporte.folio || '-'}
                          </td>
                        )}
                        {columnasVisibles.includes('proyecto') && (
                          <td className="px-3 py-3 text-sm text-slate-700">
                            {reporte.projectName || '-'}
                          </td>
                        )}
                        {columnasVisibles.includes('empresa') && (
                          <td className="px-3 py-3 text-sm text-slate-700">
                            {reporte.empresaNombre || '-'}
                          </td>
                        )}
                        {columnasVisibles.includes('surtidor') && (
                          <td className="px-3 py-3 text-sm whitespace-nowrap">
                            {reporte.surtidorPatente ? (
                              <div className="flex flex-col">
                                <span className="font-bold text-slate-800">{reporte.surtidorPatente}</span>
                                <span className="text-[11px] text-slate-500 font-normal leading-tight">{reporte.surtidorName}</span>
                              </div>
                            ) : '-'}
                          </td>
                        )}
                        {columnasVisibles.includes('maquina') && (
                          <td className="px-3 py-3 text-sm whitespace-nowrap">
                            {reporte.machinePatente ? (
                              <div className="flex flex-col">
                                <span className="font-bold text-slate-800">{reporte.machinePatente}</span>
                                <span className="text-[11px] text-slate-500 font-normal leading-tight">{reporte.machineName}</span>
                              </div>
                            ) : (reporte.tipo === 'entrada' ? <span className="text-slate-400 font-medium">N/A</span> : '-')}
                          </td>
                        )}
                        {columnasVisibles.includes('repartidor') && (
                          <td className="px-3 py-3 text-sm text-slate-700 whitespace-nowrap">
                            {reporte.repartidorNombre || '-'}
                          </td>
                        )}
                        {columnasVisibles.includes('receptor') && (
                          <td className="px-3 py-3 text-sm text-slate-700 whitespace-nowrap">
                            {reporte.operadorNombre || (reporte.tipo === 'entrada' ? 'N/A' : '-')}
                          </td>
                        )}
                        {columnasVisibles.includes('creadoPor') && (
                          <td className="px-3 py-3 text-sm text-slate-500 font-medium whitespace-nowrap">
                            {reporte.creadoPor || '-'}
                          </td>
                        )}
                        {columnasVisibles.includes('horometro') && (
                          <td className="px-3 py-3 text-sm text-center text-slate-700 whitespace-nowrap">
                            {reporte.horometroOdometro ? Number(reporte.horometroOdometro).toLocaleString('es-CL') : '-'}
                          </td>
                        )}
                        {columnasVisibles.includes('litros') && (
                          <td className="px-3 py-3 text-sm text-center font-bold text-orange-600 whitespace-nowrap">
                            {Number(reporte.cantidad || 0).toLocaleString('es-CL')} L
                          </td>
                        )}
                        {columnasVisibles.includes('firmado') && (
                          <td className="px-3 py-3 text-center whitespace-nowrap">
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
                        )}
                        {columnasVisibles.includes('voucher') && (
                          <td className="px-3 py-3 text-center whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                            {reporte.tipo === 'entrega' ? (
                              <button
                                onClick={() => handleReimprimirVoucher(reporte)}
                                className="px-3 py-1 bg-orange-100 text-orange-700 rounded-lg hover:bg-orange-200 transition-colors text-xs font-semibold flex items-center gap-1 mx-auto whitespace-nowrap"
                              >
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                                </svg>
                                Ver voucher
                              </button>
                            ) : (
                              <span className="text-xs text-slate-300">-</span>
                            )}
                          </td>
                        )}
                        {columnasVisibles.includes('acciones') && (
                          <td className="px-3 py-3 text-center whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                            <button
                              onClick={() => handleEliminar(reporte.id)}
                              className="px-3 py-1 bg-slate-100 text-slate-600 rounded-lg hover:bg-red-100 hover:text-red-700 transition-colors text-xs font-semibold flex items-center gap-1 mx-auto"
                              title="Eliminar reporte (no se borra definitivamente)"
                            >
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8l1 12a2 2 0 002 2h8a2 2 0 002-2L19 8" />
                              </svg>
                              Eliminar
                            </button>
                          </td>
                        )}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Paginador */}
            {reportesFiltrados.length > ITEMS_POR_PAGINA && (() => {
              const totalPages = Math.ceil(reportesFiltrados.length / ITEMS_POR_PAGINA);
              const pageNums = [];
              for (let i = 1; i <= totalPages; i++) {
                if (i === 1 || i === totalPages || Math.abs(i - paginaActual) <= 2) pageNums.push(i);
              }
              const withGaps = [];
              pageNums.forEach((p, i) => {
                if (i > 0 && p - pageNums[i - 1] > 1) withGaps.push('…');
                withGaps.push(p);
              });
              return (
                <div className="flex items-center justify-between px-4 py-3 border-t border-orange-100 bg-white rounded-b-xl">
                  <span className="text-xs text-slate-500">
                    {(paginaActual - 1) * ITEMS_POR_PAGINA + 1}–{Math.min(paginaActual * ITEMS_POR_PAGINA, reportesFiltrados.length)} de {reportesFiltrados.length} reportes
                  </span>
                  <div className="flex items-center gap-1">
                    <button onClick={() => setPaginaActual(p => Math.max(1, p - 1))} disabled={paginaActual === 1}
                      className="px-3 py-1.5 rounded-lg text-xs font-bold bg-orange-50 hover:bg-orange-100 text-orange-700 disabled:opacity-40 transition-all">
                      ← Anterior
                    </button>
                    {withGaps.map((p, i) =>
                      p === '…'
                        ? <span key={`gap-${i}`} className="px-1 text-slate-400 text-xs">…</span>
                        : <button key={p} onClick={() => setPaginaActual(p)}
                            className={`w-8 h-8 rounded-lg text-xs font-bold transition-all ${paginaActual === p ? 'bg-orange-600 text-white shadow' : 'bg-orange-50 hover:bg-orange-100 text-orange-700'}`}>
                            {p}
                          </button>
                    )}
                    <button onClick={() => setPaginaActual(p => Math.min(totalPages, p + 1))} disabled={paginaActual === totalPages}
                      className="px-3 py-1.5 rounded-lg text-xs font-bold bg-orange-50 hover:bg-orange-100 text-orange-700 disabled:opacity-40 transition-all">
                      Siguiente →
                    </button>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* Importador Excel */}
      {showImporter && (
        <CombustibleImporter
          empresaId={empresaId}
          onClose={() => setShowImporter(false)}
          onSuccess={(count) => {
            setShowImporter(false);
            handleRecargarReportes();
          }}
        />
      )}

      {/* Modal de Combustible */}
      <CombustibleModal
        isOpen={showCombustibleModal}
        onClose={() => {
          setShowCombustibleModal(false);
          handleRecargarReportes();
        }}
        empresaId={empresaId}
        isReportesView={true}
      />

      {/* Modal de Detalle del Reporte de Combustible */}

      {/* Panel de Análisis en Tiempo Real */}
      {activeSubTab === 'analisis' && reportesFiltrados.length > 0 && (
        <div className="animate-fadeIn">
          <CombustibleAnalytics reportesFiltrados={reportesFiltrados} />
        </div>
      )}

      {reporteDetalle && (
        <CombustibleDetalleModal
          reporte={{
            ...reporteDetalle,
            ...reporteDetalle.datosEntrega,
            cantidadLitros: reporteDetalle.datosEntrega?.cantidadLitros
              || reporteDetalle.datosEntrada?.cantidad
              || reporteDetalle.cantidadLitros,
            empresa: reporteDetalle.datosEntrega?.empresaNombre
              || (empresas.find(e => e.id === reporteDetalle.datosEntrega?.empresa)?.nombre)
              || reporteDetalle.datosEntrega?.empresa
              || reporteDetalle.empresa
              || (reporteDetalle.datosEntrada?.tipoOrigen === 'estacion'
                ? (() => {
                  const est = estaciones.find(e => e.id === reporteDetalle.datosEntrada?.origen);
                  if (est) return (est.marca ? est.marca + ' - ' : '') + est.nombre + (est.ciudad ? ' (' + est.ciudad + ')' : '');
                  return empresas.find(e => e.id === reporteDetalle.datosEntrada?.origen)?.nombre || 'Estación de Servicio';
                })()
                : reporteDetalle.datosEntrada?.tipoOrigen === 'estanque'
                  ? (empresas.find(e => e.id === reporteDetalle.datosEntrada?.origen)?.nombre || 'Estanque')
                  : null)
              || '-',
            observaciones: reporteDetalle.datosEntrega?.observaciones
              || reporteDetalle.datosEntrada?.observaciones
              || reporteDetalle.observaciones,
            numerosDocumento: reporteDetalle.datosEntrada?.numerosDocumento,
            numeroDocumento: reporteDetalle.datosEntrada?.numeroDocumento || reporteDetalle.datosEntrada?.numerosDocumento?.[0],
            horometroOdometro: reporteDetalle.datosEntrega?.horometroOdometro
              || reporteDetalle.datosEntrada?.horometroOdometro
              || reporteDetalle.horometroOdometro
          }}
          onClose={() => setReporteDetalle(null)}
          projectName={projects.find(p => p.id === reporteDetalle.projectId)?.name}
          machineInfo={machines.find(m => m.id === (reporteDetalle.datosEntrega?.machineId || reporteDetalle.datosEntrada?.machineId || reporteDetalle.machineId))}
          surtidorInfo={empleados.find(e => e.id === (reporteDetalle.repartidorId || reporteDetalle.surtidorId))}
          operadorInfo={
            empleados.find(e => e.id === (reporteDetalle.datosEntrega?.operadorId || reporteDetalle.datosEntrada?.operadorId || reporteDetalle.operadorId))
            || (reporteDetalle.datosEntrada?.receptorNombre ? { nombre: reporteDetalle.datosEntrada.receptorNombre, rut: '' } : null)
          }
          userRole={userRole}
          onSave={async (editedData) => {
            try {
              // Validar código si fue editado
              if (editedData.codigo && editedData.codigo.trim() !== reporteDetalle.codigo) {
                const { collection, query, where, getDocs } = await import('firebase/firestore');
                const reportesRef = collection(db, 'empresas', empresaId, 'reportes_combustible');
                const q = query(reportesRef, where('codigo', '==', editedData.codigo.trim()));
                const snap = await getDocs(q);
                const exists = snap.docs.some(d => d.id !== reporteDetalle.id && !d.data().deleted);
                if (exists) {
                  toast({ type: 'error', message: 'El código ingresado ya existe en otro reporte.' });
                  return;
                }
              }

              // Guardar los cambios en Firebase
              const reporteRef = doc(db, 'empresas', empresaId, 'reportes_combustible', reporteDetalle.id);
              await updateDoc(reporteRef, editedData);
              console.log('Reporte actualizado:', editedData);

              // Recargar reportes
              const reportesRef = collection(db, 'empresas', empresaId, 'reportes_combustible');
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

              toast({ type: 'success', message: 'Cambios guardados exitosamente' });
            } catch (error) {
              console.error("Error guardando cambios:", error);
              toast({ type: 'error', message: 'Error al guardar los cambios. Intenta nuevamente.' });
            }
          }}
          onSign={async (signatureData, pin) => {
            try {
              // Validar el PIN del administrador contra Firebase
              if (!currentUser) {
                toast({ type: 'error', message: 'No hay usuario autenticado' });
                return;
              }

              // Obtener el documento del usuario actual
              const userRef = doc(db, 'users', currentUser.uid);
              const userDoc = await getDoc(userRef);

              if (!userDoc.exists()) {
                toast({ type: 'error', message: 'No se encontró información del usuario' });
                return;
              }

              const userData = userDoc.data();
              const storedPin = userData.pin;

              // Validar el PIN
              if (!storedPin) {
                toast({ type: 'error', message: 'El usuario no tiene un PIN configurado. Contacte al administrador.' });
                return;
              }

              if (storedPin !== pin) {
                toast({ type: 'error', message: 'PIN incorrecto. Verifica e intenta nuevamente.' });
                return;
              }

              // PIN correcto, proceder con la firma
              const reporteRef = doc(db, 'empresas', empresaId, 'reportes_combustible', reporteDetalle.id);
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
              const reportesRef = collection(db, 'empresas', empresaId, 'reportes_combustible');
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

              toast({ type: 'success', message: 'Reporte firmado y validado exitosamente' });
            } catch (error) {
              console.error("Error firmando reporte:", error);
              toast({ type: 'error', message: 'Error al firmar el reporte. Intenta nuevamente.' });
            }
          }}
        />
      )}
    </>
  );
}
