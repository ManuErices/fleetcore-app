import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  collection, getDocs, addDoc, updateDoc, deleteDoc,
  doc, serverTimestamp, query, orderBy
} from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useEmpresa } from "../../lib/useEmpresa";
import { useFinanzas, ProyectoSelector } from "./FinanzasContext";
import {
  Cifra, Titulo, Hoja, LineaGuia, Boton, Campo, Resaltado, Pestanas, FechaHoja, ModalCuaderno, BarraProporcion,
  IconoMas, IconoLapiz, IconoBorrar, casoTitulo,
} from "./cuaderno";

// ─── Constantes ───────────────────────────────────────────────────────────────
// Origen de cada movimiento. Sin colores: en el cuaderno el color queda para
// los estados; el origen se escribe.
const FUENTES = {
  rendicion:   { label: "Rendición" },
  subcontrato: { label: "Subcontrato" },
  oc:          { label: "Orden de compra" },
  manual:      { label: "Manual" },
};

const ESTADOS_PAGO = ["Pendiente", "Pagado", "Parcial", "Vencido"];

const EMPTY_MANUAL = {
  razonSocial: "", rut: "", descripcion: "", monto: 0, moneda: "CLP",
  fecha: "", projectId: "", estado: "Pendiente", notas: "",
};

// ─── Utilidades ───────────────────────────────────────────────────────────────
function fmtM(n) {
  if (!n && n !== 0) return "—";
  if (Math.abs(n) >= 1000000) return "$" + (n / 1000000).toFixed(1).replace(".", ",") + "M";
  if (Math.abs(n) >= 1000) return "$" + Math.round(n).toLocaleString("es-CL");
  return "$" + Math.round(n).toLocaleString("es-CL");
}
function fmt(n) {
  return "$" + Math.round(n || 0).toLocaleString("es-CL");
}
function normalizar(str) {
  return (str || "").trim().toUpperCase();
}

// ─── Modal proveedor manual ───────────────────────────────────────────────────
function ModalManual({ isOpen, onClose, onSave, editando, projects }) {
  const [form, setForm] = useState(EMPTY_MANUAL);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setForm(editando ? { ...EMPTY_MANUAL, ...editando } : EMPTY_MANUAL);
  }, [editando, isOpen]);

  if (!isOpen) return null;
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const submit = async () => {
    if (!form.razonSocial || !form.monto) return;
    setSaving(true);
    await onSave({ ...form, monto: parseFloat(form.monto) || 0 });
    setSaving(false);
    onClose();
  };

  return (
    <ModalCuaderno
      titulo={editando ? "Editar registro" : "Nuevo registro manual"}
      subtitulo="Una cuenta por pagar que no viene de OC, subcontrato ni rendición"
      ancho="max-w-lg"
      onClose={onClose}
      bloqueado={saving}
      pie={
        <div className="flex gap-2">
          <Boton className="flex-1" onClick={onClose} disabled={saving}>Cancelar</Boton>
          <Boton variante="primario" className="flex-1" onClick={submit} disabled={saving || !form.razonSocial || !form.monto}>
            {saving ? "Guardando…" : editando ? "Guardar cambios" : "Crear registro"}
          </Boton>
        </div>
      }>
      <div className="grid grid-cols-2 gap-4">
        <Campo etiqueta="Razón social" value={form.razonSocial} onChange={e => set("razonSocial", e.target.value)} placeholder="Empresa o persona" />
        <Campo etiqueta="RUT" value={form.rut} onChange={e => set("rut", e.target.value)} placeholder="76.321.092-8" />
      </div>
      <Campo etiqueta="Descripción" value={form.descripcion} onChange={e => set("descripcion", e.target.value)} placeholder="Qué se está pagando" />
      <div className="grid grid-cols-[6rem_1fr_1fr] gap-4 items-end">
        <Campo as="select" etiqueta="Moneda" value={form.moneda} onChange={e => set("moneda", e.target.value)}>
          <option value="CLP">CLP</option>
          <option value="UF">UF</option>
          <option value="USD">USD</option>
        </Campo>
        <Campo etiqueta="Monto" type="number" inputMode="decimal" value={form.monto} onChange={e => set("monto", e.target.value)} placeholder="0" />
        <Campo etiqueta="Fecha" type="date" value={form.fecha} onChange={e => set("fecha", e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Campo as="select" etiqueta="Estado del pago" value={form.estado} onChange={e => set("estado", e.target.value)}>
          {ESTADOS_PAGO.map(e => <option key={e} value={e}>{e}</option>)}
        </Campo>
        <Campo as="select" etiqueta="Proyecto" value={form.projectId} onChange={e => set("projectId", e.target.value)}>
          <option value="">Sin proyecto</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.name || p.nombre}</option>)}
        </Campo>
      </div>
      <Campo as="textarea" rows={2} etiqueta="Notas" value={form.notas} onChange={e => set("notas", e.target.value)} placeholder="Observaciones" />
    </ModalCuaderno>
  );
}

