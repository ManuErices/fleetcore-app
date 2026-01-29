// ============================================
// SERVICIO DE PRECIOS DE COMBUSTIBLE - VERSIÓN CORREGIDA
// ============================================
// Elimina dependencia de api.boostr.cl (404)
// Usa solo fuentes funcionales con fallbacks robustos

import { collection, doc, getDoc, setDoc, getDocs, query, where, orderBy, limit } from "firebase/firestore";
import { db } from "./firebase";

// ============================================
// FUENTE 1: PRECIOS INTERNACIONALES (OIL PRICE API)
// ============================================

/**
 * Obtiene precio del petróleo WTI y estima precio diesel en Chile
 * Esta es ahora la fuente PRINCIPAL ya que api.boostr.cl no funciona
 */
async function getInternationalOilPrice() {
  try {
    // API pública de precios de petróleo
    const response = await fetch('https://api.oilpriceapi.com/v1/prices/latest');
    
    if (!response.ok) {
      throw new Error('Oil Price API failed');
    }
    
    const data = await response.json();
    const wtiPrice = data.data?.price || 75; // USD por barril
    
    // Obtener tipo de cambio USD -> CLP
    const usdToCLP = await getUSDtoCLP();
    
    // Cálculo estimado: 
    // - 1 barril = 159 litros
    // - Agregar costos de refinación, transporte, impuestos (~60%)
    const dieselPerLiter = (wtiPrice / 159) * usdToCLP * 1.6;
    
    return {
      diesel: Math.round(dieselPerLiter),
      gasolina93: Math.round(dieselPerLiter * 1.1),
      gasolina95: Math.round(dieselPerLiter * 1.15),
      gasolina97: Math.round(dieselPerLiter * 1.2),
      source: 'international-estimate',
      lastUpdated: new Date().toISOString()
    };
  } catch (error) {
    console.error("Error obteniendo precio internacional:", error);
    return null;
  }
}

// ============================================
// FUENTE 2: TIPO DE CAMBIO
// ============================================

/**
 * Obtiene el tipo de cambio USD a CLP
 */
async function getUSDtoCLP() {
  try {
    const response = await fetch('https://api.exchangerate-api.com/v4/latest/USD');
    const data = await response.json();
    return data.rates?.CLP || 950; // Fallback a 950
  } catch (error) {
    console.error("Error obteniendo tipo de cambio:", error);
    return 950;
  }
}

// ============================================
// CACHÉ EN FIREBASE
// ============================================

/**
 * Guarda precios en Firebase para caché
 */
async function savePricesToFirebase(prices) {
  try {
    const docRef = doc(db, 'fuelPrices', 'latest');
    await setDoc(docRef, {
      ...prices,
      cachedAt: new Date().toISOString()
    });
    console.log("💾 Precios guardados en Firebase");
  } catch (error) {
    console.error("Error guardando precios en Firebase:", error);
  }
}

/**
 * Obtiene precios cacheados de Firebase
 */
async function getCachedPrices() {
  try {
    const docRef = doc(db, 'fuelPrices', 'latest');
    const docSnap = await getDoc(docRef);
    
    if (docSnap.exists()) {
      console.log("📦 Precios encontrados en caché");
      return docSnap.data();
    }
    return null;
  } catch (error) {
    console.error("Error obteniendo caché:", error);
    return null;
  }
}

/**
 * Verifica si el caché es reciente (menos de 24 horas)
 */
function isRecentEnough(lastUpdated) {
  if (!lastUpdated) return false;
  const ageInHours = (Date.now() - new Date(lastUpdated).getTime()) / (1000 * 60 * 60);
  return ageInHours < 24;
}

// ============================================
// SISTEMA PRINCIPAL CON FALLBACKS
// ============================================

/**
 * Obtiene precios con sistema de fallback en cascada
 * 
 * Prioridad:
 * 1. Caché de Firebase (si es reciente, < 24h)
 * 2. Precios internacionales (estimado desde WTI)
 * 3. Valores por defecto
 */
export async function fetchFuelPrices() {
  console.log("🔄 Obteniendo precios de combustible...");
  
  // Primero revisar caché (más rápido)
  const cachedPrice = await getCachedPrices();
  if (cachedPrice && isRecentEnough(cachedPrice.lastUpdated || cachedPrice.cachedAt)) {
    console.log("✅ Usando precios en caché (recientes)");
    return cachedPrice;
  }
  
  // Si caché es viejo o no existe, obtener nuevos precios
  console.log("🌍 Obteniendo precios internacionales...");
  const intlPrice = await getInternationalOilPrice();
  if (intlPrice) {
    console.log("✅ Precios obtenidos desde mercado internacional");
    await savePricesToFirebase(intlPrice);
    return intlPrice;
  }
  
  // Si todo falla, usar caché viejo si existe
  if (cachedPrice) {
    console.warn("⚠️ Usando caché antiguo (API falló)");
    return cachedPrice;
  }
  
  // Último fallback: valores por defecto
  console.warn("⚠️ Usando valores por defecto");
  return {
    diesel: 950,
    gasolina93: 1050,
    gasolina95: 1100,
    gasolina97: 1150,
    source: 'default',
    lastUpdated: new Date().toISOString()
  };
}

