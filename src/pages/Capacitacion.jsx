import React, { useState, useEffect } from "react";
import { doc, updateDoc, getDoc, serverTimestamp, collection, addDoc } from "firebase/firestore";
import { auth, db } from "../lib/firebase";
import { signOut } from "firebase/auth";
import { useEmpresa } from "../lib/useEmpresa";
import { PillButton } from "../components/ui/PillButton";
import { useEmpresaData } from "../hooks/useEmpresaData";

// Import real steps and modals
import ControlStep from "./combustible/steps/ControlStep";
import EntradaStep from "./combustible/steps/EntradaStep";
import EntregaStep from "./combustible/steps/EntregaStep";

import EquipoSurtidorModal from "./combustible/modals/EquipoSurtidorModal";
import EmpresaModal from "./combustible/modals/EmpresaModal";
import MaquinaModal from "./combustible/modals/MaquinaModal";
import EmpleadoModal from "./combustible/modals/EmpleadoModal";
import ProyectoModal from "./combustible/modals/ProyectoModal";
import EstacionModal from "./combustible/modals/EstacionModal";
import CameraCapture from "../components/CameraCapture";

const QUIZ_QUESTIONS = [
  {
    id: 1,
    question: "Si la maquinaria que va a recibir combustible no aparece en la lista de la aplicación, ¿qué debes hacer?",
    options: [
      { value: "a", text: "Dejar el campo vacío y continuar con el registro." },
      { value: "b", text: "Registrarlo en las observaciones del reporte." },
      { value: "c", text: "Presionar el botón con el signo más (+) al lado del campo Maquinaria para crearla en el momento." },
      { value: "d", text: "Llamar por teléfono al encargado de compras de la oficina." }
    ],
    answer: "c"
  },
  {
    id: 2,
    question: "Si el operario o persona que recibe el combustible no está en la lista del sistema, ¿cómo lo ingresas?",
    options: [
      { value: "a", text: "Seleccionas a cualquier otro trabajador de la lista." },
      { value: "b", text: "Presionas el botón (+) al lado del campo Persona para registrar su Nombre y RUT rápidamente." },
      { value: "c", text: "No es posible despachar combustible a personas nuevas." },
      { value: "d", text: "Dejas el campo en blanco y entregas el combustible." }
    ],
    answer: "b"
  },
  {
    id: 3,
    question: "Al recibir combustible (Entrada) desde un servicentro, ¿qué dato opcional es clave para calzar el registro con la factura física?",
    options: [
      { value: "a", text: "El kilometraje del camión surtidor." },
      { value: "b", text: "El número de Documento o Folio de la boleta o guía física." },
      { value: "c", text: "El RUT del chofer del camión aljibe." },
      { value: "d", text: "La patente del proveedor." }
    ],
    answer: "b"
  },
  {
    id: 4,
    question: "En un registro de Salida (Despacho), ¿qué confirmación digital obligatoria debe realizar el receptor?",
    options: [
      { value: "a", text: "Una foto de la patente de su maquinaria." },
      { value: "b", text: "Una foto del comprobante o de la persona que crea el registro." },
      { value: "c", text: "Un mensaje de texto de confirmación." },
      { value: "d", text: "No se requiere ninguna confirmación." }
    ],
    answer: "b"
  },
  {
    id: 5,
    question: "Si deseas enviar de inmediato un comprobante del registro a la oficina por correo, ¿cómo lo haces?",
    options: [
      { value: "a", text: "Escribes el correo en el cuadro de Observaciones." },
      { value: "b", text: "Copias el enlace de la pantalla y lo envías por chat." },
      { value: "c", text: "Escribes el correo en el campo 'Enviar Copia' y continúas" },
      { value: "d", text: "El sistema no permite enviar copias por correo." }
    ],
    answer: "c"
  },
  {
    id: 6,
    question: "En una Entrada Interna (combustible propio de la obra), ¿qué campos del emisor son obligatorios?",
    options: [
      { value: "a", text: "La patente del camión surtidor únicamente." },
      { value: "b", text: "El Repartidor y el Equipo Surtidor emisor." },
      { value: "c", text: "La estación de servicio y el chofer externo." },
      { value: "d", text: "No se requiere identificar al emisor." }
    ],
    answer: "b"
  },
  {
    id: 7,
    question: "Si compras combustible en una estación Copec, ¿cuál es el Tipo de Origen correcto en la Entrada?",
    options: [
      { value: "a", text: "Interno." },
      { value: "b", text: "Estación de Servicio." },
      { value: "c", text: "Ajuste de Stock." },
      { value: "d", text: "Traspaso de combustible." }
    ],
    answer: "b"
  },
  {
    id: 8,
    question: "¿Qué campo define a qué camión aljibe o estanque fijo de la obra ingresa el combustible recibido?",
    options: [
      { value: "a", text: "Destino de carga." },
      { value: "b", text: "Equipo Surtidor emisor." },
      { value: "c", text: "Observaciones." },
      { value: "d", text: "RUT del receptor." }
    ],
    answer: "a"
  }
];

