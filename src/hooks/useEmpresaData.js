import { useState, useEffect } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../lib/firebase";

export function useEmpresaData(empresaId) {
  const [projects, setProjects] = useState([]);
  const [machines, setMachines] = useState([]);
  const [machinesLocal, setMachinesLocal] = useState([]);
  const [empleados, setEmpleados] = useState([]);
  const [equiposSurtidores, setEquiposSurtidores] = useState([]);
  const [empresasLocal, setEmpresasLocal] = useState([]);
  const [estacionesLocal, setEstacionesLocal] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!empresaId) return;

    const cargar = async () => {
      setLoading(true);
      try {
        const [pSnap, mSnap, eSnap, eqSnap, empSnap, estSnap] = await Promise.all([
          getDocs(collection(db, 'empresas', empresaId, 'projects')),
          getDocs(collection(db, 'empresas', empresaId, 'machines')),
          getDocs(collection(db, 'empresas', empresaId, 'trabajadores')),
          getDocs(collection(db, 'empresas', empresaId, 'equipos_surtidores')),
          getDocs(collection(db, 'empresas', empresaId, 'empresas_combustible')),
          getDocs(collection(db, 'empresas', empresaId, 'estaciones_combustible'))
        ]);
        const loadedProjects = pSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        const loadedMachines = mSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        const loadedEmpleados = eSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        const loadedEquipos = eqSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        const loadedEmpresas = empSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        const loadedEstaciones = estSnap.docs.map(d => ({ id: d.id, ...d.data() }));

        setProjects(loadedProjects);
        setMachines(loadedMachines);
        setMachinesLocal(loadedMachines);
        setEmpleados(loadedEmpleados);
        setEquiposSurtidores(loadedEquipos);
        setEmpresasLocal(loadedEmpresas);
        setEstacionesLocal(loadedEstaciones);
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
    loading
  };
}
