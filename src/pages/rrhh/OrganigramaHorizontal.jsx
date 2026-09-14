/**
 * OrganigramaHorizontal.jsx — src/pages/rrhh/OrganigramaHorizontal.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Organigrama en árbol horizontal: la jerarquía crece de izquierda a derecha,
 * un nivel por columna, con líneas que conectan a cada jefe con su equipo.
 *
 * La vista indentada sirve para recorrer una rama, pero no deja ver la forma
 * de la organización: cuántos niveles hay, quién tiene tramo de control ancho,
 * dónde la estructura se hace profunda. Eso solo se ve extendido.
 *
 * El árbol se arma desde `jefeDirectoId`, el vínculo real entre fichas. El
 * campo de texto `jefeDirecto` no sirve para esto: dos personas pueden escribir
 * el mismo nombre distinto y la rama se parte.
 *
 * Incluye la exportación a PDF en A3 apaisado, que es donde una estructura de
 * 60 personas cabe sin quedar ilegible.
 */

import { useState, useMemo } from 'react';

const nombreDe   = t => [t?.nombre, t?.apellidoPaterno].filter(Boolean).join(' ');
const inicialesDe = t => `${t?.nombre?.[0] || ''}${t?.apellidoPaterno?.[0] || ''}`.toUpperCase();
const fmtM = n => `$${Math.round(n || 0).toLocaleString('es-CL')}`;

/**
 * Índice jefe → equipo. Un jefe inactivo o inexistente se trata como sin jefe
 * para que su equipo no desaparezca del organigrama, y la auto-jefatura se
 * descarta porque generaría un ciclo de un solo nodo.
 */
export function construirArbol(activos) {
  const ids = new Set(activos.map(t => t.id));
  const jefeDe = (t) =>
    t.jefeDirectoId && ids.has(t.jefeDirectoId) && t.jefeDirectoId !== t.id
      ? t.jefeDirectoId : null;

  const hijos = {};
  activos.forEach(t => {
    const jid = jefeDe(t) || '__raiz__';
    (hijos[jid] = hijos[jid] || []).push(t);
  });
  Object.values(hijos).forEach(a => a.sort((x, y) => nombreDe(x).localeCompare(nombreDe(y))));

  // Si dos personas se declaran jefe la una de la otra, ninguna queda como raíz
  // y toda esa rama desaparece del organigrama. Detectar el ciclo al dibujar no
  // basta: nunca se llega a ella. Acá se recorre desde las raíces y quien quede
  // fuera se promueve, rompiendo el ciclo en su integrante alfabéticamente
  // primero. Es arbitrario, pero mostrar el dato mal vinculado es mejor que
  // perderlo en silencio: así se ve y se corrige.
  const alcanzados = new Set();
  const recorrer = (id) => {
    (hijos[id] || []).forEach(h => {
      if (alcanzados.has(h.id)) return;
      alcanzados.add(h.id);
      recorrer(h.id);
    });
  };
  recorrer('__raiz__');

  const huerfanos = activos
    .filter(t => !alcanzados.has(t.id))
    .sort((a, b) => nombreDe(a).localeCompare(nombreDe(b)));

  huerfanos.forEach(t => {
    if (alcanzados.has(t.id)) return;
    (hijos.__raiz__ = hijos.__raiz__ || []).push(t);
    alcanzados.add(t.id);
    recorrer(t.id);
  });

  return { hijos, raices: hijos.__raiz__ || [], jefeDe, enCiclo: huerfanos };
}

/** Profundidad máxima del árbol. `vistos` corta ciclos A→B→A. */
export function profundidad(hijos, id = '__raiz__', vistos = new Set()) {
  if (vistos.has(id)) return 0;
  const v = new Set(vistos).add(id);
  const lista = hijos[id] || [];
  if (!lista.length) return 0;
  return 1 + Math.max(...lista.map(h => profundidad(hijos, h.id, v)));
}

