import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useEmpresa } from "../../lib/useEmpresa";
import { db } from "../../lib/firebase";
import {
  collection, getDocs, addDoc, updateDoc, deleteDoc,
  doc, serverTimestamp, query, orderBy, where
} from "firebase/firestore";
import * as XLSX from "xlsx";

// ─── Formato números ──────────────────────────────────────────────────────────
const fmtN  = (n) => (parseFloat(n)||0).toLocaleString("es-CL", {maximumFractionDigits:0});
const fmtL  = (n) => (parseFloat(n)||0).toLocaleString("es-CL", {maximumFractionDigits:2});
const fmtPesos = (n) => `$${fmtN(n)}`;

// ─── Tabla maestra: tipo de maquinaria → recupera IE ─────────────────────────
// Fuente: columna N-O de hoja Maquinaria del Excel
const TIPOS_RECUPERA = {
  "AUTOHORMIGONERA": true, "BULLDOZER": true, "CAMION PLUMA": true,
  "CARGADOR FRONTAL": true, "EXCAVADORA": true, "GENERADOR": true,
  "GENERADOR DIESEL": true, "MARTILLO HIDRAULICO": true,
  "MOTONIVELADORA": true, "PLANTA CHANCADORA": true,
  "PLANTA SELECCIONADORA": true, "RETROEXCAVADORA": true,
  "RODILLO": true, "RODILLO TAMBOR": true,
  // NO recuperan:
  "CAMA BAJA": false, "CAMION ALJIBE": false, "CAMION CHOCO": false,
  "CAMION COMBUSTIBLE": false, "CAMION LOGISTICA": false,
  "CAMION MIXER": false, "CAMION TOLVA": false, "CAMIONETA": false,
  "FURGON": false, "MINIBUS": false, "MOCHILA DIESEL MOVIL": false,
  "SEMI REMOLQUE ESTANQUE": false, "STATION WAGON": false,
  "TRACTO CAMION": false, "VEHICULO MENOR": false,
  "CAMION IMPRIMADOR": false, "EQUIPOS MENORES": false,
  "AMBULANCIA": false,
};

const TIPOS_LISTA = Object.keys(TIPOS_RECUPERA).sort();

