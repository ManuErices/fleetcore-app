import React from "react";

export default function CombustibleAnalytics({ reportesFiltrados }) {
  // ── Cálculos base ──────────────────────────────────────────────
  const totalReportes = reportesFiltrados.length;
  const firmados = reportesFiltrados.filter(r => r.firmado).length;
  const noFirmados = totalReportes - firmados;
  let totalLitros = 0, litrosEntradas = 0, litrosEntregas = 0;
  let cntEntradas = 0, cntEntregas = 0;
  const porMaquina = {};
  const porOperador = {};
  const porFecha = {};
  const porProyecto = {};

  reportesFiltrados.forEach(r => {
    const litros = parseFloat(r.cantidad) || 0;
    totalLitros += litros;
    const fecha = r.fecha ? r.fecha.slice(0, 10) : 'Sin fecha';
    if (!porFecha[fecha]) porFecha[fecha] = { entradas: 0, salidas: 0 };
    if (r.tipo === 'entrada') {
      litrosEntradas += litros;
      cntEntradas++;
      porFecha[fecha].entradas += litros;
    } else {
      litrosEntregas += litros;
      cntEntregas++;
      porFecha[fecha].salidas += litros;
      const mk = r.machinePatente || r.machineName || 'Sin patente';
      if (!porMaquina[mk]) porMaquina[mk] = { litros: 0, cnt: 0 };
      porMaquina[mk].litros += litros;
      porMaquina[mk].cnt += 1;
      const op = r.operadorNombre || 'Sin operador';
      if (!porOperador[op]) porOperador[op] = { litros: 0, cnt: 0 };
      porOperador[op].litros += litros;
      porOperador[op].cnt += 1;
    }
    const proy = r.projectName || 'Sin proyecto';
    if (!porProyecto[proy]) porProyecto[proy] = 0;
    porProyecto[proy] += litros;
  });

  const pctFirmados = Math.round((firmados / totalReportes) * 100);
  const pctEntradas = totalLitros > 0 ? Math.round((litrosEntradas / totalLitros) * 100) : 0;
  const pctSalidas = totalLitros > 0 ? Math.round((litrosEntregas / totalLitros) * 100) : 0;
  const promSalida = cntEntregas > 0 ? litrosEntregas / cntEntregas : 0;
  const promEntrada = cntEntradas > 0 ? litrosEntradas / cntEntradas : 0;
  const balanceStock = litrosEntradas - litrosEntregas;
  const topMaquinas = Object.entries(porMaquina).sort((a, b) => b[1].litros - a[1].litros).slice(0, 5);
  const topOperadores = Object.entries(porOperador).sort((a, b) => b[1].litros - a[1].litros).slice(0, 4);
  const fechasOrdenadas = Object.keys(porFecha).sort().slice(-7);
  const maxBarLitros = Math.max(...fechasOrdenadas.map(f => porFecha[f].entradas + porFecha[f].salidas), 1);
  const statusColor = pctFirmados >= 80 ? '#10b981' : pctFirmados >= 50 ? '#f59e0b' : '#ef4444';
  const balancePositivo = balanceStock >= 0;

  // Donut SVG helper
  const Donut = ({ pct, color, bg = '#e2e8f0', size = 80, stroke = 10, label, sublabel }) => {
    const r = (size - stroke) / 2;
    const circ = 2 * Math.PI * r;
    const dash = (pct / 100) * circ;
    return (
      <div className="flex flex-col items-center gap-1">
        <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={bg} strokeWidth={stroke} />
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke}
            strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
            style={{ transition: 'stroke-dasharray 0.6s ease' }} />
          <text x={size / 2} y={size / 2 + 1} textAnchor="middle" dominantBaseline="middle"
            style={{
              transform: 'rotate(90deg)', transformOrigin: `${size / 2}px ${size / 2}px`,
              fontSize: '13px', fontWeight: '800', fill: '#1e293b'
            }}>
            {pct}%
          </text>
        </svg>
        {label && <span className="text-xs font-bold text-slate-700 text-center leading-tight">{label}</span>}
        {sublabel && <span className="text-xs text-slate-400 text-center">{sublabel}</span>}
      </div>
    );
  };

  return (
    <div className="max-w-7xl mx-auto mb-6 mt-6">
      {/* ── Header ── */}
      <div className="rounded-2xl overflow-hidden shadow-xl border border-orange-100">
        <div className="px-6 py-4 flex items-center justify-between"
          style={{ background: 'linear-gradient(135deg,#1e293b 0%,#0f172a 100%)' }}>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg,#ea580c,#f97316)' }}>
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <div>
              <h2 className="text-white font-black text-base tracking-tight">Análisis en Tiempo Real</h2>
              <p className="text-slate-400 text-xs">{totalReportes} reportes en vista actual</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse inline-block"></span>
            <span className="text-xs text-slate-400 font-medium">Live</span>
          </div>
        </div>

        <div className="bg-slate-50 p-5 space-y-5">

          {/* ── Fila 1: KPIs grandes ── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Total litros */}
            <div className="rounded-2xl p-5 text-white relative overflow-hidden col-span-2 lg:col-span-1"
              style={{ background: 'linear-gradient(135deg,#ea580c 0%,#c2410c 100%)' }}>
              <div className="absolute -right-4 -top-4 w-24 h-24 rounded-full opacity-20"
                style={{ background: 'rgba(255,255,255,0.3)' }} />
              <div className="text-xs font-bold uppercase tracking-widest text-orange-200 mb-2">Total Combustible</div>
              <div className="text-4xl font-black tracking-tight">{totalLitros.toLocaleString('es-CL')}</div>
              <div className="text-orange-200 text-sm font-semibold mt-0.5">litros gestionados</div>
              <div className="mt-3 pt-3 border-t border-orange-400/40 flex justify-between text-xs text-orange-200">
                <span>{totalReportes} reportes</span>
                <span>≈ {(totalLitros / totalReportes).toFixed(0)} L/rep</span>
              </div>
            </div>

            {/* Balance stock */}
            <div className={`rounded-2xl p-5 relative overflow-hidden ${balancePositivo ? 'bg-emerald-900' : 'bg-red-900'}`}>
              <div className="absolute -right-4 -top-4 w-20 h-20 rounded-full opacity-10 bg-white" />
              <div className={`text-xs font-bold uppercase tracking-widest mb-2 ${balancePositivo ? 'text-emerald-300' : 'text-red-300'}`}>Balance Stock</div>
              <div className={`text-3xl font-black ${balancePositivo ? 'text-emerald-400' : 'text-red-400'}`}>
                {balancePositivo ? '+' : ''}{balanceStock.toLocaleString('es-CL')}
              </div>
              <div className={`text-sm font-semibold mt-0.5 ${balancePositivo ? 'text-emerald-200' : 'text-red-200'}`}>litros disponibles</div>
              <div className={`mt-3 pt-3 border-t ${balancePositivo ? 'border-emerald-700' : 'border-red-700'} text-xs ${balancePositivo ? 'text-emerald-400' : 'text-red-400'}`}>
                {balancePositivo ? '✓ Superávit de combustible' : '⚠ Déficit de combustible'}
              </div>
            </div>

            {/* Prom salida */}
            <div className="rounded-2xl p-5 bg-white border border-slate-200 shadow-sm">
              <div className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-2">Prom. por Salida</div>
              <div className="text-3xl font-black text-slate-800">{promSalida.toFixed(0)}</div>
              <div className="text-slate-500 text-sm font-semibold mt-0.5">litros / despacho</div>
              <div className="mt-3 pt-3 border-t border-slate-100 text-xs text-slate-400">
                Prom. entrada: {promEntrada.toFixed(0)} L
              </div>
            </div>

            {/* Tasa validación */}
            <div className="rounded-2xl p-5 bg-white border border-slate-200 shadow-sm flex flex-col items-center justify-center">
              <div className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-3">Tasa Validación</div>
              <Donut pct={pctFirmados} color={statusColor} size={76} stroke={9} />
              <div className="mt-2 text-xs text-slate-400">{firmados}/{totalReportes} firmados</div>
            </div>
          </div>

          {/* ── Fila 2: Distribución + Gráfico barras ── */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

            {/* Donut distribución entradas/salidas */}
            <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
              <div className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-4">Distribución por Tipo</div>
              <div className="flex items-center justify-around">
                <Donut pct={pctEntradas} color="#f59e0b" size={90} stroke={11} label="Entradas" sublabel={`${litrosEntradas.toLocaleString('es-CL')} L`} />
                <div className="flex flex-col items-center gap-1">
                  <div className="text-2xl font-black text-slate-300">vs</div>
                  <div className="text-xs text-slate-400">{cntEntradas}e · {cntEntregas}s</div>
                </div>
                <Donut pct={pctSalidas} color="#ea580c" size={90} stroke={11} label="Salidas" sublabel={`${litrosEntregas.toLocaleString('es-CL')} L`} />
              </div>
              {/* Mini barra stacked */}
              <div className="mt-4 h-2 rounded-full overflow-hidden flex">
                <div className="bg-amber-400 transition-all" style={{ width: `${pctEntradas}%` }} />
                <div className="bg-orange-500 transition-all" style={{ width: `${pctSalidas}%` }} />
              </div>
              <div className="flex justify-between mt-1 text-xs text-slate-400">
                <span>⬇ Entradas {pctEntradas}%</span>
                <span>Salidas {pctSalidas}% ➡</span>
              </div>
            </div>

            {/* Gráfico de barras por fecha (últimos 7 días con datos) */}
            <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm lg:col-span-2">
              <div className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-4">Actividad por Fecha</div>
              {fechasOrdenadas.length > 0 ? (
                <div className="flex items-end gap-1.5 h-28">
                  {fechasOrdenadas.map(fecha => {
                    const d = porFecha[fecha];
                    const total = d.entradas + d.salidas;
                    const hTotal = maxBarLitros > 0 ? (total / maxBarLitros) * 100 : 0;
                    const hEntradas = total > 0 ? (d.entradas / total) * hTotal : 0;
                    const hSalidas = total > 0 ? (d.salidas / total) * hTotal : 0;
                    const label = fecha.slice(5); // MM-DD
                    return (
                      <div key={fecha} className="flex-1 flex flex-col items-center gap-0.5" title={`${fecha}: ${total.toFixed(0)} L`}>
                        <div className="w-full flex flex-col justify-end rounded-t-lg overflow-hidden" style={{ height: '96px' }}>
                          <div className="w-full bg-orange-500 rounded-t-sm transition-all" style={{ height: `${hSalidas}%` }} />
                          <div className="w-full bg-amber-400 transition-all" style={{ height: `${hEntradas}%` }} />
                        </div>
                        <span className="text-slate-400 text-center leading-none" style={{ fontSize: '9px' }}>{label}</span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="h-28 flex items-center justify-center text-slate-300 text-sm">Sin datos de fechas</div>
              )}
              <div className="flex gap-4 mt-3 text-xs text-slate-500">
                <span className="flex items-center gap-1"><span className="w-3 h-2 rounded-sm bg-amber-400 inline-block" />Entradas</span>
                <span className="flex items-center gap-1"><span className="w-3 h-2 rounded-sm bg-orange-500 inline-block" />Salidas</span>
              </div>
            </div>
          </div>

          {/* ── Fila 3: Top máquinas + Top operadores ── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

            {/* Top máquinas */}
            <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
              <div className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-4">Top Máquinas por Consumo</div>
              {topMaquinas.length > 0 ? (
                <div className="space-y-3">
                  {topMaquinas.map(([nombre, data], i) => {
                    const pct = litrosEntregas > 0 ? (data.litros / litrosEntregas) * 100 : 0;
                    const gradients = [
                      'from-orange-500 to-red-500',
                      'from-amber-500 to-orange-400',
                      'from-yellow-400 to-amber-400',
                      'from-slate-400 to-slate-500',
                      'from-slate-300 to-slate-400',
                    ];
                    return (
                      <div key={nombre} className="flex items-center gap-3">
                        <div className={`w-6 h-6 rounded-lg bg-gradient-to-br ${gradients[i]} flex items-center justify-center flex-shrink-0`}>
                          <span className="text-white text-xs font-black">{i + 1}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between items-center mb-1">
                            <span className="text-sm font-bold text-slate-700 truncate">{nombre}</span>
                            <span className="text-xs font-bold text-slate-500 ml-2 flex-shrink-0">{data.litros.toLocaleString('es-CL')} L</span>
                          </div>
                          <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                            <div className={`h-full bg-gradient-to-r ${gradients[i]} rounded-full transition-all`} style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                        <span className="text-xs text-slate-400 flex-shrink-0 w-8 text-right">{pct.toFixed(0)}%</span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-sm text-slate-300 text-center py-6">Sin datos de máquinas</div>
              )}
            </div>

            {/* Top operadores */}
            <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
              <div className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-4">Top Operadores por Recepción</div>
              {topOperadores.length > 0 ? (
                <div className="space-y-3">
                  {topOperadores.map(([nombre, data], i) => {
                    const pct = litrosEntregas > 0 ? (data.litros / litrosEntregas) * 100 : 0;
                    const avatarColors = ['#ea580c', '#f59e0b', '#10b981', '#6366f1'];
                    const initials = nombre.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
                    return (
                      <div key={nombre} className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-white text-xs font-black"
                          style={{ background: avatarColors[i] || '#94a3b8' }}>
                          {initials}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between items-center mb-1">
                            <span className="text-sm font-bold text-slate-700 truncate">{nombre}</span>
                            <span className="text-xs text-slate-500 ml-2 flex-shrink-0">{data.litros.toLocaleString('es-CL')} L · {data.cnt} desp.</span>
                          </div>
                          <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                            <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: avatarColors[i] }} />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-sm text-slate-300 text-center py-6">Sin datos de operadores</div>
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