// ─────────────────────────────────────────────────────────────────────────────
// Vista en pantalla
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Cada nodo es una fila: la tarjeta de la persona a la izquierda y su equipo
 * apilado a la derecha. Las líneas se dibujan con bordes en vez de SVG para que
 * se reacomoden solas al colapsar una rama.
 */
function NodoH({ t, hijos, datosDe, colores, verSueldos, colapsados, toggle, vistos, esUltimo, esRaiz }) {
  if (vistos.has(t.id)) return null;
  const nuevos = new Set(vistos).add(t.id);

  const equipo = hijos[t.id] || [];
  const abierto = !colapsados[t.id];
  const { base, liquido, esReal, periodo } = datosDe(t);
  const color = colores[t.area] || { bg: '#7c3aed', light: '#f5f3ff', text: '#4c1d95' };

  return (
    <div className="flex items-stretch">

      {/* Conector con el jefe */}
      {!esRaiz && (
        <div className="relative w-8 flex-shrink-0">
          {/* Tramo vertical: se corta a la mitad en el último hermano */}
          <span className="absolute left-0 w-px bg-slate-200"
            style={{ top: 0, height: esUltimo ? '2.25rem' : '100%' }} aria-hidden />
          <span className="absolute left-0 h-px bg-slate-200"
            style={{ top: '2.25rem', width: '100%' }} aria-hidden />
        </div>
      )}

      <div className="flex items-start">
        {/* Tarjeta */}
        <div className="my-1.5 w-[248px] flex-shrink-0 rounded-xl border bg-white px-3 py-2.5 shadow-sm"
          style={{ borderColor: color.bg + '33' }}>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-[11px] font-black flex-shrink-0"
              style={{ background: color.bg }}>
              {inicialesDe(t)}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-bold text-slate-800 truncate" title={nombreDe(t)}>
                {nombreDe(t)}
              </p>
              <p className="text-[10px] font-semibold truncate" style={{ color: color.text }}
                title={t.cargo}>
                {t.cargo || 'Sin cargo'}
              </p>
            </div>
            {equipo.length > 0 && (
              <button onClick={() => toggle(t.id)}
                className="w-5 h-5 rounded-md flex items-center justify-center text-slate-400 hover:bg-slate-100 flex-shrink-0"
                title={abierto ? 'Contraer equipo' : `Expandir ${equipo.length}`}>
                <span className="text-[11px] font-black">{abierto ? '−' : equipo.length}</span>
              </button>
            )}
          </div>

          {verSueldos && (
            <div className="mt-2 pt-2 border-t border-slate-100 flex items-baseline justify-between">
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">
                Base {fmtM(base)}
              </span>
              <span className={`text-[11px] font-black ${esReal ? 'text-emerald-600' : 'text-slate-400'}`}
                title={esReal ? `Líquido real · ${periodo}` : 'Estimado desde el contrato'}>
                {fmtM(liquido)}
              </span>
            </div>
          )}
        </div>

        {/* Equipo */}
        {abierto && equipo.length > 0 && (
          <div className="flex flex-col justify-center">
            {equipo.map((h, i) => (
              <NodoH key={h.id} t={h} hijos={hijos} datosDe={datosDe} colores={colores}
                verSueldos={verSueldos} colapsados={colapsados} toggle={toggle}
                vistos={nuevos} esUltimo={i === equipo.length - 1} esRaiz={false} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function OrganigramaHorizontal({ activos, datosDe, colores, verSueldos }) {
  const [colapsados, setColapsados] = useState({});
  const [zoom, setZoom] = useState(1);

  const { hijos, raices } = useMemo(() => construirArbol(activos), [activos]);
  const niveles = useMemo(() => profundidad(hijos), [hijos]);

  const toggle = (id) => setColapsados(c => ({ ...c, [id]: !c[id] }));

  const colapsarTodo = () => {
    // Colapsa solo a quienes tienen equipo: marcar hojas no cambia nada y
    // dejaría el estado lleno de ruido.
    const m = {};
    Object.keys(hijos).forEach(k => { if (k !== '__raiz__') m[k] = true; });
    setColapsados(m);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">
          {niveles} {niveles === 1 ? 'nivel' : 'niveles'} · {raices.length} en la cúspide
        </p>
        <div className="flex items-center gap-1.5">
          <button onClick={() => setZoom(z => Math.max(0.5, z - 0.1))}
            className="w-7 h-7 rounded-lg text-sm font-black bg-slate-100 hover:bg-slate-200 text-slate-600">−</button>
          <span className="text-[11px] font-bold text-slate-500 w-10 text-center">{Math.round(zoom * 100)}%</span>
          <button onClick={() => setZoom(z => Math.min(1.4, z + 0.1))}
            className="w-7 h-7 rounded-lg text-sm font-black bg-slate-100 hover:bg-slate-200 text-slate-600">+</button>
          <button onClick={colapsarTodo}
            className="ml-1 px-3 py-1.5 rounded-lg text-[11px] font-bold bg-slate-100 hover:bg-slate-200 text-slate-600">
            Contraer todo
          </button>
          <button onClick={() => setColapsados({})}
            className="px-3 py-1.5 rounded-lg text-[11px] font-bold bg-slate-100 hover:bg-slate-200 text-slate-600">
            Expandir todo
          </button>
        </div>
      </div>

      {/* El árbol se desborda a lo ancho a propósito: comprimirlo para que
          quepa haría ilegibles los nombres, que es justo lo que se viene a ver. */}
      <div className="overflow-auto rounded-xl border border-slate-100 bg-slate-50/40 p-4"
        style={{ maxHeight: '70vh' }}>
        <div style={{ transform: `scale(${zoom})`, transformOrigin: 'top left', width: 'max-content' }}>
          {raices.map(t => (
            <NodoH key={t.id} t={t} hijos={hijos} datosDe={datosDe} colores={colores}
              verSueldos={verSueldos} colapsados={colapsados} toggle={toggle}
              vistos={new Set()} esUltimo esRaiz />
          ))}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PDF
// ─────────────────────────────────────────────────────────────────────────────

const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * Organigrama en HTML para imprimir. Se genera como documento y se abre con
 * `window.print()`, igual que el resto de pdfs.jsx: el texto queda vectorial y
 * seleccionable, a diferencia de rasterizar con html2canvas, que en un árbol de
 * nombres pequeños se ve borroso al ampliar.
 *
 * A3 apaisado: una estructura de 60 personas en A4 obliga a una escala en que
 * los cargos dejan de leerse.
 */
export function generarPDFOrganigrama(activos, { empresa, datosDe, colores = {}, verSueldos = true } = {}) {
  const { hijos, raices } = construirArbol(activos);
  const niveles = profundidad(hijos);

  const tarjeta = (t) => {
    const c = colores[t.area] || { bg: '#7c3aed', text: '#4c1d95' };
    const d = datosDe ? datosDe(t) : {};
    return `
      <div class="card" style="border-color:${c.bg}33">
        <div class="row">
          <div class="ini" style="background:${c.bg}">${esc(inicialesDe(t))}</div>
          <div class="txt">
            <p class="nom">${esc(nombreDe(t))}</p>
            <p class="cargo" style="color:${c.text}">${esc(t.cargo || 'Sin cargo')}</p>
          </div>
        </div>
        ${verSueldos && d.liquido ? `
          <div class="money">
            <span class="base">Base ${esc(fmtM(d.base))}</span>
            <span class="liq ${d.esReal ? 'real' : 'est'}">${esc(fmtM(d.liquido))}</span>
          </div>` : ''}
      </div>`;
  };

  const nodo = (t, vistos, esUltimo, esRaiz) => {
    if (vistos.has(t.id)) return '';
    const nuevos = new Set(vistos).add(t.id);
    const equipo = hijos[t.id] || [];
    return `
      <div class="nodo">
        ${esRaiz ? '' : `<div class="link ${esUltimo ? 'last' : ''}"></div>`}
        <div class="fila">
          ${tarjeta(t)}
          ${equipo.length ? `<div class="equipo">${
            equipo.map((h, i) => nodo(h, nuevos, i === equipo.length - 1, false)).join('')
          }</div>` : ''}
        </div>
      </div>`;
  };

  const hoy = new Date().toLocaleDateString('es-CL', { day: '2-digit', month: 'long', year: 'numeric' });

  const html = `<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8">
<title>Organigrama — ${esc(empresa?.nombre || '')}</title>
<style>
  @page { size: A3 landscape; margin: 12mm; }
  * { box-sizing: border-box; }
  body { margin:0; font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
         color:#0f172a; -webkit-print-color-adjust:exact; print-color-adjust:exact; }

  header { display:flex; align-items:flex-end; justify-content:space-between;
           padding-bottom:10px; margin-bottom:18px; border-bottom:2px solid #1e1b4b; }
  h1 { margin:0; font-size:21px; font-weight:800; letter-spacing:-.02em; }
  .sub { margin:3px 0 0; font-size:11px; color:#64748b; font-weight:600; }
  .meta { text-align:right; font-size:10px; color:#94a3b8; line-height:1.5; }
  .meta b { color:#475569; }

  .nodo { display:flex; align-items:stretch; }
  .fila { display:flex; align-items:flex-start; }
  .equipo { display:flex; flex-direction:column; justify-content:center; }

  /* Conectores: vertical desde el jefe + horizontal hacia la tarjeta.
     En el último hermano el vertical se corta a la altura del enganche. */
  .link { position:relative; width:26px; flex:0 0 26px; }
  .link::before { content:''; position:absolute; left:0; top:0; bottom:0; width:1px; background:#cbd5e1; }
  .link.last::before { bottom:auto; height:30px; }
  .link::after { content:''; position:absolute; left:0; top:30px; width:100%; height:1px; background:#cbd5e1; }

  .card { width:210px; flex:0 0 210px; margin:5px 0; padding:7px 9px;
          border:1px solid; border-radius:9px; background:#fff; page-break-inside:avoid; }
  .row { display:flex; align-items:center; gap:7px; }
  .ini { width:26px; height:26px; flex:0 0 26px; border-radius:7px; color:#fff;
         font-size:9.5px; font-weight:800; display:flex; align-items:center; justify-content:center; }
  .txt { min-width:0; }
  .nom { margin:0; font-size:11px; font-weight:700; white-space:nowrap;
         overflow:hidden; text-overflow:ellipsis; }
  .cargo { margin:1px 0 0; font-size:8.5px; font-weight:600; white-space:nowrap;
           overflow:hidden; text-overflow:ellipsis; }
  .money { display:flex; justify-content:space-between; align-items:baseline;
           margin-top:5px; padding-top:5px; border-top:1px solid #f1f5f9; }
  .base { font-size:8px; font-weight:700; color:#94a3b8; letter-spacing:.04em; }
  .liq { font-size:10px; font-weight:800; }
  .liq.real { color:#059669; }
  .liq.est  { color:#94a3b8; }

  footer { margin-top:20px; padding-top:8px; border-top:1px solid #e2e8f0;
           display:flex; justify-content:space-between; font-size:9px; color:#94a3b8; }
</style></head>
<body>
  <header>
    <div>
      <h1>Organigrama</h1>
      <p class="sub">${esc(empresa?.nombre || 'Estructura organizacional')}</p>
    </div>
    <div class="meta">
      <div><b>${activos.length}</b> personas · <b>${niveles}</b> ${niveles === 1 ? 'nivel' : 'niveles'}</div>
      <div>Emitido el ${esc(hoy)}</div>
    </div>
  </header>

  ${raices.map(t => nodo(t, new Set(), true, true)).join('')}

  <footer>
    <span>${esc(empresa?.nombre || '')}${empresa?.rut ? ` · ${esc(empresa.rut)}` : ''}</span>
    <span>FleetCore · Recursos Humanos</span>
  </footer>

  <script>window.onload=function(){window.print();}</script>
</body></html>`;

  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const win  = window.open(url, '_blank');
  if (!win) alert('Permite ventanas emergentes para descargar el organigrama.');
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
