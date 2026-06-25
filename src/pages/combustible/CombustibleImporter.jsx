import { useState, useRef, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { collection, getDocs, addDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../../lib/firebase';

function parseExcelDate(val) {
  if (!val) return '';
  if (typeof val === 'number') {
    const d = XLSX.SSF.parse_date_code(val);
    if (d) {
      const y = d.y < 100 ? 2000 + d.y : d.y;
      return `${y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;
    }
  }
  if (val instanceof Date) return val.toISOString().split('T')[0];
  const s = String(val).trim();
  const parts = s.split('/');
  if (parts.length === 3) {
    let [m, d, y] = parts.map(Number);
    if (y < 100) y += 2000;
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }
  return s;
}

function norm(s) {
  return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
}

const COL = { fecha: 0, folio: 1, codigo: 2, patente: 3, horometro: 4, kilometraje: 5, litros: 6, equipo: 7, empresa: 8, operador: 9, observaciones: 10 };

export default function CombustibleImporter({ empresaId, onClose, onSuccess }) {
  const [step, setStep] = useState('upload'); // upload | preview | resolve | importing | done
  const [rows, setRows] = useState([]);
  const [projects, setProjects] = useState([]);
  const [machines, setMachines] = useState([]);
  const [projectId, setProjectId] = useState('');
  const [progress, setProgress] = useState(0);
  const [errors, setErrors] = useState([]);
  const [fileName, setFileName] = useState('');
  // resolve step state
  const [createdSet, setCreatedSet] = useState(new Set()); // patentes ya creadas
  const [creatingSet, setCreatingSet] = useState(new Set()); // patentes en proceso
  const [showAll, setShowAll] = useState(false);
  const fileRef = useRef();

  useEffect(() => {
    (async () => {
      try {
        const [pSnap, mSnap] = await Promise.all([
          getDocs(collection(db, 'empresas', empresaId, 'projects')),
          getDocs(collection(db, 'empresas', empresaId, 'machines')),
        ]);
        setProjects(pSnap.docs.map(d => ({ id: d.id, ...d.data() })));
        setMachines(mSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (e) { console.error(e); }
    })();
  }, [empresaId]);

  useEffect(() => {
    if (projects.length === 1 && !projectId) setProjectId(projects[0].id);
  }, [projects]);

  // Re-match rows when machines list grows
  useEffect(() => {
    if (!rows.length) return;
    setRows(prev => prev.map(row => {
      if (row.machineId) return row;
      const found = machines.find(m => norm(m.patente || m.code) === norm(row.patente));
      return found ? { ...row, machineId: found.id } : row;
    }));
  }, [machines]);

  function handleFile(file) {
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      const wb = XLSX.read(e.target.result, { type: 'binary', cellDates: false });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
      let dataStart = 1;
      for (let i = 0; i < Math.min(raw.length, 5); i++) {
        if (String(raw[i]?.[COL.fecha] || '').toLowerCase().includes('fecha')) { dataStart = i + 1; break; }
      }
      const parsed = [];
      for (let i = dataStart; i < raw.length; i++) {
        const r = raw[i];
        const litros = parseFloat(r[COL.litros]);
        if (!litros || isNaN(litros)) continue;
        const patente = String(r[COL.patente] || '').trim().toUpperCase();
        if (!patente) continue;
        const machine = machines.find(m => norm(m.patente || m.code) === norm(patente));
        parsed.push({
          _row: i + 1,
          fecha: parseExcelDate(r[COL.fecha]),
          folio: String(r[COL.folio] || '').trim(),
          codigo: String(r[COL.codigo] || '').trim(),
          patente,
          horometro: r[COL.horometro] ? String(r[COL.horometro]).trim() : '',
          kilometraje: r[COL.kilometraje] ? String(r[COL.kilometraje]).trim() : '',
          litros,
          equipoNombre: String(r[COL.equipo] || '').trim(),
          empresaNombre: String(r[COL.empresa] || '').trim(),
          operadorNombre: String(r[COL.operador] || '').trim(),
          observaciones: String(r[COL.observaciones] || '').trim(),
          machineId: machine?.id || '',
        });
      }
      setRows(parsed);
      setStep('preview');
    };
    reader.readAsBinaryString(file);
  }

  // Unique unmatched patentes (computed from current rows)
  const unmatchedPatentes = (() => {
    const seen = new Map();
    rows.forEach(r => {
      if (!r.machineId && !seen.has(r.patente)) {
        seen.set(r.patente, { equipoNombre: r.equipoNombre, empresaNombre: r.empresaNombre });
      }
    });
    return [...seen.entries()].map(([patente, hint]) => ({ patente, hint }));
  })();

  function handlePressImport() {
    if (unmatchedPatentes.length > 0) {
      setShowAll(false);
      setStep('resolve');
    } else {
      runImport();
    }
  }

  async function handleCreateOne(patente, hint) {
    setCreatingSet(prev => new Set([...prev, patente]));
    try {
      const mData = {
        patente: patente.toUpperCase(),
        code: patente.toUpperCase(),
        name: hint.equipoNombre.toUpperCase() || patente,
        tipo: hint.equipoNombre.toUpperCase() || '',
        marca: '',
        modelo: '',
        empresa: hint.empresaNombre || '',
        active: true,
        createdAt: serverTimestamp(),
      };
      const ref = await addDoc(collection(db, 'empresas', empresaId, 'machines'), mData);
      setMachines(prev => [...prev, { id: ref.id, ...mData }]);
      setCreatedSet(prev => new Set([...prev, patente]));
    } catch (e) {
      console.error('Error creando máquina:', e);
    } finally {
      setCreatingSet(prev => { const n = new Set(prev); n.delete(patente); return n; });
    }
  }

  async function runImport() {
    setStep('importing');
    const user = auth.currentUser;
    const errs = [];
    let done = 0;
    for (const row of rows) {
      try {
        const horOdo = parseFloat(row.horometro || row.kilometraje) || 0;
        const now = new Date();
        await addDoc(collection(db, 'empresas', empresaId, 'reportes_combustible'), {
          tipo: 'entrega',
          numeroReporte: `COMB-ENTREGA-${row.fecha?.replace(/-/g, '')}-${row.codigo}`,
          folio: row.folio,
          codigo: row.codigo,
          fecha: row.fecha,
          projectId,
          repartidorId: '',
          repartidorNombre: '',
          equipoSurtidorId: '',
          cantidadLitros: row.litros,
          datosEntrega: {
            empresa: row.empresaNombre,
            machineId: row.machineId,
            machinePatente: row.patente,
            machineNombre: row.equipoNombre,
            operadorId: '',
            operadorNombre: row.operadorNombre,
            horometroOdometro: horOdo,
            cantidadLitros: row.litros,
            observaciones: row.observaciones,
          },
          empresaProveedora: row.empresaNombre,
          fechaCreacion: now.toISOString(),
          hora: now.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', hour12: false }),
          creadoPor: user?.email || 'importacion',
          importado: true,
        });
        done++;
        setProgress(Math.round((done / rows.length) * 100));
      } catch (e) {
        errs.push(`Fila ${row._row}: ${e.message}`);
      }
    }
    setErrors(errs);
    setStep('done');
    if (!errs.length) onSuccess?.(done);
  }

  const VISIBLE_COUNT = 3;
  const visibleUnmatched = showAll ? unmatchedPatentes : unmatchedPatentes.slice(0, VISIBLE_COUNT);
  const hiddenCount = unmatchedPatentes.length - VISIBLE_COUNT;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90dvh] flex flex-col" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div>
            <h2 className="text-lg font-black text-slate-800">Importar desde Excel</h2>
            <p className="text-xs text-slate-400 mt-0.5">Formato: Control de Combustible (RQ-120-46)</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center font-black text-slate-500 transition-all">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">

          {/* ── UPLOAD ── */}
          {step === 'upload' && (
            <div
              className="border-2 border-dashed border-slate-200 rounded-2xl p-12 flex flex-col items-center gap-4 cursor-pointer hover:border-orange-400 hover:bg-orange-50/30 transition-all"
              onClick={() => fileRef.current.click()}
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); handleFile(e.dataTransfer.files[0]); }}
            >
              <div className="w-14 h-14 rounded-2xl bg-orange-100 flex items-center justify-center">
                <svg className="w-7 h-7 text-orange-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
              </div>
              <div className="text-center">
                <p className="font-black text-slate-700">Arrastra tu archivo Excel aquí</p>
                <p className="text-sm text-slate-400 mt-1">o haz clic para seleccionar (.xlsx, .xls)</p>
              </div>
              <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={e => handleFile(e.target.files[0])} />
            </div>
          )}

          {/* ── PREVIEW ── */}
          {step === 'preview' && (
            <>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-black text-slate-700">{fileName}</p>
                  <p className="text-sm text-slate-400">{rows.length} registros encontrados</p>
                </div>
                {unmatchedPatentes.length > 0 && (
                  <span className="px-3 py-1 bg-amber-100 text-amber-700 font-bold text-xs rounded-lg">
                    {unmatchedPatentes.length} patentes sin registrar
                  </span>
                )}
              </div>

              <div>
                <label className="block text-xs font-black text-slate-500 uppercase tracking-wider mb-1">Obra / Proyecto *</label>
                <select
                  value={projectId}
                  onChange={e => setProjectId(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border-2 border-slate-200 rounded-xl font-bold text-slate-700 text-sm focus:border-orange-500"
                >
                  <option value="">Selecciona la obra...</option>
                  {projects.map(p => <option key={p.id} value={p.id}>{p.name || p.id}</option>)}
                </select>
              </div>

              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      {['Fecha', 'Folio', 'Cód.', 'Patente', 'Hor/Km', 'Litros', 'Empresa'].map(h => (
                        <th key={h} className="px-3 py-2 text-left font-black text-slate-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {rows.map((row, i) => (
                      <tr key={i} className={row.machineId ? '' : 'bg-amber-50/40'}>
                        <td className="px-3 py-2 text-slate-500 whitespace-nowrap">{row.fecha}</td>
                        <td className="px-3 py-2 text-slate-500">{row.folio}</td>
                        <td className="px-3 py-2 text-slate-500">{row.codigo}</td>
                        <td className="px-3 py-2 font-bold whitespace-nowrap">
                          <span className={row.machineId ? 'text-slate-800' : 'text-amber-700'}>{row.patente}</span>
                          {row.machineId
                            ? <span className="ml-1 text-green-500 text-xs">✓</span>
                            : <span className="ml-1 text-amber-400 text-xs">⚠</span>}
                        </td>
                        <td className="px-3 py-2 text-slate-500">{row.horometro || row.kilometraje}</td>
                        <td className="px-3 py-2 font-bold text-orange-600 whitespace-nowrap">{row.litros} L</td>
                        <td className="px-3 py-2 text-slate-500 whitespace-nowrap">{row.empresaNombre}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {/* ── RESOLVE ── */}
          {step === 'resolve' && (
            <>
              <div className="text-center pb-1">
                <div className="w-12 h-12 rounded-2xl bg-amber-100 flex items-center justify-center mx-auto mb-3">
                  <svg className="w-6 h-6 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                  </svg>
                </div>
                <h3 className="font-black text-slate-800 text-base">
                  {unmatchedPatentes.length === 0
                    ? '¡Todo listo!'
                    : `${unmatchedPatentes.length} máquina${unmatchedPatentes.length !== 1 ? 's' : ''} no registrada${unmatchedPatentes.length !== 1 ? 's' : ''}`}
                </h3>
                <p className="text-sm text-slate-400 mt-1">
                  {unmatchedPatentes.length === 0
                    ? 'Todas las patentes fueron registradas. Puedes continuar.'
                    : '¿Quieres registrarlas en tu base de datos antes de importar?'}
                </p>
              </div>

              {unmatchedPatentes.length > 0 && (
                <div className="space-y-2">
                  {visibleUnmatched.map(({ patente, hint }) => {
                    const created = createdSet.has(patente);
                    const creating = creatingSet.has(patente);
                    return (
                      <div
                        key={patente}
                        className={`flex items-center gap-3 px-4 py-3 rounded-2xl border-2 transition-all ${created ? 'border-green-200 bg-green-50/40' : 'border-amber-200 bg-amber-50/20'}`}
                      >
                        <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${created ? 'bg-green-100' : 'bg-amber-100'}`}>
                          {created
                            ? <svg className="w-4 h-4 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                            : <svg className="w-4 h-4 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /></svg>
                          }
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-black text-slate-700">
                            Patente <span className={created ? 'text-green-700' : 'text-amber-700'}>{patente}</span>
                            {created ? ' registrada' : ' no existe en tu base de datos'}
                          </p>
                          <p className="text-xs text-slate-400">
                            {[hint.equipoNombre, hint.empresaNombre].filter(Boolean).join(' · ')}
                          </p>
                        </div>
                        {!created && (
                          <button
                            disabled={creating}
                            onClick={() => handleCreateOne(patente, hint)}
                            className="px-4 py-1.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-white font-black rounded-xl text-xs transition-all shadow-sm whitespace-nowrap"
                          >
                            {creating ? '...' : '+ Crear'}
                          </button>
                        )}
                      </div>
                    );
                  })}

                  {!showAll && hiddenCount > 0 && (
                    <button
                      onClick={() => setShowAll(true)}
                      className="w-full py-2.5 text-xs font-black text-amber-600 hover:text-amber-700 hover:bg-amber-50 rounded-xl transition-all"
                    >
                      Ver {hiddenCount} más ↓
                    </button>
                  )}
                </div>
              )}
            </>
          )}

          {/* ── IMPORTING ── */}
          {step === 'importing' && (
            <div className="flex flex-col items-center gap-5 py-8">
              <div className="w-16 h-16 rounded-full border-4 border-orange-200 border-t-orange-500 animate-spin" />
              <div className="text-center">
                <p className="font-black text-slate-700">Importando registros...</p>
                <p className="text-3xl font-black text-orange-500 mt-2">{progress}%</p>
                <p className="text-sm text-slate-400 mt-1">{Math.round(rows.length * progress / 100)} de {rows.length}</p>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-2">
                <div className="bg-gradient-to-r from-orange-500 to-amber-400 h-2 rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
              </div>
            </div>
          )}

          {/* ── DONE ── */}
          {step === 'done' && (
            <div className="flex flex-col items-center gap-4 py-8">
              {errors.length === 0 ? (
                <>
                  <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
                    <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <div className="text-center">
                    <p className="font-black text-slate-800 text-lg">{rows.length} registros importados</p>
                    <p className="text-sm text-slate-400 mt-1">Los registros ya están disponibles en el historial</p>
                  </div>
                </>
              ) : (
                <>
                  <div className="w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center">
                    <svg className="w-8 h-8 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                    </svg>
                  </div>
                  <p className="font-black text-slate-800">Importación con {errors.length} error(es)</p>
                  <div className="w-full bg-red-50 rounded-xl p-3 space-y-1 max-h-36 overflow-y-auto">
                    {errors.map((e, i) => <p key={i} className="text-xs text-red-600">{e}</p>)}
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-6 py-4 border-t border-slate-100">
          {step === 'done' ? (
            <button onClick={onClose} className="flex-1 py-2.5 bg-gradient-to-r from-orange-600 to-amber-600 text-white font-black rounded-2xl text-sm">
              Cerrar
            </button>
          ) : step === 'resolve' ? (
            <>
              <button
                onClick={() => setStep('preview')}
                className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 font-black rounded-2xl text-sm transition-all"
              >
                ← Volver
              </button>
              <button
                onClick={runImport}
                className="flex-1 py-2.5 bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 text-white font-black rounded-2xl text-sm transition-all shadow-lg"
              >
                {unmatchedPatentes.length === 0
                  ? `Importar ${rows.length} registros →`
                  : `Continuar e importar →`}
              </button>
            </>
          ) : (
            <>
              <button onClick={onClose} className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 font-black rounded-2xl text-sm transition-all">
                Cancelar
              </button>
              {step === 'preview' && (
                <button
                  onClick={handlePressImport}
                  disabled={!projectId || rows.length === 0}
                  className="flex-1 py-2.5 bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 text-white font-black rounded-2xl text-sm transition-all shadow-lg disabled:grayscale disabled:opacity-50"
                >
                  Importar {rows.length} registros →
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
