// ============================================
// PLAN DE CUENTAS CONTABLES — fuente única de verdad
// Basado en el documento oficial "Cuentas Contables" de la empresa.
// Se usa para clasificar Egresos en Remuneraciones, Órdenes de Compra,
// Subcontratos y Rendiciones, y para armar el Estado de Pago.
// ============================================

export const CATEGORIAS = {
  1: "MANO DE OBRA",
  2: "MÁQUINARIAS Y EQUIPOS",
  3: "MATERIALES",
  4: "COMBUSTIBLE",
  5: "GASTOS GENERALES",
};

export const PLAN_CUENTAS = [
  { codigo: "1.1", categoria: 1, subcategoria: "MANO DE OBRA DIRECTO", observacion: "Operadores, Estaqueros, Maestros, Ayudantes de Maestros, Jornales" },
  { codigo: "1.2", categoria: 1, subcategoria: "MANO DE OBRA INDIRECTO", observacion: "Alarifes, Señaleros, Card Chequer, Equipo Administrativo, Profesionales" },

  { codigo: "2.1", categoria: 2, subcategoria: "MAQUINARIA DIRECTA", observacion: "Maq Directa en Obra (Rodillo, Moto, Retro, Camiones, ETC)" },
  { codigo: "2.2", categoria: 2, subcategoria: "MAQUINARIA DIRECTA MPF", observacion: "Maq Directa en Obra (Rodillo, Moto, Retro, Camiones, ETC)" },
  { codigo: "2.3", categoria: 2, subcategoria: "MAQUINARIA INDIRECTA", observacion: "Vehículos Menores, Furgones, Logística Externo" },
  { codigo: "2.4", categoria: 2, subcategoria: "MAQUINARIA INDIRECTA MPF", observacion: "Vehículos Menores, Furgones, Logística Interno" },
  { codigo: "2.5", categoria: 2, subcategoria: "FLETES DE MAQUINARIA", observacion: "Cama Baja, Fletes" },
  { codigo: "2.6", categoria: 2, subcategoria: "HERRAMIENTAS Y EQUIPOS MENORES", observacion: "Equipos Menores, Compra y Arriendos" },
  { codigo: "2.7", categoria: 2, subcategoria: "MANTENCIÓN VEHÍCULOS, MAQUINARIAS Y EQUIPOS", observacion: "" },
  { codigo: "2.8", categoria: 2, subcategoria: "EQUIPAMIENTO MAQUINARIA", observacion: "Costos corresponden a centro de gestión Maquinaria 001-1" },
  { codigo: "2.9", categoria: 2, subcategoria: "ELEMENTOS DE DESGASTE", observacion: "Costos corresponden a obra" },

  { codigo: "3.1", categoria: 3, subcategoria: "MOVIMIENTO DE TIERRA", observacion: "Áridos, Botadero, Empréstito, Agua Industrial" },
  { codigo: "3.2", categoria: 3, subcategoria: "MATERIALES OBRAS CIVILES", observacion: "Saneamiento, alcantarillas, conexas, drenaje" },
  { codigo: "3.3", categoria: 3, subcategoria: "SEGURIDAD VIAL DEFINITIVA", observacion: "Señalética, Demarcación, Barreras Metálicas, etc." },
  { codigo: "3.4", categoria: 3, subcategoria: "ASFALTO", observacion: "" },
  { codigo: "3.5", categoria: 3, subcategoria: "SAL", observacion: "" },
  { codigo: "3.6", categoria: 3, subcategoria: "HORMIGÓN", observacion: "Sólo si es Incidente (Partida > 5% del contrato)" },
  { codigo: "3.7", categoria: 3, subcategoria: "ACERO PARA ARMADURAS", observacion: "Sólo Para Estructuras Armadas" },
  { codigo: "3.8", categoria: 3, subcategoria: "MATERIALES EDIFICACIÓN", observacion: "Construcción, remodelación y reparaciones de viviendas, sedes, etc." },
  { codigo: "3.9", categoria: 3, subcategoria: "OTROS", observacion: "" },

  { codigo: "4.1", categoria: 4, subcategoria: "DIÉSEL", observacion: "" },
  { codigo: "4.2", categoria: 4, subcategoria: "BENCINA", observacion: "De Obra, no gastos básicos" },
  { codigo: "4.3", categoria: 4, subcategoria: "OTROS", observacion: "Parafina, Ad blue, Gases, Fuel oil" },

  { codigo: "5.1", categoria: 5, subcategoria: "ALOJAMIENTOS", observacion: "Arriendos, Cabañas, Hospedajes, pensiones, etc" },
  { codigo: "5.2", categoria: 5, subcategoria: "ALIMENTACIÓN EN OBRA", observacion: "Almuerzos, desayunos, cenas y colaciones en Obra" },
  { codigo: "5.3", categoria: 5, subcategoria: "MOVILIZACIÓN", observacion: "Pasajes, taxis, vuelos, bus, Peajes, traslados" },
  { codigo: "5.4", categoria: 5, subcategoria: "SERVICIOS BÁSICOS FAENA", observacion: "luz, agua, teléfono, internet, leña, gas (gastos de oficina)" },
  { codigo: "5.5", categoria: 5, subcategoria: "EQUIPAMIENTO INSTALACIONES DE FAENA", observacion: "sólo si son activos fijos" },
  { codigo: "5.6", categoria: 5, subcategoria: "INSTALACIONES DE FAENA", observacion: "Mat para instalaciones de Faena, Arriendos, Mobiliario, etc" },
  { codigo: "5.7", categoria: 5, subcategoria: "GASTOS ADMINISTRATIVOS", observacion: "Notariales, Librería, talonarios, envíos, encomiendas, etc" },
  { codigo: "5.8", categoria: 5, subcategoria: "ELEMENTOS DE PROTECCIÓN PERSONAL (EPP)", observacion: "" },
  { codigo: "5.9", categoria: 5, subcategoria: "SEGURIDAD PROVISORIA", observacion: "Materiales Desvíos, señaletica provisoria" },
  { codigo: "5.10", categoria: 5, subcategoria: "INSUMOS OFICINA", observacion: "Articulos de libreria, oficina, toner impresoras" },
  { codigo: "5.11", categoria: 5, subcategoria: "GASTOS TOPOGRAFICOS", observacion: "Arriendo de equipos, servicios, compra de equipos, materiales estacas, calibración, repuestos" },
  { codigo: "5.12", categoria: 5, subcategoria: "GASTOS LABORATORIO", observacion: "Densidades, controles, arriendo de Equipos, Compra de Equipo" },
  { codigo: "5.13", categoria: 5, subcategoria: "GASTOS ARQUEOLÓGICOS", observacion: "" },
  { codigo: "5.14", categoria: 5, subcategoria: "SERVICIOS SANITARIOS", observacion: "Baños quimicos, sanitizaciones, desratización, mantenciones baños, etc" },
  { codigo: "5.15", categoria: 5, subcategoria: "GASTOS MEDIOAMBIENTALES", observacion: "reciclaje, estudios varios" },
  { codigo: "5.16", categoria: 5, subcategoria: "ARTICULOS COMPUTACIONALES Y TECNOLÓGICOS", observacion: "Disco duro, Impresora, Monitores, TV, Proyector etc." },
  { codigo: "5.17", categoria: 5, subcategoria: "EQUIPOS DE COMUNICACIÓN", observacion: "radios handy, radios base, gps" },
  { codigo: "5.18", categoria: 5, subcategoria: "ATENCIONES", observacion: "Hospedajes adicionales, alimentación fuera de obra" },
  { codigo: "5.19", categoria: 5, subcategoria: "ESTUDIOS, ASESORIAS Y CONSULTORIAS", observacion: "Que no entren en los servicios anteriores, Auditorias, Informes Externos, etc" },
  { codigo: "5.20", categoria: 5, subcategoria: "CAPACITACIONES Y CERTIFICACIONES", observacion: "" },
  { codigo: "5.21", categoria: 5, subcategoria: "PÓLIZAS Y SEGUROS", observacion: "" },
  { codigo: "5.22", categoria: 5, subcategoria: "GASTOS BANCARIOS Y FINANCIEROS", observacion: "Factoring, entre otros" },
  { codigo: "5.23", categoria: 5, subcategoria: "OFICINA CENTRAL", observacion: "% del Proyecto destinado a Oficina Central" },
  { codigo: "5.24", categoria: 5, subcategoria: "OTROS GASTOS GENERALES OBRA", observacion: "otros gastos no clasificados anteriormente" },
  { codigo: "5.25", categoria: 5, subcategoria: "GASTOS IMPREVISTOS Y OTROS", observacion: "Injustificados, imprevistos y otros" },
];

