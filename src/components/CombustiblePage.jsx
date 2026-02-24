import React, { useState, useEffect } from "react";
import { collection, getDocs, addDoc } from "firebase/firestore";
import { db, auth } from "../lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import VoucherGenerator from './VoucherGenerator';
import SignaturePad from "./SignaturePad";

export default function CombustiblePage({ onClose }) {
  const isOpen = true;
  const [projects, setProjects] = useState([]);
  const [machines, setMachines] = useState([]);
  const [empleados, setEmpleados] = useState([]);

  useEffect(() => {
    const loadData = async () => {
      try {
        const [pSnap, mSnap, eSnap] = await Promise.all([
          getDocs(collection(db, 'projects')),
          getDocs(collection(db, 'machines')),
          getDocs(collection(db, 'employees')),
        ]);
        setProjects(pSnap.docs.map(d => ({ id: d.id, ...d.data() })));
        setMachines(mSnap.docs.map(d => ({ id: d.id, ...d.data() })));
        setEmpleados(eSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (err) {
        console.error('Error cargando datos:', err);
      }
    };
    loadData();
  }, []);
  const [paso, setPaso] = useState(1); // 1: Control, 2: Tipo (Entrada/Entrega), 3: Formulario
  const [tipoReporte, setTipoReporte] = useState(''); // 'entrada' o 'entrega'
  const [loading, setLoading] = useState(false);
  const [loadingEquipo, setLoadingEquipo] = useState(false);
  const [loadingEmpresa, setLoadingEmpresa] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [currentUserData, setCurrentUserData] = useState(null); // Datos del user desde Firebase
  const [userRole, setUserRole] = useState('operador');


  const [showVoucherModal, setShowVoucherModal] = useState(false);
  const [lastReportData, setLastReportData] = useState(null);
  
  // Estados para las firmas
  const [firmaRepartidor, setFirmaRepartidor] = useState(null); // Para ENTRADA
  const [firmaReceptor, setFirmaReceptor] = useState(null); // Para SALIDA
  const [firmaReceptorTemp, setFirmaReceptorTemp] = useState(null); // Firma temporal hasta confirmar
  const [showModalFirmaRepartidor, setShowModalFirmaRepartidor] = useState(false);
  const [showModalFirmaReceptor, setShowModalFirmaReceptor] = useState(false);
  
  // Estados para modales de creación rápida
  const [showModalEquipoSurtidor, setShowModalEquipoSurtidor] = useState(false);
  const [showModalEmpresa, setShowModalEmpresa] = useState(false);
  const [searchOperador, setSearchOperador] = useState('');
  const [searchMaquina, setSearchMaquina] = useState('');
  const [operadorExterno, setOperadorExterno] = useState({ nombre: '', rut: '' });
  const [maquinaExterna, setMaquinaExterna] = useState({ patente: '', tipo: '', modelo: '' });
  
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
  const esMPF = (empresaId) => {
    if (!empresaId) return false;
    const emp = empresasLocal.find(e => e.id === empresaId);
    return emp?.nombre?.toLowerCase().includes('mpf') || false;
  };
  
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

  // Inicializar listas locales cuando el modal se abre
  useEffect(() => {
    if (isOpen) {
      setMachinesLocal(machines || []);
      // Cargar empresas desde Firebase o usar vacío
      cargarEmpresas();
    }
  }, [isOpen, machines]);

  const cargarEmpresas = async () => {
    try {
      const empresasRef = collection(db, 'empresas_combustible');
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
      
      const docRef = await addDoc(collection(db, 'machines'), {
        patente: nuevoEquipoSurtidor.patente.toUpperCase(),
        code: nuevoEquipoSurtidor.patente.toUpperCase(),
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
      const docRef = await addDoc(collection(db, 'empresas_combustible'), {
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
        repartidorNombre: currentUserData?.nombre || '',
        repartidorRut: currentUserData?.rut || ''
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
          ...(esMPF(datosEntrega.empresa) ? {} : { operadorExterno, maquinaExterna })
        };
        dataToSave.firmaReceptor = firmaReceptor;
        dataToSave.fechaFirma = new Date().toISOString();
      }

      const reporteDocRef = await addDoc(collection(db, 'reportes_combustible'), dataToSave);

      console.log('✅ Reporte guardado en Firebase');
      console.log('📝 Tipo de reporte:', tipoReporte);

      if (tipoReporte === 'entrega') {
      console.log('🎯 Es una entrega, preparando modal de voucher...');
      const projectInfo = projects?.find(p => p.id === datosControl.projectId);
      const machineInfo = machinesLocal?.find(m => m.id === datosEntrega.machineId);
      const operadorInfo = empleados?.find(e => e.id === datosEntrega.operadorId);
      const empresaInfo = empresasLocal?.find(e => e.id === datosEntrega.empresa);
      
      // NUEVO: Obtener información del repartidor y equipo surtidor
      const repartidorInfo = empleados?.find(e => e.id === datosControl.repartidorId) || currentUserData;
      const equipoSurtidorInfo = machinesLocal?.find(m => m.id === datosControl.equipoSurtidorId);
      
      console.log('📊 Información recopilada:', {
        projectInfo,
        machineInfo,
        operadorInfo,
        empresaInfo,
        repartidorInfo,
        equipoSurtidorInfo
      });
      
      setLastReportData({
        reporteId: reporteDocRef.id,
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

  return (
    <div className="min-h-screen bg-slate-100 py-4 px-2 sm:px-4">
      <div className="max-w-2xl w-full mx-auto space-y-4">

        {/* ── HEADER estilo Paso2Form ── */}
        <div className="bg-gradient-to-r from-slate-800 to-slate-900 text-white p-4 sm:p-6 rounded-xl shadow-lg">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-lg bg-white/20 flex items-center justify-center flex-shrink-0">
              <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.879 16.121A3 3 0 1012.015 11L11 14H9c0 .768.293 1.536.879 2.121z" />
              </svg>
            </div>
            <div className="flex-1">
              <p className="text-slate-400 text-xs font-semibold uppercase tracking-wide">Paso {paso} de 3</p>
              <h2 className="text-xl sm:text-2xl font-bold">
                {paso === 1 && "Control de Combustible"}
                {paso === 2 && "Tipo de Reporte"}
                {paso === 3 && tipoReporte === 'entrada' && "Entrada de Combustible"}
                {paso === 3 && tipoReporte === 'entrega' && "Entrega de Combustible"}
              </h2>
              <p className="text-slate-400 text-sm">
                {paso === 1 && "Información general del control"}
                {paso === 2 && "Selecciona el tipo de operación"}
                {paso === 3 && tipoReporte === 'entrada' && "Recepción al estanque"}
                {paso === 3 && tipoReporte === 'entrega' && "Despacho a máquina"}
              </p>
            </div>
            {paso === 3 && (
              <span className={`px-3 py-1 rounded-lg text-xs font-bold flex-shrink-0 ${tipoReporte === 'entrada' ? 'bg-emerald-500/30 text-emerald-300' : 'bg-orange-500/30 text-orange-300'}`}>
                {tipoReporte === 'entrada' ? '⬇ ENTRADA' : '⬆ SALIDA'}
              </span>
            )}
            <button onClick={handleClose} className="w-9 h-9 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors flex-shrink-0">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* ── PASO 1: Control de Combustible ── */}
        {paso === 1 && (
          <div className="space-y-4">

            {/* Información Básica */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 sm:p-6">
              <div className="flex items-center gap-2 mb-4">
                <svg className="w-5 h-5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <h3 className="text-base font-bold text-slate-900">Información Básica</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                    Proyecto <span className="text-red-500">*</span>
                  </label>
                  <select
                    required
                    value={datosControl.projectId}
                    onChange={(e) => setDatosControl({...datosControl, projectId: e.target.value})}
                    className="w-full px-3 py-2.5 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-slate-500 bg-white text-slate-800 font-medium"
                  >
                    <option value="">Seleccionar...</option>
                    {projects.map(p => (
                      <option key={p.id} value={p.id}>{p.name || p.id}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                    Fecha <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={datosControl.fecha}
                    onChange={(e) => setDatosControl({...datosControl, fecha: e.target.value})}
                    className="w-full px-3 py-2.5 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-slate-500 bg-white text-slate-800"
                    max={new Date().toISOString().split('T')[0]}
                  />
                </div>
              </div>
            </div>

            {/* Repartidor */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 sm:p-6">
              <div className="flex items-center gap-2 mb-4">
                <svg className="w-5 h-5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                <h3 className="text-base font-bold text-slate-900">Repartidor / Surtidor</h3>
              </div>
              <div className="flex items-center gap-3 px-4 py-3 bg-slate-50 border-2 border-slate-200 rounded-xl">
                <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </div>
                <div className="flex-1">
                  {currentUserData ? (
                    <>
                      <div className="font-bold text-slate-900">{currentUserData.nombre || 'Sin nombre'}</div>
                      <div className="text-xs text-slate-500">{currentUserData.rut && `RUT: ${currentUserData.rut}`} {currentUserData.email && `· ${currentUserData.email}`}</div>
                    </>
                  ) : (
                    <>
                      <div className="font-bold text-red-600">⚠ Usuario no encontrado en el sistema</div>
                      <div className="text-xs text-slate-500">{currentUser?.email || 'Sin email'} — Contacta al administrador</div>
                    </>
                  )}
                </div>
                {currentUserData && (
                  <svg className="w-5 h-5 text-emerald-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                )}
              </div>
              {currentUserData && (
                <p className="text-xs text-emerald-600 mt-2 flex items-center gap-1">
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                  Autocompletado desde tu perfil
                </p>
              )}
            </div>

            {/* Equipo Surtidor */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 sm:p-6">
              <div className="flex items-center gap-2 mb-4">
                <svg className="w-5 h-5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2v-4M9 21H5a2 2 0 01-2-2v-4m0 0h18" />
                </svg>
                <h3 className="text-base font-bold text-slate-900">Equipo Surtidor</h3>
                <span className="text-xs text-slate-400 font-normal">(Camión / Mochila)</span>
              </div>
              <div className="flex gap-2">
                <select
                  value={datosControl.equipoSurtidorId}
                  onChange={(e) => setDatosControl({...datosControl, equipoSurtidorId: e.target.value})}
                  className="flex-1 px-3 py-2.5 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-slate-500 bg-white text-slate-800"
                >
                  <option value="">Seleccionar...</option>
                  {machinesLocal.filter(m =>
                    m.name?.toLowerCase().includes('combustible') ||
                    m.name?.toLowerCase().includes('surtidor') ||
                    m.name?.toLowerCase().includes('camion') ||
                    m.name?.toLowerCase().includes('camión') ||
                    m.name?.toLowerCase().includes('mochila') ||
                    m.categoria === 'surtidor_combustible'
                  ).map(m => (
                    <option key={m.id} value={m.id}>{m.patente} — {m.name}</option>
                  ))}
                </select>
                {userRole === 'administrador' && (
                  <button
                    type="button"
                    onClick={() => setShowModalEquipoSurtidor(true)}
                    className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-bold text-sm transition-all"
                    title="Agregar nuevo equipo surtidor"
                  >
                    +
                  </button>
                )}
              </div>
            </div>

            {/* Botón siguiente */}
            <button
              onClick={() => {
                if (!datosControl.projectId || !datosControl.repartidorId) {
                  alert("Por favor completa el Proyecto y el Repartidor");
                  return;
                }
                setPaso(2);
              }}
              className="w-full px-6 py-4 bg-slate-800 hover:bg-slate-700 active:bg-slate-900 text-white font-bold rounded-xl transition-all shadow-md text-base"
            >
              Siguiente →
            </button>
          </div>
        )}

        {/* ── PASO 2: Selección de tipo ── */}
        {paso === 2 && (
          <div className="space-y-4">
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 sm:p-6">
              <div className="flex items-center gap-2 mb-4">
                <svg className="w-5 h-5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 9l4-4 4 4m0 6l-4 4-4-4" />
                </svg>
                <h3 className="text-base font-bold text-slate-900">Tipo de Operación</h3>
              </div>
              <p className="text-sm text-slate-500 mb-4">¿Qué operación vas a registrar?</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => { setTipoReporte('entrada'); setPaso(3); }}
                  className="flex items-center gap-4 p-4 bg-white border-2 border-slate-200 hover:border-emerald-400 hover:bg-emerald-50 rounded-xl transition-all text-left group"
                >
                  <div className="w-12 h-12 rounded-xl bg-emerald-100 group-hover:bg-emerald-200 flex items-center justify-center flex-shrink-0 transition-colors">
                    <svg className="w-6 h-6 text-emerald-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                  <div>
                    <div className="font-bold text-slate-900">Entrada</div>
                    <div className="text-xs text-slate-500 mt-0.5">Recepción al estanque</div>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => { setTipoReporte('entrega'); setPaso(3); }}
                  className="flex items-center gap-4 p-4 bg-white border-2 border-slate-200 hover:border-orange-400 hover:bg-orange-50 rounded-xl transition-all text-left group"
                >
                  <div className="w-12 h-12 rounded-xl bg-orange-100 group-hover:bg-orange-200 flex items-center justify-center flex-shrink-0 transition-colors">
                    <svg className="w-6 h-6 text-orange-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
                    </svg>
                  </div>
                  <div>
                    <div className="font-bold text-slate-900">Salida</div>
                    <div className="text-xs text-slate-500 mt-0.5">Despacho a máquina</div>
                  </div>
                </button>
              </div>
            </div>
            <button
              onClick={() => setPaso(1)}
              className="w-full px-6 py-3 bg-white hover:bg-slate-50 text-slate-700 font-bold rounded-xl border-2 border-slate-200 transition-all"
            >
              ← Atrás
            </button>
          </div>
        )}

        {/* ── PASO 3a: ENTRADA ── */}
        {paso === 3 && tipoReporte === 'entrada' && (
          <div className="space-y-4">

            {/* Tipo de Origen */}
            <div className="bg-white rounded-xl shadow-sm border-2 border-emerald-200 p-4 sm:p-6">
              <div className="flex items-center gap-2 mb-4">
                <svg className="w-5 h-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
                <h3 className="text-base font-bold text-slate-900">Datos de Entrada</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                    Tipo de Origen <span className="text-red-500">*</span>
                  </label>
                  <select
                    required
                    value={datosEntrada.tipoOrigen}
                    onChange={(e) => setDatosEntrada({...datosEntrada, tipoOrigen: e.target.value})}
                    className="w-full px-3 py-2.5 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-slate-500 bg-white text-slate-800"
                  >
                    <option value="">Seleccionar...</option>
                    <option value="estacion">⛽ Estación de Servicio</option>
                    <option value="estanque">🛢️ Estanque</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">Origen</label>
                  <div className="flex gap-2">
                    <select
                      value={datosEntrada.origen}
                      onChange={(e) => setDatosEntrada({...datosEntrada, origen: e.target.value})}
                      className="flex-1 px-3 py-2.5 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-slate-500 bg-white text-slate-800"
                    >
                      <option value="">Seleccionar...</option>
                      {empresasLocal.map(emp => (
                        <option key={emp.id} value={emp.id}>{emp.nombre}{emp.rut ? ` — ${emp.rut}` : ''}</option>
                      ))}
                    </select>
                    {userRole === 'administrador' && (
                      <button type="button" onClick={() => setShowModalEmpresa(true)}
                        className="px-3 py-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-bold text-sm transition-all">+</button>
                    )}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                    {datosEntrada.tipoOrigen === 'estacion' ? 'N° de Guía' : datosEntrada.tipoOrigen === 'estanque' ? 'N° de Vale' : 'N° de Documento'} <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={datosEntrada.numeroDocumento}
                    onChange={(e) => setDatosEntrada({...datosEntrada, numeroDocumento: e.target.value})}
                    className="w-full px-3 py-2.5 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-slate-500 bg-white"
                    placeholder={datosEntrada.tipoOrigen === 'estacion' ? 'Ej: GD-12345' : datosEntrada.tipoOrigen === 'estanque' ? 'Ej: VALE-001' : 'Número de documento'}
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">Fecha del Documento <span className="text-red-500">*</span></label>
                  <input
                    type="date"
                    required
                    value={datosEntrada.fechaDocumento}
                    onChange={(e) => setDatosEntrada({...datosEntrada, fechaDocumento: e.target.value})}
                    className="w-full px-3 py-2.5 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-slate-500 bg-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">Cantidad (Litros) <span className="text-red-500">*</span></label>
                  <input
                    type="number"
                    required
                    min="0"
                    step="0.01"
                    value={datosEntrada.cantidad}
                    onChange={(e) => setDatosEntrada({...datosEntrada, cantidad: e.target.value})}
                    className="w-full px-3 py-2.5 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-slate-500 bg-white"
                    placeholder="Ej: 5000"
                  />
                </div>
                {datosEntrada.tipoOrigen && (
                  <div className="flex items-start gap-3 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl">
                    <svg className="w-5 h-5 text-slate-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <p className="text-sm text-slate-600">
                      {datosEntrada.tipoOrigen === 'estacion'
                        ? <><strong>Estación de Servicio:</strong> Se requiere Guía de Despacho del proveedor.</>
                        : <><strong>Estanque:</strong> Se requiere Vale interno de autorización.</>}
                    </p>
                  </div>
                )}
                <div className="md:col-span-2">
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">Observaciones</label>
                  <textarea
                    value={datosEntrada.observaciones}
                    onChange={(e) => setDatosEntrada({...datosEntrada, observaciones: e.target.value})}
                    className="w-full px-3 py-2.5 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-slate-500 bg-white min-h-[80px] resize-none"
                    placeholder="Notas adicionales..."
                  />
                </div>
              </div>
            </div>

            {/* Firma Repartidor */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 sm:p-6">
              <div className="flex items-center gap-2 mb-4">
                <svg className="w-5 h-5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                </svg>
                <h3 className="text-base font-bold text-slate-900">Firma del Repartidor <span className="text-red-500">*</span></h3>
              </div>
              {firmaRepartidor ? (
                <div className="border-2 border-emerald-400 bg-emerald-50 rounded-xl p-4">
                  <img src={firmaRepartidor} alt="Firma" className="max-h-28 mx-auto" />
                  <div className="flex justify-center gap-2 mt-3">
                    <span className="px-3 py-1 bg-emerald-600 text-white text-xs font-bold rounded-full">✓ Firmado</span>
                    <button type="button" onClick={() => { setFirmaRepartidor(null); setShowModalFirmaRepartidor(true); }}
                      className="px-3 py-1 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold rounded-full transition-all">
                      Firmar nuevamente
                    </button>
                  </div>
                </div>
              ) : (
                <button type="button" onClick={() => setShowModalFirmaRepartidor(true)}
                  className="w-full px-6 py-5 bg-slate-800 hover:bg-slate-700 active:bg-slate-900 text-white font-semibold rounded-xl transition-all shadow-md flex items-center justify-center gap-3">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                  </svg>
                  Firmar documento
                </button>
              )}
            </div>

            {/* Botones */}
            <div className="flex gap-3">
              <button onClick={() => setPaso(2)} className="flex-1 px-6 py-3 bg-white hover:bg-slate-50 text-slate-700 font-bold rounded-xl border-2 border-slate-200 transition-all">← Atrás</button>
              <button
                onClick={handleSubmit}
                disabled={loading || !datosEntrada.numeroDocumento || !datosEntrada.cantidad || !firmaRepartidor}
                className="flex-1 px-6 py-3 bg-slate-800 hover:bg-slate-700 disabled:bg-slate-300 text-white font-bold rounded-xl transition-all shadow-md disabled:cursor-not-allowed"
              >
                {loading ? 'Guardando...' : '✓ Guardar Entrada'}
              </button>
            </div>
          </div>
        )}

        {/* ── PASO 3b: ENTREGA ── */}
        {paso === 3 && tipoReporte === 'entrega' && (
          <div className="space-y-4">

            {/* Empresa */}
            <div className="bg-white rounded-xl shadow-sm border-2 border-orange-200 p-4 sm:p-6">
              <div className="flex items-center gap-2 mb-4">
                <svg className="w-5 h-5 text-orange-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
                </svg>
                <h3 className="text-base font-bold text-slate-900">Datos de Entrega</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

                {/* Empresa */}
                <div className="md:col-span-2">
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">Empresa</label>
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
                      className="flex-1 px-3 py-2.5 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-slate-500 bg-white text-slate-800"
                    >
                      <option value="">Seleccionar...</option>
                      {empresasLocal.map(emp => (
                        <option key={emp.id} value={emp.id}>{emp.nombre}{emp.rut ? ` — ${emp.rut}` : ''}</option>
                      ))}
                    </select>
                    {userRole === 'administrador' && (
                      <button type="button" onClick={() => setShowModalEmpresa(true)}
                        className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-bold text-sm transition-all">+</button>
                    )}
                  </div>
                </div>

                {/* Operador */}
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">Operador <span className="text-red-500">*</span></label>
                  {esMPF(datosEntrega.empresa) ? (
                    <>
                      <div className="relative mb-2">
                        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z"/></svg>
                        <input type="text" placeholder="Buscar operador..."
                          value={searchOperador}
                          onChange={e => setSearchOperador(e.target.value)}
                          className="w-full pl-9 pr-4 py-2.5 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-slate-500 text-sm bg-white" />
                      </div>
                      {datosEntrega.operadorId && (() => {
                        const sel = empleados.find(e => e.id === datosEntrega.operadorId);
                        return sel ? (
                          <div className="flex items-center gap-3 px-3 py-2 bg-orange-50 border-2 border-orange-400 rounded-xl mb-2">
                            <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-white font-bold text-xs flex-shrink-0">{sel.nombre?.charAt(0).toUpperCase()}</div>
                            <div className="flex-1 min-w-0">
                              <div className="font-bold text-slate-800 text-sm truncate">{sel.nombre}</div>
                              <div className="text-xs text-slate-500">{sel.rut || 'Sin RUT'}</div>
                            </div>
                            <button type="button" onClick={() => { setDatosEntrega({...datosEntrega, operadorId: ''}); setSearchOperador(''); }}
                              className="text-slate-400 hover:text-red-500">
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
                            </button>
                          </div>
                        ) : null;
                      })()}
                      {!datosEntrega.operadorId && (
                        <div className="grid grid-cols-1 gap-1.5 max-h-40 overflow-y-auto pr-1">
                          {empleados.filter(emp => !searchOperador || emp.nombre?.toLowerCase().includes(searchOperador.toLowerCase()) || emp.rut?.includes(searchOperador)).map(emp => (
                            <button key={emp.id} type="button"
                              onClick={() => { setDatosEntrega({...datosEntrega, operadorId: emp.id}); setSearchOperador(''); }}
                              className="flex items-center gap-2 px-3 py-2 bg-white border-2 border-slate-200 hover:border-slate-400 hover:bg-slate-50 rounded-xl transition-all text-left">
                              <div className="w-7 h-7 rounded-full bg-slate-200 flex items-center justify-center text-slate-600 font-bold text-xs flex-shrink-0">{emp.nombre?.charAt(0).toUpperCase()}</div>
                              <div className="min-w-0">
                                <div className="font-semibold text-slate-800 text-xs truncate">{emp.nombre}</div>
                                <div className="text-[10px] text-slate-400">{emp.rut || 'Sin RUT'}</div>
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </>
                  ) : datosEntrega.empresa ? (
                    <div className="space-y-2">
                      <input type="text" placeholder="Nombre completo *" value={operadorExterno.nombre}
                        onChange={e => setOperadorExterno({...operadorExterno, nombre: e.target.value})}
                        className="w-full px-3 py-2.5 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-slate-500 bg-white text-sm" />
                      <input type="text" placeholder="RUT (ej: 12.345.678-9)" value={operadorExterno.rut}
                        onChange={e => setOperadorExterno({...operadorExterno, rut: e.target.value})}
                        className="w-full px-3 py-2.5 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-slate-500 bg-white text-sm" />
                    </div>
                  ) : (
                    <div className="px-4 py-3 bg-slate-50 border-2 border-dashed border-slate-200 rounded-xl text-sm text-slate-400 text-center">Primero selecciona una empresa</div>
                  )}
                </div>

                {/* Máquina */}
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">Máquina <span className="text-red-500">*</span></label>
                  {esMPF(datosEntrega.empresa) ? (
                    <>
                      <div className="relative mb-2">
                        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z"/></svg>
                        <input type="text" placeholder="Buscar por patente o nombre..." value={searchMaquina}
                          onChange={e => setSearchMaquina(e.target.value)}
                          className="w-full pl-9 pr-4 py-2.5 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-slate-500 text-sm bg-white" />
                      </div>
                      {datosEntrega.machineId && (() => {
                        const sel = machines.find(m => m.id === datosEntrega.machineId);
                        return sel ? (
                          <div className="flex items-center gap-3 px-3 py-2 bg-orange-50 border-2 border-orange-400 rounded-xl mb-2">
                            <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center flex-shrink-0">
                              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2v-4M9 21H5a2 2 0 01-2-2v-4m0 0h18"/></svg>
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="font-bold text-slate-800 text-sm truncate">{sel.patente || sel.code}</div>
                              <div className="text-xs text-slate-500 truncate">{sel.name}</div>
                            </div>
                            <button type="button" onClick={() => { setDatosEntrega({...datosEntrega, machineId: ''}); setSearchMaquina(''); }}
                              className="text-slate-400 hover:text-red-500">
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
                            </button>
                          </div>
                        ) : null;
                      })()}
                      {!datosEntrega.machineId && (
                        <div className="grid grid-cols-1 gap-1.5 max-h-40 overflow-y-auto pr-1">
                          {machines.filter(m => !m.name?.toLowerCase().includes('combustible') && !m.name?.toLowerCase().includes('mochila'))
                            .filter(m => !searchMaquina || m.patente?.toLowerCase().includes(searchMaquina.toLowerCase()) || m.name?.toLowerCase().includes(searchMaquina.toLowerCase()) || m.code?.toLowerCase().includes(searchMaquina.toLowerCase()))
                            .map(m => (
                              <button key={m.id} type="button"
                                onClick={() => { setDatosEntrega({...datosEntrega, machineId: m.id}); setSearchMaquina(''); }}
                                className="flex items-center gap-2 px-3 py-2 bg-white border-2 border-slate-200 hover:border-slate-400 hover:bg-slate-50 rounded-xl transition-all text-left">
                                <div className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0">
                                  <svg className="w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2v-4M9 21H5a2 2 0 01-2-2v-4m0 0h18"/></svg>
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
                      <input type="text" placeholder="Patente *" value={maquinaExterna.patente}
                        onChange={e => setMaquinaExterna({...maquinaExterna, patente: e.target.value})}
                        className="w-full px-3 py-2.5 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-slate-500 bg-white text-sm" />
                      <input type="text" placeholder="Tipo (ej: Excavadora, Bulldozer…) *" value={maquinaExterna.tipo}
                        onChange={e => setMaquinaExterna({...maquinaExterna, tipo: e.target.value})}
                        className="w-full px-3 py-2.5 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-slate-500 bg-white text-sm" />
                      <input type="text" placeholder="Modelo (ej: Caterpillar 320)" value={maquinaExterna.modelo}
                        onChange={e => setMaquinaExterna({...maquinaExterna, modelo: e.target.value})}
                        className="w-full px-3 py-2.5 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-slate-500 bg-white text-sm" />
                    </div>
                  ) : (
                    <div className="px-4 py-3 bg-slate-50 border-2 border-dashed border-slate-200 rounded-xl text-sm text-slate-400 text-center">Primero selecciona una empresa</div>
                  )}
                </div>

                {/* Horómetro y Litros */}
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">Horómetro / Odómetro</label>
                  <input
                    type="number" min="0" step="0.1"
                    value={datosEntrega.horometroOdometro}
                    onChange={(e) => setDatosEntrega({...datosEntrega, horometroOdometro: e.target.value})}
                    className="w-full px-3 py-2.5 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-slate-500 bg-white"
                    placeholder="Ej: 1234.5"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">Cantidad (Litros) <span className="text-red-500">*</span></label>
                  <input
                    type="number" required min="0" step="0.01"
                    value={datosEntrega.cantidadLitros}
                    onChange={(e) => setDatosEntrega({...datosEntrega, cantidadLitros: e.target.value})}
                    className="w-full px-3 py-2.5 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-slate-500 bg-white"
                    placeholder="Ej: 150.50"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">Observaciones</label>
                  <textarea
                    value={datosEntrega.observaciones}
                    onChange={(e) => setDatosEntrega({...datosEntrega, observaciones: e.target.value})}
                    className="w-full px-3 py-2.5 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-slate-500 bg-white min-h-[80px] resize-none"
                    placeholder="Notas adicionales..."
                  />
                </div>
              </div>
            </div>

            {/* Firma Receptor */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 sm:p-6">
              <div className="flex items-center gap-2 mb-4">
                <svg className="w-5 h-5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                </svg>
                <h3 className="text-base font-bold text-slate-900">Firma del Receptor <span className="text-red-500">*</span></h3>
              </div>
              {firmaReceptor ? (
                <div className="border-2 border-slate-400 bg-slate-50 rounded-xl p-4">
                  <img src={firmaReceptor} alt="Firma" className="max-h-28 mx-auto" />
                  <div className="flex justify-center gap-2 mt-3">
                    <span className="px-3 py-1 bg-slate-700 text-white text-xs font-bold rounded-full">✓ Firmado</span>
                    <button type="button" onClick={() => { setFirmaReceptor(null); setShowModalFirmaReceptor(true); }}
                      className="px-3 py-1 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold rounded-full transition-all">
                      Firmar nuevamente
                    </button>
                  </div>
                </div>
              ) : (
                <button type="button" onClick={() => setShowModalFirmaReceptor(true)}
                  className="w-full px-6 py-5 bg-slate-800 hover:bg-slate-700 active:bg-slate-900 text-white font-semibold rounded-xl transition-all shadow-md flex items-center justify-center gap-3">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                  </svg>
                  Firmar documento
                </button>
              )}
            </div>

            {/* Botones */}
            <div className="flex gap-3">
              <button onClick={() => setPaso(2)} className="flex-1 px-6 py-3 bg-white hover:bg-slate-50 text-slate-700 font-bold rounded-xl border-2 border-slate-200 transition-all">← Atrás</button>
              <button
                onClick={handleSubmit}
                disabled={loading || !datosEntrega.machineId || !datosEntrega.cantidadLitros || !firmaReceptor}
                className="flex-1 px-6 py-3 bg-slate-800 hover:bg-slate-700 disabled:bg-slate-300 text-white font-bold rounded-xl transition-all shadow-md disabled:cursor-not-allowed"
              >
                {loading ? 'Guardando...' : '✓ Guardar Entrega'}
              </button>
            </div>
          </div>
        )}

      </div>

      {/* ── MODALES ── */}

      {/* Modal: Nuevo Equipo Surtidor */}
      {showModalEquipoSurtidor && (
        <div className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full">
            <div className="bg-gradient-to-r from-slate-800 to-slate-900 text-white p-6 rounded-t-2xl">
              <h3 className="text-xl font-bold">Nuevo Equipo Surtidor</h3>
              <p className="text-slate-400 text-sm mt-1">Camión o equipo que entrega combustible</p>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">Patente <span className="text-red-500">*</span></label>
                  <input type="text" value={nuevoEquipoSurtidor.patente}
                    onChange={(e) => setNuevoEquipoSurtidor({...nuevoEquipoSurtidor, patente: e.target.value.toUpperCase()})}
                    className="w-full px-3 py-2.5 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-slate-500 bg-white"
                    placeholder="Ej: AABB01" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">Nombre <span className="text-red-500">*</span></label>
                  <input type="text" value={nuevoEquipoSurtidor.nombre}
                    onChange={(e) => setNuevoEquipoSurtidor({...nuevoEquipoSurtidor, nombre: e.target.value})}
                    className="w-full px-3 py-2.5 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-slate-500 bg-white"
                    placeholder="Ej: Camión Combustible" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">Tipo</label>
                  <input type="text" value={nuevoEquipoSurtidor.tipo}
                    onChange={(e) => setNuevoEquipoSurtidor({...nuevoEquipoSurtidor, tipo: e.target.value})}
                    className="w-full px-3 py-2.5 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-slate-500 bg-white"
                    placeholder="Ej: Camión, Mochila" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">Marca</label>
                  <input type="text" value={nuevoEquipoSurtidor.marca}
                    onChange={(e) => setNuevoEquipoSurtidor({...nuevoEquipoSurtidor, marca: e.target.value})}
                    className="w-full px-3 py-2.5 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-slate-500 bg-white"
                    placeholder="Ej: Mercedes Benz" />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">Modelo</label>
                  <input type="text" value={nuevoEquipoSurtidor.modelo}
                    onChange={(e) => setNuevoEquipoSurtidor({...nuevoEquipoSurtidor, modelo: e.target.value})}
                    className="w-full px-3 py-2.5 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-slate-500 bg-white"
                    placeholder="Ej: Actros 2644" />
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={() => { setShowModalEquipoSurtidor(false); setNuevoEquipoSurtidor({ patente:'', nombre:'', tipo:'', marca:'', modelo:'' }); }}
                  className="flex-1 px-6 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition-all">Cancelar</button>
                <button onClick={handleCrearEquipoSurtidor} disabled={loadingEquipo || !nuevoEquipoSurtidor.patente || !nuevoEquipoSurtidor.nombre}
                  className="flex-1 px-6 py-3 bg-slate-800 hover:bg-slate-700 disabled:bg-slate-300 text-white font-bold rounded-xl transition-all shadow-md disabled:cursor-not-allowed">
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
            <div className="bg-gradient-to-r from-slate-800 to-slate-900 text-white p-6 rounded-t-2xl">
              <h3 className="text-xl font-bold">Nueva Empresa</h3>
              <p className="text-slate-400 text-sm mt-1">Empresa que recibe el combustible</p>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Nombre de la Empresa <span className="text-red-500">*</span></label>
                <input type="text" value={nuevaEmpresa.nombre}
                  onChange={(e) => setNuevaEmpresa({...nuevaEmpresa, nombre: e.target.value})}
                  className="w-full px-3 py-2.5 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-slate-500 bg-white"
                  placeholder="Ej: Constructora ABC Ltda." />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">RUT</label>
                <input type="text" value={nuevaEmpresa.rut}
                  onChange={(e) => setNuevaEmpresa({...nuevaEmpresa, rut: e.target.value})}
                  className="w-full px-3 py-2.5 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-slate-500 bg-white"
                  placeholder="Ej: 76.123.456-7" />
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={() => { setShowModalEmpresa(false); setNuevaEmpresa({ nombre:'', rut:'' }); }}
                  className="flex-1 px-6 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition-all">Cancelar</button>
                <button onClick={handleCrearEmpresa} disabled={loading || !nuevaEmpresa.nombre}
                  className="flex-1 px-6 py-3 bg-slate-800 hover:bg-slate-700 disabled:bg-slate-300 text-white font-bold rounded-xl transition-all shadow-md disabled:cursor-not-allowed">
                  {loading ? 'Creando...' : '✓ Crear Empresa'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Firma del Repartidor */}
      {showModalFirmaRepartidor && (
        <div className="fixed inset-0 z-[70] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full my-auto">
            <div className="bg-gradient-to-r from-slate-800 to-slate-900 text-white p-6 rounded-t-2xl sticky top-0 z-10">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="text-xl font-bold">Firma del Repartidor</h3>
                  <p className="text-slate-400 text-sm mt-1">Dibuja tu firma y presiona Confirmar</p>
                </div>
                <button onClick={() => setShowModalFirmaRepartidor(false)} className="p-2 hover:bg-white/10 rounded-lg transition-all">
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            </div>
            <div className="p-6">
              <SignaturePad label="" color="green" onSave={(signatureData) => { setFirmaRepartidor(signatureData); }} />
              <div className="flex gap-3 mt-4">
                <button onClick={() => setShowModalFirmaRepartidor(false)}
                  className="flex-1 px-6 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition-all">Cancelar</button>
                <button onClick={() => { if (firmaRepartidor) setShowModalFirmaRepartidor(false); }} disabled={!firmaRepartidor}
                  className="flex-1 px-6 py-3 bg-slate-800 hover:bg-slate-700 disabled:bg-slate-300 text-white font-bold rounded-xl transition-all shadow-md disabled:cursor-not-allowed">
                  ✓ Confirmar firma
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Firma del Receptor */}
      {showModalFirmaReceptor && (
        <div className="fixed inset-0 z-[70] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full my-auto">
            <div className="bg-gradient-to-r from-slate-800 to-slate-900 text-white p-6 rounded-t-2xl sticky top-0 z-10">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="text-xl font-bold">Firma del Receptor</h3>
                  <p className="text-slate-400 text-sm mt-1">Dibuja tu firma y presiona Confirmar</p>
                </div>
                <button onClick={() => { setFirmaReceptorTemp(null); setShowModalFirmaReceptor(false); }} className="p-2 hover:bg-white/10 rounded-lg transition-all">
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            </div>
            <div className="p-6">
              <SignaturePad label="" color="blue" onSave={(signatureData) => { setFirmaReceptorTemp(signatureData); }} />
              <div className="flex gap-3 mt-4">
                <button onClick={() => { setFirmaReceptorTemp(null); setShowModalFirmaReceptor(false); }}
                  className="flex-1 px-6 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition-all">Cancelar</button>
                <button onClick={() => { if (firmaReceptorTemp) { setFirmaReceptor(firmaReceptorTemp); setFirmaReceptorTemp(null); setShowModalFirmaReceptor(false); } }}
                  disabled={!firmaReceptorTemp}
                  className="flex-1 px-6 py-3 bg-slate-800 hover:bg-slate-700 disabled:bg-slate-300 text-white font-bold rounded-xl transition-all shadow-md disabled:cursor-not-allowed">
                  ✓ Confirmar firma
                </button>
              </div>
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
          reporteId={lastReportData.reporteId}
          onClose={() => {
            setShowVoucherModal(false);
            setLastReportData(null);
            onClose();
          }}
        />
      )}

    </div>
  );
}
