import React, { useState, useEffect } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import UserMenuDropdown from './UserMenuDropdown';
import { useEmpresa } from '../lib/useEmpresa';

/**
 * Shell de aplicación: barra lateral + contenido. Lo comparten los módulos
 * (RRHH, Finanzas, …) para que moverse entre ellos no se sienta como cambiar
 * de aplicación.
 *
 * Todo lo que antes vivía en una barra superior —marca, empresa activa, menú
 * de usuario— se mudó a la barra lateral, que es el patrón de FinanzasApp. Eso
 * devuelve unos 60px de alto en cada pantalla: con tablas de sesenta filas, esa
 * franja es una fila y media que se ve sin desplazar.
 *
 * props:
 *   navGroups   [{ label, tabs: [{ id, label, icon (path d), badge? }] }]
 *   basePath    "/rrhh"
 *   marca       { titulo, resalte, subtitulo, logoSrc?, iconoPath?, gradiente? }
 *   headerSlot  nodo opcional bajo la empresa (filtro de proyecto, etc.)
 *   footerSlot  nodo opcional sobre el menú de usuario (campana, etc.)
 *   variante    "default" | "cuaderno". "cuaderno" es el diseño de Finanzas:
 *               la barra se dibuja como los separadores de un archivador y la
 *               pestaña activa se une con la hoja. Sin la prop, todo queda
 *               exactamente como siempre para el resto de los módulos.
 *   user, userRole, onLogout, onBackToSelector, onAdminPanel, onAdminEmpresaPanel
 *
 * La decisión desktop-vs-mobile se hace en JS por window.innerWidth y NO con
 * `hidden md:flex`: en algunos builds el orden de utilidades de Tailwind se
 * invierte y `.hidden` gana en todo ancho, dejando la barra invisible sin
 * forma de abrirla. Con estado propio siempre hay botón para mostrar/ocultar.
 *
 * En ESCRITORIO la barra tiene dos anchos en vez de dos estados: expandida
 * (256px) o riel de iconos (64px). Nunca desaparece, así que la navegación
 * sigue a un clic. En MÓVIL es un cajón sobre el contenido: un riel fijo en un
 * teléfono se come un tercio del ancho útil, lo contrario de lo que se busca.
 */
const BREAKPOINT = 768;
const ANCHO_EXPANDIDA = 256;
const ANCHO_RIEL = 64;
const LS_RIEL = 'fleetcore.nav.riel';

const MARCA_DEFAULT = {
  titulo: 'Fleet',
  resalte: 'Core',
  subtitulo: '',
  gradiente: 'linear-gradient(135deg,#7c3aed,#4f46e5)',
  iconoPath: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z',
};

