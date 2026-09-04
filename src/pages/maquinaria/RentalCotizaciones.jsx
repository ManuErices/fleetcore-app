import React, { useEffect, useState, useMemo } from "react";
import { useEmpresa } from "../../lib/useEmpresa";
import { useUserRole } from "../../lib/useUserRole";
import { listMachines } from "../../lib/db";
import {
  listRentalQuotes, upsertRentalQuote, deleteRentalQuote,
  listRentalClients, listRentalPurchaseOrders,
  aceptarCotizacion, rechazarCotizacion, crearContratoDesdeCotizacion,
  uploadQuoteFile, deleteQuoteFile,
  estadoEfectivoCotizacion, diasVigenciaCotizacion,
  ingresoMensualLinea, totalesDocumento,
  CLP, ESTADOS_COTIZACION,
} from "../../lib/rental";
import {
  Kpi, Chip, Badge, Aviso, Estado, Dato, Seccion, Campo, Selector, AreaTexto,
  Modal, Panel, BotonPrimario, BotonSecundario, Adjuntos, fmtFecha,
} from "../../components/rental/ui";

const PUEDEN_EDITAR = ["superadmin", "admin_contrato", "administrativo"];

const TARIFAS = [
  { value: "mes", label: "Por mes" },
  { value: "dia", label: "Por día" },
  { value: "hora", label: "Por hora" },
];

const CATEGORIAS_ARCHIVO = {
  cotizacion_enviada: "Cotización enviada",
  correo_cliente: "Correo del cliente",
  otro: "Otro documento",
};

