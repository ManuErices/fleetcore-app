import React from "react";
import { useFuelPrices, refreshFuelPrices } from "../lib/fuelPriceService";

/**
 * Widget de Precios de Combustible
 * Integrado con API de Bencina en Línea (api.boostr.cl)
 */
export default function FuelPriceWidget({ compact = false }) {
  const { prices, loading, error, refresh } = useFuelPrices(true); // Auto-refresh habilitado
  const [refreshing, setRefreshing] = React.useState(false);

  const handleManualRefresh = async () => {
    setRefreshing(true);
    try {
      await refreshFuelPrices();
      await refresh();
    } catch (err) {
      console.error('Error al actualizar precios:', err);
    } finally {
      setTimeout(() => setRefreshing(false), 1000);
    }
  };

  const getSourceLabel = (source) => {
    switch(source) {
      case 'bencina-en-linea': return '🇨🇱 Bencina en Línea';
      case 'default': return '⚠️ Por defecto';
      default: return source;
    }
  };

  const getSourceColor = (source) => {
    switch(source) {
      case 'bencina-en-linea': return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'default': return 'bg-amber-50 text-amber-700 border-amber-200';
      default: return 'bg-slate-50 text-slate-700 border-slate-200';
    }
  };

  const formatDate = (isoDate) => {
    if (!isoDate) return 'Sin actualizar';
    const date = new Date(isoDate);
    const now = new Date();
    const diffHours = Math.floor((now - date) / (1000 * 60 * 60));
    
    if (diffHours < 1) return 'Hace menos de 1 hora';
    if (diffHours < 24) return `Hace ${diffHours} horas`;
    const diffDays = Math.floor(diffHours / 24);
    return `Hace ${diffDays} día${diffDays > 1 ? 's' : ''}`;
  };

  if (loading) {
    return (
      <div className="glass-card rounded-2xl p-6">
        <div className="flex items-center justify-center gap-3">
          <div className="spinner w-5 h-5 border-orange-600" />
          <span className="text-slate-600">Cargando precios de combustible...</span>
        </div>
      </div>
    );
  }

  if (compact) {
    return (
      <div className="glass-card rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <div>
              <div className="text-sm font-bold text-slate-900">Precios</div>
              <div className="text-xs text-slate-500">{getSourceLabel(prices?.source)}</div>
            </div>
          </div>
          
          <button
            onClick={handleManualRefresh}
            disabled={refreshing}
            className="p-2 rounded-lg hover:bg-slate-100 transition-colors"
            title="Actualizar precios"
          >
            <svg 
              className={`w-4 h-4 text-slate-600 ${refreshing ? 'animate-spin' : ''}`} 
              fill="none" 
              viewBox="0 0 24 24" 
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-600">Diésel</span>
            <span className="text-sm font-bold text-slate-900">${prices?.diesel || 950}/L</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-600">Gasolina 95</span>
            <span className="text-sm font-bold text-slate-900">${prices?.gasoline95 || 1150}/L</span>
          </div>
        </div>

        <div className="mt-3 pt-3 border-t border-slate-200">
          <div className="text-xs text-slate-500 text-center">
            {formatDate(prices?.lastUpdated)}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="glass-card rounded-2xl overflow-hidden animate-fadeInUp">
      <div className="p-6 bg-gradient-to-r from-amber-50 to-orange-50 border-b border-amber-100">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center shadow-lg">
              <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M12.395 2.553a1 1 0 00-1.45-.385c-.345.23-.614.558-.822.88-.214.33-.403.713-.57 1.116-.334.804-.614 1.768-.84 2.734a31.365 31.365 0 00-.613 3.58 2.64 2.64 0 01-.945-1.067c-.328-.68-.398-1.534-.398-2.654A1 1 0 005.05 6.05 6.981 6.981 0 003 11a7 7 0 1011.95-4.95c-.592-.591-.98-.985-1.348-1.467-.363-.476-.724-1.063-1.207-2.03zM12.12 15.12A3 3 0 017 13s.879.5 2.5.5c0-1 .5-4 1.25-4.5.5 1 .786 1.293 1.371 1.879A2.99 2.99 0 0113 13a2.99 2.99 0 01-.879 2.121z" clipRule="evenodd" />
              </svg>
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">Precios de Combustible</h3>
              <p className="text-sm text-slate-600">{formatDate(prices?.lastUpdated)}</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className={`px-3 py-1 rounded-full text-xs font-semibold border ${getSourceColor(prices?.source)}`}>
              {getSourceLabel(prices?.source)}
            </div>
            
            <button
              onClick={handleManualRefresh}
              disabled={refreshing}
              className="p-2 rounded-lg hover:bg-white/50 transition-colors"
              title="Actualizar precios"
            >
              <svg 
                className={`w-5 h-5 text-slate-700 ${refreshing ? 'animate-spin' : ''}`} 
                fill="none" 
                viewBox="0 0 24 24" 
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      <div className="p-6">
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <PriceCard
            label="Diésel"
            price={prices?.diesel || 950}
            icon="🚛"
            color="from-slate-500 to-slate-700"
          />
          <PriceCard
            label="Gasolina 93"
            price={prices?.gasoline93 || 1100}
            icon="🚗"
            color="from-blue-500 to-blue-700"
          />
          <PriceCard
            label="Gasolina 95"
            price={prices?.gasoline95 || 1150}
            icon="🚙"
            color="from-emerald-500 to-emerald-700"
          />
          <PriceCard
            label="Gasolina 97"
            price={prices?.gasoline97 || 1200}
            icon="🏎️"
            color="from-violet-500 to-violet-700"
          />
        </div>

        {prices?.source === 'bencina-en-linea' && prices?.stationCount && (
          <div className="mt-4 p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
            <div className="flex items-start gap-3">
              <svg className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div className="text-sm text-emerald-800">
                <strong>Precios actualizados desde Bencina en Línea.</strong> Promedio de {prices.stationCount} estaciones de servicio en Chile.
              </div>
            </div>
          </div>
        )}

        {prices?.source === 'default' && (
          <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-xl">
            <div className="flex items-start gap-3">
              <svg className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <div className="text-sm text-amber-800">
                <strong>Usando precios por defecto.</strong> No se pudieron obtener precios actualizados. Haz clic en actualizar para reintentar.
              </div>
            </div>
          </div>
        )}

        {prices?.isOld && (
          <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-xl">
            <div className="flex items-start gap-3">
              <svg className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div className="text-sm text-blue-800">
                <strong>Precios en caché.</strong> Estos precios tienen más de 1 hora de antigüedad. Se actualizarán automáticamente pronto.
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-xl">
            <div className="flex items-start gap-3">
              <svg className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div className="text-sm text-red-800">
                <strong>Error:</strong> {error}
              </div>
            </div>
          </div>
        )}

        <div className="mt-4 pt-4 border-t border-slate-200">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Fuente: Bencina en Línea (bencinaenlinea.cl)</span>
            <a 
              href="https://www.bencinaenlinea.cl" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-amber-600 hover:text-amber-700 underline font-medium"
            >
              🔗 Visitar sitio oficial
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

function PriceCard({ label, price, icon, color }) {
  return (
    <div className="relative group">
      <div className="absolute inset-0 bg-gradient-to-br opacity-0 group-hover:opacity-10 rounded-xl transition-opacity" />
      
      <div className="relative p-4 rounded-xl border-2 border-slate-200 hover:border-amber-300 transition-all bg-white">
        <div className="text-2xl mb-2">{icon}</div>
        <div className="text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">
          {label}
        </div>
        <div className="text-2xl font-black text-slate-900">
          ${price.toLocaleString('es-CL')}
          <span className="text-sm font-normal text-slate-500">/L</span>
        </div>
        <div className={`mt-2 h-1 rounded-full bg-gradient-to-r ${color}`} />
      </div>
    </div>
  );
}

/**
 * Versión inline para usar en otros componentes
 */
export function InlineFuelPrice({ fuelType = 'diesel', showLabel = true }) {
  const { prices, loading } = useFuelPrices();

  if (loading) {
    return <span className="text-slate-400">...</span>;
  }

  const price = prices?.[fuelType] || 950;
  const labels = {
    diesel: 'Diésel',
    gasoline93: 'Gasolina 93',
    gasoline95: 'Gasolina 95',
    gasoline97: 'Gasolina 97'
  };

  return (
    <span className="text-slate-900 font-semibold">
      {showLabel && `${labels[fuelType]}: `}
      ${price}/L
    </span>
  );
}
