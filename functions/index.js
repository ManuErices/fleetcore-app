/**
 * Firebase Cloud Function para obtener precios de combustible de CNE
 * 
 * INSTALACIÓN:
 * 
 * 1. Instalar Firebase CLI:
 *    npm install -g firebase-tools
 * 
 * 2. Inicializar Functions:
 *    firebase init functions
 * 
 * 3. Instalar dependencias:
 *    cd functions
 *    npm install axios cheerio
 * 
 * 4. Copiar este código a functions/index.js
 * 
 * 5. Desplegar:
 *    firebase deploy --only functions
 */

const functions = require('firebase-functions');
const axios = require('axios');
const cheerio = require('cheerio');
const admin = require('firebase-admin');

admin.initializeApp();

// ============================================
// FUNCIÓN 1: Scraping de CNE (HTTP Trigger)
// ============================================

/**
 * Endpoint HTTP para obtener precios de CNE
 * URL: https://REGION-PROJECT.cloudfunctions.net/getFuelPrices
 */
exports.getFuelPrices = functions.https.onRequest(async (req, res) => {
  // Habilitar CORS
  res.set('Access-Control-Allow-Origin', '*');
  
  if (req.method === 'OPTIONS') {
    res.set('Access-Control-Allow-Methods', 'GET');
    res.set('Access-Control-Allow-Headers', 'Content-Type');
    res.status(204).send('');
    return;
  }

  try {
    console.log('🔍 Scrapeando precios de CNE...');
    
    // Scraping de Bencina en Línea (más fácil que CNE directo)
    const response = await axios.get('https://www.bencinaenlinea.cl');
    const $ = cheerio.load(response.data);
    
    // NOTA: Estos selectores son de ejemplo
    // Debes inspeccionar la página real y ajustarlos
    const diesel = parseFloat($('.precio-diesel').first().text()) || 950;
    const gasoline93 = parseFloat($('.precio-93').first().text()) || 1100;
    const gasoline95 = parseFloat($('.precio-95').first().text()) || 1150;
    const gasoline97 = parseFloat($('.precio-97').first().text()) || 1200;
    
    const prices = {
      diesel: Math.round(diesel),
      gasoline93: Math.round(gasoline93),
      gasoline95: Math.round(gasoline95),
      gasoline97: Math.round(gasoline97),
      source: 'cne-scraping',
      lastUpdated: new Date().toISOString()
    };
    
    // Guardar en Firestore
    await admin.firestore().collection('settings').doc('currentFuelPrice').set(prices);
    
    console.log('✅ Precios obtenidos y guardados:', prices);
    
    res.json(prices);
  } catch (error) {
    console.error('❌ Error:', error);
    
    // Fallback a valores por defecto
    res.json({
      diesel: 950,
      gasoline93: 1100,
      gasoline95: 1150,
      gasoline97: 1200,
      source: 'fallback',
      lastUpdated: new Date().toISOString(),
      error: error.message
    });
  }
});

// ============================================
// FUNCIÓN 2: Actualización Programada
// ============================================

/**
 * Cloud Function programada que se ejecuta automáticamente
 * Schedule: Cada lunes y viernes a las 9am (horario Chile)
 */
