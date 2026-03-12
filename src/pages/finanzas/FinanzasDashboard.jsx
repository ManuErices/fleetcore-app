import React, { useState } from "react";

// ─── Mock data (se reemplazará con Firebase en fases siguientes) ──────────────
const MOCK = {
  saldoActual:       48320000,
  ingresosMes:       32500000,
  egresosMes:        21800000,
  flujoCaja:         10700000,
  cuentasPorPagar:    8450000,
  creditosVigentes:  95000000,
  activosTotales:   312000000,
  costosFijosMes:    6200000,

  alertas: [
    { tipo: "danger",  texto: "Factura ACMA Ltda. vence en 3 días",          monto: 1200000  },
    { tipo: "warning", texto: "Cuota crédito BancoEstado vence el día 20",    monto: 890000   },
    { tipo: "info",    texto: "Proyección flujo mes próximo: positivo",        monto: 4200000  },
  ],

  flujoPorMes: [
    { mes: "Oct", ingresos: 28000000, egresos: 19500000 },
    { mes: "Nov", ingresos: 30500000, egresos: 22000000 },
    { mes: "Dic", ingresos: 27000000, egresos: 24500000 },
    { mes: "Ene", ingresos: 31000000, egresos: 20000000 },
    { mes: "Feb", ingresos: 29500000, egresos: 21000000 },
    { mes: "Mar", ingresos: 32500000, egresos: 21800000 },
  ],

  topProveedores: [
    { nombre: "ACMA Ltda.",        monto: 3200000, vence: "2026-03-15" },
    { nombre: "Ferreterías Sur",   monto: 1850000, vence: "2026-03-22" },
    { nombre: "Combustibles SPA",  monto: 1400000, vence: "2026-03-28" },
    { nombre: "Servicios TI Pro",  monto:  980000, vence: "2026-04-05" },
  ],

  costosPorCategoria: [
    { categoria: "Personal",    monto: 8200000 },
    { categoria: "Maquinaria",  monto: 4500000 },
    { categoria: "Combustible", monto: 3100000 },
    { categoria: "Arriendos",   monto: 2800000 },
    { categoria: "Otros",       monto: 3200000 },
  ],
};

// ─── Utilidades ───────────────────────────────────────────────────────────────
function fmt(n) {
  return "$" + Math.abs(Math.round(n)).toLocaleString("es-CL");
}
function fmtM(n) {
  if (Math.abs(n) >= 1000000) return "$" + (n / 1000000).toFixed(1).replace(".", ",") + "M";
  return fmt(n);
}
function diasHasta(fechaStr) {
  const hoy = new Date(); hoy.setHours(0,0,0,0);
  return Math.round((new Date(fechaStr + "T00:00:00") - hoy) / 86400000);
}

