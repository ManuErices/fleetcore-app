import { useState, useEffect, useRef } from "react";
import { collection, getDocs, addDoc, getDoc, doc, serverTimestamp } from "firebase/firestore";
import { db, auth, storage } from "../../../lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { ref, uploadString, getDownloadURL } from "firebase/storage";
import { getNextGuiaNumber } from '../../../utils/voucherThermalGenerator';
import { useToast } from '../../../components/Toast';
import { useEmpresaData } from '../../../hooks/useEmpresaData';

const TODAY = () => new Date().toISOString().split('T')[0];

const getNextCodigoNumber = async (empresaId) => {
  try {
    const { collection, query, limit, getDocs } = await import('firebase/firestore');
    const { db } = await import('../../../lib/firebase');

    if (!empresaId) return 1;

    const reportesRef = collection(db, 'empresas', empresaId, 'reportes_combustible');
    const q = query(reportesRef, limit(200));
    const snapshot = await getDocs(q);

    let lastNum = 0;
    snapshot.docs.forEach(d => {
      const val = d.data().codigo;
      if (val) {
        const n = parseInt(val, 10);
        if (!isNaN(n) && n > lastNum) {
          lastNum = n;
        }
      }
    });

    return lastNum + 1;
  } catch (error) {
    console.error('Error en getNextCodigoNumber:', error);
    return 1;
  }
};

