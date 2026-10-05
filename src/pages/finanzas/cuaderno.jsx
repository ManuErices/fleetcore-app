import React, { useId } from "react";
import { createPortal } from "react-dom";

/*
 * ════════════════════════════════════════════════════════════════════════
 *  CUADERNO — piezas base del diseño de Finanzas
 * ════════════════════════════════════════════════════════════════════════
 * Finanzas se ve como un cuaderno de cuentas llevado a mano por alguien muy
 * prolija. Toda pantalla del módulo se arma con estas piezas en vez de clases
 * sueltas, para que el carácter sea el mismo en todas partes.
 *
 * Reglas del sistema (ver también el bloque TEMA CUADERNO en index.css):
 *  - La raíz de cada pantalla rediseñada lleva className="cuaderno".
 *  - Títulos y encabezados de sección: <Titulo> (letra ligada, Playwrite CL).
 *    Todo lo demás: Handlee, que hereda de .cuaderno.
 *  - Toda cifra pasa por <Cifra>. Cada dígito va en su casilla de ancho fijo:
 *    la letra manuscrita no trae dígitos tabulares y sin esto las columnas
 *    no cuadran. Egresos y negativos, en rojo y entre paréntesis.
 *  - Totales: raya simple arriba y doble abajo (raya="total").
 *  - Estados (pagado, vencido, pendiente): <Resaltado>, nunca píldoras de color.
 *  - Sin degradados, sombras de color, emojis ni negritas: ella escribe con
 *    una sola pluma.
 * ════════════════════════════════════════════════════════════════════════
 */

// ─── Formato ──────────────────────────────────────────────────────────────────
const ANCHO_DIGITO = "0.62em";   // casilla de un dígito (Handlee: 0,34–0,64 em)
const ANCHO_SIGNO  = "0.30em";   // casilla de punto, coma o paréntesis
const ANCHO_PESO   = "0.58em";   // el signo $ es casi tan ancho como un dígito
function anchoCasilla(c) {
  if (/\d/.test(c)) return ANCHO_DIGITO;
  if (c === "$") return ANCHO_PESO;
  return ANCHO_SIGNO;
}

