import { useState, useEffect, useCallback } from "react";
import { collection, query, where, getDocs } from "firebase/firestore";
import { db } from "../../../lib/firebase";

/**
 * Stock real de un equipo surtidor (camión / mochila / estanque).
 *
 *   stock = Σ litros de las ENTRADAS cuyo equipo receptor es el surtidor
 *         − Σ litros de las ENTREGAS despachadas desde ese surtidor
 *
 * Se consulta con dos queries de campo simple (no requieren índice compuesto):
 *   - `datosEntrada.machineId` → entradas al surtidor
 *   - `equipoSurtidorId`       → reportes cuyo control apunta al surtidor
 *
 * Nota: `datosControl` se guarda además "aplanado" en la raíz del documento,
 * por eso el equipo del control se busca en `equipoSurtidorId` (raíz) y se
 * acepta también la versión anidada por compatibilidad.
 */
export function useSurtidorStock(empresaId, surtidorId) {
  const [stock, setStock] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const cargar = useCallback(async () => {
    if (!empresaId || !surtidorId) { setStock(null); setError(null); return; }
    setLoading(true);
    setError(null);
    try {
      const reportesRef = collection(db, 'empresas', empresaId, 'reportes_combustible');
      const [entradasSnap, controlSnap] = await Promise.all([
        getDocs(query(reportesRef, where('datosEntrada.machineId', '==', surtidorId))),
        getDocs(query(reportesRef, where('equipoSurtidorId', '==', surtidorId))),
      ]);

      const entradas = entradasSnap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(r => !r.deleted && r.tipo === 'entrada');
      const totalIngresado = entradas.reduce(
        (sum, r) => sum + (parseFloat(r.datosEntrada?.cantidad) || 0), 0);

      const entregas = controlSnap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(r => !r.deleted && r.tipo === 'entrega');
      const totalEntregado = entregas.reduce(
        (sum, r) => sum + (parseFloat(r.datosEntrega?.cantidadLitros ?? r.cantidadLitros) || 0), 0);

      setStock(totalIngresado - totalEntregado);
    } catch (err) {
      console.error('Error calculando stock del surtidor:', err);
      setError(err);
      setStock(null);
    } finally {
      setLoading(false);
    }
  }, [empresaId, surtidorId]);

  useEffect(() => { cargar(); }, [cargar]);

  return { stock, loading, error, recargar: cargar };
}
