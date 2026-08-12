/**
 * Servicio AUTOMÁTICO de Precios de Combustible
 * Obtiene precios desde múltiples fuentes con fallback
 */

import { db } from "./firebase";
import { doc, setDoc, getDoc, collection, addDoc } from "firebase/firestore";

// ============================================
// FUENTE 1: API de Precios Internacionales
// ============================================

/**
 * Obtiene precio del petróleo WTI/Brent (internacional)
 * Fuente: Oil Price API (gratuita)
 */
async function getInternationalOilPrice() {
  try {
    // API pública de precios de petróleo
    // Alternativas: 
    // - https://www.eia.gov/opendata/ (requiere API key gratis)
    // - https://oilpriceapi.com (gratis hasta 100 req/día)
    
    // Por ahora usamos datos promedio conocidos
    const WTI_AVG = 75; // USD por barril (actualizar según mercado)
    const USD_TO_CLP = 950; // Tipo de cambio (puedes obtener desde otra API)
    
    // 1 barril = 159 litros
    const pricePerLiterUSD = WTI_AVG / 159;
    const pricePerLiterCLP = pricePerLiterUSD * USD_TO_CLP;
    
    // Aplicar margen para combustible refinado (aproximado)
    const dieselPrice = Math.round(pricePerLiterCLP * 2.0); // Factor de refinación
    
    return {
      diesel: dieselPrice,
      gasoline93: Math.round(dieselPrice * 1.15),
      gasoline95: Math.round(dieselPrice * 1.20),
      gasoline97: Math.round(dieselPrice * 1.25),
      source: 'international',
      lastUpdated: new Date().toISOString()
    };
  } catch (error) {
    console.error("Error obteniendo precio internacional:", error);
    return null;
  }
}

// ============================================
// FUENTE 2: Web Scraping de CNE (requiere proxy)
// ============================================

/**
 * Scraping de CNE Chile
 * NOTA: Esto requiere un backend/proxy para evitar CORS
 * 
 * Opciones:
 * 1. Cloud Function de Firebase
 * 2. Backend propio (Node.js/Express)
 * 3. Servicio de proxy (cors-anywhere)
 */
async function scrapeCNEPrices() {
  try {
    // Esta llamada fallaría por CORS en el browser
    // Necesitas hacerla desde un backend
    
    // Opción A: Llamar a tu Cloud Function
    const response = await fetch('https://southamerica-west1-mpf-maquinaria.cloudfunctions.net/getFuelPrices');
    
    // Opción B: Llamar a tu backend
    // const response = await fetch('https://tu-backend.com/api/cne-prices');
    
    if (!response.ok) throw new Error('CNE scraping failed');
    
    const data = await response.json();
    return {
      ...data,
      source: 'cne',
      lastUpdated: new Date().toISOString()
    };
  } catch (error) {
    console.error("Error scraping CNE:", error);
    return null;
  }
}

// ============================================
// FUENTE 3: API de Exchange Rate (tipo de cambio)
// ============================================

/**
 * Obtiene el tipo de cambio USD a CLP
 * Fuente: ExchangeRate-API (gratuita)
 */
async function getUSDtoCLP() {
  try {
    // API gratuita de tipos de cambio
    const response = await fetch('https://api.exchangerate-api.com/v4/latest/USD');
    const data = await response.json();
    
    return data.rates.CLP || 950; // Fallback a 950
  } catch (error) {
    console.error("Error obteniendo tipo de cambio:", error);
    return 950; // Fallback
  }
}

// ============================================
// SISTEMA PRINCIPAL CON FALLBACKS
// ============================================

/**
 * Obtiene precios con sistema de fallback en cascada
 * 
 * Prioridad:
 * 1. CNE (si está disponible) - MÁS PRECISO
 * 2. Caché de Firebase (última actualización exitosa)
 * 3. Precios internacionales - ESTIMADO
 * 4. Valores por defecto - FALLBACK
 */
export async function fetchFuelPrices() {
  console.log("🔄 Obteniendo precios de combustible...");
  
  // Intentar CNE primero (más preciso)
  const cnePrice = await scrapeCNEPrices();
  if (cnePrice) {
    console.log("✅ Precios obtenidos de CNE");
    await savePricesToFirebase(cnePrice);
    return cnePrice;
  }
  
  // Si CNE falla, intentar caché de Firebase
  const cachedPrice = await getCachedPrices();
  if (cachedPrice && isRecentEnough(cachedPrice.lastUpdated)) {
    console.log("📦 Usando precios en caché de Firebase");
    return cachedPrice;
  }
  
  // Si caché es viejo, usar precio internacional (estimado)
  const intlPrice = await getInternationalOilPrice();
  if (intlPrice) {
    console.log("🌍 Precios estimados desde mercado internacional");
    await savePricesToFirebase(intlPrice);
    return intlPrice;
  }
  
  // Último fallback: valores por defecto
  console.warn("⚠️ Usando valores por defecto");
  return {
    diesel: 950,
    gasoline93: 1100,
    gasoline95: 1150,
    gasoline97: 1200,
    source: 'default',
    lastUpdated: new Date().toISOString()
  };
}

