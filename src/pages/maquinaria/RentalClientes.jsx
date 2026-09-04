import React, { useEffect, useState, useMemo } from "react";
import { useEmpresa } from "../../lib/useEmpresa";
import { useUserRole } from "../../lib/useUserRole";
import {
  listRentalClients, upsertRentalClient, deleteRentalClient, desactivarRentalClient,
  listRentalContracts, listRentalQuotes, listRentalPayments, listRentalPurchaseOrders,
  uploadClientFile, deleteClientFile, documentosFaltantes,
  resumenCliente, saldoOC, estadoEfectivoEEPP, montoTotalEEPP, diasVencidoEEPP,
  formatRut, limpiarRut, validaRut,
  CLP, TIPOS_DOC_CLIENTE, ESTADOS_CONTRATO, ESTADOS_COTIZACION, ESTADOS_EEPP, ESTADOS_OC,
} from "../../lib/rental";
import { extraerDatosEstatutos, sePuedeLeer } from "../../lib/extraerEstatutos";
import {
  Kpi, Chip, Badge, Etiqueta, Aviso, Estado, Dato, Seccion, Campo, AreaTexto,
  Modal, Panel, BotonPrimario, BotonSecundario, Adjuntos, BarraConsumo, fmtFecha, fmtPeriodo,
} from "../../components/rental/ui";

const PUEDEN_EDITAR = ["superadmin", "admin_contrato", "administrativo"];

