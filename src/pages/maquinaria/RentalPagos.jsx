import React, { useEffect, useState, useMemo } from "react";
import { useEmpresa } from "../../lib/useEmpresa";
import { useUserRole } from "../../lib/useUserRole";
import { auth } from "../../lib/firebase";
import {
  listRentalPayments, upsertRentalPayment, deleteRentalPayment,
  aprobarEEPP, facturarEEPP, registrarPagoEEPP, anularEEPP,
  registrarFactoring, registrarGestionCobranza,
  uploadPaymentFile, deletePaymentFile,
  listRentalContracts, listRentalClients, listRentalPurchaseOrders,
  suggestPaymentsForContract, saldoContrato,
  estadoEfectivoEEPP, montoTotalEEPP, diasParaVencer, diasVencidoEEPP, agingCobranza,
  desglosarIVA,
  CLP, ESTADOS_EEPP, MEDIOS_PAGO,
} from "../../lib/rental";
import {
  Kpi, Chip, Badge, Aviso, Estado, Dato, Seccion, Campo, Selector, AreaTexto,
  Modal, Panel, BotonPrimario, BotonSecundario, Adjuntos, BarraConsumo, fmtFecha, fmtPeriodo,
} from "../../components/rental/ui";

const PUEDEN_EDITAR = ["superadmin", "admin_contrato", "administrativo"];

const CATEGORIAS_ARCHIVO = {
  factura: "Factura",
  aprobacion: "Aprobación del mandante",
  guia_despacho: "Guía de despacho",
  acta: "Acta o respaldo de terreno",
  otro: "Otro documento",
};

const TIPOS_GESTION = [
  { value: "llamada", label: "Llamada" },
  { value: "correo", label: "Correo" },
  { value: "visita", label: "Visita" },
  { value: "compromiso", label: "Compromiso de pago" },
];

