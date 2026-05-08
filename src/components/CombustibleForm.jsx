import React, { useState, useEffect } from "react";
import { collection, getDocs, addDoc, updateDoc, doc, serverTimestamp } from "firebase/firestore";
import { db, auth } from "../lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import VoucherGenerator from './VoucherGenerator';
import VoucherHistorialDia from './VoucherHistorialDia';
// import SignaturePad from "./SignaturePad"; // reemplazado por CameraCapture
import CameraCapture from './CameraCapture';
import { getNextGuiaNumber } from '../utils/voucherThermalGenerator';
import { useToast, ToastContainer } from './Toast';
import { useEmpresaData } from '../hooks/useEmpresaData';
import { ref, uploadString, getDownloadURL } from "firebase/storage";
import { storage } from "../lib/firebase";
import { formatMiles, unformatMiles } from '../utils/formatters';

export default function CombustibleForm({ empresaId, onClose }) {
  const { toast, toasts, removeToast } = useToast();
  const [paso, setPaso] = useState(1); // 1: Tipo (Entrada/Entrega), 2: Control y Selección, 3: Formulario Final
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

  useEffect(() => {
    // Bloquear scroll del body cuando el modal está abierto para evitar doble scroll en desktop
    const originalStyle = window.getComputedStyle(document.body).overflow;
    document.body.style.overflow = 'hidden';

    // Al desmontar, restauramos el scroll original
    return () => {
      document.body.style.overflow = originalStyle;
    };
  }, []);

  const [searchOperador, setSearchOperador] = useState('');
  const [searchMaquina, setSearchMaquina] = useState('');
  // Operador y máquina externos (empresa no-MPF)
  const [operadorExterno, setOperadorExterno] = useState({ nombre: '', rut: '' });
  const [maquinaExterna, setMaquinaExterna] = useState({ patente: '', tipo: '', modelo: '' });

  // Estados para modales de creación rápida
  const [showModalEquipoSurtidor, setShowModalEquipoSurtidor] = useState(false);
  const [showModalEmpresa, setShowModalEmpresa] = useState(false);
  const [showModalMaquina, setShowModalMaquina] = useState(false);
  const [nuevaMaquinaData, setNuevaMaquinaData] = useState({
    patente: '',
    tipo: '',
    modelo: '',
    empresaId: ''
  });
  const [showModalEmpleado, setShowModalEmpleado] = useState(false);
  const [nuevoEmpleadoData, setNuevoEmpleadoData] = useState({
    nombre: '',
    rut: '',
    empresaId: ''
  });

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

  const [trabajadoresLocales, setTrabajadoresLocales] = useState([]);
  
  // Sincronizar trabajadoresLocales cuando lleguen del hook
  useEffect(() => {
    if (empleados?.length) {
      setTrabajadoresLocales(empleados);
    }
  }, [empleados]);

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

  const EMPRESAS_SISTEMA = ['MPF Ingeniería Civil', 'MPF'];
  const esEmpresaInterna = (empresaIdONombre) => {
    if (!empresaIdONombre) return false;
    // Si es exactamente 'MPF' (el ID que usamos en el toggle)
    if (empresaIdONombre === 'MPF') return true;
    
    const nombreBuscar = resolverNombreEmpresa(empresaIdONombre);
    const n = normEmp(nombreBuscar);
    
    return EMPRESAS_SISTEMA.some(na => {
      const target = normEmp(na);
      return n.includes(target) || target.includes(n);
    });
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
    observaciones: '',
    extraEmail: ''
  });

  // Datos ENTREGA de combustible (a máquinas)
  const [datosEntrega, setDatosEntrega] = useState({
    empresa: '',
    fecha: new Date().toISOString().split('T')[0],
    operadorId: '', // Quien recibe
    machineId: '',
    horometroOdometro: '',
    cantidadLitros: '',
    observaciones: '',
    extraEmail: ''
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
              setDatosControl(prev => ({ ...prev, repartidorId: userData.id }));
            }
            // Auto-asignar como operador receptor para entradas si es trabajador
            if (!isAdmin && !datosEntrada.operadorId) {
              setDatosEntrada(prev => ({ ...prev, operadorId: userData.id }));
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

      // Actualizar datos del reporte según el flujo
      if (tipoReporte === 'entrega') {
        setDatosEntrega(prev => ({ ...prev, empresa: docRef.id }));
      } else {
        setDatosEntrada(prev => ({ ...prev, origen: docRef.id }));
      }

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

  const handleCrearMaquina = async () => {
    if (!nuevaMaquinaData.patente || !nuevaMaquinaData.tipo) {
      toast({ type: 'warning', message: 'Patente y tipo son obligatorios' });
      return;
    }

    let nombreEmpresa = '';
    const targetEmpId = nuevaMaquinaData.empresaId || (tipoReporte === 'entrega' ? datosEntrega.empresa : (datosEntrada.tipoOrigen === 'estanque' ? datosEntrada.origen : ''));

    if (targetEmpId) {
      const emp = empresasLocal.find(e => e.id === targetEmpId);
      nombreEmpresa = emp ? emp.nombre : targetEmpId;
    }

    try {
      setLoading(true);
      const mData = {
        patente: nuevaMaquinaData.patente,
        code: nuevaMaquinaData.patente,
        name: `${nuevaMaquinaData.tipo} ${nuevaMaquinaData.modelo || ''}`.trim(),
        tipo: nuevaMaquinaData.tipo,
        marca: '',
        modelo: nuevaMaquinaData.modelo,
        empresa: nombreEmpresa,
        active: true,
        createdAt: serverTimestamp()
      };

      const mRef = await addDoc(collection(db, 'empresas', empresaId, 'machines'), mData);
      const newMaq = { id: mRef.id, ...mData };

      setMachinesLocal(prev => [...prev, newMaq]);

      if (tipoReporte === 'entrega') {
        setDatosEntrega(prev => ({ ...prev, machineId: mRef.id }));
      } else {
        setDatosEntrada(prev => ({ ...prev, machineId: mRef.id }));
      }

      setShowModalMaquina(false);
      setNuevaMaquinaData({ patente: '', tipo: '', modelo: '', empresaId: '' });
      toast({ type: 'success', message: 'Maquinaria registrada y vinculada' });
    } catch (error) {
      console.error("Error creando máquina:", error);
      toast({ type: 'error', message: 'Error al crear máquina' });
    } finally {
      setLoading(false);
    }
  };

  const handleCrearEmpleado = async () => {
    if (!nuevoEmpleadoData.nombre || !nuevoEmpleadoData.empresaId) {
      toast({ type: 'warning', message: 'Nombre y Empresa son obligatorios' });
      return;
    }
    setLoading(true);
    try {
      const empresaNombre = resolverNombreEmpresa(nuevoEmpleadoData.empresaId);
      const eRef = await addDoc(collection(db, 'empresas', empresaId, 'trabajadores'), {
        nombre: nuevoEmpleadoData.nombre.toUpperCase(),
        rut: nuevoEmpleadoData.rut || '',
        empresa: empresaNombre,
        empresaId: nuevoEmpleadoData.empresaId,
        fechaCreacion: new Date().toISOString()
      });
      
      const newTrabajador = {
        id: eRef.id,
        nombre: nuevoEmpleadoData.nombre.toUpperCase(),
        rut: nuevoEmpleadoData.rut || '',
        empresa: empresaNombre,
        empresaId: nuevoEmpleadoData.empresaId
      };
      
      setTrabajadoresLocales(prev => [...prev, newTrabajador]);
      setDatosEntrega(prev => ({ ...prev, operadorId: eRef.id }));
      setShowModalEmpleado(false);
      setNuevoEmpleadoData({ nombre: '', rut: '', empresaId: '' });
      toast({ type: 'success', message: 'Trabajador registrado y vinculado' });
    } catch (error) {
      console.error("Error creando empleado:", error);
      toast({ type: 'error', message: 'Error al crear trabajador' });
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

        // --- RESOLVER NOMBRE PROVEEDOR ---
        let nombreProveedor = 'N/A';
        if (datosEntrada.tipoOrigen === 'estacion') {
          const est = estacionesLocal.find(e => e.id === datosEntrada.origen);
          nombreProveedor = est ? est.nombre : 'Estación';
        } else if (datosEntrada.tipoOrigen === 'externo') {
          const emp = empresasLocal.find(e => e.id === datosEntrada.origen);
          nombreProveedor = emp ? emp.nombre : datosEntrada.origen;
        } else if (datosEntrada.tipoOrigen === 'interno') {
          nombreProveedor = 'MPF INGENIERÍA';
        }

        dataToSave.datosEntrada = {
          ...datosEntrada,
          machineId: machineIdFinal,
          numerosDocumento: docsValidos2,
          numeroDocumento: docsValidos2[0] || '',
          cantidad: parseFloat(datosEntrada.cantidad.toString().replace(/\./g, '').replace(',', '.')),
          horometroOdometro: parseFloat(datosEntrada.horometroOdometro.toString().replace(/\./g, '').replace(',', '.')) || 0
        };
        dataToSave.empresaProveedora = nombreProveedor; // Para el reporte principal
        dataToSave.firmaRepartidor = firmaRepartidor;
        dataToSave.fechaFirma = new Date().toISOString();
      } else {
        dataToSave.datosEntrega = {
          ...datosEntrega,
          cantidadLitros: parseFloat(datosEntrega.cantidadLitros.toString().replace(/\./g, '').replace(',', '.')),
          horometroOdometro: parseFloat(datosEntrega.horometroOdometro.toString().replace(/\./g, '').replace(',', '.')) || 0,
          // Si es empresa externa, guardar datos manuales
          ...(esMPF(datosEntrega.empresa) ? {} : {
            operadorExterno,
            maquinaExterna,
          })
        };
        dataToSave.firmaReceptor = firmaReceptor;
        dataToSave.fechaFirma = new Date().toISOString();
      }

      // --- SUBIR FOTOS A STORAGE SI ESTAMOS ONLINE ---
      // Esto asegura que el correo tenga URLs válidas y no base64 gigantes que fallan
      try {
        if (firmaRepartidor && firmaRepartidor.startsWith('data:')) {
          console.log('📤 Subiendo foto repartidor a Storage...');
          const fileRef = ref(storage, `reportes/${empresaId}/${Date.now()}_repartidor.jpg`);
          await uploadString(fileRef, firmaRepartidor, 'data_url');
          dataToSave.firmaRepartidor = await getDownloadURL(fileRef);
        }
        if (firmaReceptor && firmaReceptor.startsWith('data:')) {
          console.log('📤 Subiendo foto receptor a Storage...');
          const fileRef = ref(storage, `reportes/${empresaId}/${Date.now()}_receptor.jpg`);
          await uploadString(fileRef, firmaReceptor, 'data_url');
          dataToSave.firmaReceptor = await getDownloadURL(fileRef);
        }
      } catch (storageErr) {
        console.error('⚠️ Error subiendo a Storage (posiblemente offline):', storageErr);
        // Si falla, mantenemos el base64 en Firestore para no perder el dato
      }

      // ✅ FIX: capturar el ID del reporte para guardarlo en el voucher
      const docRef = await addDoc(collection(db, 'empresas', empresaId, 'reportes_combustible'), dataToSave);
      const nuevoReporteId = docRef.id;

      console.log('✅ Reporte guardado en Firebase');
      console.log('📝 Tipo de reporte:', tipoReporte);

      if (tipoReporte === 'entrega') {
        console.log('🎯 Es una entrega, preparando modal de voucher...');
        const projectInfo = projects?.find(p => p.id === datosControl.projectId);

        // Resolver Empresa
        const empresaDoc = empresasLocal.find(e => e.id === datosEntrega.empresa);
        const empresaInfo = empresaDoc
          ? { nombre: empresaDoc.nombre || '', rut: empresaDoc.rut || '' }
          : { nombre: datosEntrega.empresa || 'N/A', rut: '' };

        // Resolver Máquina
        const machineInfo = machinesLocal?.find(m => m.id === datosEntrega.machineId);
        const finalMachineInfo = machineInfo
          ? { patente: machineInfo.patente || '', nombre: machineInfo.name || machineInfo.nombre || '', tipo: machineInfo.tipo || '' }
          : { patente: maquinaExterna.patente || 'N/A', nombre: maquinaExterna.modelo || 'EXTERNA', tipo: maquinaExterna.tipo || 'N/A' };

        // Resolver Operador/Receptor
        const operadorInfo = empleados?.find(e => e.id === datosEntrega.operadorId);
        const finalOperadorInfo = operadorInfo
          ? { nombre: operadorInfo.nombre || '', rut: operadorInfo.rut || '' }
          : { nombre: operadorExterno.nombre || 'N/A', rut: operadorExterno.rut || 'N/A' };

        // NUEVO: Obtener información del repartidor y equipo surtidor
        const repartidorInfo = empleados?.find(e => e.id === datosControl.repartidorId) || currentUserData;
        const equipoSurtidorInfo = equiposSurtidores.find(m => m.id === datosControl.equipoSurtidorId)
          || machinesLocal?.find(m => m.id === datosControl.equipoSurtidorId);

        setLastReportData({
          reportData: {
            ...dataToSave,
            numeroReporte,
            fecha: datosControl.fecha,
            cantidadLitros: parseFloat(datosEntrega.cantidadLitros.toString().replace(/\./g, '').replace(',', '.')),
            horometroOdometro: parseFloat(datosEntrega.horometroOdometro.toString().replace(/\./g, '').replace(',', '.')),
            firmaReceptor,
            firmaRepartidor
          },
          reporteId: nuevoReporteId,
          projectName: projectInfo?.nombre || projectInfo?.name || 'N/A',
          machineInfo: finalMachineInfo,
          operadorInfo: finalOperadorInfo,
          empresaInfo: empresaInfo,
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
      <div className="bg-white rounded-2xl shadow-2xl max-w-[90vw] w-full max-h-[95vh] overflow-y-auto overflow-x-hidden relative">
        {/* Header */}
        <div className="bg-gradient-to-r from-orange-600 to-amber-600 text-white p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-black">Control de Combustible</h2>
              <p className="text-orange-100 text-sm mt-1">
                {paso === 1 && "Selecciona el tipo de movimiento"}
                {paso === 2 && "Información del Control y Selección"}
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
              <span className="text-sm font-semibold">Tipo</span>
            </div>
            <svg className="w-6 h-6 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            <div className={`flex items-center gap-2 ${paso >= 2 ? 'text-orange-600' : 'text-slate-400'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold ${paso >= 2 ? 'bg-orange-600 text-white' : 'bg-slate-200'}`}>
                2
              </div>
              <span className="text-sm font-semibold">Selección</span>
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
          {/* PASO 1: Tipo de Reporte */}
          {paso === 1 && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="bg-orange-50 border-2 border-orange-200 rounded-xl p-4">
                <h3 className="text-lg font-black text-orange-900 mb-1">Tipo de Movimiento</h3>
                <p className="text-sm text-orange-700">Selecciona si estás recibiendo o entregando combustible</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* ENTRADA */}
                <button
                  onClick={() => {
                    setTipoReporte('entrada');
                    setPaso(2);
                  }}
                  className="group relative bg-gradient-to-br from-green-50 to-emerald-50 hover:from-green-100 hover:to-emerald-100 border-3 border-green-300 hover:border-green-500 rounded-2xl p-8 transition-all hover:shadow-xl"
                >
                  <div className="flex flex-col items-center gap-4">
                    <div className="w-20 h-20 rounded-full bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center group-hover:scale-110 transition-transform shadow-lg shadow-green-200">
                      <svg className="w-10 h-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                      </svg>
                    </div>
                    <div className="text-center">
                      <h4 className="text-xl font-black text-green-900 mb-2 uppercase">Entrada</h4>
                      <p className="text-sm text-green-700">Recepción de combustible al estanque o camión</p>
                    </div>
                  </div>
                </button>

                {/* ENTREGA */}
                <button
                  onClick={() => {
                    setTipoReporte('entrega');
                    setPaso(2);
                  }}
                  className="group relative bg-gradient-to-br from-blue-50 to-indigo-50 hover:from-blue-100 hover:to-indigo-100 border-3 border-blue-300 hover:border-blue-500 rounded-2xl p-8 transition-all hover:shadow-xl"
                >
                  <div className="flex flex-col items-center gap-4">
                    <div className="w-20 h-20 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center group-hover:scale-110 transition-transform shadow-lg shadow-blue-200">
                      <svg className="w-10 h-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                      </svg>
                    </div>
                    <div className="text-center">
                      <h4 className="text-xl font-black text-blue-900 mb-2 uppercase">Salida</h4>
                      <p className="text-sm text-blue-700">Entrega de combustible a máquina o equipo</p>
                    </div>
                  </div>
                </button>
              </div>

              <div className="flex gap-3 pt-4 border-t border-orange-100">
                <button
                  type="button"
                  onClick={handleClose}
                  className="flex-1 px-6 py-3 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold rounded-xl transition-all"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}

          {/* PASO 2: Selección de Entidad (Empresa / Estación) */}
          {paso === 2 && (
            <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-500">
              <div className="bg-white p-4 sm:p-6 rounded-[2.5rem] border-2 border-slate-100 shadow-xl space-y-6">
                <div>
                  <h3 className="text-base font-black text-slate-800 mb-4 flex items-center gap-3">
                    <span className="w-7 h-7 rounded-lg bg-orange-100 text-orange-600 flex items-center justify-center text-xs">1</span>
                    {tipoReporte === 'entrada' ? "¿De dónde viene el combustible?" : "¿Quién entrega el combustible?"}
                  </h3>
                  {/* INFORMACIÓN DEL CONTROL (General) */}
                  <div className="pt-4 border-t border-slate-100">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[10px] font-black text-slate-500 uppercase mb-2 px-1 tracking-wider text-center sm:text-left">Obra / Proyecto</label>
                        <select
                          value={datosControl.projectId}
                          onChange={(e) => {
                            setDatosControl({ ...datosControl, projectId: e.target.value });
                            cargarEstaciones(e.target.value);
                          }}
                          className="w-full px-4 py-3 bg-slate-50 border-2 border-slate-100 rounded-xl focus:border-orange-500 font-bold text-slate-700 text-sm transition-all text-center sm:text-left"
                        >
                          <option value="">Seleccione obra</option>
                          {projects.map(p => (
                            <option key={p.id} value={p.id}>{p.name || p.id}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-[10px] font-black text-slate-500 uppercase mb-2 px-1 tracking-wider text-center sm:text-left">Fecha</label>
                        <input
                          type="date"
                          value={datosControl.fecha}
                          onChange={(e) => setDatosControl({ ...datosControl, fecha: e.target.value })}
                          className="w-full px-4 py-3 bg-slate-50 border-2 border-slate-100 rounded-xl focus:border-orange-500 font-bold text-slate-700 text-sm transition-all text-center sm:text-left"
                        />
                      </div>
                    </div>
                  </div>

                  {tipoReporte === 'entrada' ? (
                    <div className="mt-8 flex flex-wrap gap-4 justify-center">
                      <button
                        onClick={() => setDatosEntrada({ ...datosEntrada, tipoOrigen: 'interno', destinoCarga: 'camion' })}
                        className={`px-4 py-3 rounded-2xl border-3 transition-all flex flex-col items-center gap-2 group min-w-[100px] ${datosEntrada.tipoOrigen === 'interno' ? 'bg-green-50 border-green-500 shadow-lg scale-105' : 'bg-white border-slate-100 hover:border-green-200'}`}
                      >
                        <span className="text-3xl group-hover:scale-110 transition-transform">🏢</span>
                        <span className={`font-black text-[10px] uppercase tracking-wider ${datosEntrada.tipoOrigen === 'interno' ? 'text-green-700' : 'text-slate-500'}`}>MPF (Interno)</span>
                      </button>
                      <button
                        onClick={() => setDatosEntrada({ ...datosEntrada, tipoOrigen: 'estacion', destinoCarga: '' })}
                        className={`px-4 py-3 rounded-2xl border-3 transition-all flex flex-col items-center gap-2 group min-w-[100px] ${datosEntrada.tipoOrigen === 'estacion' ? 'bg-green-50 border-green-500 shadow-lg scale-105' : 'bg-white border-slate-100 hover:border-green-200'}`}
                      >
                        <span className="text-3xl group-hover:scale-110 transition-transform">⛽</span>
                        <span className={`font-black text-[10px] uppercase tracking-wider ${datosEntrada.tipoOrigen === 'estacion' ? 'text-green-700' : 'text-slate-500'}`}>Estación</span>
                      </button>
                      <button
                        onClick={() => setDatosEntrada({ ...datosEntrada, tipoOrigen: 'externo', destinoCarga: '' })}
                        className={`px-4 py-3 rounded-2xl border-3 transition-all flex flex-col items-center gap-2 group min-w-[100px] ${datosEntrada.tipoOrigen === 'externo' ? 'bg-green-50 border-green-500 shadow-lg scale-105' : 'bg-white border-slate-100 hover:border-green-200'}`}
                      >
                        <span className="text-3xl group-hover:scale-110 transition-transform">🚛</span>
                        <span className={`font-black text-[10px] uppercase tracking-wider ${datosEntrada.tipoOrigen === 'externo' ? 'text-green-700' : 'text-slate-500'}`}>Terceros</span>
                      </button>
                    </div>
                  ) : (
                    <div className="mt-8 flex flex-wrap gap-4 justify-center">
                      <button
                        onClick={() => setDatosEntrega({ ...datosEntrega, empresa: 'MPF Ingeniería Civil' })}
                        className={`px-4 py-3 rounded-2xl border-3 transition-all flex flex-col items-center gap-2 group min-w-[100px] ${esMPF(datosEntrega.empresa) ? 'bg-blue-50 border-blue-500 shadow-lg scale-105' : 'bg-white border-slate-100 hover:border-blue-200'}`}
                      >
                        <span className="text-3xl group-hover:scale-110 transition-transform">🏗️</span>
                        <span className={`font-black text-[10px] uppercase tracking-wider ${esMPF(datosEntrega.empresa) ? 'text-blue-700' : 'text-slate-500'}`}>Interno (MPF)</span>
                      </button>
                      <button
                        onClick={() => setDatosEntrega({ ...datosEntrega, empresa: '' })}
                        className={`px-4 py-3 rounded-2xl border-3 transition-all flex flex-col items-center gap-2 group min-w-[100px] ${!esMPF(datosEntrega.empresa) && datosEntrega.empresa !== '' ? 'bg-blue-50 border-blue-500 shadow-lg scale-105' : 'bg-white border-slate-100 hover:border-blue-200'}`}
                      >
                        <span className="text-3xl group-hover:scale-110 transition-transform">🤝</span>
                        <span className={`font-black text-[10px] uppercase tracking-wider ${!esMPF(datosEntrega.empresa) && datosEntrega.empresa !== '' ? 'text-blue-700' : 'text-slate-500'}`}>Externo</span>
                      </button>
                    </div>
                  )}
                </div>

                {/* --- Selectores de Entidad Específica --- */}
                <div className="animate-in fade-in slide-in-from-top-4 duration-500">
                  {tipoReporte === 'entrada' ? (
                    <div className="space-y-4">
                      {datosEntrada.tipoOrigen === 'interno' && (
                        <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200 space-y-6">

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                              <label className="block text-[10px] font-black text-slate-500 uppercase mb-2 px-1 tracking-wider">Repartidor</label>
                              {isAdmin ? (
                                <select
                                  value={datosControl.repartidorId}
                                  onChange={(e) => setDatosControl(prev => ({ ...prev, repartidorId: e.target.value }))}
                                  className="w-full px-4 py-3 bg-white border-2 border-slate-100 rounded-xl focus:border-green-500 font-bold text-slate-700 text-sm"
                                >
                                  <option value="">Seleccione...</option>
                                  {surtidoresPersonas.map(emp => (
                                    <option key={emp.id} value={emp.id}>{emp.nombre}</option>
                                  ))}
                                </select>
                              ) : (
                                <div className="px-4 py-3 bg-blue-50 border-2 border-blue-100 rounded-xl font-bold text-blue-900 flex items-center gap-2 text-sm h-[46px]">
                                  👤 {currentUserData?.nombre || 'Mi usuario'}
                                </div>
                              )}
                            </div>
                            <div>
                              <label className="block text-[10px] font-black text-slate-500 uppercase mb-2 px-1 tracking-wider">Equipo Surtidor</label>
                              <select
                                value={datosControl.equipoSurtidorId}
                                onChange={(e) => setDatosControl({ ...datosControl, equipoSurtidorId: e.target.value })}
                                className="w-full px-4 py-3 bg-white border-2 border-slate-100 rounded-xl focus:border-green-500 font-bold text-slate-700 text-sm"
                              >
                                <option value="">Seleccione equipo</option>
                                {equiposSurtidores.map(m => (
                                  <option key={m.id} value={m.id}>{m.patente || m.code} - {m.nombre}</option>
                                ))}
                              </select>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* --- SECCIÓN ESTACIÓN (Combinada y Optimizada) --- */}
                      {datosEntrada.tipoOrigen === 'estacion' && (
                        <div className="space-y-4 animate-in fade-in slide-in-from-top-4 duration-500">
                          {/* Fila 1: Estación y Equipo */}
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-2">
                              <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">Seleccione Estación</label>
                              <select
                                value={datosEntrada.origen}
                                onChange={(e) => setDatosEntrada({ ...datosEntrada, origen: e.target.value })}
                                className="w-full px-4 py-3 bg-white border-2 border-slate-100 rounded-xl focus:border-green-500 font-bold text-slate-700 text-sm shadow-sm"
                              >
                                <option value="">Seleccione estación</option>
                                {estacionesLocal.map(est => (
                                  <option key={est.id} value={est.id}>{(est.marca ? est.marca + ' - ' : '') + est.nombre}</option>
                                ))}
                              </select>
                            </div>

                            <div className="bg-amber-50/30 p-4 rounded-2xl border border-amber-100 space-y-2">
                              <label className="block text-[10px] font-black text-slate-500 uppercase mb-1 px-1 tracking-widest">Equipo Surtidor que recibe</label>
                              <select
                                value={datosControl.equipoSurtidorId}
                                onChange={(e) => setDatosControl({ ...datosControl, equipoSurtidorId: e.target.value })}
                                className="w-full px-4 py-3 border-2 border-amber-100 rounded-xl focus:border-amber-500 font-bold bg-white text-sm shadow-sm"
                              >
                                <option value="">Seleccione Equipo</option>
                                {equiposSurtidores.map(m => (
                                  <option key={m.id} value={m.id}>{m.patente || m.code} - {m.nombre}</option>
                                ))}
                              </select>
                            </div>
                          </div>

                          {/* Sección Destino */}
                          <div className="bg-orange-50/50 p-4 rounded-3xl border-2 border-orange-100 space-y-4">
                            <div className="flex items-center gap-3 border-b border-orange-100 pb-3">
                              <div className="w-7 h-7 rounded-lg bg-orange-100 text-orange-600 flex items-center justify-center text-xs">🎯</div>
                              <h4 className="text-[11px] font-black text-slate-800 uppercase tracking-tight">¿A qué parte del equipo se carga?</h4>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                              <button
                                type="button"
                                onClick={() => setDatosEntrada({ ...datosEntrada, destinoCarga: 'camion' })}
                                className={`py-4 rounded-xl border-2 transition-all font-black text-[10px] uppercase flex flex-col items-center justify-center gap-2 ${datosEntrada.destinoCarga === 'camion' ? 'bg-amber-500 border-amber-600 text-white shadow-lg scale-105' : 'bg-white border-slate-100 text-slate-400 hover:border-amber-200 shadow-sm'}`}
                              >
                                <span className="text-2xl">🚛</span>
                                <span>Al Camión</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => setDatosEntrada({ ...datosEntrada, destinoCarga: 'estanque' })}
                                className={`py-4 rounded-xl border-2 transition-all font-black text-[10px] uppercase flex flex-col items-center justify-center gap-2 ${datosEntrada.destinoCarga === 'estanque' ? 'bg-blue-600 border-blue-700 text-white shadow-lg scale-105' : 'bg-white border-slate-100 text-slate-400 hover:border-blue-200 shadow-sm'}`}
                              >
                                <span className="text-2xl">🛢️</span>
                                <span>Al Estanque</span>
                              </button>
                            </div>

                            {datosEntrada.destinoCarga === 'estanque' && (
                              <div className="animate-in slide-in-from-top-2 duration-300">
                                <label className="block text-[10px] font-black text-slate-500 uppercase mb-2 px-1">Estanque Receptor Específico (Opcional)</label>
                                <select
                                  value={datosEntrada.machineId}
                                  onChange={(e) => setDatosEntrada({ ...datosEntrada, machineId: e.target.value })}
                                  className="w-full px-4 py-3 border-2 border-blue-100 rounded-xl focus:border-blue-500 font-bold bg-white text-sm shadow-sm"
                                >
                                  <option value="">Seleccione Estanque</option>
                                  {(machinesLocal || machines || [])
                                    .filter(m => m.type?.toLowerCase().includes('estanque') || m.name?.toLowerCase().includes('estanque'))
                                    .map(m => (
                                      <option key={m.id} value={m.id}>{m.patente || m.code} - {m.name}</option>
                                    ))}
                                </select>
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {datosEntrada.tipoOrigen === 'externo' && (
                        <div className="space-y-6 bg-slate-50 p-6 rounded-[2rem] border border-slate-200">
                          <div>
                            <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest px-1 mb-2">Empresa Proveedora</label>
                            <div className="flex gap-2">
                              <select
                                value={datosEntrada.origen}
                                onChange={(e) => setDatosEntrada({ ...datosEntrada, origen: e.target.value, machineId: '' })}
                                className="flex-1 px-4 py-3 bg-white border-2 border-slate-100 rounded-xl focus:border-green-500 font-bold text-slate-700 text-sm shadow-sm"
                              >
                                <option value="">Seleccione empresa</option>
                                {empresasLocal.filter(e => !esMPF(e.id)).map(emp => (
                                  <option key={emp.id} value={emp.id}>{emp.nombre}</option>
                                ))}
                              </select>
                              <button type="button" onClick={() => setShowModalEmpresa(true)} className="px-4 bg-green-600 text-white rounded-xl font-black shadow-lg shadow-green-100 transition-all hover:bg-green-500">+</button>
                            </div>
                          </div>

                          {datosEntrada.origen && (
                            <div className="animate-in fade-in slide-in-from-top-2 duration-300">
                              <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest px-1 mb-2">Maquinaria del Proveedor</label>
                              <div className="flex gap-2">
                                <select
                                  value={datosEntrada.machineId}
                                  onChange={(e) => setDatosEntrada({ ...datosEntrada, machineId: e.target.value })}
                                  className="flex-1 px-4 py-3 bg-white border-2 border-slate-100 rounded-xl focus:border-green-500 font-bold text-slate-700 text-sm shadow-sm"
                                >
                                  <option value="">Seleccione maquinaria</option>
                                  {machinesLocal
                                    .filter(m => empresasMatch(m.empresa, resolverNombreEmpresa(datosEntrada.origen)))
                                    .map(m => (
                                      <option key={m.id} value={m.id}>{m.patente || m.code} - {m.name}</option>
                                    ))}
                                </select>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setNuevaMaquinaData({ ...nuevaMaquinaData, empresaId: datosEntrada.origen });
                                    setShowModalMaquina(true);
                                  }}
                                  className="px-4 bg-amber-500 text-white rounded-xl font-black shadow-lg shadow-amber-100 transition-all hover:bg-amber-400"
                                >
                                  +
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-6">
                      {/* INFORMACIÓN DEL CONTROL (REPARTIDOR Y EQUIPO) */}
                      <div className="bg-blue-50/20 p-6 rounded-[2rem] border border-blue-100 space-y-5">
                        <div className="flex items-center gap-3 mb-2 px-1">
                          <span className="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center text-[10px] font-black">1</span>
                          <h4 className="text-xs font-black text-blue-800 uppercase tracking-wider">Identificación del Emisor</h4>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-[10px] font-black text-slate-500 uppercase mb-2 px-1 tracking-wider">Repartidor</label>
                            {isAdmin ? (
                              <select
                                value={datosControl.repartidorId}
                                onChange={(e) => setDatosControl(prev => ({ ...prev, repartidorId: e.target.value }))}
                                className="w-full px-4 py-3 bg-white border-2 border-slate-100 rounded-xl focus:border-blue-500 font-bold text-slate-700 text-sm"
                              >
                                <option value="">Seleccione...</option>
                                {surtidoresPersonas.map(emp => (
                                  <option key={emp.id} value={emp.id}>{emp.nombre}</option>
                                ))}
                              </select>
                            ) : (
                              <div className="px-4 py-3 bg-white/50 border-2 border-blue-200 rounded-xl font-bold text-blue-900 flex items-center gap-2 text-sm h-[46px]">
                                👤 {currentUserData?.nombre || 'Mi usuario'}
                              </div>
                            )}
                          </div>
                          <div>
                            <label className="block text-[10px] font-black text-slate-500 uppercase mb-2 px-1 tracking-wider">Equipo Surtidor (Fuente)</label>
                            <select
                              value={datosControl.equipoSurtidorId}
                              onChange={(e) => setDatosControl({ ...datosControl, equipoSurtidorId: e.target.value })}
                              className="w-full px-4 py-3 bg-white border-2 border-slate-100 rounded-xl focus:border-blue-500 font-bold text-slate-700 text-sm"
                            >
                              <option value="">Seleccione equipo</option>
                              {equiposSurtidores.map(m => (
                                <option key={m.id} value={m.id}>{m.patente || m.code} - {m.nombre}</option>
                              ))}
                            </select>
                          </div>
                        </div>
                      </div>

                      <div className="p-10 bg-slate-50 rounded-[2.5rem] border-2 border-dashed border-slate-200 text-center flex flex-col items-center gap-4">
                        <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-3xl">🎯</div>
                        <div>
                          <h4 className="font-black text-slate-800 uppercase text-sm">Todo listo para los detalles</h4>
                          <p className="text-slate-500 text-[10px] font-bold mt-1">En el siguiente paso definirás la empresa, maquinaria y litros de la entrega.</p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Botones de Navegación Paso 2 */}
                <div className="flex gap-3 pt-4 border-t border-slate-100 mt-2">
                  <button
                    onClick={() => setPaso(1)}
                    className="flex-1 px-6 py-3 bg-slate-100 hover:bg-slate-200 text-slate-600 font-black rounded-2xl transition-all uppercase tracking-tight text-[10px]"
                  >
                    ← Atrás
                  </button>
                  <button
                    onClick={() => setPaso(3)}
                    disabled={!datosControl.projectId || (tipoReporte === 'entrada' ? !datosEntrada.origen : !datosControl.repartidorId || !datosControl.equipoSurtidorId)}
                    className="flex-1 px-6 py-3 bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 text-white font-black rounded-2xl transition-all uppercase tracking-tight text-[10px] shadow-lg shadow-orange-100 disabled:grayscale disabled:opacity-50"
                  >
                    Siguiente →
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* PASO 3a: ENTRADA DE COMBUSTIBLE */}
          {paso === 3 && tipoReporte === 'entrada' && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="bg-white p-6 sm:p-8 rounded-[2.5rem] border-2 border-slate-100 shadow-xl space-y-8">

                {/* --- SECCIÓN 1: CANTIDADES Y HORÓMETRO --- */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Litros */}
                  <div className="bg-green-50/30 p-6 rounded-[2.5rem] border-2 border-green-100 flex flex-col justify-center relative overflow-hidden">
                    <label className="block text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] mb-3 text-center">Litros Totales</label>
                    <div className="relative">
                      <input
                        type="text" required
                        value={formatMiles(datosEntrada.cantidad)}
                        onChange={(e) => {
                          const raw = e.target.value.replace(/\./g, '').replace(',', '.');
                          if (raw === '' || /^\d*\.?\d*$/.test(raw)) setDatosEntrada({ ...datosEntrada, cantidad: raw });
                        }}
                        className="w-full px-4 py-5 bg-white border-2 border-green-200 rounded-2xl focus:border-green-500 font-black text-3xl text-green-700 text-center shadow-inner transition-all"
                        placeholder="0"
                      />
                    </div>
                  </div>

                  {/* Horómetro / KM */}
                  <div className="bg-amber-50/30 p-6 rounded-[2.5rem] border-2 border-amber-100 flex flex-col justify-center relative overflow-hidden">
                    <label className="block text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] mb-3 text-center">Horómetro / KM</label>
                    <div className="relative">
                      <input
                        type="text"
                        value={formatMiles(datosEntrada.horometroOdometro)}
                        onChange={(e) => {
                          const raw = e.target.value.replace(/\./g, '').replace(',', '.');
                          if (raw === '' || /^\d*\.?\d*$/.test(raw)) setDatosEntrada({ ...datosEntrada, horometroOdometro: raw });
                        }}
                        className="w-full px-4 py-5 bg-white border-2 border-amber-200 rounded-2xl focus:border-amber-500 font-black text-3xl text-amber-700 text-center shadow-inner transition-all"
                        placeholder="0"
                      />
                    </div>
                  </div>
                </div>

                {/* --- SECCIÓN 2: DOCUMENTACIÓN Y NOTAS (Layout Simétrico) --- */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 pt-4 border-t border-slate-50">
                  {/* Columna Izquierda: Vales / Guías */}
                  <div className="space-y-4">
                    <div className="flex justify-between items-center px-1">
                      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Vales / Guías de Despacho</label>
                      <span className="text-[10px] font-black text-green-600 bg-green-50 px-3 py-1 rounded-full uppercase">{datosEntrada.numerosDocumento.filter(d => d).length} / 10 REGISTRADOS</span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                      {datosEntrada.numerosDocumento.map((num, idx) => (
                        <div key={idx} className="relative group">
                          <input
                            type="text" required={idx === 0} value={num}
                            onChange={(e) => {
                              const arr = [...datosEntrada.numerosDocumento];
                              arr[idx] = e.target.value;
                              setDatosEntrada({ ...datosEntrada, numerosDocumento: arr });
                            }}
                            placeholder={`N° Doc ${idx + 1}`}
                            className="w-full px-4 py-4 bg-slate-50 border-2 border-slate-200 rounded-xl focus:border-green-500 text-xs font-black text-slate-700 shadow-inner"
                          />
                          {idx > 0 && (
                            <button
                              type="button"
                              onClick={() => setDatosEntrada({ ...datosEntrada, numerosDocumento: datosEntrada.numerosDocumento.filter((_, i) => i !== idx) })}
                              className="absolute -top-1 -right-1 w-5 h-5 bg-white border border-red-100 text-red-500 rounded-full flex items-center justify-center text-[10px] shadow-md hover:bg-red-500 hover:text-white transition-all opacity-0 group-hover:opacity-100"
                            >
                              ×
                            </button>
                          )}
                        </div>
                      ))}
                      {datosEntrada.numerosDocumento.length < 10 && (
                        <button
                          type="button"
                          onClick={() => setDatosEntrada({ ...datosEntrada, numerosDocumento: [...datosEntrada.numerosDocumento, ''] })}
                          className="flex items-center justify-center gap-2 px-4 py-4 border-2 border-dashed border-slate-300 rounded-xl text-slate-400 hover:border-green-500 hover:text-green-600 transition-all bg-slate-50 hover:bg-green-50/50"
                        >
                          <span className="text-lg font-black">+</span>
                          <span className="text-[9px] font-black uppercase tracking-widest">Añadir</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Columna Derecha: Observaciones y Email */}
                  <div className="flex flex-col gap-6">
                    <div className="space-y-3">
                      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] px-1">Observaciones / Notas</label>
                      <textarea
                        value={datosEntrada.observaciones}
                        onChange={(e) => setDatosEntrada({ ...datosEntrada, observaciones: e.target.value })}
                        className="w-full px-6 py-4 bg-slate-50 border-2 border-slate-200 rounded-2xl focus:border-green-500 font-bold text-slate-600 shadow-inner h-[100px] text-sm"
                        placeholder="Notas adicionales sobre la recepción..."
                      />
                    </div>

                    <div className="space-y-3">
                      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] px-1">Enviar Copia (Opcional)</label>
                      <div className="relative">
                        <input
                          type="email"
                          value={datosEntrada.extraEmail}
                          onChange={(e) => setDatosEntrada({ ...datosEntrada, extraEmail: e.target.value })}
                          className="w-full pl-12 pr-6 py-4 bg-slate-50 border-2 border-slate-200 rounded-2xl focus:border-green-500 font-black text-sm text-slate-700 shadow-inner"
                          placeholder="correo@ejemplo.com"
                        />
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xl">📧</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* --- SECCIÓN 3: FOTO DE RESPALDO (Simplificada) --- */}
                <div className="flex flex-col items-center justify-center p-10 bg-slate-50 rounded-[2.5rem] border-2 border-dashed border-slate-200 text-center mb-24">
                  {firmaRepartidor ? (
                    <div className="relative group/photo inline-block">
                      <img
                        src={firmaRepartidor}
                        alt="Respaldo"
                        className="w-72 h-48 object-cover rounded-2xl border-4 border-white shadow-xl"
                      />
                      <button
                        onClick={() => { setFirmaRepartidor(null); setShowModalCamaraRepartidor(true); }}
                        className="absolute inset-0 bg-black/60 opacity-0 group-hover/photo:opacity-100 transition-opacity rounded-2xl flex flex-col items-center justify-center gap-2 backdrop-blur-sm"
                      >
                        <span className="text-4xl text-white">🔄</span>
                        <span className="text-[10px] font-black text-white uppercase tracking-widest">Cambiar Fotografía</span>
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setShowModalCamaraRepartidor(true)}
                      className="flex flex-col items-center gap-4 group transition-all active:scale-95"
                    >
                      <div className="w-24 h-24 bg-green-600 group-hover:bg-green-500 text-white rounded-full flex items-center justify-center text-4xl shadow-lg shadow-green-100 transition-all">
                        📷
                      </div>
                      <span className="text-xs font-black text-slate-500 uppercase tracking-widest group-hover:text-green-600 transition-colors">
                        Tomar fotografía para firmar
                      </span>
                    </button>
                  )}
                </div>

                {/* Botones de Navegación Paso 3a (Sticky Footer) */}
                <div className="fixed bottom-0 left-0 right-0 p-4 bg-white/80 backdrop-blur-md border-t border-slate-100 flex gap-4 z-50">
                  <button
                    onClick={() => setPaso(2)}
                    className="flex-1 px-8 py-4 bg-slate-100 hover:bg-slate-200 text-slate-500 font-black rounded-2xl transition-all uppercase text-[10px] tracking-widest"
                  >
                    ← Regresar
                  </button>
                  <button
                    onClick={handleSubmit}
                    disabled={loading || !datosEntrada.cantidad || !firmaRepartidor || datosEntrada.numerosDocumento.filter(d => d).length === 0}
                    className="flex-[2] px-8 py-4 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white font-black rounded-2xl transition-all uppercase text-[10px] tracking-widest shadow-xl shadow-green-100 disabled:grayscale disabled:opacity-50 active:scale-95"
                  >
                    {loading ? 'Guardando...' : '✓ Finalizar Recepción'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* PASO 3b: ENTREGA DE COMBUSTIBLE (Diseño Unificado) */}
          {paso === 3 && tipoReporte === 'entrega' && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="bg-white p-6 sm:p-8 rounded-[2.5rem] border-2 border-slate-100 shadow-xl space-y-8">

                {/* --- SECCIÓN 1: CANTIDADES (LITROS Y HORÓMETRO) --- */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Litros */}
                  <div className="bg-blue-50/30 p-6 rounded-[2.5rem] border-2 border-blue-100 flex flex-col justify-center relative overflow-hidden text-center">
                    <label className="block text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] mb-3">Litros Entregados</label>
                    <div className="relative">
                      <input
                        type="text" required
                        value={formatMiles(datosEntrega.cantidadLitros)}
                        onChange={(e) => {
                          const raw = e.target.value.replace(/\./g, '').replace(',', '.');
                          if (raw === '' || /^\d*\.?\d*$/.test(raw)) setDatosEntrega({ ...datosEntrega, cantidadLitros: raw });
                        }}
                        className="w-full px-4 py-5 bg-white border-2 border-blue-200 rounded-2xl focus:border-blue-500 font-black text-3xl text-blue-700 text-center shadow-inner transition-all"
                        placeholder="0"
                      />
                    </div>
                  </div>

                  {/* Horómetro / KM */}
                  <div className="bg-slate-50 p-6 rounded-[2.5rem] border-2 border-slate-100 flex flex-col justify-center relative overflow-hidden text-center">
                    <label className="block text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] mb-3">Horómetro / Odómetro</label>
                    <div className="relative">
                      <input
                        type="text"
                        value={formatMiles(datosEntrega.horometroOdometro)}
                        onChange={(e) => {
                          const raw = e.target.value.replace(/\./g, '').replace(',', '.');
                          if (raw === '' || /^\d*\.?\d*$/.test(raw)) setDatosEntrega({ ...datosEntrega, horometroOdometro: raw });
                        }}
                        className="w-full px-4 py-5 bg-white border-2 border-slate-200 rounded-2xl focus:border-blue-500 font-black text-3xl text-slate-700 text-center shadow-inner transition-all"
                        placeholder="0"
                      />
                    </div>
                  </div>
                </div>

                {/* --- SECCIÓN 2: DESTINO DE LA ENTREGA (Empresa, Máquina, Receptor) --- */}
                <div className="pt-4 border-t border-slate-100 space-y-6">
                  <div className="flex items-center gap-3 px-1">
                    <span className="w-7 h-7 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-black">2</span>
                    <h4 className="text-sm font-black text-slate-800 uppercase tracking-wider">Destino de la Entrega</h4>
                  </div>

                  {/* Toggle Interno/Externo */}
                  <div className="flex bg-slate-100 p-1.5 rounded-2xl gap-2">
                    <button
                      onClick={() => setDatosEntrega({ ...datosEntrega, empresa: 'MPF', machineId: '', operadorId: '' })}
                      className={`flex-1 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all ${esMPF(datosEntrega.empresa) ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-500 hover:bg-slate-200'}`}
                    >
                      🏗️ Interno (MPF)
                    </button>
                    <button
                      onClick={() => setDatosEntrega({ ...datosEntrega, empresa: '', machineId: '', operadorId: '' })}
                      className={`flex-1 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all ${!esMPF(datosEntrega.empresa) ? 'bg-orange-600 text-white shadow-lg' : 'text-slate-500 hover:bg-slate-200'}`}
                    >
                      🤝 Externo
                    </button>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Columna Izquierda: Empresa y Maquinaria */}
                    <div className="space-y-4">
                      {!esMPF(datosEntrega.empresa) && (
                        <div className="space-y-2">
                          <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Empresa Receptora</label>
                          <div className="flex gap-2">
                            <select
                              value={datosEntrega.empresa}
                              onChange={(e) => setDatosEntrega({ ...datosEntrega, empresa: e.target.value, machineId: '', operadorId: '' })}
                              className="flex-1 px-4 py-4 bg-slate-50 border-2 border-slate-200 rounded-2xl focus:border-blue-500 font-black text-xs text-slate-700 shadow-inner"
                            >
                              <option value="">Seleccione empresa</option>
                              {empresasLocal.filter(e => !esMPF(e.id)).map(emp => (
                                <option key={emp.id} value={emp.id}>{emp.nombre}</option>
                              ))}
                            </select>
                            <button onClick={() => setShowModalEmpresa(true)} className="px-5 bg-blue-600 text-white rounded-2xl font-black shadow-lg transition-all hover:bg-blue-500">+</button>
                          </div>
                        </div>
                      )}

                      <div className="space-y-2">
                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Maquinaria que recibe</label>
                        <div className="flex gap-2">
                          <select
                            value={datosEntrega.machineId}
                            onChange={(e) => setDatosEntrega({ ...datosEntrega, machineId: e.target.value })}
                            className="flex-1 px-4 py-4 bg-slate-50 border-2 border-slate-200 rounded-2xl focus:border-blue-500 font-black text-xs text-slate-700 shadow-inner"
                          >
                            <option value="">Seleccione maquinaria</option>
                            {machinesLocal
                              .filter(m => esMPF(datosEntrega.empresa) ? esMPF(m.empresa) : empresasMatch(m.empresa, resolverNombreEmpresa(datosEntrega.empresa)))
                              .map(m => (
                                <option key={m.id} value={m.id}>{m.patente || m.code || 'S/P'} - {m.name || m.nombre || m.tipo || m.modelo || 'Sin nombre'}</option>
                              ))}
                          </select>
                          <button
                            onClick={() => {
                              setNuevaMaquinaData({ ...nuevaMaquinaData, empresaId: datosEntrega.empresa || 'MPF' });
                              setShowModalMaquina(true);
                            }}
                            className="px-5 bg-blue-600 text-white rounded-2xl font-black shadow-lg transition-all hover:bg-blue-500"
                          >
                            +
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Columna Derecha: Persona que recibe */}
                    <div className="space-y-4">
                      <div className="bg-slate-50/50 p-6 rounded-[2.5rem] border-2 border-slate-100 space-y-4">
                        <div className="flex items-center justify-between px-1">
                          <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Persona que recibe</label>
                          <button
                            onClick={() => {
                              setNuevoEmpleadoData({ ...nuevoEmpleadoData, empresaId: datosEntrega.empresa || 'MPF' });
                              setShowModalEmpleado(true);
                            }}
                            className="text-[10px] font-black text-blue-600 hover:underline"
                          >
                            + Añadir Nuevo
                          </button>
                        </div>

                        <div className="relative">
                          <input
                            type="text"
                            placeholder="BUSCAR NOMBRE O RUT..."
                            value={searchOperador}
                            onChange={(e) => setSearchOperador(e.target.value)}
                            className="w-full pl-12 pr-6 py-4 bg-white border-2 border-slate-200 rounded-2xl focus:border-blue-500 font-black text-xs uppercase tracking-widest"
                          />
                          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-xl">🔍</span>
                        </div>

                        {datosEntrega.operadorId ? (() => {
                          const sel = trabajadoresLocales.find(e => e.id === datosEntrega.operadorId);
                          return (
                            <div className="mt-4 p-5 bg-gradient-to-br from-blue-600 to-indigo-700 text-white rounded-3xl flex items-center gap-5 shadow-xl shadow-blue-200 animate-in zoom-in duration-300">
                              <div className="w-14 h-14 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center text-2xl font-black shadow-inner">
                                {sel?.nombre?.charAt(0) || '👤'}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="text-[10px] font-black uppercase tracking-widest opacity-60 mb-0.5">Operador Seleccionado</div>
                                <div className="font-black text-base uppercase truncate leading-tight">{sel?.nombre || 'Nuevo Trabajador'}</div>
                                <div className="text-[11px] font-bold opacity-80 mt-0.5">RUT: {sel?.rut || 'Sin RUT'}</div>
                              </div>
                              <button 
                                onClick={() => setDatosEntrega({ ...datosEntrega, operadorId: '' })} 
                                className="w-10 h-10 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center text-xl font-black transition-all active:scale-90"
                              >
                                ✕
                              </button>
                            </div>
                          );
                        })() : (
                          <div className="max-h-48 overflow-y-auto pr-2 space-y-2">
                            {(trabajadoresLocales || [])
                              .filter(emp => esMPF(datosEntrega.empresa) ? esMPF(emp.empresa) : empresasMatch(emp.empresa, resolverNombreEmpresa(datosEntrega.empresa)))
                              .filter(emp => !searchOperador || emp.nombre?.toLowerCase().includes(searchOperador.toLowerCase()) || emp.rut?.includes(searchOperador))
                              .map(emp => (
                                <button
                                  key={emp.id} type="button"
                                  onClick={() => setDatosEntrega({ ...datosEntrega, operadorId: emp.id })}
                                  className="w-full flex items-center gap-3 px-4 py-3 bg-white border-2 border-slate-100 hover:border-blue-400 rounded-xl transition-all text-left"
                                >
                                  <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-[10px] font-black">{emp.nombre?.charAt(0)}</div>
                                  <div className="min-w-0">
                                    <div className="font-black text-slate-700 text-[11px] truncate uppercase">{emp.nombre}</div>
                                    <div className="text-[9px] text-slate-400 font-bold">{emp.rut}</div>
                                  </div>
                                </button>
                              ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* --- SECCIÓN 3: FOTO DE IDENTIFICACIÓN (Simplificada) --- */}
                <div className="flex flex-col items-center justify-center p-10 bg-slate-50 rounded-[2.5rem] border-2 border-dashed border-slate-200 text-center mb-24">
                  {firmaReceptor ? (
                    <div className="relative group/photo inline-block">
                      <img
                        src={firmaReceptor}
                        alt="Identificación"
                        className="w-72 h-48 object-cover rounded-2xl border-4 border-white shadow-xl"
                      />
                      <button
                        onClick={() => { setFirmaReceptor(null); setShowModalCamaraReceptor(true); }}
                        className="absolute inset-0 bg-black/60 opacity-0 group-hover/photo:opacity-100 transition-opacity rounded-2xl flex flex-col items-center justify-center gap-2 backdrop-blur-sm"
                      >
                        <span className="text-4xl text-white">🔄</span>
                        <span className="text-[10px] font-black text-white uppercase tracking-widest">Cambiar Fotografía</span>
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setShowModalCamaraReceptor(true)}
                      className="flex flex-col items-center gap-4 group transition-all active:scale-95"
                    >
                      <div className="w-24 h-24 bg-blue-600 group-hover:bg-blue-500 text-white rounded-full flex items-center justify-center text-4xl shadow-lg shadow-blue-100 transition-all">
                        📷
                      </div>
                      <span className="text-xs font-black text-slate-500 uppercase tracking-widest group-hover:text-blue-600 transition-colors">
                        Tomar fotografía para firmar
                      </span>
                    </button>
                  )}
                </div>

                {/* Botones de Acción Paso 3b (Sticky Footer) */}
                <div className="fixed bottom-0 left-0 right-0 p-4 bg-white/80 backdrop-blur-md border-t border-slate-100 flex gap-4 z-50">
                  <button
                    onClick={() => setPaso(2)}
                    className="flex-1 px-8 py-4 bg-slate-100 hover:bg-slate-200 text-slate-500 font-black rounded-2xl transition-all uppercase text-[10px] tracking-widest"
                  >
                    ← Regresar
                  </button>
                  <button
                    onClick={handleSubmit}
                    disabled={
                      loading || 
                      !datosEntrega.cantidadLitros || 
                      !firmaReceptor || 
                      !datosEntrega.machineId ||
                      !datosEntrega.operadorId
                    }
                    className="flex-[2] px-8 py-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-black rounded-2xl transition-all uppercase text-[10px] tracking-widest shadow-xl shadow-blue-100 disabled:grayscale disabled:opacity-50 active:scale-95"
                  >
                    {loading ? 'Guardando...' : '✓ Finalizar Entrega'}
                  </button>
                </div>
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

      {/* Modal: Nueva Maquinaria */}
      {showModalMaquina && (
        <div className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full">
            <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white p-6">
              <h3 className="text-xl font-black">🚜 Nueva Maquinaria</h3>
              <p className="text-blue-100 text-sm mt-1">Registrar equipo para la empresa seleccionada</p>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">Empresa Vinculada</label>
                <select
                  value={nuevaMaquinaData.empresaId}
                  onChange={(e) => setNuevaMaquinaData({ ...nuevaMaquinaData, empresaId: e.target.value })}
                  className="w-full px-4 py-2 border-2 border-slate-200 rounded-lg focus:outline-none focus:border-blue-500 text-sm bg-slate-50"
                >
                  <option value="">Seleccione empresa...</option>
                  {empresasLocal.map(emp => (
                    <option key={emp.id} value={emp.id}>{emp.nombre}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 gap-4">
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">Patente <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    placeholder="Ej: ABCD-12"
                    value={nuevaMaquinaData.patente}
                    onChange={(e) => setNuevaMaquinaData({ ...nuevaMaquinaData, patente: e.target.value.toUpperCase() })}
                    className="w-full px-4 py-2 border-2 border-blue-200 rounded-lg focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">Tipo <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    placeholder="Ej: Excavadora, Camión..."
                    value={nuevaMaquinaData.tipo}
                    onChange={(e) => setNuevaMaquinaData({ ...nuevaMaquinaData, tipo: e.target.value })}
                    className="w-full px-4 py-2 border-2 border-blue-200 rounded-lg focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">Modelo</label>
                  <input
                    type="text"
                    placeholder="Ej: Caterpillar 320"
                    value={nuevaMaquinaData.modelo}
                    onChange={(e) => setNuevaMaquinaData({ ...nuevaMaquinaData, modelo: e.target.value })}
                    className="w-full px-4 py-2 border-2 border-blue-200 rounded-lg focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-4 border-t border-blue-200">
                <button
                  onClick={() => {
                    setShowModalMaquina(false);
                    setNuevaMaquinaData({ patente: '', tipo: '', modelo: '', empresaId: '' });
                  }}
                  className="flex-1 px-6 py-3 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold rounded-xl transition-all"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleCrearMaquina}
                  disabled={loading || !nuevaMaquinaData.patente || !nuevaMaquinaData.tipo || !nuevaMaquinaData.empresaId}
                  className="flex-1 px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:from-slate-300 disabled:to-slate-400 text-white font-bold rounded-xl transition-all shadow-lg disabled:cursor-not-allowed"
                >
                  {loading ? 'Creando...' : '✓ Crear Máquina'}
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

      {/* Modal: Nuevo Trabajador */}
      {showModalEmpleado && (
        <div className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full">
            <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white p-6">
              <h3 className="text-xl font-black">👤 Nuevo Trabajador</h3>
              <p className="text-blue-100 text-sm mt-1">Registrar operador para la empresa seleccionada</p>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">Empresa Vinculada</label>
                <select
                  value={nuevoEmpleadoData.empresaId}
                  onChange={(e) => setNuevoEmpleadoData({ ...nuevoEmpleadoData, empresaId: e.target.value })}
                  className="w-full px-4 py-2 border-2 border-slate-200 rounded-lg focus:outline-none focus:border-blue-500 text-sm bg-slate-50"
                >
                  <option value="">Seleccione empresa...</option>
                  <option value="MPF">MPF Ingeniería Civil</option>
                  {empresasLocal.filter(e => !esMPF(e.id)).map(emp => (
                    <option key={emp.id} value={emp.id}>{emp.nombre}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 gap-4">
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">Nombre Completo <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    placeholder="Ej: Juan Perez"
                    value={nuevoEmpleadoData.nombre}
                    onChange={(e) => setNuevoEmpleadoData({ ...nuevoEmpleadoData, nombre: e.target.value })}
                    className="w-full px-4 py-2 border-2 border-blue-200 rounded-lg focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">RUT</label>
                  <input
                    type="text"
                    placeholder="Ej: 12.345.678-9"
                    value={nuevoEmpleadoData.rut}
                    onChange={(e) => setNuevoEmpleadoData({ ...nuevoEmpleadoData, rut: e.target.value })}
                    className="w-full px-4 py-2 border-2 border-blue-200 rounded-lg focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-4 border-t border-blue-200">
                <button
                  onClick={() => {
                    setShowModalEmpleado(false);
                    setNuevoEmpleadoData({ nombre: '', rut: '', empresaId: '' });
                  }}
                  className="flex-1 px-6 py-3 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold rounded-xl transition-all"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleCrearEmpleado}
                  disabled={loading || !nuevoEmpleadoData.nombre || !nuevoEmpleadoData.empresaId}
                  className="flex-1 px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:from-slate-300 disabled:to-slate-400 text-white font-bold rounded-xl transition-all shadow-lg disabled:cursor-not-allowed"
                >
                  {loading ? 'Creando...' : '✓ Crear Trabajador'}
                </button>
              </div>
            </div>
          </div>
        </div>
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
