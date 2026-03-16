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
import { db } from "./firebase";

// ─── Multi-tenant: paths bajo /empresas/{empresaId}/ ─────────
// Las colecciones globales (settings, subscription_intents) NO pasan por aquí
const EMPRESA_COL = (empresaId, colName) =>
  collection(db, 'empresas', empresaId, colName);

// Colecciones de empresa
const COLS = [
  'projects', 'machines', 'dailyLogs', 'fuelLogs',
  'employees', 'employeeMonthlyData', 'employeeAssignments',
  'purchaseOrders', 'rendiciones', 'subcontratos',
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

// ============================================
// MÁQUINAS
// ============================================

export async function listMachines(empresaId, projectId) {
  const q = query(
    EMPRESA_COL(empresaId, 'machines'),
    where("projectId", "==", projectId),
    orderBy("code")
  );
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
  console.log(`👥 Cargando empleados del proyecto ${projectId}`);
  
  try {
    const q = query(
      EMPRESA_COL(empresaId, 'employees'),
      where("projectId", "==", projectId)
    );
    
    const snap = await getDocs(q);
    const employees = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    
    console.log(`✅ ${employees.length} empleados cargados`);
    return employees;
    
  } catch (error) {
    console.error("❌ Error al cargar empleados:", error);
    throw error;
  }
}

export async function getEmployeeByRut(empresaId, projectId, rut) {
  try {
    const q = query(
      EMPRESA_COL(empresaId, 'employees'),
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
    const ref = await addDoc(EMPRESA_COL(empresaId, 'employees'), dataToSave);
    console.log("✅ Empleado creado con ID:", ref.id);
    return ref.id;
  }
  const { id, ...rest } = employee;
  await updateDoc(EMPRESA_DOC(empresaId, 'employees', id), {
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
  await deleteDoc(EMPRESA_DOC(empresaId, 'employees', employeeId));
  console.log("✅ Empleado eliminado con ID:", employeeId);
}

// ============================================
// EMPLOYEE MONTHLY DATA (REMUNERACIONES)
// ============================================

export async function listEmployeeMonthlyData(empresaId, projectId, year, month) {
  console.log(`📅 Cargando datos mensuales: ${year}-${month}`);
  
  try {
    const q = query(
      EMPRESA_COL(empresaId, 'employeeMonthlyData'),
      where("projectId", "==", projectId),
      where("year", "==", year),
      where("month", "==", month)
    );
    
    const snap = await getDocs(q);
    const monthlyData = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    
    console.log(`✅ ${monthlyData.length} registros mensuales cargados`);
    return monthlyData;
    
  } catch (error) {
    console.error("❌ Error al cargar datos mensuales:", error);
    throw error;
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
