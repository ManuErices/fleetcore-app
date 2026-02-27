import React, { useState, useEffect, useMemo } from "react";
import { collection, query, where, getDocs, orderBy, doc, getDoc, updateDoc, addDoc, serverTimestamp, deleteDoc } from "firebase/firestore";
import { db, auth } from "../lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import ReporteDetalleModal from "../components/ReporteDetalleModal";
import ReportDetallado from "./ReportDetallado";

export default function ReporteWorkFleet() {
  const [reportes, setReportes] = useState([]);
  const [projects, setProjects] = useState([]);
  const [machines, setMachines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showPreview, setShowPreview] = useState(false);
  const [reporteDetalle, setReporteDetalle] = useState(null);
  const [userRole, setUserRole] = useState('operador'); // Estado para el rol del usuario
  const [currentUser, setCurrentUser] = useState(null); // Usuario actual
  const [reportesSeleccionados, setReportesSeleccionados] = useState([]);
  const [showImport, setShowImport] = useState(false);
  const [showNuevoReporte, setShowNuevoReporte] = useState(false);
  const [paginaActual, setPaginaActual] = useState(1);
  const ITEMS_POR_PAGINA = 10;
  
  // Filtros
  const [filtros, setFiltros] = useState({
    fechaInicio: '',
    fechaFin: '',
    proyecto: '',
    maquina: '',
    operador: ''
  });

  // Listas únicas para selectores
  const [operadores, setOperadores] = useState([]);
  const [empleados, setEmpleados] = useState([]);

  // Obtener rol del usuario actual desde Firebase
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setCurrentUser(user);
        try {
          // Obtener el documento del usuario desde la colección 'users'
          const userDocRef = doc(db, 'users', user.uid);
          const userDoc = await getDoc(userDocRef);
          
          if (userDoc.exists()) {
            const userData = userDoc.data();
            // Obtener el rol del usuario, por defecto 'operador' si no existe
            setUserRole(userData.role || 'operador');
            console.log('Rol del usuario:', userData.role);
          } else {
            console.log('No se encontró el documento del usuario');
            setUserRole('operador');
          }
        } catch (error) {
          console.error("Error obteniendo rol del usuario:", error);
          setUserRole('operador');
        }
      } else {
        setCurrentUser(null);
        setUserRole('operador');
      }
    });

    return () => unsubscribe();
  }, []);

  // Cargar projects y machines
  useEffect(() => {
    const cargarDatos = async () => {
      try {
        // Cargar proyectos
        const projectsRef = collection(db, 'projects');
        const projectsSnap = await getDocs(projectsRef);
        const projectsData = projectsSnap.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setProjects(projectsData);

        // Cargar máquinas
        const machinesRef = collection(db, 'machines');
        const machinesSnap = await getDocs(machinesRef);
        const machinesData = machinesSnap.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setMachines(machinesData);

        // Cargar empleados
        const empleadosRef = collection(db, 'employees');
        const empleadosSnap = await getDocs(empleadosRef);
        const empleadosData = empleadosSnap.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setEmpleados(empleadosData);
      } catch (error) {
        console.error("Error cargando datos base:", error);
      }
    };

    cargarDatos();
  }, []);

  // Cargar reportes desde Firebase
  useEffect(() => {
    const cargarReportes = async () => {
      setLoading(true);
      try {
        const reportesRef = collection(db, 'reportes_detallados');
        const q = query(reportesRef, orderBy('fecha', 'desc'));
        const querySnapshot = await getDocs(q);
        
        const reportesData = querySnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        
        setReportes(reportesData);
        
        // Extraer operadores únicos
        const operadoresUnicos = [...new Set(reportesData.map(r => r.operador))].filter(Boolean);
        setOperadores(operadoresUnicos);
        
        setLoading(false);
      } catch (error) {
        console.error("Error cargando reportes:", error);
        setLoading(false);
      }
    };

    cargarReportes();
  }, []);

  const handleEliminarReporte = async (id) => {
    if (!window.confirm('¿Estás seguro de eliminar este reporte? Esta acción no se puede deshacer.')) return;
    try {
      await deleteDoc(doc(db, 'reportes_detallados', id));
      setReportes(prev => prev.filter(r => r.id !== id));
    } catch (err) {
      alert('Error al eliminar: ' + err.message);
    }
  };

  // Aplicar filtros y enriquecer datos
  const reportesFiltrados = useMemo(() => {
    let resultado = [...reportes];

    // Si el usuario es mandante, solo mostrar reportes firmados
    if (userRole === 'mandante') {
      resultado = resultado.filter(r => r.firmado === true);
    }

    if (filtros.fechaInicio) {
      resultado = resultado.filter(r => r.fecha >= filtros.fechaInicio);
    }

    if (filtros.fechaFin) {
      resultado = resultado.filter(r => r.fecha <= filtros.fechaFin);
    }

    if (filtros.proyecto) {
      resultado = resultado.filter(r => r.projectId === filtros.proyecto);
    }

    if (filtros.maquina) {
      resultado = resultado.filter(r => r.machineId === filtros.maquina);
    }

    if (filtros.operador) {
      resultado = resultado.filter(r => r.operador === filtros.operador);
    }

    // Enriquecer con datos de projects y machines
    return resultado.map(r => {
      const project = projects.find(p => p.id === r.projectId);
      const machine = machines.find(m => m.id === r.machineId);

      return {
        ...r,
        projectName:    project?.name    || r.projectName    || r.projectId || '',
        machinePatente: machine?.patente || r.machinePatente || '',
        machineCode:    machine?.code    || r.machineCode    || '',
        machineName:    machine?.name    || r.machineName    || '',
        machineType:    machine?.type    || r.machineType    || '',
        machineMarca:   machine?.marca   || r.machineMarca   || '',
      };
    });
  }, [filtros, reportes, projects, machines, userRole]);

  const handleFiltroChange = (campo, valor) => {
    setFiltros(prev => ({
      ...prev,
      [campo]: valor
    }));
  };

  const limpiarFiltros = () => {
    setFiltros({
      fechaInicio: '',
      fechaFin: '',
      proyecto: '',
      maquina: '',
      operador: ''
    });
  };

  // Funciones para manejar selección de reportes
  const toggleReporteSeleccionado = (reporteId) => {
    setReportesSeleccionados(prev => {
      if (prev.includes(reporteId)) {
        return prev.filter(id => id !== reporteId);
      } else {
        return [...prev, reporteId];
      }
    });
  };

  const toggleSeleccionarTodos = () => {
    if (reportesSeleccionados.length === reportesFiltrados.length) {
      setReportesSeleccionados([]);
    } else {
      setReportesSeleccionados(reportesFiltrados.map(r => r.id));
    }
  };

  const todosSeleccionados = reportesFiltrados.length > 0 && reportesSeleccionados.length === reportesFiltrados.length;

  // Generar PDF masivo de reportes detallados
  const descargarPDFMasivoDetallado = () => {
    if (reportesSeleccionados.length === 0) {
      alert('Por favor seleccione al menos un reporte');
      return;
    }

    const doc = new jsPDF('p', 'mm', 'a4');
    const reportesAGenerar = reportes.filter(r => reportesSeleccionados.includes(r.id));

    // ── Paleta de colores ──────────────────────────────────────────
    const C = {
      morado:       [88,  80,  141],
      moradoOscuro: [67,  56,  202],
      moradoClaro:  [237, 233, 254],
      moradoLine:   [139, 92,  246],
      oscuro:       [15,  23,  42],
      gris1:        [30,  41,  59],
      gris2:        [71,  85,  105],
      gris3:        [148, 163, 184],
      gris4:        [226, 232, 240],
      gris5:        [248, 250, 252],
      blanco:       [255, 255, 255],
      verde:        [16,  185, 129],
      verdeClaro:   [209, 250, 229],
      amber:        [217, 119, 6],
      amberClaro:   [254, 243, 199],
      rojo:         [220, 38,  38],
      rojoClaro:    [254, 226, 226],
      azul:         [59,  130, 246],
      azulClaro:    [239, 246, 255],
      rosa:         [236, 72,  153],
      rosaClaro:    [253, 242, 248],
    };

    const fillRect = (x, y, w, h, r, fill, stroke, sw = 0.3) => {
      if (fill)   { doc.setFillColor(...fill);   doc.roundedRect(x, y, w, h, r, r, 'F'); }
      if (stroke) { doc.setDrawColor(...stroke); doc.setLineWidth(sw); doc.roundedRect(x, y, w, h, r, r, 'S'); }
    };

    const sectionTitle = (x, y, text, color) => {
      doc.setFillColor(...color);
      doc.rect(x, y, 2.5, 8, 'F');
      doc.setFontSize(8); doc.setFont(undefined, 'bold'); doc.setTextColor(...color);
      doc.text(text, x + 5, y + 5.8);
    };

    reportesAGenerar.forEach((reporte, index) => {
      if (index > 0) doc.addPage();

      const project = projects.find(p => p.id === reporte.projectId);
      const machine = machines.find(m => m.id === reporte.machineId);

      const pW = doc.internal.pageSize.getWidth();   // 210
      const pH = doc.internal.pageSize.getHeight();  // 297
      const mg = 14;
      const cW = pW - mg * 2;                        // 182

      const horasTrabajadas = ((parseFloat(reporte.horometroFinal) || 0) - (parseFloat(reporte.horometroInicial) || 0)).toFixed(2);
      const kmRecorridos    = ((parseFloat(reporte.kilometrajeFinal) || 0) - (parseFloat(reporte.kilometrajeInicial) || 0)).toFixed(2);
      const mostrarKm = machine?.type && (machine.type.toUpperCase().includes('CAMION') || machine.type.toUpperCase().includes('CAMIONETA'));
      const firmado = !!(reporte.firmado);

      // ══════════════════════════════════════════════════════════════
      // HEADER
      // ══════════════════════════════════════════════════════════════
      doc.setFillColor(...C.oscuro);
      doc.rect(0, 0, pW, 38, 'F');
      doc.setFillColor(...C.morado);
      doc.rect(0, 0, 4, 38, 'F');

      // Logo
      fillRect(mg + 2, 7, 24, 24, 2, C.morado, null);
      doc.setFontSize(9); doc.setFont(undefined, 'bold'); doc.setTextColor(...C.blanco);
      doc.text('MPF', mg + 7.5, 16.5);
      doc.setFontSize(5); doc.setFont(undefined, 'normal');
      doc.text('INGENIERÍA', mg + 4.8, 21);
      doc.text('CIVIL', mg + 8.5, 25);

      // Título
      doc.setFontSize(15); doc.setFont(undefined, 'bold'); doc.setTextColor(...C.blanco);
      doc.text('REPORTE DE EQUIPO', mg + 32, 17);
      doc.setFontSize(8); doc.setFont(undefined, 'normal'); doc.setTextColor(...C.gris3);
      doc.text('Work Fleet · Control Operacional de Maquinaria', mg + 32, 24);

      // Badge estado + N° reporte
      const badgeX = pW - mg - 30;
      if (firmado) {
        fillRect(badgeX, 10, 28, 8, 2, C.verde, null);
        doc.setFontSize(7); doc.setFont(undefined, 'bold'); doc.setTextColor(...C.blanco);
        doc.text('✓ VALIDADO', badgeX + 14, 15.2, { align: 'center' });
      } else {
        fillRect(badgeX, 10, 28, 8, 2, C.gris1, null);
        doc.setFontSize(7); doc.setFont(undefined, 'bold'); doc.setTextColor(...C.gris3);
        doc.text('PENDIENTE', badgeX + 14, 15.2, { align: 'center' });
      }
      doc.setFontSize(6.5); doc.setFont(undefined, 'normal'); doc.setTextColor(...C.gris3);
      doc.text(`N° ${reporte.numeroReporte || '—'}`, badgeX + 14, 23, { align: 'center' });

      let y = 46;

      // ══════════════════════════════════════════════════════════════
      // FILA META: fecha · proyecto · estado
      // ══════════════════════════════════════════════════════════════
      fillRect(mg, y, cW, 14, 2.5, C.gris5, C.gris4);

      const fecha = reporte.fecha || '—';
      const fechaFmt = fecha !== '—'
        ? new Date(fecha + 'T00:00:00').toLocaleDateString('es-CL', { day: '2-digit', month: 'long', year: 'numeric' })
        : '—';

      doc.setFontSize(6.5); doc.setFont(undefined, 'bold'); doc.setTextColor(...C.gris2);
      doc.text('FECHA', mg + 5, y + 5.5);
      doc.setFontSize(8); doc.setFont(undefined, 'bold'); doc.setTextColor(...C.oscuro);
      doc.text(fechaFmt, mg + 5, y + 10.5);

      doc.setDrawColor(...C.gris4); doc.setLineWidth(0.3);
      doc.line(mg + 68, y + 2, mg + 68, y + 12);

      doc.setFontSize(6.5); doc.setFont(undefined, 'bold'); doc.setTextColor(...C.gris2);
      doc.text('PROYECTO', mg + 73, y + 5.5);
      doc.setFontSize(8); doc.setFont(undefined, 'bold'); doc.setTextColor(...C.oscuro);
      doc.text(project?.name || reporte.projectId || '—', mg + 73, y + 10.5);

      doc.line(mg + 140, y + 2, mg + 140, y + 12);

      doc.setFontSize(6.5); doc.setFont(undefined, 'bold'); doc.setTextColor(...C.gris2);
      doc.text('ESTADO EQUIPO', mg + 145, y + 5.5);
      const estadoLabel = (reporte.estadoMaquina || 'operativa').toLowerCase();
      const estadoColor = estadoLabel.includes('detenida') ? C.rojo : estadoLabel.includes('manten') ? C.amber : C.verde;
      const estadoBg = estadoLabel.includes('detenida') ? C.rojoClaro : estadoLabel.includes('manten') ? C.amberClaro : C.verdeClaro;
      fillRect(mg + 145, y + 6.5, 28, 5, 1.5, estadoBg, null);
      doc.setFontSize(6.5); doc.setFont(undefined, 'bold'); doc.setTextColor(...estadoColor);
      doc.text((reporte.estadoMaquina || 'Operativa').toUpperCase(), mg + 147, y + 10.4);

      y += 20;

      // ══════════════════════════════════════════════════════════════
      // EQUIPO + OPERADOR
      // ══════════════════════════════════════════════════════════════
      sectionTitle(mg, y, 'INFORMACIÓN DEL EQUIPO', C.morado);
      y += 13;

      const cardW = (cW - 4) / 2;
      fillRect(mg, y, cardW, 32, 2, C.gris5, C.gris4);
      fillRect(mg + cardW + 4, y, cardW, 32, 2, C.gris5, C.gris4);

      // Tarjeta equipo
      doc.setFontSize(6.5); doc.setFont(undefined, 'bold'); doc.setTextColor(...C.gris3);
      doc.text('EQUIPO / MÁQUINA', mg + 4, y + 5.5);
      doc.setFontSize(10); doc.setFont(undefined, 'bold'); doc.setTextColor(...C.oscuro);
      doc.text(machine?.patente || machine?.code || '—', mg + 4, y + 12.5);
      doc.setFontSize(7.5); doc.setFont(undefined, 'normal'); doc.setTextColor(...C.gris2);
      doc.text(machine?.name || '—', mg + 4, y + 18.5);
      // chip tipo
      if (machine?.type) {
        fillRect(mg + 4, y + 21, Math.min(doc.getTextWidth(machine.type) + 6, cardW - 8), 5.5, 1.5, C.moradoClaro, null);
        doc.setFontSize(6.5); doc.setFont(undefined, 'bold'); doc.setTextColor(...C.morado);
        doc.text(machine.type.toUpperCase(), mg + 7, y + 25);
      }
      doc.setFontSize(6.5); doc.setFont(undefined, 'normal'); doc.setTextColor(...C.gris3);
      doc.text(`Código: ${machine?.code || '—'}`, mg + 4, y + 29.5);

      // Tarjeta operador
      const x2 = mg + cardW + 8;
      doc.setFontSize(6.5); doc.setFont(undefined, 'bold'); doc.setTextColor(...C.gris3);
      doc.text('OPERADOR', x2, y + 5.5);
      doc.setFontSize(10); doc.setFont(undefined, 'bold'); doc.setTextColor(...C.oscuro);
      doc.text(reporte.operador || '—', x2, y + 12.5);
      doc.setFontSize(7.5); doc.setFont(undefined, 'normal'); doc.setTextColor(...C.gris2);
      doc.text(`RUT: ${reporte.rut || '—'}`, x2, y + 18.5);

      y += 38;

      // ══════════════════════════════════════════════════════════════
      // MÉTRICAS OPERACIONALES
      // ══════════════════════════════════════════════════════════════
      sectionTitle(mg, y, 'MÉTRICAS OPERACIONALES', C.morado);
      y += 13;

      const numBoxes = mostrarKm ? 3 : 2;
      const boxGap = 3;
      const boxW = (cW - boxGap * (numBoxes - 1)) / numBoxes;
      const boxH = 36;

      // ── Horómetro ──
      fillRect(mg, y, boxW, boxH, 2.5, C.gris5, C.gris4);
      doc.setFillColor(...C.morado); doc.rect(mg, y, 2.5, boxH, 'F');
      doc.setFontSize(6.5); doc.setFont(undefined, 'bold'); doc.setTextColor(...C.gris3);
      doc.text('HORÓMETRO', mg + 5, y + 5.5);
      doc.setFontSize(16); doc.setFont(undefined, 'bold'); doc.setTextColor(...C.morado);
      doc.text(`${horasTrabajadas}`, mg + 5, y + 18);
      doc.setFontSize(7); doc.setFont(undefined, 'bold'); doc.setTextColor(...C.morado);
      doc.text('hrs trabajadas', mg + 5, y + 23.5);
      doc.setDrawColor(...C.gris4); doc.setLineWidth(0.3);
      doc.line(mg + 5, y + 27, mg + boxW - 3, y + 27);
      doc.setFontSize(6.5); doc.setFont(undefined, 'normal'); doc.setTextColor(...C.gris3);
      doc.text(`Ini: ${reporte.horometroInicial || '0'} h`, mg + 5, y + 31.5);
      doc.text(`Fin: ${reporte.horometroFinal || '0'} h`, mg + boxW / 2, y + 31.5);

      let cx = mg + boxW + boxGap;

      // ── Kilometraje (si aplica) ──
      if (mostrarKm) {
        fillRect(cx, y, boxW, boxH, 2.5, C.gris5, C.gris4);
        doc.setFillColor(...C.azul); doc.rect(cx, y, 2.5, boxH, 'F');
        doc.setFontSize(6.5); doc.setFont(undefined, 'bold'); doc.setTextColor(...C.gris3);
        doc.text('KILOMETRAJE', cx + 5, y + 5.5);
        doc.setFontSize(16); doc.setFont(undefined, 'bold'); doc.setTextColor(...C.azul);
        doc.text(`${kmRecorridos}`, cx + 5, y + 18);
        doc.setFontSize(7); doc.setFont(undefined, 'bold'); doc.setTextColor(...C.azul);
        doc.text('km recorridos', cx + 5, y + 23.5);
        doc.setDrawColor(...C.gris4); doc.setLineWidth(0.3);
        doc.line(cx + 5, y + 27, cx + boxW - 3, y + 27);
        doc.setFontSize(6.5); doc.setFont(undefined, 'normal'); doc.setTextColor(...C.gris3);
        doc.text(`Ini: ${reporte.kilometrajeInicial || '0'} km`, cx + 5, y + 31.5);
        doc.text(`Fin: ${reporte.kilometrajeFinal || '0'} km`, cx + boxW / 2, y + 31.5);
        cx += boxW + boxGap;
      }

      // ── Combustible ──
      fillRect(cx, y, boxW, boxH, 2.5, C.gris5, C.gris4);
      doc.setFillColor(...C.amber); doc.rect(cx, y, 2.5, boxH, 'F');
      doc.setFontSize(6.5); doc.setFont(undefined, 'bold'); doc.setTextColor(...C.gris3);
      doc.text('COMBUSTIBLE', cx + 5, y + 5.5);
      doc.setFontSize(16); doc.setFont(undefined, 'bold'); doc.setTextColor(...C.amber);
      doc.text(`${reporte.cargaCombustible || '0'}`, cx + 5, y + 18);
      doc.setFontSize(7); doc.setFont(undefined, 'bold'); doc.setTextColor(...C.amber);
      doc.text('litros cargados', cx + 5, y + 23.5);

      y += boxH + 10;

      // ══════════════════════════════════════════════════════════════
      // REGISTRO DE ACTIVIDADES
      // ══════════════════════════════════════════════════════════════
      const tieneActividades =
        (reporte.actividadesEfectivas?.length > 0) ||
        (reporte.tiemposNoEfectivos?.length > 0) ||
        reporte.tiemposProgramados ||
        (reporte.mantenciones?.length > 0);

      if (tieneActividades) {
        if (y > pH - 60) { doc.addPage(); y = mg; }

        sectionTitle(mg, y, 'REGISTRO DE ACTIVIDADES', C.morado);
        y += 13;

        // Consolidar actividades
        const todasActividades = [];

        reporte.actividadesEfectivas?.forEach(act => {
          if (act?.horaInicio && act?.horaFin) todasActividades.push({
            tipo: 'Efectiva', titulo: act.actividad || 'Sin descripción',
            inicio: act.horaInicio, fin: act.horaFin,
            duracion: calcularDuracionMinutos(act.horaInicio, act.horaFin),
            color: C.verde, bg: C.verdeClaro,
          });
        });

        reporte.tiemposNoEfectivos?.forEach(t => {
          if (t?.horaInicio && t?.horaFin) todasActividades.push({
            tipo: 'No Efectiva', titulo: t.motivo || 'Sin motivo',
            inicio: t.horaInicio, fin: t.horaFin,
            duracion: calcularDuracionMinutos(t.horaInicio, t.horaFin),
            color: C.amber, bg: C.amberClaro,
          });
        });

        const tp = reporte.tiemposProgramados;
        const programados = [
          { key: 'charlaSegurid',    label: 'Charla de Seguridad', color: C.azul,   bg: C.azulClaro  },
          { key: 'inspeccionEquipo', label: 'Inspección de Equipo', color: C.morado, bg: C.moradoClaro},
          { key: 'colacion',         label: 'Colación',             color: C.rosa,   bg: C.rosaClaro  },
        ];
        if (tp) programados.forEach(({ key, label, color, bg }) => {
          const t = tp[key];
          if (t?.horaInicio && t?.horaFin) todasActividades.push({
            tipo: 'Programado', titulo: label,
            inicio: t.horaInicio, fin: t.horaFin,
            duracion: calcularDuracionMinutos(t.horaInicio, t.horaFin),
            color, bg,
          });
        });

        reporte.mantenciones?.forEach(m => {
          if (m?.horaInicio && m?.horaFin) todasActividades.push({
            tipo: 'Mantención', titulo: m.tipo || m.descripcion || 'Sin descripción',
            inicio: m.horaInicio, fin: m.horaFin,
            duracion: calcularDuracionMinutos(m.horaInicio, m.horaFin),
            color: C.rojo, bg: C.rojoClaro,
          });
        });

        todasActividades.sort((a, b) => {
          if (!a.inicio || !b.inicio) return 0;
          const [hA, mA] = a.inicio.split(':').map(Number);
          const [hB, mB] = b.inicio.split(':').map(Number);
          return (hA * 60 + mA) - (hB * 60 + mB);
        });

        // Header tabla
        const rH = 8.5;
        const cols = [28, 76, 20, 20, 18]; // tipo, desc, ini, fin, dur
        fillRect(mg, y, cW, rH, 0, C.oscuro, null);
        doc.setFontSize(6.5); doc.setFont(undefined, 'bold'); doc.setTextColor(...C.gris3);
        let xp = mg + 3;
        ['TIPO', 'DESCRIPCIÓN', 'INICIO', 'FIN', 'DURACIÓN'].forEach((h, i) => {
          doc.text(h, xp, y + 5.8);
          xp += cols[i];
        });
        y += rH;

        todasActividades.forEach((act, idx) => {
          if (y > pH - 28) { doc.addPage(); y = mg; }

          // Fondo alternado con tinte de color
          fillRect(mg, y, cW, rH, 0, idx % 2 === 0 ? C.blanco : C.gris5, null);

          // Acento izquierdo de color
          doc.setFillColor(...act.color); doc.rect(mg, y, 2.5, rH, 'F');

          // Chip tipo
          xp = mg + 4;
          const chipW = Math.min(doc.getTextWidth(act.tipo) * 1.3 + 4, cols[0] - 4);
          fillRect(xp, y + 1.5, chipW, 5.5, 1.2, act.bg, null);
          doc.setFontSize(6); doc.setFont(undefined, 'bold'); doc.setTextColor(...act.color);
          doc.text(act.tipo, xp + 2, y + 5.8);

          xp += cols[0];
          doc.setFontSize(7); doc.setFont(undefined, 'normal'); doc.setTextColor(...C.oscuro);
          const tit = (act.titulo || '').length > 38 ? act.titulo.substring(0, 38) + '…' : act.titulo;
          doc.text(tit || '—', xp, y + 5.8);

          xp += cols[1];
          doc.setFont(undefined, 'bold'); doc.setTextColor(...C.gris2);
          doc.text(act.inicio || '—', xp, y + 5.8);

          xp += cols[2];
          doc.text(act.fin || '—', xp, y + 5.8);

          xp += cols[3];
          const dur = act.duracion || 0;
          doc.setTextColor(...C.oscuro);
          doc.text(`${Math.floor(dur/60)}h ${dur%60}m`, xp, y + 5.8);

          // Separador
          doc.setDrawColor(...C.gris4); doc.setLineWidth(0.2);
          doc.line(mg, y + rH, mg + cW, y + rH);
          y += rH;
        });

        y += 8;
      }

      // ══════════════════════════════════════════════════════════════
      // OBSERVACIONES
      // ══════════════════════════════════════════════════════════════
      if (reporte.observaciones) {
        if (y > pH - 40) { doc.addPage(); y = mg; }
        sectionTitle(mg, y, 'OBSERVACIONES', C.morado);
        y += 13;
        const obsLines = doc.splitTextToSize(reporte.observaciones, cW - 10);
        const obsH = Math.max(16, obsLines.length * 5 + 8);
        fillRect(mg, y, cW, obsH, 2, C.gris5, C.gris4);
        doc.setFillColor(...C.morado); doc.rect(mg, y, 2.5, obsH, 'F');
        doc.setFontSize(8); doc.setFont(undefined, 'normal'); doc.setTextColor(...C.oscuro);
        doc.text(obsLines, mg + 6, y + 6);
        y += obsH + 8;
      }

      // ══════════════════════════════════════════════════════════════
      // VALIDACIÓN / FIRMA
      // ══════════════════════════════════════════════════════════════
      if (y > pH - 44) { doc.addPage(); y = mg; }
      if (firmado && reporte.firmaAdmin) {
        fillRect(mg, y, cW, 28, 3, C.verdeClaro, C.verde, 0.4);
        doc.setFillColor(...C.verde); doc.roundedRect(mg, y, 3, 28, 1.5, 1.5, 'F');
        doc.setFillColor(...C.verde); doc.circle(mg + 14, y + 14, 7, 'F');
        doc.setFontSize(12); doc.setFont(undefined, 'bold'); doc.setTextColor(...C.blanco);
        doc.text('✓', mg + 11.5, y + 16.5);
        doc.setFontSize(9.5); doc.setFont(undefined, 'bold'); doc.setTextColor(...C.verde);
        doc.text('DOCUMENTO VALIDADO', mg + 26, y + 10);
        doc.setFontSize(7.5); doc.setFont(undefined, 'normal'); doc.setTextColor(...C.gris2);
        doc.text(`Validado por: ${reporte.firmaAdmin.nombre}`, mg + 26, y + 17);
        doc.text(`Fecha: ${new Date(reporte.firmaAdmin.timestamp).toLocaleString('es-CL')}`, mg + 26, y + 23);
        doc.setFontSize(6); doc.setTextColor(...C.gris3);
        doc.text('Documento validado digitalmente con firma electrónica autorizada.', pW - mg - 5, y + 25, { align: 'right' });
      } else {
        fillRect(mg, y, cW, 20, 3, C.rojoClaro, C.rojo, 0.3);
        doc.setFillColor(...C.rojo); doc.roundedRect(mg, y, 3, 20, 1.5, 1.5, 'F');
        doc.setFontSize(8); doc.setFont(undefined, 'bold'); doc.setTextColor(...C.rojo);
        doc.text('PENDIENTE DE VALIDACIÓN', mg + 12, y + 11.5);
        doc.setFontSize(7); doc.setFont(undefined, 'normal'); doc.setTextColor(...C.gris2);
        doc.text('Este documento aún no ha sido firmado por un administrador.', mg + 12, y + 17);
      }

      // ══════════════════════════════════════════════════════════════
      // FOOTER
      // ══════════════════════════════════════════════════════════════
      doc.setFillColor(...C.oscuro);
      doc.rect(0, pH - 12, pW, 12, 'F');
      doc.setFillColor(...C.morado);
      doc.rect(0, pH - 12, 4, 12, 'F');
      doc.setFontSize(6); doc.setFont(undefined, 'normal'); doc.setTextColor(...C.gris3);
      doc.text('MPF Ingeniería Civil · Work Fleet · Control Operacional de Maquinaria', mg, pH - 5.5);
      doc.text(`Generado: ${new Date().toLocaleString('es-CL')} · Reporte ${index + 1} de ${reportesAGenerar.length}`, pW - mg, pH - 5.5, { align: 'right' });
    });

    doc.save(`Reportes_WorkFleet_${new Date().toISOString().split('T')[0]}.pdf`);
    setReportesSeleccionados([]);
  };

  // Función auxiliar para calcular duración en minutos
  const calcularDuracionMinutos = (inicio, fin) => {
    if (!inicio || !fin) return 0;
    const [hInicio, mInicio] = inicio.split(':').map(Number);
    const [hFin, mFin] = fin.split(':').map(Number);
    return (hFin * 60 + mFin) - (hInicio * 60 + mInicio);
  };

  // Descargar como Excel
  const descargarExcel = () => {
    const datosExcel = reportesFiltrados.map(r => {
      const horasTrabajadas = r.horometroFinal && r.horometroInicial 
        ? (parseFloat(r.horometroFinal) - parseFloat(r.horometroInicial)).toFixed(2)
        : '0';
      
      const kmRecorridos = r.kilometrajeFinal && r.kilometrajeInicial
        ? (parseFloat(r.kilometrajeFinal) - parseFloat(r.kilometrajeInicial)).toFixed(2)
        : '0';

      return {
        'Cod. Obra': r.projectId || '',
        'Obra': r.projectName,
        'Fecha': r.fecha,
        'Cod./ Patente': r.machinePatente || r.machineId,
        'Máquina': r.machineName || r.machineId,
        'N° de Reporte': r.numeroReporte,
        'Nombre Operador': r.operador,
        'Rut Operador': r.rut,
        'Horas Inicial': r.horometroInicial || '0',
        'Horas Final': r.horometroFinal || '0',
        'Horas Trabaj.': horasTrabajadas,
        'Kilometraje Inicial': r.kilometrajeInicial || '0',
        'Kilometraje Final': r.kilometrajeFinal || '0',
        'Kilometraje Recorr.': kmRecorridos,
        'Combust.': r.cargaCombustible || '0'
      };
    });

    const ws = XLSX.utils.json_to_sheet(datosExcel);
    
    // Ajustar ancho de columnas
    const columnWidths = [
      { wch: 12 }, // Cod. Obra
      { wch: 20 }, // Obra
      { wch: 12 }, // Fecha
      { wch: 15 }, // Cod./Patente
      { wch: 20 }, // Máquina
      { wch: 15 }, // N° Reporte
      { wch: 25 }, // Nombre Operador
      { wch: 15 }, // Rut Operador
      { wch: 10 }, // Horas Inicial
      { wch: 10 }, // Horas Final
      { wch: 10 }, // Horas Trabaj.
      { wch: 12 }, // Km Inicial
      { wch: 12 }, // Km Final
      { wch: 12 }, // Km Recorr.
      { wch: 10 }  // Combust.
    ];
    ws['!cols'] = columnWidths;

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Reportes WorkFleet');
    XLSX.writeFile(wb, `Reportes_WorkFleet_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  // Descargar como PDF
  const descargarPDF = () => {
    const doc = new jsPDF('landscape');
    
    doc.setFontSize(18);
    doc.text('Reportes WorkFleet', 14, 15);
    
    doc.setFontSize(10);
    doc.text(`Generado: ${new Date().toLocaleDateString()}`, 14, 22);
    doc.text(`Total de reportes: ${reportesFiltrados.length}`, 14, 27);

    const tableData = reportesFiltrados.map(r => {
      const horasTrabajadas = r.horometroFinal && r.horometroInicial 
        ? (parseFloat(r.horometroFinal) - parseFloat(r.horometroInicial)).toFixed(2)
        : '0';
      
      const kmRecorridos = r.kilometrajeFinal && r.kilometrajeInicial
        ? (parseFloat(r.kilometrajeFinal) - parseFloat(r.kilometrajeInicial)).toFixed(2)
        : '0';

      return [
        r.projectName || '',
        r.fecha,
        r.machinePatente || '',
        r.numeroReporte,
        r.operador,
        r.rut,
        r.horometroInicial || '0',
        r.horometroFinal || '0',
        horasTrabajadas,
        r.kilometrajeInicial || '0',
        r.kilometrajeFinal || '0',
        kmRecorridos,
        r.cargaCombustible || '0'
      ];
    });

    doc.autoTable({
      head: [[
        'Obra',
        'Fecha',
        'Patente',
        'N° Rep.',
        'Operador',
        'RUT',
        'H.Ini',
        'H.Fin',
        'H.Trab',
        'Km.Ini',
        'Km.Fin',
        'Km.Rec',
        'Comb.'
      ]],
      body: tableData,
      startY: 35,
      styles: { fontSize: 7 },
      headStyles: { fillColor: [124, 58, 237], fontSize: 7 },
      columnStyles: {
        0: { cellWidth: 25 },
        1: { cellWidth: 20 },
        2: { cellWidth: 18 },
        3: { cellWidth: 20 },
        4: { cellWidth: 30 },
        5: { cellWidth: 22 },
        6: { cellWidth: 13 },
        7: { cellWidth: 13 },
        8: { cellWidth: 13 },
        9: { cellWidth: 13 },
        10: { cellWidth: 13 },
        11: { cellWidth: 13 },
        12: { cellWidth: 13 }
      }
    });

    doc.save(`Reportes_WorkFleet_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-purple-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-600 font-semibold">Cargando reportes...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-purple-50 p-4 sm:p-6 lg:p-8">
      {/* Header */}
      <div className="max-w-7xl mx-auto mb-8">
        <div className="bg-gradient-to-r from-indigo-600 via-indigo-700 to-purple-700 rounded-2xl shadow-2xl p-8 relative overflow-hidden">
          <div className="absolute inset-0 bg-grid opacity-10"></div>
          <div className="relative z-10">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center">
                  <svg className="w-9 h-9 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <div>
                  <h1 className="text-3xl font-black text-white tracking-tight">Reportes de Maquinaria</h1>
                  <p className="text-indigo-100 text-sm mt-1">Control y gestión de reportes de equipos</p>
                </div>
              </div>
              <button
                onClick={() => setShowNuevoReporte(true)}
                className="px-6 py-3 bg-white hover:bg-indigo-50 text-indigo-700 font-bold rounded-xl transition-all shadow-lg hover:shadow-xl flex items-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                Nuevo Reporte
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Filtros */}
      <div className="max-w-7xl mx-auto mb-6">
        <div className="bg-white rounded-xl shadow-md p-6 border-2 border-indigo-100">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            {/* Fecha Inicio */}
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">Fecha Inicio</label>
              <input
                type="date"
                value={filtros.fechaInicio}
                onChange={(e) => handleFiltroChange('fechaInicio', e.target.value)}
                className="w-full px-4 py-2 border-2 border-indigo-200 rounded-lg focus:outline-none focus:border-indigo-500"
              />
            </div>

            {/* Fecha Fin */}
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">Fecha Fin</label>
              <input
                type="date"
                value={filtros.fechaFin}
                onChange={(e) => handleFiltroChange('fechaFin', e.target.value)}
                className="w-full px-4 py-2 border-2 border-indigo-200 rounded-lg focus:outline-none focus:border-indigo-500"
              />
            </div>

            {/* Proyecto/Obra */}
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">Proyecto</label>
              <select
                value={filtros.proyecto}
                onChange={(e) => handleFiltroChange('proyecto', e.target.value)}
                className="w-full px-4 py-2 border-2 border-indigo-200 rounded-lg focus:outline-none focus:border-indigo-500"
              >
                <option value="">Todos</option>
                {projects.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>

            {/* Máquina */}
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">Máquina</label>
              <select
                value={filtros.maquina}
                onChange={(e) => handleFiltroChange('maquina', e.target.value)}
                className="w-full px-4 py-2 border-2 border-indigo-200 rounded-lg focus:outline-none focus:border-indigo-500"
              >
                <option value="">Todas</option>
                {machines.map(m => (
                  <option key={m.id} value={m.id}>{m.code || m.patente || m.name}</option>
                ))}
              </select>
            </div>

            {/* Operador */}
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">Operador</label>
              <select
                value={filtros.operador}
                onChange={(e) => handleFiltroChange('operador', e.target.value)}
                className="w-full px-4 py-2 border-2 border-indigo-200 rounded-lg focus:outline-none focus:border-indigo-500"
              >
                <option value="">Todos</option>
                {operadores.map(o => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex items-center justify-between mt-4 pt-4 border-t border-slate-200">
            <button
              onClick={limpiarFiltros}
              className="px-4 py-2 text-sm text-indigo-600 hover:text-indigo-800 font-semibold transition-colors flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Limpiar Filtros
            </button>
          </div>
        </div>
      </div>



      {/* Botones de Acción */}
      <div className="max-w-7xl mx-auto mb-6">
        <div className="bg-white rounded-xl shadow-md p-4 border-2 border-indigo-100">
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => setShowImport(true)}
              className="px-3 sm:px-4 py-2 rounded-lg sm:rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-white font-semibold text-sm transition-all shadow-lg hover:shadow-xl flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              Importar Excel
            </button>
            <button
              onClick={() => setShowPreview(true)}
              disabled={reportesFiltrados.length === 0}
              className="px-3 sm:px-4 py-2 rounded-lg sm:rounded-xl bg-slate-600 hover:bg-slate-700 text-white font-semibold text-sm disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg hover:shadow-xl flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
              Previsualizar
            </button>
            <button
              onClick={descargarPDFMasivoDetallado}
              disabled={reportesSeleccionados.length === 0}
              className="px-3 sm:px-4 py-2 rounded-lg sm:rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-semibold text-sm disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg hover:shadow-xl flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              PDF Detallado ({reportesSeleccionados.length})
            </button>
            <button
              onClick={descargarExcel}
              disabled={reportesFiltrados.length === 0}
              className="px-3 sm:px-4 py-2 rounded-lg sm:rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-semibold text-sm disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg hover:shadow-xl flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Excel
            </button>
            <button
              onClick={descargarPDF}
              disabled={reportesFiltrados.length === 0}
              className="px-3 sm:px-4 py-2 rounded-lg sm:rounded-xl bg-gradient-to-r from-rose-600 to-pink-600 hover:from-rose-500 hover:to-pink-500 text-white font-semibold text-sm disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg hover:shadow-xl flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
              PDF Resumen
            </button>
            <div className="flex-1"></div>
            <div className="text-sm text-slate-600 flex items-center gap-2">
              <span className="font-semibold">Total registros:</span>
              <span className="px-3 py-1 bg-indigo-100 text-indigo-700 rounded-full font-bold">
                {reportesFiltrados.length}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Tabla de reportes - Estilo profesional con colores indigo/purple */}
      <div className="max-w-7xl mx-auto">
        <div className="bg-white rounded-2xl shadow-lg overflow-hidden border-2 border-indigo-100">
          {/* Mensaje informativo para mandantes */}
          {userRole === 'mandante' && (
            <div className="bg-gradient-to-r from-indigo-50 to-purple-50 border-b-2 border-indigo-200 p-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-full bg-indigo-500 flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="flex-1">
                  <h3 className="text-sm font-bold text-indigo-900 mb-1">Vista de Mandante</h3>
                  <p className="text-xs text-indigo-700">
                    Como mandante, solo visualiza reportes que han sido <strong>validados y firmados</strong> por un administrador. 
                    Puede seleccionar reportes y descargar PDFs detallados de los mismos.
                  </p>
                </div>
              </div>
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gradient-to-r from-indigo-600 via-indigo-700 to-purple-700 text-white">
                <tr>
                  <th className="px-3 py-4 text-center text-xs font-bold uppercase tracking-wider w-12">
                    <input
                      type="checkbox"
                      checked={todosSeleccionados}
                      onChange={toggleSeleccionarTodos}
                      className="w-4 h-4 rounded border-white/30 text-indigo-600 focus:ring-2 focus:ring-white/50 cursor-pointer"
                    />
                  </th>
                <th className="px-3 py-4 text-left text-xs font-bold uppercase tracking-wider">N° Reporte</th>
                <th className="px-3 py-4 text-left text-xs font-bold uppercase tracking-wider">Obra</th>
                <th className="px-3 py-4 text-left text-xs font-bold uppercase tracking-wider">Fecha</th>
                <th className="px-3 py-4 text-left text-xs font-bold uppercase tracking-wider">Patente</th>
                <th className="px-3 py-4 text-left text-xs font-bold uppercase tracking-wider">Operador</th>
                <th className="px-3 py-4 text-left text-xs font-bold uppercase tracking-wider">RUT</th>
                <th className="px-2 py-4 text-center text-xs font-bold uppercase tracking-wider" colSpan="3">Horas</th>
                <th className="px-2 py-4 text-center text-xs font-bold uppercase tracking-wider" colSpan="3">Kilometraje</th>
                <th className="px-3 py-4 text-left text-xs font-bold uppercase tracking-wider">Comb.</th>
                <th className="px-3 py-4 text-center text-xs font-bold uppercase tracking-wider">Firmado</th>
                <th className="px-3 py-4 text-center text-xs font-bold uppercase tracking-wider">Acciones</th>
                </tr>
              </thead>
              <thead className="bg-indigo-700">
                <tr>
                  <th></th>
                  <th colSpan="6"></th>
                  <th className="px-1 py-2 text-xs font-semibold text-white">Ini</th>
                  <th className="px-1 py-2 text-xs font-semibold text-white">Fin</th>
                  <th className="px-1 py-2 text-xs font-semibold text-white">Trab.</th>
                  <th className="px-1 py-2 text-xs font-semibold text-white">Ini</th>
                  <th className="px-1 py-2 text-xs font-semibold text-white">Fin</th>
                  <th className="px-1 py-2 text-xs font-semibold text-white">Rec.</th>
                  <th colSpan="2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-indigo-100">
                {reportesFiltrados.length === 0 ? (
                <tr>
                  <td colSpan="15" className="px-6 py-12 text-center text-slate-500">
                    <div className="flex flex-col items-center gap-3">
                      <svg className="w-16 h-16 text-indigo-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      <p className="font-semibold">No se encontraron reportes</p>
                      <p className="text-sm">
                        {userRole === 'mandante' 
                          ? 'No hay reportes firmados disponibles. Los reportes deben ser validados por un administrador para aparecer aquí.'
                          : 'Ajusta los filtros para ver resultados'
                        }
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                reportesFiltrados.slice((paginaActual - 1) * ITEMS_POR_PAGINA, paginaActual * ITEMS_POR_PAGINA).map((reporte, index) => {
                  const horasTrabajadas = reporte.horometroFinal && reporte.horometroInicial 
                    ? (parseFloat(reporte.horometroFinal) - parseFloat(reporte.horometroInicial)).toFixed(2)
                    : '0';
                  
                  const kmRecorridos = reporte.kilometrajeFinal && reporte.kilometrajeInicial
                    ? (parseFloat(reporte.kilometrajeFinal) - parseFloat(reporte.kilometrajeInicial)).toFixed(2)
                    : '0';

                  return (
                    <tr key={reporte.id} className={`hover:bg-indigo-50 transition-colors ${index % 2 === 0 ? 'bg-white' : 'bg-indigo-50/30'}`}>
                      <td className="px-3 py-3 text-center">
                        <input
                          type="checkbox"
                          checked={reportesSeleccionados.includes(reporte.id)}
                          onChange={() => toggleReporteSeleccionado(reporte.id)}
                          className="w-4 h-4 rounded border-indigo-300 text-indigo-600 focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                        />
                      </td>
                      <td className="px-3 py-3 text-sm">
                        <button
                          onClick={() => setReporteDetalle(reporte)}
                          className="font-black text-indigo-600 hover:text-indigo-800 hover:underline transition-colors"
                        >
                          {reporte.numeroReporte}
                        </button>
                      </td>
                      <td className="px-3 py-3 text-sm text-slate-900">{reporte.projectName || '-'}</td>
                      <td className="px-3 py-3 text-sm text-slate-900">{reporte.fecha}</td>
                      <td className="px-3 py-3 text-sm font-semibold text-indigo-600">{reporte.machinePatente || '-'}</td>
                      <td className="px-3 py-3 text-sm text-slate-900">{reporte.operador}</td>
                      <td className="px-3 py-3 text-sm text-slate-600">{reporte.rut}</td>
                      <td className="px-1 py-3 text-sm text-slate-900 text-center">{reporte.horometroInicial || '0'}</td>
                      <td className="px-1 py-3 text-sm text-slate-900 text-center">{reporte.horometroFinal || '0'}</td>
                      <td className="px-1 py-3 text-sm font-bold text-emerald-600 text-center">{horasTrabajadas}</td>
                      <td className="px-1 py-3 text-sm text-slate-900 text-center">{reporte.kilometrajeInicial || '0'}</td>
                      <td className="px-1 py-3 text-sm text-slate-900 text-center">{reporte.kilometrajeFinal || '0'}</td>
                      <td className="px-1 py-3 text-sm font-bold text-emerald-600 text-center">{kmRecorridos}</td>
                      <td className="px-3 py-3 text-sm text-slate-900">{reporte.cargaCombustible || '0'}</td>
                      <td className="px-3 py-3 text-center">
                        {reporte.firmado ? (
                          <div className="flex items-center justify-center">
                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-md">
                              <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                              </svg>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center justify-center">
                            <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center">
                              <svg className="w-5 h-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </div>
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-3 text-center">
                        {userRole === 'administrador' && !reporte.firmado && (
                          <button
                            onClick={(e) => { e.stopPropagation(); handleEliminarReporte(reporte.id); }}
                            className="flex items-center gap-1 px-2.5 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg text-xs font-bold transition-all border border-red-200"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                            Eliminar
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Paginador */}
        {reportesFiltrados.length > ITEMS_POR_PAGINA && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 bg-white rounded-b-xl">
            <span className="text-xs text-slate-500">
              Mostrando {Math.min((paginaActual - 1) * ITEMS_POR_PAGINA + 1, reportesFiltrados.length)}–{Math.min(paginaActual * ITEMS_POR_PAGINA, reportesFiltrados.length)} de {reportesFiltrados.length} reportes
            </span>
            <div className="flex items-center gap-1">
              <button onClick={() => setPaginaActual(p => Math.max(1, p - 1))} disabled={paginaActual === 1}
                className="px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-600 disabled:opacity-40 transition-all">← Anterior</button>
              {Array.from({ length: Math.ceil(reportesFiltrados.length / ITEMS_POR_PAGINA) }, (_, i) => i + 1)
                .filter(p => p === 1 || p === Math.ceil(reportesFiltrados.length / ITEMS_POR_PAGINA) || Math.abs(p - paginaActual) <= 1)
                .reduce((acc, p, i, arr) => { if (i > 0 && arr[i-1] !== p - 1) acc.push('...'); acc.push(p); return acc; }, [])
                .map((p, i) => p === '...'
                  ? <span key={i} className="px-2 text-slate-400 text-xs">…</span>
                  : <button key={p} onClick={() => setPaginaActual(p)}
                      className={`w-8 h-8 rounded-lg text-xs font-bold transition-all ${paginaActual === p ? 'bg-indigo-600 text-white shadow' : 'bg-slate-100 hover:bg-slate-200 text-slate-600'}`}
                    >{p}</button>
                )}
              <button onClick={() => setPaginaActual(p => Math.min(Math.ceil(reportesFiltrados.length / ITEMS_POR_PAGINA), p + 1))} disabled={paginaActual === Math.ceil(reportesFiltrados.length / ITEMS_POR_PAGINA)}
                className="px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-600 disabled:opacity-40 transition-all">Siguiente →</button>
            </div>
          </div>
        )}
      </div>
      </div>


      {/* Panel de Análisis en Tiempo Real */}
      {reportesFiltrados.length > 0 && (() => {
        const totalReportes = reportesFiltrados.length;
        const firmados = reportesFiltrados.filter(r => r.firmado).length;

        let totalHoras = 0, totalKm = 0, totalCombustible = 0;
        let horasEfectivas = 0, horasNoEfectivas = 0, horasMantenciones = 0, horasProgramadas = 0;
        let cntEfectivas = 0, cntNoEfectivas = 0, cntMantenciones = 0, cntProgramadas = 0;
        let minHoras = Infinity, maxHoras = -Infinity;

        const calcMin = (ini, fin) => {
          if (!ini || !fin) return 0;
          const [hI, mI] = ini.split(':').map(Number);
          const [hF, mF] = fin.split(':').map(Number);
          return Math.max(0, (hF * 60 + mF) - (hI * 60 + mI));
        };

        const porMaquina = {};

        reportesFiltrados.forEach(r => {
          // Horas totales = columna Trab. = horometroFinal - horometroInicial
          const horas = (parseFloat(r.horometroFinal) || 0) - (parseFloat(r.horometroInicial) || 0);
          const km = (parseFloat(r.kilometrajeFinal) || 0) - (parseFloat(r.kilometrajeInicial) || 0);
          const comb = parseFloat(r.cargaCombustible) || 0;
          totalHoras += horas;
          totalKm += km;
          totalCombustible += comb;
          if (horas > 0) { minHoras = Math.min(minHoras, horas); maxHoras = Math.max(maxHoras, horas); }

          // Desglose horas por tipo de actividad (en horas decimales)
          r.actividadesEfectivas?.forEach(a => { const h = calcMin(a.horaInicio, a.horaFin) / 60; horasEfectivas += h; if (h > 0) cntEfectivas++; });
          r.tiemposNoEfectivos?.forEach(t => { const h = calcMin(t.horaInicio, t.horaFin) / 60; horasNoEfectivas += h; if (h > 0) cntNoEfectivas++; });
          r.mantenciones?.forEach(m => { const h = calcMin(m.horaInicio, m.horaFin) / 60; horasMantenciones += h; if (h > 0) cntMantenciones++; });
          const tp = r.tiemposProgramados;
          if (tp) {
            const hC = calcMin(tp.charlaSegurid?.horaInicio, tp.charlaSegurid?.horaFin) / 60;
            const hI = calcMin(tp.inspeccionEquipo?.horaInicio, tp.inspeccionEquipo?.horaFin) / 60;
            const hCol = calcMin(tp.colacion?.horaInicio, tp.colacion?.horaFin) / 60;
            horasProgramadas += hC + hI + hCol;
            if (hC > 0) cntProgramadas++; if (hI > 0) cntProgramadas++; if (hCol > 0) cntProgramadas++;
          }

          // Top máquinas
          const key = r.machinePatente || r.machineId;
          if (!porMaquina[key]) porMaquina[key] = { horas: 0, reportes: 0 };
          porMaquina[key].horas += horas;
          porMaquina[key].reportes += 1;
        });

        const horasPromedio = totalReportes > 0 ? (totalHoras / totalReportes) : 0;
        const eficienciaValidacion = totalReportes > 0 ? Math.round((firmados / totalReportes) * 100) : 0;
        const combustiblePorHora = totalHoras > 0 ? (totalCombustible / totalHoras) : 0;
        const kmPorHora = totalHoras > 0 ? (totalKm / totalHoras) : 0;
        const topMaquinas = Object.entries(porMaquina).sort((a, b) => b[1].horas - a[1].horas).slice(0, 3);
        const efColor = eficienciaValidacion >= 80 ? 'text-emerald-600' : eficienciaValidacion >= 50 ? 'text-amber-600' : 'text-red-500';
        const efBg = eficienciaValidacion >= 80 ? 'bg-emerald-50 border-emerald-200' : eficienciaValidacion >= 50 ? 'bg-amber-50 border-amber-200' : 'bg-red-50 border-red-200';

        const totalDesglose = horasEfectivas + horasNoEfectivas + horasMantenciones + horasProgramadas;

        return (
          <div className="max-w-7xl mx-auto mb-6 mt-6">
            <div className="bg-white rounded-xl shadow-md border border-slate-200 overflow-hidden">
              <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-2" style={{background: 'linear-gradient(135deg, #2A3F5F 0%, #0F1C2E 100%)'}}>
                <svg className="w-4 h-4 text-white/80" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
                <span className="text-sm font-bold text-white">Análisis en tiempo real</span>
                <span className="ml-auto text-xs text-white/50">{totalReportes} reporte{totalReportes !== 1 ? 's' : ''}</span>
              </div>

              <div className="p-5 space-y-5">
                {/* KPIs */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
                    <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Horas Totales</div>
                    <div className="text-2xl font-black text-slate-900">{totalHoras.toFixed(1)}</div>
                    <div className="text-xs text-slate-400 mt-0.5">hrs (Σ col. Trab.)</div>
                  </div>
                  <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
                    <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Promedio Diario</div>
                    <div className="text-2xl font-black text-slate-900">{horasPromedio.toFixed(1)}</div>
                    <div className="text-xs text-slate-400 mt-0.5">hrs / reporte</div>
                  </div>
                  <div className={`rounded-xl p-4 border ${efBg}`}>
                    <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Validación</div>
                    <div className={`text-2xl font-black ${efColor}`}>{eficienciaValidacion}%</div>
                    <div className="text-xs text-slate-400 mt-0.5">reportes firmados</div>
                    <div className="text-xs text-slate-500 mt-1">{firmados}/{totalReportes} validados</div>
                  </div>
                  <div className="bg-blue-50 rounded-xl p-4 border border-blue-200">
                    <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Kilometraje</div>
                    <div className="text-2xl font-black text-blue-700">{totalKm.toFixed(0)}</div>
                    <div className="text-xs text-slate-400 mt-0.5">km recorridos</div>
                    <div className="text-xs text-slate-500 mt-1">{kmPorHora.toFixed(1)} km/hr</div>
                  </div>
                </div>

                {/* Desglose + Top máquinas */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Desglose horas por tipo */}
                  <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
                    <div className="text-xs font-bold text-slate-600 uppercase tracking-wide mb-3">Desglose de Horas por Tipo</div>
                    <div className="space-y-2.5">
                      {[
                        { label: 'Efectivas', hrs: horasEfectivas, cnt: cntEfectivas, color: 'bg-red-500' },
                        { label: 'No Efectivas', hrs: horasNoEfectivas, cnt: cntNoEfectivas, color: 'bg-amber-500' },
                        { label: 'Mantenciones', hrs: horasMantenciones, cnt: cntMantenciones, color: 'bg-slate-500' },
                        { label: 'Programadas', hrs: horasProgramadas, cnt: cntProgramadas, color: 'bg-blue-400' },
                      ].map(({ label, hrs, cnt, color }) => {
                        const pct = totalDesglose > 0 ? (hrs / totalDesglose) * 100 : 0;
                        const prom = cnt > 0 ? (hrs / cnt) : 0;
                        return (
                          <div key={label}>
                            <div className="flex justify-between text-xs mb-1">
                              <div className="flex items-center gap-1.5">
                                <div className={`w-2 h-2 rounded-full ${color}`}></div>
                                <span className="text-slate-700">{label}</span>
                              </div>
                              <div className="text-right">
                                <span className="font-bold text-slate-800">{hrs.toFixed(1)} hrs</span>
                                <span className="text-slate-400 ml-1">({pct.toFixed(0)}%)</span>
                                {cnt > 0 && <span className="text-slate-400 ml-1">· prom {prom.toFixed(1)}h</span>}
                              </div>
                            </div>
                            <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
                              <div className={`h-full ${color} rounded-full`} style={{width: `${pct}%`}}></div>
                            </div>
                          </div>
                        );
                      })}

                    </div>
                  </div>

                  {/* Top máquinas */}
                  <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
                    <div className="text-xs font-bold text-slate-600 uppercase tracking-wide mb-3">Top Máquinas por Horas</div>
                    {topMaquinas.length > 0 ? (
                      <div className="space-y-3">
                        {topMaquinas.map(([patente, data], i) => {
                          const pct = totalHoras > 0 ? (data.horas / totalHoras) * 100 : 0;
                          const colors = ['bg-slate-800', 'bg-slate-600', 'bg-slate-400'];
                          return (
                            <div key={patente}>
                              <div className="flex justify-between text-xs mb-1">
                                <span className="font-semibold text-slate-700">{patente}</span>
                                <span className="text-slate-500">{data.horas.toFixed(1)} hrs · {data.reportes} rep.</span>
                              </div>
                              <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
                                <div className={`h-full ${colors[i]} rounded-full`} style={{width: `${pct}%`}}></div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="text-sm text-slate-400 text-center py-4">Sin datos</div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
      {/* Modal de Detalle del Reporte */}
      {reporteDetalle && (
        <ReporteDetalleModal
          reporte={reporteDetalle}
          onClose={() => setReporteDetalle(null)}
          projectName={projects.find(p => p.id === reporteDetalle.projectId)?.name}
          machineInfo={machines.find(m => m.id === reporteDetalle.machineId) || {
            patente: reporteDetalle.machinePatente || '',
            code:    reporteDetalle.machineCode    || '',
            name:    reporteDetalle.machineName    || '',
            type:    reporteDetalle.machineType    || '',
            marca:   reporteDetalle.machineMarca   || '',
          }}
          userRole={userRole}
          onSave={async (editedData) => {
            try {
              // Aquí implementarás la lógica para guardar los cambios en Firebase
              const reporteRef = doc(db, 'reportes_detallados', reporteDetalle.id);
              await updateDoc(reporteRef, editedData);
              console.log('Reporte actualizado:', editedData);
              
              // Recargar reportes
              const reportesRef = collection(db, 'reportes_detallados');
              const q = query(reportesRef, orderBy('fecha', 'desc'));
              const querySnapshot = await getDocs(q);
              const reportesData = querySnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
              }));
              setReportes(reportesData);
              
              // Actualizar el reporte en detalle
              setReporteDetalle({
                ...reporteDetalle,
                ...editedData
              });
            } catch (error) {
              console.error("Error guardando cambios:", error);
              alert("Error al guardar los cambios. Por favor intente nuevamente.");
            }
          }}
          onSign={async (signatureData, pin) => {
            try {
              // Validar el PIN del administrador contra Firebase
              if (!currentUser) {
                alert("Error: No hay usuario autenticado");
                return;
              }

              // Obtener el documento del usuario actual
              const userRef = doc(db, 'users', currentUser.uid);
              const userDoc = await getDoc(userRef);
              
              if (!userDoc.exists()) {
                alert("Error: No se encontró información del usuario");
                return;
              }

              const userData = userDoc.data();
              const storedPin = userData.pin;

              // Validar el PIN
              if (!storedPin) {
                alert("Error: El usuario no tiene un PIN configurado. Por favor contacte al administrador del sistema.");
                return;
              }

              if (storedPin !== pin) {
                alert("PIN incorrecto. Por favor verifique e intente nuevamente.");
                return;
              }

              // PIN correcto, proceder con la firma
              const reporteRef = doc(db, 'reportes_detallados', reporteDetalle.id);
              await updateDoc(reporteRef, {
                firmado: true,
                firmaAdmin: {
                  nombre: signatureData.adminName,
                  timestamp: signatureData.timestamp,
                  userId: currentUser.uid
                }
              });
              
              console.log('Reporte firmado exitosamente');
              
              // Recargar reportes
              const reportesRef = collection(db, 'reportes_detallados');
              const q = query(reportesRef, orderBy('fecha', 'desc'));
              const querySnapshot = await getDocs(q);
              const reportesData = querySnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
              }));
              setReportes(reportesData);
              
              // Actualizar el reporte en detalle
              setReporteDetalle({
                ...reporteDetalle,
                firmado: true,
                firmaAdmin: {
                  nombre: signatureData.adminName,
                  timestamp: signatureData.timestamp,
                  userId: currentUser.uid
                }
              });
              
              alert("✓ Reporte firmado y validado exitosamente");
            } catch (error) {
              console.error("Error firmando reporte:", error);
              alert("Error al firmar el reporte. Por favor intente nuevamente.");
            }
          }}
        />
      )}

      {/* Modal de Importación Masiva */}
      {/* Modal Nuevo Reporte */}
      {showNuevoReporte && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[95vh] flex flex-col overflow-hidden">
            <div className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-6 py-4 flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                  </svg>
                </div>
                <span className="font-black text-lg">Nuevo Reporte de Maquinaria</span>
              </div>
              <button onClick={() => setShowNuevoReporte(false)} className="w-8 h-8 bg-white/20 hover:bg-white/30 rounded-lg flex items-center justify-center transition-all">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="flex-1 overflow-auto">
              <ReportDetallado onClose={() => { setShowNuevoReporte(false); window.location.reload(); }} />
            </div>
          </div>
        </div>
      )}

      {showImport && (
        <ImportarExcelModal
          onClose={() => setShowImport(false)}
          machines={machines}
          projects={projects}
          empleados={empleados}
          onImportado={() => { setShowImport(false); /* recargar reportes */ window.location.reload(); }}
        />
      )}

      {/* Modal de Previsualización */}
      {showPreview && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-6xl w-full max-h-[90vh] overflow-hidden animate-fadeIn">
            <div className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white p-6 flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-black">Previsualización de Reportes</h2>
                <p className="text-indigo-100 text-sm mt-1">{reportesFiltrados.length} reportes seleccionados</p>
              </div>
              <button
                onClick={() => setShowPreview(false)}
                className="w-10 h-10 rounded-full hover:bg-white/20 flex items-center justify-center transition-colors"
              >
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-6 overflow-y-auto max-h-[calc(90vh-200px)]">
              <div className="space-y-3">
                {reportesFiltrados.map((reporte) => (
                  <div key={reporte.id} className="border border-slate-200 rounded-xl p-4 hover:bg-slate-50 transition-colors">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div>
                        <p className="text-xs text-slate-500 font-semibold">Fecha</p>
                        <p className="text-sm font-bold">{reporte.fecha}</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500 font-semibold">N° Reporte</p>
                        <p className="text-sm font-bold text-indigo-600">{reporte.numeroReporte}</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500 font-semibold">Operador</p>
                        <p className="text-sm">{reporte.operador}</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500 font-semibold">Máquina</p>
                        <p className="text-sm font-semibold">{reporte.machinePatente || reporte.machineId}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="border-t border-slate-200 p-6 flex justify-end gap-3 bg-slate-50">
              <button
                onClick={() => setShowPreview(false)}
                className="px-6 py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold rounded-xl transition-all"
              >
                Cerrar
              </button>
              <button
                onClick={() => {
                  descargarExcel();
                  setShowPreview(false);
                }}
                className="px-6 py-2.5 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white font-semibold rounded-xl transition-all shadow-lg"
              >
                📊 Descargar Excel
              </button>
              <button
                onClick={() => {
                  descargarPDF();
                  setShowPreview(false);
                }}
                className="px-6 py-2.5 bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white font-semibold rounded-xl transition-all shadow-lg"
              >
                📄 Descargar PDF
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


// ─────────────────────────────────────────────────────────────
// COMPONENTE: ImportarExcelModal
// ─────────────────────────────────────────────────────────────
function ImportarExcelModal({ onClose, machines, projects, empleados = [], onImportado }) {
  const [filas, setFilas] = React.useState([]);
  const [seleccionadas, setSeleccionadas] = React.useState(new Set());
  const [importando, setImportando] = React.useState(false);
  const [resultado, setResultado] = React.useState(null);
  const [paso, setPaso] = React.useState('upload');

  const parsearExcel = (file) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const wb = XLSX.read(data, { type: 'array', cellDates: true });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, dateNF: 'yyyy-mm-dd' });
        const headers = rows[0];
        const dataRows = rows.slice(1).filter(r => r.some(c => c));

        const get = (row, name) => {
          const idx = headers.findIndex(h => h?.toString().toLowerCase().includes(name.toLowerCase()));
          return idx >= 0 ? (row[idx]?.toString().trim() || '') : '';
        };

        const parsed = dataRows.map((row, i) => {
          let fecha = get(row, 'fecha');
          if (fecha.includes('/')) {
            const parts = fecha.split('/');
            if (parts[0].length <= 2) fecha = `${parts[2]}-${parts[1].padStart(2,'0')}-${parts[0].padStart(2,'0')}`;
          }
          const patente = get(row, 'patente').toUpperCase();
          const machine = machines.find(m => (m.patente||'').toUpperCase() === patente || (m.code||'').toUpperCase() === patente);
          const proyNombre = get(row, 'proyecto').toUpperCase();
          const project = projects.find(p => (p.name||'').toUpperCase() === proyNombre || (p.codigo||'').toUpperCase() === proyNombre);

          // Buscar empleado en Firebase por nombre (case-insensitive)
          const nombreExcel = get(row, 'empleado').toLowerCase().trim();
          const empleadoMatch = empleados.find(e => {
            const nombreDB = (e.nombre || e.name || e.displayName || '').toLowerCase().trim();
            return nombreDB === nombreExcel;
          });

          return {
            _row: i + 2,
            _machineMatch: !!machine,
            _projectMatch: !!project,
            folioExterno:       get(row, 'folio'),
            fecha,
            projectId:          project?.id || '',
            projectName:        project?.name || get(row, 'proyecto'),
            machineId:          machine?.id        || '',
            machinePatente:     machine?.patente   || patente || '',
            machineCode:        machine?.code      || '',
            machineName:        machine?.name      || get(row, 'modelo'),
            machineType:        machine?.type      || get(row, 'tipo maquina'),
            machineMarca:       machine?.marca     || get(row, 'marca'),
            operador:           get(row, 'empleado'),
            rut: (() => {
              const r = empleadoMatch?.rut || '';
              if (!r) return '';
              // Formatear con puntos si no los tiene: 12345678-9 → 12.345.678-9
              const [num, dv] = r.replace(/\./g, '').split('-');
              if (!num) return r;
              return num.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + (dv ? '-' + dv : '');
            })(),
            _empleadoMatch:     !!empleadoMatch,
            horometroInicial:   get(row, 'horometro inicial').replace(/[^0-9.]/g,''),
            horometroFinal:     get(row, 'horometro final').replace(/[^0-9.]/g,''),
            kilometrajeInicial: get(row, 'kilometraje inicial').replace(/[^0-9.]/g,''),
            kilometrajeFinal:   get(row, 'kilometraje final').replace(/[^0-9.]/g,''),
            cargaCombustible:   get(row, 'litros').replace(/[^0-9.]/g,'') || '0',
            actividadesEfectivas: [{ actividad: '', horaInicio: '', horaFin: '' }],
            tiemposNoEfectivos:   [{ motivo: '', horaInicio: '', horaFin: '' }],
            tiemposProgramados:   { charlaSegurid: { horaInicio: '', horaFin: '' }, inspeccionEquipo: { horaInicio: '', horaFin: '' }, colacion: { horaInicio: '', horaFin: '' } },
            mantenciones:       [],
            tieneMantenciones:  false,
            observaciones:      get(row, 'obs'),
            estadoMaquina:      'operativa',
            firmado:            false,
            importadoDeExcel:   true,
          };
        });

        setFilas(parsed);
        setSeleccionadas(new Set(parsed.map((_, i) => i)));
        setPaso('preview');
      } catch (err) { alert('Error al leer el archivo: ' + err.message); }
    };
    reader.readAsArrayBuffer(file);
  };

  const toggleFila = (i) => { const s = new Set(seleccionadas); s.has(i) ? s.delete(i) : s.add(i); setSeleccionadas(s); };
  const toggleTodas = () => setSeleccionadas(seleccionadas.size === filas.length ? new Set() : new Set(filas.map((_, i) => i)));

  const importar = async () => {
    setImportando(true);
    const ok = [], errores = [];
    for (const fila of filas.filter((_, i) => seleccionadas.has(i))) {
      try {
        const patente = fila.machinePatente || 'XX';
        const countSnap = await getDocs(collection(db, 'reportes_detallados'));
        const num = (countSnap.size + 1).toString().padStart(3, '0');
        const numeroReporte = `${patente}-${num}`;
        await addDoc(collection(db, 'reportes_detallados'), {
          numeroReporte, folioExterno: fila.folioExterno, fecha: fila.fecha,
          projectId: fila.projectId, projectName: fila.projectName,
          machineId: fila.machineId, machinePatente: fila.machinePatente, machineCode: fila.machineCode,
          machineName: fila.machineName, machineType: fila.machineType, machineMarca: fila.machineMarca,
          operador: fila.operador, rut: fila.rut || '',
          horometroInicial: fila.horometroInicial, horometroFinal: fila.horometroFinal,
          kilometrajeInicial: fila.kilometrajeInicial, kilometrajeFinal: fila.kilometrajeFinal,
          cargaCombustible: fila.cargaCombustible,
          actividadesEfectivas: fila.actividadesEfectivas,
          tiemposNoEfectivos: fila.tiemposNoEfectivos,
          tiemposProgramados: fila.tiemposProgramados,
          mantenciones: [], tieneMantenciones: false,
          observaciones: fila.observaciones, estadoMaquina: 'operativa',
          firmado: false, importadoDeExcel: true,
          createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
        });
        ok.push(numeroReporte);
      } catch (err) { errores.push(`Fila ${fila._row}: ${err.message}`); }
    }
    setResultado({ ok, errores });
    setImportando(false);
    setPaso('done');
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden">

        {/* Header */}
        <div className="bg-gradient-to-r from-amber-500 to-orange-500 text-white p-5 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-black">Importación Masiva desde Excel</h2>
              <p className="text-amber-100 text-xs">
                {paso === 'upload' && 'Sube el archivo Excel con los reportes'}
                {paso === 'preview' && `${filas.length} filas detectadas — selecciona las que quieres importar`}
                {paso === 'done' && 'Importación completada'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 bg-white/20 hover:bg-white/30 rounded-lg flex items-center justify-center transition-all">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {/* Contenido */}
        <div className="flex-1 overflow-auto p-5">

          {paso === 'upload' && (
            <label className="flex flex-col items-center justify-center w-full h-48 border-2 border-dashed border-amber-300 rounded-2xl cursor-pointer hover:bg-amber-50 transition-all bg-amber-50/50">
              <svg className="w-10 h-10 text-amber-400 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <span className="text-sm font-bold text-amber-700">Haz clic para seleccionar el archivo Excel</span>
              <span className="text-xs text-amber-500 mt-1">.xlsx o .xls</span>
              <input type="file" accept=".xlsx,.xls" className="hidden" onChange={e => e.target.files[0] && parsearExcel(e.target.files[0])} />
            </label>
          )}

          {paso === 'preview' && (
            <div className="space-y-3">
              <div className="flex items-center gap-4 text-xs text-slate-500 bg-slate-50 rounded-xl p-3 flex-wrap">
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-emerald-400 inline-block"/>Máquina/Proyecto encontrado en sistema</span>
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block"/>No encontrado (se importa sin vincular)</span>
                <span className="ml-auto font-semibold text-slate-700">{seleccionadas.size} de {filas.length} seleccionadas</span>
              </div>
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-slate-800 text-white">
                      <th className="px-3 py-2.5 text-center"><input type="checkbox" checked={seleccionadas.size === filas.length} onChange={toggleTodas} className="w-3.5 h-3.5 rounded"/></th>
                      {['Folio','Fecha','Proyecto','Patente','Tipo','Marca','Operador','H.Ini','H.Fin','Km.Ini','Km.Fin'].map(h => (
                        <th key={h} className="px-3 py-2.5 text-left font-bold tracking-wide whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filas.map((f, i) => (
                      <tr key={i} onClick={() => toggleFila(i)} className={`border-t border-slate-100 cursor-pointer transition-colors ${seleccionadas.has(i) ? 'bg-amber-50 hover:bg-amber-100' : 'bg-white hover:bg-slate-50 opacity-40'}`}>
                        <td className="px-3 py-2 text-center"><input type="checkbox" checked={seleccionadas.has(i)} onChange={() => toggleFila(i)} onClick={e => e.stopPropagation()} className="w-3.5 h-3.5 rounded"/></td>
                        <td className="px-3 py-2 font-mono font-bold text-slate-600">{f.folioExterno||'—'}</td>
                        <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{f.fecha}</td>
                        <td className="px-3 py-2"><span className={`font-semibold text-xs ${f._projectMatch?'text-emerald-700':'text-amber-600'}`}>{f.projectName||'—'}</span></td>
                        <td className="px-3 py-2"><span className={`font-mono font-bold px-1.5 py-0.5 rounded text-[11px] ${f._machineMatch?'bg-emerald-100 text-emerald-700':'bg-amber-100 text-amber-700'}`}>{f.machinePatente||'—'}</span></td>
                        <td className="px-3 py-2 text-slate-500 whitespace-nowrap">{f.machineType}</td>
                        <td className="px-3 py-2 text-slate-500">{f.machineMarca}</td>
                        <td className="px-3 py-2 max-w-[120px]">
                          <div className="truncate text-slate-700 text-xs">{f.operador}</div>
                          {f.rut
                            ? <div className="text-[10px] text-emerald-600 font-bold">{f.rut}</div>
                            : <div className="text-[10px] text-amber-500">sin RUT</div>
                          }
                        </td>
                        <td className="px-3 py-2 text-center">{f.horometroInicial||'—'}</td>
                        <td className="px-3 py-2 text-center">{f.horometroFinal||'—'}</td>
                        <td className="px-3 py-2 text-center">{f.kilometrajeInicial||'—'}</td>
                        <td className="px-3 py-2 text-center">{f.kilometrajeFinal||'—'}</td>

                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-slate-400 italic">* Los reportes se importan en estado borrador. Completa los horarios editando cada uno.</p>
            </div>
          )}

          {paso === 'done' && resultado && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-4 bg-emerald-50 border border-emerald-200 rounded-2xl">
                <div className="w-10 h-10 bg-emerald-100 rounded-full flex items-center justify-center flex-shrink-0">
                  <svg className="w-6 h-6 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>
                </div>
                <div>
                  <p className="font-black text-emerald-800">{resultado.ok.length} reportes importados correctamente</p>
                  <p className="text-xs text-emerald-600 mt-0.5">Ahora puedes abrirlos para completar los horarios de actividades y firmar.</p>
                </div>
              </div>
              {resultado.errores.length > 0 && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-2xl">
                  <p className="font-bold text-red-700 mb-2">{resultado.errores.length} errores:</p>
                  {resultado.errores.map((e, i) => <p key={i} className="text-xs text-red-600">• {e}</p>)}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-slate-100 p-4 flex justify-end gap-3 flex-shrink-0 bg-slate-50">
          <button onClick={onClose} className="px-5 py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold rounded-xl text-sm transition-all">
            {paso === 'done' ? 'Cerrar' : 'Cancelar'}
          </button>
          {paso === 'preview' && (
            <button onClick={importar} disabled={importando || seleccionadas.size === 0}
              className="px-5 py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 hover:opacity-90 disabled:opacity-50 text-white font-bold rounded-xl text-sm transition-all shadow-md flex items-center gap-2"
            >
              {importando
                ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/>Importando...</>
                : <><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/></svg>Importar {seleccionadas.size} reportes</>
              }
            </button>
          )}
          {paso === 'done' && resultado?.ok.length > 0 && (
            <button onClick={onImportado} className="px-5 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-bold rounded-xl text-sm shadow-md">
              Ver reportes →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