export default function RentalCotizaciones() {
  const { empresaId } = useEmpresa();
  const { role } = useUserRole();
  const puedeEditar = PUEDEN_EDITAR.includes(role);

  const [quotes, setQuotes] = useState([]);
  const [clients, setClients] = useState([]);
  const [machines, setMachines] = useState([]);
  const [purchaseOrders, setPurchaseOrders] = useState([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState("vivas");

  const [showForm, setShowForm] = useState(false);
  const [editando, setEditando] = useState(null);
  const [fichaId, setFichaId] = useState(null);

  useEffect(() => {
    if (!empresaId) return;
    refresh();
  }, [empresaId]);

  const refresh = async () => {
    setLoading(true);
    setError("");
    try {
      const [q, c, m, oc] = await Promise.all([
        listRentalQuotes(empresaId),
        listRentalClients(empresaId),
        listMachines(empresaId),
        listRentalPurchaseOrders(empresaId),
      ]);
      setQuotes(q); setClients(c); setMachines(m); setPurchaseOrders(oc);
    } catch (e) {
      setError(e.message || "No se pudieron cargar las cotizaciones");
    } finally {
      setLoading(false);
    }
  };

  const filtradas = useMemo(() => {
    const t = busca.trim().toLowerCase();
    let base = quotes;

    if (filtro === "vivas") base = base.filter((q) => q.estado !== "rechazada" && !q.contratoGeneradoId);
    if (filtro === "pendientes") base = base.filter((q) => estadoEfectivoCotizacion(q) === "enviada");
    if (filtro === "porContratar") base = base.filter((q) => q.estado === "aceptada" && !q.contratoGeneradoId);
    if (filtro === "rechazadas") base = base.filter((q) => q.estado === "rechazada");

    if (!t) return base;
    return base.filter((q) =>
      [q.numero, q.clienteNombre, q.ocNumero]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(t))
    );
  }, [quotes, filtro, busca]);

  const totales = useMemo(() => {
    const pendientes = quotes.filter((q) => estadoEfectivoCotizacion(q) === "enviada");
    const porContratar = quotes.filter((q) => q.estado === "aceptada" && !q.contratoGeneradoId);
    return {
      pendientes: pendientes.length,
      montoPendiente: pendientes.reduce((s, q) => s + Number(q.total || 0), 0),
      porContratar: porContratar.length,
      aceptadas: quotes.filter((q) => q.estado === "aceptada").length,
    };
  }, [quotes]);

  const ficha = quotes.find((q) => q.id === fichaId) || null;

  const tras = async (mensaje) => {
    setAviso(mensaje);
    setFichaId(null);
    await refresh();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-slate-900">Cotizaciones</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Del envío al cliente hasta la orden de compra que abre el contrato
          </p>
        </div>
        {puedeEditar && (
          <BotonPrimario onClick={() => { setEditando(null); setShowForm(true); }}>
            + Nueva cotización
          </BotonPrimario>
        )}
      </div>

      {error && <Aviso tono="error">{error}</Aviso>}
      {aviso && <Aviso tono="ok">{aviso}</Aviso>}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <Kpi label="Pendientes de respuesta" valor={totales.pendientes} tono="blue" />
        <Kpi label="Monto en juego" valor={CLP(totales.montoPendiente)} pie="total mensual cotizado" />
        <Kpi label="Aceptadas" valor={totales.aceptadas} tono="emerald" />
        <Kpi label="Esperando contrato" valor={totales.porContratar} tono="amber" />
      </div>

      <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
        <input
          type="text"
          placeholder="Buscar por folio, cliente o N° de OC..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="border-2 border-slate-200 focus:border-slate-400 outline-none rounded-xl px-4 py-2.5 text-sm w-full sm:w-96 transition-colors"
        />
        <div className="flex flex-wrap gap-2">
          <Chip activo={filtro === "vivas"} onClick={() => setFiltro("vivas")}>En curso</Chip>
          <Chip activo={filtro === "pendientes"} onClick={() => setFiltro("pendientes")}>Pendientes</Chip>
          <Chip activo={filtro === "porContratar"} onClick={() => setFiltro("porContratar")}>Por contratar</Chip>
          <Chip activo={filtro === "rechazadas"} onClick={() => setFiltro("rechazadas")}>Rechazadas</Chip>
          <Chip activo={filtro === "todas"} onClick={() => setFiltro("todas")}>Todas</Chip>
        </div>
      </div>

      {loading ? (
        <Estado>Cargando cotizaciones...</Estado>
      ) : filtradas.length === 0 ? (
        <Estado>
          {quotes.length === 0
            ? "Aún no hay cotizaciones. Crea la primera para empezar el ciclo comercial."
            : "Ninguna cotización coincide con el filtro."}
        </Estado>
      ) : (
        <div className="space-y-2">
          {filtradas.map((q) => (
            <FilaCotizacion key={q.id} quote={q} onAbrir={() => setFichaId(q.id)} />
          ))}
        </div>
      )}

      {showForm && (
        <FormCotizacion
          empresaId={empresaId}
          quote={editando}
          clients={clients}
          machines={machines}
          onClose={() => setShowForm(false)}
          onSaved={async () => { setShowForm(false); await tras("Cotización guardada."); }}
        />
      )}

      {ficha && (
        <FichaCotizacion
          empresaId={empresaId}
          quote={ficha}
          machines={machines}
          clients={clients}
          purchaseOrders={purchaseOrders}
          puedeEditar={puedeEditar}
          onClose={() => setFichaId(null)}
          onEditar={() => { setEditando(ficha); setShowForm(true); setFichaId(null); }}
          onCambio={tras}
          onRecargar={refresh}
        />
      )}
    </div>
  );
}

function FilaCotizacion({ quote, onAbrir }) {
  const ef = estadoEfectivoCotizacion(quote);
  const dias = diasVigenciaCotizacion(quote);
  const porContratar = quote.estado === "aceptada" && !quote.contratoGeneradoId;

  return (
    <button
      onClick={onAbrir}
      className="w-full text-left bg-white border-2 border-slate-100 hover:border-slate-300 rounded-2xl p-4 transition-colors"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-black text-slate-900">{quote.numero || "Sin folio"}</span>
            <Badge estado={ESTADOS_COTIZACION[ef]} />
            {porContratar && (
              <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full border bg-amber-100 text-amber-700 border-amber-200">
                Falta el contrato
              </span>
            )}
            {quote.contratoGeneradoId && (
              <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full border bg-slate-100 text-slate-500 border-slate-200">
                Contrato generado
              </span>
            )}
          </div>
          <p className="text-sm font-semibold text-slate-700 mt-1">{quote.clienteNombre}</p>
          <p className="text-xs text-slate-400 mt-0.5">
            {[
              `${(quote.lineas || []).length} equipo(s)`,
              quote.fecha ? fmtFecha(quote.fecha) : null,
              quote.ocNumero ? `OC ${quote.ocNumero}` : null,
              ef === "enviada" && dias != null
                ? dias >= 0 ? `vence en ${dias} día(s)` : `vencida hace ${Math.abs(dias)} día(s)`
                : null,
            ].filter(Boolean).join(" · ")}
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-lg font-black text-slate-900">{CLP(quote.total)}</p>
          <p className="text-[11px] text-slate-400">total mensual con IVA</p>
        </div>
      </div>
    </button>
  );
}

// ============================================================
// Ficha de la cotización
// ============================================================
function FichaCotizacion({ empresaId, quote, machines, clients, purchaseOrders, puedeEditar, onClose, onEditar, onCambio, onRecargar }) {
  const [accion, setAccion] = useState(null); // aceptar | rechazar | contrato | imprimir
  const [error, setError] = useState("");
  const [trabajando, setTrabajando] = useState(false);

  const ef = estadoEfectivoCotizacion(quote);
  const cliente = clients.find((c) => c.id === quote.clienteId);
  const oc = purchaseOrders.find((o) => o.id === quote.ocId);
  const bloqueada = quote.estado === "aceptada" || quote.estado === "rechazada";

  const eliminar = async () => {
    if (!window.confirm(`¿Eliminar la cotización ${quote.numero}?`)) return;
    setTrabajando(true);
    setError("");
    try {
      await deleteRentalQuote(empresaId, quote.id);
      await onCambio("Cotización eliminada.");
    } catch (e) {
      setError(e.message);
      setTrabajando(false);
    }
  };

  return (
    <>
      <Panel onClose={onClose}>
        <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-5 z-10">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-xl font-black text-slate-900">{quote.numero || "Sin folio"}</h2>
                <Badge estado={ESTADOS_COTIZACION[ef]} />
              </div>
              <p className="text-sm text-slate-500 mt-1">{quote.clienteNombre}</p>
            </div>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-2xl leading-none shrink-0">&times;</button>
          </div>

          <div className="flex flex-wrap gap-2 mt-4">
            <button onClick={() => setAccion("imprimir")} className="px-3 py-1.5 rounded-lg border-2 border-slate-200 text-slate-600 text-xs font-bold">
              Ver e imprimir
            </button>
            {puedeEditar && !bloqueada && (
              <>
                <button onClick={() => setAccion("aceptar")} className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-bold">
                  Registrar OC y aceptar
                </button>
                <button onClick={() => setAccion("rechazar")} className="px-3 py-1.5 rounded-lg border-2 border-red-200 text-red-600 text-xs font-bold">
                  Rechazar
                </button>
                <button onClick={onEditar} className="px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-bold">
                  Editar
                </button>
              </>
            )}
            {puedeEditar && quote.estado === "aceptada" && !quote.contratoGeneradoId && (
              <button onClick={() => setAccion("contrato")} className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs font-bold">
                Generar contrato
              </button>
            )}
            {puedeEditar && !quote.contratoGeneradoId && !quote.ocId && (
              <button onClick={eliminar} disabled={trabajando} className="px-3 py-1.5 rounded-lg border-2 border-slate-200 text-slate-500 text-xs font-bold disabled:opacity-50">
                Eliminar
              </button>
            )}
          </div>
        </div>

        <div className="p-6 space-y-5">
          {error && <Aviso tono="error">{error}</Aviso>}

          {quote.estado === "aceptada" && !quote.contratoGeneradoId && (
            <Aviso tono="alerta">
              La OC ya está registrada. Falta generar el contrato para poder emitir estados de pago.
            </Aviso>
          )}
          {quote.estado === "rechazada" && quote.motivoRechazo && (
            <Aviso tono="info">Motivo del rechazo: {quote.motivoRechazo}</Aviso>
          )}

          <div className="bg-white border-2 border-slate-100 rounded-2xl p-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            <Dato label="Fecha" valor={fmtFecha(quote.fecha)} />
            <Dato
              label="Validez"
              valor={`${quote.validezDias || 15} días`}
              extra={quote.fechaVencimiento ? `hasta ${fmtFecha(quote.fechaVencimiento)}` : ""}
            />
            <Dato label="Plazo estimado" valor={quote.plazoMeses ? `${quote.plazoMeses} meses` : "No definido"} />
            <Dato label="RUT del cliente" valor={cliente?.rut} />
            {oc && (
              <Dato
                label="Orden de compra"
                valor={`N° ${oc.numeroOC}`}
                extra={`${fmtFecha(oc.fechaEmision)} · ${CLP(oc.montoNeto)} neto`}
              />
            )}
            {quote.fechaAceptacion && <Dato label="Aceptada el" valor={fmtFecha(quote.fechaAceptacion)} />}
          </div>

          <div>
            <p className="text-xs font-black text-slate-400 uppercase mb-2">Equipos cotizados</p>
            <div className="bg-white border-2 border-slate-100 rounded-2xl divide-y divide-slate-100">
              {(quote.lineas || []).map((l, i) => {
                const m = machines.find((x) => x.id === l.machineId);
                return (
                  <div key={i} className="p-3 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-slate-800">
                        {m?.name || l.descripcion || l.code || "Equipo"}
                      </p>
                      <p className="text-xs text-slate-400">
                        {[
                          m?.code,
                          `${CLP(l.tarifaValor)} por ${l.tarifaTipo}`,
                          l.cantidadEstimada ? `${l.cantidadEstimada} ${l.tarifaTipo}(s)` : null,
                        ].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                    <p className="text-sm font-black text-slate-900 shrink-0">{CLP(ingresoMensualLinea(l))}</p>
                  </div>
                );
              })}
              <div className="p-3 space-y-1 bg-slate-50 rounded-b-2xl">
                <LineaTotal label="Neto mensual" valor={CLP(quote.neto)} />
                <LineaTotal label={quote.afectoIVA === false ? "Exento de IVA" : "IVA 19%"} valor={CLP(quote.iva)} />
                <LineaTotal label="Total mensual" valor={CLP(quote.total)} destacado />
                {quote.plazoMeses > 0 && (
                  <LineaTotal
                    label={`Estimado por ${quote.plazoMeses} meses`}
                    valor={CLP(Number(quote.total || 0) * quote.plazoMeses)}
                  />
                )}
              </div>
            </div>
          </div>

          {quote.condiciones && (
            <div className="bg-white border-2 border-slate-100 rounded-2xl p-4">
              <p className="text-xs font-black text-slate-400 uppercase mb-1">Condiciones</p>
              <p className="text-sm text-slate-700 whitespace-pre-line">{quote.condiciones}</p>
            </div>
          )}

          <div className="bg-white border-2 border-slate-100 rounded-2xl p-4">
            <Adjuntos
              archivos={quote.archivos || []}
              categorias={CATEGORIAS_ARCHIVO}
              disabled={!puedeEditar}
              onSubir={async (file, categoria) => {
                await uploadQuoteFile(empresaId, quote.id, file, { categoria });
                await onRecargar();
              }}
              onQuitar={async (a) => {
                await deleteQuoteFile(empresaId, quote.id, a);
                await onRecargar();
              }}
            />
          </div>
        </div>
      </Panel>

      {accion === "aceptar" && (
        <ModalAceptar
          empresaId={empresaId}
          quote={quote}
          onClose={() => setAccion(null)}
          onListo={() => onCambio("Orden de compra registrada. La cotización quedó aceptada.")}
        />
      )}
      {accion === "rechazar" && (
        <ModalRechazar
          empresaId={empresaId}
          quote={quote}
          onClose={() => setAccion(null)}
          onListo={() => onCambio("Cotización marcada como rechazada.")}
        />
      )}
      {accion === "contrato" && (
        <ModalContrato
          empresaId={empresaId}
          quote={quote}
          onClose={() => setAccion(null)}
          onListo={() => onCambio("Contrato creado desde la cotización.")}
        />
      )}
      {accion === "imprimir" && (
        <VistaImpresion quote={quote} machines={machines} cliente={cliente} onClose={() => setAccion(null)} />
      )}
    </>
  );
}

function LineaTotal({ label, valor, destacado }) {
  return (
    <div className="flex justify-between items-center">
      <span className={destacado ? "text-xs font-black text-slate-700 uppercase" : "text-xs text-slate-500 font-semibold"}>
        {label}
      </span>
      <span className={destacado ? "text-base font-black text-slate-900" : "text-sm font-bold text-slate-700"}>
        {valor}
      </span>
    </div>
  );
}

// ============================================================
// Aceptar: llega la OC del mandante
// ============================================================
function ModalAceptar({ empresaId, quote, onClose, onListo }) {
  const sugerido = quote.plazoMeses > 0
    ? Math.round(Number(quote.neto || 0) * quote.plazoMeses)
    : Number(quote.neto || 0);

  const [f, setF] = useState({
    numeroOC: "",
    fechaEmision: new Date().toISOString().slice(0, 10),
    fechaVencimiento: "",
    montoNeto: sugerido,
    observaciones: "",
  });
  const [archivo, setArchivo] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));

  const guardar = async () => {
    setError("");
    if (!f.numeroOC.trim()) return setError("Ingresa el número de la orden de compra");
    if (!f.fechaEmision) return setError("Ingresa la fecha de la orden de compra");
    if (!Number(f.montoNeto)) return setError("Ingresa el monto neto autorizado");
    setSaving(true);
    try {
      await aceptarCotizacion(empresaId, quote, f, archivo);
      onListo();
    } catch (e) {
      setError(e.message);
      setSaving(false);
    }
  };

  return (
    <Modal
      titulo="Registrar orden de compra"
      subtitulo={`Cotización ${quote.numero} · ${quote.clienteNombre}`}
      onClose={onClose}
      acciones={
        <>
          <BotonSecundario onClick={onClose} className="flex-1">Cancelar</BotonSecundario>
          <BotonPrimario onClick={guardar} disabled={saving} className="flex-1">
            {saving ? "Registrando..." : "Aceptar cotización"}
          </BotonPrimario>
        </>
      }
    >
      {error && <Aviso tono="error">{error}</Aviso>}

      <Aviso tono="info">
        El monto neto de la OC es el tope que podrás facturar en estados de pago. Si se agota, se amplía con una enmienda.
      </Aviso>

      <Seccion>
        <Campo label="N° de orden de compra" value={f.numeroOC} onChange={(v) => set("numeroOC", v)} placeholder="OC-45821" />
        <Campo
          label="Monto neto autorizado"
          type="number"
          value={f.montoNeto}
          onChange={(v) => set("montoNeto", v)}
          ayuda={`Sugerido: ${CLP(sugerido)}`}
        />
        <Campo label="Fecha de emisión" type="date" value={f.fechaEmision} onChange={(v) => set("fechaEmision", v)} />
        <Campo label="Vigencia hasta" type="date" value={f.fechaVencimiento} onChange={(v) => set("fechaVencimiento", v)} ayuda="Opcional" />
        <AreaTexto label="Observaciones" rows={2} value={f.observaciones} onChange={(v) => set("observaciones", v)} />
      </Seccion>

      <div>
        <p className="text-xs font-black text-slate-400 uppercase mb-2">Archivo de la OC</p>
        <label className="flex items-center justify-between gap-3 border-2 border-dashed border-slate-200 hover:border-slate-300 rounded-xl px-4 py-3 cursor-pointer transition-colors">
          <span className="text-sm font-semibold text-slate-600 truncate">
            {archivo ? archivo.name : "Sube el PDF o la foto de la orden de compra"}
          </span>
          <span className="text-xs font-bold text-red-600 shrink-0">Seleccionar</span>
          <input
            type="file"
            accept="application/pdf,image/*"
            className="hidden"
            onChange={(e) => setArchivo(e.target.files?.[0] || null)}
          />
        </label>
        <p className="text-xs text-slate-400 mt-1">
          Puedes adjuntarla después desde la orden de compra, pero conviene dejarla desde ya como respaldo.
        </p>
      </div>
    </Modal>
  );
}

