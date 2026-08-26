import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react";
import { collection, getDocs, addDoc, updateDoc, deleteDoc, setDoc, doc, query, orderBy, where, serverTimestamp } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useEmpresa } from "../../lib/useEmpresa";

const ContabilidadContext = createContext(null);

// ─── Utilidades globales ──────────────────────────────────────────────────────
export function fmt(n, decimals = 0) {
  if (!n && n !== 0) return "$0";
  const v = Math.round(Math.abs(n));
  return (n < 0 ? "-$" : "$") + v.toLocaleString("es-CL");
}
export function fmtM(n) {
  if (!n && n !== 0) return "$0";
  if (Math.abs(n) >= 1_000_000_000) return (n / 1_000_000_000).toFixed(1).replace(".", ",") + "B";
  if (Math.abs(n) >= 1_000_000) return (n < 0 ? "-$" : "$") + (Math.abs(n) / 1_000_000).toFixed(1).replace(".", ",") + "M";
  if (Math.abs(n) >= 1_000) return (n < 0 ? "-$" : "$") + (Math.abs(n) / 1_000).toFixed(0) + "K";
  return fmt(n);
}
export function mesKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
// ─── Reparación de caracteres mal decodificados ───────────────────────────────
// El CSV del RCV del SII viene en UTF-8, pero se leía con readAsText(file,"latin1").
// Cada byte de un carácter acentuado se interpretaba por separado, así que
// "ÓPTICA" llegaba como "Ã“PTICA" y "ÁRIDOS" como "ÃRIDOS". Estos nombres ya
// están guardados en las reglas y en las glosas, así que hace falta poder
// repararlos además de leer bien de aquí en adelante.

// Los bytes 0x80–0x9F no existen en Latin-1 puro, pero sí en Windows-1252 y ahí
// mapean a comillas y guiones tipográficos. Hay que revertir ese mapeo.
const CP1252_INVERSO = {
  0x20AC:0x80, 0x201A:0x82, 0x0192:0x83, 0x201E:0x84, 0x2026:0x85, 0x2020:0x86,
  0x2021:0x87, 0x02C6:0x88, 0x2030:0x89, 0x0160:0x8A, 0x2039:0x8B, 0x0152:0x8C,
  0x017D:0x8E, 0x2018:0x91, 0x2019:0x92, 0x201C:0x93, 0x201D:0x94, 0x2022:0x95,
  0x2013:0x96, 0x2014:0x97, 0x02DC:0x98, 0x2122:0x99, 0x0161:0x9A, 0x203A:0x9B,
  0x0153:0x9C, 0x017E:0x9E, 0x0178:0x9F,
};

/** Repara texto con doble codificación. Si no está corrupto, lo devuelve igual. */
export function repararMojibake(s) {
  if (typeof s !== "string" || !/[ÃÂ]/.test(s)) return s;
  try {
    const puntos = [...s].map(ch => {
      const cp = ch.codePointAt(0);
      return CP1252_INVERSO[cp] ?? (cp < 256 ? cp : null);
    });
    // Si aparece algún carácter que no cabe en un byte, no era mojibake
    if (puntos.some(b => b === null)) return s;
    return new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(puntos));
  } catch {
    return s; // no era UTF-8 mal decodificado: se deja como estaba
  }
}

/**
 * Lee un archivo de texto detectando la codificación en vez de asumirla.
 * Prueba UTF-8 en modo estricto; si el archivo no es UTF-8 válido, cae a
 * Windows-1252, que es lo que exportan las planillas antiguas.
 */
