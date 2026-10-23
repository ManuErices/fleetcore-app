/**
 * src/lib/finanzas/navegacion.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Finanzas no tiene una ruta por sección: FinanzasApp guarda la vista activa en
 * su estado. Para saltar de una pantalla a otra (por ejemplo, del flujo de caja
 * a Propuestas) se avisa con un evento que FinanzasApp escucha. Es el mismo que
 * usa el asistente IA.
 *
 *  nuevaPropuesta: abre Propuestas con el formulario de una propuesta nueva.
 */
export function irASeccionFinanzas(seccion, { nuevaPropuesta = false } = {}) {
  if (nuevaPropuesta) {
    try { sessionStorage.setItem("finanzas:nuevaPropuesta", "1"); } catch { /* sin almacenamiento */ }
  }
  window.dispatchEvent(new CustomEvent("agente:finanzas", { detail: seccion }));
}
