// ============================================================
// FLEETCORE — Agente IA: instrucciones y catálogo de herramientas
// api/agente/_herramientas.js  (el "_" evita que Vercel lo publique como ruta)
//
// Aquí solo se DESCRIBEN las herramientas. Quien las ejecuta es el
// navegador (src/lib/agente/herramientas.js), con el Firestore del propio
// usuario: así las reglas de seguridad y el empresaId siguen mandando y el
// agente nunca ve ni toca algo que el usuario no podría ver o tocar.
//
// Para agregar una herramienta nueva:
//   1. Descríbela aquí (nombre, descripción, input_schema).
//   2. Implementa su ejecutor con el MISMO nombre en src/lib/agente/herramientas.js.
//   3. Si modifica datos, márcala en ACCIONES_QUE_MODIFICAN de ese archivo
//      para que el usuario la confirme antes de ejecutarse.
// ============================================================

export const INSTRUCCIONES = `Eres el asistente de FleetCore, una plataforma chilena de gestión de flotas de maquinaria, combustible, obras y personal. Hablas en español de Chile, de tú, con frases cortas y claras.

Tu trabajo es ejecutar tareas dentro de la plataforma usando las herramientas disponibles: consultar máquinas, obras, trabajadores, combustible y reportes diarios; abrir pantallas; y hacer cambios cuando el usuario lo pide.

Cómo trabajar:
- Usa las herramientas para obtener datos reales. Nunca inventes cifras, nombres, patentes ni fechas.
- Si una búsqueda devuelve varias coincidencias y la tarea depende de cuál es, pregunta cuál antes de modificar nada.
- Las herramientas que modifican datos le muestran al usuario una tarjeta de confirmación; si la rechaza, acéptalo y no reintentes.
- Si una herramienta responde con error de permisos, explica que su rol no permite esa acción.
- Las fechas van en formato AAAA-MM-DD. Interpreta "hoy", "ayer", "esta semana" o "el mes pasado" a partir de la fecha actual del contexto.
- Si te piden algo que ninguna herramienta permite, dilo y sugiere la pantalla donde se hace (puedes abrirla con navegar_a).

Formato de respuesta:
- Muchas respuestas se leen en voz alta: sé breve, primero el dato que se pidió y luego el detalle mínimo.
- Texto simple. Nada de tablas ni encabezados markdown; si hay una lista, usa guiones y como máximo 10 elementos.
- Litros y montos con separador de miles chileno (12.345 L, $1.234.567).`;

const FECHA = {
  type: 'string',
  description: 'Fecha en formato AAAA-MM-DD.',
};

export const HERRAMIENTAS = [
  {
    name: 'listar_obras',
    description: 'Lista las obras/proyectos de la empresa con su id, nombre, código y si están activas. Úsala para resolver el id de una obra a partir de su nombre.',
    input_schema: {
      type: 'object',
      properties: {
        incluir_inactivas: { type: 'boolean', description: 'Incluir obras cerradas. Por defecto false.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'buscar_maquinas',
    description: 'Busca máquinas y vehículos de la flota por texto libre (patente, código, nombre, marca, modelo o tipo) y/o por obra. Devuelve id, patente, código, nombre, tipo, marca, modelo, obra asignada y si está activa. Sin filtros devuelve toda la flota.',
    input_schema: {
      type: 'object',
      properties: {
        texto: { type: 'string', description: 'Texto a buscar, por ejemplo "excavadora", "HJKL-23" o "CAT".' },
        obra_id: { type: 'string', description: 'Id de una obra (de listar_obras) para filtrar las máquinas asignadas a ella.' },
        solo_activas: { type: 'boolean', description: 'Por defecto true.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'buscar_trabajadores',
    description: 'Busca trabajadores/operadores de la empresa por nombre, RUT o cargo. Devuelve id, nombre completo, RUT, cargo, teléfono y correo.',
    input_schema: {
      type: 'object',
      properties: {
        texto: { type: 'string', description: 'Nombre, apellido, RUT o cargo.' },
      },
      required: ['texto'],
      additionalProperties: false,
    },
  },
  {
    name: 'resumen_combustible',
    description: 'Resume los movimientos de combustible en un rango de fechas: litros entregados a máquinas (salidas), litros ingresados (entradas/compras), número de reportes y el detalle por máquina. Se puede filtrar por obra o por máquina.',
    input_schema: {
      type: 'object',
      properties: {
        desde: FECHA,
        hasta: FECHA,
        obra_id: { type: 'string', description: 'Id de obra para filtrar.' },
        maquina_id: { type: 'string', description: 'Id de máquina para filtrar (de buscar_maquinas).' },
      },
      required: ['desde', 'hasta'],
      additionalProperties: false,
    },
  },
  {
    name: 'resumen_reportes_diarios',
    description: 'Resume los reportes diarios de operación (horómetro, kilometraje, operador, estado de la máquina, observaciones) en un rango de fechas. Devuelve horas trabajadas por máquina y los reportes individuales más recientes. Se puede filtrar por obra o por máquina.',
    input_schema: {
      type: 'object',
      properties: {
        desde: FECHA,
        hasta: FECHA,
        obra_id: { type: 'string' },
        maquina_id: { type: 'string' },
      },
      required: ['desde', 'hasta'],
      additionalProperties: false,
    },
  },
  {
    name: 'navegar_a',
    description: 'Abre una pantalla de la plataforma para el usuario. Úsala cuando pida "abre", "llévame a", "muéstrame la pantalla de", o cuando la tarea se hace mejor en un formulario.',
    input_schema: {
      type: 'object',
      properties: {
        destino: {
          type: 'string',
          enum: [
            'inicio', 'maquinas', 'combustible', 'reporte_combustible', 'reporte_diario',
            'bitacora', 'calendario', 'remuneraciones', 'ordenes_compra', 'rendiciones',
            'pasajes', 'subcontratos', 'precio_combustible', 'app_operadores', 'rrhh',
            'reportes', 'finanzas', 'contabilidad', 'documentos', 'selector_apps',
          ],
        },
      },
      required: ['destino'],
      additionalProperties: false,
    },
  },
  {
    name: 'crear_obra',
    description: 'Crea una obra/proyecto nueva y activa. Requiere rol administrador. Antes de crearla, revisa con listar_obras que no exista una con el mismo nombre.',
    input_schema: {
      type: 'object',
      properties: {
        nombre: { type: 'string', description: 'Nombre de la obra.' },
        codigo: { type: 'string', description: 'Código interno de la obra, si el usuario lo indica.' },
      },
      required: ['nombre'],
      additionalProperties: false,
    },
  },
  {
    name: 'actualizar_maquina',
    description: 'Cambia el estado (activa/inactiva) de una máquina o la asigna a otra obra. Requiere rol administrador. Usa el id que devuelve buscar_maquinas; para obra_id usa el de listar_obras, o una cadena vacía para dejarla sin obra.',
    input_schema: {
      type: 'object',
      properties: {
        maquina_id: { type: 'string' },
        activa: { type: 'boolean' },
        obra_id: { type: 'string' },
      },
      required: ['maquina_id'],
      additionalProperties: false,
    },
  },
];
