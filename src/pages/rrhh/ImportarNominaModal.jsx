/**
 * ImportarNominaModal.jsx — src/pages/rrhh/ImportarNominaModal.jsx
 * ────────────────────────────────────────────────────────────────
 * Carga masiva de trabajadores desde la planilla "Lista de Empleados".
 * Crea la ficha en `trabajadores` y, opcionalmente, el contrato vigente
 * en `contratos`. Nunca duplica: hace match por RUT.
 */

import React, { useState, useCallback } from 'react';
import * as XLSX from 'xlsx';
import {
  collection, getDocs, doc, addDoc, writeBatch, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useEmpresa } from '../../lib/useEmpresa';
import { Modal, inp } from './shared';
import { procesarPlanilla, rutPlano } from './importarNomina';

const MAX_OPS_BATCH = 400; // 500 es el límite duro de Firestore; dejamos margen

/** Quita '', null y undefined — para no pisar datos existentes al actualizar. */
function soloConValor(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === '' || v === null || v === undefined) continue;
    out[k] = v;
  }
  return out;
}

export default function ImportarNominaModal({ isOpen, onClose, onImported }) {
  const { empresaId, subEmpresasNames: EMPRESAS = [] } = useEmpresa();

  const [paso, setPaso] = useState('subir');     // subir | revisar | importando | listo
  const [nombreArchivo, setNombreArchivo] = useState('');
  const [analisis, setAnalisis] = useState(null);
  const [conVigente, setConVigente] = useState(new Set()); // trabajadorId con contrato vigente
  const [error, setError] = useState(null);
  const [progreso, setProgreso] = useState({ hechos: 0, total: 0 });
  const [resultado, setResultado] = useState(null);
  const [verSolo, setVerSolo] = useState('todos');

  // Opciones
  const [crearContratos, setCrearContratos] = useState(true);
  const [actualizarExistentes, setActualizarExistentes] = useState(true);
  const [resolucionEmpresas, setResolucionEmpresas] = useState({});

  const reset = () => {
    setPaso('subir'); setNombreArchivo(''); setAnalisis(null);
    setConVigente(new Set()); setError(null); setResultado(null);
    setVerSolo('todos'); setResolucionEmpresas({});
  };

  const cerrar = () => { reset(); onClose?.(); };

  // ── 1. Leer el archivo y contrastarlo con lo que ya existe ──────────────
  const handleArchivo = useCallback(async (e) => {
    const file = e.target.files?.[0];
    if (!file || !empresaId) return;
    setError(null);
    setNombreArchivo(file.name);

    try {
      const buffer = await file.arrayBuffer();
      // cellDates: las fechas vienen como serial de Excel; sin esto llegan como número
      const wb = XLSX.read(buffer, { cellDates: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const filas = XLSX.utils.sheet_to_json(ws, { raw: true, defval: null });

      if (!filas.length) {
        setError('La primera hoja del archivo está vacía.');
        return;
      }
      if (!('RUT' in filas[0])) {
        setError('No encuentro la columna "RUT". ¿Es la planilla de Lista de Empleados?');
        return;
      }

      const [tSnap, cSnap] = await Promise.all([
        getDocs(collection(db, 'empresas', empresaId, 'trabajadores')),
        getDocs(collection(db, 'empresas', empresaId, 'contratos')),
      ]);

      const rutsExistentes = new Map();
      tSnap.docs.forEach(d => {
        const p = rutPlano(d.data().rut);
        if (p) rutsExistentes.set(p, d.id);
      });

      const vigentes = new Set(
        cSnap.docs.map(d => d.data()).filter(c => c.estado === 'vigente').map(c => c.trabajadorId)
      );

      const res = procesarPlanilla(filas, rutsExistentes, EMPRESAS);
      setAnalisis(res);
      setConVigente(vigentes);
      setResolucionEmpresas(
        Object.fromEntries(res.resumen.empresasFaltantes.map(n => [n, '__crear__']))
      );
      setPaso('revisar');
    } catch (err) {
      console.error(err);
      setError('No pude leer el archivo: ' + err.message);
    }
  }, [empresaId, EMPRESAS]);

  // ── 2. Escribir en Firestore ───────────────────────────────────────────
  const importar = async () => {
    if (!analisis || !empresaId) return;
    setPaso('importando');

    const aProcesar = analisis.filas.filter(r =>
      r.accion === 'crear' || (r.accion === 'actualizar' && actualizarExistentes)
    );
    setProgreso({ hechos: 0, total: aProcesar.length });

    const salida = { creados: 0, actualizados: 0, contratos: 0, empresasCreadas: [], fallidos: [] };

    try {
      // 2a. Sub-empresas que el usuario pidió crear
      for (const [nombre, decision] of Object.entries(resolucionEmpresas)) {
        if (decision !== '__crear__') continue;
        await addDoc(collection(db, 'empresas'), {
          nombre,
          parentEmpresaId: empresaId,
          creadoEn: serverTimestamp(),
        });
        salida.empresasCreadas.push(nombre);
      }

      // 2b. Fichas y contratos, en lotes
      let batch = writeBatch(db);
      let ops = 0;

      const commit = async () => {
        if (ops === 0) return;
        await batch.commit();
        batch = writeBatch(db);
        ops = 0;
      };

      for (const r of aProcesar) {
        const ficha = { ...r.ficha };

        // Reemplazo de razón social según lo decidido en la revisión
        const decision = resolucionEmpresas[ficha.empresa];
        if (decision && decision !== '__crear__' && decision !== '__dejar__') {
          ficha.empresa = decision;
        }

        let trabajadorId = r.docIdExistente;

        if (trabajadorId) {
          // Actualizar: solo campos con valor, para no borrar lo que ya había
          batch.update(doc(db, 'empresas', empresaId, 'trabajadores', trabajadorId), {
            ...soloConValor(ficha),
            updatedAt: serverTimestamp(),
          });
          salida.actualizados++;
        } else {
          const ref = doc(collection(db, 'empresas', empresaId, 'trabajadores'));
          trabajadorId = ref.id;
          batch.set(ref, { ...ficha, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
          salida.creados++;
        }
        ops++;

        // Contrato: solo si no tiene uno vigente, para no duplicar al reimportar
        if (crearContratos && !conVigente.has(trabajadorId)) {
          const cRef = doc(collection(db, 'empresas', empresaId, 'contratos'));
          batch.set(cRef, {
            ...r.contrato,
            trabajadorId,
            empresa: ficha.empresa,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
          salida.contratos++;
          ops++;
        }

        if (ops >= MAX_OPS_BATCH) {
          await commit();
          setProgreso(p => ({ ...p, hechos: salida.creados + salida.actualizados }));
        }
      }

      await commit();
      setProgreso({ hechos: aProcesar.length, total: aProcesar.length });
      setResultado(salida);
      setPaso('listo');
      onImported?.();
    } catch (err) {
      console.error(err);
      setError('Error al guardar: ' + err.message);
      setResultado(salida);
      setPaso('listo');
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────
  const filasVisibles = !analisis ? [] : analisis.filas.filter(r => {
    if (verSolo === 'errores') return r.errores.length > 0;
    if (verSolo === 'avisos') return !r.errores.length && r.avisos.length > 0;
    if (verSolo === 'nuevos') return r.accion === 'crear';
    if (verSolo === 'existentes') return r.accion === 'actualizar';
    return true;
  });

  const R = analisis?.resumen;
  const aImportar = !analisis ? 0 : analisis.filas.filter(r =>
    r.accion === 'crear' || (r.accion === 'actualizar' && actualizarExistentes)
  ).length;

  return (
    <Modal isOpen={isOpen} onClose={cerrar}
      title="Importar nómina"
      subtitle="Carga masiva desde la planilla Lista de Empleados"
      maxWidth="max-w-5xl">

      {error && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
          <p className="text-sm font-bold text-red-700">{error}</p>
        </div>
      )}

      {/* ── Paso 1: subir ── */}
      {paso === 'subir' && (
        <div className="space-y-4">
          <label className="block cursor-pointer">
            <input type="file" accept=".xlsx,.xls" className="hidden" onChange={handleArchivo} />
            <div className="rounded-2xl border-2 border-dashed border-slate-200 hover:border-violet-400 hover:bg-violet-50/40 transition-all px-6 py-12 text-center">
              <div className="w-12 h-12 rounded-2xl bg-violet-100 flex items-center justify-center mx-auto mb-3">
                <svg className="w-6 h-6 text-violet-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
              </div>
              <p className="text-sm font-black text-slate-700">Elige el archivo Excel</p>
              <p className="text-xs text-slate-400 mt-1">Se lee la primera hoja. Nada se guarda hasta que revises el resultado.</p>
            </div>
          </label>

          <div className="rounded-xl bg-slate-50 border border-slate-100 px-4 py-3">
            <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest mb-2">Qué hace la importación</p>
            <ul className="text-xs text-slate-500 space-y-1 list-disc list-inside">
              <li>Crea la ficha del trabajador y su contrato vigente.</li>
              <li>Identifica a cada persona por RUT: si ya existe, actualiza en vez de duplicar.</li>
              <li>Normaliza AFP, región, comuna, jornada y montos al vocabulario del sistema.</li>
              <li>Carga banco, tipo y número de cuenta, que el Archivo de Pago necesita.</li>
            </ul>
          </div>
        </div>
      )}

      {/* ── Paso 2: revisar ── */}
      {paso === 'revisar' && analisis && (
        <div className="space-y-5">
          <p className="text-xs text-slate-400 -mb-1">{nombreArchivo}</p>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Filas leídas', v: R.total, c: 'text-slate-700' },
              { label: 'Nuevos', v: R.nuevos, c: 'text-emerald-600' },
              { label: 'Ya existen', v: R.actualizables, c: 'text-blue-600' },
              { label: 'Con error', v: R.conError, c: R.conError ? 'text-red-500' : 'text-slate-300' },
            ].map(({ label, v, c }) => (
              <div key={label} className="rounded-xl border border-slate-100 bg-white px-4 py-3 shadow-sm">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{label}</p>
                <p className={`text-2xl font-black mt-0.5 ${c}`}>{v}</p>
              </div>
            ))}
          </div>

          {/* Razones sociales que no existen como sub-empresa */}
          {R.empresasFaltantes.length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50/60 px-4 py-3 space-y-3">
              <p className="text-[11px] font-black text-amber-700 uppercase tracking-widest">
                Razones sociales que no están registradas
              </p>
              {R.empresasFaltantes.map(nombre => (
                <div key={nombre} className="flex flex-col sm:flex-row sm:items-center gap-2">
                  <span className="text-sm font-bold text-slate-700 flex-1 truncate">{nombre}</span>
                  <select
                    className={inp + ' sm:w-64'}
                    value={resolucionEmpresas[nombre] || '__crear__'}
                    onChange={e => setResolucionEmpresas(s => ({ ...s, [nombre]: e.target.value }))}>
                    <option value="__crear__">Crear como sub-empresa</option>
                    {EMPRESAS.map(e => <option key={e} value={e}>Asignar a {e}</option>)}
                    <option value="__dejar__">Dejar el nombre tal cual</option>
                  </select>
                </div>
              ))}
              <p className="text-[11px] text-amber-600">
                Si dejas el nombre tal cual, esas personas no aparecerán al filtrar por empresa.
              </p>
            </div>
          )}

          {R.afpsDesconocidas.length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50/60 px-4 py-3">
              <p className="text-[11px] font-black text-amber-700 uppercase tracking-widest mb-1">
                AFP fuera del catálogo
              </p>
              <p className="text-xs text-amber-700">
                {R.afpsDesconocidas.join(', ')} — se guarda en la ficha, pero el cálculo de
                cotizaciones usará la tasa por defecto hasta que la agregues a
                <span className="font-mono"> AFPS</span>, <span className="font-mono">TASAS_AFP</span> y
                <span className="font-mono"> COD_AFP</span>.
              </p>
            </div>
          )}

          {/* Opciones */}
          <div className="rounded-xl border border-slate-100 bg-slate-50/60 px-4 py-3 space-y-2.5">
            <label className="flex items-start gap-2.5 cursor-pointer">
              <input type="checkbox" className="mt-0.5 rounded" checked={crearContratos}
                onChange={e => setCrearContratos(e.target.checked)} />
              <span className="text-xs text-slate-600">
                <b className="text-slate-700">Crear también el contrato vigente.</b>{' '}
                Se omite en quienes ya tengan uno vigente, para no duplicar.
              </span>
            </label>
            <label className="flex items-start gap-2.5 cursor-pointer">
              <input type="checkbox" className="mt-0.5 rounded" checked={actualizarExistentes}
                onChange={e => setActualizarExistentes(e.target.checked)} />
              <span className="text-xs text-slate-600">
                <b className="text-slate-700">Actualizar las fichas que ya existen.</b>{' '}
                Solo se escriben los campos que la planilla trae con valor.
              </span>
            </label>
          </div>

          {/* Filtro + tabla */}
          <div>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {[
                ['todos', `Todas (${R.total})`],
                ['nuevos', `Nuevas (${R.nuevos})`],
                ['existentes', `Existentes (${R.actualizables})`],
                ['avisos', `Con aviso (${R.conAviso})`],
                ['errores', `Con error (${R.conError})`],
              ].map(([k, label]) => (
                <button key={k} onClick={() => setVerSolo(k)}
                  className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all ${
                    verSolo === k ? 'bg-violet-600 text-white shadow-sm' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                  }`}>
                  {label}
                </button>
              ))}
            </div>

            <div className="overflow-auto rounded-xl border border-slate-100" style={{ maxHeight: 320 }}>
              <table className="w-full text-xs">
                <thead className="sticky top-0">
                  <tr style={{ background: '#1e1b4b' }}>
                    {['', 'Trabajador', 'RUT', 'Cargo', 'Sueldo base', 'Observaciones'].map(h => (
                      <th key={h} className="px-3 py-2 text-[10px] font-black text-slate-300 uppercase tracking-widest text-left whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 bg-white">
                  {filasVisibles.map(r => (
                    <tr key={r.fila} className={r.errores.length ? 'bg-red-50/40' : ''}>
                      <td className="px-3 py-2">
                        <span className={`text-[9px] font-black px-1.5 py-0.5 rounded uppercase whitespace-nowrap ${
                          r.accion === 'omitir' ? 'bg-red-100 text-red-600'
                          : r.accion === 'actualizar' ? 'bg-blue-100 text-blue-600'
                          : 'bg-emerald-100 text-emerald-700'}`}>
                          {r.accion === 'omitir' ? 'Omitir' : r.accion === 'actualizar' ? 'Actualizar' : 'Nuevo'}
                        </span>
                      </td>
                      <td className="px-3 py-2 font-bold text-slate-700 whitespace-nowrap">
                        {r.ficha.apellidoPaterno} {r.ficha.nombre}
                      </td>
                      <td className="px-3 py-2 font-mono text-slate-500 whitespace-nowrap">{r.ficha.rut || '—'}</td>
                      <td className="px-3 py-2 text-slate-500 max-w-[180px] truncate">{r.ficha.cargo || '—'}</td>
                      <td className="px-3 py-2 font-mono text-slate-600 whitespace-nowrap">
                        {r.contrato.sueldoBase ? `$${Number(r.contrato.sueldoBase).toLocaleString('es-CL')}` : '—'}
                      </td>
                      <td className="px-3 py-2">
                        {r.errores.map((e, i) => (
                          <span key={i} className="block text-red-600 font-semibold">{e}</span>
                        ))}
                        {r.avisos.map((a, i) => (
                          <span key={i} className="block text-amber-600">{a}</span>
                        ))}
                        {!r.errores.length && !r.avisos.length && <span className="text-slate-300">Sin observaciones</span>}
                      </td>
                    </tr>
                  ))}
                  {filasVisibles.length === 0 && (
                    <tr><td colSpan={6} className="px-3 py-6 text-center text-slate-300">Nada en esta vista</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex justify-between items-center gap-3 pt-1">
            <button onClick={reset}
              className="px-4 py-2.5 text-slate-500 hover:text-slate-700 font-bold text-sm transition-colors">
              Elegir otro archivo
            </button>
            <button onClick={importar} disabled={aImportar === 0}
              className="px-5 py-2.5 bg-violet-600 hover:bg-violet-700 disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold text-sm rounded-xl transition-colors shadow-sm">
              Importar {aImportar} {aImportar === 1 ? 'trabajador' : 'trabajadores'}
            </button>
          </div>
        </div>
      )}

      {/* ── Paso 3: importando ── */}
      {paso === 'importando' && (
        <div className="py-12 text-center">
          <div className="w-10 h-10 border-3 border-violet-200 border-t-violet-600 rounded-full animate-spin mx-auto mb-4"
            style={{ borderWidth: 3 }} />
          <p className="text-sm font-bold text-slate-700">Guardando la nómina</p>
          <p className="text-xs text-slate-400 mt-1">{progreso.hechos} de {progreso.total}</p>
        </div>
      )}

      {/* ── Paso 4: listo ── */}
      {paso === 'listo' && resultado && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 px-5 py-5 text-center">
            <div className="w-11 h-11 rounded-2xl bg-emerald-100 flex items-center justify-center mx-auto mb-3">
              <svg className="w-6 h-6 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-sm font-black text-slate-800">Nómina importada</p>
            <p className="text-xs text-slate-500 mt-1">
              {resultado.creados} fichas nuevas · {resultado.actualizados} actualizadas · {resultado.contratos} contratos
              {resultado.empresasCreadas.length > 0 && ` · ${resultado.empresasCreadas.length} sub-empresa(s)`}
            </p>
          </div>

          {analisis?.resumen.conError > 0 && (
            <p className="text-xs text-amber-600 text-center">
              Quedaron {analisis.resumen.conError} filas fuera por errores. Corrígelas en la planilla
              y vuelve a importar: las que ya entraron se actualizan, no se duplican.
            </p>
          )}

          <div className="flex justify-end">
            <button onClick={cerrar}
              className="px-5 py-2.5 bg-violet-600 hover:bg-violet-700 text-white font-bold text-sm rounded-xl transition-colors">
              Cerrar
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
