import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { db, auth } from '../../lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { useEmpresa } from '../../lib/useEmpresa';
import {
  collection,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  query,
  orderBy,
  serverTimestamp,
  onSnapshot,
  getDoc,
  setDoc,
  runTransaction
} from 'firebase/firestore';
import * as Shared from './shared';
import * as Calc from './calculo';
import { TrabajadoresSection } from './sections.a';
import * as Modals from './modals';

const { AusenciaModal } = Modals;

const {
  inp,
  AREAS,
  MESES,
  Modal,
  ConfirmDialog
} = Shared;

const {
  exportarAsistenciaCSV
} = Calc;

const DIAS_SEMANA = [
  { key: 'lunes', label: 'Lunes' },
  { key: 'martes', label: 'Martes' },
  { key: 'miercoles', label: 'Miércoles' },
  { key: 'jueves', label: 'Jueves' },
  { key: 'viernes', label: 'Viernes' },
  { key: 'sabado', label: 'Sábado' },
  { key: 'domingo', label: 'Domingo' }
];

const calcularDiasHabiles = (desde, hasta) => {
  if (!desde || !hasta) return 0;
  const start = new Date(desde + 'T00:00:00');
  const end = new Date(hasta + 'T00:00:00');
  if (end < start) return 0;
  
  let count = 0;
  let cur = new Date(start);
  while (cur <= end) {
    const day = cur.getDay(); // 0 = Domingo, 6 = Sábado
    if (day !== 0 && day !== 6) {
      count++;
    }
    cur.setDate(cur.getDate() + 1);
  }
  return count;
};