// ─── KPI Card ────────────────────────────────────────────────────────────────
function KpiCard({ icon, label, value, sub, gradient, positive }) {
  return (
    <div className="glass-card rounded-xl p-4 sm:p-5 hover:shadow-lg transition-shadow">
      <div className="flex items-start justify-between mb-3">
        <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center shadow-md text-xl`}>
          {icon}
        </div>
        {positive !== undefined && (
          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${positive ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>
            {positive ? "▲" : "▼"}
          </span>
        )}
      </div>
      <div className="text-xl sm:text-2xl font-black text-slate-900 break-words">{value}</div>
      <div className="text-xs sm:text-sm font-semibold text-slate-600 mt-0.5">{label}</div>
      {sub && <div className="text-[11px] text-slate-400 mt-1">{sub}</div>}
    </div>
  );
}

// ─── Alerta Card ─────────────────────────────────────────────────────────────
const ALERTA_STYLES = {
  danger:  { bg: "bg-red-50 border-red-200",    icon: "🔴", text: "text-red-800",    badge: "bg-red-100 text-red-700"    },
  warning: { bg: "bg-amber-50 border-amber-200", icon: "🟡", text: "text-amber-800",  badge: "bg-amber-100 text-amber-700" },
  info:    { bg: "bg-purple-50 border-purple-200",icon: "🟣", text: "text-purple-800", badge: "bg-purple-100 text-purple-700"},
};
function AlertaCard({ tipo, texto, monto }) {
  const s = ALERTA_STYLES[tipo];
  return (
    <div className={`flex items-center justify-between gap-3 p-3 rounded-xl border ${s.bg}`}>
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-base flex-shrink-0">{s.icon}</span>
        <span className={`text-xs sm:text-sm font-semibold ${s.text} leading-tight`}>{texto}</span>
      </div>
      <span className={`text-xs font-bold px-2 py-1 rounded-lg flex-shrink-0 ${s.badge}`}>{fmtM(monto)}</span>
    </div>
  );
}

// ─── Mini gráfico de barras ───────────────────────────────────────────────────
function FlujoCajaChart({ data }) {
  const maxVal = Math.max(...data.flatMap(d => [d.ingresos, d.egresos]));
  return (
    <div className="flex items-end justify-between gap-1 h-28 mt-2">
      {data.map((d, i) => {
        const hI = (d.ingresos / maxVal) * 100;
        const hE = (d.egresos  / maxVal) * 100;
        const flujo = d.ingresos - d.egresos;
        return (
          <div key={i} className="flex-1 flex flex-col items-center gap-0.5 group relative">
            {/* Tooltip */}
            <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-[10px] rounded-lg px-2 py-1.5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-10 shadow-xl">
              <div className="font-bold text-emerald-400">▲ {fmtM(d.ingresos)}</div>
              <div className="font-bold text-red-400">▼ {fmtM(d.egresos)}</div>
              <div className={`font-black ${flujo >= 0 ? "text-purple-300" : "text-red-300"}`}>
                {flujo >= 0 ? "+" : ""}{fmtM(flujo)}
              </div>
            </div>
            {/* Barras */}
            <div className="w-full flex gap-0.5 items-end" style={{ height: "100px" }}>
              <div
                className="flex-1 bg-gradient-to-t from-purple-700 to-purple-500 rounded-t-sm opacity-90"
                style={{ height: `${hI}%` }}
              />
              <div
                className="flex-1 bg-gradient-to-t from-slate-400 to-slate-300 rounded-t-sm"
                style={{ height: `${hE}%` }}
              />
            </div>
            <span className="text-[9px] font-bold text-slate-500">{d.mes}</span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Barra de categorías ──────────────────────────────────────────────────────
const CAT_COLORS = [
  "bg-purple-600", "bg-violet-500", "bg-purple-400",
  "bg-violet-400", "bg-purple-300",
];
function CategoriasBarra({ data }) {
  const total = data.reduce((s, d) => s + d.monto, 0);
  return (
    <div className="space-y-2.5 mt-2">
      {data.map((d, i) => {
        const pct = ((d.monto / total) * 100).toFixed(1);
        return (
          <div key={i}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-semibold text-slate-600">{d.categoria}</span>
              <span className="text-xs font-black text-slate-800">{fmtM(d.monto)}</span>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-2">
              <div
                className={`h-2 rounded-full ${CAT_COLORS[i % CAT_COLORS.length]} transition-all`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Dashboard principal ──────────────────────────────────────────────────────
export default function FinanzasDashboard({ onNavigate }) {
  const [mes] = useState("Marzo 2026");
  const d = MOCK;
  const flujoNeto = d.ingresosMes - d.egresosMes;

  return (
    <div className="space-y-4 sm:space-y-6 p-4 sm:p-6">

      {/* Header */}
      <div className="glass-card rounded-xl sm:rounded-2xl p-4 sm:p-6 animate-fadeInUp">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-3 sm:gap-4">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-gradient-to-br from-purple-700 to-violet-600 flex items-center justify-center shadow-lg flex-shrink-0">
              <svg className="w-5 h-5 sm:w-6 sm:h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
              </svg>
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                Dashboard <span className="text-purple-700">Financiero</span>
              </h1>
              <p className="text-slate-500 text-xs sm:text-sm mt-0.5">Resumen ejecutivo · {mes}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="px-3 py-1.5 bg-purple-50 text-purple-700 text-xs font-bold rounded-lg border border-purple-200">
              {mes}
            </span>
          </div>
        </div>
      </div>

      {/* KPIs principales */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <KpiCard
          icon="💰" label="Saldo Actual"
          value={fmtM(d.saldoActual)}
          sub="Cuentas corrientes"
          gradient="from-purple-700 to-violet-600"
          positive={true}
        />
        <KpiCard
          icon="📈" label="Ingresos del Mes"
          value={fmtM(d.ingresosMes)}
          sub="Marzo 2026"
          gradient="from-emerald-600 to-teal-600"
          positive={true}
        />
        <KpiCard
          icon="📉" label="Egresos del Mes"
          value={fmtM(d.egresosMes)}
          sub="Marzo 2026"
          gradient="from-red-500 to-rose-600"
          positive={false}
        />
        <KpiCard
          icon="⚖️" label="Flujo Neto"
          value={(flujoNeto >= 0 ? "+" : "") + fmtM(flujoNeto)}
          sub="Ingresos − Egresos"
          gradient={flujoNeto >= 0 ? "from-purple-600 to-violet-500" : "from-red-600 to-rose-500"}
          positive={flujoNeto >= 0}
        />
      </div>

      {/* KPIs secundarios */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <KpiCard
          icon="🏗️" label="Activos Totales"
          value={fmtM(d.activosTotales)}
          sub="Valor libro"
          gradient="from-violet-600 to-purple-500"
        />
        <KpiCard
          icon="🤝" label="Cuentas por Pagar"
          value={fmtM(d.cuentasPorPagar)}
          sub="Proveedores vigentes"
          gradient="from-amber-500 to-orange-500"
          positive={false}
        />
        <KpiCard
          icon="🏦" label="Créditos Vigentes"
          value={fmtM(d.creditosVigentes)}
          sub="Saldo insoluto"
          gradient="from-blue-600 to-cyan-600"
        />
        <KpiCard
          icon="📋" label="Costos Fijos Mes"
          value={fmtM(d.costosFijosMes)}
          sub="Comprometidos"
          gradient="from-slate-600 to-slate-500"
        />
      </div>

      {/* Gráfico flujo + Alertas */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">

        {/* Gráfico flujo de caja */}
        <div className="glass-card rounded-xl p-4 sm:p-6">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <span className="text-xl">📊</span>
              <h3 className="text-base font-bold text-slate-900">Flujo de Caja — Últimos 6 meses</h3>
            </div>
            <button
              onClick={() => onNavigate("flujo")}
              className="text-xs font-semibold text-purple-700 hover:text-purple-900 transition-colors"
            >
              Ver detalle →
            </button>
          </div>
          <div className="flex items-center gap-4 mb-3">
            <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm bg-purple-600" /><span className="text-xs text-slate-500">Ingresos</span></div>
            <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm bg-slate-300" /><span className="text-xs text-slate-500">Egresos</span></div>
          </div>
          <FlujoCajaChart data={d.flujoPorMes} />
        </div>

        {/* Alertas */}
        <div className="glass-card rounded-xl p-4 sm:p-6">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-xl">🔔</span>
            <h3 className="text-base font-bold text-slate-900">Alertas y Pendientes</h3>
            <span className="ml-auto text-xs font-bold bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">
              {d.alertas.length}
            </span>
          </div>
          <div className="space-y-2.5">
            {d.alertas.map((a, i) => (
              <AlertaCard key={i} {...a} />
            ))}
          </div>
        </div>
      </div>

      {/* Proveedores pendientes + Costos por categoría */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">

        {/* Top proveedores */}
        <div className="glass-card rounded-xl p-4 sm:p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <span className="text-xl">🤝</span>
              <h3 className="text-base font-bold text-slate-900">Proveedores por Pagar</h3>
            </div>
            <button
              onClick={() => onNavigate("proveedores")}
              className="text-xs font-semibold text-purple-700 hover:text-purple-900 transition-colors"
            >
              Ver todos →
            </button>
          </div>
          <div className="space-y-3">
            {d.topProveedores.map((p, i) => {
              const dias = diasHasta(p.vence);
              const urgente = dias <= 5;
              const proximo = dias <= 15;
              return (
                <div key={i} className="flex items-center justify-between gap-2 py-2 border-b border-slate-100 last:border-0">
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-slate-800 truncate">{p.nombre}</div>
                    <div className={`text-xs font-semibold mt-0.5 ${urgente ? "text-red-600" : proximo ? "text-amber-600" : "text-slate-400"}`}>
                      {dias < 0 ? `Vencida hace ${Math.abs(dias)} días` : dias === 0 ? "Vence hoy" : `Vence en ${dias} días`}
                    </div>
                  </div>
                  <span className={`text-sm font-black flex-shrink-0 ${urgente ? "text-red-700" : "text-slate-800"}`}>
                    {fmtM(p.monto)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Costos por categoría */}
        <div className="glass-card rounded-xl p-4 sm:p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <span className="text-xl">📦</span>
              <h3 className="text-base font-bold text-slate-900">Costos por Categoría</h3>
            </div>
            <button
              onClick={() => onNavigate("costos")}
              className="text-xs font-semibold text-purple-700 hover:text-purple-900 transition-colors"
            >
              Ver detalle →
            </button>
          </div>
          <CategoriasBarra data={d.costosPorCategoria} />
          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total mes</span>
            <span className="text-base font-black text-slate-900">
              {fmt(d.costosPorCategoria.reduce((s, c) => s + c.monto, 0))}
            </span>
          </div>
        </div>
      </div>

    </div>
  );
}
