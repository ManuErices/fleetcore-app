import React, { useEffect, useState, useMemo } from "react";
import { useEmpresa } from "../../lib/useEmpresa";
import { useUserRole } from "../../lib/useUserRole";
import { listMachines } from "../../lib/db";
import {
  listRentalContracts, upsertRentalContract, deleteRentalContract, finalizarRentalContract,
  listRentalClients, listRentalPurchaseOrders, listRentalPayments,
  saldoContrato, saldoOC, agregarEnmiendaContrato,
  uploadContractFile, deleteContractFile,
  ingresoMensualLinea, totalesDocumento,
  estadoEfectivoEEPP, montoTotalEEPP,
  CLP, ESTADOS_CONTRATO, ESTADOS_EEPP, ESTADOS_OC,
} from "../../lib/rental";
import {
  Kpi, Chip, Badge, Aviso, Estado, Dato, Seccion, Campo, Selector, AreaTexto,
  Modal, Panel, BotonPrimario, BotonSecundario, Adjuntos, BarraConsumo, fmtFecha, fmtPeriodo,
} from "../../components/rental/ui";

const PUEDEN_EDITAR = ["superadmin", "admin_contrato", "administrativo"];

const TARIFAS = [
  { value: "mes", label: "Por mes" },
  { value: "dia", label: "Por día" },
  { value: "hora", label: "Por hora" },
];

const CATEGORIAS_ARCHIVO = {
  contrato_firmado: "Contrato firmado",
  anexo: "Anexo o enmienda",
  acta_entrega: "Acta de entrega",
  otro: "Otro documento",
};

// Días que faltan para que termine el contrato (null si es indefinido).
function diasParaTermino(contrato) {
  if (!contrato?.fechaFin) return null;
  const [y, m, d] = String(contrato.fechaFin).slice(0, 10).split("-").map(Number);
  const fin = new Date(y, (m || 1) - 1, d || 1);
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  return Math.ceil((fin - hoy) / 86400000);
}