export function useCombustibleForm(empresaId, onClose, isReportesView) {
  const { toast, toasts, removeToast } = useToast();
  const isSubmittingRef = useRef(false);

  const [paso, setPaso] = useState(1);
  const [tipoReporte, setTipoReporte] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingEquipo, setLoadingEquipo] = useState(false);
  const [loadingEmpresa, setLoadingEmpresa] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [currentUserData, setCurrentUserData] = useState(null);
  const [userRole, setUserRole] = useState('operador');
  const [isOfflineSave, setIsOfflineSave] = useState(false);
  const isAdmin = userRole === 'superadmin' || userRole === 'admin_contrato' || userRole === 'admin';
  const [surtidoresPersonas, setSurtidoresPersonas] = useState([]);
  const [repartidorSeleccionado, setRepartidorSeleccionado] = useState(null);

  const [showVoucherModal, setShowVoucherModal] = useState(false);
  const [lastReportData, setLastReportData] = useState(null);
  const [showHistorial, setShowHistorial] = useState(false);

  const [firmaRepartidor, setFirmaRepartidor] = useState(null);
  const [firmaReceptor, setFirmaReceptor] = useState(null);
  const [showModalCamaraRepartidor, setShowModalCamaraRepartidor] = useState(false);
  const [showModalCamaraReceptor, setShowModalCamaraReceptor] = useState(false);

  const [searchOperador, setSearchOperador] = useState('');
  const [searchMaquina, setSearchMaquina] = useState('');
  const [operadorExterno, setOperadorExterno] = useState({ nombre: '', rut: '' });
  const [maquinaExterna, setMaquinaExterna] = useState({ patente: '', tipo: '', modelo: '' });

  const [showModalEquipoSurtidor, setShowModalEquipoSurtidor] = useState(false);
  const [showModalEmpresa, setShowModalEmpresa] = useState(false);
  const [showModalMaquina, setShowModalMaquina] = useState(false);
  const [showModalEmpleado, setShowModalEmpleado] = useState(false);
  const [showModalProyecto, setShowModalProyecto] = useState(false);
  const [showModalEstacion, setShowModalEstacion] = useState(false);

  const [nuevoEquipoSurtidor, setNuevoEquipoSurtidor] = useState({ patente: '', nombre: '', tipo: '', marca: '', modelo: '' });
  const [nuevaEmpresa, setNuevaEmpresa] = useState({ nombre: '', rut: '' });
  const [nuevaMaquinaData, setNuevaMaquinaData] = useState({ patente: '', tipo: '', modelo: '', empresaId: '' });
  const [nuevoEmpleadoData, setNuevoEmpleadoData] = useState({ nombre: '', rut: '', empresaId: '' });
  const [nuevoProyecto, setNuevoProyecto] = useState({ name: '', codigo: '' });
  const [nuevaEstacion, setNuevaEstacion] = useState({ nombre: '', marca: '' });

  const {
    projects,
    setProjects,
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
    subEmpresasLocal,
  } = useEmpresaData(empresaId);

  const [trabajadoresLocales, setTrabajadoresLocales] = useState([]);

  const [datosControl, setDatosControl] = useState({
    projectId: '',
    fecha: TODAY(),
    repartidorId: '',
    equipoSurtidorId: '',
    folio: '',
    codigo: ''
  });

  const [datosEntrada, setDatosEntrada] = useState({
    origen: '',
    tipoOrigen: '',
    destinoCarga: '',
    numerosDocumento: [''],
    numeroDocumento: '',
    fechaDocumento: TODAY(),
    cantidad: '',
    horometroOdometro: '',
    machineId: '',
    operadorId: '',
    receptorNombre: '',
    maquinaProveedorId: '',
    operadorProveedorId: '',
    observaciones: '',
    extraEmails: []
  });

  const [datosEntrega, setDatosEntrega] = useState({
    empresa: '',
    fecha: TODAY(),
    operadorId: '',
    machineId: '',
    horometroOdometro: '',
    cantidadLitros: '',
    observaciones: '',
    extraEmails: []
  });

  // ── Effects ──────────────────────────────────────────────────

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => setCurrentUser(user));
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!currentUser?.uid) return;
    const cargarDatosUsuario = async () => {
      try {
        // Leer solo el doc del usuario actual (la regla no permite leer toda la colección)
        const userSnap = await getDoc(doc(db, 'users', currentUser.uid));
        const userData = userSnap.exists() ? { id: userSnap.id, ...userSnap.data() } : null;
        if (userData) {
          setCurrentUserData(userData);
          setUserRole(userData.role || 'operador');
          const effectIsAdmin = userData.role === 'superadmin' || userData.role === 'admin_contrato';
          if (!datosControl.repartidorId && !effectIsAdmin) {
            setDatosControl(prev => ({ ...prev, repartidorId: userData.id }));
          }
          if (!effectIsAdmin && !datosEntrada.operadorId) {
            setDatosEntrada(prev => ({ ...prev, operadorId: userData.id }));
          }
          if (!datosEntrada.receptorNombre && userData.nombre) {
            setDatosEntrada(prev => ({ ...prev, receptorNombre: userData.nombre }));
          }
        }
      } catch (error) {
        console.error('❌ Error cargando datos de usuario:', error);
      }
    };
    cargarDatosUsuario();
  }, [currentUser]);

  useEffect(() => {
    if (empleados?.length) setTrabajadoresLocales(empleados);
  }, [empleados]);

  useEffect(() => {
    if (empleados?.length) {
      setSurtidoresPersonas(empleados.filter(e => e.esSurtidor === true));
    }
  }, [empleados]);

  // Auto-seleccionar proyecto cuando solo hay uno disponible
  useEffect(() => {
    if (projects?.length === 1 && !datosControl.projectId) {
      setDatosControl(prev => ({ ...prev, projectId: projects[0].id }));
      cargarEstaciones(projects[0].id);
    }
  }, [projects]);

  // ── Helpers ───────────────────────────────────────────────────

  const normEmp = (s) => (s || '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ').trim();

  const empresasMatch = (a, b) => {
    if (!a || !b) return false;
    const na = normEmp(a), nb = normEmp(b);
    return na === nb || na.includes(nb) || nb.includes(na);
  };

  const resolverNombreEmpresa = (empresaIdONombre) => {
    if (!empresaIdONombre) return null;
    const found = empresasLocal.find(e => e.id === empresaIdONombre);
    return found ? found.nombre : empresaIdONombre;
  };

  const esEmpresaInterna = (empresaIdONombre) => {
    if (!empresaIdONombre) return false;
    if (empresaIdONombre === 'MPF') return true;
    const nombre = resolverNombreEmpresa(empresaIdONombre);
    const n = normEmp(nombre);
    const nombresInternos = (subEmpresasLocal || []).map(se => normEmp(se.nombre || ''));
    
    if (nombresInternos.length === 0) {
      const EMPRESAS_SISTEMA = ['MPF Ingeniería Civil', 'MPF', 'LifeMed', 'Intosim', 'Río Tinto', 'Global', 'Celenor'];
      return EMPRESAS_SISTEMA.some(na => {
        const t = normEmp(na);
        return n.includes(t) || t.includes(n);
      });
    }
    return nombresInternos.some(t => n.includes(t) || t.includes(n));
  };
  const esMPF = esEmpresaInterna;

  // ── Actions ───────────────────────────────────────────────────

  const cargarEstaciones = async (projectId) => {
    if (!projectId) { setEstacionesLocal([]); return; }
    try {
      const snap = await getDocs(collection(db, 'empresas', empresaId, 'estaciones_combustible'));
      const todas = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setEstacionesLocal(todas.filter(e => {
        const obras = Array.isArray(e.obras) ? e.obras : [];
        return obras.length === 0 || obras.includes(projectId);
      }));
    } catch (e) {
      console.error('Error cargando estaciones:', e);
      setEstacionesLocal([]);
    }
  };

  const resetForm = () => {
    isSubmittingRef.current = false;
    setPaso(1);
    setTipoReporte('');
    setFirmaRepartidor(null);
    setFirmaReceptor(null);
    setDatosControl({ projectId: '', fecha: TODAY(), repartidorId: '', equipoSurtidorId: '', folio: '', codigo: '' });
    setDatosEntrada({
      origen: '', tipoOrigen: '', destinoCarga: '', numerosDocumento: [''], numeroDocumento: '',
      fechaDocumento: TODAY(), cantidad: '', horometroOdometro: '', machineId: '', operadorId: '',
      receptorNombre: '', maquinaProveedorId: '', operadorProveedorId: '', observaciones: '', extraEmails: []
    });
    setDatosEntrega({
      empresa: '', fecha: TODAY(), operadorId: '', machineId: '',
      horometroOdometro: '', cantidadLitros: '', observaciones: '', extraEmails: []
    });
    setIsOfflineSave(false);
  };

  const handleClose = () => { resetForm(); onClose(); };

  // ── CRUD handlers ────────────────────────────────────────────

  const handleCrearEquipoSurtidor = async () => {
    if (!nuevoEquipoSurtidor.patente || !nuevoEquipoSurtidor.nombre) {
      toast({ type: 'warning', message: 'Patente y Nombre son obligatorios' });
      return;
    }
    try {
      setLoadingEquipo(true);
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
      setMachinesLocal(prev => [...prev, {
        id: docRef.id,
        patente: nuevoEquipoSurtidor.patente.toUpperCase(),
        code: nuevoEquipoSurtidor.patente.toUpperCase(),
        name: nuevoEquipoSurtidor.nombre,
        tipo: nuevoEquipoSurtidor.tipo || 'Equipo Surtidor',
        marca: nuevoEquipoSurtidor.marca || '',
        modelo: nuevoEquipoSurtidor.modelo || ''
      }]);
      setEquiposSurtidores(prev => [...prev, {
        id: docRef.id, ...nuevoEquipoSurtidor,
        patente: nuevoEquipoSurtidor.patente.toUpperCase()
      }]);
      setDatosControl(prev => ({ ...prev, equipoSurtidorId: docRef.id }));
      setShowModalEquipoSurtidor(false);
      setNuevoEquipoSurtidor({ patente: '', nombre: '', tipo: '', marca: '', modelo: '' });
      toast({ type: 'success', message: 'Equipo surtidor creado y seleccionado exitosamente' });
    } catch (error) {
      console.error("❌ Error creando equipo:", error);
      toast({ type: 'error', message: `Error al crear equipo surtidor: ${error.message}` });
    } finally {
      setLoadingEquipo(false);
    }
  };

  const handleCrearEmpresa = async () => {
    if (!nuevaEmpresa.nombre) {
      toast({ type: 'warning', message: 'El nombre de la empresa es obligatorio' });
      return;
    }
    try {
      setLoading(true);
      const docRef = await addDoc(collection(db, 'empresas', empresaId, 'empresas_combustible'), {
        nombre: nuevaEmpresa.nombre,
        rut: nuevaEmpresa.rut,
        fechaCreacion: new Date().toISOString()
      });
      const nuevaEmp = { id: docRef.id, nombre: nuevaEmpresa.nombre, rut: nuevaEmpresa.rut };
      setEmpresasLocal(prev => [...prev, nuevaEmp]);
      if (tipoReporte === 'entrega') {
        setDatosEntrega(prev => ({ ...prev, empresa: docRef.id }));
      } else {
        setDatosEntrada(prev => ({ ...prev, origen: docRef.id }));
      }
      setShowModalEmpresa(false);
      setNuevaEmpresa({ nombre: '', rut: '' });
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
    const targetEmpId = nuevaMaquinaData.empresaId
      || (tipoReporte === 'entrega' ? datosEntrega.empresa : (datosEntrada.tipoOrigen === 'estanque' ? datosEntrada.origen : ''));
    const nombreEmpresa = targetEmpId ? (empresasLocal.find(e => e.id === targetEmpId)?.nombre || targetEmpId) : '';
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
      setMachinesLocal(prev => [...prev, { id: mRef.id, ...mData }]);
      const target = nuevaMaquinaData.targetField;
      if (target === 'maquinaProveedor') {
        setDatosEntrada(prev => ({ ...prev, maquinaProveedorId: mRef.id }));
      } else if (tipoReporte === 'entrega') {
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
      const targetEmp = nuevoEmpleadoData.targetField;
      if (targetEmp === 'operadorProveedor') {
        setDatosEntrada(prev => ({ ...prev, operadorProveedorId: eRef.id }));
      } else if (targetEmp === 'operadorEntrada') {
        setDatosEntrada(prev => ({ ...prev, operadorId: eRef.id }));
      } else {
        setDatosEntrega(prev => ({ ...prev, operadorId: eRef.id }));
      }
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

  const handleCrearProyecto = async () => {
    if (!nuevoProyecto.name.trim()) {
      toast({ type: 'warning', message: 'El nombre de la obra/proyecto es obligatorio' });
      return;
    }
    try {
      setLoading(true);
      const docRef = await addDoc(collection(db, 'empresas', empresaId, 'projects'), {
        name: nuevoProyecto.name.trim(),
        codigo: nuevoProyecto.codigo.trim(),
        createdAt: serverTimestamp()
      });
      const nuevoProj = { id: docRef.id, name: nuevoProyecto.name.trim(), codigo: nuevoProyecto.codigo.trim() };
      setProjects(prev => [...prev, nuevoProj]);
      setDatosControl(prev => ({ ...prev, projectId: docRef.id }));
      cargarEstaciones(docRef.id);
      setShowModalProyecto(false);
      setNuevoProyecto({ name: '', codigo: '' });
      toast({ type: 'success', message: 'Obra/Proyecto creado y seleccionado' });
    } catch (error) {
      console.error("Error creando proyecto:", error);
      toast({ type: 'error', message: 'Error al crear obra/proyecto' });
    } finally {
      setLoading(false);
    }
  };

  const handleCrearEstacion = async () => {
    if (!nuevaEstacion.nombre.trim()) {
      toast({ type: 'warning', message: 'El nombre de la estación es obligatorio' });
      return;
    }
    try {
      setLoading(true);
      const obras = datosControl.projectId ? [datosControl.projectId] : [];
      const docRef = await addDoc(collection(db, 'empresas', empresaId, 'estaciones_combustible'), {
        nombre: nuevaEstacion.nombre.trim(),
        marca: nuevaEstacion.marca.trim(),
        obras,
        createdAt: serverTimestamp()
      });
      const nuevaEst = { id: docRef.id, nombre: nuevaEstacion.nombre.trim(), marca: nuevaEstacion.marca.trim(), obras };
      setEstacionesLocal(prev => [...prev, nuevaEst]);
      setDatosEntrada(prev => ({ ...prev, origen: docRef.id }));
      setShowModalEstacion(false);
      setNuevaEstacion({ nombre: '', marca: '' });
      toast({ type: 'success', message: 'Estación creada y seleccionada' });
    } catch (error) {
      console.error("Error creando estación:", error);
      toast({ type: 'error', message: 'Error al crear estación' });
    } finally {
      setLoading(false);
    }
  };

  // ── Submit ────────────────────────────────────────────────────

  const handleSubmit = async () => {
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;

    const abort = (type, message) => {
      toast({ type, message });
      isSubmittingRef.current = false;
    };

    if (!currentUserData) {
      abort('error', 'Tu usuario no está registrado. Contacta al administrador.');
      return;
    }
    const repartidorRequired = tipoReporte !== 'entrada' || datosEntrada.tipoOrigen !== 'estacion';
    if (!datosControl.projectId || (repartidorRequired && !datosControl.repartidorId)) {
      abort('warning', 'Completa los campos obligatorios del control de combustible');
      return;
    }
    if (tipoReporte === 'entrada') {
      const docsValidos = datosEntrada.numerosDocumento.filter(d => d.trim());
      if (!datosEntrada.tipoOrigen || docsValidos.length === 0 || !datosEntrada.cantidad) {
        abort('warning', 'Completa los campos obligatorios de la entrada (Tipo Origen, Documento y Cantidad)');
        return;
      }
      if (datosEntrada.tipoOrigen === 'estacion' && !datosEntrada.destinoCarga) {
        abort('warning', 'Indica si la carga fue al camión surtidor o al estanque');
        return;
      }
      if (datosEntrada.tipoOrigen === 'interno' || datosEntrada.tipoOrigen === 'externo') {
        if (!datosEntrada.operadorId) {
          abort('warning', 'Selecciona quién recibe el combustible');
          return;
        }
        if (!datosEntrada.machineId) {
          abort('warning', 'Selecciona el vehículo o equipo que recibe el combustible');
          return;
        }
      }
    } else if (tipoReporte === 'entrega') {
      if (!datosEntrega.machineId || !datosEntrega.cantidadLitros) {
        abort('warning', 'Completa los campos obligatorios de la entrega (Máquina y Cantidad)');
        return;
      }
      if (!isReportesView && !firmaReceptor) {
        abort('warning', 'Se requiere foto de identificación del receptor');
        return;
      }
    }

    try {
      setLoading(true);
      // Validar o generar código
      let finalCodigo = datosControl.codigo ? datosControl.codigo.trim() : null;
      if (finalCodigo) {
        const { collection, query, where, getDocs } = await import('firebase/firestore');
        const reportesRef = collection(db, 'empresas', empresaId, 'reportes_combustible');
        const q = query(reportesRef, where('codigo', '==', finalCodigo));
        const snap = await getDocs(q);
        const exists = snap.docs.some(d => !d.data().deleted);
        if (exists) {
          abort('warning', 'El código ingresado ya existe. Por favor ingresa uno diferente.');
          return;
        }
      } else {
        const nextCodNum = await getNextCodigoNumber(empresaId);
        finalCodigo = String(nextCodNum);
      }

      const fecha = new Date();
      const numeroReporte = `COMB-${tipoReporte.toUpperCase()}-${fecha.getFullYear()}${(fecha.getMonth() + 1).toString().padStart(2, '0')}${fecha.getDate().toString().padStart(2, '0')}-${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`;
      const numeroGuia = await getNextGuiaNumber(empresaId);

      const dataToSave = {
        tipo: tipoReporte,
        numeroReporte,
        numeroGuia,
        ...datosControl,
        codigo: finalCodigo,
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
        const machineIdFinal = (datosEntrada.tipoOrigen === 'estacion' && datosEntrada.destinoCarga === 'camion')
          ? datosControl.equipoSurtidorId
          : datosEntrada.machineId;

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
        dataToSave.empresaProveedora = nombreProveedor;
        dataToSave.firmaRepartidor = firmaRepartidor;
        dataToSave.fechaFirma = new Date().toISOString();
      } else {
        const cantidadLitrosNum = parseFloat(datosEntrega.cantidadLitros.toString().replace(/\./g, '').replace(',', '.'));
        dataToSave.cantidadLitros = cantidadLitrosNum;
        dataToSave.datosEntrega = {
          ...datosEntrega,
          cantidadLitros: cantidadLitrosNum,
          horometroOdometro: parseFloat(datosEntrega.horometroOdometro.toString().replace(/\./g, '').replace(',', '.')) || 0,
          ...(esMPF(datosEntrega.empresa) ? {} : { operadorExterno, maquinaExterna })
        };
        dataToSave.firmaReceptor = firmaReceptor;
        dataToSave.fechaFirma = new Date().toISOString();
      }

      // Subir fotos a Storage (Solo si hay internet)
      const online = navigator.onLine;
      setIsOfflineSave(!online);

      if (online) {
        try {
          if (firmaRepartidor?.startsWith('data:')) {
            const fileRef = ref(storage, `reportes/${empresaId}/${Date.now()}_repartidor.jpg`);
            await uploadString(fileRef, firmaRepartidor, 'data_url');
            dataToSave.firmaRepartidor = await getDownloadURL(fileRef);
          }
          if (firmaReceptor?.startsWith('data:')) {
            const fileRef = ref(storage, `reportes/${empresaId}/${Date.now()}_receptor.jpg`);
            await uploadString(fileRef, firmaReceptor, 'data_url');
            dataToSave.firmaReceptor = await getDownloadURL(fileRef);
          }
        } catch (storageErr) {
          console.warn('⚠️ Error subiendo a Storage:', storageErr?.code || storageErr?.message);
          // Si falla el storage pero hay internet, guardamos el base64 de todos modos para no perder el dato
          if (dataToSave.firmaRepartidor?.length > 500000) dataToSave.firmaRepartidor = 'error_too_large';
          if (dataToSave.firmaReceptor?.length > 500000) dataToSave.firmaReceptor = 'error_too_large';
        }
      } else {
        console.log("📵 Modo offline detectado, omitiendo Storage y guardando en Firestore directamente");
        // Firestore persistirá esto localmente de inmediato
      }

      const docRef = await addDoc(collection(db, 'empresas', empresaId, 'reportes_combustible'), dataToSave);
      const nuevoReporteId = docRef.id;

      if (tipoReporte === 'entrega') {
        const projectInfo = projects?.find(p => p.id === datosControl.projectId);
        const empresaDoc = empresasLocal.find(e => e.id === datosEntrega.empresa);
        const empresaInfo = empresaDoc
          ? { nombre: empresaDoc.nombre || '', rut: empresaDoc.rut || '' }
          : { nombre: datosEntrega.empresa || 'N/A', rut: '' };
        let machineInfo = machinesLocal?.find(m => m.id === datosEntrega.machineId);
        if (!machineInfo && datosEntrega.machineId) {
          try {
            const snap = await getDoc(doc(db, 'empresas', empresaId, 'machines', datosEntrega.machineId));
            if (snap.exists()) machineInfo = { id: snap.id, ...snap.data() };
          } catch {}
        }
        const finalMachineInfo = machineInfo
          ? { patente: machineInfo.patente || '', nombre: machineInfo.name || machineInfo.nombre || '', tipo: machineInfo.tipo || '' }
          : { patente: maquinaExterna.patente || 'N/A', nombre: maquinaExterna.modelo || 'EXTERNA', tipo: maquinaExterna.tipo || 'N/A' };
        let operadorInfo = trabajadoresLocales?.find(e => e.id === datosEntrega.operadorId);
        if (!operadorInfo && datosEntrega.operadorId) {
          try {
            const snap = await getDoc(doc(db, 'empresas', empresaId, 'trabajadores', datosEntrega.operadorId));
            if (snap.exists()) operadorInfo = { id: snap.id, ...snap.data() };
          } catch {}
        }
        const finalOperadorInfo = operadorInfo
          ? { nombre: operadorInfo.nombre || '', rut: operadorInfo.rut || '' }
          : { nombre: operadorExterno.nombre || 'N/A', rut: operadorExterno.rut || 'N/A' };
        const repartidorInfo = trabajadoresLocales?.find(e => e.id === datosControl.repartidorId) || currentUserData;
        const equipoSurtidorInfo = equiposSurtidores.find(m => m.id === datosControl.equipoSurtidorId)
          || machinesLocal?.find(m => m.id === datosControl.equipoSurtidorId);

        setLastReportData({
          reportData: {
            ...dataToSave, numeroReporte,
            fecha: datosControl.fecha,
            cantidadLitros: parseFloat(datosEntrega.cantidadLitros.toString().replace(/\./g, '').replace(',', '.')),
            horometroOdometro: parseFloat(datosEntrega.horometroOdometro.toString().replace(/\./g, '').replace(',', '.')),
            firmaReceptor, firmaRepartidor
          },
          reporteId: nuevoReporteId,
          projectName: projectInfo?.nombre || projectInfo?.name || 'N/A',
          machineInfo: finalMachineInfo,
          operadorInfo: finalOperadorInfo,
          empresaInfo,
          repartidorInfo: {
            nombre: repartidorInfo?.nombre || dataToSave.repartidorNombre || '',
            rut: repartidorInfo?.rut || dataToSave.repartidorRut || ''
          },
          equipoSurtidorInfo: equipoSurtidorInfo
            ? { nombre: equipoSurtidorInfo.nombre || '', patente: equipoSurtidorInfo.patente || '', tipo: equipoSurtidorInfo.tipo || '' }
            : null
        });
        setShowVoucherModal(true);
      } else {
        toast({ type: 'success', message: `Reporte de Entrada registrado: ${numeroReporte}`, duration: 5000 });
        if (isReportesView) {
          onClose();
        } else {
          resetForm();
        }
      }
    } catch (error) {
      console.error("Error guardando reporte:", error);
      toast({ type: 'error', message: 'Error al guardar el reporte. Intenta nuevamente.' });
      isSubmittingRef.current = false;
    } finally {
      setLoading(false);
    }
  };

  return {
    // Toast
    toast, toasts, removeToast,
    // Wizard
    paso, setPaso, tipoReporte, setTipoReporte,
    // Loading
    loading, loadingEquipo, loadingEmpresa,
    isOfflineSave,
    // User
    currentUser, currentUserData, userRole, isAdmin,
    surtidoresPersonas, repartidorSeleccionado,
    // Voucher / historial
    showVoucherModal, setShowVoucherModal,
    lastReportData, setLastReportData,
    showHistorial, setShowHistorial,
    // Photos
    firmaRepartidor, setFirmaRepartidor,
    firmaReceptor, setFirmaReceptor,
    showModalCamaraRepartidor, setShowModalCamaraRepartidor,
    showModalCamaraReceptor, setShowModalCamaraReceptor,
    // Search / external data
    searchOperador, setSearchOperador,
    searchMaquina, setSearchMaquina,
    operadorExterno, setOperadorExterno,
    maquinaExterna, setMaquinaExterna,
    // Quick-create modal visibility
    showModalEquipoSurtidor, setShowModalEquipoSurtidor,
    showModalEmpresa, setShowModalEmpresa,
    showModalMaquina, setShowModalMaquina,
    showModalEmpleado, setShowModalEmpleado,
    showModalProyecto, setShowModalProyecto,
    showModalEstacion, setShowModalEstacion,
    // Quick-create form data
    nuevoEquipoSurtidor, setNuevoEquipoSurtidor,
    nuevaEmpresa, setNuevaEmpresa,
    nuevaMaquinaData, setNuevaMaquinaData,
    nuevoEmpleadoData, setNuevoEmpleadoData,
    nuevoProyecto, setNuevoProyecto,
    nuevaEstacion, setNuevaEstacion,
    // Form state
    datosControl, setDatosControl,
    datosEntrada, setDatosEntrada,
    datosEntrega, setDatosEntrega,
    // Lookup data
    projects, machines, machinesLocal, setMachinesLocal,
    empleados, equiposSurtidores, setEquiposSurtidores,
    empresasLocal, setEmpresasLocal,
    estacionesLocal, setEstacionesLocal,
    trabajadoresLocales, setTrabajadoresLocales,
    // Helpers
    esMPF, empresasMatch, resolverNombreEmpresa,
    // Actions
    cargarEstaciones, resetForm, handleClose, handleSubmit,
    handleCrearEquipoSurtidor, handleCrearEmpresa, handleCrearMaquina, handleCrearEmpleado,
    handleCrearProyecto, handleCrearEstacion,
  };
}