// ============================================
// HOOK PARA COMPONENTES REACT
// ============================================

import { useState, useEffect } from 'react';

/**
 * Hook para obtener precios de combustible en componentes
 * 
 * @param {boolean} autoRefresh - Si debe actualizar automáticamente cada hora
 * @returns {Object} { prices, loading, error, refresh }
 */
export function useFuelPrices(autoRefresh = false) {
  const [prices, setPrices] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadPrices = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchFuelPrices();
      setPrices(data);
    } catch (err) {
      console.error("Error en useFuelPrices:", err);
      setError(err.message);
      // Usar valores por defecto en caso de error
      setPrices({
        diesel: 950,
        gasolina93: 1050,
        gasolina95: 1100,
        gasolina97: 1150,
        source: 'error-fallback',
        lastUpdated: new Date().toISOString()
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPrices();

    // Auto-refresh cada hora si está habilitado
    if (autoRefresh) {
      const interval = setInterval(loadPrices, 60 * 60 * 1000); // 1 hora
      return () => clearInterval(interval);
    }
  }, [autoRefresh]);

  return {
    prices,
    loading,
    error,
    refresh: loadPrices
  };
}

/**
 * Alias para compatibilidad con código anterior
 */
export const useAllFuelPrices = useFuelPrices;

// ============================================
// FUNCIÓN PARA OBTENER SOLO PRECIO DIESEL
// ============================================

/**
 * Función simplificada para obtener solo precio diesel
 * Útil para cálculos rápidos sin cargar todos los precios
 */
export async function getDieselPrice() {
  const prices = await fetchFuelPrices();
  return prices.diesel;
}

/**
 * Obtiene precio actual de un tipo específico de combustible
 * @param {string} fuelType - 'diesel', 'gasolina93', 'gasolina95', 'gasolina97'
 */
export async function getCurrentFuelPrice(fuelType = 'diesel') {
  const prices = await fetchFuelPrices();
  return prices[fuelType] || prices.diesel;
}

/**
 * Obtiene todos los precios de combustible
 * Alias de fetchFuelPrices para compatibilidad
 */
export const getAllFuelPrices = fetchFuelPrices;

/**
 * Calcula costo total dado los litros y tipo de combustible
 */
export async function calculateFuelCost(liters, fuelType = 'diesel') {
  const price = await getCurrentFuelPrice(fuelType);
  return Math.round(liters * price);
}

/**
 * Calcula litros dado el costo total y tipo de combustible
 */
export async function calculateLitersFromCost(totalCost, fuelType = 'diesel') {
  const price = await getCurrentFuelPrice(fuelType);
  return Math.round((totalCost / price) * 100) / 100;
}

// ============================================
// FUNCIÓN PARA FORZAR ACTUALIZACIÓN
// ============================================

/**
 * Fuerza obtener precios nuevos (ignora caché)
 */
export async function forceRefreshPrices() {
  console.log("🔄 Forzando actualización de precios...");
  
  const intlPrice = await getInternationalOilPrice();
  if (intlPrice) {
    await savePricesToFirebase(intlPrice);
    return intlPrice;
  }
  
  // Fallback
  const defaultPrices = {
    diesel: 950,
    gasolina93: 1050,
    gasolina95: 1100,
    gasolina97: 1150,
    source: 'default',
    lastUpdated: new Date().toISOString()
  };
  
  await savePricesToFirebase(defaultPrices);
  return defaultPrices;
}

/**
 * Alias para compatibilidad con código anterior
 */
export const refreshFuelPrices = forceRefreshPrices;

// ============================================
// EXPORTACIONES
// ============================================

export default {
  // Principales
  fetchFuelPrices,
  getAllFuelPrices,
  
  // Hooks
  useFuelPrices,
  useAllFuelPrices,
  
  // Funciones específicas
  getDieselPrice,
  getCurrentFuelPrice,
  
  // Cálculos
  calculateFuelCost,
  calculateLitersFromCost,
  
  // Actualización
  forceRefreshPrices,
  refreshFuelPrices
};
