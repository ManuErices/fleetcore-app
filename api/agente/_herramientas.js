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
//   2. Implementa su ejecutor con el MISMO nombre en src/lib/agente/herramientas.js
//      (o en herramientasFinanzas.js / herramientasEquipo.js según el tema).
//   3. Si modifica datos, márcala en ACCIONES_QUE_MODIFICAN de ese archivo
//      para que el usuario la confirme antes de ejecutarse.
// ============================================================

export const INSTRUCCIONES = `Eres el asistente de FleetCore y trabajas como un integrante más del equipo de una empresa chilena de construcción y maquinaria: flota, combustible, obras, personal y finanzas. Hablas en español de Chile, de tú, directo y cercano.

Tu rol es ser un aliado en el trabajo diario de cada persona, sea operador, administrativo, jefe de obra o gerencia:
- Haces el trabajo, no solo lo explicas: consultas datos, armas y ajustas el flujo de caja, cargas información, abres pantallas y dejas las cosas listas.
- Opinas. Cuando ves los datos, das tu lectura y una recomendación concreta, con el número que la respalda ("La S4 queda $3,2 M bajo el colchón; yo movería el pago de X a la S6"). Si algo es una suposición tuya, dilo.
- Intervienes. Si al revisar algo ves un problema que nadie te preguntó (caja bajo el colchón, documentos de máquinas vencidos, deuda en mora, partidas sin cerrar, máquinas sin reporte), menciónalo en una línea al final.
- Te adaptas al rol: a un operador le hablas de su máquina, su reporte y su combustible; a gerencia, de caja, deuda y decisiones.
- Si alguien te saluda o pregunta qué hay para hoy, usa resumen_del_dia y cuéntale lo importante para su rol.

Cómo trabajar:
- Usa las herramientas para obtener datos reales. Nunca inventes cifras, nombres, patentes ni fechas; si un dato no existe en la plataforma, dilo.
- Antes de modificar algo, resuelve ids con las herramientas de búsqueda. Si hay ambigüedad (dos máquinas o cuentas parecidas), pregunta.
- Las herramientas que modifican datos le muestran al usuario una tarjeta para confirmar. Agrupa los cambios en lotes (crear_cuentas_flujo, cargar_partidas_flujo) para no pedir veinte confirmaciones. Si rechaza, acéptalo y no reintentes.
- Si una herramienta responde que el rol no tiene permiso, explícalo sin insistir.
- Fechas en formato AAAA-MM-DD. Interpreta "hoy", "la próxima semana" o "fin de mes" a partir de la fecha del contexto.
- Si algo no se puede hacer con tus herramientas, dilo y ofrece abrir la pantalla donde se hace (navegar_a).

Flujo de caja:
- Se maneja por semanas (lunes a domingo) y cuentas de ingreso o egreso; los montos se anotan por cuenta y semana. Las cuentas recurrentes se proyectan solas.
- La proyección es de 13 semanas desde la semana actual, partiendo del saldo de bancos. El colchón es el saldo mínimo que la empresa quiere mantener.
- Para armar un flujo desde cero: pregunta lo mínimo que falte (ingresos esperados por cliente u obra y cuándo; egresos fijos como sueldos, imposiciones, arriendos, créditos, combustible, subcontratos), revisa con listar_cuentas_flujo lo que ya existe, crea las cuentas que falten en un lote, carga los montos en otro lote, y cierra con proyectar_caja y tu opinión.
- Prioridades de pago: "Ineludible" (sueldos, imposiciones, impuestos, cuotas) no se mueve; "Para operar" se mueve con cuidado; "Conversable" es lo primero que se negocia.

Memoria del equipo:
- Si alguien te cuenta algo que conviene saber en futuras conversaciones (una preferencia, una regla de la empresa, un dato estable como "el colchón real es 8 M" o "Copec factura los martes"), guárdalo con recordar. No guardes datos personales sensibles ni cosas de un solo uso.

Formato:
- Responde siempre en español. Cambia de idioma solo si el usuario escribe frases completas en otro idioma; un saludo como "hello" no cuenta.
- Muchas respuestas se leen en voz alta: primero la respuesta, después el detalle mínimo. Sé breve salvo que pidan un análisis.
- Texto simple, sin tablas ni encabezados markdown. Listas con guiones, máximo 10 elementos.
- Montos en pesos chilenos con separador de miles ($1.234.567) o abreviados en millones cuando ayuda a leer ($12,3 M). Litros con separador (12.345 L).`;

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
        seccion_finanzas: {
          type: 'string',
          enum: ['semana', 'pagos', 'flujo', 'bancos', 'costos', 'activos', 'proveedores', 'deuda', 'obras', 'reportes'],
          description: 'Solo con destino "finanzas": la sección a abrir. "semana" es la vista de caja y pagos de la semana; "flujo" es la planilla del flujo de caja.',
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

  // ── Equipo ─────────────────────────────────────────────────
  {
    name: 'resumen_del_dia',
    description: 'Panorama de hoy para la empresa: documentos de máquinas vencidos o por vencer, combustible y reportes diarios de hoy (y qué máquinas activas no tienen reporte), situación de caja y deuda vencida. Las secciones que el rol del usuario no puede ver vuelven como sin acceso. Úsala cuando pregunten qué hay para hoy, pidan un resumen o saluden al empezar el día.',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'consultar_datos',
    description: 'Lectura general de una colección de la empresa, para preguntas que ninguna otra herramienta cubre. Devuelve documentos aligerados (sin fotos ni firmas). Colecciones: projects, machines, reportes_combustible, reportes_detallados, deuda_proveedores, finanzas_proveedores, finanzas_activos, flujo_cuentas, subcontratos, rendiciones, solicitudes_pasajes, purchaseOrders, workOrders, maintenancePlans, centros_costo, guias_despacho, equipos_surtidores, estaciones_combustible, empresas_combustible, ausencias, vacaciones, licencias. Prefiere las herramientas específicas cuando existan.',
    input_schema: {
      type: 'object',
      properties: {
        coleccion: { type: 'string' },
        desde: { type: 'string', description: 'AAAA-MM-DD, filtra por la fecha principal de la colección si tiene.' },
        hasta: { type: 'string', description: 'AAAA-MM-DD.' },
        texto: { type: 'string', description: 'Filtra documentos que contengan este texto en cualquier campo.' },
        limite: { type: 'integer', description: 'Máximo de documentos a devolver (1-100, por defecto 30).' },
      },
      required: ['coleccion'],
      additionalProperties: false,
    },
  },
  {
    name: 'recordar',
    description: 'Guarda una nota en la memoria compartida del equipo. La verás en el contexto de futuras conversaciones de cualquier persona de la empresa. Una idea por nota, redactada para que se entienda sola.',
    input_schema: {
      type: 'object',
      properties: { texto: { type: 'string' } },
      required: ['texto'],
      additionalProperties: false,
    },
  },
  {
    name: 'olvidar',
    description: 'Borra una nota de la memoria del equipo por su id (aparece entre corchetes en el contexto).',
    input_schema: {
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id'],
      additionalProperties: false,
    },
  },

  // ── Finanzas ───────────────────────────────────────────────
  {
    name: 'proyectar_caja',
    description: 'Proyección de caja de 13 semanas, la misma de la pantalla "La semana" de Finanzas: saldo de partida, ingresos y egresos pendientes por semana, saldo al cerrar cada semana, semana más baja, cuánto queda disponible sobre el colchón o cuánto falta, una propuesta de pagos "conversables" a mover si falta, y partidas de semanas pasadas sin cerrar.',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'detalle_semana_caja',
    description: 'Partidas de una semana de la proyección (1 = semana actual, hasta 13): cada cuenta con su monto, lo pendiente, si está pagada, su prioridad y si viene de una recurrencia automática.',
    input_schema: {
      type: 'object',
      properties: { semana: { type: 'integer', description: 'Número de semana de la proyección, 1 a 13.' } },
      required: ['semana'],
      additionalProperties: false,
    },
  },
  {
    name: 'simular_pago',
    description: 'Evalúa si un pago extra (no planificado) cabe en la caja sin bajar del colchón, y si no cabe, desde qué semana se podría hacer.',
    input_schema: {
      type: 'object',
      properties: {
        monto: { type: 'number', description: 'Monto en pesos, positivo.' },
        semana: { type: 'integer', description: 'Semana de la proyección en que se pagaría (1 = esta semana).' },
      },
      required: ['monto'],
      additionalProperties: false,
    },
  },
  {
    name: 'listar_cuentas_flujo',
    description: 'Lista las cuentas del flujo de caja (id, nombre, ingreso/egreso, subcategoría, obra, recurrencia, prioridad). Úsala para resolver el cuenta_id antes de cargar montos o moverlos.',
    input_schema: {
      type: 'object',
      properties: {
        texto: { type: 'string', description: 'Filtra por nombre, subcategoría, detalle, obra o cliente.' },
        categoria: { type: 'string', enum: ['INGRESOS', 'EGRESOS'] },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'crear_cuentas_flujo',
    description: 'Crea una o varias cuentas nuevas en el flujo de caja en un solo paso (una confirmación). Omite las que ya existen con el mismo nombre. Para gastos o ingresos fijos indica monto_recurrente y frecuencia y la proyección los repetirá sola.',
    input_schema: {
      type: 'object',
      properties: {
        cuentas: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              nombre: { type: 'string' },
              categoria: { type: 'string', enum: ['INGRESOS', 'EGRESOS'] },
              subcategoria: { type: 'string', description: 'Por ejemplo OPERACIONAL, REMUNERACIONES, FINANCIERO, IMPUESTOS, VENTAS. En mayúsculas.' },
              detalle: { type: 'string' },
              obra: { type: 'string', description: 'Código o nombre de la obra a la que pertenece, si aplica.' },
              cliente: { type: 'string' },
              monto_recurrente: { type: 'number', description: 'Monto en pesos, positivo, si se repite.' },
              frecuencia: { type: 'string', enum: ['semanal', 'quincenal', 'mensual'] },
            },
            required: ['nombre', 'categoria'],
            additionalProperties: false,
          },
        },
      },
      required: ['cuentas'],
      additionalProperties: false,
    },
  },
  {
    name: 'cargar_partidas_flujo',
    description: 'Anota montos en el flujo de caja, uno por cuenta y semana, en un solo paso (una confirmación). Los montos van siempre positivos: el signo lo pone la categoría de la cuenta. Cualquier fecha se lleva al lunes de su semana. modo "reemplazar" deja el monto indicado; "sumar" lo agrega a lo que ya había.',
    input_schema: {
      type: 'object',
      properties: {
        partidas: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              cuenta_id: { type: 'string' },
              etiqueta: { type: 'string', description: 'Nombre de la cuenta, para mostrarlo en la confirmación.' },
              semana: { type: 'string', description: 'AAAA-MM-DD de cualquier día de la semana.' },
              monto: { type: 'number' },
            },
            required: ['cuenta_id', 'etiqueta', 'semana', 'monto'],
            additionalProperties: false,
          },
        },
        modo: { type: 'string', enum: ['reemplazar', 'sumar'] },
      },
      required: ['partidas'],
      additionalProperties: false,
    },
  },
  {
    name: 'mover_pago_flujo',
    description: 'Mueve el monto anotado de una cuenta de una semana a otra (por ejemplo, para postergar un pago conversable). Lleva consigo la nota y la marca de pagado. Las recurrencias automáticas no se mueven: para esas, carga el monto a mano.',
    input_schema: {
      type: 'object',
      properties: {
        cuenta_id: { type: 'string' },
        etiqueta: { type: 'string', description: 'Nombre de la cuenta, para la confirmación.' },
        desde: { type: 'string', description: 'AAAA-MM-DD de la semana de origen.' },
        hasta: { type: 'string', description: 'AAAA-MM-DD de la semana de destino.' },
      },
      required: ['cuenta_id', 'etiqueta', 'desde', 'hasta'],
      additionalProperties: false,
    },
  },
  {
    name: 'marcar_pagado',
    description: 'Marca (o desmarca) como pagada la partida de una cuenta en una semana, para que deje de contar como pendiente en la proyección.',
    input_schema: {
      type: 'object',
      properties: {
        cuenta_id: { type: 'string' },
        etiqueta: { type: 'string', description: 'Nombre de la cuenta, para la confirmación.' },
        semana: { type: 'string', description: 'AAAA-MM-DD de la semana.' },
        pagado: { type: 'boolean', description: 'false para desmarcar. Por defecto true.' },
      },
      required: ['cuenta_id', 'etiqueta', 'semana'],
      additionalProperties: false,
    },
  },
  {
    name: 'deuda_proveedores',
    description: 'Deuda pendiente con proveedores, factoring y financieras, agrupada por acreedor: saldo, monto vencido, días de mora máximos y próximo vencimiento.',
    input_schema: {
      type: 'object',
      properties: { solo_vencida: { type: 'boolean' } },
      additionalProperties: false,
    },
  },
];
