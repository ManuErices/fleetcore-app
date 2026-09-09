/**
 * OrganigramaVertical.jsx — src/pages/rrhh/OrganigramaVertical.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Organigrama clásico: la cúspide arriba y cada nivel colgando hacia abajo,
 * con la barra horizontal que reparte a los subordinados de un mismo jefe.
 *
 * La vista indentada sirve para recorrer una rama, pero no deja ver la forma de
 * la organización: cuántos niveles hay, quién tiene un tramo de control ancho,
 * dónde la estructura se vuelve profunda. Eso solo se ve en el árbol extendido.
 *
 * El árbol se arma desde `jefeDirectoId`, el vínculo real entre fichas. El
 * campo de texto `jefeDirecto` no sirve: dos personas escriben el mismo nombre
 * distinto y la rama se parte.
 *
 * Los conectores son bordes CSS y no SVG, así que se reacomodan solos al
 * colapsar una rama o cambiar el zoom, sin recalcular coordenadas. El mismo
 * CSS alimenta la pantalla y el PDF — una sola fuente para ambos.
 */

import { useState, useMemo } from 'react';

const nombreDe    = t => [t?.nombre, t?.apellidoPaterno].filter(Boolean).join(' ');
const inicialesDe = t => `${t?.nombre?.[0] || ''}${t?.apellidoPaterno?.[0] || ''}`.toUpperCase();
const fmtM = n => `$${Math.round(n || 0).toLocaleString('es-CL')}`;

// ─────────────────────────────────────────────────────────────────────────────
// Árbol
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Índice jefe → equipo. Un jefe inactivo o inexistente se trata como sin jefe
 * para que su equipo no desaparezca, y la auto-jefatura se descarta porque
 * generaría un ciclo de un solo nodo.
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
  // y toda esa rama desaparece. Cortar el ciclo al dibujar no basta: nunca se
  // llega a ella. Acá se recorre desde las raíces y quien quede fuera se
  // promueve, rompiendo el ciclo en su integrante alfabéticamente primero. Es
  // arbitrario, pero mostrar el dato mal vinculado es mejor que perderlo en
  // silencio: así se ve y se corrige.
  const alcanzados = new Set();
  const recorrer = (id) => {
    (hijos[id] || []).forEach(h => {
      if (alcanzados.has(h.id)) return;
      alcanzados.add(h.id);
      recorrer(h.id);
    });
  };
  recorrer('__raiz__');

  const enCiclo = activos
    .filter(t => !alcanzados.has(t.id))
    .sort((a, b) => nombreDe(a).localeCompare(nombreDe(b)));

  enCiclo.forEach(t => {
    if (alcanzados.has(t.id)) return;
    (hijos.__raiz__ = hijos.__raiz__ || []).push(t);
    alcanzados.add(t.id);
    recorrer(t.id);
  });

  return { hijos, raices: hijos.__raiz__ || [], jefeDe, enCiclo };
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
// Conectores
// ─────────────────────────────────────────────────────────────────────────────
//
// Cada hijo dibuja la mitad izquierda de la barra con ::before y la mitad
// derecha más su bajada con ::after. El primero omite su mitad izquierda y el
// último su mitad derecha, y así la barra empieza y termina exactamente sobre
// los hijos de los extremos en vez de sobresalir. Con un solo hijo queda la
// bajada recta, sin barra.

export const CSS_ORGANIGRAMA = `
  .fc-nodo { display:flex; flex-direction:column; align-items:center; position:relative; }
  .fc-stub { width:1px; height:20px; background:#cbd5e1; flex:0 0 20px; }
  .fc-hijos { display:flex; justify-content:center; align-items:flex-start; }
  .fc-hijos > .fc-nodo { padding:20px 9px 0; }
  .fc-hijos > .fc-nodo::before,
  .fc-hijos > .fc-nodo::after {
    content:''; position:absolute; top:0; height:20px; width:50%;
    border-top:1px solid #cbd5e1;
  }
  .fc-hijos > .fc-nodo::before { right:50%; }
  .fc-hijos > .fc-nodo::after  { left:50%; border-left:1px solid #cbd5e1; }
  .fc-hijos > .fc-nodo:first-child::before { border-top:0; }
  .fc-hijos > .fc-nodo:last-child::after   { border-top:0; }
  .fc-hijos > .fc-nodo:only-child::before  { display:none; }
  .fc-hijos > .fc-nodo:only-child::after   { border-top:0; }
`;

// ─────────────────────────────────────────────────────────────────────────────
// Vista en pantalla
// ─────────────────────────────────────────────────────────────────────────────