export default function RentalClientes() {
  const { empresaId } = useEmpresa();
  const { role } = useUserRole();
  const puedeEditar = PUEDEN_EDITAR.includes(role);

  const [clients, setClients] = useState([]);
  const [contracts, setContracts] = useState([]);
  const [quotes, setQuotes] = useState([]);
  const [payments, setPayments] = useState([]);
  const [purchaseOrders, setPurchaseOrders] = useState([]);

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
      const [cl, co, cot, pa, oc] = await Promise.all([
        listRentalClients(empresaId, { incluirInactivos: true }),
        listRentalContracts(empresaId),
        listRentalQuotes(empresaId),
        listRentalPayments(empresaId),
        listRentalPurchaseOrders(empresaId),
      ]);
      setClients(cl); setContracts(co); setQuotes(cot);
      setPayments(pa); setPurchaseOrders(oc);
    } catch (e) {
      setError(e.message || "No se pudieron cargar los clientes");
    } finally {
      setLoading(false);
    }
  };

  const resumenes = useMemo(() => {
    const map = {};
    for (const c of clients) {
      map[c.id] = resumenCliente(c.id, { contracts, quotes, payments, purchaseOrders });
    }
    return map;
  }, [clients, contracts, quotes, payments, purchaseOrders]);

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    let base = clients;

    if (filtro === "activos") base = base.filter((c) => c.activo !== false);
    if (filtro === "inactivos") base = base.filter((c) => c.activo === false);
    if (filtro === "deuda") base = base.filter((c) => (resumenes[c.id]?.porCobrar || 0) > 0);
    if (filtro === "vencido") base = base.filter((c) => (resumenes[c.id]?.vencido || 0) > 0);
    if (filtro === "papeles") base = base.filter((c) => c.activo !== false && documentosFaltantes(c).length > 0);

    if (!q) return base;
    return base.filter((c) =>
      [c.nombre, c.rut, c.contacto, c.email, c.giro]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q))
    );
  }, [clients, filtro, busca, resumenes]);

  const totales = useMemo(() => {
    const vivos = clients.filter((c) => c.activo !== false);
    return {
      clientes: vivos.length,
      papeles: vivos.filter((c) => documentosFaltantes(c).length > 0).length,
      porCobrar: vivos.reduce((s, c) => s + (resumenes[c.id]?.porCobrar || 0), 0),
      vencido: vivos.reduce((s, c) => s + (resumenes[c.id]?.vencido || 0), 0),
    };
  }, [clients, resumenes]);

  const ficha = clients.find((c) => c.id === fichaId) || null;

  const tras = async (mensaje) => {
    setAviso(mensaje);
    setFichaId(null);
    await refresh();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-slate-900">Clientes</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Cartera de arriendo, documentos legales y deuda vigente
          </p>
        </div>
        {puedeEditar && (
          <BotonPrimario onClick={() => { setEditando(null); setShowForm(true); }}>
            + Nuevo cliente
          </BotonPrimario>
        )}
      </div>

      {error && <Aviso tono="error">{error}</Aviso>}
      {aviso && <Aviso tono="ok">{aviso}</Aviso>}

      {totales.papeles > 0 && (
        <Aviso tono="alerta">
          {totales.papeles === 1
            ? "Hay 1 cliente sin el certificado de estatutos o el e-RUT cargado."
            : `Hay ${totales.papeles} clientes sin el certificado de estatutos o el e-RUT cargado.`}
        </Aviso>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <Kpi label="Clientes activos" valor={totales.clientes} />
        <Kpi label="Papeles pendientes" valor={totales.papeles} tono={totales.papeles ? "amber" : "slate"} />
        <Kpi label="Por cobrar" valor={CLP(totales.porCobrar)} tono="amber" />
        <Kpi label="Vencido" valor={CLP(totales.vencido)} tono="red" />
      </div>

      <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
        <input
          type="text"
          placeholder="Buscar por nombre, RUT, contacto o giro..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="border-2 border-slate-200 focus:border-slate-400 outline-none rounded-xl px-4 py-2.5 text-sm w-full sm:w-96 transition-colors"
        />
        <div className="flex flex-wrap gap-2">
          <Chip activo={filtro === "activos"} onClick={() => setFiltro("activos")}>Activos</Chip>
          <Chip activo={filtro === "papeles"} onClick={() => setFiltro("papeles")}>Papeles pendientes</Chip>
          <Chip activo={filtro === "deuda"} onClick={() => setFiltro("deuda")}>Con deuda</Chip>
          <Chip activo={filtro === "vencido"} onClick={() => setFiltro("vencido")}>Vencidos</Chip>
          <Chip activo={filtro === "inactivos"} onClick={() => setFiltro("inactivos")}>Inactivos</Chip>
          <Chip activo={filtro === "todos"} onClick={() => setFiltro("todos")}>Todos</Chip>
        </div>
      </div>

      {loading ? (
        <Estado>Cargando clientes...</Estado>
      ) : filtrados.length === 0 ? (
        <Estado>
          {clients.length === 0
            ? "Aún no hay clientes. Crea el primero para poder cotizar y facturar."
            : "Ningún cliente coincide con el filtro."}
        </Estado>
      ) : (
        <>
          {/* Escritorio: tabla con la deuda a la vista */}
          <div className="hidden lg:block overflow-x-auto bg-white border-2 border-slate-100 rounded-2xl">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-black text-slate-400 uppercase border-b border-slate-100">
                  <th className="px-4 py-3">Cliente</th>
                  <th className="px-4 py-3">Contacto</th>
                  <th className="px-4 py-3">Pago</th>
                  <th className="px-4 py-3 text-center">Contratos</th>
                  <th className="px-4 py-3 text-right">Por cobrar</th>
                  <th className="px-4 py-3 text-right">Vencido</th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map((c) => {
                  const r = resumenes[c.id] || {};
                  const faltan = documentosFaltantes(c);
                  return (
                    <tr
                      key={c.id}
                      onClick={() => setFichaId(c.id)}
                      className="border-b border-slate-50 last:border-0 hover:bg-slate-50 cursor-pointer"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-slate-900">{c.nombre}</span>
                          {c.activo === false && <Etiqueta tono="slate">Inactivo</Etiqueta>}
                          {c.requiereOC && <Etiqueta tono="blue">Exige OC</Etiqueta>}
                          {faltan.length > 0 && <Etiqueta tono="amber">Faltan papeles</Etiqueta>}
                        </div>
                        <p className="text-xs text-slate-400 mt-0.5">
                          {[c.rut || "Sin RUT", c.giro].filter(Boolean).join(" · ")}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {c.contacto || "—"}
                        {c.email && <p className="text-xs text-slate-400 truncate max-w-[200px]">{c.email}</p>}
                      </td>
                      <td className="px-4 py-3 text-slate-600">{c.diasPago ?? 30} días</td>
                      <td className="px-4 py-3 text-center font-bold text-slate-700">{r.contratosActivos || 0}</td>
                      <td className="px-4 py-3 text-right font-bold text-slate-900">{CLP(r.porCobrar)}</td>
                      <td className={`px-4 py-3 text-right font-bold ${r.vencido > 0 ? "text-red-600" : "text-slate-300"}`}>
                        {CLP(r.vencido)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Móvil: tarjetas */}
          <div className="lg:hidden grid grid-cols-1 sm:grid-cols-2 gap-3">
            {filtrados.map((c) => {
              const r = resumenes[c.id] || {};
              const faltan = documentosFaltantes(c);
              return (
                <button
                  key={c.id}
                  onClick={() => setFichaId(c.id)}
                  className="text-left bg-white border-2 border-slate-100 rounded-2xl p-4 active:border-slate-300 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="font-black text-slate-900 truncate">{c.nombre}</h3>
                      <p className="text-xs text-slate-400">{c.rut || "Sin RUT"}</p>
                    </div>
                    <div className="flex flex-col gap-1 items-end shrink-0">
                      {c.activo === false && <Etiqueta tono="slate">Inactivo</Etiqueta>}
                      {faltan.length > 0 && <Etiqueta tono="amber">Faltan papeles</Etiqueta>}
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <p className="text-[11px] text-slate-400">Por cobrar</p>
                      <p className="font-bold text-slate-900">{CLP(r.porCobrar)}</p>
                    </div>
                    <div>
                      <p className="text-[11px] text-slate-400">Vencido</p>
                      <p className={`font-bold ${r.vencido > 0 ? "text-red-600" : "text-slate-300"}`}>{CLP(r.vencido)}</p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </>
      )}

      {showForm && (
        <FormCliente
          empresaId={empresaId}
          client={editando}
          onClose={() => setShowForm(false)}
          onSaved={async (msg) => { setShowForm(false); await tras(msg || "Cliente guardado."); }}
        />
      )}

      {ficha && (
        <FichaCliente
          empresaId={empresaId}
          client={ficha}
          resumen={resumenes[ficha.id]}
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

// ============================================================
// Ficha del cliente
// ============================================================
function FichaCliente({ empresaId, client, resumen, payments, puedeEditar, onClose, onEditar, onCambio, onRecargar }) {
  const [tab, setTab] = useState("documentos");
  const [error, setError] = useState("");
  const [trabajando, setTrabajando] = useState(false);
  const r = resumen || {};
  const faltan = documentosFaltantes(client);

  const alternarActivo = async () => {
    setTrabajando(true);
    setError("");
    try {
      await desactivarRentalClient(empresaId, client.id, client.activo === false);
      await onCambio(client.activo === false ? "Cliente reactivado." : "Cliente desactivado.");
    } catch (e) {
      setError(e.message);
      setTrabajando(false);
    }
  };

  const eliminar = async () => {
    if (!window.confirm(`¿Eliminar definitivamente a ${client.nombre}?`)) return;
    setTrabajando(true);
    setError("");
    try {
      await deleteRentalClient(empresaId, client.id);
      await onCambio("Cliente eliminado.");
    } catch (e) {
      setError(e.message);
      setTrabajando(false);
    }
  };

  const TABS = [
    { id: "documentos", label: `Documentos (${(client.archivos || []).length})` },
    { id: "contratos", label: `Contratos (${r.contratos?.length || 0})` },
    { id: "pagos", label: `Estados de pago (${r.pagos?.length || 0})` },
    { id: "ocs", label: `Órdenes de compra (${r.ocs?.length || 0})` },
    { id: "cotizaciones", label: `Cotizaciones (${r.cotizaciones?.length || 0})` },
  ];

  return (
    <Panel onClose={onClose}>
      <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-5 z-10">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-xl font-black text-slate-900">{client.nombre}</h2>
              {client.activo === false && <Etiqueta tono="slate">Inactivo</Etiqueta>}
              {client.requiereOC && <Etiqueta tono="blue">Exige OC</Etiqueta>}
            </div>
            <p className="text-sm text-slate-500 mt-1">
              {[client.rut, client.giro].filter(Boolean).join(" · ") || "Sin datos tributarios"}
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-2xl leading-none shrink-0">&times;</button>
        </div>

        {puedeEditar && (
          <div className="flex flex-wrap gap-2 mt-4">
            <button onClick={onEditar} className="px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-bold">
              Editar datos
            </button>
            <button onClick={alternarActivo} disabled={trabajando} className="px-3 py-1.5 rounded-lg border-2 border-slate-200 text-slate-600 text-xs font-bold disabled:opacity-50">
              {client.activo === false ? "Reactivar" : "Desactivar"}
            </button>
            <button onClick={eliminar} disabled={trabajando} className="px-3 py-1.5 rounded-lg border-2 border-red-200 text-red-600 text-xs font-bold disabled:opacity-50">
              Eliminar
            </button>
          </div>
        )}
      </div>

      <div className="p-6 space-y-5">
        {error && <Aviso tono="error">{error}</Aviso>}

        {faltan.length > 0 && (
          <Aviso tono="alerta">
            Faltan por cargar: {faltan.map((t) => TIPOS_DOC_CLIENTE[t]).join(" y ")}.
          </Aviso>
        )}

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Kpi label="Por cobrar" valor={CLP(r.porCobrar)} tono="amber" compacto />
          <Kpi label="Vencido" valor={CLP(r.vencido)} tono="red" compacto />
          <Kpi label="Contratos activos" valor={r.contratosActivos || 0} compacto />
          <Kpi label="Saldo en OC" valor={CLP(r.saldoOC)} tono="emerald" compacto />
        </div>

        <div className="bg-white border-2 border-slate-100 rounded-2xl p-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
          <Dato label="Representante legal" valor={client.representanteNombre} extra={client.representanteRut} />
          <Dato label="Contacto" valor={client.contacto} extra={client.contactoCargo} />
          <Dato label="Teléfono" valor={client.telefono} />
          <Dato label="Email" valor={client.email} />
          <Dato label="Email de facturación" valor={client.emailFacturacion} />
          <Dato label="Email de estados de pago" valor={client.emailEstadosPago} />
          <Dato label="Condición de pago" valor={`${client.diasPago ?? 30} días`} />
          <Dato label="Dirección" valor={[client.direccion, client.comuna, client.ciudad].filter(Boolean).join(", ")} />
          {client.notas && (
            <div className="col-span-2">
              <p className="text-xs font-bold text-slate-400 uppercase">Notas</p>
              <p className="text-slate-700 whitespace-pre-line">{client.notas}</p>
            </div>
          )}
        </div>

        <div className="flex gap-1 border-b border-slate-200 overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-3 py-2 text-xs font-bold whitespace-nowrap border-b-2 -mb-px transition-colors ${
                tab === t.id ? "border-red-600 text-red-600" : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === "documentos" && (
          <div className="bg-white border-2 border-slate-100 rounded-2xl p-4">
            <Adjuntos
              titulo="Documentos legales"
              vacio="Sube el certificado de estatutos: de ahí salen la razón social, el giro y el representante legal."
              archivos={client.archivos || []}
              categorias={TIPOS_DOC_CLIENTE}
              disabled={!puedeEditar}
              onSubir={async (file, categoria) => {
                await uploadClientFile(empresaId, client.id, file, { categoria });
                await onRecargar();
              }}
              onQuitar={async (a) => {
                await deleteClientFile(empresaId, client.id, a);
                await onRecargar();
              }}
            />
          </div>
        )}

        {tab === "contratos" && (
          <Lista
            items={r.contratos}
            vacio="Este cliente no tiene contratos."
            render={(c) => (
              <FilaDoc
                titulo={c.numero || "Sin folio"}
                estado={ESTADOS_CONTRATO[c.estado]}
                detalle={[
                  `${(c.lineas || []).length} equipo(s)`,
                  c.fechaInicio ? `desde ${fmtFecha(c.fechaInicio)}` : null,
                  c.fechaFin ? `hasta ${fmtFecha(c.fechaFin)}` : null,
                ].filter(Boolean).join(" · ")}
                monto={CLP(c.totalMensual ?? 0)}
                pie="total/mes"
              />
            )}
          />
        )}

        {tab === "pagos" && (
          <Lista
            items={r.pagos}
            vacio="Este cliente no tiene estados de pago emitidos."
            render={(p) => {
              const ef = estadoEfectivoEEPP(p);
              const mora = diasVencidoEEPP(p);
              return (
                <FilaDoc
                  titulo={p.numero || p.concepto || "Estado de pago"}
                  estado={ESTADOS_EEPP[ef]}
                  detalle={[
                    p.periodo ? fmtPeriodo(p.periodo) : null,
                    p.factura?.numero ? `Factura ${p.factura.numero}` : null,
                    p.fechaVencimiento ? `vence ${fmtFecha(p.fechaVencimiento)}` : null,
                    mora > 0 ? `${mora} días de mora` : null,
                  ].filter(Boolean).join(" · ")}
                  monto={CLP(montoTotalEEPP(p))}
                  pie={`${CLP(p.neto)} neto`}
                />
              );
            }}
          />
        )}

        {tab === "ocs" && (
          <Lista
            items={r.ocs}
            vacio="Este cliente no tiene órdenes de compra cargadas."
            render={(o) => {
              const s = saldoOC(o, payments);
              return (
                <div>
                  <FilaDoc
                    titulo={`OC N° ${o.numeroOC}`}
                    estado={ESTADOS_OC[o.estado]}
                    detalle={[
                      o.tipo === "enmienda" ? "Enmienda" : null,
                      o.fechaEmision ? fmtFecha(o.fechaEmision) : null,
                      `${(o.archivos || []).length} respaldo(s)`,
                    ].filter(Boolean).join(" · ")}
                    monto={CLP(s.saldo)}
                    pie={`saldo de ${CLP(s.neto)} neto`}
                  />
                  <div className="mt-2">
                    <BarraConsumo pct={s.pct} />
                    <p className="text-[11px] text-slate-400 mt-1">{s.pct}% consumido</p>
                  </div>
                </div>
              );
            }}
          />
        )}

        {tab === "cotizaciones" && (
          <Lista
            items={r.cotizaciones}
            vacio="Este cliente no tiene cotizaciones."
            render={(q) => (
              <FilaDoc
                titulo={q.numero || "Sin folio"}
                estado={ESTADOS_COTIZACION[q.estado]}
                detalle={[
                  `${(q.lineas || []).length} equipo(s)`,
                  q.fecha ? fmtFecha(q.fecha) : null,
                  q.ocNumero ? `OC ${q.ocNumero}` : null,
                ].filter(Boolean).join(" · ")}
                monto={CLP(q.total ?? 0)}
                pie="total/mes"
              />
            )}
          />
        )}
      </div>
    </Panel>
  );
}

// ============================================================
// Alta de cliente en dos pasos
// ============================================================
// Paso 1: se suelta el certificado de estatutos y se lee.
// Paso 2: se revisa lo extraído y se completan los datos comerciales,
//         que nunca aparecen en el certificado.
//
// El certificado queda adjunto al cliente recién creado, así que no hay
// que volver a subirlo desde la ficha.
function FormCliente({ empresaId, client, onClose, onSaved }) {
  const [paso, setPaso] = useState(client ? "datos" : "documento");
  const [archivo, setArchivo] = useState(null);
  const [leyendo, setLeyendo] = useState(false);
  const [extraidos, setExtraidos] = useState([]);
  const [avisos, setAvisos] = useState([]);

  const [f, setF] = useState({
    nombre: client?.nombre || "",
    rut: client?.rut || "",
    giro: client?.giro || "",
    representanteNombre: client?.representanteNombre || "",
    representanteRut: client?.representanteRut || "",
    contacto: client?.contacto || "",
    contactoCargo: client?.contactoCargo || "",
    email: client?.email || "",
    emailFacturacion: client?.emailFacturacion || "",
    emailEstadosPago: client?.emailEstadosPago || "",
    telefono: client?.telefono || "",
    direccion: client?.direccion || "",
    comuna: client?.comuna || "",
    ciudad: client?.ciudad || "",
    diasPago: client?.diasPago ?? 30,
    requiereOC: client?.requiereOC !== false,
    notas: client?.notas || "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));

  const rutLimpio = limpiarRut(f.rut);
  const rutInvalido = rutLimpio.length > 1 && !validaRut(rutLimpio);
  const repLimpio = limpiarRut(f.representanteRut);
  const repInvalido = repLimpio.length > 1 && !validaRut(repLimpio);

  const vieneDelDocumento = (campo) => extraidos.includes(campo);

  const leer = async () => {
    if (!archivo) return setError("Selecciona el certificado primero");
    setLeyendo(true);
    setError("");
    try {
      const r = await extraerDatosEstatutos(archivo);
      setF((prev) => ({ ...prev, ...limpiarVacios(r.datos) }));
      setExtraidos(r.extraidos || []);
      setAvisos(r.avisos || []);
      setPaso("datos");
    } catch (e) {
      setError(e.message);
    } finally {
      setLeyendo(false);
    }
  };

  const saltar = () => {
    setAvisos([]);
    setExtraidos([]);
    setPaso("datos");
  };

  const guardar = async () => {
    setError("");
    if (!f.nombre.trim()) return setError("Ingresa la razón social");
    if (rutInvalido) return setError("El RUT de la empresa no es válido");
    if (repInvalido) return setError("El RUT del representante legal no es válido");

    setSaving(true);
    try {
      const clientId = await upsertRentalClient(empresaId, {
        id: client?.id,
        ...f,
        representanteRut: repLimpio ? formatRut(repLimpio) : "",
        activo: client?.activo !== false,
      });

      // El certificado se adjunta al cliente ya creado. Si la subida falla,
      // el cliente igual quedó guardado: se avisa en vez de perder el alta.
      if (archivo && clientId) {
        try {
          await uploadClientFile(empresaId, clientId, archivo, { categoria: "certificado_estatutos" });
        } catch (e) {
          onSaved(`Cliente guardado, pero el certificado no se pudo adjuntar: ${e.message}`);
          return;
        }
      }
      onSaved();
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };

  // ── Paso 1: el documento ───────────────────────────────────
  if (paso === "documento") {
    return (
      <Modal
        titulo="Nuevo cliente"
        subtitulo="Parte por el certificado de estatutos: de ahí se sacan la razón social, el RUT, el giro y el representante"
        onClose={onClose}
        ancho="max-w-xl"
        acciones={
          <>
            <BotonSecundario onClick={saltar} className="flex-1" disabled={leyendo}>
              Llenar a mano
            </BotonSecundario>
            <BotonPrimario onClick={leer} disabled={!archivo || leyendo} className="flex-1">
              {leyendo ? "Leyendo documento..." : "Leer certificado"}
            </BotonPrimario>
          </>
        }
      >
        {error && <Aviso tono="error">{error}</Aviso>}

        <label className={`flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-2xl px-6 py-10 cursor-pointer transition-colors ${
          archivo ? "border-emerald-300 bg-emerald-50" : "border-slate-200 hover:border-slate-300"
        }`}>
          <span className="text-sm font-bold text-slate-700 text-center">
            {archivo ? archivo.name : "Suelta aquí el certificado de estatutos"}
          </span>
          <span className="text-xs text-slate-400 text-center">
            {archivo
              ? `${(archivo.size / 1024 / 1024).toFixed(1)} MB · toca para cambiarlo`
              : "PDF o foto, hasta 3 MB"}
          </span>
          <input
            type="file"
            accept="application/pdf,image/*"
            className="hidden"
            disabled={leyendo}
            onChange={(e) => { setArchivo(e.target.files?.[0] || null); setError(""); }}
          />
        </label>

        {archivo && !sePuedeLeer(archivo) && (
          <Aviso tono="alerta">
            Este archivo se puede adjuntar, pero no leer automáticamente: supera los 3 MB o no es PDF ni imagen.
            Usa "Llenar a mano" y quedará guardado igual.
          </Aviso>
        )}

        <p className="text-xs text-slate-400">
          Se leen razón social, RUT, giro, representante legal y domicilio. Todo lo comercial —contacto,
          días de pago, si exige OC— lo completas en el paso siguiente.
        </p>
      </Modal>
    );
  }

  // ── Paso 2: revisar y completar ────────────────────────────
  return (
    <Modal
      titulo={client ? "Editar cliente" : "Revisar datos del cliente"}
      subtitulo={client ? null : "Revisa lo que se leyó del certificado y completa lo comercial"}
      onClose={onClose}
      acciones={
        <>
          <BotonSecundario
            onClick={client ? onClose : () => setPaso("documento")}
            className="flex-1"
          >
            {client ? "Cancelar" : "Volver"}
          </BotonSecundario>
          <BotonPrimario onClick={guardar} disabled={saving} className="flex-1">
            {saving ? "Guardando..." : "Guardar cliente"}
          </BotonPrimario>
        </>
      }
    >
      {error && <Aviso tono="error">{error}</Aviso>}

      {avisos.length > 0 && (
        <Aviso tono="alerta">
          {avisos.map((a, i) => <p key={i}>{a}</p>)}
        </Aviso>
      )}

      {extraidos.length > 0 && (
        <Aviso tono="info">
          Se completaron {extraidos.length} campo(s) desde el certificado. Van marcados abajo: revísalos
          antes de guardar, porque de aquí salen los contratos.
        </Aviso>
      )}

      <Seccion titulo="Identificación">
        <Campo
          label="Razón social"
          value={f.nombre}
          onChange={(v) => set("nombre", v)}
          ayuda={vieneDelDocumento("nombre") ? "Del certificado" : ""}
          full
        />
        <Campo
          label="RUT"
          value={f.rut}
          onChange={(v) => set("rut", v)}
          onBlur={() => rutLimpio.length > 1 && !rutInvalido && set("rut", formatRut(f.rut))}
          error={rutInvalido ? "Dígito verificador incorrecto" : ""}
          ayuda={vieneDelDocumento("rut") ? "Del certificado" : ""}
          placeholder="76.543.210-K"
        />
        <Campo
          label="Giro"
          value={f.giro}
          onChange={(v) => set("giro", v)}
          ayuda={vieneDelDocumento("giro") ? "Del certificado" : ""}
        />
        <Campo
          label="Representante legal"
          value={f.representanteNombre}
          onChange={(v) => set("representanteNombre", v)}
          ayuda={vieneDelDocumento("representanteNombre") ? "Del certificado" : ""}
        />
        <Campo
          label="RUT del representante"
          value={f.representanteRut}
          onChange={(v) => set("representanteRut", v)}
          onBlur={() => repLimpio.length > 1 && !repInvalido && set("representanteRut", formatRut(f.representanteRut))}
          error={repInvalido ? "Dígito verificador incorrecto" : ""}
          ayuda={vieneDelDocumento("representanteRut") ? "Del certificado" : ""}
        />
      </Seccion>

      <Seccion titulo="Dirección">
        <Campo
          label="Calle y número"
          value={f.direccion}
          onChange={(v) => set("direccion", v)}
          ayuda={vieneDelDocumento("direccion") ? "Del certificado" : ""}
          full
        />
        <Campo label="Comuna" value={f.comuna} onChange={(v) => set("comuna", v)} />
        <Campo label="Ciudad" value={f.ciudad} onChange={(v) => set("ciudad", v)} />
      </Seccion>

      <Seccion titulo="Contacto comercial">
        <Campo label="Nombre del contacto" value={f.contacto} onChange={(v) => set("contacto", v)} />
        <Campo label="Cargo" value={f.contactoCargo} onChange={(v) => set("contactoCargo", v)} />
        <Campo label="Email" type="email" value={f.email} onChange={(v) => set("email", v)} />
        <Campo label="Teléfono" value={f.telefono} onChange={(v) => set("telefono", v)} />
      </Seccion>

      <Seccion titulo="Facturación y cobranza">
        <Campo
          label="Días de pago"
          type="number"
          value={f.diasPago}
          onChange={(v) => set("diasPago", v)}
          ayuda="Calcula el vencimiento de cada estado de pago"
        />
        <Campo label="Email de facturación" type="email" value={f.emailFacturacion} onChange={(v) => set("emailFacturacion", v)} />
        <Campo
          label="Email para estados de pago"
          type="email"
          value={f.emailEstadosPago}
          onChange={(v) => set("emailEstadosPago", v)}
          ayuda="A quién se le envía el estado de pago para su aprobación"
          full
        />
        <div className="col-span-2">
          <label className="flex items-center gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={f.requiereOC}
              onChange={(e) => set("requiereOC", e.target.checked)}
              className="w-4 h-4 rounded accent-red-600"
            />
            <span className="text-sm font-semibold text-slate-700">
              Exige orden de compra para facturar
            </span>
          </label>
          <p className="text-xs text-slate-400 mt-1 ml-7">
            Si está marcado, el sistema avisa cuando emitas un estado de pago sin OC asociada.
          </p>
        </div>
      </Seccion>

      <AreaTexto label="Notas internas" rows={2} value={f.notas} onChange={(v) => set("notas", v)} />

      {archivo && (
        <p className="text-xs text-slate-400">
          Al guardar se adjunta <span className="font-semibold text-slate-600">{archivo.name}</span> como
          certificado de estatutos del cliente.
        </p>
      )}
    </Modal>
  );
}

// No pisa con vacío lo que el usuario ya escribió.
function limpiarVacios(obj) {
  const salida = {};
  for (const [k, v] of Object.entries(obj || {})) {
    if (v !== null && v !== undefined && String(v).trim() !== "") salida[k] = v;
  }
  return salida;
}

// ============================================================
// Piezas locales de la ficha
// ============================================================
function Lista({ items, vacio, render }) {
  if (!items || items.length === 0) {
    return <p className="text-sm text-slate-400 py-6 text-center">{vacio}</p>;
  }
  return (
    <div className="space-y-2">
      {items.map((it) => (
        <div key={it.id} className="bg-white border-2 border-slate-100 rounded-xl p-3">
          {render(it)}
        </div>
      ))}
    </div>
  );
}

function FilaDoc({ titulo, estado, detalle, monto, pie }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-bold text-slate-900 text-sm">{titulo}</span>
          <Badge estado={estado} />
        </div>
        {detalle && <p className="text-xs text-slate-500 mt-0.5">{detalle}</p>}
      </div>
      <div className="text-right shrink-0">
        <p className="text-sm font-black text-slate-900">{monto}</p>
        {pie && <p className="text-[11px] text-slate-400">{pie}</p>}
      </div>
    </div>
  );
}