// ─── Hook Firestore maquinaria ────────────────────────────────────────────────
function useMaquinaria() {
  const { empresaId } = useEmpresa();
  const [maquinas, setMaquinas]   = useState([]);
  const [loading, setLoading]     = useState(true);

  const cargar = useCallback(async () => {
    if (!empresaId) return;
    setLoading(true);
    const snap = await getDocs(query(
      collection(db, "empresas", empresaId, "combustible_maquinaria"),
      orderBy("patente")
    ));
    setMaquinas(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    setLoading(false);
  }, [empresaId]);

  useEffect(() => { cargar(); }, [cargar]);

  const guardar = async (data) => {
    if (!empresaId) return;
    if (data.id) {
      const { id, ...rest } = data;
      await updateDoc(doc(db, "empresas", empresaId, "combustible_maquinaria", id),
        { ...rest, updatedAt: serverTimestamp() });
    } else {
      await addDoc(collection(db, "empresas", empresaId, "combustible_maquinaria"),
        { ...data, creadoEn: serverTimestamp() });
    }
    cargar();
  };

  const eliminar = async (id) => {
    await deleteDoc(doc(db, "empresas", empresaId, "combustible_maquinaria", id));
    cargar();
  };

  return { maquinas, loading, guardar, eliminar, cargar };
}

// ─── Hook Firestore cálculos mensuales ───────────────────────────────────────
function useCalculosMensuales() {
  const { empresaId } = useEmpresa();

  const guardarCalculo = async (data) => {
    if (!empresaId) return;
    // Upsert por período: buscar si ya existe
    const snap = await getDocs(query(
      collection(db, "empresas", empresaId, "combustible_calculos"),
      where("periodo", "==", data.periodo)
    ));
    if (snap.empty) {
      await addDoc(collection(db, "empresas", empresaId, "combustible_calculos"),
        { ...data, creadoEn: serverTimestamp() });
    } else {
      await updateDoc(
        doc(db, "empresas", empresaId, "combustible_calculos", snap.docs[0].id),
        { ...data, updatedAt: serverTimestamp() }
      );
    }
  };

  const obtenerCalculo = async (periodo) => {
    if (!empresaId) return null;
    const snap = await getDocs(query(
      collection(db, "empresas", empresaId, "combustible_calculos"),
      where("periodo", "==", periodo)
    ));
    return snap.empty ? null : { id: snap.docs[0].id, ...snap.docs[0].data() };
  };

  return { guardarCalculo, obtenerCalculo };
}

// ─── Importación masiva desde Excel (hoja Maquinaria) ────────────────────────
async function importarMaquinariaDesdeExcel(file, maquinasExistentes, guardar) {
  const data = await file.arrayBuffer();
  const wb   = XLSX.read(data, { type:"array", cellDates:true });
  const ws   = wb.Sheets["Maquinaria"];
  if (!ws) throw new Error("No se encontró la hoja 'Maquinaria' en el Excel");

  const rows = XLSX.utils.sheet_to_json(ws, { defval: null, header: 0 });

  // Mapa de patentes ya existentes para evitar duplicados
  const patenteExistentes = new Set(maquinasExistentes.map(m => m.patente?.toUpperCase()));

  const nuevas = [];
  rows.forEach(r => {
    const patente  = String(r["PATENTE"] || r["Patente"] || "").trim().toUpperCase();
    const tipo     = String(r["TIPO"]    || r["Tipo"]    || "").trim().toUpperCase();
    const marca    = String(r["MARCA"]   || r["Marca"]   || "").trim();
    const modelo   = String(r["MODELO"]  || r["Modelo"]  || "").trim();
    const anio     = r["AÑO"] || r["Año"] || r["AñO"] || "";
    const recupera = String(r["RECUPERA IMPTO.DIESEL"] || r["Recupera"] || "").trim().toUpperCase();

    if (!patente || !tipo) return;
    if (patenteExistentes.has(patente)) return; // ya existe, no duplicar

    nuevas.push({
      patente,
      tipo,
      marca,
      modelo,
      anio: anio ? String(anio) : "",
      recuperaIE: recupera === "SI",
    });
    patenteExistentes.add(patente); // evitar duplicados dentro del mismo Excel
  });

  // Guardar en lotes
  for (const m of nuevas) {
    await guardar(m);
  }
  return nuevas.length;
}

// ─── Panel Maestro de Maquinaria ──────────────────────────────────────────────
function PanelMaquinaria({ maquinas, loading, onGuardar, onEliminar }) {
  const [editando, setEditando]   = useState(null);   // null | {} | {id,...}
  const [busqueda, setBusqueda]   = useState("");
  const [filtroRec, setFiltroRec] = useState("todos"); // todos | si | no
  const [importando, setImportando] = useState(false);
  const [msgImport, setMsgImport]   = useState("");

  const EMPTY = { patente:"", tipo:"CAMIONETA", marca:"", modelo:"", anio:"", recuperaIE: false };

  const filtradas = useMemo(() => maquinas.filter(m => {
    const b = busqueda.toLowerCase();
    if (b && !m.patente?.toLowerCase().includes(b) && !m.tipo?.toLowerCase().includes(b) && !m.marca?.toLowerCase().includes(b)) return false;
    if (filtroRec === "si"  && !m.recuperaIE) return false;
    if (filtroRec === "no"  &&  m.recuperaIE) return false;
    return true;
  }), [maquinas, busqueda, filtroRec]);

  const handleGuardar = async () => {
    if (!editando?.patente || !editando?.tipo) return;
    // Auto-determinar recuperaIE si el tipo está en la tabla
    const rec = editando.recuperaIEManual !== undefined
      ? editando.recuperaIEManual
      : (TIPOS_RECUPERA[editando.tipo] ?? false);
    await onGuardar({ ...editando, recuperaIE: rec });
    setEditando(null);
  };

  const nSI  = maquinas.filter(m => m.recuperaIE).length;
  const nNO  = maquinas.filter(m => !m.recuperaIE).length;

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label:"Total equipos",    val:maquinas.length, color:"text-slate-800" },
          { label:"Recuperan IE",     val:nSI,             color:"text-emerald-700" },
          { label:"No recuperan",     val:nNO,             color:"text-red-600"    },
        ].map(k => (
          <div key={k.label} className="glass-card rounded-xl p-3 text-center">
            <p className="text-[10px] text-slate-400 font-bold uppercase">{k.label}</p>
            <p className={`text-xl font-black mt-0.5 ${k.color}`}>{k.val}</p>
          </div>
        ))}
      </div>

      {/* Mensaje importación */}
      {msgImport && (
        <div className={`p-3 rounded-xl text-xs font-semibold ${msgImport.startsWith("✅") ? "bg-emerald-50 border border-emerald-200 text-emerald-700" : "bg-amber-50 border border-amber-200 text-amber-700"}`}>
          {msgImport}
        </div>
      )}

      {/* Filtros */}
      <div className="flex gap-2">
        <input value={busqueda} onChange={e => setBusqueda(e.target.value)}
          placeholder="Buscar patente, tipo o marca..."
          className="flex-1 px-3 py-2 border-2 border-slate-200 rounded-xl text-sm focus:outline-none focus:border-purple-400" />
        <select value={filtroRec} onChange={e => setFiltroRec(e.target.value)}
          className="px-3 py-2 border-2 border-slate-200 rounded-xl text-sm font-semibold focus:outline-none bg-white">
          <option value="todos">Todos</option>
          <option value="si">✅ Recuperan IE</option>
          <option value="no">❌ No recuperan</option>
        </select>
        {/* Importar desde Excel */}
        <label className="px-4 py-2 bg-gradient-to-r from-teal-700 to-emerald-600 text-white text-sm font-bold rounded-xl shadow-md hover:shadow-lg transition-all flex items-center gap-2 cursor-pointer">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/>
          </svg>
          {importando ? "Importando..." : "Importar Excel"}
          <input type="file" accept=".xlsx,.xls" className="hidden" disabled={importando}
            onChange={async (e) => {
              const file = e.target.files[0];
              if (!file) return;
              setImportando(true);
              setMsgImport("");
              try {
                const n = await importarMaquinariaDesdeExcel(file, maquinas, onGuardar);
                setMsgImport(`✅ ${n} equipos importados correctamente`);
              } catch(err) {
                setMsgImport(`⚠ Error: ${err.message}`);
              }
              setImportando(false);
              e.target.value = "";
            }}
          />
        </label>
        <button onClick={() => setEditando({ ...EMPTY })}
          className="px-4 py-2 bg-gradient-to-r from-purple-700 to-violet-600 text-white text-sm font-bold rounded-xl shadow-md hover:shadow-lg transition-all flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/>
          </svg>
          Agregar
        </button>
      </div>

      {/* Tabla */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-2 border-purple-600 border-t-transparent rounded-full animate-spin"/>
        </div>
      ) : (
        <div className="glass-card rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  {["Patente","Tipo","Marca / Modelo","Año","IE Recuperable",""].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-[10px] font-black text-slate-500 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtradas.length === 0 && (
                  <tr><td colSpan={6} className="text-center py-10 text-slate-400 text-sm">
                    {maquinas.length === 0 ? "Sin equipos registrados. Agrega el primero ↑" : "Sin resultados para el filtro"}
                  </td></tr>
                )}
                {filtradas.map((m, i) => (
                  <tr key={m.id} className={`border-b border-slate-50 hover:bg-slate-50/50 ${i%2===0?"":"bg-slate-50/30"}`}>
                    <td className="px-4 py-2.5 font-black text-slate-800 font-mono">{m.patente}</td>
                    <td className="px-4 py-2.5 text-slate-600">{m.tipo}</td>
                    <td className="px-4 py-2.5 text-slate-500">{m.marca} {m.modelo}</td>
                    <td className="px-4 py-2.5 text-slate-400">{m.anio}</td>
                    <td className="px-4 py-2.5">
                      <span className={`text-[10px] font-black px-2 py-1 rounded-full ${m.recuperaIE ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-600"}`}>
                        {m.recuperaIE ? "✅ SI" : "❌ NO"}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex gap-1">
                        <button onClick={() => setEditando({ ...m, recuperaIEManual: m.recuperaIE })}
                          className="p-1.5 rounded-lg hover:bg-blue-50 text-blue-500 transition-colors">
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
                          </svg>
                        </button>
                        <button onClick={() => window.confirm(`¿Eliminar ${m.patente}?`) && onEliminar(m.id)}
                          className="p-1.5 rounded-lg hover:bg-red-50 text-red-400 transition-colors">
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal edición */}
      {editando && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background:"rgba(2,6,23,0.75)", backdropFilter:"blur(6px)" }}>
          <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden">
            <div className="px-6 py-5" style={{ background:"linear-gradient(135deg,#0f172a,#1e3a5f,#1d4ed8)" }}>
              <h3 className="text-white font-black text-lg">{editando.id ? "Editar equipo" : "Nuevo equipo"}</h3>
              <p className="text-blue-300 text-xs mt-0.5">Maestro de maquinaria — Impuesto Específico Diesel</p>
            </div>
            <div className="p-6 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-black text-slate-600 mb-1 block">Patente *</label>
                  <input value={editando.patente||""} onChange={e => setEditando(p => ({...p, patente: e.target.value.toUpperCase()}))}
                    className="w-full px-3 py-2 border-2 border-slate-200 rounded-xl text-sm font-mono font-bold focus:outline-none focus:border-indigo-500 uppercase"
                    placeholder="ABCD12" />
                </div>
                <div>
                  <label className="text-xs font-black text-slate-600 mb-1 block">Año</label>
                  <input type="number" value={editando.anio||""} onChange={e => setEditando(p => ({...p, anio: e.target.value}))}
                    className="w-full px-3 py-2 border-2 border-slate-200 rounded-xl text-sm focus:outline-none focus:border-indigo-500"
                    placeholder="2024" />
                </div>
              </div>
              <div>
                <label className="text-xs font-black text-slate-600 mb-1 block">Tipo de maquinaria *</label>
                <select value={editando.tipo||"CAMIONETA"} onChange={e => {
                  const tipo = e.target.value;
                  const rec  = TIPOS_RECUPERA[tipo] ?? false;
                  setEditando(p => ({...p, tipo, recuperaIEManual: rec }));
                }}
                  className="w-full px-3 py-2 border-2 border-slate-200 rounded-xl text-sm focus:outline-none focus:border-indigo-500 bg-white">
                  {TIPOS_LISTA.map(t => <option key={t} value={t}>{t}</option>)}
                  <option value="OTRO">OTRO (personalizado)</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-black text-slate-600 mb-1 block">Marca</label>
                  <input value={editando.marca||""} onChange={e => setEditando(p => ({...p, marca: e.target.value}))}
                    className="w-full px-3 py-2 border-2 border-slate-200 rounded-xl text-sm focus:outline-none focus:border-indigo-500"
                    placeholder="COPEC, CATERPILLAR..." />
                </div>
                <div>
                  <label className="text-xs font-black text-slate-600 mb-1 block">Modelo</label>
                  <input value={editando.modelo||""} onChange={e => setEditando(p => ({...p, modelo: e.target.value}))}
                    className="w-full px-3 py-2 border-2 border-slate-200 rounded-xl text-sm focus:outline-none focus:border-indigo-500"
                    placeholder="Modelo..." />
                </div>
              </div>
              {/* Toggle IE Recuperable */}
              <div className={`flex items-center justify-between p-3 rounded-xl border-2 ${editando.recuperaIEManual ? "border-emerald-300 bg-emerald-50" : "border-red-200 bg-red-50"}`}>
                <div>
                  <p className="text-sm font-black text-slate-700">Recupera Imp. Específico Diesel</p>
                  <p className="text-[10px] text-slate-500">
                    {TIPOS_RECUPERA[editando.tipo] !== undefined
                      ? `Auto-detectado por tipo: ${TIPOS_RECUPERA[editando.tipo] ? "SI" : "NO"}`
                      : "Definido manualmente"}
                  </p>
                </div>
                <button onClick={() => setEditando(p => ({...p, recuperaIEManual: !p.recuperaIEManual }))}
                  className={`relative w-12 h-6 rounded-full transition-colors ${editando.recuperaIEManual ? "bg-emerald-500" : "bg-slate-300"}`}>
                  <div className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform ${editando.recuperaIEManual ? "translate-x-7" : "translate-x-1"}`}/>
                </button>
              </div>
              <div className="flex gap-2 pt-2">
                <button onClick={() => setEditando(null)}
                  className="flex-1 py-2.5 border-2 border-slate-200 rounded-2xl text-sm font-bold text-slate-600 hover:bg-slate-50">
                  Cancelar
                </button>
                <button onClick={handleGuardar}
                  className="flex-1 py-2.5 text-white text-sm font-black rounded-2xl"
                  style={{ background:"linear-gradient(135deg,#0f172a,#1d4ed8)" }}>
                  {editando.id ? "Guardar cambios" : "Agregar equipo"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Panel Importar Consumo Mensual ───────────────────────────────────────────
function PanelImportar({ maquinas, onGuardarCalculo }) {
  const [step, setStep]         = useState("upload"); // upload | preview | done
  const [resultado, setResult]  = useState(null);
  const [periodo, setPeriodo]   = useState("");
  const [error, setError]       = useState("");
  const [loading, setLoading]   = useState(false);
  const inputRef = useRef(null);

  const procesarExcel = async (file) => {
    setLoading(true); setError("");
    try {
      const data = await file.arrayBuffer();
      const wb   = XLSX.read(data, { type:"array", cellDates:true });

      // ── Hoja Facturas: leer por índice de columna para evitar problemas de encoding ──
      // Col 8=LITROS, Col 9=IE V, Col 10=IE F (verificado en el Excel real)
      const wsF = wb.Sheets["Facturas"];
      if (!wsF) throw new Error("No se encontró la hoja 'Facturas' en el Excel");

      // Leer como array de arrays (más robusto que json para nombres de columna)
      const arrF = XLSX.utils.sheet_to_json(wsF, { header:1, defval:0 });

      // Detectar fila de header (la que tiene "LITROS" en alguna columna)
      let colLitros=-1, colIEV=-1, colIEF=-1;
      let headerRowIdx = 0;
      for (let i=0; i<Math.min(5, arrF.length); i++) {
        const row = arrF[i];
        row.forEach((cell, j) => {
          const s = String(cell||"").trim().toUpperCase();
          if (s === "LITROS") colLitros = j;
          if (s === "IE V")   colIEV    = j;
          if (s === "IE F")   colIEF    = j;
        });
        if (colLitros >= 0) { headerRowIdx = i; break; }
      }
      if (colLitros < 0) throw new Error("No se encontró la columna LITROS en la hoja Facturas.");

      let totalLitrosFacturas=0, totalIEV=0, totalIEF=0;
      for (let i = headerRowIdx+1; i < arrF.length; i++) {
        const row = arrF[i];
        const lts = parseFloat(row[colLitros]) || 0;
        const iev = parseFloat(row[colIEV])    || 0;
        const ief = parseFloat(row[colIEF])    || 0;
        if (lts > 0 && lts < 100000) { // excluir filas de totales (> 100k litros)
          totalLitrosFacturas += lts;
          totalIEV += iev;
          totalIEF += ief;
        }
      }
      if (totalLitrosFacturas === 0)
        throw new Error("No se encontraron litros en la hoja Facturas. Verifica que las columnas LITROS, IE V e IE F existan.");

      const factorIEV = totalIEV / totalLitrosFacturas;
      const factorIEF = totalIEF / totalLitrosFacturas;

      // ── Hoja Detalle Consumo: header en fila 7, leer por índice ─────────
      const wsD = wb.Sheets["Detalle Consumo"];
      if (!wsD) throw new Error("No se encontró la hoja 'Detalle Consumo'");

      // Detectar período desde texto "MES NOMBRE - YYYY"
      let periodoDetectado = "";
      const MESES_NUM = { ENERO:1,FEBRERO:2,MARZO:3,ABRIL:4,MAYO:5,JUNIO:6,
                          JULIO:7,AGOSTO:8,SEPTIEMBRE:9,OCTUBRE:10,NOVIEMBRE:11,DICIEMBRE:12 };
      Object.values(wsD).forEach(cell => {
        const v = String(cell?.v || "");
        const m = v.match(/MES\s+([A-Z\u00C0-\u00FF]+)\s*[-]\s*(\d{4})/i);
        if (m) {
          const mesNum = MESES_NUM[m[1].toUpperCase()];
          if (mesNum) periodoDetectado = `${m[2]}-${String(mesNum).padStart(2,"0")}`;
        }
      });

      // Leer como array de arrays para detectar header por contenido
      const arrD = XLSX.utils.sheet_to_json(wsD, { header:1, defval:"" });

      // Encontrar la fila del header (contiene "Patente" o "PATENTE")
      let colPatente=-1, colLitrosMaq=-1, colImpto=-1;
      let headerD = 0;
      for (let i=0; i<Math.min(10, arrD.length); i++) {
        const row = arrD[i];
        row.forEach((cell, j) => {
          const s = String(cell||"").trim().toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");
          if (s === "PATENTE")                        colPatente   = j;
          if (s === "LITROS MAQUINA" || s === "LITROS MAQUINA") colLitrosMaq = j;
          if (s === "IMPTO RECUPERABLE")              colImpto     = j;
        });
        if (colPatente >= 0 && colLitrosMaq >= 0) { headerD = i; break; }
      }
      // Fallback: si no detectó por nombre, usar las posiciones conocidas del Excel (col G=6, col N=13)
      if (colPatente < 0)   colPatente   = 6;
      if (colLitrosMaq < 0) colLitrosMaq = 13;

      // Mapa patente → recuperaIE
      const mapaPatente = {};
      maquinas.forEach(m => { mapaPatente[m.patente?.toUpperCase()] = m.recuperaIE; });

      let litrosSI=0, litrosNO=0, litrosND=0;
      const detalleEquipos = {};
      const sinClasificar  = new Set();

      for (let i = headerD+1; i < arrD.length; i++) {
        const row     = arrD[i];
        const patente = String(row[colPatente] || "").trim().toUpperCase();
        const lts     = parseFloat(row[colLitrosMaq]) || 0;
        if (!patente || lts <= 0) continue;

        if (!detalleEquipos[patente]) detalleEquipos[patente] = { litros:0, recupera: mapaPatente[patente] };
        detalleEquipos[patente].litros += lts;

        if      (mapaPatente[patente] === true)  litrosSI += lts;
        else if (mapaPatente[patente] === false)  litrosNO += lts;
        else { litrosND += lts; sinClasificar.add(patente); }
      }

      // ── Calcular IE Recuperable ──────────────────────────────────────────
      const ieVRecup = litrosSI * factorIEV;
      const ieFRecup = litrosSI * factorIEF;
      const totalIERecuperable = ieVRecup + ieFRecup;

      // Fallback período: usar la fecha de la primera fila de datos de Facturas
      if (!periodoDetectado) {
        const firstDataRow = arrF[headerRowIdx + 1];
        const fechaCell = firstDataRow?.[2]; // col C = FECHA
        if (fechaCell instanceof Date || (typeof fechaCell === "number" && fechaCell > 40000)) {
          const d = fechaCell instanceof Date ? fechaCell : new Date((fechaCell - 25569) * 86400 * 1000);
          periodoDetectado = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
        }
      }

      setResult({
        totalLitrosFacturas, totalIEV, totalIEF, factorIEV, factorIEF,
        litrosSI, litrosNO, litrosND, ieVRecup, ieFRecup, totalIERecuperable,
        sinClasificar: [...sinClasificar], detalleEquipos,
      });
      if (periodoDetectado) setPeriodo(periodoDetectado);
      setStep("preview");
    } catch(e) {
      setError("Error al procesar: " + e.message);
    }
    setLoading(false);
  };

  const handleImportar = async () => {
    if (!periodo || !resultado) return;
    // Limpiar undefined del detalleEquipos — Firestore no acepta undefined
    const detalleEquiposLimpio = {};
    Object.entries(resultado.detalleEquipos || {}).forEach(([k, v]) => {
      detalleEquiposLimpio[k] = {
        litros:   v.litros   ?? 0,
        recupera: v.recupera ?? null,  // null es aceptado, undefined no
      };
    });
    await onGuardarCalculo({
      periodo,
      ...resultado,
      detalleEquipos: detalleEquiposLimpio,
      sinClasificar: resultado.sinClasificar || [],
      importadoEn: new Date().toISOString(),
    });
    setStep("done");
  };

  if (step === "done") return (
    <div className="py-12 text-center space-y-4">
      <div className="w-16 h-16 rounded-3xl mx-auto bg-emerald-100 flex items-center justify-center text-3xl">✅</div>
      <p className="font-black text-slate-800 text-xl">¡Cálculo guardado!</p>
      <p className="text-slate-500 text-sm">IE Recuperable {periodo}: <strong className="text-indigo-700">{fmtPesos(resultado?.totalIERecuperable)}</strong></p>
      <p className="text-xs text-slate-400">Este valor está disponible en el módulo Tributario → F29 → Línea 26</p>
      <button onClick={() => { setStep("upload"); setResult(null); setPeriodo(""); }}
        className="px-6 py-2.5 rounded-2xl border-2 border-slate-200 text-sm font-bold text-slate-600 hover:bg-slate-50">
        Importar otro mes
      </button>
    </div>
  );

  return (
    <div className="space-y-4">
      {step === "upload" && (
        <>
          <div className="glass-card rounded-2xl p-5 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-indigo-100 flex items-center justify-center text-xl">📅</div>
              <div className="flex-1">
                <p className="text-sm font-black text-slate-700">Período a calcular</p>
                <p className="text-[10px] text-slate-400">Se detecta automáticamente desde el Excel</p>
              </div>
              <input type="month" value={periodo} onChange={e => setPeriodo(e.target.value)}
                className="px-3 py-2 border-2 border-slate-200 rounded-xl text-sm font-bold focus:outline-none focus:border-indigo-500" />
            </div>
          </div>

          <div
            onClick={() => inputRef.current?.click()}
            onDragOver={e => e.preventDefault()}
            onDrop={e => { e.preventDefault(); procesarExcel(e.dataTransfer.files[0]); }}
            className="border-2 border-dashed border-indigo-200 hover:border-indigo-400 rounded-2xl p-10 text-center cursor-pointer transition-all bg-indigo-50/20 hover:bg-indigo-50/40"
          >
            {loading ? (
              <div className="space-y-3">
                <div className="w-10 h-10 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto"/>
                <p className="text-sm text-slate-500 font-semibold">Procesando Excel...</p>
              </div>
            ) : (
              <>
                <div className="text-5xl mb-4">⛽</div>
                <p className="font-black text-slate-700 text-base">Arrastra el Excel de Control de Consumo</p>
                <p className="text-slate-400 text-sm mt-1">o <span className="text-indigo-600 font-bold underline underline-offset-2">haz clic para seleccionar</span></p>
                <div className="mt-4 space-y-1">
                  <div className="inline-flex px-3 py-1 bg-indigo-100 rounded-full">
                    <span className="text-[10px] font-black text-indigo-700">Necesita hojas: Facturas + Detalle Consumo</span>
                  </div>
                </div>
              </>
            )}
            <input ref={inputRef} type="file" accept=".xlsx,.xls" className="hidden"
              onChange={e => procesarExcel(e.target.files[0])} />
          </div>

          {error && <div className="p-4 bg-red-50 border border-red-200 rounded-2xl">
            <p className="text-xs text-red-700 font-semibold">⚠ {error}</p>
          </div>}

          {maquinas.length === 0 && (
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl flex items-start gap-2">
              <span className="text-amber-500">⚠️</span>
              <p className="text-xs text-amber-700">Primero debes cargar el maestro de maquinaria en la pestaña "Maquinaria" para que el cruce de patentes funcione correctamente.</p>
            </div>
          )}
        </>
      )}

      {step === "preview" && resultado && (
        <div className="space-y-4">
          {/* Selector período */}
          <div className="glass-card rounded-2xl p-4 flex items-center gap-3">
            <span className="text-xl">📅</span>
            <p className="text-sm font-black text-slate-700 flex-1">Período detectado</p>
            <input type="month" value={periodo} onChange={e => setPeriodo(e.target.value)}
              className="px-3 py-2 border-2 border-slate-200 rounded-xl text-sm font-bold focus:outline-none focus:border-indigo-500" />
          </div>

          {/* KPIs principales */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label:"Litros facturas", val:fmtL(resultado.totalLitrosFacturas)+" L", color:"text-slate-700", bg:"bg-slate-50" },
              { label:"Litros recuperables", val:fmtL(resultado.litrosSI)+" L", color:"text-emerald-700", bg:"bg-emerald-50" },
              { label:"Litros no recuperan", val:fmtL(resultado.litrosNO)+" L", color:"text-red-600", bg:"bg-red-50" },
              { label:"Sin clasificar", val:fmtL(resultado.litrosND)+" L", color:"text-amber-600", bg:"bg-amber-50" },
            ].map(k => (
              <div key={k.label} className={`rounded-2xl p-3 text-center ${k.bg}`}>
                <p className="text-[10px] font-bold text-slate-500 uppercase">{k.label}</p>
                <p className={`text-sm font-black mt-0.5 tabular-nums ${k.color}`}>{k.val}</p>
              </div>
            ))}
          </div>

          {/* Cálculo detallado */}
          <div className="glass-card rounded-2xl overflow-hidden">
            <div className="px-4 py-3 bg-gradient-to-r from-slate-800 to-indigo-900 flex items-center justify-between">
              <p className="text-white font-black text-sm">Cálculo IE Recuperable</p>
              <span className="text-blue-300 text-xs">{fmtL(resultado.litrosSI)} L × factores del mes</span>
            </div>
            <table className="w-full text-sm">
              <tbody>
                {[
                  { label:"Factor IE Variable (promedio/L)", val: fmtPesos(resultado.factorIEV), sub:"Del total de facturas del mes" },
                  { label:"Factor IE Fijo (promedio/L)",     val: fmtPesos(resultado.factorIEF), sub:"Del total de facturas del mes" },
                  null,
                  { label:`IE Variable recuperable (${fmtL(resultado.litrosSI)} L × ${resultado.factorIEV.toFixed(4)})`, val: fmtPesos(resultado.ieVRecup), color: resultado.ieVRecup >= 0 ? "text-emerald-700":"text-red-600" },
                  { label:`IE Fijo recuperable (${fmtL(resultado.litrosSI)} L × ${resultado.factorIEF.toFixed(4)})`,     val: fmtPesos(resultado.ieFRecup), color:"text-emerald-700" },
                  null,
                  { label:"TOTAL IE RECUPERABLE", val: fmtPesos(resultado.totalIERecuperable), negrita:true, color:"text-indigo-700" },
                ].map((row, i) => row === null ? (
                  <tr key={i}><td colSpan={2} className="h-px bg-slate-100"/></tr>
                ) : (
                  <tr key={i} className={`hover:bg-slate-50 ${row.negrita ? "bg-indigo-50" : ""}`}>
                    <td className={`px-4 py-2.5 ${row.negrita ? "font-black text-slate-800" : "text-slate-600"}`}>
                      {row.label}
                      {row.sub && <p className="text-[10px] text-slate-400">{row.sub}</p>}
                    </td>
                    <td className={`px-4 py-2.5 text-right font-mono font-bold ${row.color || "text-slate-700"} ${row.negrita ? "text-lg" : ""}`}>{row.val}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Patentes sin clasificar */}
          {resultado.sinClasificar.length > 0 && (
            <div className="p-4 bg-amber-50 border border-amber-300 rounded-2xl space-y-2">
              <p className="text-xs font-black text-amber-800">⚠️ {resultado.sinClasificar.length} patentes sin clasificar en el maestro — excluidas del cálculo:</p>
              <div className="flex flex-wrap gap-1.5">
                {resultado.sinClasificar.map(p => (
                  <span key={p} className="text-[10px] font-mono font-bold bg-amber-200 text-amber-800 px-2 py-0.5 rounded-full">{p}</span>
                ))}
              </div>
              <p className="text-[10px] text-amber-600">Agrégalas en el maestro de Maquinaria y vuelve a importar para incluirlas.</p>
            </div>
          )}

          <div className="flex gap-3">
            <button onClick={() => { setStep("upload"); setResult(null); }}
              className="flex-1 py-3 border-2 border-slate-200 rounded-2xl text-sm font-bold text-slate-600 hover:bg-slate-50">
              ← Cambiar archivo
            </button>
            <button onClick={handleImportar} disabled={!periodo}
              className="flex-1 py-3 text-white text-sm font-black rounded-2xl disabled:opacity-50"
              style={{ background:"linear-gradient(135deg,#0f172a,#1d4ed8)" }}>
              Guardar en F29 ({periodo}) →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Panel Historial ──────────────────────────────────────────────────────────
function PanelHistorial() {
  const { empresaId } = useEmpresa();
  const [calculos, setCalculos] = useState([]);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    if (!empresaId) return;
    (async () => {
      const snap = await getDocs(query(
        collection(db, "empresas", empresaId, "combustible_calculos"),
        orderBy("periodo", "desc")
      ));
      setCalculos(snap.docs.map(d => ({ id:d.id, ...d.data() })));
      setLoading(false);
    })();
  }, [empresaId]);

  if (loading) return <div className="flex justify-center py-12"><div className="w-8 h-8 border-2 border-purple-600 border-t-transparent rounded-full animate-spin"/></div>;

  return (
    <div className="space-y-3">
      {calculos.length === 0 && (
        <div className="glass-card rounded-2xl py-16 text-center">
          <p className="text-3xl mb-3">⛽</p>
          <p className="text-slate-600 font-bold">Sin cálculos guardados</p>
          <p className="text-slate-400 text-sm mt-1">Importa el primer Excel de consumo mensual</p>
        </div>
      )}
      {calculos.map(c => (
        <div key={c.id} className="glass-card rounded-2xl p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="font-black text-slate-800 text-sm">{c.periodo}</p>
              <p className="text-[10px] text-slate-400">
                {c.importadoEn ? new Date(c.importadoEn).toLocaleDateString("es-CL") : ""}
              </p>
            </div>
            <div className="text-right">
              <p className="font-black text-indigo-700 text-lg tabular-nums">{fmtPesos(c.totalIERecuperable)}</p>
              <p className="text-[10px] text-slate-400">IE Recuperable total</p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 pt-3 border-t border-slate-100">
            {[
              { label:"Lts recuperables", val:fmtL(c.litrosSI)+" L", color:"text-emerald-700" },
              { label:"Lts no recuperan",  val:fmtL(c.litrosNO)+" L", color:"text-red-500"    },
              { label:"Sin clasificar",    val:fmtL(c.litrosND)+" L", color:"text-amber-600"  },
            ].map(k => (
              <div key={k.label} className="text-center">
                <p className="text-[9px] text-slate-400 font-bold uppercase">{k.label}</p>
                <p className={`text-xs font-black tabular-nums ${k.color}`}>{k.val}</p>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────
export default function CombustibleModule() {
  const { maquinas, loading, guardar, eliminar } = useMaquinaria();
  const { guardarCalculo }                        = useCalculosMensuales();
  const [tab, setTab] = useState("importar"); // maquinaria | importar | historial

  const TABS = [
    { id:"importar",   label:"Importar consumo", icon:"⛽" },
    { id:"maquinaria", label:"Maquinaria",        icon:"🚜" },
    { id:"historial",  label:"Historial",         icon:"📊" },
  ];

  return (
    <div className="p-4 sm:p-6 space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-xl font-black text-slate-900">Combustible — Imp. Específico</h1>
        <p className="text-xs text-slate-500 mt-0.5">Cálculo automático del IE recuperable para F29 línea 26</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5
              ${tab === t.id ? "bg-white shadow-sm text-purple-700" : "text-slate-500 hover:text-slate-700"}`}>
            <span>{t.icon}</span>{t.label}
          </button>
        ))}
      </div>

      {/* Contenido */}
      {tab === "maquinaria" && (
        <PanelMaquinaria maquinas={maquinas} loading={loading} onGuardar={guardar} onEliminar={eliminar} />
      )}
      {tab === "importar" && (
        <PanelImportar maquinas={maquinas} onGuardarCalculo={guardarCalculo} />
      )}
      {tab === "historial" && <PanelHistorial />}
    </div>
  );
}