// "3.2" → texto completo "3.2 MATERIALES OBRAS CIVILES", para mostrar en listas y dropdowns
export function formatoCuenta(cuenta) {
  return `${cuenta.codigo} ${cuenta.subcategoria}`;
}

// Todas las cuentas como strings "código nombre", listas para un dropdown/autocomplete
export function listaCuentasFormateadas() {
  return PLAN_CUENTAS.map(formatoCuenta);
}

// Busca la cuenta que corresponde a un código exacto (ej. "3.2")
export function buscarCuentaPorCodigo(codigo) {
  return PLAN_CUENTAS.find(c => c.codigo === String(codigo || "").trim()) || null;
}

// Dado un código (ej. "3.2" o "3"), devuelve el nombre de categoría (1-5) al que pertenece
export function categoriaNombrePorCodigo(codigo) {
  const primerDigito = String(codigo || "").trim().split(".")[0];
  return CATEGORIAS[primerDigito] || null;
}

// Dado un código, devuelve la clave interna usada en el Estado de Pago
// (manoDeObra, maquinariaYEquipos, materiales, combustible, gastosGenerales)
export function claveEgresoPorCodigo(codigo) {
  const primerDigito = String(codigo || "").trim().split(".")[0];
  switch (primerDigito) {
    case "1": return "manoDeObra";
    case "2": return "maquinariaYEquipos";
    case "3": return "materiales";
    case "4": return "combustible";
    case "5": return "gastosGenerales";
    default: return null;
  }
}