export default function RentalPagos() {
  const { empresaId } = useEmpresa();
  const { role } = useUserRole();
  const puedeEditar = PUEDEN_EDITAR.includes(role);

  const [payments, setPayments] = useState([]);
  const [contracts, setContracts] = useState([]);
  const [clients, setClients] = useState([]);
  const [purchaseOrders, setPurchaseOrders] = useState([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const [vista, setVista] = useState("emision");
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState("abiertos");

  const [showGenerar, setShowGenerar] = useState(false);
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
      const [pa, co, cl, oc] = await Promise.all([
        listRentalPayments(empresaId),
        listRentalContracts(empresaId),
        listRentalClients(empresaId),
        listRentalPurchaseOrders(empresaId),
      ]);
      setPayments(pa); setContracts(co); setClients(cl); setPurchaseOrders(oc);
    } catch (e) {
      setError(e.message || "No se pudieron cargar los estados de pago");
    } finally {
      setLoading(false);
    }
  };

  const vivos = useMemo(() => payments.filter((p) => p.estado !== "anulado"), [payments]);

  const totales = useMemo(() => {
    const abiertos = vivos.filter((p) => estadoEfectivoEEPP(p) !== "pagado");
    const mesActual = new Date().toISOString().slice(0, 7);
    return {
      porCobrar: abiertos.reduce((s, p) => s + montoTotalEEPP(p), 0),
      vencido: abiertos
        .filter((p) => estadoEfectivoEEPP(p) === "vencido")
        .reduce((s, p) => s + montoTotalEEPP(p), 0),
      porFacturar: vivos
        .filter((p) => ["pendiente", "aprobado"].includes(p.estado))
        .reduce((s, p) => s + montoTotalEEPP(p), 0),
      cobradoMes: vivos
        .filter((p) => p.estado === "pagado" && String(p.fechaPago || "").slice(0, 7) === mesActual)
        .reduce((s, p) => s + montoTotalEEPP(p), 0),
    };
  }, [vivos]);

  const aging = useMemo(() => agingCobranza(vivos), [vivos]);

  const filtrados = useMemo(() => {
    const t = busca.trim().toLowerCase();
    let base = payments;

    if (vista === "cobranza") {
      base = base.filter((p) => ["facturado", "vencido"].includes(estadoEfectivoEEPP(p)));
    } else {
      if (filtro === "abiertos") base = base.filter((p) => !["pagado", "anulado"].includes(estadoEfectivoEEPP(p)));
      if (filtro === "porFacturar") base = base.filter((p) => ["pendiente", "aprobado"].includes(p.estado));
      if (filtro === "vencidos") base = base.filter((p) => estadoEfectivoEEPP(p) === "vencido");
      if (filtro === "pagados") base = base.filter((p) => p.estado === "pagado");
      if (filtro === "anulados") base = base.filter((p) => p.estado === "anulado");
    }

    const orden = vista === "cobranza"
      ? (a, b) => diasVencidoEEPP(b) - diasVencidoEEPP(a)
      : (a, b) => String(b.fechaVencimiento || "").localeCompare(String(a.fechaVencimiento || ""));

    const lista = [...base].sort(orden);
    if (!t) return lista;
    return lista.filter((p) =>
      [p.numero, p.clienteNombre, p.contratoNumero, p.ocNumero, p.factura?.numero, p.periodo]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(t))
    );
  }, [payments, vista, filtro, busca]);

  const ficha = payments.find((p) => p.id === fichaId) || null;

  const tras = async (mensaje) => {
    setAviso(mensaje);
    setFichaId(null);
    await refresh();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-slate-900">Estados de pago</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Emisión contra el monto autorizado, facturación y cobranza
          </p>
        </div>
        {puedeEditar && (
          <div className="flex gap-2">
            <BotonSecundario onClick={() => { setEditando(null); setShowForm(true); }}>
              + Manual
            </BotonSecundario>
            <BotonPrimario onClick={() => setShowGenerar(true)}>
              Generar del contrato
            </BotonPrimario>
          </div>
        )}
      </div>

      {error && <Aviso tono="error">{error}</Aviso>}
      {aviso && <Aviso tono="ok">{aviso}</Aviso>}

      <div className="flex gap-1 border-b border-slate-200">
        {[
          { id: "emision", label: "Emisión y facturación" },
          { id: "cobranza", label: "Control de facturas" },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setVista(t.id)}
            className={`px-4 py-2.5 text-sm font-bold border-b-2 -mb-px transition-colors ${
              vista === t.id ? "border-red-600 text-red-600" : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {vista === "emision" ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <Kpi label="Por cobrar" valor={CLP(totales.porCobrar)} tono="amber" />
          <Kpi label="Vencido" valor={CLP(totales.vencido)} tono="red" />
          <Kpi label="Por facturar" valor={CLP(totales.porFacturar)} pie="emitidos sin factura" />
          <Kpi label="Cobrado este mes" valor={CLP(totales.cobradoMes)} tono="emerald" />
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          {Object.entries(aging).map(([clave, t]) => (
            <Kpi
              key={clave}
              label={t.label}
              valor={CLP(t.monto)}
              pie={`${t.cantidad} documento(s)`}
              tono={clave === "porVencer" ? "slate" : clave === "d1_30" ? "amber" : "red"}
              compacto
            />
          ))}
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
        <input
          type="text"
          placeholder="Buscar por folio, cliente, contrato, OC o factura..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="border-2 border-slate-200 focus:border-slate-400 outline-none rounded-xl px-4 py-2.5 text-sm w-full sm:w-96 transition-colors"
        />
        {vista === "emision" && (
          <div className="flex flex-wrap gap-2">
            <Chip activo={filtro === "abiertos"} onClick={() => setFiltro("abiertos")}>Abiertos</Chip>
            <Chip activo={filtro === "porFacturar"} onClick={() => setFiltro("porFacturar")}>Por facturar</Chip>
            <Chip activo={filtro === "vencidos"} onClick={() => setFiltro("vencidos")}>Vencidos</Chip>
            <Chip activo={filtro === "pagados"} onClick={() => setFiltro("pagados")}>Pagados</Chip>
            <Chip activo={filtro === "todos"} onClick={() => setFiltro("todos")}>Todos</Chip>
          </div>
        )}
      </div>

      {loading ? (
        <Estado>Cargando estados de pago...</Estado>
      ) : filtrados.length === 0 ? (
        <Estado>
          {payments.length === 0
            ? "Aún no hay estados de pago. Genéralos desde un contrato activo."
            : "Ningún documento coincide con el filtro."}
        </Estado>
      ) : (
        <div className="space-y-2">
          {filtrados.map((p) => (
            <FilaEEPP key={p.id} eepp={p} vista={vista} onAbrir={() => setFichaId(p.id)} />
          ))}
        </div>
      )}

      {showGenerar && (
        <ModalGenerar
          empresaId={empresaId}
          contracts={contracts.filter((c) => c.estado === "activo")}
          clients={clients}
          purchaseOrders={purchaseOrders}
          payments={payments}
          onClose={() => setShowGenerar(false)}
          onListo={async (n) => { setShowGenerar(false); await tras(`Se crearon ${n} estado(s) de pago.`); }}
        />
      )}

      {showForm && (
        <FormEEPP
          empresaId={empresaId}
          eepp={editando}
          contracts={contracts}
          purchaseOrders={purchaseOrders}
          payments={payments}
          onClose={() => setShowForm(false)}
          onSaved={async () => { setShowForm(false); await tras("Estado de pago guardado."); }}
        />
      )}

      {ficha && (
        <FichaEEPP
          empresaId={empresaId}
          eepp={ficha}
          contrato={contracts.find((c) => c.id === ficha.contratoId)}
          cliente={clients.find((c) => c.id === ficha.clienteId)}
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

function FilaEEPP({ eepp, vista, onAbrir }) {
  const ef = estadoEfectivoEEPP(eepp);
  const dias = diasParaVencer(eepp);
  const mora = diasVencidoEEPP(eepp);

  return (
    <button
      onClick={onAbrir}
      className="w-full text-left bg-white border-2 border-slate-100 hover:border-slate-300 rounded-2xl p-4 transition-colors"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-black text-slate-900">{eepp.numero}</span>
            <Badge estado={ESTADOS_EEPP[ef]} />
            {eepp.factorizada && (
              <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full border bg-violet-100 text-violet-700 border-violet-200">
                Factorizada
              </span>
            )}
            {eepp.prorrateado && (
              <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full border bg-slate-100 text-slate-500 border-slate-200">
                Prorrateado
              </span>
            )}
          </div>
          <p className="text-sm font-semibold text-slate-700 mt-1">{eepp.clienteNombre}</p>
          <p className="text-xs text-slate-400 mt-0.5">
            {[
              eepp.periodo ? fmtPeriodo(eepp.periodo) : null,
              eepp.contratoNumero,
              eepp.ocNumero ? `OC ${eepp.ocNumero}` : null,
              eepp.factura?.numero ? `Factura ${eepp.factura.numero}` : null,
            ].filter(Boolean).join(" · ")}
          </p>
          {vista === "cobranza" && eepp.factoringNombre && (
            <p className="text-xs text-violet-600 font-semibold mt-0.5">Cedida a {eepp.factoringNombre}</p>
          )}
        </div>

        <div className="text-right shrink-0">
          <p className="text-lg font-black text-slate-900">{CLP(montoTotalEEPP(eepp))}</p>
          {ef === "pagado" ? (
            <p className="text-[11px] text-emerald-600 font-bold">Pagado {fmtFecha(eepp.fechaPago)}</p>
          ) : mora > 0 ? (
            <p className="text-[11px] text-red-600 font-bold">{mora} día(s) de mora</p>
          ) : dias != null ? (
            <p className="text-[11px] text-slate-400">Vence en {dias} día(s)</p>
          ) : (
            <p className="text-[11px] text-slate-400">Sin vencimiento</p>
          )}
        </div>
      </div>
    </button>
  );
}

// ============================================================
// Ficha del estado de pago
// ============================================================
function FichaEEPP({ empresaId, eepp, contrato, cliente, puedeEditar, onClose, onEditar, onCambio, onRecargar }) {
  const [accion, setAccion] = useState(null);
  const [error, setError] = useState("");
  const [trabajando, setTrabajando] = useState(false);

  const ef = estadoEfectivoEEPP(eepp);
  const mora = diasVencidoEEPP(eepp);
  const gestiones = [...(eepp.gestiones || [])].reverse();
  const tieneFactura = (eepp.archivos || []).some((a) => a.categoria === "factura");

  const aprobar = async () => {
    setTrabajando(true);
    setError("");
    try {
      await aprobarEEPP(empresaId, eepp.id, {});
      await onCambio("Estado de pago aprobado por el mandante.");
    } catch (e) {
      setError(e.message);
      setTrabajando(false);
    }
  };

  const eliminar = async () => {
    if (!window.confirm(`¿Eliminar el estado de pago ${eepp.numero}?`)) return;
    setTrabajando(true);
    setError("");
    try {
      await deleteRentalPayment(empresaId, eepp.id);
      await onCambio("Estado de pago eliminado.");
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
                <h2 className="text-xl font-black text-slate-900">{eepp.numero}</h2>
                <Badge estado={ESTADOS_EEPP[ef]} />
              </div>
              <p className="text-sm text-slate-500 mt-1">
                {eepp.clienteNombre}
                {eepp.periodo ? ` · ${fmtPeriodo(eepp.periodo)}` : ""}
              </p>
            </div>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-2xl leading-none shrink-0">&times;</button>
          </div>

          {puedeEditar && eepp.estado !== "anulado" && (
            <div className="flex flex-wrap gap-2 mt-4">
              {eepp.estado === "pendiente" && (
                <button onClick={aprobar} disabled={trabajando} className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-bold disabled:opacity-50">
                  Marcar aprobado
                </button>
              )}
              {["pendiente", "aprobado"].includes(eepp.estado) && (
                <button onClick={() => setAccion("facturar")} className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-bold">
                  Facturar
                </button>
              )}
              {eepp.estado === "facturado" && (
                <>
                  <button onClick={() => setAccion("pago")} className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-bold">
                    Registrar pago
                  </button>
                  <button onClick={() => setAccion("factoring")} className="px-3 py-1.5 rounded-lg border-2 border-violet-200 text-violet-700 text-xs font-bold">
                    {eepp.factorizada ? "Editar factoring" : "Factorizar"}
                  </button>
                  <button onClick={() => setAccion("gestion")} className="px-3 py-1.5 rounded-lg border-2 border-slate-200 text-slate-600 text-xs font-bold">
                    Registrar gestión
                  </button>
                </>
              )}
              {eepp.estado === "pendiente" && (
                <button onClick={onEditar} className="px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-bold">
                  Editar
                </button>
              )}
              {eepp.estado !== "pagado" && (
                <button onClick={() => setAccion("anular")} className="px-3 py-1.5 rounded-lg border-2 border-red-200 text-red-600 text-xs font-bold">
                  Anular
                </button>
              )}
              {eepp.estado === "pendiente" && (
                <button onClick={eliminar} disabled={trabajando} className="px-3 py-1.5 rounded-lg border-2 border-slate-200 text-slate-500 text-xs font-bold disabled:opacity-50">
                  Eliminar
                </button>
              )}
            </div>
          )}
        </div>

        <div className="p-6 space-y-5">
          {error && <Aviso tono="error">{error}</Aviso>}

          {eepp.estado === "anulado" && (
            <Aviso tono="info">
              Anulado{eepp.motivoAnulacion ? `: ${eepp.motivoAnulacion}` : ""}. No consume monto autorizado.
            </Aviso>
          )}
          {mora > 0 && eepp.estado !== "pagado" && (
            <Aviso tono="error">
              Vencido hace {mora} día(s). {eepp.factorizada ? `Cedida a ${eepp.factoringNombre}.` : ""}
            </Aviso>
          )}
          {eepp.estado === "aprobado" && !tieneFactura && (
            <Aviso tono="alerta">
              Aprobado por el mandante. Emite la factura en tu plataforma tributaria y súbela aquí para cerrarlo.
            </Aviso>
          )}
          {cliente?.requiereOC && !eepp.ocId && (
            <Aviso tono="alerta">
              Este cliente exige orden de compra y este estado de pago no tiene ninguna asociada.
            </Aviso>
          )}

          {/* Montos */}
          <div className="bg-slate-900 text-white rounded-2xl p-4 space-y-1.5">
            <div className="flex justify-between text-sm">
              <span className="text-slate-300">Neto</span>
              <span className="font-bold">{CLP(eepp.neto)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-300">{eepp.afectoIVA === false ? "Exento" : "IVA 19%"}</span>
              <span className="font-bold">{CLP(eepp.iva)}</span>
            </div>
            <div className="flex justify-between items-center border-t border-slate-700 pt-2">
              <span className="text-xs font-black uppercase text-slate-300">Total</span>
              <span className="text-xl font-black">{CLP(eepp.total)}</span>
            </div>
          </div>

          <div className="bg-white border-2 border-slate-100 rounded-2xl p-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            <Dato label="Concepto" valor={eepp.concepto} />
            <Dato label="Período" valor={eepp.periodo ? fmtPeriodo(eepp.periodo) : "—"} />
            <Dato label="Contrato" valor={eepp.contratoNumero} extra={contrato?.proyectoDestino} />
            <Dato label="Orden de compra" valor={eepp.ocNumero ? `N° ${eepp.ocNumero}` : "Sin OC"} />
            <Dato label="Emisión" valor={fmtFecha(eepp.fechaEmision)} />
            <Dato label="Vencimiento" valor={fmtFecha(eepp.fechaVencimiento)} />
            {eepp.fechaAprobacion && <Dato label="Aprobado el" valor={fmtFecha(eepp.fechaAprobacion)} />}
            {eepp.fechaPago && (
              <Dato label="Pagado el" valor={fmtFecha(eepp.fechaPago)} extra={eepp.medioPago} />
            )}
            {eepp.observaciones && (
              <div className="col-span-2">
                <p className="text-xs font-bold text-slate-400 uppercase">Observaciones</p>
                <p className="text-slate-700 whitespace-pre-line">{eepp.observaciones}</p>
              </div>
            )}
          </div>

          {/* Factura */}
          {eepp.factura && (
            <div className="bg-white border-2 border-blue-100 rounded-2xl p-4">
              <p className="text-xs font-black text-blue-500 uppercase mb-3">Factura emitida</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                <Dato label="Número" valor={eepp.factura.numero} />
                <Dato label="Total facturado" valor={CLP(eepp.factura.total)} />
                <Dato label="Emisión" valor={fmtFecha(eepp.factura.fechaEmision)} />
                <Dato label="Vencimiento" valor={fmtFecha(eepp.factura.fechaVencimiento)} />
                {eepp.factorizada && (
                  <>
                    <Dato label="Factoring" valor={eepp.factoringNombre} />
                    <Dato label="Fecha de cesión" valor={fmtFecha(eepp.fechaCesion)} />
                  </>
                )}
              </div>
            </div>
          )}

          {/* Bitácora de cobranza */}
          {(gestiones.length > 0 || eepp.estado === "facturado") && (
            <div className="bg-white border-2 border-slate-100 rounded-2xl p-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-black text-slate-400 uppercase">Gestiones de cobranza</p>
                {puedeEditar && eepp.estado === "facturado" && (
                  <button onClick={() => setAccion("gestion")} className="text-xs font-bold text-red-600 hover:text-red-700">
                    + Registrar
                  </button>
                )}
              </div>
              {gestiones.length === 0 ? (
                <p className="text-xs text-slate-400">Sin gestiones registradas.</p>
              ) : (
                <div className="space-y-2">
                  {gestiones.map((g) => (
                    <div key={g.id} className="border-l-2 border-slate-200 pl-3 py-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-black text-slate-700 uppercase">
                          {TIPOS_GESTION.find((t) => t.value === g.tipo)?.label || g.tipo}
                        </span>
                        <span className="text-xs text-slate-400">{fmtFecha(g.fecha)}</span>
                        {g.compromisoPago && (
                          <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full border bg-amber-100 text-amber-700 border-amber-200">
                            Compromiso {fmtFecha(g.compromisoPago)}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-slate-700 mt-0.5">{g.detalle}</p>
                      {g.usuario && <p className="text-[11px] text-slate-400">{g.usuario}</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="bg-white border-2 border-slate-100 rounded-2xl p-4">
            <Adjuntos
              titulo="Respaldos"
              vacio="Sube la factura, la aprobación del mandante y los respaldos de terreno."
              archivos={eepp.archivos || []}
              categorias={CATEGORIAS_ARCHIVO}
              disabled={!puedeEditar}
              onSubir={async (file, categoria) => {
                await uploadPaymentFile(empresaId, eepp.id, file, { categoria });
                await onRecargar();
              }}
              onQuitar={async (a) => {
                await deletePaymentFile(empresaId, eepp.id, a);
                await onRecargar();
              }}
            />
          </div>
        </div>
      </Panel>

      {accion === "facturar" && (
        <ModalFacturar
          empresaId={empresaId}
          eepp={eepp}
          cliente={cliente}
          onClose={() => setAccion(null)}
          onListo={() => onCambio("Factura registrada. El estado de pago quedó facturado.")}
        />
      )}
      {accion === "pago" && (
        <ModalPago
          empresaId={empresaId}
          eepp={eepp}
          onClose={() => setAccion(null)}
          onListo={() => onCambio("Pago registrado.")}
        />
      )}
      {accion === "factoring" && (
        <ModalFactoring
          empresaId={empresaId}
          eepp={eepp}
          onClose={() => setAccion(null)}
          onListo={() => onCambio("Datos de factoring actualizados.")}
        />
      )}
      {accion === "gestion" && (
        <ModalGestion
          empresaId={empresaId}
          eepp={eepp}
          onClose={() => setAccion(null)}
          onListo={() => onCambio("Gestión registrada.")}
        />
      )}
      {accion === "anular" && (
        <ModalAnular
          empresaId={empresaId}
          eepp={eepp}
          onClose={() => setAccion(null)}
          onListo={() => onCambio("Estado de pago anulado. El monto vuelve al saldo del contrato.")}
        />
      )}
    </>
  );
}

// ============================================================
// Facturar — paso 6
// ============================================================
function ModalFacturar({ empresaId, eepp, cliente, onClose, onListo }) {
  const [f, setF] = useState({
    numero: "",
    fechaEmision: new Date().toISOString().slice(0, 10),
    diasPago: cliente?.diasPago ?? 30,
    fechaVencimiento: "",
    total: eepp.total,
  });
  const [archivo, setArchivo] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));

  const yaAdjunta = (eepp.archivos || []).some((a) => a.categoria === "factura");

  const guardar = async () => {
    setError("");
    if (!f.numero.trim()) return setError("Ingresa el número de factura");
    if (!f.fechaEmision) return setError("Ingresa la fecha de emisión");
    if (!archivo && !yaAdjunta) return setError("Adjunta el PDF de la factura");

    setSaving(true);
    try {
      const total = Number(f.total || eepp.total);
      const neto = eepp.afectoIVA === false ? total : Math.round(total / 1.19);
      await facturarEEPP(
        empresaId,
        eepp.id,
        { ...f, neto, iva: total - neto, total },
        archivo
      );
      onListo();
    } catch (e) {
      setError(e.message);
      setSaving(false);
    }
  };

  return (
    <Modal
      titulo="Registrar factura"
      subtitulo={`${eepp.numero} · ${eepp.clienteNombre}`}
      onClose={onClose}
      acciones={
        <>
          <BotonSecundario onClick={onClose} className="flex-1">Cancelar</BotonSecundario>
          <BotonPrimario onClick={guardar} disabled={saving} className="flex-1">
            {saving ? "Registrando..." : "Marcar como facturado"}
          </BotonPrimario>
        </>
      }
    >
      {error && <Aviso tono="error">{error}</Aviso>}

      <Aviso tono="info">
        La factura se emite en tu plataforma tributaria. Aquí se registra el número y se guarda el PDF como respaldo.
        Desde este momento la cobranza se rige por el vencimiento de la factura.
      </Aviso>

      <Seccion>
        <Campo label="N° de factura" value={f.numero} onChange={(v) => set("numero", v)} placeholder="00012345" />
        <Campo label="Total facturado" type="number" value={f.total} onChange={(v) => set("total", v)} ayuda={`Del estado de pago: ${CLP(eepp.total)}`} />
        <Campo label="Fecha de emisión" type="date" value={f.fechaEmision} onChange={(v) => set("fechaEmision", v)} />
        <Campo
          label="Días de pago"
          type="number"
          value={f.diasPago}
          onChange={(v) => set("diasPago", v)}
          ayuda="Si dejas la fecha de vencimiento vacía, se calcula con esto"
        />
        <Campo label="Vencimiento" type="date" value={f.fechaVencimiento} onChange={(v) => set("fechaVencimiento", v)} full />
      </Seccion>

      <div>
        <p className="text-xs font-black text-slate-400 uppercase mb-2">PDF de la factura</p>
        <label className="flex items-center justify-between gap-3 border-2 border-dashed border-slate-200 hover:border-slate-300 rounded-xl px-4 py-3 cursor-pointer transition-colors">
          <span className="text-sm font-semibold text-slate-600 truncate">
            {archivo ? archivo.name : yaAdjunta ? "Ya hay una factura adjunta" : "Sube el PDF de la factura"}
          </span>
          <span className="text-xs font-bold text-red-600 shrink-0">Seleccionar</span>
          <input
            type="file"
            accept="application/pdf,image/*"
            className="hidden"
            onChange={(e) => setArchivo(e.target.files?.[0] || null)}
          />
        </label>
        <p className="text-xs text-slate-400 mt-1">Obligatorio: sin respaldo no se marca como facturado.</p>
      </div>
    </Modal>
  );
}

function ModalPago({ empresaId, eepp, onClose, onListo }) {
  const [f, setF] = useState({
    fechaPago: new Date().toISOString().slice(0, 10),
    medioPago: "Transferencia",
    montoPagado: montoTotalEEPP(eepp),
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));

  const guardar = async () => {
    setSaving(true);
    setError("");
    try {
      await registrarPagoEEPP(empresaId, eepp.id, f);
      onListo();
    } catch (e) {
      setError(e.message);
      setSaving(false);
    }
  };

  return (
    <Modal
      titulo="Registrar pago"
      subtitulo={`${eepp.numero} · ${CLP(montoTotalEEPP(eepp))}`}
      onClose={onClose}
      ancho="max-w-lg"
      acciones={
        <>
          <BotonSecundario onClick={onClose} className="flex-1">Cancelar</BotonSecundario>
          <BotonPrimario onClick={guardar} disabled={saving} className="flex-1">
            {saving ? "Guardando..." : "Confirmar pago"}
          </BotonPrimario>
        </>
      }
    >
      {error && <Aviso tono="error">{error}</Aviso>}
      <Seccion>
        <Campo label="Fecha del pago" type="date" value={f.fechaPago} onChange={(v) => set("fechaPago", v)} />
        <Campo label="Monto recibido" type="number" value={f.montoPagado} onChange={(v) => set("montoPagado", v)} />
        <Selector
          label="Medio de pago"
          value={f.medioPago}
          onChange={(v) => set("medioPago", v)}
          opciones={MEDIOS_PAGO.map((m) => ({ value: m, label: m }))}
          placeholder=""
          full
        />
      </Seccion>
    </Modal>
  );
}

function ModalFactoring({ empresaId, eepp, onClose, onListo }) {
  const [f, setF] = useState({
    factorizada: eepp.factorizada !== false && !!eepp.factoringNombre,
    factoringNombre: eepp.factoringNombre || "",
    fechaCesion: eepp.fechaCesion || new Date().toISOString().slice(0, 10),
    montoCedido: eepp.montoCedido ?? montoTotalEEPP(eepp),
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));

  const guardar = async () => {
    setError("");
    if (f.factorizada && !f.factoringNombre.trim()) return setError("Indica con qué factoring se cedió");
    setSaving(true);
    try {
      await registrarFactoring(empresaId, eepp.id, f);
      onListo();
    } catch (e) {
      setError(e.message);
      setSaving(false);
    }
  };

  return (
    <Modal
      titulo="Factoring"
      subtitulo={`Factura ${eepp.factura?.numero || eepp.numero}`}
      onClose={onClose}
      ancho="max-w-lg"
      acciones={
        <>
          <BotonSecundario onClick={onClose} className="flex-1">Cancelar</BotonSecundario>
          <BotonPrimario onClick={guardar} disabled={saving} className="flex-1">
            {saving ? "Guardando..." : "Guardar"}
          </BotonPrimario>
        </>
      }
    >
      {error && <Aviso tono="error">{error}</Aviso>}

      <label className="flex items-center gap-2.5 cursor-pointer">
        <input
          type="checkbox"
          checked={f.factorizada}
          onChange={(e) => set("factorizada", e.target.checked)}
          className="w-4 h-4 rounded accent-violet-600"
        />
        <span className="text-sm font-semibold text-slate-700">Esta factura fue cedida a factoring</span>
      </label>

      {f.factorizada && (
        <Seccion>
          <Campo label="Empresa de factoring" value={f.factoringNombre} onChange={(v) => set("factoringNombre", v)} full />
          <Campo label="Fecha de cesión" type="date" value={f.fechaCesion} onChange={(v) => set("fechaCesion", v)} />
          <Campo label="Monto cedido" type="number" value={f.montoCedido} onChange={(v) => set("montoCedido", v)} />
        </Seccion>
      )}
    </Modal>
  );
}

function ModalGestion({ empresaId, eepp, onClose, onListo }) {
  const [f, setF] = useState({
    fecha: new Date().toISOString().slice(0, 10),
    tipo: "llamada",
    detalle: "",
    compromisoPago: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));

  const guardar = async () => {
    setError("");
    if (!f.detalle.trim()) return setError("Escribe qué se hizo en esta gestión");
    setSaving(true);
    try {
      await registrarGestionCobranza(empresaId, eepp.id, {
        ...f,
        usuario: auth.currentUser?.email || "",
      });
      onListo();
    } catch (e) {
      setError(e.message);
      setSaving(false);
    }
  };

  return (
    <Modal
      titulo="Registrar gestión de cobranza"
      subtitulo={`${eepp.numero} · ${eepp.clienteNombre}`}
      onClose={onClose}
      ancho="max-w-lg"
      acciones={
        <>
          <BotonSecundario onClick={onClose} className="flex-1">Cancelar</BotonSecundario>
          <BotonPrimario onClick={guardar} disabled={saving} className="flex-1">
            {saving ? "Guardando..." : "Guardar gestión"}
          </BotonPrimario>
        </>
      }
    >
      {error && <Aviso tono="error">{error}</Aviso>}
      <Seccion>
        <Campo label="Fecha" type="date" value={f.fecha} onChange={(v) => set("fecha", v)} />
        <Selector
          label="Tipo"
          value={f.tipo}
          onChange={(v) => set("tipo", v)}
          opciones={TIPOS_GESTION}
          placeholder=""
        />
        <AreaTexto label="Qué se hizo" rows={3} value={f.detalle} onChange={(v) => set("detalle", v)} />
        <Campo
          label="Compromiso de pago"
          type="date"
          value={f.compromisoPago}
          onChange={(v) => set("compromisoPago", v)}
          ayuda="Si el cliente se comprometió a una fecha"
          full
        />
      </Seccion>
    </Modal>
  );
}

function ModalAnular({ empresaId, eepp, onClose, onListo }) {
  const [motivo, setMotivo] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const guardar = async () => {
    setError("");
    if (!motivo.trim()) return setError("Indica el motivo de la anulación");
    setSaving(true);
    try {
      await anularEEPP(empresaId, eepp.id, motivo);
      onListo();
    } catch (e) {
      setError(e.message);
      setSaving(false);
    }
  };

  return (
    <Modal
      titulo="Anular estado de pago"
      subtitulo={eepp.numero}
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
            {saving ? "Anulando..." : "Anular"}
          </button>
        </>
      }
    >
      {error && <Aviso tono="error">{error}</Aviso>}
      <Aviso tono="alerta">
        El documento se conserva con su folio, pero deja de consumir el monto autorizado del contrato.
      </Aviso>
      <AreaTexto label="Motivo" rows={3} value={motivo} onChange={setMotivo} />
    </Modal>
  );
}

// ============================================================
// Generar estados de pago desde un contrato
// ============================================================
function ModalGenerar({ empresaId, contracts, clients, purchaseOrders, payments, onClose, onListo }) {
  const [contratoId, setContratoId] = useState("");
  const [prorratear, setProrratear] = useState(true);
  const [seleccion, setSeleccion] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const contrato = contracts.find((c) => c.id === contratoId);
  const cliente = clients.find((c) => c.id === contrato?.clienteId);
  const saldo = contrato ? saldoContrato(contrato, purchaseOrders, payments) : null;

  // Períodos ya emitidos, para no duplicar.
  const yaEmitidos = useMemo(() => {
    const set = new Set();
    for (const p of payments) {
      if (p.contratoId === contratoId && p.estado !== "anulado" && p.periodo) set.add(p.periodo);
    }
    return set;
  }, [payments, contratoId]);

  const sugeridos = useMemo(() => {
    if (!contrato) return [];
    return suggestPaymentsForContract(contrato, {
      prorratear,
      diasPago: cliente?.diasPago ?? 30,
    });
  }, [contrato, prorratear, cliente]);

  const disponibles = sugeridos.filter((s) => !yaEmitidos.has(s.periodo));

  const marcados = disponibles.filter((s) => seleccion[s.periodo]);
  const netoMarcado = marcados.reduce((s, x) => s + x.neto, 0);
  const excede = saldo && saldo.autorizado > 0 && netoMarcado > saldo.saldo;

  const alternar = (periodo) => setSeleccion((p) => ({ ...p, [periodo]: !p[periodo] }));
  const marcarTodos = () => {
    const todos = {};
    for (const s of disponibles) todos[s.periodo] = true;
    setSeleccion(todos);
  };

  const guardar = async () => {
    setError("");
    if (!marcados.length) return setError("Selecciona al menos un período");
    setSaving(true);
    try {
      let creados = 0;
      // Secuencial: cada folio se toma en su propia transacción y el control
      // de saldo necesita ver los anteriores ya guardados.
      for (const s of marcados) {
        await upsertRentalPayment(empresaId, s);
        creados++;
      }
      onListo(creados);
    } catch (e) {
      setError(`${e.message} (se alcanzaron a crear los anteriores)`);
      setSaving(false);
    }
  };

  return (
    <Modal
      titulo="Generar estados de pago"
      subtitulo="Se proponen los períodos del contrato; tú eliges cuáles emitir"
      onClose={onClose}
      ancho="max-w-2xl"
      acciones={
        <>
          <BotonSecundario onClick={onClose} className="flex-1">Cancelar</BotonSecundario>
          <BotonPrimario onClick={guardar} disabled={saving || !marcados.length || excede} className="flex-1">
            {saving ? "Creando..." : `Crear ${marcados.length || ""} estado(s) de pago`}
          </BotonPrimario>
        </>
      }
    >
      {error && <Aviso tono="error">{error}</Aviso>}

      <Selector
        label="Contrato"
        value={contratoId}
        onChange={(v) => { setContratoId(v); setSeleccion({}); }}
        opciones={contracts.map((c) => ({
          value: c.id,
          label: `${c.numero} — ${c.clienteNombre}`,
        }))}
        full
      />

      {contrato && saldo && (
        <div className="bg-white border-2 border-slate-100 rounded-2xl p-4">
          <div className="flex justify-between text-sm mb-2">
            <span className="text-slate-500 font-semibold">Saldo autorizado</span>
            <span className={`font-black ${saldo.saldo <= 0 ? "text-red-600" : "text-slate-900"}`}>
              {CLP(saldo.saldo)}
            </span>
          </div>
          <BarraConsumo pct={saldo.pct} />
          <p className="text-[11px] text-slate-400 mt-1">
            {saldo.autorizado > 0
              ? `${saldo.pct}% consumido de ${CLP(saldo.autorizado)} netos autorizados`
              : "Este contrato no tiene OC asociada, así que no hay tope de control."}
          </p>
        </div>
      )}

      {contrato && (
        <label className="flex items-center gap-2.5 cursor-pointer">
          <input
            type="checkbox"
            checked={prorratear}
            onChange={(e) => setProrratear(e.target.checked)}
            className="w-4 h-4 rounded accent-red-600"
          />
          <span className="text-sm font-semibold text-slate-700">
            Prorratear el primer y último mes según los días arrendados
          </span>
        </label>
      )}

      {contrato && disponibles.length === 0 && (
        <Aviso tono="info">
          {sugeridos.length === 0
            ? "Este contrato no tiene fecha de inicio o tarifas, así que no se pueden proponer períodos."
            : "Todos los períodos de este contrato ya tienen estado de pago emitido."}
        </Aviso>
      )}

      {disponibles.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-black text-slate-400 uppercase">
              Períodos disponibles ({disponibles.length})
            </p>
            <button onClick={marcarTodos} className="text-xs font-bold text-red-600 hover:text-red-700">
              Seleccionar todos
            </button>
          </div>

          <div className="space-y-1.5 max-h-64 overflow-y-auto">
            {disponibles.map((s) => (
              <label
                key={s.periodo}
                className={`flex items-center gap-3 border-2 rounded-xl p-3 cursor-pointer transition-colors ${
                  seleccion[s.periodo] ? "border-slate-900 bg-slate-50" : "border-slate-200"
                }`}
              >
                <input
                  type="checkbox"
                  checked={!!seleccion[s.periodo]}
                  onChange={() => alternar(s.periodo)}
                  className="w-4 h-4 rounded accent-red-600"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-slate-800">{fmtPeriodo(s.periodo)}</p>
                  <p className="text-xs text-slate-400">
                    {[
                      s.prorrateado ? `${s.diasCubiertos} días` : "mes completo",
                      `vence ${fmtFecha(s.fechaVencimiento)}`,
                    ].join(" · ")}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-black text-slate-900">{CLP(s.total)}</p>
                  <p className="text-[11px] text-slate-400">{CLP(s.neto)} neto</p>
                </div>
              </label>
            ))}
          </div>

          {marcados.length > 0 && (
            <div className={`mt-3 rounded-2xl p-4 ${excede ? "bg-red-50 border-2 border-red-200" : "bg-slate-900 text-white"}`}>
              <div className="flex justify-between text-sm">
                <span className={excede ? "text-red-700 font-semibold" : "text-slate-300"}>
                  {marcados.length} período(s) · neto
                </span>
                <span className={`font-black ${excede ? "text-red-700" : ""}`}>{CLP(netoMarcado)}</span>
              </div>
              {excede && (
                <p className="text-xs font-bold text-red-700 mt-2">
                  Supera el saldo autorizado ({CLP(saldo.saldo)}). Registra una enmienda en el contrato
                  o selecciona menos períodos.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

// ============================================================
// Formulario manual de estado de pago
// ============================================================
function FormEEPP({ empresaId, eepp, contracts, purchaseOrders, payments, onClose, onSaved }) {
  const [f, setF] = useState({
    contratoId: eepp?.contratoId || "",
    ocId: eepp?.ocId || "",
    periodo: eepp?.periodo || new Date().toISOString().slice(0, 7),
    concepto: eepp?.concepto || "",
    neto: eepp?.neto || "",
    afectoIVA: eepp?.afectoIVA !== false,
    fechaEmision: eepp?.fechaEmision || new Date().toISOString().slice(0, 10),
    fechaVencimiento: eepp?.fechaVencimiento || "",
    observaciones: eepp?.observaciones || "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));

  const contrato = contracts.find((c) => c.id === f.contratoId);
  const saldo = contrato ? saldoContrato(contrato, purchaseOrders, payments) : null;
  const totales = desglosarIVA(f.neto, { afectoIVA: f.afectoIVA });

  const ocsDelContrato = purchaseOrders.filter(
    (o) => o.contratoId === f.contratoId && o.estado !== "anulada"
  );

  const guardar = async () => {
    setError("");
    if (!f.contratoId) return setError("Selecciona el contrato al que pertenece");
    if (!Number(f.neto)) return setError("Ingresa el monto neto");
    setSaving(true);
    try {
      await upsertRentalPayment(empresaId, {
        id: eepp?.id,
        numero: eepp?.numero,
        ...f,
      });
      onSaved();
    } catch (e) {
      setError(e.message);
      setSaving(false);
    }
  };

  return (
    <Modal
      titulo={eepp ? `Editar ${eepp.numero}` : "Estado de pago manual"}
      onClose={onClose}
      acciones={
        <>
          <BotonSecundario onClick={onClose} className="flex-1">Cancelar</BotonSecundario>
          <BotonPrimario onClick={guardar} disabled={saving} className="flex-1">
            {saving ? "Guardando..." : "Guardar"}
          </BotonPrimario>
        </>
      }
    >
      {error && <Aviso tono="error">{error}</Aviso>}

      <Seccion titulo="Origen">
        <Selector
          label="Contrato"
          value={f.contratoId}
          onChange={(v) => { set("contratoId", v); set("ocId", ""); }}
          opciones={contracts.map((c) => ({ value: c.id, label: `${c.numero} — ${c.clienteNombre}` }))}
          full
          disabled={!!eepp}
        />
        {ocsDelContrato.length > 0 && (
          <Selector
            label="Imputar a la OC"
            value={f.ocId}
            onChange={(v) => set("ocId", v)}
            opciones={ocsDelContrato.map((o) => ({
              value: o.id,
              label: `N° ${o.numeroOC}${o.tipo === "enmienda" ? " (enmienda)" : ""} — ${CLP(o.montoNeto)}`,
            }))}
            placeholder="Automático: la primera con saldo"
            full
          />
        )}
      </Seccion>

      {saldo && saldo.autorizado > 0 && (
        <div className="bg-white border-2 border-slate-100 rounded-2xl p-3">
          <div className="flex justify-between text-sm mb-2">
            <span className="text-slate-500 font-semibold">Saldo autorizado</span>
            <span className={`font-black ${saldo.saldo <= 0 ? "text-red-600" : "text-slate-900"}`}>{CLP(saldo.saldo)}</span>
          </div>
          <BarraConsumo pct={saldo.pct} />
        </div>
      )}

      <Seccion titulo="Detalle">
        <Campo label="Período" value={f.periodo} onChange={(v) => set("periodo", v)} placeholder="2026-09" />
        <Campo label="Monto neto" type="number" value={f.neto} onChange={(v) => set("neto", v)} />
        <Campo label="Fecha de emisión" type="date" value={f.fechaEmision} onChange={(v) => set("fechaEmision", v)} />
        <Campo label="Vencimiento" type="date" value={f.fechaVencimiento} onChange={(v) => set("fechaVencimiento", v)} />
        <Campo label="Concepto" value={f.concepto} onChange={(v) => set("concepto", v)} full placeholder="Arriendo septiembre 2026" />
        <AreaTexto label="Observaciones" rows={2} value={f.observaciones} onChange={(v) => set("observaciones", v)} />
      </Seccion>

      <div className="bg-slate-900 text-white rounded-2xl p-4 space-y-1.5">
        <div className="flex justify-between text-sm">
          <span className="text-slate-300">Neto</span>
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
          <span className="text-xs font-black uppercase text-slate-300">Total a cobrar</span>
          <span className="text-xl font-black">{CLP(totales.total)}</span>
        </div>
      </div>
    </Modal>
  );
}
