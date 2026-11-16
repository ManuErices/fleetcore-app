/**
 * src/lib/rut.js — RUT chileno: normalizar, formatear y validar (módulo 11).
 * Puro (sin Firebase): lo usan proveedores.js, terceros.js y clientes.
 */
export function normalizarRut(rut) {
  return String(rut || "").replace(/[^0-9kK]/g, "").toUpperCase();
}

export function formatearRut(rut) {
  const limpio = normalizarRut(rut);
  if (limpio.length < 2) return limpio;
  const cuerpo = limpio.slice(0, -1);
  const dv = limpio.slice(-1);
  return `${cuerpo.replace(/\B(?=(\d{3})+(?!\d))/g, ".")}-${dv}`;
}

// Valida el dígito verificador con módulo 11.
export function validarRut(rut) {
  const limpio = normalizarRut(rut);
  if (limpio.length < 2) return false;
  const cuerpo = limpio.slice(0, -1);
  const dv = limpio.slice(-1);
  if (!/^\d+$/.test(cuerpo)) return false;
  let suma = 0, multiplo = 2;
  for (let i = cuerpo.length - 1; i >= 0; i--) {
    suma += Number(cuerpo[i]) * multiplo;
    multiplo = multiplo === 7 ? 2 : multiplo + 1;
  }
  const resto = 11 - (suma % 11);
  const esperado = resto === 11 ? "0" : resto === 10 ? "K" : String(resto);
  return dv === esperado;
}

/** RUT usable como llave de un maestro: normalizado y con dígito verificador válido; si no, "". */
export function rutLlave(rut) {
  const n = normalizarRut(rut);
  return n.length >= 7 && validarRut(n) ? n : "";
}

