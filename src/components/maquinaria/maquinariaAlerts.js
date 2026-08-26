import {
  listMachines, listMachineDocuments, listRentalContracts,
  listSpareParts, listMaintenancePlans, listMaintenanceEvents,
} from "../../lib/db";

// ============================================================
// buildMaquinariaAlerts — calcula todas las alertas del módulo
// leyendo los datos que ya existen. No usa Cloud Functions.
//
// Devuelve un array de alertas:
//   { id, tipo, severidad, titulo, detalle, entidad, entidadId }
// severidad: 'critica' | 'alta' | 'media'
// ============================================================

const DIAS_AVISO_DOC = 30;       // documentos que vencen dentro de 30 días
const DIAS_AVISO_CONTRATO = 15;  // contratos que terminan dentro de 15 días

function diasHasta(fecha) {
  if (!fecha) return null;
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const f = new Date(fecha);
  return Math.ceil((f - hoy) / (1000 * 60 * 60 * 24));
}

const TIPOS_DOC_LABEL = {
  leasing: "Contrato leasing", permiso_circulacion: "Permiso de circulación",
  soap: "SOAP", seguro_complementario: "Seguro complementario",
  anotaciones_vigentes: "Certificado anotaciones vigentes", revision_tecnica: "Revisión técnica",
  padron: "Padrón", otro: "Documento",
};

export async function buildMaquinariaAlerts(empresaId) {
  if (!empresaId) return { alerts: [], counts: {} };

  const [machines, contracts, spareParts, plans, events] = await Promise.all([
    listMachines(empresaId),
    listRentalContracts(empresaId),
    listSpareParts(empresaId),
    listMaintenancePlans(empresaId),
    listMaintenanceEvents(empresaId),
  ]);

  // Documentos: se consultan por máquina (colección filtrada por machineId)
  const docsPorMaquina = await Promise.all(
    machines.map((m) => listMachineDocuments(empresaId, m.id).then((docs) => ({ m, docs })))
  );

  const machineName = (m) => m.name || `${m.marca || ""} ${m.modelo || ""}`.trim() || m.code || m.id;
  const machineById = (id) => machines.find((x) => x.id === id);
  const alerts = [];

  // 1. Documentos vencidos / por vencer
  for (const { m, docs } of docsPorMaquina) {
    for (const d of docs) {
      const dias = diasHasta(d.fechaVencimiento);
      if (dias == null) continue;
      const label = TIPOS_DOC_LABEL[d.tipo] || d.tipo;
      if (dias < 0) {
        alerts.push({
          id: `doc-${d.id}`, tipo: "documento", severidad: "critica",
          titulo: `${label} vencido`, detalle: `${machineName(m)} · venció hace ${Math.abs(dias)} días`,
          entidad: "machine", entidadId: m.id,
        });
      } else if (dias <= DIAS_AVISO_DOC) {
        alerts.push({
          id: `doc-${d.id}`, tipo: "documento", severidad: dias <= 7 ? "alta" : "media",
          titulo: `${label} por vencer`, detalle: `${machineName(m)} · vence en ${dias} días`,
          entidad: "machine", entidadId: m.id,
        });
      }
    }
  }

  // 2. Contratos por vencer / vencidos (activos)
  for (const c of contracts) {
    if (c.estado !== "activo" || !c.fechaFin) continue;
    const dias = diasHasta(c.fechaFin);
    if (dias == null) continue;
    if (dias < 0) {
      alerts.push({
        id: `contract-${c.id}`, tipo: "contrato", severidad: "alta",
        titulo: "Contrato vencido aún activo", detalle: `${c.clienteNombre || "Cliente"} · terminó hace ${Math.abs(dias)} días`,
        entidad: "contract", entidadId: c.id,
      });
    } else if (dias <= DIAS_AVISO_CONTRATO) {
      alerts.push({
        id: `contract-${c.id}`, tipo: "contrato", severidad: dias <= 5 ? "alta" : "media",
        titulo: "Contrato por vencer", detalle: `${c.clienteNombre || "Cliente"} · termina en ${dias} días`,
        entidad: "contract", entidadId: c.id,
      });
    }
  }

  // 3. Mantenciones atrasadas (plan vs medidor de la máquina)
  const eventosPorPlan = (planId) =>
    events.filter((e) => e.planId === planId && e.proximaMantencionEn != null)
          .sort((a, b) => (b.medidorAlMomento || 0) - (a.medidorAlMomento || 0));

  for (const plan of plans) {
    const m = machineById(plan.machineId);
    if (!m || m.medidorActual == null) continue;
    const ev = eventosPorPlan(plan.id);
    const objetivo = ev.length > 0 ? ev[0].proximaMantencionEn : Number(m.medidorActual) + Number(plan.intervalo || 0);
    const restante = objetivo - Number(m.medidorActual);
    const tol = Number(plan.tolerancia || 0);
    if (restante < -tol) {
      alerts.push({
        id: `plan-${plan.id}`, tipo: "mantencion", severidad: "alta",
        titulo: "Mantención atrasada", detalle: `${machineName(m)} · ${plan.nombre} · vencida por ${Math.abs(restante)}`,
        entidad: "machine", entidadId: m.id,
      });
    }
  }

  // 4. Repuestos bajo stock mínimo
  for (const p of spareParts) {
    if (p.activo === false) continue;
    if ((p.stock || 0) <= (p.stockMinimo || 0)) {
      alerts.push({
        id: `stock-${p.id}`, tipo: "stock", severidad: (p.stock || 0) === 0 ? "alta" : "media",
        titulo: "Repuesto bajo stock", detalle: `${p.descripcion} · ${p.stock || 0}/${p.stockMinimo || 0}`,
        entidad: "sparePart", entidadId: p.id,
      });
    }
  }

  // Orden por severidad
  const peso = { critica: 0, alta: 1, media: 2 };
  alerts.sort((a, b) => (peso[a.severidad] ?? 9) - (peso[b.severidad] ?? 9));

  const counts = {
    total: alerts.length,
    critica: alerts.filter((a) => a.severidad === "critica").length,
    alta: alerts.filter((a) => a.severidad === "alta").length,
    media: alerts.filter((a) => a.severidad === "media").length,
    documento: alerts.filter((a) => a.tipo === "documento").length,
    contrato: alerts.filter((a) => a.tipo === "contrato").length,
    mantencion: alerts.filter((a) => a.tipo === "mantencion").length,
    stock: alerts.filter((a) => a.tipo === "stock").length,
  };

  return { alerts, counts };
}
