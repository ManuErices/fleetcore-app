import {
  collection,
  doc,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  Timestamp,
  writeBatch,
  serverTimestamp,
} from "firebase/firestore";
import { ref as storageRef, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import { db, storage } from "./firebase";

// ─── Multi-tenant: paths bajo /empresas/{empresaId}/ ─────────
// Las colecciones globales (settings, subscription_intents) NO pasan por aquí
const EMPRESA_COL = (empresaId, colName) =>
  collection(db, 'empresas', empresaId, colName);

// Colecciones de empresa
const COLS = [
  'projects', 'machines', 'dailyLogs', 'fuelLogs',
  'trabajadores', 'employeeMonthlyData', 'employeeAssignments',
  'purchaseOrders', 'rendiciones', 'subcontratos',
  'rentalClients', 'rentalContracts', 'rentalQuotes', 'rentalPayments',
];

// Helper: doc dentro de empresa
const EMPRESA_DOC = (empresaId, colName, docId) =>
  doc(db, 'empresas', empresaId, colName, docId);

// ─── Colecciones globales (superadmin only) ───────────────────
export const globalCol = (colName) => collection(db, colName);
export const globalDoc = (colName, docId) => doc(db, colName, docId);

// ============================================
// PROYECTOS
// ============================================

export async function listActiveProjects(empresaId) {
  const q = query(
    EMPRESA_COL(empresaId, 'projects'),
    where("active", "==", true),
    orderBy("name")
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// Lista TODOS los proyectos (activos e inactivos) — para la pantalla de gestión
export async function listAllProjects(empresaId) {
  if (!empresaId) return [];
  const q = query(
    EMPRESA_COL(empresaId, 'projects'),
    orderBy("name")
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// Crea o actualiza un proyecto
export async function upsertProject(empresaId, project) {
  const data = {
    name: String(project.name || '').trim(),
    codigo: String(project.codigo || '').trim(),
    active: project.active !== false,
    updatedAt: serverTimestamp(),
  };

  if (project.id) {
    const ref = EMPRESA_DOC(empresaId, 'projects', project.id);
    await updateDoc(ref, data);
    return { id: project.id, ...data };
  } else {
    data.createdAt = serverTimestamp();
    const ref = await addDoc(EMPRESA_COL(empresaId, 'projects'), data);
    return { id: ref.id, ...data };
  }
}

// Activa/desactiva un proyecto sin tocar el resto de sus datos
export async function toggleProjectActive(empresaId, projectId, active) {
  const ref = EMPRESA_DOC(empresaId, 'projects', projectId);
  await updateDoc(ref, { active, updatedAt: serverTimestamp() });
}

export async function deleteProject(empresaId, projectId) {
  await deleteDoc(EMPRESA_DOC(empresaId, 'projects', projectId));
}

// ============================================
// MÁQUINAS
// ============================================

export async function listMachines(empresaId, projectId) {
  if (!empresaId) return [];
  const col = EMPRESA_COL(empresaId, 'machines');
  const q = (projectId !== undefined && projectId !== null)
    ? query(col, where("projectId", "==", projectId), orderBy("code"))
    : query(col, orderBy("code"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function upsertMachine(empresaId, machine) {
  if (!machine.id || machine.id.trim() === "") {
    const { id, ...payload } = machine;
    const dataToSave = { 
      ...payload, 
      createdAt: Timestamp.now() 
    };
    const ref = await addDoc(EMPRESA_COL(empresaId, 'machines'), dataToSave);
    console.log("✅ Máquina creada con ID:", ref.id);
    return ref.id;
  }
  const { id, ...rest } = machine;
  await setDoc(
    EMPRESA_DOC(empresaId, 'machines', id),
    { ...rest, updatedAt: Timestamp.now() },
    { merge: true }
  );
  console.log("✅ Máquina actualizada con ID:", id);
  return id;
}

export async function deleteMachine(empresaId, machineId) {
  if (!machineId || machineId.trim() === "") {
    throw new Error("Machine ID is required for deletion");
  }
  await deleteDoc(EMPRESA_DOC(empresaId, 'machines', machineId));
}

// ============================================
// DAILY LOGS (DETALLE FLOTA)
// ============================================

export async function listLogsByRange(empresaId, projectId, dateFrom, dateTo) {
  console.log(`📊 Cargando logs: ${dateFrom} a ${dateTo}`);
  
  try {
    const q = query(
      EMPRESA_COL(empresaId, 'dailyLogs'),
      where("projectId", "==", projectId)
    );
    
    const snap = await getDocs(q);
    const allLogs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    
    const filtered = allLogs.filter(log => {
      return log.date >= dateFrom && log.date <= dateTo;
    });
    
    filtered.sort((a, b) => a.date.localeCompare(b.date));
    
    console.log(`✅ ${filtered.length} logs cargados de ${allLogs.length} totales`);
    return filtered;
    
  } catch (error) {
    console.error("❌ Error al cargar logs:", error);
    throw error;
  }
}

export async function upsertDailyLog(empresaId, log) {
  if (!log.id || log.id.trim() === "") {
    const { id, ...payload } = log;
    const dataToSave = {
      ...payload,
      createdAt: Timestamp.now()
    };
    const ref = await addDoc(EMPRESA_COL(empresaId, 'dailyLogs'), dataToSave);
    console.log("✅ Log creado con ID:", ref.id);
    return ref.id;
  }
  const { id, ...rest } = log;
  await updateDoc(EMPRESA_DOC(empresaId, 'dailyLogs', id), {
    ...rest,
    updatedAt: Timestamp.now(),
  });
  console.log("✅ Log actualizado con ID:", id);
  return id;
}

// ============================================
// FUEL LOGS (COMBUSTIBLE)
// ============================================

export async function listFuelLogsByRange(empresaId, projectId, dateFrom, dateTo) {
  console.log(`⛽ Cargando recargas de combustible: ${dateFrom} a ${dateTo}`);
  
  try {
    const q = query(
      EMPRESA_COL(empresaId, 'fuelLogs'),
      where("projectId", "==", projectId)
    );
    
    const snap = await getDocs(q);
    const allLogs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    
    const filtered = allLogs.filter(log => {
      return log.date >= dateFrom && log.date <= dateTo;
    });
    
    filtered.sort((a, b) => a.date.localeCompare(b.date));
    
    console.log(`✅ ${filtered.length} recargas cargadas de ${allLogs.length} totales`);
    return filtered;
    
  } catch (error) {
    console.error("❌ Error al cargar recargas:", error);
    throw error;
  }
}

export async function upsertFuelLog(empresaId, fuelLog) {
  if (!fuelLog.id || fuelLog.id.trim() === "") {
    const { id, ...payload } = fuelLog;
    const dataToSave = {
      ...payload,
      createdAt: Timestamp.now()
    };
    const ref = await addDoc(EMPRESA_COL(empresaId, 'fuelLogs'), dataToSave);
    console.log("✅ Recarga creada con ID:", ref.id);
    return ref.id;
  }
  const { id, ...rest } = fuelLog;
  await updateDoc(EMPRESA_DOC(empresaId, 'fuelLogs', id), {
    ...rest,
    updatedAt: Timestamp.now(),
  });
  console.log("✅ Recarga actualizada con ID:", id);
  return id;
}

export async function deleteFuelLog(empresaId, fuelLogId) {
  if (!fuelLogId || fuelLogId.trim() === "") {
    throw new Error("Fuel log ID is required for deletion");
  }
  await deleteDoc(EMPRESA_DOC(empresaId, 'fuelLogs', fuelLogId));
  console.log("✅ Recarga eliminada con ID:", fuelLogId);
}

// ============================================
// EMPLOYEES (EMPLEADOS)
// ============================================

export async function listEmployees(empresaId, projectId) {
  console.log(`👥 Cargando trabajadores${projectId ? ` del proyecto ${projectId}` : ''}`);
  if (!empresaId) return [];
  try {
    const col = EMPRESA_COL(empresaId, 'trabajadores');
    const q = (projectId !== undefined && projectId !== null)
      ? query(col, where("projectId", "==", projectId))
      : col;
    const snap = await getDocs(q);
    const employees = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    console.log(`✅ ${employees.length} trabajadores cargados`);
    return employees;
  } catch (error) {
    console.error("❌ Error al cargar trabajadores:", error);
    throw error;
  }
}

export async function getEmployeeByRut(empresaId, projectId, rut) {
  try {
    const q = query(
      EMPRESA_COL(empresaId, 'trabajadores'),
      where("projectId", "==", projectId),
      where("rut", "==", rut)
    );
    
    const snap = await getDocs(q);
    if (snap.empty) return null;
    
    const doc = snap.docs[0];
    return { id: doc.id, ...doc.data() };
  } catch (error) {
    console.error("❌ Error buscando empleado por RUT:", error);
    return null;
  }
}

export async function upsertEmployee(empresaId, employee) {
  if (!employee.id || employee.id.trim() === "") {
    const { id, ...payload } = employee;
    const dataToSave = {
      ...payload,
      createdAt: Timestamp.now()
    };
    const ref = await addDoc(EMPRESA_COL(empresaId, 'trabajadores'), dataToSave);
    console.log("✅ Empleado creado con ID:", ref.id);
    return ref.id;
  }
  const { id, ...rest } = employee;
  await updateDoc(EMPRESA_DOC(empresaId, 'trabajadores', id), {
    ...rest,
    updatedAt: Timestamp.now(),
  });
  console.log("✅ Empleado actualizado con ID:", id);
  return id;
}

export async function deleteEmployee(empresaId, employeeId) {
  if (!employeeId || employeeId.trim() === "") {
    throw new Error("Employee ID is required for deletion");
  }
  await deleteDoc(EMPRESA_DOC(empresaId, 'trabajadores', employeeId));
  console.log("✅ Empleado eliminado con ID:", employeeId);
}

// ============================================
// EMPLOYEE MONTHLY DATA (REMUNERACIONES)
// ============================================

export async function listEmployeeMonthlyData(empresaId, projectId, year, month) {
  console.log(`📅 Cargando datos mensuales: ${year}-${month}`);
  if (!empresaId || year === undefined || month === undefined) return [];
  try {
    const col = EMPRESA_COL(empresaId, 'employeeMonthlyData');
    const q = (projectId !== undefined && projectId !== null)
      ? query(col, where("projectId", "==", projectId), where("year", "==", year), where("month", "==", month))
      : query(col, where("year", "==", year), where("month", "==", month));
    
    const snap = await getDocs(q);
    const monthlyData = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    
    console.log(`✅ ${monthlyData.length} registros mensuales cargados`);
    return monthlyData;
    
  } catch (error) {
    console.error("❌ Error al cargar datos mensuales:", error);
    throw error;
  }
}

// Trae los datos mensuales de payroll de TODO un año de una vez (para matrices/detalle anual),
// en vez de tener que llamar listEmployeeMonthlyData 12 veces
export async function listEmployeeMonthlyDataByYear(empresaId, projectId, year) {
  if (!empresaId || !projectId || year === undefined) return [];
  try {
    const q = query(
      EMPRESA_COL(empresaId, 'employeeMonthlyData'),
      where("projectId", "==", projectId),
      where("year", "==", year)
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (error) {
    console.error("❌ Error al cargar datos mensuales del año:", error);
    return [];
  }
}

export async function getEmployeeMonthlyData(empresaId, employeeId, year, month) {
  try {
    const q = query(
      EMPRESA_COL(empresaId, 'employeeMonthlyData'),
      where("employeeId", "==", employeeId),
      where("year", "==", year),
      where("month", "==", month)
    );
    
    const snap = await getDocs(q);
    if (snap.empty) return null;
    
    const doc = snap.docs[0];
    return { id: doc.id, ...doc.data() };
  } catch (error) {
    console.error("❌ Error buscando datos mensuales:", error);
    return null;
  }
}

// A diferencia de getEmployeeMonthlyData (que devuelve solo la primera coincidencia),
// esta devuelve TODAS las liquidaciones del empleado ese mes — necesario cuando una
// persona trabajó en más de un Centro de Costo en el mismo mes.
export async function listEmployeeMonthlyDataForEmployee(empresaId, employeeId, year, month) {
  if (!empresaId || !employeeId) return [];
  try {
    const q = query(
      EMPRESA_COL(empresaId, 'employeeMonthlyData'),
      where("employeeId", "==", employeeId),
      where("year", "==", year),
      where("month", "==", month)
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (error) {
    console.error("❌ Error buscando liquidaciones del empleado:", error);
    return [];
  }
}

export async function upsertEmployeeMonthlyData(empresaId, monthlyData) {
  if (!monthlyData.id || monthlyData.id.trim() === "") {
    const { id, ...payload } = monthlyData;
    const dataToSave = {
      ...payload,
      createdAt: Timestamp.now()
    };
    const ref = await addDoc(EMPRESA_COL(empresaId, 'employeeMonthlyData'), dataToSave);
    console.log("✅ Datos mensuales creados con ID:", ref.id);
    return ref.id;
  }
  const { id, ...rest } = monthlyData;
  await updateDoc(EMPRESA_DOC(empresaId, 'employeeMonthlyData', id), {
    ...rest,
    updatedAt: Timestamp.now(),
  });
  console.log("✅ Datos mensuales actualizados con ID:", id);
  return id;
}

// ============================================
// EMPLOYEE ASSIGNMENTS (ASIGNACIONES)
// ============================================

export async function listEmployeeAssignments(empresaId, projectId, year = null, month = null) {
  console.log(`🔗 Cargando asignaciones del proyecto ${projectId}`);
  
  try {
    let q = query(
      EMPRESA_COL(empresaId, 'employeeAssignments'),
      where("projectId", "==", projectId)
    );
    
    if (year && month) {
      q = query(
        EMPRESA_COL(empresaId, 'employeeAssignments'),
        where("projectId", "==", projectId),
        where("year", "==", year),
        where("month", "==", month)
      );
    }
    
    const snap = await getDocs(q);
    const assignments = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    
    console.log(`✅ ${assignments.length} asignaciones cargadas`);
    return assignments;
    
  } catch (error) {
    console.error("❌ Error al cargar asignaciones:", error);
    throw error;
  }
}

export async function getEmployeeAssignment(empresaId, employeeId, year, month) {
  try {
    const q = query(
      EMPRESA_COL(empresaId, 'employeeAssignments'),
      where("employeeId", "==", employeeId),
      where("year", "==", year),
      where("month", "==", month)
    );
    
    const snap = await getDocs(q);
    if (snap.empty) return null;
    
    const doc = snap.docs[0];
    return { id: doc.id, ...doc.data() };
  } catch (error) {
    console.error("❌ Error buscando asignación:", error);
    return null;
  }
}

export async function upsertEmployeeAssignment(empresaId, assignment) {
  if (!assignment.id || assignment.id.trim() === "") {
    const { id, ...payload } = assignment;
    const dataToSave = {
      ...payload,
      createdAt: Timestamp.now()
    };
    const ref = await addDoc(EMPRESA_COL(empresaId, 'employeeAssignments'), dataToSave);
    console.log("✅ Asignación creada con ID:", ref.id);
    return ref.id;
  }
  const { id, ...rest } = assignment;
  await updateDoc(EMPRESA_DOC(empresaId, 'employeeAssignments', id), {
    ...rest,
    updatedAt: Timestamp.now(),
  });
  console.log("✅ Asignación actualizada con ID:", id);
  return id;
}

export async function deleteEmployeeAssignment(empresaId, assignmentId) {
  if (!assignmentId || assignmentId.trim() === "") {
    throw new Error("Assignment ID is required for deletion");
  }
  await deleteDoc(EMPRESA_DOC(empresaId, 'employeeAssignments', assignmentId));
  console.log("✅ Asignación eliminada con ID:", assignmentId);
}

// ============================================
// PURCHASE ORDERS (ÓRDENES DE COMPRA)
// ============================================

export async function listPurchaseOrders(empresaId, projectId) {
  try {
    const q = query(
      EMPRESA_COL(empresaId, 'purchaseOrders'),
      where("projectId", "==", projectId)
    );
    
    const snap = await getDocs(q);
    const orders = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    
    orders.sort((a, b) => {
      if (!a.fecha) return 1;
      if (!b.fecha) return -1;
      return b.fecha.localeCompare(a.fecha);
    });
    
    console.log(`✅ ${orders.length} órdenes de compra cargadas`);
    return orders;
  } catch (error) {
    console.error("❌ Error al cargar órdenes de compra:", error);
    throw error;
  }
}

export async function savePurchaseOrders(empresaId, orders, projectId) {
  try {
    // Guardar en batches de 500
    const batchSize = 500;
    
    for (let i = 0; i < orders.length; i += batchSize) {
      const batch = writeBatch(db);
      const batchOrders = orders.slice(i, i + batchSize);
      
      batchOrders.forEach(order => {
        const docRef = doc(EMPRESA_COL(empresaId, 'purchaseOrders'));
        batch.set(docRef, {
          ...order,
          projectId,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      });
      
      await batch.commit();
    }
    
    console.log(`✅ ${orders.length} órdenes guardadas`);
  } catch (error) {
    console.error("❌ Error guardando órdenes:", error);
    throw error;
  }
}

export async function upsertPurchaseOrder(empresaId, order) {
  const orderData = {
    ...order,
    updatedAt: serverTimestamp()
  };

  if (order.id) {
    const ref = EMPRESA_DOC(empresaId, 'purchaseOrders', order.id);
    await updateDoc(ref, orderData);
    return { id: order.id, ...orderData };
  } else {
    orderData.createdAt = serverTimestamp();
    const ref = await addDoc(EMPRESA_COL(empresaId, 'purchaseOrders'), orderData);
    return { id: ref.id, ...orderData };
  }
}

export async function deletePurchaseOrder(empresaId, orderId) {
  await deleteDoc(EMPRESA_DOC(empresaId, 'purchaseOrders', orderId));
}

export async function deleteAllPurchaseOrders(empresaId, projectId) {
  const q = query(
    EMPRESA_COL(empresaId, 'purchaseOrders'),
    where("projectId", "==", projectId)
  );
  
  const snap = await getDocs(q);
  const batch = writeBatch(db);
  
  snap.docs.forEach(doc => {
    batch.delete(doc.ref);
  });
  
  await batch.commit();
  console.log(`✅ Todas las órdenes del proyecto eliminadas`);
}

// ============================================
// RENDICIONES
// ============================================

// Trae TODAS las rendiciones de un proyecto (sin filtrar por year/month, que no se guardan
// en el documento — se filtra por fechaEmision en el cliente)
export async function listRendicionesByProject(empresaId, projectId) {
  if (!empresaId || !projectId) return [];
  try {
    const q = query(
      EMPRESA_COL(empresaId, 'rendiciones'),
      where("projectId", "==", projectId)
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (error) {
    console.error("❌ Error al cargar rendiciones del proyecto:", error);
    return [];
  }
}

export async function listRendiciones(empresaId, projectId, year, month) {
  console.log(`📋 Cargando rendiciones: ${year}-${month}`);
  
  try {
    const q = query(
      EMPRESA_COL(empresaId, 'rendiciones'),
      where("projectId", "==", projectId),
      where("year", "==", year),
      where("month", "==", month)
    );
    
    const snap = await getDocs(q);
    const rendiciones = snap.docs.map((d) => ({
      id: d.id,
      ...d.data()
    }));
    
    // Ordenar por fecha de emisión
    rendiciones.sort((a, b) => {
      if (!a.fechaEmision) return 1;
      if (!b.fechaEmision) return -1;
      return b.fechaEmision.localeCompare(a.fechaEmision);
    });
    
    console.log(`✅ ${rendiciones.length} rendiciones cargadas`);
    return rendiciones;
  } catch (error) {
    console.error("❌ Error al cargar rendiciones:", error);
    throw error;
  }
}

export async function saveRendiciones(empresaId, rendiciones, projectId, year, month) {
  try {
    // Primero eliminar las existentes del mismo mes
    await deleteAllRendiciones(empresaId, projectId, year, month);
    
    // Guardar en batches de 500
    const batchSize = 500;
    
    for (let i = 0; i < rendiciones.length; i += batchSize) {
      const batch = writeBatch(db);
      const batchItems = rendiciones.slice(i, i + batchSize);
      
      batchItems.forEach(rendicion => {
        const docRef = doc(EMPRESA_COL(empresaId, 'rendiciones'));
        batch.set(docRef, {
          ...rendicion,
          projectId,
          year,
          month,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      });
      
      await batch.commit();
    }
    
    console.log(`✅ ${rendiciones.length} rendiciones guardadas`);
  } catch (error) {
    console.error("❌ Error guardando rendiciones:", error);
    throw error;
  }
}

export async function upsertRendicion(empresaId, rendicion) {
  const rendicionData = {
    ...rendicion,
    updatedAt: serverTimestamp()
  };

  if (rendicion.id) {
    const ref = EMPRESA_DOC(empresaId, 'rendiciones', rendicion.id);
    await updateDoc(ref, rendicionData);
    return { id: rendicion.id, ...rendicionData };
  } else {
    rendicionData.createdAt = serverTimestamp();
    const ref = await addDoc(EMPRESA_COL(empresaId, 'rendiciones'), rendicionData);
    return { id: ref.id, ...rendicionData };
  }
}

export async function deleteRendicion(empresaId, rendicionId) {
  await deleteDoc(EMPRESA_DOC(empresaId, 'rendiciones', rendicionId));
}

export async function deleteAllRendiciones(empresaId, projectId, year, month) {
  const q = query(
    EMPRESA_COL(empresaId, 'rendiciones'),
    where("projectId", "==", projectId),
    where("year", "==", year),
    where("month", "==", month)
  );
  
  const snap = await getDocs(q);
  
  // Eliminar en batches
  const batchSize = 500;
  const docs = snap.docs;
  
  for (let i = 0; i < docs.length; i += batchSize) {
    const batch = writeBatch(db);
    const batchDocs = docs.slice(i, i + batchSize);
    
    batchDocs.forEach(doc => {
      batch.delete(doc.ref);
    });
    
    await batch.commit();
  }
  
  console.log(`✅ Rendiciones eliminadas del proyecto/mes`);
}

export async function getRendicionesStats(empresaId, projectId, year, month) {
  const rendiciones = await listRendiciones(empresaId, projectId, year, month);
  
  const stats = {
    total: 0,
    cantidad: rendiciones.length,
    aprobadas: 0,
    pendientes: 0,
    rechazadas: 0,
    porCategoria: {},
    porProveedor: {}
  };
  
  rendiciones.forEach(r => {
    const monto = Number(r.montoAprobado) || 0;
    stats.total += monto;
    
    if (r.estadoGasto === 'Aprobada') stats.aprobadas++;
    else if (r.estadoGasto === 'Pendiente') stats.pendientes++;
    else if (r.estadoGasto === 'Rechazada') stats.rechazadas++;
    
    const cat = r.categoria || 'Sin categoría';
    if (!stats.porCategoria[cat]) stats.porCategoria[cat] = 0;
    stats.porCategoria[cat] += monto;
    
    const prov = r.proveedor || 'Sin proveedor';
    if (!stats.porProveedor[prov]) stats.porProveedor[prov] = 0;
    stats.porProveedor[prov] += monto;
  });
  
  return stats;
}

// ============================================
// SUBCONTRATOS
// ============================================

// Trae TODOS los subcontratos de un proyecto (sin filtrar por year/month, que no se guardan
// en el documento — se filtra por fechaEP en el cliente, igual que hace Subcontratos.jsx)
export async function listSubcontratosByProject(empresaId, projectId) {
  if (!empresaId || !projectId) return [];
  try {
    const q = query(
      EMPRESA_COL(empresaId, 'subcontratos'),
      where("projectId", "==", projectId)
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (error) {
    console.error("❌ Error al cargar subcontratos del proyecto:", error);
    return [];
  }
}

export async function listSubcontratos(empresaId, projectId, year, month) {
  console.log(`👥 Cargando subcontratos: ${year}-${month}`);
  
  try {
    const q = query(
      EMPRESA_COL(empresaId, 'subcontratos'),
      where("projectId", "==", projectId),
      where("year", "==", year),
      where("month", "==", month)
    );
    
    const snap = await getDocs(q);
    const subcontratos = snap.docs.map((d) => ({
      id: d.id,
      ...d.data()
    }));
    
    // Ordenar por fecha EP
    subcontratos.sort((a, b) => {
      if (!a.fechaEP) return 1;
      if (!b.fechaEP) return -1;
      return b.fechaEP.localeCompare(a.fechaEP);
    });
    
    console.log(`✅ ${subcontratos.length} subcontratos cargados`);
    return subcontratos;
  } catch (error) {
    console.error("❌ Error al cargar subcontratos:", error);
    throw error;
  }
}

export async function saveSubcontratos(empresaId, subcontratos, projectId, year, month) {
  try {
    // Primero eliminar los existentes del mismo mes
    await deleteAllSubcontratos(empresaId, projectId, year, month);
    
    // Guardar en batches de 500
    const batchSize = 500;
    
    for (let i = 0; i < subcontratos.length; i += batchSize) {
      const batch = writeBatch(db);
      const batchItems = subcontratos.slice(i, i + batchSize);
      
      batchItems.forEach(subcontrato => {
        const docRef = doc(EMPRESA_COL(empresaId, 'subcontratos'));
        batch.set(docRef, {
          ...subcontrato,
          projectId,
          year,
          month,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      });
      
      await batch.commit();
    }
    
    console.log(`✅ ${subcontratos.length} subcontratos guardados`);
  } catch (error) {
    console.error("❌ Error guardando subcontratos:", error);
    throw error;
  }
}

export async function upsertSubcontrato(empresaId, subcontrato) {
  const subcontratoData = {
    ...subcontrato,
    updatedAt: serverTimestamp()
  };

  if (subcontrato.id) {
    const ref = EMPRESA_DOC(empresaId, 'subcontratos', subcontrato.id);
    await updateDoc(ref, subcontratoData);
    return { id: subcontrato.id, ...subcontratoData };
  } else {
    subcontratoData.createdAt = serverTimestamp();
    const ref = await addDoc(EMPRESA_COL(empresaId, 'subcontratos'), subcontratoData);
    return { id: ref.id, ...subcontratoData };
  }
}

export async function deleteSubcontrato(empresaId, subcontratoId) {
  await deleteDoc(EMPRESA_DOC(empresaId, 'subcontratos', subcontratoId));
}

export async function deleteAllSubcontratos(empresaId, projectId, year, month) {
  const q = query(
    EMPRESA_COL(empresaId, 'subcontratos'),
    where("projectId", "==", projectId),
    where("year", "==", year),
    where("month", "==", month)
  );
  
  const snap = await getDocs(q);
  
  // Eliminar en batches
  const batchSize = 500;
  const docs = snap.docs;
  
  for (let i = 0; i < docs.length; i += batchSize) {
    const batch = writeBatch(db);
    const batchDocs = docs.slice(i, i + batchSize);
    
    batchDocs.forEach(doc => {
      batch.delete(doc.ref);
    });
    
    await batch.commit();
  }
  
  console.log(`✅ Subcontratos eliminados del proyecto/mes`);
}

export async function getSubcontratosStats(empresaId, projectId, year, month) {
  const subcontratos = await listSubcontratos(empresaId, projectId, year, month);
  
  const stats = {
    totalPagado: 0,
    totalSaldo: 0,
    cantidad: subcontratos.length,
    porSubcontratista: {},
    porCuentaCosto: {}
  };
  
  subcontratos.forEach(s => {
    const pago = Number(s.totalPagoNeto) || 0;
    stats.totalPagado += pago;
    stats.totalSaldo += Number(s.saldoPorPagarSC) || 0;
    
    // Por subcontratista
    const subcontratista = s.razonSocialSubcontratista || 'Sin subcontratista';
    if (!stats.porSubcontratista[subcontratista]) {
      stats.porSubcontratista[subcontratista] = 0;
    }
    stats.porSubcontratista[subcontratista] += pago;
    
    // Por cuenta de costo
    const codigo = s.codigoCuentaCosto || '';
    const nombre = s.descripcionCuentaCosto || '';
    const cuenta = codigo && nombre ? `${codigo} ${nombre}` : (nombre || codigo || 'Sin cuenta');
    if (!stats.porCuentaCosto[cuenta]) {
      stats.porCuentaCosto[cuenta] = 0;
    }
    stats.porCuentaCosto[cuenta] += pago;
  });
  
  return stats;
}

// ============================================
// COMBUSTIBLE — control de entradas y salidas del camión aljibe (cuenta 4.1 Diésel)
// Distinto de fuelLogs (litros por máquina, precio "en vivo"): esto es el detalle
// crudo importado del camión combustible, con precio FIJADO por mes para el Estado de Pago.
// ============================================

export async function listCombustibleRegistros(empresaId, projectId) {
  if (!empresaId || !projectId) return [];
  try {
    const q = query(
      EMPRESA_COL(empresaId, 'combustibleRegistros'),
      where("projectId", "==", projectId)
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (error) {
    console.error("❌ Error cargando registros de combustible:", error);
    return [];
  }
}

export async function saveCombustibleRegistros(empresaId, registros, projectId) {
  const batchSize = 400;
  for (let i = 0; i < registros.length; i += batchSize) {
    const batch = writeBatch(db);
    registros.slice(i, i + batchSize).forEach(r => {
      const docRef = doc(EMPRESA_COL(empresaId, 'combustibleRegistros'));
      batch.set(docRef, { ...r, projectId, codigoCuentaContable: '4.1', createdAt: Timestamp.now() });
    });
    await batch.commit();
  }
}

export async function deleteAllCombustibleRegistros(empresaId, projectId) {
  const q = query(EMPRESA_COL(empresaId, 'combustibleRegistros'), where("projectId", "==", projectId));
  const snap = await getDocs(q);
  const batchSize = 400;
  const docs = snap.docs;
  for (let i = 0; i < docs.length; i += batchSize) {
    const batch = writeBatch(db);
    docs.slice(i, i + batchSize).forEach(d => batch.delete(d.ref));
    await batch.commit();
  }
}

// Precio del diésel fijado a mano para un mes específico (no el precio "en vivo" de fuelPriceService,
// sino el que efectivamente se usa para valorizar el consumo real de ese mes en el Estado de Pago)
export async function getCombustiblePrecioMensual(empresaId, projectId, year, month) {
  if (!empresaId || !projectId) return null;
  try {
    const q = query(
      EMPRESA_COL(empresaId, 'combustiblePrecioMensual'),
      where("projectId", "==", projectId),
      where("year", "==", year),
      where("month", "==", month)
    );
    const snap = await getDocs(q);
    if (snap.empty) return null;
    const d = snap.docs[0];
    return { id: d.id, ...d.data() };
  } catch (error) {
    console.error("❌ Error cargando precio mensual de combustible:", error);
    return null;
  }
}

export async function listCombustiblePrecioMensualByYear(empresaId, projectId, year) {
  if (!empresaId || !projectId) return [];
  try {
    const q = query(
      EMPRESA_COL(empresaId, 'combustiblePrecioMensual'),
      where("projectId", "==", projectId),
      where("year", "==", year)
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (error) {
    console.error("❌ Error cargando precios del año:", error);
    return [];
  }
}

export async function upsertCombustiblePrecioMensual(empresaId, data) {
  const payload = {
    projectId: data.projectId,
    year: data.year,
    month: data.month,
    precioLitro: Number(data.precioLitro) || 0,
    updatedAt: Timestamp.now()
  };
  if (data.id) {
    await updateDoc(EMPRESA_DOC(empresaId, 'combustiblePrecioMensual', data.id), payload);
    return data.id;
  }
  const ref = await addDoc(EMPRESA_COL(empresaId, 'combustiblePrecioMensual'), { ...payload, createdAt: Timestamp.now() });
  return ref.id;
}

// ============================================
// CARÁTULA / ESTADO DE PAGO — INGRESOS MANUALES
// (Estados de Pago, Retenciones, Reajustes, Multas por mes)
// ============================================

export async function getEstadoPagoIngresos(empresaId, projectId, year, month) {
  if (!empresaId || !projectId) return null;
  try {
    const q = query(
      EMPRESA_COL(empresaId, 'estadoPagoIngresos'),
      where("projectId", "==", projectId),
      where("year", "==", year),
      where("month", "==", month)
    );
    const snap = await getDocs(q);
    if (snap.empty) return null;
    const d = snap.docs[0];
    return { id: d.id, ...d.data() };
  } catch (error) {
    console.error("❌ Error cargando ingresos del Estado de Pago:", error);
    return null;
  }
}

// Trae los ingresos manuales de los 12 meses de un año de una vez (para la vista de detalle anual)
export async function listEstadoPagoIngresosByYear(empresaId, projectId, year) {
  if (!empresaId || !projectId) return [];
  try {
    const q = query(
      EMPRESA_COL(empresaId, 'estadoPagoIngresos'),
      where("projectId", "==", projectId),
      where("year", "==", year)
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (error) {
    console.error("❌ Error cargando ingresos del año:", error);
    return [];
  }
}

export async function upsertEstadoPagoIngresos(empresaId, data) {
  const payload = {
    projectId: data.projectId,
    year: data.year,
    month: data.month,
    estadosPago: Number(data.estadosPago) || 0,
    retenciones: Number(data.retenciones) || 0,
    reajuste: Number(data.reajuste) || 0,
    multas: Number(data.multas) || 0,
    reajustePolinomico: Number(data.reajustePolinomico) || 0,
    updatedAt: Timestamp.now()
  };

  if (data.id) {
    await updateDoc(EMPRESA_DOC(empresaId, 'estadoPagoIngresos', data.id), payload);
    return data.id;
  }
  const ref = await addDoc(EMPRESA_COL(empresaId, 'estadoPagoIngresos'), { ...payload, createdAt: Timestamp.now() });
  return ref.id;
}

// ============================================
// MAQUINARIA — PLANES DE MANTENIMIENTO
// ============================================

export async function listMaintenancePlans(empresaId, machineId) {
  if (!empresaId) return [];
  const q = machineId
    ? query(EMPRESA_COL(empresaId, 'maintenancePlans'), where('machineId', '==', machineId))
    : EMPRESA_COL(empresaId, 'maintenancePlans');
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function upsertMaintenancePlan(empresaId, plan) {
  const data = { ...plan, updatedAt: serverTimestamp() };
  if (plan.id) {
    const { id, ...rest } = data;
    await updateDoc(EMPRESA_DOC(empresaId, 'maintenancePlans', plan.id), rest);
    return plan.id;
  }
  data.createdAt = serverTimestamp();
  const { id, ...rest } = data;
  const ref = await addDoc(EMPRESA_COL(empresaId, 'maintenancePlans'), rest);
  return ref.id;
}

export async function deleteMaintenancePlan(empresaId, planId) {
  await deleteDoc(EMPRESA_DOC(empresaId, 'maintenancePlans', planId));
}

export async function listMaintenanceEvents(empresaId, machineId) {
  if (!empresaId) return [];
  const q = machineId
    ? query(EMPRESA_COL(empresaId, 'maintenanceEvents'), where('machineId', '==', machineId))
    : EMPRESA_COL(empresaId, 'maintenanceEvents');
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// ============================================
// MAQUINARIA — ÓRDENES DE TRABAJO
// ============================================

export async function listWorkOrders(empresaId, filters = {}) {
  if (!empresaId) return [];
  let q = EMPRESA_COL(empresaId, 'workOrders');
  const clauses = [];
  if (filters.machineId) clauses.push(where('machineId', '==', filters.machineId));
  if (filters.asignadoA) clauses.push(where('asignadoA', '==', filters.asignadoA));
  if (filters.estado)    clauses.push(where('estado', '==', filters.estado));
  if (clauses.length) q = query(q, ...clauses);
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function upsertWorkOrder(empresaId, workOrder) {
  const data = { ...workOrder, updatedAt: serverTimestamp() };
  if (workOrder.id) {
    const { id, ...rest } = data;
    await updateDoc(EMPRESA_DOC(empresaId, 'workOrders', workOrder.id), rest);
    return workOrder.id;
  }
  data.createdAt = serverTimestamp();
  data.estado = data.estado || 'pendiente';
  const { id, ...rest } = data;
  const ref = await addDoc(EMPRESA_COL(empresaId, 'workOrders'), rest);
  return ref.id;
}

// El cierre de una OT NO se hace con updateDoc: se llama a la Cloud Function
// 'closeWorkOrder' (onRequest, mismo patrón que deleteAuthUser) directamente
// desde el componente vía fetch(), porque necesita descontar stock, calcular
// la próxima mantención y actualizar la máquina de forma atómica.
// Ver src/components/maquinaria/WorkOrderDetalle.jsx

// ============================================
// MAQUINARIA — FALLAS
// ============================================

export async function listFailures(empresaId, machineId) {
  if (!empresaId) return [];
  const q = machineId
    ? query(EMPRESA_COL(empresaId, 'failures'), where('machineId', '==', machineId))
    : EMPRESA_COL(empresaId, 'failures');
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function reportFailure(empresaId, failure) {
  const data = { ...failure, estado: 'abierta', createdAt: serverTimestamp() };
  const ref = await addDoc(EMPRESA_COL(empresaId, 'failures'), data);
  return ref.id;
}

export async function updateFailure(empresaId, failureId, patch) {
  await updateDoc(EMPRESA_DOC(empresaId, 'failures', failureId), { ...patch, updatedAt: serverTimestamp() });
}

// Genera una OT correctiva a partir de una falla y enlaza ambas.
export async function createWorkOrderFromFailure(empresaId, failure) {
  const woRef = await addDoc(EMPRESA_COL(empresaId, 'workOrders'), {
    machineId: failure.machineId,
    origen: 'falla',
    origenRefId: failure.id,
    estado: 'pendiente',
    prioridad: failure.severidad === 'critica' ? 'urgente' : failure.severidad === 'alta' ? 'alta' : 'media',
    diagnostico: failure.descripcion || '',
    fechaApertura: new Date().toISOString(),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  await updateDoc(EMPRESA_DOC(empresaId, 'failures', failure.id), {
    estado: 'en_ot',
    workOrderId: woRef.id,
    updatedAt: serverTimestamp(),
  });
  return woRef.id;
}

// ============================================
// MAQUINARIA — REPUESTOS Y STOCK
// ============================================

export async function listSpareParts(empresaId) {
  if (!empresaId) return [];
  const snap = await getDocs(EMPRESA_COL(empresaId, 'spareParts'));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function upsertSparePart(empresaId, part) {
  const data = { ...part, updatedAt: serverTimestamp() };
  if (part.id) {
    const { id, ...rest } = data;
    await updateDoc(EMPRESA_DOC(empresaId, 'spareParts', part.id), rest);
    return part.id;
  }
  data.createdAt = serverTimestamp();
  data.stock = data.stock || 0;
  const { id, ...rest } = data;
  const ref = await addDoc(EMPRESA_COL(empresaId, 'spareParts'), rest);
  return ref.id;
}

// Entradas de stock (compras, ajustes) se registran directo desde el cliente.
// Las SALIDAS por OT las genera la Cloud Function closeWorkOrder, no esta función.
export async function registerSparePartMovement(empresaId, movement) {
  const partRef = EMPRESA_DOC(empresaId, 'spareParts', movement.spareId);
  const partSnap = await getDoc(partRef);
  if (!partSnap.exists()) throw new Error('Repuesto no encontrado');

  const stockActual = partSnap.data().stock || 0;
  const delta = movement.tipo === 'salida' ? -movement.cantidad : movement.cantidad;
  const stockResultante = stockActual + delta;
  if (stockResultante < 0) throw new Error('Stock insuficiente para este movimiento');

  const batch = writeBatch(db);
  batch.update(partRef, { stock: stockResultante, updatedAt: serverTimestamp() });
  const movRef = doc(EMPRESA_COL(empresaId, 'sparePartMovements'));
  batch.set(movRef, {
    ...movement,
    stockResultante,
    fecha: movement.fecha || new Date().toISOString(),
    createdAt: serverTimestamp(),
  });
  await batch.commit();
  return movRef.id;
}

export async function listSparePartMovements(empresaId, spareId) {
  if (!empresaId || !spareId) return [];
  const q = query(
    EMPRESA_COL(empresaId, 'sparePartMovements'),
    where('spareId', '==', spareId),
    orderBy('fecha', 'desc')
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// ============================================
// MAQUINARIA — HISTORIAL / AUDITORÍA (solo lectura desde el cliente)
// ============================================

export async function listMachineHistory(empresaId, machineId) {
  if (!empresaId || !machineId) return [];
  const q = query(
    EMPRESA_COL(empresaId, 'machineHistory'),
    where('entityType', '==', 'machine'),
    where('entityId', '==', machineId),
    orderBy('timestamp', 'desc')
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// ============================================
// MAQUINARIA — DOCUMENTOS DEL EQUIPO (con Storage)
// ============================================

export async function listMachineDocuments(empresaId, machineId) {
  if (!empresaId || !machineId) return [];
  const q = query(EMPRESA_COL(empresaId, 'machineDocuments'), where('machineId', '==', machineId));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// Sube el archivo a Storage y crea el registro en machineDocuments.
// file es un File del input; puede ser null si el documento no lleva adjunto.
export async function uploadMachineDocument(empresaId, machineId, meta, file) {
  let archivoUrl = meta.archivoUrl || "";
  let archivoPath = meta.archivoPath || "";

  if (file) {
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `empresas/${empresaId}/machineDocuments/${machineId}/${Date.now()}_${safeName}`;
    const r = storageRef(storage, path);
    await uploadBytes(r, file);
    archivoUrl = await getDownloadURL(r);
    archivoPath = path;
  }

  const data = {
    machineId,
    tipo: meta.tipo || "otro",
    numero: meta.numero || "",
    fechaEmision: meta.fechaEmision || "",
    fechaVencimiento: meta.fechaVencimiento || "",
    observaciones: meta.observaciones || "",
    archivoUrl,
    archivoPath,
    nombreArchivo: file ? file.name : (meta.nombreArchivo || ""),
    updatedAt: serverTimestamp(),
  };

  if (meta.id) {
    await updateDoc(EMPRESA_DOC(empresaId, 'machineDocuments', meta.id), data);
    return meta.id;
  }
  data.createdAt = serverTimestamp();
  const ref = await addDoc(EMPRESA_COL(empresaId, 'machineDocuments'), data);
  return ref.id;
}

export async function deleteMachineDocument(empresaId, docId, archivoPath) {
  if (archivoPath) {
    try { await deleteObject(storageRef(storage, archivoPath)); }
    catch (e) { console.warn("No se pudo borrar el archivo de Storage:", e.message); }
  }
  await deleteDoc(EMPRESA_DOC(empresaId, 'machineDocuments', docId));
}

// ============================================
// MAQUINARIA — PLANTILLAS DE CHECKLIST (por tipo de mantención)
// ============================================

export async function listChecklistTemplates(empresaId) {
  if (!empresaId) return [];
  const snap = await getDocs(EMPRESA_COL(empresaId, 'checklistTemplates'));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function upsertChecklistTemplate(empresaId, template) {
  const data = {
    tipo: template.tipo || 'preventiva',      // preventiva | correctiva | inspeccion | emergencia
    nombre: template.nombre || '',
    items: Array.isArray(template.items) ? template.items : [],  // [{ id, texto }]
    activo: template.activo !== false,
    updatedAt: serverTimestamp(),
  };
  if (template.id) {
    await updateDoc(EMPRESA_DOC(empresaId, 'checklistTemplates', template.id), data);
    return template.id;
  }
  data.createdAt = serverTimestamp();
  const ref = await addDoc(EMPRESA_COL(empresaId, 'checklistTemplates'), data);
  return ref.id;
}

export async function deleteChecklistTemplate(empresaId, templateId) {
  await deleteDoc(EMPRESA_DOC(empresaId, 'checklistTemplates', templateId));
}

// ============================================
// MAQUINARIA — FOTOS DE ORDEN DE TRABAJO (Storage)
// ============================================

export async function uploadWorkOrderPhoto(empresaId, workOrderId, file) {
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `empresas/${empresaId}/workOrders/${workOrderId}/${Date.now()}_${safeName}`;
  const r = storageRef(storage, path);
  await uploadBytes(r, file);
  const url = await getDownloadURL(r);
  return { url, path, nombre: file.name };
}

export async function deleteWorkOrderPhoto(archivoPath) {
  if (!archivoPath) return;
  try { await deleteObject(storageRef(storage, archivoPath)); }
  catch (e) { console.warn("No se pudo borrar la foto de Storage:", e.message); }
}

// ============================================
// MPF RENTAL — clientes, OC, cotizaciones, contratos y estados de pago
// ============================================
// Toda la capa comercial vive ahora en src/lib/rental.js: folios
// correlativos, desglose neto/IVA/total, control de saldo de las OC del
// cliente, adjuntos en Storage y borrados que liberan las máquinas.
// Se reexporta desde aquí para que las pantallas que ya importaban estas
// funciones desde "lib/db" sigan funcionando sin cambios.

export * from "./rental";