function getEmbedUrl(url) {
  if (!url) return "";
  const trimmed = url.trim();
  if (trimmed.includes("youtube.com/embed/")) {
    return trimmed;
  }
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=|shorts\/)([^#\&\?]*).*/;
  const match = trimmed.match(regExp);
  if (match && match[2].length === 11) {
    const videoId = match[2];
    return `https://www.youtube.com/embed/${videoId}`;
  }
  return "";
}

export default function Capacitacion({ user, onComplete }) {
  const { empresaId } = useEmpresa();
  const [step, setStep] = useState(1); // 1: Intro, 2: Recepción, 3: Entrega, 4: Quiz, 5: Quiz Result, 6: Mandatory Checklist, 7: Active Sandbox Simulator
  const [answers, setAnswers] = useState({});
  const [score, setScore] = useState(0);
  const [quizPassed, setQuizPassed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [failedQuestions, setFailedQuestions] = useState([]);

  const [videos, setVideos] = useState([]);
  const [loadingVideos, setLoadingVideos] = useState(true);

  // SIMULADOR: COMPLETION STATES
  const [simEntradaCompleted, setSimEntradaCompleted] = useState(false);
  const [simSalidaCompleted, setSimSalidaCompleted] = useState(false);

  const [simFlow, setSimFlow] = useState(""); // "entrada" | "entrega"
  const [simStep, setSimStep] = useState(2); // Start directly at step 2 (Selection & Control)

  const TODAY = () => new Date().toISOString().split('T')[0];

  const [simDatosControl, setSimDatosControl] = useState({
    projectId: '',
    fecha: TODAY(),
    repartidorId: '',
    equipoSurtidorId: '',
    folio: '',
    codigo: ''
  });

  const [simDatosEntrada, setSimDatosEntrada] = useState({
    origen: '',
    tipoOrigen: '',
    destinoCarga: 'camion',
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
    extraEmails: [],
    documentosEstacion: [{ numero: '', cantidad: '', total: '' }]
  });

  const [simDatosEntrega, setSimDatosEntrega] = useState({
    empresa: '',
    fecha: TODAY(),
    operadorId: '',
    machineId: '',
    horometroOdometro: '',
    cantidadLitros: '',
    observaciones: '',
    extraEmails: []
  });

  const [simFirmaReceptor, setSimFirmaReceptor] = useState("");
  const [simSearchOperador, setSimSearchOperador] = useState("");

  const esMPF = (id) => {
    if (!id) return false;
    const cleanId = String(id).trim().toLowerCase();
    if (cleanId === 'mpf' || cleanId === 'emp-2' || cleanId === String(empresaId).toLowerCase()) return true;
    if (cleanId.includes('mpf') || cleanId.includes('ingenieria civil') || cleanId.includes('ingeniería civil')) return true;
    const emp = empresasLocal.find(e => e.id === id);
    if (emp) {
      const nameLower = emp.nombre.toLowerCase();
      return nameLower.includes('mpf') || nameLower.includes('ingenieria civil') || nameLower.includes('ingeniería civil');
    }
    return false;
  };

  // Modales del simulador
  const [showModalEquipoSurtidor, setShowModalEquipoSurtidor] = useState(false);
  const [showModalCamaraReceptor, setShowModalCamaraReceptor] = useState(false);
  const [showModalEmpresa, setShowModalEmpresa] = useState(false);
  const [showModalMaquina, setShowModalMaquina] = useState(false);
  const [showModalEmpleado, setShowModalEmpleado] = useState(false);
  const [showModalProyecto, setShowModalProyecto] = useState(false);
  const [showModalEstacion, setShowModalEstacion] = useState(false);

  const [nuevaMaquinaData, setNuevaMaquinaData] = useState({ patente: '', tipo: '', modelo: '', empresaId: '' });
  const [nuevoEmpleadoData, setNuevoEmpleadoData] = useState({ nombre: '', rut: '', empresaId: '' });
  const [nuevoEquipoSurtidor, setNuevoEquipoSurtidor] = useState({ patente: '', nombre: '', tipo: '', marca: '', modelo: '' });
  const [nuevaEmpresa, setNuevaEmpresa] = useState({ nombre: '', rut: '' });
  const [nuevoProyecto, setNuevoProyecto] = useState({ name: '', codigo: '' });
  const [nuevaEstacion, setNuevaEstacion] = useState({ nombre: '', marca: '' });

  // LOAD REAL DATASETS FROM COMPANY
  const {
    projects: realProjects,
    machines: realMachines,
    machinesLocal: realMachinesLocal,
    empleados: realEmpleados,
    equiposSurtidores: realEquiposSurtidores,
    empresasLocal: realEmpresasLocal,
    estacionesLocal: realEstacionesLocal,
  } = useEmpresaData(empresaId);

  const [projects, setProjects] = useState([]);
  const [equiposSurtidores, setEquiposSurtidores] = useState([]);
  const [estacionesLocal, setEstacionesLocal] = useState([]);
  const [empresasLocal, setEmpresasLocal] = useState([]);
  const [machinesLocal, setMachinesLocal] = useState([]);
  const [trabajadoresLocales, setTrabajadoresLocales] = useState([]);
  const [surtidoresPersonas, setSurtidoresPersonas] = useState([]);

  // Merge real data with presets as fallbacks to ensure there is always data
  useEffect(() => {
    setProjects(realProjects?.length ? realProjects : [{ id: 'sim-ob1', name: 'Obra Central de Práctica' }]);
    if (realProjects?.length && !simDatosControl.projectId) {
      setSimDatosControl(prev => ({ ...prev, projectId: realProjects[0].id }));
    }
  }, [realProjects]);

  useEffect(() => {
    setEquiposSurtidores(realEquiposSurtidores?.length ? realEquiposSurtidores : [
      { id: 'es-1', patente: 'TSRZ-20', nombre: 'Camión Volvo TSRZ-20', tipo: 'camion' },
      { id: 'es-2', patente: 'JF-AMARILLA', nombre: 'Mochila JF Amarilla', tipo: 'mochila' }
    ]);
  }, [realEquiposSurtidores]);

  useEffect(() => {
    setEstacionesLocal(realEstacionesLocal?.length ? realEstacionesLocal : [{ id: 'est-1', nombre: 'Servicentro Copec Vitacura' }]);
  }, [realEstacionesLocal]);

  useEffect(() => {
    setEmpresasLocal(realEmpresasLocal?.length ? realEmpresasLocal : [
      { id: 'emp-1', nombre: 'Constructora Central' },
      { id: 'emp-2', nombre: 'MPF Spa' }
    ]);
  }, [realEmpresasLocal]);

  useEffect(() => {
    setMachinesLocal(realMachinesLocal?.length ? realMachinesLocal : [
      { id: 'maq-1', patente: 'HZ-40', nombre: 'Toyota Hilux HZ-40', tipo: 'Camioneta' },
      { id: 'maq-2', patente: 'CAT-320', nombre: 'Excavadora CAT 320', tipo: 'Excavadora' }
    ]);
  }, [realMachinesLocal]);

  useEffect(() => {
    if (realEmpleados?.length) {
      setTrabajadoresLocales(realEmpleados);
      const filteredSurtidores = realEmpleados.filter(e => e.esSurtidor === true);
      setSurtidoresPersonas(filteredSurtidores.length ? filteredSurtidores : realEmpleados);
      if (filteredSurtidores.length && !simDatosControl.repartidorId) {
        setSimDatosControl(prev => ({ ...prev, repartidorId: filteredSurtidores[0].id }));
      }
    } else {
      const mockWorkers = [
        { id: 'rec-1', nombre: 'Juan Pérez Carrasco', rut: '12.345.678-9' },
        { id: 'rec-2', nombre: 'Pedro Soto Muñoz', rut: '15.678.901-2' }
      ];
      setTrabajadoresLocales(mockWorkers);
      setSurtidoresPersonas(mockWorkers);
      if (!simDatosControl.repartidorId) {
        setSimDatosControl(prev => ({ ...prev, repartidorId: 'rec-1' }));
      }
    }
  }, [realEmpleados]);

  useEffect(() => {
    if (!empresaId) return;
    const loadVideos = async () => {
      try {
        const docRef = doc(db, "empresas", empresaId, "config", "capacitaciones");
        const snap = await getDoc(docRef);
        if (snap.exists() && snap.data().videos) {
          const list = snap.data().videos.filter(v => v.modulo === "reportes");
          setVideos(list);
        }
      } catch (err) {
        console.error("Error loading training videos:", err);
      } finally {
        setLoadingVideos(false);
      }
    };
    loadVideos();
  }, [empresaId]);

  const handleStartQuiz = () => {
    setAnswers({});
    setFailedQuestions([]);
    setErrorMsg("");
    setStep(4);
  };

  const handleAnswerSelect = (questionId, optionValue) => {
    setAnswers(prev => ({ ...prev, [questionId]: optionValue }));
    setFailedQuestions(prev => prev.filter(id => id !== questionId));
  };

  const handleSubmitQuiz = async () => {
    const answeredCount = Object.keys(answers).length;
    if (answeredCount < 8) {
      setErrorMsg("⚠️ Responde las 8 preguntas antes de continuar.");
      return;
    }

    setErrorMsg("");
    const failed = [];
    QUIZ_QUESTIONS.forEach(q => {
      if (answers[q.id] !== q.answer) {
        failed.push(q.id);
      }
    });

    setFailedQuestions(failed);
    const correctCount = 8 - failed.length;
    const finalScore = Math.round((correctCount / 8) * 100);
    setScore(finalScore);
    const passed = failed.length === 0;
    setQuizPassed(passed);
    setStep(5);
  };

  // write mock creations to the real Firestore collections (since it is a live training test environment!)
  const handleCrearEquipoSurtidor = async () => {
    if (!nuevoEquipoSurtidor.patente || !nuevoEquipoSurtidor.nombre) {
      alert("Patente y Nombre son obligatorios");
      return;
    }
    try {
      const docRef = await addDoc(collection(db, "empresas", empresaId, "equipos_surtidores"), {
        patente: nuevoEquipoSurtidor.patente.toUpperCase(),
        code: nuevoEquipoSurtidor.patente.toUpperCase(),
        nombre: nuevoEquipoSurtidor.nombre,
        name: nuevoEquipoSurtidor.nombre,
        tipo: nuevoEquipoSurtidor.tipo || "Equipo Surtidor",
        marca: nuevoEquipoSurtidor.marca || "",
        modelo: nuevoEquipoSurtidor.modelo || "",
        categoria: "surtidor_combustible",
        fechaCreacion: new Date().toISOString()
      });
      const newSurt = {
        id: docRef.id,
        patente: nuevoEquipoSurtidor.patente.toUpperCase(),
        nombre: nuevoEquipoSurtidor.nombre,
        tipo: nuevoEquipoSurtidor.tipo
      };
      setEquiposSurtidores(prev => [...prev, newSurt]);
      setSimDatosControl(prev => ({ ...prev, equipoSurtidorId: docRef.id }));
      setShowModalEquipoSurtidor(false);
      setNuevoEquipoSurtidor({ patente: "", nombre: "", tipo: "", marca: "", modelo: "" });
    } catch (e) {
      console.error(e);
    }
  };

  const handleCrearEmpresa = async () => {
    if (!nuevaEmpresa.nombre) {
      alert("El nombre de la empresa es obligatorio");
      return;
    }
    try {
      const docRef = await addDoc(collection(db, "empresas", empresaId, "empresas_combustible"), {
        nombre: nuevaEmpresa.nombre,
        rut: nuevaEmpresa.rut || "",
        fechaCreacion: new Date().toISOString()
      });
      const newEmp = { id: docRef.id, nombre: nuevaEmpresa.nombre, rut: nuevaEmpresa.rut };
      setEmpresasLocal(prev => [...prev, newEmp]);
      if (simFlow === "entrega") {
        setSimDatosEntrega(prev => ({ ...prev, empresa: docRef.id }));
      } else {
        setSimDatosEntrada(prev => ({ ...prev, origen: docRef.id }));
      }
      setShowModalEmpresa(false);
      setNuevaEmpresa({ nombre: "", rut: "" });
    } catch (e) {
      console.error(e);
    }
  };

  const handleCrearMaquina = async () => {
    if (!nuevaMaquinaData.patente || !nuevaMaquinaData.tipo) {
      alert("Patente y tipo son obligatorios");
      return;
    }
    try {
      const targetEmpId = nuevaMaquinaData.empresaId || "";
      const nombreEmpresa = targetEmpId ? (empresasLocal.find(e => e.id === targetEmpId)?.nombre || targetEmpId) : "";
      const mData = {
        patente: nuevaMaquinaData.patente.toUpperCase(),
        code: nuevaMaquinaData.patente.toUpperCase(),
        name: `${nuevaMaquinaData.tipo} ${nuevaMaquinaData.modelo || ""}`.trim(),
        tipo: nuevaMaquinaData.tipo,
        marca: "",
        modelo: nuevaMaquinaData.modelo || "",
        empresa: nombreEmpresa,
        active: true,
        createdAt: serverTimestamp()
      };
      const docRef = await addDoc(collection(db, "empresas", empresaId, "machines"), mData);
      const newMaq = { id: docRef.id, ...mData, nombre: mData.name };
      setMachinesLocal(prev => [...prev, newMaq]);
      if (simFlow === "entrega") {
        setSimDatosEntrega(prev => ({ ...prev, machineId: docRef.id }));
      }
      setShowModalMaquina(false);
      setNuevaMaquinaData({ patente: "", tipo: "", modelo: "", empresaId: "" });
    } catch (e) {
      console.error(e);
    }
  };

  const handleCrearEmpleado = async () => {
    if (!nuevoEmpleadoData.nombre || !nuevoEmpleadoData.empresaId) {
      alert("Nombre y Empresa son obligatorios");
      return;
    }
    try {
      const empresaNombre = empresasLocal.find(e => e.id === nuevoEmpleadoData.empresaId)?.nombre || nuevoEmpleadoData.empresaId;
      const docRef = await addDoc(collection(db, "empresas", empresaId, "trabajadores"), {
        nombre: nuevoEmpleadoData.nombre.toUpperCase(),
        rut: nuevoEmpleadoData.rut || "",
        empresa: empresaNombre,
        empresaId: nuevoEmpleadoData.empresaId,
        fechaCreacion: new Date().toISOString()
      });
      const newEmp = {
        id: docRef.id,
        nombre: nuevoEmpleadoData.nombre.toUpperCase(),
        rut: nuevoEmpleadoData.rut || "",
        empresa: empresaNombre,
        empresaId: nuevoEmpleadoData.empresaId
      };
      setTrabajadoresLocales(prev => [...prev, newEmp]);
      if (simFlow === "entrega") {
        setSimDatosEntrega(prev => ({ ...prev, receptorId: docRef.id }));
      }
      setShowModalEmpleado(false);
      setNuevoEmpleadoData({ nombre: "", rut: "", empresaId: "" });
    } catch (e) {
      console.error(e);
    }
  };

  const handleCrearProyecto = async () => {
    if (!nuevoProyecto.name.trim()) {
      alert("El nombre del proyecto es obligatorio");
      return;
    }
    try {
      const docRef = await addDoc(collection(db, "empresas", empresaId, "projects"), {
        name: nuevoProyecto.name.trim(),
        codigo: nuevoProyecto.codigo.trim(),
        createdAt: serverTimestamp()
      });
      const newProj = { id: docRef.id, name: nuevoProyecto.name.trim(), codigo: nuevoProyecto.codigo.trim() };
      setProjects(prev => [...prev, newProj]);
      setSimDatosControl(prev => ({ ...prev, projectId: docRef.id }));
      setShowModalProyecto(false);
      setNuevoProyecto({ name: "", codigo: "" });
    } catch (e) {
      console.error(e);
    }
  };

  const handleCrearEstacion = async () => {
    if (!nuevaEstacion.nombre.trim()) {
      alert("El nombre de la estación es obligatorio");
      return;
    }
    try {
      const obras = simDatosControl.projectId ? [simDatosControl.projectId] : [];
      const docRef = await addDoc(collection(db, "empresas", empresaId, "estaciones_combustible"), {
        nombre: nuevaEstacion.nombre.trim(),
        marca: nuevaEstacion.marca.trim(),
        obras,
        createdAt: serverTimestamp()
      });
      const newEst = { id: docRef.id, nombre: nuevaEstacion.nombre.trim(), marca: nuevaEstacion.marca.trim(), obras };
      setEstacionesLocal(prev => [...prev, newEst]);
      setSimDatosEntrada(prev => ({ ...prev, origen: docRef.id }));
      setShowModalEstacion(false);
      setNuevaEstacion({ nombre: "", marca: "" });
    } catch (e) {
      console.error(e);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut(auth);
    } catch (err) {
      console.error("Error signing out:", err);
    }
  };

  // Filtrar videos de Entrada y Salida
  const entradaVideos = videos.filter(v => !v.subcategoria || v.subcategoria === "entrada");
  const salidaVideos = videos.filter(v => v.subcategoria === "salida");

  const isDev = import.meta.env.DEV;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-between py-6 px-4 sm:px-6 relative overflow-hidden">
      <div className="fixed inset-0 bg-grid opacity-30 pointer-events-none" />

      <div className="w-full max-w-3xl mx-auto flex-1 flex flex-col justify-center my-4 relative z-10">

        {/* HEADER GRANDE */}
        <div className="bg-gradient-to-r from-blue-900 to-slate-900 text-white rounded-3xl p-6 sm:p-8 shadow-xl flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-white/10 rounded-2xl flex items-center justify-center text-3xl">
              ⛽
            </div>
            <div>
              <span className="text-[11px] bg-blue-500 text-white px-3 py-1 rounded-full font-black uppercase tracking-wider">
                Material de Apoyo
              </span>
              <h1 className="text-2xl sm:text-3xl font-black mt-1.5 tracking-tight">Capacitación de Combustible</h1>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right hidden sm:block">
              <p className="text-xs text-slate-400 font-bold uppercase">
                {step === 4 ? 'Test' : step === 5 ? 'Resultado' : step === 6 ? 'Práctica' : step === 7 ? 'Práctica Activa' : `Paso ${step}/3`}
              </p>
              <p className="text-base font-black text-blue-300">
                {step === 1 ? 'Bienvenida' : step === 2 ? '1. Recibir' : step === 3 ? '2. Entregar' : step === 4 ? 'Test final' : step === 5 ? 'Resultado Test' : step === 6 ? '3. Práctica Obligatoria' : 'Simulador'}
              </p>
            </div>
            <button
              onClick={handleSignOut}
              className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white font-black text-xs rounded-xl uppercase tracking-wider transition-all"
            >
              Cerrar Sesión
            </button>
          </div>
        </div>

        {/* CONTENIDO PRINCIPAL CON TEXTO GRANDE */}
        <div className="bg-white rounded-3xl border-2 border-slate-100 p-6 sm:p-10 shadow-xl min-h-[480px] flex flex-col justify-between relative">

          {/* STEP 1: INTRO */}
          {step === 1 && (
            <div className="space-y-6">
              <h2 className="text-2xl sm:text-3xl font-black text-slate-900 leading-tight">¡Hola! Te damos la bienvenida 👋</h2>
              <p className="text-slate-700 text-lg sm:text-xl leading-relaxed font-medium">
                Esta es una capacitación amigable diseñada para que aprendas el uso correcto del sistema de combustible de la obra.
              </p>

              <div className="bg-orange-50 border border-orange-200 rounded-2xl p-6 space-y-4">
                <h3 className="font-black text-orange-950 text-base uppercase tracking-wider flex items-center gap-2">
                  <span>📝</span> ¿Cómo funciona este espacio de aprendizaje?
                </h3>
                <ul className="space-y-3.5 text-slate-800 text-base sm:text-lg font-bold">
                  <li className="flex items-start gap-2.5">
                    <span className="text-orange-600 text-xl">✓</span> <span>Revisaremos guías breves sobre <strong>Ingresos (Entradas)</strong> y <strong>Despachos (Salidas)</strong>.</span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <span className="text-orange-600 text-xl">✓</span> <span>Responderemos un test teórico.</span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <span className="text-orange-600 text-xl">✓</span> <span>Al final realizaremos dos simulaciones prácticas usando datos reales de tu obra.</span>
                  </li>
                </ul>
              </div>

              <div className="pt-4 flex justify-end">
                <PillButton onClick={() => setStep(2)} variant="primary" className="w-full sm:w-auto">
                  Comenzar Aprendizaje →
                </PillButton>
              </div>
            </div>
          )}

          {/* STEP 2: RECEPCIÓN */}
          {step === 2 && (
            <div className="space-y-6">
              <div>
                <span className="text-xs bg-green-100 text-green-800 border border-green-200 px-3 py-1 rounded-full uppercase tracking-wider font-black">
                  Capítulo 1
                </span>
                <h2 className="text-2xl sm:text-3xl font-black text-slate-900 mt-3">Recepción de Combustible (Entrada)</h2>
                <p className="text-slate-600 text-base sm:text-lg font-semibold mt-1">¿Cómo registrar cuando ingresa combustible a tus estanques de la obra?</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-6 bg-slate-50 border-2 border-slate-100 rounded-2xl space-y-2.5">
                  <h3 className="font-black text-slate-950 text-lg flex items-center gap-2">
                    <span className="text-2xl">🚛</span> Origen Interno
                  </h3>
                  <p className="text-sm sm:text-base text-slate-600 leading-relaxed font-semibold">
                    Combustible que recibes desde camiones propios. Debes registrar el <strong className="text-slate-800">Repartidor</strong> y el <strong className="text-slate-800">Surtidor</strong>.
                  </p>
                </div>

                <div className="p-6 bg-slate-50 border-2 border-slate-100 rounded-2xl space-y-2.5">
                  <h3 className="font-black text-slate-950 text-lg flex items-center gap-2">
                    <span className="text-2xl">⛽</span> Estación de Servicio
                  </h3>
                  <p className="text-sm sm:text-base text-slate-600 leading-relaxed font-semibold">
                    Combustible comprado en Copec o similares. Debes registrar la <strong className="text-slate-800">Estación</strong> y el <strong className="text-slate-800">Equipo que recibe</strong>.
                  </p>
                </div>
              </div>

              <div className="bg-blue-50 border border-blue-100 rounded-2xl p-5 text-sm sm:text-base text-blue-900 leading-relaxed font-bold">
                💡 <strong>Consejo Práctico:</strong> Puede que algunos campos estén pre-seleccionados por el sistema.
              </div>

              {/* Videos */}
              {loadingVideos ? (
                <div className="text-center text-sm text-slate-400 py-2 font-bold">Cargando material multimedia...</div>
              ) : entradaVideos.length > 0 ? (
                <div className="space-y-4 pt-2 border-t border-slate-100">
                  <h3 className="font-black text-slate-950 text-base flex items-center gap-2">
                    <span>📺</span> Video Instructivo de Recepción:
                  </h3>
                  <div className="grid grid-cols-1 gap-4">
                    {entradaVideos.map(vid => (
                      <div key={vid.id} className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-2.5">
                        <h4 className="font-extrabold text-slate-900 text-sm">{vid.titulo}</h4>
                        {vid.descripcion && <p className="text-xs text-slate-500 font-medium">{vid.descripcion}</p>}
                        <div className="aspect-video w-full rounded-xl overflow-hidden bg-black border border-slate-200 mt-2">
                          {getEmbedUrl(vid.url) ? (
                            <iframe
                              className="w-full h-full"
                              src={getEmbedUrl(vid.url)}
                              title={vid.titulo}
                              frameBorder="0"
                              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                              allowFullScreen
                            />
                          ) : (
                            <div className="w-full h-full flex flex-col items-center justify-center bg-slate-900 text-slate-400 p-4 text-center">
                              <span className="text-2xl mb-1">⚠️</span>
                              <p className="text-xs font-black text-slate-300">Enlace de video no válido</p>
                              <p className="text-[10px] text-slate-500 mt-0.5">El administrador debe configurar un enlace válido de YouTube (ej: https://youtu.be/...)</p>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="pt-4 flex flex-col sm:flex-row gap-3 justify-between">
                <PillButton onClick={() => setStep(1)} variant="outline" className="w-full sm:w-auto">
                  ← Atrás
                </PillButton>
                <PillButton onClick={() => setStep(3)} variant="primary" className="w-full sm:w-auto">
                  Siguiente Capítulo →
                </PillButton>
              </div>
            </div>
          )}

          {/* STEP 3: ENTREGA */}
          {step === 3 && (
            <div className="space-y-6">
              <div>
                <span className="text-xs bg-blue-100 text-blue-800 border border-blue-200 px-3 py-1 rounded-full uppercase tracking-wider font-black">
                  Capítulo 2
                </span>
                <h2 className="text-2xl sm:text-3xl font-black text-slate-900 mt-3">Despacho de Combustible (Salida)</h2>
                <p className="text-slate-600 text-base sm:text-lg font-semibold mt-1">¿Cómo registrar cuando entregas combustible a una máquina?</p>
              </div>

              <div className="space-y-4">
                <div className="flex gap-4 items-start p-5 bg-slate-50 rounded-2xl border-2 border-slate-100">
                  <div className="w-12 h-12 rounded-xl bg-orange-100 text-orange-600 flex items-center justify-center text-2xl flex-shrink-0">🚛</div>
                  <div>
                    <h4 className="font-black text-slate-900 text-base">1. Surtidor y Repartidor</h4>
                    <p className="text-sm sm:text-base text-slate-600 mt-1 leading-relaxed font-semibold">
                      Selecciona tu camión aljibe o estanque y el operario que hace el despacho.
                    </p>
                  </div>
                </div>

                <div className="flex gap-4 items-start p-5 bg-slate-50 rounded-2xl border-2 border-slate-100">
                  <div className="w-12 h-12 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center text-2xl flex-shrink-0">🚜</div>
                  <div>
                    <h4 className="font-black text-slate-900 text-base">2. Máquina y Operador</h4>
                    <p className="text-sm sm:text-base text-slate-600 mt-1 leading-relaxed font-semibold">
                      Busca la máquina por patente. Si el receptor o la máquina no figuran en la lista, <strong>Presiona el botón (+) para agregarlos en solo unos segundos</strong> sin salir de la pantalla.
                    </p>
                  </div>
                </div>

                <div className="flex gap-4 items-start p-5 bg-slate-50 rounded-2xl border-2 border-slate-100">
                  <div className="w-12 h-12 rounded-xl bg-green-100 text-green-600 flex items-center justify-center text-2xl flex-shrink-0">✍️</div>
                  <div>
                    <h4 className="font-black text-slate-900 text-base">3. Litros, Horómetro y Firma</h4>
                    <p className="text-sm sm:text-base text-slate-600 mt-1 leading-relaxed font-semibold">
                      Escribe los litros entregados, el horómetro de la máquina y <strong> toma una foto del registro en papel o tuya</strong>.
                    </p>
                  </div>
                </div>
              </div>

              {/* Videos */}
              {loadingVideos ? (
                <div className="text-center text-sm text-slate-400 py-2 font-bold">Cargando material multimedia...</div>
              ) : salidaVideos.length > 0 ? (
                <div className="space-y-4 pt-2 border-t border-slate-100">
                  <h3 className="font-black text-slate-950 text-base flex items-center gap-2">
                    <span>📺</span> Video Instructivo de Despacho:
                  </h3>
                  <div className="grid grid-cols-1 gap-4">
                    {salidaVideos.map(vid => (
                      <div key={vid.id} className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-2.5">
                        <h4 className="font-extrabold text-slate-900 text-sm">{vid.titulo}</h4>
                        {vid.descripcion && <p className="text-xs text-slate-500 font-medium">{vid.descripcion}</p>}
                        <div className="aspect-video w-full rounded-xl overflow-hidden bg-black border border-slate-200 mt-2">
                          {getEmbedUrl(vid.url) ? (
                            <iframe
                              className="w-full h-full"
                              src={getEmbedUrl(vid.url)}
                              title={vid.titulo}
                              frameBorder="0"
                              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                              allowFullScreen
                            />
                          ) : (
                            <div className="w-full h-full flex flex-col items-center justify-center bg-slate-900 text-slate-400 p-4 text-center">
                              <span className="text-2xl mb-1">⚠️</span>
                              <p className="text-xs font-black text-slate-300">Enlace de video no válido</p>
                              <p className="text-[10px] text-slate-500 mt-0.5">El administrador debe configurar un enlace válido de YouTube (ej: https://youtu.be/...)</p>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="pt-4 flex flex-col sm:flex-row gap-3 justify-between">
                <PillButton onClick={() => setStep(2)} variant="outline" className="w-full sm:w-auto">
                  ← Atrás
                </PillButton>
                <PillButton onClick={handleStartQuiz} variant="primary" className="w-full sm:w-auto">
                  Ir al Test Final →
                </PillButton>
              </div>
            </div>
          )}

          {/* STEP 4: TEST DE APRENDIZAJE */}
          {step === 4 && (
            <div className="space-y-6">
              <div>
                <span className="text-xs bg-orange-100 text-orange-800 border border-orange-200 px-3 py-1 rounded-full uppercase tracking-wider font-black">
                  Test de Aprendizaje
                </span>
                <h2 className="text-2xl sm:text-3xl font-black text-slate-900 mt-3">Test de Apoyo</h2>
                <p className="text-slate-600 text-base sm:text-lg font-semibold mt-1">Responde las 8 preguntas de apoyo para confirmar lo aprendido. ¡Puedes repasar e intentarlo las veces que necesites!</p>
              </div>

              <div className="space-y-8 max-h-[380px] overflow-y-auto pr-2 scrollbar-thin">
                {QUIZ_QUESTIONS.map((q, idx) => {
                  const optionSelectedValue = answers[q.id];
                  const isFailed = failedQuestions.includes(q.id);
                  return (
                    <div key={q.id} className={`p-6 rounded-2xl border-2 space-y-4 transition-all ${isFailed ? 'bg-red-50/20 border-red-300' : 'bg-slate-50 border-slate-100'
                      }`}>
                      <h4 className="font-extrabold text-base sm:text-lg text-slate-900 leading-snug">
                        <span className="text-blue-900 font-black mr-1">{idx + 1}.</span> {q.question}
                        {isFailed && (
                          <span className="ml-2 text-xs font-black text-red-650 uppercase tracking-wide">
                            (Incorrecta)
                          </span>
                        )}
                      </h4>

                      <div className="grid grid-cols-1 gap-3">
                        {q.options.map(opt => {
                          const optionSelected = optionSelectedValue === opt.value;
                          return (
                            <label
                              key={opt.value}
                              className={`flex items-center gap-4 p-4.5 rounded-2xl border-2 transition-all cursor-pointer text-sm sm:text-base font-extrabold ${optionSelected
                                ? isFailed
                                  ? 'bg-red-55 border-red-400 text-red-950 shadow-sm'
                                  : 'bg-orange-50 border-orange-500 text-orange-950 shadow-sm'
                                : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50/50 hover:border-slate-300'
                                }`}
                            >
                              <input
                                type="radio"
                                name={`question-${q.id}`}
                                value={opt.value}
                                checked={optionSelected}
                                onChange={() => handleAnswerSelect(q.id, opt.value)}
                                className={`w-5 h-5 focus:ring-orange-500 border-slate-300 flex-shrink-0 ${isFailed ? 'text-red-600 accent-red-600' : 'text-orange-600 accent-orange-600'
                                  }`}
                              />
                              <span className="leading-snug">{opt.text}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>

              {errorMsg && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-2xl text-sm font-extrabold text-red-600 text-center">
                  {errorMsg}
                </div>
              )}

              <div className="pt-4 flex justify-between border-t border-slate-100">
                <PillButton onClick={() => setStep(3)} variant="outline" className="w-full sm:w-auto">
                  ← Repasar Guías
                </PillButton>
                <PillButton
                  onClick={handleSubmitQuiz}
                  variant="primary"
                  className="w-full sm:w-auto bg-orange-600 hover:bg-orange-500 text-white shadow-orange-100"
                >
                  Enviar Test
                </PillButton>
              </div>
            </div>
          )}

          {/* STEP 5: RESULTADO DEL TEST */}
          {step === 5 && (
            <div className="space-y-6 text-center py-6">
              {quizPassed ? (
                <div className="space-y-6 max-w-md mx-auto">
                  <div className="w-20 h-20 bg-emerald-100 text-emerald-600 border-2 border-emerald-200 rounded-full flex items-center justify-center text-4xl mx-auto animate-bounce">
                    ✓
                  </div>
                  <div>
                    <h2 className="text-3xl font-black text-slate-900">¡Felicitaciones! Test Aprobado 🎉</h2>
                    <p className="text-slate-600 text-lg font-bold mt-1">Respondiste correctamente el <strong className="font-extrabold text-slate-950">{score}%</strong> del test.</p>
                  </div>

                  <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-5 text-sm sm:text-base text-emerald-950 font-bold leading-relaxed">
                    ¡Excelente trabajo! Has aprobado la sección teórica. Ahora debes completar las simulaciones de práctica obligatorias para finalizar.
                  </div>

                  <div className="pt-4">
                    <PillButton
                      onClick={() => setStep(6)}
                      variant="primary"
                      className="w-full"
                    >
                      Continuar a la Práctica Obligatoria →
                    </PillButton>
                  </div>
                </div>
              ) : (
                <div className="space-y-6 max-w-md mx-auto">
                  <div className="w-20 h-20 bg-amber-100 text-amber-600 border-2 border-amber-200 rounded-full flex items-center justify-center text-3xl mx-auto">
                    👍
                  </div>
                  <div>
                    <h2 className="text-3xl font-black text-slate-900">¡Buen intento! Repasemos juntos</h2>
                    <p className="text-slate-600 text-lg font-bold mt-1">Obtuviste un <strong className="font-extrabold text-slate-950">{score}%</strong> (el test requiere al menos 7 correctas de 8).</p>
                  </div>

                  <div className="bg-amber-50 border border-amber-150 rounded-2xl p-5 text-sm sm:text-base text-amber-950 font-bold leading-relaxed">
                    No te preocupes, la idea es que aprendas a usar la herramienta. Te sugerimos repasar un poco las guías de arriba antes de volver a rendirlo.
                  </div>

                  <div className="pt-4 flex flex-col sm:flex-row gap-3">
                    <PillButton
                      onClick={() => setStep(2)}
                      variant="outline"
                      className="flex-1"
                    >
                      Repasar Guías
                    </PillButton>
                    <PillButton
                      onClick={() => setStep(4)}
                      variant="primary"
                      className="flex-1 bg-orange-600 hover:bg-orange-500 text-white shadow-orange-100"
                    >
                      Reintentar Test
                    </PillButton>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* STEP 6: LISTADO DE PRÁCTICA OBLIGATORIA */}
          {step === 6 && (
            <div className="space-y-6">
              <div>
                <span className="text-xs bg-purple-100 text-purple-800 border border-purple-200 px-3 py-1 rounded-full uppercase tracking-wider font-black">
                  Paso Final: Práctica Obligatoria
                </span>
                <h2 className="text-2xl sm:text-3xl font-black text-slate-900 mt-3">Simulaciones Reales Obligatorias</h2>
                <p className="text-slate-600 text-base sm:text-lg font-semibold mt-1">
                  Debes completar ambas simulaciones (Entrada y Salida) utilizando datos de la obra para habilitar tu acceso.
                </p>
              </div>

              <div className="space-y-4">
                {/* SIMULACION 1: RECEPCION */}
                <div className={`p-5 sm:p-6 rounded-3xl border-2 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all ${simEntradaCompleted
                  ? 'bg-emerald-50/50 border-emerald-200'
                  : 'bg-slate-50 border-slate-100 hover:border-slate-200'
                  }`}>
                  <div className="flex gap-4 items-start">
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-2xl flex-shrink-0 ${simEntradaCompleted ? 'bg-emerald-100 text-emerald-600' : 'bg-orange-100 text-orange-600'
                      }`}>
                      {simEntradaCompleted ? '✓' : '⬇️'}
                    </div>
                    <div className="space-y-1">
                      <h4 className="font-black text-slate-900 text-base sm:text-lg flex flex-wrap items-center gap-2">
                        1. Simular Recepción (Entrada)
                        {simEntradaCompleted && (
                          <span className="text-[10px] sm:text-xs font-black bg-emerald-600 text-white px-2 py-0.5 rounded-full uppercase tracking-wider">
                            Completado
                          </span>
                        )}
                      </h4>
                      <p className="text-xs sm:text-sm text-slate-500 leading-relaxed font-semibold">
                        Registra el ingreso de combustible desde una estación o camión aljibe emisor.
                      </p>
                    </div>
                  </div>
                  <div className="w-full sm:w-auto flex justify-end">
                    <PillButton
                      onClick={() => {
                        setSimFlow("entrada");
                        setSimStep(2);
                        setStep(7);
                      }}
                      variant={simEntradaCompleted ? "outline" : "primary"}
                      className="w-full sm:w-auto"
                      title={simEntradaCompleted ? "Rehacer" : "Iniciar"}
                    />
                  </div>
                </div>

                {/* SIMULACION 2: DESPACHO */}
                <div className={`p-5 sm:p-6 rounded-3xl border-2 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all ${simSalidaCompleted
                  ? 'bg-emerald-50/50 border-emerald-200'
                  : 'bg-slate-50 border-slate-100 hover:border-slate-200'
                  }`}>
                  <div className="flex gap-4 items-start">
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-2xl flex-shrink-0 ${simSalidaCompleted ? 'bg-emerald-100 text-emerald-600' : 'bg-blue-100 text-blue-600'
                      }`}>
                      {simSalidaCompleted ? '✓' : '➡️'}
                    </div>
                    <div className="space-y-1">
                      <h4 className="font-black text-slate-900 text-base sm:text-lg flex flex-wrap items-center gap-2">
                        2. Simular Despacho (Salida)
                        {simSalidaCompleted && (
                          <span className="text-[10px] sm:text-xs font-black bg-emerald-600 text-white px-2 py-0.5 rounded-full uppercase tracking-wider">
                            Completado
                          </span>
                        )}
                      </h4>
                      <p className="text-xs sm:text-sm text-slate-500 leading-relaxed font-semibold">
                        Registra la entrega de combustible a una máquina con firma del operario receptor.
                      </p>
                    </div>
                  </div>
                  <div className="w-full sm:w-auto flex justify-end">
                    <PillButton
                      onClick={() => {
                        setSimFlow("entrega");
                        setSimStep(2);
                        setStep(7);
                      }}
                      variant={simSalidaCompleted ? "outline" : "primary"}
                      className="w-full sm:w-auto"
                      title={simSalidaCompleted ? "Rehacer" : "Iniciar"}
                    />
                  </div>
                </div>
              </div>

              <div className="pt-6 border-t border-slate-100 space-y-4">
                {!(simEntradaCompleted && simSalidaCompleted) && (
                  <p className="text-xs text-slate-500 font-extrabold text-center uppercase tracking-wider">
                    🔒 Completa ambas simulaciones para finalizar tu capacitación
                  </p>
                )}
                <PillButton
                  onClick={async () => {
                    setSaving(true);
                    try {
                      const userRef = doc(db, "users", user.uid);
                      await updateDoc(userRef, {
                        capacitacionAprobada: true,
                        capacitacionFecha: serverTimestamp()
                      });

                      if (empresaId) {
                        const empresaUserRef = doc(db, "empresas", empresaId, "users", user.uid);
                        await updateDoc(empresaUserRef, {
                          capacitacionAprobada: true,
                          capacitacionFecha: serverTimestamp()
                        }).catch(err => {
                          console.warn("No se pudo escribir en subcolección de usuarios:", err.message);
                        });
                      }
                      onComplete();
                    } catch (err) {
                      console.error("Error finalizing training:", err);
                      setErrorMsg("Hubo un error al guardar tu progreso. Reintenta.");
                    } finally {
                      setSaving(false);
                    }
                  }}
                  disabled={!(simEntradaCompleted && simSalidaCompleted) || saving}
                  isLoading={saving}
                  variant="secondary"
                  className="w-full"
                >
                  Finalizar Capacitación e Ingresar
                </PillButton>
              </div>
            </div>
          )}

          {/* STEP 7: SIMULADOR INTERACTIVO ACTIVO (100% REAL CON DATOS EN VIVO) */}
          {step === 7 && (
            <div className="space-y-6 flex-1 flex flex-col justify-between">
              <div>
                <span className="text-xs bg-purple-100 text-purple-800 border border-purple-200 px-3 py-1 rounded-full uppercase tracking-wider font-black">
                  Práctica Obligatoria en Curso
                </span>

                <div className="flex justify-between items-center mt-3 pb-2 border-b border-slate-100">
                  <span className="text-[11px] font-black uppercase tracking-wider text-slate-400">
                    Entorno de Práctica: {simFlow === 'entrada' ? 'Recepción (Entrada)' : 'Despacho (Salida)'}
                  </span>
                  <button
                    onClick={() => { setStep(6); setSimFlow(""); setSimStep(2); }}
                    className="text-xs font-black text-rose-600 hover:text-rose-700 hover:underline uppercase tracking-tight"
                  >
                    ✕ Salir de Práctica
                  </button>
                </div>
              </div>

              <div className="mt-4 flex-1">
                <div className="animate-in fade-in duration-200">
                  {/* Render ControlStep (Paso 2 común) */}
                  {simStep === 2 && (
                    <ControlStep
                      tipoReporte={simFlow}
                      datosControl={simDatosControl}
                      setDatosControl={setSimDatosControl}
                      datosEntrada={simDatosEntrada}
                      setDatosEntrada={setSimDatosEntrada}
                      datosEntrega={simDatosEntrega}
                      setDatosEntrega={setSimDatosEntrega}
                      projects={projects}
                      equiposSurtidores={equiposSurtidores}
                      estacionesLocal={estacionesLocal}
                      empresasLocal={empresasLocal}
                      machinesLocal={machinesLocal}
                      machines={machinesLocal}
                      trabajadoresLocales={trabajadoresLocales}
                      surtidoresPersonas={surtidoresPersonas}
                      currentUserData={user}
                      isAdmin={false}
                      isReportesView={false}
                      cargarEstaciones={() => { }}
                      esMPF={esMPF}
                      empresasMatch={(e1, e2) => String(e1).toLowerCase() === String(e2).toLowerCase()}
                      resolverNombreEmpresa={(id) => {
                        const emp = empresasLocal.find(e => e.id === id);
                        return emp ? emp.nombre : '';
                      }}
                      setPaso={(p) => {
                        if (p === 1) {
                          setStep(6);
                          setSimFlow("");
                          setSimStep(2);
                        } else {
                          setSimStep(p);
                        }
                      }}
                      setShowModalEquipoSurtidor={setShowModalEquipoSurtidor}
                      setShowModalEmpresa={setShowModalEmpresa}
                      setShowModalMaquina={setShowModalMaquina}
                      setNuevaMaquinaData={setNuevaMaquinaData}
                      setShowModalEmpleado={setShowModalEmpleado}
                      setNuevoEmpleadoData={setNuevoEmpleadoData}
                      setShowModalProyecto={setShowModalProyecto}
                      setShowModalEstacion={setShowModalEstacion}
                    />
                  )}

                  {/* Render EntradaStep (Paso 3 Entrada) */}
                  {simStep === 3 && simFlow === 'entrada' && (
                    <EntradaStep
                      datosEntrada={simDatosEntrada}
                      setDatosEntrada={setSimDatosEntrada}
                      datosControl={simDatosControl}
                      isAdmin={false}
                      currentUserData={user}
                      machinesLocal={machinesLocal}
                      machines={machinesLocal}
                      trabajadoresLocales={trabajadoresLocales}
                      esMPF={esMPF}
                      setShowModalMaquina={setShowModalMaquina}
                      setNuevaMaquinaData={setNuevaMaquinaData}
                      setShowModalEmpleado={setShowModalEmpleado}
                      setNuevoEmpleadoData={setNuevoEmpleadoData}
                      handleSubmit={() => setSimStep(4)}
                      loading={false}
                      setPaso={setSimStep}
                    />
                  )}

                  {/* Render EntregaStep (Paso 3 Despacho) */}
                  {simStep === 3 && simFlow === 'entrega' && (
                    <EntregaStep
                      datosEntrega={simDatosEntrega}
                      setDatosEntrega={setSimDatosEntrega}
                      machinesLocal={machinesLocal}
                      trabajadoresLocales={trabajadoresLocales}
                      empresasLocal={empresasLocal}
                      esMPF={esMPF}
                      empresasMatch={(e1, e2) => String(e1).toLowerCase() === String(e2).toLowerCase()}
                      resolverNombreEmpresa={(id) => {
                        const emp = empresasLocal.find(e => e.id === id);
                        return emp ? emp.nombre : '';
                      }}
                      firmaReceptor={simFirmaReceptor}
                      setFirmaReceptor={setSimFirmaReceptor}
                      setShowModalCamaraReceptor={() => {
                        setShowModalCamaraReceptor(true);
                      }}
                      setShowModalMaquina={setShowModalMaquina}
                      setNuevaMaquinaData={setNuevaMaquinaData}
                      setShowModalEmpleado={setShowModalEmpleado}
                      setNuevoEmpleadoData={setNuevoEmpleadoData}
                      setShowModalEmpresa={setShowModalEmpresa}
                      searchOperador={simSearchOperador}
                      setSearchOperador={setSimSearchOperador}
                      handleSubmit={() => setSimStep(4)}
                      loading={false}
                      setPaso={setSimStep}
                      nuevaMaquinaData={nuevaMaquinaData}
                      nuevoEmpleadoData={nuevoEmpleadoData}
                      isAdmin={false}
                      isReportesView={false}
                    />
                  )}

                  {/* Step 4: Finalizado Exitoso */}
                  {simStep === 4 && (
                    <div className="space-y-4 p-4 text-center animate-in zoom-in-95 duration-200">
                      <div className="w-16 h-16 bg-emerald-100 text-emerald-600 border-2 border-emerald-200 rounded-full flex items-center justify-center text-3xl mx-auto animate-bounce">
                        ✓
                      </div>
                      <div className="p-5 bg-emerald-50 border-2 border-emerald-100 text-emerald-950 rounded-2xl text-sm font-bold leading-relaxed">
                        🎉 <strong>¡Movimiento de combustible simulado con éxito!</strong>
                        <div className="mt-3 text-slate-700 font-semibold space-y-1.5 text-left border-t border-emerald-150 pt-2 text-xs sm:text-sm">
                          <div>• Tipo de Registro: {simFlow === 'entrada' ? 'Entrada (Recepción)' : 'Salida (Despacho)'}</div>
                          <div>• Obra / Proyecto: {projects.find(p => p.id === simDatosControl.projectId)?.name}</div>
                          <div>• Surtidor / Emisor: {simFlow === 'entrada' ? (simDatosEntrada.tipoOrigen === 'estacion' ? 'Estación de Servicio' : 'Interno') : (equiposSurtidores.find(e => e.id === simDatosControl.equipoSurtidorId)?.nombre)}</div>
                          {simFlow === 'entrada' ? (
                            <>
                              <div>• Litros Recibidos: {simDatosEntrada.cantidad || '0'} Litros</div>
                              <div>• Documento de Compra: {simDatosEntrada.numeroDocumento || 'N/A'}</div>
                            </>
                          ) : (
                            <>
                              <div>• Maquinaria: {machinesLocal.find(m => m.id === simDatosEntrega.machineId)?.nombre || 'N/A'} ({machinesLocal.find(m => m.id === simDatosEntrega.machineId)?.patente || 'N/A'})</div>
                              <div>• Recibe: {trabajadoresLocales.find(t => t.id === simDatosEntrega.operadorId)?.nombre || 'Trabajador Externo'}</div>
                              <div>• Litros Despachados: {simDatosEntrega.cantidadLitros || '0'} Litros</div>
                            </>
                          )}
                        </div>
                      </div>
                      <PillButton
                        onClick={() => {
                          if (simFlow === "entrada") {
                            setSimEntradaCompleted(true);
                          } else if (simFlow === "entrega") {
                            setSimSalidaCompleted(true);
                          }
                          setStep(6);
                          setSimFlow("");
                          setSimStep(2);
                          // Reset simulated form states
                          setSimDatosControl({
                            projectId: projects[0]?.id || "",
                            fecha: TODAY(),
                            repartidorId: surtidoresPersonas[0]?.id || "",
                            equipoSurtidorId: equiposSurtidores[0]?.id || "",
                            folio: '',
                            codigo: ''
                          });
                          setSimDatosEntrada({
                            origen: '',
                            tipoOrigen: '',
                            destinoCarga: 'camion',
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
                            extraEmails: [],
                            documentosEstacion: [{ numero: '', cantidad: '', total: '' }]
                          });
                          setSimDatosEntrega({
                            empresa: '',
                            fecha: TODAY(),
                            operadorId: '',
                            machineId: '',
                            horometroOdometro: '',
                            cantidadLitros: '',
                            observaciones: '',
                            extraEmails: []
                          });
                          setSimFirmaReceptor("");
                        }}
                        variant="secondary"
                        className="w-full"
                      >
                        Continuar
                      </PillButton>
                    </div>
                  )}
                </div>
              </div>

              {/* MODALS REALES MOCKEADOS EN LA SIMULACIÓN */}
              {showModalEquipoSurtidor && (
                <EquipoSurtidorModal
                  data={nuevoEquipoSurtidor}
                  setData={setNuevoEquipoSurtidor}
                  onConfirm={handleCrearEquipoSurtidor}
                  onClose={() => setShowModalEquipoSurtidor(false)}
                  loading={false}
                />
              )}

              {showModalEmpresa && (
                <EmpresaModal
                  data={nuevaEmpresa}
                  setData={setNuevaEmpresa}
                  onConfirm={handleCrearEmpresa}
                  onClose={() => setShowModalEmpresa(false)}
                  loading={false}
                />
              )}

              {showModalMaquina && (
                <MaquinaModal
                  data={nuevaMaquinaData}
                  setData={setNuevaMaquinaData}
                  empresasLocal={empresasLocal}
                  esMPF={esMPF}
                  onConfirm={handleCrearMaquina}
                  onClose={() => setShowModalMaquina(false)}
                  loading={false}
                />
              )}

              {showModalEmpleado && (
                <EmpleadoModal
                  data={nuevoEmpleadoData}
                  setData={setNuevoEmpleadoData}
                  empresasLocal={empresasLocal}
                  esMPF={esMPF}
                  onConfirm={handleCrearEmpleado}
                  onClose={() => setShowModalEmpleado(false)}
                  loading={false}
                />
              )}

              {showModalProyecto && (
                <ProyectoModal
                  data={nuevoProyecto}
                  setData={setNuevoProyecto}
                  onConfirm={handleCrearProyecto}
                  onClose={() => setShowModalProyecto(false)}
                  loading={false}
                />
              )}

              {showModalEstacion && (
                <EstacionModal
                  data={nuevaEstacion}
                  setData={setNuevaEstacion}
                  onConfirm={handleCrearEstacion}
                  onClose={() => setShowModalEstacion(false)}
                  loading={false}
                />
              )}

              {showModalCamaraReceptor && (
                <CameraCapture
                  color="blue"
                  title="Identificación Receptor"
                  onCapture={(photo) => {
                    setSimFirmaReceptor(photo);
                    setShowModalCamaraReceptor(false);
                  }}
                  onClose={() => setShowModalCamaraReceptor(false)}
                />
              )}
            </div>
          )}

        </div>

      </div>

      {/* DEVELOPER BYPASS */}
      {isDev && (
        <div className="max-w-3xl mx-auto w-full bg-slate-900 text-white p-4 rounded-2xl border border-slate-700 shadow-lg text-center space-y-3 mt-4 relative z-10">
          <p className="text-xs font-black uppercase tracking-widest text-slate-400">Panel de Desarrollo / Simulación</p>
          <div className="flex flex-wrap gap-3 justify-center">
            <button
              onClick={async () => {
                try {
                  setSaving(true);
                  await updateDoc(doc(db, "users", user.uid), {
                    role: "superadmin",
                    cargo: ""
                  });
                  alert("Rol restaurado a superadmin! Recarga la página si no redirige solo.");
                } catch (err) {
                  alert("Error al restaurar rol: " + err.message);
                } finally {
                  setSaving(false);
                }
              }}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 font-black text-xs rounded-xl uppercase tracking-wider transition-all"
            >
              Restaurar Rol Administrador (Bypass)
            </button>
            <button
              onClick={async () => {
                try {
                  setSaving(true);
                  await updateDoc(doc(db, "users", user.uid), {
                    capacitacionAprobada: true
                  });
                  onComplete();
                } catch (err) {
                  alert("Error al aprobar test: " + err.message);
                } finally {
                  setSaving(false);
                }
              }}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 font-black text-xs rounded-xl uppercase tracking-wider transition-all"
            >
              Aprobar Test Directamente
            </button>
          </div>
        </div>
      )}

      {/* FOOTER */}
      <div className="text-center text-[10px] text-slate-400 font-bold mt-6 z-10">
        © {new Date().getFullYear()} FleetCore by Concentra · Centro de Certificación Obligatoria
      </div>
    </div>
  );
}
