import { useState, useEffect } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "../lib/firebase";
import { esSurtidor, estaActiva } from "../lib/maquinas";
import { trabajadorActivo } from "../lib/trabajadores";

export function useEmpresaData(empresaId) {
  const [projects, setProjects] = useState([]);
  const [machines, setMachines] = useState([]);
  const [machinesLocal, setMachinesLocal] = useState([]);
  const [empleados, setEmpleados] = useState([]);
  const [equiposSurtidores, setEquiposSurtidores] = useState([]);
  const [empresasLocal, setEmpresasLocal] = useState([]);
  const [estacionesLocal, setEstacionesLocal] = useState([]);
  const [subEmpresasLocal, setSubEmpresasLocal] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!empresaId) return;

    const cargar = async () => {
      setLoading(true);
      try {
        const [pSnap, mSnap, eSnap, eqSnap, empSnap, estSnap, subSnap] = await Promise.all([
          getDocs(collection(db, 'empresas', empresaId, 'projects')),
          getDocs(collection(db, 'empresas', empresaId, 'machines')),
          getDocs(collection(db, 'empresas', empresaId, 'trabajadores')),
          getDocs(collection(db, 'empresas', empresaId, 'equipos_surtidores')),
          getDocs(collection(db, 'empresas', empresaId, 'empresas_combustible')),
          getDocs(collection(db, 'empresas', empresaId, 'estaciones_combustible')),
          getDocs(query(collection(db, 'empresas'), where('parentEmpresaId', '==', empresaId)))
        ]);
        // Los selectores muestran solo lo vigente: obras activas, máquinas
        // activas (no dadas de baja) y trabajadores activos (un finiquitado
        // no recibe ni entrega combustible). La ficha sigue existiendo.
        const loadedProjects = pSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(p => p.active !== false);
        const loadedMachines = mSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(estaActiva);
        const loadedEmpleados = eSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(trabajadorActivo);
        // Surtidores: máquinas del maestro con esSurtidor + los de la colección
        // antigua que aún no se migran (Admin → Máquinas → Revisar maestro)
        const idsMaestro = new Set(loadedMachines.map(m => m.id));
        const loadedEquipos = [
          ...loadedMachines.filter(esSurtidor).map(m => ({ ...m, nombre: m.nombre || m.name || '' })),
          ...eqSnap.docs.filter(d => !idsMaestro.has(d.id)).map(d => ({ id: d.id, ...d.data() })).filter(estaActiva),
        ];
        const loadedEmpresas = empSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        const loadedEstaciones = estSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        const loadedSub = subSnap.docs.map(d => ({ id: d.id, ...d.data() }));

        setProjects(loadedProjects);
        setMachines(loadedMachines);
        setMachinesLocal(loadedMachines);
        setEmpleados(loadedEmpleados);
        setEquiposSurtidores(loadedEquipos);
        setEmpresasLocal(loadedEmpresas);
        setEstacionesLocal(loadedEstaciones);
        setSubEmpresasLocal(loadedSub);
      } catch (err) {
        console.error('Error cargando datos de empresa:', err);
      } finally {
        setLoading(false);
      }
    };

    cargar();
  }, [empresaId]);

  return {
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
    loading
  };
}
