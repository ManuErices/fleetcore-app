import React, { useState, useEffect } from "react";
import { collection, addDoc, getDocs, query, orderBy, updateDoc, doc, where } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, auth, storage } from "../lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import * as XLSX from 'xlsx';
import SignaturePad from "../components/SignaturePad";
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

export default function PasajesNuevo() {
  const [solicitudes, setSolicitudes] = useState([]);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState(null);
  const [currentUserData, setCurrentUserData] = useState(null);
  const [userRole, setUserRole] = useState('operador');
  
  // Estados para modales
  const [showSolicitudModal, setShowSolicitudModal] = useState(false);
  const [showGestionModal, setShowGestionModal] = useState(false);
  const [showGraficosModal, setShowGraficosModal] = useState(false);
  const [solicitudSeleccionada, setSolicitudSeleccionada] = useState(null);
  
  // Estados para nueva solicitud
  const [excelData, setExcelData] = useState([]);
  const [excelFileName, setExcelFileName] = useState('');
  const [firmaSolicitante, setFirmaSolicitante] = useState(null);
  const [solicitudData, setSolicitudData] = useState({
    projectId: '',
    observaciones: ''
  });

  // Estados para archivo de respaldo
  const [archivoRespaldo, setArchivoRespaldo] = useState(null);
  const [uploadingFile, setUploadingFile] = useState(false);

  // Detectar usuario actual
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      if (user) {
        // Cargar datos del usuario desde collection users
        const usersRef = collection(db, 'users');
        const usersSnap = await getDocs(usersRef);
        const userData = usersSnap.docs.find(d => d.id === user.uid);
        if (userData) {
          const data = { id: userData.id, ...userData.data() };
          setCurrentUserData(data);
          setUserRole(data.role || 'operador');
        }
      }
    });
    return () => unsubscribe();
  }, []);

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

      // Cargar solicitudes de pasajes
      const solicitudesRef = collection(db, 'solicitudes_pasajes');
      const q = query(solicitudesRef, orderBy('fechaCreacion', 'desc'));
      const solicitudesSnap = await getDocs(q);
      const solicitudesData = solicitudesSnap.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setSolicitudes(solicitudesData);

      setLoading(false);
    } catch (error) {
      console.error("Error cargando datos:", error);
      setLoading(false);
    }
  };

  // Manejar importación de Excel
  const handleExcelImport = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setExcelFileName(file.name);
    const reader = new FileReader();

    reader.onload = (event) => {
      try {
        const data = new Uint8Array(event.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet);

        console.log('📊 Datos importados:', jsonData);

        // Validar y formatear datos
        const pasajesFormateados = jsonData.map((row, index) => ({
          id: `temp_${index}`,
          nombre: row.Nombre || row.nombre || '',
          rut: row.RUT || row.rut || '',
          origen: row.Origen || row.origen || '',
          destino: row.Destino || row.destino || '',
          fechaSalida: row['Fecha Salida'] || row.fechaSalida || row.fecha || '',
          movimiento: row.Movimiento || row.movimiento || row['Subida/Bajada'] || 'Subida',
          estado: 'pendiente',
          precio: 0
        }));

        setExcelData(pasajesFormateados);
        console.log('✅ Pasajes formateados:', pasajesFormateados);
      } catch (error) {
        console.error('Error procesando Excel:', error);
        alert('Error al procesar el archivo Excel. Verifica el formato.');
      }
    };

    reader.readAsArrayBuffer(file);
  };

  // Guardar solicitud masiva
  const handleGuardarSolicitud = async () => {
    if (!solicitudData.projectId) {
      alert('Por favor selecciona un proyecto');
      return;
    }

    if (excelData.length === 0) {
      alert('Por favor importa un archivo Excel con los pasajes');
      return;
    }

    if (!firmaSolicitante) {
      alert('Por favor firma la solicitud antes de enviar');
      return;
    }

    try {
      setLoading(true);

      // Generar número de solicitud
      const fecha = new Date();
      const numeroSolicitud = `SOL-PSJ-${fecha.getFullYear()}${(fecha.getMonth() + 1).toString().padStart(2, '0')}${fecha.getDate().toString().padStart(2, '0')}-${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`;

      const solicitud = {
        numeroSolicitud,
        projectId: solicitudData.projectId,
        projectName: projects.find(p => p.id === solicitudData.projectId)?.name || '',
        solicitanteId: currentUser.uid,
        solicitanteNombre: currentUserData?.nombre || currentUser.email,
        firmaSolicitante,
        fechaSolicitud: new Date().toISOString(),
        fechaCreacion: new Date().toISOString(),
        observaciones: solicitudData.observaciones,
        pasajes: excelData,
        estado: 'pendiente', // pendiente, en_proceso, completada
        totalPasajes: excelData.length,
        pasajesComprados: 0,
        pasajesPendientes: excelData.length,
        montoTotal: 0
      };

      await addDoc(collection(db, 'solicitudes_pasajes'), solicitud);

      alert(`✓ Solicitud ${numeroSolicitud} creada exitosamente con ${excelData.length} pasajes`);
      
      // Reset
      setShowSolicitudModal(false);
      setSolicitudData({ projectId: '', observaciones: '' });
      setExcelData([]);
      setExcelFileName('');
      setFirmaSolicitante(null);
      
      // Recargar
      cargarDatos();
    } catch (error) {
      console.error('Error guardando solicitud:', error);
      alert('Error al guardar la solicitud');
    } finally {
      setLoading(false);
    }
  };

  // Marcar pasaje como comprado (con archivo de respaldo)
  const handleComprarPasaje = async (solicitudId, pasajeId, precio, archivo) => {
    try {
      setUploadingFile(true);
      const solicitud = solicitudes.find(s => s.id === solicitudId);
      if (!solicitud) return;

      let archivoURL = null;
      
      // Subir archivo si existe
      if (archivo) {
        const fileName = `pasajes/${solicitudId}/${pasajeId}_${Date.now()}_${archivo.name}`;
        const storageRef = ref(storage, fileName);
        await uploadBytes(storageRef, archivo);
        archivoURL = await getDownloadURL(storageRef);
        console.log('✅ Archivo subido:', archivoURL);
      }

      const pasajesActualizados = solicitud.pasajes.map(p => {
        if (p.id === pasajeId) {
          return {
            ...p,
            estado: 'comprado',
            precio: parseFloat(precio) || 0,
            fechaCompra: new Date().toISOString(),
            compradoPor: currentUserData?.nombre || currentUser.email,
            archivoRespaldo: archivoURL
          };
        }
        return p;
      });

      const pasajesComprados = pasajesActualizados.filter(p => p.estado === 'comprado').length;
      const pasajesPendientes = pasajesActualizados.filter(p => p.estado === 'pendiente').length;
      const montoTotal = pasajesActualizados.reduce((sum, p) => sum + (parseFloat(p.precio) || 0), 0);

      const solicitudRef = doc(db, 'solicitudes_pasajes', solicitudId);
      await updateDoc(solicitudRef, {
        pasajes: pasajesActualizados,
        pasajesComprados,
        pasajesPendientes,
        montoTotal,
        estado: pasajesPendientes === 0 ? 'completada' : 'en_proceso'
      });

      // Recargar
      cargarDatos();
      
      // Actualizar solicitud seleccionada
      const solicitudActualizada = {
        ...solicitud,
        pasajes: pasajesActualizados,
        pasajesComprados,
        pasajesPendientes,
        montoTotal
      };
      setSolicitudSeleccionada(solicitudActualizada);
      
      setArchivoRespaldo(null);
      setUploadingFile(false);
      
    } catch (error) {
      console.error('Error actualizando pasaje:', error);
      alert('Error al actualizar el pasaje');
      setUploadingFile(false);
    }
  };

  // Calcular datos para gráficos mensuales
  const calcularDatosGraficos = () => {
    // Agrupar por mes
    const datosPorMes = {};
    
    solicitudes.forEach(sol => {
      const fecha = new Date(sol.fechaSolicitud);
      const mesAno = `${fecha.getFullYear()}-${(fecha.getMonth() + 1).toString().padStart(2, '0')}`;
      
      if (!datosPorMes[mesAno]) {
        datosPorMes[mesAno] = {
          total: 0,
          cantidad: 0,
          solicitudes: 0
        };
      }
      
      datosPorMes[mesAno].total += sol.montoTotal || 0;
      datosPorMes[mesAno].cantidad += sol.pasajesComprados || 0;
      datosPorMes[mesAno].solicitudes += 1;
    });

    // Ordenar por fecha
    const mesesOrdenados = Object.keys(datosPorMes).sort();
    
    // Últimos 12 meses
    const ultimos12Meses = mesesOrdenados.slice(-12);
    
    const labels = ultimos12Meses.map(mes => {
      const [year, month] = mes.split('-');
      const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
      return `${meses[parseInt(month) - 1]} ${year}`;
    });

    const montosData = ultimos12Meses.map(mes => datosPorMes[mes].total);
    const cantidadesData = ultimos12Meses.map(mes => datosPorMes[mes].cantidad);

    return { labels, montosData, cantidadesData };
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 pb-12">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 text-white shadow-2xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <h1 className="text-4xl font-black tracking-tight">✈️ Gestión de Pasajes</h1>
              <p className="text-blue-100 text-sm mt-2">Control de solicitudes y compra de pasajes</p>
            </div>
            
            <div className="flex gap-3">
              {solicitudes.length > 0 && (
                <button
                  onClick={() => setShowGraficosModal(true)}
                  className="px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-bold shadow-lg hover:shadow-xl transition-all flex items-center gap-2"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                  📊 Gráficos
                </button>
              )}
              
              {userRole === 'administrador' && (
                <button
                  onClick={() => setShowSolicitudModal(true)}
                  className="px-6 py-3 bg-white text-blue-600 rounded-xl font-bold shadow-lg hover:shadow-xl transition-all flex items-center gap-2"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Nueva Solicitud Masiva
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Contenido */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-4 text-slate-600">Cargando solicitudes...</p>
          </div>
        ) : solicitudes.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-xl p-12 text-center">
            <div className="text-6xl mb-4">✈️</div>
            <h3 className="text-2xl font-bold text-slate-800 mb-2">No hay solicitudes</h3>
            <p className="text-slate-600 mb-6">Comienza creando una nueva solicitud masiva de pasajes</p>
            {userRole === 'administrador' && (
              <button
                onClick={() => setShowSolicitudModal(true)}
                className="px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl font-bold"
              >
                + Nueva Solicitud
              </button>
            )}
          </div>
        ) : (
          <div className="grid gap-6">
            {solicitudes.map(solicitud => (
              <div key={solicitud.id} className="bg-white rounded-2xl shadow-xl overflow-hidden">
                <div className="bg-gradient-to-r from-blue-100 to-indigo-100 p-6">
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="text-xl font-black text-blue-900">{solicitud.numeroSolicitud}</h3>
                      <p className="text-sm text-blue-700 mt-1">
                        📍 {solicitud.projectName} • 
                        👤 {solicitud.solicitanteNombre} •
                        📅 {new Date(solicitud.fechaSolicitud).toLocaleDateString('es-CL')}
                      </p>
                    </div>
                    <span className={`px-4 py-2 rounded-full text-xs font-bold ${
                      solicitud.estado === 'completada' 
                        ? 'bg-green-100 text-green-700' 
                        : solicitud.estado === 'en_proceso'
                        ? 'bg-yellow-100 text-yellow-700'
                        : 'bg-slate-100 text-slate-700'
                    }`}>
                      {solicitud.estado === 'completada' ? '✓ Completada' : 
                       solicitud.estado === 'en_proceso' ? '⏳ En Proceso' : '⏸ Pendiente'}
                    </span>
                  </div>
                </div>

                <div className="p-6">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                    <div className="bg-blue-50 rounded-lg p-4">
                      <p className="text-xs text-blue-600 font-semibold">Total Pasajes</p>
                      <p className="text-2xl font-black text-blue-900">{solicitud.totalPasajes}</p>
                    </div>
                    <div className="bg-green-50 rounded-lg p-4">
                      <p className="text-xs text-green-600 font-semibold">Comprados</p>
                      <p className="text-2xl font-black text-green-900">{solicitud.pasajesComprados || 0}</p>
                    </div>
                    <div className="bg-yellow-50 rounded-lg p-4">
                      <p className="text-xs text-yellow-600 font-semibold">Pendientes</p>
                      <p className="text-2xl font-black text-yellow-900">{solicitud.pasajesPendientes || solicitud.totalPasajes}</p>
                    </div>
                    <div className="bg-purple-50 rounded-lg p-4">
                      <p className="text-xs text-purple-600 font-semibold">Monto Total</p>
                      <p className="text-2xl font-black text-purple-900">
                        ${(solicitud.montoTotal || 0).toLocaleString('es-CL')}
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      setSolicitudSeleccionada(solicitud);
                      setShowGestionModal(true);
                    }}
                    className="w-full px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl font-bold hover:shadow-lg transition-all"
                  >
                    👁️ Ver y Gestionar Pasajes
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal: Nueva Solicitud Masiva */}
      {showSolicitudModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white p-6 sticky top-0 z-10">
              <h2 className="text-2xl font-black">📋 Nueva Solicitud Masiva de Pasajes</h2>
              <p className="text-blue-100 text-sm mt-1">Importa Excel y firma para enviar</p>
            </div>

            <div className="p-6 space-y-6">
              {/* Proyecto */}
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">
                  Proyecto <span className="text-red-500">*</span>
                </label>
                <select
                  value={solicitudData.projectId}
                  onChange={(e) => setSolicitudData({...solicitudData, projectId: e.target.value})}
                  className="w-full px-4 py-2 border-2 border-blue-200 rounded-lg focus:outline-none focus:border-blue-500"
                >
                  <option value="">Seleccione proyecto</option>
                  {projects.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              {/* Importar Excel */}
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">
                  Archivo Excel <span className="text-red-500">*</span>
                </label>
                <div className="border-2 border-dashed border-blue-300 rounded-lg p-6 text-center">
                  <input
                    type="file"
                    accept=".xlsx,.xls"
                    onChange={handleExcelImport}
                    className="hidden"
                    id="excel-upload"
                  />
                  <label
                    htmlFor="excel-upload"
                    className="cursor-pointer"
                  >
                    <div className="text-5xl mb-2">📊</div>
                    <p className="text-sm font-semibold text-blue-600">
                      {excelFileName || 'Click para seleccionar archivo Excel'}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      Columnas: Nombre, RUT, Origen, Destino, Fecha Salida, Movimiento
                    </p>
                  </label>
                </div>
              </div>

              {/* Preview de datos importados */}
              {excelData.length > 0 && (
                <div className="bg-green-50 border-2 border-green-200 rounded-lg p-4">
                  <h4 className="font-bold text-green-900 mb-2">
                    ✓ {excelData.length} pasajes importados
                  </h4>
                  <div className="max-h-40 overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-green-100 sticky top-0">
                        <tr>
                          <th className="p-2 text-left">Nombre</th>
                          <th className="p-2 text-left">RUT</th>
                          <th className="p-2 text-left">Ruta</th>
                          <th className="p-2 text-left">Fecha</th>
                          <th className="p-2 text-left">Movimiento</th>
                        </tr>
                      </thead>
                      <tbody>
                        {excelData.slice(0, 5).map((pasaje, idx) => (
                          <tr key={idx} className="border-b border-green-200">
                            <td className="p-2">{pasaje.nombre}</td>
                            <td className="p-2">{pasaje.rut}</td>
                            <td className="p-2">{pasaje.origen} → {pasaje.destino}</td>
                            <td className="p-2">{pasaje.fechaSalida}</td>
                            <td className="p-2">{pasaje.movimiento}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {excelData.length > 5 && (
                      <p className="text-center text-green-700 py-2">
                        ... y {excelData.length - 5} más
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Observaciones */}
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">
                  Observaciones
                </label>
                <textarea
                  value={solicitudData.observaciones}
                  onChange={(e) => setSolicitudData({...solicitudData, observaciones: e.target.value})}
                  className="w-full px-4 py-2 border-2 border-blue-200 rounded-lg focus:outline-none focus:border-blue-500 min-h-[80px]"
                  placeholder="Notas o comentarios adicionales..."
                />
              </div>

              {/* Firma */}
              <div>
                <SignaturePad
                  label="Firma del Solicitante"
                  color="blue"
                  onSave={(signatureData) => setFirmaSolicitante(signatureData)}
                />
              </div>

              {/* Botones */}
              <div className="flex gap-3 pt-4 border-t border-blue-200">
                <button
                  onClick={() => {
                    setShowSolicitudModal(false);
                    setSolicitudData({ projectId: '', observaciones: '' });
                    setExcelData([]);
                    setExcelFileName('');
                    setFirmaSolicitante(null);
                  }}
                  className="flex-1 px-6 py-3 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold rounded-xl transition-all"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleGuardarSolicitud}
                  disabled={loading || !solicitudData.projectId || excelData.length === 0 || !firmaSolicitante}
                  className="flex-1 px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:from-slate-300 disabled:to-slate-400 text-white font-bold rounded-xl transition-all shadow-lg disabled:cursor-not-allowed"
                >
                  {loading ? 'Enviando...' : '✓ Enviar Solicitud'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Gestión de Pasajes */}
      {showGestionModal && solicitudSeleccionada && (
        <ModalGestionPasajes
          solicitud={solicitudSeleccionada}
          onClose={() => {
            setShowGestionModal(false);
            setSolicitudSeleccionada(null);
          }}
          onComprarPasaje={handleComprarPasaje}
          uploadingFile={uploadingFile}
        />
      )}

      {/* Modal: Gráficos Comparativos */}
      {showGraficosModal && (
        <ModalGraficos
          solicitudes={solicitudes}
          onClose={() => setShowGraficosModal(false)}
          calcularDatosGraficos={calcularDatosGraficos}
        />
      )}
    </div>
  );
}

// Componente Modal de Gestión
function ModalGestionPasajes({ solicitud, onClose, onComprarPasaje, uploadingFile }) {
  const [pasajeEditando, setPasajeEditando] = useState(null);
  const [precioTemp, setPrecioTemp] = useState('');
  const [archivoTemp, setArchivoTemp] = useState(null);

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl max-w-6xl w-full max-h-[90vh] overflow-y-auto">
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white p-6 sticky top-0 z-10">
          <div className="flex justify-between items-start">
            <div>
              <h2 className="text-2xl font-black">{solicitud.numeroSolicitud}</h2>
              <p className="text-blue-100 text-sm mt-1">
                {solicitud.projectName} • {solicitud.pasajesComprados}/{solicitud.totalPasajes} comprados
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/20 rounded-lg transition-all"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="p-6">
          {/* Tabla de pasajes */}
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gradient-to-r from-blue-100 to-indigo-100">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-bold text-blue-900">Nombre</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-blue-900">RUT</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-blue-900">Ruta</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-blue-900">Fecha Salida</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-blue-900">Movimiento</th>
                  <th className="px-4 py-3 text-center text-xs font-bold text-blue-900">Precio</th>
                  <th className="px-4 py-3 text-center text-xs font-bold text-blue-900">Estado</th>
                  <th className="px-4 py-3 text-center text-xs font-bold text-blue-900">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-blue-100">
                {solicitud.pasajes.map((pasaje, index) => (
                  <tr key={pasaje.id} className={`hover:bg-blue-50 ${index % 2 === 0 ? 'bg-white' : 'bg-blue-50/30'}`}>
                    <td className="px-4 py-3 text-sm font-semibold text-slate-900">{pasaje.nombre}</td>
                    <td className="px-4 py-3 text-sm text-slate-700">{pasaje.rut}</td>
                    <td className="px-4 py-3 text-sm text-slate-700">
                      {pasaje.origen} → {pasaje.destino}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-700">{pasaje.fechaSalida}</td>
                    <td className="px-4 py-3 text-sm">
                      <span className={`px-2 py-1 rounded-full text-xs font-bold ${
                        pasaje.movimiento === 'Subida' 
                          ? 'bg-green-100 text-green-700' 
                          : 'bg-orange-100 text-orange-700'
                      }`}>
                        {pasaje.movimiento === 'Subida' ? '⬆️ Subida' : '⬇️ Bajada'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {pasajeEditando === pasaje.id ? (
                        <input
                          type="number"
                          value={precioTemp}
                          onChange={(e) => setPrecioTemp(e.target.value)}
                          className="w-24 px-2 py-1 border-2 border-blue-300 rounded text-sm text-center"
                          placeholder="$"
                          autoFocus
                        />
                      ) : (
                        <span className="text-sm font-bold text-slate-900">
                          {pasaje.precio > 0 ? `$${pasaje.precio.toLocaleString('es-CL')}` : '-'}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                        pasaje.estado === 'comprado' 
                          ? 'bg-green-100 text-green-700' 
                          : 'bg-yellow-100 text-yellow-700'
                      }`}>
                        {pasaje.estado === 'comprado' ? '✓ Comprado' : '⏸ Pendiente'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {pasaje.estado === 'pendiente' ? (
                        pasajeEditando === pasaje.id ? (
                          <div className="space-y-2">
                            <input
                              type="file"
                              accept=".pdf,.jpg,.jpeg,.png"
                              onChange={(e) => setArchivoTemp(e.target.files[0])}
                              className="text-xs"
                              id={`file-${pasaje.id}`}
                            />
                            <div className="flex gap-1 justify-center">
                              <button
                                onClick={() => {
                                  if (precioTemp && parseFloat(precioTemp) > 0) {
                                    onComprarPasaje(solicitud.id, pasaje.id, precioTemp, archivoTemp);
                                    setPasajeEditando(null);
                                    setPrecioTemp('');
                                    setArchivoTemp(null);
                                  }
                                }}
                                disabled={uploadingFile}
                                className="px-2 py-1 bg-green-500 text-white rounded text-xs font-bold disabled:bg-slate-300"
                              >
                                {uploadingFile ? '⏳' : '✓'}
                              </button>
                              <button
                                onClick={() => {
                                  setPasajeEditando(null);
                                  setPrecioTemp('');
                                  setArchivoTemp(null);
                                }}
                                className="px-2 py-1 bg-slate-300 text-slate-700 rounded text-xs font-bold"
                              >
                                ✕
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button
                            onClick={() => {
                              setPasajeEditando(pasaje.id);
                              setPrecioTemp('');
                              setArchivoTemp(null);
                            }}
                            className="px-3 py-1 bg-blue-500 text-white rounded-lg text-xs font-bold hover:bg-blue-600"
                          >
                            💳 Comprar
                          </button>
                        )
                      ) : (
                        pasaje.archivoRespaldo && (
                          <a
                            href={pasaje.archivoRespaldo}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-3 py-1 bg-purple-100 text-purple-700 rounded-lg text-xs font-bold hover:bg-purple-200 inline-block"
                          >
                            📄 Ver
                          </a>
                        )
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

// Componente Modal de Gráficos
function ModalGraficos({ solicitudes, onClose, calcularDatosGraficos }) {
  const { labels, montosData, cantidadesData } = calcularDatosGraficos();

  const dataMontos = {
    labels,
    datasets: [
      {
        label: 'Gasto Mensual ($CLP)',
        data: montosData,
        borderColor: 'rgb(59, 130, 246)',
        backgroundColor: 'rgba(59, 130, 246, 0.5)',
        tension: 0.4
      }
    ]
  };

  const dataCantidades = {
    labels,
    datasets: [
      {
        label: 'Pasajes Comprados',
        data: cantidadesData,
        backgroundColor: 'rgba(168, 85, 247, 0.7)',
        borderColor: 'rgb(168, 85, 247)',
        borderWidth: 2
      }
    ]
  };

  const optionsMontos = {
    responsive: true,
    plugins: {
      legend: {
        position: 'top',
      },
      title: {
        display: true,
        text: 'Evolución del Gasto Mensual en Pasajes',
        font: { size: 16, weight: 'bold' }
      },
      tooltip: {
        callbacks: {
          label: function(context) {
            return `$${context.parsed.y.toLocaleString('es-CL')}`;
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

  const optionsCantidades = {
    responsive: true,
    plugins: {
      legend: {
        position: 'top',
      },
      title: {
        display: true,
        text: 'Cantidad de Pasajes Comprados por Mes',
        font: { size: 16, weight: 'bold' }
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: {
          stepSize: 1
        }
      }
    }
  };

  // Calcular estadísticas
  const totalGastado = solicitudes.reduce((sum, sol) => sum + (sol.montoTotal || 0), 0);
  const totalPasajes = solicitudes.reduce((sum, sol) => sum + (sol.pasajesComprados || 0), 0);
  const promedioMensual = montosData.length > 0 
    ? montosData.reduce((a, b) => a + b, 0) / montosData.length 
    : 0;
  const promedioPorPasaje = totalPasajes > 0 ? totalGastado / totalPasajes : 0;

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl max-w-7xl w-full max-h-[90vh] overflow-y-auto">
        <div className="bg-gradient-to-r from-purple-600 to-pink-600 text-white p-6 sticky top-0 z-10">
          <div className="flex justify-between items-start">
            <div>
              <h2 className="text-2xl font-black">📊 Análisis Comparativo de Gastos en Pasajes</h2>
              <p className="text-purple-100 text-sm mt-1">Últimos 12 meses</p>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/20 rounded-lg transition-all"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {/* Estadísticas Generales */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl p-4 border-2 border-blue-200">
              <p className="text-xs text-blue-600 font-semibold">Gasto Total</p>
              <p className="text-2xl font-black text-blue-900">
                ${totalGastado.toLocaleString('es-CL')}
              </p>
            </div>
            <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-xl p-4 border-2 border-purple-200">
              <p className="text-xs text-purple-600 font-semibold">Total Pasajes</p>
              <p className="text-2xl font-black text-purple-900">{totalPasajes}</p>
            </div>
            <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-xl p-4 border-2 border-green-200">
              <p className="text-xs text-green-600 font-semibold">Promedio Mensual</p>
              <p className="text-2xl font-black text-green-900">
                ${Math.round(promedioMensual).toLocaleString('es-CL')}
              </p>
            </div>
            <div className="bg-gradient-to-br from-orange-50 to-orange-100 rounded-xl p-4 border-2 border-orange-200">
              <p className="text-xs text-orange-600 font-semibold">Precio Promedio</p>
              <p className="text-2xl font-black text-orange-900">
                ${Math.round(promedioPorPasaje).toLocaleString('es-CL')}
              </p>
            </div>
          </div>

          {/* Gráfico de Línea - Gastos */}
          <div className="bg-white rounded-xl border-2 border-blue-200 p-6">
            <Line data={dataMontos} options={optionsMontos} />
          </div>

          {/* Gráfico de Barras - Cantidades */}
          <div className="bg-white rounded-xl border-2 border-purple-200 p-6">
            <Bar data={dataCantidades} options={optionsCantidades} />
          </div>

          {/* Tabla comparativa mensual */}
          <div className="bg-white rounded-xl border-2 border-slate-200 overflow-hidden">
            <div className="bg-gradient-to-r from-slate-100 to-slate-200 p-4">
              <h3 className="font-black text-slate-900">Detalle Mensual</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-bold text-slate-700">Mes</th>
                    <th className="px-4 py-3 text-center text-xs font-bold text-slate-700">Pasajes</th>
                    <th className="px-4 py-3 text-right text-xs font-bold text-slate-700">Gasto Total</th>
                    <th className="px-4 py-3 text-right text-xs font-bold text-slate-700">Promedio</th>
                    <th className="px-4 py-3 text-center text-xs font-bold text-slate-700">Variación</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {labels.map((mes, idx) => {
                    const variacion = idx > 0 
                      ? ((montosData[idx] - montosData[idx - 1]) / montosData[idx - 1]) * 100 
                      : 0;
                    const promedio = cantidadesData[idx] > 0 
                      ? montosData[idx] / cantidadesData[idx] 
                      : 0;

                    return (
                      <tr key={idx} className="hover:bg-slate-50">
                        <td className="px-4 py-3 text-sm font-semibold text-slate-900">{mes}</td>
                        <td className="px-4 py-3 text-sm text-center text-slate-700">{cantidadesData[idx]}</td>
                        <td className="px-4 py-3 text-sm text-right font-bold text-blue-600">
                          ${montosData[idx].toLocaleString('es-CL')}
                        </td>
                        <td className="px-4 py-3 text-sm text-right text-slate-700">
                          ${Math.round(promedio).toLocaleString('es-CL')}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {idx > 0 && (
                            <span className={`px-2 py-1 rounded-full text-xs font-bold ${
                              variacion > 0 
                                ? 'bg-red-100 text-red-700' 
                                : variacion < 0 
                                ? 'bg-green-100 text-green-700'
                                : 'bg-slate-100 text-slate-700'
                            }`}>
                              {variacion > 0 ? '↑' : variacion < 0 ? '↓' : '='} {Math.abs(variacion).toFixed(1)}%
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