function ModalRechazar({ empresaId, quote, onClose, onListo }) {
  const [motivo, setMotivo] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const guardar = async () => {
    setSaving(true);
    setError("");
    try {
      await rechazarCotizacion(empresaId, quote.id, motivo);
      onListo();
    } catch (e) {
      setError(e.message);
      setSaving(false);
    }
  };

  return (
    <Modal
      titulo="Rechazar cotización"
      subtitulo={`${quote.numero} · ${quote.clienteNombre}`}
      onClose={onClose}
      ancho="max-w-lg"
      acciones={
        <>
          <BotonSecundario onClick={onClose} className="flex-1">Cancelar</BotonSecundario>
          <button
            onClick={guardar}
            disabled={saving}
            className="flex-1 py-2.5 px-4 rounded-xl bg-slate-900 text-white font-bold text-sm disabled:opacity-50"
          >
            {saving ? "Guardando..." : "Marcar como rechazada"}
          </button>
        </>
      }
    >
      {error && <Aviso tono="error">{error}</Aviso>}
      <AreaTexto label="Motivo del rechazo" rows={3} value={motivo} onChange={setMotivo} />
      <p className="text-xs text-slate-400">
        Queda registrado para saber por qué se perdió el negocio. La cotización no se borra.
      </p>
    </Modal>
  );
}

