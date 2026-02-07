import React, { useState, useEffect } from "react";
import { listActiveProjects, listMachines } from "../lib/db";
import { collection, addDoc, serverTimestamp, doc, getDoc, query, where, orderBy, limit, getDocs } from "firebase/firestore";
import { db } from "../lib/firebase";
import { auth } from "../lib/firebase";
import Paso2Form from './Paso2Form';

function isoToday() {
  return new Date().toISOString().split('T')[0];
}

export default function ReportDetallado() {
  const [projects, setProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState("");
  const [machines, setMachines] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  
  // Estado para QR Scanner
  const [showQRScanner, setShowQRScanner] = useState(false);
  const [qrError, setQrError] = useState('');
  const [currentStep, setCurrentStep] = useState(1);
  
  // ✅ NUEVO: Estado para errores de validación en tiempo real
  const [validationErrors, setValidationErrors] = useState({
    cargaCombustible: '',
    horometro: '',
    kilometraje: '',
    ambosEnCero: ''
  });
  
  const [formData, setFormData] = useState({
    fecha: isoToday(),
    numeroReporte: '',
    machineId: '',
    operador: '',
    rut: '',
    userId: '',
    cargaCombustible: '',
    horometroInicial: '',
    horometroFinal: '',
    kilometrajeInicial: '',
    kilometrajeFinal: '',
    estadoMaquina: 'operativa',
    observaciones: '',
    // Parte 2
    actividadesEfectivas: [{ actividad: '', horaInicio: '08:30', horaFin: '19:00' }], // 8:30 AM - 7:00 PM por defecto
    tiemposNoEfectivos: [{ motivo: '', horaInicio: '', horaFin: '' }],
    tiemposProgramados: {
      charlaSegurid: { horaInicio: '07:00', horaFin: '08:00' },
      inspeccionEquipo: { horaInicio: '08:00', horaFin: '08:30' },
      colacion: { horaInicio: '13:00', horaFin: '14:00' }
    },
    tieneMantenciones: false,
    mantenciones: []
  });

  // ✅ NUEVO: Validar en tiempo real
  useEffect(() => {
    const errors = {
      cargaCombustible: '',
      horometro: '',
      kilometraje: '',
      ambosEnCero: ''
    };

    // Validar carga de combustible
    if (formData.cargaCombustible) {
      const combustible = parseFloat(formData.cargaCombustible);
      if (combustible > 500) {
        errors.cargaCombustible = 'La carga de combustible no puede ser mayor a 500 litros';
      }
    }

    // Validar horómetro
    if (formData.horometroInicial && formData.horometroFinal) {
      const horInicial = parseFloat(formData.horometroInicial);
      const horFinal = parseFloat(formData.horometroFinal);
      
      if (horInicial > horFinal) {
        errors.horometro = 'El Horómetro Inicial debe ser menor o igual que el Final';
      } else {
        const diferencia = horFinal - horInicial;
        if (diferencia >= 12) {
          errors.horometro = 'La diferencia debe ser menor a 12 horas';
        }
      }
    }

    // Validar kilometraje
    if (formData.kilometrajeInicial && formData.kilometrajeFinal) {
      const kmInicial = parseFloat(formData.kilometrajeInicial);
      const kmFinal = parseFloat(formData.kilometrajeFinal);
      
      if (kmInicial > kmFinal) {
        errors.kilometraje = 'El Kilometraje Inicial debe ser menor o igual que el Final';
      } else {
        const diferencia = kmFinal - kmInicial;
        if (diferencia > 500) {
          errors.kilometraje = 'La diferencia debe ser igual o menor a 500 km';
        }
      }
    }

    // ✅ NUEVO: Validar que al menos uno (horómetro O kilometraje) tenga valores distintos de 0
    const horInicial = parseFloat(formData.horometroInicial) || 0;
    const horFinal = parseFloat(formData.horometroFinal) || 0;
    const kmInicial = parseFloat(formData.kilometrajeInicial) || 0;
    const kmFinal = parseFloat(formData.kilometrajeFinal) || 0;
    
    const horometroEnCero = (horInicial === 0 && horFinal === 0);
    const kilometrajeEnCero = (kmInicial === 0 && kmFinal === 0);
    
    if (horometroEnCero && kilometrajeEnCero) {
      errors.ambosEnCero = 'Debe ingresar valores en Horómetro O en Kilometraje (al menos uno debe tener valores distintos de 0)';
    }

    setValidationErrors(errors);
  }, [formData.cargaCombustible, formData.horometroInicial, formData.horometroFinal, formData.kilometrajeInicial, formData.kilometrajeFinal]);

  // Función para generar número de reporte automático basado en la máquina
  const generateReportNumber = async (machine) => {
    try {
      if (!machine) return '';

      console.log("🔍 generateReportNumber recibió máquina:", machine);

      // Usar code si existe, sino usar patente
      const machineIdentifier = machine.code || machine.patente || 'SIN-CODIGO';
      console.log(`✅ Identificador de máquina: "${machineIdentifier}"`);

      // Buscar el último reporte de ESTA máquina específica
      const reportesRef = collection(db, 'reportes_detallados');
      const q = query(
        reportesRef,
        where('machineId', '==', machine.id)
      );

      const querySnapshot = await getDocs(q);
      
      let nextNumber = 1;
      if (!querySnapshot.empty) {
        // Ordenar manualmente en el cliente por fecha de creación
        const machineReports = querySnapshot.docs
          .map(doc => doc.data())
          .filter(report => report.numeroReporte) // Solo reportes con número
          .sort((a, b) => {
            if (a.createdAt && b.createdAt) {
              return b.createdAt.seconds - a.createdAt.seconds;
            }
            return 0;
          });
        
        if (machineReports.length > 0) {
          const lastReport = machineReports[0];
          // Extraer el número del último reporte (ejemplo: "EX-01-005" → 5)
          const match = lastReport.numeroReporte?.match(/(\d+)$/);
          if (match) {
            nextNumber = parseInt(match[1]) + 1;
          }
          console.log(`📊 Último reporte encontrado: ${lastReport.numeroReporte}, próximo número: ${nextNumber}`);
        }
      } else {
        console.log(`📊 No hay reportes previos para esta máquina, iniciando en 001`);
      }

      const reportNumber = `${machineIdentifier}-${String(nextNumber).padStart(3, '0')}`;
      console.log(`📝 Número de reporte generado: ${reportNumber}`);
      return reportNumber;
    } catch (error) {
      console.error('❌ Error generando número de reporte:', error);
      return 'ERROR-001';
    }
  };

  useEffect(() => {
    (async () => {
      const p = await listActiveProjects();
      setProjects(p);
      if (p.length > 0) setSelectedProject(p[0].id);
    })();
  }, []);

  useEffect(() => {
    const loadUserData = async () => {
      const user = auth.currentUser;
      if (user) {
        try {
          const userDocRef = doc(db, "users", user.uid);
          const userDoc = await getDoc(userDocRef);
          
          let userName = '';
          let userRut = '';
          
          if (userDoc.exists()) {
            const userData = userDoc.data();
            
            console.log("🔍 Datos del usuario en Firestore:", userData);
            
            userName = userData.nombre || 
                      userData.nombreCompleto || 
                      userData.name || 
                      userData.fullName ||
                      user.displayName || 
                      '';
            
            userRut = userData.rut || 
                     userData.RUT || 
                     userData.dni || 
                     '';
            
            console.log("✅ Nombre extraído:", userName);
            console.log("✅ RUT extraído:", userRut);
          } else {
            console.log("⚠️ No existe documento de usuario en Firestore, usando datos de Auth");
            userName = user.displayName || user.email?.split('@')[0] || '';
          }

          // No generamos número de reporte aquí, se generará cuando seleccione máquina
          setFormData(prev => ({
            ...prev,
            operador: userName,
            rut: userRut,
            userId: user.uid,
            numeroReporte: '' // Vacío hasta que seleccione máquina
          }));
          
          console.log("✅ Datos de usuario cargados:", { userName, userRut });
        } catch (error) {
          console.error("Error cargando datos del usuario:", error);
          const userName = user.displayName || user.email?.split('@')[0] || '';
          
          setFormData(prev => ({
            ...prev,
            operador: userName,
            rut: '',
            userId: user.uid,
            numeroReporte: ''
          }));
        }
      }
    };

    loadUserData();
  }, []);

  useEffect(() => {
    if (!selectedProject) return;
    (async () => {
      const m = await listMachines(selectedProject);
      console.log("🚜 Máquinas cargadas del proyecto:", m.length);
      console.log("📋 Detalles de máquinas:", m);
      m.forEach(machine => {
        console.log(`  - ${machine.code}: qrCode="${machine.qrCode}", id="${machine.id}"`);
      });
      setMachines(m);
    })();
  }, [selectedProject]);

  useEffect(() => {
    if (!formData.machineId || !selectedProject) return;

    const loadPreviousReport = async () => {
      try {
        const reportesRef = collection(db, 'reportes_detallados');
        const q = query(
          reportesRef,
          where('projectId', '==', selectedProject),
          where('machineId', '==', formData.machineId),
          orderBy('fecha', 'desc'),
          limit(1)
        );

        const querySnapshot = await getDocs(q);
        
        if (!querySnapshot.empty) {
          const lastReport = querySnapshot.docs[0].data();
          
          setFormData(prev => ({
            ...prev,
            horometroInicial: lastReport.horometroFinal || '',
            kilometrajeInicial: lastReport.kilometrajeFinal || ''
          }));
          
          console.log("✅ Valores iniciales cargados del reporte anterior");
        } else {
          console.log("ℹ️ No hay reporte anterior para esta máquina");
        }
      } catch (error) {
        console.error("Error cargando reporte anterior:", error);
      }
    };

    loadPreviousReport();
  }, [formData.machineId, selectedProject]);

  const addActividad = () => {
    // Obtener la última actividad
    const ultimaActividad = formData.actividadesEfectivas[formData.actividadesEfectivas.length - 1];
    // La hora inicial de la nueva actividad es la hora final de la anterior
    const horaInicialNueva = ultimaActividad?.horaFin || '';
    
    setFormData({
      ...formData,
      actividadesEfectivas: [
        ...formData.actividadesEfectivas, 
        { actividad: '', horaInicio: horaInicialNueva, horaFin: '' }
      ]
    });
  };

  const removeActividad = (index) => {
    const newActividades = formData.actividadesEfectivas.filter((_, i) => i !== index);
    setFormData({ ...formData, actividadesEfectivas: newActividades });
  };

  // ✅ Función auxiliar para redondear minutos a intervalos de 15
  const ajustarMinutos = (timeValue) => {
    if (!timeValue || !timeValue.includes(':')) return timeValue;
    
    const [horas, minutos] = timeValue.split(':').map(Number);
    
    // Redondear minutos al intervalo de 15 más cercano
    const minutosValidos = [0, 15, 30, 45];
    let minutoAjustado = minutosValidos[0];
    let menorDiferencia = Math.abs(minutos - minutosValidos[0]);
    
    for (let i = 1; i < minutosValidos.length; i++) {
      const diferencia = Math.abs(minutos - minutosValidos[i]);
      if (diferencia < menorDiferencia) {
        menorDiferencia = diferencia;
        minutoAjustado = minutosValidos[i];
      }
    }
    
    // Si el minuto ingresado ya es válido, no hacer nada
    if (minutosValidos.includes(minutos)) {
      return timeValue;
    }
    
    // Devolver la hora ajustada
    return `${String(horas).padStart(2, '0')}:${String(minutoAjustado).padStart(2, '0')}`;
  };

  const updateActividad = (index, field, value) => {
    const newActividades = [...formData.actividadesEfectivas];
    // Si es un campo de hora, ajustar los minutos
    if ((field === 'horaInicio' || field === 'horaFin') && value) {
      value = ajustarMinutos(value);
    }
    newActividades[index][field] = value;
    setFormData({ ...formData, actividadesEfectivas: newActividades });
  };

  const addTiempoNoEfectivo = () => {
    // Obtener el último tiempo no efectivo
    const ultimoTiempo = formData.tiemposNoEfectivos[formData.tiemposNoEfectivos.length - 1];
    // La hora inicial del nuevo tiempo es la hora final del anterior
    const horaInicialNueva = ultimoTiempo?.horaFin || '';
    
    setFormData({
      ...formData,
      tiemposNoEfectivos: [
        ...formData.tiemposNoEfectivos, 
        { motivo: '', horaInicio: horaInicialNueva, horaFin: '' }
      ]
    });
  };

  const removeTiempoNoEfectivo = (index) => {
    const newTiempos = formData.tiemposNoEfectivos.filter((_, i) => i !== index);
    setFormData({ ...formData, tiemposNoEfectivos: newTiempos });
  };

  const updateTiempoNoEfectivo = (index, field, value) => {
    const newTiempos = [...formData.tiemposNoEfectivos];
    // Si es un campo de hora, ajustar los minutos
    if ((field === 'horaInicio' || field === 'horaFin') && value) {
      value = ajustarMinutos(value);
    }
    newTiempos[index][field] = value;
    setFormData({ ...formData, tiemposNoEfectivos: newTiempos });
  };

  // ✅ Validación antes de continuar al paso 2
  const validatePaso1 = () => {
    const errors = [];
    
    if (formData.cargaCombustible) {
      const combustible = parseFloat(formData.cargaCombustible);
      if (combustible > 500) {
        errors.push('❌ La carga de combustible no puede ser mayor a 500 litros por reporte');
      }
    }
    
    if (formData.horometroInicial && formData.horometroFinal) {
      const horInicial = parseFloat(formData.horometroInicial);
      const horFinal = parseFloat(formData.horometroFinal);
      
      if (horInicial > horFinal) {
        errors.push('❌ El Horómetro Inicial debe ser menor o igual que el Horómetro Final');
      }
      
      const difHorometro = horFinal - horInicial;
      if (difHorometro >= 12) {
        errors.push('❌ La diferencia entre Horómetro Final e Inicial debe ser menor a 12 horas');
      }
    }
    
    if (formData.kilometrajeInicial && formData.kilometrajeFinal) {
      const kmInicial = parseFloat(formData.kilometrajeInicial);
      const kmFinal = parseFloat(formData.kilometrajeFinal);
      
      if (kmInicial > kmFinal) {
        errors.push('❌ El Kilometraje Inicial debe ser menor o igual que el Kilometraje Final');
      }
      
      const difKilometraje = kmFinal - kmInicial;
      if (difKilometraje > 500) {
        errors.push('❌ La diferencia entre Kilometraje Final e Inicial debe ser igual o menor a 500 km');
      }
    }
    
    // ✅ NUEVO: Validar que al menos uno (horómetro O kilometraje) tenga valores distintos de 0
    const horInicial = parseFloat(formData.horometroInicial) || 0;
    const horFinal = parseFloat(formData.horometroFinal) || 0;
    const kmInicial = parseFloat(formData.kilometrajeInicial) || 0;
    const kmFinal = parseFloat(formData.kilometrajeFinal) || 0;
    
    const horometroEnCero = (horInicial === 0 && horFinal === 0);
    const kilometrajeEnCero = (kmInicial === 0 && kmFinal === 0);
    
    if (horometroEnCero && kilometrajeEnCero) {
      errors.push('❌ Debe ingresar valores en Horómetro O en Kilometraje (al menos uno debe tener valores distintos de 0)');
    }
    
    return errors;
  };

  const handleNextStep = (e) => {
    e.preventDefault();
    
    if (!selectedProject || !formData.machineId) {
      alert("❌ Selecciona proyecto y máquina");
      return;
    }
    
    const validationErrors = validatePaso1();
    
    if (validationErrors.length > 0) {
      alert('Errores de validación:\n\n' + validationErrors.join('\n'));
      return;
    }
    
    setCurrentStep(2);
    window.scrollTo(0, 0);
  };

  const handleBackStep = () => {
    setCurrentStep(1);
    window.scrollTo(0, 0);
  };

  const handleFinalSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      await addDoc(collection(db, 'reportes_detallados'), {
        projectId: selectedProject,
        ...formData,
        createdAt: serverTimestamp()
      });
      
      alert("✅ Reporte guardado exitosamente");
      
      const user = auth.currentUser;
      let userNombre = '';
      let userRut = '';
      
      if (user) {
        try {
          const userDocRef = doc(db, "users", user.uid);
          const userDoc = await getDoc(userDocRef);
          if (userDoc.exists()) {
            const userData = userDoc.data();
            userNombre = userData.nombre || user.displayName || '';
            userRut = userData.rut || '';
          } else {
            userNombre = user.displayName || user.email?.split('@')[0] || '';
          }
        } catch (error) {
          console.error("Error cargando usuario:", error);
          userNombre = user.displayName || user.email?.split('@')[0] || '';
        }
      }

      // No generamos número de reporte aquí, se generará cuando escanee la siguiente máquina
      setFormData({
        fecha: isoToday(),
        numeroReporte: '', // Vacío hasta que seleccione máquina
        machineId: '',
        operador: userNombre,
        rut: userRut,
        userId: user.uid,
        actividadesEfectivas: [{ actividad: '', horaInicio: '08:30', horaFin: '19:00' }], // 8:30 AM - 7:00 PM por defecto
        tiemposNoEfectivos: [{ motivo: '', horaInicio: '', horaFin: '' }],
        tiemposProgramados: {
          charlaSegurid: { horaInicio: '07:00', horaFin: '08:00' },
          inspeccionEquipo: { horaInicio: '08:00', horaFin: '08:30' },
          colacion: { horaInicio: '13:00', horaFin: '14:00' }
        },
        tieneMantenciones: false,
        mantenciones: [],
        cargaCombustible: '',
        horometroInicial: '',
        horometroFinal: '',
        kilometrajeInicial: '',
        kilometrajeFinal: '',
        estadoMaquina: 'operativa',
        observaciones: ''
      });
      
      setCurrentStep(1);
    } catch (error) {
      console.error("Error:", error);
      alert("❌ Error al guardar");
    } finally {
      setIsLoading(false);
    }
  };

  const selectedMachine = machines.find(m => m.id === formData.machineId);

  const handleQRScan = async (qrCode) => {
    if (!qrCode) return;
    
    console.log("🔍 QR escaneado:", qrCode);
    console.log("📋 Máquinas disponibles:", machines.length);
    console.log("📊 Datos de máquinas:", machines);
    
    setQrError('');
    
    // Buscar máquina con prioridad: qrCode > code > patente
    let machine = null;
    
    // 1. Intentar por qrCode
    machine = machines.find(m => m.qrCode && m.qrCode === qrCode);
    if (machine) {
      console.log(`✅ Máquina encontrada por qrCode:`, machine);
    }
    
    // 2. Si no encontró, intentar por code
    if (!machine) {
      machine = machines.find(m => m.code && m.code === qrCode);
      if (machine) {
        console.log(`✅ Máquina encontrada por code:`, machine);
      }
    }
    
    // 3. Si no encontró, intentar por patente
    if (!machine) {
      machine = machines.find(m => m.patente && m.patente === qrCode);
      if (machine) {
        console.log(`✅ Máquina encontrada por patente:`, machine);
      }
    }
    
    if (machine) {
      // Generar número de reporte basado en esta máquina
      const reportNumber = await generateReportNumber(machine);
      
      setFormData({ 
        ...formData, 
        machineId: machine.id,
        numeroReporte: reportNumber
      });
      setShowQRScanner(false);
      alert(`✅ Máquina seleccionada: ${machine.code || machine.patente}\nReporte: ${reportNumber}`);
    } else {
      console.error(`❌ No se encontró máquina con código: ${qrCode}`);
      console.log("💡 Datos disponibles:", machines.map(m => ({ code: m.code, qrCode: m.qrCode, patente: m.patente })));
      setQrError(`❌ No se encontró máquina con código: ${qrCode}`);
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-4xl mx-auto">
      {currentStep === 1 ? (
        <form onSubmit={handleNextStep}>
          
          {/* Header */}
          <div className="sticky top-0 z-10 bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-lg rounded-xl sm:rounded-2xl -mx-4 sm:-mx-6 lg:-mx-8 mb-6 p-4 sm:p-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs sm:text-sm opacity-90">Paso 1 de 2</div>
                <h1 className="text-xl sm:text-2xl font-black">Reporte Detallado</h1>
              </div>
              <div className="text-right">
                <div className="text-xs sm:text-sm opacity-90">Proyecto</div>
                <select
                  value={selectedProject}
                  onChange={(e) => setSelectedProject(e.target.value)}
                  className="bg-white/20 backdrop-blur-sm text-white text-xs sm:text-sm font-bold px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg border-2 border-white/30 hover:bg-white/30 transition-all"
                >
                  {projects.map(p => (
                    <option key={p.id} value={p.id} className="text-slate-900">
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Contenido del formulario */}
          <div className="space-y-4 sm:space-y-6">
            
            {/* Info Básica */}
            <Section 
              title="Información Básica" 
              icon={
                <svg className="w-4 h-4 sm:w-5 sm:h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              }
            >
              <div className="space-y-3 sm:space-y-4">
                <div>
                  <label className="block text-xs sm:text-sm font-bold text-slate-700 mb-2">
                    Número de Reporte
                    <span className="ml-2 text-[10px] text-blue-600">(Generado automáticamente)</span>
                  </label>
                  <input
                    type="text"
                    value={formData.numeroReporte}
                    readOnly
                    className="input-modern w-full text-sm sm:text-base bg-slate-100 cursor-not-allowed font-semibold"
                  />
                </div>
                
                <InputField
                  label="Fecha"
                  type="date"
                  value={formData.fecha}
                  onChange={(e) => setFormData({ ...formData, fecha: e.target.value })}
                  required
                />
              </div>
            </Section>

            {/* Selección de Máquina */}
            <Section 
              title="Selección de Máquina" 
              icon={
                <svg className="w-4 h-4 sm:w-5 sm:h-5 text-orange-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                </svg>
              }
            >
              <div className="space-y-3 sm:space-y-4">
                
                {/* Botón de escaneo QR */}
                <button
                  type="button"
                  onClick={() => setShowQRScanner(true)}
                  className="w-full px-4 sm:px-6 py-4 sm:py-5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-bold rounded-xl transition-all shadow-lg hover:shadow-xl text-base sm:text-lg"
                >
                  <div className="flex items-center justify-center gap-3">
                    <svg className="w-7 h-7 sm:w-8 sm:h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                    </svg>
                    <span>
                      {formData.machineId ? 'Cambiar Máquina (Escanear QR)' : 'Escanear Código QR de Máquina'}
                    </span>
                  </div>
                </button>
                
                {/* Máquina seleccionada */}
                {selectedMachine && (
                  <div className="p-4 sm:p-5 bg-gradient-to-br from-purple-50 to-indigo-50 rounded-xl border-2 border-purple-300 shadow-md">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-600 to-indigo-600 flex items-center justify-center shadow-lg">
                        <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                      <div className="flex-1">
                        <div className="text-xs font-bold text-purple-600 mb-1">✅ MÁQUINA ESCANEADA</div>
                        <div className="text-xl sm:text-2xl font-black text-purple-900">{selectedMachine.code}</div>
                        <div className="text-sm text-purple-700">{selectedMachine.name}</div>
                      </div>
                    </div>
                    
                    <div className="p-3 bg-white rounded-lg border border-purple-200">
                      <div className="text-xs font-bold text-purple-600 mb-1">PATENTE</div>
                      <div className="text-lg font-black text-purple-900">{selectedMachine.patente || 'N/A'}</div>
                    </div>
                  </div>
                )}
              </div>
            </Section>

            {/* Operador */}
            <Section 
              title="Operador" 
              icon={
                <svg className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              }
            >
              <div className="space-y-3 sm:space-y-4">
                <div>
                  <label className="block text-xs sm:text-sm font-bold text-slate-700 mb-2">
                    Nombre Completo
                    <span className="ml-2 text-[10px] text-emerald-600">(Desde tu perfil)</span>
                  </label>
                  <input
                    type="text"
                    value={formData.operador}
                    readOnly
                    className="input-modern w-full text-sm sm:text-base bg-slate-100 cursor-not-allowed font-semibold"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs sm:text-sm font-bold text-slate-700 mb-2">
                    RUT
                    <span className="ml-2 text-[10px] text-emerald-600">(Desde tu perfil)</span>
                  </label>
                  <input
                    type="text"
                    value={formData.rut}
                    readOnly
                    className="input-modern w-full text-sm sm:text-base bg-slate-100 cursor-not-allowed font-semibold"
                    required
                  />
                </div>
              </div>
            </Section>

            {/* Métricas - REORGANIZADO */}
            <Section 
              title="Combustible y Métricas" 
              icon={
                <svg className="w-4 h-4 sm:w-5 sm:h-5 text-cyan-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              }
            >
              <div className="space-y-3 sm:space-y-4">
                
                {/* Horómetro */}
                <div className="grid grid-cols-2 gap-3">
                  <InputField
                    label="Horómetro Inicial"
                    type="number"
                    value={formData.horometroInicial}
                    onChange={(e) => setFormData({ ...formData, horometroInicial: e.target.value })}
                    placeholder="0"
                    step="0.1"
                  />
                  <InputField
                    label="Horómetro Final"
                    type="number"
                    value={formData.horometroFinal}
                    onChange={(e) => setFormData({ ...formData, horometroFinal: e.target.value })}
                    placeholder="0"
                    step="0.1"
                  />
                </div>
                {/* ✅ Mensaje de error en tiempo real - Horómetro */}
                {validationErrors.horometro && (
                  <div className="flex items-center gap-2 p-2 bg-red-50 border border-red-200 rounded-lg">
                    <svg className="w-4 h-4 text-red-600 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" />
                    </svg>
                    <span className="text-xs font-semibold text-red-700">{validationErrors.horometro}</span>
                  </div>
                )}
                
                {/* Kilometraje */}
                <div className="grid grid-cols-2 gap-3">
                  <InputField
                    label="Kilometraje Inicial"
                    type="number"
                    value={formData.kilometrajeInicial}
                    onChange={(e) => setFormData({ ...formData, kilometrajeInicial: e.target.value })}
                    placeholder="0"
                    step="0.1"
                  />
                  <InputField
                    label="Kilometraje Final"
                    type="number"
                    value={formData.kilometrajeFinal}
                    onChange={(e) => setFormData({ ...formData, kilometrajeFinal: e.target.value })}
                    placeholder="0"
                    step="0.1"
                  />
                </div>
                {/* ✅ Mensaje de error en tiempo real - Kilometraje */}
                {validationErrors.kilometraje && (
                  <div className="flex items-center gap-2 p-2 bg-red-50 border border-red-200 rounded-lg">
                    <svg className="w-4 h-4 text-red-600 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" />
                    </svg>
                    <span className="text-xs font-semibold text-red-700">{validationErrors.kilometraje}</span>
                  </div>
                )}
                
                {/* Carga Combustible - AL FINAL */}
                <div>
                  <label className="block text-xs sm:text-sm font-bold text-slate-700 mb-2">
                    Carga Combustible (litros)
                    <span className="ml-2 text-[10px] text-slate-500">(Opcional - Máx. 500 litros)</span>
                  </label>
                  <input
                    type="number"
                    value={formData.cargaCombustible}
                    onChange={(e) => setFormData({ ...formData, cargaCombustible: e.target.value })}
                    placeholder="0"
                    step="0.1"
                    max="500"
                    className="input-modern w-full text-sm sm:text-base"
                  />
                </div>
                {/* ✅ Mensaje de error en tiempo real - Combustible */}
                {validationErrors.cargaCombustible && (
                  <div className="flex items-center gap-2 p-2 bg-red-50 border border-red-200 rounded-lg">
                    <svg className="w-4 h-4 text-red-600 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" />
                    </svg>
                    <span className="text-xs font-semibold text-red-700">{validationErrors.cargaCombustible}</span>
                  </div>
                )}
                
                {/* ✅ NUEVO: Mensaje de error global - Ambos en cero */}
                {validationErrors.ambosEnCero && (
                  <div className="flex items-center gap-2 p-3 bg-orange-50 border-2 border-orange-300 rounded-lg">
                    <svg className="w-5 h-5 text-orange-600 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" />
                    </svg>
                    <span className="text-sm font-semibold text-orange-700">{validationErrors.ambosEnCero}</span>
                  </div>
                )}
              </div>
            </Section>

            {/* Estado - Título corregido */}
            <Section 
              title="Máquina" 
              icon={
                <svg className="w-4 h-4 sm:w-5 sm:h-5 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              }
            >
              <div className="space-y-3 sm:space-y-4">
    
                
                <div>
                  <label className="block text-xs sm:text-sm font-bold text-slate-700 mb-2">Observaciones</label>
                  <textarea
                    value={formData.observaciones}
                    onChange={(e) => setFormData({ ...formData, observaciones: e.target.value })}
                    className="input-modern w-full text-sm sm:text-base"
                    rows="4"
                    placeholder="Observaciones generales..."
                  />
                </div>
              </div>
            </Section>

            {/* Botón Siguiente */}
            <button
              type="submit"
              className="w-full py-4 px-6 bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-black rounded-xl shadow-lg hover:shadow-xl transition-all text-base sm:text-lg"
            >
              Continuar al Paso 2 →
            </button>
          </div>
        </form>
      ) : (
        <Paso2Form
          formData={formData}
          setFormData={setFormData}
          onBack={handleBackStep}
          onSubmit={handleFinalSubmit}
          isLoading={isLoading}
          selectedMachine={selectedMachine}
        />
      )}

      {/* Modal QR Scanner */}
      {showQRScanner && (
        <QRScannerModal
          onScan={handleQRScan}
          onClose={() => {
            setShowQRScanner(false);
            setQrError('');
          }}
          error={qrError}
        />
      )}
    </div>
  );
}

// Componentes auxiliares
function Section({ title, icon, children }) {
  return (
    <div className="bg-white rounded-xl sm:rounded-2xl shadow-md border border-slate-200 overflow-hidden">
      <div className="bg-gradient-to-r from-slate-50 to-slate-100 px-3 sm:px-4 py-2.5 sm:py-3 border-b border-slate-200 flex items-center gap-2 sm:gap-3">
        <div className="flex-shrink-0">{icon}</div>
        <h3 className="text-xs sm:text-sm font-black text-slate-900">{title}</h3>
      </div>
      <div className="p-3 sm:p-4">
        {children}
      </div>
    </div>
  );
}

function InputField({ label, ...props }) {
  return (
    <div>
      <label className="block text-xs sm:text-sm font-bold text-slate-700 mb-2">{label}</label>
      <input {...props} className="input-modern w-full text-sm sm:text-base" />
    </div>
  );
}

// Componente QR Scanner Modal
function QRScannerModal({ onScan, onClose, error }) {
  const [manualInput, setManualInput] = useState('');
  const [scanning, setScanning] = useState(true);
  const videoRef = React.useRef(null);
  const streamRef = React.useRef(null);

  useEffect(() => {
    if (scanning) {
      startCamera();
    }
    
    return () => {
      stopCamera();
    };
  }, [scanning]);

  const startCamera = async () => {
    try {
      const constraints = {
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      };
      
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      
      scanQRCode();
    } catch (err) {
      console.error('Error accediendo a la cámara:', err);
      alert('No se pudo acceder a la cámara. Usa entrada manual.');
      setScanning(false);
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
  };

  const scanQRCode = async () => {
    if (!videoRef.current || !scanning) return;

    try {
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      
      const video = videoRef.current;
      
      if (video.readyState === video.HAVE_ENOUGH_DATA) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
        
        if (window.jsQR) {
          const code = window.jsQR(imageData.data, imageData.width, imageData.height, {
            inversionAttempts: "dontInvert",
          });
          
          if (code) {
            console.log("✅ QR detectado:", code.data);
            onScan(code.data);
            setScanning(false);
            stopCamera();
            return;
          }
        }
      }
      
      if (scanning) {
        requestAnimationFrame(scanQRCode);
      }
    } catch (err) {
      console.error('Error escaneando:', err);
      if (scanning) {
        requestAnimationFrame(scanQRCode);
      }
    }
  };

  const handleManualSubmit = () => {
    if (manualInput.trim()) {
      onScan(manualInput.trim());
      setManualInput('');
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-3 sm:p-4">
      <div className="max-w-md w-full bg-white rounded-xl sm:rounded-2xl shadow-2xl overflow-hidden">
        <div className="bg-gradient-to-r from-purple-600 to-indigo-600 text-white p-3 sm:p-4 flex items-center justify-between">
          <div className="flex items-center gap-2 sm:gap-3">
            <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
            </svg>
            <h3 className="font-black text-base sm:text-lg">Escanear QR</h3>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center rounded-full hover:bg-white/20 transition-colors"
          >
            <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-3 sm:p-4 space-y-3 sm:space-y-4">
          {scanning && (
            <div className="relative aspect-square rounded-lg sm:rounded-xl overflow-hidden bg-slate-900">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
              />
              
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-48 h-48 sm:w-64 sm:h-64 border-4 border-purple-500 rounded-2xl shadow-lg shadow-purple-500/50">
                  <div className="absolute top-0 left-0 w-6 h-6 sm:w-8 sm:h-8 border-t-4 border-l-4 border-white rounded-tl-xl"></div>
                  <div className="absolute top-0 right-0 w-6 h-6 sm:w-8 sm:h-8 border-t-4 border-r-4 border-white rounded-tr-xl"></div>
                  <div className="absolute bottom-0 left-0 w-6 h-6 sm:w-8 sm:h-8 border-b-4 border-l-4 border-white rounded-bl-xl"></div>
                  <div className="absolute bottom-0 right-0 w-6 h-6 sm:w-8 sm:h-8 border-b-4 border-r-4 border-white rounded-br-xl"></div>
                </div>
              </div>
              
              <div className="absolute bottom-3 sm:bottom-4 left-0 right-0 text-center px-3">
                <div className="inline-block bg-black/50 backdrop-blur-sm text-white px-3 sm:px-4 py-1.5 sm:py-2 rounded-full text-xs sm:text-sm font-bold">
                  📱 Apunta al código QR
                </div>
              </div>
            </div>
          )}

          <div className="bg-blue-50 border border-blue-200 rounded-lg sm:rounded-xl p-3 sm:p-4">
            <div className="text-xs sm:text-sm text-blue-700 font-semibold mb-2">📸 Instrucciones:</div>
            <ul className="text-[10px] sm:text-xs text-blue-600 space-y-1">
              <li>• Coloca el código QR dentro del marco</li>
              <li>• Mantén el teléfono estable</li>
              <li>• Asegura buena iluminación</li>
            </ul>
          </div>

          <div>
            <div className="text-[10px] sm:text-xs font-bold text-slate-600 mb-2 text-center">
              O ingresa el código manualmente:
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={manualInput}
                onChange={(e) => setManualInput(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleManualSubmit()}
                placeholder="Ej: EX-01, RE-02..."
                className="input-modern flex-1 text-sm sm:text-base"
              />
              <button
                onClick={handleManualSubmit}
                disabled={!manualInput.trim()}
                className="px-3 sm:px-4 py-2 bg-purple-600 text-white font-bold text-sm sm:text-base rounded-lg sm:rounded-xl hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                ✓
              </button>
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border-2 border-red-200 rounded-lg sm:rounded-xl p-3">
              <div className="text-xs sm:text-sm font-bold text-red-700">{error}</div>
              <div className="text-[10px] sm:text-xs text-red-600 mt-1">
                Verifica que el código QR coincida con una máquina registrada
              </div>
            </div>
          )}

          <div className="flex gap-2">
            <button
              onClick={() => setScanning(!scanning)}
              className="flex-1 py-2 sm:py-3 px-3 sm:px-4 bg-slate-100 text-slate-700 font-bold text-xs sm:text-sm rounded-lg sm:rounded-xl hover:bg-slate-200 transition-all"
            >
              {scanning ? '⏸️ Pausar' : '▶️ Iniciar'}
            </button>
            <button
              onClick={onClose}
              className="flex-1 py-2 sm:py-3 px-3 sm:px-4 bg-slate-600 text-white font-bold text-xs sm:text-sm rounded-lg sm:rounded-xl hover:bg-slate-700 transition-all"
            >
              ✕ Cerrar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
