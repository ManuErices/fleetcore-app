import React, { useState, useEffect } from "react";
import { collection, getDocs, addDoc } from "firebase/firestore";
import { db, auth } from "../lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import VoucherGenerator from './VoucherGenerator';
import VoucherHistorialDia from './VoucherHistorialDia';
import SignaturePad from "./SignaturePad";

export default function CombustibleModal({ isOpen, onClose, projects, machines, empleados, empresaId }) {
  const [paso, setPaso] = useState(1); // 1: Control, 2: Tipo (Entrada/Entrega), 3: Formulario
  const [tipoReporte, setTipoReporte] = useState(''); // 'entrada' o 'entrega'
  const [loading, setLoading] = useState(false);
  const [loadingEquipo, setLoadingEquipo] = useState(false);
  const [loadingEmpresa, setLoadingEmpresa] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [currentUserData, setCurrentUserData] = useState(null);
  const [userRole, setUserRole] = useState('operador');
  // ✅ FIX: roles reales del sistema
  const isAdmin = userRole === 'superadmin' || userRole === 'admin_contrato';
  const [surtidoresPersonas, setSurtidoresPersonas] = useState([]); // empleados disponibles para admin
  const [equiposSurtidores, setEquiposSurtidores] = useState([]); // equipos de la colección equipos_surtidores
  const [repartidorSeleccionado, setRepartidorSeleccionado] = useState(null); // empleado elegido por admin


  const [showVoucherModal, setShowVoucherModal] = useState(false);
  const [lastReportData, setLastReportData] = useState(null);
  const [showHistorial, setShowHistorial] = useState(false);
  
  // Estados para las firmas
  const [firmaRepartidor, setFirmaRepartidor] = useState(null); // Para ENTRADA
  const [firmaReceptor, setFirmaReceptor] = useState(null); // Para ENTREGA
  const [showModalFirmaRepartidor, setShowModalFirmaRepartidor] = useState(false);
  const [searchOperador, setSearchOperador] = useState('');
  const [searchMaquina, setSearchMaquina] = useState('');
  // Operador y máquina externos (empresa no-MPF)
  const [operadorExterno, setOperadorExterno] = useState({ nombre: '', rut: '' });
  const [maquinaExterna, setMaquinaExterna] = useState({ patente: '', tipo: '', modelo: '' });
  const [showModalFirmaReceptor, setShowModalFirmaReceptor] = useState(false);
  
  // Estados para modales de creación rápida
  const [showModalEquipoSurtidor, setShowModalEquipoSurtidor] = useState(false);
  const [showModalEmpresa, setShowModalEmpresa] = useState(false);
  
  // Datos temporales para crear nuevos registros
  const [nuevoEquipoSurtidor, setNuevoEquipoSurtidor] = useState({
    patente: '',
    nombre: '',
    tipo: '',
    marca: '',
    modelo: ''
  });
  
  const [nuevaEmpresa, setNuevaEmpresa] = useState({
    nombre: '',
    rut: ''
  });
  
  // Listas locales que se actualizan cuando agregamos nuevos items
  const [machinesLocal, setMachinesLocal] = useState([]);
  const [empresasLocal, setEmpresasLocal] = useState([]);
  const [estacionesLocal, setEstacionesLocal] = useState([]);
  // Detecta si la empresa seleccionada tiene registros internos (operadores/máquinas)
  const EMPRESAS_SISTEMA = ['LifeMed', 'Intosim', 'Río Tinto', 'Global', 'Celenor', 'MPF Ingeniería Civil'];
  const esEmpresaInterna = (empresaNombre) => {
    if (!empresaNombre) return false;
    // Tiene registros internos si hay operadores o máquinas con esa empresa
    const tieneOps = (empleados || []).some(e => e.empresa === empresaNombre);
    const tieneMaq = (machines || []).some(m => m.empresa === empresaNombre);
    return tieneOps || tieneMaq;
  };
  // Alias para compatibilidad con código existente
  const esMPF = esEmpresaInterna;
  
  // Datos del formulario - Página 1 (Control de Combustible)
  const [datosControl, setDatosControl] = useState({
    projectId: '',
    fecha: new Date().toISOString().split('T')[0],
    repartidorId: '', // Surtidor
    equipoSurtidorId: '' // Camión o equipo que entrega
  });

  // Datos ENTRADA de combustible (al estanque)
  const [datosEntrada, setDatosEntrada] = useState({
    origen: '',
    tipoOrigen: '', // 'estacion' o 'estanque'
    numeroDocumento: '', // Guía o Vale según tipoOrigen
    fechaDocumento: new Date().toISOString().split('T')[0],
    cantidad: '',
    observaciones: ''
  });

  // Datos ENTREGA de combustible (a máquinas)
  const [datosEntrega, setDatosEntrega] = useState({
    empresa: '',
    fecha: new Date().toISOString().split('T')[0],
    operadorId: '', // Quien recibe
    machineId: '',
    horometroOdometro: '',
    cantidadLitros: '',
    observaciones: ''
  });

  // Detectar usuario actual
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
    });
    return () => unsubscribe();
  }, []);

  // Buscar datos del usuario actual en la colección "users"
  useEffect(() => {
    const cargarDatosUsuario = async () => {
      if (currentUser && currentUser.uid) {
        try {
          console.log('🔍 Buscando usuario en Firebase:', currentUser.uid);
          console.log('📧 Email:', currentUser.email);
          
          // Cargar todos los usuarios
          const usersRef = collection(db, 'users');
          const usersSnap = await getDocs(usersRef);
          const usersData = usersSnap.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          }));
          
          console.log('📋 Usuarios disponibles:', usersData);
          
          // Buscar por UID (preferido)
          let userData = usersData.find(u => u.id === currentUser.uid);
          
          // Si no encuentra por UID, buscar por email
          if (!userData) {
            userData = usersData.find(u => 
              u.email?.toLowerCase() === currentUser.email?.toLowerCase()
            );
          }
          
          if (userData) {
            console.log('✅ Usuario encontrado:', userData);
            setCurrentUserData(userData);
            setUserRole(userData.role || 'operador');
            
            // Autocompletar repartidorId cuando se abre el modal
            if (isOpen && !datosControl.repartidorId) {
              setDatosControl(prev => ({
                ...prev,
                repartidorId: userData.id
              }));
            }
          } else {
            console.warn('⚠️ No se encontró usuario en la colección users');
            console.log('💡 Verifica que exista un documento en users con id:', currentUser.uid);
          }
        } catch (error) {
          console.error('❌ Error cargando datos de usuario:', error);
        }
      }
    };
    
    if (isOpen) {
      cargarDatosUsuario();
    }
  }, [currentUser, isOpen]);

  // Cargar surtidores: usar el prop empleados si está disponible, sino consultar Firestore
  useEffect(() => {
    if (!isOpen) return;
    // Si ya tenemos empleados del prop, filtrar directamente
    if (empleados && empleados.length > 0) {
      console.log('👥 Total empleados recibidos:', empleados.length);
      console.log('🔍 Surtidores (esSurtidor=true):', empleados.filter(e => e.esSurtidor === true).map(e => e.nombre));
      const lista = empleados.filter(e => e.esSurtidor === true);
      setSurtidoresPersonas(lista);
      return;
    }
    // Si no hay prop, consultar Firestore
    if (!empresaId) return;
    (async () => {
      try {
        const snap = await getDocs(collection(db, 'empresas', empresaId, 'trabajadores'));
        const lista = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(e => e.esSurtidor === true);
        setSurtidoresPersonas(lista);
      } catch (e) { console.error('Error cargando surtidores:', e); }
    })();
  }, [isOpen, empresaId, empleados]);

  // Inicializar machinesLocal cuando cambian las machines del prop
  useEffect(() => {
    if (isOpen) {
      setMachinesLocal(machines || []);
      cargarEmpresas();
    }
  }, [isOpen, machines]);

  // Cargar equipos_surtidores — useEffect separado para reaccionar cuando empresaId llegue
  useEffect(() => {
    if (!isOpen || !empresaId) return;
    (async () => {
      try {
        console.log('🚛 Cargando equipos_surtidores para empresa:', empresaId);
        const snap = await getDocs(collection(db, 'empresas', empresaId, 'equipos_surtidores'));
        const lista = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        console.log('🚛 Equipos encontrados:', lista.length, lista.map(e => e.nombre || e.name));
        setEquiposSurtidores(lista);
      } catch (e) { console.error('Error cargando equipos_surtidores:', e); }
    })();
  }, [isOpen, empresaId]);

  const cargarEmpresas = async () => {
    try {
      if (!empresaId) return;
      // ✅ FIX: ruta correcta bajo empresa
      const empresasRef = collection(db, 'empresas', empresaId, 'empresas_combustible');
      const empresasSnap = await getDocs(empresasRef);
      const empresasData = empresasSnap.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setEmpresasLocal(empresasData);
    } catch (error) {
      console.error("Error cargando empresas:", error);
      setEmpresasLocal([]);
    }
  };

  // Carga estaciones filtradas por la obra seleccionada
  const cargarEstaciones = async (projectId) => {
    if (!projectId) { setEstacionesLocal([]); return; }
    try {
      // ✅ FIX: ruta correcta bajo empresa
      const snap = await getDocs(collection(db, 'empresas', empresaId, 'estaciones_combustible'));
      const todas = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      // Mostrar solo las asignadas a esta obra (o sin obras = sin restriccion)
      const filtradas = todas.filter(e => {
        // ✅ FIX: garantizar que obras siempre sea array antes de llamar includes
        const obras = Array.isArray(e.obras) ? e.obras : [];
        return obras.length === 0 || obras.includes(projectId);
      });
      setEstacionesLocal(filtradas);
    } catch (e) {
      console.error('Error cargando estaciones:', e);
      setEstacionesLocal([]);
    }
  };

  const resetForm = () => {
    setPaso(1);
    setTipoReporte('');
    setFirmaRepartidor(null);
    setFirmaReceptor(null);
    setDatosControl({
      projectId: '',
      fecha: new Date().toISOString().split('T')[0],
      repartidorId: '',
      equipoSurtidorId: ''
    });
    setDatosEntrada({
      origen: '',
      tipoOrigen: '',
      numeroDocumento: '',
      fechaDocumento: new Date().toISOString().split('T')[0],
      cantidad: '',
      observaciones: ''
    });
    setDatosEntrega({
      empresa: '',
      fecha: new Date().toISOString().split('T')[0],
      operadorId: '',
      machineId: '',
      horometroOdometro: '',
      cantidadLitros: '',
      observaciones: ''
    });
  };

  const handleCrearEquipoSurtidor = async () => {
    console.log('🚀 Iniciando creación de equipo surtidor');
    console.log('📝 Datos:', nuevoEquipoSurtidor);
    
    if (!nuevoEquipoSurtidor.patente || !nuevoEquipoSurtidor.nombre) {
      alert("Patente y Nombre son obligatorios");
      return;
    }

    try {
      setLoadingEquipo(true);
      console.log('💾 Guardando en Firebase...');
      
      // ✅ FIX: guardar en equipos_surtidores de la empresa
      const docRef = await addDoc(collection(db, 'empresas', empresaId, 'equipos_surtidores'), {
        patente: nuevoEquipoSurtidor.patente.toUpperCase(),
        code: nuevoEquipoSurtidor.patente.toUpperCase(),
        nombre: nuevoEquipoSurtidor.nombre,
        name: nuevoEquipoSurtidor.nombre,
        tipo: nuevoEquipoSurtidor.tipo || 'Equipo Surtidor',
        marca: nuevoEquipoSurtidor.marca || '',
        modelo: nuevoEquipoSurtidor.modelo || '',
        categoria: 'surtidor_combustible',
        fechaCreacion: new Date().toISOString()
      });

      console.log('✅ Documento creado con ID:', docRef.id);

      const nuevoEquipo = {
        id: docRef.id,
        patente: nuevoEquipoSurtidor.patente.toUpperCase(),
        code: nuevoEquipoSurtidor.patente.toUpperCase(),
        name: nuevoEquipoSurtidor.nombre,
        tipo: nuevoEquipoSurtidor.tipo || 'Equipo Surtidor',
        marca: nuevoEquipoSurtidor.marca || '',
        modelo: nuevoEquipoSurtidor.modelo || ''
      };

      console.log('📋 Agregando a lista local:', nuevoEquipo);
      setMachinesLocal([...machinesLocal, nuevoEquipo]);
      
      // ✅ FIX: agregar al estado equiposSurtidores también
      setEquiposSurtidores(prev => [...prev, { id: docRef.id, ...nuevoEquipoSurtidor, nombre: nuevoEquipoSurtidor.nombre, patente: nuevoEquipoSurtidor.patente.toUpperCase() }]);
      console.log('🎯 Autoseleccionando equipo:', docRef.id);
      setDatosControl({...datosControl, equipoSurtidorId: docRef.id});
      
      setShowModalEquipoSurtidor(false);
      setNuevoEquipoSurtidor({
        patente: '',
        nombre: '',
        tipo: '',
        marca: '',
        modelo: ''
      });
      
      console.log('🎉 Equipo surtidor creado exitosamente');
      alert("✓ Equipo surtidor creado y seleccionado exitosamente");
    } catch (error) {
      console.error("❌ Error creando equipo:", error);
      console.error("Detalles:", error.message);
      alert(`Error al crear equipo surtidor: ${error.message}`);
    } finally {
      setLoadingEquipo(false);
      console.log('🏁 Proceso finalizado');
    }
  };

  const handleCrearEmpresa = async () => {
    if (!nuevaEmpresa.nombre) {
      alert("El nombre de la empresa es obligatorio");
      return;
    }

    try {
      setLoading(true);
      // ✅ FIX: ruta correcta bajo empresa
      const docRef = await addDoc(collection(db, 'empresas', empresaId, 'empresas_combustible'), {
        nombre: nuevaEmpresa.nombre,
        rut: nuevaEmpresa.rut,
        fechaCreacion: new Date().toISOString()
      });

      const nuevaEmp = {
        id: docRef.id,
        nombre: nuevaEmpresa.nombre,
        rut: nuevaEmpresa.rut
      };

      setEmpresasLocal([...empresasLocal, nuevaEmp]);
      setDatosEntrega({...datosEntrega, empresa: docRef.id});
      setShowModalEmpresa(false);
      setNuevaEmpresa({
        nombre: '',
        rut: ''
      });
      alert("Empresa creada exitosamente");
    } catch (error) {
      console.error("Error creando empresa:", error);
      alert("Error al crear empresa");
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleSubmit = async () => {
    // Validación de usuario
    if (!currentUserData) {
      alert("Tu usuario no está registrado en el sistema. Por favor contacta al administrador para crear tu perfil en la colección 'users'.");
      return;
    }

    // Validaciones
    if (!datosControl.projectId || !datosControl.repartidorId) {
      alert("Por favor completa los campos obligatorios del control de combustible");
      return;
    }

    if (tipoReporte === 'entrada') {
      if (!datosEntrada.tipoOrigen || !datosEntrada.numeroDocumento || !datosEntrada.cantidad) {
        alert("Por favor completa los campos obligatorios de la entrada (Tipo Origen, Documento y Cantidad)");
        return;
      }
      if (!firmaRepartidor) {
        alert("Por favor firma el documento antes de guardar");
        return;
      }
    } else if (tipoReporte === 'entrega') {
      if (!datosEntrega.machineId || !datosEntrega.cantidadLitros) {
        alert("Por favor completa los campos obligatorios de la entrega");
        return;
      }
      if (!firmaReceptor) {
        alert("Por favor firma el documento antes de guardar");
        return;
      }
    }

    try {
      setLoading(true);

      // Generar número de reporte
      const fecha = new Date();
      const numeroReporte = `COMB-${tipoReporte.toUpperCase()}-${fecha.getFullYear()}${(fecha.getMonth() + 1).toString().padStart(2, '0')}${fecha.getDate().toString().padStart(2, '0')}-${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`;

      const dataToSave = {
        tipo: tipoReporte,
        numeroReporte,
        ...datosControl,
        fechaCreacion: new Date().toISOString(),
        creadoPor: currentUser?.email || 'unknown',
        repartidorNombre: isAdmin
          ? (repartidorSeleccionado?.nombre || repartidorSeleccionado?.name || '')
          : (currentUserData?.nombre || ''),
        repartidorRut: isAdmin
          ? (repartidorSeleccionado?.rut || '')
          : (currentUserData?.rut || '')
      };

      if (tipoReporte === 'entrada') {
        dataToSave.datosEntrada = {
          ...datosEntrada,
          cantidad: parseFloat(datosEntrada.cantidad)
        };
        dataToSave.firmaRepartidor = firmaRepartidor;
        dataToSave.fechaFirma = new Date().toISOString();
      } else {
        dataToSave.datosEntrega = {
          ...datosEntrega,
          cantidadLitros: parseFloat(datosEntrega.cantidadLitros),
          horometroOdometro: parseFloat(datosEntrega.horometroOdometro) || 0,
          // Si es empresa externa, guardar datos manuales
          ...(esMPF(datosEntrega.empresa) ? {} : {
            operadorExterno,
            maquinaExterna,
          })
        };
        dataToSave.firmaReceptor = firmaReceptor;
        dataToSave.fechaFirma = new Date().toISOString();
      }

      // ✅ FIX: ruta correcta bajo empresa
      await addDoc(collection(db, 'empresas', empresaId, 'reportes_combustible'), dataToSave);

      console.log('✅ Reporte guardado en Firebase');
      console.log('📝 Tipo de reporte:', tipoReporte);

      if (tipoReporte === 'entrega') {
      console.log('🎯 Es una entrega, preparando modal de voucher...');
      const projectInfo = projects?.find(p => p.id === datosControl.projectId);
      const machineInfo = machinesLocal?.find(m => m.id === datosEntrega.machineId);
      const operadorInfo = empleados?.find(e => e.id === datosEntrega.operadorId);
      const empresaInfo = { nombre: datosEntrega.empresa }; // empresa guardada como nombre
      
      // NUEVO: Obtener información del repartidor y equipo surtidor
      const repartidorInfo = empleados?.find(e => e.id === datosControl.repartidorId) || currentUserData;
      // ✅ FIX: buscar en equiposSurtidores (AdminPanel) primero, luego en machinesLocal
      const equipoSurtidorInfo = equiposSurtidores.find(m => m.id === datosControl.equipoSurtidorId)
                                || machinesLocal?.find(m => m.id === datosControl.equipoSurtidorId);
      
      console.log('📊 Información recopilada:', {
        projectInfo,
        machineInfo,
        operadorInfo,
        empresaInfo,
        repartidorInfo,
        equipoSurtidorInfo
      });
      
      setLastReportData({
        reportData: {
          ...dataToSave,
          numeroReporte,
          fecha: datosControl.fecha,
          cantidadLitros: datosEntrega.cantidadLitros,
          horometroOdometro: datosEntrega.horometroOdometro,
          firmaReceptor,
          firmaRepartidor
        },
        projectName: projectInfo?.nombre || 'N/A',
        machineInfo: {
          patente: machineInfo?.patente || '',
          codigo: machineInfo?.codigo || '',
          nombre: machineInfo?.nombre || '',
          type: machineInfo?.type || '',      // Tipo de máquina para "Tipo Maquina"
          code: machineInfo?.code || ''        // Código para "Maquina"
        },
        operadorInfo: {
          nombre: operadorInfo?.nombre || '',
          rut: operadorInfo?.rut || ''
        },
        empresaInfo: empresaInfo ? {
          nombre: empresaInfo.nombre || '',
          rut: empresaInfo.rut || ''
        } : null,
        repartidorInfo: {
          nombre: repartidorInfo?.nombre || dataToSave.repartidorNombre || '',
          rut: repartidorInfo?.rut || dataToSave.repartidorRut || ''
        },
        equipoSurtidorInfo: equipoSurtidorInfo ? {
          nombre: equipoSurtidorInfo.nombre || '',
          patente: equipoSurtidorInfo.patente || '',
          tipo: equipoSurtidorInfo.tipo || ''
        } : null
      });
      
      console.log('💾 lastReportData guardado:', lastReportData);
      console.log('🎭 Mostrando modal de voucher...');
      setShowVoucherModal(true);
      resetForm();
    } else {
      alert(`Reporte de Entrada registrado exitosamente: ${numeroReporte}`);
      handleClose();
    }
    } catch (error) {
      console.error("Error guardando reporte:", error);
      alert("Error al guardar el reporte");
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[95vh] overflow-y-auto">
        {/* Header */}
        <div className="bg-gradient-to-r from-orange-600 to-amber-600 text-white p-6 sticky top-0 z-10">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-black">Control de Combustible</h2>
              <p className="text-orange-100 text-sm mt-1">
                {paso === 1 && "Información del Control"}
                {paso === 2 && "Selecciona el tipo de reporte"}
                {paso === 3 && tipoReporte === 'entrada' && "Entrada de Combustible al Estanque"}
                {paso === 3 && tipoReporte === 'entrega' && "Entrega de Combustible a Máquina"}
              </p>
            </div>
            <button
              onClick={handleClose}
              className="w-10 h-10 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center transition-colors"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Indicador de pasos */}
        <div className="bg-orange-50 p-4 border-b border-orange-200">
          <div className="flex items-center justify-center gap-4">
            <div className={`flex items-center gap-2 ${paso >= 1 ? 'text-orange-600' : 'text-slate-400'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold ${paso >= 1 ? 'bg-orange-600 text-white' : 'bg-slate-200'}`}>
                1
              </div>
              <span className="text-sm font-semibold">Control</span>
            </div>
            <svg className="w-6 h-6 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            <div className={`flex items-center gap-2 ${paso >= 2 ? 'text-orange-600' : 'text-slate-400'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold ${paso >= 2 ? 'bg-orange-600 text-white' : 'bg-slate-200'}`}>
                2
              </div>
              <span className="text-sm font-semibold">Tipo</span>
            </div>
            <svg className="w-6 h-6 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            <div className={`flex items-center gap-2 ${paso >= 3 ? 'text-orange-600' : 'text-slate-400'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold ${paso >= 3 ? 'bg-orange-600 text-white' : 'bg-slate-200'}`}>
                3
              </div>
              <span className="text-sm font-semibold">Detalles</span>
            </div>
          </div>
        </div>

        {/* Contenido */}
        <div className="p-6">
          {/* PASO 1: Control de Combustible */}
          {paso === 1 && (
            <div className="space-y-6">
              <div className="bg-orange-50 border-2 border-orange-200 rounded-xl p-4">
                <h3 className="text-lg font-black text-orange-900 mb-1">📋 Control de Combustible</h3>
                <p className="text-sm text-orange-700">Información general del control (Página 1 de 2)</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">
                    Código Obra <span className="text-red-500">*</span>
                  </label>
                  <select
                    required
                    value={datosControl.projectId}
                    onChange={(e) => { setDatosControl({...datosControl, projectId: e.target.value, origen: ''}); cargarEstaciones(e.target.value); }}
                    className="w-full px-4 py-2 border-2 border-orange-200 rounded-lg focus:outline-none focus:border-orange-500"
                  >
                    <option value="">Seleccione obra</option>
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
                    value={datosControl.fecha}
                    onChange={(e) => setDatosControl({...datosControl, fecha: e.target.value})}
                    className="w-full px-4 py-2 border-2 border-orange-200 rounded-lg focus:outline-none focus:border-orange-500"
                    max={new Date().toISOString().split('T')[0]}
                  />
                </div>
              </div>

              <div className="bg-amber-50 border-2 border-amber-200 rounded-xl p-4 mt-6">
                <h4 className="text-md font-black text-amber-900 mb-3">Información Repartidor</h4>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-2">
                      Nombre Repartidor/Surtidor <span className="text-red-500">*</span>
                    </label>

                    {isAdmin ? (
                      // Admin: selector manual de empleado
                      <div>
                        <select
                          value={datosControl.repartidorId}
                          onChange={(e) => {
                            const emp = surtidoresPersonas.find(p => p.id === e.target.value);
                            setRepartidorSeleccionado(emp || null);
                            setDatosControl(prev => ({ ...prev, repartidorId: e.target.value }));
                          }}
                          className="w-full px-4 py-2.5 border-2 border-amber-300 rounded-lg focus:outline-none focus:border-amber-500 bg-white text-slate-800 font-semibold"
                        >
                          <option value="">{surtidoresPersonas.length === 0 ? "No hay surtidores registrados" : "— Seleccione repartidor —"}</option>
                          {surtidoresPersonas.map(emp => (
                            <option key={emp.id} value={emp.id}>
                              {emp.nombre || emp.name || emp.displayName || emp.email}
                            </option>
                          ))}
                        </select>
                        {repartidorSeleccionado && (
                          <div className="mt-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 space-y-0.5">
                            {repartidorSeleccionado.rut && <div><span className="font-bold">RUT:</span> {repartidorSeleccionado.rut}</div>}
                            {repartidorSeleccionado.email && <div><span className="font-bold">Email:</span> {repartidorSeleccionado.email}</div>}
                          </div>
                        )}
                        <p className="text-xs text-amber-600 mt-1">Selecciona el empleado que realiza la entrega</p>
                      </div>
                    ) : (
                      // Operador: display estático del usuario actual
                      <div>
                        <div className="w-full px-4 py-2 border-2 border-amber-200 rounded-lg bg-amber-50 font-semibold text-amber-900 flex items-center gap-2">
                          <svg className="w-5 h-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                          </svg>
                          <div className="flex-1">
                            {currentUserData ? (
                              <div>
                                <div className="font-bold text-amber-900">{currentUserData.nombre || 'Sin nombre'}</div>
                                {currentUserData.rut && <div className="text-xs text-amber-700">RUT: {currentUserData.rut}</div>}
                                {currentUserData.email && <div className="text-xs text-amber-600">{currentUserData.email}</div>}
                              </div>
                            ) : (
                              <div>
                                <div className="text-red-600 font-bold">⚠ No se encontró usuario en el sistema</div>
                                <div className="text-xs text-red-500 mt-1">Por favor contacta al administrador</div>
                              </div>
                            )}
                          </div>
                          {currentUserData && (
                            <svg className="w-5 h-5 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                            </svg>
                          )}
                        </div>
                        <p className="text-xs text-green-700 mt-1 flex items-center gap-1">
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                          Autocompletado con tu usuario
                        </p>
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-2">
                      Equipo Surtidor (Camión/Mochila)
                      {!isAdmin 
                    }
                    </label>
                    <div className="flex gap-2">
                      <select
                        value={datosControl.equipoSurtidorId}
                        onChange={(e) => setDatosControl({...datosControl, equipoSurtidorId: e.target.value})}
                        className="flex-1 px-4 py-2 border-2 border-amber-200 rounded-lg focus:outline-none focus:border-amber-500"
                      >
                        <option value="">Seleccione equipo surtidor</option>
                        {/* ✅ FIX: usar solo equipos_surtidores del AdminPanel */}
                        {equiposSurtidores.map(m => (
                          <option key={m.id} value={m.id}>
                            {m.patente || m.code} - {m.nombre || m.name}
                          </option>
                        ))}
                        {equiposSurtidores.length === 0 && (
                          <option disabled value="">Sin equipos registrados en Admin</option>
                        )}
                      </select>
                      {isAdmin && (
                        <button
                          type="button"
                          onClick={() => setShowModalEquipoSurtidor(true)}
                          className="px-4 py-2 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-white rounded-lg transition-all shadow-md hover:shadow-lg flex items-center gap-1 font-bold"
                          title="Agregar nuevo equipo surtidor"
                        >
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                          </svg>
                        </button>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 mt-1">Opcional: Camión o equipo que entrega el combustible</p>
                  </div>
                </div>
              </div>

              <div className="flex gap-3 pt-4 border-t border-orange-200">
                {/* Botón historial vouchers del día */}
                <button
                  type="button"
                  onClick={() => setShowHistorial(true)}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-700 font-semibold rounded-xl transition-all text-sm"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"/>
                  </svg>
                  Ver Vouchers del Día
                </button>
                <button
                  type="button"
                  onClick={handleClose}
                  className="flex-1 px-6 py-3 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold rounded-xl transition-all"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => setPaso(2)}
                  disabled={!datosControl.projectId || !datosControl.repartidorId}
                  className="flex-1 px-6 py-3 bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 disabled:from-slate-300 disabled:to-slate-400 text-white font-bold rounded-xl transition-all shadow-lg hover:shadow-xl disabled:cursor-not-allowed"
                >
                  Siguiente →
                </button>
              </div>
            </div>
          )}

          {/* PASO 2: Tipo de Reporte */}
          {paso === 2 && (
            <div className="space-y-6">
              <div className="bg-orange-50 border-2 border-orange-200 rounded-xl p-4">
                <h3 className="text-lg font-black text-orange-900 mb-1">Tipo de Reporte</h3>
                <p className="text-sm text-orange-700">Selecciona si es entrada o entrega de combustible</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* ENTRADA */}
                <button
                  onClick={() => {
                    setTipoReporte('entrada');
                    setPaso(3);
                  }}
                  className="group relative bg-gradient-to-br from-green-50 to-emerald-50 hover:from-green-100 hover:to-emerald-100 border-3 border-green-300 hover:border-green-500 rounded-2xl p-8 transition-all hover:shadow-xl"
                >
                  <div className="flex flex-col items-center gap-4">
                    <div className="w-20 h-20 rounded-full bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center group-hover:scale-110 transition-transform">
                      <svg className="w-10 h-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                      </svg>
                    </div>
                    <div className="text-center">
                      <h4 className="text-xl font-black text-green-900 mb-2">ENTRADA</h4>
                      <p className="text-sm text-green-700">Recepción de combustible al estanque</p>
                      <p className="text-xs text-green-600 mt-2">• N° Guía • Cantidad • Origen</p>
                    </div>
                  </div>
                </button>

                {/* ENTREGA */}
                <button
                  onClick={() => {
                    setTipoReporte('entrega');
                    setPaso(3);
                  }}
                  className="group relative bg-gradient-to-br from-blue-50 to-indigo-50 hover:from-blue-100 hover:to-indigo-100 border-3 border-blue-300 hover:border-blue-500 rounded-2xl p-8 transition-all hover:shadow-xl"
                >
                  <div className="flex flex-col items-center gap-4">
                    <div className="w-20 h-20 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center group-hover:scale-110 transition-transform">
                      <svg className="w-10 h-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                      </svg>
                    </div>
                    <div className="text-center">
                      <h4 className="text-xl font-black text-blue-900 mb-2">ENTREGA</h4>
                      <p className="text-sm text-blue-700">Entrega de combustible a máquina</p>
                      <p className="text-xs text-blue-600 mt-2">• Máquina • Operador • Litros</p>
                    </div>
                  </div>
                </button>
              </div>

              <div className="flex gap-3 pt-4 border-t border-orange-200">
                <button
                  onClick={() => setPaso(1)}
                  className="flex-1 px-6 py-3 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold rounded-xl transition-all"
                >
                  ← Atrás
                </button>
              </div>
            </div>
          )}

          {/* PASO 3a: ENTRADA DE COMBUSTIBLE */}
          {paso === 3 && tipoReporte === 'entrada' && (
            <div className="space-y-6">
              <div className="bg-green-50 border-2 border-green-200 rounded-xl p-4">
                <h3 className="text-lg font-black text-green-900 mb-1">⬇️ Entrada de Combustible</h3>
                <p className="text-sm text-green-700">Recepción de combustible al estanque (Página 2 de 2)</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Tipo de Origen */}
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">
                    Tipo de Origen <span className="text-red-500">*</span>
                  </label>
                  <select
                    required
                    value={datosEntrada.tipoOrigen}
                    onChange={(e) => setDatosEntrada({...datosEntrada, tipoOrigen: e.target.value})}
                    className="w-full px-4 py-2 border-2 border-green-200 rounded-lg focus:outline-none focus:border-green-500"
                  >
                    <option value="">Seleccione tipo</option>
                    <option value="estacion">⛽ Estación de Servicio (Guía)</option>
                    <option value="estanque">🛢️ Estanque (Vale)</option>
                  </select>
                </div>

                {/* Origen - Agregar: Solo Admin */}
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">
                    Origen
                    {!isAdmin
                  }
                  </label>
                  <div className="flex gap-2">
                    <select
                      value={datosEntrada.origen}
                      onChange={(e) => setDatosEntrada({...datosEntrada, origen: e.target.value})}
                      className="flex-1 px-4 py-2 border-2 border-green-200 rounded-lg focus:outline-none focus:border-green-500"
                    >
                      <option value="">
                        {datosEntrada.tipoOrigen === 'estacion'
                          ? (estacionesLocal.length === 0 ? 'Sin estaciones asignadas a esta obra' : 'Seleccione estacion de servicio')
                          : 'Seleccione origen'}
                      </option>
                      {datosEntrada.tipoOrigen === 'estacion'
                        ? estacionesLocal.map(est => (
                            <option key={est.id} value={est.id}>
                              {(est.marca ? est.marca + ' - ' : '') + est.nombre + (est.ciudad ? ' (' + est.ciudad + ')' : '')}
                            </option>
                          ))
                        : empresasLocal.map(emp => (
                            <option key={emp.id} value={emp.id}>
                              {emp.nombre + (emp.rut ? ' - ' + emp.rut : '')}
                            </option>
                          ))
                      }
                    </select>
                    {isAdmin && (
                      <button
                        type="button"
                        onClick={() => setShowModalEmpresa(true)}
                        className="px-3 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-bold text-sm transition-all"
                        title="Agregar nuevo origen"
                      >
                        +
                      </button>
                    )}
                  </div>
                </div>

                {/* Número de Documento (Guía o Vale según tipo) */}
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">
                    {datosEntrada.tipoOrigen === 'estacion' 
                      ? 'N° de Guía' 
                      : datosEntrada.tipoOrigen === 'estanque' 
                      ? 'N° de Vale' 
                      : 'N° de Documento'} <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    required
                    min="1"
                    step="1"
                    value={datosEntrada.numeroDocumento}
                    onChange={(e) => setDatosEntrada({...datosEntrada, numeroDocumento: e.target.value.replace(/[^0-9]/g, '')})}
                    className="w-full px-4 py-2 border-2 border-green-200 rounded-lg focus:outline-none focus:border-green-500"
                    placeholder={
                      datosEntrada.tipoOrigen === 'estacion' 
                        ? 'Ej: 12345' 
                        : datosEntrada.tipoOrigen === 'estanque'
                        ? 'Ej: 001'
                        : 'Número de documento'
                    }
                  />
                </div>

                {/* Fecha del Documento */}
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">
                    Fecha del Documento <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={datosEntrada.fechaDocumento}
                    onChange={(e) => setDatosEntrada({...datosEntrada, fechaDocumento: e.target.value})}
                    className="w-full px-4 py-2 border-2 border-green-200 rounded-lg focus:outline-none focus:border-green-500"
                  />
                </div>

                {/* Cantidad */}
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">
                    Cantidad (Litros) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    required
                    min="0"
                    step="0.01"
                    value={datosEntrada.cantidad}
                    onChange={(e) => setDatosEntrada({...datosEntrada, cantidad: e.target.value})}
                    className="w-full px-4 py-2 border-2 border-green-200 rounded-lg focus:outline-none focus:border-green-500"
                    placeholder="Ej: 5000"
                  />
                </div>

                {/* Info visual del tipo de documento */}
                <div className="md:col-span-2 bg-blue-50 border-2 border-blue-200 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <svg className="w-6 h-6 text-blue-600 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <div className="text-sm text-blue-800">
                      {datosEntrada.tipoOrigen === 'estacion' ? (
                        <>
                          <p className="font-bold">⛽ Estación de Servicio</p>
                          <p className="mt-1">Se requiere <strong>Guía de Despacho</strong> del proveedor</p>
                        </>
                      ) : datosEntrada.tipoOrigen === 'estanque' ? (
                        <>
                          <p className="font-bold">🛢️ Estanque</p>
                          <p className="mt-1">Se requiere <strong>Vale interno</strong> de autorización</p>
                        </>
                      ) : (
                        <p>Seleccione el tipo de origen para continuar</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Observaciones */}
                <div className="md:col-span-2">
                  <label className="block text-sm font-bold text-slate-700 mb-2">
                    Observaciones
                  </label>
                  <textarea
                    value={datosEntrada.observaciones}
                    onChange={(e) => setDatosEntrada({...datosEntrada, observaciones: e.target.value})}
                    className="w-full px-4 py-2 border-2 border-green-200 rounded-lg focus:outline-none focus:border-green-500 min-h-[80px]"
                    placeholder="Notas adicionales..."
                  />
                </div>
              </div>

              {/* Firma del Repartidor */}
              <div className="mt-6">
                <label className="block text-sm font-bold text-slate-700 mb-3">
                  Firma del Repartidor de Combustible <span className="text-red-500">*</span>
                </label>
                
                {firmaRepartidor ? (
                  <div className="relative">
                    <div className="border-2 border-green-500 rounded-xl p-4 bg-green-50">
                      <img 
                        src={firmaRepartidor} 
                        alt="Firma del repartidor" 
                        className="max-h-32 mx-auto"
                      />
                      <div className="flex justify-center gap-2 mt-3">
                        <span className="px-3 py-1 bg-green-600 text-white text-xs font-bold rounded-full">
                          ✓ Firmado
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setFirmaRepartidor(null);
                            setShowModalFirmaRepartidor(true);
                          }}
                          className="px-3 py-1 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold rounded-full transition-all"
                        >
                          Firmar nuevamente
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowModalFirmaRepartidor(true)}
                    className="w-full px-6 py-4 border-2 border-dashed border-green-300 rounded-xl bg-green-50 hover:bg-green-100 transition-all group"
                  >
                    <div className="flex flex-col items-center gap-2">
                      <svg className="w-12 h-12 text-green-600 group-hover:scale-110 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                      </svg>
                      <span className="text-green-800 font-bold">Click para firmar</span>
                      <span className="text-green-600 text-xs">Se abrirá una ventana para capturar tu firma</span>
                    </div>
                  </button>
                )}
              </div>

              <div className="flex gap-3 pt-4 border-t border-green-200">
                <button
                  onClick={() => setPaso(2)}
                  className="flex-1 px-6 py-3 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold rounded-xl transition-all"
                >
                  ← Atrás
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={loading || !datosEntrada.numeroDocumento || !datosEntrada.cantidad || !firmaRepartidor}
                  className="flex-1 px-6 py-3 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 disabled:from-slate-300 disabled:to-slate-400 text-white font-bold rounded-xl transition-all shadow-lg hover:shadow-xl disabled:cursor-not-allowed"
                >
                  {loading ? 'Guardando...' : '✓ Guardar Entrada'}
                </button>
              </div>
            </div>
          )}

          {/* PASO 3b: ENTREGA DE COMBUSTIBLE */}
          {paso === 3 && tipoReporte === 'entrega' && (
            <div className="space-y-6">
              <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-4">
                <h3 className="text-lg font-black text-blue-900 mb-1">➡️ Entrega de Combustible</h3>
                <p className="text-sm text-blue-700">Entrega de combustible a máquina (Página 2 de 2)</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">
                    Empresa
                    {!isAdmin
                  }
                  </label>
                  <div className="flex gap-2">
                    <select
                      value={datosEntrega.empresa}
                      onChange={(e) => {
                        setDatosEntrega({...datosEntrega, empresa: e.target.value, operadorId: '', machineId: ''});
                        setOperadorExterno({ nombre: '', rut: '' });
                        setMaquinaExterna({ patente: '', tipo: '', modelo: '' });
                        setSearchOperador('');
                        setSearchMaquina('');
                      }}
                      className="flex-1 px-4 py-2 border-2 border-blue-200 rounded-lg focus:outline-none focus:border-blue-500"
                    >
                      <option value="">Seleccione empresa</option>
                      {EMPRESAS_SISTEMA.map(emp => (
                        <option key={emp} value={emp}>{emp}</option>
                      ))}
                    </select>
                  </div>
                  {datosEntrega.empresa && (() => {
                    const nOps  = (empleados||[]).filter(e => e.empresa === datosEntrega.empresa).length;
                    const nMaq  = (machines||[]).filter(m => m.empresa === datosEntrega.empresa).length;
                    return (nOps > 0 || nMaq > 0) ? (
                      <p className="text-xs text-blue-500 mt-1.5 font-medium">
                        {nOps} operador{nOps !== 1 ? 'es' : ''} · {nMaq} máquina{nMaq !== 1 ? 's' : ''} registradas
                      </p>
                    ) : (
                      <p className="text-xs text-amber-500 mt-1.5 font-medium">
                        ⚠ Sin operadores ni máquinas registradas para esta empresa
                      </p>
                    );
                  })()}
                </div>

                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">
                    Fecha
                  </label>
                  <input
                    type="date"
                    value={datosEntrega.fecha}
                    onChange={(e) => setDatosEntrega({...datosEntrega, fecha: e.target.value})}
                    className="w-full px-4 py-2 border-2 border-blue-200 rounded-lg focus:outline-none focus:border-blue-500"
                    max={new Date().toISOString().split('T')[0]}
                  />
                </div>

                {/* ── OPERADOR ── */}
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">
                    Operador (Quien recibe) <span className="text-red-500">*</span>
                  </label>

                  {esMPF(datosEntrega.empresa) ? (
                    <>
                      <div className="relative mb-2">
                        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z"/>
                        </svg>
                        <input type="text" placeholder="Buscar operador..." value={searchOperador}
                          onChange={e => setSearchOperador(e.target.value)}
                          className="w-full pl-9 pr-4 py-2 border-2 border-blue-200 rounded-lg focus:outline-none focus:border-blue-500 text-sm"/>
                      </div>
                      {datosEntrega.operadorId && (() => {
                        const sel = empleados.find(e => e.id === datosEntrega.operadorId);
                        return sel ? (
                          <div className="flex items-center gap-3 px-3 py-2 bg-orange-50 border-2 border-orange-400 rounded-xl mb-2">
                            <div className="w-9 h-9 rounded-full bg-orange-500 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                              {sel.nombre?.charAt(0).toUpperCase()}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="font-bold text-slate-800 text-sm truncate">{sel.nombre}</div>
                              <div className="text-xs text-slate-500">{sel.rut || 'Sin RUT'}</div>
                            </div>
                            <button type="button" onClick={() => { setDatosEntrega({...datosEntrega, operadorId: ''}); setSearchOperador(''); }}
                              className="text-slate-400 hover:text-red-500 flex-shrink-0">
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
                            </button>
                          </div>
                        ) : null;
                      })()}
                      {!datosEntrega.operadorId && (
                        <div className="grid grid-cols-2 gap-2 max-h-44 overflow-y-auto pr-1">
                          {(empleados || [])
                            .filter(emp => !datosEntrega.empresa || emp.empresa === datosEntrega.empresa)
                            .filter(emp => !searchOperador ||
                              emp.nombre?.toLowerCase().includes(searchOperador.toLowerCase()) ||
                              emp.rut?.includes(searchOperador))
                            .map(emp => (
                              <button key={emp.id} type="button"
                                onClick={() => { setDatosEntrega({...datosEntrega, operadorId: emp.id}); setSearchOperador(''); }}
                                className="flex items-center gap-2 px-3 py-2 bg-white border-2 border-slate-200 hover:border-orange-400 hover:bg-orange-50 rounded-xl transition-all text-left">
                                <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-slate-600 font-bold text-xs flex-shrink-0">
                                  {emp.nombre?.charAt(0).toUpperCase()}
                                </div>
                                <div className="min-w-0">
                                  <div className="font-semibold text-slate-800 text-xs truncate">{emp.nombre}</div>
                                  <div className="text-[10px] text-slate-400 truncate">{emp.rut || 'Sin RUT'}</div>
                                </div>
                              </button>
                            ))}
                        </div>
                      )}
                    </>
                  ) : datosEntrega.empresa ? (
                    <div className="space-y-2">
                      <input type="text" placeholder="Nombre completo *"
                        value={operadorExterno.nombre}
                        onChange={e => setOperadorExterno({...operadorExterno, nombre: e.target.value})}
                        className="w-full px-4 py-2 border-2 border-blue-200 rounded-lg focus:outline-none focus:border-blue-500 text-sm"/>
                      <input type="text" placeholder="RUT (ej: 12.345.678-9)"
                        value={operadorExterno.rut}
                        onChange={e => setOperadorExterno({...operadorExterno, rut: e.target.value})}
                        className="w-full px-4 py-2 border-2 border-blue-200 rounded-lg focus:outline-none focus:border-blue-500 text-sm"/>
                    </div>
                  ) : (
                    <div className="px-4 py-3 bg-slate-50 border-2 border-dashed border-slate-200 rounded-lg text-sm text-slate-400 text-center">
                      Primero selecciona una empresa
                    </div>
                  )}
                </div>

                {/* ── MÁQUINA ── */}
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">
                    Máquina <span className="text-red-500">*</span>
                  </label>

                  {esMPF(datosEntrega.empresa) ? (
                    <>
                      <div className="relative mb-2">
                        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z"/>
                        </svg>
                        <input type="text" placeholder="Buscar por patente o nombre..." value={searchMaquina}
                          onChange={e => setSearchMaquina(e.target.value)}
                          className="w-full pl-9 pr-4 py-2 border-2 border-blue-200 rounded-lg focus:outline-none focus:border-blue-500 text-sm"/>
                      </div>
                      {datosEntrega.machineId && (() => {
                        const sel = (machinesLocal || machines || []).find(m => m.id === datosEntrega.machineId);
                        return sel ? (
                          <div className="flex items-center gap-3 px-3 py-2 bg-orange-50 border-2 border-orange-400 rounded-xl mb-2">
                            <div className="w-9 h-9 rounded-lg bg-orange-500 flex items-center justify-center flex-shrink-0">
                              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2v-4M9 21H5a2 2 0 01-2-2v-4m0 0h18"/>
                              </svg>
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="font-bold text-slate-800 text-sm truncate">{sel.patente || sel.code}</div>
                              <div className="text-xs text-slate-500 truncate">{sel.name}</div>
                            </div>
                            <button type="button" onClick={() => { setDatosEntrega({...datosEntrega, machineId: ''}); setSearchMaquina(''); }}
                              className="text-slate-400 hover:text-red-500 flex-shrink-0">
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
                            </button>
                          </div>
                        ) : null;
                      })()}
                      {!datosEntrega.machineId && (
                        <div className="grid grid-cols-2 gap-2 max-h-44 overflow-y-auto pr-1">
                          {(machines || [])
                            .filter(m => !m.name?.toLowerCase().includes('combustible') && !m.name?.toLowerCase().includes('mochila'))
                            .filter(m => !datosEntrega.empresa || m.empresa === datosEntrega.empresa)
                            .filter(m => !searchMaquina ||
                              m.patente?.toLowerCase().includes(searchMaquina.toLowerCase()) ||
                              m.name?.toLowerCase().includes(searchMaquina.toLowerCase()) ||
                              m.code?.toLowerCase().includes(searchMaquina.toLowerCase()))
                            .map(m => (
                              <button key={m.id} type="button"
                                onClick={() => { setDatosEntrega({...datosEntrega, machineId: m.id}); setSearchMaquina(''); }}
                                className="flex items-center gap-2 px-3 py-2 bg-white border-2 border-slate-200 hover:border-orange-400 hover:bg-orange-50 rounded-xl transition-all text-left">
                                <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0">
                                  <svg className="w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2v-4M9 21H5a2 2 0 01-2-2v-4m0 0h18"/>
                                  </svg>
                                </div>
                                <div className="min-w-0">
                                  <div className="font-bold text-slate-800 text-xs truncate">{m.patente || m.code}</div>
                                  <div className="text-[10px] text-slate-400 truncate">{m.name}</div>
                                </div>
                              </button>
                            ))}
                        </div>
                      )}
                    </>
                  ) : datosEntrega.empresa ? (
                    <div className="space-y-2">
                      <input type="text" placeholder="Patente *"
                        value={maquinaExterna.patente}
                        onChange={e => setMaquinaExterna({...maquinaExterna, patente: e.target.value})}
                        className="w-full px-4 py-2 border-2 border-blue-200 rounded-lg focus:outline-none focus:border-blue-500 text-sm"/>
                      <input type="text" placeholder="Tipo (ej: Excavadora, Bulldozer…) *"
                        value={maquinaExterna.tipo}
                        onChange={e => setMaquinaExterna({...maquinaExterna, tipo: e.target.value})}
                        className="w-full px-4 py-2 border-2 border-blue-200 rounded-lg focus:outline-none focus:border-blue-500 text-sm"/>
                      <input type="text" placeholder="Modelo (ej: Caterpillar 320)"
                        value={maquinaExterna.modelo}
                        onChange={e => setMaquinaExterna({...maquinaExterna, modelo: e.target.value})}
                        className="w-full px-4 py-2 border-2 border-blue-200 rounded-lg focus:outline-none focus:border-blue-500 text-sm"/>
                    </div>
                  ) : (
                    <div className="px-4 py-3 bg-slate-50 border-2 border-dashed border-slate-200 rounded-lg text-sm text-slate-400 text-center">
                      Primero selecciona una empresa
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">
                    Horómetro / Odómetro
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    value={datosEntrega.horometroOdometro}
                    onChange={(e) => setDatosEntrega({...datosEntrega, horometroOdometro: e.target.value})}
                    className="w-full px-4 py-2 border-2 border-blue-200 rounded-lg focus:outline-none focus:border-blue-500"
                    placeholder="Ej: 1234.5"
                  />
                </div>

                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">
                    Cantidad (Litros) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    required
                    min="0"
                    step="0.01"
                    value={datosEntrega.cantidadLitros}
                    onChange={(e) => setDatosEntrega({...datosEntrega, cantidadLitros: e.target.value})}
                    className="w-full px-4 py-2 border-2 border-blue-200 rounded-lg focus:outline-none focus:border-blue-500"
                    placeholder="Ej: 150.50"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-bold text-slate-700 mb-2">
                    Observaciones
                  </label>
                  <textarea
                    value={datosEntrega.observaciones}
                    onChange={(e) => setDatosEntrega({...datosEntrega, observaciones: e.target.value})}
                    className="w-full px-4 py-2 border-2 border-blue-200 rounded-lg focus:outline-none focus:border-blue-500 min-h-[80px]"
                    placeholder="Notas adicionales..."
                  />
                </div>
              </div>

              {/* Firma del Receptor */}
              <div className="mt-6">
                <label className="block text-sm font-bold text-slate-700 mb-3">
                  Firma del Receptor de Combustible <span className="text-red-500">*</span>
                </label>
                
                {firmaReceptor ? (
                  <div className="relative">
                    <div className="border-2 border-blue-500 rounded-xl p-4 bg-blue-50">
                      <img 
                        src={firmaReceptor} 
                        alt="Firma del receptor" 
                        className="max-h-32 mx-auto"
                      />
                      <div className="flex justify-center gap-2 mt-3">
                        <span className="px-3 py-1 bg-blue-600 text-white text-xs font-bold rounded-full">
                          ✓ Firmado
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setFirmaReceptor(null);
                            setShowModalFirmaReceptor(true);
                          }}
                          className="px-3 py-1 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold rounded-full transition-all"
                        >
                          Firmar nuevamente
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowModalFirmaReceptor(true)}
                    className="w-full px-6 py-4 border-2 border-dashed border-blue-300 rounded-xl bg-blue-50 hover:bg-blue-100 transition-all group"
                  >
                    <div className="flex flex-col items-center gap-2">
                      <svg className="w-12 h-12 text-blue-600 group-hover:scale-110 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                      </svg>
                      <span className="text-blue-800 font-bold">Click para firmar</span>
                      <span className="text-blue-600 text-xs">Se abrirá una ventana para capturar tu firma</span>
                    </div>
                  </button>
                )}
              </div>

              <div className="flex gap-3 pt-4 border-t border-blue-200">
                <button
                  onClick={() => setPaso(2)}
                  className="flex-1 px-6 py-3 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold rounded-xl transition-all"
                >
                  ← Atrás
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={loading || !datosEntrega.machineId || !datosEntrega.cantidadLitros || !firmaReceptor}
                  className="flex-1 px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:from-slate-300 disabled:to-slate-400 text-white font-bold rounded-xl transition-all shadow-lg hover:shadow-xl disabled:cursor-not-allowed"
                >
                  {loading ? 'Guardando...' : '✓ Guardar Entrega'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modal: Nuevo Equipo Surtidor */}
      {showModalEquipoSurtidor && (
        <div className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full">
            <div className="bg-gradient-to-r from-amber-600 to-orange-600 text-white p-6">
              <h3 className="text-xl font-black">🚛 Nuevo Equipo Surtidor</h3>
              <p className="text-amber-100 text-sm mt-1">Camión o equipo que entrega combustible</p>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">
                    Patente <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={nuevoEquipoSurtidor.patente}
                    onChange={(e) => setNuevoEquipoSurtidor({...nuevoEquipoSurtidor, patente: e.target.value.toUpperCase()})}
                    className="w-full px-4 py-2 border-2 border-amber-200 rounded-lg focus:outline-none focus:border-amber-500"
                    placeholder="Ej: AABB01"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">
                    Nombre <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={nuevoEquipoSurtidor.nombre}
                    onChange={(e) => setNuevoEquipoSurtidor({...nuevoEquipoSurtidor, nombre: e.target.value})}
                    className="w-full px-4 py-2 border-2 border-amber-200 rounded-lg focus:outline-none focus:border-amber-500"
                    placeholder="Ej: Camión Combustible"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">
                    Tipo
                  </label>
                  <input
                    type="text"
                    value={nuevoEquipoSurtidor.tipo}
                    onChange={(e) => setNuevoEquipoSurtidor({...nuevoEquipoSurtidor, tipo: e.target.value})}
                    className="w-full px-4 py-2 border-2 border-amber-200 rounded-lg focus:outline-none focus:border-amber-500"
                    placeholder="Ej: Camión, Mochila"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">
                    Marca
                  </label>
                  <input
                    type="text"
                    value={nuevoEquipoSurtidor.marca}
                    onChange={(e) => setNuevoEquipoSurtidor({...nuevoEquipoSurtidor, marca: e.target.value})}
                    className="w-full px-4 py-2 border-2 border-amber-200 rounded-lg focus:outline-none focus:border-amber-500"
                    placeholder="Ej: Mercedes Benz"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-bold text-slate-700 mb-2">
                    Modelo
                  </label>
                  <input
                    type="text"
                    value={nuevoEquipoSurtidor.modelo}
                    onChange={(e) => setNuevoEquipoSurtidor({...nuevoEquipoSurtidor, modelo: e.target.value})}
                    className="w-full px-4 py-2 border-2 border-amber-200 rounded-lg focus:outline-none focus:border-amber-500"
                    placeholder="Ej: Actros 2644"
                  />
                </div>
              </div>
              <div className="flex gap-3 pt-4 border-t border-amber-200">
                <button
                  onClick={() => {
                    setShowModalEquipoSurtidor(false);
                    setNuevoEquipoSurtidor({
                      patente: '',
                      nombre: '',
                      tipo: '',
                      marca: '',
                      modelo: ''
                    });
                  }}
                  className="flex-1 px-6 py-3 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold rounded-xl transition-all"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleCrearEquipoSurtidor}
                  disabled={loadingEquipo || !nuevoEquipoSurtidor.patente || !nuevoEquipoSurtidor.nombre}
                  className="flex-1 px-6 py-3 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 disabled:from-slate-300 disabled:to-slate-400 text-white font-bold rounded-xl transition-all shadow-lg disabled:cursor-not-allowed"
                >
                  {loadingEquipo ? 'Creando...' : '✓ Crear Equipo'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Nueva Empresa */}
      {showModalEmpresa && (
        <div className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full">
            <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white p-6">
              <h3 className="text-xl font-black">🏢 Nueva Empresa</h3>
              <p className="text-blue-100 text-sm mt-1">Empresa que recibe el combustible</p>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">
                  Nombre de la Empresa <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={nuevaEmpresa.nombre}
                  onChange={(e) => setNuevaEmpresa({...nuevaEmpresa, nombre: e.target.value})}
                  className="w-full px-4 py-2 border-2 border-blue-200 rounded-lg focus:outline-none focus:border-blue-500"
                  placeholder="Ej: Constructora ABC Ltda."
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">
                  RUT
                </label>
                <input
                  type="text"
                  value={nuevaEmpresa.rut}
                  onChange={(e) => setNuevaEmpresa({...nuevaEmpresa, rut: e.target.value})}
                  className="w-full px-4 py-2 border-2 border-blue-200 rounded-lg focus:outline-none focus:border-blue-500"
                  placeholder="Ej: 76.123.456-7"
                />
              </div>
              <div className="flex gap-3 pt-4 border-t border-blue-200">
                <button
                  onClick={() => {
                    setShowModalEmpresa(false);
                    setNuevaEmpresa({
                      nombre: '',
                      rut: ''
                    });
                  }}
                  className="flex-1 px-6 py-3 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold rounded-xl transition-all"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleCrearEmpresa}
                  disabled={loading || !nuevaEmpresa.nombre}
                  className="flex-1 px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:from-slate-300 disabled:to-slate-400 text-white font-bold rounded-xl transition-all shadow-lg disabled:cursor-not-allowed"
                >
                  {loading ? 'Creando...' : '✓ Crear Empresa'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Firma del Repartidor */}
      {showModalFirmaRepartidor && (
        <div className="fixed inset-0 z-[70] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full">
            <div className="bg-gradient-to-r from-green-600 to-emerald-600 text-white p-6">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="text-xl font-black">✍️ Firma del Repartidor</h3>
                  <p className="text-green-100 text-sm mt-1">Dibuja tu firma en el recuadro</p>
                </div>
                <button
                  onClick={() => setShowModalFirmaRepartidor(false)}
                  className="p-2 hover:bg-white/20 rounded-lg transition-all"
                >
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            <div className="p-6">
              <SignaturePad 
                label=""
                color="green"
                onSave={(signatureData) => {
                  setFirmaRepartidor(signatureData);
                  setShowModalFirmaRepartidor(false);
                }}
              />
              {showVoucherModal && lastReportData && (
              <VoucherGenerator
                reportData={lastReportData.reportData}
                projectName={lastReportData.projectName}
                machineInfo={lastReportData.machineInfo}
                operadorInfo={lastReportData.operadorInfo}
                empresaInfo={lastReportData.empresaInfo}
                onClose={() => {
                  setShowVoucherModal(false);
                  setLastReportData(null);
                  onClose();
                }}
            />
          )}
            </div>
          </div>
        </div>
      )}

      {/* Modal: Firma del Receptor */}
      {showModalFirmaReceptor && (
        <div className="fixed inset-0 z-[70] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full">
            <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white p-6">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="text-xl font-black">✍️ Firma del Receptor</h3>
                  <p className="text-blue-100 text-sm mt-1">Dibuja tu firma en el recuadro</p>
                </div>
                <button
                  onClick={() => setShowModalFirmaReceptor(false)}
                  className="p-2 hover:bg-white/20 rounded-lg transition-all"
                >
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            <div className="p-6">
              <SignaturePad 
                label=""
                color="blue"
                onSave={(signatureData) => {
                  setFirmaReceptor(signatureData);
                  setShowModalFirmaReceptor(false);
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Modal del generador de voucher térmico */}
      {showVoucherModal && lastReportData && (
        <VoucherGenerator
          reportData={lastReportData.reportData}
          projectName={lastReportData.projectName}
          machineInfo={lastReportData.machineInfo}
          operadorInfo={lastReportData.operadorInfo}
          empresaInfo={lastReportData.empresaInfo}
          repartidorInfo={lastReportData.repartidorInfo}
          equipoSurtidorInfo={lastReportData.equipoSurtidorInfo}
          onClose={() => {
            setShowVoucherModal(false);
            setLastReportData(null);
            onClose();
          }}
        />
      )}

      {/* Historial de vouchers del día */}
      <VoucherHistorialDia
        isOpen={showHistorial}
        onClose={() => setShowHistorial(false)}
        repartidorId={datosControl.repartidorId || currentUser?.uid}
        repartidorNombre={
          repartidorSeleccionado?.nombre ||
          currentUserData?.nombre ||
          currentUser?.email || ''
        }
        userRole={userRole}
        projects={projects}
        machines={machinesLocal?.length ? machinesLocal : (machines || [])}
        empleados={empleados || []}
        empresaId={empresaId}
      />

    </div>
  );
}
