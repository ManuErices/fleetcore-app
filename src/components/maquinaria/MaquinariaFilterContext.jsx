import React, { createContext, useContext, useState, useEffect } from "react";
import { useEmpresa } from "../../lib/useEmpresa";
import { listAllProjects } from "../../lib/db";

// ============================================================
// MaquinariaFilterContext — filtro global del módulo por proyecto.
// El Shell provee el contexto; cada pantalla (Dashboard, Equipos,
// OT, Fallas) lo lee para filtrar sus datos por projectId.
//
// projectId === "" significa "todos los proyectos".
// ============================================================
const MaquinariaFilterContext = createContext({
  projectId: "",
  setProjectId: () => {},
  projects: [],
});

export function MaquinariaFilterProvider({ children }) {
  const { empresaId } = useEmpresa();
  const [projectId, setProjectId] = useState("");
  const [projects, setProjects] = useState([]);

  useEffect(() => {
    if (!empresaId) return;
    (async () => {
      try {
        setProjects(await listAllProjects(empresaId));
      } catch {
        setProjects([]);
      }
    })();
  }, [empresaId]);

  return (
    <MaquinariaFilterContext.Provider value={{ projectId, setProjectId, projects }}>
      {children}
    </MaquinariaFilterContext.Provider>
  );
}

export function useMaquinariaFilter() {
  return useContext(MaquinariaFilterContext);
}

// Helper: filtra una lista de máquinas por el projectId activo
export function filterMachinesByProject(machines, projectId) {
  if (!projectId) return machines;
  return machines.filter((m) => m.projectId === projectId);
}

// Helper: filtra registros que referencian machineId, dado el set de máquinas válidas
export function filterByMachineIds(items, validMachineIds) {
  if (!validMachineIds) return items;
  return items.filter((it) => validMachineIds.has(it.machineId));
}