function ModalContrato({ empresaId, quote, onClose, onListo }) {
  const [f, setF] = useState({
    fechaInicio: new Date().toISOString().slice(0, 10),
    fechaFin: "",
    proyectoDestino: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));

  const guardar = async () => {
    setError("");
    if (!f.fechaInicio) return setError("Indica la fecha de inicio del contrato");
    setSaving(true);
    try {
      await crearContratoDesdeCotizacion(empresaId, quote, f);
      onListo();
    } catch (e) {
      setError(e.message);
      setSaving(false);
    }
  };

  return (
    <Modal
      titulo="Generar contrato"
      subtitulo={`Desde ${quote.numero} · OC ${quote.ocNumero}`}
      onClose={onClose}
      ancho="max-w-lg"
      acciones={
        <>
          <BotonSecundario onClick={onClose} className="flex-1">Cancelar</BotonSecundario>
          <BotonPrimario onClick={guardar} disabled={saving} className="flex-1">
            {saving ? "Creando..." : "Crear contrato"}
          </BotonPrimario>
        </>
      }
    >
      {error && <Aviso tono="error">{error}</Aviso>}
      <Aviso tono="info">
        El contrato hereda cliente, equipos y tarifas de la cotización, y queda respaldado por la OC N° {quote.ocNumero}.
        Las máquinas pasan a estado arrendado.
      </Aviso>
      <Seccion>
        <Campo label="Fecha de inicio" type="date" value={f.fechaInicio} onChange={(v) => set("fechaInicio", v)} />
        <Campo label="Fecha de término" type="date" value={f.fechaFin} onChange={(v) => set("fechaFin", v)} ayuda="Opcional" />
        <Campo label="Obra o faena de destino" value={f.proyectoDestino} onChange={(v) => set("proyectoDestino", v)} full />
      </Seccion>
    </Modal>
  );
}

