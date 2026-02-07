import React, { useState, useEffect, useMemo } from "react";
import { collection, query, where, getDocs, orderBy, doc, getDoc, updateDoc } from "firebase/firestore";
import { db, auth } from "../lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import ReporteDetalleModal from "../components/ReporteDetalleModal";

export default function ReporteWorkFleet() {
  const [reportes, setReportes] = useState([]);
  const [projects, setProjects] = useState([]);
  const [machines, setMachines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showPreview, setShowPreview] = useState(false);
  const [reporteDetalle, setReporteDetalle] = useState(null);
  const [userRole, setUserRole] = useState('operador'); // Estado para el rol del usuario
  const [currentUser, setCurrentUser] = useState(null); // Usuario actual
  const [reportesSeleccionados, setReportesSeleccionados] = useState([]); // Reportes seleccionados para descarga masiva
  
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
        projectName: project?.name || r.projectId || '',
        machinePatente: machine?.patente || '',
        machineCode: machine?.code || '',
        machineName: machine?.name || ''
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

    reportesAGenerar.forEach((reporte, index) => {
      if (index > 0) {
        doc.addPage();
      }

      const project = projects.find(p => p.id === reporte.projectId);
      const machine = machines.find(m => m.id === reporte.machineId);
      
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 20;
      const contentWidth = pageWidth - (margin * 2);
      let yPos = margin;

      // ============ HEADER PROFESIONAL CON COLORES MPF ============
      // Barra superior morada
      doc.setFillColor(88, 80, 141); // Color morado MPF
      doc.rect(0, 0, pageWidth, 45, 'F');
      
      // Logo MPF (esquina superior izquierda)
      // NOTA: Para incluir el logo real, necesitas convertirlo a base64 y usar:
      // doc.addImage(logoBase64, 'PNG', margin, 10, 35, 25);
      // Por ahora usamos un placeholder blanco
      doc.setFillColor(255, 255, 255);
      doc.roundedRect(margin, 10, 35, 25, 2, 2, 'F');
      doc.setFontSize(7);
      doc.setTextColor(88, 80, 141);
      doc.setFont(undefined, 'bold');
      doc.text('MPF', margin + 12, 18);
      doc.setFontSize(5);
      doc.text('INGENIERÍA', margin + 9, 23);
      doc.text('CIVIL', margin + 13, 27);

      // Información del reporte (centro-derecha)
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(20);
      doc.setFont(undefined, 'bold');
      doc.text(`REPORTE DE EQUIPO`, margin + 45, 20);
      
      doc.setFontSize(10);
      doc.setFont(undefined, 'normal');
      doc.text(`N° ${reporte.numeroReporte}`, margin + 45, 27);
      
      doc.setFontSize(8);
      doc.text(`Fecha: ${reporte.fecha}`, margin + 45, 33);
      doc.text(`Proyecto: ${project?.name || reporte.projectId}`, margin + 45, 38);

      // Badge de estado firmado
      if (reporte.firmado) {
        doc.setFillColor(16, 185, 129); // Emerald
        doc.roundedRect(pageWidth - margin - 35, 12, 33, 10, 2, 2, 'F');
        doc.setFontSize(8);
        doc.setFont(undefined, 'bold');
        doc.setTextColor(255, 255, 255);
        doc.text('✓ VALIDADO', pageWidth - margin - 32, 18);
      }

      yPos = 55;

      // ============ INFORMACIÓN DEL EQUIPO Y OPERADOR ============
      doc.setDrawColor(209, 213, 219); // Gray 300
      doc.setLineWidth(0.5);
      doc.line(margin, yPos, pageWidth - margin, yPos);
      yPos += 8;

      // Título de sección
      doc.setFontSize(11);
      doc.setFont(undefined, 'bold');
      doc.setTextColor(88, 80, 141); // Morado MPF
      doc.text('INFORMACIÓN DEL EQUIPO', margin, yPos);
      yPos += 7;

      // Grid de información
      const colWidth = contentWidth / 2;
      
      // Columna izquierda - Equipo
      doc.setFontSize(8);
      doc.setFont(undefined, 'bold');
      doc.setTextColor(107, 114, 128); // Gray 500
      doc.text('EQUIPO', margin, yPos);
      
      doc.setFont(undefined, 'normal');
      doc.setTextColor(55, 65, 81); // Gray 700
      doc.setFontSize(9);
      doc.text(`Patente: ${machine?.patente || 'N/A'}`, margin, yPos + 5);
      doc.text(`Código: ${machine?.code || 'N/A'}`, margin, yPos + 10);
      doc.text(`Tipo: ${machine?.type || 'N/A'}`, margin, yPos + 15);
      doc.text(`Nombre: ${machine?.name || 'N/A'}`, margin, yPos + 20);

      // Columna derecha - Operador
      doc.setFontSize(8);
      doc.setFont(undefined, 'bold');
      doc.setTextColor(107, 114, 128);
      doc.text('OPERADOR', margin + colWidth, yPos);
      
      doc.setFont(undefined, 'normal');
      doc.setTextColor(55, 65, 81);
      doc.setFontSize(9);
      doc.text(`Nombre: ${reporte.operador}`, margin + colWidth, yPos + 5);
      doc.text(`RUT: ${reporte.rut}`, margin + colWidth, yPos + 10);

      yPos += 30;

      // ============ MÉTRICAS OPERACIONALES ============
      doc.setDrawColor(209, 213, 219);
      doc.line(margin, yPos, pageWidth - margin, yPos);
      yPos += 8;

      doc.setFontSize(11);
      doc.setFont(undefined, 'bold');
      doc.setTextColor(88, 80, 141); // Morado MPF
      doc.text('MÉTRICAS OPERACIONALES', margin, yPos);
      yPos += 10;

      const horasTrabajadas = ((parseFloat(reporte.horometroFinal) || 0) - (parseFloat(reporte.horometroInicial) || 0)).toFixed(2);
      const kmRecorridos = ((parseFloat(reporte.kilometrajeFinal) || 0) - (parseFloat(reporte.kilometrajeInicial) || 0)).toFixed(2);
      const mostrarKilometraje = machine?.type && (machine.type.toUpperCase().includes('CAMION') || machine.type.toUpperCase().includes('CAMIONETA'));

      // Cajas de métricas
      const boxHeight = 35; // Aumentado de 28 a 35 para incluir Standby
      const boxGap = 4;
      const numBoxes = mostrarKilometraje ? 3 : 2;
      const boxWidth = (contentWidth - (boxGap * (numBoxes - 1))) / numBoxes;

      // Horómetro
      doc.setFillColor(243, 244, 246); // Gray 100
      doc.roundedRect(margin, yPos, boxWidth, boxHeight, 2, 2, 'F');
      doc.setDrawColor(209, 213, 219);
      doc.setLineWidth(0.3);
      doc.roundedRect(margin, yPos, boxWidth, boxHeight, 2, 2, 'S');

      doc.setFontSize(8);
      doc.setFont(undefined, 'bold');
      doc.setTextColor(88, 80, 141); // Morado MPF
      doc.text('HORÓMETRO', margin + 2, yPos + 5);

      doc.setFontSize(7);
      doc.setFont(undefined, 'normal');
      doc.setTextColor(75, 85, 99); // Gray 600
      doc.text(`Inicial: ${reporte.horometroInicial || '0'} hrs`, margin + 2, yPos + 11);
      doc.text(`Final: ${reporte.horometroFinal || '0'} hrs`, margin + 2, yPos + 16);

      // Trabajadas
      doc.setFontSize(9);
      doc.setFont(undefined, 'bold');
      doc.setTextColor(88, 80, 141); // Morado MPF
      doc.text(`${horasTrabajadas} hrs`, margin + 2, yPos + 24);
      doc.setFontSize(6);
      doc.setFont(undefined, 'normal');
      doc.setTextColor(107, 114, 128);
      doc.text('TRABAJADAS', margin + 2, yPos + 27);

      // Standby (6 - trabajadas)
      const horasStandby = (6 - parseFloat(horasTrabajadas)).toFixed(2);
      doc.setFontSize(8);
      doc.setFont(undefined, 'bold');
      doc.setTextColor(217, 119, 6); // Amber 600
      doc.text(`${horasStandby} hrs`, margin + 2, yPos + 32);
      doc.setFontSize(5);
      doc.setFont(undefined, 'normal');
      doc.setTextColor(107, 114, 128);
      doc.text('STANDBY', margin + 2, yPos + 34);

      let currentX = margin + boxWidth + boxGap;

      // Kilometraje (si aplica)
      if (mostrarKilometraje) {
        doc.setFillColor(243, 244, 246);
        doc.roundedRect(currentX, yPos, boxWidth, boxHeight, 2, 2, 'F');
        doc.setDrawColor(209, 213, 219);
        doc.roundedRect(currentX, yPos, boxWidth, boxHeight, 2, 2, 'S');

        doc.setFontSize(8);
        doc.setFont(undefined, 'bold');
        doc.setTextColor(88, 80, 141);
        doc.text('KILOMETRAJE', currentX + 2, yPos + 5);

        doc.setFontSize(7);
        doc.setFont(undefined, 'normal');
        doc.setTextColor(75, 85, 99);
        doc.text(`Inicial: ${reporte.kilometrajeInicial || '0'} km`, currentX + 2, yPos + 11);
        doc.text(`Final: ${reporte.kilometrajeFinal || '0'} km`, currentX + 2, yPos + 16);

        doc.setFontSize(10);
        doc.setFont(undefined, 'bold');
        doc.setTextColor(88, 80, 141);
        doc.text(`${kmRecorridos} km`, currentX + 2, yPos + 24);
        doc.setFontSize(6);
        doc.setFont(undefined, 'normal');
        doc.setTextColor(107, 114, 128);
        doc.text('RECORRIDOS', currentX + 2, yPos + 27);

        currentX += boxWidth + boxGap;
      }

      // Combustible
      doc.setFillColor(243, 244, 246);
      doc.roundedRect(currentX, yPos, boxWidth, boxHeight, 2, 2, 'F');
      doc.setDrawColor(209, 213, 219);
      doc.roundedRect(currentX, yPos, boxWidth, boxHeight, 2, 2, 'S');

      doc.setFontSize(8);
      doc.setFont(undefined, 'bold');
      doc.setTextColor(88, 80, 141);
      doc.text('COMBUSTIBLE', currentX + 2, yPos + 5);

      doc.setFontSize(16);
      doc.setFont(undefined, 'bold');
      doc.setTextColor(88, 80, 141);
      const combustible = reporte.cargaCombustible || '0';
      doc.text(combustible, currentX + (boxWidth / 2) - (combustible.length * 2), yPos + 18);
      
      doc.setFontSize(6);
      doc.setFont(undefined, 'normal');
      doc.setTextColor(107, 114, 128);
      doc.text('LITROS', currentX + (boxWidth / 2) - 4, yPos + 24);

      yPos += boxHeight + 12;

      // ============ REGISTRO DE ACTIVIDADES ============
      if ((reporte.actividadesEfectivas && reporte.actividadesEfectivas.length > 0) ||
          (reporte.tiemposNoEfectivos && reporte.tiemposNoEfectivos.length > 0) ||
          (reporte.tiemposProgramados) ||
          (reporte.mantenciones && reporte.mantenciones.length > 0)) {
        
        doc.setDrawColor(209, 213, 219);
        doc.line(margin, yPos, pageWidth - margin, yPos);
        yPos += 8;

        doc.setFontSize(11);
        doc.setFont(undefined, 'bold');
        doc.setTextColor(88, 80, 141);
        doc.text('REGISTRO DE ACTIVIDADES', margin, yPos);
        yPos += 7;

        // Consolidar y ordenar actividades
        const todasActividades = [];

        if (reporte.actividadesEfectivas) {
          reporte.actividadesEfectivas.forEach(act => {
            todasActividades.push({
              tipo: 'Operativa',
              titulo: act.actividad,
              inicio: act.horaInicio,
              fin: act.horaFin,
              duracion: calcularDuracionMinutos(act.horaInicio, act.horaFin),
              color: [34, 197, 94],
              bgColor: [240, 253, 244],
              borderColor: [187, 247, 208]
            });
          });
        }

        if (reporte.tiemposNoEfectivos) {
          reporte.tiemposNoEfectivos.forEach(t => {
            todasActividades.push({
              tipo: 'Detención',
              titulo: t.motivo,
              inicio: t.horaInicio,
              fin: t.horaFin,
              duracion: calcularDuracionMinutos(t.horaInicio, t.horaFin),
              color: [234, 179, 8],
              bgColor: [254, 252, 232],
              borderColor: [253, 224, 71]
            });
          });
        }

        if (reporte.tiemposProgramados) {
          if (reporte.tiemposProgramados.charlaSegurid) {
            todasActividades.push({
              tipo: 'Programado',
              titulo: 'Charla de Seguridad',
              inicio: reporte.tiemposProgramados.charlaSegurid.horaInicio,
              fin: reporte.tiemposProgramados.charlaSegurid.horaFin,
              duracion: calcularDuracionMinutos(reporte.tiemposProgramados.charlaSegurid.horaInicio, reporte.tiemposProgramados.charlaSegurid.horaFin),
              color: [59, 130, 246],
              bgColor: [239, 246, 255],
              borderColor: [191, 219, 254]
            });
          }
          if (reporte.tiemposProgramados.inspeccionEquipo) {
            todasActividades.push({
              tipo: 'Programado',
              titulo: 'Inspección de Equipo',
              inicio: reporte.tiemposProgramados.inspeccionEquipo.horaInicio,
              fin: reporte.tiemposProgramados.inspeccionEquipo.horaFin,
              duracion: calcularDuracionMinutos(reporte.tiemposProgramados.inspeccionEquipo.horaInicio, reporte.tiemposProgramados.inspeccionEquipo.horaFin),
              color: [88, 80, 141], // Morado MPF
              bgColor: [237, 233, 254],
              borderColor: [196, 181, 253]
            });
          }
          if (reporte.tiemposProgramados.colacion) {
            todasActividades.push({
              tipo: 'Programado',
              titulo: 'Colación',
              inicio: reporte.tiemposProgramados.colacion.horaInicio,
              fin: reporte.tiemposProgramados.colacion.horaFin,
              duracion: calcularDuracionMinutos(reporte.tiemposProgramados.colacion.horaInicio, reporte.tiemposProgramados.colacion.horaFin),
              color: [236, 72, 153],
              bgColor: [253, 242, 248],
              borderColor: [251, 207, 232]
            });
          }
        }

        if (reporte.mantenciones) {
          reporte.mantenciones.forEach(m => {
            todasActividades.push({
              tipo: 'Mantención',
              titulo: m.descripcion,
              inicio: m.horaInicio,
              fin: m.horaFin,
              duracion: calcularDuracionMinutos(m.horaInicio, m.horaFin),
              color: [239, 68, 68],
              bgColor: [254, 242, 242],
              borderColor: [254, 202, 202]
            });
          });
        }

        // Ordenar cronológicamente
        todasActividades.sort((a, b) => {
          const [hA, mA] = a.inicio.split(':').map(Number);
          const [hB, mB] = b.inicio.split(':').map(Number);
          return (hA * 60 + mA) - (hB * 60 + mB);
        });

        // Tabla de actividades
        const tableStartY = yPos;
        const rowHeight = 8;
        const colWidths = [25, 70, 20, 20, 15];

        // Header de tabla
        doc.setFillColor(249, 250, 251); // Gray 50
        doc.rect(margin, yPos, contentWidth, rowHeight, 'F');
        doc.setDrawColor(209, 213, 219);
        doc.rect(margin, yPos, contentWidth, rowHeight, 'S');

        doc.setFontSize(7);
        doc.setFont(undefined, 'bold');
        doc.setTextColor(75, 85, 99);
        
        let xPos = margin + 2;
        doc.text('TIPO', xPos, yPos + 5);
        xPos += colWidths[0];
        doc.text('DESCRIPCIÓN', xPos, yPos + 5);
        xPos += colWidths[1];
        doc.text('INICIO', xPos, yPos + 5);
        xPos += colWidths[2];
        doc.text('FIN', xPos, yPos + 5);
        xPos += colWidths[3];
        doc.text('DURACIÓN', xPos, yPos + 5);

        yPos += rowHeight;

        // Filas de actividades
        todasActividades.forEach((act, idx) => {
          if (yPos > pageHeight - 40) {
            doc.addPage();
            yPos = margin;
          }

          // Fondo alternado
          if (idx % 2 === 0) {
            doc.setFillColor(255, 255, 255);
          } else {
            doc.setFillColor(249, 250, 251);
          }
          doc.rect(margin, yPos, contentWidth, rowHeight, 'F');

          // Indicador de color
          doc.setFillColor(act.color[0], act.color[1], act.color[2]);
          doc.rect(margin, yPos, 2, rowHeight, 'F');

          doc.setFontSize(7);
          doc.setFont(undefined, 'bold');
          doc.setTextColor(act.color[0], act.color[1], act.color[2]);
          
          xPos = margin + 4;
          doc.text(act.tipo, xPos, yPos + 5);
          
          doc.setFont(undefined, 'normal');
          doc.setTextColor(55, 65, 81);
          xPos += colWidths[0] - 2;
          const tituloTruncado = act.titulo.length > 35 ? act.titulo.substring(0, 35) + '...' : act.titulo;
          doc.text(tituloTruncado, xPos, yPos + 5);
          
          xPos += colWidths[1];
          doc.text(act.inicio, xPos, yPos + 5);
          
          xPos += colWidths[2];
          doc.text(act.fin, xPos, yPos + 5);
          
          doc.setFont(undefined, 'bold');
          xPos += colWidths[3];
          const horas = Math.floor(act.duracion / 60);
          const mins = act.duracion % 60;
          doc.text(`${horas}h ${mins}m`, xPos, yPos + 5);

          // Borde inferior
          doc.setDrawColor(243, 244, 246);
          doc.line(margin, yPos + rowHeight, pageWidth - margin, yPos + rowHeight);

          yPos += rowHeight;
        });

        yPos += 5;
      }

      // ============ OBSERVACIONES ============
      if (reporte.observaciones) {
        if (yPos > pageHeight - 40) {
          doc.addPage();
          yPos = margin;
        }

        doc.setDrawColor(209, 213, 219);
        doc.line(margin, yPos, pageWidth - margin, yPos);
        yPos += 8;

        doc.setFontSize(11);
        doc.setFont(undefined, 'bold');
        doc.setTextColor(88, 80, 141);
        doc.text('OBSERVACIONES', margin, yPos);
        yPos += 7;

        doc.setFillColor(249, 250, 251);
        doc.roundedRect(margin, yPos, contentWidth, 25, 2, 2, 'F');
        doc.setDrawColor(209, 213, 219);
        doc.roundedRect(margin, yPos, contentWidth, 25, 2, 2, 'S');

        doc.setFontSize(8);
        doc.setFont(undefined, 'normal');
        doc.setTextColor(75, 85, 99);
        const splitObs = doc.splitTextToSize(reporte.observaciones, contentWidth - 6);
        doc.text(splitObs, margin + 3, yPos + 5);

        yPos += 30;
      }

      // ============ FIRMA Y VALIDACIÓN ============
      if (reporte.firmado && reporte.firmaAdmin) {
        if (yPos > pageHeight - 40) {
          doc.addPage();
          yPos = margin;
        }

        doc.setFillColor(236, 253, 245); // Emerald 50
        doc.roundedRect(margin, yPos, contentWidth, 35, 2, 2, 'F');
        doc.setDrawColor(16, 185, 129); // Emerald 500
        doc.setLineWidth(1);
        doc.roundedRect(margin, yPos, contentWidth, 35, 2, 2, 'S');

        // Ícono de validación
        doc.setFillColor(16, 185, 129);
        doc.circle(margin + 8, yPos + 10, 5, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(12);
        doc.setFont(undefined, 'bold');
        doc.text('✓', margin + 6, yPos + 12);

        // Información de firma
        doc.setFontSize(10);
        doc.setFont(undefined, 'bold');
        doc.setTextColor(16, 185, 129);
        doc.text('REPORTE VALIDADO', margin + 18, yPos + 8);

        doc.setFontSize(8);
        doc.setFont(undefined, 'normal');
        doc.setTextColor(55, 65, 81);
        doc.text(`Validado por: ${reporte.firmaAdmin.nombre}`, margin + 18, yPos + 15);
        doc.text(`Fecha: ${new Date(reporte.firmaAdmin.timestamp).toLocaleString('es-CL')}`, margin + 18, yPos + 21);

        doc.setFontSize(6);
        doc.setTextColor(107, 114, 128);
        doc.text('Este documento ha sido validado digitalmente y posee validez legal según normativa vigente.', margin + 18, yPos + 29);
      }

      // NO HAY FOOTER - eliminado como solicitaste
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
    <div className="space-y-4 sm:space-y-6 p-4 sm:p-6">
      {/* Header - Estilo moderno con colores teal/cyan */}
      <div className="glass-card rounded-xl sm:rounded-2xl p-4 sm:p-6 animate-fadeInUp">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg sm:rounded-xl bg-gradient-to-br from-teal-600 to-cyan-600 flex items-center justify-center shadow-lg flex-shrink-0">
              <svg className="w-5 h-5 sm:w-6 sm:h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl lg:text-3xl font-black text-slate-900 tracking-tight">
                Reportes WorkFleet
              </h1>
              <p className="text-slate-600 mt-0.5 sm:mt-1 text-xs sm:text-sm">
                Visualiza y exporta reportes detallados
              </p>
            </div>
          </div>
        </div>

        {/* Filtros */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wider">Filtros</h2>
            <button
              onClick={limpiarFiltros}
              className="text-sm text-teal-600 hover:text-teal-800 font-semibold transition-colors"
            >
              Limpiar filtros
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
            {/* Fecha Inicio */}
            <div>
              <label className="block text-xs sm:text-sm font-semibold text-slate-700 mb-2">
                Fecha Inicial
              </label>
              <input
                type="date"
                value={filtros.fechaInicio}
                onChange={(e) => handleFiltroChange('fechaInicio', e.target.value)}
                className="input-modern text-sm sm:text-base"
              />
            </div>

            {/* Fecha Fin */}
            <div>
              <label className="block text-xs sm:text-sm font-semibold text-slate-700 mb-2">
                Fecha Final
              </label>
              <input
                type="date"
                value={filtros.fechaFin}
                onChange={(e) => handleFiltroChange('fechaFin', e.target.value)}
                className="input-modern text-sm sm:text-base"
              />
            </div>

            {/* Proyecto/Obra */}
            <div>
              <label className="block text-xs sm:text-sm font-semibold text-slate-700 mb-2">
                Obra
              </label>
              <select
                value={filtros.proyecto}
                onChange={(e) => handleFiltroChange('proyecto', e.target.value)}
                className="input-modern text-sm sm:text-base"
              >
                <option value="">Todas las obras</option>
                {projects.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>

            {/* Máquina */}
            <div>
              <label className="block text-xs sm:text-sm font-semibold text-slate-700 mb-2">
                Máquina
              </label>
              <select
                value={filtros.maquina}
                onChange={(e) => handleFiltroChange('maquina', e.target.value)}
                className="input-modern text-sm sm:text-base"
              >
                <option value="">Todas las máquinas</option>
                {machines.map(m => (
                  <option key={m.id} value={m.id}>{m.code || m.patente || m.name}</option>
                ))}
              </select>
            </div>

            {/* Operador */}
            <div>
              <label className="block text-xs sm:text-sm font-semibold text-slate-700 mb-2">
                Operador
              </label>
              <select
                value={filtros.operador}
                onChange={(e) => handleFiltroChange('operador', e.target.value)}
                className="input-modern text-sm sm:text-base"
              >
                <option value="">Todos los operadores</option>
                {operadores.map(o => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Resumen y botones de acción */}
          <div className="pt-4 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <div className="px-3 py-1.5 bg-teal-100 text-teal-700 rounded-lg">
                <span className="text-sm font-bold">{reportesFiltrados.length}</span>
                <span className="text-xs ml-1">reportes</span>
              </div>
              {filtros.fechaInicio && (
                <div className="text-xs text-slate-600">
                  desde <span className="font-semibold">{filtros.fechaInicio}</span>
                </div>
              )}
              {filtros.fechaFin && (
                <div className="text-xs text-slate-600">
                  hasta <span className="font-semibold">{filtros.fechaFin}</span>
                </div>
              )}
            </div>
            
            <div className="flex flex-wrap gap-2">
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
            </div>
          </div>
        </div>
      </div>

      {/* Tabla de reportes - Estilo profesional con colores teal */}
      <div className="glass-card rounded-xl sm:rounded-2xl overflow-hidden animate-fadeInUp">
        {/* Mensaje informativo para mandantes */}
        {userRole === 'mandante' && (
          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border-b-2 border-blue-200 p-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-bold text-blue-900 mb-1">Vista de Mandante</h3>
                <p className="text-xs text-blue-700">
                  Como mandante, solo visualiza reportes que han sido <strong>validados y firmados</strong> por un administrador. 
                  Puede seleccionar reportes y descargar PDFs detallados de los mismos.
                </p>
              </div>
            </div>
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gradient-to-r from-teal-600 via-cyan-600 to-teal-600 text-white">
              <tr>
                <th className="px-3 py-4 text-center text-xs font-bold uppercase tracking-wider w-12">
                  <input
                    type="checkbox"
                    checked={todosSeleccionados}
                    onChange={toggleSeleccionarTodos}
                    className="w-4 h-4 rounded border-white/30 text-teal-600 focus:ring-2 focus:ring-white/50 cursor-pointer"
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
              </tr>
              <tr className="bg-teal-700">
                <th></th>
                <th colSpan="6"></th>
                <th className="px-1 py-2 text-xs font-semibold">Ini</th>
                <th className="px-1 py-2 text-xs font-semibold">Fin</th>
                <th className="px-1 py-2 text-xs font-semibold">Trab.</th>
                <th className="px-1 py-2 text-xs font-semibold">Ini</th>
                <th className="px-1 py-2 text-xs font-semibold">Fin</th>
                <th className="px-1 py-2 text-xs font-semibold">Rec.</th>
                <th colSpan="2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {reportesFiltrados.length === 0 ? (
                <tr>
                  <td colSpan="15" className="px-6 py-12 text-center text-slate-500">
                    <div className="flex flex-col items-center gap-3">
                      <svg className="w-16 h-16 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
                reportesFiltrados.map((reporte, index) => {
                  const horasTrabajadas = reporte.horometroFinal && reporte.horometroInicial 
                    ? (parseFloat(reporte.horometroFinal) - parseFloat(reporte.horometroInicial)).toFixed(2)
                    : '0';
                  
                  const kmRecorridos = reporte.kilometrajeFinal && reporte.kilometrajeInicial
                    ? (parseFloat(reporte.kilometrajeFinal) - parseFloat(reporte.kilometrajeInicial)).toFixed(2)
                    : '0';

                  return (
                    <tr key={reporte.id} className={`hover:bg-teal-50 transition-colors ${index % 2 === 0 ? 'bg-white' : 'bg-slate-50'}`}>
                      <td className="px-3 py-3 text-center">
                        <input
                          type="checkbox"
                          checked={reportesSeleccionados.includes(reporte.id)}
                          onChange={() => toggleReporteSeleccionado(reporte.id)}
                          className="w-4 h-4 rounded border-slate-300 text-teal-600 focus:ring-2 focus:ring-teal-500 cursor-pointer"
                        />
                      </td>
                      <td className="px-3 py-3 text-sm">
                        <button
                          onClick={() => setReporteDetalle(reporte)}
                          className="font-black text-teal-600 hover:text-teal-800 hover:underline transition-colors"
                        >
                          {reporte.numeroReporte}
                        </button>
                      </td>
                      <td className="px-3 py-3 text-sm text-slate-900">{reporte.projectName || '-'}</td>
                      <td className="px-3 py-3 text-sm text-slate-900">{reporte.fecha}</td>
                      <td className="px-3 py-3 text-sm font-semibold text-cyan-600">{reporte.machinePatente || '-'}</td>
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
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal de Detalle del Reporte */}
      {reporteDetalle && (
        <ReporteDetalleModal
          reporte={reporteDetalle}
          onClose={() => setReporteDetalle(null)}
          projectName={projects.find(p => p.id === reporteDetalle.projectId)?.name}
          machineInfo={machines.find(m => m.id === reporteDetalle.machineId)}
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

      {/* Modal de Previsualización */}
      {showPreview && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-6xl w-full max-h-[90vh] overflow-hidden animate-fadeIn">
            <div className="bg-gradient-to-r from-purple-600 to-indigo-600 text-white p-6 flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-black">Previsualización de Reportes</h2>
                <p className="text-purple-100 text-sm mt-1">{reportesFiltrados.length} reportes seleccionados</p>
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
                        <p className="text-sm font-bold text-purple-600">{reporte.numeroReporte}</p>
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
