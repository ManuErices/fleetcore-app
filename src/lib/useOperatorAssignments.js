import { useState, useEffect } from 'react';
import { listEmployees, listEmployeeAssignments, listEmployeeMonthlyData } from './db';
import { useEmpresa } from './useEmpresa';

/**
 * Hook para obtener operadores asignados a máquinas
 * Devuelve un mapa: machineId -> operador con datos del mes
 */
export function useOperatorAssignments(projectId, year = null, month = null) {
  // empresaId va primero en todas las funciones de db.js. Antes se omitía y
  // los argumentos se corrían: el mapa de operadores salía siempre vacío.
  const { empresaId } = useEmpresa();
  const [operatorsByMachine, setOperatorsByMachine] = useState({});
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!projectId || !empresaId) return;

    const currentYear = year || new Date().getFullYear();
    const currentMonth = month || new Date().getMonth() + 1;

    (async () => {
      setIsLoading(true);
      try {
        // Cargar empleados, asignaciones y datos mensuales
        const [employees, assignments, monthlyData] = await Promise.all([
          listEmployees(empresaId, projectId),
          listEmployeeAssignments(empresaId, projectId, currentYear, currentMonth),
          listEmployeeMonthlyData(empresaId, projectId, currentYear, currentMonth)
        ]);

        // Crear mapa de datos mensuales por empleado
        const monthlyByEmployee = {};
        monthlyData.forEach(m => {
          monthlyByEmployee[m.employeeId] = m;
        });

        // Crear mapa de operadores por máquina
        const operatorMap = {};
        assignments.forEach(assignment => {
          if (!assignment.machineId) return;

          const employee = employees.find(e => e.id === assignment.employeeId);
          if (!employee) return;

          const monthly = monthlyByEmployee[employee.id] || {
            diasTrabajados: 0,
            totalCosto: 0
          };

          operatorMap[assignment.machineId] = {
            id: employee.id,
            nombre: employee.nombre,
            rut: employee.rut,
            cargo: employee.cargo,
            diasTrabajados: monthly.diasTrabajados || 0,
            totalCosto: monthly.totalCosto || 0
          };
        });

        setOperatorsByMachine(operatorMap);
      } catch (err) {
        console.error('Error cargando operadores asignados:', err);
      } finally {
        setIsLoading(false);
      }
    })();
  }, [empresaId, projectId, year, month]);

  return { operatorsByMachine, isLoading };
}
