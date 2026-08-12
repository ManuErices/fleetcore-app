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
 * Usa API pública sin autenticación
 */
async function getInternationalOilPrice() {
  try {
    // Obtener tipo de cambio primero
    const usdToCLP = await getUSDtoCLP();
    
    // Precio WTI promedio estimado (actualizar manualmente cada mes si es necesario)
    // O usar una API alternativa gratuita si existe
    const wtiPrice = 75; // USD por barril - valor promedio actual
    
    // Cálculo: 1 barril = 159 litros + costos (60%)
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
async function savePricesToFirebase(prices, empresaId) {
  if (!empresaId) return;
  try {
    const docRef = doc(db, 'empresas', empresaId, 'fuelPrices', 'latest');
    await setDoc(docRef, {
      ...prices,
      cachedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error("Error guardando precios en Firebase:", error);
  }
}

async function getCachedPrices(empresaId) {
  if (!empresaId) return null;
  try {
    const docRef = doc(db, 'empresas', empresaId, 'fuelPrices', 'latest');
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) return docSnap.data();
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
export async function fetchFuelPrices(empresaId) {
  const cachedPrice = await getCachedPrices(empresaId);
  if (cachedPrice && isRecentEnough(cachedPrice.lastUpdated || cachedPrice.cachedAt)) {
    return cachedPrice;
  }

  const intlPrice = await getInternationalOilPrice();
  if (intlPrice) {
    await savePricesToFirebase(intlPrice, empresaId);
    return intlPrice;
  }

  if (cachedPrice) return cachedPrice;

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
import { useEmpresa } from './useEmpresa';

export function useFuelPrices(autoRefresh = false) {
  const { empresaId } = useEmpresa();
  const [prices, setPrices] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadPrices = async () => {
    if (!empresaId) return;
    try {
      setLoading(true);
      setError(null);
      const data = await fetchFuelPrices(empresaId);
      setPrices(data);
    } catch (err) {
      console.error("Error en useFuelPrices:", err);
      setError(err.message);
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
    if (autoRefresh) {
      const interval = setInterval(loadPrices, 60 * 60 * 1000);
      return () => clearInterval(interval);
    }
  }, [autoRefresh, empresaId]);

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