/*
exports.scheduledFuelPriceUpdate = functions.pubsub
  .schedule('0 9 * * 1,5') // Cron: lunes y viernes a las 9am
  .timeZone('America/Santiago')
  .onRun(async (context) => {
    console.log('⏰ Actualización programada de precios...');
    
    try {
      // Llamar a la función de scraping
      const response = await axios.get('https://www.bencinaenlinea.cl');
      const $ = cheerio.load(response.data);
      
      const diesel = parseFloat($('.precio-diesel').first().text()) || 950;
      const gasoline93 = parseFloat($('.precio-93').first().text()) || 1100;
      const gasoline95 = parseFloat($('.precio-95').first().text()) || 1150;
      const gasoline97 = parseFloat($('.precio-97').first().text()) || 1200;
      
      const prices = {
        diesel: Math.round(diesel),
        gasoline93: Math.round(gasoline93),
        gasoline95: Math.round(gasoline95),
        gasoline97: Math.round(gasoline97),
        source: 'scheduled-update',
        lastUpdated: new Date().toISOString()
      };
      
      // Guardar en Firestore
      await admin.firestore().collection('settings').doc('currentFuelPrice').set(prices);
      
      // Guardar en historial
      await admin.firestore().collection('fuelPriceHistory').add({
        ...prices,
        savedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      
      console.log('✅ Precios actualizados automáticamente:', prices);
      
      return null;
    } catch (error) {
      console.error('❌ Error en actualización programada:', error);
      return null;
    }
  });
*/
// ============================================
// FUNCIÓN 3: Tipo de Cambio USD/CLP
// ============================================

/**
 * Obtiene el tipo de cambio USD a CLP
 */
exports.getExchangeRate = functions.https.onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  
  try {
    const response = await axios.get('https://api.exchangerate-api.com/v4/latest/USD');
    const rate = response.data.rates.CLP;
    
    res.json({
      usdToClp: rate,
      lastUpdated: new Date().toISOString()
    });
  } catch (error) {
    res.json({
      usdToClp: 950,
      lastUpdated: new Date().toISOString(),
      error: error.message
    });
  }
});

// ============================================
// FUNCIÓN 4: Precio Petróleo Internacional
// ============================================

/**
 * Obtiene precio WTI/Brent y estima precio en Chile
 */
exports.getInternationalOilPrice = functions.https.onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  
  try {
    // Obtener tipo de cambio
    const exchangeResponse = await axios.get('https://api.exchangerate-api.com/v4/latest/USD');
    const usdToClp = exchangeResponse.data.rates.CLP;
    
    // WTI promedio (puedes conectar a una API real aquí)
    const wtiPrice = 75; // USD por barril
    
    // Cálculos
    const pricePerLiterUSD = wtiPrice / 159; // 1 barril = 159 litros
    const pricePerLiterCLP = pricePerLiterUSD * usdToClp;
    
    // Aplicar factor de refinación y distribución
    const dieselPrice = Math.round(pricePerLiterCLP * 2.0);
    
    const prices = {
      diesel: dieselPrice,
      gasoline93: Math.round(dieselPrice * 1.15),
      gasoline95: Math.round(dieselPrice * 1.20),
      gasoline97: Math.round(dieselPrice * 1.25),
      wtiPrice,
      usdToClp,
      source: 'international-estimate',
      lastUpdated: new Date().toISOString()
    };
    
    res.json(prices);
  } catch (error) {
    res.json({
      diesel: 950,
      gasoline93: 1100,
      gasoline95: 1150,
      gasoline97: 1200,
      source: 'fallback',
      error: error.message
    });
  }
});

// ============================================
// CONFIGURACIÓN DE DESPLIEGUE
// ============================================

/**
 * INSTRUCCIONES DE DESPLIEGUE:
 * 
 * 1. En tu proyecto Firebase:
 *    firebase init functions
 * 
 * 2. Instalar dependencias:
 *    cd functions
 *    npm install axios cheerio
 * 
 * 3. Copiar este código a functions/index.js
 * 
 * 4. Desplegar:
 *    firebase deploy --only functions
 * 
 * 5. Las URLs estarán disponibles en:
 *    https://REGION-PROJECT.cloudfunctions.net/getFuelPrices
 *    https://REGION-PROJECT.cloudfunctions.net/getExchangeRate
 *    https://REGION-PROJECT.cloudfunctions.net/getInternationalOilPrice
 * 
 * 6. Actualizar en fuelPriceServiceAuto.js:
 *    const response = await fetch('https://TU-URL.cloudfunctions.net/getFuelPrices');
 */