export default function AppShellLayout({
  navGroups, basePath,
  activeId, onSelect, children,
  marca = MARCA_DEFAULT,
  headerSlot, footerSlot,
  variante = 'default',
  user, userRole, onLogout, onBackToSelector, onAdminPanel, onAdminEmpresaPanel,
}) {
  // Variante "cuaderno" (Finanzas). Cada punto donde difiere del diseño por
  // defecto pregunta por esta bandera; el camino por defecto no cambió.
  const cuaderno = variante === 'cuaderno';
  // Dos modos de navegación, porque los módulos no llegaron todos al mismo
  // tiempo a react-router:
  //
  //   · router     — NavLink + Outlet. La URL es el estado (RRHH).
  //   · controlado — botones + `children`. El módulo mantiene su `activeView`
  //                  (Finanzas, Contabilidad).
  //
  // El modo controlado existe para poder unificar el aspecto HOY sin reescribir
  // la navegación de cada módulo. Migrar a router después es deseable —hoy no
  // se puede compartir el link de "Deuda"— pero es otro cambio, y mezclarlos
  // haría imposible saber cuál rompió qué.
  const controlado = typeof onSelect === 'function';
  const m = { ...MARCA_DEFAULT, ...marca };
  const { empresa } = useEmpresa();

  const getDesktop = () => (typeof window !== 'undefined' ? window.innerWidth >= BREAKPOINT : true);
  const [isDesktop, setIsDesktop] = useState(getDesktop);
  const [open, setOpen] = useState(false);   // solo gobierna el cajón móvil

  // El ancho elegido se recuerda entre sesiones: quien trabaja con el riel no
  // tiene por qué volver a colapsarlo cada vez que entra.
  const [riel, setRiel] = useState(() => {
    try { return localStorage.getItem(LS_RIEL) === '1'; } catch { return false; }
  });
  useEffect(() => {
    try { localStorage.setItem(LS_RIEL, riel ? '1' : '0'); } catch { /* modo privado */ }
  }, [riel]);

  useEffect(() => {
    const onResize = () => {
      const desktop = getDesktop();
      setIsDesktop(desktop);
      if (desktop) setOpen(false);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // El riel solo aplica en escritorio: el cajón móvil siempre va completo.
  const compacto = isDesktop && riel;

  // En el cuaderno la marca va escrita en letra ligada, sin logo de color:
  // un isotipo violeta con degradado rompería la hoja.
  const logo = cuaderno ? (
    <div className="min-w-0">
      {compacto ? (
        <span className="font-ligada font-light text-[26px] leading-[1.5] text-cuaderno-tinta" title={`${m.titulo}${m.resalte}`}>
          {(m.titulo || 'F')[0]}
        </span>
      ) : (
        <>
          <div className="font-ligada font-light text-[22px] leading-[1.5] text-cuaderno-tinta truncate">{m.titulo}{m.resalte}</div>
          {/* El módulo va pasado con destacador durazno, el color que en el
              cuaderno marca "lo actual": dice en qué módulo se está. */}
          {m.subtitulo && <div className="font-manuscrita text-[19px] leading-tight text-cuaderno-tinta truncate mt-0.5"><span className="resaltado resaltado-durazno">{m.subtitulo}</span></div>}
        </>
      )}
    </div>
  ) : (
    <div className="flex items-center gap-2.5 min-w-0">
      {m.logoSrc ? (
        <img src={m.logoSrc} alt={`${m.titulo}${m.resalte}`} className="h-9 w-auto object-contain flex-shrink-0" />
      ) : (
        <div className="w-9 h-9 rounded-xl flex items-center justify-center shadow flex-shrink-0"
          style={{ background: m.gradiente }}>
          <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d={m.iconoPath} />
          </svg>
        </div>
      )}
      {!compacto && (
        <div className="min-w-0">
          <div className="text-sm font-black text-slate-800 leading-tight truncate">
            {m.titulo}<span className="text-purple-700">{m.resalte}</span>
          </div>
          {m.subtitulo && (
            <div className="text-[9px] font-bold tracking-widest text-slate-400 uppercase leading-tight truncate">
              {m.subtitulo}
            </div>
          )}
        </div>
      )}
    </div>
  );

  const cabecera = (
    <div className={`border-b flex-shrink-0 ${cuaderno ? 'border-cuaderno-columna/50' : 'border-slate-100'} ${compacto ? 'px-2 py-3' : 'px-4 py-3'}`}>
      <div className={`flex items-center ${compacto ? 'justify-center' : 'justify-between gap-2'}`}>
        {logo}
        {/* En riel el botón se va abajo del logo: al lado no cabe sin apretar
            el icono contra el borde. */}
        {!compacto && isDesktop && (
          <button
            onClick={() => setRiel(true)}
            aria-label="Colapsar menú" title="Colapsar menú"
            className={cuaderno
              ? 'p-1.5 rounded-md text-cuaderno-grafito hover:text-cuaderno-tinta hover:bg-cuaderno-hoja/70 flex-shrink-0'
              : 'p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors flex-shrink-0'}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
            </svg>
          </button>
        )}
        {!isDesktop && (
          <button
            onClick={() => setOpen(false)}
            aria-label="Cerrar menú"
            className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 transition-colors flex-shrink-0"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {compacto && (
        <button
          onClick={() => setRiel(false)}
          aria-label="Expandir menú" title="Expandir menú"
          className={cuaderno
            ? 'w-full mt-2 py-1.5 rounded-md text-cuaderno-grafito hover:text-cuaderno-tinta hover:bg-cuaderno-hoja/70 flex items-center justify-center'
            : 'w-full mt-2 py-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors flex items-center justify-center'}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 5l7 7-7 7M5 5l7 7-7 7" />
          </svg>
        </button>
      )}

      {/* Empresa activa. En riel se queda solo el cuadrito con la inicial: la
          caja con borde alrededor de un icono de 20px se ve desproporcionada
          en 64px de ancho, y el nombre no entra de ninguna forma. */}
      {empresa && cuaderno ? (compacto ? (
        <div className="flex justify-center mt-3" title={empresa.nombre}>
          <span className="w-8 h-8 rounded-full border-[1.5px] border-cuaderno-tinta/70 flex items-center justify-center font-manuscrita text-[15px] text-cuaderno-tinta">
            {empresa.nombre?.[0]}
          </span>
        </div>
      ) : (
        <div className="mt-3 font-manuscrita" title={empresa.nombre}>
          <div className="text-[13px] text-cuaderno-grafito">Empresa</div>
          <div className="text-[17px] leading-tight text-cuaderno-tinta truncate">{empresa.nombre}</div>
        </div>
      )) : empresa && (compacto ? (
        <div className="flex justify-center mt-3" title={empresa.nombre}>
          {empresa.logoUrl
            ? <img src={empresa.logoUrl} alt="" className="w-8 h-8 rounded-lg object-contain" />
            : <div className="w-8 h-8 rounded-lg bg-slate-200 flex items-center justify-center text-xs font-black text-slate-600">
                {empresa.nombre?.[0]}
              </div>}
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-xl bg-slate-50 border border-slate-200 mt-3 px-3 py-2"
          title={empresa.nombre}>
          {empresa.logoUrl
            ? <img src={empresa.logoUrl} alt="" className="w-5 h-5 rounded object-contain flex-shrink-0" />
            : <div className="w-5 h-5 rounded bg-slate-300 flex items-center justify-center text-[9px] font-black text-slate-600 flex-shrink-0">{empresa.nombre?.[0]}</div>}
          <span className="text-xs font-semibold text-slate-700 truncate">{empresa.nombre}</span>
        </div>
      ))}

      {/* Controles propios del módulo — un filtro de proyecto, por ejemplo.
          Se ocultan en riel: son controles con texto, no iconos. */}
      {headerSlot && !compacto && <div className="mt-2">{headerSlot}</div>}
    </div>
  );

  const nav = (
    <nav className={`flex-1 overflow-y-auto overflow-x-hidden space-y-5 py-4 ${
      cuaderno ? (compacto ? 'pl-2 pr-0' : 'pl-3 pr-0') : (compacto ? 'px-2' : 'px-3')}`}>
      {navGroups.map((group, gi) => (
        <div key={group.label || gi}>
          {/* El título del grupo no cabe en 64px y truncado se lee peor que no
              estar. En riel lo reemplaza una línea, que conserva la separación
              entre bloques sin ocupar ancho. */}
          {/* Los módulos de lista plana pasan un solo grupo sin etiqueta; ahí
              no se dibuja encabezado ni divisor. */}
          {group.label && (compacto
            ? (gi > 0 && <div className="h-px bg-slate-200 mx-2 mb-2" aria-hidden />)
            : (
              <p className={cuaderno
                ? 'font-manuscrita text-[14px] text-cuaderno-grafito px-3 mb-1'
                : 'text-[10px] font-black uppercase tracking-widest text-slate-400 px-3 mb-1.5'}>
                {group.label}
              </p>
            ))}

          <div className="space-y-1">
            {group.tabs.map(tab => {
              // Cuaderno: la pestaña activa es un separador sacado del archivador.
              // Lleva el fondo de la página y no tiene borde derecho; como el
              // borde de la barra es una sombra interior (se pinta bajo los
              // hijos), la pestaña lo tapa y queda unida a la hoja.
              const clasesCuaderno = (activo) =>
                `w-full flex items-center font-manuscrita text-[18px] relative min-h-[44px] border rounded-l-lg ${
                  compacto ? 'justify-center px-0 py-2' : 'gap-3 pl-3 pr-4 py-1.5'
                } ${
                  activo
                    ? 'bg-cuaderno-papel border-cuaderno-columna border-r-0 rounded-r-none text-cuaderno-tinta'
                    : 'border-transparent text-cuaderno-tinta hover:bg-cuaderno-hoja/60'
                } focus:outline-none focus-visible:ring-2 focus-visible:ring-cuaderno-tinta/40`;
              const clases = (activo) => cuaderno ? clasesCuaderno(activo) :
                `w-full flex items-center rounded-xl text-sm font-semibold transition-all relative ${
                  compacto ? 'justify-center px-0 py-3' : 'gap-3 px-3 py-2.5'
                } ${
                  activo
                    ? 'bg-purple-700 text-white shadow-md shadow-purple-200'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`;

              const activoTab = controlado ? activeId === tab.id : null;
              const contenidoCuaderno = (activo) => (
                <>
                  {/* Sin íconos en la barra expandida: la etiqueta escrita basta.
                      En riel se necesitan para orientarse, en trazo de grafito. */}
                  {compacto && (
                    <svg className="w-5 h-5 flex-shrink-0 text-cuaderno-grafito" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      {typeof tab.icon === 'string'
                        ? <path strokeLinecap="round" strokeLinejoin="round" d={tab.icon} />
                        : tab.icon}
                    </svg>
                  )}
                  {!compacto && (
                    <span className="flex-1 text-left truncate">
                      <span className={activo ? 'resaltado resaltado-menta' : 'px-[0.3em]'}>{tab.label}</span>
                    </span>
                  )}
                  {tab.badge > 0 && (
                    <span className={`inline-flex items-center justify-center min-w-[1.6rem] px-1 rounded-full border-[1.5px] text-[13px] leading-5 flex-shrink-0 ${
                      tab.badgeCritico ? 'border-cuaderno-roja text-cuaderno-roja' : 'border-cuaderno-grafito text-cuaderno-grafito'
                    } ${compacto ? 'absolute top-0 right-1 bg-cuaderno-separador' : ''}`}>
                      {tab.badge > 9 ? '9+' : tab.badge}
                    </span>
                  )}
                </>
              );

              const contenido = (
                <>
                  {/* El icono llega como `d` de un path (RRHH) o como nodo JSX
                      ya armado (Finanzas, Contabilidad). Se aceptan los dos
                      para no tener que reescribir los catálogos existentes. */}
                  <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                    {typeof tab.icon === 'string'
                      ? <path strokeLinecap="round" strokeLinejoin="round" d={tab.icon} />
                      : tab.icon}
                  </svg>
                  {!compacto && <span className="flex-1 text-left truncate">{tab.label}</span>}

                  {/* El contador sigue visible en riel, pegado a la esquina: es
                      justamente el dato por el que uno vuelve a mirar el menú. */}
                  {tab.badge > 0 && (
                    <span className={`min-w-4 h-4 px-1 rounded-full text-white text-[10px] font-black flex items-center justify-center flex-shrink-0 ${
                      tab.badgeCritico ? 'bg-red-500' : 'bg-amber-500'
                    } ${compacto ? 'absolute top-1 right-1' : ''}`}>
                      {tab.badge > 9 ? '9+' : tab.badge}
                    </span>
                  )}
                </>
              );

              // En riel el nombre viaja en el tooltip nativo: es lo único que
              // no depende de que el puntero exista, y en un menú de catorce
              // ítems los iconos solos no alcanzan para orientarse.
              const extras = {
                title: compacto ? tab.label : undefined,
                'aria-label': compacto ? tab.label : undefined,
              };

              if (controlado) {
                return (
                  <button key={tab.id} {...extras}
                    onClick={() => { onSelect(tab.id); if (!isDesktop) setOpen(false); }}
                    className={clases(activeId === tab.id)}>
                    {cuaderno ? contenidoCuaderno(activoTab) : contenido}
                  </button>
                );
              }

              return (
                <NavLink key={tab.id} {...extras}
                  to={`${basePath}/${tab.id}`}
                  onClick={() => { if (!isDesktop) setOpen(false); }}
                  className={({ isActive }) => clases(isActive)}>
                  {cuaderno ? ({ isActive }) => contenidoCuaderno(isActive) : contenido}
                </NavLink>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );

  const inicialUsuario = (user?.displayName || user?.email || '?').trim()[0]?.toUpperCase() || '?';

  const pie = (
    <div className={`border-t flex-shrink-0 py-3 ${cuaderno ? 'border-cuaderno-columna/50' : 'border-slate-100'} ${compacto ? 'px-2' : 'px-3'}`}>
      {footerSlot && (
        <div className={`flex items-center mb-2 ${compacto ? 'justify-center' : 'gap-2'}`}>{footerSlot}</div>
      )}

      {/* UserMenuDropdown dibuja nombre, estado y chevron con su propio ancho:
          en 64px se desborda sobre el contenido. En riel se reemplaza por el
          avatar, que al pulsarlo expande la barra y deja el menú a mano. Es un
          clic más, pero es predecible — y la alternativa era un menú cortado. */}
      {compacto ? (
        <button
          onClick={() => setRiel(false)}
          title={`${user?.displayName || user?.email || 'Usuario'} — expandir para ver el menú`}
          aria-label="Expandir menú de usuario"
          className="w-full flex justify-center"
        >
          <span className={cuaderno
            ? 'w-9 h-9 rounded-full border-[1.5px] border-cuaderno-tinta/70 text-cuaderno-tinta font-manuscrita text-[16px] flex items-center justify-center hover:bg-cuaderno-hoja'
            : 'w-9 h-9 rounded-xl bg-gradient-to-br from-purple-600 to-indigo-600 text-white font-black text-xs flex items-center justify-center shadow-sm hover:opacity-90 transition-opacity'}>
            {inicialUsuario}
          </span>
        </button>
      ) : (
        <UserMenuDropdown
          user={user}
          userRole={userRole}
          onLogout={onLogout}
          onBackToSelector={onBackToSelector}
          onAdminPanel={onAdminPanel}
          onAdminEmpresaPanel={onAdminEmpresaPanel}
          placement="top-left"
          variante={cuaderno ? 'cuaderno' : 'default'}
        />
      )}
    </div>
  );

  const barra = <>{cabecera}{nav}{pie}</>;

  return (
    <div className={`flex min-h-screen ${cuaderno ? 'tema-cuaderno bg-cuaderno-papel' : 'bg-slate-50'}`}>

      {/* Botón flotante solo en MÓVIL: en escritorio la barra nunca desaparece. */}
      {!open && !isDesktop && (
        <button
          onClick={() => setOpen(true)}
          aria-label="Mostrar menú"
          className={cuaderno
            ? 'flex items-center gap-2 px-3 min-h-[44px] rounded-md bg-cuaderno-hoja border-[1.5px] border-cuaderno-tinta text-cuaderno-tinta font-manuscrita text-[17px]'
            : 'flex items-center gap-2 px-3 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 text-sm font-bold shadow-lg transition-transform active:scale-95'}
          style={{ position: 'fixed', top: 10, left: 10, zIndex: 60 }}
        >
          <svg className={`w-5 h-5 ${cuaderno ? 'text-cuaderno-tinta' : 'text-slate-600'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
          Menú
        </button>
      )}

      {/* ── Sidebar ── */}
      {isDesktop ? (
        <aside
          className={cuaderno
            ? 'flex flex-col flex-shrink-0 bg-cuaderno-separador shadow-[inset_-1px_0_0_rgb(var(--cuaderno-columna))] sticky top-0 h-screen'
            : 'flex flex-col flex-shrink-0 bg-white border-r border-slate-200 shadow-sm sticky top-0 h-screen'}
          style={{
            width: compacto ? ANCHO_RIEL : ANCHO_EXPANDIDA,
            // Se anima solo el ancho. Animar `all` arrastraría la sombra del
            // ítem activo y se ve un parpadeo al cambiar de sección.
            transition: 'width 180ms ease',
          }}
        >
          {barra}
        </aside>
      ) : open && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <aside className={`absolute left-0 top-0 h-full w-64 flex flex-col ${cuaderno ? 'bg-cuaderno-separador shadow-[inset_-1px_0_0_rgb(var(--cuaderno-columna))]' : 'bg-white shadow-2xl'}`}>
            {barra}
          </aside>
        </div>
      )}

      {/* ── Content area ── */}
      <main className="flex-1 min-w-0 overflow-x-hidden">
        {/* `children` gana sobre `Outlet` cuando el módulo lo pasa. Los dos ejes
            son independientes: Maquinaria navega por router —sus ítems son
            NavLink— pero monta sus propias <Routes> como children en vez de
            colgarlas de un layout route. Atarlo a `controlado` dejaba su
            contenido sin renderizar. */}
        {children ?? <Outlet />}
      </main>
    </div>
  );
}