export default function RentalContratos() {
  const { empresaId } = useEmpresa();
  const { role } = useUserRole();
  const puedeEditar = PUEDEN_EDITAR.includes(role);

  const [contracts, setContracts] = useState([]);
  const [clients, setClients] = useState([]);
  const [machines, setMachines] = useState([]);
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [payments, setPayments] = useState([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState("activos");

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
      const [co, cl, m, oc, pa] = await Promise.all([
        listRentalContracts(empresaId),
        listRentalClients(empresaId),
        listMachines(empresaId),
        listRentalPurchaseOrders(empresaId),
        listRentalPayments(empresaId),
      ]);
      setContracts(co); setClients(cl); setMachines(m);
      setPurchaseOrders(oc); setPayments(pa);
    } catch (e) {
      setError(e.message || "No se pudieron cargar los contratos");
    } finally {
      setLoading(false);
    }
  };

  // Saldo autorizado de cada contrato, calculado una sola vez.
  const saldos = useMemo(() => {
    const map = {};
    for (const c of contracts) map[c.id] = saldoContrato(c, purchaseOrders, payments);
    return map;
  }, [contracts, purchaseOrders, payments]);

  const filtrados = useMemo(() => {
    const t = busca.trim().toLowerCase();
    let base = contracts;

    if (filtro === "activos") base = base.filter((c) => c.estado === "activo");
    if (filtro === "enmienda") base = base.filter((c) => c.estado === "activo" && saldos[c.id]?.requiereEnmienda);
    if (filtro === "porVencer") base = base.filter((c) => {
      const d = diasParaTermino(c);
      return c.estado === "activo" && d != null && d <= 30;
    });
    if (filtro === "finalizados") base = base.filter((c) => ["finalizado", "cancelado"].includes(c.estado));

    if (!t) return base;
    return base.filter((c) =>
      [c.numero, c.clienteNombre, c.ocNumero, c.proyectoDestino]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(t))
    );
  }, [contracts, filtro, busca, saldos]);

  const totales = useMemo(() => {
    const activos = contracts.filter((c) => c.estado === "activo");
    return {
      activos: activos.length,
      mensual: activos.reduce((s, c) => s + Number(c.totalMensual || 0), 0),
      saldo: activos.reduce((s, c) => s + (saldos[c.id]?.saldo || 0), 0),
      enmienda: activos.filter((c) => saldos[c.id]?.requiereEnmienda).length,
    };
  }, [contracts, saldos]);

  const ficha = contracts.find((c) => c.id === fichaId) || null;

  const tras = async (mensaje) => {
    setAviso(mensaje);
    setFichaId(null);
    await refresh();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-slate-900">Contratos</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Equipos comprometidos, monto autorizado por la OC y saldo por facturar
          </p>
        </div>
        {puedeEditar && (
          <BotonPrimario onClick={() => { setEditando(null); setShowForm(true); }}>
            + Contrato manual
          </BotonPrimario>
        )}
      </div>

      {error && <Aviso tono="error">{error}</Aviso>}
      {aviso && <Aviso tono="ok">{aviso}</Aviso>}

      {totales.enmienda > 0 && (
        <Aviso tono="alerta">
          {totales.enmienda === 1
            ? "Hay 1 contrato con más del 90% del monto autorizado consumido. Pídele la enmienda al cliente antes de que se frene la facturación."
            : `Hay ${totales.enmienda} contratos con más del 90% del monto autorizado consumido. Pide las enmiendas antes de que se frene la facturación.`}
        </Aviso>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <Kpi label="Contratos activos" valor={totales.activos} tono="emerald" />
        <Kpi label="Facturación mensual" valor={CLP(totales.mensual)} pie="total con IVA" />
        <Kpi label="Saldo por facturar" valor={CLP(totales.saldo)} pie="neto autorizado disponible" />
        <Kpi label="Necesitan enmienda" valor={totales.enmienda} tono={totales.enmienda ? "amber" : "slate"} />
      </div>

      <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
        <input
          type="text"
          placeholder="Buscar por folio, cliente, OC u obra..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="border-2 border-slate-200 focus:border-slate-400 outline-none rounded-xl px-4 py-2.5 text-sm w-full sm:w-96 transition-colors"
        />
        <div className="flex flex-wrap gap-2">
          <Chip activo={filtro === "activos"} onClick={() => setFiltro("activos")}>Activos</Chip>
          <Chip activo={filtro === "enmienda"} onClick={() => setFiltro("enmienda")}>Necesitan enmienda</Chip>
          <Chip activo={filtro === "porVencer"} onClick={() => setFiltro("porVencer")}>Por terminar</Chip>
          <Chip activo={filtro === "finalizados"} onClick={() => setFiltro("finalizados")}>Cerrados</Chip>
          <Chip activo={filtro === "todos"} onClick={() => setFiltro("todos")}>Todos</Chip>
        </div>
      </div>

      {loading ? (
        <Estado>Cargando contratos...</Estado>
      ) : filtrados.length === 0 ? (
        <Estado>
          {contracts.length === 0
            ? "Aún no hay contratos. Se generan desde una cotización aceptada con su orden de compra."
            : "Ningún contrato coincide con el filtro."}
        </Estado>
      ) : (
        <div className="space-y-2">
          {filtrados.map((c) => (
            <FilaContrato key={c.id} contrato={c} saldo={saldos[c.id]} onAbrir={() => setFichaId(c.id)} />
          ))}
        </div>
      )}

      {showForm && (
        <FormContrato
          empresaId={empresaId}
          contrato={editando}
          clients={clients}
          machines={machines}
          onClose={() => setShowForm(false)}
          onSaved={async () => { setShowForm(false); await tras("Contrato guardado."); }}
        />
      )}

      {ficha && (
        <FichaContrato
          empresaId={empresaId}
          contrato={ficha}
          saldo={saldos[ficha.id]}
          machines={machines}
          clients={clients}
          payments={payments}
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

function FilaContrato({ contrato, saldo, onAbrir }) {
  const dias = diasParaTermino(contrato);
  const s = saldo || {};

  return (
    <button
      onClick={onAbrir}
      className="w-full text-left bg-white border-2 border-slate-100 hover:border-slate-300 rounded-2xl p-4 transition-colors"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-black text-slate-900">{contrato.numero || "Sin folio"}</span>
            <Badge estado={ESTADOS_CONTRATO[contrato.estado]} />
            {s.requiereEnmienda && !s.agotado && (
              <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full border bg-amber-100 text-amber-700 border-amber-200">
                Pedir enmienda
              </span>
            )}
            {s.agotado && s.autorizado > 0 && (
              <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full border bg-red-100 text-red-700 border-red-200">
                Monto agotado
              </span>
            )}
            {s.autorizado === 0 && contrato.estado === "activo" && (
              <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full border bg-slate-100 text-slate-500 border-slate-200">
                Sin OC
              </span>
            )}
          </div>
          <p className="text-sm font-semibold text-slate-700 mt-1">{contrato.clienteNombre}</p>
          <p className="text-xs text-slate-400 mt-0.5">
            {[
              `${(contrato.lineas || []).length} equipo(s)`,
              contrato.fechaInicio ? `desde ${fmtFecha(contrato.fechaInicio)}` : null,
              contrato.fechaFin ? `hasta ${fmtFecha(contrato.fechaFin)}` : "sin término",
              contrato.estado === "activo" && dias != null && dias >= 0 && dias <= 30
                ? `termina en ${dias} día(s)`
                : null,
              contrato.proyectoDestino || null,
            ].filter(Boolean).join(" · ")}
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-lg font-black text-slate-900">{CLP(contrato.totalMensual)}</p>
          <p className="text-[11px] text-slate-400">total mensual</p>
        </div>
      </div>

      {s.autorizado > 0 && (
        <div className="mt-3">
          <BarraConsumo pct={s.pct} />
          <div className="flex justify-between text-[11px] text-slate-400 mt-1">
            <span>{s.pct}% facturado de {CLP(s.autorizado)} netos</span>
            <span className={s.saldo <= 0 ? "text-red-600 font-bold" : ""}>
              Saldo {CLP(s.saldo)}
            </span>
          </div>
        </div>
      )}
    </button>
  );
}

// ============================================================
// Ficha del contrato
// ============================================================
function FichaContrato({ empresaId, contrato, saldo, machines, clients, payments, puedeEditar, onClose, onEditar, onCambio, onRecargar }) {
  const [accion, setAccion] = useState(null);
  const [error, setError] = useState("");
  const [trabajando, setTrabajando] = useState(false);

  const s = saldo || {};
  const cliente = clients.find((c) => c.id === contrato.clienteId);
  const eepps = payments.filter((p) => p.contratoId === contrato.id);
  const activo = contrato.estado === "activo";

  const cerrar = async (estado) => {
    const verbo = estado === "finalizado" ? "finalizar" : "cancelar";
    if (!window.confirm(`¿${verbo === "finalizar" ? "Finalizar" : "Cancelar"} el contrato ${contrato.numero}? Los equipos quedarán disponibles.`)) return;
    setTrabajando(true);
    setError("");
    try {
      await finalizarRentalContract(empresaId, contrato.id, estado);
      await onCambio(`Contrato ${estado}. Los equipos quedaron disponibles.`);
    } catch (e) {
      setError(e.message);
      setTrabajando(false);
    }
  };

  const eliminar = async () => {
    if (!window.confirm(`¿Eliminar el contrato ${contrato.numero}?`)) return;
    setTrabajando(true);
    setError("");
    try {
      await deleteRentalContract(empresaId, contrato.id);
      await onCambio("Contrato eliminado y equipos liberados.");
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
                <h2 className="text-xl font-black text-slate-900">{contrato.numero || "Sin folio"}</h2>
                <Badge estado={ESTADOS_CONTRATO[contrato.estado]} />
              </div>
              <p className="text-sm text-slate-500 mt-1">
                {contrato.clienteNombre}
                {contrato.proyectoDestino ? ` · ${contrato.proyectoDestino}` : ""}
              </p>
            </div>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-2xl leading-none shrink-0">&times;</button>
          </div>

          {puedeEditar && (
            <div className="flex flex-wrap gap-2 mt-4">
              {activo && (
                <button onClick={() => setAccion("enmienda")} className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-bold">
                  Registrar enmienda
                </button>
              )}
              <button onClick={onEditar} className="px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-bold">
                Editar
              </button>
              {activo && (
                <>
                  <button onClick={() => cerrar("finalizado")} disabled={trabajando} className="px-3 py-1.5 rounded-lg border-2 border-slate-200 text-slate-600 text-xs font-bold disabled:opacity-50">
                    Finalizar
                  </button>
                  <button onClick={() => cerrar("cancelado")} disabled={trabajando} className="px-3 py-1.5 rounded-lg border-2 border-red-200 text-red-600 text-xs font-bold disabled:opacity-50">
                    Cancelar
                  </button>
                </>
              )}
              {eepps.length === 0 && (
                <button onClick={eliminar} disabled={trabajando} className="px-3 py-1.5 rounded-lg border-2 border-slate-200 text-slate-500 text-xs font-bold disabled:opacity-50">
                  Eliminar
                </button>
              )}
            </div>
          )}
        </div>

        <div className="p-6 space-y-5">
          {error && <Aviso tono="error">{error}</Aviso>}

          {s.autorizado === 0 && (
            <Aviso tono="alerta">
              Este contrato no tiene orden de compra asociada, así que los estados de pago no tienen tope de control.
              Registra la OC del cliente como enmienda para activar el control de saldo.
            </Aviso>
          )}
          {s.agotado && s.autorizado > 0 && (
            <Aviso tono="error">
              El monto autorizado se agotó. No podrás emitir más estados de pago hasta registrar una enmienda con la nueva OC.
            </Aviso>
          )}
          {s.requiereEnmienda && !s.agotado && (
            <Aviso tono="alerta">
              Vas en el {s.pct}% del monto autorizado. Queda {CLP(s.saldo)} por facturar: conviene pedir la enmienda ahora.
            </Aviso>
          )}

          {/* Monto autorizado y consumo */}
          <div className="bg-white border-2 border-slate-100 rounded-2xl p-4">
            <p className="text-xs font-black text-slate-400 uppercase mb-3">Monto autorizado</p>
            <div className="grid grid-cols-3 gap-3 mb-3">
              <div>
                <p className="text-[11px] text-slate-400">Autorizado</p>
                <p className="text-base font-black text-slate-900">{CLP(s.autorizado)}</p>
              </div>
              <div>
                <p className="text-[11px] text-slate-400">Facturado</p>
                <p className="text-base font-black text-slate-700">{CLP(s.consumido)}</p>
              </div>
              <div>
                <p className="text-[11px] text-slate-400">Saldo</p>
                <p className={`text-base font-black ${s.saldo <= 0 ? "text-red-600" : "text-emerald-600"}`}>{CLP(s.saldo)}</p>
              </div>
            </div>
            <BarraConsumo pct={s.pct} />
            <p className="text-[11px] text-slate-400 mt-1">{s.pct}% consumido · montos netos</p>

            <div className="mt-4 space-y-2">
              {(s.ocs || []).map((oc) => {
                const so = saldoOC(oc, eepps);
                return (
                  <div key={oc.id} className="border border-slate-200 rounded-xl p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-bold text-slate-800">OC N° {oc.numeroOC}</span>
                          <Badge estado={ESTADOS_OC[oc.estado]} />
                          {oc.tipo === "enmienda" && (
                            <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full border bg-indigo-100 text-indigo-700 border-indigo-200">
                              Enmienda
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-400 mt-0.5">
                          {[fmtFecha(oc.fechaEmision), `${(oc.archivos || []).length} respaldo(s)`].filter(Boolean).join(" · ")}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-black text-slate-900">{CLP(oc.montoNeto)}</p>
                        <p className="text-[11px] text-slate-400">saldo {CLP(so.saldo)}</p>
                      </div>
                    </div>
                    {(oc.archivos || []).length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-2">
                        {oc.archivos.map((a) => (
                          <a
                            key={a.path}
                            href={a.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs font-bold text-red-600 hover:text-red-700 underline"
                          >
                            {a.nombre}
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
              {(s.ocs || []).length === 0 && (
                <p className="text-xs text-slate-400">Sin órdenes de compra asociadas.</p>
              )}
            </div>
          </div>

          <div className="bg-white border-2 border-slate-100 rounded-2xl p-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            <Dato label="Inicio" valor={fmtFecha(contrato.fechaInicio)} />
            <Dato label="Término" valor={contrato.fechaFin ? fmtFecha(contrato.fechaFin) : "Indefinido"} />
            <Dato label="RUT del cliente" valor={cliente?.rut} />
            <Dato label="Condición de pago" valor={`${cliente?.diasPago ?? 30} días`} />
            {contrato.cotizacionNumero && <Dato label="Cotización de origen" valor={contrato.cotizacionNumero} />}
            <Dato label="Facturación mensual" valor={CLP(contrato.totalMensual)} extra={`${CLP(contrato.netoMensual)} neto`} />
          </div>

          {/* Equipos */}
          <div>
            <p className="text-xs font-black text-slate-400 uppercase mb-2">Equipos comprometidos</p>
            <div className="bg-white border-2 border-slate-100 rounded-2xl divide-y divide-slate-100">
              {(contrato.lineas || []).map((l, i) => {
                const m = machines.find((x) => x.id === l.machineId);
                return (
                  <div key={i} className="p-3 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-slate-800">{m?.name || l.descripcion || l.code || "Equipo"}</p>
                      <p className="text-xs text-slate-400">
                        {[m?.code, `${CLP(l.tarifaValor)} por ${l.tarifaTipo}`].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                    <p className="text-sm font-black text-slate-900 shrink-0">{CLP(ingresoMensualLinea(l))}</p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Estados de pago del contrato */}
          <div>
            <p className="text-xs font-black text-slate-400 uppercase mb-2">
              Estados de pago ({eepps.length})
            </p>
            {eepps.length === 0 ? (
              <p className="text-sm text-slate-400 py-4 text-center bg-white border-2 border-slate-100 rounded-2xl">
                Todavía no se emiten estados de pago para este contrato.
              </p>
            ) : (
              <div className="space-y-2">
                {eepps.map((p) => (
                  <div key={p.id} className="bg-white border-2 border-slate-100 rounded-xl p-3 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-bold text-slate-800">{p.numero}</span>
                        <Badge estado={ESTADOS_EEPP[estadoEfectivoEEPP(p)]} />
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {[
                          p.periodo ? fmtPeriodo(p.periodo) : null,
                          p.factura?.numero ? `Factura ${p.factura.numero}` : null,
                          p.fechaVencimiento ? `vence ${fmtFecha(p.fechaVencimiento)}` : null,
                        ].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-black text-slate-900">{CLP(montoTotalEEPP(p))}</p>
                      <p className="text-[11px] text-slate-400">{CLP(p.neto)} neto</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {contrato.condiciones && (
            <div className="bg-white border-2 border-slate-100 rounded-2xl p-4">
              <p className="text-xs font-black text-slate-400 uppercase mb-1">Condiciones</p>
              <p className="text-sm text-slate-700 whitespace-pre-line">{contrato.condiciones}</p>
            </div>
          )}

          <div className="bg-white border-2 border-slate-100 rounded-2xl p-4">
            <Adjuntos
              titulo="Documentos del contrato"
              vacio="Sube aquí el contrato firmado y sus anexos."
              archivos={contrato.archivos || []}
              categorias={CATEGORIAS_ARCHIVO}
              disabled={!puedeEditar}
              onSubir={async (file, categoria) => {
                await uploadContractFile(empresaId, contrato.id, file, { categoria });
                await onRecargar();
              }}
              onQuitar={async (a) => {
                await deleteContractFile(empresaId, contrato.id, a);
                await onRecargar();
              }}
            />
          </div>
        </div>
      </Panel>

      {accion === "enmienda" && (
        <ModalEnmienda
          empresaId={empresaId}
          contrato={contrato}
          saldo={s}
          onClose={() => setAccion(null)}
          onListo={() => onCambio("Enmienda registrada. El monto autorizado quedó ampliado.")}
        />
      )}
    </>
  );
}

// ============================================================
// Enmienda: nueva OC que amplía el monto autorizado
// ============================================================
function ModalEnmienda({ empresaId, contrato, saldo, onClose, onListo }) {
  const [f, setF] = useState({
    numeroOC: "",
    fechaEmision: new Date().toISOString().slice(0, 10),
    fechaVencimiento: "",
    montoNeto: "",
    observaciones: "",
  });
  const [archivo, setArchivo] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));

  const nuevoTotal = Number(saldo?.autorizado || 0) + Number(f.montoNeto || 0);

  const guardar = async () => {
    setError("");
    if (!f.numeroOC.trim()) return setError("Ingresa el número de la nueva orden de compra");
    if (!Number(f.montoNeto)) return setError("Ingresa el monto neto que amplía la enmienda");
    setSaving(true);
    try {
      await agregarEnmiendaContrato(empresaId, contrato, f, archivo);
      onListo();
    } catch (e) {
      setError(e.message);
      setSaving(false);
    }
  };

  return (
    <Modal
      titulo="Registrar enmienda"
      subtitulo={`${contrato.numero} · ${contrato.clienteNombre}`}
      onClose={onClose}
      acciones={
        <>
          <BotonSecundario onClick={onClose} className="flex-1">Cancelar</BotonSecundario>
          <BotonPrimario onClick={guardar} disabled={saving} className="flex-1">
            {saving ? "Registrando..." : "Ampliar monto autorizado"}
          </BotonPrimario>
        </>
      }
    >
      {error && <Aviso tono="error">{error}</Aviso>}

      <Aviso tono="info">
        La enmienda es la nueva OC que envía el cliente para ampliar el contrato. Se suma al monto ya autorizado
        y queda como respaldo independiente.
      </Aviso>

      <Seccion>
        <Campo label="N° de la nueva OC" value={f.numeroOC} onChange={(v) => set("numeroOC", v)} placeholder="OC-45990" />
        <Campo label="Monto neto que amplía" type="number" value={f.montoNeto} onChange={(v) => set("montoNeto", v)} />
        <Campo label="Fecha de emisión" type="date" value={f.fechaEmision} onChange={(v) => set("fechaEmision", v)} />
        <Campo label="Vigencia hasta" type="date" value={f.fechaVencimiento} onChange={(v) => set("fechaVencimiento", v)} ayuda="Opcional" />
        <AreaTexto label="Observaciones" rows={2} value={f.observaciones} onChange={(v) => set("observaciones", v)} />
      </Seccion>

      <div className="bg-slate-900 text-white rounded-2xl p-4 space-y-1.5 text-sm">
        <div className="flex justify-between">
          <span className="text-slate-300">Autorizado hoy</span>
          <span className="font-bold">{CLP(saldo?.autorizado)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-300">Esta enmienda</span>
          <span className="font-bold">{CLP(f.montoNeto)}</span>
        </div>
        <div className="flex justify-between border-t border-slate-700 pt-2">
          <span className="text-xs font-black uppercase text-slate-300">Nuevo autorizado</span>
          <span className="text-lg font-black">{CLP(nuevoTotal)}</span>
        </div>
        <p className="text-xs text-slate-400 text-right">
          Saldo disponible quedaría en {CLP(nuevoTotal - Number(saldo?.consumido || 0))}
        </p>
      </div>

      <div>
        <p className="text-xs font-black text-slate-400 uppercase mb-2">Archivo de la enmienda</p>
        <label className="flex items-center justify-between gap-3 border-2 border-dashed border-slate-200 hover:border-slate-300 rounded-xl px-4 py-3 cursor-pointer transition-colors">
          <span className="text-sm font-semibold text-slate-600 truncate">
            {archivo ? archivo.name : "Sube el PDF de la nueva orden de compra"}
          </span>
          <span className="text-xs font-bold text-red-600 shrink-0">Seleccionar</span>
          <input
            type="file"
            accept="application/pdf,image/*"
            className="hidden"
            onChange={(e) => setArchivo(e.target.files?.[0] || null)}
          />
        </label>
      </div>
    </Modal>
  );
}

// ============================================================
// Formulario de contrato
// ============================================================
function FormContrato({ empresaId, contrato, clients, machines, onClose, onSaved }) {
  const [f, setF] = useState({
    clienteId: contrato?.clienteId || "",
    fechaInicio: contrato?.fechaInicio || new Date().toISOString().slice(0, 10),
    fechaFin: contrato?.fechaFin || "",
    estado: contrato?.estado || "activo",
    proyectoDestino: contrato?.proyectoDestino || "",
    condiciones: contrato?.condiciones || "",
    afectoIVA: contrato?.afectoIVA !== false,
  });
  const [lineas, setLineas] = useState(
    contrato?.lineas?.length
      ? contrato.lineas
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
      await upsertRentalContract(empresaId, {
        id: contrato?.id,
        numero: contrato?.numero,
        cotizacionId: contrato?.cotizacionId,
        cotizacionNumero: contrato?.cotizacionNumero,
        ocId: contrato?.ocId,
        ocNumero: contrato?.ocNumero,
        ...f,
        clienteNombre: cliente?.nombre || "",
        lineas: validas,
      });
      onSaved();
    } catch (e) {
      setError(e.message);
      setSaving(false);
    }
  };

  const disponibles = machines.filter(
    (m) => m.activo !== false && (m.disponibilidad !== "arrendado" || lineas.some((l) => l.machineId === m.id))
  );

  return (
    <Modal
      titulo={contrato ? `Editar ${contrato.numero}` : "Contrato manual"}
      onClose={onClose}
      ancho="max-w-3xl"
      acciones={
        <>
          <BotonSecundario onClick={onClose} className="flex-1">Cancelar</BotonSecundario>
          <BotonPrimario onClick={guardar} disabled={saving} className="flex-1">
            {saving ? "Guardando..." : "Guardar contrato"}
          </BotonPrimario>
        </>
      }
    >
      {error && <Aviso tono="error">{error}</Aviso>}

      {!contrato && (
        <Aviso tono="alerta">
          Lo normal es generar el contrato desde una cotización aceptada, así queda amarrado a su OC.
          Un contrato creado a mano no tiene monto autorizado hasta que le registres una OC como enmienda.
        </Aviso>
      )}

      <Seccion titulo="Datos generales">
        <Selector
          label="Cliente"
          value={f.clienteId}
          onChange={(v) => set("clienteId", v)}
          opciones={clients.map((c) => ({ value: c.id, label: c.nombre }))}
          full
          disabled={!!contrato}
        />
        <Campo label="Fecha de inicio" type="date" value={f.fechaInicio} onChange={(v) => set("fechaInicio", v)} />
        <Campo label="Fecha de término" type="date" value={f.fechaFin} onChange={(v) => set("fechaFin", v)} ayuda="Vacío = indefinido" />
        <Selector
          label="Estado"
          value={f.estado}
          onChange={(v) => set("estado", v)}
          opciones={Object.entries(ESTADOS_CONTRATO).map(([k, v]) => ({ value: k, label: v.label }))}
          placeholder=""
        />
        <Campo label="Obra o faena" value={f.proyectoDestino} onChange={(v) => set("proyectoDestino", v)} />
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
      </div>

      <AreaTexto label="Condiciones" rows={3} value={f.condiciones} onChange={(v) => set("condiciones", v)} />
    </Modal>
  );
}
