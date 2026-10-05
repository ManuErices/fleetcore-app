import React, { useState, useEffect, useMemo, useCallback, useId } from "react";
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useEmpresa } from "../../lib/useEmpresa";
import { registrarCambio, registrarCambiosDocumento, registrarEliminacion } from "../../lib/deudaAuditoria";
import {
  Cifra, Hoja, LineaGuia, Boton, Campo, Segmentado, ModalCuaderno, Resaltado, VistoBueno,
  IconoMas, IconoLapiz, IconoBorrar, casoOracion, casoTitulo,
} from "./cuaderno";

// ─── Utilidades ───────────────────────────────────────────────────────────────
function fmtM(n) {
  if (!n && n !== 0) return "$0";
  const a = Math.abs(n);
  if (a >= 1000000) return (n < 0 ? "-" : "") + "$" + (a / 1000000).toFixed(1).replace(".", ",") + "M";
  return (n < 0 ? "-" : "") + "$" + Math.round(a).toLocaleString("es-CL");
}
function fmt(n) { return "$" + Math.round(Math.abs(n || 0)).toLocaleString("es-CL"); }

function generarMeses(desde, cantidad) {
  // desde: {anio, mes(0-11)}
  const out = [];
  for (let i = 0; i < cantidad; i++) {
    const d = new Date(desde.anio, desde.mes + i, 1);
    out.push({ key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`, label: d.toLocaleString("es-CL", { month: "short", year: "2-digit" }) });
  }
  return out;
}

// Estado de cada cuota: el fondo de la celda funciona como el resaltador con
// que se marca a mano lo pagado y lo aplazado.
const ESTADO_CUOTA = {
  proyectado: { label: "proyectada", fondo: "",                         marca: "·", color: "tinta"   },
  pagado:     { label: "pagada",     fondo: "bg-cuaderno-menta/50",     marca: null, color: "grafito" },
  aplazado:   { label: "aplazada",   fondo: "bg-cuaderno-durazno/60",   marca: "→", color: "tinta"   },
};
const SIGUIENTE_ESTADO = { proyectado: "pagado", pagado: "aplazado", aplazado: "proyectado" };

// ─── Celda de cuota editable ───────────────────────────────────────────────────
function CeldaCuota({ cuota, onUpdate }) {
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState(cuota?.montoProyectado || "");

  if (!cuota) {
    return <td className="border-b border-cuaderno-renglon border-l border-l-cuaderno-linea" />;
  }

  const cfg = ESTADO_CUOTA[cuota.estado] || ESTADO_CUOTA.proyectado;

  function guardar() {
    const num = parseFloat(valor) || 0;
    onUpdate({ ...cuota, montoProyectado: num });
    setEditando(false);
  }

  function ciclarEstado(e) {
    e.preventDefault();
    e.stopPropagation();
    const siguiente = SIGUIENTE_ESTADO[cuota.estado] || "proyectado";
    onUpdate({ ...cuota, estado: siguiente });
  }

  return (
    <td className={`relative border-b border-cuaderno-renglon border-l border-l-cuaderno-linea h-11 ${cfg.fondo}`}>
      {editando ? (
        <input
          autoFocus type="number" value={valor} onChange={e => setValor(e.target.value)}
          onBlur={guardar} onKeyDown={e => e.key === "Enter" && guardar()}
          aria-label="Monto de la cuota en pesos"
          className="w-full h-full px-2 text-right text-[15px] bg-cuaderno-tarjeta border-0 border-b-[1.5px] border-cuaderno-tinta focus:outline-none"
        />
      ) : (
        <div className="group/cuota flex items-center h-full">
          <button
            type="button"
            onClick={ciclarEstado}
            aria-label={`Cuota ${cfg.label}. Cambiar estado`}
            title={`Cuota ${cfg.label}. Clic para cambiar el estado`}
            className="w-6 h-full flex-shrink-0 flex items-center justify-center text-[14px] text-cuaderno-grafito opacity-60 group-hover/cuota:opacity-100 hover:text-cuaderno-tinta"
          >
            {cfg.marca ?? <VistoBueno tamano={11} titulo="" />}
          </button>
          <button
            type="button"
            onClick={() => setEditando(true)}
            onContextMenu={ciclarEstado}
            title="Clic para editar el monto"
            className="flex-1 h-full pr-2 text-right text-[15px] hover:bg-cuaderno-papel/60"
          >
            <Cifra valor={cuota.montoProyectado} color={cfg.color} />
          </button>
        </div>
      )}
    </td>
  );
}

// ─── Modal: crear/editar acuerdo de pago ───────────────────────────────────────
function ModalAcuerdo({ isOpen, onClose, onSave, editando, mesesVisibles }) {
  const [form, setForm] = useState({ acreedorNombre: "", tipoDeuda: "proveedor", montoTotalAcordado: "", pie: "0", notas: "" });

  useEffect(() => {
    if (editando) {
      setForm({
        acreedorNombre: editando.acreedorNombre || "",
        tipoDeuda: editando.tipoDeuda || "proveedor",
        montoTotalAcordado: editando.montoTotalAcordado || "",
        pie: editando.pie || "0",
        notas: editando.notas || "",
      });
    } else {
      setForm({ acreedorNombre: "", tipoDeuda: "proveedor", montoTotalAcordado: "", pie: "0", notas: "" });
    }
  }, [editando, isOpen]);

  if (!isOpen) return null;

  function submit(e) {
    e.preventDefault();
    if (!form.acreedorNombre.trim()) return;
    const cuotasIniciales = editando?.cuotas || mesesVisibles.map(m => ({ mes: m.key, montoProyectado: 0, estado: "proyectado", montoPagadoReal: 0 }));
    onSave({
      ...form,
      montoTotalAcordado: parseFloat(form.montoTotalAcordado) || 0,
      pie: parseFloat(form.pie) || 0,
      cuotas: cuotasIniciales,
    });
  }

  return <FormularioAcuerdo form={form} setForm={setForm} submit={submit} onClose={onClose} editando={editando} />;
}

function FormularioAcuerdo({ form, setForm, submit, onClose, editando }) {
  const idForm = useId();
  return (
    <ModalCuaderno
      titulo={editando ? "Editar acuerdo" : "Nuevo acuerdo de pago"}
      subtitulo="Lo negociado con el acreedor, en cuotas mensuales"
      onClose={onClose}
      pie={
        <div className="flex gap-2">
          <Boton className="flex-1" onClick={onClose}>Cancelar</Boton>
          <Boton type="submit" form={idForm} variante="primario" className="flex-1">Guardar acuerdo</Boton>
        </div>
      }>
      <form id={idForm} onSubmit={submit} className="space-y-5">
        <Campo etiqueta="Acreedor" required value={form.acreedorNombre}
          onChange={e => setForm(f => ({ ...f, acreedorNombre: e.target.value }))} />

        <Segmentado
          etiqueta="Tipo de deuda"
          opciones={[{ id: "proveedor", label: "Proveedor" }, { id: "factoring", label: "Factoring" }, { id: "financiera", label: "Financiera" }]}
          valor={form.tipoDeuda}
          onCambiar={id => setForm(f => ({ ...f, tipoDeuda: id }))}
        />

        <div className="grid grid-cols-2 gap-4">
          <Campo etiqueta="Monto total acordado" type="number" inputMode="numeric" value={form.montoTotalAcordado}
            onChange={e => setForm(f => ({ ...f, montoTotalAcordado: e.target.value }))} placeholder="$ 0" />
          <Campo etiqueta="Pie o anticipo" type="number" inputMode="numeric" value={form.pie}
            onChange={e => setForm(f => ({ ...f, pie: e.target.value }))} placeholder="$ 0" />
        </div>

        <Campo as="textarea" rows={2} etiqueta="Notas del acuerdo" value={form.notas}
          onChange={e => setForm(f => ({ ...f, notas: e.target.value }))} />
      </form>
    </ModalCuaderno>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────
export default function FinanzasPlanPagos() {
  const { empresaId } = useEmpresa();
  const [acuerdos, setAcuerdos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editando, setEditando] = useState(null);
  // Parte en el mes en curso (antes estaba fijo en junio de 2026).
  const [mesInicio] = useState(() => { const h = new Date(); return { anio: h.getFullYear(), mes: h.getMonth() }; });

  const mesesVisibles = useMemo(() => generarMeses(mesInicio, 12), [mesInicio]);

  const cargar = useCallback(async () => {
    if (!empresaId) { setLoading(false); return; }
    setLoading(true);
    try {
      const snap = await getDocs(collection(db, "empresas", empresaId, "deuda_acuerdos"));
      setAcuerdos(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) {
      console.error("Error cargando deuda_acuerdos:", e);
    }
    setLoading(false);
  }, [empresaId]);

  useEffect(() => { cargar(); }, [cargar]);

  async function guardarAcuerdo(datos) {
    if (!empresaId) return;
    try {
      if (editando) {
        await updateDoc(doc(db, "empresas", empresaId, "deuda_acuerdos", editando.id), datos);
        await registrarCambiosDocumento({
          empresaId,
          documentoId: editando.id,
          coleccion: "deuda_acuerdos",
          documentoAnterior: editando,
          documentoNuevo: { ...editando, ...datos },
          origen: "manual",
        });
      } else {
        const nuevoRef = await addDoc(collection(db, "empresas", empresaId, "deuda_acuerdos"), datos);
        await registrarCambio({
          empresaId,
          documentoId: nuevoRef.id,
          coleccion: "deuda_acuerdos",
          accion: "crear",
          origen: "manual",
        });
      }
      setModalOpen(false);
      setEditando(null);
      cargar();
    } catch (e) {
      console.error("Error guardando acuerdo:", e);
    }
  }

  async function actualizarCuota(acuerdo, cuotaActualizada) {
    const cuotaAnterior = (acuerdo.cuotas || []).find(c => c.mes === cuotaActualizada.mes) || null;
    const nuevasCuotas = (acuerdo.cuotas || []).map(c => c.mes === cuotaActualizada.mes ? cuotaActualizada : c);
    // Si el mes no existía en las cuotas guardadas, lo agregamos
    if (!nuevasCuotas.some(c => c.mes === cuotaActualizada.mes)) nuevasCuotas.push(cuotaActualizada);
    try {
      await updateDoc(doc(db, "empresas", empresaId, "deuda_acuerdos", acuerdo.id), { cuotas: nuevasCuotas });
      setAcuerdos(prev => prev.map(a => a.id === acuerdo.id ? { ...a, cuotas: nuevasCuotas } : a));
      await registrarCambio({
        empresaId,
        documentoId: acuerdo.id,
        coleccion: "deuda_acuerdos",
        accion: "actualizar",
        campo: `cuota_${cuotaActualizada.mes}`,
        valorAnterior: cuotaAnterior ? cuotaAnterior.estado : null,
        valorNuevo: cuotaActualizada.estado,
        origen: "manual",
      });
    } catch (e) {
      console.error("Error actualizando cuota:", e);
    }
  }

  async function eliminarAcuerdo(acuerdo) {
    if (!window.confirm(`¿Eliminar el acuerdo de pago con ${acuerdo.acreedorNombre}? Esta acción no se puede deshacer.`)) return;
    try {
      // Se audita ANTES de borrar, guardando el documento completo:
      // así queda registro de qué tenía el acuerdo si alguien pregunta después.
      await registrarEliminacion({
        empresaId,
        documentoId: acuerdo.id,
        coleccion: "deuda_acuerdos",
        documentoEliminado: acuerdo,
        origen: "manual",
      });
      await deleteDoc(doc(db, "empresas", empresaId, "deuda_acuerdos", acuerdo.id));
      cargar();
    } catch (e) {
      console.error("Error eliminando acuerdo:", e);
    }
  }

  function cuotaDelMes(acuerdo, mesKey) {
    return (acuerdo.cuotas || []).find(c => c.mes === mesKey) || { mes: mesKey, montoProyectado: 0, estado: "proyectado", montoPagadoReal: 0 };
  }

  const totalesPorMes = useMemo(() => {
    const m = {};
    mesesVisibles.forEach(({ key }) => { m[key] = 0; });
    acuerdos.forEach(a => (a.cuotas || []).forEach(c => { if (m[c.mes] !== undefined) m[c.mes] += c.montoProyectado || 0; }));
    return m;
  }, [acuerdos, mesesVisibles]);

  const totalGeneral = useMemo(() => acuerdos.reduce((s, a) => s + (a.cuotas || []).reduce((s2, c) => s2 + (c.montoProyectado || 0), 0) + (a.pie || 0), 0), [acuerdos]);

  return (
    <div className="space-y-5">

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-xl space-y-1">
          <p className="m-0 text-[17px] text-cuaderno-grafito">
            Toca el monto de una cuota para corregirlo. La marca a su izquierda cambia el estado:
            proyectada, pagada o aplazada. Cifras en miles de pesos.
          </p>
          <div className="flex flex-wrap gap-4 text-[15px]">
            <Resaltado color="menta">pagada</Resaltado>
            <Resaltado color="durazno">aplazada</Resaltado>
            <span className="text-cuaderno-grafito">sin marca: proyectada</span>
          </div>
        </div>
        <Boton variante="primario" onClick={() => { setEditando(null); setModalOpen(true); }}>
          <IconoMas tamano={14} /> Nuevo acuerdo
        </Boton>
      </div>

      {loading ? (
        <p className="m-0 py-16 text-center text-[18px] text-cuaderno-grafito">Buscando los acuerdos…</p>
      ) : acuerdos.length === 0 ? (
        <Hoja cuerpo="px-6 py-10 text-center space-y-2">
          <p className="m-0 font-ligada font-light text-[22px] leading-[1.6]">Sin acuerdos de pago todavía</p>
          <p className="m-0 text-[16px] text-cuaderno-grafito max-w-md mx-auto">
            Anota un acuerdo por cada acreedor con el que hayas negociado pagar en cuotas.
          </p>
        </Hoja>
      ) : (
        <Hoja cuerpo="pb-4">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px] border-collapse">
              <thead>
                <tr className="shadow-[inset_0_-1.5px_0_rgb(var(--cuaderno-tinta))]">
                  <th className="sticky left-0 z-10 bg-cuaderno-hoja text-left font-normal text-[16px] pl-6 pr-3 py-2 min-w-[200px]">Acreedor</th>
                  <th className="font-normal text-[16px] text-right px-3 py-2 border-l-[3px] border-double border-l-cuaderno-margen">Pie</th>
                  {mesesVisibles.map(m => (
                    <th key={m.key} className="font-normal text-[15px] text-center px-1 py-2 min-w-[86px] border-l border-l-cuaderno-linea">
                      {casoOracion(m.label.replace(".", ""))}
                    </th>
                  ))}
                  <th className="w-20" />
                </tr>
              </thead>
              <tbody>
                {acuerdos.map(acuerdo => (
                  <tr key={acuerdo.id} className="group">
                    <td className="sticky left-0 z-10 bg-cuaderno-hoja group-hover:bg-cuaderno-papel border-b border-cuaderno-renglon pl-6 pr-3 py-1.5">
                      <p className="m-0 text-[17px] leading-tight">{casoTitulo(acuerdo.acreedorNombre)}</p>
                      <p className="m-0 text-[13px] text-cuaderno-grafito">{acuerdo.tipoDeuda}</p>
                    </td>
                    <td className="border-b border-cuaderno-renglon border-l-[3px] border-double border-l-cuaderno-margen px-3 text-right text-[15px]">
                      <Cifra valor={acuerdo.pie} color="grafito" />
                    </td>
                    {mesesVisibles.map(m => (
                      <CeldaCuota key={m.key} cuota={cuotaDelMes(acuerdo, m.key)} onUpdate={c => actualizarCuota(acuerdo, c)} />
                    ))}
                    <td className="border-b border-cuaderno-renglon px-2">
                      <div className="flex justify-end gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100">
                        <button onClick={() => { setEditando(acuerdo); setModalOpen(true); }}
                          aria-label={`Editar acuerdo con ${casoTitulo(acuerdo.acreedorNombre)}`}
                          className="w-8 h-8 rounded-md flex items-center justify-center text-cuaderno-grafito hover:text-cuaderno-tinta hover:bg-cuaderno-papel">
                          <IconoLapiz tamano={14} />
                        </button>
                        <button onClick={() => eliminarAcuerdo(acuerdo)}
                          aria-label={`Eliminar acuerdo con ${casoTitulo(acuerdo.acreedorNombre)}`}
                          className="w-8 h-8 rounded-md flex items-center justify-center text-cuaderno-grafito hover:text-cuaderno-roja hover:bg-cuaderno-rosa/40">
                          <IconoBorrar tamano={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td className="sticky left-0 z-10 bg-cuaderno-hoja pl-6 pr-3 py-3 text-[17px] shadow-[inset_0_1.5px_0_rgb(var(--cuaderno-tinta))]">Total del mes</td>
                  <td className="border-l-[3px] border-double border-l-cuaderno-margen shadow-[inset_0_1.5px_0_rgb(var(--cuaderno-tinta))]" />
                  {mesesVisibles.map(m => (
                    <td key={m.key} className="px-2 py-3 text-right text-[15px] border-l border-l-cuaderno-linea shadow-[inset_0_1.5px_0_rgb(var(--cuaderno-tinta))]">
                      <Cifra valor={totalesPorMes[m.key]} raya="total" />
                    </td>
                  ))}
                  <td className="shadow-[inset_0_1.5px_0_rgb(var(--cuaderno-tinta))]" />
                </tr>
              </tfoot>
            </table>
          </div>
          <div className="flex justify-end px-6 pt-2">
            <LineaGuia etiqueta="Total comprometido, pie incluido" className="w-full max-w-md">
              <Cifra valor={totalGeneral} escala="pesos" raya="doble" vacio="$0" />
            </LineaGuia>
          </div>
        </Hoja>
      )}

      <ModalAcuerdo
        isOpen={modalOpen}
        onClose={() => { setModalOpen(false); setEditando(null); }}
        onSave={guardarAcuerdo}
        editando={editando}
        mesesVisibles={mesesVisibles}
      />
    </div>
  );
}