// ─── Ficha del proveedor ──────────────────────────────────────────────────────
// Antes se dibujaba al final de la página, bajo la tabla, y había que bajar a
// buscarla. Ahora se abre encima, como las demás fichas del módulo.
const ESTADO_RESALTE = { Pendiente: "durazno", Pagado: "menta", Parcial: "lavanda", Vencido: "rosa" };

function PanelDetalle({ proveedor, onClose, onEditManual, onDeleteManual, projects }) {
  if (!proveedor) return null;
  const porFuente = Object.keys(FUENTES)
    .map(key => {
      const txs = proveedor.transacciones.filter(t => t._fuente === key);
      return { key, cantidad: txs.length, total: txs.reduce((s, t) => s + (t._monto || 0), 0) };
    })
    .filter(f => f.cantidad > 0);

  return (
    <ModalCuaderno
      titulo={casoTitulo(proveedor.razonSocial)}
      subtitulo={`${proveedor.rut || "Sin RUT"}, ${proveedor.transacciones.length} movimientos`}
      ancho="max-w-3xl"
      capa="z-50"
      cerrarAlClicFuera
      onClose={onClose}>
      <div className="max-w-md">
        {porFuente.map(f => (
          <LineaGuia key={f.key} etiqueta={`${FUENTES[f.key].label} (${f.cantidad})`}>
            <Cifra valor={f.total} escala="pesos" color="tinta" vacio="$0" />
          </LineaGuia>
        ))}
        <LineaGuia etiqueta="Total">
          <Cifra valor={proveedor.total} escala="pesos" color="tinta" vacio="$0" raya="total" />
        </LineaGuia>
      </div>

      <div>
        <Titulo as="h3" tamano="sm" className="border-b border-cuaderno-azul">Movimientos</Titulo>
        <ul className="m-0 p-0 list-none">
          {proveedor.transacciones.map((tx, i) => {
            const meta = FUENTES[tx._fuente] || FUENTES.manual;
            const proyecto = projects.find(p => p.id === tx.projectId);
            return (
              <li key={i} className="flex items-center justify-between gap-3 min-h-[52px] py-1.5 border-b border-cuaderno-azul">
                <div className="min-w-0">
                  <p className="m-0 text-[16px] leading-tight truncate">
                    {tx._descripcion || tx.descripcion || tx.numeroOC || tx.numeroRendicion || "Sin descripción"}
                  </p>
                  <p className="m-0 text-[13px] text-cuaderno-grafito">
                    {[meta.label.toLowerCase(), tx._fecha, proyecto ? (proyecto.name || proyecto.nombre) : null].filter(Boolean).join(", ")}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {tx._fuente === "manual" && tx.estado && (
                    <Resaltado color={ESTADO_RESALTE[tx.estado] || "durazno"} className="text-[14px]">{tx.estado.toLowerCase()}</Resaltado>
                  )}
                  <Cifra valor={tx._monto} escala="pesos" color="tinta" vacio="$0" className="text-[16px]" />
                  {tx._fuente === "manual" && (
                    <>
                      <button onClick={() => onEditManual(tx)} aria-label="Editar registro" title="Editar"
                        className="w-8 h-8 rounded-md flex items-center justify-center text-cuaderno-grafito hover:text-cuaderno-tinta hover:bg-cuaderno-hoja">
                        <IconoLapiz tamano={14} />
                      </button>
                      <button onClick={() => onDeleteManual(tx.id)} aria-label="Eliminar registro" title="Eliminar"
                        className="w-8 h-8 rounded-md flex items-center justify-center text-cuaderno-grafito hover:text-cuaderno-roja hover:bg-cuaderno-rosa/40">
                        <IconoBorrar tamano={14} />
                      </button>
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </ModalCuaderno>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────
export default function FinanzasProveedores() {
  const { proyectoId } = useFinanzas();
  const [loading, setLoading]         = useState(true);
  const [projects, setProjects]       = useState([]);
  const { empresaId } = useEmpresa();
  const [proveedores, setProveedores] = useState([]); // agrupados
  const [detalle, setDetalle]         = useState(null);
  const [showModal, setShowModal]     = useState(false);
  const [editando, setEditando]       = useState(null);
  const [busqueda, setBusqueda]       = useState("");
  const [filtroFuente, setFiltroFuente] = useState("todos");
  const [sortCol, setSortCol]         = useState("total");
  const [sortDir, setSortDir]         = useState("desc");
  const [activeTab, setActiveTab]     = useState("proveedores"); // proveedores | transacciones

  const cargar = useCallback(async () => {
    if (!empresaId) { setLoading(false); return; }
    setLoading(true);
    const txs = []; // todas las transacciones normalizadas

    try {
      // 1. Rendiciones
      const snapR = await getDocs(collection(db, "empresas", empresaId, "rendiciones"));
      snapR.docs.forEach(d => {
        const r = d.data();
        const proveedor = normalizar(r.proveedor);
        if (!proveedor) return;
        txs.push({
          _fuente: "rendicion",
          _key: proveedor,
          _rut: normalizar(r.rutProveedor || ""),
          _monto: parseFloat(r.montoAprobado) || parseFloat(r.montoSolicitado) || 0,
          _fecha: r.fechaEmision || r.fechaAprobacion || "",
          _descripcion: r.categoria || r.cuentaContable || "",
          projectId: r.projectId || "",
          razonSocial: r.proveedor || "",
          rut: r.rutProveedor || "",
          id: d.id,
        });
      });
    } catch (e) { console.error("rendiciones", e); }

    try {
      // 2. Subcontratos
      const snapS = await getDocs(collection(db, "empresas", empresaId, "subcontratos"));
      snapS.docs.forEach(d => {
        const s = d.data();
        const proveedor = normalizar(s.razonSocialSubcontratista);
        if (!proveedor) return;
        txs.push({
          _fuente: "subcontrato",
          _key: proveedor,
          _rut: normalizar(s.rutSubcontratista || ""),
          _monto: parseFloat(s.saldoPorPagarSC) || parseFloat(s.totalPagoNeto) || 0,
          _fecha: s.fechaEP || s.createdAt?.toDate?.()?.toISOString?.()?.slice(0, 10) || "",
          _descripcion: s.descripcionLinea || s.descricpionCuentaCosto || "",
          projectId: s.projectId || "",
          razonSocial: s.razonSocialSubcontratista || "",
          rut: s.rutSubcontratista || "",
          id: d.id,
        });
      });
    } catch (e) { console.error("subcontratos", e); }

    try {
      // 3. Órdenes de compra
      const snapOC = await getDocs(collection(db, "empresas", empresaId, "purchaseOrders"));
      snapOC.docs.forEach(d => {
        const o = d.data();
        const proveedor = normalizar(o.proveedor);
        if (!proveedor) return;
        txs.push({
          _fuente: "oc",
          _key: proveedor,
          _rut: normalizar(o.rutProveedor || ""),
          _monto: parseFloat(o.totalMonto) || 0,
          _fecha: o.fecha || "",
          _descripcion: o.nombreOC || o.numeroOC || "",
          projectId: o.projectId || "",
          razonSocial: o.proveedor || "",
          rut: o.rutProveedor || "",
          numeroOC: o.numeroOC || "",
          id: d.id,
        });
      });
    } catch (e) { console.error("purchaseOrders", e); }

    try {
      // 4. Manuales
      const snapM = await getDocs(query(collection(db, "empresas", empresaId, "finanzas_proveedores"), orderBy("createdAt", "desc")));
      snapM.docs.forEach(d => {
        const m = d.data();
        const proveedor = normalizar(m.razonSocial);
        if (!proveedor) return;
        txs.push({
          _fuente: "manual",
          _key: proveedor,
          _rut: normalizar(m.rut || ""),
          _monto: parseFloat(m.monto) || 0,
          _fecha: m.fecha || "",
          _descripcion: m.descripcion || "",
          projectId: m.projectId || "",
          razonSocial: m.razonSocial || "",
          rut: m.rut || "",
          estado: m.estado || "Pendiente",
          notas: m.notas || "",
          moneda: m.moneda || "CLP",
          id: d.id,
        });
      });
    } catch (e) { console.error("finanzas_proveedores", e); }

    // Agrupar por proveedor
    const mapaProveedores = {};
    // Aplicar filtro de proyecto sobre las transacciones
    const txsFiltradas = proyectoId !== "todos" ? txs.filter(tx => tx.projectId === proyectoId) : txs;

    txsFiltradas.forEach(tx => {
      const key = tx._key;
      if (!mapaProveedores[key]) {
        mapaProveedores[key] = {
          razonSocial: tx.razonSocial || key,
          rut: tx._rut || tx.rut || "",
          transacciones: [],
          fuentes: new Set(),
          total: 0,
        };
      }
      mapaProveedores[key].transacciones.push(tx);
      mapaProveedores[key].fuentes.add(tx._fuente);
      mapaProveedores[key].total += tx._monto;
    });

    setProveedores(Object.values(mapaProveedores));
    setLoading(false);
  }, [empresaId, proyectoId]);

  useEffect(() => { cargar(); }, [cargar]);

  useEffect(() => {
    try {
      getDocs(collection(db, "empresas", empresaId, "projects")).then(snap => setProjects(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
    } catch (e) {}
  }, []);

  const handleSaveManual = async (form) => {
    if (editando) {
      await updateDoc(doc(db, "empresas", empresaId, "finanzas_proveedores", editando.id), { ...form, updatedAt: serverTimestamp() });
    } else {
      await addDoc(collection(db, "empresas", empresaId, "finanzas_proveedores"), { ...form, createdAt: serverTimestamp() });
    }
    setEditando(null);
    await cargar();
    // Actualizar detalle si está abierto
    setDetalle(null);
  };

  const handleDeleteManual = async (id) => {
    if (!window.confirm("¿Eliminar este registro manual?")) return;
    await deleteDoc(doc(db, "empresas", empresaId, "finanzas_proveedores", id));
    await cargar();
    setDetalle(null);
  };

  const handleSort = (col) => {
    if (sortCol === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortCol(col); setSortDir("desc"); }
  };

  const proveedoresFiltrados = useMemo(() => {
    let list = proveedores.filter(p => {
      if (filtroFuente !== "todos" && !p.fuentes.has(filtroFuente)) return false;
      if (busqueda) {
        const b = busqueda.toLowerCase();
        return p.razonSocial.toLowerCase().includes(b) || p.rut.toLowerCase().includes(b);
      }
      return true;
    });
    return [...list].sort((a, b) => {
      const map = {
        nombre: [a.razonSocial.toLowerCase(), b.razonSocial.toLowerCase()],
        total:  [a.total, b.total],
        txs:    [a.transacciones.length, b.transacciones.length],
      };
      const [va, vb] = map[sortCol] || [0, 0];
      if (va < vb) return sortDir === "asc" ? -1 : 1;
      if (va > vb) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
  }, [proveedores, busqueda, filtroFuente, sortCol, sortDir]);

  // Todas las transacciones planas para la pestaña Transacciones
  const todasTxs = useMemo(() => {
    let txs = [];
    proveedores.forEach(p => p.transacciones.forEach(tx => txs.push({ ...tx, _razonSocial: p.razonSocial })));
    if (filtroFuente !== "todos") txs = txs.filter(t => t._fuente === filtroFuente);
    if (busqueda) {
      const b = busqueda.toLowerCase();
      txs = txs.filter(t => (t._razonSocial||"").toLowerCase().includes(b) || (t._descripcion||"").toLowerCase().includes(b));
    }
    return txs.sort((a, b) => (b._fecha || "").localeCompare(a._fecha || ""));
  }, [proveedores, filtroFuente, busqueda]);

  // KPIs
  const totalGeneral    = useMemo(() => proveedores.reduce((s, p) => s + p.total, 0), [proveedores]);
  const totalOC         = useMemo(() => proveedores.reduce((s, p) => s + p.transacciones.filter(t => t._fuente === "oc").reduce((a, t) => a + t._monto, 0), 0), [proveedores]);
  const totalSub        = useMemo(() => proveedores.reduce((s, p) => s + p.transacciones.filter(t => t._fuente === "subcontrato").reduce((a, t) => a + t._monto, 0), 0), [proveedores]);
  const totalRend       = useMemo(() => proveedores.reduce((s, p) => s + p.transacciones.filter(t => t._fuente === "rendicion").reduce((a, t) => a + t._monto, 0), 0), [proveedores]);

  // ── Solo presentación ─────────────────────────────────────────────────────
  const COLS_PROV = [
    { col: "nombre", label: "Proveedor",   align: "text-left",   cls: "" },
    { col: "total",  label: "Total",       align: "text-right",  cls: "" },
    { col: "txs",    label: "Movimientos", align: "text-center", cls: "hidden sm:table-cell" },
  ];
  const porOrigen = [["oc", totalOC], ["subcontrato", totalSub], ["rendicion", totalRend]].filter(([, v]) => v > 0);

  if (loading) return (
    <div className="cuaderno flex items-center justify-center h-64 text-[18px] text-cuaderno-grafito">
      Juntando los movimientos…
    </div>
  );

  return (
    <div className="cuaderno px-8 pt-5 pb-10 space-y-5">

      <FechaHoja />

      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Titulo>Proveedores</Titulo>
          <p className="m-0 text-[17px] text-cuaderno-grafito">Órdenes de compra, subcontratos, rendiciones y registros manuales, por proveedor.</p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <ProyectoSelector variante="cuaderno" />
          <Boton variante="primario" onClick={() => { setEditando(null); setShowModal(true); }}>
            <IconoMas tamano={14} /> Registro manual
          </Boton>
        </div>
      </header>

      <div className="grid gap-5 lg:grid-cols-2">
        <Hoja titulo="Resumen">
          <LineaGuia etiqueta="Proveedores"><span>{proveedores.length}</span></LineaGuia>
          <p className="m-0 -mt-1 mb-1 text-right text-[13px] text-cuaderno-grafito">{todasTxs.length} movimientos</p>
          <LineaGuia etiqueta="Órdenes de compra"><Cifra valor={totalOC} escala="pesos" color="tinta" vacio="$0" /></LineaGuia>
          <LineaGuia etiqueta="Subcontratos, saldo por pagar"><Cifra valor={totalSub} escala="pesos" color="tinta" vacio="$0" /></LineaGuia>
          <LineaGuia etiqueta="Rendiciones aprobadas"><Cifra valor={totalRend} escala="pesos" color="tinta" vacio="$0" /></LineaGuia>
        </Hoja>

        <Hoja titulo="Por origen">
          {totalGeneral > 0 ? (
            <div className="space-y-3">
              {porOrigen.map(([key, val]) => {
                const pct = (val / totalGeneral) * 100;
                return (
                  <div key={key}>
                    <div className="flex items-baseline justify-between gap-3 text-[17px]">
                      <span>{FUENTES[key].label}</span>
                      <span className="flex items-baseline gap-3">
                        <Cifra valor={val} escala="pesos" color="tinta" />
                        <span className="w-12 text-right text-[15px] text-cuaderno-grafito">{pct.toFixed(1).replace(".", ",")}%</span>
                      </span>
                    </div>
                    <BarraProporcion pct={pct} />
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="m-0 py-6 text-center text-[16px] text-cuaderno-grafito">Sin movimientos todavía.</p>
          )}
        </Hoja>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-4">
        <Pestanas
          valor={activeTab}
          onCambiar={setActiveTab}
          opciones={[{ id: "proveedores", label: "Por proveedor" }, { id: "transacciones", label: "Movimientos" }]}
        />
        <div className="flex flex-wrap items-end gap-3">
          <Campo etiqueta="Buscar" type="search" className="w-56"
            value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Razón social o RUT" />
          <Campo as="select" etiqueta="Origen" value={filtroFuente} onChange={e => setFiltroFuente(e.target.value)}>
            <option value="todos">Todos</option>
            <option value="oc">Órdenes de compra</option>
            <option value="subcontrato">Subcontratos</option>
            <option value="rendicion">Rendiciones</option>
            <option value="manual">Manuales</option>
          </Campo>
        </div>
      </div>

      {/* Por proveedor */}
      {activeTab === "proveedores" && (
        <Hoja cuerpo="px-6 py-4">
          {proveedoresFiltrados.length === 0 ? (
            <div className="py-10 text-center space-y-1">
              <p className="m-0 font-ligada font-light text-[22px] leading-[1.6]">No hay proveedores que mostrar</p>
              <p className="m-0 text-[16px] text-cuaderno-grafito">Prueba con otros filtros o agrega un registro manual.</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="shadow-[inset_0_-1.5px_0_rgb(var(--cuaderno-tinta))]">
                      {COLS_PROV.map(({ col, label, align, cls }) => {
                        const activa = sortCol === col;
                        return (
                          <th key={col} className={`${cls} ${align} font-normal text-[15px] px-3 py-2`}
                            aria-sort={activa ? (sortDir === "asc" ? "ascending" : "descending") : undefined}>
                            <button onClick={() => handleSort(col)} className="min-h-[36px] text-cuaderno-grafito hover:text-cuaderno-tinta">
                              {label}{activa && <span aria-hidden="true">{sortDir === "asc" ? " ↑" : " ↓"}</span>}
                            </button>
                          </th>
                        );
                      })}
                      <th className="font-normal text-[15px] text-left text-cuaderno-grafito px-3 py-2 hidden md:table-cell">Origen</th>
                    </tr>
                  </thead>
                  <tbody>
                    {proveedoresFiltrados.map(p => (
                      <tr key={p.razonSocial} tabIndex={0}
                        onClick={() => setDetalle(detalle?.razonSocial === p.razonSocial ? null : p)}
                        onKeyDown={e => { if (e.key === "Enter") setDetalle(p); }}
                        className="border-b border-cuaderno-renglon cursor-pointer hover:bg-cuaderno-papel focus:outline-none focus-visible:bg-cuaderno-papel">
                        <td className="px-3 py-2">
                          <p className="m-0 text-[17px] leading-tight">{casoTitulo(p.razonSocial)}</p>
                          {p.rut && <p className="m-0 text-[13px] text-cuaderno-grafito">{p.rut}</p>}
                        </td>
                        <td className="px-3 py-2 text-right text-[16px]"><Cifra valor={p.total} escala="pesos" color="tinta" vacio="$0" /></td>
                        <td className="px-3 py-2 text-center text-[16px] text-cuaderno-grafito hidden sm:table-cell">{p.transacciones.length}</td>
                        <td className="px-3 py-2 text-[14px] text-cuaderno-grafito hidden md:table-cell">
                          {[...p.fuentes].map(f => (FUENTES[f]?.label || f).toLowerCase()).join(", ")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex flex-wrap items-end justify-between gap-3 pt-3">
                <span className="text-[15px] text-cuaderno-grafito">{proveedoresFiltrados.length} proveedores</span>
                <LineaGuia etiqueta="Total general" className="w-full max-w-md">
                  <Cifra valor={proveedoresFiltrados.reduce((s, p) => s + p.total, 0)} escala="pesos" color="tinta" vacio="$0" raya="doble" />
                </LineaGuia>
              </div>
            </>
          )}
        </Hoja>
      )}

      {/* Movimientos */}
      {activeTab === "transacciones" && (
        <Hoja cuerpo="px-6 py-4">
          {todasTxs.length === 0 ? (
            <p className="m-0 py-10 text-center text-[16px] text-cuaderno-grafito">No hay movimientos con estos filtros.</p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="shadow-[inset_0_-1.5px_0_rgb(var(--cuaderno-tinta))]">
                      <th className="font-normal text-[15px] text-left text-cuaderno-grafito px-3 py-2">Proveedor</th>
                      <th className="font-normal text-[15px] text-left text-cuaderno-grafito px-3 py-2 hidden md:table-cell">Descripción</th>
                      <th className="font-normal text-[15px] text-left text-cuaderno-grafito px-3 py-2">Origen</th>
                      <th className="font-normal text-[15px] text-right text-cuaderno-grafito px-3 py-2">Monto</th>
                      <th className="font-normal text-[15px] text-center text-cuaderno-grafito px-3 py-2 hidden sm:table-cell">Fecha</th>
                    </tr>
                  </thead>
                  <tbody>
                    {todasTxs.map((tx, idx) => {
                      const meta = FUENTES[tx._fuente] || FUENTES.manual;
                      return (
                        <tr key={`${tx._fuente}-${tx.id}-${idx}`} className="border-b border-cuaderno-renglon">
                          <td className="px-3 py-2">
                            <p className="m-0 text-[16px] leading-tight">{casoTitulo(tx._razonSocial)}</p>
                            {tx.rut && <p className="m-0 text-[13px] text-cuaderno-grafito">{tx.rut}</p>}
                          </td>
                          <td className="px-3 py-2 text-[15px] hidden md:table-cell">{tx._descripcion || <span className="text-cuaderno-grafito">—</span>}</td>
                          <td className="px-3 py-2 text-[15px] text-cuaderno-grafito">{meta.label.toLowerCase()}</td>
                          <td className="px-3 py-2 text-right text-[16px]"><Cifra valor={tx._monto} escala="pesos" color="tinta" vacio="$0" /></td>
                          <td className="px-3 py-2 text-center text-[14px] text-cuaderno-grafito hidden sm:table-cell">{tx._fecha || "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="flex flex-wrap items-end justify-between gap-3 pt-3">
                <span className="text-[15px] text-cuaderno-grafito">{todasTxs.length} movimientos</span>
                <LineaGuia etiqueta="Total" className="w-full max-w-md">
                  <Cifra valor={todasTxs.reduce((s, t) => s + t._monto, 0)} escala="pesos" color="tinta" vacio="$0" raya="doble" />
                </LineaGuia>
              </div>
            </>
          )}
        </Hoja>
      )}

      {detalle && (
        <PanelDetalle
          proveedor={detalle}
          onClose={() => setDetalle(null)}
          onEditManual={(tx) => { setEditando(tx); setShowModal(true); }}
          onDeleteManual={handleDeleteManual}
          projects={projects}
        />
      )}

      <ModalManual
        isOpen={showModal}
        onClose={() => { setShowModal(false); setEditando(null); }}
        onSave={handleSaveManual}
        editando={editando}
        projects={projects}
      />
    </div>
  );
}
