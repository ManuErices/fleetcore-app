import { db } from "./firebase";
import { doc, getDoc } from "firebase/firestore";

/**
 * Helpers para calcular costos de combustible usando precios de referencia
 */

/**
 * Obtiene el precio actual de combustible desde Firebase
 * @param {string} fuelType - 'diesel', 'gasoline93', 'gasoline95', 'gasoline97'
 * @returns {Promise<number>} Precio en CLP por litro
 */
export async function getCurrentFuelPrice(fuelType = 'diesel') {
  try {
    const docRef = doc(db, "settings", "currentFuelPrice");
    const docSnap = await getDoc(docRef);
    
    if (docSnap.exists()) {
      const data = docSnap.data();
      return data[fuelType] || 950;
    }
    
    // Fallback a precio por defecto
    const defaultPrices = {
      diesel: 950,
      gasoline93: 1100,
      gasoline95: 1150,
      gasoline97: 1200
    };
    
    return defaultPrices[fuelType] || 950;
  } catch (error) {
    console.error("Error obteniendo precio de combustible:", error);
    return 950; // Fallback
  }
}

/**
 * Calcula el costo de combustible basado en litros y precio de referencia
 * @param {number} liters - Litros consumidos
 * @param {string} fuelType - Tipo de combustible
 * @returns {Promise<number>} Costo total en CLP
 */
export async function calculateFuelCost(liters, fuelType = 'diesel') {
  const pricePerLiter = await getCurrentFuelPrice(fuelType);
  return Math.round(liters * pricePerLiter);
}

/**
 * Calcula litros desde un monto en CLP
 * @param {number} totalCost - Costo total en CLP
 * @param {string} fuelType - Tipo de combustible
 * @returns {Promise<number>} Litros calculados
 */
export async function calculateLitersFromCost(totalCost, fuelType = 'diesel') {
  const pricePerLiter = await getCurrentFuelPrice(fuelType);
  return Math.round(totalCost / pricePerLiter * 100) / 100;
}

/**
 * Obtiene todos los precios actuales
 * @returns {Promise<Object>} Objeto con todos los precios
 */
export async function getAllFuelPrices() {
  try {
    const docRef = doc(db, "settings", "currentFuelPrice");
    const docSnap = await getDoc(docRef);
    
    if (docSnap.exists()) {
      return docSnap.data();
    }
    
    return {
      diesel: 950,
      gasoline93: 1100,
      gasoline95: 1150,
      gasoline97: 1200,
      lastUpdated: null,
      source: 'Default'
    };
  } catch (error) {
    console.error("Error obteniendo precios:", error);
    return {
      diesel: 950,
      gasoline93: 1100,
      gasoline95: 1150,
      gasoline97: 1200,
      lastUpdated: null,
      source: 'Error'
    };
  }
}

/**
 * Formatea el precio para mostrar
 * @param {number} price - Precio en CLP
 * @returns {string} Precio formateado
 */
export function formatFuelPrice(price) {
  return `$${price.toLocaleString('es-CL')}/L`;
}

/**
 * Calcula el costo promedio mensual de combustible
 * @param {Array} fuelLogs - Array de registros de combustible
 * @param {string} fuelType - Tipo de combustible
 * @returns {Promise<Object>} Objeto con totales
 */
export async function calculateMonthlyFuelCost(fuelLogs, fuelType = 'diesel') {
  const pricePerLiter = await getCurrentFuelPrice(fuelType);
  
  let totalLiters = 0;
  let totalCost = 0;
  let totalReloads = fuelLogs.length;
  
  fuelLogs.forEach(log => {
    const liters = Number(log.liters) || 0;
    totalLiters += liters;
    totalCost += liters * pricePerLiter;
  });
  
  return {
    totalLiters,
    totalCost,
    totalReloads,
    averageLitersPerReload: totalReloads > 0 ? totalLiters / totalReloads : 0,
    averageCostPerReload: totalReloads > 0 ? totalCost / totalReloads : 0,
    pricePerLiter
  };
}

/**
 * Ejemplo de uso en componente:
 * 
 * import { getCurrentFuelPrice, calculateFuelCost } from '../lib/fuelCalculations';
 * 
 * // En tu componente
 * const price = await getCurrentFuelPrice('diesel');
 * console.log('Precio diésel:', price); // 950
 * 
 * const cost = await calculateFuelCost(100, 'diesel');
 * console.log('Costo de 100 litros:', cost); // 95000
 */