export async function leerTextoDetectando(file) {
  const buffer = await file.arrayBuffer();
  let bytes = new Uint8Array(buffer);
  // BOM UTF-8
  if (bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) bytes = bytes.slice(3);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

// Normaliza un RUT para usarlo como clave estable (id de documento / lookup de reglas)
export function normalizaRut(rut) {
  return String(rut || "").replace(/[-.\s]/g, "").toUpperCase();
}
export const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
export const MESES_S = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

// ─── Tipos de cuenta IFRS/SII ─────────────────────────────────────────────────
export const TIPOS_CUENTA = [
  { id: "activo_corriente", label: "Activo Corriente", grupo: "ACTIVO", signo: 1, orden: 1 },
  { id: "activo_no_corriente", label: "Activo No Corriente", grupo: "ACTIVO", signo: 1, orden: 2 },
  { id: "pasivo_corriente", label: "Pasivo Corriente", grupo: "PASIVO", signo: -1, orden: 3 },
  { id: "pasivo_no_corriente", label: "Pasivo No Corriente", grupo: "PASIVO", signo: -1, orden: 4 },
  { id: "patrimonio", label: "Patrimonio", grupo: "PATRIMONIO", signo: -1, orden: 5 },
  { id: "ingreso", label: "Ingresos", grupo: "RESULTADO", signo: -1, orden: 6 },
  { id: "costo", label: "Costo de Ventas", grupo: "RESULTADO", signo: 1, orden: 7 },
  { id: "gasto_adm", label: "Gastos Administración", grupo: "RESULTADO", signo: 1, orden: 8 },
  { id: "gasto_fin", label: "Gastos Financieros", grupo: "RESULTADO", signo: 1, orden: 9 },
  { id: "otro_resultado", label: "Otros Resultados", grupo: "RESULTADO", signo: 1, orden: 10 },
  { id: "iva_credito", label: "IVA Crédito Fiscal", grupo: "TRIBUTARIO", signo: 1, orden: 11 },
  { id: "iva_debito", label: "IVA Débito Fiscal", grupo: "TRIBUTARIO", signo: -1, orden: 12 },
  { id: "ppm", label: "PPM", grupo: "TRIBUTARIO", signo: 1, orden: 13 },
  { id: "impuesto_diferido", label: "Impuesto Diferido", grupo: "TRIBUTARIO", signo: 1, orden: 14 },
];
export const TIPOS_MAP = Object.fromEntries(TIPOS_CUENTA.map(t => [t.id, t]));

// ─── Régimen tributario ───────────────────────────────────────────────────────
// La tasa de Primera Categoría estaba fija en 27% dentro de los componentes.
// Depende del régimen al que esté acogida la empresa, así que se configura acá
// y se lee desde un solo lugar. Verificar la tasa vigente con el SII: cambia.
export const REGIMENES_TRIBUTARIOS = [
  { id: "14A",  label: "Régimen General (14 A, semi integrado)", tasa: 0.27 },
  { id: "14D3", label: "Pyme Pro (14 D N°3)",                    tasa: 0.25 },
  { id: "14D8", label: "Pyme Transparente (14 D N°8)",           tasa: 0    },
];

// ─── Plan de cuentas base (precargado) ────────────────────────────────────────
export const CUENTAS_BASE = [
  { codigo: "1-01-001", nombre: "Caja", tipo: "activo_corriente" },
  { codigo: "1-01-002", nombre: "Banco", tipo: "activo_corriente" },
  { codigo: "1-01-003", nombre: "Cuentas por Cobrar", tipo: "activo_corriente" },
  { codigo: "1-01-004", nombre: "IVA Crédito Fiscal", tipo: "iva_credito" },
  { codigo: "1-01-005", nombre: "PPM", tipo: "ppm" },
  { codigo: "1-01-006", nombre: "Impuesto Diferido Activo", tipo: "impuesto_diferido" },
  { codigo: "1-02-001", nombre: "Activo Fijo (Maquinaria)", tipo: "activo_no_corriente" },
  { codigo: "1-02-002", nombre: "Depreciación Acumulada", tipo: "activo_no_corriente" },
  { codigo: "2-01-001", nombre: "Cuentas por Pagar", tipo: "pasivo_corriente" },
  { codigo: "2-01-002", nombre: "IVA Débito Fiscal", tipo: "iva_debito" },
  { codigo: "2-01-003", nombre: "Remuneraciones por Pagar", tipo: "pasivo_corriente" },
  { codigo: "2-01-004", nombre: "Retención Honorarios x Pagar", tipo: "pasivo_corriente" },
  { codigo: "2-01-005", nombre: "Honorarios Líquidos x Pagar", tipo: "pasivo_corriente" },
  { codigo: "2-02-001", nombre: "Leasing por Pagar L/P", tipo: "pasivo_no_corriente" },
  { codigo: "2-02-002", nombre: "Créditos Bancarios L/P", tipo: "pasivo_no_corriente" },
  { codigo: "3-01-001", nombre: "Capital", tipo: "patrimonio" },
  { codigo: "3-01-002", nombre: "Utilidades Retenidas", tipo: "patrimonio" },
  { codigo: "3-01-003", nombre: "Resultado del Ejercicio", tipo: "patrimonio" },
  { codigo: "4-01-001", nombre: "Ingresos por Contratos", tipo: "ingreso" },
  { codigo: "4-01-002", nombre: "Ingresos por Servicios", tipo: "ingreso" },
  { codigo: "5-01-001", nombre: "Costo Mano de Obra", tipo: "costo" },
  { codigo: "5-01-002", nombre: "Materiales y Suministros", tipo: "costo" },
  { codigo: "6-01-001", nombre: "Remuneraciones Administración", tipo: "gasto_adm" },
  { codigo: "6-01-002", nombre: "Arriendos", tipo: "gasto_adm" },
  { codigo: "6-01-003", nombre: "Gastos Generales", tipo: "gasto_adm" },
  { codigo: "6-01-004", nombre: "Honorarios a Terceros", tipo: "gasto_adm" },
  { codigo: "6-02-001", nombre: "Intereses Leasing", tipo: "gasto_fin" },
  { codigo: "6-02-002", nombre: "Intereses Bancarios", tipo: "gasto_fin" },
  { codigo: "6-03-001", nombre: "Depreciación del Período", tipo: "otro_resultado" },
];

// ─── Provider ─────────────────────────────────────────────────────────────────
export function ContabilidadProvider({ children }) {
  const { empresaId } = useEmpresa();
  const [cuentas, setCuentas] = useState([]);
  const [asientosTodos, setAsientosTodos] = useState([]);
  // Inicializar con el período actual para que el selector no aparezca vacío durante la carga
  const [periodos, setPeriodos] = useState(() => {
    const d = new Date();
    return [{ id: mesKey(d), mes: d.getMonth(), anio: d.getFullYear(), cerrado: false }];
  });
  const [loadingCuentas, setLoadingC] = useState(true);
  const [loadingAsientos, setLoadingA] = useState(true);
  const [periodoActivo, setPeriodoActivo] = useState(mesKey());
  // Reglas de clasificación aprendidas: { [rutNormalizado]: { rut, razonSocial, cuentaId, cuentaNombre, categoriaLabel, categoriaIcon } }
  const [reglasGasto, setReglasGasto] = useState({});
  // Régimen tributario de la empresa — determina la tasa de Primera Categoría
  const [regimen, setRegimen] = useState("14A");
  const tasaPrimeraCategoria =
    REGIMENES_TRIBUTARIOS.find(r => r.id === regimen)?.tasa ?? 0.27;
  const setTasaPrimeraCategoria = setRegimen;

  // Cargar plan de cuentas
  const cargarCuentas = useCallback(async () => {
    if (!empresaId) { setLoadingC(false); return; }
    setLoadingC(true);
    try {
      const snap = await getDocs(query(
        collection(db, "empresas", empresaId, "chart_of_accounts"),
        orderBy("codigo")
      ));
      if (snap.empty) {
        // Primera vez: inicializar con plan base
        const batch = CUENTAS_BASE.map(c =>
          addDoc(collection(db, "empresas", empresaId, "chart_of_accounts"), {
            ...c, activa: true, creadaEn: serverTimestamp()
          })
        );
        await Promise.all(batch);
        // Recargar
        const snap2 = await getDocs(query(
          collection(db, "empresas", empresaId, "chart_of_accounts"),
          orderBy("codigo")
        ));
        setCuentas(snap2.docs.map(d => ({ id: d.id, ...d.data() })));
      } else {
        const existentes = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        // Migración: agregar cuentas del plan base que no existen aún (por código)
        const codigosExistentes = new Set(existentes.map(c => c.codigo));
        const faltantes = CUENTAS_BASE.filter(c => !codigosExistentes.has(c.codigo));
        if (faltantes.length > 0) {
          await Promise.all(faltantes.map(c =>
            addDoc(collection(db, "empresas", empresaId, "chart_of_accounts"), {
              ...c, activa: true, creadaEn: serverTimestamp()
            })
          ));
          const snap3 = await getDocs(query(
            collection(db, "empresas", empresaId, "chart_of_accounts"),
            orderBy("codigo")
          ));
          setCuentas(snap3.docs.map(d => ({ id: d.id, ...d.data() })));
        } else {
          setCuentas(existentes);
        }
      }
    } catch (e) { console.error(e); }
    setLoadingC(false);
  }, [empresaId]);

  // Cargar TODOS los asientos de la empresa una sola vez.
  //
  // Antes se filtraba por `periodo == periodoActivo` en la consulta, así que
  // `asientos` solo contenía un mes. Como los informes derivan sus saldos de
  // este array, el Estado de Situación Financiera mostraba los MOVIMIENTOS del
  // mes en vez de los SALDOS acumulados: Caja, Banco, Cuentas por Cobrar y
  // Capital aparecían en cero si ese mes no se movieron, y el balance nunca
  // cuadraba. Los saldos de balance son acumulados por definición.
  const cargarAsientos = useCallback(async () => {
    if (!empresaId) { setLoadingA(false); return; }
    setLoadingA(true);
    try {
      const snap = await getDocs(
        collection(db, "empresas", empresaId, "journal_entries")
      );
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      docs.sort((a, b) => {
        const fa = a.fecha?.seconds ?? a.fecha ?? 0;
        const fb = b.fecha?.seconds ?? b.fecha ?? 0;
        return fb - fa;
      });
      setAsientosTodos(docs);
    } catch (e) { console.error(e); }
    setLoadingA(false);
  }, [empresaId]);

  // Asientos del período activo — lo que muestra el Libro Diario
  const asientos = useMemo(
    () => asientosTodos.filter(a => a.periodo === periodoActivo),
    [asientosTodos, periodoActivo]
  );

  const cargarPeriodos = useCallback(async () => {
    if (!empresaId) return;
    try {
      // Siempre generar los últimos 24 meses — esto nunca falla
      const hoy = new Date();
      const generados = [];
      for (let i = 0; i < 24; i++) {
        const d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1);
        const id = mesKey(d);
        generados.push({ id, mes: d.getMonth(), anio: d.getFullYear(), cerrado: false });
      }

      // Intentar sincronizar active_periods (requiere regla en Firestore)
      try {
        let snapPeriods = await getDocs(
          collection(db, "empresas", empresaId, "active_periods")
        );
        // Si está vacía, migrar desde journal_entries (una sola vez)
        if (snapPeriods.empty) {
          const snapAll = await getDocs(
            collection(db, "empresas", empresaId, "journal_entries")
          );
          const encontrados = new Set();
          snapAll.docs.forEach(d => { const p = d.data().periodo; if (p) encontrados.add(p); });
          if (encontrados.size > 0) {
            await Promise.all(Array.from(encontrados).map(p =>
              setDoc(doc(db, "empresas", empresaId, "active_periods", p), {
                creadoEn: serverTimestamp(), tieneAsientos: true
              })
            ));
            snapPeriods = await getDocs(collection(db, "empresas", empresaId, "active_periods"));
          }
        }
        // Marcar períodos que tienen asientos
        snapPeriods.docs.forEach(d => {
          const idx = generados.findIndex(p => p.id === d.id);
          if (idx >= 0) generados[idx].tieneAsientos = true;
        });
      } catch (_) { /* sin permisos para active_periods — mostramos igual los 24 meses */ }

      // Intentar enriquecer con datos de la colección "periods" (cerrados, etc.)
      try {
        const snap = await getDocs(collection(db, "empresas", empresaId, "periods"));
        snap.docs.forEach(d => {
          const idx = generados.findIndex(p => p.id === d.id);
          if (idx >= 0) generados[idx] = { ...generados[idx], ...d.data(), id: d.id };
          else {
            const [anio, mes] = d.id.split("-");
            generados.push({ id: d.id, mes: parseInt(mes) - 1, anio: parseInt(anio), cerrado: false, ...d.data() });
          }
        });
      } catch (_) { /* sin permisos para "periods" — ok */ }

      generados.sort((a, b) => b.id.localeCompare(a.id));
      setPeriodos(generados);
    } catch (e) { console.error("cargarPeriodos:", e); }
  }, [empresaId]);

  useEffect(() => { cargarCuentas(); }, [cargarCuentas]);
  useEffect(() => { cargarAsientos(); }, [cargarAsientos]);
  useEffect(() => { cargarPeriodos(); }, [cargarPeriodos]);

  // ── Saldos ────────────────────────────────────────────────────────────────
  //
  // Hay dos preguntas distintas y antes se respondían con la misma función:
  //
  //   · ¿Cuánto se movió esta cuenta ESTE MES?  → cuentas de resultado, IVA, PPM
  //   · ¿Cuánto SALDO tiene esta cuenta HOY?    → activo, pasivo, patrimonio
  //
  // Mezclarlas producía un ESF con saldos de un solo mes. Cada informe debe
  // pedir explícitamente el que le corresponde.

  /** Acumula debe/haber de una lista de asientos en un mapa por cuentaId. */
  function acumular(fuente) {
    const mapa = {};
    fuente.forEach(asiento => {
      (asiento.lineas || []).forEach(l => {
        if (!mapa[l.cuentaId]) mapa[l.cuentaId] = { debe: 0, haber: 0 };
        mapa[l.cuentaId].debe  += parseFloat(l.debe  || 0);
        mapa[l.cuentaId].haber += parseFloat(l.haber || 0);
      });
    });
    return mapa;
  }

  /**
   * MOVIMIENTOS de un período (por defecto, el activo).
   * Úsalo para Estado de Resultados, F29 e IVA: son flujos del mes.
   */
  const saldosPeriodo = useCallback((periodo = null) => {
    const p = periodo || periodoActivo;
    return acumular(asientosTodos.filter(a => a.periodo === p));
  }, [asientosTodos, periodoActivo]);

  /**
   * SALDOS ACUMULADOS hasta el período indicado, inclusive.
   * Úsalo para Estado de Situación Financiera y Balance de Comprobación:
   * un saldo de balance es la suma de todo lo ocurrido hasta la fecha de corte.
   * Los períodos son "YYYY-MM", así que la comparación de strings ya ordena bien.
   */
  const saldosAcumulados = useCallback((hasta = null) => {
    const corte = hasta || periodoActivo;
    return acumular(asientosTodos.filter(a => a.periodo && a.periodo <= corte));
  }, [asientosTodos, periodoActivo]);

  /**
   * ACUMULADO DEL AÑO hasta el período indicado (enero → corte).
   * Úsalo para el F22 y cualquier cifra anual: la renta líquida imponible se
   * determina sobre el ejercicio, no sobre un mes.
   */
  const saldosAnio = useCallback((hasta = null) => {
    const corte = hasta || periodoActivo;
    const anio = corte.split("-")[0];
    return acumular(asientosTodos.filter(a => a.periodo && a.periodo.startsWith(anio) && a.periodo <= corte));
  }, [asientosTodos, periodoActivo]);

  // Compatibilidad: `saldos()` conserva la firma anterior (movimientos del período).
  // Preferir saldosPeriodo / saldosAcumulados / saldosAnio, que dicen lo que hacen.
  const saldos = saldosPeriodo;

  // Saldo neto acumulado de una cuenta (positivo = deudora, negativo = acreedora)
  const saldoCuenta = useCallback((cuentaId, hasta = null) => {
    const s = saldosAcumulados(hasta)[cuentaId] || { debe: 0, haber: 0 };
    return s.debe - s.haber;
  }, [saldosAcumulados]);

  // ── Bitácora contable ─────────────────────────────────────────────────────
  // Un libro contable no puede perder rastro de lo que se modificó. Antes se
  // borraban asientos con deleteDoc y no quedaba constancia de nada.
  const registrarBitacora = async (accion, datos) => {
    if (!empresaId) return;
    try {
      await addDoc(collection(db, "empresas", empresaId, "contabilidad_auditoria"), {
        accion, ...datos, en: serverTimestamp(),
      });
    } catch (e) { console.error("bitácora:", e); }
  };

  /**
   * Correlativo del libro diario, por ejercicio: 2026-00001, 2026-00002…
   * El Código de Comercio exige que el diario sea correlativo y sin saltos;
   * hasta ahora los asientos solo tenían el id aleatorio de Firestore.
   *
   * Se calcula sobre los asientos ya cargados en memoria. Con dos personas
   * registrando en el mismo segundo podrían repetirse: si eso llega a pasar,
   * hay que moverlo a una transacción con un contador en Firestore.
   */
  const siguienteCorrelativo = useCallback((periodo) => {
    const anio = String(periodo || periodoActivo).split("-")[0];
    const usados = asientosTodos
      .filter(a => String(a.numero || "").startsWith(`${anio}-`))
      .map(a => parseInt(String(a.numero).split("-")[1], 10) || 0);
    const siguiente = (usados.length ? Math.max(...usados) : 0) + 1;
    return `${anio}-${String(siguiente).padStart(5, "0")}`;
  }, [asientosTodos, periodoActivo]);

  /** Un período cerrado no admite movimientos: ya fue declarado. */
  const periodoCerrado = useCallback(
    (p) => !!periodos.find(x => x.id === p)?.cerrado,
    [periodos]
  );

  // Guardar asiento
  const guardarAsiento = async (data) => {
    if (!empresaId) return;
    if (periodoCerrado(data.periodo)) {
      throw new Error(`El período ${data.periodo} está cerrado. Reábrelo antes de modificarlo.`);
    }
    // El asiento debe cuadrar antes de entrar al libro. El formulario manual ya
    // lo valida, pero las importaciones y los asientos automáticos entraban sin
    // pasar por acá.
    const sd = (data.lineas || []).reduce((s, l) => s + (parseFloat(l.debe)  || 0), 0);
    const sh = (data.lineas || []).reduce((s, l) => s + (parseFloat(l.haber) || 0), 0);
    if (Math.abs(sd - sh) > 1) {
      throw new Error(`El asiento no cuadra: debe ${Math.round(sd).toLocaleString("es-CL")} vs haber ${Math.round(sh).toLocaleString("es-CL")}`);
    }
    if (data.id) {
      // Los asientos generados por importación o por procesos automáticos no se
      // editan a mano: si están mal, se reversan. Editarlos deja el libro
      // inconsistente con su origen y rompe la deduplicación por importHash.
      const previo = asientosTodos.find(a => a.id === data.id);
      const auto = previo?.origen && !["manual", "reverso"].includes(previo.origen);
      if (auto) {
        throw new Error(
          `Este asiento fue generado automáticamente (${previo.origen}) y no se edita a mano. ` +
          `Si está mal, revérsalo y registra el correcto.`
        );
      }
      await registrarBitacora("editar_asiento", {
        asientoId: data.id, periodo: data.periodo,
        numero: previo?.numero || null, glosaAnterior: previo?.glosa || null,
        glosaNueva: data.glosa || null,
      });
      await updateDoc(doc(db, "empresas", empresaId, "journal_entries", data.id), {
        ...data, updatedAt: serverTimestamp()
      });
    } else {
      await addDoc(collection(db, "empresas", empresaId, "journal_entries"), {
        // Correlativo del ejercicio, obligatorio para el libro diario
        numero: data.numero || siguienteCorrelativo(data.periodo),
        origen: data.origen || "manual",
        ...data, creadoEn: serverTimestamp()
      });
    }
    // Registrar el periodo en la colección de metadatos active_periods
    if (data.periodo) {
      await setDoc(doc(db, "empresas", empresaId, "active_periods", data.periodo), {
        tieneAsientos: true,
        updatedAt: serverTimestamp()
      }, { merge: true });
    }
    cargarAsientos();
  };

  const eliminarAsiento = async (id) => {
    if (!empresaId) return;
    // Buscar periodo localmente antes de borrarlo
    const asientoABorrar = asientosTodos.find(a => a.id === id);
    if (asientoABorrar && periodoCerrado(asientoABorrar.periodo)) {
      throw new Error(`El período ${asientoABorrar.periodo} está cerrado. Reábrelo antes de eliminar asientos.`);
    }

    await registrarBitacora("eliminar_asiento", {
      asientoId: id,
      periodo: asientoABorrar?.periodo || null,
      numero:  asientoABorrar?.numero  || null,
      glosa:   asientoABorrar?.glosa   || null,
      total:   asientoABorrar?.totalDebe ?? null,
      lineas:  asientoABorrar?.lineas  || [],
    });
    await deleteDoc(doc(db, "empresas", empresaId, "journal_entries", id));

    // Si era el último asiento de ese periodo en el listado local, eliminamos el metadato del periodo
    if (asientoABorrar && asientoABorrar.periodo) {
      const otrosEnPeriodo = asientosTodos.filter(a => a.periodo === asientoABorrar.periodo && a.id !== id);
      if (otrosEnPeriodo.length === 0) {
        await deleteDoc(doc(db, "empresas", empresaId, "active_periods", asientoABorrar.periodo));
      }
    }
    cargarAsientos();
    cargarPeriodos();
  };

  /**
   * Reversa un asiento en vez de borrarlo.
   * Es la forma correcta de corregir un libro contable: el asiento original y su
   * reverso quedan ambos visibles y la traza no se pierde. Borrar solo se
   * justifica para un error de tipeo recién cometido.
   */
  const reversarAsiento = async (id, motivo = "") => {
    if (!empresaId) return;
    const original = asientosTodos.find(a => a.id === id);
    if (!original) throw new Error("No encuentro el asiento a reversar.");
    if (original.reversado) throw new Error("Este asiento ya fue reversado.");
    if (original.origen === "reverso") throw new Error("No se reversa un reverso.");
    if (periodoCerrado(original.periodo)) {
      throw new Error(`El período ${original.periodo} está cerrado. Registra el reverso en un período abierto.`);
    }

    const lineas = (original.lineas || []).map(l => ({
      ...l,
      debe:  parseFloat(l.haber || 0),   // se invierten
      haber: parseFloat(l.debe  || 0),
      descripcion: `Reverso · ${l.descripcion || ""}`.trim(),
    }));

    await guardarAsiento({
      fecha:   original.fecha,
      glosa:   `REVERSO de ${original.numero || original.id}${motivo ? ` · ${motivo}` : ""} — ${original.glosa || ""}`,
      tipo:    "ajuste",
      origen:  "reverso",
      reversaDe: id,
      periodo: original.periodo,
      lineas,
      totalDebe: lineas.reduce((s, l) => s + (l.debe || 0), 0),
    });

    await updateDoc(doc(db, "empresas", empresaId, "journal_entries", id), {
      reversado: true, reversadoEn: serverTimestamp(), motivoReverso: motivo || null,
    });
    await registrarBitacora("reversar_asiento", {
      asientoId: id, periodo: original.periodo, numero: original.numero || null, motivo: motivo || null,
    });
    cargarAsientos();
  };

  // Buscar qué importHash ya existen en Firestore para un período dado
  // Permite detectar duplicados antes de importar
  const buscarHashesExistentes = async (periodo_) => {
    if (!empresaId) return new Set();
    try {
      const snap = await getDocs(query(
        collection(db, "empresas", empresaId, "journal_entries"),
        where("periodo", "==", periodo_),
        where("origen", "==", "iconstruye")
      ));
      const hashes = new Set();
      snap.docs.forEach(d => {
        const h = d.data().importHash;
        if (h) hashes.add(h);
      });
      return hashes;
    } catch (e) { console.error("buscarHashesExistentes:", e); return new Set(); }
  };

  // ── Reglas de clasificación de gasto por proveedor ─────────────────────────
  // Se aprenden cada vez que el usuario reclasifica un asiento y se aplican
  // automáticamente al importar (mismo proveedor → misma categoría/cuenta).
  const cargarReglas = useCallback(async () => {
    if (!empresaId) return;
    try {
      const snap = await getDocs(collection(db, "empresas", empresaId, "reglas_gasto"));
      const mapa = {};
      snap.docs.forEach(d => {
        const key = normalizaRut(d.id);
        const data = d.data();
        // Las razones sociales guardadas antes del arreglo vienen corruptas
        mapa[key] = { id: d.id, ...data, razonSocial: repararMojibake(data.razonSocial || "") };
      });
      setReglasGasto(mapa);
    } catch (e) { console.error("cargarReglas:", e); }
  }, [empresaId]);
  useEffect(() => { cargarReglas(); }, [cargarReglas]); // ← después de la definición, sin TDZ

  // Guarda/actualiza la regla aprendida para un proveedor (id de doc = RUT normalizado)
  const guardarReglaGasto = async (rut, razonSocial, regla) => {
    if (!empresaId) return;
    const key = normalizaRut(rut);
    if (!key || key === "SIN_RUT") return;
    const data = {
      rut, razonSocial: razonSocial || "",
      cuentaId: regla.cuentaId || "",
      cuentaNombre: regla.cuentaNombre || "",
      categoriaLabel: regla.categoriaLabel || "",
      categoriaIcon: regla.categoriaIcon || "",
      // "usuario" = el usuario la eligió a mano · "auto" = la generó el regex.
      // Sirve para poder limpiar las que se guardaron solas por el bug anterior.
      origen: regla.origen || "auto",
      updatedAt: serverTimestamp(),
    };
    try {
      await setDoc(doc(db, "empresas", empresaId, "reglas_gasto", key), data, { merge: true });
      // Actualizar en memoria inmediatamente (sin esperar recarga)
      setReglasGasto(prev => ({ ...prev, [key]: { id: key, ...data } }));
    } catch (e) { console.error("guardarReglaGasto:", e); }
  };

  /**
   * Reglas deducidas del HISTORIAL: si un proveedor ya tiene asientos guardados,
   * la cuenta que más veces se le asignó es una buena apuesta, aunque nadie haya
   * creado una regla explícita. Cubre a los proveedores que se clasificaron
   * editando el asiento en el Libro Diario en vez de usar el botón de categoría.
   *
   * Devuelve { [rutNormalizado]: { cuentaId, cuentaNombre, veces, origen:"historial" } }
   */
  const reglasDesdeHistorial = useCallback(() => {
    const conteo = {};
    asientosTodos.forEach(a => {
      // El RUT del proveedor viaja en el importHash: "periodo|RUT|folios"
      const rut = normalizaRut((a.importHash || "").split("|")[1] || "");
      if (!rut || rut === "SIN_RUT") return;
      if (String(a.glosa || "").startsWith("NC")) return;
      const gasto = (a.lineas || [])
        .filter(l => parseFloat(l.debe) > 0 && !/(iva|impuesto)/i.test(l.cuentaNombre || ""))
        .sort((x, y) => parseFloat(y.debe) - parseFloat(x.debe))[0];
      if (!gasto?.cuentaId) return;
      conteo[rut] ??= {};
      conteo[rut][gasto.cuentaId] ??= { cuentaId: gasto.cuentaId, cuentaNombre: gasto.cuentaNombre, veces: 0 };
      conteo[rut][gasto.cuentaId].veces++;
    });

    const salida = {};
    for (const [rut, cuentasRut] of Object.entries(conteo)) {
      const lista = Object.values(cuentasRut).sort((a, b) => b.veces - a.veces);
      // Solo si hay una cuenta claramente dominante: si el proveedor se reparte
      // entre varias, adivinar sería peor que dejarlo a la clasificación normal.
      if (lista.length && lista[0].veces >= 2 && (!lista[1] || lista[0].veces > lista[1].veces)) {
        salida[rut] = { ...lista[0], origen: "historial" };
      }
    }
    return salida;
  }, [asientosTodos]);

  /**
   * Reglas efectivas para clasificar: primero lo que el usuario decidió a mano,
   * después lo deducido del historial.
   */
  const reglasEfectivas = useCallback(() => {
    const hist = reglasDesdeHistorial();
    const salida = { ...hist };
    for (const [rut, r] of Object.entries(reglasGasto)) {
      // Una regla marcada "auto" viene del bug anterior: pesa menos que el historial
      if (r.origen === "auto" && hist[rut]) continue;
      salida[rut] = r;
    }
    return salida;
  }, [reglasGasto, reglasDesdeHistorial]);

  /**
   * Reescribe en Firestore las razones sociales que quedaron con caracteres
   * corruptos. La lectura ya las repara al vuelo, pero conviene dejarlas bien
   * guardadas para que las búsquedas y los informes coincidan.
   */
  const repararNombresProveedores = async () => {
    if (!empresaId) return 0;
    let n = 0;
    for (const r of Object.values(reglasGasto)) {
      const original = r.razonSocialCruda ?? r.razonSocial ?? "";
      const limpio = repararMojibake(original);
      if (limpio && limpio !== original) {
        await setDoc(doc(db, "empresas", empresaId, "reglas_gasto", r.id),
          { razonSocial: limpio, updatedAt: serverTimestamp() }, { merge: true });
        n++;
      }
    }
    if (n) { await registrarBitacora("reparar_nombres_proveedor", { corregidos: n }); await cargarReglas(); }
    return n;
  };

  /** Borra en bloque las reglas que se guardaron solas (origen distinto de "usuario"). */
  const limpiarReglasAutomaticas = async () => {
    if (!empresaId) return 0;
    const aBorrar = Object.values(reglasGasto).filter(r => r.origen !== "usuario");
    for (const r of aBorrar) {
      await deleteDoc(doc(db, "empresas", empresaId, "reglas_gasto", r.id));
    }
    await registrarBitacora("limpiar_reglas_gasto", { eliminadas: aBorrar.length });
    await cargarReglas();
    return aBorrar.length;
  };

  const eliminarReglaGasto = async (rut) => {
    if (!empresaId) return;
    const key = normalizaRut(rut);
    try {
      await deleteDoc(doc(db, "empresas", empresaId, "reglas_gasto", key));
      setReglasGasto(prev => { const n = { ...prev }; delete n[key]; return n; });
    } catch (e) { console.error("eliminarReglaGasto:", e); }
  };

  /**
   * Asiento de cierre de ejercicio.
   * Salda todas las cuentas de resultado del año contra "Resultado del Ejercicio"
   * (3-01-003). Sin esto, el resultado histórico queda vivo en las cuentas de
   * resultado para siempre y no hay forma de arrancar un ejercicio en cero.
   */
  const generarAsientoCierre = async (anio) => {
    if (!empresaId) throw new Error("Sin empresa activa");
    const periodo = `${anio}-12`;
    if (periodoCerrado(periodo)) throw new Error(`El período ${periodo} está cerrado.`);
    if (asientosTodos.some(a => a.periodo === periodo && a.origen === "cierre")) {
      throw new Error(`El ejercicio ${anio} ya tiene asiento de cierre.`);
    }

    const delAnio = asientosTodos.filter(a => a.periodo && a.periodo.startsWith(String(anio)));
    const mapa = {};
    delAnio.forEach(a => (a.lineas || []).forEach(l => {
      if (!mapa[l.cuentaId]) mapa[l.cuentaId] = { debe: 0, haber: 0 };
      mapa[l.cuentaId].debe  += parseFloat(l.debe  || 0);
      mapa[l.cuentaId].haber += parseFloat(l.haber || 0);
    }));

    const cResultado = cuentas.find(c => c.codigo === "3-01-003")
                    || cuentas.find(c => /resultado del ejercicio/i.test(c.nombre));
    if (!cResultado) throw new Error("Falta la cuenta 3-01-003 Resultado del Ejercicio.");

    const esResultado = (c) => ["ingreso","costo","gasto_adm","gasto_fin","otro_resultado"].includes(c.tipo);
    const lineas = [];
    let neto = 0;

    cuentas.filter(c => esResultado(c) && c.activa !== false).forEach(c => {
      const s = mapa[c.id] || { debe: 0, haber: 0 };
      const saldo = s.debe - s.haber;           // deudor > 0, acreedor < 0
      if (Math.round(Math.abs(saldo)) === 0) return;
      // Se salda con el movimiento contrario
      lineas.push(saldo > 0
        ? { cuentaId: c.id, cuentaNombre: c.nombre, debe: 0, haber: Math.round(saldo), descripcion: "Cierre de ejercicio" }
        : { cuentaId: c.id, cuentaNombre: c.nombre, debe: Math.round(-saldo), haber: 0, descripcion: "Cierre de ejercicio" });
      neto += saldo;
    });

    if (!lineas.length) throw new Error("No hay cuentas de resultado con saldo en el ejercicio.");

    // neto > 0 = pérdida (más gastos que ingresos) → Resultado del Ejercicio al debe
    const monto = Math.round(Math.abs(neto));
    lineas.push(neto > 0
      ? { cuentaId: cResultado.id, cuentaNombre: cResultado.nombre, debe: monto, haber: 0, descripcion: "Pérdida del ejercicio" }
      : { cuentaId: cResultado.id, cuentaNombre: cResultado.nombre, debe: 0, haber: monto, descripcion: "Utilidad del ejercicio" });

    const sd = lineas.reduce((s, l) => s + l.debe, 0);
    const sh = lineas.reduce((s, l) => s + l.haber, 0);
    if (Math.abs(sd - sh) > 1) throw new Error(`El asiento de cierre no cuadra: ${sd} vs ${sh}`);

    await guardarAsiento({
      fecha: `${anio}-12-31`,
      glosa: `Cierre del ejercicio ${anio} · ${neto <= 0 ? "utilidad" : "pérdida"} de ${monto.toLocaleString("es-CL")}`,
      tipo: "cierre",
      origen: "cierre",
      periodo,
      lineas,
      totalDebe: sd,
    });
    return { monto, esUtilidad: neto <= 0, cuentasSaldadas: lineas.length - 1 };
  };

  /**
   * Elimina una cuenta del plan. Se niega si tiene movimientos.
   *
   * Esta función NO existía: `ContabilidadPlanCuentas` la desestructuraba del
   * contexto y el botón "Eliminar duplicadas" fallaba en silencio, tragado por
   * un try/catch. Implementarla sin esta guarda habría sido peor que el bug:
   * los asientos guardan `cuentaId`, no el código, así que al borrar la cuenta
   * sus líneas quedan huérfanas — siguen sumando en un id que ya no existe y
   * desaparecen de todos los informes mientras el asiento sigue cuadrando.
   */
  const eliminarCuenta = async (cuentaId) => {
    if (!empresaId) return;
    const conMovimiento = asientosTodos.some(a =>
      (a.lineas || []).some(l => l.cuentaId === cuentaId));
    if (conMovimiento) {
      throw new Error(
        "Esta cuenta tiene asientos registrados. Desactívala en vez de eliminarla, " +
        "o fusiónala con otra para no dejar líneas huérfanas."
      );
    }
    const c = cuentas.find(x => x.id === cuentaId);
    await registrarBitacora("eliminar_cuenta", {
      cuentaId, codigo: c?.codigo || null, nombre: c?.nombre || null,
    });
    await deleteDoc(doc(db, "empresas", empresaId, "chart_of_accounts", cuentaId));
    cargarCuentas();
  };

  /**
   * Fusiona cuentas duplicadas: reasigna TODAS las líneas de las cuentas a
   * eliminar hacia la que sobrevive, y recién entonces las borra.
   * Es lo que necesita el botón de deduplicar del Plan de Cuentas.
   */
  const fusionarCuentas = async (idSobrevive, idsAEliminar = []) => {
    if (!empresaId || !idsAEliminar.length) return { reasignados: 0, eliminadas: 0 };
    const destino = cuentas.find(c => c.id === idSobrevive);
    if (!destino) throw new Error("La cuenta de destino no existe.");
    const set = new Set(idsAEliminar);

    // Los asientos de períodos cerrados no se tocan: habría que reabrirlos.
    const afectados = asientosTodos.filter(a =>
      (a.lineas || []).some(l => set.has(l.cuentaId)));
    const bloqueados = afectados.filter(a => periodoCerrado(a.periodo));
    if (bloqueados.length) {
      throw new Error(
        `${bloqueados.length} asiento(s) están en períodos cerrados (${
          [...new Set(bloqueados.map(a => a.periodo))].join(", ")
        }). Reábrelos antes de fusionar.`
      );
    }

    let reasignados = 0;
    for (const a of afectados) {
      const lineas = (a.lineas || []).map(l => set.has(l.cuentaId)
        ? { ...l, cuentaId: idSobrevive, cuentaNombre: destino.nombre }
        : l);
      await updateDoc(doc(db, "empresas", empresaId, "journal_entries", a.id), {
        lineas, updatedAt: serverTimestamp(),
      });
      reasignados++;
    }

    let eliminadas = 0;
    for (const id of idsAEliminar) {
      await deleteDoc(doc(db, "empresas", empresaId, "chart_of_accounts", id));
      eliminadas++;
    }

    await registrarBitacora("fusionar_cuentas", {
      codigo: destino.codigo, sobrevive: idSobrevive, eliminadas: idsAEliminar, reasignados,
    });
    await cargarCuentas();
    await cargarAsientos();
    return { reasignados, eliminadas };
  };

  // Guardar cuenta
  const guardarCuenta = async (data) => {
    if (!empresaId) return;
    if (data.id) {
      const { id, ...rest } = data;
      await updateDoc(doc(db, "empresas", empresaId, "chart_of_accounts", id), rest);
    } else {
      await addDoc(collection(db, "empresas", empresaId, "chart_of_accounts"), {
        ...data, activa: true, creadaEn: serverTimestamp()
      });
    }
    cargarCuentas();
  };

  return (
    <ContabilidadContext.Provider value={{
      cuentas, asientos, asientosTodos, periodos, periodoActivo, setPeriodoActivo,
      loadingCuentas, loadingAsientos,
      cargarCuentas, cargarAsientos, cargarPeriodos,
      saldos, saldosPeriodo, saldosAcumulados, saldosAnio, saldoCuenta,
      periodoCerrado, generarAsientoCierre, reversarAsiento, siguienteCorrelativo,
      eliminarCuenta, fusionarCuentas,
      tasaPrimeraCategoria, setTasaPrimeraCategoria, REGIMENES_TRIBUTARIOS,
      guardarAsiento, eliminarAsiento, guardarCuenta, buscarHashesExistentes,
      reglasGasto, cargarReglas, guardarReglaGasto, eliminarReglaGasto,
      reglasDesdeHistorial, reglasEfectivas, limpiarReglasAutomaticas, repararNombresProveedores,
    }}>
      {children}
    </ContabilidadContext.Provider>
  );
}

export function useContabilidad() {
  const ctx = useContext(ContabilidadContext);
  if (!ctx) throw new Error("useContabilidad debe usarse dentro de ContabilidadProvider");
  return ctx;
}

// ─── Selector de período reutilizable ────────────────────────────────────────
export function PeriodoSelector({ className = "" }) {
  const { periodos, periodoActivo, setPeriodoActivo } = useContabilidad();
  return (
    <div className={`relative ${className}`}>
      <svg className="w-3.5 h-3.5 text-purple-500 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
      <select
        value={periodoActivo}
        onChange={e => setPeriodoActivo(e.target.value)}
        className="pl-7 pr-8 py-2 border-2 border-purple-200 bg-purple-50 text-purple-800 rounded-xl focus:outline-none focus:border-purple-500 text-xs font-bold appearance-none cursor-pointer min-w-36"
      >
        {periodos.map(p => {
          const [anio, mes] = p.id.split("-");
          return (
            <option key={p.id} value={p.id}>
              {MESES[parseInt(mes) - 1]} {anio}
            </option>
          );
        })}
      </select>
      <svg className="w-3 h-3 text-purple-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
      </svg>
    </div>
  );
}
