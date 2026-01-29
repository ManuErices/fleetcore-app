import React, { useState, useEffect } from "react";
import { db } from "../lib/firebase";
import { doc, setDoc, getDoc, collection, getDocs, query, orderBy, limit } from "firebase/firestore";

/**
 * Componente para gestionar los precios de referencia de combustible
 * Se actualizan manualmente desde la CNE cada semana/mes
 */
export default function FuelPriceManager() {
  const [currentPrice, setCurrentPrice] = useState({
    diesel: 950,
    gasoline93: 1100,
    gasoline95: 1150,
    gasoline97: 1200,
    lastUpdated: null,
    source: 'Manual'
  });
  
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    loadCurrentPrice();
    loadHistory();
  }, []);

  const loadCurrentPrice = async () => {
    try {
      const docRef = doc(db, "settings", "currentFuelPrice");
      const docSnap = await getDoc(docRef);
      
      if (docSnap.exists()) {
        setCurrentPrice(docSnap.data());
      }
    } catch (error) {
      console.error("Error cargando precio:", error);
    }
  };

  const loadHistory = async () => {
    try {
      const q = query(
        collection(db, "fuelPriceHistory"),
        orderBy("updatedAt", "desc"),
        limit(10)
      );
      const snap = await getDocs(q);
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setHistory(data);
    } catch (error) {
      console.error("Error cargando historial:", error);
    }
  };

  const handleSave = async () => {
    if (!currentPrice.diesel || currentPrice.diesel <= 0) {
      alert("Por favor ingresa un precio válido para el diésel");
      return;
    }

    setLoading(true);
    setSaved(false);

    try {
      const priceData = {
        ...currentPrice,
        lastUpdated: new Date().toISOString(),
        updatedBy: "user"
      };

      // Guardar como precio actual
      await setDoc(doc(db, "settings", "currentFuelPrice"), priceData);

      // Guardar en historial
      await setDoc(doc(collection(db, "fuelPriceHistory")), {
        ...priceData,
        updatedAt: new Date()
      });

      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      
      await loadHistory();
    } catch (error) {
      alert("Error al guardar: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (isoDate) => {
    if (!isoDate) return '-';
    return new Date(isoDate).toLocaleDateString('es-CL', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="space-y-6">
      {/* Card principal */}
      <div className="glass-card rounded-2xl p-6 animate-fadeInUp">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-600 to-orange-600 flex items-center justify-center">
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900">Precio de Referencia de Combustibles</h2>
            <p className="text-sm text-slate-600">
              {currentPrice.lastUpdated ? `Última actualización: ${formatDate(currentPrice.lastUpdated)}` : 'Sin actualización'}
            </p>
          </div>
        </div>

        {/* Info de CNE */}
        <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-xl">
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div className="text-sm text-blue-800">
              <strong>Fuente oficial:</strong> Comisión Nacional de Energía (CNE)<br />
              <a 
                href="https://www.cne.cl/precio-combustibles/" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-blue-600 hover:text-blue-700 underline font-medium"
              >
                🔗 Ver precios actualizados en CNE
              </a>
            </div>
          </div>
        </div>

        {/* Inputs de precios */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">
              Diésel (CLP/Litro) <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              value={currentPrice.diesel}
              onChange={(e) => setCurrentPrice({ ...currentPrice, diesel: Number(e.target.value) })}
              className="input-modern text-lg font-bold text-center"
              placeholder="950"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">
              Gasolina 93 (CLP/Litro)
            </label>
            <input
              type="number"
              value={currentPrice.gasoline93}
              onChange={(e) => setCurrentPrice({ ...currentPrice, gasoline93: Number(e.target.value) })}
              className="input-modern text-lg font-bold text-center"
              placeholder="1100"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">
              Gasolina 95 (CLP/Litro)
            </label>
            <input
              type="number"
              value={currentPrice.gasoline95}
              onChange={(e) => setCurrentPrice({ ...currentPrice, gasoline95: Number(e.target.value) })}
              className="input-modern text-lg font-bold text-center"
              placeholder="1150"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">
              Gasolina 97 (CLP/Litro)
            </label>
            <input
              type="number"
              value={currentPrice.gasoline97}
              onChange={(e) => setCurrentPrice({ ...currentPrice, gasoline97: Number(e.target.value) })}
              className="input-modern text-lg font-bold text-center"
              placeholder="1200"
            />
          </div>
        </div>

        {/* Botón guardar */}
        <button
          onClick={handleSave}
          disabled={loading}
          className={`w-full btn-primary ${saved ? 'bg-gradient-to-r from-emerald-600 to-teal-600' : ''}`}
        >
          <span className="relative z-10 flex items-center justify-center gap-2">
            {saved ? (
              <>
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Precio Actualizado
              </>
            ) : loading ? (
              <>
                <div className="spinner w-4 h-4 border-white" />
                Guardando...
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                </svg>
                Guardar Precios de Referencia
              </>
            )}
          </span>
        </button>
      </div>

      {/* Historial de cambios */}
      <div className="glass-card rounded-2xl overflow-hidden animate-fadeInUp stagger-2">
        <div className="p-6 border-b border-slate-200 bg-gradient-to-r from-slate-50 to-white">
          <h3 className="text-lg font-bold text-slate-900">Historial de Actualizaciones</h3>
          <p className="text-sm text-slate-600 mt-1">Últimas 10 actualizaciones de precios</p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50">
              <tr>
                <th className="text-left px-6 py-4 text-xs font-bold text-slate-600 uppercase">Fecha</th>
                <th className="text-center px-4 py-4 text-xs font-bold text-slate-600 uppercase">Diésel</th>
                <th className="text-center px-4 py-4 text-xs font-bold text-slate-600 uppercase">Gasolina 93</th>
                <th className="text-center px-4 py-4 text-xs font-bold text-slate-600 uppercase">Gasolina 95</th>
                <th className="text-center px-4 py-4 text-xs font-bold text-slate-600 uppercase">Gasolina 97</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {history.map((record, idx) => (
                <tr key={record.id || idx} className="hover:bg-slate-50">
                  <td className="px-6 py-4">
                    <div className="text-sm text-slate-900">{formatDate(record.lastUpdated)}</div>
                  </td>
                  <td className="px-4 py-4 text-center">
                    <span className="text-sm font-semibold text-slate-900">${record.diesel}</span>
                  </td>
                  <td className="px-4 py-4 text-center">
                    <span className="text-sm font-semibold text-slate-900">${record.gasoline93}</span>
                  </td>
                  <td className="px-4 py-4 text-center">
                    <span className="text-sm font-semibold text-slate-900">${record.gasoline95}</span>
                  </td>
                  <td className="px-4 py-4 text-center">
                    <span className="text-sm font-semibold text-slate-900">${record.gasoline97}</span>
                  </td>
                </tr>
              ))}
              {history.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-slate-500">
                    No hay historial de precios
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/**
 * Hook para obtener el precio actual de combustible
 * Usar en otros componentes
 */
export function useCurrentFuelPrice(fuelType = 'diesel') {
  const [price, setPrice] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchPrice = async () => {
      try {
        const docRef = doc(db, "settings", "currentFuelPrice");
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists()) {
          const data = docSnap.data();
          setPrice(data[fuelType] || 950);
        } else {
          setPrice(950); // Fallback
        }
      } catch (error) {
        console.error("Error obteniendo precio:", error);
        setPrice(950);
      } finally {
        setLoading(false);
      }
    };

    fetchPrice();
  }, [fuelType]);

  return { price, loading };
}
