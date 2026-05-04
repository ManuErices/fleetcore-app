import React, { useState, useEffect } from "react";
import { collection, getDocs, addDoc } from "firebase/firestore";
import { db, auth } from "../lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import VoucherGenerator from './VoucherGenerator';
import VoucherHistorialDia from './VoucherHistorialDia';
// import SignaturePad from "./SignaturePad"; // reemplazado por CameraCapture
import CameraCapture from './CameraCapture';
import { getNextGuiaNumber } from '../utils/voucherThermalGenerator';
import { useToast, ToastContainer } from './Toast';
import { useEmpresaData } from '../hooks/useEmpresaData';

export default function CombustibleForm({ empresaId, onClose }) {
  const { toast, toasts, removeToast } = useToast();
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
  const [repartidorSeleccionado, setRepartidorSeleccionado] = useState(null); // empleado elegido por admin

  const [showVoucherModal, setShowVoucherModal] = useState(false);
  const [lastReportData, setLastReportData] = useState(null);
  const [showHistorial, setShowHistorial] = useState(false);

  // Foto de identificación (reemplaza a la firma — mismos campos en Firebase)
  const [firmaRepartidor, setFirmaRepartidor] = useState(null); // foto repartidor (ENTRADA)
  const [firmaReceptor, setFirmaReceptor] = useState(null);     // foto receptor  (ENTREGA)
  const [showModalCamaraRepartidor, setShowModalCamaraRepartidor] = useState(false);
  const [showModalCamaraReceptor, setShowModalCamaraReceptor] = useState(false);

  /* --- FIRMA deshabilitada (sustituida por foto de cámara) ---
  const [showModalFirmaRepartidor, setShowModalFirmaRepartidor] = useState(false);
  const [showModalFirmaReceptor, setShowModalFirmaReceptor] = useState(false);
  --- fin firma --- */

  const [searchOperador, setSearchOperador] = useState('');
  const [searchMaquina, setSearchMaquina] = useState('');
  // Operador y máquina externos (empresa no-MPF)
  const [operadorExterno, setOperadorExterno] = useState({ nombre: '', rut: '' });
  const [maquinaExterna, setMaquinaExterna] = useState({ patente: '', tipo: '', modelo: '' });

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

  // Datos cargados via hook
  const {
    projects,
    machines,
    machinesLocal,
    setMachinesLocal,
    empleados,
    equiposSurtidores,
    setEquiposSurtidores,
    empresasLocal,
    setEmpresasLocal,
    estacionesLocal,
    setEstacionesLocal,
  } = useEmpresaData(empresaId);

  // Normaliza nombre de empresa para comparación fuzzy (sin tildes, minúsculas, sin espacios extra)
  const normEmp = (s) => (s || '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')  // quita tildes: é→e, ó→o
    .replace(/\s+/g, ' ').trim();

  // Dos empresas hacen match si una contiene a la otra (normalizado)
  // Ej: "MPF Ingeniería Civil" ↔ "MPF INGENIERIA CIVIL SPA" → ✅
  const empresasMatch = (a, b) => {
    if (!a || !b) return false;
    const na = normEmp(a), nb = normEmp(b);
    return na === nb || na.includes(nb) || nb.includes(na);
  };

  // Resuelve el ID/nombre seleccionado al nombre de la empresa
  const resolverNombreEmpresa = (empresaIdONombre) => {
    if (!empresaIdONombre) return null;
    const doc = empresasLocal.find(e => e.id === empresaIdONombre);
    return doc ? doc.nombre : empresaIdONombre;
  };

  const EMPRESAS_SISTEMA = ['LifeMed', 'Intosim', 'Río Tinto', 'Global', 'Celenor', 'MPF Ingeniería Civil'];
  const esEmpresaInterna = (empresaIdONombre) => {
    if (!empresaIdONombre) return false;
    const nombreBuscar = resolverNombreEmpresa(empresaIdONombre);
    const tieneOps = (empleados || []).some(e => empresasMatch(e.empresa, nombreBuscar));
    const tieneMaq = (machines || []).some(m => empresasMatch(m.empresa, nombreBuscar));
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
    destinoCarga: '', // 'camion' | 'estanque' (solo cuando tipoOrigen === 'estacion')
    numerosDocumento: [''], // Múltiples guías/vales
    numeroDocumento: '', // primer documento (backward compat)
    fechaDocumento: new Date().toISOString().split('T')[0],
    cantidad: '',
    horometroOdometro: '',
    machineId: '',
    operadorId: '',
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

            // Autocompletar repartidorId cuando se abre el form
            if (!datosControl.repartidorId) {
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

    cargarDatosUsuario();
  }, [currentUser]);

  // Cargar surtidores (personas con esSurtidor=true) desde empleados del hook
  useEffect(() => {
    if (empleados && empleados.length > 0) {
      console.log('👥 Total empleados recibidos:', empleados.length);
      console.log('🔍 Surtidores (esSurtidor=true):', empleados.filter(e => e.esSurtidor === true).map(e => e.nombre));
      const lista = empleados.filter(e => e.esSurtidor === true);
      setSurtidoresPersonas(lista);
    }
  }, [empleados]);

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
      destinoCarga: '',
      numerosDocumento: [''],
      numeroDocumento: '',
      fechaDocumento: new Date().toISOString().split('T')[0],
      cantidad: '',
      horometroOdometro: '',
      machineId: '',
      operadorId: '',
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
      toast({ type: 'warning', message: 'Patente y Nombre son obligatorios' });
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
      setDatosControl({ ...datosControl, equipoSurtidorId: docRef.id });

      setShowModalEquipoSurtidor(false);
      setNuevoEquipoSurtidor({
        patente: '',
        nombre: '',
        tipo: '',
        marca: '',
        modelo: ''
      });

      console.log('🎉 Equipo surtidor creado exitosamente');
      toast({ type: 'success', message: 'Equipo surtidor creado y seleccionado exitosamente' });
    } catch (error) {
      console.error("❌ Error creando equipo:", error);
      console.error("Detalles:", error.message);
      toast({ type: 'error', message: `Error al crear equipo surtidor: ${error.message}` });
    } finally {
      setLoadingEquipo(false);
      console.log('🏁 Proceso finalizado');
    }
  };

  const handleCrearEmpresa = async () => {
    if (!nuevaEmpresa.nombre) {
      toast({ type: 'warning', message: 'El nombre de la empresa es obligatorio' });
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
      setDatosEntrega({ ...datosEntrega, empresa: docRef.id });
      setShowModalEmpresa(false);
      setNuevaEmpresa({
        nombre: '',
        rut: ''
      });
      toast({ type: 'success', message: 'Empresa creada exitosamente' });
    } catch (error) {
      console.error("Error creando empresa:", error);
      toast({ type: 'error', message: 'Error al crear empresa' });
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
      toast({ type: 'error', message: 'Tu usuario no está registrado. Contacta al administrador.' });
      return;
    }

    // Validaciones
    if (!datosControl.projectId || !datosControl.repartidorId) {
      toast({ type: 'warning', message: 'Completa los campos obligatorios del control de combustible' });
      return;
    }

    if (tipoReporte === 'entrada') {
      const docsValidos = datosEntrada.numerosDocumento.filter(d => d.trim());
      if (!datosEntrada.tipoOrigen || docsValidos.length === 0 || !datosEntrada.cantidad) {
        toast({ type: 'warning', message: 'Completa los campos obligatorios de la entrada (Tipo Origen, Documento y Cantidad)' });
        return;
      }
      if (datosEntrada.tipoOrigen === 'estacion' && !datosEntrada.destinoCarga) {
        toast({ type: 'warning', message: 'Indica si la carga fue al camión surtidor o al estanque' });
        return;
      }
      if (!firmaRepartidor) {
        toast({ type: 'warning', message: 'Se requiere foto de identificación del repartidor' });
        return;
      }
    } else if (tipoReporte === 'entrega') {
      if (!datosEntrega.machineId || !datosEntrega.cantidadLitros) {
        toast({ type: 'warning', message: 'Completa los campos obligatorios de la entrega (Máquina y Cantidad)' });
        return;
      }
      if (!firmaReceptor) {
        toast({ type: 'warning', message: 'Se requiere foto de identificación del receptor' });
        return;
      }
    }

    try {
      setLoading(true);

      // Generar número de reporte
      const fecha = new Date();
      const numeroReporte = `COMB-${tipoReporte.toUpperCase()}-${fecha.getFullYear()}${(fecha.getMonth() + 1).toString().padStart(2, '0')}${fecha.getDate().toString().padStart(2, '0')}-${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`;

      // Obtener el número correlativo ANTES de guardar
      const numeroGuia = await getNextGuiaNumber(empresaId);

      const dataToSave = {
        tipo: tipoReporte,
        numeroReporte,
        numeroGuia,
        ...datosControl,
        fechaCreacion: new Date().toISOString(),
        hora: new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', hour12: false }),
        creadoPor: currentUser?.email || 'unknown',
        repartidorNombre: isAdmin
          ? (repartidorSeleccionado?.nombre || repartidorSeleccionado?.name || '')
          : (currentUserData?.nombre || ''),
        repartidorRut: isAdmin
          ? (repartidorSeleccionado?.rut || '')
          : (currentUserData?.rut || '')
      };

      if (tipoReporte === 'entrada') {
        const docsValidos2 = datosEntrada.numerosDocumento.filter(d => d.trim());
        const machineIdFinal = datosEntrada.destinoCarga === 'camion'
          ? datosControl.equipoSurtidorId
          : datosEntrada.machineId;
        dataToSave.datosEntrada = {
          ...datosEntrada,
          machineId: machineIdFinal,
          numerosDocumento: docsValidos2,
          numeroDocumento: docsValidos2[0] || '',
          cantidad: parseFloat(datosEntrada.cantidad),
          horometroOdometro: parseFloat(datosEntrada.horometroOdometro) || 0
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

      // ✅ FIX: capturar el ID del reporte para guardarlo en el voucher
      const docRef = await addDoc(collection(db, 'empresas', empresaId, 'reportes_combustible'), dataToSave);
      const nuevoReporteId = docRef.id;

      console.log('✅ Reporte guardado en Firebase');
      console.log('📝 Tipo de reporte:', tipoReporte);

      if (tipoReporte === 'entrega') {
        console.log('🎯 Es una entrega, preparando modal de voucher...');
        const projectInfo = projects?.find(p => p.id === datosControl.projectId);
        const machineInfo = machinesLocal?.find(m => m.id === datosEntrega.machineId);
        const operadorInfo = empleados?.find(e => e.id === datosEntrega.operadorId);
        const empresaIdSeleccionada = datosEntrega.empresa; // esto es el ID de Firestore
        const empresaDoc = empresasLocal.find(e => e.id === empresaIdSeleccionada);
        // Si no se encontró por ID, podría ser un nombre directo (legacy)
        const empresaInfo = empresaDoc
          ? { nombre: empresaDoc.nombre || '', rut: empresaDoc.rut || '' }
          : empresaIdSeleccionada
            ? { nombre: empresaIdSeleccionada, rut: '' }
            : null;
        console.log('🏢 empresaInfo para voucher:', empresaInfo);

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
          reporteId: nuevoReporteId,
          projectName: projectInfo?.nombre || 'N/A',
          machineInfo: {
            patente: machineInfo?.patente || '',
            codigo: machineInfo?.codigo || '',
            nombre: machineInfo?.nombre || '',
            type: machineInfo?.type || '',
            code: machineInfo?.code || ''
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
        toast({ type: 'success', message: `Reporte de Entrada registrado: ${numeroReporte}`, duration: 5000 });
        setTimeout(handleClose, 1500);
      }
    } catch (error) {
      console.error("Error guardando reporte:", error);
      toast({ type: 'error', message: 'Error al guardar el reporte. Intenta nuevamente.' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
    <ToastContainer toasts={toasts} onRemove={removeToast} />
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
                  onChange={(e) => { setDatosControl({ ...datosControl, projectId: e.target.value, origen: '' }); cargarEstaciones(e.target.value); }}
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
                  onChange={(e) => setDatosControl({ ...datosControl, fecha: e.target.value })}
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
                      onChange={(e) => setDatosControl({ ...datosControl, equipoSurtidorId: e.target.value })}
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
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
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
                    <h4 className="text-xl font-black text-blue-900 mb-2">SALIDA</h4>
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
                  onChange={(e) => setDatosEntrada({ ...datosEntrada, tipoOrigen: e.target.value, origen: '', destinoCarga: '', machineId: '' })}
                  className="w-full px-4 py-2 border-2 border-green-200 rounded-lg focus:outline-none focus:border-green-500"
                >
                  <option value="">Seleccione tipo</option>
                  <option value="estacion">⛽ Estación de Servicio (Guía)</option>
                  <option value="estanque">🛢️ Estanque (Vale)</option>
                </select>
              </div>

              {/* Origen */}
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">Origen</label>
                <div className="flex gap-2 min-w-0">
                  <select
                    value={datosEntrada.origen}
                    onChange={(e) => setDatosEntrada({ ...datosEntrada, origen: e.target.value })}
                    className="min-w-0 flex-1 px-4 py-2 border-2 border-green-200 rounded-lg focus:outline-none focus:border-green-500 overflow-hidden text-ellipsis"
                  >
                    <option value="">
                      {datosEntrada.tipoOrigen === 'estacion'
                        ? (estacionesLocal.length === 0 ? 'Sin estaciones asignadas' : 'Seleccione estación')
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
                  <button
                    type="button"
                    onClick={() => setShowModalEmpresa(true)}
                    className="flex-shrink-0 px-3 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-bold text-sm transition-all"
                    title="Crear nuevo origen"
                  >
                    +
                  </button>
                </div>
              </div>

              {/* Destino de la Carga — solo al cargar desde estación de servicio */}
              {datosEntrada.tipoOrigen === 'estacion' && (
                <div className="md:col-span-2">
                  <label className="block text-sm font-bold text-slate-700 mb-2">
                    ¿A dónde fue el combustible? <span className="text-red-500">*</span>
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setDatosEntrada({
                        ...datosEntrada,
                        destinoCarga: 'camion',
                        machineId: datosControl.equipoSurtidorId || ''
                      })}
                      className={`flex items-center gap-3 p-4 rounded-xl border-2 transition-all text-left ${
                        datosEntrada.destinoCarga === 'camion'
                          ? 'bg-amber-100 border-amber-500 text-amber-900 shadow-md'
                          : 'bg-white border-slate-200 hover:border-amber-300 text-slate-700'
                      }`}
                    >
                      <svg className="w-8 h-8 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 00-10.026 0 1.106 1.106 0 00-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" />
                      </svg>
                      <div className="flex-1 min-w-0">
                        <div className="font-black text-sm">Al Camión Surtidor</div>
                        <div className="text-xs font-normal opacity-70">Carga directa al camión</div>
                      </div>
                      {datosEntrada.destinoCarga === 'camion' && (
                        <svg className="w-5 h-5 text-amber-600 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                        </svg>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => setDatosEntrada({
                        ...datosEntrada,
                        destinoCarga: 'estanque',
                        machineId: ''
                      })}
                      className={`flex items-center gap-3 p-4 rounded-xl border-2 transition-all text-left ${
                        datosEntrada.destinoCarga === 'estanque'
                          ? 'bg-blue-100 border-blue-500 text-blue-900 shadow-md'
                          : 'bg-white border-slate-200 hover:border-blue-300 text-slate-700'
                      }`}
                    >
                      <svg className="w-8 h-8 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 2.625c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125m16.5 5.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" />
                      </svg>
                      <div className="flex-1 min-w-0">
                        <div className="font-black text-sm">Al Estanque</div>
                        <div className="text-xs font-normal opacity-70">Estanque de distribución</div>
                      </div>
                      {datosEntrada.destinoCarga === 'estanque' && (
                        <svg className="w-5 h-5 text-blue-600 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                        </svg>
                      )}
                    </button>
                  </div>
                  {datosEntrada.destinoCarga === 'camion' && !datosControl.equipoSurtidorId && (
                    <p className="text-xs text-amber-700 mt-2 flex items-center gap-1">
                      <svg className="w-3.5 h-3.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                      </svg>
                      No hay equipo surtidor seleccionado en el Paso 1. Vuelve atrás para seleccionarlo.
                    </p>
                  )}
                </div>
              )}

              {/* Fecha del Documento */}
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">
                  Fecha del Documento <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  required
                  value={datosEntrada.fechaDocumento}
                  onChange={(e) => setDatosEntrada({ ...datosEntrada, fechaDocumento: e.target.value })}
                  className="w-full px-4 py-2 border-2 border-green-200 rounded-lg focus:outline-none focus:border-green-500"
                />
              </div>

              {/* Números de Documento (múltiples) */}
              <div className="md:col-span-2">
                <label className="block text-sm font-bold text-slate-700 mb-2">
                  {datosEntrada.tipoOrigen === 'estacion' ? 'N° de Guía' : datosEntrada.tipoOrigen === 'estanque' ? 'N° de Vale' : 'N° de Documento'} <span className="text-red-500">*</span>
                </label>
                <div className="space-y-2">
                  {datosEntrada.numerosDocumento.map((num, idx) => (
                    <div key={idx} className="flex gap-2">
                      <input
                        type="text"
                        value={num}
                        onChange={(e) => {
                          const arr = [...datosEntrada.numerosDocumento];
                          arr[idx] = e.target.value;
                          setDatosEntrada({ ...datosEntrada, numerosDocumento: arr });
                        }}
                        className="flex-1 px-4 py-2 border-2 border-green-200 rounded-lg focus:outline-none focus:border-green-500"
                        placeholder={datosEntrada.tipoOrigen === 'estacion' ? 'Ej: 12345' : datosEntrada.tipoOrigen === 'estanque' ? 'Ej: VALE-001' : 'Número de documento'}
                      />
                      {datosEntrada.numerosDocumento.length > 1 && (
                        <button
                          type="button"
                          onClick={() => {
                            const arr = datosEntrada.numerosDocumento.filter((_, i) => i !== idx);
                            setDatosEntrada({ ...datosEntrada, numerosDocumento: arr });
                          }}
                          className="px-3 py-2 bg-red-100 hover:bg-red-200 text-red-700 rounded-lg font-bold text-sm transition-all"
                        >
                          −
                        </button>
                      )}
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => setDatosEntrada({ ...datosEntrada, numerosDocumento: [...datosEntrada.numerosDocumento, ''] })}
                    className="text-sm text-green-700 hover:text-green-900 font-semibold flex items-center gap-1"
                  >
                    + Agregar otro N°
                  </button>
                </div>
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
                  onChange={(e) => setDatosEntrada({ ...datosEntrada, cantidad: e.target.value })}
                  className="w-full px-4 py-2 border-2 border-green-200 rounded-lg focus:outline-none focus:border-green-500"
                  placeholder="Ej: 5000"
                />
              </div>

              {/* Horómetro / Odómetro */}
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">Horómetro / Odómetro</label>
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  value={datosEntrada.horometroOdometro}
                  onChange={(e) => setDatosEntrada({ ...datosEntrada, horometroOdometro: e.target.value })}
                  className="w-full px-4 py-2 border-2 border-green-200 rounded-lg focus:outline-none focus:border-green-500"
                  placeholder="Ej: 12500"
                />
              </div>

              {/* Máquina/Estanque receptor — cambia según destinoCarga */}
              {datosEntrada.tipoOrigen === 'estacion' && datosEntrada.destinoCarga === 'camion' ? (
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">Camión Surtidor (receptor)</label>
                  <div className="w-full px-4 py-2.5 bg-amber-50 border-2 border-amber-300 rounded-lg flex items-center gap-2">
                    <svg className="w-5 h-5 text-amber-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 00-10.026 0 1.106 1.106 0 00-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" />
                    </svg>
                    <span className="font-semibold text-amber-900 text-sm">
                      {(() => {
                        const eq = equiposSurtidores.find(e => e.id === datosControl.equipoSurtidorId);
                        return eq ? `${eq.patente || eq.code || ''} - ${eq.nombre || eq.name || ''}` : 'Sin equipo surtidor seleccionado';
                      })()}
                    </span>
                  </div>
                  <p className="text-xs text-amber-600 mt-1">Autocompletado desde el equipo surtidor del Paso 1</p>
                </div>
              ) : (
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">
                    {datosEntrada.destinoCarga === 'estanque' ? 'Estanque receptor' : 'Máquina / Estanque receptor'}
                  </label>
                  <select
                    value={datosEntrada.machineId}
                    onChange={(e) => setDatosEntrada({ ...datosEntrada, machineId: e.target.value })}
                    className="w-full px-4 py-2 border-2 border-green-200 rounded-lg focus:outline-none focus:border-green-500"
                  >
                    <option value="">Sin asignar</option>
                    {machinesLocal?.map(m => (
                      <option key={m.id} value={m.id}>
                        {m.patente || m.code} - {m.type || m.nombre || m.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Operador receptor */}
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">Operador receptor</label>
                <select
                  value={datosEntrada.operadorId}
                  onChange={(e) => setDatosEntrada({ ...datosEntrada, operadorId: e.target.value })}
                  className="w-full px-4 py-2 border-2 border-green-200 rounded-lg focus:outline-none focus:border-green-500"
                >
                  <option value="">Sin asignar</option>
                  {empleados?.map(emp => (
                    <option key={emp.id} value={emp.id}>
                      {emp.nombre} {emp.rut ? `- ${emp.rut}` : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Observaciones */}
              <div className="md:col-span-2">
                <label className="block text-sm font-bold text-slate-700 mb-2">Observaciones</label>
                <textarea
                  value={datosEntrada.observaciones}
                  onChange={(e) => setDatosEntrada({ ...datosEntrada, observaciones: e.target.value })}
                  className="w-full px-4 py-2 border-2 border-green-200 rounded-lg focus:outline-none focus:border-green-500 min-h-[80px]"
                  placeholder="Notas adicionales..."
                />
              </div>
            </div>

            {/* Foto del Repartidor */}
            <div className="mt-6">
              <label className="block text-sm font-bold text-slate-700 mb-3">
                Foto de identificación — Repartidor <span className="text-red-500">*</span>
              </label>

              {firmaRepartidor ? (
                <div className="border-2 border-green-500 rounded-xl p-4 bg-green-50">
                  <img
                    src={firmaRepartidor}
                    alt="Foto del repartidor"
                    className="max-h-40 mx-auto rounded-lg object-cover"
                  />
                  <div className="flex justify-center gap-2 mt-3">
                    <span className="px-3 py-1 bg-green-600 text-white text-xs font-bold rounded-full">
                      ✓ Foto tomada
                    </span>
                    <button
                      type="button"
                      onClick={() => { setFirmaRepartidor(null); setShowModalCamaraRepartidor(true); }}
                      className="px-3 py-1 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold rounded-full transition-all"
                    >
                      Tomar de nuevo
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowModalCamaraRepartidor(true)}
                  className="w-full px-6 py-4 border-2 border-dashed border-green-300 rounded-xl bg-green-50 hover:bg-green-100 transition-all group"
                >
                  <div className="flex flex-col items-center gap-2">
                    <svg className="w-12 h-12 text-green-600 group-hover:scale-110 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    <span className="text-green-800 font-bold">Click para sacar foto</span>
                    <span className="text-green-600 text-xs">Se abrirá la cámara para identificarte</span>
                  </div>
                </button>
              )}

              {/* --- FIRMA deshabilitada (sustituida por foto) ---
              <button onClick={() => setShowModalFirmaRepartidor(true)} ...>
                <SignaturePad color="green" onSave={setFirmaRepartidor} />
              </button>
              --- fin firma --- */}
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
                disabled={loading || !datosEntrada.tipoOrigen || !datosEntrada.numerosDocumento?.some(d => d.trim()) || !datosEntrada.cantidad || !firmaRepartidor || (datosEntrada.tipoOrigen === 'estacion' && !datosEntrada.destinoCarga)}
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
                      setDatosEntrega({ ...datosEntrega, empresa: e.target.value, operadorId: '', machineId: '' });
                      setOperadorExterno({ nombre: '', rut: '' });
                      setMaquinaExterna({ patente: '', tipo: '', modelo: '' });
                      setSearchOperador('');
                      setSearchMaquina('');
                    }}
                    className="flex-1 px-4 py-2 border-2 border-blue-200 rounded-lg focus:outline-none focus:border-blue-500"
                  >
                    <option value="">Seleccione empresa</option>
                    {empresasLocal.map(emp => (
                      <option key={emp.id} value={emp.id}>{emp.nombre}</option>
                    ))}
                  </select>
                </div>
                {datosEntrega.empresa && (() => {
                  const empDoc = empresasLocal.find(e => e.id === datosEntrega.empresa);
                  const nombreEmpresa = empDoc ? empDoc.nombre : datosEntrega.empresa;
                  const nOps = (empleados || []).filter(e => e.empresa === nombreEmpresa).length;
                  const nMaq = (machines || []).filter(m => m.empresa === nombreEmpresa).length;
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
                  onChange={(e) => setDatosEntrega({ ...datosEntrega, fecha: e.target.value })}
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
                        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
                      </svg>
                      <input type="text" placeholder="Buscar operador..." value={searchOperador}
                        onChange={e => setSearchOperador(e.target.value)}
                        className="w-full pl-9 pr-4 py-2 border-2 border-blue-200 rounded-lg focus:outline-none focus:border-blue-500 text-sm" />
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
                          <button type="button" onClick={() => { setDatosEntrega({ ...datosEntrega, operadorId: '' }); setSearchOperador(''); }}
                            className="text-slate-400 hover:text-red-500 flex-shrink-0">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                          </button>
                        </div>
                      ) : null;
                    })()}
                    {!datosEntrega.operadorId && (
                      <div className="grid grid-cols-2 gap-2 max-h-44 overflow-y-auto pr-1">
                        {(empleados || [])
                          .filter(emp => {
                            if (!datosEntrega.empresa) return true;
                            const nombreEmpresa = resolverNombreEmpresa(datosEntrega.empresa);
                            return empresasMatch(emp.empresa, nombreEmpresa);
                          })
                          .filter(emp => !searchOperador ||
                            emp.nombre?.toLowerCase().includes(searchOperador.toLowerCase()) ||
                            emp.rut?.includes(searchOperador))
                          .map(emp => (
                            <button key={emp.id} type="button"
                              onClick={() => { setDatosEntrega({ ...datosEntrega, operadorId: emp.id }); setSearchOperador(''); }}
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
                      onChange={e => setOperadorExterno({ ...operadorExterno, nombre: e.target.value })}
                      className="w-full px-4 py-2 border-2 border-blue-200 rounded-lg focus:outline-none focus:border-blue-500 text-sm" />
                    <input type="text" placeholder="RUT (ej: 12.345.678-9)"
                      value={operadorExterno.rut}
                      onChange={e => setOperadorExterno({ ...operadorExterno, rut: e.target.value })}
                      className="w-full px-4 py-2 border-2 border-blue-200 rounded-lg focus:outline-none focus:border-blue-500 text-sm" />
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
                        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
                      </svg>
                      <input type="text" placeholder="Buscar por patente o nombre..." value={searchMaquina}
                        onChange={e => setSearchMaquina(e.target.value)}
                        className="w-full pl-9 pr-4 py-2 border-2 border-blue-200 rounded-lg focus:outline-none focus:border-blue-500 text-sm" />
                    </div>
                    {datosEntrega.machineId && (() => {
                      const sel = (machinesLocal || machines || []).find(m => m.id === datosEntrega.machineId);
                      return sel ? (
                        <div className="flex items-center gap-3 px-3 py-2 bg-orange-50 border-2 border-orange-400 rounded-xl mb-2">
                          <div className="w-9 h-9 rounded-lg bg-orange-500 flex items-center justify-center flex-shrink-0">
                            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2v-4M9 21H5a2 2 0 01-2-2v-4m0 0h18" />
                            </svg>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-bold text-slate-800 text-sm truncate">{sel.patente || sel.code}</div>
                            <div className="text-xs text-slate-500 truncate">{sel.name}</div>
                          </div>
                          <button type="button" onClick={() => { setDatosEntrega({ ...datosEntrega, machineId: '' }); setSearchMaquina(''); }}
                            className="text-slate-400 hover:text-red-500 flex-shrink-0">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                          </button>
                        </div>
                      ) : null;
                    })()}
                    {!datosEntrega.machineId && (
                      <div className="grid grid-cols-2 gap-2 max-h-44 overflow-y-auto pr-1">
                        {(machines || [])
                          .filter(m => !m.name?.toLowerCase().includes('combustible') && !m.name?.toLowerCase().includes('mochila'))
                          .filter(m => {
                            if (!datosEntrega.empresa) return true;
                            const nombreEmpresa = resolverNombreEmpresa(datosEntrega.empresa);
                            return empresasMatch(m.empresa, nombreEmpresa);
                          })
                          .filter(m => !searchMaquina ||
                            m.patente?.toLowerCase().includes(searchMaquina.toLowerCase()) ||
                            m.name?.toLowerCase().includes(searchMaquina.toLowerCase()) ||
                            m.code?.toLowerCase().includes(searchMaquina.toLowerCase()))
                          .map(m => (
                            <button key={m.id} type="button"
                              onClick={() => { setDatosEntrega({ ...datosEntrega, machineId: m.id }); setSearchMaquina(''); }}
                              className="flex items-center gap-2 px-3 py-2 bg-white border-2 border-slate-200 hover:border-orange-400 hover:bg-orange-50 rounded-xl transition-all text-left">
                              <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0">
                                <svg className="w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2v-4M9 21H5a2 2 0 01-2-2v-4m0 0h18" />
                                </svg>
                              </div>
                              <div className="min-w-0">
                                <div className="font-bold text-slate-800 text-xs truncate">{m.patente || m.code}</div>
                                <div className="text-[10px] text-slate-400 truncate">{m.type || m.nombre || m.name}</div>
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
                      onChange={e => setMaquinaExterna({ ...maquinaExterna, patente: e.target.value })}
                      className="w-full px-4 py-2 border-2 border-blue-200 rounded-lg focus:outline-none focus:border-blue-500 text-sm" />
                    <input type="text" placeholder="Tipo (ej: Excavadora, Bulldozer…) *"
                      value={maquinaExterna.tipo}
                      onChange={e => setMaquinaExterna({ ...maquinaExterna, tipo: e.target.value })}
                      className="w-full px-4 py-2 border-2 border-blue-200 rounded-lg focus:outline-none focus:border-blue-500 text-sm" />
                    <input type="text" placeholder="Modelo (ej: Caterpillar 320)"
                      value={maquinaExterna.modelo}
                      onChange={e => setMaquinaExterna({ ...maquinaExterna, modelo: e.target.value })}
                      className="w-full px-4 py-2 border-2 border-blue-200 rounded-lg focus:outline-none focus:border-blue-500 text-sm" />
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
                  onChange={(e) => setDatosEntrega({ ...datosEntrega, horometroOdometro: e.target.value })}
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
                  onChange={(e) => setDatosEntrega({ ...datosEntrega, cantidadLitros: e.target.value })}
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
                  onChange={(e) => setDatosEntrega({ ...datosEntrega, observaciones: e.target.value })}
                  className="w-full px-4 py-2 border-2 border-blue-200 rounded-lg focus:outline-none focus:border-blue-500 min-h-[80px]"
                  placeholder="Notas adicionales..."
                />
              </div>
            </div>

            {/* Foto del Receptor */}
            <div className="mt-6">
              <label className="block text-sm font-bold text-slate-700 mb-3">
                Foto de identificación — Receptor <span className="text-red-500">*</span>
              </label>

              {firmaReceptor ? (
                <div className="border-2 border-blue-500 rounded-xl p-4 bg-blue-50">
                  <img
                    src={firmaReceptor}
                    alt="Foto del receptor"
                    className="max-h-40 mx-auto rounded-lg object-cover"
                  />
                  <div className="flex justify-center gap-2 mt-3">
                    <span className="px-3 py-1 bg-blue-600 text-white text-xs font-bold rounded-full">
                      ✓ Foto tomada
                    </span>
                    <button
                      type="button"
                      onClick={() => { setFirmaReceptor(null); setShowModalCamaraReceptor(true); }}
                      className="px-3 py-1 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold rounded-full transition-all"
                    >
                      Tomar de nuevo
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowModalCamaraReceptor(true)}
                  className="w-full px-6 py-4 border-2 border-dashed border-blue-300 rounded-xl bg-blue-50 hover:bg-blue-100 transition-all group"
                >
                  <div className="flex flex-col items-center gap-2">
                    <svg className="w-12 h-12 text-blue-600 group-hover:scale-110 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    <span className="text-blue-800 font-bold">Click para sacar foto</span>
                    <span className="text-blue-600 text-xs">Se abrirá la cámara para identificarte</span>
                  </div>
                </button>
              )}

              {/* --- FIRMA deshabilitada (sustituida por foto) ---
              <button onClick={() => setShowModalFirmaReceptor(true)} ...>
                <SignaturePad color="blue" onSave={setFirmaReceptor} />
              </button>
              --- fin firma --- */}
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
                  onChange={(e) => setNuevoEquipoSurtidor({ ...nuevoEquipoSurtidor, patente: e.target.value.toUpperCase() })}
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
                  onChange={(e) => setNuevoEquipoSurtidor({ ...nuevoEquipoSurtidor, nombre: e.target.value })}
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
                  onChange={(e) => setNuevoEquipoSurtidor({ ...nuevoEquipoSurtidor, tipo: e.target.value })}
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
                  onChange={(e) => setNuevoEquipoSurtidor({ ...nuevoEquipoSurtidor, marca: e.target.value })}
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
                  onChange={(e) => setNuevoEquipoSurtidor({ ...nuevoEquipoSurtidor, modelo: e.target.value })}
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
                onChange={(e) => setNuevaEmpresa({ ...nuevaEmpresa, nombre: e.target.value })}
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
                onChange={(e) => setNuevaEmpresa({ ...nuevaEmpresa, rut: e.target.value })}
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

    {/* Modal: Cámara Repartidor */}
    {showModalCamaraRepartidor && (
      <CameraCapture
        color="green"
        title="Identificación Repartidor"
        onCapture={(photo) => setFirmaRepartidor(photo)}
        onClose={() => setShowModalCamaraRepartidor(false)}
      />
    )}

    {/* Modal: Cámara Receptor */}
    {showModalCamaraReceptor && (
      <CameraCapture
        color="blue"
        title="Identificación Receptor"
        onCapture={(photo) => setFirmaReceptor(photo)}
        onClose={() => setShowModalCamaraReceptor(false)}
      />
    )}

    {/* --- MODALES DE FIRMA deshabilitados (sustituidos por CameraCapture) ---
    {showModalFirmaRepartidor && (
      <div ...><SignaturePad color="green" onSave={setFirmaRepartidor} /></div>
    )}
    {showModalFirmaReceptor && (
      <div ...><SignaturePad color="blue" onSave={setFirmaReceptor} /></div>
    )}
    --- fin modales de firma --- */}

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
        empresaId={empresaId}
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
    </>
  );
}
