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
// MPF RENTAL — CLIENTES / ARRENDATARIOS
// ============================================

export async function listRentalClients(empresaId) {
  if (!empresaId) return [];
  const snap = await getDocs(EMPRESA_COL(empresaId, 'rentalClients'));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function upsertRentalClient(empresaId, client) {
  const data = {
    nombre: (client.nombre || '').trim(),
    rut: (client.rut || '').trim(),
    contacto: (client.contacto || '').trim(),
    email: (client.email || '').trim(),
    telefono: (client.telefono || '').trim(),
    direccion: (client.direccion || '').trim(),
    condicionPago: (client.condicionPago || '').trim(),  // ej. "30 días"
    activo: client.activo !== false,
    updatedAt: serverTimestamp(),
  };
  if (client.id) {
    await updateDoc(EMPRESA_DOC(empresaId, 'rentalClients', client.id), data);
    return client.id;
  }
  data.createdAt = serverTimestamp();
  const ref = await addDoc(EMPRESA_COL(empresaId, 'rentalClients'), data);
  return ref.id;
}

export async function deleteRentalClient(empresaId, clientId) {
  await deleteDoc(EMPRESA_DOC(empresaId, 'rentalClients', clientId));
}

// ============================================
// MPF RENTAL — CONTRATOS DE ARRIENDO
// ============================================
// Un contrato tiene líneas (una o varias máquinas), cada línea con su tarifa.
// linea = { machineId, code, descripcion, tarifaTipo: 'mes'|'dia'|'hora',
//           tarifaValor, cantidadEstimada }
// El costo de leasing NO va en el contrato: vive en la máquina (leasingMensual).

export async function listRentalContracts(empresaId, filters = {}) {
  if (!empresaId) return [];
  let q = EMPRESA_COL(empresaId, 'rentalContracts');
  const clauses = [];
  if (filters.clienteId) clauses.push(where('clienteId', '==', filters.clienteId));
  if (filters.estado)    clauses.push(where('estado', '==', filters.estado));
  if (clauses.length) q = query(q, ...clauses);
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function upsertRentalContract(empresaId, contract) {
  const data = {
    numero: (contract.numero || '').trim(),
    clienteId: contract.clienteId || null,
    clienteNombre: contract.clienteNombre || '',   // desnormalizado para listar rápido
    lineas: Array.isArray(contract.lineas) ? contract.lineas : [],
    fechaInicio: contract.fechaInicio || '',
    fechaFin: contract.fechaFin || '',
    estado: contract.estado || 'activo',            // borrador | activo | finalizado | cancelado
    condiciones: contract.condiciones || '',
    proyectoDestino: contract.proyectoDestino || '',
    updatedAt: serverTimestamp(),
  };
  if (contract.id) {
    await updateDoc(EMPRESA_DOC(empresaId, 'rentalContracts', contract.id), data);
    return contract.id;
  }
  data.createdAt = serverTimestamp();
  const ref = await addDoc(EMPRESA_COL(empresaId, 'rentalContracts'), data);
  return ref.id;
}

export async function deleteRentalContract(empresaId, contractId) {
  await deleteDoc(EMPRESA_DOC(empresaId, 'rentalContracts', contractId));
}

// Marca en cada máquina su disponibilidad + cliente según contratos activos.
// Se llama tras crear/editar/finalizar un contrato para mantener sincronía.
export async function syncMachineRentalStatus(empresaId, contract) {
  const batch = writeBatch(db);
  const arrendando = contract.estado === 'activo';
  for (const linea of (contract.lineas || [])) {
    if (!linea.machineId) continue;
    batch.set(
      EMPRESA_DOC(empresaId, 'machines', linea.machineId),
      {
        disponibilidad: arrendando ? 'arrendado' : 'disponible',
        contratoActivoId: arrendando ? contract.id : null,
        clienteArriendoNombre: arrendando ? (contract.clienteNombre || '') : '',
        updatedAt: Timestamp.now(),
      },
      { merge: true }
    );
  }
  await batch.commit();
}

// ============================================
// MPF RENTAL — CÁLCULO LEASING vs. INGRESO (por máquina, mensual)
// ============================================
// Normaliza cualquier tarifa a un ingreso mensual estimado.
// Supuestos de conversión: mes=1, día≈30/mes, hora≈horasMesReferencia (default 180).
export function ingresoMensualLinea(linea, horasMesReferencia = 180) {
  const v = Number(linea.tarifaValor || 0);
  const cant = Number(linea.cantidadEstimada || 0);
  switch (linea.tarifaTipo) {
    case 'mes':  return v * (cant || 1);
    case 'dia':  return v * (cant || 30);
    case 'hora': return v * (cant || horasMesReferencia);
    default:     return 0;
  }
}

// Devuelve un mapa machineId -> { ingresoMensual, contratoId } a partir de contratos activos.
export function buildIngresoPorMaquina(contracts) {
  const map = {};
  for (const c of contracts) {
    if (c.estado !== 'activo') continue;
    for (const l of (c.lineas || [])) {
      if (!l.machineId) continue;
      const ingreso = ingresoMensualLinea(l);
      if (!map[l.machineId]) map[l.machineId] = { ingresoMensual: 0, contratoId: c.id, clienteNombre: c.clienteNombre };
      map[l.machineId].ingresoMensual += ingreso;
    }
  }
  return map;
}

// ============================================
// MPF RENTAL — COTIZACIONES
// ============================================
// Misma estructura de líneas que el contrato. Estados:
// borrador | enviada | aceptada | rechazada

export async function listRentalQuotes(empresaId, filters = {}) {
  if (!empresaId) return [];
  let q = EMPRESA_COL(empresaId, 'rentalQuotes');
  const clauses = [];
  if (filters.clienteId) clauses.push(where('clienteId', '==', filters.clienteId));
  if (filters.estado)    clauses.push(where('estado', '==', filters.estado));
  if (clauses.length) q = query(q, ...clauses);
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function upsertRentalQuote(empresaId, quote) {
  const data = {
    numero: (quote.numero || '').trim(),
    clienteId: quote.clienteId || null,
    clienteNombre: quote.clienteNombre || '',
    lineas: Array.isArray(quote.lineas) ? quote.lineas : [],
    fecha: quote.fecha || new Date().toISOString(),
    validezDias: quote.validezDias || 15,
    estado: quote.estado || 'borrador',
    condiciones: quote.condiciones || '',
    contratoGeneradoId: quote.contratoGeneradoId || null,
    updatedAt: serverTimestamp(),
  };
  if (quote.id) {
    await updateDoc(EMPRESA_DOC(empresaId, 'rentalQuotes', quote.id), data);
    return quote.id;
  }
  data.createdAt = serverTimestamp();
  const ref = await addDoc(EMPRESA_COL(empresaId, 'rentalQuotes'), data);
  return ref.id;
}

export async function deleteRentalQuote(empresaId, quoteId) {
  await deleteDoc(EMPRESA_DOC(empresaId, 'rentalQuotes', quoteId));
}

// Convierte una cotización aceptada en un contrato (arrastra cliente y líneas).
// Devuelve el id del nuevo contrato y marca la cotización como aceptada+vinculada.
export async function convertQuoteToContract(empresaId, quote, extra = {}) {
  const contratoId = await upsertRentalContract(empresaId, {
    numero: extra.numero || quote.numero || '',
    clienteId: quote.clienteId,
    clienteNombre: quote.clienteNombre,
    lineas: quote.lineas || [],
    fechaInicio: extra.fechaInicio || '',
    fechaFin: extra.fechaFin || '',
    estado: 'activo',
    condiciones: quote.condiciones || '',
  });
  await updateDoc(EMPRESA_DOC(empresaId, 'rentalQuotes', quote.id), {
    estado: 'aceptada',
    contratoGeneradoId: contratoId,
    updatedAt: serverTimestamp(),
  });
  // Sincroniza disponibilidad de las máquinas del nuevo contrato
  await syncMachineRentalStatus(empresaId, {
    id: contratoId, estado: 'activo', clienteNombre: quote.clienteNombre, lineas: quote.lineas || [],
  });
  return contratoId;
}

// ============================================
// MPF RENTAL — ESTADOS DE PAGO (cobros)
// ============================================
// estado: pendiente | facturado | pagado | vencido

export async function listRentalPayments(empresaId, filters = {}) {
  if (!empresaId) return [];
  let q = EMPRESA_COL(empresaId, 'rentalPayments');
  const clauses = [];
  if (filters.contratoId) clauses.push(where('contratoId', '==', filters.contratoId));
  if (filters.clienteId)  clauses.push(where('clienteId', '==', filters.clienteId));
  if (filters.estado)     clauses.push(where('estado', '==', filters.estado));
  if (clauses.length) q = query(q, ...clauses);
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function upsertRentalPayment(empresaId, payment) {
  const data = {
    contratoId: payment.contratoId || null,
    clienteId: payment.clienteId || null,
    clienteNombre: payment.clienteNombre || '',
    periodo: payment.periodo || '',           // ej. "2026-08"
    concepto: payment.concepto || '',
    monto: Number(payment.monto || 0),
    fechaVencimiento: payment.fechaVencimiento || '',
    fechaPago: payment.fechaPago || '',
    estado: payment.estado || 'pendiente',
    numeroFactura: payment.numeroFactura || '',
    observaciones: payment.observaciones || '',
    updatedAt: serverTimestamp(),
  };
  if (payment.id) {
    await updateDoc(EMPRESA_DOC(empresaId, 'rentalPayments', payment.id), data);
    return payment.id;
  }
  data.createdAt = serverTimestamp();
  const ref = await addDoc(EMPRESA_COL(empresaId, 'rentalPayments'), data);
  return ref.id;
}

export async function deleteRentalPayment(empresaId, paymentId) {
  await deleteDoc(EMPRESA_DOC(empresaId, 'rentalPayments', paymentId));
}

// Genera cobros mensuales SUGERIDOS para un contrato (no los guarda todavía;
// la pantalla los muestra editables y el usuario confirma cuáles crear).
export function suggestPaymentsForContract(contract) {
  if (!contract.fechaInicio) return [];
  const inicio = new Date(contract.fechaInicio);
  const fin = contract.fechaFin ? new Date(contract.fechaFin) : null;
  const montoMensual = (contract.lineas || []).reduce((s, l) => s + ingresoMensualLinea(l), 0);
  if (!montoMensual) return [];

  const cobros = [];
  let cursor = new Date(inicio.getFullYear(), inicio.getMonth(), 1);
  const limite = fin || new Date(inicio.getFullYear(), inicio.getMonth() + 12, 1); // 12 meses si no hay fin
  let guard = 0;
  while (cursor <= limite && guard < 36) {
    const periodo = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`;
    // vencimiento: día 5 del mes siguiente (ajustable por el usuario en la pantalla)
    const venc = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 5);
    cobros.push({
      contratoId: contract.id,
      clienteId: contract.clienteId,
      clienteNombre: contract.clienteNombre,
      periodo,
      concepto: `Arriendo ${periodo}`,
      monto: montoMensual,
      fechaVencimiento: venc.toISOString().slice(0, 10),
      estado: 'pendiente',
    });
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
    guard++;
  }
  return cobros;
}

// ============================================
// MPF RENTAL — RENTABILIDAD REAL POR MÁQUINA
// ============================================
// Cruza: ingreso emitido (cobros) − leasing − mantenciones − repuestos.
// - El ingreso de cada cobro se reparte entre las máquinas de su contrato
//   en proporción a la tarifa mensual de cada línea.
// - Se puede filtrar por período (YYYY-MM..YYYY-MM) o total.
//
// Params:
//   machines, contracts, payments, events   (arrays ya cargados)
//   opts = { desde: 'YYYY-MM'|null, hasta: 'YYYY-MM'|null, mesesLeasing: number|null }
//     - desde/hasta null => total acumulado
//     - mesesLeasing: cuántos meses de leasing imputar (si null y hay rango, se
//       calcula por la cantidad de meses del rango; si null y es total, se usa 1)
//
// Devuelve array por máquina: { machineId, nombre, ingreso, leasing, mantencion, repuestos, margen }
export function computeRentabilidad(machines, contracts, payments, events, opts = {}) {
  const { desde = null, hasta = null } = opts;

  const enRango = (periodo) => {
    if (!periodo) return desde == null && hasta == null; // sin período solo entra en "total"
    if (desde && periodo < desde) return false;
    if (hasta && periodo > hasta) return false;
    return true;
  };
  const fechaEnRango = (fechaISO) => {
    if (!fechaISO) return desde == null && hasta == null;
    const p = String(fechaISO).slice(0, 7); // YYYY-MM
    return enRango(p);
  };

  const contratoById = {};
  for (const c of contracts) contratoById[c.id] = c;

  // Meses del rango (para imputar leasing). Total => 1 mes de referencia.
  let mesesLeasing = opts.mesesLeasing;
  if (mesesLeasing == null) {
    if (desde && hasta) {
      const [ay, am] = desde.split('-').map(Number);
      const [by, bm] = hasta.split('-').map(Number);
      mesesLeasing = (by - ay) * 12 + (bm - am) + 1;
    } else {
      mesesLeasing = 1;
    }
  }

  // Inicializa acumuladores por máquina
  const acc = {};
  for (const m of machines) {
    acc[m.id] = {
      machineId: m.id,
      nombre: m.name || `${m.marca || ''} ${m.modelo || ''}`.trim() || m.code || m.id,
      code: m.code || '',
      ingreso: 0,
      leasing: Number(m.leasingMensual || 0) * mesesLeasing,
      mantencion: 0,
      repuestos: 0,
    };
  }

  // 1) Ingreso: repartir cada cobro entre las máquinas de su contrato por tarifa
  for (const p of payments) {
    // "Todo lo emitido" => se cuentan todos los cobros (incluye pendiente)
    const periodoCobro = p.periodo || (p.fechaVencimiento ? String(p.fechaVencimiento).slice(0, 7) : null);
    if (!enRango(periodoCobro)) continue;

    const contrato = contratoById[p.contratoId];
    if (!contrato || !(contrato.lineas || []).length) continue;

    const pesos = contrato.lineas.map((l) => ({ machineId: l.machineId, peso: ingresoMensualLinea(l) }));
    const totalPeso = pesos.reduce((s, x) => s + x.peso, 0);
    if (totalPeso <= 0) continue;

    for (const { machineId, peso } of pesos) {
      if (!acc[machineId]) continue;
      acc[machineId].ingreso += Number(p.monto || 0) * (peso / totalPeso);
    }
  }

  // 2) Mantenciones y repuestos: de los maintenanceEvents de cada máquina
  for (const e of events) {
    if (!acc[e.machineId]) continue;
    if (!fechaEnRango(e.fecha)) continue;
    acc[e.machineId].mantencion += Number(e.costoTotal || 0);
    // Nota: costoTotal del evento ya incluye repuestos+mano de obra del cierre de OT.
    // Se muestra junto como "mantención" para no doblar el conteo.
  }

  const filas = Object.values(acc).map((r) => ({
    ...r,
    margen: r.ingreso - r.leasing - r.mantencion - r.repuestos,
  }));
  filas.sort((a, b) => a.margen - b.margen); // peores primero
  return filas;
}