// ============================================================
// Vista imprimible para enviar al cliente
// ============================================================
function VistaImpresion({ quote, machines, cliente, onClose }) {
  const { empresa } = useEmpresa();

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 print:bg-white print:p-0">
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #cotizacion-impresa, #cotizacion-impresa * { visibility: visible; }
          #cotizacion-impresa { position: absolute; inset: 0; margin: 0; box-shadow: none; }
          .no-imprimir { display: none !important; }
        }
      `}</style>

      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col print:max-h-none print:rounded-none">
        <div className="no-imprimir border-b border-slate-100 px-6 py-4 flex items-center justify-between">
          <h3 className="text-lg font-black text-slate-900">Vista de impresión</h3>
          <div className="flex items-center gap-2">
            <BotonPrimario onClick={() => window.print()}>Imprimir o guardar PDF</BotonPrimario>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-2xl leading-none px-2">&times;</button>
          </div>
        </div>

        <div id="cotizacion-impresa" className="overflow-y-auto p-10 text-slate-900">
          <div className="flex justify-between items-start border-b-2 border-slate-900 pb-4">
            <div>
              <h1 className="text-2xl font-black">{empresa?.nombre || "MPF Rental"}</h1>
              {empresa?.rut && <p className="text-sm text-slate-500">{empresa.rut}</p>}
              <p className="text-sm text-slate-500">Arriendo de maquinaria</p>
            </div>
            <div className="text-right">
              <p className="text-xs font-bold text-slate-400 uppercase">Cotización</p>
              <p className="text-xl font-black">{quote.numero}</p>
              <p className="text-sm text-slate-500">{fmtFecha(quote.fecha)}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-6 py-5 text-sm">
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase mb-1">Cliente</p>
              <p className="font-bold">{quote.clienteNombre}</p>
              {cliente?.rut && <p className="text-slate-600">{cliente.rut}</p>}
              {cliente?.giro && <p className="text-slate-600">{cliente.giro}</p>}
              {cliente?.direccion && (
                <p className="text-slate-600">
                  {[cliente.direccion, cliente.comuna, cliente.ciudad].filter(Boolean).join(", ")}
                </p>
              )}
            </div>
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase mb-1">Condiciones comerciales</p>
              <p className="text-slate-600">Validez de la oferta: {quote.validezDias || 15} días</p>
              {quote.fechaVencimiento && <p className="text-slate-600">Vigente hasta {fmtFecha(quote.fechaVencimiento)}</p>}
              {quote.plazoMeses > 0 && <p className="text-slate-600">Plazo estimado: {quote.plazoMeses} meses</p>}
              <p className="text-slate-600">Condición de pago: {cliente?.diasPago ?? 30} días</p>
            </div>
          </div>

          <table className="w-full text-sm border-t-2 border-slate-900">
            <thead>
              <tr className="text-left text-xs font-black uppercase text-slate-500 border-b border-slate-300">
                <th className="py-2">Equipo</th>
                <th className="py-2">Tarifa</th>
                <th className="py-2 text-right">Cantidad</th>
                <th className="py-2 text-right">Mensual neto</th>
              </tr>
            </thead>
            <tbody>
              {(quote.lineas || []).map((l, i) => {
                const m = machines.find((x) => x.id === l.machineId);
                return (
                  <tr key={i} className="border-b border-slate-200">
                    <td className="py-2.5">
                      <p className="font-bold">{m?.name || l.descripcion || "Equipo"}</p>
                      {(m?.marca || m?.modelo) && (
                        <p className="text-xs text-slate-500">{[m.marca, m.modelo, m.code].filter(Boolean).join(" · ")}</p>
                      )}
                    </td>
                    <td className="py-2.5 text-slate-600">{CLP(l.tarifaValor)} / {l.tarifaTipo}</td>
                    <td className="py-2.5 text-right text-slate-600">{l.cantidadEstimada || "—"}</td>
                    <td className="py-2.5 text-right font-bold">{CLP(ingresoMensualLinea(l))}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div className="flex justify-end pt-4">
            <div className="w-64 space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">Neto</span>
                <span className="font-bold">{CLP(quote.neto)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">{quote.afectoIVA === false ? "Exento" : "IVA 19%"}</span>
                <span className="font-bold">{CLP(quote.iva)}</span>
              </div>
              <div className="flex justify-between border-t-2 border-slate-900 pt-1.5">
                <span className="font-black uppercase text-xs">Total mensual</span>
                <span className="text-lg font-black">{CLP(quote.total)}</span>
              </div>
            </div>
          </div>

          {quote.condiciones && (
            <div className="mt-8 pt-4 border-t border-slate-200">
              <p className="text-xs font-bold text-slate-400 uppercase mb-1">Condiciones</p>
              <p className="text-sm text-slate-700 whitespace-pre-line">{quote.condiciones}</p>
            </div>
          )}

          <p className="mt-10 text-xs text-slate-400">
            Los valores no incluyen traslado ni combustible salvo indicación expresa. Precios en pesos chilenos.
          </p>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Formulario de cotización
// ============================================================
function FormCotizacion({ empresaId, quote, clients, machines, onClose, onSaved }) {
  const [f, setF] = useState({
    clienteId: quote?.clienteId || "",
    fecha: (quote?.fecha || new Date().toISOString()).slice(0, 10),
    validezDias: quote?.validezDias || 15,
    plazoMeses: quote?.plazoMeses || "",
    afectoIVA: quote?.afectoIVA !== false,
    condiciones: quote?.condiciones || "",
    estado: quote?.estado || "borrador",
  });
  const [lineas, setLineas] = useState(
    quote?.lineas?.length
      ? quote.lineas
      : [{ machineId: "", tarifaTipo: "mes", tarifaValor: "", cantidadEstimada: "" }]
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));

  const totales = useMemo(
    () => totalesDocumento(
      lineas.filter((l) => l.machineId && Number(l.tarifaValor) > 0),
      { afectoIVA: f.afectoIVA }
    ),
    [lineas, f.afectoIVA]
  );

  const cambiarLinea = (i, campo, valor) => {
    setLineas((prev) => prev.map((l, idx) => {
      if (idx !== i) return l;
      const nueva = { ...l, [campo]: valor };
      if (campo === "machineId") {
        const m = machines.find((x) => x.id === valor);
        nueva.code = m?.code || "";
        nueva.descripcion = m?.name || "";
        if (!nueva.tarifaValor && m?.tarifaArriendoMes) nueva.tarifaValor = m.tarifaArriendoMes;
      }
      return nueva;
    }));
  };

  const guardar = async () => {
    setError("");
    if (!f.clienteId) return setError("Selecciona un cliente");
    const validas = lineas.filter((l) => l.machineId && Number(l.tarifaValor) > 0);
    if (!validas.length) return setError("Agrega al menos un equipo con su tarifa");

    setSaving(true);
    try {
      const cliente = clients.find((c) => c.id === f.clienteId);
      await upsertRentalQuote(empresaId, {
        id: quote?.id,
        numero: quote?.numero,
        ...f,
        fecha: new Date(`${f.fecha}T12:00:00`).toISOString(),
        clienteNombre: cliente?.nombre || "",
        lineas: validas,
      });
      onSaved();
    } catch (e) {
      setError(e.message);
      setSaving(false);
    }
  };

  // Se ocultan las máquinas ya arrendadas, salvo las que esta cotización ya usa.
  const disponibles = machines.filter(
    (m) => m.activo !== false && (m.disponibilidad !== "arrendado" || lineas.some((l) => l.machineId === m.id))
  );

  return (
    <Modal
      titulo={quote ? `Editar ${quote.numero}` : "Nueva cotización"}
      onClose={onClose}
      ancho="max-w-3xl"
      acciones={
        <>
          <BotonSecundario onClick={onClose} className="flex-1">Cancelar</BotonSecundario>
          <BotonPrimario onClick={guardar} disabled={saving} className="flex-1">
            {saving ? "Guardando..." : "Guardar cotización"}
          </BotonPrimario>
        </>
      }
    >
      {error && <Aviso tono="error">{error}</Aviso>}

      <Seccion titulo="Datos generales">
        <Selector
          label="Cliente"
          value={f.clienteId}
          onChange={(v) => set("clienteId", v)}
          opciones={clients.map((c) => ({ value: c.id, label: c.nombre }))}
          full
        />
        <Campo label="Fecha" type="date" value={f.fecha} onChange={(v) => set("fecha", v)} />
        <Campo label="Validez (días)" type="number" value={f.validezDias} onChange={(v) => set("validezDias", v)} />
        <Campo
          label="Plazo estimado (meses)"
          type="number"
          value={f.plazoMeses}
          onChange={(v) => set("plazoMeses", v)}
          ayuda="Se usa para sugerir el monto de la OC"
        />
        <Selector
          label="Estado"
          value={f.estado}
          onChange={(v) => set("estado", v)}
          opciones={[
            { value: "borrador", label: "Borrador" },
            { value: "enviada", label: "Enviada al cliente" },
          ]}
          placeholder=""
        />
      </Seccion>

      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-black text-slate-400 uppercase">Equipos</p>
          <button
            onClick={() => setLineas([...lineas, { machineId: "", tarifaTipo: "mes", tarifaValor: "", cantidadEstimada: "" }])}
            className="text-xs font-bold text-red-600 hover:text-red-700"
          >
            + Agregar equipo
          </button>
        </div>

        <div className="space-y-2">
          {lineas.map((l, i) => (
            <div key={i} className="bg-slate-50 rounded-xl p-3 space-y-2">
              <div className="flex items-center gap-2">
                <select
                  value={l.machineId}
                  onChange={(e) => cambiarLinea(i, "machineId", e.target.value)}
                  className="flex-1 border-2 border-slate-200 focus:border-slate-400 outline-none rounded-lg p-2 text-sm bg-white"
                >
                  <option value="">Seleccionar equipo...</option>
                  {disponibles.map((m) => (
                    <option key={m.id} value={m.id}>
                      {[m.code, m.name || `${m.marca || ""} ${m.modelo || ""}`.trim()].filter(Boolean).join(" — ")}
                    </option>
                  ))}
                </select>
                {lineas.length > 1 && (
                  <button
                    onClick={() => setLineas(lineas.filter((_, idx) => idx !== i))}
                    className="text-slate-400 hover:text-red-600 text-xl leading-none px-1"
                  >
                    &times;
                  </button>
                )}
              </div>

              <div className="grid grid-cols-3 gap-2">
                <select
                  value={l.tarifaTipo}
                  onChange={(e) => cambiarLinea(i, "tarifaTipo", e.target.value)}
                  className="border-2 border-slate-200 rounded-lg p-2 text-sm bg-white"
                >
                  {TARIFAS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
                <input
                  type="number"
                  placeholder="Valor tarifa"
                  value={l.tarifaValor}
                  onChange={(e) => cambiarLinea(i, "tarifaValor", e.target.value)}
                  className="border-2 border-slate-200 rounded-lg p-2 text-sm"
                />
                <input
                  type="number"
                  placeholder={l.tarifaTipo === "mes" ? "Meses" : l.tarifaTipo === "dia" ? "Días/mes" : "Horas/mes"}
                  value={l.cantidadEstimada}
                  onChange={(e) => cambiarLinea(i, "cantidadEstimada", e.target.value)}
                  className="border-2 border-slate-200 rounded-lg p-2 text-sm"
                />
              </div>

              {l.machineId && Number(l.tarifaValor) > 0 && (
                <p className="text-xs font-bold text-slate-500 text-right">
                  Aporta {CLP(ingresoMensualLinea(l))} netos al mes
                </p>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="bg-slate-900 text-white rounded-2xl p-4 space-y-1.5">
        <div className="flex justify-between text-sm">
          <span className="text-slate-300">Neto mensual</span>
          <span className="font-bold">{CLP(totales.neto)}</span>
        </div>
        <div className="flex justify-between text-sm">
          <label className="flex items-center gap-2 cursor-pointer text-slate-300">
            <input
              type="checkbox"
              checked={f.afectoIVA}
              onChange={(e) => set("afectoIVA", e.target.checked)}
              className="w-3.5 h-3.5 rounded accent-red-600"
            />
            Afecto a IVA 19%
          </label>
          <span className="font-bold">{CLP(totales.iva)}</span>
        </div>
        <div className="flex justify-between items-center border-t border-slate-700 pt-2">
          <span className="text-xs font-black uppercase text-slate-300">Total mensual</span>
          <span className="text-xl font-black">{CLP(totales.total)}</span>
        </div>
        {Number(f.plazoMeses) > 0 && (
          <p className="text-xs text-slate-400 text-right">
            Por {f.plazoMeses} meses: {CLP(totales.total * Number(f.plazoMeses))}
          </p>
        )}
      </div>

      <AreaTexto label="Condiciones" rows={3} value={f.condiciones} onChange={(v) => set("condiciones", v)} />
    </Modal>
  );
}
