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
  
  const [formData, setFormData] = useState({
    fecha: isoToday(),
    numeroReporte: '',
    machineId: '',
    operador: '',
    rut: '',
    userId: '', // Nuevo: para tracking del usuario
    cargaCombustible: '',
    horometroInicial: '',
    horometroFinal: '',
    kilometrajeInicial: '',
    kilometrajeFinal: '',
    estadoMaquina: 'operativa',
    observaciones: '',
    // Parte 2
    actividadesEfectivas: [{ actividad: '', horaInicio: '', horaFin: '' }],
    tiemposNoEfectivos: [{ motivo: '', horaInicio: '', horaFin: '' }],
    tiemposProgramados: {
      charlaSegurid: { horaInicio: '07:00', horaFin: '08:00' },
      inspeccionEquipo: { horaInicio: '08:00', horaFin: '08:30' },
      colacion: { horaInicio: '13:00', horaFin: '14:00' }
    },
    mantenciones: ''
  });

  // Función para generar número de reporte automático
  const generateReportNumber = async (userName) => {
    try {
      const user = auth.currentUser;
      if (!user) return '';

      console.log("🔍 generateReportNumber recibió userName:", userName);

      // Extraer iniciales del nombre - CORREGIDO
      const nameParts = userName.trim().split(' ').filter(part => part.length > 0);
      
      console.log("📋 Partes del nombre:", nameParts);
      
      let firstInitial = 'X';
      let lastInitial = 'Y';
      
      if (nameParts.length === 1) {
        // Solo un nombre: usar primera y segunda letra
        firstInitial = nameParts[0][0] || 'X';
        lastInitial = nameParts[0][1] || 'Y';
        console.log(`📌 Caso 1 nombre: primera letra="${firstInitial}", segunda letra="${lastInitial}"`);
      } else if (nameParts.length === 2) {
        // Nombre y Apellido
        firstInitial = nameParts[0][0] || 'X';
        lastInitial = nameParts[1][0] || 'Y';
        console.log(`📌 Caso 2 partes: primera de "${nameParts[0]}"="${firstInitial}", primera de "${nameParts[1]}"="${lastInitial}"`);
      } else if (nameParts.length >= 3) {
        // Nombre + Apellido Paterno + Apellido Materno (tomar primer nombre y primer apellido)
        firstInitial = nameParts[0][0] || 'X';
        lastInitial = nameParts[nameParts.length - 2][0] || 'Y'; // Apellido Paterno
        console.log(`📌 Caso 3+ partes: primera de "${nameParts[0]}"="${firstInitial}", primera de "${nameParts[nameParts.length - 2]}"="${lastInitial}"`);
      }

      const initials = firstInitial.toUpperCase() + lastInitial.toUpperCase();
      console.log(`✅ Iniciales finales: "${initials}"`);

      // Buscar el último reporte de este usuario (SIN ÍNDICE)
      const reportesRef = collection(db, 'reportes_detallados');
      const q = query(
        reportesRef,
        where('userId', '==', user.uid)
        // NOTA: Removido orderBy temporalmente para evitar necesidad de índice
      );

      const querySnapshot = await getDocs(q);
      
      let nextNumber = 1;
      if (!querySnapshot.empty) {
        // Ordenar manualmente en el cliente
        const userReports = querySnapshot.docs
          .map(doc => doc.data())
          .filter(report => report.numeroReporte) // Solo reportes con número
          .sort((a, b) => {
            // Ordenar por timestamp si existe
            if (a.createdAt && b.createdAt) {
              return b.createdAt.seconds - a.createdAt.seconds;
            }
            return 0;
          });
        
        if (userReports.length > 0) {
          const lastReport = userReports[0];
          // Extraer el número del formato "XY-###"
          const match = lastReport.numeroReporte?.match(/\d+$/);
          if (match) {
            nextNumber = parseInt(match[0]) + 1;
          }
          console.log(`📊 Último reporte encontrado: ${lastReport.numeroReporte}, próximo número: ${nextNumber}`);
        }
      } else {
        console.log(`📊 No hay reportes previos, iniciando en 001`);
      }

      // Formato: XY-001
      const reportNumber = `${initials}-${String(nextNumber).padStart(3, '0')}`;
      console.log(`📝 Número de reporte generado: ${reportNumber}`);
      return reportNumber;
    } catch (error) {
      console.error('❌ Error generando número de reporte:', error);
      return 'XX-001';
    }
  };

  useEffect(() => {
    (async () => {
      const p = await listActiveProjects();
      setProjects(p);
      if (p.length > 0) setSelectedProject(p[0].id);
    })();
  }, []);

  // Cargar datos del usuario actual y generar número de reporte
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
            
            // DEBUG: Mostrar todos los campos del usuario
            console.log("🔍 Datos del usuario en Firestore:", userData);
            
            // Intentar diferentes campos comunes para el nombre
            userName = userData.nombre || 
                      userData.nombreCompleto || 
                      userData.name || 
                      userData.fullName ||
                      user.displayName || 
                      '';
            
            // Intentar diferentes campos comunes para el RUT
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

          // Generar número de reporte automático
          const reportNumber = await generateReportNumber(userName);

          setFormData(prev => ({
            ...prev,
            operador: userName,
            rut: userRut,
            userId: user.uid,
            numeroReporte: reportNumber
          }));
          
          console.log("✅ Datos de usuario cargados:", { userName, userRut, reportNumber });
        } catch (error) {
          console.error("Error cargando datos del usuario:", error);
          const userName = user.displayName || user.email?.split('@')[0] || '';
          const reportNumber = await generateReportNumber(userName);
          
          setFormData(prev => ({
            ...prev,
            operador: userName,
            rut: '',
            userId: user.uid,
            numeroReporte: reportNumber
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
      setMachines(m);
    })();
  }, [selectedProject]);

  // Cargar horómetro y kilometraje del reporte anterior
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
    setFormData({
      ...formData,
      actividadesEfectivas: [...formData.actividadesEfectivas, { actividad: '', horaInicio: '', horaFin: '' }]
    });
  };

  const removeActividad = (index) => {
    const newActividades = formData.actividadesEfectivas.filter((_, i) => i !== index);
    setFormData({ ...formData, actividadesEfectivas: newActividades });
  };

  const updateActividad = (index, field, value) => {
    const newActividades = [...formData.actividadesEfectivas];
    newActividades[index][field] = value;
    setFormData({ ...formData, actividadesEfectivas: newActividades });
  };

  const addTiempoNoEfectivo = () => {
    setFormData({
      ...formData,
      tiemposNoEfectivos: [...formData.tiemposNoEfectivos, { motivo: '', horaInicio: '', horaFin: '' }]
    });
  };

  const removeTiempoNoEfectivo = (index) => {
    const newTiempos = formData.tiemposNoEfectivos.filter((_, i) => i !== index);
    setFormData({ ...formData, tiemposNoEfectivos: newTiempos });
  };

  const updateTiempoNoEfectivo = (index, field, value) => {
    const newTiempos = [...formData.tiemposNoEfectivos];
    newTiempos[index][field] = value;
    setFormData({ ...formData, tiemposNoEfectivos: newTiempos });
  };

  const handleNextStep = (e) => {
    e.preventDefault();
    if (!selectedProject || !formData.machineId) {
      alert("Selecciona proyecto y máquina");
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
      
      // Reset pero manteniendo datos del usuario y generando nuevo número
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

      // Generar nuevo número de reporte
      const newReportNumber = await generateReportNumber(userNombre);
      
      setFormData({
        fecha: isoToday(),
        numeroReporte: newReportNumber,
        machineId: '',
        operador: userNombre,
        rut: userRut,
        userId: user.uid,
        actividadesEfectivas: [{ actividad: '', horaInicio: '', horaFin: '' }],
        tiemposNoEfectivos: [{ motivo: '', horaInicio: '', horaFin: '' }],
        tiemposProgramados: {
          charlaSegurid: { horaInicio: '07:00', horaFin: '08:00' },
          inspeccionEquipo: { horaInicio: '08:00', horaFin: '08:30' },
          colacion: { horaInicio: '13:00', horaFin: '14:00' }
        },
        mantenciones: '',
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

  // Función para manejar escaneo QR
  const handleQRScan = (qrCode) => {
    if (!qrCode) return;
    
    setQrError('');
    
    const machine = machines.find(m => m.qrCode === qrCode || m.code === qrCode || m.id === qrCode);
    
    if (machine) {
      setFormData({ ...formData, machineId: machine.id });
      setShowQRScanner(false);
      console.log(`✅ Máquina encontrada: ${machine.code} - ${machine.name}`);
    } else {
      setQrError(`❌ No se encontró máquina con QR: ${qrCode}`);
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-4xl mx-auto">
      {currentStep === 1 ? (
        // ========== PASO 1: Formulario Parte 1 ==========
        <form onSubmit={handleNextStep}>
          
          {/* Header */}
          <div className="bg-gradient-to-br from-purple-600 via-purple-700 to-indigo-700 text-white p-4 sm:p-6 shadow-lg sticky top-0 z-10 rounded-t-2xl">
            <div className="flex items-center gap-3 sm:gap-4">
              <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl sm:rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center shadow-lg flex-shrink-0">
                <svg className="w-6 h-6 sm:w-8 sm:h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-black tracking-tight">Reporte Detallado</h1>
                <p className="text-xs sm:text-sm text-purple-100 font-medium">Paso 1: Datos Básicos</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-b-2xl shadow-lg p-4 sm:p-6 space-y-4 sm:space-y-6">
            
            {/* Proyecto */}
            <Section 
              title="Proyecto" 
              icon={
                <svg className="w-4 h-4 sm:w-5 sm:h-5 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
              }
            >
              <select
                value={selectedProject}
                onChange={(e) => setSelectedProject(e.target.value)}
                className="input-modern w-full text-sm sm:text-base"
                required
              >
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </Section>

            {/* Datos Básicos */}
            <Section 
              title="Información General" 
              icon={
                <svg className="w-4 h-4 sm:w-5 sm:h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              }
            >
              <div className="space-y-3 sm:space-y-4">
                <InputField
                  label="Fecha"
                  type="date"
                  value={formData.fecha}
                  onChange={(e) => setFormData({ ...formData, fecha: e.target.value })}
                  required
                />
                
                <div>
                  <label className="block text-xs sm:text-sm font-bold text-slate-700 mb-2">
                    N° de Reporte
                    <span className="ml-2 text-[10px] text-blue-600">(Auto-generado)</span>
                  </label>
                  <input
                    type="text"
                    value={formData.numeroReporte}
                    readOnly
                    className="input-modern w-full text-sm sm:text-base bg-slate-100 cursor-not-allowed font-bold text-purple-700"
                  />
                  {formData.operador && (
                    <div className="mt-1 text-[10px] text-slate-500">
                      Generado desde: <span className="font-semibold">{formData.operador}</span>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-xs sm:text-sm font-bold text-slate-700 mb-2">
                    Máquina
                    <span className="ml-2 text-[10px] text-purple-600">(Solo escaneo QR)</span>
                  </label>
                  
                  <button
                    type="button"
                    onClick={() => setShowQRScanner(true)}
                    className="w-full px-4 py-3 sm:py-4 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-bold rounded-lg sm:rounded-xl flex items-center justify-center gap-3 shadow-lg transition-all active:scale-95"
                  >
                    <svg className="w-6 h-6 sm:w-7 sm:h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                    </svg>
                    <span className="text-sm sm:text-base">
                      {formData.machineId ? 'Cambiar Máquina (QR)' : '📱 Escanear Código QR'}
                    </span>
                  </button>
                  
                  {selectedMachine && (
                    <div className="mt-3 p-4 bg-gradient-to-br from-purple-50 to-indigo-50 rounded-xl border-2 border-purple-300 animate-fadeIn">
                      <div className="flex items-center gap-3 mb-2">
                        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-purple-600 to-indigo-600 flex items-center justify-center shadow-lg">
                          <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        </div>
                        <div className="flex-1">
                          <div className="text-[10px] sm:text-xs font-bold text-purple-700 mb-1">✅ Máquina Escaneada</div>
                          <div className="text-lg sm:text-xl font-black text-purple-900">{selectedMachine.code}</div>
                          <div className="text-xs sm:text-sm text-purple-600">{selectedMachine.name}</div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {selectedMachine && (
                  <div className="p-3 sm:p-4 bg-gradient-to-br from-purple-50 to-indigo-50 rounded-xl border-2 border-purple-200">
                    <div className="text-[10px] sm:text-xs font-bold text-purple-600 mb-1">PATENTE</div>
                    <div className="text-base sm:text-lg font-black text-purple-900">{selectedMachine.patente || 'N/A'}</div>
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

            {/* Métricas */}
            <Section 
              title="Combustible y Métricas" 
              icon={
                <svg className="w-4 h-4 sm:w-5 sm:h-5 text-cyan-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              }
            >
              <div className="space-y-3 sm:space-y-4">
                <InputField
                  label="Carga Combustible (litros)"
                  type="number"
                  value={formData.cargaCombustible}
                  onChange={(e) => setFormData({ ...formData, cargaCombustible: e.target.value })}
                  placeholder="0"
                  step="0.1"
                />
                
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
              </div>
            </Section>

            {/* Estado */}
            <Section 
              title="Estado de Máquina" 
              icon={
                <svg className="w-4 h-4 sm:w-5 sm:h-5 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              }
            >
              <div className="space-y-3 sm:space-y-4">
                <div>
                  <label className="block text-xs sm:text-sm font-bold text-slate-700 mb-2">Estado</label>
                  <select
                    value={formData.estadoMaquina}
                    onChange={(e) => setFormData({ ...formData, estadoMaquina: e.target.value })}
                    className="input-modern w-full text-sm sm:text-base"
                    required
                  >
                    <option value="operativa">✅ Operativa</option>
                    <option value="mantencion">🔧 En Mantención</option>
                    <option value="reparacion">⚠️ En Reparación</option>
                    <option value="fuera_servicio">❌ Fuera de Servicio</option>
                  </select>
                </div>
                
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
        // ========== PASO 2: Actividades y Tiempos ==========
        <Paso2Form
          formData={formData}
          setFormData={setFormData}
          onBack={handleBackStep}
          onSubmit={handleFinalSubmit}
          isLoading={isLoading}
          addActividad={addActividad}
          removeActividad={removeActividad}
          updateActividad={updateActividad}
          addTiempoNoEfectivo={addTiempoNoEfectivo}
          removeTiempoNoEfectivo={removeTiempoNoEfectivo}
          updateTiempoNoEfectivo={updateTiempoNoEfectivo}
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
      }
      
      if (scanning) {
        requestAnimationFrame(scanQRCode);
      }
    } catch (err) {
      console.error('Error escaneando:', err);
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
