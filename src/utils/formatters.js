/**
 * Formatea un número o string numérico con separador de miles (puntos) y decimales (comas)
 * @param {string|number} val 
 * @returns {string}
 */
export const formatMiles = (val) => {
  if (val === null || val === undefined || val === '') return '';
  
  // Convertir a string y limpiar caracteres no permitidos (solo dígitos y un separador decimal)
  let s = val.toString().replace(/[^\d.,]/g, '').replace(',', '.');
  
  // Si termina en punto/coma, lo dejamos para que el usuario siga escribiendo
  if (s.endsWith('.') || s.endsWith(',')) return s;

  const num = parseFloat(s);
  if (isNaN(num)) return '';

  const parts = s.split('.');
  // Formatear la parte entera con puntos
  parts[0] = parseInt(parts[0], 10).toLocaleString('es-CL');
  
  // Unir con la parte decimal si existe
  return parts.length > 1 ? parts[0] + ',' + parts[1] : parts[0];
};

/**
 * Remueve los puntos de miles y convierte coma decimal a punto para obtener el valor numérico
 * @param {string} val 
 * @returns {number}
 */
export const unformatMiles = (val) => {
  if (!val) return 0;
  // Quitar puntos de miles, cambiar coma por punto
  const clean = val.toString().replace(/\./g, '').replace(',', '.');
  return parseFloat(clean) || 0;
};