export default function AsistenciaSection() {
  const { empresaId } = useEmpresa();
  const navigate = useNavigate();

  // Navigation Tabs
  const [activeTab, setActiveTab] = useState('marcador'); // 'marcador' | 'jornadas' | 'asignaciones' | 'turnos' | 'trabajadores'

  // Global State
  const [trabajadores, setTrabajadores] = useState([]);
  const [contratos, setContratos] = useState([]);
  const [turnos, setTurnos] = useState([]);
  const [asignaciones, setAsignaciones] = useState([]);
  const [vacaciones, setVacaciones] = useState([]);
  const [showVacacionModal, setShowVacacionModal] = useState(false);
  const [ausencias, setAusencias] = useState([]);
  const [showAusenciaModal, setShowAusenciaModal] = useState(false);
  const [editingAusencia, setEditingAusencia] = useState(null);
  const [loadingBase, setLoadingBase] = useState(true);
  const [currentUserRole, setCurrentUserRole] = useState(null);

  // Time & Clock state for Marcador
  const [currentTime, setCurrentTime] = useState(new Date());

  // Search & Filter States
  const [busqueda, setBusqueda] = useState('');
  const [filtroMes, setFiltroMes] = useState(String(new Date().getMonth() + 1).padStart(2, '0'));
  const [filtroAnio, setFiltroAnio] = useState(String(new Date().getFullYear()));
  const [pagina, setPagina] = useState(1);

  // Modals / Dialogs States
  const [showShiftModal, setShowShiftModal] = useState(false);
  const [editingShift, setEditingShift] = useState(null);
  const [confirmDeleteShift, setConfirmDeleteShift] = useState(null);

  const [showAssignModal, setShowAssignModal] = useState(false);
  const [assigningWorker, setAssigningWorker] = useState(null);

  const [editMarcacionModal, setEditMarcacionModal] = useState(null); // { trabajador, registro, docId, diaKey }

  // Marcador interactive states
  const [selectedMarcadorWorker, setSelectedMarcadorWorker] = useState(null);
  const [workerTodayMarcacion, setWorkerTodayMarcacion] = useState(null);
  const [gpsSimulated, setGpsSimulated] = useState({ lat: -33.4489, lng: -70.6693 }); // Santiago Central
  const [obtainingGps, setObtainingGps] = useState(false);
  const [punchMessage, setPunchMessage] = useState(null);

  // Jornadas specific states
  const [jornadasVista, setJornadasVista] = useState('hoy'); // 'hoy' | 'historial'
  const [marcacionesHoy, setMarcacionesHoy] = useState({}); // { portalUid: { entrada, salida, ... } }
  const [historialAsistencia, setHistorialAsistencia] = useState([]);

  const fmt2 = n => String(n).padStart(2, '0');
  const now = new Date();
  const diaKeyHoy = fmt2(now.getDate());

  // 0. Fetch current user role
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          const userSnap = await getDoc(doc(db, 'users', user.uid));
          if (userSnap.exists()) {
            setCurrentUserRole(userSnap.data().role || 'trabajador');
          }
        } catch (e) {
          console.error('Error fetching user role:', e);
        }
      } else {
        setCurrentUserRole(null);
      }
    });
    return () => unsub();
  }, []);

  const isUserAdmin = currentUserRole === 'superadmin' || currentUserRole === 'admin_contrato';

  // 1. Live clock update
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // 2. Load Core Data (Trabajadores, Contratos, Turnos, Asignaciones)
  const loadCoreData = useCallback(async () => {
    if (!empresaId) return;
    setLoadingBase(true);
    try {
      const [tSnap, cSnap] = await Promise.all([
        getDocs(query(collection(db, 'empresas', empresaId, 'trabajadores'), orderBy('apellidoPaterno'))),
        getDocs(collection(db, 'empresas', empresaId, 'contratos'))
      ]);

      const workersList = tSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      setTrabajadores(workersList);
      setContratos(cSnap.docs.map(d => ({ id: d.id, ...d.data() })));

      // Listen for Shifts
      const unsubTurnos = onSnapshot(
        query(collection(db, 'empresas', empresaId, 'turnos'), orderBy('nombre')),
        snap => setTurnos(snap.docs.map(d => ({ id: d.id, ...d.data() })))
      );

      // Listen for Assignments
      const unsubAssigns = onSnapshot(
        collection(db, 'empresas', empresaId, 'asignaciones_turnos'),
        snap => setAsignaciones(snap.docs.map(d => ({ id: d.id, ...d.data() })))
      );

      setLoadingBase(false);

      return () => {
        unsubTurnos();
        unsubAssigns();
      };
    } catch (e) {
      console.error('Error loading core HR data:', e);
      setLoadingBase(false);
    }
  }, [empresaId]);

  useEffect(() => {
    if (empresaId) {
      loadCoreData();
    }
  }, [empresaId, loadCoreData]);

  // 3. Real-time Attendance logs for TODAY (under Jornadas tab)
  useEffect(() => {
    if (!empresaId || loadingBase || activeTab !== 'jornadas' || jornadasVista !== 'hoy') return;
    const mesStr = fmt2(now.getMonth() + 1);
    const activos = trabajadores.filter(t => !t.estado || t.estado === 'activo');

    setMarcacionesHoy({});
    if (activos.length === 0) return;

    const unsubs = activos.map(t => {
      const keyId = t.portalUid || t.id;
      const docId = `${keyId}_${now.getFullYear()}_${mesStr}`;
      const ref = doc(db, 'empresas', empresaId, 'asistencia', docId);
      return onSnapshot(ref, snap => {
        setMarcacionesHoy(prev => {
          if (!snap.exists()) return prev;
          const data = snap.data();
          return {
            ...prev,
            [keyId]: {
              docId: snap.id,
              entrada: data.registros?.[diaKeyHoy]?.entrada || null,
              salida: data.registros?.[diaKeyHoy]?.salida || null,
              gps_e: data.registros?.[diaKeyHoy]?.gps_e || null,
              gps_s: data.registros?.[diaKeyHoy]?.gps_s || null,
              turnoId: data.registros?.[diaKeyHoy]?.turnoId || null,
              estadoJornada: data.registros?.[diaKeyHoy]?.estadoJornada || null,
              horasTrabajadas: data.registros?.[diaKeyHoy]?.horasTrabajadas || 0,
              horasExtra: data.registros?.[diaKeyHoy]?.horasExtra || 0,
              modificaciones: data.modificaciones || []
            }
          };
        });
      });
    });

    return () => unsubs.forEach(u => u());
  }, [empresaId, loadingBase, activeTab, jornadasVista, trabajadores, diaKeyHoy]);

  // 4. Load Historical attendance (under Jornadas tab)
  useEffect(() => {
    if (!empresaId || activeTab !== 'jornadas' || jornadasVista !== 'historial') return;
    getDocs(query(collection(db, 'empresas', empresaId, 'asistencia'), orderBy('anio', 'desc')))
      .then(snap => setHistorialAsistencia(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
      .catch(err => console.error(err));
  }, [empresaId, activeTab, jornadasVista]);

  // 5. Real-time Attendance logs for SELECTED WORKER on Marcador
  useEffect(() => {
    if (!empresaId || !selectedMarcadorWorker) {
      setWorkerTodayMarcacion(null);
      return;
    }
    const uid = selectedMarcadorWorker.portalUid || selectedMarcadorWorker.id;
    const anio = currentTime.getFullYear();
    const mesStr = fmt2(currentTime.getMonth() + 1);
    const diaStr = fmt2(currentTime.getDate());
    const docId = `${uid}_${anio}_${mesStr}`;

    const unsub = onSnapshot(doc(db, 'empresas', empresaId, 'asistencia', docId), snap => {
      if (snap.exists()) {
        const data = snap.data();
        const reg = data.registros?.[diaStr] || null;
        setWorkerTodayMarcacion(reg ? { ...reg, docId: snap.id } : null);
      } else {
        setWorkerTodayMarcacion(null);
      }
    });

    return () => unsub();
  }, [empresaId, selectedMarcadorWorker, currentTime]);

  // Try to obtain real GPS coordinates on worker selection
  const obtenerGeolocalizacion = () => {
    setObtainingGps(true);
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        pos => {
          setGpsSimulated({ lat: pos.coords.latitude, lng: pos.coords.longitude });
          setObtainingGps(false);
        },
        err => {
          console.log('Using simulated GPS coordinates.');
          setObtainingGps(false);
        },
        { timeout: 5000 }
      );
    } else {
      setObtainingGps(false);
    }
  };

  useEffect(() => {
    if (selectedMarcadorWorker) {
      obtenerGeolocalizacion();
    }
  }, [selectedMarcadorWorker]);

  // Real-time Vacaciones loading
  useEffect(() => {
    if (!empresaId) return;
    const unsub = onSnapshot(
      query(collection(db, 'empresas', empresaId, 'vacaciones'), orderBy('createdAt', 'desc')),
      snap => {
        setVacaciones(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      },
      err => console.error('Error loading vacaciones:', err)
    );
    return () => unsub();
  }, [empresaId]);

  // Real-time Ausencias loading
  useEffect(() => {
    if (!empresaId) return;
    const unsub = onSnapshot(
      query(collection(db, 'empresas', empresaId, 'ausencias'), orderBy('fechaDesde', 'desc')),
      snap => {
        setAusencias(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      },
      err => console.error('Error loading ausencias:', err)
    );
    return () => unsub();
  }, [empresaId]);

  const handleSaveVacacion = async (data) => {
    if (!empresaId) return;
    try {
      await addDoc(collection(db, 'empresas', empresaId, 'vacaciones'), {
        ...data,
        estado: 'pendiente',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      setShowVacacionModal(false);
      alert('Solicitud de vacaciones creada exitosamente.');
    } catch (e) {
      console.error('Error al crear solicitud de vacaciones:', e);
      alert('Error al crear la solicitud: ' + e.message);
    }
  };

  const handleAprobarVacacion = async (vacacion) => {
    if (!empresaId) return;
    if (!confirm(`¿Está seguro de aprobar las vacaciones de ${vacacion.trabajadorNombre}?`)) return;
    try {
      const workerRef = doc(db, 'empresas', empresaId, 'trabajadores', vacacion.trabajadorId);
      const vacacionRef = doc(db, 'empresas', empresaId, 'vacaciones', vacacion.id);
      
      await runTransaction(db, async (transaction) => {
        const workerSnap = await transaction.get(workerRef);
        if (!workerSnap.exists()) {
          throw new Error('El trabajador asociado a esta solicitud no existe.');
        }
        
        const workerData = workerSnap.data();
        const currentBalance = Number(workerData.diasVacacionesDisponibles ?? 15.0);
        const newBalance = Math.round((currentBalance - vacacion.diasSolicitados) * 100) / 100;
        
        transaction.update(vacacionRef, {
          estado: 'aprobado',
          updatedAt: serverTimestamp()
        });
        
        transaction.update(workerRef, {
          diasVacacionesDisponibles: newBalance
        });
      });
      
      alert('Solicitud aprobada y saldo de vacaciones actualizado.');
    } catch (e) {
      console.error('Error al aprobar vacaciones:', e);
      alert('Error al aprobar la solicitud: ' + e.message);
    }
  };

  const handleRechazarVacacion = async (vacacion) => {
    if (!empresaId) return;
    if (!confirm(`¿Está seguro de rechazar las vacaciones de ${vacacion.trabajadorNombre}?`)) return;
    try {
      await updateDoc(doc(db, 'empresas', empresaId, 'vacaciones', vacacion.id), {
        estado: 'rechazado',
        updatedAt: serverTimestamp()
      });
      alert('Solicitud rechazada.');
    } catch (e) {
      console.error('Error al rechazar vacaciones:', e);
      alert('Error al rechazar la solicitud: ' + e.message);
    }
  };

  const handleDeleteAusencia = async (ausencia) => {
    if (!empresaId) return;
    if (!confirm('¿Seguro que deseas eliminar este registro de ausencia?')) return;
    try {
      await deleteDoc(doc(db, 'empresas', empresaId, 'ausencias', ausencia.id));
      alert('Registro de ausencia eliminado con éxito.');
    } catch (e) {
      console.error('Error al eliminar ausencia:', e);
      alert('Error: ' + e.message);
    }
  };

  // Helpers
  function fmtHora(ts) {
    if (!ts) return null;
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return `${fmt2(d.getHours())}:${fmt2(d.getMinutes())}`;
  }

  function getActiveShift(trabajadorId, dateString) {
    const today = dateString || now.toISOString().split('T')[0];
    const assign = asignaciones.find(
      a =>
        a.trabajadorId === trabajadorId &&
        a.activo &&
        a.fechaInicio <= today &&
        (!a.fechaFin || a.fechaFin >= today)
    );
    if (!assign) return null;
    return turnos.find(t => t.id === assign.turnoId) || null;
  }

  // ==========================================
  // TAB ACTION HANDLERS
  // ==========================================

  // --- Shifts CRUD ---
  const handleSaveShift = async (shiftData) => {
    if (!shiftData.nombre) return;
    try {
      const payload = {
        nombre: shiftData.nombre,
        tipo: shiftData.tipo || 'semanal',
        toleranciaEntradaMins: parseInt(shiftData.toleranciaEntradaMins) || 0,
        dias: shiftData.dias,
        activo: true,
        updatedAt: serverTimestamp()
      };

      if (editingShift?.id) {
        await updateDoc(doc(db, 'empresas', empresaId, 'turnos', editingShift.id), payload);
      } else {
        await addDoc(collection(db, 'empresas', empresaId, 'turnos'), {
          ...payload,
          createdAt: serverTimestamp()
        });
      }
      setShowShiftModal(false);
      setEditingShift(null);
    } catch (e) {
      alert('Error al guardar turno: ' + e.message);
    }
  };

  const handleDeleteShift = async () => {
    if (!confirmDeleteShift) return;
    try {
      await deleteDoc(doc(db, 'empresas', empresaId, 'turnos', confirmDeleteShift.id));
    } catch (e) {
      alert('Error al eliminar turno: ' + e.message);
    }
    setConfirmDeleteShift(null);
  };

  // --- Shift Assignments ---
  const handleAssignShift = async (turnoId, fechaInicio, fechaFin) => {
    if (!assigningWorker || !turnoId || !fechaInicio) return;
    try {
      // Mark old assignments for this worker as inactive
      const prevAssigns = asignaciones.filter(a => a.trabajadorId === assigningWorker.id && a.activo);
      for (const oldAssign of prevAssigns) {
        const yesterday = new Date(new Date(fechaInicio).getTime() - 86400000).toISOString().split('T')[0];
        await updateDoc(doc(db, 'empresas', empresaId, 'asignaciones_turnos', oldAssign.id), {
          activo: false,
          fechaFin: oldAssign.fechaFin && oldAssign.fechaFin < yesterday ? oldAssign.fechaFin : yesterday,
          updatedAt: serverTimestamp()
        });
      }

      // Add new assignment
      await addDoc(collection(db, 'empresas', empresaId, 'asignaciones_turnos'), {
        trabajadorId: assigningWorker.id,
        turnoId,
        fechaInicio,
        fechaFin: fechaFin || null,
        activo: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      setShowAssignModal(false);
      setAssigningWorker(null);
    } catch (e) {
      alert('Error al asignar turno: ' + e.message);
    }
  };

  // --- Clock punches (Marcador) ---
  const handleMarcadorPunch = async (tipo) => {
    if (!selectedMarcadorWorker) return;
    try {
      const uid = selectedMarcadorWorker.portalUid || selectedMarcadorWorker.id;
      const tName = `${selectedMarcadorWorker.nombre} ${selectedMarcadorWorker.apellidoPaterno}`;
      const anio = currentTime.getFullYear();
      const mesStr = fmt2(currentTime.getMonth() + 1);
      const diaStr = fmt2(currentTime.getDate());
      const docId = `${uid}_${anio}_${mesStr}`;

      const ref = doc(db, 'empresas', empresaId, 'asistencia', docId);
      const snap = await getDoc(ref);
      const data = snap.exists() ? snap.data() : { trabajadorId: uid, trabajadorNombre: tName, anio, mes: mesStr, registros: {} };

      const activeShift = getActiveShift(selectedMarcadorWorker.id, currentTime.toISOString().split('T')[0]);

      const daysOfWeek = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
      const todayDay = daysOfWeek[currentTime.getDay()];
      const shiftDayConfig = activeShift?.dias?.[todayDay];

      let entryTime = workerTodayMarcacion?.entrada || null;
      let exitTime = workerTodayMarcacion?.salida || null;
      let status = workerTodayMarcacion?.estadoJornada || 'presente';
      let workedHrs = workerTodayMarcacion?.horasTrabajadas || 0;
      let extraHrs = workerTodayMarcacion?.horasExtra || 0;

      if (tipo === 'entrada') {
        entryTime = currentTime;
        if (activeShift && shiftDayConfig?.activo) {
          const [hExpected, mExpected] = shiftDayConfig.entrada.split(':').map(Number);
          const tolerance = activeShift.toleranciaEntradaMins || 0;

          const limit = new Date(currentTime);
          limit.setHours(hExpected, mExpected + tolerance, 0, 0);

          if (currentTime > limit) {
            status = 'retraso';
          } else {
            status = 'presente';
          }
        } else if (activeShift && !shiftDayConfig?.activo) {
          status = 'libre';
        } else {
          status = 'presente';
        }
      } else {
        exitTime = currentTime;
        if (entryTime) {
          const d1 = entryTime.toDate ? entryTime.toDate() : new Date(entryTime);
          const d2 = currentTime;
          const minsTotal = Math.round((d2 - d1) / 60000);

          let breakMins = 0;
          if (activeShift && shiftDayConfig?.activo) {
            breakMins = shiftDayConfig.colacionMins || 0;
          }

          workedHrs = Math.max(0, parseFloat(((minsTotal - breakMins) / 60).toFixed(2)));

          if (activeShift && shiftDayConfig?.activo) {
            const [hEnt, mEnt] = shiftDayConfig.entrada.split(':').map(Number);
            const [hSal, mSal] = shiftDayConfig.salida.split(':').map(Number);
            const standardShiftMins = (hSal * 60 + mSal) - (hEnt * 60 + mEnt) - breakMins;
            const standardShiftHrs = standardShiftMins / 60;
            extraHrs = Math.max(0, parseFloat((workedHrs - standardShiftHrs).toFixed(2)));
          }
        }
      }

      const updatedReg = {
        ...data.registros,
        [diaStr]: {
          entrada: entryTime,
          salida: exitTime,
          turnoId: activeShift?.id || null,
          turnoNombre: activeShift?.nombre || 'General (Sin Turno)',
          entradaEsperada: shiftDayConfig?.entrada || null,
          salidaEsperada: shiftDayConfig?.salida || null,
          toleranciaEntradaMins: activeShift?.toleranciaEntradaMins || 0,
          estadoJornada: status,
          horasTrabajadas: workedHrs,
          horasExtra: extraHrs,
          gps_e: tipo === 'entrada' ? gpsSimulated : (data.registros?.[diaStr]?.gps_e || null),
          gps_s: tipo === 'salida' ? gpsSimulated : null
        }
      };

      await setDoc(ref, { ...data, registros: updatedReg }, { merge: true });

      setPunchMessage({
        tipo: 'success',
        text: `Marca de ${tipo === 'entrada' ? 'Entrada' : 'Salida'} registrada con éxito para ${tName} a las ${currentTime.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}.`
      });
      setTimeout(() => setPunchMessage(null), 5000);
    } catch (e) {
      setPunchMessage({ tipo: 'error', text: 'Error al marcar: ' + e.message });
    }
  };

  // --- Edit Attendance Log with Justification (Jornadas) ---
  const handleSaveEditMarcacion = async (val) => {
    if (!editMarcacionModal) return;
    const { docId, diaKey, modificaciones } = editMarcacionModal;
    try {
      const ref = doc(db, 'empresas', empresaId, 'asistencia', docId);
      const snap = await getDoc(ref);
      
      let data = {};
      if (snap.exists()) {
        data = snap.data();
      } else {
        const parts = docId.split('_');
        const tId = parts[0];
        const yearPart = parts[1];
        const mesStr = parts[2];
        data = {
          trabajadorId: tId,
          trabajadorNombre: editMarcacionModal.nombre,
          anio: parseInt(yearPart) || new Date().getFullYear(),
          mes: mesStr,
          registros: {}
        };
      }

      const toTs = (horaStr) => {
        if (!horaStr) return null;
        const [h, m] = horaStr.split(':').map(Number);
        const d = new Date(parseInt(filtroAnio), parseInt(filtroMes) - 1, parseInt(diaKey));
        d.setHours(h, m, 0, 0);
        return d;
      };

      const entryDate = toTs(val.entrada);
      const exitDate = toTs(val.salida);
      const currentReg = data.registros?.[diaKey] || {};

      let workedHrs = currentReg.horasTrabajadas || 0;
      let extraHrs = currentReg.horasExtra || 0;
      if (entryDate && exitDate) {
        const mins = Math.round((exitDate - entryDate) / 60000);
        workedHrs = Math.max(0, parseFloat((mins / 60).toFixed(2)));
        if (currentReg.entradaEsperada && currentReg.salidaEsperada) {
          const [hEnt, mEnt] = currentReg.entradaEsperada.split(':').map(Number);
          const [hSal, mSal] = currentReg.salidaEsperada.split(':').map(Number);
          const standardShiftHrs = ((hSal * 60 + mSal) - (hEnt * 60 + mEnt)) / 60;
          extraHrs = Math.max(0, parseFloat((workedHrs - standardShiftHrs).toFixed(2)));
        }
      }

      const modLog = {
        campo: `registros.${diaKey}`,
        valorAntes: { entrada: currentReg.entrada || null, salida: currentReg.salida || null, estadoJornada: currentReg.estadoJornada || null },
        valorDespues: { entrada: entryDate, salida: exitDate, estadoJornada: val.estadoJornada },
        justificacion: val.justificacion,
        modificadoPor: auth.currentUser?.email || 'Admin',
        timestamp: new Date()
      };

      const updatedReg = {
        ...data.registros,
        [diaKey]: {
          ...currentReg,
          entrada: entryDate,
          salida: exitDate,
          estadoJornada: val.estadoJornada,
          horasTrabajadas: workedHrs,
          horasExtra: extraHrs
        }
      };

      await setDoc(ref, {
        ...data,
        registros: updatedReg,
        modificaciones: [...(data.modificaciones || []), modLog]
      });

      setEditMarcacionModal(null);
    } catch (e) {
      alert('Error al modificar marcación: ' + e.message);
    }
  };

  const handleDeleteJornadaDoc = async (rowId) => {
    if (!confirm('¿Está seguro de eliminar de forma permanente todo el historial de este mes para el trabajador? Esta acción es irreversible.')) return;
    try {
      await deleteDoc(doc(db, 'empresas', empresaId, 'asistencia', rowId));
      alert('Registro de asistencia del mes eliminado con éxito.');
      // Refetch historical logs
      getDocs(query(collection(db, 'empresas', empresaId, 'asistencia'), orderBy('anio', 'desc')))
        .then(snap => setHistorialAsistencia(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
        .catch(err => console.error(err));
    } catch (e) {
      alert('Error al eliminar registro: ' + e.message);
    }
  };

  // --- Filtering & Pagination ---

  // Filter turnos
  const turnosFiltrados = turnos.filter(t => !busqueda || t.nombre.toLowerCase().includes(busqueda.toLowerCase()));

  // Filter assignations
  const assignationsFiltrados = trabajadores.map(t => {
    const activeShift = getActiveShift(t.id);
    const assign = asignaciones.find(a => a.trabajadorId === t.id && a.activo);
    return {
      ...t,
      _shift: activeShift,
      _assign: assign
    };
  }).filter(t => {
    const q = busqueda.toLowerCase();
    const matchSearch = !q || `${t.nombre} ${t.apellidoPaterno} ${t.rut || ''}`.toLowerCase().includes(q) || t._shift?.nombre.toLowerCase().includes(q);
    return matchSearch;
  });

  // Filter Jornadas (real time)
  const realTimeJornadasFiltradas = trabajadores.map(t => {
    const keyId = t.portalUid || t.id;
    const marc = marcacionesHoy[keyId] || {};
    return {
      ...t,
      _marc: marc
    };
  }).filter(t => {
    const q = busqueda.toLowerCase();
    return !q || `${t.nombre} ${t.apellidoPaterno} ${t.rut || ''}`.toLowerCase().includes(q);
  });

  const sinMarcar = realTimeJornadasFiltradas.filter(t => t.portalUid && !t._marc?.entrada);
  const enJornada = realTimeJornadasFiltradas.filter(t => t._marc?.entrada && !t._marc?.salida);
  const completas = realTimeJornadasFiltradas.filter(t => t._marc?.entrada && t._marc?.salida);

  // Filter Jornadas (historical monthly)
  const historicalJornadasEnriquecidas = historialAsistencia.map(r => {
    let trabajador = trabajadores.find(t => t.id === r.trabajadorId || t.portalUid === r.trabajadorId);
    if (!trabajador && r.trabajadorNombre) {
      const nombreDoc = r.trabajadorNombre.trim().toLowerCase();
      trabajador = trabajadores.find(t => {
        const nombreT = `${t.nombre || ''} ${t.apellidoPaterno || ''}`.trim().toLowerCase();
        return nombreT === nombreDoc;
      });
    }
    const contrato = contratos.find(c => c.trabajadorId === trabajador?.id);
    return { ...r, _trabajador: trabajador, _contrato: contrato };
  }).filter(r => {
    const q = busqueda.toLowerCase();
    const nombre = `${r._trabajador?.nombre || ''} ${r._trabajador?.apellidoPaterno || ''}`.toLowerCase();
    return (
      (!filtroMes || r.mes === filtroMes) &&
      (!filtroAnio || String(r.anio) === filtroAnio) &&
      (!busqueda || nombre.includes(q) || r._trabajador?.rut?.includes(busqueda))
    );
  });

  const PAG_LIMIT = 12;
  const pagHistorialJornadas = historicalJornadasEnriquecidas.slice((pagina - 1) * PAG_LIMIT, pagina * PAG_LIMIT);
  const totalPagHistJornadas = Math.ceil(historicalJornadasEnriquecidas.length / PAG_LIMIT);

  return (
    <div className="space-y-6">
      {/* ── TOP HEADER / NAVIGATION TABS ── */}
      <div className="flex flex-col sm:flex-row items-center justify-between border-b border-slate-200 pb-4 gap-4">
        <div>
          <h2 className="text-xl font-black text-slate-900 tracking-tight">Gestión de Asistencia y Personal</h2>
          <p className="text-xs text-slate-400 mt-0.5">Control de turnos, jornadas y registro de trabajadores en tiempo real.</p>
        </div>
        <div className="flex overflow-x-auto p-1.5 bg-slate-100/80 border border-slate-200/50 rounded-2xl gap-1.5 max-w-full backdrop-blur-sm shadow-sm">
          {[
            { 
              id: 'marcador', 
              label: 'Marcador', 
              icon: (active) => (
                <svg className={`w-4 h-4 mr-2 ${active ? 'text-purple-600' : 'text-slate-400 group-hover:text-slate-600'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              )
            },
            { 
              id: 'jornadas', 
              label: 'Jornadas', 
              icon: (active) => (
                <svg className={`w-4 h-4 mr-2 ${active ? 'text-purple-600' : 'text-slate-400 group-hover:text-slate-600'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              )
            },
            { 
              id: 'asignaciones', 
              label: 'Asignación', 
              icon: (active) => (
                <svg className={`w-4 h-4 mr-2 ${active ? 'text-purple-600' : 'text-slate-400 group-hover:text-slate-600'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                </svg>
              )
            },
            { 
              id: 'turnos', 
              label: 'Turnos', 
              icon: (active) => (
                <svg className={`w-4 h-4 mr-2 ${active ? 'text-purple-600' : 'text-slate-400 group-hover:text-slate-600'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              )
            },
            { 
              id: 'trabajadores', 
              label: 'Trabajadores', 
              icon: (active) => (
                <svg className={`w-4 h-4 mr-2 ${active ? 'text-purple-600' : 'text-slate-400 group-hover:text-slate-600'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              )
            },
            {
              id: 'vacaciones',
              label: 'Vacaciones',
              icon: (active) => (
                <svg className={`w-4 h-4 mr-2 ${active ? 'text-purple-600' : 'text-slate-400 group-hover:text-slate-600'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                </svg>
              )
            },
            {
              id: 'ausencias',
              label: 'Ausencias / Licencias',
              icon: (active) => (
                <svg className={`w-4 h-4 mr-2 ${active ? 'text-purple-600' : 'text-slate-400 group-hover:text-slate-600'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              )
            }
          ].map(t => {
            const active = activeTab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => {
                  setActiveTab(t.id);
                  setBusqueda('');
                  setPagina(1);
                }}
                className={`flex items-center px-4 py-2 text-xs font-bold rounded-xl transition-all whitespace-nowrap group ${
                  active 
                    ? 'bg-white text-purple-600 shadow-sm border border-slate-200/30' 
                    : 'text-slate-500 hover:text-slate-800 hover:bg-white/40'
                }`}
              >
                {t.icon(active)}
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ════════════════════════════════
          TAB: MARCADOR (CLOCK PUNCH)
      ════════════════════════════════ */}
      {activeTab === 'marcador' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Fichador central */}
          <div className="md:col-span-2 bg-slate-900 text-white rounded-2xl p-6 relative overflow-hidden flex flex-col justify-between shadow-xl min-h-[450px]"
               style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%)' }}>
            <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-10">
              <svg className="absolute -right-20 -top-20 w-96 h-96" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="45" stroke="white" strokeWidth="1" fill="none"/>
                <line x1="50" y1="50" x2="50" y2="20" stroke="white" strokeWidth="2"/>
                <line x1="50" y1="50" x2="70" y2="50" stroke="white" strokeWidth="2.5"/>
              </svg>
            </div>

            <div className="flex justify-between items-start z-10">
              <div>
                <span className="text-[10px] font-black tracking-widest text-purple-400 uppercase bg-purple-950/60 border border-purple-800/40 px-2.5 py-1 rounded-full">Reloj de Fichaje</span>
                <p className="text-sm font-semibold text-slate-400 mt-2">
                  {currentTime.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                </p>
              </div>
              <div className="text-right">
                <span className="text-xs text-slate-400 font-mono">Geolocalización activa</span>
                <div className="flex items-center gap-1.5 justify-end mt-0.5">
                  <div className={`w-2.5 h-2.5 rounded-full ${obtainingGps ? 'bg-amber-400 animate-pulse' : 'bg-emerald-400 animate-pulse'}`}/>
                  <span className="text-[11px] font-bold text-slate-300 font-mono">
                    {gpsSimulated.lat.toFixed(4)}, {gpsSimulated.lng.toFixed(4)}
                  </span>
                </div>
              </div>
            </div>

            {/* RELOJ DIGITAL */}
            <div className="text-center my-6 z-10">
              <h1 className="text-6xl sm:text-7xl font-black font-mono tracking-tight text-white select-none">
                {currentTime.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </h1>
            </div>

            <div className="z-10 space-y-4">
              {punchMessage && (
                <div className={`p-4 rounded-xl text-sm font-medium border ${
                  punchMessage.tipo === 'success' ? 'bg-emerald-950/80 border-emerald-800/50 text-emerald-300' : 'bg-red-950/80 border-red-800/50 text-red-300'
                }`}>
                  {punchMessage.text}
                </div>
              )}

              {selectedMarcadorWorker ? (
                <div className="bg-white/5 backdrop-blur-md rounded-xl p-4 border border-white/10">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-purple-600 flex items-center justify-center font-black text-sm text-white">
                      {`${selectedMarcadorWorker.nombre?.[0] || ''}${selectedMarcadorWorker.apellidoPaterno?.[0] || ''}`.toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-bold text-white text-sm truncate">{selectedMarcadorWorker.nombre} {selectedMarcadorWorker.apellidoPaterno}</h4>
                      <p className="text-xs text-slate-400 font-mono mt-0.5">{selectedMarcadorWorker.rut} · {selectedMarcadorWorker.cargo || 'Sin cargo'}</p>
                    </div>
                    <button onClick={() => { setSelectedMarcadorWorker(null); setWorkerTodayMarcacion(null); }} className="text-slate-400 hover:text-white text-xs">
                      Cambiar
                    </button>
                  </div>

                  {/* Horario Details */}
                  {(() => {
                    const activeShift = getActiveShift(selectedMarcadorWorker.id);
                    const daysOfWeek = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
                    const todayDay = daysOfWeek[currentTime.getDay()];
                    const dayConfig = activeShift?.dias?.[todayDay];

                    return (
                      <div className="mt-3 pt-3 border-t border-white/5 flex flex-wrap justify-between items-center text-xs text-slate-300 gap-2">
                        <div>
                          <span className="text-slate-500 font-bold block uppercase text-[9px] tracking-widest">Turno Asignado</span>
                          <span className="font-semibold text-purple-300">{activeShift?.nombre || 'General (Sin Turno)'}</span>
                        </div>
                        <div className="text-right">
                          <span className="text-slate-500 font-bold block uppercase text-[9px] tracking-widest">Horario Hoy</span>
                          <span className="font-semibold">
                            {dayConfig?.activo ? `${dayConfig.entrada} - ${dayConfig.salida} (${dayConfig.colacionMins}m col.)` : 'Libre / Descanso'}
                          </span>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Hoy Marcación stats */}
                  <div className="mt-3 grid grid-cols-2 gap-3 pt-3 border-t border-white/5 text-xs">
                    <div className="bg-white/5 rounded-lg p-2 text-center">
                      <span className="text-slate-500 block text-[9px] uppercase tracking-wider mb-0.5">Entrada Registrada</span>
                      <span className="font-bold font-mono text-sm">
                        {workerTodayMarcacion?.entrada ? fmtHora(workerTodayMarcacion.entrada) : <span className="text-slate-500">—</span>}
                      </span>
                    </div>
                    <div className="bg-white/5 rounded-lg p-2 text-center">
                      <span className="text-slate-500 block text-[9px] uppercase tracking-wider mb-0.5">Salida Registrada</span>
                      <span className="font-bold font-mono text-sm">
                        {workerTodayMarcacion?.salida ? fmtHora(workerTodayMarcacion.salida) : <span className="text-slate-500">—</span>}
                      </span>
                    </div>
                  </div>

                  {/* PUNCH BUTTONS */}
                  <div className="grid grid-cols-2 gap-3 mt-4">
                    <button
                      disabled={!!workerTodayMarcacion?.entrada}
                      onClick={() => handleMarcadorPunch('entrada')}
                      className="py-3 rounded-xl font-black text-sm text-white transition-all active:scale-95 disabled:opacity-30 disabled:scale-100 flex items-center justify-center gap-1.5 shadow-lg"
                      style={{ background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)' }}
                    >
                      🚪 Marcar Entrada
                    </button>
                    <button
                      disabled={!workerTodayMarcacion?.entrada || !!workerTodayMarcacion?.salida}
                      onClick={() => handleMarcadorPunch('salida')}
                      className="py-3 rounded-xl font-black text-sm text-white transition-all active:scale-95 disabled:opacity-30 disabled:scale-100 flex items-center justify-center gap-1.5 shadow-lg"
                      style={{ background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)' }}
                    >
                      🚪 Marcar Salida
                    </button>
                  </div>
                </div>
              ) : (
                <div className="bg-white/5 backdrop-blur-md rounded-xl p-6 border border-white/10 text-center text-slate-400">
                  <p className="text-sm font-semibold">Selecciona un trabajador en la barra lateral para registrar marcas.</p>
                </div>
              )}
            </div>
          </div>

          {/* Listado de trabajadores para selección */}
          <div className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-col h-[450px]">
            <h3 className="font-black text-slate-800 text-sm mb-3">Trabajadores Activos</h3>
            <div className="relative mb-3">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z"/></svg>
              <input
                className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-xs bg-slate-50 focus:outline-none focus:border-purple-400"
                placeholder="Buscar por nombre o RUT..."
                value={busqueda}
                onChange={e => setBusqueda(e.target.value)}
              />
            </div>
            <div className="flex-1 overflow-y-auto divide-y divide-slate-100 pr-1">
              {trabajadores
                .filter(t => (!t.estado || t.estado === 'activo') && (!busqueda || `${t.nombre} ${t.apellidoPaterno} ${t.rut || ''}`.toLowerCase().includes(busqueda.toLowerCase())))
                .map(t => {
                  const activeShift = getActiveShift(t.id);
                  const isSelected = selectedMarcadorWorker?.id === t.id;
                  return (
                    <button
                      key={t.id}
                      onClick={() => {
                        setSelectedMarcadorWorker(t);
                        obtenerGeolocalizacion();
                      }}
                      className={`w-full flex items-center justify-between py-2.5 px-2 rounded-lg text-left transition-all ${
                        isSelected ? 'bg-purple-50 text-purple-900 border border-purple-100 shadow-sm' : 'hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-white font-black text-[10px] flex-shrink-0 ${isSelected ? 'bg-purple-600' : 'bg-slate-400'}`}>
                          {`${t.nombre?.[0] || ''}${t.apellidoPaterno?.[0] || ''}`.toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="font-bold text-xs truncate text-slate-800">{t.nombre} {t.apellidoPaterno}</p>
                          <p className="text-[10px] text-slate-400 font-mono mt-0.5">{t.rut || '—'}</p>
                        </div>
                      </div>
                      <span className="text-[9px] font-bold px-2 py-0.5 bg-slate-100 text-slate-500 rounded-full max-w-[80px] truncate">
                        {activeShift?.nombre || 'Sin Turno'}
                      </span>
                    </button>
                  );
                })}
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════
          TAB: JORNADAS (ATTENDANCE LOGS)
      ════════════════════════════════ */}
      {activeTab === 'jornadas' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center flex-wrap gap-2">
            <div className="flex bg-slate-100 p-1 rounded-lg">
              <button
                onClick={() => { setJornadasVista('hoy'); setBusqueda(''); }}
                className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all ${jornadasVista === 'hoy' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}
              >
                Hoy en tiempo real
              </button>
              <button
                onClick={() => { setJornadasVista('historial'); setBusqueda(''); setPagina(1); }}
                className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all ${jornadasVista === 'historial' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}
              >
                Historial mensual
              </button>
            </div>

            {jornadasVista === 'hoy' && (
              <span className="text-xs font-black text-slate-400 uppercase tracking-widest bg-slate-50 px-3 py-1.5 border border-slate-100 rounded-xl">
                🟢 {currentTime.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' })}
              </span>
            )}
          </div>

          {/* VISTA HOY */}
          {jornadasVista === 'hoy' && (
            <>
              {/* Stats del día */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {[
                  { label: 'Sin marcar hoy', value: sinMarcar.length, color: 'text-red-500', bg: 'bg-red-50 border-red-100', dot: 'bg-red-400' },
                  { label: 'En jornada', value: enJornada.length, color: 'text-amber-600', bg: 'bg-amber-50 border-amber-100', dot: 'bg-amber-400' },
                  { label: 'Jornada completa', value: completas.length, color: 'text-emerald-600', bg: 'bg-emerald-50 border-emerald-100', dot: 'bg-emerald-400' }
                ].map(s => (
                  <div key={s.label} className={`rounded-2xl px-5 py-4 border ${s.bg} shadow-sm`}>
                    <div className="flex items-center gap-1.5 mb-1">
                      <div className={`w-2.5 h-2.5 rounded-full ${s.dot}`} />
                      <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider">{s.label}</span>
                    </div>
                    <p className={`text-4xl font-black ${s.color}`}>{s.value}</p>
                  </div>
                ))}
              </div>

              {/* Búsqueda */}
              <div className="relative">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z"/></svg>
                <input
                  className="w-full pl-9 pr-4 py-2.5 border-2 border-slate-200 rounded-xl text-sm focus:outline-none focus:border-purple-400 bg-white"
                  placeholder="Buscar trabajador por nombre o RUT..."
                  value={busqueda}
                  onChange={e => setBusqueda(e.target.value)}
                />
              </div>

              {/* Tabla tiempo real */}
              <div className="rounded-2xl overflow-hidden border border-slate-200 bg-white shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[700px]">
                    <thead>
                      <tr style={{ background: '#1e1b4b' }}>
                        {['Trabajador', 'Turno hoy', 'Estado', 'Entrada', 'Salida', 'Horas', 'Acciones'].map(h => (
                          <th key={h} className="px-4 py-3.5 text-left text-[11px] font-black text-slate-300 uppercase tracking-widest">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {realTimeJornadasFiltradas.map(t => {
                        const uid = t.portalUid || t.id;
                        const marc = t._marc || {};
                        const ini = `${t.nombre?.[0] || ''}${t.apellidoPaterno?.[0] || ''}`.toUpperCase();
                        const activeShift = getActiveShift(t.id);

                        let statusBadge, statusLabel;
                        if (!uid) {
                          statusBadge = 'bg-slate-100 text-slate-400';
                          statusLabel = '○ Sin cuenta';
                        } else if (marc.entrada && marc.salida) {
                          statusBadge = 'bg-emerald-100 text-emerald-700';
                          statusLabel = marc.estadoJornada === 'retraso' ? '✓ Retraso Just.' : '✓ Completa';
                        } else if (marc.entrada) {
                          statusBadge = 'bg-amber-100 text-amber-700';
                          statusLabel = marc.estadoJornada === 'retraso' ? '● Retraso (En Jornada)' : '● En jornada';
                        } else {
                          statusBadge = 'bg-red-100 text-red-600';
                          statusLabel = '— Sin marcar';
                        }

                        return (
                          <tr key={t.id} className="hover:bg-slate-50/50 transition-colors">
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2.5">
                                <div className="w-8 h-8 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center font-black text-xs">
                                  {ini}
                                </div>
                                <div>
                                  <p className="font-bold text-slate-800 text-sm">{t.nombre} {t.apellidoPaterno}</p>
                                  <p className="text-[11px] text-slate-400 font-mono mt-0.5">{t.rut || '—'}</p>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <span className="text-xs font-semibold text-slate-600">
                                {activeShift ? activeShift.nombre : <span className="text-slate-400">Sin Turno (General)</span>}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <span className={`inline-flex px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${statusBadge}`}>
                                {statusLabel}
                              </span>
                            </td>
                            <td className="px-4 py-3 font-mono text-sm font-semibold">
                              {marc.entrada ? fmtHora(marc.entrada) : <span className="text-slate-300">—</span>}
                            </td>
                            <td className="px-4 py-3 font-mono text-sm font-semibold">
                              {marc.salida ? fmtHora(marc.salida) : <span className="text-slate-300">—</span>}
                            </td>
                            <td className="px-4 py-3 font-mono text-sm text-emerald-600 font-bold">
                              {marc.horasTrabajadas ? `${marc.horasTrabajadas} hrs` : <span className="text-slate-300">—</span>}
                            </td>
                            <td className="px-4 py-3">
                              {(isUserAdmin || marc.docId) && (
                                <button
                                  onClick={() => setEditMarcacionModal({
                                    nombre: `${t.nombre} ${t.apellidoPaterno}`,
                                    diaKey: diaKeyHoy,
                                    docId: marc.docId || `${uid}_${now.getFullYear()}_${fmt2(now.getMonth() + 1)}`,
                                    trabajadorUid: uid,
                                    entrada: marc.entrada ? fmtHora(marc.entrada) : '',
                                    salida: marc.salida ? fmtHora(marc.salida) : '',
                                    estadoJornada: marc.estadoJornada || 'presente',
                                    modificaciones: marc.modificaciones || []
                                  })}
                                  className="p-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 rounded-lg transition-colors"
                                  title="Editar registro (Auditoría DT)"
                                >
                                  ✏️
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {/* VISTA HISTORIAL */}
          {jornadasVista === 'historial' && (
            <>
              {/* Filtros historial */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-500">Mes:</span>
                  <select
                    className="px-3 py-2 border-2 border-slate-200 rounded-xl text-sm bg-white focus:outline-none focus:border-purple-400"
                    value={filtroMes}
                    onChange={e => { setFiltroMes(e.target.value); setPagina(1); }}
                  >
                    {MESES.map((m, i) => <option key={m} value={fmt2(i + 1)}>{m}</option>)}
                  </select>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-500">Año:</span>
                  <select
                    className="px-3 py-2 border-2 border-slate-200 rounded-xl text-sm bg-white focus:outline-none focus:border-purple-400"
                    value={filtroAnio}
                    onChange={e => { setFiltroAnio(e.target.value); setPagina(1); }}
                  >
                    {[2024, 2025, 2026, 2027].map(y => <option key={y} value={String(y)}>{y}</option>)}
                  </select>
                </div>

                <div className="relative flex-1 min-w-[200px]">
                  <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z"/></svg>
                  <input
                    className="w-full pl-9 pr-4 py-2 border-2 border-slate-200 rounded-xl text-xs bg-white focus:outline-none focus:border-purple-400"
                    placeholder="Buscar por trabajador o RUT..."
                    value={busqueda}
                    onChange={e => { setBusqueda(e.target.value); setPagina(1); }}
                  />
                </div>
              </div>

              {/* Tabla de Historial */}
              <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[700px]">
                    <thead>
                      <tr style={{ background: '#1e1b4b' }}>
                        {['Trabajador', 'Período', 'Días con Marca', 'Modificaciones', 'Acciones'].map(h => (
                          <th key={h} className="px-4 py-3.5 text-left text-[11px] font-black text-slate-300 uppercase tracking-widest">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {pagHistorialJornadas.map(row => {
                        const t = row._trabajador;
                        const ini = `${t?.nombre?.[0] || ''}${t?.apellidoPaterno?.[0] || ''}`.toUpperCase();
                        const diasConEntrada = Object.values(row.registros || {}).filter(r => r.entrada).length;
                        const mods = (row.modificaciones || []).length;

                        return (
                          <tr key={row.id} className="hover:bg-slate-50/50 transition-colors">
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2.5">
                                <div className="w-8 h-8 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center font-black text-xs">
                                  {ini}
                                </div>
                                <div>
                                  <p className="font-bold text-slate-800 text-sm">{t ? `${t.nombre} ${t.apellidoPaterno}` : row.trabajadorNombre}</p>
                                  <p className="text-[11px] text-slate-400 font-mono mt-0.5">{t?.rut || '—'}</p>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3 font-bold text-slate-600 text-xs">
                              {MESES[parseInt(row.mes) - 1]} {row.anio}
                            </td>
                            <td className="px-4 py-3">
                              <span className="text-base font-black text-purple-600">{diasConEntrada}</span>
                              <span className="text-xs text-slate-400 ml-1">días marcados</span>
                            </td>
                            <td className="px-4 py-3">
                              {mods > 0 ? (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black bg-amber-100 text-amber-800 uppercase tracking-wide">
                                  ⚠️ {mods} cambios
                                </span>
                              ) : (
                                <span className="text-xs text-slate-300">Sin cambios</span>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex gap-2">
                                <button
                                  onClick={() => exportarAsistenciaCSV(t, row._contrato || {}, row.registros || {}, row.mes, row.anio)}
                                  className="p-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-600 rounded-lg transition-colors"
                                  title="Exportar CSV"
                                >
                                  📥
                                </button>
                                <button
                                  onClick={() => {
                                    setEditMarcacionModal({
                                      nombre: t ? `${t.nombre} ${t.apellidoPaterno}` : row.trabajadorNombre,
                                      docId: row.id,
                                      trabajadorUid: row.trabajadorId,
                                      calendarView: true,
                                      registros: row.registros || {},
                                      modificaciones: row.modificaciones || []
                                    });
                                  }}
                                  className="px-2.5 py-1 bg-purple-50 hover:bg-purple-100 text-purple-700 text-xs font-bold rounded-lg transition-colors"
                                >
                                  Ver Ficha
                                </button>
                                {isUserAdmin && (
                                  <button
                                    onClick={() => handleDeleteJornadaDoc(row.id)}
                                    className="p-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-lg transition-colors"
                                    title="Eliminar registro completo de este mes"
                                  >
                                    🗑️
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Paginación */}
              {totalPagHistJornadas > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border border-slate-200 rounded-xl bg-slate-50">
                  <p className="text-xs text-slate-400">Mostrando {(pagina - 1) * PAG_LIMIT + 1}–{Math.min(pagina * PAG_LIMIT, historicalJornadasEnriquecidas.length)} de <strong>{historicalJornadasEnriquecidas.length}</strong></p>
                  <div className="flex gap-1">
                    <button disabled={pagina === 1} onClick={() => setPagina(p => p - 1)} className="px-3 py-1.5 text-xs font-bold bg-white border border-slate-200 rounded-lg hover:border-purple-300 disabled:opacity-40">← Ant</button>
                    <button disabled={pagina === totalPagHistJornadas} onClick={() => setPagina(p => p + 1)} className="px-3 py-1.5 text-xs font-bold bg-white border border-slate-200 rounded-lg hover:border-purple-300 disabled:opacity-40">Sig →</button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ════════════════════════════════
          TAB: ASIGNACIÓN DE TURNOS
      ════════════════════════════════ */}
      {activeTab === 'asignaciones' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center flex-wrap gap-3">
            <h3 className="font-black text-slate-800 text-base">Asignación de Turnos a Trabajadores</h3>
            <div className="relative w-64">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z"/></svg>
              <input
                className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-xl text-xs focus:outline-none focus:border-purple-400"
                placeholder="Buscar trabajador o turno..."
                value={busqueda}
                onChange={e => setBusqueda(e.target.value)}
              />
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px]">
                <thead>
                  <tr style={{ background: '#1e1b4b' }}>
                    {['Trabajador', 'RUT', 'Área', 'Turno Vigente', 'Fecha Inicio', 'Fecha Término', 'Acciones'].map(h => (
                      <th key={h} className="px-4 py-3.5 text-left text-[11px] font-black text-slate-300 uppercase tracking-widest">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {assignationsFiltrados.map(t => {
                    const ini = `${t.nombre?.[0] || ''}${t.apellidoPaterno?.[0] || ''}`.toUpperCase();
                    return (
                      <tr key={t.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center font-black text-xs">
                              {ini}
                            </div>
                            <span className="font-bold text-slate-800 text-sm">{t.nombre} {t.apellidoPaterno}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-slate-500">{t.rut || '—'}</td>
                        <td className="px-4 py-3 text-xs text-slate-600">{t.area || '—'}</td>
                        <td className="px-4 py-3">
                          {t._shift ? (
                            <span className="inline-flex px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-purple-100 text-purple-700 border border-purple-200">
                              {t._shift.nombre}
                            </span>
                          ) : (
                            <span className="text-xs text-slate-400 italic">General (Sin Turno)</span>
                          )}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-slate-600">{t._assign?.fechaInicio || '—'}</td>
                        <td className="px-4 py-3 font-mono text-xs text-slate-600">{t._assign?.fechaFin || 'Indefinido'}</td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => {
                              setAssigningWorker(t);
                              setShowAssignModal(true);
                            }}
                            className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs rounded-lg transition-colors"
                          >
                            🔄 Asignar Turno
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════
          TAB: CREACIÓN DE TURNOS
      ════════════════════════════════ */}
      {activeTab === 'turnos' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center flex-wrap gap-3">
            <h3 className="font-black text-slate-800 text-base">Configuración de Turnos de la Empresa</h3>
            <button
              onClick={() => {
                setEditingShift(null);
                setShowShiftModal(true);
              }}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 shadow-sm transition-all active:scale-95"
            >
              ➕ Nuevo Turno
            </button>
          </div>

          {/* Grid de Turnos */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {turnosFiltrados.map(s => {
              const activeDays = Object.entries(s.dias || {}).filter(([_, d]) => d.activo);
              return (
                <div key={s.id} className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm hover:shadow-md transition-all flex flex-col justify-between">
                  <div>
                    <div className="flex justify-between items-start">
                      <div>
                        <h4 className="font-black text-slate-800 text-base leading-snug">{s.nombre}</h4>
                        <span className="inline-block mt-1 text-[9px] font-black uppercase tracking-wider bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
                          {s.tipo}
                        </span>
                      </div>
                      <span className="text-[10px] text-slate-400 font-mono">Tolerancia: {s.toleranciaEntradaMins}m</span>
                    </div>

                    {/* Timeline de días activos */}
                    <div className="mt-4 space-y-2">
                      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Horarios del Turno</p>
                      <div className="grid grid-cols-7 gap-1">
                        {['L','M','X','J','V','S','D'].map((dName, idx) => {
                          const keys = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'];
                          const dayKey = keys[idx];
                          const config = s.dias?.[dayKey];
                          return (
                            <div
                              key={dName}
                              className={`aspect-square rounded-lg flex items-center justify-center text-[10px] font-bold border transition-colors ${
                                config?.activo ? 'bg-purple-50 border-purple-200 text-purple-700' : 'bg-slate-50 border-slate-200 text-slate-300'
                              }`}
                              title={config?.activo ? `${config.entrada} - ${config.salida} (${config.colacionMins}m break)` : 'Día Libre'}
                            >
                              {dName}
                            </div>
                          );
                        })}
                      </div>

                      <div className="divide-y divide-slate-100 max-h-36 overflow-y-auto mt-2 pr-1">
                        {activeDays.map(([dayKey, conf]) => (
                          <div key={dayKey} className="flex justify-between items-center py-1.5 text-xs">
                            <span className="capitalize font-semibold text-slate-700">{dayKey.replace('miercoles','miércoles').replace('sabado','sábado')}</span>
                            <span className="font-mono text-slate-500">
                              {conf.entrada} - {conf.salida} <span className="text-[10px] text-slate-400">({conf.colacionMins}m col.)</span>
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-2 mt-5 pt-4 border-t border-slate-100">
                    <button
                      onClick={() => {
                        setEditingShift(s);
                        setShowShiftModal(true);
                      }}
                      className="flex-1 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-all"
                    >
                      ✏️ Editar
                    </button>
                    <button
                      onClick={() => setConfirmDeleteShift(s)}
                      className="px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-500 rounded-xl transition-all"
                      title="Eliminar turno"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              );
            })}

            {turnosFiltrados.length === 0 && (
              <div className="col-span-full py-16 text-center text-slate-400 bg-white border border-slate-200 rounded-2xl">
                <p className="text-sm font-semibold">Sin turnos creados. Comienza agregando uno nuevo.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ════════════════════════════════
          TAB: TRABAJADORES CRUD (REUSED)
      ════════════════════════════════ */}
      {activeTab === 'trabajadores' && (
        <div className="bg-slate-50/50 rounded-2xl p-2 border border-slate-200/60 shadow-sm">
          <TrabajadoresSection />
        </div>
      )}

      {/* ════════════════════════════════
          TAB: VACACIONES
      ════════════════════════════════ */}
      {activeTab === 'vacaciones' && (
        <VacacionesTabContent
          vacaciones={vacaciones}
          trabajadores={trabajadores}
          empresaId={empresaId}
          onSolicitar={() => setShowVacacionModal(true)}
          onAprobar={handleAprobarVacacion}
          onRechazar={handleRechazarVacacion}
        />
      )}

      {activeTab === 'ausencias' && (
        <AusenciasTabContent
          ausencias={ausencias}
          trabajadores={trabajadores}
          onAdd={() => { setEditingAusencia(null); setShowAusenciaModal(true); }}
          onEdit={(a) => { setEditingAusencia(a); setShowAusenciaModal(true); }}
          onDelete={handleDeleteAusencia}
        />
      )}

      {/* ========================================================
          MODALS & OVERLAYS
          ======================================================== */}

      {/* Modal Creación/Edición Turno */}
      {showShiftModal && (
        <ShiftModal
          isOpen={showShiftModal}
          onClose={() => {
            setShowShiftModal(false);
            setEditingShift(null);
          }}
          onSave={handleSaveShift}
          editData={editingShift}
        />
      )}

      {/* Confirmación Eliminar Turno */}
      <ConfirmDialog
        isOpen={!!confirmDeleteShift}
        onClose={() => setConfirmDeleteShift(null)}
        onConfirm={handleDeleteShift}
        nombre={confirmDeleteShift ? `el turno "${confirmDeleteShift.nombre}"` : ''}
      />

      {/* Modal Asignar Turno */}
      {showAssignModal && assigningWorker && (
        <AssignShiftModal
          isOpen={showAssignModal}
          onClose={() => {
            setShowAssignModal(false);
            setAssigningWorker(null);
          }}
          worker={assigningWorker}
          turnos={turnos}
          currentAssignment={asignaciones.find(a => a.trabajadorId === assigningWorker.id && a.activo)}
          onSave={handleAssignShift}
        />
      )}

      {/* Modal Edición Marcación (Jornadas) */}
      {editMarcacionModal && (
        <EditMarcacionModal
          isOpen={!!editMarcacionModal}
          onClose={() => setEditMarcacionModal(null)}
          item={editMarcacionModal}
          onSave={handleSaveEditMarcacion}
          isAdmin={isUserAdmin}
          onTriggerEdit={(diaKey, r) => {
            setEditMarcacionModal({
              nombre: editMarcacionModal.nombre,
              diaKey: diaKey,
              docId: editMarcacionModal.docId,
              trabajadorUid: editMarcacionModal.trabajadorUid,
              entrada: r.entrada ? fmtHora(r.entrada) : '',
              salida: r.salida ? fmtHora(r.salida) : '',
              estadoJornada: r.estadoJornada || 'presente',
              modificaciones: editMarcacionModal.modificaciones || []
            });
          }}
          onTriggerDeleteDay={async (diaKey) => {
            if (!confirm(`¿Está seguro de eliminar la marcación del día ${diaKey}?`)) return;
            try {
              const ref = doc(db, 'empresas', empresaId, 'asistencia', editMarcacionModal.docId);
              const snap = await getDoc(ref);
              if (!snap.exists()) return;
              const data = snap.data();

              const currentReg = data.registros?.[diaKey] || {};
              const updatedReg = {
                ...data.registros,
                [diaKey]: {
                  ...currentReg,
                  entrada: null,
                  salida: null,
                  estadoJornada: 'libre',
                  horasTrabajadas: 0,
                  horasExtra: 0
                }
              };

              const modLog = {
                campo: `registros.${diaKey}`,
                valorAntes: { entrada: currentReg.entrada || null, salida: currentReg.salida || null, estadoJornada: currentReg.estadoJornada || null },
                valorDespues: { entrada: null, salida: null, estadoJornada: 'libre' },
                justificacion: 'Eliminación manual por Administrador',
                modificadoPor: auth.currentUser?.email || 'Admin',
                timestamp: new Date()
              };

              await updateDoc(ref, {
                registros: updatedReg,
                modificaciones: [...(data.modificaciones || []), modLog]
              });

              setEditMarcacionModal({
                ...editMarcacionModal,
                registros: updatedReg,
                modificaciones: [...(data.modificaciones || []), modLog]
              });
              alert('Marcación del día eliminada con éxito.');
            } catch (e) {
              alert('Error al eliminar marcación: ' + e.message);
            }
          }}
        />
      )}

      {/* Modal Solicitar Vacaciones */}
      {showVacacionModal && (
        <SolicitarVacacionesModal
          isOpen={showVacacionModal}
          onClose={() => setShowVacacionModal(false)}
          trabajadores={trabajadores}
          onSave={handleSaveVacacion}
        />
      )}

      {/* Modal Ausencias */}
      {showAusenciaModal && (
        <AusenciaModal
          isOpen={showAusenciaModal}
          onClose={() => {
            setShowAusenciaModal(false);
            setEditingAusencia(null);
          }}
          editData={editingAusencia}
          trabajadores={trabajadores}
        />
      )}
    </div>
  );
}

// ==========================================
// SUB-COMPONENTS
// ==========================================

const HORAS_INTERVALO = (() => {
  const options = [];
  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m += 15) {
      const hh = String(h).padStart(2, '0');
      const mm = String(m).padStart(2, '0');
      const ampm = h >= 12 ? 'p.m.' : 'a.m.';
      const hour12 = h % 12 === 0 ? 12 : h % 12;
      const label = `${String(hour12).padStart(2, '0')}:${mm} ${ampm}`;
      options.push({ value: `${hh}:${mm}`, label });
    }
  }
  return options;
})();

function ShiftModal({ isOpen, onClose, onSave, editData }) {
  const [nombre, setNombre] = useState('');
  const [tipo, setTipo] = useState('semanal');
  const [toleranciaEntradaMins, setTolerancia] = useState(10);
  const [dias, setDias] = useState(() => {
    const empty = {};
    DIAS_SEMANA.forEach(d => {
      empty[d.key] = { activo: true, entrada: '09:00', salida: '18:00', colacionMins: 60 };
    });
    return empty;
  });

  useEffect(() => {
    if (editData) {
      setNombre(editData.nombre || '');
      setTipo(editData.tipo || 'semanal');
      setTolerancia(editData.toleranciaEntradaMins ?? 10);
      if (editData.dias) {
        setDias(editData.dias);
      }
    }
  }, [editData]);

  const setDayVal = (dayKey, field, val) => {
    setDias(prev => ({
      ...prev,
      [dayKey]: {
        ...prev[dayKey],
        [field]: val
      }
    }));
  };

  const duplicarHorario = (fromDayKey) => {
    const sourceConfig = dias[fromDayKey];
    if (!sourceConfig) return;

    setDias(prev => {
      const next = { ...prev };
      Object.keys(next).forEach(dayKey => {
        if (next[dayKey].activo) {
          next[dayKey] = {
            ...next[dayKey],
            entrada: sourceConfig.entrada,
            salida: sourceConfig.salida,
            colacionMins: sourceConfig.colacionMins
          };
        }
      });
      return next;
    });
  };

  const getOptionsForVal = (val) => {
    if (!val) return HORAS_INTERVALO;
    const exists = HORAS_INTERVALO.some(opt => opt.value === val);
    if (exists) return HORAS_INTERVALO;

    const parts = val.split(':');
    if (parts.length === 2) {
      const h = parseInt(parts[0]);
      const m = parseInt(parts[1]);
      if (!isNaN(h) && !isNaN(m)) {
        const hh = String(h).padStart(2, '0');
        const mm = String(m).padStart(2, '0');
        const ampm = h >= 12 ? 'p.m.' : 'a.m.';
        const hour12 = h % 12 === 0 ? 12 : h % 12;
        const label = `${String(hour12).padStart(2, '0')}:${mm} ${ampm}`;
        const newOpt = { value: `${hh}:${mm}`, label };
        return [...HORAS_INTERVALO, newOpt].sort((a, b) => a.value.localeCompare(b.value));
      }
    }
    return HORAS_INTERVALO;
  };

  const handleSave = () => {
    if (!nombre.trim()) {
      alert('El nombre del turno es obligatorio.');
      return;
    }
    onSave({ nombre, tipo, toleranciaEntradaMins, dias });
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={editData ? 'Editar Turno' : 'Nuevo Turno'} subtitle="Definición de jornada y horarios semanales">
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-[11px] font-black text-slate-500 uppercase tracking-widest mb-1.5">Nombre del Turno</label>
            <input className={inp} placeholder="Ej: Oficina L-V" value={nombre} onChange={e => setNombre(e.target.value)} />
          </div>
          <div>
            <label className="block text-[11px] font-black text-slate-500 uppercase tracking-widest mb-1.5">Tipo de Turno</label>
            <select className={inp} value={tipo} onChange={e => setTipo(e.target.value)}>
              <option value="semanal">Semanal Estándar</option>
              <option value="rotativo">Rotativo</option>
              <option value="mensual">Mensual</option>
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-black text-slate-500 uppercase tracking-widest mb-1.5">Tolerancia Entrada (Mins)</label>
            <input type="number" className={inp} placeholder="10" value={toleranciaEntradaMins} onChange={e => setTolerancia(e.target.value)} />
          </div>
        </div>

        {/* Schedule grid */}
        <div className="mt-4 border border-slate-200 rounded-xl overflow-hidden">
          <div className="bg-slate-50 px-4 py-2 border-b border-slate-200 flex justify-between text-[10px] font-black text-slate-400 uppercase tracking-widest">
            <span className="w-24">Día</span>
            <span className="w-16 text-center">Activo</span>
            <span className="flex-1 text-center">Horario Entrada/Salida</span>
            <span className="w-24 text-center">Colación (Mins)</span>
            <span className="w-24 text-center">Acciones</span>
          </div>

          <div className="divide-y divide-slate-100 bg-white">
            {DIAS_SEMANA.map(day => {
              const config = dias[day.key] || { activo: false, entrada: '09:00', salida: '18:00', colacionMins: 60 };
              const optionsEntrada = getOptionsForVal(config.entrada);
              const optionsSalida = getOptionsForVal(config.salida);

              return (
                <div key={day.key} className="px-4 py-3 flex items-center justify-between gap-4">
                  <span className="w-24 font-bold text-slate-700 text-xs">{day.label}</span>

                  <div className="w-16 flex justify-center">
                    <input
                      type="checkbox"
                      checked={config.activo}
                      onChange={e => setDayVal(day.key, 'activo', e.target.checked)}
                      className="w-4 h-4 rounded text-purple-600 focus:ring-purple-500 border-slate-300"
                    />
                  </div>

                  <div className="flex-1 flex items-center justify-center gap-2">
                    <select
                      disabled={!config.activo}
                      value={config.entrada || '09:00'}
                      onChange={e => setDayVal(day.key, 'entrada', e.target.value)}
                      className="px-2 py-1.5 text-xs border rounded-lg focus:outline-none focus:border-purple-400 disabled:bg-slate-50 bg-white cursor-pointer"
                    >
                      {optionsEntrada.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                    <span className="text-slate-400 text-xs">a</span>
                    <select
                      disabled={!config.activo}
                      value={config.salida || '18:00'}
                      onChange={e => setDayVal(day.key, 'salida', e.target.value)}
                      className="px-2 py-1.5 text-xs border rounded-lg focus:outline-none focus:border-purple-400 disabled:bg-slate-50 bg-white cursor-pointer"
                    >
                      {optionsSalida.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </div>

                  <div className="w-24">
                    <input
                      type="number"
                      disabled={!config.activo}
                      placeholder="60"
                      value={config.colacionMins ?? 60}
                      onChange={e => setDayVal(day.key, 'colacionMins', parseInt(e.target.value) || 0)}
                      className="w-full px-2 py-1.5 text-xs border rounded-lg text-center focus:outline-none focus:border-purple-400 disabled:bg-slate-50"
                    />
                  </div>

                  <div className="w-24 flex justify-center">
                    {config.activo ? (
                      <button
                        type="button"
                        onClick={() => duplicarHorario(day.key)}
                        className="px-2.5 py-1 bg-purple-50 hover:bg-purple-100 text-purple-600 rounded text-[10px] font-bold transition-all flex items-center gap-1 border border-purple-200 shadow-sm active:scale-95"
                        title="Copiar horario y colación de este día a los demás días seleccionados"
                      >
                        📋 Copiar a seleccionados
                      </button>
                    ) : (
                      <span className="text-[10px] text-slate-300 italic">Inactivo</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-4">
          <button onClick={onClose} className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-semibold rounded-xl">
            Cancelar
          </button>
          <button
            onClick={handleSave}
            className="px-6 py-2 text-white font-bold text-sm rounded-xl"
            style={{ background: 'linear-gradient(135deg, #7c3aed, #4f46e5)' }}
          >
            {editData ? 'Actualizar Turno' : 'Crear Turno'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function AssignShiftModal({ isOpen, onClose, worker, turnos, currentAssignment, onSave }) {
  const [turnoId, setTurnoId] = useState(currentAssignment?.turnoId || '');
  const [fechaInicio, setFechaInicio] = useState(() => {
    const today = new Date().toISOString().split('T')[0];
    return currentAssignment?.fechaInicio || today;
  });
  const [fechaFin, setFechaFin] = useState(currentAssignment?.fechaFin || '');

  const handleSave = () => {
    if (!turnoId || !fechaInicio) {
      alert('El turno y la fecha de inicio son obligatorios.');
      return;
    }
    onSave(turnoId, fechaInicio, fechaFin);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Asignar Turno" subtitle={`Vincular turno de trabajo a: ${worker.nombre} ${worker.apellidoPaterno}`}>
      <div className="space-y-4">
        <div>
          <label className="block text-[11px] font-black text-slate-500 uppercase tracking-widest mb-1.5">Seleccionar Turno</label>
          <select className={inp} value={turnoId} onChange={e => setTurnoId(e.target.value)}>
            <option value="">Seleccionar turno de la empresa...</option>
            {turnos.map(t => (
              <option key={t.id} value={t.id}>{t.nombre} ({t.tipo})</option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-[11px] font-black text-slate-500 uppercase tracking-widest mb-1.5">Fecha de Inicio</label>
            <input type="date" className={inp} value={fechaInicio} onChange={e => setFechaInicio(e.target.value)} />
          </div>
          <div>
            <label className="block text-[11px] font-black text-slate-500 uppercase tracking-widest mb-1.5">Fecha de Término (Opcional)</label>
            <input type="date" className={inp} value={fechaFin} onChange={e => setFechaFin(e.target.value)} />
          </div>
        </div>

        {currentAssignment && (
          <div className="p-3 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl text-xs font-semibold">
            ⚠️ El trabajador ya tiene el turno "{turnos.find(t => t.id === currentAssignment.turnoId)?.nombre || ''}" asignado. Al guardar esta nueva asignación, la anterior se marcará como finalizada.
          </div>
        )}

        <div className="flex justify-end gap-2 pt-4">
          <button onClick={onClose} className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-semibold rounded-xl">
            Cancelar
          </button>
          <button
            onClick={handleSave}
            className="px-6 py-2 text-white font-bold text-sm rounded-xl"
            style={{ background: 'linear-gradient(135deg, #7c3aed, #4f46e5)' }}
          >
            Guardar Asignación
          </button>
        </div>
      </div>
    </Modal>
  );
}

function EditMarcacionModal({ isOpen, onClose, item, onSave, isAdmin, onTriggerEdit, onTriggerDeleteDay }) {
  const [entrada, setEntrada] = useState(item.entrada || '');
  const [salida, setSalida] = useState(item.salida || '');
  const [estadoJornada, setEstadoJornada] = useState(item.estadoJornada || 'presente');
  const [justificacion, setJustificacion] = useState('');
  const [error, setError] = useState('');

  const handleSave = () => {
    if (!justificacion.trim()) {
      setError('La justificación es obligatoria para registrar una auditoría válida.');
      return;
    }
    onSave({ entrada, salida, estadoJornada, justificacion });
  };

  const inpClass = 'w-full border-2 border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-purple-400 bg-white transition-all';

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={item.calendarView ? `Historial Mensual: ${item.nombre}` : 'Editar Fichaje'} subtitle={item.calendarView ? 'Modificación de asistencia histórica' : `Edición de marca para: ${item.nombre}`}>
      {item.calendarView ? (
        <div className="space-y-4">
          <div className="max-h-96 overflow-y-auto divide-y divide-slate-100 pr-1">
            {Object.entries(item.registros)
              .sort(([a], [b]) => Number(a) - Number(b))
              .map(([diaKey, r]) => (
                <div key={diaKey} className="py-2.5 flex items-center justify-between gap-4 text-xs">
                  <div>
                    <span className="font-bold text-slate-800 text-sm w-8 inline-block">Día {diaKey}</span>
                    <span className="text-slate-400 font-semibold">{r.turnoNombre || 'Sin Turno'}</span>
                  </div>
                  <div className="flex items-center gap-3 font-mono">
                    <span className="text-slate-600">Entrada: {r.entrada ? new Date(r.entrada.toDate ? r.entrada.toDate() : r.entrada).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }) : '—'}</span>
                    <span className="text-slate-600">Salida: {r.salida ? new Date(r.salida.toDate ? r.salida.toDate() : r.salida).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }) : '—'}</span>
                    {r.horasTrabajadas > 0 && (
                      <span className="font-bold text-emerald-600">({r.horasTrabajadas} hrs)</span>
                    )}
                    {isAdmin && (
                      <div className="flex gap-1 ml-2">
                        <button
                          onClick={() => onTriggerEdit(diaKey, r)}
                          className="p-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 rounded transition-colors"
                          title="Editar este día"
                        >
                          ✏️
                        </button>
                        {(r.entrada || r.salida || r.estadoJornada !== 'libre') && (
                          <button
                            onClick={() => onTriggerDeleteDay(diaKey)}
                            className="p-1 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded transition-colors"
                            title="Eliminar marca del día"
                          >
                            🗑️
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
          </div>

          <div className="pt-4 border-t border-slate-200">
            <h4 className="font-bold text-slate-800 text-xs mb-2">Registro de Auditoría de Cambios ({item.modificaciones.length})</h4>
            <div className="max-h-36 overflow-y-auto bg-slate-50 border border-slate-200 rounded-xl p-3 divide-y divide-slate-200">
              {item.modificaciones.map((m, i) => (
                <div key={i} className="py-2 text-[11px] first:pt-0 last:pb-0">
                  <p className="font-semibold text-slate-700">{m.justificacion}</p>
                  <p className="text-slate-400 mt-0.5">Modificado por {m.modificadoPor} el {m.timestamp?.toDate ? m.timestamp.toDate().toLocaleDateString('es-CL') : 'recientemente'}</p>
                </div>
              ))}
              {item.modificaciones.length === 0 && (
                <p className="text-xs text-slate-400 text-center py-4">No se registran cambios de auditoría.</p>
              )}
            </div>
          </div>

          <div className="flex justify-end pt-4">
            <button onClick={onClose} className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-sm rounded-xl">
              Cerrar
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] font-black text-slate-500 uppercase tracking-widest mb-1.5">Hora Entrada</label>
              <input type="time" className={inpClass} value={entrada} onChange={e => setEntrada(e.target.value)} />
            </div>
            <div>
              <label className="block text-[11px] font-black text-slate-500 uppercase tracking-widest mb-1.5">Hora Salida</label>
              <input type="time" className={inpClass} value={salida} onChange={e => setSalida(e.target.value)} />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-black text-slate-500 uppercase tracking-widest mb-1.5">Estado de Jornada</label>
            <select className={inpClass} value={estadoJornada} onChange={e => setEstadoJornada(e.target.value)}>
              <option value="presente">Presente</option>
              <option value="retraso">Retraso</option>
              <option value="inasistencia">Inasistencia</option>
              <option value="vacaciones">Vacaciones</option>
              <option value="licencia">Licencia</option>
              <option value="libre">Libre / Descanso</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-black text-slate-500 uppercase tracking-widest mb-1.5">
              Justificación de la Modificación <span className="text-red-400">*</span>
            </label>
            <textarea
              className={inpClass + ' resize-none'}
              rows={3}
              placeholder="Ej: Trabajador olvidó registrar salida debido a corte de luz."
              value={justificacion}
              onChange={e => {
                setJustificacion(e.target.value);
                setError('');
              }}
            />
            <p className="text-[10px] text-slate-400 mt-1">Este log es requerido por la Dirección del Trabajo (DT) para validar modificaciones manuales.</p>
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs font-semibold rounded-xl">
              ❌ {error}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-4">
            <button onClick={onClose} className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-semibold rounded-xl">
              Cancelar
            </button>
            <button
              onClick={handleSave}
              className="px-6 py-2 text-white font-bold text-sm rounded-xl"
              style={{ background: 'linear-gradient(135deg, #7c3aed, #4f46e5)' }}
            >
              Guardar Cambios
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function VacacionesTabContent({ vacaciones, trabajadores, empresaId, onSolicitar, onAprobar, onRechazar }) {
  const [filtroEstado, setFiltroEstado] = useState('todos');
  const [busqueda, setBusqueda] = useState('');

  // 1. Calculations for KPIs
  const now = new Date();
  const currentYearStr = String(now.getFullYear());
  const currentMonthStr = String(now.getMonth() + 1).padStart(2, '0');

  const diasSolicitadosMes = vacaciones
    .filter(v => v.desde.startsWith(`${currentYearStr}-${currentMonthStr}`) && (v.estado === 'pendiente' || v.estado === 'aprobado'))
    .reduce((acc, v) => acc + (v.diasSolicitados || 0), 0);

  const diasPorAutorizar = vacaciones
    .filter(v => v.estado === 'pendiente')
    .reduce((acc, v) => acc + (v.diasSolicitados || 0), 0);

  const diasAprobadosAnio = vacaciones
    .filter(v => v.desde.startsWith(currentYearStr) && v.estado === 'aprobado')
    .reduce((acc, v) => acc + (v.diasSolicitados || 0), 0);

  // 2. Filter requests list
  const filteredVacaciones = vacaciones.filter(v => {
    const q = busqueda.toLowerCase();
    const matchesSearch = !busqueda || v.trabajadorNombre.toLowerCase().includes(q);
    const matchesEstado = filtroEstado === 'todos' || v.estado === filtroEstado;
    return matchesSearch && matchesEstado;
  });

  return (
    <div className="space-y-6">
      {/* ── KPI CARDS ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Card 1 */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-500 to-green-600 p-5 text-white shadow-md shadow-emerald-100/50">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-emerald-100/80">Días Solicitados del Mes</p>
              <h4 className="text-3xl font-black mt-2 tracking-tight">{diasSolicitadosMes}</h4>
            </div>
            <div className="p-2 bg-white/10 rounded-xl">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
          </div>
          <div className="absolute right-0 bottom-0 translate-x-4 translate-y-4 w-24 h-24 bg-white/5 rounded-full blur-xl pointer-events-none" />
        </div>

        {/* Card 2 */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-500 to-slate-700 p-5 text-white shadow-md shadow-slate-100/50">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-200/80">Días por Autorizar</p>
              <h4 className="text-3xl font-black mt-2 tracking-tight">{diasPorAutorizar}</h4>
            </div>
            <div className="p-2 bg-white/10 rounded-xl">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
          </div>
          <div className="absolute right-0 bottom-0 translate-x-4 translate-y-4 w-24 h-24 bg-white/5 rounded-full blur-xl pointer-events-none" />
        </div>

        {/* Card 3 */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 p-5 text-white shadow-md shadow-orange-100/50">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-amber-100/80">Días Aprobados este Año</p>
              <h4 className="text-3xl font-black mt-2 tracking-tight">{diasAprobadosAnio}</h4>
            </div>
            <div className="p-2 bg-white/10 rounded-xl">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
          <div className="absolute right-0 bottom-0 translate-x-4 translate-y-4 w-24 h-24 bg-white/5 rounded-full blur-xl pointer-events-none" />
        </div>
      </div>

      {/* ── FILTERS AND ACTION BAR ── */}
      <div className="bg-slate-50/50 border border-slate-200/60 rounded-2xl p-4 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3 flex-1">
          {/* Search */}
          <div className="relative w-full sm:w-64">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z"/>
            </svg>
            <input
              className="w-full pl-9 pr-3 py-2.5 border border-slate-200 rounded-xl text-xs focus:outline-none focus:border-purple-400 bg-white"
              placeholder="Buscar por trabajador..."
              value={busqueda}
              onChange={e => setBusqueda(e.target.value)}
            />
          </div>

          {/* Status Select */}
          <div className="w-full sm:w-44">
            <select
              className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-xs focus:outline-none focus:border-purple-400 bg-white"
              value={filtroEstado}
              onChange={e => setFiltroEstado(e.target.value)}
            >
              <option value="todos">Todos los Estados</option>
              <option value="pendiente">Pendientes</option>
              <option value="aprobado">Aprobados</option>
              <option value="rechazado">Rechazados</option>
            </select>
          </div>
        </div>

        {/* Action Button */}
        <div>
          <button
            onClick={onSolicitar}
            className="w-full sm:w-auto px-5 py-2.5 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-2 shadow-md shadow-purple-100 hover:shadow-lg transition-all"
            style={{ background: 'linear-gradient(135deg, #7c3aed, #4f46e5)' }}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Solicitar Vacaciones
          </button>
        </div>
      </div>

      {/* ── REQUESTS TABLE ── */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[800px]">
            <thead>
              <tr style={{ background: '#1e1b4b' }}>
                {['Trabajador', 'Días Solicitados', 'Días Disponibles', 'Desde', 'Hasta', 'Estado', 'Acciones'].map(h => (
                  <th key={h} className="px-4 py-3.5 text-left text-[11px] font-black text-slate-300 uppercase tracking-widest">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredVacaciones.map(v => {
                const ini = v.trabajadorNombre ? `${v.trabajadorNombre[0]}`.toUpperCase() : 'V';
                return (
                  <tr key={v.id} className="hover:bg-slate-50/50 transition-colors">
                    {/* Trabajador */}
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center font-black text-xs">
                          {ini}
                        </div>
                        <div>
                          <span className="font-bold text-slate-800 text-sm block">{v.trabajadorNombre}</span>
                          {v.observaciones && (
                            <span className="text-[10px] text-slate-400 font-medium block mt-0.5 line-clamp-1 max-w-[200px]" title={v.observaciones}>
                              "{v.observaciones}"
                            </span>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Días Solicitados */}
                    <td className="px-4 py-3.5 font-bold text-slate-700 text-sm">
                      {v.diasSolicitados} {v.diasSolicitados === 1 ? 'día' : 'días'}
                    </td>

                    {/* Días Disponibles */}
                    <td className="px-4 py-3.5 text-slate-500 font-medium text-xs">
                      {v.diasDisponibles ?? 15.0} días
                    </td>

                    {/* Desde */}
                    <td className="px-4 py-3.5 font-semibold text-slate-600 text-xs">
                      {v.desde}
                    </td>

                    {/* Hasta */}
                    <td className="px-4 py-3.5 font-semibold text-slate-600 text-xs">
                      {v.hasta}
                    </td>

                    {/* Estado */}
                    <td className="px-4 py-3.5">
                      {v.estado === 'pendiente' && (
                        <span className="inline-flex px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-100 text-amber-700 border border-amber-200">
                          Pendiente
                        </span>
                      )}
                      {v.estado === 'aprobado' && (
                        <span className="inline-flex px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-700 border border-emerald-200">
                          Aprobado
                        </span>
                      )}
                      {v.estado === 'rechazado' && (
                        <span className="inline-flex px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-rose-100 text-rose-700 border border-rose-200">
                          Rechazado
                        </span>
                      )}
                    </td>

                    {/* Acciones */}
                    <td className="px-4 py-3.5">
                      {v.estado === 'pendiente' ? (
                        <div className="flex gap-2">
                          <button
                            onClick={() => onAprobar(v)}
                            className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-[11px] rounded-lg shadow-sm hover:shadow transition-all"
                          >
                            Aprobar
                          </button>
                          <button
                            onClick={() => onRechazar(v)}
                            className="px-3 py-1.5 bg-rose-500 hover:bg-rose-600 text-white font-bold text-[11px] rounded-lg shadow-sm hover:shadow transition-all"
                          >
                            Rechazar
                          </button>
                        </div>
                      ) : (
                        <span className="text-[11px] text-slate-400 italic">Sin acciones</span>
                      )}
                    </td>
                  </tr>
                );
              })}

              {filteredVacaciones.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-xs font-semibold text-slate-400 bg-slate-50/30">
                    No se encontraron solicitudes de vacaciones.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function SolicitarVacacionesModal({ isOpen, onClose, trabajadores, onSave }) {
  const [trabajadorId, setTrabajadorId] = useState('');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [observaciones, setObservaciones] = useState('');
  
  const diasSolicitados = calcularDiasHabiles(desde, hasta);
  const selectedWorker = trabajadores.find(t => t.id === trabajadorId);
  const diasDisponibles = selectedWorker ? (selectedWorker.diasVacacionesDisponibles ?? 15.0) : 0;

  const handleSave = () => {
    if (!trabajadorId) {
      alert('Debe seleccionar un trabajador.');
      return;
    }
    if (!desde || !hasta) {
      alert('Debe especificar ambas fechas.');
      return;
    }
    if (diasSolicitados <= 0) {
      alert('La fecha de término debe ser posterior a la fecha de inicio y contemplar días hábiles.');
      return;
    }
    
    onSave({
      trabajadorId,
      trabajadorNombre: `${selectedWorker.nombre} ${selectedWorker.apellidoPaterno || ''} ${selectedWorker.apellidoMaterno || ''}`.trim(),
      diasSolicitados,
      diasDisponibles,
      desde,
      hasta,
      observaciones
    });
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Solicitar Vacaciones" subtitle="Crear una nueva solicitud de días libres">
      <div className="space-y-4">
        <div>
          <label className="block text-[11px] font-black text-slate-500 uppercase tracking-widest mb-1.5">Seleccionar Trabajador</label>
          <select 
            className="w-full border-2 border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-purple-400 bg-white" 
            value={trabajadorId} 
            onChange={e => setTrabajadorId(e.target.value)}
          >
            <option value="">Seleccione un trabajador...</option>
            {trabajadores.map(t => (
              <option key={t.id} value={t.id}>
                {t.nombre} {t.apellidoPaterno} - Saldo: {t.diasVacacionesDisponibles ?? 15.0} días
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-[11px] font-black text-slate-500 uppercase tracking-widest mb-1.5">Desde</label>
            <input 
              type="date" 
              className="w-full border-2 border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-purple-400 bg-white" 
              value={desde} 
              onChange={e => setDesde(e.target.value)} 
            />
          </div>
          <div>
            <label className="block text-[11px] font-black text-slate-500 uppercase tracking-widest mb-1.5">Hasta</label>
            <input 
              type="date" 
              className="w-full border-2 border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-purple-400 bg-white" 
              value={hasta} 
              onChange={e => setHasta(e.target.value)} 
            />
          </div>
        </div>

        {desde && hasta && (
          <div className="p-3 bg-purple-50 border border-purple-100 rounded-xl flex items-center justify-between text-xs font-semibold text-purple-950">
            <div>
              <span className="block text-purple-600 uppercase tracking-wider text-[10px] font-black">Cálculo de Días Hábiles</span>
              <span className="text-sm font-bold text-purple-800">{diasSolicitados} días solicitados</span>
            </div>
            {selectedWorker && (
              <div className="text-right">
                <span className="block text-purple-600 uppercase tracking-wider text-[10px] font-black">Saldo Proyectado</span>
                <span className={`text-sm font-bold ${diasDisponibles - diasSolicitados < 0 ? 'text-rose-600' : 'text-purple-800'}`}>
                  {(diasDisponibles - diasSolicitados).toFixed(2)} días
                </span>
              </div>
            )}
          </div>
        )}

        <div>
          <label className="block text-[11px] font-black text-slate-500 uppercase tracking-widest mb-1.5">Observaciones</label>
          <textarea 
            className="w-full border-2 border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-purple-400 bg-white resize-none" 
            rows={3} 
            placeholder="Ej: Vacaciones correspondientes al periodo 2025." 
            value={observaciones} 
            onChange={e => setObservaciones(e.target.value)} 
          />
        </div>

        <div className="flex justify-end gap-2 pt-4">
          <button onClick={onClose} className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-semibold rounded-xl">
            Cancelar
          </button>
          <button
            onClick={handleSave}
            className="px-6 py-2 text-white font-bold text-sm rounded-xl"
            style={{ background: 'linear-gradient(135deg, #7c3aed, #4f46e5)' }}
          >
            Crear Solicitud
          </button>
        </div>
      </div>
    </Modal>
  );
}

function AusenciasTabContent({ ausencias, trabajadores, onAdd, onEdit, onDelete }) {
  const [filtroTipo, setFiltroTipo] = useState('todos');
  const [busqueda, setBusqueda] = useState('');

  const now = new Date();
  const currentYearStr = String(now.getFullYear());
  const currentMonthStr = String(now.getMonth() + 1).padStart(2, '0');
  const currentMonthPrefix = `${currentYearStr}-${currentMonthStr}`;

  const isAusenciaActiva = (a) => {
    if (!a.fechaDesde) return false;
    const start = new Date(a.fechaDesde + 'T00:00:00');
    const end = new Date(start);
    end.setDate(end.getDate() + (Number(a.dias) || 1));
    const normalizedToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return normalizedToday >= start && normalizedToday < end;
  };

  const totalAusenciasMes = ausencias.filter(a => a.fechaDesde && a.fechaDesde.startsWith(currentMonthPrefix)).length;

  const licenciasMedicasActivas = ausencias.filter(a => 
    (a.tipo === 'licencia medica' || a.tipo === 'licencia maternal') && isAusenciaActiva(a)
  ).length;

  const permisosSinGoceActivos = ausencias.filter(a => 
    a.tipo === 'sin goce' && isAusenciaActiva(a)
  ).length;

  const enrichedAusencias = ausencias.map(a => {
    const worker = trabajadores.find(t => t.id === a.trabajadorId);
    return {
      ...a,
      _worker: worker,
      trabajadorNombre: worker ? `${worker.nombre} ${worker.apellidoPaterno}` : 'Trabajador no encontrado'
    };
  });

  const filteredAusencias = enrichedAusencias.filter(a => {
    const nameMatch = !busqueda || a.trabajadorNombre.toLowerCase().includes(busqueda.toLowerCase()) || (a._worker?.rut && a._worker.rut.toLowerCase().includes(busqueda.toLowerCase()));
    const tipoMatch = filtroTipo === 'todos' || a.tipo === filtroTipo;
    return nameMatch && tipoMatch;
  });

  const TIPOS_AUSENCIA = [
    { value: 'permiso con goce', label: 'permiso con goce' },
    { value: 'sin goce', label: 'sin goce' },
    { value: 'licencia medica', label: 'licencia medica' },
    { value: 'licencia maternal', label: 'licencia maternal' },
    { value: 'falta injustificada', label: 'falta injustificada' },
    { value: 'accidente', label: 'accidente' },
  ];

  return (
    <div className="space-y-6">
      {/* ── KPI CARDS ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Card 1 */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 p-5 text-white shadow-md shadow-purple-100/50">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-purple-100/80">Total Ausencias (Este Mes)</p>
              <h4 className="text-3xl font-black mt-2 tracking-tight">{totalAusenciasMes}</h4>
            </div>
            <div className="p-2 bg-white/10 rounded-xl">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
          </div>
          <div className="absolute right-0 bottom-0 translate-x-4 translate-y-4 w-24 h-24 bg-white/5 rounded-full blur-xl pointer-events-none" />
        </div>

        {/* Card 2 */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 p-5 text-white shadow-md shadow-amber-100/50">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-amber-100/80">Licencias Médicas Activas</p>
              <h4 className="text-3xl font-black mt-2 tracking-tight">{licenciasMedicasActivas}</h4>
            </div>
            <div className="p-2 bg-white/10 rounded-xl">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
              </svg>
            </div>
          </div>
          <div className="absolute right-0 bottom-0 translate-x-4 translate-y-4 w-24 h-24 bg-white/5 rounded-full blur-xl pointer-events-none" />
        </div>

        {/* Card 3 */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-rose-500 to-red-600 p-5 text-white shadow-md shadow-rose-100/50">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-rose-100/80">Permisos Sin Goce Activos</p>
              <h4 className="text-3xl font-black mt-2 tracking-tight">{permisosSinGoceActivos}</h4>
            </div>
            <div className="p-2 bg-white/10 rounded-xl">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
          <div className="absolute right-0 bottom-0 translate-x-4 translate-y-4 w-24 h-24 bg-white/5 rounded-full blur-xl pointer-events-none" />
        </div>
      </div>

      {/* ── FILTERS AND ACTION BAR ── */}
      <div className="bg-slate-50/50 border border-slate-200/60 rounded-2xl p-4 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3 flex-1">
          {/* Search */}
          <div className="relative w-full sm:w-64">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z"/>
            </svg>
            <input
              className="w-full pl-9 pr-3 py-2.5 border border-slate-200 rounded-xl text-xs focus:outline-none focus:border-purple-400 bg-white"
              placeholder="Buscar por trabajador o RUT..."
              value={busqueda}
              onChange={e => setBusqueda(e.target.value)}
            />
          </div>

          {/* Type Select */}
          <div className="w-full sm:w-48">
            <select
              className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-xs focus:outline-none focus:border-purple-400 bg-white"
              value={filtroTipo}
              onChange={e => setFiltroTipo(e.target.value)}
            >
              <option value="todos">Todos los Tipos</option>
              {TIPOS_AUSENCIA.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Action Button */}
        <div>
          <button
            onClick={onAdd}
            className="w-full sm:w-auto px-5 py-2.5 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-2 shadow-md shadow-purple-100 hover:shadow-lg transition-all"
            style={{ background: 'linear-gradient(135deg, #7c3aed, #4f46e5)' }}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Registrar Ausencia
          </button>
        </div>
      </div>

      {/* ── AUSENCIAS TABLE ── */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[800px]">
            <thead>
              <tr style={{ background: '#1e1b4b' }}>
                {['Trabajador', 'Tipo', 'Fecha Desde', 'Duración', 'Motivo / Licencia', 'Médico', 'Observaciones', 'Acciones'].map(h => (
                  <th key={h} className="px-4 py-3.5 text-left text-[11px] font-black text-slate-300 uppercase tracking-widest">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredAusencias.map(a => {
                const ini = a.trabajadorNombre ? `${a.trabajadorNombre[0]}`.toUpperCase() : 'T';
                const isLic = a.tipo === 'licencia medica' || a.tipo === 'licencia maternal';
                return (
                  <tr key={a.id} className="hover:bg-slate-50/50 transition-colors">
                    {/* Trabajador */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center font-black text-xs">
                          {ini}
                        </div>
                        <div>
                          <span className="font-bold text-slate-800 text-sm block">{a.trabajadorNombre}</span>
                          {a._worker?.rut && (
                            <span className="text-[10px] text-slate-400 font-mono block mt-0.5">
                              {a._worker.rut}
                            </span>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Tipo */}
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${
                        a.tipo === 'sin goce' ? 'bg-red-100 text-red-700' :
                        a.tipo === 'permiso con goce' ? 'bg-emerald-100 text-emerald-700' :
                        a.tipo?.startsWith('licencia') ? 'bg-amber-100 text-amber-700' :
                        'bg-slate-100 text-slate-700'
                      }`}>
                        {a.tipo}
                      </span>
                    </td>

                    {/* Fecha Desde */}
                    <td className="px-4 py-3 font-semibold text-slate-700 text-xs">
                      {a.fechaDesde ? new Date(a.fechaDesde + 'T00:00:00').toLocaleDateString('es-CL') : '—'}
                    </td>

                    {/* Duración */}
                    <td className="px-4 py-3 text-slate-600 text-xs">
                      {a.medioDia ? (
                        <span className="font-bold text-slate-700">Medio día</span>
                      ) : (
                        <span className="font-bold text-slate-700">{a.dias} {a.dias === 1 ? 'día' : 'días'}</span>
                      )}
                      {a.horaDesde && (
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          {a.horaDesde} ({a.horas}h {a.minutos}m)
                        </div>
                      )}
                    </td>

                    {/* Motivo / Licencia */}
                    <td className="px-4 py-3 text-xs">
                      <div className="font-bold text-slate-700">{a.motivo || '—'}</div>
                      {isLic && a.nroLicencia && (
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          Lic: {a.nroLicencia} {a.esContinuacion && ' (Continuación)'}
                        </div>
                      )}
                    </td>

                    {/* Médico */}
                    <td className="px-4 py-3 text-xs text-slate-600 font-semibold">
                      {isLic ? a.nombreMedico || '—' : '—'}
                    </td>

                    {/* Observaciones */}
                    <td className="px-4 py-3 text-xs text-slate-500 max-w-[200px] truncate" title={a.observaciones}>
                      {a.observaciones || '—'}
                    </td>

                    {/* Acciones */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => onEdit(a)}
                          className="p-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 rounded-lg transition-colors"
                          title="Editar"
                        >
                          ✏️
                        </button>
                        <button
                          onClick={() => onDelete(a)}
                          className="p-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-lg transition-colors"
                          title="Eliminar"
                        >
                          🗑️
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}

              {filteredAusencias.length === 0 && (
                <tr>
                  <td colSpan={8} className="text-center py-8 text-xs font-semibold text-slate-400 bg-slate-50/30">
                    No se encontraron registros de ausencias.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
