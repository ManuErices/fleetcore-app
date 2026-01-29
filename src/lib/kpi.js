export function toNumber(x) {
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
}

const BILLING_TYPES = {
  HOURLY: "hourly",
  DAILY_FIXED: "daily",
  MONTHLY_FIXED: "monthly"
};

// Calcular valor proyectado mensual según tipo de cobro
export function calcProjectedValue(machine, daysInRange = 30) {
  const billingType = machine.billingType || BILLING_TYPES.HOURLY;
  
  if (billingType === BILLING_TYPES.HOURLY) {
    // Por hora: horas mínimas * tarifa productiva
    const minimumHours = toNumber(machine.minimumMonthlyHours);
    const productiveRate = toNumber(machine.clientRateProductive);
    return minimumHours * productiveRate;
  }
  
  if (billingType === BILLING_TYPES.DAILY_FIXED) {
    // Por día: no hay proyección, se cobra según días trabajados
    return 0;
  }
  
  if (billingType === BILLING_TYPES.MONTHLY_FIXED) {
    // Mensual fijo: el valor completo mensual
    // Si el rango es menor a 30 días, prorrateamos
    const monthlyRate = toNumber(machine.clientRateMonthly);
    return (monthlyRate / 30) * daysInRange;
  }
  
  return 0;
}

// Calcular costos de un log según el tipo de cobro de la máquina
export function calcLogCosts(log, machine) {
  const billingType = machine.billingType || BILLING_TYPES.HOURLY;
  
  const p = toNumber(log.productiveHours);
  const s = toNumber(log.standbyHours);
  const d = toNumber(log.downtimeHours);
  
  let internal = 0;
  let client = 0;
  
  if (billingType === BILLING_TYPES.HOURLY) {
    // Por hora: calcular según horas trabajadas
    internal = 
      p * toNumber(machine.internalRateProductive) +
      s * toNumber(machine.internalRateStandby);
    
    client =
      p * toNumber(machine.clientRateProductive) +
      s * toNumber(machine.clientRateStandby);
  }
  
  else if (billingType === BILLING_TYPES.DAILY_FIXED) {
    // Por día fijo: si hay alguna hora productiva, se cobra el día completo
    if (p > 0) {
      internal = toNumber(machine.internalRatePerDay);
      client = toNumber(machine.clientRatePerDay);
    }
  }
  
  else if (billingType === BILLING_TYPES.MONTHLY_FIXED) {
    // Mensual fijo: se prorratea por día (1/30 del mensual por cada día con log)
    if (p > 0 || s > 0) {
      internal = toNumber(machine.internalRateMonthly) / 30;
      client = toNumber(machine.clientRateMonthly) / 30;
    }
  }

  return {
    internal,
    client,
    hours: { productive: p, standby: s, downtime: d, total: p + s + d },
  };
}

export function calcRangeKPIs(logs, machineById) {
  let totalP = 0, totalS = 0, totalD = 0;
  let internalCost = 0, clientCost = 0;
  let projectedValue = 0;

  // Calcular totales y valor proyectado
  for (const machineId in machineById) {
    const machine = machineById[machineId];
    if (machine && machine.active !== false) {
      // Para calcular días en rango, necesitamos saber el rango
      // Por ahora asumimos 30 días, pero podría pasarse como parámetro
      projectedValue += calcProjectedValue(machine, 30);
    }
  }

  // Contar días trabajados por máquina (para equipos mensuales fijos)
  const daysWorkedByMachine = {};
  for (const log of logs) {
    if (!daysWorkedByMachine[log.machineId]) {
      daysWorkedByMachine[log.machineId] = new Set();
    }
    daysWorkedByMachine[log.machineId].add(log.date);
  }

  for (const log of logs) {
    const m = machineById[log.machineId];
    if (!m) continue;

    const { internal, client, hours } = calcLogCosts(log, m);
    internalCost += internal;
    clientCost += client;

    totalP += hours.productive;
    totalS += hours.standby;
    totalD += hours.downtime;
  }

  const total = totalP + totalS + totalD;
  const available = Math.max(0, total - totalD);

  const availability = total > 0 ? available / total : 0;
  const utilization = available > 0 ? totalP / available : 0;
  const standbyRate = total > 0 ? totalS / total : 0;

  // Calcular cumplimiento (real vs proyectado)
  const compliance = projectedValue > 0 ? clientCost / projectedValue : 0;

  return {
    hours: { productive: totalP, standby: totalS, downtime: totalD, total },
    costs: { 
      internal: internalCost, 
      client: clientCost, 
      margin: clientCost - internalCost,
      projected: projectedValue,
      variance: clientCost - projectedValue,
      variancePercent: projectedValue > 0 ? (clientCost - projectedValue) / projectedValue : 0
    },
    rates: { availability, utilization, standbyRate, compliance },
  };
}
