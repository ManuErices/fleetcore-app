import React, { useState, useMemo } from "react";
import { useContabilidad, TIPOS_CUENTA, TIPOS_MAP } from "./ContabilidadContext";
import {
  Titulo, Hoja, Cifra, LineaGuia, Resaltado, Nota, VistoBueno, Boton, Campo, Casilla,
  ModalCuaderno, FechaHoja, IconoMas, IconoLapiz, casoOracion,
} from "../finanzas/cuaderno";

// ─── Modal agregar/editar cuenta ─────────────────────────────────────────────
const EMPTY_CUENTA = { codigo: "", nombre: "", tipo: "activo_corriente", descripcion: "", activa: true };

function ModalCuenta({ isOpen, onClose, editando, onSave }) {
  const [form, setForm] = useState(EMPTY_CUENTA);
  const [saving, setSaving] = useState(false);
  React.useEffect(() => {
    setForm(editando ? { ...EMPTY_CUENTA, ...editando } : EMPTY_CUENTA);
  }, [editando, isOpen]);
  if (!isOpen) return null;
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const tipo = TIPOS_MAP[form.tipo] || TIPOS_CUENTA[0];

  const handleSubmit = async () => {
    if (!form.codigo || !form.nombre) return;
    setSaving(true);
    await onSave(form);
    setSaving(false);
    onClose();
  };

  return (
    <ModalCuaderno
      titulo={editando ? "Editar cuenta" : "Nueva cuenta"}
      subtitulo="Plan de cuentas"
      ancho="max-w-lg"
      onClose={onClose}
      bloqueado={saving}
      pie={
        <div className="flex items-center gap-2">
          <Boton variante="texto" onClick={onClose} disabled={saving}>Cancelar</Boton>
          <div className="flex-1" />
          <Boton variante="primario" onClick={handleSubmit} disabled={saving || !form.codigo || !form.nombre}>
            {saving ? "Guardando…" : editando ? "Guardar cambios" : "Crear cuenta"}
          </Boton>
        </div>
      }>
      <div className="grid grid-cols-2 gap-4 items-end">
        <Campo etiqueta="Código (obligatorio)" value={form.codigo} onChange={e => set("codigo", e.target.value)} placeholder="1-01-001" />
        <Casilla marcada={form.activa} onCambiar={v => set("activa", v)}>Activa</Casilla>
      </div>
      <Campo etiqueta="Nombre (obligatorio)" value={form.nombre} onChange={e => set("nombre", e.target.value)} placeholder="Ej: Caja Chica" />
      <div>
        <div className="text-sm text-cuaderno-grafito mb-1.5">Tipo de cuenta</div>
        <div role="radiogroup" aria-label="Tipo de cuenta" className="grid grid-cols-2 gap-1.5 max-h-56 overflow-y-auto pr-1">
          {TIPOS_CUENTA.map(t => {
            const activo = form.tipo === t.id;
            return (
              <button key={t.id} type="button" role="radio" aria-checked={activo} onClick={() => set("tipo", t.id)}
                className={`min-h-[44px] px-3 py-1.5 rounded-md border-[1.5px] text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-cuaderno-tinta/40 ${
                  activo ? "border-cuaderno-tinta bg-cuaderno-hoja" : "border-cuaderno-columna/70 hover:border-cuaderno-tinta/60"}`}>
                <span className="block text-[12px] text-cuaderno-grafito">{casoOracion(t.grupo)}</span>
                <span className="text-[16px] text-cuaderno-tinta">
                  {activo ? <Resaltado color="menta">{t.label}</Resaltado> : t.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>
      <Campo as="textarea" etiqueta="Descripción" rows={2} value={form.descripcion || ""} onChange={e => set("descripcion", e.target.value)} placeholder="Descripción opcional…" />
    </ModalCuaderno>
  );
}

// ─── Resaltado por grupo ──────────────────────────────────────────────────────
const GRUPO_RESALTADO = {
  ACTIVO:     "menta",
  PASIVO:     "rosa",
  PATRIMONIO: "lavanda",
  RESULTADO:  "durazno",
};

// ─── Componente principal ─────────────────────────────────────────────────────
export default function ContabilidadPlanCuentas() {
  const { cuentas, loadingCuentas, guardarCuenta, eliminarCuenta, fusionarCuentas, cargarCuentas, saldoCuenta } = useContabilidad();
  const [deduplicando, setDeduplicando] = useState(false);
  const [resultadoDedup, setResultadoDedup] = useState(null);
  const [reasignadosDedup, setReasignadosDedup] = useState(0);
  const [errorDedup, setErrorDedup] = useState(null);

  // ── Eliminar cuentas duplicadas (mismo código, distintos ids) ─────────────
  const deduplicarCuentas = async () => {
    setDeduplicando(true);
    setResultadoDedup(null);
    setErrorDedup(null);
    setReasignadosDedup(0);
    // Agrupar por código
    const porCodigo = {};
    cuentas.forEach(c => {
      if (!c.codigo) return;
      if (!porCodigo[c.codigo]) porCodigo[c.codigo] = [];
      porCodigo[c.codigo].push(c);
    });
    // Se conserva la primera (más antigua) y se FUSIONAN las demás: primero se
    // reasignan sus asientos a la que sobrevive y recién entonces se eliminan.
    // Antes se borraban directo, lo que habría dejado líneas apuntando a cuentas
    // inexistentes: seguían sumando en los saldos pero desaparecían del informe.
    let eliminadas = 0, reasignados = 0, errores = [];
    for (const [codigo, lista] of Object.entries(porCodigo)) {
      if (lista.length <= 1) continue;
      try {
        const r = await fusionarCuentas(lista[0].id, lista.slice(1).map(c => c.id));
        eliminadas  += r.eliminadas;
        reasignados += r.reasignados;
      } catch (e) {
        console.error("Error fusionando cuenta duplicada:", e);
        errores.push(`${codigo}: ${e.message}`);
      }
    }
    await cargarCuentas();
    if (errores.length) setErrorDedup(errores.join(" · "));
    setReasignadosDedup(reasignados);
    setDeduplicando(false);
    setResultadoDedup(eliminadas);
    setTimeout(() => setResultadoDedup(null), 4000);
  };
  const [showModal, setShowModal]   = useState(false);
  const [editando, setEditando]     = useState(null);
  const [busqueda, setBusqueda]     = useState("");
  const [filtroGrupo, setFiltroGrupo] = useState("todos");
  const [filtroActiva, setFiltroActiva] = useState("activas");

  const cuentasFiltradas = useMemo(() => {
    return cuentas.filter(c => {
      if (filtroActiva === "activas" && !c.activa) return false;
      if (filtroActiva === "inactivas" && c.activa) return false;
      const tipo = TIPOS_MAP[c.tipo];
      if (filtroGrupo !== "todos" && tipo?.grupo !== filtroGrupo) return false;
      if (busqueda) {
        const b = busqueda.toLowerCase();
        return c.codigo?.toLowerCase().includes(b) || c.nombre?.toLowerCase().includes(b);
      }
      return true;
    });
  }, [cuentas, filtroGrupo, filtroActiva, busqueda]);

  // Totales por grupo
  const totalPorGrupo = useMemo(() => {
    const map = {};
    cuentas.forEach(c => {
      const tipo = TIPOS_MAP[c.tipo];
      if (!tipo) return;
      const g = tipo.grupo;
      if (!map[g]) map[g] = 0;
      map[g]++;
    });
    return map;
  }, [cuentas]);

  const grupos = ["ACTIVO", "PASIVO", "PATRIMONIO", "RESULTADO", "TRIBUTARIO"];

  return (
    <div className="cuaderno px-8 pt-5 pb-10 space-y-5">

      <FechaHoja />

      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Titulo>Plan de cuentas</Titulo>
          <p className="m-0 text-[17px] text-cuaderno-grafito">{cuentas.length} cuentas registradas</p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          {/* Botón deduplicar — solo visible si hay duplicados */}
          {cuentas.length !== new Set(cuentas.map(c => c.codigo)).size && (
            <Boton onClick={deduplicarCuentas} disabled={deduplicando}>
              {deduplicando ? "Limpiando…" : "Eliminar duplicadas"}
            </Boton>
          )}
          <Boton variante="primario" onClick={() => { setEditando(null); setShowModal(true); }}>
            <IconoMas tamano={14} /> Nueva cuenta
          </Boton>
        </div>
      </header>

      {errorDedup && <Nota etiqueta="Ojo:">{errorDedup}</Nota>}
      {resultadoDedup !== null && (
        <p className="m-0 flex items-center gap-2 text-[17px] text-cuaderno-verde">
          <VistoBueno tamano={15} titulo="" />
          {resultadoDedup} cuenta{resultadoDedup !== 1 ? "s" : ""} duplicada{resultadoDedup !== 1 ? "s" : ""} fusionada{resultadoDedup !== 1 ? "s" : ""}
          {reasignadosDedup > 0 && ` · ${reasignadosDedup} asiento${reasignadosDedup !== 1 ? "s" : ""} reasignado${reasignadosDedup !== 1 ? "s" : ""}`}
        </p>
      )}

      {/* Cuentas por grupo (filtran la tabla) */}
      <Hoja titulo="Por grupo">
        <div className="grid gap-x-10 sm:grid-cols-2 lg:grid-cols-3">
          {grupos.map(g => {
            const activo = filtroGrupo === g;
            return (
              <button key={g} type="button" aria-pressed={activo} onClick={() => setFiltroGrupo(activo ? "todos" : g)}
                className="text-left rounded-sm hover:bg-cuaderno-papel focus:outline-none focus-visible:ring-2 focus-visible:ring-cuaderno-tinta/40">
                <LineaGuia etiqueta={activo ? <Resaltado color="lavanda">{casoOracion(g)}</Resaltado> : casoOracion(g)}>
                  <span>{totalPorGrupo[g] || 0} <span className="text-[15px] text-cuaderno-grafito">cuentas</span></span>
                </LineaGuia>
              </button>
            );
          })}
        </div>
      </Hoja>

      {/* Tabla */}
      <Hoja titulo="Cuentas"
        extra={
          <>
            <Campo etiqueta="Buscar" type="search" className="w-60"
              value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Código o nombre" />
            <Campo as="select" etiqueta="Estado" value={filtroActiva} onChange={e => setFiltroActiva(e.target.value)}>
              <option value="activas">Activas</option>
              <option value="inactivas">Inactivas</option>
              <option value="todas">Todas</option>
            </Campo>
          </>
        }>
        {loadingCuentas ? (
          <p className="m-0 py-12 text-center text-[18px] text-cuaderno-grafito">Buscando las cuentas…</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="shadow-[inset_0_-1.5px_0_rgb(var(--cuaderno-tinta))]">
                    <th className="font-normal text-[15px] text-cuaderno-grafito text-left px-2 py-2">Código</th>
                    <th className="font-normal text-[15px] text-cuaderno-grafito text-left px-2 py-2">Nombre</th>
                    <th className="font-normal text-[15px] text-cuaderno-grafito text-left px-2 py-2 hidden sm:table-cell">Tipo</th>
                    <th className="font-normal text-[15px] text-cuaderno-grafito text-left px-2 py-2 hidden md:table-cell">Grupo</th>
                    <th className="font-normal text-[15px] text-cuaderno-grafito text-right px-2 py-2">Saldo</th>
                    <th className="font-normal text-[15px] text-cuaderno-grafito text-center px-2 py-2">Estado</th>
                    <th className="w-12"><span className="sr-only">Acciones</span></th>
                  </tr>
                </thead>
                <tbody>
                  {cuentasFiltradas.map(c => {
                    const tipo = TIPOS_MAP[c.tipo];
                    const saldo = saldoCuenta(c.id);
                    return (
                      <tr key={c.id} className={`group border-b border-cuaderno-renglon hover:bg-cuaderno-papel ${!c.activa ? "opacity-60" : ""}`}>
                        <td className="px-2 py-2 text-[16px] whitespace-nowrap">{c.codigo}</td>
                        <td className="px-2 py-2">
                          <p className="m-0 text-[17px] leading-tight">{c.nombre}</p>
                          {c.descripcion && <p className="m-0 text-[13px] text-cuaderno-grafito truncate max-w-[240px]">{c.descripcion}</p>}
                        </td>
                        <td className="px-2 py-2 text-[15px] text-cuaderno-grafito hidden sm:table-cell">{tipo?.label || c.tipo}</td>
                        <td className="px-2 py-2 text-[15px] hidden md:table-cell whitespace-nowrap">
                          {tipo?.grupo
                            ? (GRUPO_RESALTADO[tipo.grupo]
                                ? <Resaltado color={GRUPO_RESALTADO[tipo.grupo]}>{casoOracion(tipo.grupo)}</Resaltado>
                                : <span className="px-[0.3em]">{casoOracion(tipo.grupo)}</span>)
                            : <span className="text-cuaderno-grafito">—</span>}
                        </td>
                        <td className="px-2 py-2 text-right text-[16px]">
                          {saldo !== 0 ? <Cifra valor={saldo} escala="pesos" /> : <span className="text-cuaderno-grafito">—</span>}
                        </td>
                        <td className="px-2 py-2 text-center text-[15px]">
                          {c.activa ? <Resaltado color="menta">activa</Resaltado> : <span className="text-cuaderno-grafito px-[0.3em]">inactiva</span>}
                        </td>
                        <td className="px-2 py-2">
                          <button onClick={() => { setEditando(c); setShowModal(true); }} aria-label={`Editar ${c.nombre}`}
                            className="w-8 h-8 mx-auto rounded-md flex items-center justify-center text-cuaderno-grafito hover:text-cuaderno-tinta hover:bg-cuaderno-hoja">
                            <IconoLapiz tamano={14} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {cuentasFiltradas.length === 0 && (
              <div className="py-12 text-center">
                <p className="m-0 font-ligada font-light text-[22px] leading-[1.6]">No hay cuentas que coincidan con los filtros</p>
              </div>
            )}
            <div className="flex flex-wrap items-baseline justify-between gap-3 pt-3 text-[15px] text-cuaderno-grafito">
              <span>{cuentasFiltradas.length} cuentas mostradas</span>
              <span>{filtroGrupo !== "todos" ? casoOracion(filtroGrupo) : "Todos los grupos"}</span>
            </div>
          </>
        )}
      </Hoja>

      <ModalCuenta isOpen={showModal} onClose={() => { setShowModal(false); setEditando(null); }} editando={editando} onSave={guardarCuenta} />
    </div>
  );
}