function NodoV({ t, hijos, datosDe, colores, verSueldos, colapsados, toggle, vistos }) {
  if (vistos.has(t.id)) return null;
  const nuevos = new Set(vistos).add(t.id);

  const equipo  = hijos[t.id] || [];
  const abierto = !colapsados[t.id];
  const { base, liquido, esReal, periodo } = datosDe(t);
  const color = colores[t.area] || { bg: '#7c3aed', light: '#f5f3ff', text: '#4c1d95' };

  return (
    <div className="fc-nodo">
      <div className="w-[212px] rounded-xl border bg-white px-3 py-2.5 shadow-sm"
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
            <p className="text-[10px] font-semibold truncate" style={{ color: color.text }} title={t.cargo}>
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

      {abierto && equipo.length > 0 && (
        <>
          <div className="fc-stub" />
          <div className="fc-hijos">
            {equipo.map(h => (
              <NodoV key={h.id} t={h} hijos={hijos} datosDe={datosDe} colores={colores}
                verSueldos={verSueldos} colapsados={colapsados} toggle={toggle} vistos={nuevos} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default function OrganigramaVertical({ activos, datosDe, colores, verSueldos }) {
  const [colapsados, setColapsados] = useState({});
  const [zoom, setZoom] = useState(0.9);

  const { hijos, raices } = useMemo(() => construirArbol(activos), [activos]);
  const niveles = useMemo(() => profundidad(hijos), [hijos]);

  const toggle = (id) => setColapsados(c => ({ ...c, [id]: !c[id] }));

  const contraerTodo = () => {
    // Solo a quienes tienen equipo: marcar hojas no cambia nada y dejaría el
    // estado lleno de ruido.
    const m = {};
    Object.keys(hijos).forEach(k => { if (k !== '__raiz__') m[k] = true; });
    setColapsados(m);
  };

  return (
    <div className="space-y-3">
      <style>{CSS_ORGANIGRAMA}</style>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">
          {niveles} {niveles === 1 ? 'nivel' : 'niveles'} · {raices.length} en la cúspide
        </p>
        <div className="flex items-center gap-1.5">
          <button onClick={() => setZoom(z => Math.max(0.35, z - 0.1))}
            className="w-7 h-7 rounded-lg text-sm font-black bg-slate-100 hover:bg-slate-200 text-slate-600">−</button>
          <span className="text-[11px] font-bold text-slate-500 w-10 text-center">{Math.round(zoom * 100)}%</span>
          <button onClick={() => setZoom(z => Math.min(1.4, z + 0.1))}
            className="w-7 h-7 rounded-lg text-sm font-black bg-slate-100 hover:bg-slate-200 text-slate-600">+</button>
          <button onClick={contraerTodo}
            className="ml-1 px-3 py-1.5 rounded-lg text-[11px] font-bold bg-slate-100 hover:bg-slate-200 text-slate-600">
            Contraer todo
          </button>
          <button onClick={() => setColapsados({})}
            className="px-3 py-1.5 rounded-lg text-[11px] font-bold bg-slate-100 hover:bg-slate-200 text-slate-600">
            Expandir todo
          </button>
        </div>
      </div>

      {/* Se desborda a lo ancho a propósito: encogerlo hasta que quepa dejaría
          los nombres ilegibles, que es justo lo que se viene a ver. Para eso
          está el zoom, que es una decisión de quien mira. */}
      <div className="overflow-auto rounded-xl border border-slate-100 bg-slate-50/40 p-6"
        style={{ maxHeight: '72vh' }}>
        <div style={{ transform: `scale(${zoom})`, transformOrigin: 'top center', width: 'max-content', margin: '0 auto' }}>
          <div className="flex items-start justify-center gap-6">
            {raices.map(t => (
              <NodoV key={t.id} t={t} hijos={hijos} datosDe={datosDe} colores={colores}
                verSueldos={verSueldos} colapsados={colapsados} toggle={toggle} vistos={new Set()} />
            ))}
          </div>
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
 * seleccionable. Rasterizarlo con html2canvas dejaría los cargos en 8px
 * borrosos al ampliar.
 *
 * A3 apaisado: un árbol vertical se ensancha rápido, y una estructura de 60
 * personas en A4 obliga a una escala donde los cargos dejan de leerse.
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

  const nodo = (t, vistos) => {
    if (vistos.has(t.id)) return '';
    const nuevos = new Set(vistos).add(t.id);
    const equipo = hijos[t.id] || [];
    return `
      <div class="fc-nodo">
        ${tarjeta(t)}
        ${equipo.length ? `
          <div class="fc-stub"></div>
          <div class="fc-hijos">${equipo.map(h => nodo(h, nuevos)).join('')}</div>` : ''}
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
           padding-bottom:10px; margin-bottom:22px; border-bottom:2px solid #1e1b4b; }
  h1 { margin:0; font-size:21px; font-weight:800; letter-spacing:-.02em; }
  .sub { margin:3px 0 0; font-size:11px; color:#64748b; font-weight:600; }
  .meta { text-align:right; font-size:10px; color:#94a3b8; line-height:1.5; }
  .meta b { color:#475569; }

  .raices { display:flex; align-items:flex-start; justify-content:center; gap:22px; }
${CSS_ORGANIGRAMA}
  .card { width:186px; padding:6px 8px; border:1px solid; border-radius:9px;
          background:#fff; page-break-inside:avoid; break-inside:avoid; }
  .row { display:flex; align-items:center; gap:6px; }
  .ini { width:24px; height:24px; flex:0 0 24px; border-radius:6px; color:#fff;
         font-size:9px; font-weight:800; display:flex; align-items:center; justify-content:center; }
  .txt { min-width:0; }
  .nom { margin:0; font-size:10.5px; font-weight:700; white-space:nowrap;
         overflow:hidden; text-overflow:ellipsis; }
  .cargo { margin:1px 0 0; font-size:8px; font-weight:600; white-space:nowrap;
           overflow:hidden; text-overflow:ellipsis; }
  .money { display:flex; justify-content:space-between; align-items:baseline;
           margin-top:4px; padding-top:4px; border-top:1px solid #f1f5f9; }
  .base { font-size:7.5px; font-weight:700; color:#94a3b8; letter-spacing:.04em; }
  .liq { font-size:9.5px; font-weight:800; }
  .liq.real { color:#059669; }
  .liq.est  { color:#94a3b8; }

  footer { margin-top:24px; padding-top:8px; border-top:1px solid #e2e8f0;
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

  <div class="raices">${raices.map(t => nodo(t, new Set())).join('')}</div>

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
