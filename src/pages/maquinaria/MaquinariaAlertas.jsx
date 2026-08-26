import React, { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useEmpresa } from "../../lib/useEmpresa";
import { buildMaquinariaAlerts } from "../../components/maquinaria/maquinariaAlerts";

const SEV = {
  critica: { label: "Crítica", color: "bg-red-100 text-red-700 border-red-200", dot: "bg-red-500" },
  alta:    { label: "Alta",    color: "bg-orange-100 text-orange-700 border-orange-200", dot: "bg-orange-500" },
  media:   { label: "Media",   color: "bg-amber-100 text-amber-700 border-amber-200", dot: "bg-amber-500" },
};

const TIPO_LABEL = {
  documento: "Documentos", contrato: "Contratos", mantencion: "Mantenciones", stock: "Repuestos",
};

const RUTA_POR_TIPO = {
  documento: "/maquinaria/equipos",
  contrato: "/maquinaria/contratos",
  mantencion: "/maquinaria/equipos",
  stock: "/maquinaria/repuestos",
};

export default function MaquinariaAlertas() {
  const { empresaId } = useEmpresa();
  const navigate = useNavigate();
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtroTipo, setFiltroTipo] = useState("all");

  useEffect(() => {
    if (!empresaId) return;
    (async () => {
      setLoading(true);
      try {
        const { alerts } = await buildMaquinariaAlerts(empresaId);
        setAlerts(alerts);
      } finally {
        setLoading(false);
      }
    })();
  }, [empresaId]);

  const filtered = useMemo(() => (
    filtroTipo === "all" ? alerts : alerts.filter((a) => a.tipo === filtroTipo)
  ), [alerts, filtroTipo]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-black text-slate-900">Centro de alertas</h1>

      <div className="flex flex-wrap gap-2">
        <FiltroBtn active={filtroTipo === "all"} onClick={() => setFiltroTipo("all")} label={`Todas (${alerts.length})`} />
        {Object.entries(TIPO_LABEL).map(([id, label]) => {
          const count = alerts.filter((a) => a.tipo === id).length;
          if (!count) return null;
          return <FiltroBtn key={id} active={filtroTipo === id} onClick={() => setFiltroTipo(id)} label={`${label} (${count})`} />;
        })}
      </div>

      {loading ? (
        <div className="text-center py-12 text-slate-400 font-semibold">Revisando alertas...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-4xl mb-2">✅</p>
          <p className="text-slate-500 font-semibold">
            {alerts.length === 0 ? "Todo en orden — no hay alertas." : "Sin alertas de este tipo."}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((a) => {
            const sev = SEV[a.severidad] || SEV.media;
            return (
              <button
                key={a.id}
                onClick={() => navigate(RUTA_POR_TIPO[a.tipo] || "/maquinaria")}
                className="w-full text-left bg-white border-2 border-slate-100 rounded-2xl p-4 hover:border-slate-300 transition-all flex items-center gap-3"
              >
                <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${sev.dot}`} />
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-slate-900">{a.titulo}</p>
                  <p className="text-sm text-slate-500 truncate">{a.detalle}</p>
                </div>
                <span className={`text-[10px] font-black uppercase px-2 py-1 rounded-full border shrink-0 ${sev.color}`}>{sev.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function FiltroBtn({ active, onClick, label }) {
  return (
    <button onClick={onClick} className={`px-3 py-1.5 rounded-lg text-xs font-bold border ${active ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-600 border-slate-200"}`}>
      {label}
    </button>
  );
}
