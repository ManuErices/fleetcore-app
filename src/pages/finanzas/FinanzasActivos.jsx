/**
 * Finanzas → Activos. La pantalla es la misma que Contabilidad → Activos
 * (src/pages/activos/ActivosPagina.jsx); aquí solo se le pasa la obra
 * elegida en el selector de Finanzas.
 */
import React from "react";
import ActivosPagina from "../activos/ActivosPagina";
import { useFinanzas, ProyectoSelector } from "./FinanzasContext";

export default function FinanzasActivos() {
  const { proyectoId } = useFinanzas();
  return <ActivosPagina proyectoId={proyectoId} selectorProyecto={<ProyectoSelector variante="cuaderno" />} origen="finanzas" />;
}
