/**
 * Contabilidad → Activos fijos. Misma pantalla que Finanzas → Activos
 * (src/pages/activos/ActivosPagina.jsx), sobre el maestro de máquinas: lo que
 * se anota en una se ve en la otra.
 */
import React from "react";
import ActivosPagina from "../activos/ActivosPagina";

export default function ContabilidadActivos() {
  return <ActivosPagina titulo="Activos fijos" origen="contabilidad" />;
}