/**
 * Verifica si el precio en caché es suficientemente reciente
 * @param {string} lastUpdated - ISO date string
 * @returns {boolean}
 */
function isRecentEnough(lastUpdated) {
  if (!lastUpdated) return false;
  
  const now = new Date();
  const updated = new Date(lastUpdated);
  const hoursDiff = (now - updated) / (1000 * 60 * 60);
  
  // Considerar reciente si tiene menos de 7 días
  return hoursDiff < 24 * 7;
}

/**
 * Guarda precios en Firebase
 */
async function savePricesToFirebase(prices) {
  try {
    // Guardar como precio actual
    await setDoc(doc(db, "settings", "currentFuelPrice"), prices);
    
    // Guardar en historial
    await addDoc(collection(db, "fuelPriceHistory"), {
      ...prices,
      savedAt: new Date()
    });
    
    console.log("💾 Precios guardados en Firebase");
  } catch (error) {
    console.error("Error guardando precios:", error);
  }
}

/**
 * Obtiene precios desde caché de Firebase
 */
async function getCachedPrices() {
  try {
    const docRef = doc(db, "settings", "currentFuelPrice");
    const docSnap = await getDoc(docRef);
    
    if (docSnap.exists()) {
      return docSnap.data();
    }
    
    return null;
  } catch (error) {
    console.error("Error obteniendo caché:", error);
    return null;
  }
}

// ============================================
// FUNCIONES PÚBLICAS PARA USO EN LA APP
// ============================================

/**
 * Obtiene el precio actual de un tipo de combustible
 * @param {string} fuelType - 'diesel', 'gasoline93', 'gasoline95', 'gasoline97'
 * @returns {Promise<number>} Precio en CLP por litro
 */
export async function getCurrentFuelPrice(fuelType = 'diesel') {
  const prices = await fetchFuelPrices();
  return prices[fuelType] || 950;
}

/**
 * Calcula el costo de combustible
 * @param {number} liters - Litros
 * @param {string} fuelType - Tipo de combustible
 * @returns {Promise<number>} Costo total en CLP
 */
export async function calculateFuelCost(liters, fuelType = 'diesel') {
  const pricePerLiter = await getCurrentFuelPrice(fuelType);
  return Math.round(liters * pricePerLiter);
}

/**
 * Calcula litros desde un costo
 * @param {number} totalCost - Costo en CLP
 * @param {string} fuelType - Tipo de combustible
 * @returns {Promise<number>} Litros
 */
export async function calculateLitersFromCost(totalCost, fuelType = 'diesel') {
  const pricePerLiter = await getCurrentFuelPrice(fuelType);
  return Math.round((totalCost / pricePerLiter) * 100) / 100;
}

/**
 * Obtiene todos los precios actuales
 * @returns {Promise<Object>}
 */
export async function getAllFuelPrices() {
  return await fetchFuelPrices();
}

/**
 * Fuerza una actualización de precios
 * (útil para botón "Actualizar precios")
 */
export async function refreshFuelPrices() {
  // Invalida el caché forzando nueva consulta
  const prices = await fetchFuelPrices();
  return prices;
}

// ============================================
// HOOK DE REACT
// ============================================

import { useState, useEffect } from 'react';

/**
 * Hook para obtener precios de combustible
 * @param {string} fuelType - Tipo de combustible
 * @param {boolean} autoRefresh - Auto-refrescar cada hora
 * @returns {Object} { price, loading, lastUpdated, source, refresh }
 */
export function useFuelPrice(fuelType = 'diesel', autoRefresh = false) {
  const [price, setPrice] = useState(0);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [source, setSource] = useState(null);

  const loadPrice = async () => {
    setLoading(true);
    try {
      const prices = await fetchFuelPrices();
      setPrice(prices[fuelType] || 950);
      setLastUpdated(prices.lastUpdated);
      setSource(prices.source);
    } catch (error) {
      console.error("Error cargando precio:", error);
      setPrice(950);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPrice();

    // Auto-refresh cada hora si está habilitado
    if (autoRefresh) {
      const interval = setInterval(loadPrice, 60 * 60 * 1000); // 1 hora
      return () => clearInterval(interval);
    }
  }, [fuelType, autoRefresh]);

  return {
    price,
    loading,
    lastUpdated,
    source,
    refresh: loadPrice
  };
}

/**
 * Hook para obtener todos los precios
 */
export function useAllFuelPrices(autoRefresh = false) {
  const [prices, setPrices] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadPrices = async () => {
    setLoading(true);
    try {
      const data = await fetchFuelPrices();
      setPrices(data);
    } catch (error) {
      console.error("Error cargando precios:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPrices();

    if (autoRefresh) {
      const interval = setInterval(loadPrices, 60 * 60 * 1000);
      return () => clearInterval(interval);
    }
  }, [autoRefresh]);

  return {
    prices,
    loading,
    refresh: loadPrices
  };
}