function separarMiles(n) {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/**
 * Texto de una cifra según la convención contable.
 *  escala: "miles" (540.000.000 → 540.000) | "pesos" (sin dividir)
 *  parentesis: los negativos van (entre paréntesis) en vez de con signo
 *  vacio: qué mostrar si el valor es 0, null o undefined
 */
export function formatearCifra(valor, { escala = "miles", parentesis = true, vacio = "" } = {}) {
  const n = Number(valor);
  if (!valor || !Number.isFinite(n) || n === 0) return vacio;
  const absoluto = Math.round(Math.abs(n) / (escala === "miles" ? 1000 : 1));
  if (absoluto === 0) return vacio;
  const texto = separarMiles(absoluto);
  if (n >= 0) return texto;
  return parentesis ? `(${texto})` : `-${texto}`;
}

// "SOFTWARES" → "Softwares". Para detalles y subcategorías.
export function casoOracion(s) {
  const t = String(s || "").trim().toLowerCase();
  return t ? t[0].toUpperCase() + t.slice(1) : "";
}

// "TARJETA CRÉDITO FABIAN ERICES" → "Tarjeta Crédito Fabian Erices". Para
// nombres de cuentas y proveedores. Los datos se siguen guardando como se
// escribieron; esto solo cambia cómo se muestran, porque en letra manuscrita
// las mayúsculas sostenidas se leen como un grito. Se respetan los códigos con
// números ("RE-02") y los conectores van en minúscula.
const CONECTORES = new Set(["de", "del", "la", "las", "el", "los", "y", "e", "o", "u", "a", "en", "por", "para", "con"]);
export function casoTitulo(s) {
  return String(s || "").trim().split(/\s+/).filter(Boolean).map((palabra, i) => {
    if (/\d/.test(palabra)) return palabra.toUpperCase();
    const min = palabra.toLowerCase();
    if (i > 0 && CONECTORES.has(min)) return min;
    return min.charAt(0).toUpperCase() + min.slice(1);
  }).join(" ");
}

// ─── Cifra ────────────────────────────────────────────────────────────────────
const COLOR_CIFRA = {
  tinta:   "text-cuaderno-tinta",
  roja:    "text-cuaderno-roja",
  grafito: "text-cuaderno-grafito",
  heredar: "",
};

const RAYA_CIFRA = {
  ninguna: "",
  doble:   "border-b-[3px] border-double border-current",
  total:   "border-t border-b-[3px] border-double border-current",
};

/**
 * Cifra alineada en casillas.
 *  valor: número (negativo = egreso). O bien `texto` ya formateado.
 *  color: "auto" (rojo si es negativo), "tinta", "roja", "grafito", "heredar"
 *  raya:  "ninguna" | "doble" (neto) | "total" (raya simple y doble)
 */
export function Cifra({
  valor, texto, escala = "miles", parentesis = true, vacio = "",
  color = "auto", raya = "ninguna", className = "",
}) {
  const contenido = texto ?? formatearCifra(valor, { escala, parentesis, vacio });
  if (!contenido) return null;

  const negativo = texto == null ? Number(valor) < 0 : contenido.startsWith("(") || contenido.startsWith("-");
  const claseColor = color === "auto" ? (negativo ? COLOR_CIFRA.roja : COLOR_CIFRA.tinta) : (COLOR_CIFRA[color] ?? "");

  return (
    <span className={`inline-flex whitespace-nowrap ${claseColor} ${RAYA_CIFRA[raya] ?? ""} ${className}`}>
      {/* Lectores de pantalla leen la cifra entera, no dígito por dígito */}
      <span className="sr-only">{contenido}</span>
      <span aria-hidden="true" className="inline-flex">
        {contenido.split("").map((c, i) => (
          <span key={i} className="inline-block text-center" style={{ width: anchoCasilla(c) }}>
            {c}
          </span>
        ))}
      </span>
    </span>
  );
}

// ─── Texto ────────────────────────────────────────────────────────────────────
// Interlineado amplio a propósito: la letra ligada tiene descendentes muy
// profundos (j, g, y) y con menos aire pisan la línea de abajo.
const TAMANO_TITULO = {
  xl: "text-[44px] leading-[1.5] pb-[0.35em]",  // título de página
  lg: "text-[28px] leading-[1.5] pb-[0.2em]",   // título de ficha o modal
  md: "text-[21px] leading-[1.55]",  // encabezado de sección
  sm: "text-[18px] leading-[1.5]",   // encabezado menor (mes en una tabla)
};

/** Título en letra ligada. Usar solo para títulos y encabezados de sección. */
export function Titulo({ as: Etiqueta = "h1", tamano = "xl", className = "", children, ...props }) {
  return (
    <Etiqueta
      className={`font-ligada font-light text-cuaderno-tinta ${TAMANO_TITULO[tamano] ?? TAMANO_TITULO.xl} ${className}`}
      {...props}
    >
      {children}
    </Etiqueta>
  );
}

const COLOR_RESALTADO = {
  menta:   "resaltado-menta",    // ingresos, pagado
  rosa:    "resaltado-rosa",     // egresos, vencido
  durazno: "resaltado-durazno",  // semana en curso, pendiente
  lavanda: "resaltado-lavanda",  // medio de pago
};

/** Trazo de resaltador pastel bajo el texto. También sirve como etiqueta de estado. */
export function Resaltado({ color = "menta", as: Etiqueta = "span", className = "", children }) {
  return <Etiqueta className={`resaltado ${COLOR_RESALTADO[color] ?? COLOR_RESALTADO.menta} ${className}`}>{children}</Etiqueta>;
}

/** Nota al margen en tinta roja: "Nota: …" u "Ojo: …". */
export function Nota({ etiqueta = "Nota:", tono = "roja", className = "", children }) {
  return (
    <p className={`m-0 flex gap-2 text-[18px] leading-snug ${tono === "roja" ? "text-cuaderno-roja" : "text-cuaderno-grafito"} ${className}`}>
      <span className="flex-shrink-0 text-cuaderno-roja">{etiqueta}</span>
      <span>{children}</span>
    </p>
  );
}

/** Contador encerrado en un círculo a lápiz (avisos, pendientes). */
export function Aviso({ critico = true, className = "", children }) {
  return (
    <span className={`inline-flex items-center justify-center min-w-[1.6rem] px-1.5 rounded-full border-[1.5px] text-sm leading-5 ${
      critico ? "border-cuaderno-roja text-cuaderno-roja" : "border-cuaderno-grafito text-cuaderno-grafito"} ${className}`}>
      {children}
    </span>
  );
}

/** Visto bueno: el ✓ con que se marca lo pagado o revisado. */
export function VistoBueno({ titulo = "Pagado", tamano = 14, className = "" }) {
  return (
    <svg width={tamano} height={tamano} viewBox="0 0 16 16" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
      className={`text-cuaderno-verde flex-shrink-0 ${className}`} role="img" aria-label={titulo}>
      <path d="M3 8.6 L6.4 12 L13 4.2" />
    </svg>
  );
}

/** Fila "concepto ······· cifra", como en un índice. */
export function LineaGuia({ etiqueta, children, className = "" }) {
  return (
    <div className={`flex items-baseline min-h-[34px] text-[19px] ${className}`}>
      <span>{etiqueta}</span>
      <span className="puntos-guia" aria-hidden="true" />
      <span>{children}</span>
    </div>
  );
}

// ─── Controles ────────────────────────────────────────────────────────────────
const FOCO = "focus:outline-none focus-visible:ring-2 focus-visible:ring-cuaderno-tinta/40 focus-visible:ring-offset-2 focus-visible:ring-offset-cuaderno-papel";

const VARIANTE_BOTON = {
  // Tinta llena: la acción principal de la pantalla (una sola por vista)
  primario:   "min-h-[44px] px-[18px] rounded-md border-[1.5px] border-cuaderno-tinta bg-cuaderno-tinta text-cuaderno-hoja hover:bg-cuaderno-tinta/90",
  // Contorno a pluma
  secundario: "min-h-[44px] px-4 rounded-md border-[1.5px] border-cuaderno-tinta bg-transparent text-cuaderno-tinta hover:bg-cuaderno-hoja",
  // Texto subrayado: acciones menores (cambiar, cancelar)
  texto:      "min-h-[44px] px-1 border-0 bg-transparent text-cuaderno-tinta underline underline-offset-[3px] decoration-cuaderno-columna hover:decoration-cuaderno-tinta",
  // Solo ícono (cerrar, copiar): exige aria-label
  icono:      "w-11 h-11 rounded-md border-[1.5px] border-cuaderno-tinta bg-transparent text-cuaderno-tinta hover:bg-cuaderno-hoja flex items-center justify-center",
};

export const Boton = React.forwardRef(function Boton(
  { variante = "secundario", type = "button", className = "", children, ...props }, ref
) {
  return (
    <button ref={ref} type={type}
      className={`inline-flex items-center justify-center gap-2 text-[18px] leading-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${FOCO} ${VARIANTE_BOTON[variante] ?? VARIANTE_BOTON.secundario} ${className}`}
      {...props}>
      {children}
    </button>
  );
});

const LINEA_CAMPO = "min-h-[40px] w-full border-0 border-b-[1.5px] bg-transparent px-1 text-[18px] text-cuaderno-tinta focus:outline-none";

/**
 * Campo de formulario como renglón subrayado.
 *  as: "input" | "select" | "textarea". Las opciones de un select van como children.
 *  error: mensaje bajo el campo, en tinta roja
 *  ayuda: texto bajo el campo, en grafito
 */
export const Campo = React.forwardRef(function Campo(
  { etiqueta, as = "input", error, ayuda, className = "", children, ...props }, ref
) {
  const Control = as;
  const borde = error ? "border-cuaderno-roja focus:border-cuaderno-roja" : "border-cuaderno-tinta/70 focus:border-cuaderno-tinta";
  return (
    <label className={`flex flex-col gap-0.5 text-sm text-cuaderno-grafito ${className}`}>
      {etiqueta}
      <Control ref={ref} className={`${LINEA_CAMPO} ${borde} ${as === "textarea" ? "resize-none py-1" : ""}`} {...props}>
        {children}
      </Control>
      {error
        ? <span className="text-[13px] text-cuaderno-roja">{error}</span>
        : ayuda && <span className="text-[13px] text-cuaderno-grafito">{ayuda}</span>}
    </label>
  );
});

// ─── Íconos de trazo fino ─────────────────────────────────────────────────────
function Trazo({ tamano = 16, children, className = "" }) {
  return (
    <svg width={tamano} height={tamano} viewBox="0 0 16 16" fill="none" stroke="currentColor"
      strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={`flex-shrink-0 ${className}`}>
      {children}
    </svg>
  );
}
export const IconoCerrar   = (p) => <Trazo {...p}><path d="M3.5 3.5 L12.5 12.5 M12.5 3.5 L3.5 12.5" /></Trazo>;
export const IconoCopiar   = (p) => <Trazo {...p}><path d="M5.5 5.5 h7 v8 h-7 z M3.5 10.5 v-8 h7" /></Trazo>;
export const IconoExterno  = (p) => <Trazo {...p}><path d="M6 3 H3 V13 H13 V10 M9 3 H13 V7 M13 3 L7.5 8.5" /></Trazo>;
export const IconoLapiz    = (p) => <Trazo {...p}><path d="M10.5 2.5 l3 3 L6 13 H3 v-3 z M9 4 l3 3" /></Trazo>;
export const IconoBorrar   = (p) => <Trazo {...p}><path d="M3 4.5 h10 M6.5 4.5 V3 h3 v1.5 M4.5 4.5 l.7 8.5 h5.6 l.7 -8.5" /></Trazo>;
export const IconoBajar    = (p) => <Trazo {...p}><path d="M4 6 L8 10 L12 6" /></Trazo>;
export const IconoMas      = (p) => <Trazo {...p}><path d="M8 3 V13 M3 8 H13" /></Trazo>;
export const IconoBuscar   = (p) => <Trazo {...p}><circle cx="7" cy="7" r="4.2" /><path d="M10.2 10.2 L13.5 13.5" /></Trazo>;
export const IconoNota     = (p) => <Trazo {...p}><path d="M4 5 H12 M4 8 H10 M4 11 H8" /></Trazo>;
export const IconoActualizar = (p) => <Trazo {...p}><path d="M13 8 A5 5 0 1 1 11.5 4.5 M11.5 2 V4.5 H9" /></Trazo>;
export const IconoAnterior   = (p) => <Trazo {...p}><path d="M10 3.5 L5.5 8 L10 12.5" /></Trazo>;
export const IconoSiguiente  = (p) => <Trazo {...p}><path d="M6 3.5 L10.5 8 L6 12.5" /></Trazo>;
export const IconoDocumento  = (p) => <Trazo {...p}><path d="M4 2 H9.5 L12 4.5 V14 H4 Z M9.5 2 V4.5 H12 M6 8 H10 M6 10.5 H10" /></Trazo>;
export const IconoSubir      = (p) => <Trazo {...p}><path d="M8 11 V3 M4.5 6.5 L8 3 L11.5 6.5 M3 13.5 H13" /></Trazo>;

// ─── Hoja de modal ────────────────────────────────────────────────────────────
/**
 * Modal como una tarjeta índice: papel claro, doble línea roja bajo el título.
 *  capa: clase z-index literal ("z-[70]" sobre el panel; "z-[80]" sobre otro modal)
 *  cerrarAlClicFuera: false en formularios largos, para no perder lo escrito
 *  pie: botones de acción
 *
 * Se monta con un portal en <body>. Un ancestro con transform, filter o
 * backdrop-filter (el panel lateral se anima con transform) se vuelve el
 * contenedor de sus hijos position: fixed, y el modal quedaría encerrado en
 * él. Desde <body> siempre cubre la pantalla, se abra desde donde se abra.
 */
export function ModalCuaderno({
  titulo, subtitulo, onClose, pie, children,
  ancho = "max-w-md", capa = "z-[70]", cerrarAlClicFuera = false, bloqueado = false,
}) {
  const idTitulo = useId();
  return createPortal(
    <div className={`fixed inset-0 ${capa} flex items-center justify-center p-4 bg-cuaderno-tinta/30 backdrop-blur-[2px]`}
      onMouseDown={e => { if (cerrarAlClicFuera && !bloqueado && e.target === e.currentTarget) onClose?.(); }}>
      <div role="dialog" aria-modal="true" aria-labelledby={idTitulo}
        className={`cuaderno w-full ${ancho} max-h-[calc(100vh-2rem)] flex flex-col bg-cuaderno-tarjeta border border-cuaderno-columna/70 rounded-md shadow-[0_24px_48px_-20px_rgb(var(--cuaderno-tinta)/0.45)]`}>
        <header className="px-6 pt-4 pb-3 border-b-[3px] border-double border-cuaderno-margen flex items-start justify-between gap-3 flex-shrink-0">
          <div className="min-w-0">
            <Titulo as="h2" tamano="lg" id={idTitulo}>{titulo}</Titulo>
            {subtitulo && <p className="m-0 text-[15px] text-cuaderno-grafito">{subtitulo}</p>}
          </div>
          <Boton variante="icono" aria-label="Cerrar" onClick={onClose} disabled={bloqueado}><IconoCerrar /></Boton>
        </header>
        <div className="px-6 py-5 overflow-y-auto space-y-5">{children}</div>
        {pie && <footer className="px-6 py-4 border-t border-cuaderno-azul flex-shrink-0">{pie}</footer>}
      </div>
    </div>,
    document.body
  );
}

// ─── Selección ────────────────────────────────────────────────────────────────
/**
 * Opciones excluyentes, como casillas de un formulario en papel.
 *  permitirVacio: un segundo clic sobre la opción elegida la desmarca
 */
export function Segmentado({ etiqueta, opciones, valor, onCambiar, permitirVacio = false, className = "" }) {
  return (
    <div className={className}>
      {etiqueta && <div className="text-sm text-cuaderno-grafito mb-1.5">{etiqueta}</div>}
      <div role="radiogroup" aria-label={etiqueta} className="flex flex-wrap gap-2">
        {opciones.map(op => {
          const activa = valor === op.id;
          return (
            <button key={op.id} type="button" role="radio" aria-checked={activa}
              onClick={() => onCambiar(activa && permitirVacio ? "" : op.id)}
              className={`min-h-[40px] px-3.5 rounded-md border-[1.5px] text-[17px] ${FOCO} ${
                activa
                  ? "border-cuaderno-tinta bg-cuaderno-hoja text-cuaderno-tinta"
                  : "border-cuaderno-columna/70 text-cuaderno-grafito hover:border-cuaderno-tinta/60 hover:text-cuaderno-tinta"}`}>
              {activa ? <span className="resaltado resaltado-menta">{op.label}</span> : <span className="px-[0.3em]">{op.label}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Casilla de verificación dibujada a mano: un cuadrado con visto bueno. */
export function Casilla({ marcada, onCambiar, children, descripcion, className = "" }) {
  return (
    <label className={`flex items-start gap-3 cursor-pointer ${className}`}>
      <input type="checkbox" checked={!!marcada} onChange={e => onCambiar(e.target.checked)} className="peer sr-only" />
      <span aria-hidden="true"
        className="mt-0.5 w-6 h-6 flex-shrink-0 rounded-[3px] border-[1.5px] border-cuaderno-tinta bg-cuaderno-tarjeta flex items-center justify-center peer-focus-visible:ring-2 peer-focus-visible:ring-cuaderno-tinta/40">
        {marcada && <VistoBueno tamano={16} titulo="" />}
      </span>
      <span className="min-w-0">
        <span className="block text-[18px] leading-snug text-cuaderno-tinta">{children}</span>
        {descripcion && <span className="block text-[14px] text-cuaderno-grafito">{descripcion}</span>}
      </span>
    </label>
  );
}

// ─── Contenedores ─────────────────────────────────────────────────────────────
/**
 * Hoja: una sección de la pantalla como una hoja suelta sobre el papel.
 *  titulo: encabezado en letra ligada (opcional)
 *  extra:  controles a la derecha del título (búsqueda, filtros, botones)
 */
export function Hoja({ titulo, extra, children, className = "", cuerpo = "px-6 pb-5" }) {
  return (
    <section className={`bg-cuaderno-hoja border border-cuaderno-columna rounded-md ${className}`}>
      {(titulo || extra) && (
        <header className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2 px-6 pt-3 pb-2">
          {titulo && <Titulo as="h2" tamano="md">{titulo}</Titulo>}
          {extra && <div className="flex flex-wrap items-end gap-3">{extra}</div>}
        </header>
      )}
      <div className={cuerpo}>{children}</div>
    </section>
  );
}

/** Paginador de listas largas: "Mostrando 1 a 15 de 40" y flechas. */
export function Paginador({ pagina, totalPaginas, onCambiar, totalItems, porPagina }) {
  if (totalPaginas <= 1) return null;
  const desde = (pagina - 1) * porPagina + 1;
  const hasta = Math.min(pagina * porPagina, totalItems);
  return (
    <div className="flex items-center justify-between gap-3 mt-3 pt-2 border-t border-cuaderno-renglon">
      <p className="m-0 text-[15px] text-cuaderno-grafito">Mostrando {desde} a {hasta} de {totalItems}</p>
      <div className="flex items-center gap-1">
        <Boton variante="icono" className="w-10 h-10 border-cuaderno-columna" aria-label="Página anterior"
          onClick={() => onCambiar(Math.max(1, pagina - 1))} disabled={pagina === 1}>
          <IconoAnterior />
        </Boton>
        <span className="px-2 text-[16px]">{pagina} de {totalPaginas}</span>
        <Boton variante="icono" className="w-10 h-10 border-cuaderno-columna" aria-label="Página siguiente"
          onClick={() => onCambiar(Math.min(totalPaginas, pagina + 1))} disabled={pagina === totalPaginas}>
          <IconoSiguiente />
        </Boton>
      </div>
    </div>
  );
}

/** Pestañas subrayadas, como las del flujo de caja. */
export function Pestanas({ opciones, valor, onCambiar, className = "" }) {
  return (
    <div role="tablist" className={`flex flex-wrap gap-x-6 ${className}`}>
      {opciones.map(op => (
        <button key={op.id} role="tab" aria-selected={valor === op.id} onClick={() => onCambiar(op.id)}
          className={`min-h-[44px] px-0.5 text-[20px] border-b-2 ${FOCO} ${
            valor === op.id ? "border-cuaderno-tinta text-cuaderno-tinta" : "border-transparent text-cuaderno-grafito hover:text-cuaderno-tinta"}`}>
          {op.label}
        </button>
      ))}
    </div>
  );
}

/** Fecha de hoy escrita en la esquina de la hoja: "Sábado 3 de octubre de 2026". */
export function FechaHoja({ className = "" }) {
  const texto = casoOracion(new Date().toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).replace(",", ""));
  return (
    <div className={`flex justify-end text-[16px] text-cuaderno-grafito ${className}`}>
      <span className="border-b border-cuaderno-columna px-1 pb-0.5">{texto}</span>
    </div>
  );
}

// ─── Gráficos ─────────────────────────────────────────────────────────────────
// Dibujados como con lápices de color sobre la hoja. El texto SVG hereda la
// letra del cuaderno desde el CSS.
export function fmtEje(n) {
  const a = Math.abs(n);
  if (a >= 1e9) return (n / 1e9).toFixed(1).replace(".", ",") + "B";
  if (a >= 1e6) return (n / 1e6).toFixed(1).replace(".", ",") + "M";
  if (a >= 1e3) return (n / 1e3).toFixed(0) + "K";
  return String(Math.round(n));
}

/**
 * Barras pareadas de ingresos (menta, contorno verde) y egresos (rosa,
 * contorno rojo). data: [{ label, ingresos, egresos }]
 */
export function GraficoBarras({ data, height = 180, ancho = 620, ticks: nTicks = 3 }) {
  if (!data?.length) {
    return <p className="m-0 flex items-center justify-center text-[16px] text-cuaderno-grafito" style={{ height }}>Sin datos para graficar.</p>;
  }
  const PAD_L = 52, PAD_R = 8, PAD_T = 10, PAD_B = 30;
  const chartW = ancho - PAD_L - PAD_R;
  const chartH = height - PAD_T - PAD_B;
  const maxVal = Math.max(...data.map(d => Math.max(d.ingresos || 0, d.egresos || 0)), 1);
  const ticks  = Array.from({ length: nTicks + 1 }, (_, i) => (maxVal / nTicks) * i);
  const colW = chartW / data.length;
  const barW = Math.max(colW * 0.28, 5);
  const gap  = Math.max(colW * 0.06, 2);
  const toY  = (v) => PAD_T + chartH - ((Math.max(v, 0) / maxVal) * chartH);
  const etiqueta = data.length > 8 ? 12 : 14;

  return (
    <svg viewBox={`0 0 ${ancho} ${height}`} className="w-full" style={{ height, display: "block" }} role="img"
      aria-label={`Ingresos y egresos de ${data.length} períodos`}>
      {ticks.map((t, i) => {
        const y = PAD_T + chartH - (t / maxVal) * chartH;
        return (
          <g key={i}>
            <line x1={PAD_L} y1={y} x2={ancho - PAD_R} y2={y}
              stroke={i === 0 ? "rgb(var(--cuaderno-tinta))" : "rgb(var(--cuaderno-renglon))"}
              strokeWidth={i === 0 ? 1.2 : 1} strokeDasharray={i === 0 ? undefined : "3 4"} />
            <text x={PAD_L - 6} y={y + 4} textAnchor="end" fontSize="12" fill="rgb(var(--cuaderno-grafito))">{fmtEje(t)}</text>
          </g>
        );
      })}
      {data.map((d, i) => {
        const cx = PAD_L + i * colW + colW / 2;
        const baseY = PAD_T + chartH;
        const ih = toY(d.ingresos || 0), eh = toY(d.egresos || 0);
        return (
          <g key={i}>
            {baseY - ih > 0 && <rect x={cx - barW - gap / 2} y={ih} width={barW} height={baseY - ih} rx="1.5"
              fill="rgb(var(--cuaderno-menta))" stroke="rgb(var(--cuaderno-verde))" strokeWidth="1.2" />}
            {baseY - eh > 0 && <rect x={cx + gap / 2} y={eh} width={barW} height={baseY - eh} rx="1.5"
              fill="rgb(var(--cuaderno-rosa))" stroke="rgb(var(--cuaderno-roja))" strokeWidth="1.2" />}
            <text x={cx} y={baseY + 19} textAnchor="middle" fontSize={etiqueta} fill="rgb(var(--cuaderno-tinta))">{d.label}</text>
          </g>
        );
      })}
    </svg>
  );
}

/** Línea trazada a pluma, con puntos huecos. data: [{ label, value }] */
export function GraficoLinea({ data, height = 140, ancho = 700 }) {
  if (!data?.length) {
    return <p className="m-0 flex items-center justify-center text-[16px] text-cuaderno-grafito" style={{ height }}>Sin datos para graficar.</p>;
  }
  const PAD_L = 52, PAD_R = 12, PAD_T = 12, PAD_B = 28;
  const chartW = ancho - PAD_L - PAD_R;
  const chartH = height - PAD_T - PAD_B;
  const vals = data.map(d => d.value || 0);
  const maxV = Math.max(...vals, 1), minV = Math.min(...vals, 0);
  const rango = maxV - minV || 1;
  const ticks = Array.from({ length: 4 }, (_, i) => minV + i * ((maxV - minV) / 3));
  const toX = (i) => PAD_L + (i / Math.max(data.length - 1, 1)) * chartW;
  const toY = (v) => PAD_T + chartH - ((v - minV) / rango) * chartH;
  const negativa = vals.some(v => v < 0);
  const trazo = negativa ? "rgb(var(--cuaderno-roja))" : "rgb(var(--cuaderno-tinta))";

  return (
    <svg viewBox={`0 0 ${ancho} ${height}`} className="w-full" style={{ height, display: "block" }} role="img"
      aria-label={`Proyección de ${data.length} períodos`}>
      {ticks.map((t, i) => {
        const y = toY(t);
        return (
          <g key={i}>
            <line x1={PAD_L} y1={y} x2={ancho - PAD_R} y2={y}
              stroke={i === 0 ? "rgb(var(--cuaderno-tinta))" : "rgb(var(--cuaderno-renglon))"}
              strokeWidth={i === 0 ? 1.2 : 1} strokeDasharray={i === 0 ? undefined : "3 4"} />
            <text x={PAD_L - 6} y={y + 4} textAnchor="end" fontSize="12" fill="rgb(var(--cuaderno-grafito))">{fmtEje(t)}</text>
          </g>
        );
      })}
      {minV < 0 && maxV > 0 && (
        <line x1={PAD_L} y1={toY(0)} x2={ancho - PAD_R} y2={toY(0)} stroke="rgb(var(--cuaderno-margen))" strokeWidth="1" />
      )}
      <polyline points={vals.map((v, i) => `${toX(i)},${toY(v)}`).join(" ")} fill="none" stroke={trazo}
        strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
      {data.map((d, i) => (
        <g key={i}>
          <circle cx={toX(i)} cy={toY(vals[i])} r="3.5" fill="rgb(var(--cuaderno-hoja))" stroke={trazo} strokeWidth="1.6" />
          <text x={toX(i)} y={PAD_T + chartH + 18} textAnchor="middle" fontSize="14" fill="rgb(var(--cuaderno-tinta))">{d.label}</text>
        </g>
      ))}
    </svg>
  );
}

/** Proporción como trazo de resaltador lavanda. */
export function BarraProporcion({ pct, className = "" }) {
  return (
    <div className={`mt-1 h-2.5 bg-cuaderno-renglon/60 rounded-sm overflow-hidden ${className}`}>
      <div className="h-full bg-cuaderno-lavanda rounded-sm" style={{ width: `${Math.max(0, Math.min(100, pct || 0))}%` }} />
    </div>
  );
}

/** Marca escrita de un aviso según su urgencia: danger, warning o info. */
export function MarcaAviso({ tipo }) {
  if (tipo === "danger")  return <Resaltado color="rosa" className="text-[14px]">urgente</Resaltado>;
  if (tipo === "warning") return <Resaltado color="durazno" className="text-[14px]">pronto</Resaltado>;
  return <span className="text-[14px] text-cuaderno-grafito px-[0.3em]">nota</span>;
}
